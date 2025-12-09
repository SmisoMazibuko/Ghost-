/**
 * Ghost Evaluator v15.1 - Recovery Manager
 * =========================================
 * Manages recovery mode and gradual re-entry after unplayable sessions
 * Based on PLAN-unplayable-sessions.md
 */

import {
  RecoveryState,
  ReentryState,
  ShadowTrade,
  SessionHealthConfig,
  Direction,
  PatternName,
  Verdict,
  Prediction,
  DEFAULT_SESSION_HEALTH_CONFIG,
} from '../types';

// ============================================================================
// RECOVERY MANAGER
// ============================================================================

export class RecoveryManager {
  private config: SessionHealthConfig;
  private recoveryState: RecoveryState;
  private reentryState: ReentryState;

  constructor(config?: Partial<SessionHealthConfig>) {
    this.config = this.mergeConfig(DEFAULT_SESSION_HEALTH_CONFIG, config);
    this.recoveryState = this.createInitialRecoveryState();
    this.reentryState = this.createInitialReentryState();
  }

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

  private createInitialRecoveryState(): RecoveryState {
    return {
      isInRecoveryMode: false,
      enteredAtBlock: -1,
      blocksInRecovery: 0,
      shadowTrades: [],
      shadowWinRate: 0,
      fakeVerdictRatio: 0,
      recoveryAttempts: 0,
      recoveryMet: false,
    };
  }

  private createInitialReentryState(): ReentryState {
    return {
      isInReentry: false,
      stakeMultiplier: 1,
      trialTradesCompleted: 0,
      trialWins: 0,
      requiredWins: this.config.reentry.requiredWins,
      totalTrialTrades: this.config.reentry.trialTradeCount,
    };
  }

  // ============================================================================
  // RECOVERY MODE
  // ============================================================================

  /**
   * Enter recovery mode
   */
  enterRecoveryMode(blockIndex: number): void {
    if (this.recoveryState.isInRecoveryMode) return;

    this.recoveryState.isInRecoveryMode = true;
    this.recoveryState.enteredAtBlock = blockIndex;
    this.recoveryState.blocksInRecovery = 0;
    this.recoveryState.shadowTrades = [];
    this.recoveryState.shadowWinRate = 0;
    this.recoveryState.fakeVerdictRatio = 0;
    this.recoveryState.recoveryMet = false;
    this.recoveryState.recoveryAttempts++;

    console.log(`[Recovery] Entered recovery mode at block ${blockIndex} (attempt #${this.recoveryState.recoveryAttempts})`);
  }

  /**
   * Exit recovery mode (recovery criteria met)
   */
  exitRecoveryMode(): void {
    if (!this.recoveryState.isInRecoveryMode) return;

    console.log(`[Recovery] Exiting recovery mode after ${this.recoveryState.blocksInRecovery} blocks`);

    this.recoveryState.isInRecoveryMode = false;
    this.recoveryState.recoveryMet = true;

    // Enter re-entry mode
    this.enterReentryMode();
  }

  /**
   * Update recovery state with a new block
   */
  updateRecoveryBlock(): void {
    if (!this.recoveryState.isInRecoveryMode) return;
    this.recoveryState.blocksInRecovery++;
  }

  /**
   * Add a shadow trade during recovery
   */
  addShadowTrade(
    blockIndex: number,
    pattern: PatternName,
    predictedDirection: Direction,
    actualDirection: Direction,
    pct: number,
    verdict: Verdict
  ): void {
    if (!this.recoveryState.isInRecoveryMode) return;

    const shadowTrade: ShadowTrade = {
      blockIndex,
      pattern,
      predictedDirection,
      actualDirection,
      wouldBeWin: predictedDirection === actualDirection,
      pct,
      verdict,
      ts: new Date().toISOString(),
    };

    this.recoveryState.shadowTrades.push(shadowTrade);

    // Recalculate shadow metrics
    this.recalculateShadowMetrics();

    // Check if recovery criteria are met
    this.checkRecoveryCriteria();
  }

