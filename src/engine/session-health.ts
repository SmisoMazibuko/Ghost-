/**
 * Ghost Evaluator v15.3 - Session Health Manager
 * ===============================================
 * Loss-based stopping and bait & switch detection
 *
 * Core Logic:
 * 1. Stop betting based on ACTUAL losses (magnitude + accumulation)
 * 2. Bait & switch detection for recovery decisions
 * 3. Drawdown as backup safety stop
 */

import {
  SessionHealth,
  SessionHealthConfig,
  PatternDivergence,
  LossSeverity,
  DrawdownState,
  EvaluatedResult,
  CompletedTrade,
  PatternName,
  PATTERN_NAMES,
  DEFAULT_SESSION_HEALTH_CONFIG,
} from '../types';

// ============================================================================
// SESSION HEALTH MANAGER
// ============================================================================

export class SessionHealthManager {
  private config: SessionHealthConfig;

  // Core tracking
  private recentTrades: CompletedTrade[] = [];
  private consecutiveLosses = 0;
  private weightedLossTotal = 0;  // Accumulated weighted losses

  // Drawdown tracking
  private drawdownState: DrawdownState;

  // Loss severity tracking
  private lossSeverity: LossSeverity;

  // Bait & switch tracking (for recovery decisions)
  private patternDivergences: Map<PatternName, PatternDivergence>;
  private recentResults: EvaluatedResult[] = [];

  // Session health score
  private health: SessionHealth;

