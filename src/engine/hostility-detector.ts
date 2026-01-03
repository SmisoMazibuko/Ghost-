/**
 * Enhanced Hostility Detector v16.1
 * ==================================
 *
 * Detects hostile market conditions through multiple indicators:
 * 1. CASCADE: 3+ consecutive losses (same pattern)
 * 2. CROSS_PATTERN: 2+ different patterns lose in 3 blocks
 * 3. OPPOSITE_SYNC: Pattern + Opposite both lose in sequence
 * 4. HIGH_PCT: Single loss at 80%+
 * 5. HIGH_PCT_CLUSTER: 3+ losses >70% in 5 blocks
 * 6. WR_COLLAPSE: Rolling 10-trade WR <30%
 *
 * Key Design Decisions (User Confirmed):
 * - ZZ/AntiZZ are EXEMPT from hostility pause (best performers)
 * - Dynamic pause: 5 blocks (score 8-10), 10 blocks (score 11+)
 * - Caution mode at score 5-7 (skip trades <60% confidence)
 * - Conservative resume: Score <4 AND recovery signal required
 */

import {
  PatternName,
  CompletedTrade,
  EnhancedHostilityIndicator,
  HostilityLevel,
  HostilityTradeResult,
  OppositeFailure,
  EnhancedHostilityState,
  EnhancedHostilityConfig,
  DEFAULT_ENHANCED_HOSTILITY_CONFIG,
  OPPOSITE_PATTERNS,
} from '../types';

export class HostilityDetector {
  private config: EnhancedHostilityConfig;
  private state: EnhancedHostilityState;

  constructor(config?: Partial<EnhancedHostilityConfig>) {
    this.config = { ...DEFAULT_ENHANCED_HOSTILITY_CONFIG, ...config };
    this.state = this.createInitialState();
  }

  private createInitialState(): EnhancedHostilityState {
    return {
      score: 0,
      level: 'normal',
      indicators: [],
      recentTrades: [],
      patternConsecutiveLosses: {},
      recentLossesByBlock: {},
      oppositeFailures: [],
      pauseBlocksRemaining: 0,
      recoverySignalSeen: false,
      lastBlockIndex: -1,
    };
  }

  /**
   * Main entry point - call after each trade completes
   */
  updateAfterTrade(trade: CompletedTrade): void {
    const tradeResult: HostilityTradeResult = {
      blockIndex: trade.evalIndex,
      pattern: trade.pattern,
      isWin: trade.isWin,
      pct: trade.pct,
      pnl: trade.pnl,
      ts: trade.ts,
    };

    // Add to recent trades (keep last 10)
    this.state.recentTrades.push(tradeResult);
    if (this.state.recentTrades.length > this.config.triggers.wrCollapseWindow) {
      this.state.recentTrades.shift();
    }

    if (trade.isWin) {
      // Win - decay score and reset pattern consecutive losses
      this.decayScore(this.config.decay.perWin);
      this.state.patternConsecutiveLosses[trade.pattern] = 0;

      // Check for recovery signals
      this.checkRecoverySignals(trade);
    } else {
      // Loss - check all indicators
      this.processLoss(tradeResult);
    }

    // Update level based on current score
    this.updateLevel();
    this.state.lastBlockIndex = trade.evalIndex;

    // Clean up old data
    this.cleanupOldData(trade.evalIndex);
  }

  /**
   * Process a losing trade and check all indicators
   */
  private processLoss(trade: HostilityTradeResult): void {
    const blockIndex = trade.blockIndex;

    // Track consecutive losses per pattern
    const prevLosses = this.state.patternConsecutiveLosses[trade.pattern] || 0;
    this.state.patternConsecutiveLosses[trade.pattern] = prevLosses + 1;

    // Track losses by block for cross-pattern detection
    if (!this.state.recentLossesByBlock[blockIndex]) {
      this.state.recentLossesByBlock[blockIndex] = [];
    }
    this.state.recentLossesByBlock[blockIndex].push(trade.pattern);

    // Check each indicator
    this.checkCascade(trade);
    this.checkCrossPattern(trade);
    this.checkOppositeSync(trade);
    this.checkHighPct(trade);
    this.checkHighPctCluster(trade);
    this.checkWrCollapse(trade);
  }

