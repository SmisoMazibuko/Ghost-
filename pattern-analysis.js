#!/usr/bin/env node
/**
 * Comprehensive Pattern Analysis Script
 * Analyzes each pattern, checks rule compliance, identifies best/worst performers
 */

const fs = require('fs');

const sessionPath = process.argv[2] || 'ghost-evaluator/data/sessions/session_2025-12-28T11-52-58-891Z.json';
const session = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));

const blocks = session.blocks;
const trades = session.trades;

console.log('='.repeat(80));
console.log('  COMPREHENSIVE PATTERN ANALYSIS');
console.log('  Session: ' + sessionPath.split('/').pop());
console.log('='.repeat(80));
console.log();

// Group trades by pattern
const byPattern = {};
trades.forEach(t => {
  if (!byPattern[t.pattern]) {
    byPattern[t.pattern] = [];
  }
  byPattern[t.pattern].push(t);
});

// Sort patterns by trade count
const patterns = Object.keys(byPattern).sort((a, b) => byPattern[b].length - byPattern[a].length);

console.log('PATTERN SUMMARY TABLE');
console.log('-'.repeat(90));
console.log('| Pattern     | Trades | Wins | Losses | Win%  | PnL     | Avg PnL | Best  | Worst |');
console.log('|-------------|--------|------|--------|-------|---------|---------|-------|-------|');

const patternStats = patterns.map(p => {
  const patternTrades = byPattern[p];
  const wins = patternTrades.filter(t => t.isWin).length;
  const losses = patternTrades.filter(t => !t.isWin).length;
  const winRate = patternTrades.length > 0 ? (wins / patternTrades.length * 100).toFixed(1) : 0;
  const totalPnL = patternTrades.reduce((sum, t) => sum + t.pnl, 0);
  const avgPnL = patternTrades.length > 0 ? (totalPnL / patternTrades.length).toFixed(1) : 0;
  const bestTrade = Math.max(...patternTrades.map(t => t.pnl));
  const worstTrade = Math.min(...patternTrades.map(t => t.pnl));

  console.log(`| ${p.padEnd(11)} | ${String(patternTrades.length).padStart(6)} | ${String(wins).padStart(4)} | ${String(losses).padStart(6)} | ${String(winRate).padStart(4)}% | ${String(totalPnL).padStart(7)} | ${String(avgPnL).padStart(7)} | ${String(bestTrade).padStart(5)} | ${String(worstTrade).padStart(5)} |`);

  return { pattern: p, trades: patternTrades.length, wins, losses, winRate: parseFloat(winRate), pnl: totalPnL, avgPnL: parseFloat(avgPnL), bestTrade, worstTrade };
});

console.log('-'.repeat(90));

// Total row
const totalTrades = trades.length;
const totalWins = trades.filter(t => t.isWin).length;
const totalLosses = trades.filter(t => !t.isWin).length;
const totalPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
console.log(`| TOTAL       | ${String(totalTrades).padStart(6)} | ${String(totalWins).padStart(4)} | ${String(totalLosses).padStart(6)} | ${(totalWins/totalTrades*100).toFixed(1).padStart(4)}% | ${String(totalPnL).padStart(7)} |         |       |       |`);
console.log();

// Best and worst performing patterns
const sortedByPnL = [...patternStats].sort((a, b) => b.pnl - a.pnl);
console.log('='.repeat(80));
console.log('  BEST PERFORMING PATTERNS (by total PnL)');
console.log('='.repeat(80));
sortedByPnL.filter(p => p.pnl > 0).forEach((p, i) => {
  console.log(`  ${i+1}. ${p.pattern.padEnd(12)} +${p.pnl} (${p.winRate}% win rate, ${p.trades} trades)`);
});
console.log();

console.log('='.repeat(80));
console.log('  WORST PERFORMING PATTERNS (by total PnL)');
console.log('='.repeat(80));
sortedByPnL.filter(p => p.pnl < 0).reverse().forEach((p, i) => {
  console.log(`  ${i+1}. ${p.pattern.padEnd(12)} ${p.pnl} (${p.winRate}% win rate, ${p.trades} trades)`);
});
console.log();

