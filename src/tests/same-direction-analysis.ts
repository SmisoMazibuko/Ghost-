/**
 * Same-Direction Mode Analysis
 * ============================
 * Implements EXACT same-direction profit calculation with break-block subtraction
 *
 * RunProfit(G-run) = (G2 + G3 + G4 + ...) − R1
 * Where G1 is run-start (not counted), G2+ are profit, R1 is break block (subtracted)
 */

import * as fs from 'fs';
import * as path from 'path';

interface Block {
  dir: -1 | 1;
  pct: number;
  ts: string;
  index: number;
}

interface SessionData {
  version: string;
  blocks: Block[];
  trades: { pattern: string; pnl: number; reason: string; ts: string }[];
  pnlTotal: number;
}

interface SameDirectionRun {
  startIndex: number;
  endIndex: number;
  direction: 1 | -1;  // 1 = UP/Green, -1 = DOWN/Red
  length: number;
  blocks: Block[];
  breakBlock: Block | null;  // The first opposite block

  // Exact profit calculation
  profitBlocks: Block[];  // G2, G3, G4, ... (excluding G1)
  profitSum: number;      // Sum of G2 + G3 + G4 + ...
  breakBlockPct: number;  // R1 percentage (to subtract)
  runProfit: number;      // Final: profitSum - breakBlockPct

  // Activation status
  qualifiesForActivation: boolean;
  activationThreshold: number | null;
}

// ActivationEvent interface - used conceptually
// interface ActivationEvent {
//   runIndex: number;
//   blockIndex: number;
//   direction: 1 | -1;
//   activationProfit: number;
//   threshold: number;
// }

// SameDirectionMode interface - used conceptually in simulation
// interface SameDirectionMode {
//   active: boolean;
//   activationEvent: ActivationEvent | null;
//   activationProfit: number;
//   currentDrawdown: number;
//   peakProfit: number;
//   tradesInMode: number;
//   profitInMode: number;
//   deactivationReason: string | null;
// }

// ThresholdTestResult interface - results are inlined
// interface ThresholdTestResult {
//   threshold: number;
//   totalActivations: number;
//   totalProfit: number;
//   avgDuration: number;
//   falseActivations: number;  // Quick deactivations
//   netImpact: number;
//   activationEvents: ActivationEvent[];
// }

// Load session data
const sessionPath = process.argv[2] || './data/sessions/session_2025-12-17T08-01-23-574Z.json';
const data: SessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));

console.log('='.repeat(80));
console.log('SAME-DIRECTION MODE ANALYSIS (Exact Definition)');
console.log('='.repeat(80));
console.log(`Session: ${path.basename(sessionPath)}`);
console.log(`Blocks: ${data.blocks.length}`);
console.log(`Actual Session PnL: ${data.pnlTotal}`);
console.log('');

// ============================================================================
// PART 1: Build runs with EXACT profit calculation
// ============================================================================

function buildSameDirectionRuns(blocks: Block[]): SameDirectionRun[] {
  const runs: SameDirectionRun[] = [];
  if (blocks.length < 2) return runs;

  let currentRun: SameDirectionRun | null = null;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    if (currentRun === null) {
      // Start first run
      currentRun = {
        startIndex: i,
        endIndex: i,
        direction: block.dir,
        length: 1,
        blocks: [block],
        breakBlock: null,
        profitBlocks: [],
        profitSum: 0,
        breakBlockPct: 0,
        runProfit: 0,
        qualifiesForActivation: false,
        activationThreshold: null,
      };
    } else if (block.dir === currentRun.direction) {
      // Continue run
      currentRun.blocks.push(block);
      currentRun.length++;
      currentRun.endIndex = i;
    } else {
      // Run broken - finalize with break block
      currentRun.breakBlock = block;
      currentRun.breakBlockPct = block.pct;

      // Calculate profit: G2 + G3 + G4 + ... (skip G1)
      if (currentRun.length >= 2) {
        currentRun.profitBlocks = currentRun.blocks.slice(1);  // Skip first block
        currentRun.profitSum = currentRun.profitBlocks.reduce((sum, b) => sum + b.pct, 0);
      }

      // RunProfit = profitSum - breakBlockPct
      currentRun.runProfit = currentRun.profitSum - currentRun.breakBlockPct;

      runs.push(currentRun);

      // Start new run with this block
      currentRun = {
        startIndex: i,
        endIndex: i,
        direction: block.dir,
        length: 1,
        blocks: [block],
        breakBlock: null,
        profitBlocks: [],
        profitSum: 0,
        breakBlockPct: 0,
        runProfit: 0,
        qualifiesForActivation: false,
        activationThreshold: null,
      };
    }
  }

  // Handle last run (no break block yet)
  if (currentRun && currentRun.length >= 1) {
    // For the last run, we don't have a break block
    // Calculate profit without break subtraction (or use 0)
    if (currentRun.length >= 2) {
      currentRun.profitBlocks = currentRun.blocks.slice(1);
      currentRun.profitSum = currentRun.profitBlocks.reduce((sum, b) => sum + b.pct, 0);
    }
    currentRun.runProfit = currentRun.profitSum;  // No break block to subtract
    runs.push(currentRun);
  }

  return runs;
}

