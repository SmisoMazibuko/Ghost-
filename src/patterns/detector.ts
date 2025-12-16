/**
 * Ghost Evaluator v15.3 - Pattern Detector
 * =========================================
 * Detects all patterns based on run data
 */

import {
  Direction,
  PatternName,
  PatternSignal,
  RunData,
} from '../types';

// ============================================================================
// PATTERN DETECTION FUNCTIONS
// ============================================================================

/**
 * Detect 2A2 pattern: Run length === 2, predict opposite
 */
function detect2A2(runData: RunData, blockIndex: number): PatternSignal | null {
  if (runData.currentLength !== 2) return null;

  return {
    pattern: '2A2',
    signalIndex: blockIndex,
    expectedDirection: (-runData.currentDirection) as Direction,
    ts: new Date().toISOString(),
  };
}

/**
 * Detect Anti2A2 pattern: Run length === 2, predict same
 */
function detectAnti2A2(runData: RunData, blockIndex: number): PatternSignal | null {
  if (runData.currentLength !== 2) return null;

  return {
    pattern: 'Anti2A2',
    signalIndex: blockIndex,
    expectedDirection: runData.currentDirection,
    ts: new Date().toISOString(),
  };
}

/**
 * Detect 3A3 pattern: Run length === 3, predict opposite
 */
function detect3A3(runData: RunData, blockIndex: number): PatternSignal | null {
  if (runData.currentLength !== 3) return null;

  return {
    pattern: '3A3',
    signalIndex: blockIndex,
    expectedDirection: (-runData.currentDirection) as Direction,
    ts: new Date().toISOString(),
  };
}

/**
 * Detect Anti3A3 pattern: Run length === 3, predict same
 */
function detectAnti3A3(runData: RunData, blockIndex: number): PatternSignal | null {
  if (runData.currentLength !== 3) return null;

  return {
    pattern: 'Anti3A3',
    signalIndex: blockIndex,
    expectedDirection: runData.currentDirection,
    ts: new Date().toISOString(),
  };
}

/**
 * Detect 4A4 pattern: Run length === 4, predict opposite
 */
function detect4A4(runData: RunData, blockIndex: number): PatternSignal | null {
  if (runData.currentLength !== 4) return null;

  return {
    pattern: '4A4',
    signalIndex: blockIndex,
    expectedDirection: (-runData.currentDirection) as Direction,
    ts: new Date().toISOString(),
  };
}

/**
 * Detect Anti4A4 pattern: Run length === 4, predict same (continuation)
 */
function detectAnti4A4(runData: RunData, blockIndex: number): PatternSignal | null {
  if (runData.currentLength !== 4) return null;

  return {
    pattern: 'Anti4A4',
    signalIndex: blockIndex,
    expectedDirection: runData.currentDirection,
    ts: new Date().toISOString(),
  };
}

/**
 * Detect 5A5 pattern: Run length === 5, predict opposite
 */
function detect5A5(runData: RunData, blockIndex: number): PatternSignal | null {
  if (runData.currentLength !== 5) return null;

  return {
    pattern: '5A5',
    signalIndex: blockIndex,
    expectedDirection: (-runData.currentDirection) as Direction,
    ts: new Date().toISOString(),
  };
}

/**
 * Detect Anti5A5 pattern: Run length === 5, predict same (continuation)
 */
function detectAnti5A5(runData: RunData, blockIndex: number): PatternSignal | null {
  if (runData.currentLength !== 5) return null;

  return {
    pattern: 'Anti5A5',
    signalIndex: blockIndex,
    expectedDirection: runData.currentDirection,
    ts: new Date().toISOString(),
  };
}

/**
 * Detect 6A6 pattern: Run length === 6, predict opposite
 */
function detect6A6(runData: RunData, blockIndex: number): PatternSignal | null {
  if (runData.currentLength !== 6) return null;

  return {
    pattern: '6A6',
    signalIndex: blockIndex,
    expectedDirection: (-runData.currentDirection) as Direction,
    ts: new Date().toISOString(),
  };
}

/**
 * Detect Anti6A6 pattern: Run length === 6, predict same (continuation)
 */
function detectAnti6A6(runData: RunData, blockIndex: number): PatternSignal | null {
  if (runData.currentLength !== 6) return null;

  return {
    pattern: 'Anti6A6',
    signalIndex: blockIndex,
    expectedDirection: runData.currentDirection,
    ts: new Date().toISOString(),
  };
}

