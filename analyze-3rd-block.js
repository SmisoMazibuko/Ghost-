const fs = require('fs');

const data = JSON.parse(fs.readFileSync('C:\\Users\\Okhantu\\Desktop\\The other income\\ghost-evaluator\\data\\sessions\\session_2025-12-17T21-37-51-550Z.json', 'utf8'));

console.log('=== ANALYSIS: BETTING ON 3RD BLOCK AFTER FLIP ===\n');

const trades = data.trades || [];
const blocks = data.blocks || [];

// Get run length at each block
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

const sdTrades = trades.filter(t => t.pattern === 'SameDir');

// Categorize SD trades by the block they're PREDICTING
// When openIndex has run length N, we're predicting block N+1
// So:
// - Run length 1 at open → predicting 2nd block
// - Run length 2 at open → predicting 3rd block
// - Run length 3 at open → predicting 4th block

const predictingBlock = {
  2: { trades: [], wins: 0, losses: 0, pnl: 0, desc: 'Bet at len 1, predict 2nd' },
  3: { trades: [], wins: 0, losses: 0, pnl: 0, desc: 'Bet at len 2, predict 3rd' },
  4: { trades: [], wins: 0, losses: 0, pnl: 0, desc: 'Bet at len 3, predict 4th' },
  5: { trades: [], wins: 0, losses: 0, pnl: 0, desc: 'Bet at len 4, predict 5th' },
  '6+': { trades: [], wins: 0, losses: 0, pnl: 0, desc: 'Bet at len 5+, predict 6th+' }
};

sdTrades.forEach(sd => {
  const openRunLength = getRunLengthAtBlock(blocks, sd.openIndex);
  const predictedBlock = openRunLength + 1;

  const key = predictedBlock >= 6 ? '6+' : predictedBlock;
  if (predictingBlock[key]) {
    predictingBlock[key].trades.push(sd);
    predictingBlock[key].pnl += sd.pnl;
    if (sd.isWin) predictingBlock[key].wins++;
    else predictingBlock[key].losses++;
  }
});

console.log('=== SAMEDIR PERFORMANCE BY PREDICTED BLOCK ===\n');
console.log('Predicting | Trades | Wins | Losses | Win% | PnL     | Description');
console.log('-----------|--------|------|--------|------|---------|------------------');

Object.entries(predictingBlock).forEach(([block, stats]) => {
  if (stats.trades.length > 0) {
    const winRate = Math.round((stats.wins / stats.trades.length) * 100);
    console.log(
      `Block ${block}`.padEnd(10) + ' | ' +
      String(stats.trades.length).padStart(6) + ' | ' +
      String(stats.wins).padStart(4) + ' | ' +
      String(stats.losses).padStart(6) + ' | ' +
      String(winRate + '%').padStart(4) + ' | ' +
      String(Math.round(stats.pnl)).padStart(7) + ' | ' +
      stats.desc
    );
  }
});

// Key question: If we skip betting at run length 1, would betting at run length 2 help?
console.log('\n=== THE KEY QUESTION ===\n');
console.log('Current: Bet at run length 1 (predicting 2nd block)');
console.log(`  Trades: ${predictingBlock[2].trades.length}, Win: ${predictingBlock[2].wins}, Loss: ${predictingBlock[2].losses}`);
console.log(`  Win Rate: ${predictingBlock[2].trades.length > 0 ? Math.round((predictingBlock[2].wins / predictingBlock[2].trades.length) * 100) : 0}%`);
console.log(`  PnL: ${Math.round(predictingBlock[2].pnl)}`);

console.log('\nIf we skip run length 1, next bet is at run length 2 (predicting 3rd block):');
console.log(`  Trades: ${predictingBlock[3].trades.length}, Win: ${predictingBlock[3].wins}, Loss: ${predictingBlock[3].losses}`);
console.log(`  Win Rate: ${predictingBlock[3].trades.length > 0 ? Math.round((predictingBlock[3].wins / predictingBlock[3].trades.length) * 100) : 0}%`);
console.log(`  PnL: ${Math.round(predictingBlock[3].pnl)}`);

