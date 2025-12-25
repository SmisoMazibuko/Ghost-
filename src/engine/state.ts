/**
 * Ghost Evaluator v15.3 - Game State Engine
 * ==========================================
 * Manages blocks, runs, and overall game state
 */

import {
  Block,
  Direction,
  RunData,
  PatternSignal,
  PatternName,
  PATTERN_NAMES,
  EvaluatedResult,
  Verdict,
  EvaluatorConfig,
  SessionState,
  DEFAULT_CONFIG,
} from '../types';
import { PatternDetector, createPatternDetector } from '../patterns/detector';
import { PatternLifecycleManager, createLifecycleManager } from '../patterns/lifecycle';

// ============================================================================
// VERDICT CALCULATION
// ============================================================================

/**
 * Calculate verdict from percentage and correctness
 */
export function calculateVerdict(pct: number, isCorrect: boolean, neutralBand: number): Verdict {
  if (!isCorrect) {
    return pct >= 70 ? 'fake' : 'unfair';
  }
  const low = 50 - 100 * neutralBand;   // 45 with default band
  const high = 50 + 100 * neutralBand;  // 55 with default band
  return (pct < low || pct > high) ? 'fair' : 'neutral';
}

/**
 * Calculate signed profit
 */
export function calculateProfit(pct: number, isCorrect: boolean): number {
  return isCorrect ? +pct : -pct;
}

// ============================================================================
// GAME STATE ENGINE
// ============================================================================

export class GameStateEngine {
  private blocks: Block[] = [];
  private runData: RunData = {
    lengths: [],
    directions: [],
    currentLength: 0,
    currentDirection: 1,
  };
  private pendingSignals: PatternSignal[] = [];
  private results: EvaluatedResult[] = [];
  // REMOVED: p1Mode - legacy hold removed, Same Direction System handles long runs
  private config: EvaluatorConfig;
  private detector: PatternDetector;
  private lifecycle: PatternLifecycleManager;

  /**
   * OZ structural kill tracking:
   * - Set to block index when OZ bet is evaluated and wins (flip back started)
   * - When NEXT flip happens (after the monitoring start block), check if flip back was < 3
   * - This prevents killing OZ on the single (which is always length 1)
   * - Value of -1 means not monitoring
   */
  private ozMonitoringStartBlock: number = -1;

  constructor(config?: Partial<EvaluatorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.detector = createPatternDetector();
    this.lifecycle = createLifecycleManager(this.config);
  }

