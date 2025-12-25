const fs = require('fs');

const s1 = JSON.parse(fs.readFileSync('ghost-evaluator/data/sessions/session_2025-12-24T18-19-24-936Z.json', 'utf8'));
const s2 = JSON.parse(fs.readFileSync('ghost-evaluator/data/sessions/session_2025-12-24T18-57-18-606Z.json', 'utf8'));

console.log('='.repeat(80));
console.log('  SD STATE MACHINE SIMULATION ANALYSIS');
console.log('='.repeat(80));

// Configuration
const CONFIG = {
  HIGH_PCT_THRESHOLD: 70,           // Reversal PCT to trigger pause
  CONSECUTIVE_WINS_RESUME: 3,       // Imaginary wins to resume
  IMAGINARY_PROFIT_RESUME: 100,     // Imaginary profit to resume
  LONG_FLOW_THRESHOLD: 7,           // Blocks for long flow detection
  INITIAL_LIFE: 140,
  DEACTIVATION_THRESHOLD: 140,
};

// SD State Machine Simulation
function simulateSDStateMachine(data, sessionName) {
  console.log('\n\n' + '='.repeat(80));
  console.log('  ' + sessionName);
  console.log('='.repeat(80));

  const blocks = data.blocks;
  const trades = data.trades.sort((a, b) => a.openIndex - b.openIndex);

  // State tracking
  let state = 'INACTIVE';  // INACTIVE, ACTIVE, PAUSED, EXPIRED
  let life = CONFIG.INITIAL_LIFE;
  let accumulatedLoss = 0;
  let activatedAt = -1;
  let pausedAt = -1;
  let pauseReason = null;

  // Metrics
  let realPnL = 0;
  let realWins = 0;
  let realLosses = 0;
  let imaginaryPnL = 0;
  let imaginaryWins = 0;
  let imaginaryLosses = 0;
  let consecutiveImaginaryWins = 0;

  // Event log
  const events = [];
  const stateLog = [];

  // Helper: Log state transition
  function transition(newState, blockIndex, reason) {
    const oldState = state;
    events.push({
      type: 'TRANSITION',
      from: oldState,
      to: newState,
      blockIndex,
      reason,
      life,
      realPnL,
      imaginaryPnL,
    });
    state = newState;
    stateLog.push({ block: blockIndex, state: newState, reason });
  }

  // Helper: Check for high PCT reversal
  function isHighPctReversal(blockIdx) {
    if (blockIdx < 1) return { is: false };
    const curr = blocks[blockIdx];
    const prev = blocks[blockIdx - 1];
    if (curr.dir !== prev.dir && curr.pct >= CONFIG.HIGH_PCT_THRESHOLD) {
      return { is: true, pct: curr.pct };
    }
    return { is: false };
  }

  // Helper: Detect long flow
  function detectLongFlow(upToBlockIdx) {
    let count = 1;
    let dir = blocks[upToBlockIdx].dir;
    for (let i = upToBlockIdx - 1; i >= 0; i--) {
      if (blocks[i].dir === dir) count++;
      else break;
    }
    return { isLong: count >= CONFIG.LONG_FLOW_THRESHOLD, length: count, dir };
  }

  // Helper: Check if ZZ/XAX is taking over
  function isZZXAXTakeover(recentTrades) {
    const zzXaxPatterns = ['ZZ', 'AntiZZ', '2A2', '3A3', '4A4', '5A5', 'Anti2A2', 'Anti3A3', 'Anti4A4', 'Anti5A5'];
    const recent = recentTrades.slice(-5);
    const zzXaxTrades = recent.filter(t => zzXaxPatterns.includes(t.pattern) && t.isWin);
    return zzXaxTrades.length >= 3;
  }

  // Helper: Check if ZZ/XAX just broke
  function isZZXAXBreak(trade) {
    const zzXaxPatterns = ['ZZ', 'AntiZZ', '2A2', '3A3', '4A4', '5A5', 'Anti2A2', 'Anti3A3', 'Anti4A4', 'Anti5A5'];
    return zzXaxPatterns.includes(trade.pattern) && !trade.isWin;
  }

  // Get SameDir trades
  const sameDirTrades = trades.filter(t => t.pattern === 'SameDir');

  // Track processed trades for context
  const processedTrades = [];

  console.log('\n--- SIMULATION LOG ---\n');

  // Process each SameDir trade
  sameDirTrades.forEach((trade, idx) => {
    const blockIdx = trade.openIndex;
    const evalIdx = trade.evalIndex;
    const evalBlock = blocks[evalIdx];

    // Check activation (simplified - assume activated when first SameDir trade appears)
    if (state === 'INACTIVE' && idx === 0) {
      state = 'ACTIVE';
      activatedAt = blockIdx;
      life = CONFIG.INITIAL_LIFE;
      events.push({ type: 'ACTIVATION', blockIndex: blockIdx, life });
      console.log(`[Block ${blockIdx}] ACTIVATED - life: ${life}`);
    }

    // Check for pause triggers BEFORE processing trade
    if (state === 'ACTIVE') {
      // Trigger 1: High PCT reversal on eval block
      const reversal = isHighPctReversal(evalIdx);
      if (reversal.is && !trade.isWin) {
        transition('PAUSED', evalIdx, `HIGH_PCT_REVERSAL (${reversal.pct}%)`);
        pausedAt = evalIdx;
        pauseReason = 'HIGH_PCT_REVERSAL';
        consecutiveImaginaryWins = 0;
        console.log(`[Block ${evalIdx}] >>> PAUSED - High PCT reversal ${reversal.pct}%`);
      }

      // Trigger 2: ZZ/XAX takeover
      if (state === 'ACTIVE' && isZZXAXTakeover(processedTrades)) {
        transition('PAUSED', evalIdx, 'ZZ_XAX_TAKEOVER');
        pausedAt = evalIdx;
        pauseReason = 'ZZ_XAX_TAKEOVER';
        consecutiveImaginaryWins = 0;
        console.log(`[Block ${evalIdx}] >>> PAUSED - ZZ/XAX takeover detected`);
      }
    }

    // Process the trade based on current state
    if (state === 'ACTIVE') {
      // REAL trade
      if (trade.isWin) {
        realWins++;
        realPnL += trade.pnl;
        // Big win resets accumulated loss
        if (trade.pnl > accumulatedLoss) {
          accumulatedLoss = 0;
        }
        console.log(`[Block ${evalIdx}] REAL WIN  +${trade.pnl} (total: ${realPnL})`);
      } else {
        realLosses++;
        realPnL += trade.pnl;
        accumulatedLoss += Math.abs(trade.pnl);
        life -= evalBlock.pct;

        // Check for expiration
        if (accumulatedLoss > CONFIG.DEACTIVATION_THRESHOLD || life <= 0) {
          transition('EXPIRED', evalIdx, `LIFE_EXHAUSTED (loss: ${accumulatedLoss}, life: ${life})`);
          console.log(`[Block ${evalIdx}] >>> EXPIRED - life exhausted`);
        } else {
          console.log(`[Block ${evalIdx}] REAL LOSS ${trade.pnl} (total: ${realPnL}, life: ${life})`);
        }
      }
    } else if (state === 'PAUSED') {
      // IMAGINARY trade
      if (trade.isWin) {
        imaginaryWins++;
        imaginaryPnL += trade.pnl;
        consecutiveImaginaryWins++;
        console.log(`[Block ${evalIdx}] IMG  WIN  +${trade.pnl} (img total: ${imaginaryPnL}, consec: ${consecutiveImaginaryWins})`);

        // Check resume conditions
        if (consecutiveImaginaryWins >= CONFIG.CONSECUTIVE_WINS_RESUME) {
          transition('ACTIVE', evalIdx, `RESUME (${consecutiveImaginaryWins} consecutive img wins)`);
          pauseReason = null;
          console.log(`[Block ${evalIdx}] <<< RESUMED - ${consecutiveImaginaryWins} consecutive imaginary wins`);
        } else if (imaginaryPnL >= CONFIG.IMAGINARY_PROFIT_RESUME) {
          transition('ACTIVE', evalIdx, `RESUME (img profit ${imaginaryPnL} >= ${CONFIG.IMAGINARY_PROFIT_RESUME})`);
          pauseReason = null;
          console.log(`[Block ${evalIdx}] <<< RESUMED - imaginary profit threshold`);
        }
      } else {
        imaginaryLosses++;
        imaginaryPnL += trade.pnl;
        consecutiveImaginaryWins = 0;
        console.log(`[Block ${evalIdx}] IMG  LOSS ${trade.pnl} (img total: ${imaginaryPnL})`);
      }

      // Check for ZZ/XAX break - opportunity to resume
      const lastNonSD = processedTrades.filter(t => t.pattern !== 'SameDir').slice(-1)[0];
      if (lastNonSD && isZZXAXBreak(lastNonSD) && life > 0) {
        transition('ACTIVE', evalIdx, `RESUME (ZZ/XAX broke: ${lastNonSD.pattern})`);
        pauseReason = null;
        console.log(`[Block ${evalIdx}] <<< RESUMED - ZZ/XAX pattern broke`);
      }
    } else if (state === 'EXPIRED') {
      // Track what would have happened
      if (trade.isWin) {
        imaginaryWins++;
        imaginaryPnL += trade.pnl;
        console.log(`[Block ${evalIdx}] EXPIRED - would have won +${trade.pnl}`);
      } else {
        imaginaryLosses++;
        imaginaryPnL += trade.pnl;
        console.log(`[Block ${evalIdx}] EXPIRED - would have lost ${trade.pnl}`);
      }
    }

    processedTrades.push(trade);
  });

  // Check for missed long flows
  console.log('\n--- LONG FLOW ANALYSIS ---\n');
  let missedFlowBlocks = [];
  for (let i = CONFIG.LONG_FLOW_THRESHOLD; i < blocks.length; i++) {
    const flow = detectLongFlow(i);
    if (flow.isLong) {
      // Check if any SameDir trade happened during this flow
      const flowStart = i - flow.length + 1;
      const flowEnd = i;
      const sdInFlow = sameDirTrades.filter(t => t.openIndex >= flowStart && t.openIndex <= flowEnd);

      if (sdInFlow.length === 0) {
        missedFlowBlocks.push({ start: flowStart, end: flowEnd, length: flow.length, dir: flow.dir });
      }
    }
  }

  // Deduplicate overlapping flows
  const uniqueFlows = [];
  missedFlowBlocks.forEach(flow => {
    const overlaps = uniqueFlows.some(f =>
      (flow.start >= f.start && flow.start <= f.end) ||
      (flow.end >= f.start && flow.end <= f.end)
    );
    if (!overlaps) {
      uniqueFlows.push(flow);
    }
  });

  if (uniqueFlows.length > 0) {
    console.log('Missed Long Flows (7+ blocks with NO SameDir trades):');
    uniqueFlows.forEach(f => {
      const dir = f.dir === 1 ? 'UP' : 'DOWN';
      console.log(`  Blocks ${f.start}-${f.end}: ${f.length} ${dir} blocks - MISSED!`);
    });
  } else {
    console.log('No completely missed long flows.');
  }

  // Summary
  console.log('\n--- SIMULATION SUMMARY ---\n');
  console.log('State Transitions:');
  events.filter(e => e.type === 'TRANSITION').forEach(e => {
    console.log(`  ${e.from} → ${e.to} at block ${e.blockIndex}: ${e.reason}`);
  });

  console.log('\nReal Trades (when ACTIVE):');
  console.log(`  Wins: ${realWins}, Losses: ${realLosses}`);
  console.log(`  PnL: ${realPnL}`);

  console.log('\nImaginary Trades (when PAUSED/EXPIRED):');
  console.log(`  Wins: ${imaginaryWins}, Losses: ${imaginaryLosses}`);
  console.log(`  PnL: ${imaginaryPnL}`);

  console.log('\nActual SameDir Performance (from session):');
  const actualPnL = sameDirTrades.reduce((sum, t) => sum + t.pnl, 0);
  const actualWins = sameDirTrades.filter(t => t.isWin).length;
  console.log(`  Wins: ${actualWins}, Losses: ${sameDirTrades.length - actualWins}`);
  console.log(`  PnL: ${actualPnL}`);

  console.log('\n--- THEORETICAL IMPROVEMENT ---');
  console.log(`Actual SameDir PnL: ${actualPnL}`);
  console.log(`Simulated Real PnL: ${realPnL}`);
  console.log(`Difference: ${realPnL - actualPnL} (${realPnL > actualPnL ? 'BETTER' : 'WORSE'})`);

  console.log('\nLosses Avoided by Pausing:');
  const avoidedLosses = imaginaryPnL < 0 ? Math.abs(imaginaryPnL) : 0;
  console.log(`  Would have lost ${avoidedLosses} during pause periods`);

  return {
    realPnL,
    imaginaryPnL,
    actualPnL,
    events,
    stateLog,
    missedFlows: uniqueFlows,
  };
}

