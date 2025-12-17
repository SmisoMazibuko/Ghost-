/**
 * Hierarchy Simulation v4
 * =======================
 *
 * Priority:
 * 1. ZZ/AntiZZ (Pocket System) - Highest
 * 2. Same Direction System
 * 3. Bucket System (2A2, 3A3, 4A4, 5A5, OZ, AP5) - Lowest
 *
 * ZZ Indicator = 2+ run followed by flip
 * ZZ First Bet = computed at first block after indicator
 * AntiZZ activates when ZZ first bet is NEGATIVE
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

interface Run {
  startIndex: number;
  endIndex: number;
  direction: 1 | -1;
  length: number;
  blocks: Block[];
}

type ActiveSystem = 'ZZ' | 'ANTI_ZZ' | 'SAME_DIR' | 'BUCKET' | 'NONE';

// Load session data
const sessionPath = process.argv[2] || './data/sessions/session_2025-12-17T08-01-23-574Z.json';
const data: SessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
const blocks = data.blocks;

console.log('='.repeat(80));
console.log('HIERARCHY SIMULATION v4 - Correct Pocket System Rules');
console.log('='.repeat(80));
console.log(`Session: ${path.basename(sessionPath)}`);
console.log(`Blocks: ${blocks.length}`);
console.log(`Actual Session PnL: ${data.pnlTotal}%`);
console.log('');
console.log('ZZ Indicator = 2+ run followed by flip');
console.log('AntiZZ activates when ZZ first bet is NEGATIVE');
console.log('='.repeat(80));

// ============================================================================
// Build runs
// ============================================================================

function buildRuns(blocks: Block[]): Run[] {
  const runs: Run[] = [];
  if (blocks.length < 1) return runs;

  let currentRun: Run = {
    startIndex: 0,
    endIndex: 0,
    direction: blocks[0].dir,
    length: 1,
    blocks: [blocks[0]],
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
        length: 1,
        blocks: [block],
      };
    }
  }
  runs.push(currentRun);
  return runs;
}

const runs = buildRuns(blocks);

// Map block index to run
const blockToRunIndex = new Map<number, number>();
for (let runIdx = 0; runIdx < runs.length; runIdx++) {
  const run = runs[runIdx];
  for (let i = run.startIndex; i <= run.endIndex; i++) {
    blockToRunIndex.set(i, runIdx);
  }
}

// ============================================================================
// Pocket System State
// ============================================================================

let zzPocket: 1 | 2 = 1;      // ZZ starts in P1
let antiZZPocket: 1 | 2 = 2;  // AntiZZ starts in P2
let runProfitZZ = 0;
let zzRunActive = false;       // Is ZZ in a continuous betting run?
let zzFirstBetBlock = -1;      // Block index where first bet will be evaluated

// Same Direction State
let sameDirActive = false;
let sameDirAccumulatedLoss = 0;
const SAME_DIR_ACTIVATION_THRESHOLD = 140;
const SAME_DIR_CUT_LIMIT = 140;

// Bucket Pattern Activation State (simplified - use 70% threshold)
const bucketPatternActive = new Map<string, boolean>();
['2A2', 'Anti2A2', '3A3', 'Anti3A3', '4A4', '5A5', 'OZ', 'AP5'].forEach(p => bucketPatternActive.set(p, false));

// Totals
let zzProfit = 0, antiZZProfit = 0, sameDirProfit = 0, bucketProfit = 0;
let zzBets = 0, antiZZBets = 0, sameDirBets = 0, bucketBets = 0;

// Track events
const events: string[] = [];

console.log('\n' + '='.repeat(80));
console.log('BLOCK-BY-BLOCK ANALYSIS');
console.log('='.repeat(80));
console.log('');
console.log('Blk\tDir\t%\tZZ_P\tAZZ_P\tSD?\tControl\t\tBet\tResult\tPnL\tNote');
console.log('-'.repeat(120));

for (let blockIdx = 0; blockIdx < blocks.length; blockIdx++) {
  const block = blocks[blockIdx];
  const dir = block.dir === 1 ? 'G' : 'R';
  const runIdx = blockToRunIndex.get(blockIdx) ?? 0;
  const currentRun = runs[runIdx];
  const prevRunIdx = runIdx > 0 ? runIdx - 1 : null;
  const prevRun = prevRunIdx !== null ? runs[prevRunIdx] : null;

  // Is this the first block of a new run (flip)?
  const isFlip = blockIdx > 0 && blocks[blockIdx].dir !== blocks[blockIdx - 1].dir;

  let controllingSystem: ActiveSystem = 'NONE';
  let actualBet: string | null = null;
  let result: 'WIN' | 'LOSS' | 'NO_BET' = 'NO_BET';
  let pnl = 0;
  let note = '';

  // ==========================================================================
  // ZZ INDICATOR DETECTION
  // ZZ Indicator = 2+ run followed by flip
  // ==========================================================================

  const isZZIndicator = isFlip && prevRun && prevRun.length >= 2;

  if (isZZIndicator) {
    note += 'IND ';
    events.push(`Block ${blockIdx}: ZZ INDICATOR (${prevRun!.length}-run → flip)`);

    // At indicator, determine who plays based on pocket positions
    // Per spec: Either ZZ in P1 (ZZ bets) or AntiZZ in P1 (AntiZZ bets) or both P2 (imaginary)
    if (antiZZPocket === 1) {
      // AntiZZ is in P1 - AntiZZ plays ONE bet at this indicator
      controllingSystem = 'ANTI_ZZ';
      // AntiZZ predicts SAME direction (alternation breaks)
      actualBet = block.dir === 1 ? 'G' : 'R';
      note += 'AZZ_PLAY ';
    } else if (zzPocket === 1) {
      // ZZ is in P1 - ZZ will evaluate first bet on NEXT block
      zzFirstBetBlock = blockIdx + 1;
      note += 'ZZ_WAIT_1ST ';
    } else {
      // Both in P2 - evaluate imaginary first bet on NEXT block
      zzFirstBetBlock = blockIdx + 1;
      note += 'BOTH_P2 ';
    }
  }

  // ==========================================================================
  // ZZ FIRST BET EVALUATION
  // ==========================================================================

  if (blockIdx === zzFirstBetBlock && zzFirstBetBlock > 0) {
    const indicatorBlock = blocks[zzFirstBetBlock - 1];
    // ZZ predicts OPPOSITE of indicator direction (alternation continues)
    const zzPrediction: 1 | -1 = indicatorBlock.dir === 1 ? -1 : 1;
    const zzWouldWin = zzPrediction === block.dir;
    const firstOutcomeZZ = zzWouldWin ? block.pct : -block.pct;

    // Update runProfitZZ (even if imaginary)
    runProfitZZ = firstOutcomeZZ;

    if (zzPocket === 1) {
      // ZZ in P1 - this is a REAL first bet
      controllingSystem = 'ZZ';
      actualBet = zzPrediction === 1 ? 'G' : 'R';

      if (firstOutcomeZZ < 0) {
        // First bet NEGATIVE → AntiZZ becomes candidate
        note += `ZZ_1ST_NEG(${firstOutcomeZZ.toFixed(0)}%) `;
        zzPocket = 2;
        antiZZPocket = 1;  // AntiZZ now in P1, will play at next indicator
        zzRunActive = false;
        events.push(`Block ${blockIdx}: ZZ first bet NEGATIVE → AntiZZ to P1`);
      } else {
        // First bet POSITIVE → ZZ continues
        note += `ZZ_1ST_POS(+${firstOutcomeZZ.toFixed(0)}%) `;
        zzRunActive = true;
        events.push(`Block ${blockIdx}: ZZ first bet POSITIVE → ZZ continues`);
      }
    } else {
      // ZZ in P2 - IMAGINARY first bet
      if (firstOutcomeZZ >= 0) {
        // Positive imaginary → ZZ moves P2 → P1, starts betting
        zzPocket = 1;
        zzRunActive = true;
        controllingSystem = 'ZZ';
        actualBet = zzPrediction === 1 ? 'G' : 'R';
        note += `IMG_POS(+${firstOutcomeZZ.toFixed(0)}%)→ZZ_P1 `;
        events.push(`Block ${blockIdx}: Imaginary POSITIVE → ZZ to P1`);
      } else {
        // Negative imaginary → ZZ stays P2, AntiZZ to P1 for next indicator
        antiZZPocket = 1;
        note += `IMG_NEG(${firstOutcomeZZ.toFixed(0)}%)→AZZ_P1 `;
        events.push(`Block ${blockIdx}: Imaginary NEGATIVE → AntiZZ to P1`);
      }
    }

    zzFirstBetBlock = -1;  // Reset
  }

  // ==========================================================================
  // ZZ CONTINUOUS BETTING (if run active and in P1)
  // ==========================================================================

  if (zzRunActive && zzPocket === 1 && controllingSystem === 'NONE' && blockIdx > 0) {
    // ZZ continues betting OPPOSITE of current direction
    const prevDir = blocks[blockIdx - 1].dir;
    const zzPrediction: 1 | -1 = prevDir === 1 ? -1 : 1;
    controllingSystem = 'ZZ';
    actualBet = zzPrediction === 1 ? 'G' : 'R';
  }

  // ==========================================================================
  // SAME DIRECTION ACTIVATION
  // Activates on break after 4+ run with RunProfit >= 140%
  // ==========================================================================

  if (!sameDirActive && isFlip && prevRun && prevRun.length >= 4) {
    // Calculate RunProfit = (G2+G3+...) - BreakBlock
    if (prevRun.blocks.length >= 2) {
      const profitBlocks = prevRun.blocks.slice(1);
      const profitSum = profitBlocks.reduce((s, b) => s + b.pct, 0);
      const runProfit = profitSum - block.pct;
      if (runProfit >= SAME_DIR_ACTIVATION_THRESHOLD) {
        sameDirActive = true;
        sameDirAccumulatedLoss = 0;
        note += `SD_ACT(${runProfit.toFixed(0)}%) `;
        events.push(`Block ${blockIdx}: SAME_DIR activated (${prevRun.length}-run, profit ${runProfit.toFixed(0)}%)`);
      }
    }
  }

  // ==========================================================================
  // SAME DIRECTION BETTING (Priority 2 - only if ZZ not active)
  // ==========================================================================

  if (sameDirActive && controllingSystem === 'NONE' && !zzRunActive && blockIdx > 0) {
    // Pause during ZZ indicator (zzFirstBetBlock check)
    if (zzFirstBetBlock === -1 || blockIdx !== zzFirstBetBlock) {
      controllingSystem = 'SAME_DIR';
      // Bet continuation (same as previous block direction)
      const prevDir = blocks[blockIdx - 1].dir;
      actualBet = prevDir === 1 ? 'G' : 'R';
    }
  }

  // ==========================================================================
  // BUCKET PATTERNS (Priority 3 - only if higher systems not active)
  // ==========================================================================

  if (controllingSystem === 'NONE' && !zzRunActive && !sameDirActive && blockIdx > 0) {
    const positionInRun = blockIdx - currentRun.startIndex + 1;

    // 2A2: Run length = 2, predict opposite
    if (currentRun.length === 2 && positionInRun === 2) {
      controllingSystem = 'BUCKET';
      actualBet = currentRun.direction === 1 ? 'R' : 'G';
      note += '2A2 ';
    }
    // 3A3: Run length = 3, predict opposite
    else if (currentRun.length === 3 && positionInRun === 3) {
      controllingSystem = 'BUCKET';
      actualBet = currentRun.direction === 1 ? 'R' : 'G';
      note += '3A3 ';
    }
    // 4A4: Run length = 4, predict opposite
    else if (currentRun.length === 4 && positionInRun === 4) {
      controllingSystem = 'BUCKET';
      actualBet = currentRun.direction === 1 ? 'R' : 'G';
      note += '4A4 ';
    }
    // 5A5: Run length = 5, predict opposite
    else if (currentRun.length === 5 && positionInRun === 5) {
      controllingSystem = 'BUCKET';
      actualBet = currentRun.direction === 1 ? 'R' : 'G';
      note += '5A5 ';
    }
  }

  // ==========================================================================
  // CALCULATE RESULT
  // ==========================================================================

  if (actualBet !== null) {
    const betDir: 1 | -1 = actualBet === 'G' ? 1 : -1;
    if (betDir === block.dir) {
      result = 'WIN';
      pnl = block.pct;
    } else {
      result = 'LOSS';
      pnl = -block.pct;
    }

    // Track by system
    if (controllingSystem === 'ZZ') {
      zzProfit += pnl;
      zzBets++;
      runProfitZZ += pnl;

      // Check if ZZ run ends
      if (pnl < 0) {
        // Run ends, check pocket
        zzPocket = runProfitZZ > 0 ? 1 : 2;
        zzRunActive = false;
        note += 'ZZ_RUN_END ';
        runProfitZZ = 0;
      }

    } else if (controllingSystem === 'ANTI_ZZ') {
      antiZZProfit += pnl;
      antiZZBets++;

      // AntiZZ pocket based on LAST BET only
      if (pnl < 0) {
        // Loss → AntiZZ to P2, ZZ back to P1
        antiZZPocket = 2;
        zzPocket = 1;
        runProfitZZ = block.pct;  // ZZ imaginary win
        note += 'AZZ_LOSS→ZZ_P1 ';
        events.push(`Block ${blockIdx}: AntiZZ LOSS → SWAP to ZZ`);
      } else {
        // Win → AntiZZ stays P1
        note += 'AZZ_WIN ';
      }

    } else if (controllingSystem === 'SAME_DIR') {
      sameDirProfit += pnl;
      sameDirBets++;

      if (pnl < 0) {
        sameDirAccumulatedLoss += Math.abs(pnl);
        if (sameDirAccumulatedLoss >= SAME_DIR_CUT_LIMIT) {
          sameDirActive = false;
          note += `SD_CUT(${sameDirAccumulatedLoss.toFixed(0)}%) `;
          sameDirAccumulatedLoss = 0;
        }
      }

    } else if (controllingSystem === 'BUCKET') {
      bucketProfit += pnl;
      bucketBets++;
    }
  }

  // Output
  if (blockIdx < 40 || blockIdx >= blocks.length - 10) {
    console.log(
      `${blockIdx}\t${dir}\t${block.pct}\t${zzPocket}\t${antiZZPocket}\t${sameDirActive ? 'Y' : '-'}\t` +
      `${controllingSystem}\t\t${actualBet || '-'}\t${result}\t${pnl > 0 ? '+' : ''}${pnl}%\t${note.trim()}`
    );
  } else if (blockIdx === 40) {
    console.log('... (truncated middle blocks) ...');
  }
}

// ============================================================================
// Summary
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('SUMMARY BY SYSTEM');
console.log('='.repeat(80));

const totalProfit = zzProfit + antiZZProfit + sameDirProfit + bucketProfit;
const totalBets = zzBets + antiZZBets + sameDirBets + bucketBets;

const actualProfit = data.trades.reduce((sum, t) => sum + t.pnl, 0);
const actualBets = data.trades.length;

console.log(`
HIERARCHY SIMULATION RESULTS:
System          Bets    Profit
------------------------------------------------------------
ZZ (Pocket)     ${zzBets.toString().padStart(4)}    ${(zzProfit > 0 ? '+' : '') + zzProfit.toFixed(0).padStart(6)}%
AntiZZ          ${antiZZBets.toString().padStart(4)}    ${(antiZZProfit > 0 ? '+' : '') + antiZZProfit.toFixed(0).padStart(6)}%
Same Direction  ${sameDirBets.toString().padStart(4)}    ${(sameDirProfit > 0 ? '+' : '') + sameDirProfit.toFixed(0).padStart(6)}%
Bucket          ${bucketBets.toString().padStart(4)}    ${(bucketProfit > 0 ? '+' : '') + bucketProfit.toFixed(0).padStart(6)}%
------------------------------------------------------------
Hierarchy Total ${totalBets.toString().padStart(4)}    ${(totalProfit > 0 ? '+' : '') + totalProfit.toFixed(0).padStart(6)}%

ACTUAL SESSION:
Actual trades   ${actualBets.toString().padStart(4)}    ${(actualProfit > 0 ? '+' : '') + actualProfit.toFixed(0).padStart(6)}%

COMPARISON:
- Actual Session: ${actualProfit.toFixed(0)}%
- Hierarchy System: ${totalProfit.toFixed(0)}%
- Difference: ${(totalProfit - actualProfit).toFixed(0)}%
`);

// ============================================================================
// Events Log
// ============================================================================

console.log('='.repeat(80));
console.log('KEY EVENTS');
console.log('='.repeat(80));

for (const e of events.slice(0, 40)) {
  console.log(e);
}
if (events.length > 40) {
  console.log(`... and ${events.length - 40} more events`);
}
console.log(`\nTotal events: ${events.length}`);
