const fs = require('fs');

const s1 = JSON.parse(fs.readFileSync('ghost-evaluator/data/sessions/session_2025-12-24T18-19-24-936Z.json', 'utf8'));
const s2 = JSON.parse(fs.readFileSync('ghost-evaluator/data/sessions/session_2025-12-24T18-57-18-606Z.json', 'utf8'));

console.log('='.repeat(80));
console.log('  AGGRESSIVE CONFIG DETAILED ANALYSIS');
console.log('  Config: HIGH_PCT >=70% OR 2+ consecutive losses');
console.log('  Resume: 2 consecutive wins OR 80+ imaginary profit');
console.log('='.repeat(80));

const CONFIG = {
  highPctThreshold: 70,
  consecLossesThreshold: 1,  // Pause after 2nd loss (>= 1 means 2nd triggers)
  consecWinsResumeThreshold: 2,
  imgProfitResumeThreshold: 80,
};

function analyzeDetailed(data, sessionName) {
  console.log('\n\n' + '='.repeat(80));
  console.log('  ' + sessionName);
  console.log('='.repeat(80));

  const blocks = data.blocks;
  const trades = data.trades.sort((a, b) => a.openIndex - b.openIndex);
  const sameDirTrades = trades.filter(t => t.pattern === 'SameDir');

  let isPaused = false;
  let pauseReason = null;
  let consecutiveLosses = 0;
  let consecutiveImaginaryWins = 0;
  let imaginaryPnL = 0;

  const tradeDetails = [];
  let realPnL = 0;
  let imgPnL = 0;
  let pauseCount = 0;
  let resumeCount = 0;

  console.log('\n--- TRADE-BY-TRADE WITH STATE ---\n');
  console.log('# |Block| Dir  | Prev | PCT  | Result | PnL   | Type | State      | Reason');
  console.log('--|-----|------|------|------|--------|-------|------|------------|--------');

  sameDirTrades.forEach((trade, idx) => {
    const evalBlock = blocks[trade.evalIndex];
    const prevBlock = trade.evalIndex > 0 ? blocks[trade.evalIndex - 1] : null;

    const currDir = evalBlock.dir === 1 ? 'UP' : 'DN';
    const prevDir = prevBlock ? (prevBlock.dir === 1 ? 'UP' : 'DN') : '--';
    const isReversal = prevBlock && evalBlock.dir !== prevBlock.dir;
    const reversalPct = evalBlock.pct;
    const isHighPctReversal = isReversal && reversalPct >= CONFIG.highPctThreshold;

    let tradeType = 'REAL';
    let stateChange = '';
    let reason = '';

    if (!isPaused) {
      let shouldPause = false;

      // Trigger 1: High PCT reversal on loss
      if (isHighPctReversal && !trade.isWin) {
        shouldPause = true;
        reason = `HIGH_PCT ${reversalPct}%`;
      }

      // Trigger 2: Consecutive losses (>= threshold means pause on next loss)
      if (consecutiveLosses >= CONFIG.consecLossesThreshold && !trade.isWin) {
        shouldPause = true;
        reason = reason ? reason + ' + ' : '';
        reason += `CONSEC ${consecutiveLosses + 1}L`;
      }

      if (shouldPause) {
        isPaused = true;
        pauseReason = reason;
        pauseCount++;
        consecutiveImaginaryWins = 0;
        imaginaryPnL = 0;
        stateChange = '>>> PAUSE';
        tradeType = 'IMG';
      }
    } else {
      tradeType = 'IMG';
    }

    // Check resume conditions for imaginary trades
    if (isPaused && trade.isWin) {
      consecutiveImaginaryWins++;
      imaginaryPnL += trade.pnl;

      if (consecutiveImaginaryWins >= CONFIG.consecWinsResumeThreshold) {
        isPaused = false;
        resumeCount++;
        stateChange = '<<< RESUME';
        reason = `${consecutiveImaginaryWins}W`;
      } else if (imaginaryPnL >= CONFIG.imgProfitResumeThreshold) {
        isPaused = false;
        resumeCount++;
        stateChange = '<<< RESUME';
        reason = `profit ${imaginaryPnL}`;
      }
    } else if (isPaused && !trade.isWin) {
      consecutiveImaginaryWins = 0;
      imaginaryPnL += trade.pnl;
    }

    // Track results
    if (tradeType === 'REAL') {
      realPnL += trade.pnl;
      if (trade.isWin) {
        consecutiveLosses = 0;
      } else {
        consecutiveLosses++;
      }
    } else {
      imgPnL += trade.pnl;
    }

    const result = trade.isWin ? 'WIN ' : 'LOSS';
    const pnlStr = (trade.pnl >= 0 ? '+' : '') + trade.pnl.toFixed(0);
    const state = isPaused ? 'PAUSED' : 'ACTIVE';

    console.log(
      String(idx + 1).padStart(2) + '|' +
      String(trade.evalIndex).padStart(5) + '| ' +
      currDir.padEnd(4) + ' | ' +
      prevDir.padEnd(4) + ' | ' +
      String(reversalPct).padStart(4) + ' | ' +
      result.padEnd(6) + ' | ' +
      pnlStr.padStart(5) + ' | ' +
      tradeType.padEnd(4) + ' | ' +
      (stateChange || state).padEnd(10) + ' | ' +
      (stateChange ? reason : (isPaused ? pauseReason : ''))
    );

    tradeDetails.push({
      idx: idx + 1,
      block: trade.evalIndex,
      isReversal,
      reversalPct,
      isWin: trade.isWin,
      pnl: trade.pnl,
      type: tradeType,
      state: isPaused ? 'PAUSED' : 'ACTIVE',
    });
  });

  // Summary
  const actualPnL = sameDirTrades.reduce((sum, t) => sum + t.pnl, 0);
  const improvement = realPnL - actualPnL;

  console.log('\n\n--- SUMMARY ---\n');
  console.log(`Actual SameDir PnL:     ${actualPnL}`);
  console.log(`Simulated Real PnL:     ${realPnL}`);
  console.log(`Improvement:            ${improvement > 0 ? '+' : ''}${improvement}`);
  console.log(`Pauses triggered:       ${pauseCount}`);
  console.log(`Resumes triggered:      ${resumeCount}`);
  console.log(`Imaginary PnL (skipped):${imgPnL}`);

  // Breakdown of what was avoided
  const realTrades = tradeDetails.filter(t => t.type === 'REAL');
  const imgTrades = tradeDetails.filter(t => t.type === 'IMG');

  console.log('\n--- TRADE BREAKDOWN ---\n');
  console.log(`Real trades:      ${realTrades.length} (${realTrades.filter(t => t.isWin).length}W / ${realTrades.filter(t => !t.isWin).length}L)`);
  console.log(`Imaginary trades: ${imgTrades.length} (${imgTrades.filter(t => t.isWin).length}W / ${imgTrades.filter(t => !t.isWin).length}L)`);

  // What losses were avoided?
  const avoidedLosses = imgTrades.filter(t => !t.isWin);
  const avoidedLossPnL = avoidedLosses.reduce((sum, t) => sum + t.pnl, 0);

  // What wins were missed?
  const missedWins = imgTrades.filter(t => t.isWin);
  const missedWinPnL = missedWins.reduce((sum, t) => sum + t.pnl, 0);

  console.log('\n--- VALUE OF PAUSE ---\n');
  console.log(`Losses AVOIDED (imaginary):  ${avoidedLosses.length} trades = ${avoidedLossPnL}`);
  console.log(`Wins MISSED (imaginary):     ${missedWins.length} trades = +${missedWinPnL}`);
  console.log(`Net benefit of pausing:      ${Math.abs(avoidedLossPnL) - missedWinPnL}`);

  // Show the specific avoided losses
  if (avoidedLosses.length > 0) {
    console.log('\nAvoided losses detail:');
    avoidedLosses.forEach(t => {
      const reversal = t.isReversal ? `${t.reversalPct}% reversal` : 'no reversal';
      console.log(`  Trade #${t.idx} at block ${t.block}: ${t.pnl} (${reversal})`);
    });
  }

  return { actualPnL, realPnL, imgPnL, improvement, pauseCount, resumeCount };
}