// Sort by win rate (min 3 trades)
const sortedByWinRate = [...patternStats].filter(p => p.trades >= 3).sort((a, b) => b.winRate - a.winRate);
console.log('='.repeat(80));
console.log('  PATTERNS BY WIN RATE (min 3 trades)');
console.log('='.repeat(80));
console.log('| Pattern     | Win Rate | W/L      | PnL     | Status      |');
console.log('|-------------|----------|----------|---------|-------------|');
sortedByWinRate.forEach(p => {
  const status = p.winRate >= 60 ? 'PROFITABLE' : p.winRate >= 50 ? 'BREAK-EVEN' : 'LOSING';
  console.log(`| ${p.pattern.padEnd(11)} | ${(p.winRate + '%').padStart(7)} | ${p.wins}/${p.wins + p.losses}`.padEnd(22) + `| ${String(p.pnl).padStart(7)} | ${status.padEnd(11)} |`);
});
console.log();

// ================================================================================
// DETAILED PATTERN-BY-PATTERN ANALYSIS WITH RULE CHECKING
// ================================================================================

console.log('='.repeat(80));
console.log('  DETAILED PATTERN ANALYSIS WITH RULE COMPLIANCE');
console.log('='.repeat(80));
console.log();

// Define pattern rules
const PATTERN_RULES = {
  'ZZ': {
    description: 'Zig-Zag pattern - bet on alternation after 2+ same direction',
    expectedDirection: 'opposite to previous block',
    activationCondition: '2+ consecutive blocks in same direction',
  },
  'AntiZZ': {
    description: 'Anti Zig-Zag - bet on continuation after alternation',
    expectedDirection: 'same as previous block',
    activationCondition: 'Alternating pattern detected',
  },
  'SameDir': {
    description: 'Same Direction - bet that run continues',
    expectedDirection: 'same as previous block',
    activationCondition: 'Run of 2+ blocks in same direction',
  },
  '2A2': {
    description: '2-Alternating-2 pattern',
    expectedDirection: 'based on 2A2 structure',
    activationCondition: '2 same, then alternation, then 2 same',
  },
  'Anti2A2': {
    description: 'Anti 2-Alternating-2 pattern',
    expectedDirection: 'opposite to 2A2',
    activationCondition: 'Anti-pattern of 2A2',
  },
  '3A3': {
    description: '3-Alternating-3 pattern',
    expectedDirection: 'based on 3A3 structure',
    activationCondition: '3 same, then alternation, then 3 same',
  },
  'Anti3A3': {
    description: 'Anti 3-Alternating-3 pattern',
    expectedDirection: 'opposite to 3A3',
    activationCondition: 'Anti-pattern of 3A3',
  },
  '4A4': {
    description: '4-Alternating-4 pattern',
    expectedDirection: 'based on 4A4 structure',
    activationCondition: '4 same, then alternation',
  },
  'Anti4A4': {
    description: 'Anti 4-Alternating-4 pattern',
    expectedDirection: 'opposite to 4A4',
    activationCondition: 'Anti-pattern of 4A4',
  },
  'OZ': {
    description: 'OZ pattern',
    expectedDirection: 'based on OZ structure',
    activationCondition: 'OZ pattern detected',
  },
  'Bucket': {
    description: 'Bucket pattern - accumulation/distribution',
    expectedDirection: 'based on bucket analysis',
    activationCondition: 'Bucket conditions met',
  },
};

