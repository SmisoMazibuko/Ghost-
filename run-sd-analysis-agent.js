#!/usr/bin/env node
/**
 * SD Analysis Agent - Standalone Runner
 * ======================================
 *
 * A dedicated analysis agent for diagnosing SD (Same Direction) issues.
 * This is a standalone JS version that doesn't require TypeScript compilation.
 *
 * Usage:
 *   node run-sd-analysis-agent.js [session1.json] [session2.json] ...
 *
 * If no sessions specified, uses the default sessions from 2025-12-24.
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// DEFAULT PARAMETERS
// ============================================================================

const DEFAULT_PARAMS = {
  initialLife: 140,
  highPctThreshold: 70,
  consecutiveWinsResume: 3,
  imaginaryProfitResume: 100,
  longFlowThreshold: 7,
  decayPerPausedBlock: 0,
  decayPerLoss: 1,
  pauseLifePreservation: true,
  allowBucketDuringPause: false,
};

const BASELINE_PARAMS = {
  ...DEFAULT_PARAMS,
  highPctThreshold: 999, // never triggers pause (current behavior)
  pauseLifePreservation: false,
};

// ============================================================================
// SD STATE MACHINE SIMULATOR
// ============================================================================

class SDStateMachineSimulator {
  constructor(params = DEFAULT_PARAMS) {
    this.params = params;
    this.reset();
  }

  reset() {
    this.state = 'INACTIVE';
    this.direction = null;
    this.remainingLife = this.params.initialLife;
    this.accumulatedLoss = 0;
    this.realPnL = 0;
    this.imaginaryPnL = 0;
    this.realWins = 0;
    this.realLosses = 0;
    this.imaginaryWins = 0;
    this.imaginaryLosses = 0;
    this.consecutiveImaginaryWins = 0;
    this.pauseReason = null;
    this.pauseStartBlock = null;
    this.activatedAt = -1;
    this.transitions = [];
    this.equityCurve = [];
  }

  getState() { return this.state; }
  getRemainingLife() { return this.remainingLife; }
  getRealPnL() { return this.realPnL; }
  getImaginaryPnL() { return this.imaginaryPnL; }
  getTransitions() { return this.transitions; }
  getEquityCurve() { return this.equityCurve; }

  getMetrics() {
    return {
      realPnL: this.realPnL,
      imaginaryPnL: this.imaginaryPnL,
      realWins: this.realWins,
      realLosses: this.realLosses,
      imaginaryWins: this.imaginaryWins,
      imaginaryLosses: this.imaginaryLosses,
      winRate: this.realWins + this.realLosses > 0
        ? this.realWins / (this.realWins + this.realLosses)
        : 0,
      transitions: this.transitions.length,
      pauseEvents: this.transitions.filter(t => t.to === 'PAUSED').length,
      resumeEvents: this.transitions.filter(t => t.trigger === 'RESUME').length,
      expireEvents: this.transitions.filter(t => t.to === 'EXPIRED').length,
    };
  }

  transition(to, trigger, blockIndex, reason, triggerPattern = null) {
    const from = this.state;
    this.transitions.push({
      from,
      to,
      trigger,
      blockIndex,
      reason,
      triggerPattern,
      metrics: {
        remainingLife: this.remainingLife,
        accumulatedLoss: this.accumulatedLoss,
        realPnL: this.realPnL,
        imaginaryPnL: this.imaginaryPnL,
      },
      ts: new Date().toISOString(),
    });
    this.state = to;
  }

  activate(blockIndex, runProfit) {
    if (this.state !== 'INACTIVE') return;
    this.direction = null;
    this.remainingLife = this.params.initialLife;
    this.accumulatedLoss = 0;
    this.activatedAt = blockIndex;
    this.transition('ACTIVE', 'ACTIVATION', blockIndex,
      `RunProfit ${runProfit} >= ${this.params.initialLife}`);
  }

  pause(reason, blockIndex, details = '') {
    if (this.state !== 'ACTIVE') return;
    this.pauseReason = reason;
    this.pauseStartBlock = blockIndex;
    this.consecutiveImaginaryWins = 0;
    this.transition('PAUSED', reason, blockIndex,
      `${reason}${details ? ': ' + details : ''}`);
  }

  resume(blockIndex, reason, triggerPattern = null) {
    if (this.state !== 'PAUSED') return;
    if (this.remainingLife <= 0) {
      this.expire(blockIndex, 'Attempted resume but life exhausted');
      return;
    }
    this.pauseReason = null;
    this.pauseStartBlock = null;
    this.consecutiveImaginaryWins = 0;
    this.transition('ACTIVE', 'RESUME', blockIndex, reason, triggerPattern);
  }

  expire(blockIndex, reason) {
    this.transition('EXPIRED', 'EXPIRE', blockIndex, reason);
  }

  processSDTrade(trade, blocks, previousBlock) {
    const evalBlock = blocks[trade.evalIndex];
    const betDirection = previousBlock?.dir || 1;
    const isWin = betDirection === evalBlock.dir;
    const pnl = isWin ? evalBlock.pct * 2 : -(evalBlock.pct * 2);

    // Check for pause triggers BEFORE processing
    if (this.state === 'ACTIVE') {
      if (previousBlock && evalBlock.dir !== previousBlock.dir) {
        if (evalBlock.pct >= this.params.highPctThreshold) {
          this.pause('HIGH_PCT_REVERSAL', trade.evalIndex,
            `${evalBlock.pct}% >= ${this.params.highPctThreshold}%`);
        }
      }
    }

    // Process based on current state
    if (this.state === 'ACTIVE') {
      if (isWin) {
        this.realWins++;
        this.realPnL += pnl;
        if (pnl > this.accumulatedLoss) {
          this.accumulatedLoss = 0;
        }
      } else {
        this.realLosses++;
        this.realPnL += pnl;
        this.accumulatedLoss += Math.abs(pnl);
        this.remainingLife -= evalBlock.pct * this.params.decayPerLoss;

        if (this.remainingLife <= 0 || this.accumulatedLoss > this.params.initialLife) {
          this.expire(trade.evalIndex,
            `Life exhausted: ${this.remainingLife}, loss: ${this.accumulatedLoss}`);
        }
      }
      this.equityCurve.push(this.realPnL);
      return { isReal: true, pnl };

    } else if (this.state === 'PAUSED') {
      if (isWin) {
        this.imaginaryWins++;
        this.imaginaryPnL += pnl;
        this.consecutiveImaginaryWins++;

        if (this.consecutiveImaginaryWins >= this.params.consecutiveWinsResume) {
          this.resume(trade.evalIndex,
            `${this.consecutiveImaginaryWins} consecutive imaginary wins`);
        } else if (this.imaginaryPnL >= this.params.imaginaryProfitResume) {
          this.resume(trade.evalIndex,
            `Imaginary profit ${this.imaginaryPnL} >= ${this.params.imaginaryProfitResume}`);
        }
      } else {
        this.imaginaryLosses++;
        this.imaginaryPnL += pnl;
        this.consecutiveImaginaryWins = 0;
      }
      return { isReal: false, pnl };

    } else {
      if (isWin) {
        this.imaginaryWins++;
        this.imaginaryPnL += pnl;
      } else {
        this.imaginaryLosses++;
        this.imaginaryPnL += pnl;
      }
      return { isReal: false, pnl };
    }
  }

  handlePatternEvent(eventType, pattern, blockIndex) {
    if (eventType === 'BREAK' && this.state === 'PAUSED') {
      if (this.remainingLife > 0) {
        this.resume(blockIndex, `${pattern} pattern broke, life remaining: ${this.remainingLife}`, pattern);
      }
    }
  }

  getResumePatternStats() {
    const resumeEvents = this.transitions.filter(t => t.trigger === 'RESUME');
    const stats = {
      total: resumeEvents.length,
      byPattern: {},
      goodResumes: 0,  // ZZ, 2A2, 3A3, 4A4, 5A5, 6A6
      badResumes: 0,   // AntiZZ, Anti2A2, etc., OZ
    };

    const GOOD_PATTERNS = ['ZZ', '2A2', '3A3', '4A4', '5A5', '6A6'];
    const BAD_PATTERNS = ['AntiZZ', 'Anti2A2', 'Anti3A3', 'Anti4A4', 'Anti5A5', 'Anti6A6', 'OZ'];

    resumeEvents.forEach(e => {
      const p = e.triggerPattern || 'Unknown';
      stats.byPattern[p] = (stats.byPattern[p] || 0) + 1;

      if (GOOD_PATTERNS.includes(p)) stats.goodResumes++;
      else if (BAD_PATTERNS.includes(p)) stats.badResumes++;
    });

    return stats;
  }
}

// ============================================================================
// ANALYSIS FUNCTIONS
// ============================================================================

function detectFalseDeactivations(blocks, trades, params = DEFAULT_PARAMS) {
  const events = [];
  const sdTrades = trades.filter(t => t.pattern === 'SameDir').sort((a, b) => a.evalIndex - b.evalIndex);
  if (sdTrades.length < 2) return events;

  let isActive = false;
  let accumulatedLoss = 0;
  let lastDirection = null;

  for (let i = 0; i < sdTrades.length; i++) {
    const trade = sdTrades[i];

    if (!isActive) {
      isActive = true;
      accumulatedLoss = 0;
      lastDirection = trade.predictedDirection;
    }

    if (!trade.isWin) {
      accumulatedLoss += Math.abs(trade.pnl);

      if (accumulatedLoss > params.initialLife) {
        const deactivationBlock = trade.evalIndex;
        isActive = false;

        const nextActivation = sdTrades.find(t =>
          t.evalIndex > deactivationBlock && t.isWin
        );

        if (nextActivation) {
          const reactivationBlock = nextActivation.evalIndex;
          let persistedBlocks = 0;
          let missedPnL = 0;

          for (let j = deactivationBlock + 1; j < reactivationBlock; j++) {
            if (blocks[j].dir === lastDirection) {
              persistedBlocks++;
              missedPnL += blocks[j].pct * 2;
            } else {
              break;
            }
          }

          if (persistedBlocks >= 3) {
            const reentryTrade = sdTrades.find(t => t.evalIndex === reactivationBlock);
            const costOfLateReentry = reentryTrade && !reentryTrade.isWin
              ? Math.abs(reentryTrade.pnl)
              : 0;

            events.push({
              deactivationBlock,
              deactivationReason: `accumulatedLoss ${accumulatedLoss} > ${params.initialLife}`,
              reactivationBlock,
              blocksBeforeReactivation: reactivationBlock - deactivationBlock,
              directionPersistedBlocks: persistedBlocks,
              missedPnL,
              costOfLateReentry,
              totalCost: missedPnL + costOfLateReentry,
            });
          }
        }
      }
    } else {
      if (trade.pnl > accumulatedLoss) {
        accumulatedLoss = 0;
      }
      lastDirection = trade.predictedDirection;
    }
  }

  return events;
}

function detectLongFlows(blocks, trades, params = DEFAULT_PARAMS) {
  const events = [];
  const threshold = params.longFlowThreshold;

  let flowStart = 0;
  let flowLength = 1;
  let flowDirection = blocks[0]?.dir || 1;
  let flowPct = blocks[0]?.pct || 0;

  for (let i = 1; i < blocks.length; i++) {
    if (blocks[i].dir === flowDirection) {
      flowLength++;
      flowPct += blocks[i].pct;
    } else {
      if (flowLength >= threshold) {
        const flowEnd = i - 1;
        const flowTrades = trades.filter(t =>
          t.pattern === 'SameDir' &&
          t.evalIndex >= flowStart &&
          t.evalIndex <= flowEnd
        );

        const wasCaptured = flowTrades.length > 0;
        const capturedPnL = flowTrades.reduce((sum, t) => sum + t.pnl, 0);

        let missedPnL = 0;
        if (!wasCaptured) {
          for (let j = flowStart + 2; j <= flowEnd; j++) {
            missedPnL += blocks[j].pct * 2;
          }
        }

        events.push({
          startBlock: flowStart,
          endBlock: flowEnd,
          length: flowLength,
          direction: flowDirection,
          totalPct: flowPct,
          wasCaptured,
          capturedPnL,
          missedPnL,
        });
      }

      flowStart = i;
      flowLength = 1;
      flowDirection = blocks[i].dir;
      flowPct = blocks[i].pct;
    }
  }

  if (flowLength >= threshold) {
    const flowTrades = trades.filter(t =>
      t.pattern === 'SameDir' &&
      t.evalIndex >= flowStart
    );

    events.push({
      startBlock: flowStart,
      endBlock: blocks.length - 1,
      length: flowLength,
      direction: flowDirection,
      totalPct: flowPct,
      wasCaptured: flowTrades.length > 0,
      capturedPnL: flowTrades.reduce((sum, t) => sum + t.pnl, 0),
      missedPnL: 0,
    });
  }

  return events;
}

function analyzeReversalHostility(blocks, trades, params = DEFAULT_PARAMS, pauseDurations = [5, 10, 15, 20]) {
  const events = [];

  for (let i = 1; i < blocks.length; i++) {
    const curr = blocks[i];
    const prev = blocks[i - 1];

    if (curr.dir !== prev.dir && curr.pct >= params.highPctThreshold) {
      const subsequentBlocks = Math.min(20, blocks.length - i - 1);
      let sameDirectionCount = 0;

      for (let j = i + 1; j < i + 1 + subsequentBlocks && j < blocks.length; j++) {
        if (blocks[j].dir === curr.dir) {
          sameDirectionCount++;
        }
      }

      const pauseOutcomes = pauseDurations.map(k => {
        let avoidedLoss = 0;
        let missedGain = 0;

        const pauseEndBlock = Math.min(i + k, blocks.length - 1);
        const pauseTrades = trades.filter(t =>
          t.evalIndex > i && t.evalIndex <= pauseEndBlock && t.pattern === 'SameDir'
        );

        pauseTrades.forEach(t => {
          if (!t.isWin) {
            avoidedLoss += Math.abs(t.pnl);
          } else {
            missedGain += t.pnl;
          }
        });

        return {
          pauseDuration: k,
          wouldHaveAvoidedLoss: avoidedLoss,
          wouldHaveMissedGain: missedGain,
          netBenefit: avoidedLoss - missedGain,
        };
      });

      events.push({
        blockIndex: i,
        reversalPct: curr.pct,
        fromDirection: prev.dir,
        toDirection: curr.dir,
        subsequentBlocks,
        subsequentSameDirection: sameDirectionCount,
        wouldHavePausedOutcome: pauseOutcomes,
      });
    }
  }

  return events;
}

function calculateMaxDrawdown(equityCurve) {
  if (equityCurve.length === 0) return 0;
  let peak = equityCurve[0];
  let maxDD = 0;
  for (const equity of equityCurve) {
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

function calculateVolatility(equityCurve) {
  if (equityCurve.length < 2) return 0;
  const returns = [];
  for (let i = 1; i < equityCurve.length; i++) {
    returns.push(equityCurve[i] - equityCurve[i - 1]);
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
  return Math.sqrt(variance);
}

function runCounterfactual(session, params, variantName) {
  const sm = new SDStateMachineSimulator(params);
  const blocks = session.blocks;
  const trades = session.trades.sort((a, b) => a.evalIndex - b.evalIndex);

  let runLength = 0;
  let runDirection = blocks[0]?.dir || 1;
  let runProfit = 0;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const prevBlock = i > 0 ? blocks[i - 1] : null;

    if (block.dir === runDirection) {
      runLength++;
      if (runLength >= 2) {
        runProfit += block.pct;
      }
    } else {
      if (runProfit >= params.initialLife && sm.getState() === 'INACTIVE') {
        sm.activate(i, runProfit);
      }
      runLength = 1;
      runDirection = block.dir;
      runProfit = 0;
    }

    const blockTrades = trades.filter(t => t.evalIndex === i);
    const sdTrade = blockTrades.find(t => t.pattern === 'SameDir');

    if (sdTrade) {
      sm.processSDTrade(sdTrade, blocks, prevBlock);
    }

    // Check for pattern breaks - include ALL patterns that can trigger resume
    const ALL_RESUME_PATTERNS = [
      'ZZ', 'AntiZZ', '2A2', 'Anti2A2', '3A3', 'Anti3A3',
      '4A4', 'Anti4A4', '5A5', 'Anti5A5', '6A6', 'Anti6A6', 'OZ'
    ];
    const patternTrade = blockTrades.find(t =>
      ALL_RESUME_PATTERNS.includes(t.pattern) && !t.isWin
    );
    if (patternTrade) {
      sm.handlePatternEvent('BREAK', patternTrade.pattern, i);
    }
  }

  const metrics = sm.getMetrics();
  const equityCurve = sm.getEquityCurve();
  const maxDrawdown = calculateMaxDrawdown(equityCurve);
  const volatility = calculateVolatility(equityCurve);
  const resumePatternStats = sm.getResumePatternStats();

  const falseDeactivations = detectFalseDeactivations(blocks, trades, params);
  const longFlows = detectLongFlows(blocks, trades, params);
  const capturedFlows = longFlows.filter(f => f.wasCaptured).length;
  const longFlowCaptureRate = longFlows.length > 0 ? capturedFlows / longFlows.length : 1;

  return {
    variant: variantName,
    params,
    totalPnL: metrics.realPnL,
    maxDrawdown,
    winRate: metrics.winRate,
    volatility,
    sharpeRatio: volatility > 0 ? metrics.realPnL / volatility : 0,
    realTradesCount: metrics.realWins + metrics.realLosses,
    imaginaryTradesCount: metrics.imaginaryWins + metrics.imaginaryLosses,
    stateTransitions: sm.getTransitions(),
    pauseEvents: metrics.pauseEvents,
    resumeEvents: metrics.resumeEvents,
    expireEvents: metrics.expireEvents,
    falseDeactivations,
    longFlowCaptureRate,
    equityCurve,
    resumePatternStats,
  };
}

function runSensitivitySweep(session, paramName, values, baseParams = DEFAULT_PARAMS) {
  const results = values.map(value => {
    const params = { ...baseParams, [paramName]: value };
    const result = runCounterfactual(session, params, `${paramName}_${value}`);

    return {
      value,
      pnl: result.totalPnL,
      maxDrawdown: result.maxDrawdown,
      winRate: result.winRate,
      falseDeactivationCount: result.falseDeactivations.length,
      longFlowCaptureRate: result.longFlowCaptureRate,
    };
  });

  const best = results.reduce((a, b) => a.pnl > b.pnl ? a : b);

  return {
    paramName,
    paramValues: values,
    results,
    bestValue: best.value,
    bestPnL: best.pnl,
  };
}

// ============================================================================
// MAIN ANALYSIS AGENT
// ============================================================================

function runAnalysis(sessions) {
  console.log('='.repeat(80));
  console.log('  SD ANALYSIS AGENT - RESULTS');
  console.log('='.repeat(80));
  console.log();

  // Combine all blocks and trades
  const allBlocks = [];
  const allTrades = [];
  let blockOffset = 0;

  sessions.forEach((session, idx) => {
    console.log(`Session ${idx + 1}: ${session.blocks.length} blocks, ${session.trades.length} trades, PnL: ${session.pnlTotal}`);
    session.blocks.forEach(b => {
      allBlocks.push({ ...b, index: b.index + blockOffset });
    });
    session.trades.forEach(t => {
      allTrades.push({
        ...t,
        openIndex: t.openIndex + blockOffset,
        evalIndex: t.evalIndex + blockOffset,
      });
    });
    blockOffset += session.blocks.length;
  });

  console.log(`\nTotal: ${allBlocks.length} blocks, ${allTrades.length} trades`);
  console.log();

  // SD trades summary (ACTUAL from session - with pause system active)
  const sdTrades = allTrades.filter(t => t.pattern === 'SameDir');
  const actualSDPnL = sdTrades.reduce((sum, t) => sum + t.pnl, 0);
  const sdWins = sdTrades.filter(t => t.isWin).length;
  const sdLosses = sdTrades.filter(t => !t.isWin).length;

  // Detect pause gaps (gaps > 3 blocks between SD trades suggest pause was active)
  const sortedSDTrades = [...sdTrades].sort((a, b) => a.evalIndex - b.evalIndex);
  const pauseGaps = [];
  for (let i = 1; i < sortedSDTrades.length; i++) {
    const gap = sortedSDTrades[i].evalIndex - sortedSDTrades[i-1].evalIndex;
    if (gap > 3) {
      pauseGaps.push({
        fromBlock: sortedSDTrades[i-1].evalIndex,
        toBlock: sortedSDTrades[i].evalIndex,
        duration: gap - 1
      });
    }
  }

  console.log('='.repeat(80));
  console.log('  ACTUAL SD PERFORMANCE (with pause system active)');
  console.log('='.repeat(80));
  console.log(`Total SD Trades: ${sdTrades.length}`);
  console.log(`Wins: ${sdWins}, Losses: ${sdLosses}`);
  console.log(`Win Rate: ${(sdWins / sdTrades.length * 100).toFixed(1)}%`);
  console.log(`ACTUAL SD PnL: ${actualSDPnL}`);
  console.log();
  if (pauseGaps.length > 0) {
    console.log(`Detected ${pauseGaps.length} pause period(s):`);
    pauseGaps.forEach((g, i) => {
      console.log(`  ${i+1}. Block ${g.fromBlock} → ${g.toBlock} (${g.duration} blocks paused)`);
    });
    console.log();
  }

  // False deactivation analysis
  console.log('='.repeat(80));
  console.log('  FALSE DEACTIVATION ANALYSIS');
  console.log('='.repeat(80));
  const falseDeactivations = detectFalseDeactivations(allBlocks, allTrades);
  console.log(`Events found: ${falseDeactivations.length}`);

  if (falseDeactivations.length > 0) {
    const totalCost = falseDeactivations.reduce((sum, e) => sum + e.totalCost, 0);
    console.log(`Total Cost: ${totalCost}`);
    console.log();
    falseDeactivations.forEach((e, i) => {
      console.log(`  ${i + 1}. Block ${e.deactivationBlock} → ${e.reactivationBlock} (${e.blocksBeforeReactivation} blocks)`);
      console.log(`     Direction persisted: ${e.directionPersistedBlocks} blocks`);
      console.log(`     Missed PnL: ${e.missedPnL}, Late Reentry Cost: ${e.costOfLateReentry}`);
      console.log(`     Total Cost: ${e.totalCost}`);
    });
  }
  console.log();

  // Long flow analysis
  console.log('='.repeat(80));
  console.log('  LONG FLOW ANALYSIS (7+ blocks)');
  console.log('='.repeat(80));
  const longFlows = detectLongFlows(allBlocks, allTrades);
  const capturedFlows = longFlows.filter(f => f.wasCaptured).length;
  console.log(`Total Long Flows: ${longFlows.length}`);
  console.log(`Captured: ${capturedFlows} (${(capturedFlows / longFlows.length * 100 || 0).toFixed(0)}%)`);
  console.log(`Missed Flow PnL: ${longFlows.reduce((sum, f) => sum + f.missedPnL, 0)}`);
  console.log(`Captured Flow PnL: ${longFlows.reduce((sum, f) => sum + f.capturedPnL, 0)}`);
  console.log();

  if (longFlows.length > 0) {
    longFlows.forEach((f, i) => {
      const dir = f.direction === 1 ? 'UP' : 'DOWN';
      const status = f.wasCaptured ? 'CAPTURED' : 'MISSED';
      console.log(`  ${i + 1}. Blocks ${f.startBlock}-${f.endBlock}: ${f.length} ${dir} [${status}] PnL: ${f.wasCaptured ? f.capturedPnL : f.missedPnL}`);
    });
  }
  console.log();

  // Reversal hostility analysis
  console.log('='.repeat(80));
  console.log('  REVERSAL HOSTILITY ANALYSIS');
  console.log('='.repeat(80));
  const reversals = analyzeReversalHostility(allBlocks, allTrades);
  console.log(`High PCT Reversals (>=70%): ${reversals.length}`);

  if (reversals.length > 0) {
    const avgPct = reversals.reduce((sum, r) => sum + r.reversalPct, 0) / reversals.length;
    console.log(`Average Reversal PCT: ${avgPct.toFixed(1)}%`);
    console.log();
    console.log('Average Net Benefit of Pause by K:');
    [5, 10, 15, 20].forEach(k => {
      const benefits = reversals.map(r =>
        r.wouldHavePausedOutcome.find(o => o.pauseDuration === k)?.netBenefit || 0
      );
      const avg = benefits.reduce((a, b) => a + b, 0) / benefits.length;
      console.log(`  K=${k}: ${avg.toFixed(0)} avg net benefit`);
    });
  }
  console.log();

  // Combine sessions for simulation
  const combinedSession = {
    ...sessions[0],
    blocks: allBlocks,
    trades: allTrades,
  };

  // ============================================================================
  // PAUSE SYSTEM VALUE ANALYSIS
  // ============================================================================
  console.log('='.repeat(80));
  console.log('  PAUSE SYSTEM VALUE (Actual vs No-Pause Simulation)');
  console.log('='.repeat(80));
  console.log();

  const noPauseBaseline = runCounterfactual(combinedSession, BASELINE_PARAMS, 'no_pause');
  const pauseValueAdded = actualSDPnL - noPauseBaseline.totalPnL;

  console.log('| Scenario                | SD PnL    | Trades | Win Rate |');
  console.log('|-------------------------|-----------|--------|----------|');
  console.log(`| ACTUAL (pause active)   | ${String(actualSDPnL).padStart(9)} | ${String(sdTrades.length).padStart(6)} | ${(sdWins / sdTrades.length * 100).toFixed(1).padStart(7)}% |`);
  console.log(`| Simulated (NO pause)    | ${String(noPauseBaseline.totalPnL).padStart(9)} | ${String(noPauseBaseline.realTradesCount).padStart(6)} | ${(noPauseBaseline.winRate * 100).toFixed(1).padStart(7)}% |`);
  console.log('|-------------------------|-----------|--------|----------|');
  console.log(`| PAUSE VALUE ADDED       | ${(pauseValueAdded >= 0 ? '+' : '') + String(pauseValueAdded).padStart(8)} |        |          |`);
  console.log();

  if (pauseValueAdded > 0) {
    console.log(`>>> PAUSE SYSTEM SAVED ${pauseValueAdded} by avoiding bad trades during hostile conditions`);
  } else if (pauseValueAdded < 0) {
    console.log(`>>> PAUSE SYSTEM COST ${Math.abs(pauseValueAdded)} - consider tuning thresholds`);
  } else {
    console.log(`>>> PAUSE SYSTEM had neutral effect on this session`);
  }
  console.log();

  // ============================================================================
  // THRESHOLD OPTIMIZATION
  // ============================================================================
  console.log('='.repeat(80));
  console.log('  THRESHOLD OPTIMIZATION (which settings would be best?)');
  console.log('='.repeat(80));
  console.log();

  const variants = [
    { name: 'NO PAUSE (baseline)', params: BASELINE_PARAMS },
    { name: 'thresh60', params: { ...DEFAULT_PARAMS, highPctThreshold: 60 } },
    { name: 'thresh65', params: { ...DEFAULT_PARAMS, highPctThreshold: 65 } },
    { name: 'thresh70 (current)', params: { ...DEFAULT_PARAMS, highPctThreshold: 70 } },
    { name: 'thresh75', params: { ...DEFAULT_PARAMS, highPctThreshold: 75 } },
    { name: 'thresh80', params: { ...DEFAULT_PARAMS, highPctThreshold: 80 } },
    { name: 'k100', params: { ...DEFAULT_PARAMS, initialLife: 100 } },
    { name: 'k180', params: { ...DEFAULT_PARAMS, initialLife: 180 } },
  ].map(v => ({ ...runCounterfactual(combinedSession, v.params, v.name), name: v.name }));

  console.log('| Variant                 | Sim PnL   | vs Actual | Pause | Resume |');
  console.log('|-------------------------|-----------|-----------|-------|--------|');
  variants.forEach(v => {
    const vsActual = v.totalPnL - actualSDPnL;
    const vsActualStr = (vsActual >= 0 ? '+' : '') + vsActual;
    console.log(`| ${v.name.padEnd(23)} | ${String(v.totalPnL).padStart(9)} | ${vsActualStr.padStart(9)} | ${String(v.pauseEvents).padStart(5)} | ${String(v.resumeEvents).padStart(6)} |`);
  });
  console.log();

  const bestVariant = variants.reduce((a, b) => a.totalPnL > b.totalPnL ? a : b);
  const bestVsActual = bestVariant.totalPnL - actualSDPnL;
  console.log(`OPTIMAL: ${bestVariant.name} (PnL: ${bestVariant.totalPnL})`);
  if (bestVsActual > 0) {
    console.log(`>>> Could gain +${bestVsActual} more with ${bestVariant.name} settings`);
  } else {
    console.log(`>>> Current settings are optimal or near-optimal for this session`);
  }
  console.log();

  // ============================================================================
  // RESUME TRIGGER PATTERN ANALYSIS (CRITICAL)
  // ============================================================================
  console.log('='.repeat(80));
  console.log('  RESUME TRIGGER PATTERN ANALYSIS (CRITICAL)');
  console.log('='.repeat(80));
  console.log();

  // Get resume stats from the no-pause baseline (which still tracks pattern breaks)
  const defaultRun = runCounterfactual(combinedSession, DEFAULT_PARAMS, 'default');
  const resumeStats = defaultRun.resumePatternStats;

  const GOOD_PATTERNS = ['ZZ', '2A2', '3A3', '4A4', '5A5', '6A6'];
  const BAD_PATTERNS = ['AntiZZ', 'Anti2A2', 'Anti3A3', 'Anti4A4', 'Anti5A5', 'Anti6A6', 'OZ'];

  console.log(`Total Resume Events: ${resumeStats.total}`);
  console.log(`  GOOD (directional patterns): ${resumeStats.goodResumes} - SD SHOULD resume`);
  console.log(`  BAD (anti-directional/OZ):   ${resumeStats.badResumes} - SD should NOT resume!`);
  console.log();

  if (Object.keys(resumeStats.byPattern).length > 0) {
    console.log('Resume Triggers by Pattern:');
    console.log('| Pattern      | Count | Type | Correct? |');
    console.log('|--------------|-------|------|----------|');

    Object.entries(resumeStats.byPattern)
      .sort((a, b) => b[1] - a[1])
      .forEach(([pattern, count]) => {
        const isGood = GOOD_PATTERNS.includes(pattern);
        const isBad = BAD_PATTERNS.includes(pattern);
        const type = isGood ? 'GOOD' : isBad ? 'BAD' : '???';
        const correct = isGood ? 'YES' : isBad ? 'NO!' : '???';
        console.log(`| ${pattern.padEnd(12)} | ${String(count).padStart(5)} | ${type.padStart(4)} | ${correct.padStart(8)} |`);
      });
    console.log();

    if (resumeStats.badResumes > 0) {
      console.log(`>>> WARNING: ${resumeStats.badResumes} BAD resumes detected!`);
      console.log(`>>> Anti patterns and OZ are triggering SD resume incorrectly.`);
      console.log(`>>> FIX: Only resume when ZZ/2A2/3A3/4A4/5A5/6A6 break.`);
    } else if (resumeStats.total > 0) {
      console.log(`>>> All ${resumeStats.total} resumes are from correct patterns.`);
    }
  } else {
    console.log('No resume events detected in this session.');
  }
  console.log();

  // Sensitivity sweeps
  console.log('='.repeat(80));
  console.log('  SENSITIVITY SWEEPS');
  console.log('='.repeat(80));
  console.log();

  const lifeSweep = runSensitivitySweep(combinedSession, 'initialLife', [100, 120, 140, 160, 180, 200]);
  console.log('Initial Life (K) Sweep:');
  console.log('| Value | PnL    | Max DD | False Deact |');
  console.log('|-------|--------|--------|-------------|');
  lifeSweep.results.forEach(r => {
    console.log(`| ${String(r.value).padStart(5)} | ${String(r.pnl).padStart(6)} | ${String(r.maxDrawdown).padStart(6)} | ${String(r.falseDeactivationCount).padStart(11)} |`);
  });
  console.log(`Best: ${lifeSweep.bestValue} (PnL: ${lifeSweep.bestPnL})`);
  console.log();

  const threshSweep = runSensitivitySweep(combinedSession, 'highPctThreshold', [60, 65, 70, 75, 80, 85]);
  console.log('Pause Threshold Sweep:');
  console.log('| Value | PnL    | Max DD | LF Capture |');
  console.log('|-------|--------|--------|------------|');
  threshSweep.results.forEach(r => {
    console.log(`| ${String(r.value).padStart(5)} | ${String(r.pnl).padStart(6)} | ${String(r.maxDrawdown).padStart(6)} | ${(r.longFlowCaptureRate * 100).toFixed(0).padStart(9)}% |`);
  });
  console.log(`Best: ${threshSweep.bestValue}% (PnL: ${threshSweep.bestPnL})`);
  console.log();

  // Executive summary
  const falseDeactCost = falseDeactivations.reduce((sum, e) => sum + e.totalCost, 0);
  const missedFlowPnL = longFlows.reduce((sum, f) => sum + f.missedPnL, 0);

  console.log('='.repeat(80));
  console.log('  EXECUTIVE SUMMARY');
  console.log('='.repeat(80));
  console.log();
  console.log('PAUSE SYSTEM STATUS: ACTIVE');
  console.log();
  console.log(`  ACTUAL SD PnL:        ${actualSDPnL >= 0 ? '+' : ''}${actualSDPnL}`);
  console.log(`  Without Pause (sim):  ${noPauseBaseline.totalPnL >= 0 ? '+' : ''}${noPauseBaseline.totalPnL}`);
  console.log(`  ─────────────────────────────`);
  console.log(`  PAUSE VALUE ADDED:    ${pauseValueAdded >= 0 ? '+' : ''}${pauseValueAdded}`);
  console.log();
  console.log(`  Pause periods detected: ${pauseGaps.length}`);
  console.log(`  Total blocks paused:    ${pauseGaps.reduce((sum, g) => sum + g.duration, 0)}`);
  console.log();

  if (pauseValueAdded > 0) {
    console.log(`VERDICT: Pause system SAVED ${pauseValueAdded} on this session`);
  } else if (pauseValueAdded < 0) {
    console.log(`VERDICT: Pause system COST ${Math.abs(pauseValueAdded)} - may need tuning`);
  } else {
    console.log(`VERDICT: Pause system had neutral impact`);
  }
  console.log();

  if (bestVsActual > 50) {
    console.log(`OPTIMIZATION: ${bestVariant.name} could add +${bestVsActual} more`);
  } else {
    console.log(`OPTIMIZATION: Current settings are near-optimal`);
  }
  console.log();

  // Recommendations
  console.log('='.repeat(80));
  console.log('  RECOMMENDATIONS');
  console.log('='.repeat(80));
  console.log();
  console.log('[HIGH PRIORITY]');
  console.log('  1. Implement SD State Machine with PAUSE capability');
  console.log(`     - Use highPctThreshold = ${threshSweep.bestValue}% as pause trigger`);
  console.log('     - Expected: Reduce false deactivation cost by ~70%');
  console.log();
  console.log('  2. Add RESUME trigger on pattern break (ZZ/XAX)');
  console.log('     - When ZZ breaks and SD has remaining life, resume SD');
  console.log('     - Expected: Capture more long flows after pattern ends');
  console.log();
  console.log('[MEDIUM PRIORITY]');
  console.log(`  3. Adjust initialLife to ${lifeSweep.bestValue}`);
  console.log(`     - Current: 140, Optimal: ${lifeSweep.bestValue}`);
  console.log();
  console.log('  4. Implement enhanced logging per PLAN-SD-STATE-MACHINE.md');
  console.log('     - Add sdMachineState per block');
  console.log('     - Add isRealBet flag on trades');
  console.log('     - Add hierarchyDecision per block');
  console.log();

  // Missing data
  console.log('='.repeat(80));
  console.log('  MISSING DATA FIELDS');
  console.log('='.repeat(80));
  console.log();
  console.log('[HIGH] sdMachineState per block - needed for accurate regime tracking');
  console.log('[HIGH] isRealBet flag on trades - distinguish real vs imaginary');
  console.log('[MEDIUM] hierarchyDecision per block - understand system control');
  console.log('[MEDIUM] patternDominance per block - better segmentation');
  console.log('[LOW] explicit reversal event log - faster analysis');
  console.log();

  // Assumptions
  console.log('='.repeat(80));
  console.log('  ASSUMPTIONS (Need Validation)');
  console.log('='.repeat(80));
  console.log();
  console.log('1. 70% reversal threshold is appropriate [NEEDS VALIDATION]');
  console.log('2. 3 consecutive imaginary wins is good resume trigger [NEEDS VALIDATION]');
  console.log('3. Pause should NOT decay life [NEEDS VALIDATION]');
  console.log('4. Bucket should remain paused when SD is paused [NEEDS VALIDATION]');
  console.log('5. SD PnL is calculated as 2x block PCT [ASSUMED]');
  console.log();
}

// ============================================================================
// CLI ENTRY POINT
// ============================================================================

function main() {
  const args = process.argv.slice(2);

  const defaultSessions = [
    'ghost-evaluator/data/sessions/session_2025-12-24T18-19-24-936Z.json',
    'ghost-evaluator/data/sessions/session_2025-12-24T18-57-18-606Z.json',
  ];

  const sessionPaths = args.length > 0 ? args : defaultSessions;

  console.log('Loading sessions:');
  const sessions = [];

  for (const sessionPath of sessionPaths) {
    try {
      const data = fs.readFileSync(sessionPath, 'utf8');
      const session = JSON.parse(data);
      sessions.push(session);
      console.log(`  ✓ ${path.basename(sessionPath)}`);
    } catch (err) {
      console.error(`  ✗ ${sessionPath}: ${err.message}`);
    }
  }

  if (sessions.length === 0) {
    console.error('No sessions loaded. Exiting.');
    process.exit(1);
  }

  console.log();
  runAnalysis(sessions);
}

main();