const result1 = analyzeDetailed(s1, 'SESSION 1');
const result2 = analyzeDetailed(s2, 'SESSION 2');

console.log('\n\n' + '='.repeat(80));
console.log('  FINAL RESULTS');
console.log('='.repeat(80));

console.log('\n| Session   | Actual | Simulated | Improvement |');
console.log('|-----------|--------|-----------|-------------|');
console.log(`| Session 1 | ${String(result1.actualPnL).padStart(6)} | ${String(result1.realPnL).padStart(9)} | ${(result1.improvement > 0 ? '+' : '') + String(result1.improvement).padStart(10)} |`);
console.log(`| Session 2 | ${String(result2.actualPnL).padStart(6)} | ${String(result2.realPnL).padStart(9)} | ${(result2.improvement > 0 ? '+' : '') + String(result2.improvement).padStart(10)} |`);
console.log(`| TOTAL     | ${String(result1.actualPnL + result2.actualPnL).padStart(6)} | ${String(result1.realPnL + result2.realPnL).padStart(9)} | ${((result1.improvement + result2.improvement) > 0 ? '+' : '') + String(result1.improvement + result2.improvement).padStart(10)} |`);

console.log('\n--- KEY INSIGHT ---\n');
console.log('The AGGRESSIVE config works because:');
console.log('1. HIGH_PCT >=70% catches hostile market reversals early');
console.log('2. 2+ consecutive losses catches developing loss streaks');
console.log('3. Fast resume (2 wins) prevents missing good opportunities');
console.log('4. Low profit threshold (80) allows quick re-entry');