/**
 * Detect AP5 pattern (UPDATED v29):
 * Pattern sequence: 2+ same → 3+ opposite (70% on 2nd block) → 1st block of flip back → PLAY 2nd block
 *
 * ACTIVATION: Happens on 3rd block of opposite run (via lifecycle.confirmAP5Pattern)
 * SIGNAL: Only raised when AP5 is ALREADY ACTIVE
 *
 * Step 1: See 2+ blocks same direction (e.g., G G)
 * Step 2: See 3+ blocks opposite direction (e.g., R R R)
 *         - The 2nd block of this opposite run must be ≥70% (confirmation)
 *         - AP5 ACTIVATES here (on 3rd block)
 * Step 3: On the 1st block of flip back, trigger signal to play 2nd block
 *
 * Example: G G → R R R → G [TRIGGER HERE → Predict 2nd G (continuation)]
 *          └─┘   └───┘   │
 *          2+    3+(70%  1st block triggers, predict 2nd G
 *               on 2nd)
 *
 * BREAK: AP5 breaks when flip happens with 2 or fewer blocks
 *
 * @param isActive - Whether AP5 is currently active (signals only raised when active)
 */
function detectAP5(runData: RunData, blockIndex: number, _blocks?: { pct: number }[], isActive: boolean = false): PatternSignal | null {
  // AP5 only raises signals when already active
  if (!isActive) {
    return null;
  }

  // Need at least 2 runs: previous (3+) → current flip (1)
  if (runData.lengths.length < 2) return null;

  const L1 = runData.lengths[runData.lengths.length - 1]; // Current run (flip) (flip)
  const L2 = runData.lengths[runData.lengths.length - 2]; // Previous run run

  const currDir = runData.directions[runData.directions.length - 1];

  // AP5 signal: Previous run was 3+ and we just flipped (L1 === 1)
  // Note: 70% confirmation already happened at activation time
  if (L2 >= 3 && L1 === 1) {
    console.log(`[AP5] Signal raised: ${L2} previous → flip → Play 2nd block (continuation)`);

    return {
      pattern: 'AP5',
      signalIndex: blockIndex,
      expectedDirection: currDir, // Predict 2nd block continues same direction
      ts: new Date().toISOString(),
    };
  }

  return null;
}

/**
 * Detect OZ (Opposite Zone) pattern (UPDATED v30):
 *
 * ACTIVATION: Happens on 3rd block of flip back (via lifecycle.confirmOZPattern)
 * - 1+ same → single → 3+ flip back (confirm 70% on 1st block) → ACTIVATE
 *
 * SIGNAL: Only raised when OZ is ALREADY ACTIVE
 * - Single opposite → predict 1st block of flip back
 *
 * Example:
 *   G G R G G G    ← 3+ flip back, confirm 70% on 1st G → OZ ACTIVATES
 *       ^   ^
 *       1   3rd block (confirm here)
 *
 *   Then when active:
 *   G G G R [G]    ← predict G (1st block of flip back)
 *         ^
 *         single
 *
 * BREAK: When flip back is less than 3 blocks
 *
 * @param isActive - Whether OZ is currently active (signals only raised when active)
 */
function detectOZ(runData: RunData, blockIndex: number, isActive: boolean = false): PatternSignal | null {
  // OZ only raises signals when already active
  if (!isActive) {
    return null;
  }

  // Need at least 2 runs: prior run → current single opposite (1)
  if (runData.lengths.length < 2) return null;

  const L1 = runData.lengths[runData.lengths.length - 1]; // Current run (flip) (single opposite)

  const priorDir = runData.directions[runData.directions.length - 2]; // Direction to flip back to

  // OZ signal: We have a single opposite (L1 === 1)
  // Predict flip back to prior direction
  if (L1 === 1) {
    console.log(`[OZ] Signal raised: single → Predict flip back to ${priorDir > 0 ? 'G' : 'R'}`);
    return {
      pattern: 'OZ',
      signalIndex: blockIndex,
      expectedDirection: priorDir, // Predict flip back to prior direction
      ts: new Date().toISOString(),
    };
  }

  return null;
}

