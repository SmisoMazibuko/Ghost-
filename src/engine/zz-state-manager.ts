/**
 * Ghost Evaluator v15.1 - ZZ Strategy State Manager
 * ==================================================
 * Implements the CORRECTED ZZ/Anti-ZZ strategy rules.
 *
 * CORE RULES (Non-Negotiable):
 * 1. ZZ NEVER goes to bait-and-switch - it ignores B&S entirely
 * 2. Anti-ZZ is activated ONLY when first predicted ZZ bet is negative
 * 3. Pocket placement (1 or 2) is for confirmation only, NOT for triggering Anti-ZZ
 * 4. ZZ continues with main strategy patterns during B&S periods
 *
 * State Machine:
 * - inactive → zz_active: On ZZ trigger detection
 * - zz_active → anti_zz_active: When first prediction is negative for ZZ
 * - anti_zz_active → zz_active: After Anti-ZZ run completes
 * - zz_active/anti_zz_active → suspended: During bait-and-switch (ZZ ignores, main strategy takes over)
 * - suspended → zz_active: When game becomes playable again
 */

import {
  Direction,
  ZZState,
  ZZPocket,
  ZZStrategyState,
  ZZRunRecord,
  EvaluatedResult,
} from '../types';

// ============================================================================
// DEFAULT STATE
// ============================================================================

/**
 * Create initial ZZ strategy state
 */
export function createInitialZZState(): ZZStrategyState {
  return {
    currentState: 'inactive',
    currentPocket: 1, // Default to Pocket 1 at start
    previousRunProfit: 0,
    firstPredictionNegative: false,
    firstPredictionEvaluated: false,
    currentRunProfit: 0,
    currentRunPredictions: 0,
    savedIndicatorDirection: null,
    activationBlockIndex: -1,
    antiZZActivationBlockIndex: -1,
    isInBaitSwitch: false,
    runHistory: [],
  };
}

// ============================================================================
// ZZ STATE MANAGER CLASS
// ============================================================================

export class ZZStateManager {
  private state: ZZStrategyState;

  constructor() {
    this.state = createInitialZZState();
  }

  // --------------------------------------------------------------------------
  // STATE ACCESSORS
  // --------------------------------------------------------------------------

  getState(): ZZStrategyState {
    return { ...this.state };
  }

  getCurrentState(): ZZState {
    return this.state.currentState;
  }

  getCurrentPocket(): ZZPocket {
    return this.state.currentPocket;
  }

  isZZActive(): boolean {
    return this.state.currentState === 'zz_active';
  }

  isAntiZZActive(): boolean {
    return this.state.currentState === 'anti_zz_active';
  }

  isSuspended(): boolean {
    return this.state.currentState === 'suspended';
  }

  isInactive(): boolean {
    return this.state.currentState === 'inactive';
  }

  /**
   * Check if ZZ system is active (either ZZ or Anti-ZZ)
   */
  isSystemActive(): boolean {
    return this.state.currentState === 'zz_active' || this.state.currentState === 'anti_zz_active';
  }

  getRunHistory(): ZZRunRecord[] {
    return [...this.state.runHistory];
  }

  // --------------------------------------------------------------------------
  // ACTIVATION LOGIC
  // --------------------------------------------------------------------------

  /**
   * Activate ZZ based on pattern signal detection.
   *
   * Called when:
   * - Game start / session entry
   * - After a completed ZZ run (full cycle with resolved profit/loss)
   *
   * Activation uses:
   * - Profit of the previous run → assigns pocket
   * - First predicted bet location → will evaluate for Anti-ZZ trigger
   */
  activateZZ(
    blockIndex: number,
    previousRunProfit: number,
    indicatorDirection: Direction
  ): void {
    // Don't activate if in bait-and-switch mode
    if (this.state.isInBaitSwitch) {
      console.log('[ZZ State] Cannot activate ZZ during bait-and-switch - suspended');
      return;
    }

    // Assign pocket based on previous run profit
    const pocket = this.assignPocket(previousRunProfit);

    // Reset run state
    this.state.currentState = 'zz_active';
    this.state.currentPocket = pocket;
    this.state.previousRunProfit = previousRunProfit;
    this.state.firstPredictionNegative = false;
    this.state.firstPredictionEvaluated = false;
    this.state.currentRunProfit = 0;
    this.state.currentRunPredictions = 0;
    this.state.savedIndicatorDirection = indicatorDirection;
    this.state.activationBlockIndex = blockIndex;
    this.state.antiZZActivationBlockIndex = -1;

    console.log(`[ZZ State] ZZ activated at block ${blockIndex}, Pocket ${pocket}, Previous profit: ${previousRunProfit.toFixed(0)}%`);
  }

