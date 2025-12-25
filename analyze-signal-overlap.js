const fs = require('fs');

function analyzeSession(filename, label) {
  const data = JSON.parse(fs.readFileSync(`C:\\Users\\Okhantu\\Desktop\\The other income\\ghost-evaluator\\data\\sessions\\${filename}`, 'utf8'));

  console.log(`\n${'='.repeat(70)}`);
  console.log(`SESSION: ${label}`);
  console.log(`${'='.repeat(70)}\n`);

  const trades = data.trades || [];
  const results = data.results || [];  // These are SIGNAL evaluations

  const xaxPatterns = ['2A2', '3A3', '4A4', '5A5', '6A6'];
  const antiXaxPatterns = ['Anti2A2', 'Anti3A3', 'Anti4A4', 'Anti5A5', 'Anti6A6'];

  const sdTrades = trades.filter(t => t.pattern === 'SameDir');

  // For each SameDir trade, check what patterns were SIGNALING (results)
  let sdWhenXaxSignaled = [];
  let sdWhenAntiXaxSignaled = [];
  let sdNoSignals = [];

  sdTrades.forEach(sdTrade => {
    const evalBlock = sdTrade.evalIndex;

    // Find pattern RESULTS (signals evaluated) at same block
    const xaxSignals = results.filter(r =>
      r.evalIndex === evalBlock &&
      xaxPatterns.includes(r.pattern)
    );

    const antiXaxSignals = results.filter(r =>
      r.evalIndex === evalBlock &&
      antiXaxPatterns.includes(r.pattern)
    );

    // XAX predicts reversal - if XAX was RIGHT, SameDir should be WRONG
    // AntiXAX predicts continuation - if AntiXAX was RIGHT, SameDir should be RIGHT

    if (xaxSignals.length > 0) {
      const xaxWasRight = xaxSignals.some(r => r.expectedDirection === r.actualDirection);
      sdWhenXaxSignaled.push({
        sdTrade,
        xaxSignals,
        xaxWasRight,
        // If XAX was right (reversal), SameDir should have lost (continuation bet)
        expectedSdLoss: xaxWasRight,
        actualSdWin: sdTrade.isWin
      });
    }

    if (antiXaxSignals.length > 0) {
      const antiXaxWasRight = antiXaxSignals.some(r => r.expectedDirection === r.actualDirection);
      sdWhenAntiXaxSignaled.push({
        sdTrade,
        antiXaxSignals,
        antiXaxWasRight,
        // If AntiXAX was right (continuation), SameDir should have won
        expectedSdWin: antiXaxWasRight,
        actualSdWin: sdTrade.isWin
      });
    }

    if (xaxSignals.length === 0 && antiXaxSignals.length === 0) {
      sdNoSignals.push({ sdTrade });
    }
  });

  console.log('=== SAMEDIR WHEN XAX SIGNALED (XAX bets REVERSAL, SD bets CONTINUATION) ===');
  if (sdWhenXaxSignaled.length > 0) {
    const sdWins = sdWhenXaxSignaled.filter(e => e.actualSdWin).length;
    const sdPnl = sdWhenXaxSignaled.reduce((sum, e) => sum + e.sdTrade.pnl, 0);
    const xaxCorrect = sdWhenXaxSignaled.filter(e => e.xaxWasRight).length;
    const conflicts = sdWhenXaxSignaled.filter(e => e.xaxWasRight && !e.actualSdWin).length;
    const sdWonDespiteXax = sdWhenXaxSignaled.filter(e => e.xaxWasRight && e.actualSdWin).length;

    console.log(`  SameDir: ${sdWhenXaxSignaled.length} trades, ${sdWins} wins, PnL: ${Math.round(sdPnl)}`);
    console.log(`  XAX signals were correct (reversal happened): ${xaxCorrect}/${sdWhenXaxSignaled.length}`);
    console.log(`  SD lost when XAX was right: ${conflicts} ← AVOIDABLE LOSSES`);
    console.log(`  SD won even when XAX was right: ${sdWonDespiteXax}`);
    console.log('');
    console.log('  Details (XAX right = reversal happened):');
    sdWhenXaxSignaled.forEach(e => {
      const sig = e.xaxSignals[0];
      const xaxResult = sig.expectedDirection === sig.actualDirection ? 'CORRECT' : 'WRONG';
      const marker = (e.xaxWasRight && !e.actualSdWin) ? '← SD SHOULD HAVE SKIPPED' : '';
      console.log(`    Block ${e.sdTrade.evalIndex}: SD ${e.actualSdWin ? 'WIN' : 'LOSS'} ${Math.round(e.sdTrade.pnl)}, ${sig.pattern} ${xaxResult} ${marker}`);
    });

    const avoidableLoss = sdWhenXaxSignaled
      .filter(e => e.xaxWasRight && !e.actualSdWin)
      .reduce((sum, e) => sum + Math.abs(e.sdTrade.pnl), 0);
    console.log(`\n  → If SD skipped when XAX signaled correctly: would save ${Math.round(avoidableLoss)}`);
  } else {
    console.log('  No cases found');
  }

  console.log('\n=== SAMEDIR WHEN ANTI-XAX SIGNALED (both bet CONTINUATION) ===');
  if (sdWhenAntiXaxSignaled.length > 0) {
    const sdWins = sdWhenAntiXaxSignaled.filter(e => e.actualSdWin).length;
    const sdPnl = sdWhenAntiXaxSignaled.reduce((sum, e) => sum + e.sdTrade.pnl, 0);
    const antiXaxCorrect = sdWhenAntiXaxSignaled.filter(e => e.antiXaxWasRight).length;
    const bothRight = sdWhenAntiXaxSignaled.filter(e => e.antiXaxWasRight && e.actualSdWin).length;
    const bothWrong = sdWhenAntiXaxSignaled.filter(e => !e.antiXaxWasRight && !e.actualSdWin).length;

    console.log(`  SameDir: ${sdWhenAntiXaxSignaled.length} trades, ${sdWins} wins, PnL: ${Math.round(sdPnl)}`);
    console.log(`  AntiXAX signals were correct (continuation happened): ${antiXaxCorrect}/${sdWhenAntiXaxSignaled.length}`);
    console.log(`  Both SD and AntiXAX right: ${bothRight} ← GOOD ALIGNMENT`);
    console.log(`  Both SD and AntiXAX wrong: ${bothWrong} ← Market reversed`);
    console.log('');
    console.log('  Details (AntiXAX right = continuation happened):');
    sdWhenAntiXaxSignaled.slice(0, 10).forEach(e => {
      const sig = e.antiXaxSignals[0];
      const antiResult = sig.expectedDirection === sig.actualDirection ? 'CORRECT' : 'WRONG';
      const marker = (e.antiXaxWasRight && e.actualSdWin) ? '← ALIGNED WIN' : ((e.antiXaxWasRight && !e.actualSdWin) ? '← MISMATCH?' : '');
      console.log(`    Block ${e.sdTrade.evalIndex}: SD ${e.actualSdWin ? 'WIN' : 'LOSS'} ${Math.round(e.sdTrade.pnl)}, ${sig.pattern} ${antiResult} ${marker}`);
    });
    if (sdWhenAntiXaxSignaled.length > 10) console.log(`    ... and ${sdWhenAntiXaxSignaled.length - 10} more`);
  } else {
    console.log('  No cases found');
  }

  console.log('\n=== SAMEDIR WITH NO XAX/ANTI-XAX SIGNALS ===');
  if (sdNoSignals.length > 0) {
    const sdWins = sdNoSignals.filter(e => e.sdTrade.isWin).length;
    const sdPnl = sdNoSignals.reduce((sum, e) => sum + e.sdTrade.pnl, 0);
    console.log(`  SameDir: ${sdNoSignals.length} trades, ${sdWins} wins (${Math.round((sdWins/sdNoSignals.length)*100)}%), PnL: ${Math.round(sdPnl)}`);
  } else {
    console.log('  No cases found');
  }

  // Summary
  console.log('\n=== SUMMARY ===');
  const totalPnl = sdTrades.reduce((s,t) => s + t.pnl, 0);
  console.log(`Total SameDir: ${sdTrades.length} trades, PnL: ${Math.round(totalPnl)}`);
  console.log(`  When XAX signaled: ${sdWhenXaxSignaled.length} trades, PnL: ${Math.round(sdWhenXaxSignaled.reduce((s,e) => s + e.sdTrade.pnl, 0))}`);
  console.log(`  When AntiXAX signaled: ${sdWhenAntiXaxSignaled.length} trades, PnL: ${Math.round(sdWhenAntiXaxSignaled.reduce((s,e) => s + e.sdTrade.pnl, 0))}`);
  console.log(`  No signals: ${sdNoSignals.length} trades, PnL: ${Math.round(sdNoSignals.reduce((s,e) => s + e.sdTrade.pnl, 0))}`);
}

analyzeSession('session_2025-12-17T16-22-57-249Z.json', '16:22 (SameDir +346)');
analyzeSession('session_2025-12-17T19-38-31-098Z.json', '19:38 (SameDir -236)');
analyzeSession('session_2025-12-17T19-53-31-143Z.json', '19:53 (SameDir +330)');
