const fs = require('fs');

const s1 = JSON.parse(fs.readFileSync('ghost-evaluator/data/sessions/session_2025-12-24T18-19-24-936Z.json', 'utf8'));
const s2 = JSON.parse(fs.readFileSync('ghost-evaluator/data/sessions/session_2025-12-24T18-57-18-606Z.json', 'utf8'));

console.log('='.repeat(80));
console.log('  ZZ/XAX LAST RESULT AS PAUSE SIGNAL');
console.log('  Rule: Pause SD if last ZZ/XAX was WIN, Resume if last ZZ/XAX was LOSS');
console.log('='.repeat(80));

const ZZ_XAX_PATTERNS = ['ZZ', 'AntiZZ', '2A2', '3A3', '4A4', '5A5', 'Anti2A2', 'Anti3A3', 'Anti4A4', 'Anti5A5'];

function simulateLastResultSignal(data, sessionName) {
  console.log('\n\n' + '='.repeat(80));
  console.log(`  ${sessionName}`);
  console.log('='.repeat(80));

  const trades = data.trades.sort((a, b) => a.openIndex - b.openIndex);
  const zzXaxTrades = trades.filter(t => ZZ_XAX_PATTERNS.includes(t.pattern));
  const sameDirTrades = trades.filter(t => t.pattern === 'SameDir');

  let realPnL = 0;
  let imgPnL = 0;
  let realTrades = 0;
  let imgTrades = 0;

  console.log('\n--- TRADE-BY-TRADE ---\n');
  console.log('Block | SD Result | PnL   | Last ZZ/XAX      | Paused? | Type');
  console.log('------|-----------|-------|------------------|---------|------');

  sameDirTrades.forEach(t => {
    // Find most recent ZZ/XAX trade before this SD trade
    const recentZZ = zzXaxTrades.filter(zz => zz.openIndex < t.openIndex).pop();

    let lastZZResult = 'NONE';
    let isPaused = false;

    if (recentZZ) {
      lastZZResult = recentZZ.isWin ? `WIN ${recentZZ.pattern}` : `LOSS ${recentZZ.pattern}`;
      isPaused = recentZZ.isWin; // Pause if last ZZ was a win
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
      lastZZResult.padEnd(16) + ' | ' +
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

const r1 = simulateLastResultSignal(s1, 'SESSION 1');
const r2 = simulateLastResultSignal(s2, 'SESSION 2');

console.log('\n\n' + '='.repeat(80));
console.log('  SUMMARY');
console.log('='.repeat(80));

console.log('\n| Session   | Actual | Simulated | Improvement |');
console.log('|-----------|--------|-----------|-------------|');
console.log(`| Session 1 | ${String(r1.actualPnL).padStart(6)} | ${String(r1.realPnL).padStart(9)} | ${String(r1.improvement).padStart(11)} |`);
console.log(`| Session 2 | ${String(r2.actualPnL).padStart(6)} | ${String(r2.realPnL).padStart(9)} | ${String(r2.improvement).padStart(11)} |`);
console.log(`| TOTAL     | ${String(r1.actualPnL + r2.actualPnL).padStart(6)} | ${String(r1.realPnL + r2.realPnL).padStart(9)} | ${String(r1.improvement + r2.improvement).padStart(11)} |`);

console.log('\n--- INTERPRETATION ---\n');
console.log('When ZZ/XAX wins: Market is alternating → SD (continuation) will fail');
console.log('When ZZ/XAX loses (breaks): Market is trending → SD will succeed');
