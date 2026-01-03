/**
 * Hostility Detection Backtest Script
 * ====================================
 *
 * Tests the hostility detector against historical sessions to verify:
 * 1. Profitable sessions don't get unnecessarily paused (false positives)
 * 2. Losing sessions trigger hostility detection early enough
 *
 * Success Criteria:
 * - Profitable session impact: <5% profit reduction
 * - Losing session savings: >30% loss reduction
 * - False positive rate: <10%
 * - True positive rate: >80%
 */

const fs = require('fs');
const path = require('path');

// Configuration matching hostility-detector.ts
const CONFIG = {
  weights: {
    CASCADE: 3,
    CROSS_PATTERN: 2,
    OPPOSITE_SYNC: 4,
    HIGH_PCT: 1,
    HIGH_PCT_CLUSTER: 3,
    WR_COLLAPSE: 2,
  },
  // TUNED v4: Very high pause threshold, aggressive caution
  thresholds: {
    cautionLevel: 10,   // caution at 10+ (skip low conf)
    pauseLevel: 20,     // RAISED to 20 - only pause on clear hostility
    extendedPauseLevel: 25,  // extended at 25+
  },
  pauseDurations: {
    pause: 5,
    extendedPause: 10,
  },
  decay: {
    perWin: 3,         // INCREASED from 2 - faster recovery on wins
    perIdleBlock: 0.5,
  },
  cautionMinConfidence: 60,
  resumeScoreThreshold: 4,
  exemptPatterns: ['ZZ', 'AntiZZ'],
  triggers: {
    cascadeLosses: 3,
    crossPatternWindow: 3,
    crossPatternMinPatterns: 2,
    highPctThreshold: 90,  // RAISED from 80
    highPctClusterCount: 3,
    highPctClusterWindow: 5,
    highPctClusterThreshold: 70,
    wrCollapseThreshold: 30,
    wrCollapseWindow: 10,
  },
};

// Opposite patterns
const OPPOSITE_PATTERNS = {
  '2A2': 'Anti2A2', 'Anti2A2': '2A2',
  '3A3': 'Anti3A3', 'Anti3A3': '3A3',
  '4A4': 'Anti4A4', 'Anti4A4': '4A4',
  '5A5': 'Anti5A5', 'Anti5A5': '5A5',
  '6A6': 'Anti6A6', 'Anti6A6': '6A6',
  'AP5': 'OZ', 'OZ': 'AP5',
  'ZZ': 'AntiZZ', 'AntiZZ': 'ZZ',
  'PP': 'ST', 'ST': 'PP',
};

class HostilitySimulator {
  constructor() {
    this.reset();
  }

  reset() {
    this.score = 0;
    this.level = 'normal';
    this.recentTrades = [];
    this.patternConsecutiveLosses = {};
    this.recentLossesByBlock = {};
    this.pauseBlocksRemaining = 0;
    this.indicators = [];
    this.pauseEvents = [];
    this.tradedDuringPause = [];
  }

  processSession(session) {
    this.reset();

    const results = {
      sessionFile: session.file,
      originalPnL: session.pnlTotal,
      trades: session.trades.length,
      originalWR: 0,

      // Hostility tracking
      maxScore: 0,
      totalPauseBlocks: 0,
      pauseCount: 0,
      cautionCount: 0,

      // Impact calculation
      tradesMissed: 0,
      pnlMissed: 0,  // PnL that would have been made during pause
      adjustedPnL: 0, // What PnL would be if we paused
    };

    if (!session.trades || session.trades.length === 0) {
      return results;
    }

    const wins = session.trades.filter(t => t.isWin).length;
    results.originalWR = ((wins / session.trades.length) * 100).toFixed(1);

    let adjustedPnL = 0;

    for (const trade of session.trades) {
      // Check if pattern is exempt
      const isExempt = CONFIG.exemptPatterns.includes(trade.pattern);

      // Determine if we would trade
      let wouldTrade = true;
      if (!isExempt) {
        if (this.level === 'pause' || this.level === 'extended_pause') {
          wouldTrade = false;
        } else if (this.level === 'caution') {
          wouldTrade = trade.confidence >= CONFIG.cautionMinConfidence;
        }
      }

      // Track what happens
      if (wouldTrade) {
        adjustedPnL += trade.pnl;
      } else {
        results.tradesMissed++;
        results.pnlMissed += trade.pnl;
      }

      // Process the trade in the simulator
      this.processTrade(trade);

      // Track max score
      if (this.score > results.maxScore) {
        results.maxScore = this.score;
      }

      // Track pause events
      if (this.pauseBlocksRemaining > 0 && !isExempt) {
        results.totalPauseBlocks++;
      }
    }

    results.adjustedPnL = adjustedPnL;
    results.pauseCount = this.pauseEvents.length;

    return results;
  }

