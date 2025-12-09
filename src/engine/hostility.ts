/**
 * Ghost Evaluator v15.1 - Hostility Manager
 * ==========================================
 * Accumulative hostility detection with decay and reset logic.
 *
 * Core Philosophy:
 * - Single events are INDICATORS, not conclusions
 * - Hostility accumulates over multiple signals
 * - Wins and time decay reduce hostility
 * - Lock only when conclusive evidence exists
 * - Recovery based on pattern health, not arbitrary block counts
 */

import {
  HostilityIndicator,
  HostilityState,
  HostilityConfig,
  PatternRecoveryState,
  PatternName,
  PatternDivergence,
  CompletedTrade,
  PATTERN_NAMES,
  DEFAULT_HOSTILITY_CONFIG,
} from '../types';

// ============================================================================
// HOSTILITY MANAGER
// ============================================================================

export class HostilityManager {
  private config: HostilityConfig;
  private state: HostilityState;
  private patternRecovery: Map<PatternName, PatternRecoveryState>;
  private recentTrades: CompletedTrade[] = [];
  private sessionPnL: number = 0;

  constructor(config?: Partial<HostilityConfig>) {
    this.config = { ...DEFAULT_HOSTILITY_CONFIG, ...config };
    this.state = this.createInitialState();
    this.patternRecovery = new Map();
    this.initializePatternRecovery();
  }

  private createInitialState(): HostilityState {
    return {
      indicators: [],
      hostilityScore: 0,
      isLocked: false,
      lockReason: '',
      lockedAtBlock: -1,
      consecutiveWins: 0,
      lastBlockIndex: -1,
    };
  }

  private initializePatternRecovery(): void {
    for (const pattern of PATTERN_NAMES) {
      this.patternRecovery.set(pattern, {
        pattern,
        isRecovered: true, // Start as recovered
        shadowWins: 0,
        shadowTotal: 0,
        shadowWinRate: 0,
        cumulativeProfit: 0, // Track cumulative profit during shadow trading
        hasBaitSwitch: false,
        isFormingSignals: false,
        lastSignalBlock: -1,
      });
    }
  }

  // ============================================================================
  // INDICATOR LOGGING
  // ============================================================================

  /**
   * Log a severe loss indicator (85%+ loss)
   */
  logSevereLoss(blockIndex: number, pct: number, pattern: PatternName): void {
    if (pct < this.config.severeLossThreshold) return;

    const indicator: HostilityIndicator = {
      type: 'severe_loss',
      pattern,
      blockIndex,
      severity: this.config.severityWeights.severe_loss,
      details: `Severe loss ${pct.toFixed(0)}% on ${pattern}`,
      ts: new Date().toISOString(),
    };

    this.addIndicator(indicator);
    console.log(`[Hostility] Logged severe loss: ${indicator.details}`);
  }

  /**
   * Log a negative pattern run indicator
   */
  logPatternRunNegative(
    blockIndex: number,
    pattern: PatternName,
    netProfit: number
  ): void {
    if (netProfit >= 0) return;

    const indicator: HostilityIndicator = {
      type: 'pattern_run_negative',
      pattern,
      blockIndex,
      severity: this.config.severityWeights.pattern_run_negative,
      details: `${pattern} run ended with net P/L: ${netProfit.toFixed(0)}%`,
      ts: new Date().toISOString(),
    };

    this.addIndicator(indicator);
    console.log(`[Hostility] Logged negative run: ${indicator.details}`);
  }

  /**
   * Log a bait & switch indicator for a pattern
   */
  logBaitSwitch(blockIndex: number, divergence: PatternDivergence): void {
    if (!divergence.isBaiting) return;

    const severity = divergence.isConfirmedBaitSwitch
      ? this.config.severityWeights.bait_switch + 1
      : this.config.severityWeights.bait_switch;

    const indicator: HostilityIndicator = {
      type: 'bait_switch',
      pattern: divergence.pattern,
      blockIndex,
      severity,
      details: `${divergence.pattern} bait & switch: obs=${(divergence.observationWinRate * 100).toFixed(0)}% vs active=${(divergence.activeWinRate * 100).toFixed(0)}%`,
      ts: new Date().toISOString(),
    };

    this.addIndicator(indicator);
    console.log(`[Hostility] Logged bait & switch: ${indicator.details}`);

    // Update pattern recovery state
    const recovery = this.patternRecovery.get(divergence.pattern);
    if (recovery) {
      recovery.hasBaitSwitch = true;
      recovery.isRecovered = false;
    }
  }