  /**
   * CASCADE: 3+ consecutive losses from same pattern
   */
  private checkCascade(trade: HostilityTradeResult): void {
    const consecutiveLosses = this.state.patternConsecutiveLosses[trade.pattern] || 0;

    if (consecutiveLosses >= this.config.triggers.cascadeLosses) {
      this.addIndicator({
        type: 'CASCADE',
        weight: this.config.weights.CASCADE,
        triggeredAt: trade.blockIndex,
        details: `${trade.pattern} has ${consecutiveLosses} consecutive losses`,
        patterns: [trade.pattern],
        ts: trade.ts,
      });
    }
  }

  /**
   * CROSS_PATTERN: 2+ different patterns lose within 3 blocks
   */
  private checkCrossPattern(trade: HostilityTradeResult): void {
    const window = this.config.triggers.crossPatternWindow;
    const minPatterns = this.config.triggers.crossPatternMinPatterns;

    // Collect unique patterns that lost in the last N blocks
    const uniquePatterns = new Set<PatternName>();
    for (let i = trade.blockIndex; i > trade.blockIndex - window && i >= 0; i--) {
      const losses = this.state.recentLossesByBlock[i];
      if (losses) {
        losses.forEach(p => uniquePatterns.add(p));
      }
    }

    if (uniquePatterns.size >= minPatterns) {
      // Check if we already have a recent CROSS_PATTERN indicator
      const recentCrossPattern = this.state.indicators.find(
        ind => ind.type === 'CROSS_PATTERN' &&
               trade.blockIndex - ind.triggeredAt < window
      );

      if (!recentCrossPattern) {
        this.addIndicator({
          type: 'CROSS_PATTERN',
          weight: this.config.weights.CROSS_PATTERN,
          triggeredAt: trade.blockIndex,
          details: `${uniquePatterns.size} patterns lost in ${window} blocks: ${Array.from(uniquePatterns).join(', ')}`,
          patterns: Array.from(uniquePatterns),
          ts: trade.ts,
        });
      }
    }
  }

  /**
   * OPPOSITE_SYNC: Pattern + Opposite both lose in sequence
   * This is the adversarial market signature
   */
  private checkOppositeSync(trade: HostilityTradeResult): void {
    const opposite = OPPOSITE_PATTERNS[trade.pattern];
    if (!opposite) return;

    // Check if the opposite pattern lost recently (within last 5 blocks)
    const recentOppositeLoss = this.state.recentTrades.find(
      t => !t.isWin &&
           t.pattern === opposite &&
           trade.blockIndex - t.blockIndex <= 5 &&
           trade.blockIndex > t.blockIndex  // Opposite must have lost BEFORE
    );

    if (recentOppositeLoss) {
      // Check if we haven't already logged this pair
      const alreadyLogged = this.state.oppositeFailures.some(
        of => of.firstPattern === opposite &&
              of.oppositePattern === trade.pattern &&
              of.oppositeFailureBlock === trade.blockIndex
      );

      if (!alreadyLogged) {
        const failure: OppositeFailure = {
          firstPattern: opposite,
          oppositePattern: trade.pattern,
          firstFailureBlock: recentOppositeLoss.blockIndex,
          oppositeFailureBlock: trade.blockIndex,
          weight: this.config.weights.OPPOSITE_SYNC,
        };

        this.state.oppositeFailures.push(failure);

        this.addIndicator({
          type: 'OPPOSITE_SYNC',
          weight: this.config.weights.OPPOSITE_SYNC,
          triggeredAt: trade.blockIndex,
          details: `${opposite} lost at block ${recentOppositeLoss.blockIndex}, then ${trade.pattern} also lost - adversarial market`,
          patterns: [opposite, trade.pattern],
          ts: trade.ts,
        });
      }
    }
  }

