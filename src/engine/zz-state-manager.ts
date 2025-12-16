/**
 * Ghost Evaluator v16.0 - ZZ Strategy State Manager
 * ==================================================
 *
 * !! AUTHORITATIVE SPECIFICATION: docs/POCKET-SYSTEM-SPEC.md !!
 *
 * This file implements the STRICT POCKET SYSTEM for ZZ/AntiZZ patterns.
 * All behavior must conform exactly to POCKET-SYSTEM-SPEC.md.
 *
 * CORE PRINCIPLES (NON-NEGOTIABLE):
 * - POCKET1 = ACTIVE (allowed to place real bets)
 * - POCKET2 = OBSERVE (NOT allowed to place real bets)
 * - Pocket position is the ONLY truth
 * - Imaginary first bet is MANDATORY (always computed, always counted)
 * - runProfitZZ applies ONLY to ZZ (Anti-ZZ uses last bet outcome only)
 *
 * CRITICAL RULES:
 * - ZZ: runProfitZZ > 0 → P1, runProfitZZ <= 0 → P2
 * - ZZ: runProfitZZ ALWAYS updated on every indicator (even imaginary)
 * - AntiZZ: Last bet positive → stay P1, Last bet negative → P2
 * - AntiZZ: Waits for NEXT indicator after becoming candidate
 * - AntiZZ: Places MAX 1 bet per indicator (NOT continuous)
 *
 * See POCKET-SYSTEM-SPEC.md for complete rules and examples.
 */

import {
  Direction,
  ZZPocket,
  ZZStrategyState,
  ZZRunRecord,
  ZZMovementRecord,
  EvaluatedResult,
} from '../types';

// ============================================================================
// DEFAULT STATE
// ============================================================================

/**
 * Create initial ZZ strategy state (v16.0 - STRICT SPEC)
 */