  /**
   * Log consecutive losses indicator
   */
  logConsecutiveLosses(blockIndex: number, avgLoss: number): void {
    const indicator: HostilityIndicator = {
      type: 'consecutive_losses',
      blockIndex,
      severity: this.config.severityWeights.consecutive_losses,
      details: `${this.config.consecutiveLossCount} consecutive losses, avg: ${avgLoss.toFixed(0)}%`,
      ts: new Date().toISOString(),
    };

    this.addIndicator(indicator);
    console.log(`[Hostility] Logged consecutive losses: ${indicator.details}`);
  }

  /**
   * Log multi-pattern bait indicator (conclusive hostility)
   */
  logMultiPatternBait(blockIndex: number, baitingPatterns: PatternName[]): void {
    const indicator: HostilityIndicator = {
      type: 'multi_pattern_bait',
      blockIndex,
      severity: this.config.severityWeights.multi_pattern_bait,
      details: `Multiple patterns baiting: ${baitingPatterns.join(', ')}`,
      ts: new Date().toISOString(),
    };

    this.addIndicator(indicator);
    console.log(`[Hostility] Logged multi-pattern bait: ${indicator.details}`);
  }

  private addIndicator(indicator: HostilityIndicator): void {
    this.state.indicators.push(indicator);
    this.recalculateHostilityScore(indicator.blockIndex);
  }

  // ============================================================================
  // SCORE CALCULATION & LOCK LOGIC
  // ============================================================================

  /**
   * Recalculate hostility score using sliding window
   */
  private recalculateHostilityScore(currentBlock: number): void {
    // Filter indicators within TTL window
    const activeIndicators = this.state.indicators.filter(
      (ind) => currentBlock - ind.blockIndex <= this.config.indicatorTTL
    );

    // Sum severities
    let score = activeIndicators.reduce((sum, ind) => sum + ind.severity, 0);

    // Apply decay for blocks passed
    const blocksSinceLastUpdate = currentBlock - this.state.lastBlockIndex;
    if (blocksSinceLastUpdate > 0 && this.state.lastBlockIndex >= 0) {
      score = Math.max(0, score - blocksSinceLastUpdate * this.config.decayPerBlock);
    }

    this.state.hostilityScore = score;
    this.state.lastBlockIndex = currentBlock;

    // Check for lock
    if (!this.state.isLocked && score >= this.config.lockThreshold) {
      this.lockSession(currentBlock);
    }
  }

  /**
   * Lock the session
   */
  private lockSession(blockIndex: number): void {
    this.state.isLocked = true;
    this.state.lockedAtBlock = blockIndex;
    this.state.lockReason = `Hostility score ${this.state.hostilityScore.toFixed(1)} >= ${this.config.lockThreshold}`;

    // Reset pattern recovery states for shadow tracking
    for (const [, recovery] of this.patternRecovery) {
      recovery.isRecovered = false;
      recovery.shadowWins = 0;
      recovery.shadowTotal = 0;
      recovery.shadowWinRate = 0;
      recovery.cumulativeProfit = 0; // Reset cumulative profit for recovery tracking
    }

    console.log(`[Hostility] SESSION LOCKED at block ${blockIndex}: ${this.state.lockReason}`);
  }

  // ============================================================================
  // DECAY & RESET LOGIC
  // ============================================================================

  /**
   * Process a completed trade for decay/reset
   */
  processTradeResult(trade: CompletedTrade): void {
    this.recentTrades.push(trade);
    if (this.recentTrades.length > 20) {
      this.recentTrades.shift();
    }

    this.sessionPnL += trade.pnl;

    if (trade.isWin) {
      this.state.consecutiveWins++;
      this.applyWinDecay(trade.evalIndex);

      // Update pattern recovery
      if (this.state.isLocked) {
        this.updatePatternRecovery(trade.pattern, true, trade.pct, trade.evalIndex);
      }
    } else {
      // Check for severe loss
      if (trade.pct >= this.config.severeLossThreshold) {
        this.logSevereLoss(trade.evalIndex, trade.pct, trade.pattern);
      }

      // Check for consecutive losses
      this.state.consecutiveWins = 0;
      this.checkConsecutiveLosses(trade.evalIndex);

      // Update pattern recovery (loss)
      if (this.state.isLocked) {
        this.updatePatternRecovery(trade.pattern, false, trade.pct, trade.evalIndex);
      }
    }

    // Check for profit reset
    if (this.sessionPnL >= this.config.profitResetThreshold) {
      this.fullReset();
    }
  }

