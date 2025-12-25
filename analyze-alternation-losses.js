const fs = require('fs');

const data = JSON.parse(fs.readFileSync('C:\\Users\\Okhantu\\Desktop\\The other income\\ghost-evaluator\\data\\sessions\\session_2025-12-17T21-37-51-550Z.json', 'utf8'));

console.log('=== SAMEDIR LOSSES BY RUN LENGTH & ALTERNATION ===\n');

const trades = data.trades || [];
const results = data.results || [];
const blocks = data.blocks || [];

// Rebuild run data for each block to know run length at time of trade
function getRunLengthAtBlock(blocks, targetIndex) {
  let runLength = 1;
  let runDir = null;

  for (let i = 0; i <= targetIndex && i < blocks.length; i++) {
    const block = blocks[i];
    if (runDir === null) {
      runDir = block.dir;
      runLength = 1;
    } else if (block.dir === runDir) {
      runLength++;
    } else {
      runDir = block.dir;
      runLength = 1;
    }
  }
  return runLength;
}

// Check if we're in alternation (consecutive singles)
function getAlternationCount(blocks, targetIndex) {
  let count = 0;
  for (let i = targetIndex; i >= 0; i--) {
    // Check if this block is a single (different from next)
    if (i < blocks.length - 1 && blocks[i].dir !== blocks[i + 1].dir) {
      count++;
    } else if (i === blocks.length - 1) {
      // Last block, check against previous
      if (i > 0 && blocks[i].dir !== blocks[i - 1].dir) {
        count++;
      }
    } else {
      break;
    }
  }
  return count;
}

const sdTrades = trades.filter(t => t.pattern === 'SameDir');

// Categorize by run length
const byRunLength = {
  1: { trades: [], wins: 0, losses: 0, pnl: 0 },
  2: { trades: [], wins: 0, losses: 0, pnl: 0 },
  3: { trades: [], wins: 0, losses: 0, pnl: 0 },
  4: { trades: [], wins: 0, losses: 0, pnl: 0 },
  '5+': { trades: [], wins: 0, losses: 0, pnl: 0 }
};

// Track alternation runs
let alternatingTrades = [];

sdTrades.forEach(sd => {
  const evalIndex = sd.evalIndex;
  const openIndex = sd.openIndex;

  // Get run length at the time of the bet (openIndex)
  const runLength = getRunLengthAtBlock(blocks, openIndex);

  const key = runLength >= 5 ? '5+' : runLength;
  byRunLength[key].trades.push(sd);
  byRunLength[key].pnl += sd.pnl;
  if (sd.isWin) byRunLength[key].wins++;
  else byRunLength[key].losses++;

  // Check for alternation pattern (run length 1 = single = alternating)
  if (runLength === 1) {
    alternatingTrades.push(sd);
  }
});

console.log('=== SAMEDIR BY RUN LENGTH (at time of bet) ===\n');
console.log('Run Len | Trades | Wins | Losses | Win% | PnL');
console.log('--------|--------|------|--------|------|------');

Object.entries(byRunLength).forEach(([len, stats]) => {
  if (stats.trades.length > 0) {
    const winRate = Math.round((stats.wins / stats.trades.length) * 100);
    console.log(
      String(len).padStart(7) + ' | ' +
      String(stats.trades.length).padStart(6) + ' | ' +
      String(stats.wins).padStart(4) + ' | ' +
      String(stats.losses).padStart(6) + ' | ' +
      String(winRate + '%').padStart(4) + ' | ' +
      String(Math.round(stats.pnl)).padStart(5)
    );
  }
});

// Analyze alternating singles (run length 1)
console.log('\n=== ALTERNATING SINGLES (Run Length 1) - THE PROBLEM AREA ===\n');
console.log(`Total alternating SD trades: ${alternatingTrades.length}`);
console.log(`Wins: ${alternatingTrades.filter(t => t.isWin).length}`);
console.log(`Losses: ${alternatingTrades.filter(t => !t.isWin).length}`);
console.log(`Win Rate: ${Math.round((alternatingTrades.filter(t => t.isWin).length / alternatingTrades.length) * 100)}%`);
console.log(`Total PnL: ${Math.round(alternatingTrades.reduce((s, t) => s + t.pnl, 0))}`);

// Check what patterns were active during these alternating trades
console.log('\n=== PATTERN ACTIVITY DURING ALTERNATING TRADES ===\n');

// Check ZZ activity
const zzTrades = trades.filter(t => t.pattern === 'ZZ' || t.pattern === 'AntiZZ');
const zzActiveBlocks = new Set(zzTrades.map(t => t.evalIndex));