// Run simulation on both sessions
const result1 = simulateSDStateMachine(s1, 'SESSION 1 (18:19) - Expected: Fake Activation Trap');
const result2 = simulateSDStateMachine(s2, 'SESSION 2 (18:57) - Expected: Long Run Success');

// Comparison
console.log('\n\n' + '='.repeat(80));
console.log('  COMPARISON');
console.log('='.repeat(80));

console.log('\n| Metric                  | Session 1    | Session 2    |');
console.log('|-------------------------|--------------|--------------|');
console.log(`| Actual SameDir PnL      | ${String(result1.actualPnL).padStart(12)} | ${String(result2.actualPnL).padStart(12)} |`);
console.log(`| Simulated Real PnL      | ${String(result1.realPnL).padStart(12)} | ${String(result2.realPnL).padStart(12)} |`);
console.log(`| Imaginary PnL (paused)  | ${String(result1.imaginaryPnL).padStart(12)} | ${String(result2.imaginaryPnL).padStart(12)} |`);
console.log(`| Improvement             | ${String(result1.realPnL - result1.actualPnL).padStart(12)} | ${String(result2.realPnL - result2.actualPnL).padStart(12)} |`);
console.log(`| State Changes           | ${String(result1.events.filter(e => e.type === 'TRANSITION').length).padStart(12)} | ${String(result2.events.filter(e => e.type === 'TRANSITION').length).padStart(12)} |`);
console.log(`| Missed Long Flows       | ${String(result1.missedFlows.length).padStart(12)} | ${String(result2.missedFlows.length).padStart(12)} |`);