/**
 * Detect ZZ pattern:
 * - Initial trigger: Indicator (≥2) + 2 alternating singles (e.g., GGRGR)
 * - Continuous trigger: Once established, triggers on EVERY alternation
 * - Predicts: OPPOSITE of current direction (continue the alternation)
 *
 * Example: GGRGR → Current is R, ZZ predicts G (opposite)
 *          GGRGRG → Current is G, ZZ predicts R (opposite)
 *
 * Key insight: ZZ predicts alternation continues, so always predict
 * the OPPOSITE of the current direction.
 *
 * UPDATED v16: Lowered threshold from ≥3 to ≥2 for indicator
 */
function detectZZ(runData: RunData, blockIndex: number): PatternSignal | null {
  // Need at least 4 runs to establish the pattern (indicator + 3 singles)
  if (runData.lengths.length < 4) return null;

  const L1 = runData.lengths[runData.lengths.length - 1]; // Current run (flip)

  // Current run must be length 1 (alternation continuing)
  if (L1 !== 1) return null;

  // Find the indicator: scan backwards for a run of ≥2
  // The indicator must be followed by all 1s (alternation)
  let indicatorIndex = -1;

  for (let i = runData.lengths.length - 2; i >= 0; i--) {
    if (runData.lengths[i] >= 2) {
      // Found potential indicator - check that all runs after it are 1s
      let allOnes = true;
      for (let j = i + 1; j < runData.lengths.length; j++) {
        if (runData.lengths[j] !== 1) {
          allOnes = false;
          break;
        }
      }

      if (allOnes) {
        // Count how many 1s after indicator
        const onesCount = runData.lengths.length - i - 1;
        // Need at least 3 ones (R-G-R) for initial trigger
        if (onesCount >= 3) {
          indicatorIndex = i;
          break;
        }
      }
    }
  }

  if (indicatorIndex === -1) return null;

  // ZZ predicts OPPOSITE of current direction (alternation continues)
  const currentDir = runData.currentDirection;
  // Store the indicator direction (the direction of the ≥2 run)
  const indicatorDirection = runData.directions[indicatorIndex];

  return {
    pattern: 'ZZ',
    signalIndex: blockIndex,
    expectedDirection: (-currentDir) as Direction, // Opposite of current
    ts: new Date().toISOString(),
    indicatorDirection, // Save for persistence after break
  };
}

/**
 * Detect AntiZZ pattern:
 *
 * IMPORTANT: AntiZZ is ONLY activated via ZZStateManager when ZZ's first bet
 * is negative. It should NEVER be detected through normal pattern detection.
 *
 * See POCKET-SYSTEM-SPEC.md Section 5 (E.2):
 * "AntiZZ becomes CANDIDATE when ZZ's first bet is NEGATIVE"
 * "AntiZZ waits for NEXT indicator after becoming candidate"
 *
 * This function always returns null - AntiZZ activation is handled
 * exclusively by ZZStateManager.handleIndicator() and evaluateImaginaryFirstBet().
 */
function detectAntiZZ(_runData: RunData, _blockIndex: number): PatternSignal | null {
  // AntiZZ is ONLY activated via ZZStateManager when ZZ's first bet is negative.
  // It should NEVER be detected through normal pattern detection.
  // See POCKET-SYSTEM-SPEC.md Section 5.
  return null;
}

/**
 * Detect PP (Ping-Pong) pattern:
 * - Detects 1-2-1-2 rhythm (single-double-single-double)
 * - Requires PP to be active (70% confirmed on double flip back)
 * - Triggers: After double (L2 === 2), on single flip (L1 === 1)
 * - Predicts: Opposite (flip back to prior direction, start of next double)
 *
 * Key difference from ZZ:
 * - ZZ: 2+ indicator then 1-1-1-1 alternating singles
 * - PP: 1-2-1-2 rhythm (single-double repeating)
 *
 * Example:
 *   G R G G R G G R G G
 *   1 1 2   1 2   1 2
 *     ▲     ▲     ▲
 *     PP plays here (after double, on single, predict opposite)
 *
 * ACTIVATION (via lifecycle.confirmPPPattern):
 * - single → double (70% on 1st block of double) → ACTIVATE
 */
function detectPP(runData: RunData, blockIndex: number, _blocks?: { pct: number }[], isActive: boolean = false): PatternSignal | null {
  // PP only raises signals when already active
  if (!isActive) {
    return null;
  }

  // Need at least 2 runs
  if (runData.lengths.length < 2) return null;

  const L1 = runData.lengths[runData.lengths.length - 1]; // Current run
  const L2 = runData.lengths[runData.lengths.length - 2]; // Previous run
  const priorDir = runData.directions[runData.directions.length - 2]; // Direction to flip back to

  // PP signal: Previous was double (2), current is single (1)
  // This is the 1-2 rhythm - predict flip back (opposite of current)
  if (L2 === 2 && L1 === 1) {
    console.log(`[PP] Signal raised: double(2)->single(1) -> Predict flip back to ${priorDir > 0 ? "G" : "R"}`);
    return {
      pattern: 'PP',
      signalIndex: blockIndex,
      expectedDirection: priorDir, // Predict flip back (1st block of next double)
      ts: new Date().toISOString(),
    };
  }

  return null;
}

