const fs = require('fs');

const s1 = JSON.parse(fs.readFileSync('ghost-evaluator/data/sessions/session_2025-12-24T18-19-24-936Z.json', 'utf8'));
const s2 = JSON.parse(fs.readFileSync('ghost-evaluator/data/sessions/session_2025-12-24T18-57-18-606Z.json', 'utf8'));

console.log('='.repeat(80));
console.log('  ZZ/XAX AS ADDITIONAL EARLY WARNING PAUSE TRIGGER');
console.log('  Testing: When ZZ starts winning, pause SD EARLY (before losses occur)');
console.log('='.repeat(80));

const ZZ_XAX_PATTERNS = ['ZZ', 'AntiZZ', '2A2', '3A3', '4A4', '5A5', 'Anti2A2', 'Anti3A3', 'Anti4A4', 'Anti5A5'];

function simulateEarlyPause(data, sessionName) {
  console.log('\n\n' + '='.repeat(80));
  console.log(`  ${sessionName}`);
  console.log('='.repeat(80));

  const blocks = data.blocks;
  const trades = data.trades.sort((a, b) => a.openIndex - b.openIndex);
  const zzXaxTrades = trades.filter(t => ZZ_XAX_PATTERNS.includes(t.pattern));
  const sameDirTrades = trades.filter(t => t.pattern === 'SameDir');

  // The idea: Use ZZ win as EARLY WARNING to pause BEFORE SD losses pile up
  // Resume when ZZ breaks AND SD shows recovery (imaginary wins)

  let isPaused = false;
  let pauseReason = '';
  let consecutiveLosses = 0;
  let consecutiveImaginaryWins = 0;
  let imaginaryPnL = 0;

  let realPnL = 0;
  let imgPnL = 0;
  let realTrades = 0;
  let imgTrades = 0;

  console.log('\n--- TRADE-BY-TRADE ---\n');
  console.log('Blk | Pattern     | Rslt | PnL   | ZZ State      | Consec L/iW | State');
  console.log('----|-------------|------|-------|---------------|-------------|------');

  // Track ZZ state for each trade
  sameDirTrades.forEach(trade => {
    const evalBlock = blocks[trade.evalIndex];
    const prevBlock = trade.evalIndex > 0 ? blocks[trade.evalIndex - 1] : null;
    const isReversal = prevBlock && evalBlock.dir !== prevBlock.dir;
    const isHighPctReversal = isReversal && evalBlock.pct >= 70;

    // Get ZZ state
    const recentZZ = zzXaxTrades.filter(zz => zz.openIndex < trade.openIndex);
    const lastZZ = recentZZ.length > 0 ? recentZZ[recentZZ.length - 1] : null;

    let zzConsecWins = 0;
    for (let i = recentZZ.length - 1; i >= 0; i--) {
      if (recentZZ[i].isWin) zzConsecWins++;
      else break;
    }

    const zzState = lastZZ ? (lastZZ.isWin ? `${zzConsecWins}W` : 'BROKE') : 'NONE';

    // PAUSE triggers (any of these)
    let shouldPause = false;
    if (!isPaused) {
      // Early warning: ZZ just started winning (1st win signals potential takeover)
      if (zzConsecWins >= 1 && !trade.isWin) {
        shouldPause = true;
        pauseReason = 'ZZ_WARNING';
      }

      // High PCT reversal
      if (isHighPctReversal && !trade.isWin) {
        shouldPause = true;
        pauseReason = pauseReason ? pauseReason + '+HIGH_PCT' : 'HIGH_PCT';
      }

      // Consecutive losses
      if (consecutiveLosses >= 1 && !trade.isWin) {
        shouldPause = true;
        pauseReason = pauseReason ? pauseReason + '+CONSEC_L' : 'CONSEC_L';
      }

      if (shouldPause) {
        isPaused = true;
        consecutiveImaginaryWins = 0;
        imaginaryPnL = 0;
      }
    }

    let tradeType = isPaused ? 'IMG' : 'REAL';

    // RESUME triggers (need BOTH ZZ break AND imaginary recovery)
    if (isPaused) {
      const zzBroke = lastZZ && !lastZZ.isWin;

      if (trade.isWin) {
        consecutiveImaginaryWins++;
        imaginaryPnL += trade.pnl;
      } else {
        consecutiveImaginaryWins = 0;
        imaginaryPnL += trade.pnl;
      }

      // Resume only if: ZZ broke AND (2+ imaginary wins OR 80+ imaginary profit)
      const recoveryConfirmed = consecutiveImaginaryWins >= 2 || imaginaryPnL >= 80;

      if (zzBroke && recoveryConfirmed) {
        isPaused = false;
        pauseReason = '';
      }
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
    const consecStr = isPaused ? `${consecutiveLosses}/${consecutiveImaginaryWins}` : `${consecutiveLosses}/-`;

    console.log(
      String(trade.openIndex).padStart(3) + ' | ' +
      'SameDir'.padEnd(11) + ' | ' +
      result.padEnd(4) + ' | ' +
      pnlStr.padStart(5) + ' | ' +
      zzState.padEnd(13) + ' | ' +
      consecStr.padEnd(11) + ' | ' +
      tradeType + (shouldPause ? ' <<PAUSE' : (tradeType === 'REAL' && !isPaused ? '' : ''))
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

const r1 = simulateEarlyPause(s1, 'SESSION 1');
const r2 = simulateEarlyPause(s2, 'SESSION 2');

console.log('\n\n' + '='.repeat(80));
console.log('  FINAL COMPARISON');
console.log('='.repeat(80));

console.log('\n| Session   | Actual | Simulated | Improvement |');
console.log('|-----------|--------|-----------|-------------|');
console.log(`| Session 1 | ${String(r1.actualPnL).padStart(6)} | ${String(r1.realPnL).padStart(9)} | ${String(r1.improvement).padStart(11)} |`);
console.log(`| Session 2 | ${String(r2.actualPnL).padStart(6)} | ${String(r2.realPnL).padStart(9)} | ${String(r2.improvement).padStart(11)} |`);
console.log(`| TOTAL     | ${String(r1.actualPnL + r2.actualPnL).padStart(6)} | ${String(r1.realPnL + r2.realPnL).padStart(9)} | ${String(r1.improvement + r2.improvement).padStart(11)} |`);

console.log('\n--- RULE SUMMARY ---\n');
console.log('PAUSE when ANY of:');
console.log('  - ZZ/XAX has 1+ consecutive wins (early warning) + SD loss');
console.log('  - High PCT (≥70%) reversal + SD loss');
console.log('  - 2+ consecutive SD losses');
console.log('');
console.log('RESUME when BOTH:');
console.log('  - ZZ/XAX broke (lost)');
console.log('  - AND (2+ imaginary wins OR 80+ imaginary profit)');
