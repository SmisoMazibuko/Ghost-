/**
 * Ghost Evaluator - Same Direction System
 * ========================================
 *
 * Run-based profit regime detection system.
 * See docs/SAME-DIRECTION-SYSTEM-SPEC.md for authoritative rules.
 *
 * VERSION: v1.0
 *
 * KEY RULES:
 * - Activation: RunProfit >= 140
 * - Deactivation: accumulatedLoss > 140
 * - RunProfit = sum(D2..Dk) - BreakBlock (skip D1)
 * - Loss accumulation ONLY at run breaks
 * - Big win (RunProfit > accumulatedLoss) resets to 0
 * - Small win (RunProfit <= accumulatedLoss) does nothing
 */

import { Block, Direction } from '../types';

// ============================================================================
// ZZ/XAX TRACKING TYPES & CONSTANTS
// ============================================================================

/** Result of last ZZ/XAX trade for pause/resume logic */
export type ZZXAXResult = 'WIN' | 'LOSS' | null;

/** Pause reason for SameDir (Phase 2) */
export type SDPauseReason = 'HIGH_PCT_REVERSAL' | 'CONSECUTIVE_LOSSES' | null;

/** Patterns that predict alternation/anti-alternation (used for SD pause/resume) */
export const ZZ_XAX_PATTERNS = [
  'ZZ', 'AntiZZ',
  '2A2', 'Anti2A2',
  '3A3', 'Anti3A3',
  '4A4', 'Anti4A4',
  '5A5', 'Anti5A5',
] as const;

/**
 * Patterns that trigger SD resume when they LOSE (alternation patterns only).
 * These patterns bet OPPOSITE to SD (on direction change).
 * When they lose, direction CONTINUES - good for SD to resume.
 *
 * DO NOT include Anti patterns - they bet SAME as SD (on continuation).
 * When Anti patterns lose, direction CHANGED - bad for SD.
 */
export const RESUME_TRIGGER_PATTERNS = [
  'ZZ', '2A2', '3A3', '4A4', '5A5', '6A6'
] as const;

/** ZZ action type for determining if first bet was successful */
export type ZZActionType = 'first_bet_negative' | 'run_ends' | 'continue' | null;

// ============================================================================
// TYPES
// ============================================================================

/** Record of a completed Same Direction run */
export interface SameDirectionRun {
  /** Starting block index of the run */
  startBlockIndex: number;
  /** Block index where run broke (break block) */
  endBlockIndex: number;
  /** Direction of the run */
  direction: Direction;
  /** Number of blocks in the run (excluding break) */
  runLength: number;
  /** Calculated RunProfit for this run */
  runProfit: number;
  /** Whether this run triggered activation */
  wasActivation: boolean;
  /** Whether this run triggered deactivation */
  wasDeactivation: boolean;
  /** accumulatedLoss after processing this run */
  accumulatedLossAfter: number;
  /** Timestamp */
  ts: string;
}

/** Complete Same Direction state */
export interface SameDirectionState {
  /** Whether Same Direction is currently active (betting) */
  active: boolean;
  /** Accumulated loss from negative RunProfits */
  accumulatedLoss: number;
  /** Direction of the current ongoing run (null if no blocks yet) */
  currentRunDirection: Direction | null;
  /** Blocks in the current ongoing run */
  currentRunBlocks: Block[];
  /** Block index where current run started */
  currentRunStartIndex: number;
  /** Block index where Same Direction was activated (-1 if never) */
  activationBlockIndex: number;
  /** RunProfit that triggered activation */
  activationRunProfit: number;
  /** History of completed runs */
  runHistory: SameDirectionRun[];
  /** Total blocks processed */
  totalBlocksProcessed: number;

  // === ZZ/XAX TRACKING (for pause/resume) ===
  /** Last ZZ/XAX trade result for pause/resume logic */
  lastZZXAXResult: ZZXAXResult;
  /** Block index of last ZZ/XAX trade (-1 if none) */
  lastZZXAXTradeBlock: number;
  /** Pattern of last ZZ/XAX trade (null if none) */
  lastZZXAXPattern: string | null;
  /** Last ZZ action type for resume logic (first_bet_negative vs run_ends) */
  lastZZAction: ZZActionType;