  /**
   * Add a new block to the sequence
   * Returns all evaluated results and new signals
   * @param dir - Block direction
   * @param pct - Block percentage
   */
  addBlock(dir: Direction, pct: number): {
    block: Block;
    newSignals: PatternSignal[];
    evaluatedResults: EvaluatedResult[];
    p1ModeChanged: boolean;
  } {
    const index = this.blocks.length;
    const block: Block = {
      dir,
      pct,
      ts: new Date().toISOString(),
      index,
    };

    this.blocks.push(block);
    this.updateRuns(dir, index);

    // REMOVED: P1 mode check - legacy hold removed, Same Direction System handles long runs

    // AP5 CONFIRMATION: Check if we just hit 3 blocks and previous run was 2+
    // This activates AP5 before the flip happens
    if (this.runData.currentLength === 3 && this.runData.lengths.length >= 2) {
      const previousRunLength = this.runData.lengths[this.runData.lengths.length - 2];
      if (previousRunLength >= 2) {
        // Get the 2nd block of current run (confirmation block)
        // Current block is at index, so 2nd block is at index - 1
        const secondBlockIndex = index - 1;
        if (secondBlockIndex >= 0 && secondBlockIndex < this.blocks.length) {
          const secondBlockPct = this.blocks[secondBlockIndex].pct;
          this.lifecycle.confirmAP5Pattern(secondBlockPct, index);
        }
      }
    }

    // NOTE: AP5 BREAK moved to after evaluatePendingSignals() so bet losses are counted

    // OZ CONFIRMATION: Check if we just hit 3 blocks and previous run was a single (1)
    // This is: 1+ same → single → 3+ flip back (confirm 70% on 1st block)
    if (this.runData.currentLength === 3 && this.runData.lengths.length >= 2) {
      const previousRunLength = this.runData.lengths[this.runData.lengths.length - 2];
      if (previousRunLength === 1) {
        // Previous was a single - this is OZ setup
        // Get the 1st block of current run (confirmation block)
        // Current block is at index (3rd), so 1st block is at index - 2
        const firstBlockIndex = index - 2;
        if (firstBlockIndex >= 0 && firstBlockIndex < this.blocks.length) {
          const firstBlockPct = this.blocks[firstBlockIndex].pct;
          this.lifecycle.confirmOZPattern(firstBlockPct, index);
        }
      }
    }

    // NOTE: OZ BREAK moved to after evaluatePendingSignals() so bet losses are counted

    // PP CONFIRMATION: Check if we just hit 2 blocks (double) and previous run was a single (1)
    // This is: 1+ same → single → 2 flip back (confirm 70% on 1st block)
    if (this.runData.currentLength === 2 && this.runData.lengths.length >= 2) {
      const previousRunLength = this.runData.lengths[this.runData.lengths.length - 2];
      if (previousRunLength === 1) {
        // Previous was a single - this is PP setup
        // Get the 1st block of current run (confirmation block)
        // Current block is at index (2nd), so 1st block is at index - 1
        const firstBlockIndex = index - 1;
        if (firstBlockIndex >= 0 && firstBlockIndex < this.blocks.length) {
          const firstBlockPct = this.blocks[firstBlockIndex].pct;
          this.lifecycle.confirmPPPattern(firstBlockPct, index);
        }
      }
    }

    // PP BREAK: PP is continuous during 1-2-1-2 rhythm, breaks when:
    // 1. Run reaches 3+ (exits PP rhythm, enters OZ territory)
    // 2. Two singles in a row (1-1) - expected double after single
    // Loss-based breaks are handled by lifecycle via recordResult()
    if (this.lifecycle.isActive('PP')) {
      // Kill condition 1: Run reaches 3+
      if (this.runData.currentLength >= 3) {
        this.lifecycle.breakPPPattern(index);
      }
      // Kill condition 2: Two singles in a row (rhythm broken)
      else if (this.runData.currentLength === 1 && this.runData.lengths.length >= 2) {
        const previousRunLength = this.runData.lengths[this.runData.lengths.length - 2];
        if (previousRunLength === 1) {
          // Previous was single, current is single = two singles in a row
          // PP rhythm broken (expected double after single)
          console.log(`[State] PP broken - two singles in a row (rhythm broken)`);
          this.lifecycle.breakPPPattern(index);
        }
      }
    }

    // ST CONFIRMATION: Check if we just hit 2 blocks (double) and previous run was 2+
    // This is: 2+ → flip → RR (check 70% on 2nd R) → ACTIVATE
    if (this.runData.currentLength === 2 && this.runData.lengths.length >= 2) {
      const previousRunLength = this.runData.lengths[this.runData.lengths.length - 2];
      if (previousRunLength >= 2) {
        // Previous was 2+ - this is ST setup
        // Get the 2nd block of current run (the current block - confirmation block)
        const secondBlockPct = this.blocks[index].pct;
        this.lifecycle.confirmSTPattern(secondBlockPct, index);
      }
    }

    // ST BREAK: ST is continuous during 2A2 rhythm, breaks on 3+ (enters OZ territory)
    // Loss-based breaks are handled by lifecycle via recordResult()
    if (this.lifecycle.isActive('ST') && this.runData.currentLength >= 3) {
      this.lifecycle.breakSTPattern(index);
    }

    // =========================================================================
    // OZ LIFECYCLE - Order matters! Must be: structural kill → evaluate → set monitoring → detect
    // =========================================================================

    // STEP 1: OZ STRUCTURAL KILL CHECK (resets monitoring if flip back ended)
    // This must happen BEFORE signal detection so new singles can be detected
    if (this.lifecycle.isActive('OZ') && this.runData.currentLength === 1) {
      // A flip just happened (currentLength === 1 means new run started)
      // Only check if we're monitoring AND this is a SUBSEQUENT flip (not the same block)
      if (this.ozMonitoringStartBlock >= 0 && index > this.ozMonitoringStartBlock) {
        // We were monitoring a flip back, now it ended - check if < 3
        if (this.runData.lengths.length >= 2) {
          const flipBackLength = this.runData.lengths[this.runData.lengths.length - 2];
          if (flipBackLength < 3) {
            console.log(`[State] OZ structural kill - flip back was only ${flipBackLength} (< 3)`);
            this.lifecycle.breakOZPattern(index);
          } else {
            console.log(`[State] OZ flip back was ${flipBackLength} - pattern survives`);
          }
        }
        // Reset monitoring - will be set again when next OZ bet wins
        this.ozMonitoringStartBlock = -1;
      }
    }

    // STEP 2: Evaluate pending signals (this evaluates OZ bets)
    const evaluatedResults = this.evaluatePendingSignals(block);

    // STEP 3: Set monitoring if OZ bet won (flip back started)
    // This must happen BEFORE signal detection so we suppress signals on flip back blocks
    for (const result of evaluatedResults) {
      if (result.pattern === 'OZ' && result.profit >= 0 && result.wasBet) {
        // OZ bet won (flip back started), record the block index
        // Structural kill will only be checked on flips AFTER this block
        this.ozMonitoringStartBlock = index;
        console.log(`[State] OZ bet won at block ${index} - monitoring flip back for structural kill`);
      }
    }

    // =========================================================================
    // SIGNAL DETECTION - Now happens AFTER OZ lifecycle management
    // =========================================================================

    // Build set of active patterns for signal detection
    // Only include patterns that are actually active in lifecycle
    // B&S patterns need to re-activate through normal lifecycle (observe 70%+ = bait confirmed)
    // before they can generate signals for inverse play
    const activePatterns = new Set<PatternName>(
      PATTERN_NAMES.filter(p => this.lifecycle.isActive(p))
    );

    // Detect new patterns (pass blocks for AP5, activePatterns for OZ/AP5 active check)
    let newSignals = this.detector.detectAll(this.runData, index, this.blocks, activePatterns);

    // STEP 4: OZ SIGNAL SUPPRESSION while monitoring flip back
    // This prevents OZ from signaling on flip back blocks (which have currentLength === 1)
    // OZ should only signal on actual singles, not on flip back starts
    if (this.ozMonitoringStartBlock >= 0) {
      const ozSignalCount = newSignals.filter(s => s.pattern === 'OZ').length;
      if (ozSignalCount > 0) {
        console.log(`[State] Suppressing OZ signal - currently monitoring flip back (started at block ${this.ozMonitoringStartBlock})`);
        newSignals = newSignals.filter(s => s.pattern !== 'OZ');
      }
    }

    // Generate additional ZZ signals from saved indicator (for active+profitable ZZ)
    const zzIndicatorSignals = this.generateZZIndicatorSignals(index);

    // Combine signals, but avoid duplicates (prefer normal detection over indicator-based)
    const allSignals = [...newSignals];
    for (const zzSig of zzIndicatorSignals) {
      // Only add if there's no existing signal for this pattern
      if (!allSignals.some(s => s.pattern === zzSig.pattern)) {
        allSignals.push(zzSig);
      }
    }

    // Update lifecycle for each detected pattern
    for (const signal of allSignals) {
      this.lifecycle.updateLastFormation(signal.pattern, index);
      this.pendingSignals.push(signal);
    }

    // AP5 BREAK: Check if AP5 is active and flip just happened with 2 or fewer blocks
    // NOTE: This is checked AFTER evaluatePendingSignals so bet losses are counted in breakRunProfit
    if (this.lifecycle.isActive('AP5') && this.runData.currentLength === 1) {
      // A flip just happened (currentLength === 1 means new run started)
      // Check if previous run was 2 or fewer
      if (this.runData.lengths.length >= 2) {
        const previousRunLength = this.runData.lengths[this.runData.lengths.length - 2];
        if (previousRunLength <= 2) {
          this.lifecycle.breakAP5Pattern(index);
        }
      }
    }

    // REMOVED: P1 mode clearing logic - legacy hold removed

    return {
      block,
      newSignals: allSignals,
      evaluatedResults,
      p1ModeChanged: false, // Legacy field - always false now
    };
  }

