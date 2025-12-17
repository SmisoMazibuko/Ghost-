/**
 * Forensic Analysis Script
 * ========================
 * Analyzes session data for ZZ/AntiZZ suppression and same-direction patterns
 */

import * as fs from 'fs';
import * as path from 'path';

interface Block {
  dir: -1 | 1;
  pct: number;
  ts: string;
  index: number;
}

interface Trade {
  pattern: string;
  direction: -1 | 1;
  pnl: number;
  reason: string;
  ts: string;
  blockIndex?: number;
}

interface Result {
  pattern: string;
  profit: number;
  verdict: string;
  expectedDirection: -1 | 1;
  actualDirection: -1 | 1;
  evalIndex: number;
  wasBet: boolean;
}

interface SessionData {
  version: string;
  blocks: Block[];
  results: Result[];
  trades: Trade[];
  pnlTotal: number;
  runData: {
    lengths: number[];
    directions: (-1 | 1)[];
    currentLength: number;
    currentDirection: -1 | 1;
  };
}

// SuppressedSignal interface for documentation
// interface SuppressedSignal {
//   blockIndex: number;
//   type: 'ZZ' | 'AntiZZ';
//   suppressionReason: string;
//   expectedDirection: -1 | 1;
//   actualDirection: -1 | 1;
//   actualPct: number;
//   wouldHaveWon: boolean;
//   hypotheticalPnl: number;
// }

// SameDirectionRun interface - used for documentation
// interface SameDirectionRun {
//   startIndex: number;
//   endIndex: number;
//   direction: -1 | 1;
//   length: number;
//   blocks: Block[];
//   cumulativeProfit: number;
//   avgPct: number;
//   activePatterns: Map<string, number>;
//   antiPatternDensity: number;
//   ap5Density: number;
//   xaxDensity: number;
//   zzSignalCount: number;
// }

// Load session data
const sessionPath = process.argv[2] || './data/sessions/session_2025-12-17T08-01-23-574Z.json';
const data: SessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));

console.log('='.repeat(80));
console.log('FORENSIC ANALYSIS REPORT');
console.log('='.repeat(80));
console.log(`Session: ${path.basename(sessionPath)}`);
console.log(`Blocks: ${data.blocks.length}`);
console.log(`Trades: ${data.trades.length}`);
console.log(`PnL Total: ${data.pnlTotal}`);
console.log('');

// ============================================================================
// PART 1: Build run segments from blocks
// ============================================================================

interface RunSegment {
  startIndex: number;
  endIndex: number;
  direction: -1 | 1;
  blocks: Block[];
  length: number;
}

function buildRunSegments(blocks: Block[]): RunSegment[] {
  const runs: RunSegment[] = [];
  if (blocks.length === 0) return runs;

  let currentRun: RunSegment = {
    startIndex: 0,
    endIndex: 0,
    direction: blocks[0].dir,
    blocks: [blocks[0]],
    length: 1,
  };

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.dir === currentRun.direction) {
      currentRun.blocks.push(block);
      currentRun.length++;
      currentRun.endIndex = i;
    } else {
      runs.push(currentRun);
      currentRun = {
        startIndex: i,
        endIndex: i,
        direction: block.dir,
        blocks: [block],
        length: 1,
      };
    }
  }
  runs.push(currentRun);

  return runs;
}

const runs = buildRunSegments(data.blocks);
console.log(`Total runs identified: ${runs.length}`);

// ============================================================================
// PART 2: Identify ZZ indicator positions (runs of 3+)
// ============================================================================

interface ZZIndicator {
  runIndex: number;
  startBlock: number;
  endBlock: number;
  direction: -1 | 1;
  length: number;
  indicatorPct: number; // pct of the 3rd block
}

function identifyZZIndicators(runs: RunSegment[]): ZZIndicator[] {
  const indicators: ZZIndicator[] = [];

  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    if (run.length >= 3) {
      // 3rd block is at index 2 within the run
      const thirdBlock = run.blocks[2];
      indicators.push({
        runIndex: i,
        startBlock: run.startIndex,
        endBlock: run.endIndex,
        direction: run.direction,
        length: run.length,
        indicatorPct: thirdBlock.pct,
      });
    }
  }

  return indicators;
}

const zzIndicators = identifyZZIndicators(runs);
console.log(`ZZ indicators found (runs >= 3): ${zzIndicators.length}`);

// ============================================================================
// PART 3: Map trades to blocks for suppression analysis
// ============================================================================