  // === PAUSE STATE (Phase 2) ===
  /** Whether SD is currently paused */
  paused: boolean;
  /** Reason for current pause */
  pauseReason: SDPauseReason;
  /** Block index where pause started (-1 if not paused) */
  pauseBlock: number;
  /** Consecutive SD losses (resets on win, used for pause trigger) */
  sdConsecutiveLosses: number;

  // === IMAGINARY TRACKING (during pause) ===
  /** Imaginary P/L accumulated during pause */
  imaginaryPnL: number;
  /** Imaginary wins during pause */
  imaginaryWins: number;
  /** Imaginary losses during pause */
  imaginaryLosses: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Threshold for activation (RunProfit must be >= this) */
const ACTIVATION_THRESHOLD = 140;

/** Threshold for deactivation (accumulatedLoss must be > this) */
const DEACTIVATION_THRESHOLD = 140;

// ============================================================================
// SAME DIRECTION MANAGER
// ============================================================================

export class SameDirectionManager {
  private state: SameDirectionState;

  constructor() {
    this.state = this.createInitialState();
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  private createInitialState(): SameDirectionState {
    return {
      active: false,
      accumulatedLoss: 0,
      currentRunDirection: null,
      currentRunBlocks: [],
      currentRunStartIndex: -1,
      activationBlockIndex: -1,
      activationRunProfit: 0,
      runHistory: [],
      totalBlocksProcessed: 0,
      // ZZ/XAX tracking
      lastZZXAXResult: null,
      lastZZXAXTradeBlock: -1,
      lastZZXAXPattern: null,
      lastZZAction: null,
      // Pause state
      paused: false,
      pauseReason: null,
      pauseBlock: -1,
      sdConsecutiveLosses: 0,
      // Imaginary tracking
      imaginaryPnL: 0,
      imaginaryWins: 0,
      imaginaryLosses: 0,
    };
  }

  // ==========================================================================
  // PHASE 1: OBSERVATION (Called for EVERY block)
  // ==========================================================================

  /**
   * Process a new block - MUST be called for every block regardless of who bets.
   * This handles run tracking and run break detection.
   *
   * @param block - The block to process
   * @param isZZFamilyActive - If true, skip flip loss accumulation (A1: ZZ-Family Hard Isolation)
   */
  processBlock(block: Block, isZZFamilyActive: boolean = false): void {
    this.state.totalBlocksProcessed++;

    // First block ever
    if (this.state.currentRunDirection === null) {
      this.startNewRun(block);
      console.log(`[SD] First block: ${block.dir === 1 ? 'G' : 'R'} +${block.pct}%`);
      return;
    }

    // Check if run continues or breaks
    if (block.dir === this.state.currentRunDirection) {
      // Run continues
      this.state.currentRunBlocks.push(block);
      console.log(
        `[SD] Run continues: ${block.dir === 1 ? 'G' : 'R'} +${block.pct}% (length: ${this.state.currentRunBlocks.length})`
      );
    } else {
      // Run breaks!
      const runLength = this.state.currentRunBlocks.length;
      console.log(`[SD] === RUN BREAK AT BLOCK ${block.index} (run was ${runLength} blocks) ===`);

      // CRITICAL: When ACTIVE and run was SINGLE BLOCK (< 2), add flip loss
      // For longer runs, RunProfit calculation already accounts for the loss
      // But for single-block runs, RunProfit is skipped, so we must add the loss here
      // A1: SKIP if ZZ-family is active - their losses don't count against SD
      if (this.state.active && runLength < 2 && !isZZFamilyActive) {
        const flipLoss = block.pct;
        this.state.accumulatedLoss += flipLoss;
        console.log(`[SD] SINGLE-BLOCK FLIP LOSS: +${flipLoss}% added to accumulatedLoss (now: ${this.state.accumulatedLoss}%)`);

        // Check for deactivation after flip loss
        if (this.state.accumulatedLoss > DEACTIVATION_THRESHOLD) {
          this.deactivate();
        }
      } else if (this.state.active && runLength < 2 && isZZFamilyActive) {
        console.log(`[SD] A1: Flip loss SKIPPED (ZZ-family active) - accumulatedLoss stays at ${this.state.accumulatedLoss}%`);
      }

      // Process the completed run (for activation check when inactive, big win reset when active)
      this.onRunBreak(this.state.currentRunBlocks, block);

      // Start new run with the break block
      this.startNewRun(block);
    }
  }

  /**
   * Start tracking a new run
   */
  private startNewRun(block: Block): void {
    this.state.currentRunDirection = block.dir;
    this.state.currentRunBlocks = [block];
    this.state.currentRunStartIndex = block.index;
  }

  // ==========================================================================
  // A1: ZZ INDICATOR LOSS REVERSAL
  // ==========================================================================

  /**
   * Reverse flip losses that were accumulated during ZZ indicator formation.
   * A1: ZZ-Family Hard Isolation - alternating blocks that trigger ZZ indicator
   * should not count against SD's accumulatedLoss.
   *
   * Called when ZZ indicator is detected. The alternating blocks (each length 1)
   * that formed the indicator pattern had their flip losses added to SD.
   * This method reverses those losses.
   *
   * @param alternatingCount - Number of alternating single blocks in the indicator
   * @param blocks - All blocks in the session
   */
  reverseZZIndicatorLosses(alternatingCount: number, blocks: Block[]): void {
    // Only reverse if SD was active (losses were actually accumulated)
    if (!this.state.active) {
      console.log(`[SD] A1: ZZ indicator detected but SD inactive - no losses to reverse`);
      return;
    }

    if (alternatingCount < 1 || blocks.length < alternatingCount) {
      return;
    }

    // Get the last N blocks (the alternating ones that formed the indicator)
    // Note: Each alternating block is a single-block run, so each caused a flip loss
    // The flip loss is the pct of the BREAK block (the block that ended the run)
    // For alternating singles, each block IS the break block for the previous run

    // Calculate total loss to reverse
    // The first alternating block is the break block for the indicator run (≥2 length)
    // That one doesn't count as a flip loss (the run was ≥2)
    // The subsequent alternating blocks (2nd, 3rd, etc.) each caused flip losses
    const alternatingBlocks = blocks.slice(-alternatingCount);

    // Skip the first alternating block (it broke a run of ≥2, so no flip loss was added)
    // Only reverse losses from blocks 2..N of the alternating sequence
    const blocksWithFlipLoss = alternatingBlocks.slice(1);

    let totalReversed = 0;
    for (const block of blocksWithFlipLoss) {
      totalReversed += block.pct;
    }

    if (totalReversed > 0) {
      const oldLoss = this.state.accumulatedLoss;
      this.state.accumulatedLoss = Math.max(0, this.state.accumulatedLoss - totalReversed);
      console.log(`[SD] A1: ZZ indicator - REVERSED ${totalReversed}% flip losses from ${blocksWithFlipLoss.length} alternating blocks`);
      console.log(`[SD]     accumulatedLoss: ${oldLoss}% → ${this.state.accumulatedLoss}%`);
    }
  }

  // ==========================================================================
  // RUN BREAK HANDLING
  // ==========================================================================

  /**
   * Handle a run break - calculate RunProfit and update state
   */
  private onRunBreak(runBlocks: Block[], breakBlock: Block): void {
    const runLength = runBlocks.length;
    const runDirection = runBlocks[0]?.dir;

    console.log(`[SD] Run: ${runDirection === 1 ? 'G' : 'R'} x ${runLength} blocks`);
    console.log(`[SD] Run blocks: [${runBlocks.map((b) => b.index).join(', ')}]`);

    // Minimum 2 blocks needed for RunProfit calculation
    if (runLength < 2) {
      console.log(`[SD] Run too short (${runLength} < 2), skipping RunProfit calculation`);
      this.recordRun(runBlocks, breakBlock, null, false, false);
      return;
    }

    // Calculate RunProfit: sum(D2..Dk) - B1
    const runProfit = this.calculateRunProfit(runBlocks, breakBlock);

    console.log(
      `[SD] Profits: D2..Dk = [${runBlocks.slice(1).map((b) => b.pct).join(', ')}], B1 = ${breakBlock.pct}`
    );
    console.log(`[SD] RunProfit = ${runProfit}%`);
    console.log(`[SD] Before: active=${this.state.active}, accumulatedLoss=${this.state.accumulatedLoss}%`);

    let wasActivation = false;
    let wasDeactivation = false;

    if (!this.state.active) {
      // Check for activation
      if (runProfit >= ACTIVATION_THRESHOLD) {
        this.activate(breakBlock.index, runProfit);
        wasActivation = true;
      } else {
        console.log(`[SD] Not activated: ${runProfit}% < ${ACTIVATION_THRESHOLD}%`);
      }
    } else {
      // Already active - update accumulated loss based on RunProfit
      if (runProfit < 0) {
        // Negative run - add to accumulated loss
        const absLoss = Math.abs(runProfit);
        this.state.accumulatedLoss += absLoss;
        console.log(`[SD] Negative run: adding ${absLoss}% to accumulatedLoss`);

        // Check for deactivation
        if (this.state.accumulatedLoss > DEACTIVATION_THRESHOLD) {
          this.deactivate();
          wasDeactivation = true;
        }
      } else if (runProfit > 0) {
        // Positive run - check for reset
        if (runProfit > this.state.accumulatedLoss) {
          console.log(
            `[SD] Big win: ${runProfit}% > ${this.state.accumulatedLoss}% → RESET accumulatedLoss to 0`
          );
          this.state.accumulatedLoss = 0;
        } else {
          console.log(
            `[SD] Small win: ${runProfit}% <= ${this.state.accumulatedLoss}% → no change`
          );
        }
      } else {
        // runProfit === 0
        console.log(`[SD] Zero profit run → no change`);
      }
    }

    console.log(`[SD] After: active=${this.state.active}, accumulatedLoss=${this.state.accumulatedLoss}%`);
    console.log(`[SD] ================================`);

    // Record the run
    this.recordRun(runBlocks, breakBlock, runProfit, wasActivation, wasDeactivation);
  }

  /**
   * Calculate RunProfit for a completed run
   * Formula: sum(D2..Dk) - B1 (skip D1, subtract break block)
   */
  private calculateRunProfit(runBlocks: Block[], breakBlock: Block): number {
    // Skip D1 (first block), sum D2..Dk
    const runSum = runBlocks.slice(1).reduce((sum, block) => sum + block.pct, 0);

    // Subtract break block
    return runSum - breakBlock.pct;
  }

  // ==========================================================================
  // ACTIVATION / DEACTIVATION
  // ==========================================================================

  /**
   * Activate Same Direction system
   */
  private activate(blockIndex: number, runProfit: number): void {
    console.log(`[SD] *** ACTIVATED at block ${blockIndex} ***`);
    console.log(`[SD]     RunProfit: ${runProfit}% >= ${ACTIVATION_THRESHOLD}%`);
    console.log(`[SD]     accumulatedLoss reset to 0`);

    this.state.active = true;
    this.state.accumulatedLoss = 0;
    this.state.activationBlockIndex = blockIndex;
    this.state.activationRunProfit = runProfit;
  }

  /**
   * Deactivate Same Direction system (cut)
   */
  private deactivate(): void {
    console.log(`[SD] *** DEACTIVATED ***`);
    console.log(`[SD]     accumulatedLoss: ${this.state.accumulatedLoss}% > ${DEACTIVATION_THRESHOLD}%`);
    console.log(`[SD]     Will observe for re-activation`);

    this.state.active = false;
    // Keep accumulatedLoss for history, it will be reset on next activation
  }

  // ==========================================================================
  // RUN HISTORY
  // ==========================================================================

  /**
   * Record a completed run in history
   */
  private recordRun(
    runBlocks: Block[],
    breakBlock: Block,
    runProfit: number | null,
    wasActivation: boolean,
    wasDeactivation: boolean
  ): void {
    const run: SameDirectionRun = {
      startBlockIndex: runBlocks[0]?.index ?? -1,
      endBlockIndex: breakBlock.index,
      direction: runBlocks[0]?.dir ?? 1,
      runLength: runBlocks.length,
      runProfit: runProfit ?? 0,
      wasActivation,
      wasDeactivation,
      accumulatedLossAfter: this.state.accumulatedLoss,
      ts: new Date().toISOString(),
    };

    this.state.runHistory.push(run);

    // Keep history manageable (last 100 runs)
    if (this.state.runHistory.length > 100) {
      this.state.runHistory.shift();
    }
  }

  // ==========================================================================
  // PHASE 2: BET DECISION (Called by Hierarchy Manager)
  // ==========================================================================

  /**
   * Check if Same Direction is currently active
   */
  isActive(): boolean {
    return this.state.active;
  }

  /**
   * Get the bet direction (same as previous block = continuation)
   * Returns null if not active or no previous block
   */
  getBetDirection(previousBlock: Block | null): Direction | null {
    if (!this.state.active) {
      return null;
    }

    if (!previousBlock) {
      return null;
    }

    // Bet same direction as previous block (continuation)
    return previousBlock.dir;
  }

  /**
   * Get accumulated loss (for display/logging)
   */
  getAccumulatedLoss(): number {
    return this.state.accumulatedLoss;
  }

  /**
   * @deprecated This method violates constitutional rule A1 (ZZ-Family Hard Isolation).
   * ZZ/AntiZZ must NEVER affect SD accumulatedLoss. Kept for backward compatibility only.
   */
  clearAccumulatedLoss(): void {
    console.warn(`[SD] clearAccumulatedLoss() is DEPRECATED - violates A1 (ZZ-Family Hard Isolation)`);
  }

  // ==========================================================================
  // STATE ACCESSORS
  // ==========================================================================

  /**
   * Get full state (for persistence/debugging)
   */
  getState(): SameDirectionState {
    return { ...this.state };
  }

  /**
   * Get current run info (for display)
   */
  getCurrentRunInfo(): {
    direction: Direction | null;
    length: number;
    startIndex: number;
  } {
    return {
      direction: this.state.currentRunDirection,
      length: this.state.currentRunBlocks.length,
      startIndex: this.state.currentRunStartIndex,
    };
  }

  /**
   * Get run history
   */
  getRunHistory(): SameDirectionRun[] {
    return [...this.state.runHistory];
  }

  /**
   * Get status message for display
   */
  getStatusMessage(): string {
    if (!this.state.active) {
      return `INACTIVE (observing)`;
    }
    if (this.state.paused) {
      return `PAUSED (${this.state.pauseReason}) - life frozen at ${this.state.accumulatedLoss}/${DEACTIVATION_THRESHOLD}`;
    }
    return `ACTIVE (loss: ${this.state.accumulatedLoss}/${DEACTIVATION_THRESHOLD})`;
  }

  // ==========================================================================
  // ZZ/XAX RESULT TRACKING (for pause/resume)
  // ==========================================================================

  /**
   * Check if a pattern is a ZZ/XAX pattern (used for pause/resume logic).
   * @param pattern - The pattern name to check
   * @returns true if pattern is in ZZ_XAX_PATTERNS
   */
  isZZXAXPattern(pattern: string): boolean {
    return ZZ_XAX_PATTERNS.includes(pattern as typeof ZZ_XAX_PATTERNS[number]);
  }

  /**
   * Record the result of a ZZ/XAX trade.
   * Called by ReactionEngine after each trade completes.
   * Used to determine when SameDir should resume (on ZZ/XAX break).
   *
   * @param pattern - The pattern name
   * @param isWin - Whether the trade won
   * @param blockIndex - Block index where trade was evaluated
   * @param zzAction - For ZZ pattern, the action type ('first_bet_negative' or 'run_ends')
   */
  recordZZXAXResult(
    pattern: string,
    isWin: boolean,
    blockIndex: number,
    zzAction?: ZZActionType
  ): void {
    // Only track ZZ/XAX patterns
    if (!ZZ_XAX_PATTERNS.includes(pattern as typeof ZZ_XAX_PATTERNS[number])) {
      return;
    }

    const result: ZZXAXResult = isWin ? 'WIN' : 'LOSS';
    this.state.lastZZXAXResult = result;
    this.state.lastZZXAXTradeBlock = blockIndex;
    this.state.lastZZXAXPattern = pattern;

    // Store ZZ action type for resume logic
    if (pattern === 'ZZ' && zzAction) {
      this.state.lastZZAction = zzAction;
    }

    console.log(`[SD] ZZ/XAX result: ${pattern} ${result} at block ${blockIndex}${zzAction ? ` (action: ${zzAction})` : ``}`);
  }

  /**
   * Get the last ZZ/XAX trade result.
   * Returns 'WIN', 'LOSS', or null if no ZZ/XAX trade has occurred.
   */
  getLastZZXAXResult(): ZZXAXResult {
    return this.state.lastZZXAXResult;
  }

  /**
   * Get complete info about the last ZZ/XAX trade.
   */
  getLastZZXAXInfo(): {
    result: ZZXAXResult;
    block: number;
    pattern: string | null;
  } {
    return {
      result: this.state.lastZZXAXResult,
      block: this.state.lastZZXAXTradeBlock,
      pattern: this.state.lastZZXAXPattern,
    };
  }

  /**
   * Check if last ZZ/XAX result was a break (loss).
   * Used as resume trigger for SameDir.
   */
  didZZXAXBreak(): boolean {
    return this.state.lastZZXAXResult === 'LOSS';
  }

  // ==========================================================================
  // PAUSE SYSTEM (Phase 2)
  // ==========================================================================

  /**
   * Check if SD should pause based on trade result.
   * Called after each SD trade by ReactionEngine.
   *
   * @param isWin - Whether the trade won
   * @param evalBlockPct - Block percentage
   * @param isReversal - Whether this was a direction reversal
   */
  shouldPause(
    isWin: boolean,
    evalBlockPct: number,
    isReversal: boolean
  ): { shouldPause: boolean; reason: SDPauseReason } {
    // Only check pause triggers when active and not already paused
    if (!this.state.active || this.state.paused) {
      return { shouldPause: false, reason: null };
    }

    // Trigger 1: High PCT reversal + loss
    if (isReversal && evalBlockPct >= 70 && !isWin) {
      return { shouldPause: true, reason: 'HIGH_PCT_REVERSAL' };
    }

    // Trigger 2: 2+ consecutive losses
    // sdConsecutiveLosses >= 1 && !isWin means this is the 2nd+ loss
    if (this.state.sdConsecutiveLosses >= 1 && !isWin) {
      return { shouldPause: true, reason: 'CONSECUTIVE_LOSSES' };
    }

    return { shouldPause: false, reason: null };
  }

  /**
   * Pause SD trading (enter PAUSED state).
   */
  pause(reason: SDPauseReason, blockIndex: number): void {
    if (this.state.paused) return;

    this.state.paused = true;
    this.state.pauseReason = reason;
    this.state.pauseBlock = blockIndex;

    // Reset imaginary tracking for this pause period
    this.state.imaginaryPnL = 0;
    this.state.imaginaryWins = 0;
    this.state.imaginaryLosses = 0;

    console.log(`[SD] *** PAUSED at block ${blockIndex} ***`);
    console.log(`[SD]     Reason: ${reason}`);
    console.log(`[SD]     accumulatedLoss FROZEN at: ${this.state.accumulatedLoss}%`);
  }

  /**
   * Check if SD is currently paused.
   */
  isPaused(): boolean {
    return this.state.paused;
  }

  /**
   * Resume SD trading (exit PAUSED state).
   * Called when ZZ/XAX breaks (loses), signaling market returning to trending mode.
   */
  resume(blockIndex: number): void {
    if (!this.state.paused) return;

    const pauseDuration = blockIndex - this.state.pauseBlock;
    console.log(`[SD] *** RESUMED at block ${blockIndex} ***`);
    console.log(`[SD]     Was paused for ${pauseDuration} blocks`);
    console.log(`[SD]     Pause reason was: ${this.state.pauseReason}`);
    console.log(`[SD]     Imaginary during pause: ${this.state.imaginaryWins}W/${this.state.imaginaryLosses}L = ${this.state.imaginaryPnL}%`);
    console.log(`[SD]     Resuming with accumulatedLoss: ${this.state.accumulatedLoss}%`);

    this.state.paused = false;
    this.state.pauseReason = null;
    this.state.pauseBlock = -1;
    // Reset consecutive losses on resume - fresh start
    this.state.sdConsecutiveLosses = 0;
    // Keep imaginary stats for analysis but don't reset
  }

  /**
   * Check if SD should resume based on ZZ/XAX break.
   * Called after recording ZZ/XAX result.
   *
   * IMPORTANT: Only resume when ALTERNATION patterns break (lose).
   * - ZZ, 2A2, 3A3, 4A4, 5A5, 6A6 bet on direction CHANGE
   * - When they lose, direction CONTINUES → good for SD
   *
   * CRITICAL: For ZZ pattern, only resume if first bet was successful.
   * - If ZZ broke on first bet (first_bet_negative), market is still hostile
   * - If ZZ run ended (run_ends), first bet was successful → OK to resume
   *
   * DO NOT resume when Anti patterns break:
   * - AntiZZ, Anti2A2, etc. bet on direction CONTINUATION (same as SD)
   * - When they lose, direction CHANGED → bad for SD
   *
   * @returns Whether SD resumed
   */
  checkResumeCondition(blockIndex: number): boolean {
    // Only check resume if currently paused
    if (!this.state.paused) {
      return false;
    }

    // Only resume when ALTERNATION patterns break
    if (this.state.lastZZXAXResult === 'LOSS' &&
        this.state.lastZZXAXPattern &&
        RESUME_TRIGGER_PATTERNS.includes(this.state.lastZZXAXPattern as typeof RESUME_TRIGGER_PATTERNS[number])) {

      // CRITICAL: For ZZ pattern, only resume if first bet was successful
      if (this.state.lastZZXAXPattern === 'ZZ') {
        if (this.state.lastZZAction === 'first_bet_negative') {
          console.log(`[SD] Resume BLOCKED: ZZ broke on first bet (market still hostile)`);
          return false;
        }
        // 'run_ends' means first bet was successful, OK to resume
        console.log(`[SD] Resume triggered: ZZ run ended (first bet was successful)`);
      } else {
        console.log(`[SD] Resume triggered: ${this.state.lastZZXAXPattern} broke (alternation pattern)`);
      }

      this.resume(blockIndex);
      return true;
    }

    // Anti pattern broke - stay paused (direction changed, bad for SD)
    if (this.state.lastZZXAXResult === 'LOSS' && this.state.lastZZXAXPattern) {
      console.log(`[SD] Resume BLOCKED: ${this.state.lastZZXAXPattern} broke (continuation pattern - bad for SD)`);
    }

    return false;
  }

  // ==========================================================================
  // A2: XAX DECAY DURING PAUSE
  // ==========================================================================

  /** XAX patterns that can apply decay to SD during pause */
  private static readonly XAX_DECAY_PATTERNS = ['2A2', '3A3', '4A4', '5A5', '6A6'] as const;

  /**
   * Apply XAX decay to accumulatedLoss during SD pause.
   * Constitutional rule A2: Pause ≠ Full Freeze - SD paused can still receive decay from XAX parties.
   *
   * Called when an XAX pattern (2A2, 3A3, 4A4, 5A5, 6A6) wins an imaginary trade while SD is paused.
   * The decay reduces accumulatedLoss, giving SD a path to recovery during alternation phases.
   *
   * @param pattern - The XAX pattern that won
   * @param xaxProfit - The profit from the XAX win (block.pct)
   * @returns Whether decay was applied
   */
  applyXAXDecay(pattern: string, xaxProfit: number): boolean {
    // Only apply decay when SD is paused
    if (!this.state.paused) {
      return false;
    }

    // Only XAX patterns (not ZZ/AntiZZ per A1 isolation rule)
    if (!SameDirectionManager.XAX_DECAY_PATTERNS.includes(pattern as typeof SameDirectionManager.XAX_DECAY_PATTERNS[number])) {
      return false;
    }

    // Only on XAX wins (positive profit)
    if (xaxProfit <= 0) {
      return false;
    }

    // No decay if no accumulated loss
    if (this.state.accumulatedLoss <= 0) {
      return false;
    }

    // Apply 50% of XAX profit as decay
    const decayAmount = xaxProfit * 0.5;
    const oldLoss = this.state.accumulatedLoss;
    this.state.accumulatedLoss = Math.max(0, this.state.accumulatedLoss - decayAmount);

    console.log(`[SD] A2 XAX decay: ${pattern} win applied decay`);
    console.log(`[SD]     accumulatedLoss: ${oldLoss.toFixed(1)}% → ${this.state.accumulatedLoss.toFixed(1)}% (decay: ${decayAmount.toFixed(1)}%)`);

    return true;
  }

  /**
   * Check if SD can place a bet (active AND not paused).
   */
  canBet(): boolean {
    return this.state.active && !this.state.paused;
  }

  /**
   * Record the result of an SD trade.
   * Called by ReactionEngine after each SD trade.
   *
   * @param isWin - Whether the trade won
   * @param pct - Block percentage
   * @param blockIndex - Block index
   * @param isReversal - Whether this was a reversal
   * @returns Whether SD paused after this trade
   */
  recordSDTradeResult(
    isWin: boolean,
    pct: number,
    blockIndex: number,
    isReversal: boolean
  ): { didPause: boolean; reason: SDPauseReason } {
    // If already paused, track as imaginary
    if (this.state.paused) {
      if (isWin) {
        this.state.imaginaryWins++;
        this.state.imaginaryPnL += pct;
      } else {
        this.state.imaginaryLosses++;
        this.state.imaginaryPnL -= pct;
      }
      console.log(`[SD] IMAGINARY trade: ${isWin ? 'WIN' : 'LOSS'} ${pct}% (total: ${this.state.imaginaryPnL}%)`);
      return { didPause: false, reason: null };
    }

    // Not paused - this is a REAL trade
    // Check if should pause BEFORE updating counter
    // This ensures "2+ consecutive losses" means counter >= 1 at check time (already had 1 loss)
    const pauseCheck = this.shouldPause(isWin, pct, isReversal);

    // Update consecutive losses AFTER checking pause
    if (isWin) {
      this.state.sdConsecutiveLosses = 0;
    } else {
      this.state.sdConsecutiveLosses++;
    }

    // Now apply pause if triggered
    if (pauseCheck.shouldPause) {
      this.pause(pauseCheck.reason, blockIndex);
      return { didPause: true, reason: pauseCheck.reason };
    }

    return { didPause: false, reason: null };
  }

  /**
   * Get pause info for display/logging.
   */
  getPauseInfo(): {
    isPaused: boolean;
    reason: SDPauseReason;
    pauseBlock: number;
    imaginaryPnL: number;
    imaginaryWins: number;
    imaginaryLosses: number;
  } {
    return {
      isPaused: this.state.paused,
      reason: this.state.pauseReason,
      pauseBlock: this.state.pauseBlock,
      imaginaryPnL: this.state.imaginaryPnL,
      imaginaryWins: this.state.imaginaryWins,
      imaginaryLosses: this.state.imaginaryLosses,
    };
  }

  // ==========================================================================
  // RESET & REBUILD
  // ==========================================================================

  /**
   * Reset to initial state
   */
  reset(): void {
    this.state = this.createInitialState();
    console.log('[SD] Reset to initial state');
  }

  /**
   * Rebuild state from block history (for undo compatibility)
   */
  rebuildFromBlocks(blocks: Block[]): void {
    console.log(`[SD] Rebuilding from ${blocks.length} blocks...`);
    this.reset();

    if (blocks.length === 0) {
      return;
    }

    // Process each block to rebuild state
    for (const block of blocks) {
      this.processBlock(block);
    }

    console.log(`[SD] Rebuild complete: active=${this.state.active}, accumulatedLoss=${this.state.accumulatedLoss}`);
  }

  // ==========================================================================
  // EXPORT / IMPORT (for persistence)
  // ==========================================================================

  /**
   * Export state for persistence
   */
  exportState(): SameDirectionState {
    return JSON.parse(JSON.stringify(this.state));
  }

  /**
   * Import state from persistence
   */
  importState(state: SameDirectionState): void {
    this.state = JSON.parse(JSON.stringify(state));
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createSameDirectionManager(): SameDirectionManager {
  return new SameDirectionManager();
}
