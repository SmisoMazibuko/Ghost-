const fs = require('fs');
const path = require('path');

const sessionsDir = 'C:/Users/Okhantu/Desktop/The other income/ghost-evaluator/data/sessions';
const newSessionFile = 'session_2025-12-31T09-57-56-256Z.json';

const session = JSON.parse(fs.readFileSync(path.join(sessionsDir, newSessionFile)));

console.log('='.repeat(70));
console.log('NEW SESSION ANALYSIS: 2025-12-31T09:57 UTC (~11:57 local)');
console.log('='.repeat(70));

console.log('\nBasic Stats:');
console.log('  Blocks:', session.blocks.length);
console.log('  Trades:', session.trades.length);
console.log('  Total PnL:', session.pnlTotal);

const wins = session.trades.filter(t => t.isWin).length;
const losses = session.trades.length - wins;
console.log('  Wins:', wins, '/ Losses:', losses);
console.log('  Win Rate:', ((wins / session.trades.length) * 100).toFixed(1) + '%');

// By pattern
console.log('\nBy Pattern:');
const byPattern = {};
session.trades.forEach(t => {
  if (!byPattern[t.pattern]) {
    byPattern[t.pattern] = { count: 0, pnl: 0, wins: 0, losses: 0, trades: [] };
  }
  byPattern[t.pattern].count++;
  byPattern[t.pattern].pnl += t.pnl;
  if (t.isWin) byPattern[t.pattern].wins++;
  else byPattern[t.pattern].losses++;
  byPattern[t.pattern].trades.push(t);
});

Object.entries(byPattern)
  .sort((a, b) => b[1].pnl - a[1].pnl)
  .forEach(([p, s]) => {
    const wr = ((s.wins / s.count) * 100).toFixed(0);
    const avg = (s.pnl / s.count).toFixed(1);
    console.log('  ' + p.padEnd(10) + ': ' + String(s.count).padStart(3) + ' trades, PnL: ' + (s.pnl >= 0 ? '+' : '') + s.pnl.toFixed(0).padStart(6) + ', WR: ' + wr + '%, Avg: ' + avg);
  });

// SameDir detail
if (byPattern.SameDir) {
  console.log('\nSameDir Trades Detail:');
  byPattern.SameDir.trades.forEach((t, i) => {
    const result = t.isWin ? 'WIN ' : 'LOSS';
    console.log('  [' + (i+1) + '] ' + result + ' pnl:' + t.pnl.toFixed(0).padStart(5) + ' pct:' + String(t.pct).padStart(3) + ' | ' + t.reason.substring(0, 50) + '...');
  });
}

// Run data analysis
console.log('\nRun Data:');
console.log('  Current run length:', session.runData.currentLength);
console.log('  Current direction:', session.runData.currentDirection === 1 ? 'UP' : 'DOWN');
console.log('  Total runs:', session.runData.lengths.length);
console.log('  Max run:', Math.max(...session.runData.lengths));
console.log('  Avg run:', (session.runData.lengths.reduce((a,b)=>a+b,0) / session.runData.lengths.length).toFixed(1));

// Check for bait and switch patterns
console.log('\n' + '='.repeat(70));
console.log('BAIT & SWITCH ANALYSIS');
console.log('='.repeat(70));

let baitSwitchCount = 0;
let consecutiveLosses = [];
let currentLossStreak = 0;

for (let i = 0; i < session.trades.length; i++) {
  const t = session.trades[i];
  if (!t.isWin) {
    currentLossStreak++;
    if (t.confidence >= 70 && i > 0) {
      const prev = session.trades[i-1];
      if (prev && prev.isWin && prev.predictedDirection !== t.predictedDirection) {
        baitSwitchCount++;
        console.log('  B&S detected at trade ' + (i+1) + ': ' + t.pattern + ' lost after direction change');
      }
    }
  } else {
    if (currentLossStreak >= 3) {
      consecutiveLosses.push({ start: i - currentLossStreak, length: currentLossStreak });
    }
    currentLossStreak = 0;
  }
}

console.log('\nBait & Switch count:', baitSwitchCount);
console.log('Loss streaks >=3:', consecutiveLosses.length);

// Worst trades
console.log('\n' + '='.repeat(70));
console.log('WORST TRADES ANALYSIS');
console.log('='.repeat(70));

const worstTrades = [...session.trades].sort((a, b) => a.pnl - b.pnl).slice(0, 5);
console.log('\nTop 5 Worst Trades:');
worstTrades.forEach((t, i) => {
  console.log('  ' + (i+1) + '. ' + t.pattern.padEnd(10) + ' pnl:' + t.pnl.toFixed(0).padStart(5) + ' pct:' + t.pct + ' conf:' + t.confidence);
  console.log('     Reason: ' + t.reason);
});

// High-PCT losses
const highPctLosses = session.trades.filter(t => !t.isWin && t.pct >= 70);
console.log('\nHigh-PCT (>=70%) Losses:', highPctLosses.length);
highPctLosses.forEach((t, i) => {
  console.log('  ' + (i+1) + '. ' + t.pattern.padEnd(10) + ' pct:' + t.pct + ' pnl:' + t.pnl.toFixed(0));
});
