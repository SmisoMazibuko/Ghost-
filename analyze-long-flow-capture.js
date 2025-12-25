const fs = require('fs');

const s1 = JSON.parse(fs.readFileSync('ghost-evaluator/data/sessions/session_2025-12-24T18-19-24-936Z.json', 'utf8'));
const s2 = JSON.parse(fs.readFileSync('ghost-evaluator/data/sessions/session_2025-12-24T18-57-18-606Z.json', 'utf8'));

console.log('='.repeat(80));
console.log('  LONG FLOW CAPTURE ANALYSIS');
console.log('  (Did AGGRESSIVE config capture the 7+ block flows?)');
console.log('='.repeat(80));

const CONFIG = {
  highPctThreshold: 70,
  consecLossesThreshold: 1,
  consecWinsResumeThreshold: 2,
  imgProfitResumeThreshold: 80,
  longFlowThreshold: 7,
};

function detectLongFlows(blocks) {
  const flows = [];
  let currentDir = blocks[0].dir;
  let flowStart = 0;
  let flowLength = 1;

  for (let i = 1; i < blocks.length; i++) {
    if (blocks[i].dir === currentDir) {
      flowLength++;
    } else {
      if (flowLength >= CONFIG.longFlowThreshold) {
        flows.push({
          start: flowStart,
          end: i - 1,
          length: flowLength,
          dir: currentDir === 1 ? 'UP' : 'DOWN',
        });
      }
      currentDir = blocks[i].dir;
      flowStart = i;
      flowLength = 1;
    }
  }
  // Check last flow
  if (flowLength >= CONFIG.longFlowThreshold) {
    flows.push({
      start: flowStart,
      end: blocks.length - 1,
      length: flowLength,
      dir: currentDir === 1 ? 'UP' : 'DOWN',
    });
  }
  return flows;
}