  constructor(config?: Partial<SessionHealthConfig>) {
    this.config = this.mergeConfig(DEFAULT_SESSION_HEALTH_CONFIG, config);
    this.health = this.createInitialHealth();
    this.drawdownState = this.createInitialDrawdown();
    this.lossSeverity = this.createInitialLossSeverity();
    this.patternDivergences = new Map();
    this.initializePatternDivergences();
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  private mergeConfig(
    base: SessionHealthConfig,
    override?: Partial<SessionHealthConfig>
  ): SessionHealthConfig {
    if (!override) return base;

    return {
      sessionHealth: { ...base.sessionHealth, ...override.sessionHealth },
      drawdown: { ...base.drawdown, ...override.drawdown },
      baitSwitch: { ...base.baitSwitch, ...override.baitSwitch },
      verdicts: { ...base.verdicts, ...override.verdicts },
      recovery: { ...base.recovery, ...override.recovery },
      reentry: { ...base.reentry, ...override.reentry },
      lossSeverity: { ...base.lossSeverity, ...override.lossSeverity },
    };
  }

  private createInitialHealth(): SessionHealth {
    return {
      score: 100,
      level: 'playable',
      winRateFactor: 1,
      drawdownFactor: 1,
      patternReliabilityFactor: 1,
      verdictQualityFactor: 1,
      lastCalculatedBlock: -1,
    };
  }

  private createInitialDrawdown(): DrawdownState {
    return {
      currentPnL: 0,
      peakPnL: 0,
      maxDrawdown: 0,
      currentDrawdown: 0,
      level: 0,
      isStopped: false,
      isAborted: false,
    };
  }

  private createInitialLossSeverity(): LossSeverity {
    return {
      totalWeightedLoss: 0,
      averageLossMagnitude: 0,
      lossCount: 0,
      severityLevel: 'minor',
    };
  }

  private initializePatternDivergences(): void {
    for (const pattern of PATTERN_NAMES) {
      this.patternDivergences.set(pattern, {
        pattern,
        observationWinRate: 0,
        activeWinRate: 0,
        divergenceScore: 0,
        isBaiting: false,
        isConfirmedBaitSwitch: false,
        observationCount: 0,
        activeCount: 0,
      });
    }
  }

  // ============================================================================
  // CORE UPDATE - AFTER TRADE
  // ============================================================================

  /**
   * Update session health after a trade is completed
   * This is the main entry point for loss tracking
   */
  updateAfterTrade(trade: CompletedTrade): void {
    // Add to recent trades (keep last 20)
    this.recentTrades.push(trade);
    if (this.recentTrades.length > 20) {
      this.recentTrades.shift();
    }

    // Update drawdown (always track P/L)
    this.updateDrawdown(trade.pnl);

    // Track losses with magnitude weighting
    if (!trade.isWin) {
      this.consecutiveLosses++;
      this.updateLossSeverity(trade.pct);
    } else {
      // Win resets consecutive losses
      this.consecutiveLosses = 0;
    }

    // Recalculate health score
    this.recalculateHealth(trade.evalIndex);
  }

  /**
   * Update after evaluating a result (for bait & switch tracking)
   * Called for ALL results, not just bet ones
   */
  updateAfterResult(result: EvaluatedResult): void {
    // Add to recent results (keep last 50)
    this.recentResults.push(result);
    if (this.recentResults.length > 50) {
      this.recentResults.shift();
    }

    // Update pattern divergence for bait & switch detection
    this.updatePatternDivergence(result);
  }

  // ============================================================================
  // LOSS SEVERITY TRACKING
  // ============================================================================

  /**
   * Update loss severity based on loss magnitude
   * Higher % losses are weighted more heavily
   */
  private updateLossSeverity(pct: number): void {
    this.lossSeverity.lossCount++;

    // Weight the loss by magnitude
    // 30% loss = 30 weight, 85% loss = 85 weight
    const weightedLoss = pct;
    this.lossSeverity.totalWeightedLoss += weightedLoss;
    this.weightedLossTotal += weightedLoss;

    // Calculate average loss magnitude
    this.lossSeverity.averageLossMagnitude =
      this.lossSeverity.totalWeightedLoss / this.lossSeverity.lossCount;

    // Determine severity level based on average magnitude
    const avg = this.lossSeverity.averageLossMagnitude;
    const cfg = this.config.lossSeverity;

    if (avg >= cfg.moderateThreshold) {
      this.lossSeverity.severityLevel = 'severe';
    } else if (avg >= cfg.minorThreshold) {
      this.lossSeverity.severityLevel = 'moderate';
    } else {
      this.lossSeverity.severityLevel = 'minor';
    }
  }

  // ============================================================================
  // DRAWDOWN MANAGEMENT
  // ============================================================================

  private updateDrawdown(pnl: number): void {
    this.drawdownState.currentPnL += pnl;

    // Update peak
    if (this.drawdownState.currentPnL > this.drawdownState.peakPnL) {
      this.drawdownState.peakPnL = this.drawdownState.currentPnL;
    }

    // Calculate current drawdown (always negative or zero)
    this.drawdownState.currentDrawdown =
      this.drawdownState.currentPnL - this.drawdownState.peakPnL;

    // Update max drawdown
    if (this.drawdownState.currentDrawdown < this.drawdownState.maxDrawdown) {
      this.drawdownState.maxDrawdown = this.drawdownState.currentDrawdown;
    }

    // Determine drawdown level based on actual P/L
    const pnlValue = this.drawdownState.currentPnL;
    const cfg = this.config.drawdown;

    if (pnlValue <= cfg.abortLevel) {
      this.drawdownState.level = 4;
      this.drawdownState.isStopped = true;
      this.drawdownState.isAborted = true;
    } else if (pnlValue <= cfg.stopLevel) {
      this.drawdownState.level = 3;
      this.drawdownState.isStopped = true;
    } else if (pnlValue <= cfg.cautionLevel) {
      this.drawdownState.level = 2;
    } else if (pnlValue <= cfg.warningLevel) {
      this.drawdownState.level = 1;
    } else {
      this.drawdownState.level = 0;
    }
  }

  // ============================================================================
  // BAIT & SWITCH DETECTION (For Recovery Decisions)
  // ============================================================================

  private updatePatternDivergence(result: EvaluatedResult): void {
    const divergence = this.patternDivergences.get(result.pattern);
    if (!divergence) return;

    const isWin = result.profit >= 0;

    if (result.wasBet) {
      // Active phase result
      divergence.activeCount++;
      if (isWin) {
        divergence.activeWinRate =
          (divergence.activeWinRate * (divergence.activeCount - 1) + 1) / divergence.activeCount;
      } else {
        divergence.activeWinRate =
          (divergence.activeWinRate * (divergence.activeCount - 1)) / divergence.activeCount;
      }
    } else {
      // Observation phase result
      divergence.observationCount++;
      if (isWin) {
        divergence.observationWinRate =
          (divergence.observationWinRate * (divergence.observationCount - 1) + 1) / divergence.observationCount;
      } else {
        divergence.observationWinRate =
          (divergence.observationWinRate * (divergence.observationCount - 1)) / divergence.observationCount;
      }
    }

    // Calculate divergence (observation - active)
    // Positive divergence = observation doing better = potential bait & switch
    if (divergence.activeCount >= 3 && divergence.observationCount >= 3) {
      divergence.divergenceScore =
        divergence.observationWinRate - divergence.activeWinRate;

      const cfg = this.config.baitSwitch;
      divergence.isBaiting = divergence.divergenceScore > cfg.divergenceWarning;
      divergence.isConfirmedBaitSwitch = divergence.divergenceScore > cfg.divergenceConfirmed;
    }
  }

  /**
   * Get number of patterns showing bait behavior
   */
  getBaitingPatternCount(): number {
    let count = 0;
    for (const [, div] of this.patternDivergences) {
      if (div.isBaiting) count++;
    }
    return count;
  }

  /**
   * Check if session is adversarial (for recovery decisions, NOT stopping)
   */
  isSessionAdversarial(): boolean {
    return this.getBaitingPatternCount() >= this.config.baitSwitch.patternCountTrigger;
  }

  // ============================================================================
  // SESSION HEALTH SCORE
  // ============================================================================

  private recalculateHealth(blockIndex: number): void {
    // Win rate factor (based on recent trades)
    this.health.winRateFactor = this.calculateWinRateFactor();

    // Drawdown factor
    this.health.drawdownFactor = this.calculateDrawdownFactor();

    // Pattern reliability (based on bait & switch detection)
    this.health.patternReliabilityFactor = this.calculatePatternReliabilityFactor();

    // Verdict quality factor (not used for stopping, just display)
    this.health.verdictQualityFactor = 1; // Neutral

    // Calculate overall score
    this.health.score =
      (this.health.winRateFactor * 40) +
      (this.health.drawdownFactor * 40) +
      (this.health.patternReliabilityFactor * 20);

    // Determine level
    const cfg = this.config.sessionHealth;
    if (this.drawdownState.isAborted) {
      this.health.level = 'abort';
    } else if (this.health.score >= cfg.playableThreshold) {
      this.health.level = 'playable';
    } else if (this.health.score >= cfg.cautionThreshold) {
      this.health.level = 'caution';
    } else {
      this.health.level = 'unplayable';
    }

    this.health.lastCalculatedBlock = blockIndex;
  }

  private calculateWinRateFactor(): number {
    if (this.recentTrades.length === 0) return 1;

    const wins = this.recentTrades.filter(t => t.isWin).length;
    const winRate = wins / this.recentTrades.length;
    return Math.min(1, winRate);
  }

  private calculateDrawdownFactor(): number {
    // If P/L is positive, factor is 1
    if (this.drawdownState.currentPnL >= 0) return 1;

    const maxAcceptable = Math.abs(this.config.drawdown.stopLevel);
    const currentLoss = Math.abs(this.drawdownState.currentPnL);

    if (currentLoss >= maxAcceptable) return 0;
    return 1 - (currentLoss / maxAcceptable);
  }

  private calculatePatternReliabilityFactor(): number {
    // If patterns are baiting, reduce reliability
    const baitingCount = this.getBaitingPatternCount();
    if (baitingCount === 0) return 1;

    // Each baiting pattern reduces reliability
    return Math.max(0, 1 - (baitingCount * 0.2));
  }

  // ============================================================================
  // STOPPING DECISIONS
  // ============================================================================

  /**
   * Check if session should stop betting
   * Based on ACTUAL losses, not predictions
   */
  shouldStopSession(): boolean {
    // 1. Drawdown-based stop (hard limit)
    if (this.drawdownState.isStopped) {
      return true;
    }

    // 2. Consecutive losses stop (2+ consecutive losses triggers pause)
    if (this.consecutiveLosses >= 2) {
      return true;
    }

    // 3. Weighted loss accumulation stop
    // If we've accumulated too much weighted loss, stop
    if (this.weightedLossTotal >= this.config.lossSeverity.sessionWeightedLossStop) {
      return true;
    }

    // 4. Single severe loss (85%+) triggers immediate pause
    if (this.lossSeverity.lossCount > 0 &&
        this.lossSeverity.averageLossMagnitude >= this.config.lossSeverity.singleSevereThreshold) {
      // Only if we've had recent severe losses
      const recentLosses = this.recentTrades.filter(t => !t.isWin);
      if (recentLosses.length > 0) {
        const lastLoss = recentLosses[recentLosses.length - 1];
        if (lastLoss.pct >= this.config.lossSeverity.singleSevereThreshold) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if session is completely aborted (no recovery possible)
   */
  isAborted(): boolean {
    return this.drawdownState.isAborted;
  }

  /**
   * Get the reason for session stop
   */
  getStopReason(): string {
    if (this.drawdownState.isAborted) {
      return `ABORT: P/L reached ${this.config.drawdown.abortLevel} (max loss)`;
    }
    if (this.drawdownState.isStopped) {
      return `STOP: P/L reached ${this.config.drawdown.stopLevel} (drawdown limit)`;
    }
    if (this.consecutiveLosses >= 2) {
      return `PAUSE: ${this.consecutiveLosses} consecutive losses - cooling down`;
    }
    if (this.weightedLossTotal >= this.config.lossSeverity.sessionWeightedLossStop) {
      return `STOP: Accumulated weighted loss ${this.weightedLossTotal.toFixed(0)}% exceeds limit`;
    }
    const recentLosses = this.recentTrades.filter(t => !t.isWin);
    if (recentLosses.length > 0) {
      const lastLoss = recentLosses[recentLosses.length - 1];
      if (lastLoss.pct >= this.config.lossSeverity.singleSevereThreshold) {
        return `PAUSE: Severe loss (${lastLoss.pct.toFixed(0)}%) - waiting for stability`;
      }
    }
    return '';
  }

  // ============================================================================
  // PUBLIC GETTERS
  // ============================================================================

  getHealth(): SessionHealth {
    return { ...this.health };
  }

  getDrawdownState(): DrawdownState {
    return { ...this.drawdownState };
  }

  getLossSeverity(): LossSeverity {
    return { ...this.lossSeverity };
  }

  getConsecutiveLosses(): number {
    return this.consecutiveLosses;
  }

  getWeightedLossTotal(): number {
    return this.weightedLossTotal;
  }

  getVerdictAnalysis() {
    // Return a simplified version - not used for stopping anymore
    return {
      totalVerdicts: this.recentResults.length,
      fairCount: 0,
      unfairCount: 0,
      fakeCount: 0,
      neutralCount: 0,
      totalLosses: this.lossSeverity.lossCount,
      fakeRatio: 0,
      marketState: 'normal' as const,
    };
  }

  getActivationVelocity() {
    // Not used in new logic, return neutral
    return {
      activationsLastHour: 0,
      breaksLastHour: 0,
      velocity: 0,
      stability: 'stable' as const,
      activationTimestamps: [],
      breakTimestamps: [],
    };
  }

  getPatternDivergence(pattern: PatternName): PatternDivergence | null {
    const div = this.patternDivergences.get(pattern);
    return div ? { ...div } : null;
  }

  getAllPatternDivergences(): PatternDivergence[] {
    return Array.from(this.patternDivergences.values()).map(d => ({ ...d }));
  }

  getConfig(): SessionHealthConfig {
    return JSON.parse(JSON.stringify(this.config));
  }

  // ============================================================================
  // RESET & EXPORT
  // ============================================================================

  reset(): void {
    this.health = this.createInitialHealth();
    this.drawdownState = this.createInitialDrawdown();
    this.lossSeverity = this.createInitialLossSeverity();
    this.recentTrades = [];
    this.recentResults = [];
    this.consecutiveLosses = 0;
    this.weightedLossTotal = 0;
    this.initializePatternDivergences();
  }

  /**
   * Rebuild results state from evaluated results (used during undo)
   */
  rebuildResultsState(results: EvaluatedResult[]): void {
    this.recentResults = [];
    this.initializePatternDivergences();

    for (const result of results) {
      this.updateAfterResult(result);
    }
  }

  exportState(): {
    health: SessionHealth;
    drawdownState: DrawdownState;
    lossSeverity: LossSeverity;
    consecutiveLosses: number;
    weightedLossTotal: number;
    patternDivergences: PatternDivergence[];
  } {
    return {
      health: this.getHealth(),
      drawdownState: this.getDrawdownState(),
      lossSeverity: this.getLossSeverity(),
      consecutiveLosses: this.consecutiveLosses,
      weightedLossTotal: this.weightedLossTotal,
      patternDivergences: this.getAllPatternDivergences(),
    };
  }

  importState(state: ReturnType<SessionHealthManager['exportState']>): void {
    this.health = { ...state.health };
    this.drawdownState = { ...state.drawdownState };
    this.lossSeverity = { ...state.lossSeverity };
    this.consecutiveLosses = state.consecutiveLosses ?? 0;
    this.weightedLossTotal = state.weightedLossTotal ?? 0;

    this.patternDivergences.clear();
    for (const div of state.patternDivergences) {
      this.patternDivergences.set(div.pattern, { ...div });
    }
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createSessionHealthManager(
  config?: Partial<SessionHealthConfig>
): SessionHealthManager {
  return new SessionHealthManager(config);
}
