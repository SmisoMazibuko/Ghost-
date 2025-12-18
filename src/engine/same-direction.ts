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
    };
  }

  // ==========================================================================
  // PHASE 1: OBSERVATION (Called for EVERY block)
  // ==========================================================================

  /**
   * Process a new block - MUST be called for every block regardless of who bets.
   * This handles run tracking and run break detection.
   */
  processBlock(block: Block): void {
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
      if (this.state.active && runLength < 2) {
        const flipLoss = block.pct;
        this.state.accumulatedLoss += flipLoss;
        console.log(`[SD] SINGLE-BLOCK FLIP LOSS: +${flipLoss}% added to accumulatedLoss (now: ${this.state.accumulatedLoss}%)`);

        // Check for deactivation after flip loss
        if (this.state.accumulatedLoss > DEACTIVATION_THRESHOLD) {
          this.deactivate();
        }
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
   * Clear accumulated loss (called when ZZ wins)
   * RULE: If ZZ plays and wins, accumulated loss from ZZ's active period doesn't count
   */
  clearAccumulatedLoss(): void {
    if (this.state.accumulatedLoss > 0) {
      console.log(`[SD] Clearing accumulated loss (${this.state.accumulatedLoss}%) - ZZ win rule`);
      this.state.accumulatedLoss = 0;
    }
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
    if (this.state.active) {
      return `ACTIVE (loss: ${this.state.accumulatedLoss}/${DEACTIVATION_THRESHOLD})`;
    }
    return `INACTIVE (observing)`;
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