/**
 * Detect ST (Street) pattern:
 * - Requires: Indicator (≥3 same direction) followed by 2-2-2 rhythm
 * - Trigger: On the SECOND double after indicator (first double is 2A2 territory)
 * - Predicts: Opposite direction (switch to new double)
 *
 * Example: GGGGG RR GG RR [?]
 *          ├───┤ ├┤ ├┤ ├┤
 *          Ind   2  2  2  ← ST plays G (continue with new double)
 *                ↑
 *                First RR is 2A2 territory
 *
 * Note: First double (RR) after indicator is 2A2. ST activates on 2nd+ double.
 */
function detectST(runData: RunData, blockIndex: number, _blocks?: { pct: number }[], isActive: boolean = false): PatternSignal | null {
  // ST only raises signals when already active (like AP5)
  if (!isActive) {
    return null;
  }

  // Need at least 2 runs: previous (2) -> current flip (1)
  if (runData.lengths.length < 2) return null;

  const L1 = runData.lengths[runData.lengths.length - 1]; // Current run (flip)
  const L2 = runData.lengths[runData.lengths.length - 2]; // Previous run

  const currDir = runData.directions[runData.directions.length - 1];

  // ST signal: Previous run was 2 (double) and we just flipped (L1 === 1)
  // Note: 70% confirmation already happened at activation time
  if (L2 === 2 && L1 === 1) {
    console.log(`[ST] Signal raised: double (2) -> flip -> Play 2nd block (continuation)`);

    return {
      pattern: 'ST',
      signalIndex: blockIndex,
      expectedDirection: currDir, // Predict 2nd block continues same direction
      ts: new Date().toISOString(),
    };
  }

  return null;
}


// ============================================================================
// DETECTOR MAP
// ============================================================================

type DetectorFunction = (runData: RunData, blockIndex: number) => PatternSignal | null;

const DETECTORS: Record<PatternName, DetectorFunction> = {
  '2A2': detect2A2,
  'Anti2A2': detectAnti2A2,
  '3A3': detect3A3,
  'Anti3A3': detectAnti3A3,
  '4A4': detect4A4,
  'Anti4A4': detectAnti4A4,
  '5A5': detect5A5,
  'Anti5A5': detectAnti5A5,
  '6A6': detect6A6,
  'Anti6A6': detectAnti6A6,
  'AP5': detectAP5,
  'OZ': detectOZ,
  'ZZ': detectZZ,
  'AntiZZ': detectAntiZZ,
  'PP': detectPP,
  'ST': detectST,
};

// ============================================================================
// PATTERN DETECTOR CLASS
// ============================================================================

export class PatternDetector {
  private enabledPatterns: Set<PatternName>;

  constructor(enabledPatterns?: PatternName[]) {
    this.enabledPatterns = new Set(
      enabledPatterns ?? Object.keys(DETECTORS) as PatternName[]
    );
  }

  /**
   * Check if run data contains a new indicator (≥3 run) with the specified direction.
   * Used for ZZ/AntiZZ to resume after a break when waiting for indicator.
   */
  checkForIndicator(runData: RunData, targetDirection: Direction): boolean {
    // Check if the current run is ≥3 and matches the target direction
    if (runData.currentLength >= 3 && runData.currentDirection === targetDirection) {
      return true;
    }
    return false;
  }