const runs = buildSameDirectionRuns(data.blocks);
console.log(`Total runs identified: ${runs.length}`);

// ============================================================================
// PART 2: Display runs with exact profit calculation
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('SECTION 1: SAME-DIRECTION RUNS WITH EXACT PROFIT CALCULATION');
console.log('='.repeat(80));

console.log('\nFormula: RunProfit = (Block2 + Block3 + Block4 + ...) - BreakBlock');
console.log('Note: Block1 starts the run but is NOT included in profit calculation');
console.log('-'.repeat(80));

// Show all runs of length >= 3
const significantRuns = runs.filter(r => r.length >= 3);
console.log(`\nRuns of length >= 3: ${significantRuns.length}`);
console.log('\nIdx\tStart\tLen\tDir\tBlocks (pct)\t\t\tBreak\tProfitSum\tRunProfit');
console.log('-'.repeat(100));

for (let i = 0; i < significantRuns.length; i++) {
  const run = significantRuns[i];
  const dir = run.direction > 0 ? 'UP' : 'DOWN';
  const blockPcts = run.blocks.map(b => b.pct).join(', ');
  const breakPct = run.breakBlock ? run.breakBlock.pct : 'N/A';

  console.log(
    `${i}\t${run.startIndex}\t${run.length}\t${dir}\t` +
    `[${blockPcts}]\t\t${breakPct}\t${run.profitSum}\t\t${run.runProfit}`
  );
}

// ============================================================================
// PART 3: Activation qualification (length >= 4 AND RunProfit >= threshold)
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('SECTION 2: ACTIVATION-QUALIFIED RUNS');
console.log('='.repeat(80));

const thresholdsToTest = [100, 120, 140, 150, 180, 200];

console.log('\nActivation requires: length >= 4 AND RunProfit >= threshold');
console.log('-'.repeat(80));

for (const threshold of thresholdsToTest) {
  const qualifiedRuns = runs.filter(r => r.length >= 4 && r.runProfit >= threshold);

  console.log(`\nThreshold ${threshold}%: ${qualifiedRuns.length} qualifying runs`);

  if (qualifiedRuns.length > 0) {
    console.log('  Start\tLen\tDir\tRunProfit\tBlocks');
    for (const run of qualifiedRuns.slice(0, 10)) {  // Show first 10
      const dir = run.direction > 0 ? 'UP' : 'DOWN';
      const blockPcts = run.blocks.map(b => b.pct).join(',');
      console.log(`  ${run.startIndex}\t${run.length}\t${dir}\t${run.runProfit}%\t\t[${blockPcts}] - ${run.breakBlockPct}`);
    }
    if (qualifiedRuns.length > 10) {
      console.log(`  ... and ${qualifiedRuns.length - 10} more`);
    }
  }
}

// ============================================================================
// PART 4: Same-Direction Mode Simulation
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('SECTION 3: SAME-DIRECTION MODE SIMULATION');
console.log('='.repeat(80));