  /**
   * Apply decay from wins
   */
  private applyWinDecay(_blockIndex: number): void {
    let reduction = this.config.winReduction;

    if (this.state.consecutiveWins >= 3) {
      reduction += this.config.consecutiveWinBonus;
    }

    this.state.hostilityScore = Math.max(0, this.state.hostilityScore - reduction);

    console.log(
      `[Hostility] Win decay: -${reduction.toFixed(1)}, score now: ${this.state.hostilityScore.toFixed(1)}`
    );

    // Check if we can unlock
    if (this.state.isLocked && this.state.hostilityScore < this.config.lockThreshold * 0.5) {
      this.checkPatternRecovery();
    }
  }

  /**
   * Check for consecutive losses and log if threshold met
   */
  private checkConsecutiveLosses(blockIndex: number): void {
    const recentLosses = this.recentTrades
      .slice(-this.config.consecutiveLossCount)
      .filter((t) => !t.isWin);

    if (recentLosses.length >= this.config.consecutiveLossCount) {
      const avgLoss =
        recentLosses.reduce((sum, t) => sum + t.pct, 0) / recentLosses.length;
      this.logConsecutiveLosses(blockIndex, avgLoss);
    }
  }

  /**
   * Full reset (session profitable)
   */
  fullReset(): void {
    console.log(`[Hostility] Full reset - session P/L: ${this.sessionPnL.toFixed(0)}`);

    this.state.indicators = [];
    this.state.hostilityScore = 0;
    this.state.isLocked = false;
    this.state.lockReason = '';
    this.state.lockedAtBlock = -1;
    this.state.consecutiveWins = 0;

    // Reset pattern recovery
    for (const [, recovery] of this.patternRecovery) {
      recovery.isRecovered = true;
      recovery.hasBaitSwitch = false;
      recovery.shadowWins = 0;
      recovery.shadowTotal = 0;
      recovery.shadowWinRate = 0;
      recovery.cumulativeProfit = 0;
    }
  }

  /**
   * Clear indicators for a specific pattern (pattern run profitable)
   */
  clearPatternIndicators(pattern: PatternName): void {
    const before = this.state.indicators.length;
    this.state.indicators = this.state.indicators.filter(
      (ind) => ind.pattern !== pattern
    );
    const removed = before - this.state.indicators.length;

    if (removed > 0) {
      console.log(`[Hostility] Cleared ${removed} indicators for ${pattern}`);
      this.recalculateHostilityScore(this.state.lastBlockIndex);
    }

    // Update pattern recovery
    const recovery = this.patternRecovery.get(pattern);
    if (recovery) {
      recovery.hasBaitSwitch = false;
    }
  }

  // ============================================================================
  // PATTERN-BASED RECOVERY
  // ============================================================================

  /**
   * Update pattern recovery state with shadow trade result
   * Recovery is based on cumulative profit >= 100% (same as activation)
   */
  updatePatternRecovery(
    pattern: PatternName,
    isWin: boolean,
    pct: number,
    blockIndex: number
  ): void {
    const recovery = this.patternRecovery.get(pattern);
    if (!recovery) return;

    recovery.shadowTotal++;
    if (isWin) {
      recovery.shadowWins++;
      recovery.cumulativeProfit += pct; // Add win percentage
    } else {
      recovery.cumulativeProfit -= pct; // Subtract loss percentage
    }
    recovery.shadowWinRate =
      recovery.shadowTotal > 0 ? recovery.shadowWins / recovery.shadowTotal : 0;

    recovery.lastSignalBlock = blockIndex;
    recovery.isFormingSignals = true;

    // Check if pattern has recovered: cumulative profit >= 100% AND not baiting
    // This mirrors the activation logic - we don't wait for pattern to break
    if (recovery.cumulativeProfit >= 100 && !recovery.hasBaitSwitch) {
      recovery.isRecovered = true;
      console.log(
        `[Hostility] Pattern ${pattern} recovered: cumulative profit ${recovery.cumulativeProfit.toFixed(0)}% >= 100%`
      );

      // Immediately check if we can unlock (don't wait for other patterns)
      this.checkPatternRecovery();
    }
  }