let sdDuringZZ = alternatingTrades.filter(sd => zzActiveBlocks.has(sd.evalIndex));
let sdBeforeZZ = alternatingTrades.filter(sd => !zzActiveBlocks.has(sd.evalIndex));

console.log('During ZZ active (SD should be paused by hierarchy):');
console.log(`  Trades: ${sdDuringZZ.length}, PnL: ${Math.round(sdDuringZZ.reduce((s,t) => s + t.pnl, 0))}`);

console.log('\nBefore/Without ZZ (the problem area):');
console.log(`  Trades: ${sdBeforeZZ.length}, PnL: ${Math.round(sdBeforeZZ.reduce((s,t) => s + t.pnl, 0))}`);

// Check OZ activity during alternation
const ozTrades = trades.filter(t => t.pattern === 'OZ');
const ozActiveBlocks = new Set(ozTrades.map(t => t.evalIndex));
let sdDuringOZ = alternatingTrades.filter(sd => ozActiveBlocks.has(sd.evalIndex));

console.log('\nDuring OZ active:');
console.log(`  Trades: ${sdDuringOZ.length}, PnL: ${Math.round(sdDuringOZ.reduce((s,t) => s + t.pnl, 0))}`);

// Check 2A2 results during SD run length 2 trades
console.log('\n=== 2A2 ANALYSIS (Run Length 2) ===\n');
const sdAtLen2 = byRunLength[2].trades;
const results2A2 = results.filter(r => r.pattern === '2A2');
const trades2A2 = trades.filter(t => t.pattern === '2A2');

console.log(`SD trades at run length 2: ${sdAtLen2.length}`);
console.log(`2A2 total results: ${results2A2.length}`);
console.log(`2A2 traded (in MAIN): ${trades2A2.length}`);

// How many SD at len 2 overlapped with 2A2 results?
const sdWith2A2Signal = sdAtLen2.filter(sd =>
  results2A2.some(r => r.evalIndex === sd.evalIndex)
);
console.log(`SD at len 2 when 2A2 signaled: ${sdWith2A2Signal.length}`);

// Check if 2A2 was correct when SD lost
const sdLostWith2A2Correct = sdWith2A2Signal.filter(sd => {
  const matching2A2 = results2A2.find(r => r.evalIndex === sd.evalIndex);
  return !sd.isWin && matching2A2 && matching2A2.expectedDirection === matching2A2.actualDirection;
});
console.log(`SD LOST when 2A2 was CORRECT: ${sdLostWith2A2Correct.length}`);
console.log(`Avoidable loss: ${Math.round(sdLostWith2A2Correct.reduce((s,t) => s + Math.abs(t.pnl), 0))}`);

// Check 3A3 similarly
console.log('\n=== 3A3 ANALYSIS (Run Length 3) ===\n');
const sdAtLen3 = byRunLength[3].trades;
const results3A3 = results.filter(r => r.pattern === '3A3');
const trades3A3 = trades.filter(t => t.pattern === '3A3');

console.log(`SD trades at run length 3: ${sdAtLen3.length}`);
console.log(`3A3 total results: ${results3A3.length}`);
console.log(`3A3 traded (in MAIN): ${trades3A3.length}`);

const sdWith3A3Signal = sdAtLen3.filter(sd =>
  results3A3.some(r => r.evalIndex === sd.evalIndex)
);
console.log(`SD at len 3 when 3A3 signaled: ${sdWith3A3Signal.length}`);

const sdLostWith3A3Correct = sdWith3A3Signal.filter(sd => {
  const matching3A3 = results3A3.find(r => r.evalIndex === sd.evalIndex);
  return !sd.isWin && matching3A3 && matching3A3.expectedDirection === matching3A3.actualDirection;
});
console.log(`SD LOST when 3A3 was CORRECT: ${sdLostWith3A3Correct.length}`);
console.log(`Avoidable loss: ${Math.round(sdLostWith3A3Correct.reduce((s,t) => s + Math.abs(t.pnl), 0))}`);

// Summary
console.log('\n=== SUMMARY: WHERE SD LOSSES COME FROM ===\n');
console.log('By Run Length:');
Object.entries(byRunLength).forEach(([len, stats]) => {
  if (stats.trades.length > 0 && stats.pnl < 0) {
    console.log(`  Run ${len}: ${stats.losses} losses, PnL: ${Math.round(stats.pnl)}`);
  }
});

const totalAlternationLoss = alternatingTrades.filter(t => !t.isWin).reduce((s,t) => s + Math.abs(t.pnl), 0);
console.log(`\nTotal loss from alternating singles (run len 1): ${Math.round(totalAlternationLoss)}`);
console.log(`This is ${Math.round((totalAlternationLoss / Math.abs(byRunLength[1].pnl || 1)) * 100)}% of run len 1 losses`);
