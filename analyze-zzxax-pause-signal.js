const fs = require('fs');

const s1 = JSON.parse(fs.readFileSync('ghost-evaluator/data/sessions/session_2025-12-24T18-19-24-936Z.json', 'utf8'));
const s2 = JSON.parse(fs.readFileSync('ghost-evaluator/data/sessions/session_2025-12-24T18-57-18-606Z.json', 'utf8'));

console.log('='.repeat(80));
console.log('  ZZ/XAX AS PAUSE SIGNAL FOR SAMEDIR');
console.log('  Rule: Pause SD when ZZ/XAX wins, Resume when ZZ/XAX breaks');
console.log('='.repeat(80));

const ZZ_XAX_PATTERNS = ['ZZ', 'AntiZZ', '2A2', '3A3', '4A4', '5A5', 'Anti2A2', 'Anti3A3', 'Anti4A4', 'Anti5A5'];

function simulateZZXAXPauseSignal(data, sessionName, pauseAfterNWins = 1) {
  console.log('\n\n' + '='.repeat(80));
  console.log(`  ${sessionName}`);
  console.log(`  Pause SD after ${pauseAfterNWins} consecutive ZZ/XAX win(s)`);
  console.log('='.repeat(80));

  const trades = data.trades.sort((a, b) => a.openIndex - b.openIndex);

  // Build ZZ/XAX state at each block
  const zzXaxTrades = trades.filter(t => ZZ_XAX_PATTERNS.includes(t.pattern));
  const sameDirTrades = trades.filter(t => t.pattern === 'SameDir');

  // Track ZZ/XAX consecutive wins at each block
  let consecutiveZZWins = 0;
  let lastZZBlock = -1;
  const zzStateAtBlock = {};

  zzXaxTrades.forEach(t => {
    if (t.isWin) {
      consecutiveZZWins++;
    } else {
      consecutiveZZWins = 0;
    }
    // Record state at this block
    zzStateAtBlock[t.openIndex] = {
      consecutiveWins: consecutiveZZWins,
      justBroke: !t.isWin && consecutiveZZWins === 0,
    };
    lastZZBlock = t.openIndex;
  });

  // Simulate SD with ZZ/XAX pause signal
  let isPaused = false;
  let realPnL = 0;
  let imgPnL = 0;
  let realTrades = 0;
  let imgTrades = 0;

  console.log('\n--- TRADE-BY-TRADE ---\n');
  console.log('Block | SD Result | PnL   | ZZ Consec | Paused? | Type');
  console.log('------|-----------|-------|-----------|---------|------');

  sameDirTrades.forEach(t => {
    // Check ZZ/XAX state: find most recent ZZ/XAX trade before this SD trade
    const recentZZ = zzXaxTrades.filter(zz => zz.openIndex < t.openIndex).pop();

    let currentZZConsec = 0;
    let zzJustBroke = false;

    if (recentZZ) {
      const state = zzStateAtBlock[recentZZ.openIndex];
      if (state) {
        currentZZConsec = state.consecutiveWins;
        zzJustBroke = state.justBroke;
      }
    }

    // Pause logic
    if (currentZZConsec >= pauseAfterNWins) {
      isPaused = true;
    }
    if (zzJustBroke) {
      isPaused = false;
    }

    const tradeType = isPaused ? 'IMG' : 'REAL';

    if (tradeType === 'REAL') {
      realPnL += t.pnl;
      realTrades++;
    } else {
      imgPnL += t.pnl;
      imgTrades++;
    }

    const result = t.isWin ? 'WIN ' : 'LOSS';
    const pnlStr = (t.pnl >= 0 ? '+' : '') + t.pnl.toFixed(0);

    console.log(
      String(t.openIndex).padStart(5) + ' | ' +
      result.padEnd(9) + ' | ' +
      pnlStr.padStart(5) + ' | ' +
      String(currentZZConsec).padStart(9) + ' | ' +
      (isPaused ? 'YES' : 'NO').padStart(7) + ' | ' +
      tradeType
    );
  });

  const actualPnL = sameDirTrades.reduce((sum, t) => sum + t.pnl, 0);
  const improvement = realPnL - actualPnL;

  console.log('\n--- SUMMARY ---\n');
  console.log(`Actual SD PnL:     ${actualPnL}`);
  console.log(`Simulated Real:    ${realPnL} (${realTrades} trades)`);
  console.log(`Imaginary:         ${imgPnL} (${imgTrades} trades)`);
  console.log(`Improvement:       ${improvement > 0 ? '+' : ''}${improvement}`);

  return { actualPnL, realPnL, imgPnL, improvement };
}

// Test different thresholds
console.log('\n\n' + '='.repeat(80));
console.log('  TESTING DIFFERENT THRESHOLDS');
console.log('='.repeat(80));

const results = [];

[1, 2, 3].forEach(threshold => {
  console.log(`\n\n${'#'.repeat(80)}`);
  console.log(`  THRESHOLD: Pause after ${threshold} consecutive ZZ/XAX win(s)`);
  console.log(`${'#'.repeat(80)}`);

  const r1 = simulateZZXAXPauseSignal(s1, 'SESSION 1', threshold);
  const r2 = simulateZZXAXPauseSignal(s2, 'SESSION 2', threshold);

  results.push({
    threshold,
    s1: r1.improvement,
    s2: r2.improvement,
    total: r1.improvement + r2.improvement,
  });
});

console.log('\n\n' + '='.repeat(80));
console.log('  COMPARISON');
console.log('='.repeat(80));

console.log('\n| Threshold | S1 Improve | S2 Improve | Total |');
console.log('|-----------|------------|------------|-------|');
results.forEach(r => {
  console.log(`| ${r.threshold} ZZ wins   | ${String(r.s1).padStart(10)} | ${String(r.s2).padStart(10)} | ${String(r.total).padStart(5)} |`);
});

const best = results.reduce((a, b) => a.total > b.total ? a : b);
console.log(`\nBest threshold: ${best.threshold} consecutive ZZ/XAX wins`);
console.log(`Combined improvement: ${best.total}`);
