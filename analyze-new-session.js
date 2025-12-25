const fs = require('fs');
const data = JSON.parse(fs.readFileSync('C:\\Users\\Okhantu\\Desktop\\The other income\\ghost-evaluator\\data\\sessions\\session_2025-12-17T19-38-31-098Z.json', 'utf8'));

console.log('=== SESSION ANALYSIS: 2025-12-17T19-38-31 ===\n');

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

// Same Direction specific analysis
console.log('\n=== SAME DIRECTION ANALYSIS ===\n');
if (data.trades) {
  const sdTrades = data.trades.filter(t => t.pattern === 'SameDir');
  if (sdTrades.length > 0) {
    const sdWins = sdTrades.filter(t => t.isWin).length;
    const sdPnl = sdTrades.reduce((sum, t) => sum + t.pnl, 0);
    console.log('SameDir Trades:', sdTrades.length);
    console.log('SameDir Wins:', sdWins);
    console.log('SameDir Win Rate:', Math.round((sdWins / sdTrades.length) * 100) + '%');
    console.log('SameDir Total PnL:', Math.round(sdPnl));
  } else {
    console.log('No SameDir trades found');
  }
}

// ZZ Analysis
console.log('\n=== ZZ/AntiZZ ANALYSIS ===\n');
if (data.trades) {
  const zzTrades = data.trades.filter(t => t.pattern === 'ZZ' || t.pattern === 'AntiZZ');
  if (zzTrades.length > 0) {
    const zzWins = zzTrades.filter(t => t.isWin).length;
    const zzPnl = zzTrades.reduce((sum, t) => sum + t.pnl, 0);
    console.log('ZZ/AntiZZ Trades:', zzTrades.length);
    console.log('ZZ/AntiZZ Wins:', zzWins);
    console.log('ZZ/AntiZZ Win Rate:', Math.round((zzWins / zzTrades.length) * 100) + '%');
    console.log('ZZ/AntiZZ Total PnL:', Math.round(zzPnl));

    console.log('\nZZ/AntiZZ Trade Details:');
    zzTrades.forEach(t => {
      console.log(`  Block ${t.openIndex}->${t.evalIndex}: ${t.pattern} ${t.isWin ? 'WIN' : 'LOSS'} ${Math.round(t.pnl)}`);
    });
  } else {
    console.log('No ZZ/AntiZZ trades found');
  }
}

// Run data analysis
if (data.runData) {
  console.log('\n=== RUN DATA (Last 15) ===\n');
  console.log('Lengths:', data.runData.lengths.slice(-15));
  console.log('Current:', data.runData.currentLength, data.runData.currentDirection === 1 ? 'GREEN' : 'RED');

  // Check for ZZ indicator
  console.log('\n=== ZZ INDICATOR CHECK ===');
  const lengths = data.runData.lengths;
  let foundIndicator = false;
  for (let i = lengths.length - 10; i < lengths.length - 3; i++) {
    if (i < 0) continue;
    if (lengths[i] >= 2) {
      let allOnes = true;
      let onesCount = 0;
      for (let j = i + 1; j < lengths.length; j++) {
        if (lengths[j] === 1) {
          onesCount++;
        } else {
          allOnes = false;
          break;
        }
      }
      if (allOnes && onesCount >= 3) {
        console.log(`ZZ indicator at run ${i}: indicator=${lengths[i]}, followed by ${onesCount} ones`);
        foundIndicator = true;
      }
    }
  }
  if (!foundIndicator) {
    console.log('No active ZZ indicator pattern found');
  }
}

// Comparison with previous session
console.log('\n=== COMPARISON WITH PREVIOUS SESSION ===\n');
try {
  const prevData = JSON.parse(fs.readFileSync('C:\\Users\\Okhantu\\Desktop\\The other income\\ghost-evaluator\\data\\sessions\\session_2025-12-17T16-22-57-249Z.json', 'utf8'));

  const prevSdTrades = prevData.trades ? prevData.trades.filter(t => t.pattern === 'SameDir') : [];
  const prevSdPnl = prevSdTrades.reduce((sum, t) => sum + t.pnl, 0);

  const currSdTrades = data.trades ? data.trades.filter(t => t.pattern === 'SameDir') : [];
  const currSdPnl = currSdTrades.reduce((sum, t) => sum + t.pnl, 0);

  console.log('                  | Previous | Current  | Change');
  console.log('------------------|----------|----------|--------');
  console.log('Total PnL         | ' + String(prevData.pnlTotal).padStart(8) + ' | ' + String(data.pnlTotal).padStart(8) + ' | ' + String(data.pnlTotal - prevData.pnlTotal).padStart(6));
  console.log('SameDir PnL       | ' + String(Math.round(prevSdPnl)).padStart(8) + ' | ' + String(Math.round(currSdPnl)).padStart(8) + ' | ' + String(Math.round(currSdPnl - prevSdPnl)).padStart(6));
  console.log('SameDir Trades    | ' + String(prevSdTrades.length).padStart(8) + ' | ' + String(currSdTrades.length).padStart(8) + ' |');
} catch (e) {
  console.log('Could not load previous session for comparison');
}
