const fs = require('fs');

function analyzeSession(filename, label) {
  const data = JSON.parse(fs.readFileSync(`C:\\Users\\Okhantu\\Desktop\\The other income\\ghost-evaluator\\data\\sessions\\${filename}`, 'utf8'));

  console.log(`\n${'='.repeat(70)}`);
  console.log(`SESSION: ${label}`);
  console.log(`${'='.repeat(70)}\n`);

  const trades = data.trades || [];
  const results = data.results || [];

  // XAX patterns predict REVERSAL (conflict with SameDir)
  const xaxPatterns = ['2A2', '3A3', '4A4', '5A5', '6A6'];
  // AntiXAX patterns predict CONTINUATION (align with SameDir)
  const antiXaxPatterns = ['Anti2A2', 'Anti3A3', 'Anti4A4', 'Anti5A5', 'Anti6A6'];

  // Get SameDir trades
  const sdTrades = trades.filter(t => t.pattern === 'SameDir');

  // For each SameDir trade, check what bucket patterns were TRADED (meaning they were in MAIN bucket)
  let sdWhenXaxTraded = [];  // XAX in MAIN = conflict
  let sdWhenAntiXaxTraded = [];  // AntiXAX in MAIN = alignment
  let sdAlone = [];

  sdTrades.forEach(sdTrade => {
    const evalBlock = sdTrade.evalIndex;

    // Find OTHER trades at same evalIndex (these were in MAIN bucket)
    const xaxTradedAtBlock = trades.filter(t =>
      t.evalIndex === evalBlock &&
      xaxPatterns.includes(t.pattern)
    );

    const antiXaxTradedAtBlock = trades.filter(t =>
      t.evalIndex === evalBlock &&
      antiXaxPatterns.includes(t.pattern)
    );

    if (xaxTradedAtBlock.length > 0) {
      sdWhenXaxTraded.push({
        sdTrade,
        xaxTrades: xaxTradedAtBlock,
        bothWon: sdTrade.isWin && xaxTradedAtBlock.some(t => t.isWin),
        sdWonXaxLost: sdTrade.isWin && xaxTradedAtBlock.every(t => !t.isWin),
        sdLostXaxWon: !sdTrade.isWin && xaxTradedAtBlock.some(t => t.isWin),
      });
    } else if (antiXaxTradedAtBlock.length > 0) {
      sdWhenAntiXaxTraded.push({
        sdTrade,
        antiXaxTrades: antiXaxTradedAtBlock,
        bothWon: sdTrade.isWin && antiXaxTradedAtBlock.some(t => t.isWin),
        bothLost: !sdTrade.isWin && antiXaxTradedAtBlock.every(t => !t.isWin),
      });
    } else {
      sdAlone.push({ sdTrade });
    }
  });

  // Analysis
  console.log('=== SAMEDIR WHEN XAX IN MAIN (CONFLICT - opposite bets!) ===');
  if (sdWhenXaxTraded.length > 0) {
    const sdWins = sdWhenXaxTraded.filter(e => e.sdTrade.isWin).length;
    const sdPnl = sdWhenXaxTraded.reduce((sum, e) => sum + e.sdTrade.pnl, 0);
    const xaxWins = sdWhenXaxTraded.filter(e => e.xaxTrades.some(t => t.isWin)).length;
    const conflicts = sdWhenXaxTraded.filter(e => e.sdLostXaxWon).length;

    console.log(`  SameDir: ${sdWhenXaxTraded.length} trades, ${sdWins} wins, PnL: ${Math.round(sdPnl)}`);
    console.log(`  XAX patterns won: ${xaxWins}/${sdWhenXaxTraded.length}`);
    console.log(`  SD LOST while XAX WON (XAX was right): ${conflicts}`);
    console.log('');
    console.log('  Details (SD lost, XAX won = evidence of conflict):');
    sdWhenXaxTraded.forEach(e => {
      const xax = e.xaxTrades[0];
      const marker = e.sdLostXaxWon ? '← CONFLICT' : (e.sdWonXaxLost ? '← SD right' : '');
      console.log(`    Block ${e.sdTrade.evalIndex}: SD ${e.sdTrade.isWin ? 'WIN' : 'LOSS'} ${Math.round(e.sdTrade.pnl)}, ${xax.pattern} ${xax.isWin ? 'WIN' : 'LOSS'} ${Math.round(xax.pnl)} ${marker}`);
    });
  } else {
    console.log('  No cases found');
  }

  console.log('\n=== SAMEDIR WHEN ANTI-XAX IN MAIN (ALIGNED - same direction!) ===');
  if (sdWhenAntiXaxTraded.length > 0) {
    const sdWins = sdWhenAntiXaxTraded.filter(e => e.sdTrade.isWin).length;
    const sdPnl = sdWhenAntiXaxTraded.reduce((sum, e) => sum + e.sdTrade.pnl, 0);
    const bothWon = sdWhenAntiXaxTraded.filter(e => e.bothWon).length;
    const bothLost = sdWhenAntiXaxTraded.filter(e => e.bothLost).length;

    console.log(`  SameDir: ${sdWhenAntiXaxTraded.length} trades, ${sdWins} wins, PnL: ${Math.round(sdPnl)}`);
    console.log(`  Both won (confirmation): ${bothWon}`);
    console.log(`  Both lost (market against continuation): ${bothLost}`);
    console.log('');
    console.log('  Details:');
    sdWhenAntiXaxTraded.slice(0, 10).forEach(e => {
      const anti = e.antiXaxTrades[0];
      const marker = e.bothWon ? '← BOTH WON' : (e.bothLost ? '← BOTH LOST' : '');
      console.log(`    Block ${e.sdTrade.evalIndex}: SD ${e.sdTrade.isWin ? 'WIN' : 'LOSS'} ${Math.round(e.sdTrade.pnl)}, ${anti.pattern} ${anti.isWin ? 'WIN' : 'LOSS'} ${Math.round(anti.pnl)} ${marker}`);
    });
    if (sdWhenAntiXaxTraded.length > 10) console.log(`    ... and ${sdWhenAntiXaxTraded.length - 10} more`);
  } else {
    console.log('  No cases found');
  }

  console.log('\n=== SAMEDIR ALONE (no XAX/AntiXAX traded) ===');
  if (sdAlone.length > 0) {
    const sdWins = sdAlone.filter(e => e.sdTrade.isWin).length;
    const sdPnl = sdAlone.reduce((sum, e) => sum + e.sdTrade.pnl, 0);
    console.log(`  SameDir: ${sdAlone.length} trades, ${sdWins} wins (${Math.round((sdWins/sdAlone.length)*100)}%), PnL: ${Math.round(sdPnl)}`);
  } else {
    console.log('  No cases found');
  }

  // Summary
  console.log('\n=== SUMMARY ===');
  console.log(`Total SameDir: ${sdTrades.length} trades, PnL: ${Math.round(sdTrades.reduce((s,t) => s + t.pnl, 0))}`);
  console.log(`  With XAX conflict: ${sdWhenXaxTraded.length} trades, PnL: ${Math.round(sdWhenXaxTraded.reduce((s,e) => s + e.sdTrade.pnl, 0))}`);
  console.log(`  With AntiXAX aligned: ${sdWhenAntiXaxTraded.length} trades, PnL: ${Math.round(sdWhenAntiXaxTraded.reduce((s,e) => s + e.sdTrade.pnl, 0))}`);
  console.log(`  Alone: ${sdAlone.length} trades, PnL: ${Math.round(sdAlone.reduce((s,e) => s + e.sdTrade.pnl, 0))}`);

  // Calculate potential savings
  const conflictLosses = sdWhenXaxTraded
    .filter(e => e.sdLostXaxWon)
    .reduce((sum, e) => sum + Math.abs(e.sdTrade.pnl), 0);
  console.log(`\n  POTENTIAL SAVINGS if we skipped SD when XAX in MAIN: +${Math.round(conflictLosses)}`);
}

analyzeSession('session_2025-12-17T16-22-57-249Z.json', '16:22 (SameDir +346)');
analyzeSession('session_2025-12-17T19-38-31-098Z.json', '19:38 (SameDir -236)');
analyzeSession('session_2025-12-17T19-53-31-143Z.json', '19:53 (SameDir +330)');