// Note: Trade-to-block mapping would require additional data parsing
// For this analysis, we use timestamp-based approximation

// Map results to understand what was evaluated
const resultsByBlock = new Map<number, Result[]>();
for (const result of data.results) {
  if (!resultsByBlock.has(result.evalIndex)) {
    resultsByBlock.set(result.evalIndex, []);
  }
  resultsByBlock.get(result.evalIndex)!.push(result);
}

// ============================================================================
// PART 4: Identify suppressed ZZ/AntiZZ signals
// ============================================================================

// Find all blocks where ZZ/AntiZZ could have signaled but didn't trade
// A ZZ signal would be: after a 3+ run, predicting continuation (opposite dir)
// An AntiZZ signal would be: after a 3+ run, predicting same direction

// Track ZZ/AntiZZ traded blocks
const zzTradedBlocks = new Set<number>();
const antiZZTradedBlocks = new Set<number>();

// First, identify all blocks where ZZ/AntiZZ actually traded
for (const trade of data.trades) {
  const patternMatch = trade.reason.match(/^\[?(ZZ|Anti-ZZ|AntiZZ)\]?/);
  if (patternMatch) {
    // Estimate block index from timestamp ordering
    const tradeTime = new Date(trade.ts).getTime();
    for (let i = 0; i < data.blocks.length; i++) {
      const blockTime = new Date(data.blocks[i].ts).getTime();
      if (Math.abs(blockTime - tradeTime) < 1000) { // Within 1 second
        if (patternMatch[1] === 'ZZ') {
          zzTradedBlocks.add(i);
        } else {
          antiZZTradedBlocks.add(i);
        }
        break;
      }
    }
  }
}

console.log(`\nZZ trades found: ${zzTradedBlocks.size}`);
console.log(`AntiZZ trades found: ${antiZZTradedBlocks.size}`);

// ============================================================================
// PART 5: Same-direction regime analysis
// ============================================================================

interface SameDirectionRegime {
  startIndex: number;
  endIndex: number;
  direction: -1 | 1;
  totalBlocks: number;
  runLengths: number[];
  hypotheticalProfit: number;
  avgPct: number;
  maxRunLength: number;
  antiPatternTrades: number;
  ap5Trades: number;
  xaxTrades: number;
}

function analyzeSameDirectionRegimes(
  blocks: Block[],
  runs: RunSegment[],
  windowSize: number = 10
): SameDirectionRegime[] {
  const regimes: SameDirectionRegime[] = [];

  // Sliding window analysis
  for (let i = 0; i < blocks.length - windowSize; i++) {
    const window = blocks.slice(i, i + windowSize);

    // Count direction dominance
    const upCount = window.filter(b => b.dir === 1).length;
    const downCount = window.filter(b => b.dir === -1).length;
    const dominantDir = upCount > downCount ? 1 : -1;
    const dominance = Math.max(upCount, downCount) / windowSize;

    // If 70%+ same direction, it's a regime
    if (dominance >= 0.7) {
      // Calculate hypothetical profit betting same direction
      let hypotheticalProfit = 0;
      for (const b of window) {
        if (b.dir === dominantDir) {
          hypotheticalProfit += b.pct;
        } else {
          hypotheticalProfit -= b.pct;
        }
      }

      // Find or extend existing regime
      const lastRegime = regimes[regimes.length - 1];
      if (lastRegime && lastRegime.endIndex >= i - 1 && lastRegime.direction === dominantDir) {
        // Extend
        lastRegime.endIndex = i + windowSize - 1;
        lastRegime.totalBlocks = lastRegime.endIndex - lastRegime.startIndex + 1;
      } else {
        // New regime
        regimes.push({
          startIndex: i,
          endIndex: i + windowSize - 1,
          direction: dominantDir as -1 | 1,
          totalBlocks: windowSize,
          runLengths: [],
          hypotheticalProfit,
          avgPct: window.reduce((s, b) => s + b.pct, 0) / windowSize,
          maxRunLength: 0,
          antiPatternTrades: 0,
          ap5Trades: 0,
          xaxTrades: 0,
        });
      }
    }
  }

  // Calculate detailed stats for each regime
  for (const regime of regimes) {
    const regimeBlocks = blocks.slice(regime.startIndex, regime.endIndex + 1);

    // Recalculate hypothetical profit
    regime.hypotheticalProfit = 0;
    for (const b of regimeBlocks) {
      if (b.dir === regime.direction) {
        regime.hypotheticalProfit += b.pct;
      } else {
        regime.hypotheticalProfit -= b.pct;
      }
    }

    // Find run lengths within regime
    const regimeRuns = runs.filter(r =>
      r.startIndex >= regime.startIndex && r.endIndex <= regime.endIndex
    );
    regime.runLengths = regimeRuns.map(r => r.length);
    regime.maxRunLength = Math.max(...regime.runLengths, 0);

    // Count pattern trades within regime
    for (const trade of data.trades) {
      const pattern = trade.reason.split(' ')[0].replace(/[\[\]]/g, '');
      // Estimate block index
      const tradeTime = new Date(trade.ts).getTime();
      let tradeBlock = -1;
      for (let i = 0; i < data.blocks.length; i++) {
        const blockTime = new Date(data.blocks[i].ts).getTime();
        if (Math.abs(blockTime - tradeTime) < 1000) {
          tradeBlock = i;
          break;
        }
      }

      if (tradeBlock >= regime.startIndex && tradeBlock <= regime.endIndex) {
        if (pattern.startsWith('Anti')) {
          regime.antiPatternTrades++;
        }
        if (pattern === 'AP5' || pattern === 'OZ') {
          regime.ap5Trades++;
        }
        if (['2A2', '3A3', '4A4', '5A5'].includes(pattern)) {
          regime.xaxTrades++;
        }
      }
    }
  }

  return regimes;
}