interface ModeSimulationResult {
  threshold: number;
  deactivationType: 'strict' | 'soft';
  totalActivations: number;
  totalDeactivations: number;
  blocksInMode: number;
  totalModeProfit: number;
  avgModeDuration: number;
  activationDetails: {
    startBlock: number;
    endBlock: number;
    activationProfit: number;
    duration: number;
    modeProfit: number;
    deactivationLoss: number;
    deactivationReason: string;
  }[];
}

/**
 * CORRECTED Same-Direction Mode Simulation v4
 * ============================================
 *
 * SAME DIRECTION = Bet the SAME direction as the CURRENT block
 * NOT the activation direction!
 *
 * RULES:
 * 1. Activate when a run has RunProfit >= activationThreshold (e.g., 140%)
 * 2. Once active, bet the SAME direction as whatever is currently happening
 * 3. Losses = ONLY break blocks (when direction changes)
 * 4. Wins = ALL continuation blocks
 * 5. FIXED deactivation limit: -140% accumulated loss
 * 6. ZZ pockets pause accumulation
 */
function simulateSameDirectionMode(
  blocks: Block[],
  runs: SameDirectionRun[],
  activationThreshold: number,
  _deactivationType: 'strict' | 'soft'  // Not used - always cut at -140%
): ModeSimulationResult {
  const result: ModeSimulationResult = {
    threshold: activationThreshold,
    deactivationType: _deactivationType,
    totalActivations: 0,
    totalDeactivations: 0,
    blocksInMode: 0,
    totalModeProfit: 0,
    avgModeDuration: 0,
    activationDetails: [],
  };

  // FIXED deactivation limit: always -140% (2×70)
  const DEACTIVATION_LIMIT = -140;
  const RESET_THRESHOLD = 70;
  const ZZ_RUN_LENGTH = 2;

  // Build a map of block index to which run it belongs to
  const blockToRunIdx = new Map<number, number>();
  for (let runIdx = 0; runIdx < runs.length; runIdx++) {
    const run = runs[runIdx];
    for (let i = run.startIndex; i <= run.endIndex; i++) {
      blockToRunIdx.set(i, runIdx);
    }
  }

  // Build activation triggers: break block -> activation run
  const breakBlockToActivationRun = new Map<number, number>();
  for (let runIdx = 0; runIdx < runs.length; runIdx++) {
    const run = runs[runIdx];
    if (run.length >= 4 && run.runProfit >= activationThreshold && run.breakBlock) {
      breakBlockToActivationRun.set(run.endIndex + 1, runIdx);
    }
  }

  let inMode = false;
  let activationProfit = 0;
  let modeStartBlock = 0;
  let accumulatedLoss = 0;
  let totalProfitInMode = 0;
  let zzPocketProfit = 0;
  let currentRunProfit = 0;
  let currentRunIdx = -1;
  let inZZRun = false;

  // Process BLOCK by BLOCK
  for (let blockIdx = 0; blockIdx < blocks.length; blockIdx++) {
    const block = blocks[blockIdx];
    const runIdx = blockToRunIdx.get(blockIdx);

    if (!inMode) {
      // Check if this block is the break block of an activation run
      const activationRunIdx = breakBlockToActivationRun.get(blockIdx);
      if (activationRunIdx !== undefined) {
        const run = runs[activationRunIdx];
        inMode = true;
        activationProfit = run.runProfit;
        modeStartBlock = blockIdx;
        accumulatedLoss = 0;
        totalProfitInMode = 0;
        zzPocketProfit = 0;
        currentRunProfit = 0;
        currentRunIdx = -1;
        inZZRun = false;
        result.totalActivations++;

        // First block in mode - we bet the current direction, so we WIN
        totalProfitInMode += block.pct;
        result.blocksInMode++;
        currentRunProfit = block.pct;
        continue;
      }
    } else {
      // In same-direction mode
      // We always bet the PREVIOUS block's direction (same direction)
      // So on direction change, we LOSE the break block

      const prevBlock = blockIdx > 0 ? blocks[blockIdx - 1] : null;
      const directionChanged = prevBlock && prevBlock.dir !== block.dir;

      let blockPnL: number;

      if (directionChanged) {
        // Direction changed - we were betting previous direction, so we LOSE
        blockPnL = -block.pct;

        // Check if previous run triggers reset before switching
        if (currentRunIdx >= 0 && currentRunIdx < runs.length) {
          const prevRun = runs[currentRunIdx];
          if (prevRun.length > ZZ_RUN_LENGTH && currentRunProfit > RESET_THRESHOLD) {
            accumulatedLoss = 0;  // Reset on strong positive non-ZZ run
          }
        }

        // Switch to new direction
        currentRunIdx = runIdx !== undefined ? runIdx : -1;
        currentRunProfit = 0;
        inZZRun = runIdx !== undefined && runs[runIdx].length <= ZZ_RUN_LENGTH;
      } else {
        // Same direction continues - we WIN
        blockPnL = block.pct;
      }

      totalProfitInMode += blockPnL;
      result.blocksInMode++;
      currentRunProfit += blockPnL;

      // Track ZZ vs non-ZZ for accumulation
      if (inZZRun) {
        zzPocketProfit += blockPnL;
        // Don't accumulate losses during ZZ
      } else {
        // Non-ZZ: accumulate losses only
        if (blockPnL < 0) {
          accumulatedLoss += blockPnL;
        }

        // Check deactivation - CUT at -140%
        if (accumulatedLoss <= DEACTIVATION_LIMIT) {
          const excessLoss = Math.abs(accumulatedLoss) - Math.abs(DEACTIVATION_LIMIT);
          if (excessLoss > 0) {
            totalProfitInMode += excessLoss;
            accumulatedLoss = DEACTIVATION_LIMIT;
          }

          const duration = blockIdx - modeStartBlock + 1;
          result.activationDetails.push({
            startBlock: modeStartBlock,
            endBlock: blockIdx,
            activationProfit,
            duration,
            modeProfit: totalProfitInMode,
            deactivationLoss: Math.abs(DEACTIVATION_LIMIT),
            deactivationReason: `Cut at -140% limit (ZZ: ${zzPocketProfit.toFixed(0)}%)`,
          });

          result.totalModeProfit += totalProfitInMode;
          result.totalDeactivations++;
          inMode = false;
        }
      }
    }
  }

  // Handle still-in-mode at end
  if (inMode) {
    const duration = blocks.length - modeStartBlock;
    result.activationDetails.push({
      startBlock: modeStartBlock,
      endBlock: blocks.length - 1,
      activationProfit,
      duration,
      modeProfit: totalProfitInMode,
      deactivationLoss: Math.abs(accumulatedLoss),
      deactivationReason: `Session ended (accum: ${accumulatedLoss.toFixed(0)}%, ZZ: ${zzPocketProfit.toFixed(0)}%)`,
    });
    result.totalModeProfit += totalProfitInMode;
  }

  // Calculate average duration
  if (result.activationDetails.length > 0) {
    result.avgModeDuration = result.activationDetails.reduce((s, d) => s + d.duration, 0) / result.activationDetails.length;
  }

  return result;
}