  /**
   * HIGH_PCT: Single loss at 80%+
   */
  private checkHighPct(trade: HostilityTradeResult): void {
    if (trade.pct >= this.config.triggers.highPctThreshold) {
      this.addIndicator({
        type: 'HIGH_PCT',
        weight: this.config.weights.HIGH_PCT,
        triggeredAt: trade.blockIndex,
        details: `${trade.pattern} lost at ${trade.pct}% (>=${this.config.triggers.highPctThreshold}%)`,
        patterns: [trade.pattern],
        ts: trade.ts,
      });
    }
  }

  /**
   * HIGH_PCT_CLUSTER: 3+ losses >70% in 5 blocks
   */
  private checkHighPctCluster(trade: HostilityTradeResult): void {
    const window = this.config.triggers.highPctClusterWindow;
    const threshold = this.config.triggers.highPctClusterThreshold;
    const requiredCount = this.config.triggers.highPctClusterCount;

    // Count high-PCT losses in recent window
    const highPctLosses = this.state.recentTrades.filter(
      t => !t.isWin &&
           t.pct >= threshold &&
           trade.blockIndex - t.blockIndex < window
    );

    if (highPctLosses.length >= requiredCount) {
      // Check if we already have a recent cluster indicator
      const recentCluster = this.state.indicators.find(
        ind => ind.type === 'HIGH_PCT_CLUSTER' &&
               trade.blockIndex - ind.triggeredAt < window
      );

      if (!recentCluster) {
        this.addIndicator({
          type: 'HIGH_PCT_CLUSTER',
          weight: this.config.weights.HIGH_PCT_CLUSTER,
          triggeredAt: trade.blockIndex,
          details: `${highPctLosses.length} losses >=${threshold}% in ${window} blocks`,
          patterns: highPctLosses.map(l => l.pattern),
          ts: trade.ts,
        });
      }
    }
  }

  /**
   * WR_COLLAPSE: Rolling 10-trade WR <30%
   */
  private checkWrCollapse(trade: HostilityTradeResult): void {
    const windowSize = this.config.triggers.wrCollapseWindow;
    const threshold = this.config.triggers.wrCollapseThreshold;

    if (this.state.recentTrades.length < windowSize) return;

    const wins = this.state.recentTrades.filter(t => t.isWin).length;
    const winRate = (wins / this.state.recentTrades.length) * 100;

    if (winRate < threshold) {
      // Check if we already have a recent WR_COLLAPSE indicator
      const recentCollapse = this.state.indicators.find(
        ind => ind.type === 'WR_COLLAPSE' &&
               trade.blockIndex - ind.triggeredAt < 5
      );

      if (!recentCollapse) {
        this.addIndicator({
          type: 'WR_COLLAPSE',
          weight: this.config.weights.WR_COLLAPSE,
          triggeredAt: trade.blockIndex,
          details: `Win rate collapsed to ${winRate.toFixed(1)}% over last ${windowSize} trades`,
          ts: trade.ts,
        });
      }
    }
  }