// Analyze the 3rd block predictions in detail
console.log('\n=== DETAILED: PREDICTING 3RD BLOCK (bet at run length 2) ===\n');
const pred3Trades = predictingBlock[3].trades;
if (pred3Trades.length > 0) {
  console.log('Each trade predicting 3rd block:');
  pred3Trades.forEach(t => {
    const openLen = getRunLengthAtBlock(blocks, t.openIndex);
    console.log(`  Block ${t.openIndex} (len ${openLen}) → ${t.evalIndex}: ${t.isWin ? 'WIN' : 'LOSS'} ${Math.round(t.pnl)}`);
  });
}

// What if we wait even longer - bet at run length 3?
console.log('\n=== WHAT IF WE WAIT LONGER? ===\n');
console.log('Skip len 1 AND len 2, bet at len 3 (predicting 4th block):');
console.log(`  Trades: ${predictingBlock[4].trades.length}, Win: ${predictingBlock[4].wins}, Loss: ${predictingBlock[4].losses}`);
console.log(`  Win Rate: ${predictingBlock[4].trades.length > 0 ? Math.round((predictingBlock[4].wins / predictingBlock[4].trades.length) * 100) : 0}%`);
console.log(`  PnL: ${Math.round(predictingBlock[4].pnl)}`);

// Calculate combined strategy
console.log('\n=== STRATEGY COMPARISON ===\n');

const strategy1 = predictingBlock[2].pnl + predictingBlock[3].pnl + predictingBlock[4].pnl + predictingBlock[5].pnl + (predictingBlock['6+']?.pnl || 0);
const strategy2 = predictingBlock[3].pnl + predictingBlock[4].pnl + predictingBlock[5].pnl + (predictingBlock['6+']?.pnl || 0);
const strategy3 = predictingBlock[4].pnl + predictingBlock[5].pnl + (predictingBlock['6+']?.pnl || 0);

console.log('Strategy 1 (current): Bet at all run lengths');
console.log(`  Total PnL: ${Math.round(strategy1)}`);

console.log('\nStrategy 2: Skip run length 1, bet at 2+');
console.log(`  Total PnL: ${Math.round(strategy2)}`);
console.log(`  Improvement: ${Math.round(strategy2 - strategy1)}`);

console.log('\nStrategy 3: Skip run length 1 & 2, bet at 3+');
console.log(`  Total PnL: ${Math.round(strategy3)}`);
console.log(`  Improvement: ${Math.round(strategy3 - strategy1)}`);

// Analyze across all sessions
console.log('\n=== CROSS-SESSION ANALYSIS ===\n');
const sessions = [
  'session_2025-12-17T16-22-57-249Z.json',
  'session_2025-12-17T19-38-31-098Z.json',
  'session_2025-12-17T19-53-31-143Z.json',
  'session_2025-12-17T21-37-51-550Z.json'
];

console.log('Session     | Pred 2nd PnL | Pred 3rd PnL | Pred 4th PnL | Skip1 Saves');
console.log('------------|--------------|--------------|--------------|------------');

sessions.forEach(file => {
  try {
    const d = JSON.parse(fs.readFileSync(`C:\\Users\\Okhantu\\Desktop\\The other income\\ghost-evaluator\\data\\sessions\\${file}`, 'utf8'));
    const sd = d.trades ? d.trades.filter(t => t.pattern === 'SameDir') : [];
    const b = d.blocks || [];

    let pred2 = 0, pred3 = 0, pred4 = 0;

    sd.forEach(t => {
      let runLen = 1, runDir = null;
      for (let i = 0; i <= t.openIndex && i < b.length; i++) {
        if (runDir === null) { runDir = b[i].dir; runLen = 1; }
        else if (b[i].dir === runDir) { runLen++; }
        else { runDir = b[i].dir; runLen = 1; }
      }

      const predBlock = runLen + 1;
      if (predBlock === 2) pred2 += t.pnl;
      else if (predBlock === 3) pred3 += t.pnl;
      else if (predBlock === 4) pred4 += t.pnl;
    });

    const label = file.substring(8, 13);
    const skip1Saves = -pred2; // If we skip predicting 2nd, we save this loss (or lose this gain)
    console.log(
      label.padEnd(11) + ' | ' +
      String(Math.round(pred2)).padStart(12) + ' | ' +
      String(Math.round(pred3)).padStart(12) + ' | ' +
      String(Math.round(pred4)).padStart(12) + ' | ' +
      String(Math.round(skip1Saves)).padStart(11)
    );
  } catch (e) {}
});