  /**
   * Generate a ZZ signal based on saved indicator direction.
   * Used when ZZ is active+profitable and alternation has resumed after a break.
   *
   * Rules:
   * - Do NOT require a new ≥3 indicator
   * - Wait for alternation to resume (3+ consecutive runs of length 1)
   * - Once alternation is back, predict opposite of current direction
   */
  generateZZSignalFromIndicator(
    runData: RunData,
    blockIndex: number,
    savedIndicatorDirection: Direction,
    isAnti: boolean = false
  ): PatternSignal | null {
    // Current run must be length 1 (we're in alternation)
    if (runData.currentLength !== 1) {
      return null; // Not in alternation, don't play
    }

    // Check if we have at least 3 consecutive runs of length 1 (alternation resumed)
    // Scan backwards to count consecutive 1s
    let consecutiveOnes = 0;
    for (let i = runData.lengths.length - 1; i >= 0; i--) {
      if (runData.lengths[i] === 1) {
        consecutiveOnes++;
      } else {
        break; // Hit a non-1 run, stop counting
      }
    }

    // Need at least 3 consecutive 1s for alternation to be established
    if (consecutiveOnes < 3) {
      return null; // Not enough alternation yet
    }

    // Alternation is back! Predict opposite of current direction
    const currentDir = runData.currentDirection;

    // For ZZ: predict opposite (continue alternation)
    // For AntiZZ: predict same (break alternation)
    const expectedDirection = isAnti
      ? currentDir
      : ((-currentDir) as Direction);

    return {
      pattern: isAnti ? 'AntiZZ' : 'ZZ',
      signalIndex: blockIndex,
      expectedDirection,
      ts: new Date().toISOString(),
      indicatorDirection: savedIndicatorDirection,
    };
  }

  /**
   * Enable a specific pattern
   */
  enablePattern(pattern: PatternName): void {
    this.enabledPatterns.add(pattern);
  }

  /**
   * Disable a specific pattern
   */
  disablePattern(pattern: PatternName): void {
    this.enabledPatterns.delete(pattern);
  }

  /**
   * Check if a pattern is enabled
   */
  isEnabled(pattern: PatternName): boolean {
    return this.enabledPatterns.has(pattern);
  }

  /**
   * Get all enabled patterns
   */
  getEnabledPatterns(): PatternName[] {
    return Array.from(this.enabledPatterns);
  }

  /**
   * Detect all patterns that match current run data
   * Returns array of detected signals
   * @param blocks - Optional array of blocks for patterns that need percentage data (AP5)
   * @param activePatterns - Optional set of currently active patterns (for OZ threshold)
   */
  detectAll(runData: RunData, blockIndex: number, blocks?: { pct: number }[], activePatterns?: Set<PatternName>): PatternSignal[] {
    const signals: PatternSignal[] = [];

    for (const pattern of this.enabledPatterns) {
      // ZZ and AntiZZ signals are generated by ZZStateManager, not detector.
      // Skip them here to avoid conflicts with the pocket system.
      // See POCKET-SYSTEM-SPEC.md for the authoritative ZZ/AntiZZ rules.
      if (pattern === 'ZZ' || pattern === 'AntiZZ') {
        continue;
      }

      // Special handling for AP5 which only raises signals when active
      if (pattern === 'AP5') {
        const isActive = activePatterns?.has('AP5') ?? false;
        const signal = detectAP5(runData, blockIndex, blocks, isActive);
        if (signal) {
          signals.push(signal);
        }
        continue;
      }

      // Special handling for OZ which needs to know if it's active (for threshold)
      if (pattern === 'OZ') {
        const isActive = activePatterns?.has('OZ') ?? false;
        const signal = detectOZ(runData, blockIndex, isActive);
        if (signal) {
          signals.push(signal);
        }
        continue;
      }

      // Special handling for ST which only raises signals when active (like AP5)
      if (pattern === 'ST') {
        const isActive = activePatterns?.has('ST') ?? false;
        const signal = detectST(runData, blockIndex, blocks, isActive);
        if (signal) {
          signals.push(signal);
        }
        continue;
      }

      // Special handling for PP which only raises signals when active (like OZ)
      if (pattern === 'PP') {
        const isActive = activePatterns?.has('PP') ?? false;
        const signal = detectPP(runData, blockIndex, blocks, isActive);
        if (signal) {
          signals.push(signal);
        }
        continue;
      }

      const detector = DETECTORS[pattern];
      if (detector) {
        const signal = detector(runData, blockIndex);
        if (signal) {
          signals.push(signal);
        }
      }
    }

    return signals;
  }

  /**
   * Detect a specific pattern
   */
  detect(pattern: PatternName, runData: RunData, blockIndex: number): PatternSignal | null {
    if (!this.enabledPatterns.has(pattern)) return null;

    const detector = DETECTORS[pattern];
    return detector ? detector(runData, blockIndex) : null;
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createPatternDetector(enabledPatterns?: PatternName[]): PatternDetector {
  return new PatternDetector(enabledPatterns);
}
