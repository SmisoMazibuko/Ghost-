const fs = require('fs');

const s1 = JSON.parse(fs.readFileSync('ghost-evaluator/data/sessions/session_2025-12-24T18-19-24-936Z.json', 'utf8'));
const s2 = JSON.parse(fs.readFileSync('ghost-evaluator/data/sessions/session_2025-12-24T18-57-18-606Z.json', 'utf8'));

console.log('='.repeat(80));
console.log('  ZZ/XAX BREAK AS RESUME INDICATOR');
console.log('  PAUSE: HIGH_PCT or CONSEC_LOSS (existing triggers)');
console.log('  RESUME: Only when ZZ/XAX breaks (loses)');
console.log('='.repeat(80));

const ZZ_XAX_PATTERNS = ['ZZ', 'AntiZZ', '2A2', '3A3', '4A4', '5A5', 'Anti2A2', 'Anti3A3', 'Anti4A4', 'Anti5A5'];

function simulate(data, sessionName) {
  console.log('\n\n' + '='.repeat(80));
  console.log(`  ${sessionName}`);
  console.log('='.repeat(80));

  const blocks = data.blocks;
  const trades = data.trades.sort((a, b) => a.openIndex - b.openIndex);
  const zzXaxTrades = trades.filter(t => ZZ_XAX_PATTERNS.includes(t.pattern));
  const sameDirTrades = trades.filter(t => t.pattern === 'SameDir');

  let isPaused = false;
  let pauseReason = '';
  let consecutiveLosses = 0;

  let realPnL = 0;
  let imgPnL = 0;
  let realTrades = 0;
  let imgTrades = 0;

  // Track last ZZ/XAX result
  let lastZZResult = null; // 'WIN' or 'LOSS'
  let lastZZBlock = -1;

  console.log('\n--- TRADE-BY-TRADE ---\n');
  console.log('Blk | Result | PnL   | ConsecL | LastZZ      | Paused | Type | Event');
  console.log('----|--------|-------|---------|-------------|--------|------|-------');

  sameDirTrades.forEach(trade => {
    const evalBlock = blocks[trade.evalIndex];
    const prevBlock = trade.evalIndex > 0 ? blocks[trade.evalIndex - 1] : null;
    const isReversal = prevBlock && evalBlock.dir !== prevBlock.dir;
    const isHighPctReversal = isReversal && evalBlock.pct >= 70;

    // Get last ZZ/XAX result before this trade
    const recentZZ = zzXaxTrades.filter(zz => zz.openIndex < trade.openIndex);
    if (recentZZ.length > 0) {
      const last = recentZZ[recentZZ.length - 1];
      lastZZResult = last.isWin ? 'WIN' : 'LOSS';
      lastZZBlock = last.openIndex;
    }

    let event = '';

    // PAUSE triggers (existing logic)
    if (!isPaused) {
      let shouldPause = false;

      // Trigger 1: HIGH_PCT reversal + loss
      if (isHighPctReversal && !trade.isWin) {
        shouldPause = true;
        pauseReason = `HIGH_PCT ${evalBlock.pct}%`;
      }

      // Trigger 2: 2+ consecutive losses
      if (consecutiveLosses >= 1 && !trade.isWin) {
        shouldPause = true;
        pauseReason = pauseReason ? pauseReason : `CONSEC ${consecutiveLosses + 1}L`;
      }

      if (shouldPause) {
        isPaused = true;
        event = '>>> PAUSE';
      }
    }

    // Determine trade type BEFORE checking resume
    let tradeType = isPaused ? 'IMG' : 'REAL';

    // RESUME trigger: ZZ/XAX just broke
    if (isPaused && lastZZResult === 'LOSS') {
      // ZZ broke - resume SD
      isPaused = false;
      pauseReason = '';
      tradeType = 'REAL'; // This trade is real because ZZ just broke
      event = '<<< RESUME (ZZ broke)';
    }

    // Track PnL
    if (tradeType === 'REAL') {
      realPnL += trade.pnl;
      realTrades++;
      if (trade.isWin) consecutiveLosses = 0;
      else consecutiveLosses++;
    } else {
      imgPnL += trade.pnl;
      imgTrades++;
    }

    const result = trade.isWin ? 'WIN' : 'LOSS';
    const pnlStr = (trade.pnl >= 0 ? '+' : '') + trade.pnl.toFixed(0);
    const lastZZStr = lastZZResult ? `${lastZZResult} @${lastZZBlock}` : 'NONE';

    console.log(
      String(trade.openIndex).padStart(3) + ' | ' +
      result.padEnd(6) + ' | ' +
      pnlStr.padStart(5) + ' | ' +
      String(consecutiveLosses).padStart(7) + ' | ' +
      lastZZStr.padEnd(11) + ' | ' +
      (isPaused ? 'YES' : 'NO').padEnd(6) + ' | ' +
      tradeType.padEnd(4) + ' | ' +
      event
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

const r1 = simulate(s1, 'SESSION 1');
const r2 = simulate(s2, 'SESSION 2');

console.log('\n\n' + '='.repeat(80));
console.log('  COMPARISON WITH OTHER APPROACHES');
console.log('='.repeat(80));

console.log('\n| Approach | S1 Imp | S2 Imp | Total |');
console.log('|----------|--------|--------|-------|');
console.log(`| ZZ BREAK resume | ${String(r1.improvement).padStart(6)} | ${String(r2.improvement).padStart(6)} | ${String(r1.improvement + r2.improvement).padStart(5)} |`);
console.log(`| Imaginary wins resume (earlier) | +884 | +322 | +1206 |`);
console.log(`| HIGH_PCT only (earlier) | +816 | +322 | +1138 |`);

console.log('\n--- RULE ---\n');
console.log('PAUSE when: HIGH_PCT ≥70% reversal + loss OR 2+ consecutive losses');
console.log('RESUME when: ZZ/XAX breaks (loses)');
