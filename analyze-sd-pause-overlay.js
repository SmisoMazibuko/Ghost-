const fs = require('fs');

const s1 = JSON.parse(fs.readFileSync('ghost-evaluator/data/sessions/session_2025-12-24T18-19-24-936Z.json', 'utf8'));
const s2 = JSON.parse(fs.readFileSync('ghost-evaluator/data/sessions/session_2025-12-24T18-57-18-606Z.json', 'utf8'));

console.log('='.repeat(80));
console.log('  SD PAUSE/RESUME OVERLAY ANALYSIS');
console.log('  (Simulates pause logic on top of existing activation)');
console.log('='.repeat(80));

const CONFIG = {
  HIGH_PCT_THRESHOLD: 70,           // Reversal PCT to trigger pause
  CONSECUTIVE_LOSSES_PAUSE: 2,      // Consecutive losses to trigger pause
  CONSECUTIVE_WINS_RESUME: 3,       // Imaginary wins to resume
  IMAGINARY_PROFIT_RESUME: 100,     // Imaginary profit to resume
};

function analyzeWithPauseOverlay(data, sessionName) {
  console.log('\n\n' + '='.repeat(80));
  console.log('  ' + sessionName);
  console.log('='.repeat(80));

  const blocks = data.blocks;
  const trades = data.trades.sort((a, b) => a.openIndex - b.openIndex);
  const sameDirTrades = trades.filter(t => t.pattern === 'SameDir');

  // Track pause state overlay
  let isPaused = false;
  let pauseReason = null;
  let pauseStartBlock = null;
  let consecutiveLosses = 0;
  let consecutiveImaginaryWins = 0;
  let imaginaryPnL = 0;

  // Results tracking
  let realPnL = 0;
  let realWins = 0;
  let realLosses = 0;
  let imgWins = 0;
  let imgLosses = 0;

  // Detailed log
  const tradeLog = [];
  const pauseEvents = [];

  console.log('\n--- TRADE-BY-TRADE ANALYSIS ---\n');
  console.log('Block | Type   | Result | PnL    | Consec | Pause?  | Reason');
  console.log('------|--------|--------|--------|--------|---------|--------');

  sameDirTrades.forEach((trade, idx) => {
    const evalBlock = blocks[trade.evalIndex];
    const prevBlock = trade.evalIndex > 0 ? blocks[trade.evalIndex - 1] : null;

    // Check for direction reversal with high PCT
    const isReversal = prevBlock && evalBlock.dir !== prevBlock.dir;
    const reversalPct = isReversal ? evalBlock.pct : 0;
    const isHighPctReversal = isReversal && reversalPct >= CONFIG.HIGH_PCT_THRESHOLD;

    // Determine what would happen with pause overlay
    let tradeType = 'REAL';
    let shouldPause = false;
    let shouldResume = false;
    let pauseTrigger = '';

    if (!isPaused) {
      // Check pause triggers
      if (isHighPctReversal && !trade.isWin) {
        shouldPause = true;
        pauseTrigger = `HIGH_PCT ${reversalPct}%`;
      } else if (consecutiveLosses >= CONFIG.CONSECUTIVE_LOSSES_PAUSE && !trade.isWin) {
        shouldPause = true;
        pauseTrigger = `${consecutiveLosses + 1} CONSEC LOSSES`;
      }

      if (shouldPause) {
        isPaused = true;
        pauseReason = pauseTrigger;
        pauseStartBlock = trade.evalIndex;
        consecutiveImaginaryWins = 0;
        imaginaryPnL = 0;
        pauseEvents.push({
          type: 'PAUSE',
          block: trade.evalIndex,
          reason: pauseTrigger,
          tradeIdx: idx + 1,
        });
        tradeType = 'IMG';
      }
    } else {
      // We're paused - this is an imaginary trade
      tradeType = 'IMG';

      // Check resume triggers
      if (trade.isWin) {
        consecutiveImaginaryWins++;
        imaginaryPnL += trade.pnl;

        if (consecutiveImaginaryWins >= CONFIG.CONSECUTIVE_WINS_RESUME) {
          shouldResume = true;
          pauseTrigger = `${consecutiveImaginaryWins} IMG WINS`;
        } else if (imaginaryPnL >= CONFIG.IMAGINARY_PROFIT_RESUME) {
          shouldResume = true;
          pauseTrigger = `IMG PNL ${imaginaryPnL}`;
        }
      } else {
        consecutiveImaginaryWins = 0;
        imaginaryPnL += trade.pnl;
      }

      if (shouldResume) {
        isPaused = false;
        pauseEvents.push({
          type: 'RESUME',
          block: trade.evalIndex,
          reason: pauseTrigger,
          tradeIdx: idx + 1,
          blocksInPause: trade.evalIndex - pauseStartBlock,
        });
        pauseReason = null;
        // This trade is still imaginary, next will be real
      }
    }

    // Track results
    if (tradeType === 'REAL') {
      if (trade.isWin) {
        realWins++;
        realPnL += trade.pnl;
        consecutiveLosses = 0;
      } else {
        realLosses++;
        realPnL += trade.pnl;
        consecutiveLosses++;
      }
    } else {
      if (trade.isWin) {
        imgWins++;
      } else {
        imgLosses++;
      }
    }

    // Log entry
    const result = trade.isWin ? 'WIN ' : 'LOSS';
    const pnlStr = (trade.pnl >= 0 ? '+' : '') + trade.pnl.toFixed(0);
    const pauseStatus = isPaused ? 'PAUSED' : (shouldPause ? '→PAUSE' : (shouldResume ? '→RESUME' : ''));
    const reasonStr = shouldPause ? pauseTrigger : (shouldResume ? pauseTrigger : (isPaused ? pauseReason : ''));

    console.log(
      String(trade.evalIndex).padStart(5) + ' | ' +
      tradeType.padEnd(6) + ' | ' +
      result + '  | ' +
      pnlStr.padStart(6) + ' | ' +
      String(tradeType === 'REAL' ? consecutiveLosses : consecutiveImaginaryWins).padStart(6) + ' | ' +
      pauseStatus.padEnd(7) + ' | ' +
      reasonStr
    );

    tradeLog.push({
      block: trade.evalIndex,
      type: tradeType,
      isWin: trade.isWin,
      pnl: trade.pnl,
      reversalPct: reversalPct,
      isPaused,
    });
  });

  // Calculate what we saved by pausing
  const imgTrades = tradeLog.filter(t => t.type === 'IMG');
  const imgPnLTotal = imgTrades.reduce((sum, t) => sum + t.pnl, 0);
  const realTrades = tradeLog.filter(t => t.type === 'REAL');
  const realPnLTotal = realTrades.reduce((sum, t) => sum + t.pnl, 0);

  // Actual session performance
  const actualPnL = sameDirTrades.reduce((sum, t) => sum + t.pnl, 0);
  const actualWins = sameDirTrades.filter(t => t.isWin).length;

  console.log('\n\n--- PAUSE EVENTS ---\n');
  if (pauseEvents.length === 0) {
    console.log('No pause events triggered.');
  } else {
    pauseEvents.forEach(e => {
      if (e.type === 'PAUSE') {
        console.log(`PAUSE at block ${e.block} (trade #${e.tradeIdx}): ${e.reason}`);
      } else {
        console.log(`RESUME at block ${e.block} (trade #${e.tradeIdx}): ${e.reason} (after ${e.blocksInPause} blocks)`);
      }
    });
  }

  console.log('\n\n--- SUMMARY ---\n');

  console.log('Actual Session Performance:');
  console.log(`  Trades: ${sameDirTrades.length} (${actualWins}W / ${sameDirTrades.length - actualWins}L)`);
  console.log(`  PnL: ${actualPnL}`);

  console.log('\nWith Pause Overlay:');
  console.log(`  Real Trades: ${realTrades.length} (${realWins}W / ${realLosses}L)`);
  console.log(`  Real PnL: ${realPnLTotal}`);
  console.log(`  Imaginary Trades: ${imgTrades.length} (${imgWins}W / ${imgLosses}L)`);
  console.log(`  Imaginary PnL: ${imgPnLTotal}`);

  console.log('\n--- IMPROVEMENT ---');
  const improvement = realPnLTotal - actualPnL;
  console.log(`  Actual: ${actualPnL}`);
  console.log(`  Simulated: ${realPnLTotal}`);
  console.log(`  Improvement: ${improvement > 0 ? '+' : ''}${improvement}`);

  if (imgPnLTotal < 0) {
    console.log(`  Losses Avoided: ${Math.abs(imgPnLTotal)}`);
  } else {
    console.log(`  Gains Missed: ${imgPnLTotal}`);
  }

  // Analyze the high PCT reversals that caused losses
  console.log('\n\n--- HIGH PCT REVERSAL ANALYSIS ---\n');
  const highPctLosses = tradeLog.filter(t => t.reversalPct >= CONFIG.HIGH_PCT_THRESHOLD && !t.isWin);
  console.log(`High PCT (≥${CONFIG.HIGH_PCT_THRESHOLD}%) Reversal Losses: ${highPctLosses.length}`);
  if (highPctLosses.length > 0) {
    let totalHighPctLoss = 0;
    highPctLosses.forEach(t => {
      console.log(`  Block ${t.block}: ${t.reversalPct}% reversal → ${t.pnl} loss (${t.type})`);
      totalHighPctLoss += t.pnl;
    });
    console.log(`  Total from High PCT Reversals: ${totalHighPctLoss}`);
  }

  return {
    actualPnL,
    realPnL: realPnLTotal,
    imaginaryPnL: imgPnLTotal,
    improvement,
    pauseCount: pauseEvents.filter(e => e.type === 'PAUSE').length,
    resumeCount: pauseEvents.filter(e => e.type === 'RESUME').length,
    highPctLosses: highPctLosses.length,
  };
}

