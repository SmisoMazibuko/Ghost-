const fs = require('fs');

const s1 = JSON.parse(fs.readFileSync('ghost-evaluator/data/sessions/session_2025-12-24T18-19-24-936Z.json', 'utf8'));
const s2 = JSON.parse(fs.readFileSync('ghost-evaluator/data/sessions/session_2025-12-24T18-57-18-606Z.json', 'utf8'));

console.log('='.repeat(80));
console.log('  ZZ/XAX PROFIT LEVELS OVER TIME');
console.log('  (To determine correct takeover threshold)');
console.log('='.repeat(80));

const ZZ_XAX_PATTERNS = ['ZZ', 'AntiZZ', '2A2', '3A3', '4A4', '5A5', 'Anti2A2', 'Anti3A3', 'Anti4A4', 'Anti5A5'];

function analyzeZZXAXLevels(data, sessionName) {
  console.log('\n\n' + '='.repeat(80));
  console.log('  ' + sessionName);
  console.log('='.repeat(80));

  const trades = data.trades.sort((a, b) => a.openIndex - b.openIndex);
  const zzXaxTrades = trades.filter(t => ZZ_XAX_PATTERNS.includes(t.pattern));
  const sameDirTrades = trades.filter(t => t.pattern === 'SameDir');

  console.log(`\nTotal ZZ/XAX trades: ${zzXaxTrades.length}`);
  console.log(`Total SameDir trades: ${sameDirTrades.length}`);

  // Calculate running ZZ/XAX PnL
  console.log('\n--- ZZ/XAX RUNNING PNL ---\n');
  console.log('Block | Pattern     | Result | PnL   | Running ZZ/XAX | Would Trigger?');
  console.log('------|-------------|--------|-------|----------------|---------------');

  let runningPnL = 0;
  const thresholds = [50, 100, 150, 200];
  const triggerCounts = { 50: 0, 100: 0, 150: 0, 200: 0 };

  zzXaxTrades.forEach(t => {
    runningPnL += t.pnl;
    const result = t.isWin ? 'WIN ' : 'LOSS';
    const pnlStr = (t.pnl >= 0 ? '+' : '') + t.pnl.toFixed(0);

    // Check which thresholds would trigger
    let triggers = [];
    thresholds.forEach(th => {
      if (runningPnL >= th) {
        triggers.push(th);
        triggerCounts[th]++;
      }
    });

    console.log(
      String(t.openIndex).padStart(5) + ' | ' +
      t.pattern.padEnd(11) + ' | ' +
      result + '  | ' +
      pnlStr.padStart(5) + ' | ' +
      String(runningPnL).padStart(14) + ' | ' +
      (triggers.length > 0 ? triggers.join(', ') : '-')
    );
  });

  // Now check what SD trades would have been affected at each threshold
  console.log('\n\n--- IMPACT ON SAMEDIR AT DIFFERENT THRESHOLDS ---\n');

  thresholds.forEach(threshold => {
    // Calculate running ZZ/XAX PnL for each SD trade
    let runningZZ = 0;
    let sdAffected = 0;
    let sdAffectedPnL = 0;

    // For each SD trade, calculate what ZZ/XAX pnl was at that point
    sameDirTrades.forEach(sd => {
      // Sum ZZ/XAX PnL from trades before this SD trade
      const zzBefore = zzXaxTrades.filter(zz => zz.openIndex < sd.openIndex);
      const zzPnLBefore = zzBefore.reduce((sum, t) => sum + t.pnl, 0);

      if (zzPnLBefore >= threshold) {
        sdAffected++;
        sdAffectedPnL += sd.pnl;
      }
    });

    console.log(`Threshold ${threshold}:`);
    console.log(`  SD trades affected: ${sdAffected} of ${sameDirTrades.length}`);
    console.log(`  SD PnL during ZZ/XAX takeover: ${sdAffectedPnL}`);
    console.log(`  Would avoid: ${sdAffectedPnL < 0 ? Math.abs(sdAffectedPnL) + ' in losses' : 'N/A (would miss ' + sdAffectedPnL + ' in gains)'}`);
    console.log('');
  });

  // Find the optimal threshold
  console.log('--- OPTIMAL ZZ/XAX THRESHOLD ---\n');

  let bestThreshold = null;
  let bestSavings = -Infinity;

  for (let th = 25; th <= 300; th += 25) {
    let sdAffectedPnL = 0;
    sameDirTrades.forEach(sd => {
      const zzBefore = zzXaxTrades.filter(zz => zz.openIndex < sd.openIndex);
      const zzPnLBefore = zzBefore.reduce((sum, t) => sum + t.pnl, 0);
      if (zzPnLBefore >= th) {
        sdAffectedPnL += sd.pnl;
      }
    });

    const savings = sdAffectedPnL < 0 ? Math.abs(sdAffectedPnL) : -sdAffectedPnL;
    console.log(`Threshold ${th}: SD PnL during = ${sdAffectedPnL}, Savings = ${savings}`);

    if (savings > bestSavings) {
      bestSavings = savings;
      bestThreshold = th;
    }
  }

  console.log(`\nBest threshold: ${bestThreshold} (saves ${bestSavings})`);

  return { bestThreshold, bestSavings };
}

const result1 = analyzeZZXAXLevels(s1, 'SESSION 1');
const result2 = analyzeZZXAXLevels(s2, 'SESSION 2');

console.log('\n\n' + '='.repeat(80));
console.log('  CONCLUSION');
console.log('='.repeat(80));

console.log('\nSession 1 optimal ZZ/XAX threshold:', result1.bestThreshold);
console.log('Session 2 optimal ZZ/XAX threshold:', result2.bestThreshold);

// Check if there's a consistent threshold
if (result1.bestSavings > 0 && result2.bestSavings > 0) {
  console.log('\nBoth sessions benefit from ZZ/XAX takeover detection.');
  console.log('Recommended threshold: Consider the lower value to catch more');
} else if (result1.bestSavings > 0 || result2.bestSavings > 0) {
  console.log('\nOnly one session benefits - may be over-optimization');
} else {
  console.log('\nZZ/XAX takeover detection may not be useful for SameDir');
}
