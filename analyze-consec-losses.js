const fs = require('fs');

const s1 = JSON.parse(fs.readFileSync('ghost-evaluator/data/sessions/session_2025-12-24T18-19-24-936Z.json', 'utf8'));
const s2 = JSON.parse(fs.readFileSync('ghost-evaluator/data/sessions/session_2025-12-24T18-57-18-606Z.json', 'utf8'));

console.log('=== SAMEDIR CONSECUTIVE LOSS ANALYSIS ===\n');

function analyzeConsecutiveLosses(data, name) {
  console.log('--- ' + name + ' ---\n');

  const sameDirTrades = data.trades.filter(t => t.pattern === 'SameDir');

  // Find consecutive loss streaks
  let lossStreaks = [];
  let currentStreak = [];

  sameDirTrades.forEach((t, idx) => {
    if (t.isWin === false) {
      currentStreak.push({ idx: idx + 1, trade: t, pct: data.blocks[t.evalIndex] ? data.blocks[t.evalIndex].pct : 0 });
    } else {
      if (currentStreak.length >= 2) {
        lossStreaks.push([...currentStreak]);
      }
      currentStreak = [];
    }
  });
  if (currentStreak.length >= 2) {
    lossStreaks.push([...currentStreak]);
  }

  console.log('Consecutive Loss Streaks (2+ in a row):\n');

  let totalConsecLossPnl = 0;

  lossStreaks.forEach((streak, i) => {
    const streakPnl = streak.reduce((sum, s) => sum + s.trade.pnl, 0);
    totalConsecLossPnl += streakPnl;

    console.log('STREAK ' + (i + 1) + ': ' + streak.length + ' consecutive losses');
    streak.forEach(s => {
      const predDir = s.trade.predictedDirection === 1 ? 'UP' : 'DN';
      const actDir = s.trade.actualDirection === 1 ? 'UP' : 'DN';
      console.log('  Trade #' + s.idx + ' | Pred:' + predDir + ' | Act:' + actDir + ' | PCT:' + String(s.pct).padStart(3) + ' | PnL:' + String(s.trade.pnl).padStart(5));
    });
    console.log('  Streak PnL: ' + streakPnl);
    console.log('');
  });

  console.log('--- SUMMARY ---');
  console.log('Number of consecutive loss streaks (2+):', lossStreaks.length);
  console.log('Total trades in consecutive losses:', lossStreaks.reduce((sum, s) => sum + s.length, 0));
  console.log('Total PnL from consecutive losses:', totalConsecLossPnl);

  // Find isolated losses
  const consecLossIndices = new Set();
  lossStreaks.forEach(streak => {
    streak.forEach(s => consecLossIndices.add(s.idx));
  });

  let isolatedLossPnl = 0;
  let isolatedCount = 0;
  sameDirTrades.forEach((t, idx) => {
    if (t.isWin === false && !consecLossIndices.has(idx + 1)) {
      isolatedLossPnl += t.pnl;
      isolatedCount++;
    }
  });

  console.log('\nIsolated (single) losses:', isolatedCount);
  console.log('Isolated losses PnL:', isolatedLossPnl);
}

analyzeConsecutiveLosses(s1, 'SESSION 1');
console.log('\n\n');
analyzeConsecutiveLosses(s2, 'SESSION 2');