const sameDirectionRegimes = analyzeSameDirectionRegimes(data.blocks, runs);
console.log(`\nSame-direction regimes found: ${sameDirectionRegimes.length}`);

// ============================================================================
// PART 6: Pattern performance during regimes
// ============================================================================

// Group trades by pattern
const patternStats = new Map<string, { trades: number; pnl: number; wins: number }>();
for (const trade of data.trades) {
  const pattern = trade.reason.split(' ')[0].replace(/[\[\]]/g, '');
  if (!patternStats.has(pattern)) {
    patternStats.set(pattern, { trades: 0, pnl: 0, wins: 0 });
  }
  const stats = patternStats.get(pattern)!;
  stats.trades++;
  stats.pnl += trade.pnl;
  if (trade.pnl > 0) stats.wins++;
}

// ============================================================================
// OUTPUT REPORTS
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('SECTION 1: ZZ/ANTI-ZZ ANALYSIS');
console.log('='.repeat(80));

// ZZ indicators summary
console.log('\nZZ Indicators (runs >= 3):');
console.log('-'.repeat(60));
let totalZZOpportunities = 0;
let zzWouldWin = 0;
let zzWouldLose = 0;
let zzHypotheticalPnl = 0;

for (const indicator of zzIndicators) {
  // Check the block AFTER this indicator run ends
  const nextBlockIndex = indicator.endBlock + 1;
  if (nextBlockIndex < data.blocks.length) {
    const nextBlock = data.blocks[nextBlockIndex];
    const zzExpectedDir = (indicator.direction * -1); // ZZ predicts alternation
    const wouldWin = nextBlock.dir === zzExpectedDir;

    totalZZOpportunities++;
    if (wouldWin) {
      zzWouldWin++;
      zzHypotheticalPnl += nextBlock.pct;
    } else {
      zzWouldLose++;
      zzHypotheticalPnl -= nextBlock.pct;
    }
  }
}

console.log(`Total ZZ signal opportunities: ${totalZZOpportunities}`);
console.log(`ZZ would win: ${zzWouldWin} (${(zzWouldWin/totalZZOpportunities*100).toFixed(1)}%)`);
console.log(`ZZ would lose: ${zzWouldLose} (${(zzWouldLose/totalZZOpportunities*100).toFixed(1)}%)`);
console.log(`ZZ hypothetical total P&L: ${zzHypotheticalPnl.toFixed(0)}%`);

// Actual ZZ trades
const zzTrades = data.trades.filter(t => t.reason.includes('[ZZ]') || t.reason.startsWith('ZZ'));
const antiZZTrades = data.trades.filter(t => t.reason.includes('[Anti-ZZ]') || t.reason.startsWith('Anti-ZZ') || t.reason.startsWith('AntiZZ'));

console.log(`\nActual ZZ trades: ${zzTrades.length}`);
console.log(`Actual ZZ P&L: ${zzTrades.reduce((s, t) => s + t.pnl, 0).toFixed(0)}%`);
console.log(`Actual AntiZZ trades: ${antiZZTrades.length}`);
console.log(`Actual AntiZZ P&L: ${antiZZTrades.reduce((s, t) => s + t.pnl, 0).toFixed(0)}%`);

