const fs = require('fs');
const data = JSON.parse(fs.readFileSync('C:\\Users\\Okhantu\\Desktop\\The other income\\ghost-evaluator\\data\\sessions\\session_2025-12-17T16-22-57-249Z.json', 'utf8'));

// Analyze evaluations for pattern performance
const patternStats = {};

data.results.forEach(e => {
  const pattern = e.pattern;
  if (!patternStats[pattern]) {
    patternStats[pattern] = {
      total: 0,
      wins: 0,
      losses: 0,
      totalProfit: 0,
      avgPct: 0,
      sameDirection: 0,
      oppositeDirection: 0
    };
  }

  const ps = patternStats[pattern];
  ps.total++;
  ps.avgPct += e.pct;

  const sameDir = e.expectedDirection === e.actualDirection;
  if (sameDir) {
    ps.sameDirection++;
    ps.wins++;
    ps.totalProfit += e.profit;
  } else {
    ps.oppositeDirection++;
    ps.losses++;
    ps.totalProfit += e.profit;
  }
});

// Calculate averages and win rates
Object.keys(patternStats).forEach(p => {
  const ps = patternStats[p];
  ps.avgPct = Math.round(ps.avgPct / ps.total);
  ps.winRate = Math.round((ps.wins / ps.total) * 100);
  ps.sameDirRate = Math.round((ps.sameDirection / ps.total) * 100);
});

// Sort by profit
const sorted = Object.entries(patternStats)
  .map(([name, stats]) => ({ name, ...stats }))
  .sort((a, b) => b.totalProfit - a.totalProfit);

console.log('=== MOST PROFITABLE PATTERNS (Focus: Same Direction) ===\n');
console.log('Pattern       | Total | Wins | W.Rate | SameDir | Profit | Avg%');
console.log('--------------|-------|------|--------|---------|--------|-----');

sorted.forEach(p => {
  console.log(
    p.name.padEnd(13) + ' | ' +
    String(p.total).padStart(5) + ' | ' +
    String(p.wins).padStart(4) + ' | ' +
    String(p.winRate + '%').padStart(6) + ' | ' +
    String(p.sameDirRate + '%').padStart(7) + ' | ' +
    String(p.totalProfit).padStart(6) + ' | ' +
    String(p.avgPct).padStart(4)
  );
});

// Filter only same-direction patterns (where pattern predicts continuation)
console.log('\n\n=== TOP PROFITABLE SAME-DIRECTION PATTERNS ===\n');
const topSameDir = sorted.filter(p => p.sameDirRate >= 50 && p.totalProfit > 0);
topSameDir.forEach(p => {
  console.log(p.name + ': ' + p.wins + '/' + p.total + ' wins (' + p.winRate + '%), Profit: ' + p.totalProfit);
});

// Detailed analysis of same direction patterns by type
console.log('\n\n=== SAME DIRECTION ANALYSIS BY PATTERN ===\n');

// Get the raw blocks for direction analysis
const blocks = data.blocks;
let sameDirectionRuns = [];
let currentRun = { dir: blocks[0].dir, count: 1, startIdx: 0 };

for (let i = 1; i < blocks.length; i++) {
  if (blocks[i].dir === currentRun.dir) {
    currentRun.count++;
  } else {
    if (currentRun.count >= 2) {
      sameDirectionRuns.push({ ...currentRun, endIdx: i - 1 });
    }
    currentRun = { dir: blocks[i].dir, count: 1, startIdx: i };
  }
}
if (currentRun.count >= 2) {
  sameDirectionRuns.push({ ...currentRun, endIdx: blocks.length - 1 });
}

console.log('Total runs of 2+ same direction:', sameDirectionRuns.length);

// Analyze run lengths
const runLengthStats = {};
sameDirectionRuns.forEach(run => {
  if (!runLengthStats[run.count]) {
    runLengthStats[run.count] = { count: 0, upRuns: 0, downRuns: 0 };
  }
  runLengthStats[run.count].count++;
  if (run.dir === 1) runLengthStats[run.count].upRuns++;
  else runLengthStats[run.count].downRuns++;
});

console.log('\nRun Length Distribution (2+ consecutive same direction):');
Object.keys(runLengthStats).sort((a, b) => Number(a) - Number(b)).forEach(len => {
  const stats = runLengthStats[len];
  console.log(`  ${len} blocks: ${stats.count}x (Up: ${stats.upRuns}, Down: ${stats.downRuns})`);
});

// Analyze trade performance
console.log('\n\n=== TRADE PERFORMANCE BY PATTERN ===\n');
const tradesByPattern = {};
data.trades.forEach(t => {
  if (!tradesByPattern[t.pattern]) {
    tradesByPattern[t.pattern] = { total: 0, wins: 0, totalPnl: 0 };
  }
  tradesByPattern[t.pattern].total++;
  if (t.isWin) tradesByPattern[t.pattern].wins++;
  tradesByPattern[t.pattern].totalPnl += t.pnl;
});

const sortedTrades = Object.entries(tradesByPattern)
  .map(([name, stats]) => ({ name, ...stats, winRate: Math.round((stats.wins / stats.total) * 100) }))
  .sort((a, b) => b.totalPnl - a.totalPnl);

console.log('Pattern       | Trades | Wins | W.Rate | Total PnL');
console.log('--------------|--------|------|--------|----------');
sortedTrades.forEach(p => {
  console.log(
    p.name.padEnd(13) + ' | ' +
    String(p.total).padStart(6) + ' | ' +
    String(p.wins).padStart(4) + ' | ' +
    String(p.winRate + '%').padStart(6) + ' | ' +
    String(Math.round(p.totalPnl)).padStart(9)
  );
});

// Overall session stats
console.log('\n=== SESSION SUMMARY ===');
console.log('Total PnL:', data.pnlTotal);
console.log('Total Trades:', data.trades.length);
const winningTrades = data.trades.filter(t => t.isWin).length;
console.log('Winning Trades:', winningTrades);
console.log('Win Rate:', Math.round((winningTrades / data.trades.length) * 100) + '%');
