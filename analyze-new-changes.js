const fs = require('fs');

const data = JSON.parse(fs.readFileSync('C:\\Users\\Okhantu\\Desktop\\The other income\\ghost-evaluator\\data\\sessions\\session_2025-12-17T21-37-51-550Z.json', 'utf8'));

console.log('=== SESSION: 2025-12-17T21-37-51 (WITH XAX/OZ/PP CHECK) ===\n');

// Session summary
console.log('SESSION SUMMARY:');
console.log('Total PnL:', data.pnlTotal);
console.log('Total Trades:', data.trades ? data.trades.length : 0);
console.log('Total Blocks:', data.blocks ? data.blocks.length : 0);

if (data.trades && data.trades.length > 0) {
  const wins = data.trades.filter(t => t.isWin).length;
  console.log('Win Rate:', Math.round((wins / data.trades.length) * 100) + '%');
}

// Pattern performance from trades
console.log('\n=== TRADE PERFORMANCE BY PATTERN ===\n');
const tradesByPattern = {};
if (data.trades) {
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
}

// SameDir detailed analysis
console.log('\n=== SAMEDIR ANALYSIS ===\n');
const sdTrades = data.trades ? data.trades.filter(t => t.pattern === 'SameDir') : [];
if (sdTrades.length > 0) {
  const sdWins = sdTrades.filter(t => t.isWin).length;
  const sdPnl = sdTrades.reduce((sum, t) => sum + t.pnl, 0);
  console.log('SameDir Trades:', sdTrades.length);
  console.log('SameDir Wins:', sdWins);
  console.log('SameDir Win Rate:', Math.round((sdWins / sdTrades.length) * 100) + '%');
  console.log('SameDir Total PnL:', Math.round(sdPnl));
} else {
  console.log('No SameDir trades (possibly skipped due to XAX/OZ/PP in MAIN)');
}

// ZZ Analysis
console.log('\n=== ZZ/AntiZZ ANALYSIS ===\n');
const zzTrades = data.trades ? data.trades.filter(t => t.pattern === 'ZZ' || t.pattern === 'AntiZZ') : [];
if (zzTrades.length > 0) {
  const zzWins = zzTrades.filter(t => t.isWin).length;
  const zzPnl = zzTrades.reduce((sum, t) => sum + t.pnl, 0);
  console.log('ZZ/AntiZZ Trades:', zzTrades.length);
  console.log('ZZ/AntiZZ Wins:', zzWins);
  console.log('ZZ/AntiZZ Win Rate:', Math.round((zzWins / zzTrades.length) * 100) + '%');
  console.log('ZZ/AntiZZ Total PnL:', Math.round(zzPnl));
} else {
  console.log('No ZZ/AntiZZ trades');
}

// Compare with previous sessions
console.log('\n=== SESSION COMPARISON ===\n');
const sessions = [
  { file: 'session_2025-12-17T16-22-57-249Z.json', label: '16:22 (before fix)' },
  { file: 'session_2025-12-17T19-38-31-098Z.json', label: '19:38 (before fix)' },
  { file: 'session_2025-12-17T19-53-31-143Z.json', label: '19:53 (before fix)' },
  { file: 'session_2025-12-17T21-37-51-550Z.json', label: '21:37 (WITH FIX)' }
];

console.log('Session              | Total PnL | SD Trades | SD PnL | SD Win% | ZZ PnL');
console.log('---------------------|-----------|-----------|--------|---------|-------');

sessions.forEach(s => {
  try {
    const d = JSON.parse(fs.readFileSync(`C:\\Users\\Okhantu\\Desktop\\The other income\\ghost-evaluator\\data\\sessions\\${s.file}`, 'utf8'));
    const sd = d.trades ? d.trades.filter(t => t.pattern === 'SameDir') : [];
    const zz = d.trades ? d.trades.filter(t => t.pattern === 'ZZ' || t.pattern === 'AntiZZ') : [];
    const sdWins = sd.filter(t => t.isWin).length;
    const sdWinRate = sd.length > 0 ? Math.round((sdWins / sd.length) * 100) : 0;

    console.log(
      s.label.padEnd(20) + ' | ' +
      String(d.pnlTotal).padStart(9) + ' | ' +
      String(sd.length).padStart(9) + ' | ' +
      String(Math.round(sd.reduce((sum, t) => sum + t.pnl, 0))).padStart(6) + ' | ' +
      String(sdWinRate + '%').padStart(7) + ' | ' +
      String(Math.round(zz.reduce((sum, t) => sum + t.pnl, 0))).padStart(6)
    );
  } catch (e) {
    console.log(s.label + ': Error loading - ' + e.message);
  }
});

// Check for SameDir skips in logs (if available)
console.log('\n=== CHECKING FOR SAMEDIR SKIPS ===');
console.log('(Look for "SameDir SKIPPED" in console output during session)');