// Suppressed signals estimation
const suppressed = totalZZOpportunities - zzTrades.length;
console.log(`\nEstimated suppressed ZZ signals: ${suppressed}`);
console.log(`Suppression rate: ${(suppressed/totalZZOpportunities*100).toFixed(1)}%`);

// ============================================================================
console.log('\n' + '='.repeat(80));
console.log('SECTION 2: SAME-DIRECTION REGIME ANALYSIS');
console.log('='.repeat(80));

// Sort regimes by hypothetical profit
const sortedRegimes = [...sameDirectionRegimes].sort((a, b) => b.hypotheticalProfit - a.hypotheticalProfit);

console.log('\nTop 10 Most Profitable Same-Direction Regimes:');
console.log('-'.repeat(80));
console.log('Start\tEnd\tLen\tDir\tHypoProfit\tMaxRun\tAnti\tAP5\tXAX');

for (const regime of sortedRegimes.slice(0, 10)) {
  const dir = regime.direction > 0 ? 'UP' : 'DOWN';
  console.log(
    `${regime.startIndex}\t${regime.endIndex}\t${regime.totalBlocks}\t${dir}\t` +
    `${regime.hypotheticalProfit.toFixed(0)}%\t\t${regime.maxRunLength}\t` +
    `${regime.antiPatternTrades}\t${regime.ap5Trades}\t${regime.xaxTrades}`
  );
}

// Total regime stats
const totalRegimeProfit = sortedRegimes.reduce((s, r) => s + r.hypotheticalProfit, 0);
const totalRegimeBlocks = sortedRegimes.reduce((s, r) => s + r.totalBlocks, 0);
console.log(`\nTotal same-direction regime hypothetical profit: ${totalRegimeProfit.toFixed(0)}%`);
console.log(`Total blocks in regimes: ${totalRegimeBlocks} (${(totalRegimeBlocks/data.blocks.length*100).toFixed(1)}% of session)`);

// ============================================================================
console.log('\n' + '='.repeat(80));
console.log('SECTION 3: ACTIVATION THRESHOLD ANALYSIS');
console.log('='.repeat(80));

// Test different activation thresholds
interface ThresholdTest {
  name: string;
  threshold: number;
  activations: number;
  totalProfit: number;
  avgProfitPerActivation: number;
  precision: number; // % of activations that were profitable
}

function testThreshold(
  regimes: SameDirectionRegime[],
  profitThreshold: number
): ThresholdTest {
  const qualifying = regimes.filter(r => r.hypotheticalProfit >= profitThreshold);
  const profitable = qualifying.filter(r => r.hypotheticalProfit > 0);

  return {
    name: `profit >= ${profitThreshold}%`,
    threshold: profitThreshold,
    activations: qualifying.length,
    totalProfit: qualifying.reduce((s, r) => s + r.hypotheticalProfit, 0),
    avgProfitPerActivation: qualifying.length > 0
      ? qualifying.reduce((s, r) => s + r.hypotheticalProfit, 0) / qualifying.length
      : 0,
    precision: qualifying.length > 0 ? profitable.length / qualifying.length : 0,
  };
}

const thresholds = [50, 100, 150, 200, 250, 300];
console.log('\nActivation Threshold Testing:');
console.log('-'.repeat(70));
console.log('Threshold\tActivations\tTotal Profit\tAvg Profit\tPrecision');

for (const t of thresholds) {
  const result = testThreshold(sameDirectionRegimes, t);
  console.log(
    `${result.name}\t${result.activations}\t\t${result.totalProfit.toFixed(0)}%\t\t` +
    `${result.avgProfitPerActivation.toFixed(0)}%\t\t${(result.precision*100).toFixed(1)}%`
  );
}

// ============================================================================
console.log('\n' + '='.repeat(80));
console.log('SECTION 4: RUN LENGTH DISTRIBUTION');
console.log('='.repeat(80));

// Analyze run length distribution
const runLengthDist = new Map<number, number>();
for (const run of runs) {
  runLengthDist.set(run.length, (runLengthDist.get(run.length) || 0) + 1);
}

console.log('\nRun Length Distribution:');
console.log('Length\tCount\tPercentage');
for (const [length, count] of [...runLengthDist.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`${length}\t${count}\t${(count/runs.length*100).toFixed(1)}%`);
}

// Runs of 3+ are ZZ indicators
const longRuns = runs.filter(r => r.length >= 3);
console.log(`\nRuns of 3+ (ZZ indicators): ${longRuns.length} (${(longRuns.length/runs.length*100).toFixed(1)}%)`);