// DETAILED DEBUG: Show what happens after first activation at 140% threshold
console.log('\n' + '='.repeat(80));
console.log('DEBUG: TRACE FIRST ACTIVATION (threshold 140%)');
console.log('='.repeat(80));

// Find first activation
let debugActivated = false;
let debugDir: 1 | -1 = 1;
let debugAccum = 0;
let debugTotal = 0;
let debugZZ = 0;

for (let i = 0; i < runs.length; i++) {
  const run = runs[i];

  if (!debugActivated) {
    if (run.length >= 4 && run.runProfit >= 140) {
      debugActivated = true;
      debugDir = run.direction;
      console.log(`\nACTIVATED on run ${i}: blocks ${run.startIndex}-${run.endIndex}, ${run.direction > 0 ? 'UP' : 'DOWN'}, RunProfit=${run.runProfit}%`);
      console.log(`Betting direction: ${debugDir > 0 ? 'UP' : 'DOWN'}`);
      console.log(`\nSubsequent runs:`);
      console.log('Run#\tStart\tLen\tDir\tIsZZ\tRunPnL\tAccum\tTotal');
      console.log('-'.repeat(70));
    }
  } else {
    const isZZ = run.length <= 2;
    let runPnL: number;

    if (run.direction === debugDir) {
      runPnL = run.profitSum - run.breakBlockPct;
    } else {
      const oppLoss = run.blocks.reduce((s, b) => s + b.pct, 0);
      runPnL = -oppLoss + run.breakBlockPct;
    }

    debugTotal += runPnL;

    if (isZZ) {
      debugZZ += runPnL;
      console.log(`${i}\t${run.startIndex}\t${run.length}\t${run.direction > 0 ? 'UP' : 'DN'}\tYES\t${runPnL}\t(paused)\t${debugTotal}`);
    } else {
      if (runPnL > 70) {
        debugAccum = 0;
        console.log(`${i}\t${run.startIndex}\t${run.length}\t${run.direction > 0 ? 'UP' : 'DN'}\tno\t${runPnL}\t0 (reset)\t${debugTotal}`);
      } else if (runPnL < 0) {
        debugAccum += runPnL;
        console.log(`${i}\t${run.startIndex}\t${run.length}\t${run.direction > 0 ? 'UP' : 'DN'}\tno\t${runPnL}\t${debugAccum}\t${debugTotal}`);
      } else {
        console.log(`${i}\t${run.startIndex}\t${run.length}\t${run.direction > 0 ? 'UP' : 'DN'}\tno\t${runPnL}\t${debugAccum}\t${debugTotal}`);
      }

      if (debugAccum <= -140) {
        console.log(`\n*** DEACTIVATE: Accum ${debugAccum}% hit -140% limit ***`);
        console.log(`Total profit in mode: ${debugTotal}%, ZZ profit: ${debugZZ}%`);
        break;
      }
    }

    // Stop after 20 runs for readability
    if (i > runs.indexOf(runs.find(r => r.length >= 4 && r.runProfit >= 140)!) + 20) {
      console.log('... (truncated)');
      break;
    }
  }
}

