const fs = require('fs');

function analyzeSession(filename, label) {
  const data = JSON.parse(fs.readFileSync(`C:\\Users\\Okhantu\\Desktop\\The other income\\ghost-evaluator\\data\\sessions\\${filename}`, 'utf8'));

  const trades = data.trades || [];
  const blocks = data.blocks || [];
  const sdTrades = trades.filter(t => t.pattern === 'SameDir');

  // Simulate alternation detection
  // Count consecutive singles at each block
  function getConsecutiveSinglesAt(blocks, targetIndex) {
    let count = 0;
    let runLengths = [];

    // Build run lengths up to target
    let runLen = 1, runDir = null;
    for (let i = 0; i <= targetIndex && i < blocks.length; i++) {
      if (runDir === null) {
        runDir = blocks[i].dir;
        runLen = 1;
      } else if (blocks[i].dir === runDir) {
        runLen++;
      } else {
        runLengths.push(runLen);
        runDir = blocks[i].dir;
        runLen = 1;
      }
    }
    runLengths.push(runLen); // Current run

    // Count consecutive singles from the end
    for (let i = runLengths.length - 1; i >= 0; i--) {
      if (runLengths[i] === 1) {
        count++;
      } else {
        break;
      }
    }
    return count;
  }

  // Categorize trades
  let wouldSkip = [];  // Consecutive singles >= 2
  let wouldBet = [];   // Not in alternation

  sdTrades.forEach(sd => {
    const consecutiveSingles = getConsecutiveSinglesAt(blocks, sd.openIndex);

    if (consecutiveSingles >= 2) {
      wouldSkip.push({ sd, consecutiveSingles });
    } else {
      wouldBet.push({ sd, consecutiveSingles });
    }
  });

  const skipPnl = wouldSkip.reduce((s, e) => s + e.sd.pnl, 0);
  const betPnl = wouldBet.reduce((s, e) => s + e.sd.pnl, 0);
  const skipWins = wouldSkip.filter(e => e.sd.isWin).length;
  const betWins = wouldBet.filter(e => e.sd.isWin).length;

  return {
    label,
    total: sdTrades.length,
    totalPnl: sdTrades.reduce((s, t) => s + t.pnl, 0),
    wouldSkip: wouldSkip.length,
    skipPnl,
    skipWinRate: wouldSkip.length > 0 ? Math.round((skipWins / wouldSkip.length) * 100) : 0,
    wouldBet: wouldBet.length,
    betPnl,
    betWinRate: wouldBet.length > 0 ? Math.round((betWins / wouldBet.length) * 100) : 0,
    improvement: -skipPnl, // Negative of skip PnL = savings
    wouldSkipDetails: wouldSkip,
    wouldBetDetails: wouldBet
  };
}

console.log('=== WHAT ALTERNATION DETECTION ACHIEVES ===\n');

const sessions = [
  { file: 'session_2025-12-17T16-22-57-249Z.json', label: '16:22' },
  { file: 'session_2025-12-17T19-38-31-098Z.json', label: '19:38' },
  { file: 'session_2025-12-17T19-53-31-143Z.json', label: '19:53' },
  { file: 'session_2025-12-17T21-37-51-550Z.json', label: '21:37' }
];

const results = sessions.map(s => analyzeSession(s.file, s.label));

console.log('RULE: Skip SameDir when 2+ consecutive singles detected\n');
console.log('Session | Total SD | Skip (alternation) | Bet (after double) | Improvement');
console.log('--------|----------|-------------------|--------------------|-----------');

results.forEach(r => {
  console.log(
    r.label.padEnd(7) + ' | ' +
    String(r.total).padStart(8) + ' | ' +
    `${r.wouldSkip} trades, ${r.skipWinRate}% win`.padStart(17) + ' | ' +
    `${r.wouldBet} trades, ${r.betWinRate}% win`.padStart(18) + ' | ' +
    String(Math.round(r.improvement)).padStart(10)
  );
});

console.log('\n=== DETAILED BREAKDOWN ===\n');

results.forEach(r => {
  console.log(`--- ${r.label} ---`);
  console.log(`Current SameDir PnL: ${Math.round(r.totalPnl)}`);
  console.log(`Would SKIP (alternation): ${r.wouldSkip} trades, PnL: ${Math.round(r.skipPnl)}, Win Rate: ${r.skipWinRate}%`);
  console.log(`Would BET (after double): ${r.wouldBet} trades, PnL: ${Math.round(r.betPnl)}, Win Rate: ${r.betWinRate}%`);
  console.log(`NEW SameDir PnL would be: ${Math.round(r.betPnl)}`);
  console.log(`Improvement: ${Math.round(r.improvement)}\n`);
});

// Summary
console.log('=== SUMMARY ===\n');
const totalCurrent = results.reduce((s, r) => s + r.totalPnl, 0);
const totalNew = results.reduce((s, r) => s + r.betPnl, 0);
const totalImprovement = results.reduce((s, r) => s + r.improvement, 0);

console.log(`Total SameDir PnL (current): ${Math.round(totalCurrent)}`);
console.log(`Total SameDir PnL (with alternation skip): ${Math.round(totalNew)}`);
console.log(`Total Improvement: ${Math.round(totalImprovement)}`);

// Show what gets skipped in detail for the bad session
console.log('\n=== WHAT WOULD BE SKIPPED IN SESSION 21:37 ===\n');
const badSession = results.find(r => r.label === '21:37');
if (badSession) {
  console.log('Trades during alternation (would be SKIPPED):');
  badSession.wouldSkipDetails.slice(0, 15).forEach(e => {
    console.log(`  Block ${e.sd.openIndex}: ${e.consecutiveSingles} consecutive singles → ${e.sd.isWin ? 'WIN' : 'LOSS'} ${Math.round(e.sd.pnl)}`);
  });
  if (badSession.wouldSkipDetails.length > 15) {
    console.log(`  ... and ${badSession.wouldSkipDetails.length - 15} more`);
  }
  console.log(`\nTotal skipped: ${badSession.wouldSkip} trades, PnL: ${Math.round(badSession.skipPnl)}`);
}