  /**
   * Check for recovery signals
   */
  private checkRecoverySignals(trade: CompletedTrade): void {
    // Recovery signals:
    // 1. ZZ or Anti2A2 shows a win
    // 2. SameDir shows 2 consecutive wins
    // 3. Rolling 5-trade WR returns to >50%

    if (trade.pattern === 'ZZ' || trade.pattern === 'Anti2A2') {
      this.state.recoverySignalSeen = true;
      console.log(`[HostilityDetector] Recovery signal: ${trade.pattern} win`);
    }

    // Check SameDir consecutive wins
    // Note: SameDir is a pseudo-pattern cast as PatternName in reaction.ts
    if ((trade.pattern as string) === 'SameDir') {
      const recentSameDirTrades = this.state.recentTrades
        .filter(t => (t.pattern as string) === 'SameDir')
        .slice(-2);

      if (recentSameDirTrades.length >= 2 && recentSameDirTrades.every(t => t.isWin)) {
        this.state.recoverySignalSeen = true;
        console.log('[HostilityDetector] Recovery signal: SameDir 2 consecutive wins');
      }
    }

    // Check rolling 5-trade WR
    const last5 = this.state.recentTrades.slice(-5);
    if (last5.length >= 5) {
      const wins = last5.filter(t => t.isWin).length;
      if (wins / 5 > 0.5) {
        this.state.recoverySignalSeen = true;
        console.log(`[HostilityDetector] Recovery signal: 5-trade WR = ${(wins/5*100).toFixed(0)}%`);
      }
    }
  }

  /**
   * Add an indicator and update score
   */
  private addIndicator(indicator: EnhancedHostilityIndicator): void {
    this.state.indicators.push(indicator);
    this.state.score += indicator.weight;
    console.log(`[HostilityDetector] +${indicator.weight} ${indicator.type}: ${indicator.details} (score=${this.state.score.toFixed(1)})`);
  }

  /**
   * Decay score (on wins or idle blocks)
   */
  decayScore(amount: number): void {
    this.state.score = Math.max(0, this.state.score - amount);

    // Reset recovery signal if score is low enough
    if (this.state.score < this.config.thresholds.cautionLevel) {
      // Don't reset here - let canResume() handle it
    }
  }

  /**
   * Called each block to advance pause counter and decay idle score
   */
  advanceBlock(): void {
    // Decay score for idle block
    this.decayScore(this.config.decay.perIdleBlock);

    // Advance pause counter
    if (this.state.pauseBlocksRemaining > 0) {
      this.state.pauseBlocksRemaining--;
      if (this.state.pauseBlocksRemaining === 0) {
        console.log('[HostilityDetector] Pause duration complete, checking resume conditions');
      }
    }

    this.updateLevel();
  }

  /**
   * Update hostility level based on current score
   */
  private updateLevel(): void {
    const prevLevel = this.state.level;

    if (this.state.score >= this.config.thresholds.extendedPauseLevel) {
      this.state.level = 'extended_pause';
      if (this.state.pauseBlocksRemaining === 0 && prevLevel !== 'extended_pause') {
        this.state.pauseBlocksRemaining = this.config.pauseDurations.extendedPause;
        this.state.recoverySignalSeen = false;
        console.log(`[HostilityDetector] EXTENDED PAUSE triggered (score=${this.state.score.toFixed(1)}, ${this.state.pauseBlocksRemaining} blocks)`);
      }
    } else if (this.state.score >= this.config.thresholds.pauseLevel) {
      this.state.level = 'pause';
      if (this.state.pauseBlocksRemaining === 0 && prevLevel !== 'pause' && prevLevel !== 'extended_pause') {
        this.state.pauseBlocksRemaining = this.config.pauseDurations.pause;
        this.state.recoverySignalSeen = false;
        console.log(`[HostilityDetector] PAUSE triggered (score=${this.state.score.toFixed(1)}, ${this.state.pauseBlocksRemaining} blocks)`);
      }
    } else if (this.state.score >= this.config.thresholds.cautionLevel) {
      this.state.level = 'caution';
    } else {
      this.state.level = 'normal';
    }
  }

  /**
   * Check if a pattern can trade given current hostility state
   */
  canPatternTrade(pattern: PatternName, confidence: number): boolean {
    // Exempt patterns always trade (ZZ, AntiZZ)
    if (this.config.exemptPatterns.includes(pattern)) {
      return true;
    }

    // Check level
    switch (this.state.level) {
      case 'normal':
        return true;
      case 'caution':
        return confidence >= this.config.cautionMinConfidence;
      case 'pause':
      case 'extended_pause':
        return false;
    }
  }