  processTrade(trade) {
    const tradeResult = {
      blockIndex: trade.evalIndex,
      pattern: trade.pattern,
      isWin: trade.isWin,
      pct: trade.pct,
      pnl: trade.pnl,
    };

    // Add to recent trades
    this.recentTrades.push(tradeResult);
    if (this.recentTrades.length > CONFIG.triggers.wrCollapseWindow) {
      this.recentTrades.shift();
    }

    if (trade.isWin) {
      this.decayScore(CONFIG.decay.perWin);
      this.patternConsecutiveLosses[trade.pattern] = 0;
    } else {
      this.processLoss(tradeResult);
    }

    this.updateLevel(trade.evalIndex);

    // Advance pause counter
    if (this.pauseBlocksRemaining > 0) {
      this.pauseBlocksRemaining--;
    }
  }

  processLoss(trade) {
    const blockIndex = trade.blockIndex;

    // Track consecutive losses per pattern
    const prevLosses = this.patternConsecutiveLosses[trade.pattern] || 0;
    this.patternConsecutiveLosses[trade.pattern] = prevLosses + 1;

    // Track losses by block
    if (!this.recentLossesByBlock[blockIndex]) {
      this.recentLossesByBlock[blockIndex] = [];
    }
    this.recentLossesByBlock[blockIndex].push(trade.pattern);

    // Check indicators
    this.checkCascade(trade);
    this.checkCrossPattern(trade);
    this.checkOppositeSync(trade);
    this.checkHighPct(trade);
    this.checkHighPctCluster(trade);
    this.checkWrCollapse(trade);
  }

  checkCascade(trade) {
    const consecutiveLosses = this.patternConsecutiveLosses[trade.pattern] || 0;
    if (consecutiveLosses >= CONFIG.triggers.cascadeLosses) {
      this.addScore(CONFIG.weights.CASCADE, 'CASCADE', trade.pattern);
    }
  }

  checkCrossPattern(trade) {
    const window = CONFIG.triggers.crossPatternWindow;
    const uniquePatterns = new Set();

    for (let i = trade.blockIndex; i > trade.blockIndex - window && i >= 0; i--) {
      const losses = this.recentLossesByBlock[i];
      if (losses) {
        losses.forEach(p => uniquePatterns.add(p));
      }
    }

    if (uniquePatterns.size >= CONFIG.triggers.crossPatternMinPatterns) {
      // Only add if not recently added
      const lastCross = this.indicators.filter(i => i.type === 'CROSS_PATTERN').pop();
      if (!lastCross || trade.blockIndex - lastCross.block >= window) {
        this.addScore(CONFIG.weights.CROSS_PATTERN, 'CROSS_PATTERN');
      }
    }
  }

  checkOppositeSync(trade) {
    const opposite = OPPOSITE_PATTERNS[trade.pattern];
    if (!opposite) return;

    const recentOppLoss = this.recentTrades.find(
      t => !t.isWin &&
           t.pattern === opposite &&
           trade.blockIndex - t.blockIndex <= 5 &&
           trade.blockIndex > t.blockIndex
    );

    if (recentOppLoss) {
      this.addScore(CONFIG.weights.OPPOSITE_SYNC, 'OPPOSITE_SYNC', `${opposite}+${trade.pattern}`);
    }
  }

  checkHighPct(trade) {
    if (trade.pct >= CONFIG.triggers.highPctThreshold) {
      this.addScore(CONFIG.weights.HIGH_PCT, 'HIGH_PCT');
    }
  }