  /**
   * Generate ZZ/AntiZZ signals based on saved indicator when pattern is active+profitable
   * Returns any additional signals to add to the pending signals
   */
  private generateZZIndicatorSignals(blockIndex: number): PatternSignal[] {
    const signals: PatternSignal[] = [];
    const zzPatterns: { pattern: 'ZZ' | 'AntiZZ'; isAnti: boolean }[] = [
      { pattern: 'ZZ', isAnti: false },
      { pattern: 'AntiZZ', isAnti: true },
    ];

    for (const { pattern, isAnti } of zzPatterns) {
      // Check if pattern is active with a saved indicator
      if (this.lifecycle.isActive(pattern)) {
        const savedDir = this.lifecycle.getSavedIndicatorDirection(pattern);
        if (savedDir !== null) {
          // Generate a signal based on saved indicator
          const signal = this.detector.generateZZSignalFromIndicator(
            this.runData,
            blockIndex,
            savedDir,
            isAnti
          );
          if (signal) {
            signals.push(signal);
          }
        }
      }
    }

    return signals;
  }

  /**
   * Update run tracking data
   */
  private updateRuns(dir: Direction, index: number): void {
    if (index === 0) {
      this.runData.currentLength = 1;
      this.runData.currentDirection = dir;
      this.runData.lengths.push(1);
      this.runData.directions.push(dir);
    } else {
      const prevBlock = this.blocks[index - 1];
      if (dir === prevBlock.dir) {
        this.runData.currentLength += 1;
        this.runData.lengths[this.runData.lengths.length - 1] = this.runData.currentLength;
      } else {
        this.runData.currentLength = 1;
        this.runData.currentDirection = dir;
        this.runData.lengths.push(1);
        this.runData.directions.push(dir);
      }
    }
  }