  /**
   * Check if we should resume trading (after pause)
   */
  canResume(): boolean {
    // Must meet BOTH conditions:
    // 1. Score dropped below threshold
    // 2. Recovery signal seen
    const scoreBelowThreshold = this.state.score < this.config.resumeScoreThreshold;
    const hasRecoverySignal = this.state.recoverySignalSeen;

    if (scoreBelowThreshold && hasRecoverySignal) {
      console.log(`[HostilityDetector] Resume conditions met (score=${this.state.score.toFixed(1)}, recoverySignal=${hasRecoverySignal})`);
      // Reset state for next potential pause
      this.state.recoverySignalSeen = false;
      this.state.pauseBlocksRemaining = 0;
      this.state.level = 'normal';
      return true;
    }

    return false;
  }

  /**
   * Get current level
   */
  getLevel(): HostilityLevel {
    return this.state.level;
  }

  /**
   * Get current score
   */
  getScore(): number {
    return this.state.score;
  }

  /**
   * Get full state (for logging/UI)
   */
  getState(): EnhancedHostilityState {
    return { ...this.state };
  }

  /**
   * Get active indicators (recent)
   */
  getActiveIndicators(): EnhancedHostilityIndicator[] {
    return this.state.indicators.slice(-10);  // Last 10 indicators
  }

  /**
   * Check if currently paused
   */
  isPaused(): boolean {
    return this.state.level === 'pause' || this.state.level === 'extended_pause';
  }

  /**
   * Check if in caution mode
   */
  isInCaution(): boolean {
    return this.state.level === 'caution';
  }

  /**
   * Get summary string for logging
   */
  getSummary(): string {
    const parts: string[] = [];
    parts.push(`score=${this.state.score.toFixed(1)}`);
    parts.push(`level=${this.state.level}`);

    if (this.state.pauseBlocksRemaining > 0) {
      parts.push(`pauseBlocks=${this.state.pauseBlocksRemaining}`);
    }

    if (this.state.recoverySignalSeen) {
      parts.push('recoverySignal=YES');
    }

    const recentIndicators = this.state.indicators.slice(-3);
    if (recentIndicators.length > 0) {
      parts.push(`indicators=[${recentIndicators.map(i => i.type).join(',')}]`);
    }

    return `[Hostility: ${parts.join(', ')}]`;
  }

  /**
   * Clean up old data to prevent memory growth
   */
  private cleanupOldData(_currentBlock: number): void {
    // Remove old indicators (keep last 50)
    if (this.state.indicators.length > 50) {
      this.state.indicators = this.state.indicators.slice(-50);
    }

    // Remove old opposite failures (keep last 20)
    if (this.state.oppositeFailures.length > 20) {
      this.state.oppositeFailures = this.state.oppositeFailures.slice(-20);
    }

    // Remove old blocks from recentLossesByBlock (keep last 10 blocks)
    const blocksToKeep = 10;
    const blockKeys = Object.keys(this.state.recentLossesByBlock)
      .map(Number)
      .sort((a, b) => b - a);

    for (const blockKey of blockKeys.slice(blocksToKeep)) {
      delete this.state.recentLossesByBlock[blockKey];
    }
  }

  /**
   * Reset state (for new session)
   */
  reset(): void {
    this.state = this.createInitialState();
  }

  /**
   * Export state for persistence
   */
  exportState(): EnhancedHostilityState {
    return JSON.parse(JSON.stringify(this.state));
  }

  /**
   * Import state from persistence
   */
  importState(state: EnhancedHostilityState): void {
    this.state = JSON.parse(JSON.stringify(state));
  }
}

// Factory function
export function createHostilityDetector(
  config?: Partial<EnhancedHostilityConfig>
): HostilityDetector {
  return new HostilityDetector(config);
}