  checkHighPctCluster(trade) {
    const window = CONFIG.triggers.highPctClusterWindow;
    const threshold = CONFIG.triggers.highPctClusterThreshold;

    const highPctLosses = this.recentTrades.filter(
      t => !t.isWin &&
           t.pct >= threshold &&
           trade.blockIndex - t.blockIndex < window
    );

    if (highPctLosses.length >= CONFIG.triggers.highPctClusterCount) {
      const lastCluster = this.indicators.filter(i => i.type === 'HIGH_PCT_CLUSTER').pop();
      if (!lastCluster || trade.blockIndex - lastCluster.block >= window) {
        this.addScore(CONFIG.weights.HIGH_PCT_CLUSTER, 'HIGH_PCT_CLUSTER');
      }
    }
  }

  checkWrCollapse(trade) {
    if (this.recentTrades.length < CONFIG.triggers.wrCollapseWindow) return;

    const wins = this.recentTrades.filter(t => t.isWin).length;
    const winRate = (wins / this.recentTrades.length) * 100;

    if (winRate < CONFIG.triggers.wrCollapseThreshold) {
      const lastCollapse = this.indicators.filter(i => i.type === 'WR_COLLAPSE').pop();
      if (!lastCollapse || trade.blockIndex - lastCollapse.block >= 5) {
        this.addScore(CONFIG.weights.WR_COLLAPSE, 'WR_COLLAPSE');
      }
    }
  }

  addScore(weight, type, detail = '') {
    this.score += weight;
    this.indicators.push({ type, weight, detail, block: this.recentTrades.length });
  }

  decayScore(amount) {
    this.score = Math.max(0, this.score - amount);
  }

  updateLevel(blockIndex) {
    const prevLevel = this.level;

    if (this.score >= CONFIG.thresholds.extendedPauseLevel) {
      this.level = 'extended_pause';
      if (this.pauseBlocksRemaining === 0 && prevLevel !== 'extended_pause') {
        this.pauseBlocksRemaining = CONFIG.pauseDurations.extendedPause;
        this.pauseEvents.push({ block: blockIndex, type: 'extended_pause', score: this.score });
      }
    } else if (this.score >= CONFIG.thresholds.pauseLevel) {
      this.level = 'pause';
      if (this.pauseBlocksRemaining === 0 && prevLevel !== 'pause' && prevLevel !== 'extended_pause') {
        this.pauseBlocksRemaining = CONFIG.pauseDurations.pause;
        this.pauseEvents.push({ block: blockIndex, type: 'pause', score: this.score });
      }
    } else if (this.score >= CONFIG.thresholds.cautionLevel) {
      this.level = 'caution';
    } else {
      this.level = 'normal';
    }
  }
}

// Main execution
const sessionsDir = 'C:/Users/Okhantu/Desktop/The other income/ghost-evaluator/data/sessions';
const sessionFiles = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));

console.log('='.repeat(80));
console.log('HOSTILITY DETECTION BACKTEST');
console.log('='.repeat(80));
console.log(`Sessions: ${sessionFiles.length}`);
console.log();

const simulator = new HostilitySimulator();
const results = {
  profitable: [],
  losing: [],
};

for (const file of sessionFiles) {
  try {
    const session = JSON.parse(fs.readFileSync(path.join(sessionsDir, file)));
    session.file = file;

    if (!session.trades || session.trades.length === 0) continue;

    const result = simulator.processSession(session);

    if (session.pnlTotal >= 0) {
      results.profitable.push(result);
    } else {
      results.losing.push(result);
    }
  } catch (e) {
    console.log(`Error processing ${file}: ${e.message}`);
  }
}

// Analyze profitable sessions
console.log('='.repeat(80));
console.log('PROFITABLE SESSIONS ANALYSIS');
console.log('='.repeat(80));

let profitableImpact = 0;
let profitableMissed = 0;
let profitableFalsePositives = 0;

for (const r of results.profitable) {
  const impact = r.originalPnL - r.adjustedPnL;
  const impactPct = r.originalPnL > 0 ? (impact / r.originalPnL * 100) : 0;

  profitableImpact += impact;
  profitableMissed += r.tradesMissed;

  if (r.pauseCount > 0 && r.pnlMissed > 0) {
    profitableFalsePositives++;
    console.log(`  FALSE POSITIVE: ${r.sessionFile}`);
    console.log(`    Original: ${r.originalPnL}, Adjusted: ${r.adjustedPnL}, Impact: ${impact.toFixed(0)} (${impactPct.toFixed(1)}%)`);
    console.log(`    MaxScore: ${r.maxScore.toFixed(1)}, Pauses: ${r.pauseCount}, TradesMissed: ${r.tradesMissed}`);
    console.log(`    PnL Missed: ${r.pnlMissed.toFixed(0)} (${r.pnlMissed > 0 ? 'would have won more' : 'avoided losses'})`);
  }
}