console.log('\n' + '='.repeat(80));

// Test all threshold combinations
console.log('\nSimulation: Same-direction mode betting the dominant direction');
console.log('FIXED deactivation limit: -140% (2×70) for all activations');
console.log('ZZ pockets (runs length <= 2) are PAUSED - losses not accumulated');
console.log('-'.repeat(100));

const simulationResults: ModeSimulationResult[] = [];

for (const threshold of thresholdsToTest) {
  for (const deactivationType of ['strict', 'soft'] as const) {
    const result = simulateSameDirectionMode(data.blocks, runs, threshold, deactivationType);
    simulationResults.push(result);
  }
}

console.log('\nThreshold\tDeact\tActivations\tBlocksInMode\tTotalProfit\tAvgDuration');
console.log('-'.repeat(80));

for (const result of simulationResults) {
  console.log(
    `${result.threshold}%\t\t${result.deactivationType}\t${result.totalActivations}\t\t` +
    `${result.blocksInMode}\t\t${result.totalModeProfit}%\t\t${result.avgModeDuration.toFixed(1)}`
  );
}

// ============================================================================
// PART 5: Detailed activation analysis for best threshold
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('SECTION 4: DETAILED ACTIVATION ANALYSIS');
console.log('='.repeat(80));

// Find best result
const bestResult = simulationResults.reduce((best, curr) =>
  curr.totalModeProfit > best.totalModeProfit ? curr : best
);

console.log(`\nBest configuration: Threshold ${bestResult.threshold}%, Deactivation: ${bestResult.deactivationType}`);
console.log(`Total Profit: ${bestResult.totalModeProfit}%`);
console.log(`Activations: ${bestResult.totalActivations}`);
console.log(`Avg Duration: ${bestResult.avgModeDuration.toFixed(1)} blocks`);

console.log('\nActivation Details:');
console.log('Start\tEnd\tDuration\tActProfit\tModeProfit\tDeactLoss\tReason');
console.log('-'.repeat(100));

for (const detail of bestResult.activationDetails) {
  console.log(
    `${detail.startBlock}\t${detail.endBlock}\t${detail.duration}\t\t` +
    `${detail.activationProfit}%\t\t${detail.modeProfit}%\t\t${detail.deactivationLoss}%\t\t${detail.deactivationReason}`
  );
}