  /**
   * Evaluate all pending signals against the new block
   */
  private evaluatePendingSignals(block: Block): EvaluatedResult[] {
    const evaluated: EvaluatedResult[] = [];
    const remaining: PatternSignal[] = [];

    for (const signal of this.pendingSignals) {
      // Signal is evaluated on the block AFTER it was raised
      if (block.index <= signal.signalIndex) {
        remaining.push(signal);
        continue;
      }

      // For B&S inverse bets, we bet OPPOSITE of expectedDirection
      // So "correct" means block went OPPOSITE of expectedDirection
      const isCorrect = signal.isBnsInverse
        ? block.dir !== signal.expectedDirection  // Inverse: correct if block is OPPOSITE of expected
        : block.dir === signal.expectedDirection; // Normal: correct if block matches expected

      // DEBUG: Log B&S inverse signal evaluation
      if (signal.isBnsInverse) {
        console.log(`[State] B&S inverse signal ${signal.pattern}: expected=${signal.expectedDirection}, actual=${block.dir}, isCorrect=${isCorrect}`);
      }
      const verdict = calculateVerdict(block.pct, isCorrect, this.config.neutralBand);
      const profit = calculateProfit(block.pct, isCorrect);
      const wasBet = this.lifecycle.isActive(signal.pattern);

      const result: EvaluatedResult = {
        pattern: signal.pattern,
        signalIndex: signal.signalIndex,
        evalIndex: block.index,
        expectedDirection: signal.expectedDirection,
        actualDirection: block.dir,
        pct: block.pct,
        runLength: this.runData.currentLength,
        verdict,
        profit,
        wasBet,
        ts: new Date().toISOString(),
        indicatorDirection: signal.indicatorDirection, // Pass for ZZ/AntiZZ persistence
        isBnsInverse: signal.isBnsInverse, // Pass for B&S break handling
      };

      evaluated.push(result);
      this.results.push(result);

      // Apply result to lifecycle
      this.lifecycle.applyResult(result);
    }

    this.pendingSignals = remaining;
    return evaluated;
  }

