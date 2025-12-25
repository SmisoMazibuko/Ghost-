const fs = require('fs');

function analyzeSession(filename, label) {
  const data = JSON.parse(fs.readFileSync(`C:\\Users\\Okhantu\\Desktop\\The other income\\ghost-evaluator\\data\\sessions\\${filename}`, 'utf8'));

  console.log(`\n${'='.repeat(70)}`);
  console.log(`SESSION: ${label}`);
  console.log(`${'='.repeat(70)}\n`);

  const trades = data.trades || [];
  const results = data.results || [];
  const blocks = data.blocks || [];

  // Get SameDir trades
  const sdTrades = trades.filter(t => t.pattern === 'SameDir');

  // XAX patterns predict REVERSAL (opposite of SameDir)
  const xaxPatterns = ['2A2', '3A3', '4A4', '5A5', '6A6'];
  // AntiXAX patterns predict CONTINUATION (same as SameDir)
  const antiXaxPatterns = ['Anti2A2', 'Anti3A3', 'Anti4A4', 'Anti5A5', 'Anti6A6'];

  console.log('LOGIC:');
  console.log('  - SameDir bets CONTINUATION (same as previous block)');
  console.log('  - AntiXAX patterns predict CONTINUATION (ALIGN with SameDir)');
  console.log('  - XAX patterns predict REVERSAL (CONFLICT with SameDir)');
  console.log('');

  // For each SameDir trade, check what other patterns were active/signaling
  let sdWithAlignedAntiXax = [];
  let sdWithConflictingXax = [];
  let sdWithNoPatterns = [];
  let sdWithZZ = [];

  sdTrades.forEach(sdTrade => {
    const evalBlock = sdTrade.evalIndex;
    const openBlock = sdTrade.openIndex;

    // Find other trades at the same evalIndex
    const otherTradesAtSameBlock = trades.filter(t =>
      t.evalIndex === evalBlock &&
      t.pattern !== 'SameDir'
    );

    // Find results (signals) that were evaluated at this block
    const resultsAtSameBlock = results.filter(r =>
      r.evalIndex === evalBlock &&
      r.pattern !== 'SameDir'
    );

    // Categorize
    const alignedAntiXax = otherTradesAtSameBlock.filter(t => antiXaxPatterns.includes(t.pattern));
    const conflictingXax = otherTradesAtSameBlock.filter(t => xaxPatterns.includes(t.pattern));
    const zzTrades = otherTradesAtSameBlock.filter(t => t.pattern === 'ZZ' || t.pattern === 'AntiZZ');

    // Also check results (even if not traded)
    const alignedAntiXaxResults = resultsAtSameBlock.filter(r => antiXaxPatterns.includes(r.pattern));
    const conflictingXaxResults = resultsAtSameBlock.filter(r => xaxPatterns.includes(r.pattern));

    const entry = {
      sdTrade,
      alignedAntiXax,
      conflictingXax,
      alignedAntiXaxResults,
      conflictingXaxResults,
      zzTrades
    };

    if (zzTrades.length > 0) {
      sdWithZZ.push(entry);
    } else if (alignedAntiXax.length > 0 || alignedAntiXaxResults.length > 0) {
      sdWithAlignedAntiXax.push(entry);
    } else if (conflictingXax.length > 0 || conflictingXaxResults.length > 0) {
      sdWithConflictingXax.push(entry);
    } else {
      sdWithNoPatterns.push(entry);
    }
  });

  // Analyze each category
  console.log('=== SAMEDIR WHEN ZZ ACTIVE ===');
  if (sdWithZZ.length > 0) {
    const wins = sdWithZZ.filter(e => e.sdTrade.isWin).length;
    const pnl = sdWithZZ.reduce((sum, e) => sum + e.sdTrade.pnl, 0);
    console.log(`  Count: ${sdWithZZ.length}, Wins: ${wins}, Win Rate: ${Math.round((wins/sdWithZZ.length)*100)}%`);
    console.log(`  PnL: ${Math.round(pnl)}`);
    console.log('  Details:');
    sdWithZZ.slice(0, 5).forEach(e => {
      const zzWon = e.zzTrades[0]?.isWin;
      console.log(`    Block ${e.sdTrade.evalIndex}: SD ${e.sdTrade.isWin ? 'WIN' : 'LOSS'} ${Math.round(e.sdTrade.pnl)}, ZZ ${zzWon ? 'WIN' : 'LOSS'}`);
    });
    if (sdWithZZ.length > 5) console.log(`    ... and ${sdWithZZ.length - 5} more`);
  } else {
    console.log('  No cases found');
  }

  console.log('\n=== SAMEDIR WHEN ANTI-XAX ALIGNED (should be good) ===');
  if (sdWithAlignedAntiXax.length > 0) {
    const wins = sdWithAlignedAntiXax.filter(e => e.sdTrade.isWin).length;
    const pnl = sdWithAlignedAntiXax.reduce((sum, e) => sum + e.sdTrade.pnl, 0);
    console.log(`  Count: ${sdWithAlignedAntiXax.length}, Wins: ${wins}, Win Rate: ${Math.round((wins/sdWithAlignedAntiXax.length)*100)}%`);
    console.log(`  PnL: ${Math.round(pnl)}`);

    // Check if Anti-XAX was also correct
    const antiXaxAlsoWon = sdWithAlignedAntiXax.filter(e => {
      const antiResult = e.alignedAntiXaxResults[0] || e.alignedAntiXax[0];
      return antiResult && (antiResult.profit > 0 || antiResult.isWin);
    });
    console.log(`  Anti-XAX also correct: ${antiXaxAlsoWon.length}/${sdWithAlignedAntiXax.length}`);

    console.log('  Details:');
    sdWithAlignedAntiXax.slice(0, 5).forEach(e => {
      const antiPattern = e.alignedAntiXax[0]?.pattern || e.alignedAntiXaxResults[0]?.pattern;
      const antiWon = e.alignedAntiXax[0]?.isWin ?? (e.alignedAntiXaxResults[0]?.profit > 0);
      console.log(`    Block ${e.sdTrade.evalIndex}: SD ${e.sdTrade.isWin ? 'WIN' : 'LOSS'} ${Math.round(e.sdTrade.pnl)}, ${antiPattern} ${antiWon ? 'WIN' : 'LOSS'}`);
    });
    if (sdWithAlignedAntiXax.length > 5) console.log(`    ... and ${sdWithAlignedAntiXax.length - 5} more`);
  } else {
    console.log('  No cases found');
  }

  console.log('\n=== SAMEDIR WHEN XAX CONFLICTING (should be bad) ===');
  if (sdWithConflictingXax.length > 0) {
    const wins = sdWithConflictingXax.filter(e => e.sdTrade.isWin).length;
    const pnl = sdWithConflictingXax.reduce((sum, e) => sum + e.sdTrade.pnl, 0);
    console.log(`  Count: ${sdWithConflictingXax.length}, Wins: ${wins}, Win Rate: ${Math.round((wins/sdWithConflictingXax.length)*100)}%`);
    console.log(`  PnL: ${Math.round(pnl)}`);

    // Check if XAX was correct (meaning SameDir should have lost)
    const xaxWasCorrect = sdWithConflictingXax.filter(e => {
      const xaxResult = e.conflictingXaxResults[0] || e.conflictingXax[0];
      return xaxResult && (xaxResult.profit > 0 || xaxResult.isWin);
    });
    console.log(`  XAX was correct (SD should lose): ${xaxWasCorrect.length}/${sdWithConflictingXax.length}`);

    console.log('  Details:');
    sdWithConflictingXax.slice(0, 5).forEach(e => {
      const xaxPattern = e.conflictingXax[0]?.pattern || e.conflictingXaxResults[0]?.pattern;
      const xaxWon = e.conflictingXax[0]?.isWin ?? (e.conflictingXaxResults[0]?.profit > 0);
      console.log(`    Block ${e.sdTrade.evalIndex}: SD ${e.sdTrade.isWin ? 'WIN' : 'LOSS'} ${Math.round(e.sdTrade.pnl)}, ${xaxPattern} ${xaxWon ? 'WIN' : 'LOSS'}`);
    });
    if (sdWithConflictingXax.length > 5) console.log(`    ... and ${sdWithConflictingXax.length - 5} more`);
  } else {
    console.log('  No cases found');
  }

  console.log('\n=== SAMEDIR WITH NO BUCKET PATTERN SIGNALS ===');
  if (sdWithNoPatterns.length > 0) {
    const wins = sdWithNoPatterns.filter(e => e.sdTrade.isWin).length;
    const pnl = sdWithNoPatterns.reduce((sum, e) => sum + e.sdTrade.pnl, 0);
    console.log(`  Count: ${sdWithNoPatterns.length}, Wins: ${wins}, Win Rate: ${Math.round((wins/sdWithNoPatterns.length)*100)}%`);
    console.log(`  PnL: ${Math.round(pnl)}`);
  } else {
    console.log('  No cases found');
  }

  // Summary
  console.log('\n=== SUMMARY ===');
  const totalSD = sdTrades.length;
  const totalSDPnl = sdTrades.reduce((sum, t) => sum + t.pnl, 0);
  console.log(`Total SameDir Trades: ${totalSD}, PnL: ${Math.round(totalSDPnl)}`);
  console.log(`  With ZZ: ${sdWithZZ.length} trades, PnL: ${Math.round(sdWithZZ.reduce((s,e) => s + e.sdTrade.pnl, 0))}`);
  console.log(`  With Anti-XAX (aligned): ${sdWithAlignedAntiXax.length} trades, PnL: ${Math.round(sdWithAlignedAntiXax.reduce((s,e) => s + e.sdTrade.pnl, 0))}`);
  console.log(`  With XAX (conflicting): ${sdWithConflictingXax.length} trades, PnL: ${Math.round(sdWithConflictingXax.reduce((s,e) => s + e.sdTrade.pnl, 0))}`);
  console.log(`  No pattern overlap: ${sdWithNoPatterns.length} trades, PnL: ${Math.round(sdWithNoPatterns.reduce((s,e) => s + e.sdTrade.pnl, 0))}`);

  return { sdWithZZ, sdWithAlignedAntiXax, sdWithConflictingXax, sdWithNoPatterns };
}

// Analyze all three sessions
analyzeSession('session_2025-12-17T16-22-57-249Z.json', '16:22 (SameDir +346)');
analyzeSession('session_2025-12-17T19-38-31-098Z.json', '19:38 (SameDir -236)');
analyzeSession('session_2025-12-17T19-53-31-143Z.json', '19:53 (SameDir +330)');