  /**
   * Recalculate shadow trade metrics
   */
  private recalculateShadowMetrics(): void {
    const trades = this.recoveryState.shadowTrades;
    if (trades.length === 0) {
      this.recoveryState.shadowWinRate = 0;
      this.recoveryState.fakeVerdictRatio = 0;
      return;
    }

    // Get last 10 trades for metrics
    const recentTrades = trades.slice(-10);

    // Shadow win rate
    const wins = recentTrades.filter(t => t.wouldBeWin).length;
    this.recoveryState.shadowWinRate = wins / recentTrades.length;

    // Fake verdict ratio (in last 10 blocks)
    const recentBlocks = trades.slice(-10);
    const fakeCount = recentBlocks.filter(t => t.verdict === 'fake').length;
    const lossCount = recentBlocks.filter(t => !t.wouldBeWin).length;
    this.recoveryState.fakeVerdictRatio = lossCount > 0 ? fakeCount / lossCount : 0;
  }

  /**
   * Check if recovery criteria are met
   */
  private checkRecoveryCriteria(): boolean {
    const cfg = this.config.recovery;
    const state = this.recoveryState;

    // Must have observed minimum blocks
    if (state.blocksInRecovery < cfg.minBlocksObserved) {
      return false;
    }

    // Must have enough shadow trades
    if (state.shadowTrades.length < cfg.minBlocksObserved) {
      return false;
    }

    // Shadow win rate must be above threshold
    if (state.shadowWinRate < cfg.minShadowWinRate) {
      return false;
    }

    // Fake ratio must be below threshold
    if (state.fakeVerdictRatio > cfg.maxFakeRatio) {
      return false;
    }

    // At least one pattern must be forming signals
    // (This is checked externally by the caller)

    state.recoveryMet = true;
    return true;
  }

  /**
   * Check if recovery has exceeded max blocks (should abort)
   */
  shouldAbortRecovery(): boolean {
    return (
      this.recoveryState.isInRecoveryMode &&
      this.recoveryState.blocksInRecovery >= this.config.recovery.maxBlocksBeforeAbort
    );
  }

  /**
   * Check if recovery criteria are met
   */
  isRecoveryMet(): boolean {
    return this.recoveryState.recoveryMet;
  }

  // ============================================================================
  // RE-ENTRY MODE
  // ============================================================================

  /**
   * Enter re-entry mode (after recovery)
   */
  private enterReentryMode(): void {
    this.reentryState.isInReentry = true;
    this.reentryState.stakeMultiplier = 0.5; // Half stake
    this.reentryState.trialTradesCompleted = 0;
    this.reentryState.trialWins = 0;
    this.reentryState.requiredWins = this.config.reentry.requiredWins;
    this.reentryState.totalTrialTrades = this.config.reentry.trialTradeCount;

    console.log(`[Recovery] Entered re-entry mode with ${this.reentryState.stakeMultiplier * 100}% stake`);
  }

  /**
   * Record a trial trade result during re-entry
   */
  recordTrialTrade(isWin: boolean): void {
    if (!this.reentryState.isInReentry) return;

    this.reentryState.trialTradesCompleted++;
    if (isWin) {
      this.reentryState.trialWins++;
    }

    console.log(`[Recovery] Trial trade ${this.reentryState.trialTradesCompleted}/${this.reentryState.totalTrialTrades}: ${isWin ? 'WIN' : 'LOSS'} (${this.reentryState.trialWins} wins)`);

    // Check if trial period is complete
    if (this.reentryState.trialTradesCompleted >= this.reentryState.totalTrialTrades) {
      this.evaluateReentry();
    }
  }

  /**
   * Evaluate re-entry trial results
   */
  private evaluateReentry(): void {
    if (this.reentryState.trialWins >= this.reentryState.requiredWins) {
      // Passed re-entry trial
      console.log(`[Recovery] Re-entry trial PASSED (${this.reentryState.trialWins}/${this.reentryState.totalTrialTrades} wins)`);
      this.exitReentryMode(true);
    } else {
      // Failed re-entry trial - go back to recovery
      console.log(`[Recovery] Re-entry trial FAILED (${this.reentryState.trialWins}/${this.reentryState.totalTrialTrades} wins) - returning to recovery mode`);
      this.exitReentryMode(false);
    }
  }