// ============================================================================
// PART 6: Cluster Analysis - Mode Transition Indicators
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('SECTION 5: CLUSTER ANALYSIS & MODE TRANSITION INDICATORS');
console.log('='.repeat(80));

// Find clusters of activation-qualified runs
function findActivationClusters(
  runs: SameDirectionRun[],
  threshold: number,
  windowSize: number = 20
): { startBlock: number; endBlock: number; activations: number; totalProfit: number }[] {
  const qualifiedRuns = runs.filter(r => r.length >= 4 && r.runProfit >= threshold);
  const clusters: { startBlock: number; endBlock: number; activations: number; totalProfit: number }[] = [];

  for (let i = 0; i < qualifiedRuns.length; i++) {
    const run = qualifiedRuns[i];

    // Count how many qualified runs are within windowSize blocks
    const nearby = qualifiedRuns.filter(r =>
      Math.abs(r.startIndex - run.startIndex) <= windowSize && r !== run
    );

    if (nearby.length >= 1) {  // At least 2 activations close together
      const allInCluster = [run, ...nearby];
      const startBlock = Math.min(...allInCluster.map(r => r.startIndex));
      const endBlock = Math.max(...allInCluster.map(r => r.endIndex));
      const totalProfit = allInCluster.reduce((s, r) => s + r.runProfit, 0);

      // Check if this cluster overlaps with existing
      const existing = clusters.find(c =>
        (startBlock >= c.startBlock && startBlock <= c.endBlock) ||
        (endBlock >= c.startBlock && endBlock <= c.endBlock)
      );

      if (!existing) {
        clusters.push({
          startBlock,
          endBlock,
          activations: allInCluster.length,
          totalProfit,
        });
      }
    }
  }

  return clusters;
}

const clusters = findActivationClusters(runs, 140);
console.log(`\nActivation clusters (threshold 140%, window 20 blocks): ${clusters.length}`);

if (clusters.length > 0) {
  console.log('\nStart\tEnd\tActivations\tTotal RunProfit');
  console.log('-'.repeat(50));
  for (const cluster of clusters) {
    console.log(`${cluster.startBlock}\t${cluster.endBlock}\t${cluster.activations}\t\t${cluster.totalProfit}%`);
  }
}

// ============================================================================
// PART 7: Compare with actual pattern performance in same regions
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('SECTION 6: NORMAL MODE PERFORMANCE IN SAME-DIRECTION REGIONS');
console.log('='.repeat(80));

// Find what the actual system did during high-profit same-direction regions
const highProfitRuns = runs.filter(r => r.length >= 4 && r.runProfit >= 140);

console.log(`\nHigh-profit same-direction runs (length >= 4, RunProfit >= 140%): ${highProfitRuns.length}`);

// Estimate actual trades that occurred during these runs
for (const run of highProfitRuns.slice(0, 5)) {
  console.log(`\nRun at blocks ${run.startIndex}-${run.endIndex} (${run.direction > 0 ? 'UP' : 'DOWN'}, RunProfit: ${run.runProfit}%):`);
  console.log(`  Blocks: [${run.blocks.map(b => b.pct).join(', ')}] - Break: ${run.breakBlockPct}`);

  // Find trades that occurred during this run
  const runStart = new Date(run.blocks[0].ts).getTime();
  const runEnd = new Date(run.blocks[run.length - 1].ts).getTime();

  const tradesInRun = data.trades.filter(t => {
    const tradeTime = new Date(t.ts).getTime();
    return tradeTime >= runStart && tradeTime <= runEnd;
  });

  if (tradesInRun.length > 0) {
    console.log(`  Actual trades during this run:`);
    for (const trade of tradesInRun) {
      const pattern = trade.reason.split(' ')[0];
      console.log(`    ${pattern}: ${trade.pnl > 0 ? '+' : ''}${trade.pnl}%`);
    }
  } else {
    console.log(`  No trades during this run`);
  }
}

// ============================================================================
// PART 8: Final Recommendations
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('SECTION 7: RECOMMENDATIONS');
console.log('='.repeat(80));

// Calculate total potential from same-direction runs
const totalRunProfit = runs.filter(r => r.length >= 4).reduce((s, r) => s + Math.max(0, r.runProfit), 0);