function analyzeFlowCapture(data, sessionName) {
  console.log('\n\n' + '='.repeat(80));
  console.log('  ' + sessionName);
  console.log('='.repeat(80));

  const blocks = data.blocks;
  const trades = data.trades.sort((a, b) => a.openIndex - b.openIndex);
  const sameDirTrades = trades.filter(t => t.pattern === 'SameDir');

  // Find long flows
  const longFlows = detectLongFlows(blocks);

  console.log(`\n--- LONG FLOWS (${CONFIG.longFlowThreshold}+ blocks) ---\n`);
  if (longFlows.length === 0) {
    console.log('No long flows detected.');
  } else {
    longFlows.forEach((f, i) => {
      console.log(`Flow ${i + 1}: Blocks ${f.start}-${f.end} (${f.length} blocks ${f.dir})`);
    });
  }

  // Simulate AGGRESSIVE pause logic
  let isPaused = false;
  let consecutiveLosses = 0;
  let consecutiveImaginaryWins = 0;
  let imaginaryPnL = 0;

  const tradeStates = sameDirTrades.map(trade => {
    const evalBlock = blocks[trade.evalIndex];
    const prevBlock = trade.evalIndex > 0 ? blocks[trade.evalIndex - 1] : null;
    const isReversal = prevBlock && evalBlock.dir !== prevBlock.dir;
    const isHighPctReversal = isReversal && evalBlock.pct >= CONFIG.highPctThreshold;

    let tradeType = 'REAL';

    if (!isPaused) {
      let shouldPause = false;
      if (isHighPctReversal && !trade.isWin) shouldPause = true;
      if (consecutiveLosses >= CONFIG.consecLossesThreshold && !trade.isWin) shouldPause = true;

      if (shouldPause) {
        isPaused = true;
        consecutiveImaginaryWins = 0;
        imaginaryPnL = 0;
        tradeType = 'IMG';
      }
    } else {
      tradeType = 'IMG';
    }

    if (isPaused && trade.isWin) {
      consecutiveImaginaryWins++;
      imaginaryPnL += trade.pnl;
      if (consecutiveImaginaryWins >= CONFIG.consecWinsResumeThreshold || imaginaryPnL >= CONFIG.imgProfitResumeThreshold) {
        isPaused = false;
      }
    } else if (isPaused && !trade.isWin) {
      consecutiveImaginaryWins = 0;
      imaginaryPnL += trade.pnl;
    }

    if (tradeType === 'REAL') {
      if (trade.isWin) consecutiveLosses = 0;
      else consecutiveLosses++;
    }

    return {
      block: trade.evalIndex,
      isWin: trade.isWin,
      pnl: trade.pnl,
      type: tradeType,
    };
  });

  // Check which long flows were captured
  console.log('\n--- FLOW CAPTURE ANALYSIS ---\n');

  longFlows.forEach((flow, i) => {
    const tradesInFlow = tradeStates.filter(t => t.block >= flow.start && t.block <= flow.end);
    const realTrades = tradesInFlow.filter(t => t.type === 'REAL');
    const imgTrades = tradesInFlow.filter(t => t.type === 'IMG');

    const realPnL = realTrades.reduce((sum, t) => sum + t.pnl, 0);
    const imgPnL = imgTrades.reduce((sum, t) => sum + t.pnl, 0);
    const totalPnL = tradesInFlow.reduce((sum, t) => sum + t.pnl, 0);

    console.log(`Flow ${i + 1} (${flow.dir}, blocks ${flow.start}-${flow.end}):`);
    console.log(`  Total SD trades: ${tradesInFlow.length}`);
    console.log(`  Real trades: ${realTrades.length} (${realTrades.filter(t => t.isWin).length}W) = ${realPnL}`);
    console.log(`  Imaginary trades: ${imgTrades.length} (${imgTrades.filter(t => t.isWin).length}W) = ${imgPnL}`);

    if (realTrades.length === 0) {
      console.log(`  >> FLOW MISSED: All trades were imaginary!`);
    } else if (imgTrades.length === 0) {
      console.log(`  >> FLOW CAPTURED: All trades were real!`);
    } else {
      const captureRate = (realTrades.length / tradesInFlow.length * 100).toFixed(0);
      console.log(`  >> PARTIAL CAPTURE: ${captureRate}% of flow captured as real`);
    }

    // Was the flow profitable?
    if (totalPnL > 0) {
      console.log(`  >> Flow was PROFITABLE: +${totalPnL}`);
      if (imgPnL > 0) {
        console.log(`  >> MISSED OPPORTUNITY: ${imgPnL} was left on the table`);
      }
    } else {
      console.log(`  >> Flow was UNPROFITABLE: ${totalPnL}`);
      if (imgPnL < 0) {
        console.log(`  >> GOOD DECISION: Avoided ${Math.abs(imgPnL)} in losses`);
      }
    }
    console.log('');
  });

  // Summary
  const allRealPnL = tradeStates.filter(t => t.type === 'REAL').reduce((sum, t) => sum + t.pnl, 0);
  const allImgPnL = tradeStates.filter(t => t.type === 'IMG').reduce((sum, t) => sum + t.pnl, 0);
  const actualPnL = sameDirTrades.reduce((sum, t) => sum + t.pnl, 0);

  console.log('--- OVERALL ---\n');
  console.log(`Long flows found: ${longFlows.length}`);
  console.log(`Actual SameDir PnL: ${actualPnL}`);
  console.log(`Simulated Real PnL: ${allRealPnL}`);
  console.log(`Improvement: ${allRealPnL - actualPnL}`);

  return { longFlows, tradeStates };
}

analyzeFlowCapture(s1, 'SESSION 1');
analyzeFlowCapture(s2, 'SESSION 2');

console.log('\n\n' + '='.repeat(80));
console.log('  CONCLUSION');
console.log('='.repeat(80));
console.log('\nThe AGGRESSIVE config should:');
console.log('1. Stay ACTIVE during profitable long flows');
console.log('2. PAUSE during hostile periods (high PCT reversals, consec losses)');
console.log('3. RESUME quickly when market recovers');