  /**
   * Check if ZZ should bet (not just observe).
   *
   * RULE: If last run profit was negative (Pocket 2), we DON'T bet.
   * We just observe and calculate profit for the next run.
   * Betting only happens when in Pocket 1 (last run was profitable).
   */
  shouldBet(): boolean {
    if (!this.isSystemActive()) {
      return false;
    }
    // Only bet when in Pocket 1 (last run was profitable)
    // Pocket 2 = observe only, don't bet
    return this.state.currentPocket === 1;
  }

  /**
   * Assign pocket based on previous run profit.
   *
   * CORRECT LOGIC:
   * - profit > 0 → Pocket 1 (can bet)
   * - profit < 0 → Pocket 2 (observe only, don't bet)
   * - profit = 0 → Keep current pocket (or default to 1)
   *
   * NOTE: Pocket 2 means we observe and track but DON'T bet.
   */
  private assignPocket(previousRunProfit: number): ZZPocket {
    if (previousRunProfit > 0) {
      return 1;
    } else if (previousRunProfit < 0) {
      return 2;
    }
    // Breakeven - keep current pocket
    return this.state.currentPocket;
  }

  // --------------------------------------------------------------------------
  // FIRST PREDICTION EVALUATION (Anti-ZZ Trigger)
  // --------------------------------------------------------------------------

  /**
   * Evaluate the first prediction of a ZZ run.
   *
   * THIS IS THE CORRECT ANTI-ZZ TRIGGER:
   * - If first prediction is NEGATIVE (unfavorable for ZZ) → Activate Anti-ZZ
   * - If first prediction is POSITIVE (favorable for ZZ) → Continue normal ZZ
   *
   * "Negative for ZZ" means: The predicted alternation did NOT happen,
   * i.e., the result was opposite of what ZZ predicted.
   *
   * @param result - The evaluated result of the first prediction
   * @returns true if Anti-ZZ was activated
   */
  evaluateFirstPrediction(result: EvaluatedResult): boolean {
    // Only evaluate if ZZ is active and this is the first prediction
    if (this.state.currentState !== 'zz_active') {
      return false;
    }

    if (this.state.firstPredictionEvaluated) {
      return false; // Already evaluated first prediction
    }

    // Mark as evaluated
    this.state.firstPredictionEvaluated = true;
    this.state.currentRunPredictions++;

    // Check if prediction was negative for ZZ
    // Negative = result was opposite of what ZZ predicted (loss)
    const isNegativeForZZ = result.profit < 0;

    this.state.firstPredictionNegative = isNegativeForZZ;
    this.state.currentRunProfit += result.profit;

    if (isNegativeForZZ) {
      // ACTIVATE ANTI-ZZ
      this.activateAntiZZ(result.evalIndex);
      console.log(`[ZZ State] First prediction NEGATIVE (${result.profit.toFixed(0)}%) → Anti-ZZ activated`);
      return true;
    } else {
      console.log(`[ZZ State] First prediction POSITIVE (${result.profit.toFixed(0)}%) → Continue normal ZZ`);
      return false;
    }
  }

  /**
   * Activate Anti-ZZ mode.
   *
   * Called ONLY when:
   * - First predicted ZZ bet is negative (unfavorable)
   *
   * NEVER called from:
   * - Previous run profit
   * - Bait-and-switch
   * - Trend or block behavior
   */
  private activateAntiZZ(blockIndex: number): void {
    this.state.currentState = 'anti_zz_active';
    this.state.antiZZActivationBlockIndex = blockIndex;

    console.log(`[ZZ State] Anti-ZZ activated at block ${blockIndex}`);
  }