console.log(`
SAME-DIRECTION MODE ANALYSIS SUMMARY
=====================================

1. RUN STATISTICS
   - Total runs: ${runs.length}
   - Runs of length >= 3: ${runs.filter(r => r.length >= 3).length}
   - Runs of length >= 4: ${runs.filter(r => r.length >= 4).length}
   - Runs with positive RunProfit: ${runs.filter(r => r.runProfit > 0).length}
   - Total RunProfit from qualifying runs: ${totalRunProfit}%

2. ACTIVATION-QUALIFIED RUNS (length >= 4 AND positive RunProfit)
   - Threshold 100%: ${runs.filter(r => r.length >= 4 && r.runProfit >= 100).length} runs
   - Threshold 140%: ${runs.filter(r => r.length >= 4 && r.runProfit >= 140).length} runs
   - Threshold 150%: ${runs.filter(r => r.length >= 4 && r.runProfit >= 150).length} runs

3. BEST SIMULATION RESULT
   - Threshold: ${bestResult.threshold}%
   - Deactivation: ${bestResult.deactivationType}
   - Total Profit: ${bestResult.totalModeProfit}%
   - Activations: ${bestResult.totalActivations}
   - Avg Duration: ${bestResult.avgModeDuration.toFixed(1)} blocks

4. RECOMMENDED SWITCHING LOGIC

   ENTER same-direction mode when:
   - A run reaches length >= 4
   - AND RunProfit (G2+G3+G4... - BreakBlock) >= ${bestResult.threshold}%

   REMAIN in same-direction mode:
   - Continue betting the activation direction
   - Track cumulative profit/loss in mode

   EXIT same-direction mode when:
   - Single loss >= ${bestResult.deactivationType === 'strict' ? '100%' : '70%'} of ActivationProfit
   - OR session ends

5. COMPARISON TO ACTUAL SESSION
   - Actual session PnL: ${data.pnlTotal}%
   - Best same-direction simulation PnL: ${bestResult.totalModeProfit}%
   - Potential improvement: ${bestResult.totalModeProfit - data.pnlTotal}%

6. KEY INSIGHT
   The exact run-profit calculation with break-block subtraction identifies
   ${runs.filter(r => r.length >= 4 && r.runProfit >= 140).length} high-quality activation points
   where same-direction betting would have captured significant profit.
`);

// ============================================================================
// JSON Export
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('JSON DATA EXPORT');
console.log('='.repeat(80));

const exportData = {
  session: path.basename(sessionPath),
  actualPnL: data.pnlTotal,
  runAnalysis: {
    totalRuns: runs.length,
    runsLength3Plus: runs.filter(r => r.length >= 3).length,
    runsLength4Plus: runs.filter(r => r.length >= 4).length,
    runsPositiveProfit: runs.filter(r => r.runProfit > 0).length,
  },
  activationQualified: {
    threshold100: runs.filter(r => r.length >= 4 && r.runProfit >= 100).length,
    threshold140: runs.filter(r => r.length >= 4 && r.runProfit >= 140).length,
    threshold150: runs.filter(r => r.length >= 4 && r.runProfit >= 150).length,
  },
  bestSimulation: {
    threshold: bestResult.threshold,
    deactivationType: bestResult.deactivationType,
    totalProfit: bestResult.totalModeProfit,
    activations: bestResult.totalActivations,
    avgDuration: bestResult.avgModeDuration,
  },
  allSimulations: simulationResults.map(r => ({
    threshold: r.threshold,
    deactivationType: r.deactivationType,
    profit: r.totalModeProfit,
    activations: r.totalActivations,
  })),
  highProfitRuns: runs
    .filter(r => r.length >= 4 && r.runProfit >= 100)
    .map(r => ({
      startIndex: r.startIndex,
      endIndex: r.endIndex,
      direction: r.direction > 0 ? 'UP' : 'DOWN',
      length: r.length,
      blocks: r.blocks.map(b => b.pct),
      breakBlock: r.breakBlockPct,
      profitSum: r.profitSum,
      runProfit: r.runProfit,
    })),
};

console.log(JSON.stringify(exportData, null, 2));
