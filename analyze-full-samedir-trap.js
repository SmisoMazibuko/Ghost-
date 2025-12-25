const fs = require('fs');

const s1 = JSON.parse(fs.readFileSync('ghost-evaluator/data/sessions/session_2025-12-24T18-19-24-936Z.json', 'utf8'));
const s2 = JSON.parse(fs.readFileSync('ghost-evaluator/data/sessions/session_2025-12-24T18-57-18-606Z.json', 'utf8'));

console.log('='.repeat(80));
console.log('  FULL SAMEDIR TRAP ANALYSIS');
console.log('='.repeat(80));

function fullAnalysis(data, name) {
  console.log('\n\n' + '='.repeat(80));
  console.log('  ' + name);
  console.log('='.repeat(80));

  const blocks = data.blocks;
  const trades = data.trades.sort((a, b) => a.openIndex - b.openIndex);

  // ============================================================
  // POINT 1: Find all 7+ block flows and check SameDir performance
  // ============================================================
  console.log('\n\n>>> POINT 1: LONG FLOWS (7+ consecutive same direction) <<<\n');

  let flows = [];
  let currentFlow = { dir: blocks[0].dir, startIdx: 0, count: 1 };

  for (let i = 1; i < blocks.length; i++) {
    if (blocks[i].dir === currentFlow.dir) {
      currentFlow.count++;
    } else {
      if (currentFlow.count >= 2) {
        currentFlow.endIdx = i - 1;
        flows.push({ ...currentFlow });
      }
      currentFlow = { dir: blocks[i].dir, startIdx: i, count: 1 };
    }
  }
  if (currentFlow.count >= 2) {
    currentFlow.endIdx = blocks.length - 1;
    flows.push({ ...currentFlow });
  }

  const longFlows = flows.filter(f => f.count >= 7);
  const shortFlows = flows.filter(f => f.count >= 2 && f.count < 7);

  console.log('Total flows (2+ blocks):', flows.length);
  console.log('Long flows (7+ blocks):', longFlows.length);
  console.log('Short flows (2-6 blocks):', shortFlows.length);

  if (longFlows.length > 0) {
    console.log('\nLong Flow Details:');
    longFlows.forEach((f, i) => {
      const dir = f.dir === 1 ? 'UP' : 'DOWN';
      console.log('  Flow ' + (i + 1) + ': ' + dir + ' | Blocks ' + f.startIdx + '-' + f.endIdx + ' | Length: ' + f.count);

      // Find SameDir trades during this flow
      const sameDirInFlow = trades.filter(t =>
        t.pattern === 'SameDir' &&
        t.openIndex >= f.startIdx &&
        t.openIndex <= f.endIdx
      );

      if (sameDirInFlow.length > 0) {
        const wins = sameDirInFlow.filter(t => t.isWin).length;
        const pnl = sameDirInFlow.reduce((sum, t) => sum + t.pnl, 0);
        console.log('    -> SameDir trades in this flow: ' + sameDirInFlow.length + ' (' + wins + 'W, PnL: ' + Math.round(pnl) + ')');
      } else {
        console.log('    -> NO SameDir trades during this flow (MISSED OPPORTUNITY!)');
      }
    });
  } else {
    console.log('\nNo long flows (7+) found in this session.');
  }

  // ============================================================
  // POINT 2 & 3: Track the cycle - SameDir profit → ZZ/XAX profit → Break → SameDir
  // ============================================================
  console.log('\n\n>>> POINT 2 & 3: THE PROFIT CYCLE <<<\n');

  // Group consecutive trades by pattern type
  const isZZorXAX = (p) => ['ZZ', 'AntiZZ', '2A2', '3A3', '4A4', '5A5', 'Anti2A2', 'Anti3A3', 'Anti4A4', 'Anti5A5'].includes(p);

  // Create pattern periods
  let periods = [];
  let currentPeriod = null;

  trades.forEach((t, idx) => {
    const isSameDir = t.pattern === 'SameDir';
    const isAlt = isZZorXAX(t.pattern);
    const type = isSameDir ? 'SameDir' : (isAlt ? 'ZZ/XAX' : 'Other');

    if (!currentPeriod || currentPeriod.type !== type) {
      if (currentPeriod) periods.push(currentPeriod);
      currentPeriod = {
        type,
        trades: [],
        pnl: 0,
        wins: 0,
        losses: 0,
        startBlock: t.openIndex,
        endBlock: t.openIndex
      };
    }

    currentPeriod.trades.push(t);
    currentPeriod.pnl += t.pnl;
    if (t.isWin) currentPeriod.wins++;
    else currentPeriod.losses++;
    currentPeriod.endBlock = t.openIndex;
  });
  if (currentPeriod) periods.push(currentPeriod);

  console.log('Period Sequence:\n');
  periods.forEach((p, i) => {
    const status = p.pnl > 0 ? 'PROFIT' : 'LOSS  ';
    const marker = (p.type === 'SameDir' && p.pnl < 0) ? ' <-- SameDir LOSING' :
                   (p.type === 'ZZ/XAX' && p.pnl > 0) ? ' <-- ZZ/XAX PROFITABLE' : '';
    console.log(
      String(i + 1).padStart(2) + '. ' +
      p.type.padEnd(8) + ' | Blocks ' + String(p.startBlock).padStart(3) + '-' + String(p.endBlock).padStart(3) +
      ' | ' + p.trades.length + ' trades | ' +
      p.wins + 'W/' + p.losses + 'L | ' +
      status + ': ' + String(Math.round(p.pnl)).padStart(5) +
      marker
    );
  });

  // Find the cycle pattern
  console.log('\n\nCycle Detection (SameDir → ZZ/XAX → SameDir):\n');

  let cycleCount = 0;
  for (let i = 0; i < periods.length - 2; i++) {
    if (periods[i].type === 'SameDir' && periods[i + 1].type === 'ZZ/XAX' && periods[i + 2].type === 'SameDir') {
      cycleCount++;
      const sd1 = periods[i];
      const alt = periods[i + 1];
      const sd2 = periods[i + 2];

      console.log('CYCLE ' + cycleCount + ':');
      console.log('  1. SameDir (Blocks ' + sd1.startBlock + '-' + sd1.endBlock + '): ' + sd1.wins + 'W/' + sd1.losses + 'L, PnL: ' + Math.round(sd1.pnl));
      console.log('  2. ZZ/XAX  (Blocks ' + alt.startBlock + '-' + alt.endBlock + '): ' + alt.wins + 'W/' + alt.losses + 'L, PnL: ' + Math.round(alt.pnl));
      console.log('  3. SameDir (Blocks ' + sd2.startBlock + '-' + sd2.endBlock + '): ' + sd2.wins + 'W/' + sd2.losses + 'L, PnL: ' + Math.round(sd2.pnl));

      // Analyze the trap
      if (sd1.pnl > 0 && alt.pnl > 0 && sd2.pnl < 0) {
        console.log('  >> CLASSIC TRAP: SameDir profitable → ZZ/XAX profitable → SameDir loses!');
      } else if (alt.pnl > 0 && sd2.pnl < 0) {
        console.log('  >> PARTIAL TRAP: ZZ/XAX profitable → SameDir loses on return');
      }
      console.log('');
    }
  }

  if (cycleCount === 0) {
    console.log('No complete SameDir → ZZ/XAX → SameDir cycles found.');
  }

  // ============================================================
  // POINT 4: Activation/Deactivation tracking
  // ============================================================
  console.log('\n\n>>> POINT 4: ACTIVATION/DEACTIVATION TRACKING <<<\n');

  const sameDirTrades = trades.filter(t => t.pattern === 'SameDir');

  // Track loss counter changes
  let activationEvents = [];
  let lastLossCounter = null;

  sameDirTrades.forEach((t, idx) => {
    const reason = t.reason || '';
    const lossMatch = reason.match(/loss: (\d+)\/(\d+)/);
    const currentLoss = lossMatch ? parseInt(lossMatch[1]) : 0;
    const threshold = lossMatch ? parseInt(lossMatch[2]) : 140;

    if (lastLossCounter !== null) {
      if (currentLoss === 0 && lastLossCounter > 0) {
        activationEvents.push({
          type: 'REACTIVATION',
          tradeIdx: idx + 1,
          blockIdx: t.openIndex,
          prevLoss: lastLossCounter
        });
      } else if (currentLoss > lastLossCounter + 50) {
        activationEvents.push({
          type: 'HEAVY_LOSS',
          tradeIdx: idx + 1,
          blockIdx: t.openIndex,
          lossJump: currentLoss - lastLossCounter
        });
      }
    }

    lastLossCounter = currentLoss;
  });

  console.log('SameDir Loss Counter Progression:\n');
  sameDirTrades.forEach((t, idx) => {
    const reason = t.reason || '';
    const lossMatch = reason.match(/loss: (\d+)\/(\d+)/);
    const lossInfo = lossMatch ? lossMatch[1] + '/' + lossMatch[2] : 'N/A';
    const result = t.isWin ? 'WIN ' : 'LOSS';

    // Check for activation event at this point
    const event = activationEvents.find(e => e.tradeIdx === idx + 1);
    const eventMarker = event ? ' <<< ' + event.type : '';

    console.log(
      '#' + String(idx + 1).padStart(2) +
      ' Block:' + String(t.openIndex).padStart(3) +
      ' | ' + result +
      ' | PnL:' + String(Math.round(t.pnl)).padStart(5) +
      ' | Loss:' + lossInfo.padStart(7) +
      eventMarker
    );
  });

  console.log('\nActivation Events:', activationEvents.length);
  activationEvents.forEach(e => {
    console.log('  ' + e.type + ' at trade #' + e.tradeIdx + ' (Block ' + e.blockIdx + ')');
  });

  // ============================================================
  // POINT 5: Quantify the fake activation cost
  // ============================================================
  console.log('\n\n>>> POINT 5: FAKE ACTIVATION COST <<<\n');

  // Find SameDir runs and their performance
  let sameDirRuns = [];
  let currentRun = null;

  trades.forEach(t => {
    if (t.pattern === 'SameDir') {
      if (!currentRun) {
        currentRun = { trades: [], pnl: 0, wins: 0, losses: 0, startBlock: t.openIndex };
      }
      currentRun.trades.push(t);
      currentRun.pnl += t.pnl;
      if (t.isWin) currentRun.wins++;
      else currentRun.losses++;
      currentRun.endBlock = t.openIndex;
    } else {
      if (currentRun) {
        sameDirRuns.push(currentRun);
        currentRun = null;
      }
    }
  });
  if (currentRun) sameDirRuns.push(currentRun);

  console.log('SameDir Activation Runs:\n');

  let totalFakeActivationCost = 0;
  let realRunProfit = 0;

  sameDirRuns.forEach((run, i) => {
    const isLongRun = run.trades.length >= 7;
    const isShortRun = run.trades.length < 4;
    const isLosingRun = run.pnl < 0;

    let runType = 'NORMAL';
    if (isLongRun && run.pnl > 0) runType = 'REAL (Long profitable)';
    else if (isShortRun && isLosingRun) runType = 'FAKE (Short losing)';
    else if (isLosingRun) runType = 'LOSING';

    if (runType === 'FAKE (Short losing)') {
      totalFakeActivationCost += run.pnl;
    } else if (run.pnl > 0) {
      realRunProfit += run.pnl;
    }

    console.log(
      'Run ' + (i + 1) + ': Blocks ' + run.startBlock + '-' + run.endBlock +
      ' | ' + run.trades.length + ' trades | ' +
      run.wins + 'W/' + run.losses + 'L | PnL: ' + Math.round(run.pnl) +
      ' | ' + runType
    );
  });

  console.log('\n--- COST SUMMARY ---');
  console.log('Total SameDir PnL:', Math.round(sameDirTrades.reduce((sum, t) => sum + t.pnl, 0)));
  console.log('Fake Activation Cost (short losing runs):', Math.round(totalFakeActivationCost));
  console.log('Real Run Profit:', Math.round(realRunProfit));
  console.log('Number of activations:', sameDirRuns.length);

  // ============================================================
  // POINT 6: What SHOULD have happened
  // ============================================================
  console.log('\n\n>>> POINT 6: MISSED OPPORTUNITY ANALYSIS <<<\n');

  // Find periods where SameDir was NOT trading but WOULD have been profitable
  // (i.e., during long flows when SameDir was deactivated)

  console.log('Checking for profitable SameDir opportunities missed during long flows:\n');

  longFlows.forEach((flow, i) => {
    const dir = flow.dir === 1 ? 'UP' : 'DOWN';

    // Count how many blocks in this flow had NO SameDir trade
    const sameDirBlocks = new Set(
      sameDirTrades
        .filter(t => t.openIndex >= flow.startIdx && t.openIndex <= flow.endIdx)
        .map(t => t.openIndex)
    );

    const missedBlocks = [];
    for (let b = flow.startIdx; b <= flow.endIdx; b++) {
      if (!sameDirBlocks.has(b)) {
        missedBlocks.push(b);
      }
    }

    console.log('Long Flow ' + (i + 1) + ' (' + dir + ', Blocks ' + flow.startIdx + '-' + flow.endIdx + ', Length ' + flow.count + '):');
    console.log('  SameDir traded on ' + sameDirBlocks.size + '/' + flow.count + ' blocks');
    console.log('  Missed blocks: ' + (missedBlocks.length > 0 ? missedBlocks.join(', ') : 'None'));

    if (missedBlocks.length > 0) {
      // Estimate missed profit (average SameDir win * missed blocks)
      const avgWinPnl = sameDirTrades.filter(t => t.isWin).reduce((sum, t) => sum + t.pnl, 0) /
                        Math.max(1, sameDirTrades.filter(t => t.isWin).length);
      const estimatedMissed = Math.round(avgWinPnl * missedBlocks.length * 0.65); // 65% assumed win rate on continuation
      console.log('  Estimated missed profit: ~' + estimatedMissed);
    }
    console.log('');
  });

  // Final summary
  console.log('\n' + '='.repeat(60));
  console.log('  FINAL SUMMARY FOR ' + name);
  console.log('='.repeat(60));
  console.log('Total SameDir trades:', sameDirTrades.length);
  console.log('Total SameDir PnL:', Math.round(sameDirTrades.reduce((sum, t) => sum + t.pnl, 0)));
  console.log('Number of activation runs:', sameDirRuns.length);
  console.log('Long flows (7+) in session:', longFlows.length);
  console.log('Cycles (SD → ZZ/XAX → SD):', cycleCount);
}

fullAnalysis(s1, 'SESSION 1 (18:19) - Small Profit, Fake Activations');
fullAnalysis(s2, 'SESSION 2 (18:57) - Good Profit');