  /**
   * Get current session state
   */
  getSessionState(): SessionState {
    // REMOVED: P1 mode check - legacy hold removed

    // Check if any active pattern has pending signals
    const hasActivePending = this.pendingSignals.some(
      s => this.lifecycle.isActive(s.pattern)
    );

    return hasActivePending ? 'playable' : 'unplayable';
  }

  /**
   * Check if P1 mode is active
   * @deprecated Legacy hold removed - always returns false
   */
  isP1Mode(): boolean {
    return false; // Legacy hold removed
  }

  /**
   * Get all blocks
   */
  getBlocks(): Block[] {
    return [...this.blocks];
  }

  /**
   * Get current block count
   */
  getBlockCount(): number {
    return this.blocks.length;
  }

  /**
   * Get run data
   */
  getRunData(): RunData {
    return { ...this.runData };
  }

  /**
   * Get pending signals
   */
  getPendingSignals(): PatternSignal[] {
    return [...this.pendingSignals];
  }

  /**
   * Get all results
   */
  getResults(): EvaluatedResult[] {
    return [...this.results];
  }

  /**
   * Get lifecycle manager
   */
  getLifecycle(): PatternLifecycleManager {
    return this.lifecycle;
  }

  /**
   * Get detector
   */
  getDetector(): PatternDetector {
    return this.detector;
  }

  /**
   * Get current run length
   */
  getCurrentRunLength(): number {
    return this.runData.currentLength;
  }

  /**
   * Get current run direction
   */
  getCurrentRunDirection(): Direction {
    return this.runData.currentDirection;
  }

  /**
   * Get the last N blocks
   */
  getLastBlocks(n: number): Block[] {
    return this.blocks.slice(-n);
  }

  /**
   * Undo the last block
   */
  undoLastBlock(): Block | null {
    if (this.blocks.length === 0) return null;

    const removed = this.blocks.pop()!;

    // Rebuild state from remaining blocks
    const savedBlocks = [...this.blocks];
    this.reset();

    for (const block of savedBlocks) {
      this.addBlock(block.dir, block.pct);
    }

    return removed;
  }

  /**
   * Reset all state
   */
  reset(): void {
    this.blocks = [];
    this.runData = {
      lengths: [],
      directions: [],
      currentLength: 0,
      currentDirection: 1,
    };
    this.pendingSignals = [];
    this.results = [];
    // REMOVED: p1Mode - legacy hold removed
    this.ozMonitoringStartBlock = -1;
    this.lifecycle.resetAll();
  }

  /**
   * Export state for persistence
   */
  exportState(): {
    blocks: Block[];
    runData: RunData;
    pendingSignals: PatternSignal[];
    results: EvaluatedResult[];
    p1Mode: boolean; // Legacy field - always false
    ozMonitoringStartBlock: number;
    patternCycles: ReturnType<PatternLifecycleManager['getAllCycles']>;
  } {
    return {
      blocks: this.getBlocks(),
      runData: this.getRunData(),
      pendingSignals: this.getPendingSignals(),
      results: this.getResults(),
      p1Mode: false, // Legacy field - always false now
      ozMonitoringStartBlock: this.ozMonitoringStartBlock,
      patternCycles: this.lifecycle.getAllCycles(),
    };
  }

  /**
   * Import state from persistence
   */
  importState(state: ReturnType<GameStateEngine['exportState']>): void {
    this.reset();

    // Rebuild blocks
    for (const block of state.blocks) {
      this.blocks.push(block);
      this.updateRuns(block.dir, block.index);
    }

    this.pendingSignals = state.pendingSignals;
    this.results = state.results;
    // REMOVED: p1Mode import - legacy hold removed
    this.ozMonitoringStartBlock = state.ozMonitoringStartBlock ?? -1;
    this.lifecycle.loadCycles(state.patternCycles);
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createGameStateEngine(config?: Partial<EvaluatorConfig>): GameStateEngine {
  return new GameStateEngine(config);
}