// Analyze each pattern in detail
patterns.forEach(patternName => {
  const patternTrades = byPattern[patternName];
  const rule = PATTERN_RULES[patternName] || { description: 'Unknown pattern', expectedDirection: 'N/A', activationCondition: 'N/A' };

  console.log('-'.repeat(80));
  console.log(`PATTERN: ${patternName}`);
  console.log('-'.repeat(80));
  console.log(`Description: ${rule.description}`);
  console.log();

  // Stats
  const wins = patternTrades.filter(t => t.isWin).length;
  const losses = patternTrades.length - wins;
  const pnl = patternTrades.reduce((sum, t) => sum + t.pnl, 0);
  const winRate = (wins / patternTrades.length * 100).toFixed(1);

  console.log(`Stats: ${patternTrades.length} trades, ${wins}W/${losses}L (${winRate}%), PnL: ${pnl}`);
  console.log();

  // Streak analysis
  let currentStreak = 0;
  let maxWinStreak = 0;
  let maxLoseStreak = 0;
  let streakType = null;

  patternTrades.sort((a, b) => a.evalIndex - b.evalIndex).forEach(t => {
    if (t.isWin) {
      if (streakType === 'win') {
        currentStreak++;
      } else {
        if (streakType === 'loss') maxLoseStreak = Math.max(maxLoseStreak, currentStreak);
        currentStreak = 1;
        streakType = 'win';
      }
      maxWinStreak = Math.max(maxWinStreak, currentStreak);
    } else {
      if (streakType === 'loss') {
        currentStreak++;
      } else {
        if (streakType === 'win') maxWinStreak = Math.max(maxWinStreak, currentStreak);
        currentStreak = 1;
        streakType = 'loss';
      }
      maxLoseStreak = Math.max(maxLoseStreak, currentStreak);
    }
  });
  if (streakType === 'win') maxWinStreak = Math.max(maxWinStreak, currentStreak);
  if (streakType === 'loss') maxLoseStreak = Math.max(maxLoseStreak, currentStreak);

  console.log(`Streaks: Max Win Streak: ${maxWinStreak}, Max Lose Streak: ${maxLoseStreak}`);

  // Trade-by-trade breakdown (first 10 and last 5)
  console.log();
  console.log('Recent trades (chronological):');
  const sortedTrades = patternTrades.sort((a, b) => a.evalIndex - b.evalIndex);
  const displayTrades = sortedTrades.length <= 15 ? sortedTrades : [...sortedTrades.slice(0, 8), null, ...sortedTrades.slice(-5)];

  displayTrades.forEach((t, i) => {
    if (t === null) {
      console.log('  ... (' + (sortedTrades.length - 13) + ' more trades) ...');
      return;
    }
    const block = blocks[t.evalIndex];
    const prevBlock = t.evalIndex > 0 ? blocks[t.evalIndex - 1] : null;
    const dirSymbol = block.dir === 1 ? 'UP' : 'DOWN';
    const prevDirSymbol = prevBlock ? (prevBlock.dir === 1 ? 'UP' : 'DOWN') : 'N/A';
    const result = t.isWin ? 'WIN' : 'LOSS';
    const pnlStr = t.pnl >= 0 ? '+' + t.pnl : String(t.pnl);

    console.log(`  Block ${String(t.evalIndex).padStart(3)}: ${prevDirSymbol.padEnd(4)} -> ${dirSymbol.padEnd(4)} | ${result.padEnd(4)} ${pnlStr.padStart(5)} | Bet: ${t.predictedDirection === 1 ? 'UP' : 'DOWN'}`);
  });

  // Rule compliance check
  console.log();
  console.log('Rule Compliance:');

  // Check if pattern followed expected behavior
  if (patternName === 'ZZ') {
    // ZZ should bet opposite to previous direction
    let correctBets = 0;
    patternTrades.forEach(t => {
      const prevBlock = t.evalIndex > 0 ? blocks[t.evalIndex - 1] : null;
      if (prevBlock && t.predictedDirection === -prevBlock.dir) {
        correctBets++;
      }
    });
    console.log(`  - Bet opposite to prev block: ${correctBets}/${patternTrades.length} (${(correctBets/patternTrades.length*100).toFixed(0)}%)`);
  } else if (patternName === 'AntiZZ') {
    // AntiZZ should bet same as previous direction
    let correctBets = 0;
    patternTrades.forEach(t => {
      const prevBlock = t.evalIndex > 0 ? blocks[t.evalIndex - 1] : null;
      if (prevBlock && t.predictedDirection === prevBlock.dir) {
        correctBets++;
      }
    });
    console.log(`  - Bet same as prev block: ${correctBets}/${patternTrades.length} (${(correctBets/patternTrades.length*100).toFixed(0)}%)`);
  } else if (patternName === 'SameDir') {
    // SameDir should bet same as previous direction
    let correctBets = 0;
    patternTrades.forEach(t => {
      const prevBlock = t.evalIndex > 0 ? blocks[t.evalIndex - 1] : null;
      if (prevBlock && t.predictedDirection === prevBlock.dir) {
        correctBets++;
      }
    });
    console.log(`  - Bet same as prev block: ${correctBets}/${patternTrades.length} (${(correctBets/patternTrades.length*100).toFixed(0)}%)`);
  } else {
    console.log(`  - Pattern-specific rules: Checking predictedDirection alignment...`);
    // Generic check: did the pattern predict correctly?
    const correctPredictions = patternTrades.filter(t => t.isWin).length;
    console.log(`  - Correct predictions: ${correctPredictions}/${patternTrades.length} (${(correctPredictions/patternTrades.length*100).toFixed(0)}%)`);
  }

  // Assess pattern health
  let status = '';
  if (winRate >= 60 && pnl > 0) {
    status = 'HEALTHY - Pattern performing well';
  } else if (winRate >= 50) {
    status = 'MARGINAL - Breaking even, monitor closely';
  } else if (winRate >= 40) {
    status = 'UNDERPERFORMING - Consider parameter tuning';
  } else {
    status = 'CRITICAL - Pattern may be inverted or broken';
  }

  console.log();
  console.log(`STATUS: ${status}`);
  console.log();
});