// ============================================================================
console.log('\n' + '='.repeat(80));
console.log('SECTION 5: PATTERN PERFORMANCE SUMMARY');
console.log('='.repeat(80));

console.log('\nPattern\t\tTrades\tP&L\tWin Rate');
console.log('-'.repeat(50));

const sortedPatterns = [...patternStats.entries()].sort((a, b) => b[1].pnl - a[1].pnl);
for (const [pattern, stats] of sortedPatterns) {
  const wr = (stats.wins / stats.trades * 100).toFixed(1);
  console.log(`${pattern.padEnd(12)}\t${stats.trades}\t${stats.pnl.toFixed(0)}\t${wr}%`);
}

// ============================================================================
console.log('\n' + '='.repeat(80));
console.log('SECTION 6: CORRECTION PROPOSAL');
console.log('='.repeat(80));

console.log(`
PROPOSED CORRECTION RULES:

1. ZZ INDEPENDENCE POLICY
   -------------------------
   Policy A (Aggressive):
   - ZZ plays whenever signalled (after 3+ indicator)
   - Ignores: P1 mode, cooldown, general holds
   - Only respects: Hard abort (session abort)
   - Risk: May play during truly hostile periods
   - Evidence: ${zzWouldWin} wins vs ${zzWouldLose} losses from suppressed = ${zzHypotheticalPnl.toFixed(0)}% potential

   Policy B (Conservative):
   - ZZ ignores: Cooldown, two-block holds
   - Respects: Unplayable hard stop (3+ consecutive losses)
   - AntiZZ inherits same rules when active
   - Risk: Still misses some opportunities
   - Recommended for initial implementation

2. SAME-DIRECTION MODE ACTIVATION
   --------------------------------
   Recommended Threshold: profit >= 150% over 10-block window
   Activation Rule: Enter when hypothetical same-direction profit exceeds threshold

   Cooldown Rule:
   - Exit when: profit retracement > 50% from peak
   - OR: 2 consecutive direction changes with losses
   - OR: XAX pattern (2A2, 3A3) fires with loss

3. PRIORITY ORDER
   ---------------
   1. Hard Stop (session abort) - blocks ALL
   2. ZZ/AntiZZ - plays independently (Policy B)
   3. Same-Direction Mode (when active) - overrides normal patterns
   4. Normal Pattern Selection (MAIN bucket)
   5. B&S Patterns (BNS bucket)

4. HOLD CLASSIFICATION
   --------------------
   HARD STOP (blocks everything):
   - Session abort (max drawdown)
   - 3+ consecutive losses

   SOFT STOP (ZZ ignores):
   - P1 mode
   - Two-block cooldown
   - General unplayable

   DOES NOT BLOCK (always allow):
   - Pattern-specific holds
   - Bucket transitions

ESTIMATED IMPACT OF CHANGES:
- ZZ independence: +${zzHypotheticalPnl.toFixed(0)}% (if all suppressions played)
- Same-direction mode: +${(totalRegimeProfit * 0.3).toFixed(0)}% (conservative 30% capture)
- Combined estimate: ${(zzHypotheticalPnl + totalRegimeProfit * 0.3).toFixed(0)}% improvement potential
`);

// ============================================================================
console.log('\n' + '='.repeat(80));
console.log('RAW DATA EXPORT (JSON)');
console.log('='.repeat(80));

const exportData = {
  summary: {
    sessionPath,
    blocks: data.blocks.length,
    trades: data.trades.length,
    pnlTotal: data.pnlTotal,
    runs: runs.length,
    zzIndicators: zzIndicators.length,
  },
  zzAnalysis: {
    totalOpportunities: totalZZOpportunities,
    wouldWin: zzWouldWin,
    wouldLose: zzWouldLose,
    hypotheticalPnl: zzHypotheticalPnl,
    actualZZTrades: zzTrades.length,
    actualAntiZZTrades: antiZZTrades.length,
    suppressionRate: suppressed / totalZZOpportunities,
  },
  sameDirectionRegimes: sortedRegimes.slice(0, 20).map(r => ({
    startIndex: r.startIndex,
    endIndex: r.endIndex,
    direction: r.direction > 0 ? 'UP' : 'DOWN',
    blocks: r.totalBlocks,
    hypotheticalProfit: r.hypotheticalProfit,
    maxRunLength: r.maxRunLength,
  })),
  patternPerformance: Object.fromEntries(sortedPatterns),
};

console.log(JSON.stringify(exportData, null, 2));