const result1 = analyzeWithPauseOverlay(s1, 'SESSION 1 (18:19)');
const result2 = analyzeWithPauseOverlay(s2, 'SESSION 2 (18:57)');

console.log('\n\n' + '='.repeat(80));
console.log('  FINAL COMPARISON');
console.log('='.repeat(80));

console.log('\n| Metric                  | Session 1    | Session 2    |');
console.log('|-------------------------|--------------|--------------|');
console.log(`| Actual SameDir PnL      | ${String(result1.actualPnL).padStart(12)} | ${String(result2.actualPnL).padStart(12)} |`);
console.log(`| Simulated Real PnL      | ${String(result1.realPnL).padStart(12)} | ${String(result2.realPnL).padStart(12)} |`);
console.log(`| Imaginary PnL           | ${String(result1.imaginaryPnL).padStart(12)} | ${String(result2.imaginaryPnL).padStart(12)} |`);
console.log(`| Improvement             | ${String(result1.improvement).padStart(12)} | ${String(result2.improvement).padStart(12)} |`);
console.log(`| Pause Events            | ${String(result1.pauseCount).padStart(12)} | ${String(result2.pauseCount).padStart(12)} |`);
console.log(`| Resume Events           | ${String(result1.resumeCount).padStart(12)} | ${String(result2.resumeCount).padStart(12)} |`);
console.log(`| High PCT Losses         | ${String(result1.highPctLosses).padStart(12)} | ${String(result2.highPctLosses).padStart(12)} |`);

console.log('\n--- CONCLUSION ---');
const totalImprovement = result1.improvement + result2.improvement;
console.log(`Combined Improvement: ${totalImprovement > 0 ? '+' : ''}${totalImprovement}`);
console.log(`Session 1: Would have turned ${result1.actualPnL} into ${result1.realPnL}`);
console.log(`Session 2: Would have turned ${result2.actualPnL} into ${result2.realPnL}`);