  /**
   * Update bait & switch status for pattern recovery
   */
  updatePatternBaitSwitch(divergence: PatternDivergence): void {
    const recovery = this.patternRecovery.get(divergence.pattern);
    if (!recovery) return;

    recovery.hasBaitSwitch = divergence.isBaiting;
    if (divergence.isBaiting) {
      recovery.isRecovered = false;
    }
  }

  /**
   * Check if any patterns have recovered (for unlock)
   * We only need ONE clean recovered pattern - we don't care if other patterns are still baiting
   */
  private checkPatternRecovery(): void {
    const cleanRecoveredPatterns: PatternName[] = [];

    for (const [pattern, recovery] of this.patternRecovery) {
      // A pattern is "clean recovered" if:
      // 1. Cumulative profit >= 100%
      // 2. This specific pattern is NOT baiting
      if (recovery.isRecovered && !recovery.hasBaitSwitch && recovery.cumulativeProfit >= 100) {
        cleanRecoveredPatterns.push(pattern);
      }
    }

    // Unlock as soon as we have ANY single clean recovered pattern
    // We don't wait for all patterns or care about ones that are still problematic
    if (cleanRecoveredPatterns.length > 0) {
      this.unlock(cleanRecoveredPatterns);
    }
  }

  /**
   * Unlock the session
   */
  private unlock(recoveredPatterns: PatternName[]): void {
    console.log(
      `[Hostility] SESSION UNLOCKED - recovered patterns: ${recoveredPatterns.join(', ')}`
    );

    this.state.isLocked = false;
    this.state.lockReason = '';

    // Don't clear indicators - let them decay naturally
  }

  // ============================================================================
  // PUBLIC GETTERS
  // ============================================================================

  isLocked(): boolean {
    return this.state.isLocked;
  }

  getHostilityScore(): number {
    return this.state.hostilityScore;
  }

  getState(): HostilityState {
    return { ...this.state };
  }

  getActiveIndicators(currentBlock: number): HostilityIndicator[] {
    return this.state.indicators.filter(
      (ind) => currentBlock - ind.blockIndex <= this.config.indicatorTTL
    );
  }

  getPatternRecoveryState(pattern: PatternName): PatternRecoveryState | null {
    const recovery = this.patternRecovery.get(pattern);
    return recovery ? { ...recovery } : null;
  }

  getAllPatternRecoveryStates(): PatternRecoveryState[] {
    return Array.from(this.patternRecovery.values()).map((r) => ({ ...r }));
  }

  getRecoveredPatterns(): PatternName[] {
    const recovered: PatternName[] = [];
    for (const [pattern, recovery] of this.patternRecovery) {
      if (recovery.isRecovered) {
        recovered.push(pattern);
      }
    }
    return recovered;
  }

  getLockReason(): string {
    return this.state.lockReason;
  }

  getConfig(): HostilityConfig {
    return { ...this.config };
  }

  /**
   * Get status message for display
   */
  getStatusMessage(): string {
    if (this.state.isLocked) {
      const recovered = this.getRecoveredPatterns();
      return `LOCKED (score: ${this.state.hostilityScore.toFixed(1)}) | Recovered: ${recovered.length > 0 ? recovered.join(', ') : 'none'}`;
    }
    if (this.state.hostilityScore > 0) {
      return `Hostility: ${this.state.hostilityScore.toFixed(1)}/${this.config.lockThreshold}`;
    }
    return 'NORMAL';
  }

  /**
   * Check if betting should be suppressed
   */
  shouldSuppressBetting(): boolean {
    return this.state.isLocked;
  }

  // ============================================================================
  // RESET & EXPORT
  // ============================================================================

  reset(): void {
    this.state = this.createInitialState();
    this.recentTrades = [];
    this.sessionPnL = 0;
    this.initializePatternRecovery();
  }

  exportState(): {
    state: HostilityState;
    patternRecovery: PatternRecoveryState[];
    sessionPnL: number;
  } {
    return {
      state: this.getState(),
      patternRecovery: this.getAllPatternRecoveryStates(),
      sessionPnL: this.sessionPnL,
    };
  }

  importState(data: ReturnType<HostilityManager['exportState']>): void {
    this.state = { ...data.state };
    this.sessionPnL = data.sessionPnL;

    this.patternRecovery.clear();
    for (const recovery of data.patternRecovery) {
      this.patternRecovery.set(recovery.pattern, { ...recovery });
    }
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createHostilityManager(
  config?: Partial<HostilityConfig>
): HostilityManager {
  return new HostilityManager(config);
}