export function createInitialZZState(): ZZStrategyState {
  return {
    // ZZ Pattern State
    zzPocket: 1,                    // ZZ starts in POCKET1 (per spec Section B)
    zzCurrentRunProfit: 0,
    zzFirstBetEvaluated: false,

    // AntiZZ Pattern State (NO runProfit - per spec Section A.4)
    antiZZPocket: 2,                // AntiZZ starts in POCKET2 (per spec Section B)
    antiZZLastBetOutcome: null,     // Only last bet, not cumulative
    antiZZIsCandidate: false,       // Not waiting to activate

    // Active Pattern Tracking
    activePattern: null,            // No pattern active initially

    // Shared State
    savedIndicatorDirection: null,
    runProfitZZ: 0,                 // INVARIANT: Updated on EVERY indicator
    activationBlockIndex: -1,
    isInBaitSwitch: false,
    runHistory: [],
    movementHistory: [],

    // First Bet Evaluation State
    waitingForFirstBet: false,
    firstBetBlockIndex: -1,
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
  // LOGGING HELPERS (per spec Section H)
  // --------------------------------------------------------------------------

  /**
   * Log indicator state (required by spec Section H)
   */
  private logIndicatorState(phase: 'BEFORE' | 'AFTER', _blockIndex: number): void {
    console.log(`[ZZ] Pockets ${phase}: ZZ=P${this.state.zzPocket}, AntiZZ=P${this.state.antiZZPocket}`);
    console.log(`[ZZ] runProfitZZ: ${this.state.runProfitZZ.toFixed(0)}%`);
    console.log(`[ZZ] activePattern: ${this.state.activePattern || 'none'}`);
    console.log(`[ZZ] antiZZIsCandidate: ${this.state.antiZZIsCandidate}`);
  }

  // --------------------------------------------------------------------------
  // STATE ACCESSORS
  // --------------------------------------------------------------------------

  getState(): ZZStrategyState {
    return { ...this.state };
  }

  getZZPocket(): ZZPocket {
    return this.state.zzPocket;
  }

  getAntiZZPocket(): ZZPocket {
    return this.state.antiZZPocket;
  }

  getActivePattern(): 'ZZ' | 'AntiZZ' | null {
    return this.state.activePattern;
  }

  isZZActive(): boolean {
    return this.state.activePattern === 'ZZ';
  }

  isAntiZZActive(): boolean {
    return this.state.activePattern === 'AntiZZ';
  }

  isSystemActive(): boolean {
    return this.state.activePattern !== null;
  }

  isZZInPocket1(): boolean {
    return this.state.zzPocket === 1;
  }

  isAntiZZInPocket1(): boolean {
    return this.state.antiZZPocket === 1;
  }

  areBothInPocket2(): boolean {
    return this.state.zzPocket === 2 && this.state.antiZZPocket === 2;
  }

  isWaitingForFirstBet(): boolean {
    return this.state.waitingForFirstBet;
  }

  getFirstBetBlockIndex(): number {
    return this.state.firstBetBlockIndex;
  }

  /** Check if AntiZZ is a candidate waiting for next indicator */
  isAntiZZCandidate(): boolean {
    return this.state.antiZZIsCandidate;
  }

  /** Get runProfitZZ (INVARIANT: always up-to-date) */
  getRunProfitZZ(): number {
    return this.state.runProfitZZ;
  }

  getRunHistory(): ZZRunRecord[] {
    return [...this.state.runHistory];
  }

  getMovementHistory(): ZZMovementRecord[] {
    return [...this.state.movementHistory];
  }

  getCurrentRunProfit(): number {
    if (this.state.activePattern === 'ZZ') {
      return this.state.zzCurrentRunProfit;
    }
    return 0; // AntiZZ has no run profit
  }

  // --------------------------------------------------------------------------
  // POCKET CALCULATION (per spec Section D.4)
  // --------------------------------------------------------------------------

  /**
   * Calculate ZZ pocket based on runProfitZZ.
   *
   * User decision: >= 0 → P1 (zero/break-even stays in P1)
   * This is the lenient approach - a break-even run keeps ZZ in active mode.
   *
   * runProfitZZ >= 0 → P1 (active, can bet)
   * runProfitZZ < 0  → P2 (inactive, observe only)
   */
  private calculateZZPocket(): ZZPocket {
    return this.state.runProfitZZ >= 0 ? 1 : 2;
  }

  /**
   * Move a pattern to a new pocket and record the movement.
   */
  private movePatternToPocket(
    pattern: 'ZZ' | 'AntiZZ',
    newPocket: ZZPocket,
    blockIndex: number,
    triggerProfit: number
  ): void {
    const currentPocket = pattern === 'ZZ' ? this.state.zzPocket : this.state.antiZZPocket;

    if (currentPocket === newPocket) return;

    this.state.movementHistory.push({
      blockIndex,
      pattern,
      fromPocket: currentPocket,
      toPocket: newPocket,
      triggerProfit,
      ts: new Date().toISOString(),
    });

    console.log(`[ZZ POCKET] ${pattern}: P${currentPocket} → P${newPocket} (profit: ${triggerProfit.toFixed(0)}%)`);

    if (pattern === 'ZZ') {
      this.state.zzPocket = newPocket;
    } else {
      this.state.antiZZPocket = newPocket;
    }
  }

  // --------------------------------------------------------------------------
  // INDICATOR HANDLING (per spec Section C, D, E, F)
  // --------------------------------------------------------------------------

  /**
   * Handle indicator detection.
   *
   * Per spec Section C: ZZ indicator is the ONLY trigger for both patterns.
   *
   * Logic:
   * 1. If AntiZZ is candidate and in P1 → AntiZZ plays this indicator
   * 2. If ZZ in P1 → ZZ activates and bets
   * 3. If ZZ in P2 → Wait for imaginary first bet evaluation
   */
  handleIndicator(
    blockIndex: number,
    currentBlockDirection: Direction
  ): void {
    if (this.state.isInBaitSwitch) return;

    console.log(`[ZZ] === INDICATOR AT BLOCK ${blockIndex} ===`);
    this.logIndicatorState('BEFORE', blockIndex);

    // Save current block direction - ZZ predicts OPPOSITE for next block
    this.state.savedIndicatorDirection = currentBlockDirection;
    this.state.activationBlockIndex = blockIndex;

    // Case 1: AntiZZ is in P1 → AntiZZ plays (per spec E.3)
    // This covers both: (a) AntiZZ was candidate and moved to P1, or (b) AntiZZ won and stayed P1
    if (this.state.antiZZPocket === 1) {
      this.state.activePattern = 'AntiZZ';
      this.state.antiZZIsCandidate = false;  // Clear candidate flag if set
      console.log(`[ZZ] AntiZZ in P1, plays ONE bet this indicator`);
      this.logIndicatorState('AFTER', blockIndex);
      return;
    }

    // Case 2: ZZ is in P1 → ZZ activates (per spec D.2)
    // CRITICAL: Do NOT set waitingForFirstBet - that's only for imaginary (P2)
    // ZZ in P1 bets REAL and first bet is handled by recordZZResult()
    if (this.state.zzPocket === 1) {
      this.state.activePattern = 'ZZ';
      this.state.zzCurrentRunProfit = 0;
      this.state.zzFirstBetEvaluated = false;
      this.state.waitingForFirstBet = false;  // Real bet, not imaginary
      this.state.firstBetBlockIndex = -1;
      console.log(`[ZZ] ZZ in P1, activating ZZ - will bet on next block`);
      this.logIndicatorState('AFTER', blockIndex);
      return;
    }

    // Case 3: ZZ is in P2 → need imaginary first bet evaluation (per spec F)
    if (this.state.zzPocket === 2) {
      this.state.waitingForFirstBet = true;
      this.state.firstBetBlockIndex = blockIndex + 1;
      console.log(`[ZZ] ZZ in P2, waiting for imaginary first bet at block ${this.state.firstBetBlockIndex}`);
      this.logIndicatorState('AFTER', blockIndex);
      return;
    }
  }

  /**
   * Evaluate IMAGINARY first bet when ZZ is in P2.
   *
   * Per spec D.3: runProfitZZ is ALWAYS updated, even for imaginary.
   * Per spec E.2: If negative, AntiZZ becomes candidate for NEXT indicator.
   * Per spec F: If positive, ZZ moves P2→P1 and bets.
   */
  evaluateImaginaryFirstBet(
    actualDirection: Direction,
    pct: number,
    blockIndex: number
  ): {
    pattern: 'ZZ' | 'AntiZZ' | null;
    shouldBet: boolean;
    imaginaryProfit: number;
  } {
    if (!this.state.waitingForFirstBet) {
      return { pattern: null, shouldBet: false, imaginaryProfit: 0 };
    }

    if (blockIndex !== this.state.firstBetBlockIndex) {
      return { pattern: null, shouldBet: false, imaginaryProfit: 0 };
    }

    this.state.waitingForFirstBet = false;

    // ZZ predicts OPPOSITE of current block at indicator time (alternation continues)
    // savedIndicatorDirection = direction of block N (when indicator detected)
    // First bet block = N+1, so ZZ predicts opposite of block N
    const zzPrediction = this.state.savedIndicatorDirection
      ? ((-this.state.savedIndicatorDirection) as Direction)
      : actualDirection;

    const zzWouldWin = zzPrediction === actualDirection;
    const imaginaryProfit = zzWouldWin ? pct : -pct;

    // INVARIANT (spec D.3): runProfitZZ is ALWAYS updated, even for imaginary
    this.state.runProfitZZ = imaginaryProfit;

    console.log(`[ZZ] Imaginary first bet at block ${blockIndex}:`);
    console.log(`[ZZ]   ZZ predicted: ${zzPrediction > 0 ? 'UP' : 'DOWN'}`);
    console.log(`[ZZ]   Actual: ${actualDirection > 0 ? 'UP' : 'DOWN'}`);
    console.log(`[ZZ]   firstOutcomeZZ: ${imaginaryProfit.toFixed(0)}% (IMAGINARY)`);
    console.log(`[ZZ]   runProfitZZ updated to: ${this.state.runProfitZZ.toFixed(0)}%`);

    if (imaginaryProfit >= 0) {
      // POSITIVE imaginary → ZZ moves P2→P1 (per spec F)
      // IMPORTANT: shouldBet: false because the imaginary bet already "consumed" this block.
      // ZZ is now active and will bet on NEXT block via continuous betting.
      this.movePatternToPocket('ZZ', 1, blockIndex, imaginaryProfit);
      this.state.zzPocket = 1;
      this.state.activePattern = 'ZZ';
      this.state.zzCurrentRunProfit = imaginaryProfit;
      this.state.zzFirstBetEvaluated = true;  // Imaginary counts as first bet
      this.state.antiZZIsCandidate = false;

      console.log(`[ZZ] Positive imaginary → ZZ moves P2→P1, will bet on NEXT block`);
      console.log(`[ZZ] ZZ activated: YES, AntiZZ played: NO`);
      this.logIndicatorState('AFTER', blockIndex);

      // Return shouldBet: false - the imaginary bet already accounted for this block
      // ZZ will bet on subsequent blocks via continuous betting (shouldGenerateZZSignal)
      return { pattern: 'ZZ', shouldBet: false, imaginaryProfit };
    } else {
      // NEGATIVE imaginary → ZZ stays P2, AntiZZ becomes CANDIDATE (per spec E.2, F)
      // CRITICAL: AntiZZ does NOT play immediately - waits for NEXT indicator
      this.state.zzPocket = 2;
      this.state.antiZZIsCandidate = true;
      this.state.antiZZPocket = 1;  // Will be P1 for next indicator
      this.state.activePattern = null;  // NO ONE plays this indicator

      console.log(`[ZZ] Negative imaginary → ZZ stays P2`);
      console.log(`[ZZ] AntiZZ becomes CANDIDATE for NEXT indicator (does NOT play now)`);
      console.log(`[ZZ] ZZ activated: NO, AntiZZ played: NO (candidate for next)`);
      this.logIndicatorState('AFTER', blockIndex);

      return { pattern: null, shouldBet: false, imaginaryProfit };
    }
  }

  /**
   * Check if the active pattern should bet.
   */
  shouldBet(): boolean {
    if (this.state.activePattern === 'ZZ') {
      return this.state.zzPocket === 1;
    } else if (this.state.activePattern === 'AntiZZ') {
      return this.state.antiZZPocket === 1;
    }
    return false;
  }

  /**
   * Check if ZZ should generate a signal for the current block.
   *
   * ZZ CONTINUOUS BETTING RULE (per spec D.2):
   * Once ZZ is active in P1, it bets EVERY block until a negative result.
   * This method returns true if ZZ should bet on the current block.
   *
   * @param currentBlockIndex - The current block index (for logging)
   * @returns true if ZZ should generate a bet signal for this block
   */
  shouldGenerateZZSignal(currentBlockIndex?: number): boolean {
    // Only ZZ does continuous betting
    if (this.state.activePattern !== 'ZZ') {
      return false;
    }

    // ZZ must be in P1 to bet
    if (this.state.zzPocket !== 1) {
      return false;
    }

    // Don't bet during B&S (tracking continues, but no betting)
    if (this.state.isInBaitSwitch) {
      return false;
    }

    // Don't bet if waiting for imaginary first bet evaluation
    if (this.state.waitingForFirstBet) {
      return false;
    }

    // ZZ is active in P1, not in B&S, not waiting - should bet
    if (currentBlockIndex !== undefined) {
      console.log(`[ZZ] Continuous betting: ZZ active in P1, betting on block ${currentBlockIndex}`);
    }

    return true;
  }

  /**
   * Check if AntiZZ should generate a signal for the current block.
   *
   * AntiZZ SINGLE BET RULE (per spec E.3):
   * AntiZZ places exactly ONE bet per indicator.
   * This method returns true only if AntiZZ is active and hasn't bet yet this indicator.
   *
   * @returns true if AntiZZ should generate a bet signal
   */
  shouldGenerateAntiZZSignal(): boolean {
    // Only AntiZZ
    if (this.state.activePattern !== 'AntiZZ') {
      return false;
    }

    // AntiZZ must be in P1 to bet
    if (this.state.antiZZPocket !== 1) {
      return false;
    }

    // Don't bet during B&S
    if (this.state.isInBaitSwitch) {
      return false;
    }

    return true;
  }

  // --------------------------------------------------------------------------
  // RESULT RECORDING
  // --------------------------------------------------------------------------

  /**
   * Record ZZ result and handle first bet / run logic.
   *
   * Per spec D.2: ZZ continues until negative result.
   * Per spec D.3: runProfitZZ includes all bets in the run.
   * Per spec D.4: After run, pocket based on runProfitZZ > 0.
   * Per spec D.5: If first bet negative, AntiZZ becomes CANDIDATE.
   */
  recordZZResult(result: EvaluatedResult, blockIndex: number): {
    action: 'continue' | 'first_bet_negative' | 'run_ends';
    newPattern?: 'AntiZZ' | null;
  } {
    if (this.state.activePattern !== 'ZZ') {
      return { action: 'continue' };
    }

    // Update run profit
    this.state.zzCurrentRunProfit += result.profit;
    this.state.runProfitZZ = this.state.zzCurrentRunProfit;

    console.log(`[ZZ] ZZ bet result: ${result.profit.toFixed(0)}%`);
    console.log(`[ZZ] runProfitZZ: ${this.state.runProfitZZ.toFixed(0)}%`);

    if (result.profit < 0) {
      // Negative result
      if (!this.state.zzFirstBetEvaluated) {
        // FIRST BET NEGATIVE → AntiZZ becomes CANDIDATE (per spec D.5)
        this.state.zzFirstBetEvaluated = true;

        console.log(`[ZZ] ZZ first bet NEGATIVE`);
        console.log(`[ZZ] AntiZZ becomes CANDIDATE for NEXT indicator`);

        // ZZ → P2 based on runProfitZZ
        const newZZPocket = this.calculateZZPocket();
        this.movePatternToPocket('ZZ', newZZPocket, blockIndex, this.state.runProfitZZ);
        this.state.zzPocket = newZZPocket;
        this.state.activePattern = null;

        // AntiZZ becomes CANDIDATE - plays on NEXT indicator (per spec E.2)
        this.state.antiZZIsCandidate = true;
        this.state.antiZZPocket = 1;

        // Reset ZZ run state
        this.state.zzCurrentRunProfit = 0;
        this.state.zzFirstBetEvaluated = false;

        this.logIndicatorState('AFTER', blockIndex);
        return { action: 'first_bet_negative', newPattern: null };
      } else {
        // NOT first bet → Run ends (per spec D.4)
        console.log(`[ZZ] ZZ run ends (negative result)`);

        // Calculate new pocket from runProfitZZ (per spec D.4)
        const newPocket = this.calculateZZPocket();
        this.movePatternToPocket('ZZ', newPocket, blockIndex, this.state.runProfitZZ);
        this.state.zzPocket = newPocket;

        console.log(`[ZZ] runProfitZZ: ${this.state.runProfitZZ.toFixed(0)}% → P${newPocket}`);

        // Record run
        this.recordZZRunHistory(blockIndex);

        // Deactivate
        this.state.activePattern = null;
        this.state.zzCurrentRunProfit = 0;
        this.state.zzFirstBetEvaluated = false;

        this.logIndicatorState('AFTER', blockIndex);
        return { action: 'run_ends', newPattern: null };
      }
    }

    // Positive result → continue (per spec D.2)
    this.state.zzFirstBetEvaluated = true;
    return { action: 'continue' };
  }

  /**
   * Record AntiZZ result.
   *
   * Per spec E.3: AntiZZ places exactly ONE bet per indicator.
   * Per spec E.4: Pocket based on LAST BET only (not runProfit).
   */
  recordAntiZZResult(result: EvaluatedResult, blockIndex: number): {
    action: 'wait_for_indicator';
    didWin: boolean;
  } {
    if (this.state.activePattern !== 'AntiZZ') {
      return { action: 'wait_for_indicator', didWin: false };
    }

    // Record last bet outcome ONLY (per spec E.4 - no runProfit)
    this.state.antiZZLastBetOutcome = result.profit;
    const didWin = result.profit >= 0;

    console.log(`[ZZ] AntiZZ bet result: ${result.profit.toFixed(0)}% - ${didWin ? 'WIN' : 'LOSS'}`);
    console.log(`[ZZ] AntiZZ last bet result: ${result.profit.toFixed(0)}%`);

    // AntiZZ pocket based on LAST BET only (per spec E.4)
    if (result.profit < 0) {
      // LOSS → SWAP: AntiZZ to P2, ZZ to P1
      this.movePatternToPocket('AntiZZ', 2, blockIndex, result.profit);
      this.state.antiZZPocket = 2;
      this.state.zzPocket = 1;  // SWAP - ZZ moves to P1

      // ZZ activates IMMEDIATELY and predicts from this block
      // ZZ's imaginary first bet = opposite of AntiZZ's result
      // If AntiZZ lost with pct%, ZZ would have won pct%
      const zzImaginaryProfit = result.pct;
      this.state.runProfitZZ = zzImaginaryProfit;
      this.state.zzCurrentRunProfit = zzImaginaryProfit;
      this.state.zzFirstBetEvaluated = true;  // Imaginary counts as first bet
      this.state.activePattern = 'ZZ';  // ZZ activates immediately

      console.log(`[ZZ] AntiZZ lost → SWAP: AntiZZ to P2, ZZ to P1`);
      console.log(`[ZZ] ZZ imaginary first bet: +${zzImaginaryProfit.toFixed(0)}%`);
      console.log(`[ZZ] ZZ activates immediately, runProfitZZ: ${zzImaginaryProfit.toFixed(0)}%`);
    } else {
      // WIN → AntiZZ stays in P1, deactivates and waits for next indicator
      this.state.antiZZPocket = 1;
      this.state.activePattern = null;  // AntiZZ deactivates after one bet
      console.log(`[ZZ] AntiZZ won → stays P1, waits for next indicator`);
    }

    // Record run
    this.recordAntiZZRunHistory(blockIndex, result.profit);

    this.logIndicatorState('AFTER', blockIndex);
    return { action: 'wait_for_indicator', didWin };
  }

  // --------------------------------------------------------------------------
  // RUN HISTORY RECORDING
  // --------------------------------------------------------------------------

  private recordZZRunHistory(blockIndex: number): void {
    const record: ZZRunRecord = {
      runNumber: this.state.runHistory.length + 1,
      wasAntiZZ: false,
      pocket: this.state.zzPocket,
      firstPredictionNegative: false,
      profit: this.state.runProfitZZ,
      predictionCount: 1,
      startBlockIndex: this.state.activationBlockIndex,
      endBlockIndex: blockIndex,
      ts: new Date().toISOString(),
    };
    this.state.runHistory.push(record);
  }

  private recordAntiZZRunHistory(blockIndex: number, profit: number): void {
    const record: ZZRunRecord = {
      runNumber: this.state.runHistory.length + 1,
      wasAntiZZ: true,
      pocket: this.state.antiZZPocket,
      firstPredictionNegative: false,
      profit: profit,
      predictionCount: 1,
      startBlockIndex: this.state.activationBlockIndex,
      endBlockIndex: blockIndex,
      ts: new Date().toISOString(),
    };
    this.state.runHistory.push(record);
  }

  // --------------------------------------------------------------------------
  // PREDICTION DIRECTION
  // --------------------------------------------------------------------------

  /**
   * Get the predicted direction based on pattern and CURRENT block direction.
   *
   * ZZ: Predicts OPPOSITE of current (alternation continues)
   *     After DOWN, predict UP. After UP, predict DOWN.
   *
   * AntiZZ: Predicts SAME as current (alternation breaks)
   *         After DOWN, predict DOWN. After UP, predict UP.
   *
   * @param currentDirection - The direction of the CURRENT/LAST block
   * @param pattern - Optional pattern override (defaults to activePattern)
   */
  getPredictedDirection(currentDirection?: Direction, pattern?: 'ZZ' | 'AntiZZ'): Direction | null {
    const targetPattern = pattern || this.state.activePattern;

    // If no current direction provided, we can't predict
    if (!currentDirection) return null;

    if (targetPattern === 'ZZ') {
      // ZZ predicts OPPOSITE of current (alternation continues)
      return (-currentDirection) as Direction;
    } else if (targetPattern === 'AntiZZ') {
      // AntiZZ predicts SAME as current (alternation breaks)
      return currentDirection;
    }
    return null;
  }

  // --------------------------------------------------------------------------
  // BAIT-AND-SWITCH HANDLING
  // --------------------------------------------------------------------------

  setBaitSwitchMode(isInBaitSwitch: boolean): void {
    this.state.isInBaitSwitch = isInBaitSwitch;
  }

  shouldIgnoreBaitSwitch(): boolean {
    return this.state.isInBaitSwitch;
  }

  // --------------------------------------------------------------------------
  // PERSISTENCE & RESET
  // --------------------------------------------------------------------------

  exportState(): ZZStrategyState {
    return { ...this.state };
  }

  importState(state: ZZStrategyState): void {
    this.state = { ...state };
  }

  reset(): void {
    this.state = createInitialZZState();
  }

  /**
   * Rebuild ZZ state from evaluated results history (used after undo).
   *
   * This method reconstructs the ZZ/AntiZZ pocket positions and state
   * by replaying the historical results. After undo, no pattern should
   * be active - the system waits for the next indicator.
   *
   * Key state rebuilt:
   * - zzPocket: Based on last ZZ run's runProfitZZ (>0 → P1, ≤0 → P2)
   * - antiZZPocket: Based on last AntiZZ bet outcome (≥0 → P1, <0 → P2)
   * - runProfitZZ: Preserved from last ZZ run
   * - antiZZLastBetOutcome: Preserved from last AntiZZ bet
   * - runHistory/movementHistory: Rebuilt from results
   *
   * @param results - All evaluated results remaining after undo
   */
  rebuildFromResults(results: EvaluatedResult[]): void {
    console.log(`[ZZ] Rebuilding state from ${results.length} results`);

    // Reset to initial state first
    this.state = createInitialZZState();

    // Filter ZZ and AntiZZ results
    const zzResults = results.filter(r => r.pattern === 'ZZ');
    const antiZZResults = results.filter(r => r.pattern === 'AntiZZ');

    console.log(`[ZZ] Found ${zzResults.length} ZZ results, ${antiZZResults.length} AntiZZ results`);

    // Rebuild ZZ state from ZZ results
    if (zzResults.length > 0) {
      // Find runs by looking for negative results (run ends on negative)
      let currentRunProfit = 0;
      let runCount = 0;

      for (const result of zzResults) {
        currentRunProfit += result.profit;

        if (result.profit < 0) {
          // Run ended
          runCount++;
          this.state.runHistory.push({
            runNumber: runCount,
            wasAntiZZ: false,
            pocket: currentRunProfit >= 0 ? 1 : 2,  // >= 0 for lenient approach
            firstPredictionNegative: false,
            profit: currentRunProfit,
            predictionCount: 1,
            startBlockIndex: result.signalIndex,
            endBlockIndex: result.evalIndex,
            ts: new Date().toISOString(),
          });

          // Update runProfitZZ from this run
          this.state.runProfitZZ = currentRunProfit;
          currentRunProfit = 0;
        }
      }

      // If there's remaining profit (run didn't end), track it
      if (currentRunProfit !== 0) {
        this.state.runProfitZZ = currentRunProfit;
      }

      // Calculate ZZ pocket from runProfitZZ (>= 0 for lenient approach)
      this.state.zzPocket = this.state.runProfitZZ >= 0 ? 1 : 2;
      console.log(`[ZZ] Rebuilt ZZ: runProfitZZ=${this.state.runProfitZZ.toFixed(0)}%, pocket=P${this.state.zzPocket}`);
    }

    // Rebuild AntiZZ state from AntiZZ results
    if (antiZZResults.length > 0) {
      // AntiZZ uses LAST BET ONLY for pocket decision
      const lastAntiZZResult = antiZZResults[antiZZResults.length - 1];
      this.state.antiZZLastBetOutcome = lastAntiZZResult.profit;

      // AntiZZ pocket based on last bet (≥0 → P1, <0 → P2)
      this.state.antiZZPocket = lastAntiZZResult.profit >= 0 ? 1 : 2;

      // Record AntiZZ runs
      for (const result of antiZZResults) {
        this.state.runHistory.push({
          runNumber: this.state.runHistory.length + 1,
          wasAntiZZ: true,
          pocket: result.profit >= 0 ? 1 : 2,
          firstPredictionNegative: false,
          profit: result.profit,
          predictionCount: 1,
          startBlockIndex: result.signalIndex,
          endBlockIndex: result.evalIndex,
          ts: new Date().toISOString(),
        });
      }

      console.log(`[ZZ] Rebuilt AntiZZ: lastBet=${this.state.antiZZLastBetOutcome?.toFixed(0)}%, pocket=P${this.state.antiZZPocket}`);
    }

    // After undo, no pattern should be active - wait for next indicator
    this.state.activePattern = null;
    this.state.waitingForFirstBet = false;
    this.state.antiZZIsCandidate = false;
    this.state.zzFirstBetEvaluated = false;
    this.state.zzCurrentRunProfit = 0;

    console.log(`[ZZ] State rebuilt: ZZ=P${this.state.zzPocket}, AntiZZ=P${this.state.antiZZPocket}, activePattern=none`);
  }

  // --------------------------------------------------------------------------
  // STATISTICS
  // --------------------------------------------------------------------------

  getStatistics(): {
    totalRuns: number;
    zzRuns: number;
    antiZZRuns: number;
    totalProfit: number;
    zzProfit: number;
    antiZZProfit: number;
    pocket1Runs: number;
    pocket2Runs: number;
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
    };
  }

  // --------------------------------------------------------------------------
  // LEGACY COMPATIBILITY (DEPRECATED)
  // --------------------------------------------------------------------------

  /** @deprecated Use getActivePattern() instead */
  getCurrentState(): 'inactive' | 'zz_active' | 'anti_zz_active' | 'suspended' {
    if (this.state.isInBaitSwitch) return 'suspended';
    if (this.state.activePattern === 'ZZ') return 'zz_active';
    if (this.state.activePattern === 'AntiZZ') return 'anti_zz_active';
    return 'inactive';
  }

  /** @deprecated Use getZZPocket() or getAntiZZPocket() instead */
  getCurrentPocket(): ZZPocket {
    if (this.state.activePattern === 'ZZ') return this.state.zzPocket;
    if (this.state.activePattern === 'AntiZZ') return this.state.antiZZPocket;
    return this.state.zzPocket;
  }

  /** @deprecated Use handleIndicator() instead */
  startWaitingForFirstBet(blockIndex: number, indicatorDirection: Direction): void {
    this.handleIndicator(blockIndex, indicatorDirection);
  }

  /** @deprecated Use handleIndicator() instead */
  activateZZ(blockIndex: number, _previousRunProfit: number, indicatorDirection: Direction): void {
    this.handleIndicator(blockIndex, indicatorDirection);
  }

  /** @deprecated Use recordZZResult() or recordAntiZZResult() instead */
  recordPredictionResult(result: EvaluatedResult): void {
    if (this.state.activePattern === 'ZZ') {
      this.recordZZResult(result, result.evalIndex);
    } else if (this.state.activePattern === 'AntiZZ') {
      this.recordAntiZZResult(result, result.evalIndex);
    }
  }

  /** @deprecated No longer needed - AntiZZ uses last bet only */
  resolveZZRun(_blockIndex: number): ZZRunRecord | null {
    return null;
  }

  /** @deprecated No longer needed - AntiZZ uses last bet only */
  resolveAntiZZRun(_blockIndex: number): ZZRunRecord | null {
    return null;
  }

  /** @deprecated No longer needed - AntiZZ deactivates after one bet */
  continueAntiZZAfterWin(_indicatorDirection: Direction): void {
    // No-op: AntiZZ deactivates after one bet per spec E.3
  }

  /** @deprecated No longer needed */
  shouldSkipAntiZZResolution(): boolean {
    return false;
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createZZStateManager(): ZZStateManager {
  return new ZZStateManager();
}