  /**
   * Exit re-entry mode
   */
  private exitReentryMode(success: boolean): void {
    this.reentryState.isInReentry = false;
    this.reentryState.stakeMultiplier = 1;

    if (!success) {
      // Reset for next recovery attempt
      this.recoveryState.isInRecoveryMode = false;
      this.recoveryState.recoveryMet = false;
    }
  }

  /**
   * Force exit re-entry (e.g., if session stops again)
   */
  forceExitReentry(): void {
    if (!this.reentryState.isInReentry) return;

    console.log('[Recovery] Force exiting re-entry mode');
    this.exitReentryMode(false);
  }

  // ============================================================================
  // PUBLIC GETTERS
  // ============================================================================

  isInRecoveryMode(): boolean {
    return this.recoveryState.isInRecoveryMode;
  }

  isInReentryMode(): boolean {
    return this.reentryState.isInReentry;
  }

  getRecoveryState(): RecoveryState {
    return { ...this.recoveryState };
  }

  getReentryState(): ReentryState {
    return { ...this.reentryState };
  }

  getStakeMultiplier(): number {
    return this.reentryState.stakeMultiplier;
  }

  getRecoveryAttempts(): number {
    return this.recoveryState.recoveryAttempts;
  }

  getShadowTrades(): ShadowTrade[] {
    return [...this.recoveryState.shadowTrades];
  }

  getBlocksInRecovery(): number {
    return this.recoveryState.blocksInRecovery;
  }

  /**
   * Get the current mode as a string
   */
  getCurrentMode(): 'normal' | 'recovery' | 'reentry' {
    if (this.reentryState.isInReentry) return 'reentry';
    if (this.recoveryState.isInRecoveryMode) return 'recovery';
    return 'normal';
  }

  /**
   * Get status message for display
   */
  getStatusMessage(): string {
    if (this.reentryState.isInReentry) {
      return `RE-ENTRY: Trial ${this.reentryState.trialTradesCompleted}/${this.reentryState.totalTrialTrades} (${this.reentryState.trialWins} wins, ${Math.round(this.reentryState.stakeMultiplier * 100)}% stake)`;
    }
    if (this.recoveryState.isInRecoveryMode) {
      return `RECOVERY: Block ${this.recoveryState.blocksInRecovery}/${this.config.recovery.maxBlocksBeforeAbort} | Shadow WR: ${(this.recoveryState.shadowWinRate * 100).toFixed(1)}% | Fake: ${(this.recoveryState.fakeVerdictRatio * 100).toFixed(1)}%`;
    }
    return 'NORMAL';
  }

  /**
   * Check if we should suppress betting (recovery or cooldown)
   */
  shouldSuppressBetting(): boolean {
    return this.recoveryState.isInRecoveryMode;
  }

  /**
   * Modify prediction based on recovery/reentry state
   * Returns null if betting should be suppressed
   */
  modifyPrediction(prediction: Prediction): Prediction | null {
    // In recovery mode, suppress all betting
    if (this.recoveryState.isInRecoveryMode) {
      return {
        hasPrediction: false,
        reason: `RECOVERY MODE — ${this.getStatusMessage()}`,
      };
    }

    // In re-entry mode, allow predictions but adjust confidence display
    if (this.reentryState.isInReentry) {
      if (prediction.hasPrediction) {
        return {
          ...prediction,
          reason: `[RE-ENTRY ${Math.round(this.reentryState.stakeMultiplier * 100)}%] ${prediction.reason}`,
        };
      }
    }

    return prediction;
  }

  // ============================================================================
  // RESET & EXPORT
  // ============================================================================

  reset(): void {
    this.recoveryState = this.createInitialRecoveryState();
    this.reentryState = this.createInitialReentryState();
  }

  exportState(): {
    recoveryState: RecoveryState;
    reentryState: ReentryState;
  } {
    return {
      recoveryState: this.getRecoveryState(),
      reentryState: this.getReentryState(),
    };
  }

  importState(state: ReturnType<RecoveryManager['exportState']>): void {
    this.recoveryState = { ...state.recoveryState };
    this.reentryState = { ...state.reentryState };
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createRecoveryManager(
  config?: Partial<SessionHealthConfig>
): RecoveryManager {
  return new RecoveryManager(config);
}