  // --------------------------------------------------------------------------
  // SUBSEQUENT PREDICTIONS
  // --------------------------------------------------------------------------

  /**
   * Record subsequent prediction results (after the first).
   *
   * @param result - The evaluated result
   */
  recordPredictionResult(result: EvaluatedResult): void {
    if (!this.isSystemActive()) {
      return; // ZZ system not active
    }

    // If this is the first prediction for ZZ, evaluate it for Anti-ZZ trigger
    if (this.state.currentState === 'zz_active' && !this.state.firstPredictionEvaluated) {
      this.evaluateFirstPrediction(result);
      return;
    }

    // Record subsequent prediction
    this.state.currentRunPredictions++;
    this.state.currentRunProfit += result.profit;
  }

  // --------------------------------------------------------------------------
  // RUN RESOLUTION
  // --------------------------------------------------------------------------

  /**
   * Resolve the current ZZ/Anti-ZZ run.
   *
   * Called when:
   * - ZZ/Anti-ZZ pattern breaks
   * - Session ends
   *
   * Resolution:
   * 1. Calculate actual profit for the run
   * 2. Assign ZZ to Pocket 1 or 2 based on profit
   * 3. Store values for next activation
   * 4. Reset temporary states
   * 5. Do NOT use bait-and-switch information
   */
  resolveZZRun(blockIndex: number): ZZRunRecord | null {
    if (!this.isSystemActive()) {
      return null; // Nothing to resolve
    }

    // Create run record
    const record: ZZRunRecord = {
      runNumber: this.state.runHistory.length + 1,
      wasAntiZZ: this.state.currentState === 'anti_zz_active',
      pocket: this.state.currentPocket,
      firstPredictionNegative: this.state.firstPredictionNegative,
      profit: this.state.currentRunProfit,
      predictionCount: this.state.currentRunPredictions,
      startBlockIndex: this.state.activationBlockIndex,
      endBlockIndex: blockIndex,
      ts: new Date().toISOString(),
    };

    // Add to history
    this.state.runHistory.push(record);

    // Store profit for next activation's pocket assignment
    this.state.previousRunProfit = this.state.currentRunProfit;

    // Log the resolution
    const runType = record.wasAntiZZ ? 'Anti-ZZ' : 'ZZ';
    console.log(`[ZZ State] ${runType} run resolved: Profit=${record.profit.toFixed(0)}%, Predictions=${record.predictionCount}, Next Pocket=${this.assignPocket(record.profit)}`);

    // Reset for next run
    this.resetRunState();

    return record;
  }

  /**
   * Reset run state for next ZZ cycle.
   * Does NOT reset pocket or previous run profit (needed for next activation).
   */
  private resetRunState(): void {
    this.state.currentState = 'inactive';
    this.state.firstPredictionNegative = false;
    this.state.firstPredictionEvaluated = false;
    this.state.currentRunProfit = 0;
    this.state.currentRunPredictions = 0;
    this.state.antiZZActivationBlockIndex = -1;
    // Keep: currentPocket, previousRunProfit, savedIndicatorDirection, runHistory
  }

  // --------------------------------------------------------------------------
  // BAIT-AND-SWITCH HANDLING
  // --------------------------------------------------------------------------

  /**
   * Set bait-and-switch mode.
   *
   * RULE: ZZ NEVER goes to bait-and-switch.
   * When B&S is active:
   * - ZZ continues with main strategy
   * - ZZ continues pattern identification
   * - ZZ does not freeze, disable, or switch states
   * - Only main strategy rules apply during B&S
   */
  setBaitSwitchMode(isInBaitSwitch: boolean): void {
    const wasInBaitSwitch = this.state.isInBaitSwitch;
    this.state.isInBaitSwitch = isInBaitSwitch;

    if (isInBaitSwitch && !wasInBaitSwitch) {
      // Entering B&S - ZZ is now suspended but keeps its state
      if (this.isSystemActive()) {
        console.log('[ZZ State] Entering bait-and-switch - ZZ suspended (main strategy takes over)');
        // Note: We do NOT change currentState here - ZZ ignores B&S
        // The reaction engine will use main strategy instead
      }
    } else if (!isInBaitSwitch && wasInBaitSwitch) {
      // Exiting B&S - ZZ resumes normally
      if (this.isSystemActive()) {
        console.log('[ZZ State] Exiting bait-and-switch - ZZ resumes normally');
      }
    }
  }