const avgProfitableImpact = results.profitable.length > 0
  ? (profitableImpact / results.profitable.reduce((a, r) => a + r.originalPnL, 0) * 100)
  : 0;

console.log();
console.log(`Total Profitable Sessions: ${results.profitable.length}`);
console.log(`False Positives (paused profitable): ${profitableFalsePositives}`);
console.log(`Total Impact on Profits: ${profitableImpact.toFixed(0)} (${avgProfitableImpact.toFixed(1)}%)`);
console.log(`Trades Missed: ${profitableMissed}`);

// Analyze losing sessions
console.log();
console.log('='.repeat(80));
console.log('LOSING SESSIONS ANALYSIS');
console.log('='.repeat(80));

let losingSaved = 0;
let losingDetected = 0;

for (const r of results.losing) {
  const saved = r.pnlMissed * -1;  // pnlMissed is negative in losing sessions = saved
  const savedPct = r.originalPnL < 0 ? (saved / Math.abs(r.originalPnL) * 100) : 0;

  losingSaved += saved;

  if (r.pauseCount > 0) {
    losingDetected++;
  }

  console.log(`  ${r.sessionFile}`);
  console.log(`    Original: ${r.originalPnL}, Adjusted: ${r.adjustedPnL}`);
  console.log(`    MaxScore: ${r.maxScore.toFixed(1)}, Pauses: ${r.pauseCount}, TradesMissed: ${r.tradesMissed}`);
  console.log(`    Saved: ${saved.toFixed(0)} (${savedPct.toFixed(1)}% of loss)`);
}

const avgLosingSaved = results.losing.length > 0 && results.losing.reduce((a, r) => a + Math.abs(r.originalPnL), 0) > 0
  ? (losingSaved / results.losing.reduce((a, r) => a + Math.abs(r.originalPnL), 0) * 100)
  : 0;

console.log();
console.log(`Total Losing Sessions: ${results.losing.length}`);
console.log(`Sessions Where Pause Triggered: ${losingDetected}`);
console.log(`Detection Rate: ${(losingDetected / results.losing.length * 100).toFixed(1)}%`);
console.log(`Total Loss Saved: ${losingSaved.toFixed(0)} (${avgLosingSaved.toFixed(1)}%)`);

// Summary
console.log();
console.log('='.repeat(80));
console.log('SUMMARY');
console.log('='.repeat(80));

const totalOriginalPnL = [...results.profitable, ...results.losing].reduce((a, r) => a + r.originalPnL, 0);
const totalAdjustedPnL = [...results.profitable, ...results.losing].reduce((a, r) => a + r.adjustedPnL, 0);
const netImprovement = totalAdjustedPnL - totalOriginalPnL;

console.log(`Original Total PnL: ${totalOriginalPnL.toFixed(0)}`);
console.log(`Adjusted Total PnL: ${totalAdjustedPnL.toFixed(0)}`);
console.log(`Net Improvement: ${netImprovement.toFixed(0)} (${(netImprovement / Math.abs(totalOriginalPnL) * 100).toFixed(1)}%)`);
console.log();
console.log('SUCCESS CRITERIA:');
console.log(`  - Profitable session impact <5%: ${avgProfitableImpact.toFixed(1)}% ${avgProfitableImpact < 5 ? 'PASS' : 'FAIL'}`);
console.log(`  - Losing session savings >30%: ${avgLosingSaved.toFixed(1)}% ${avgLosingSaved > 30 ? 'PASS' : 'NEEDS TUNING'}`);
console.log(`  - False positive rate <10%: ${(profitableFalsePositives / results.profitable.length * 100).toFixed(1)}% ${(profitableFalsePositives / results.profitable.length * 100) < 10 ? 'PASS' : 'FAIL'}`);
console.log(`  - Detection rate >80%: ${(losingDetected / results.losing.length * 100).toFixed(1)}% ${(losingDetected / results.losing.length * 100) > 80 ? 'PASS' : 'NEEDS TUNING'}`);
