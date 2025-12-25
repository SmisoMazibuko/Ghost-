const fs = require('fs');

const data = JSON.parse(fs.readFileSync('C:\\Users\\Okhantu\\Desktop\\The other income\\ghost-evaluator\\data\\sessions\\session_2025-12-17T21-37-51-550Z.json', 'utf8'));

console.log('=== DEEP ANALYSIS: Did XAX/OZ/PP skip help? ===\n');

const trades = data.trades || [];
const results = data.results || [];
const blocks = data.blocks || [];

const xaxPatterns = ['2A2', '3A3', '4A4', '5A5', '6A6'];
const sdTrades = trades.filter(t => t.pattern === 'SameDir');

// For each SameDir trade, check if XAX was signaling and if it was correct
let sdWhenXaxSignaled = [];
let sdWhenXaxInMain = [];
let sdWhenNoXax = [];

sdTrades.forEach(sdTrade => {
  const evalBlock = sdTrade.evalIndex;

  // Find XAX results at same block
  const xaxResults = results.filter(r =>
    r.evalIndex === evalBlock &&
    xaxPatterns.includes(r.pattern)
  );

  // Find XAX trades at same block (means XAX was in MAIN and played)
  const xaxTrades = trades.filter(t =>
    t.evalIndex === evalBlock &&
    xaxPatterns.includes(t.pattern)
  );

  if (xaxTrades.length > 0) {
    // XAX was traded = XAX was in MAIN
    // This means SameDir SHOULD have been skipped but wasn't!
    const xaxWon = xaxTrades.some(t => t.isWin);
    sdWhenXaxInMain.push({
      sdTrade,
      xaxTrades,
      xaxWon,
      shouldHaveSkipped: true
    });
  } else if (xaxResults.length > 0) {
    // XAX signaled but wasn't traded (not in MAIN)
    const xaxCorrect = xaxResults.some(r => r.expectedDirection === r.actualDirection);
    sdWhenXaxSignaled.push({
      sdTrade,
      xaxResults,
      xaxCorrect
    });
  } else {
    sdWhenNoXax.push({ sdTrade });
  }
});

console.log('=== SAMEDIR WHEN XAX WAS TRADED (XAX in MAIN) ===');
console.log('NOTE: If fix worked, SameDir should NOT trade when XAX is in MAIN!\n');
if (sdWhenXaxInMain.length > 0) {
  console.log(`PROBLEM: ${sdWhenXaxInMain.length} SameDir trades happened when XAX was in MAIN!`);
  console.log('These should have been skipped:\n');
  sdWhenXaxInMain.forEach(e => {
    const xax = e.xaxTrades[0];
    console.log(`  Block ${e.sdTrade.evalIndex}: SD ${e.sdTrade.isWin ? 'WIN' : 'LOSS'} ${Math.round(e.sdTrade.pnl)}, ${xax.pattern} ${xax.isWin ? 'WIN' : 'LOSS'} ${Math.round(xax.pnl)}`);
  });
  const avoidableLoss = sdWhenXaxInMain
    .filter(e => !e.sdTrade.isWin && e.xaxWon)
    .reduce((sum, e) => sum + Math.abs(e.sdTrade.pnl), 0);
  console.log(`\n  Avoidable losses (SD lost, XAX won): ${Math.round(avoidableLoss)}`);
} else {
  console.log('GOOD: No SameDir trades when XAX was in MAIN - fix is working!');
}

console.log('\n=== SAMEDIR WHEN XAX SIGNALED (but not traded) ===');
if (sdWhenXaxSignaled.length > 0) {
  const sdWins = sdWhenXaxSignaled.filter(e => e.sdTrade.isWin).length;
  const sdPnl = sdWhenXaxSignaled.reduce((sum, e) => sum + e.sdTrade.pnl, 0);
  const xaxCorrectCount = sdWhenXaxSignaled.filter(e => e.xaxCorrect).length;

  console.log(`SameDir: ${sdWhenXaxSignaled.length} trades, ${sdWins} wins, PnL: ${Math.round(sdPnl)}`);
  console.log(`XAX was correct (reversal happened): ${xaxCorrectCount}/${sdWhenXaxSignaled.length}`);

  // How many times did SD lose when XAX was correct?
  const sdLostXaxRight = sdWhenXaxSignaled.filter(e => e.xaxCorrect && !e.sdTrade.isWin);
  console.log(`SD lost when XAX was right: ${sdLostXaxRight.length}`);
  const missedSavings = sdLostXaxRight.reduce((sum, e) => sum + Math.abs(e.sdTrade.pnl), 0);
  console.log(`Could have saved if we checked XAX results: ${Math.round(missedSavings)}`);
} else {
  console.log('No cases');
}

console.log('\n=== SAMEDIR WITH NO XAX SIGNALS ===');
if (sdWhenNoXax.length > 0) {
  const sdWins = sdWhenNoXax.filter(e => e.sdTrade.isWin).length;
  const sdPnl = sdWhenNoXax.reduce((sum, e) => sum + e.sdTrade.pnl, 0);
  console.log(`SameDir: ${sdWhenNoXax.length} trades, ${sdWins} wins (${Math.round((sdWins/sdWhenNoXax.length)*100)}%), PnL: ${Math.round(sdPnl)}`);
} else {
  console.log('No cases');
}

// Check OZ and PP too
console.log('\n=== SAMEDIR vs OZ/PP CHECK ===');
const ozTrades = trades.filter(t => t.pattern === 'OZ');
const ppTrades = trades.filter(t => t.pattern === 'PP');

console.log(`OZ trades: ${ozTrades.length}, PnL: ${Math.round(ozTrades.reduce((s,t) => s + t.pnl, 0))}`);
console.log(`PP trades: ${ppTrades.length}, PnL: ${Math.round(ppTrades.reduce((s,t) => s + t.pnl, 0))}`);

// Check if SD traded at same block as OZ/PP
const sdWithOZ = sdTrades.filter(sd => ozTrades.some(oz => oz.evalIndex === sd.evalIndex));
const sdWithPP = sdTrades.filter(sd => ppTrades.some(pp => pp.evalIndex === sd.evalIndex));

console.log(`\nSD traded same block as OZ: ${sdWithOZ.length}`);
console.log(`SD traded same block as PP: ${sdWithPP.length}`);

if (sdWithOZ.length > 0 || sdWithPP.length > 0) {
  console.log('\nPROBLEM: SameDir should have been skipped when OZ/PP in MAIN!');
}

// Summary
console.log('\n=== SUMMARY ===');
console.log(`Total SameDir: ${sdTrades.length} trades, PnL: ${Math.round(sdTrades.reduce((s,t) => s + t.pnl, 0))}`);
console.log(`  When XAX in MAIN: ${sdWhenXaxInMain.length} trades (should be 0!)`);
console.log(`  When XAX signaled: ${sdWhenXaxSignaled.length} trades`);
console.log(`  When no XAX: ${sdWhenNoXax.length} trades`);