  /**
   * Check if ZZ should ignore the current signal due to bait-and-switch.
   *
   * During B&S:
   * - ZZ ignores bait-and-switch entirely
   * - Continue with main strategy
   * - No state changes for ZZ
   */
  shouldIgnoreBaitSwitch(): boolean {
    // ZZ always ignores B&S - this method is for clarity
    return this.state.isInBaitSwitch;
  }

  // --------------------------------------------------------------------------
  // PREDICTION DIRECTION
  // --------------------------------------------------------------------------

  /**
   * Get the predicted direction based on current ZZ/Anti-ZZ state.
   *
   * ZZ: Predicts OPPOSITE of current direction (alternation continues)
   * Anti-ZZ: Predicts SAME as current direction (alternation breaks)
   *
   * @param currentDirection - The current run direction
   * @returns The predicted direction, or null if ZZ is not active
   */
  getPredictedDirection(currentDirection: Direction): Direction | null {
    if (!this.isSystemActive()) {
      return null;
    }

    if (this.state.currentState === 'zz_active') {
      // ZZ predicts opposite (alternation continues)
      return (-currentDirection) as Direction;
    } else if (this.state.currentState === 'anti_zz_active') {
      // Anti-ZZ predicts same (alternation breaks)
      return currentDirection;
    }

    return null;
  }

  // --------------------------------------------------------------------------
  // PERSISTENCE
  // --------------------------------------------------------------------------

  /**
   * Export state for persistence
   */
  exportState(): ZZStrategyState {
    return { ...this.state };
  }

  /**
   * Import state from persistence
   */
  importState(state: ZZStrategyState): void {
    this.state = { ...state };
  }

  /**
   * Reset all state
   */
  reset(): void {
    this.state = createInitialZZState();
  }

  // --------------------------------------------------------------------------
  // STATISTICS
  // --------------------------------------------------------------------------

  /**
   * Get ZZ strategy statistics
   */
  getStatistics(): {
    totalRuns: number;
    zzRuns: number;
    antiZZRuns: number;
    totalProfit: number;
    zzProfit: number;
    antiZZProfit: number;
    pocket1Runs: number;
    pocket2Runs: number;
    pocket1Profit: number;
    pocket2Profit: number;
    firstPredictionNegativeCount: number;
  } {
    const history = this.state.runHistory;

    const zzRuns = history.filter(r => !r.wasAntiZZ);
    const antiZZRuns = history.filter(r => r.wasAntiZZ);
    const pocket1Runs = history.filter(r => r.pocket === 1);
    const pocket2Runs = history.filter(r => r.pocket === 2);

    return {
      totalRuns: history.length,
      zzRuns: zzRuns.length,
      antiZZRuns: antiZZRuns.length,
      totalProfit: history.reduce((sum, r) => sum + r.profit, 0),
      zzProfit: zzRuns.reduce((sum, r) => sum + r.profit, 0),
      antiZZProfit: antiZZRuns.reduce((sum, r) => sum + r.profit, 0),
      pocket1Runs: pocket1Runs.length,
      pocket2Runs: pocket2Runs.length,
      pocket1Profit: pocket1Runs.reduce((sum, r) => sum + r.profit, 0),
      pocket2Profit: pocket2Runs.reduce((sum, r) => sum + r.profit, 0),
      firstPredictionNegativeCount: history.filter(r => r.firstPredictionNegative).length,
    };
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createZZStateManager(): ZZStateManager {
  return new ZZStateManager();
}