// ================================================================================
// SUMMARY RECOMMENDATIONS
// ================================================================================

console.log('='.repeat(80));
console.log('  PATTERN RECOMMENDATIONS');
console.log('='.repeat(80));
console.log();

const profitable = patternStats.filter(p => p.pnl > 0 && p.winRate >= 50);
const marginal = patternStats.filter(p => p.winRate >= 45 && p.winRate < 55);
const unprofitable = patternStats.filter(p => p.pnl < 0 && p.winRate < 45);

console.log('KEEP (profitable):');
profitable.forEach(p => console.log(`  + ${p.pattern}: +${p.pnl} (${p.winRate}%)`));
if (profitable.length === 0) console.log('  (none)');
console.log();

console.log('MONITOR (marginal):');
marginal.forEach(p => console.log(`  ~ ${p.pattern}: ${p.pnl} (${p.winRate}%)`));
if (marginal.length === 0) console.log('  (none)');
console.log();

console.log('REVIEW (unprofitable):');
unprofitable.forEach(p => console.log(`  - ${p.pattern}: ${p.pnl} (${p.winRate}%)`));
if (unprofitable.length === 0) console.log('  (none)');
console.log();

// Find patterns that might be inverted
const possiblyInverted = patternStats.filter(p => p.winRate < 40 && p.trades >= 3);
if (possiblyInverted.length > 0) {
  console.log('POSSIBLY INVERTED (win rate < 40%):');
  possiblyInverted.forEach(p => {
    console.log(`  ! ${p.pattern}: ${p.winRate}% - If inverted, would be ${(100 - p.winRate).toFixed(1)}%`);
  });
  console.log();
}

// Final summary
console.log('='.repeat(80));
console.log('  FINAL SUMMARY');
console.log('='.repeat(80));
console.log();
console.log(`Total Session PnL: ${totalPnL}`);
console.log(`Total Patterns: ${patterns.length}`);
console.log(`Profitable Patterns: ${profitable.length}`);
console.log(`Unprofitable Patterns: ${unprofitable.length}`);
console.log();

const bestPattern = sortedByPnL[0];
const worstPattern = sortedByPnL[sortedByPnL.length - 1];
console.log(`Best Pattern: ${bestPattern.pattern} (+${bestPattern.pnl})`);
console.log(`Worst Pattern: ${worstPattern.pattern} (${worstPattern.pnl})`);
console.log();

if (totalPnL < 0) {
  const biggestLosers = sortedByPnL.filter(p => p.pnl < 0).slice(-3);
  const lossFromTop3 = biggestLosers.reduce((sum, p) => sum + p.pnl, 0);
  console.log(`Top 3 losing patterns account for ${lossFromTop3} of ${totalPnL} total loss (${(lossFromTop3/totalPnL*100).toFixed(0)}%)`);
  console.log('Recommendation: Focus on fixing these patterns first:');
  biggestLosers.reverse().forEach((p, i) => {
    console.log(`  ${i+1}. ${p.pattern}: ${p.pnl}`);
  });
}
