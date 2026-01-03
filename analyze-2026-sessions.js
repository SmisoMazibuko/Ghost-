const fs = require('fs');
const path = require('path');

const sessionsDir = 'C:/Users/Okhantu/Desktop/The other income/ghost-evaluator/data/sessions';

// Get all 2026 session files
const allFiles = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
const session2026Files = allFiles.filter(f => f.includes('2026-01'));

console.log('='.repeat(80));
console.log('COMPREHENSIVE 2026 SESSION ANALYSIS');
console.log('Generated:', new Date().toISOString());
console.log('='.repeat(80));
console.log('\nSessions Found:', session2026Files.length);
console.log(session2026Files.map(f => '  - ' + f).join('\n'));

// Load all sessions
const sessions = session2026Files.map(f => {
  const data = JSON.parse(fs.readFileSync(path.join(sessionsDir, f)));
  return { file: f, ...data };
});

// ============================================================================
// PART 1: AGGREGATE STATISTICS
// ============================================================================
console.log('\n' + '='.repeat(80));
console.log('PART 1: AGGREGATE STATISTICS');
console.log('='.repeat(80));

let totalBlocks = 0;
let totalTrades = 0;
let totalPnl = 0;
let totalWins = 0;
let totalLosses = 0;

const patternStats = {};
const sessionSummaries = [];

sessions.forEach(session => {
  totalBlocks += session.blocks.length;
  totalTrades += session.trades.length;
  totalPnl += session.pnlTotal;

  const wins = session.trades.filter(t => t.isWin).length;
  const losses = session.trades.length - wins;
  totalWins += wins;
  totalLosses += losses;

  // Pattern breakdown
  session.trades.forEach(t => {
    if (!patternStats[t.pattern]) {
      patternStats[t.pattern] = { count: 0, pnl: 0, wins: 0, losses: 0, trades: [] };
    }
    patternStats[t.pattern].count++;
    patternStats[t.pattern].pnl += t.pnl;
    if (t.isWin) patternStats[t.pattern].wins++;
    else patternStats[t.pattern].losses++;
    patternStats[t.pattern].trades.push({ ...t, session: session.file });
  });

  sessionSummaries.push({
    file: session.file,
    blocks: session.blocks.length,
    trades: session.trades.length,
    pnl: session.pnlTotal,
    wins,
    losses,
    winRate: ((wins / session.trades.length) * 100).toFixed(1)
  });
});

console.log('\nAggregate Stats:');
console.log('  Total Sessions:', sessions.length);
console.log('  Total Blocks:', totalBlocks);
console.log('  Total Trades:', totalTrades);
console.log('  Total PnL:', (totalPnl >= 0 ? '+' : '') + totalPnl.toFixed(0));
console.log('  Total Wins:', totalWins, '(' + ((totalWins / totalTrades) * 100).toFixed(1) + '%)');
console.log('  Total Losses:', totalLosses, '(' + ((totalLosses / totalTrades) * 100).toFixed(1) + '%)');
console.log('  Avg PnL per Session:', (totalPnl / sessions.length).toFixed(0));
console.log('  Avg PnL per Trade:', (totalPnl / totalTrades).toFixed(1));

console.log('\nSession Breakdown:');
console.log('-'.repeat(95));
console.log('Session'.padEnd(45) + 'Blocks'.padStart(7) + 'Trades'.padStart(8) + 'PnL'.padStart(10) + 'W/L'.padStart(10) + 'WR%'.padStart(8));
console.log('-'.repeat(95));
sessionSummaries.forEach(s => {
  const pnlStr = (s.pnl >= 0 ? '+' : '') + s.pnl.toFixed(0);
  console.log(
    s.file.padEnd(45) +
    String(s.blocks).padStart(7) +
    String(s.trades).padStart(8) +
    pnlStr.padStart(10) +
    (s.wins + '/' + s.losses).padStart(10) +
    (s.winRate + '%').padStart(8)
  );
});
console.log('-'.repeat(95));

// ============================================================================
// PART 2: PATTERN PERFORMANCE
// ============================================================================
console.log('\n' + '='.repeat(80));
console.log('PART 2: PATTERN PERFORMANCE');
console.log('='.repeat(80));

const sortedPatterns = Object.entries(patternStats).sort((a, b) => b[1].pnl - a[1].pnl);

console.log('\nPattern Performance (sorted by PnL):');
console.log('-'.repeat(80));
console.log('Pattern'.padEnd(12) + 'Trades'.padStart(8) + 'Wins'.padStart(7) + 'Losses'.padStart(8) + 'WR%'.padStart(8) + 'PnL'.padStart(10) + 'Avg/Trade'.padStart(12));
console.log('-'.repeat(80));

sortedPatterns.forEach(([pattern, stats]) => {
  const wr = ((stats.wins / stats.count) * 100).toFixed(1);
  const avg = (stats.pnl / stats.count).toFixed(1);
  const pnlStr = (stats.pnl >= 0 ? '+' : '') + stats.pnl.toFixed(0);
  console.log(
    pattern.padEnd(12) +
    String(stats.count).padStart(8) +
    String(stats.wins).padStart(7) +
    String(stats.losses).padStart(8) +
    (wr + '%').padStart(8) +
    pnlStr.padStart(10) +
    avg.padStart(12)
  );
});
console.log('-'.repeat(80));

// Winners and Losers
const winners = sortedPatterns.filter(([_, s]) => s.pnl > 0);
const losers = sortedPatterns.filter(([_, s]) => s.pnl < 0);

console.log('\nProfitable Patterns:', winners.map(([p, s]) => p + ' (+' + s.pnl.toFixed(0) + ')').join(', ') || 'None');
console.log('Losing Patterns:', losers.map(([p, s]) => p + ' (' + s.pnl.toFixed(0) + ')').join(', ') || 'None');

// ============================================================================
// PART 3: SAMEDIR DEEP ANALYSIS
// ============================================================================
console.log('\n' + '='.repeat(80));
console.log('PART 3: SAMEDIR DEEP ANALYSIS');
console.log('='.repeat(80));

const sdStats = patternStats.SameDir || { count: 0, pnl: 0, wins: 0, losses: 0, trades: [] };

console.log('\nSameDir Summary:');
console.log('  Total Trades:', sdStats.count);
console.log('  Total PnL:', (sdStats.pnl >= 0 ? '+' : '') + sdStats.pnl.toFixed(0));
console.log('  Wins:', sdStats.wins, '(' + ((sdStats.wins / sdStats.count) * 100).toFixed(1) + '%)');
console.log('  Losses:', sdStats.losses);
console.log('  Avg/Trade:', (sdStats.pnl / sdStats.count).toFixed(1));

// SameDir per session
console.log('\nSameDir Per Session:');
console.log('-'.repeat(70));

sessions.forEach(session => {
  const sdTrades = session.trades.filter(t => t.pattern === 'SameDir');
  if (sdTrades.length === 0) {
    console.log(session.file.substring(0, 40) + ': No SameDir trades');
    return;
  }

  const sdWins = sdTrades.filter(t => t.isWin).length;
  const sdPnl = sdTrades.reduce((sum, t) => sum + t.pnl, 0);
  const sdWr = ((sdWins / sdTrades.length) * 100).toFixed(1);

  // Analyze consecutive losses
  let maxConsecLosses = 0;
  let currentConsecLosses = 0;
  sdTrades.forEach(t => {
    if (!t.isWin) {
      currentConsecLosses++;
      maxConsecLosses = Math.max(maxConsecLosses, currentConsecLosses);
    } else {
      currentConsecLosses = 0;
    }
  });

  const pnlStr = (sdPnl >= 0 ? '+' : '') + sdPnl.toFixed(0);
  console.log(
    session.file.substring(8, 35).padEnd(30) +
    'Trades:' + String(sdTrades.length).padStart(3) +
    ' WR:' + sdWr.padStart(5) + '%' +
    ' PnL:' + pnlStr.padStart(7) +
    ' MaxConsecL:' + String(maxConsecLosses).padStart(2)
  );
});

// Cascade Analysis
console.log('\nSameDir Cascade Analysis (consecutive losses):');
let cascades = { 1: 0, 2: 0, 3: 0, 4: 0, '5+': 0 };
let currentCascade = 0;
let cascadeDetails = [];

if (sdStats.trades.length > 0) {
  sdStats.trades.forEach((t, i) => {
    if (!t.isWin) {
      currentCascade++;
    } else {
      if (currentCascade > 0) {
        if (currentCascade >= 5) cascades['5+']++;
        else cascades[currentCascade]++;
        if (currentCascade >= 3) {
          cascadeDetails.push({ length: currentCascade, session: t.session, tradeIndex: i });
        }
      }
      currentCascade = 0;
    }
  });
  if (currentCascade > 0) {
    if (currentCascade >= 5) cascades['5+']++;
    else cascades[currentCascade]++;
  }
}

console.log('  1 loss:', cascades[1]);
console.log('  2 losses:', cascades[2]);
console.log('  3 losses:', cascades[3]);
console.log('  4 losses:', cascades[4]);
console.log('  5+ losses:', cascades['5+']);

if (cascadeDetails.length > 0) {
  console.log('\nDangerous Cascades (3+ consecutive SameDir losses):');
  cascadeDetails.forEach(c => {
    console.log('  ' + c.session.substring(8, 30) + ': ' + c.length + ' consecutive losses');
  });
}

// ============================================================================
// PART 4: HOSTILE MARKET DETECTION
// ============================================================================
console.log('\n' + '='.repeat(80));
console.log('PART 4: HOSTILE MARKET DETECTION');
console.log('='.repeat(80));

// Check for hostile signatures
const hostileIndicators = [];

sessions.forEach(session => {
  const indicators = [];

  // 1. Check overall win rate < 45%
  const wins = session.trades.filter(t => t.isWin).length;
  const wr = (wins / session.trades.length) * 100;
  if (wr < 45) {
    indicators.push('Low WR (' + wr.toFixed(1) + '%)');
  }

  // 2. Check for 70%+ loss frequency
  const highPctLosses = session.trades.filter(t => !t.isWin && t.pct >= 70);
  const highPctRatio = (highPctLosses.length / session.trades.filter(t => !t.isWin).length) * 100;
  if (highPctRatio > 60) {
    indicators.push('High 70%+ losses (' + highPctRatio.toFixed(0) + '%)');
  }

  // 3. Check SameDir cascade (3+ consecutive)
  const sdTrades = session.trades.filter(t => t.pattern === 'SameDir');
  let maxSdCascade = 0;
  let currentCascade = 0;
  sdTrades.forEach(t => {
    if (!t.isWin) {
      currentCascade++;
      maxSdCascade = Math.max(maxSdCascade, currentCascade);
    } else {
      currentCascade = 0;
    }
  });
  if (maxSdCascade >= 3) {
    indicators.push('SD Cascade (' + maxSdCascade + ')');
  }

  // 4. Check for opposite pattern sync failures
  const zzTrades = session.trades.filter(t => t.pattern === 'ZZ');
  const antiZzTrades = session.trades.filter(t => t.pattern === 'AntiZZ');
  const zzWr = zzTrades.length > 0 ? (zzTrades.filter(t => t.isWin).length / zzTrades.length) * 100 : 100;
  const antiZzWr = antiZzTrades.length > 0 ? (antiZzTrades.filter(t => t.isWin).length / antiZzTrades.length) * 100 : 100;
  if (zzWr < 50 && antiZzWr < 50) {
    indicators.push('ZZ+AntiZZ both failing');
  }

  // 5. Q4 Collapse
  if (session.trades.length >= 20) {
    const q4Start = Math.floor(session.trades.length * 0.75);
    const q4Trades = session.trades.slice(q4Start);
    const q4Wins = q4Trades.filter(t => t.isWin).length;
    const q4Wr = (q4Wins / q4Trades.length) * 100;
    if (q4Wr < 30) {
      indicators.push('Q4 Collapse (' + q4Wr.toFixed(0) + '% WR)');
    }
  }

  if (indicators.length > 0) {
    hostileIndicators.push({
      session: session.file,
      pnl: session.pnlTotal,
      indicators
    });
  }
});

if (hostileIndicators.length === 0) {
  console.log('\nNo hostile market signatures detected in 2026 sessions.');
} else {
  console.log('\nHostile Sessions Detected:', hostileIndicators.length);
  console.log('-'.repeat(80));
  hostileIndicators.forEach(h => {
    const pnlStr = (h.pnl >= 0 ? '+' : '') + h.pnl.toFixed(0);
    console.log(h.session.substring(8, 35).padEnd(30) + 'PnL:' + pnlStr.padStart(7) + '  ' + h.indicators.join(', '));
  });
}

// ============================================================================
// PART 5: WORST TRADES ANALYSIS
// ============================================================================
console.log('\n' + '='.repeat(80));
console.log('PART 5: WORST TRADES ANALYSIS');
console.log('='.repeat(80));

const allTrades = [];
sessions.forEach(session => {
  session.trades.forEach(t => {
    allTrades.push({ ...t, session: session.file });
  });
});

const worstTrades = [...allTrades].sort((a, b) => a.pnl - b.pnl).slice(0, 10);

console.log('\nTop 10 Worst Trades:');
console.log('-'.repeat(90));
console.log('#'.padStart(3) + 'Pattern'.padStart(10) + 'PnL'.padStart(8) + 'PCT'.padStart(6) + 'Conf'.padStart(6) + '  Session'.padEnd(30) + 'Reason');
console.log('-'.repeat(90));

worstTrades.forEach((t, i) => {
  const reasonShort = t.reason ? t.reason.substring(0, 35) : '';
  console.log(
    String(i + 1).padStart(3) +
    t.pattern.padStart(10) +
    t.pnl.toFixed(0).padStart(8) +
    String(t.pct).padStart(6) +
    String(t.confidence).padStart(6) +
    '  ' + t.session.substring(8, 35).padEnd(30) +
    reasonShort
  );
});

// High-PCT Losses (70%+)
const highPctLosses = allTrades.filter(t => !t.isWin && t.pct >= 70);
console.log('\nHigh-PCT Losses (>=70%):', highPctLosses.length, 'trades');
console.log('By Pattern:');
const hplByPattern = {};
highPctLosses.forEach(t => {
  if (!hplByPattern[t.pattern]) hplByPattern[t.pattern] = { count: 0, totalPnl: 0 };
  hplByPattern[t.pattern].count++;
  hplByPattern[t.pattern].totalPnl += t.pnl;
});
Object.entries(hplByPattern)
  .sort((a, b) => a[1].totalPnl - b[1].totalPnl)
  .forEach(([p, s]) => {
    console.log('  ' + p.padEnd(12) + String(s.count).padStart(3) + ' trades, PnL: ' + s.totalPnl.toFixed(0));
  });

// ============================================================================
// PART 6: PATTERN RESUME ANALYSIS (for SameDir)
// ============================================================================
console.log('\n' + '='.repeat(80));
console.log('PART 6: RESUME PATTERN ANALYSIS');
console.log('='.repeat(80));

// Analyze what patterns break before SameDir resumes/activates
console.log('\nAnalyzing pattern breaks before SameDir trades...');

sessions.forEach(session => {
  const trades = session.trades;
  let lastNonSdPattern = null;
  let lastNonSdWin = null;

  for (let i = 0; i < trades.length; i++) {
    const t = trades[i];
    if (t.pattern === 'SameDir') {
      // Check what pattern came before
      if (lastNonSdPattern) {
        // This is a potential resume trigger
      }
    } else {
      lastNonSdPattern = t.pattern;
      lastNonSdWin = t.isWin;
    }
  }
});

// Show pattern before SameDir sequences
console.log('\nPatterns that broke before SameDir sequences:');
const patternBeforeSd = {};
sessions.forEach(session => {
  const trades = session.trades;
  let inSdSequence = false;

  for (let i = 0; i < trades.length; i++) {
    const t = trades[i];
    if (t.pattern === 'SameDir') {
      if (!inSdSequence && i > 0) {
        // Just started SD sequence, check what was before
        const prev = trades[i - 1];
        if (!patternBeforeSd[prev.pattern]) {
          patternBeforeSd[prev.pattern] = { count: 0, wins: 0, losses: 0 };
        }
        patternBeforeSd[prev.pattern].count++;
        if (prev.isWin) patternBeforeSd[prev.pattern].wins++;
        else patternBeforeSd[prev.pattern].losses++;
      }
      inSdSequence = true;
    } else {
      inSdSequence = false;
    }
  }
});

Object.entries(patternBeforeSd)
  .sort((a, b) => b[1].count - a[1].count)
  .forEach(([p, s]) => {
    console.log('  ' + p.padEnd(12) + String(s.count).padStart(3) + ' times (W:' + s.wins + ' L:' + s.losses + ')');
  });

// ============================================================================
// PART 7: DRAWDOWN AND RECOVERY ANALYSIS
// ============================================================================
console.log('\n' + '='.repeat(80));
console.log('PART 7: DRAWDOWN AND RECOVERY ANALYSIS');
console.log('='.repeat(80));

sessions.forEach(session => {
  let runningPnl = 0;
  let peak = 0;
  let maxDrawdown = 0;
  let peakTrade = 0;
  let valleyTrade = 0;

  session.trades.forEach((t, i) => {
    runningPnl += t.pnl;
    if (runningPnl > peak) {
      peak = runningPnl;
      peakTrade = i + 1;
    }
    const drawdown = peak - runningPnl;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
      valleyTrade = i + 1;
    }
  });

  const recovered = session.pnlTotal > 0;
  const recoveryStr = recovered ? 'RECOVERED' : 'NOT RECOVERED';

  console.log(
    session.file.substring(8, 35).padEnd(30) +
    'Peak: +' + peak.toFixed(0).padStart(5) +
    ' MaxDD: -' + maxDrawdown.toFixed(0).padStart(5) +
    ' Final: ' + (session.pnlTotal >= 0 ? '+' : '') + session.pnlTotal.toFixed(0).padStart(6) +
    '  ' + recoveryStr
  );
});

// ============================================================================
// PART 8: RECOMMENDATIONS
// ============================================================================
console.log('\n' + '='.repeat(80));
console.log('PART 8: RECOMMENDATIONS BASED ON 2026 DATA');
console.log('='.repeat(80));

// Calculate recommendations based on data
const profitableSessions = sessionSummaries.filter(s => s.pnl > 0).length;
const losingSessions = sessionSummaries.filter(s => s.pnl < 0).length;
const profitableRatio = (profitableSessions / sessions.length) * 100;

console.log('\nSession Win Rate:', profitableRatio.toFixed(1) + '% (' + profitableSessions + '/' + sessions.length + ')');

console.log('\nPattern Recommendations:');
sortedPatterns.forEach(([pattern, stats]) => {
  const wr = (stats.wins / stats.count) * 100;
  const avgPnl = stats.pnl / stats.count;

  let recommendation = '';
  if (wr >= 55 && stats.pnl > 0) {
    recommendation = 'KEEP (strong)';
  } else if (wr >= 50 && stats.pnl > 0) {
    recommendation = 'KEEP (moderate)';
  } else if (wr < 45 || stats.pnl < -200) {
    recommendation = 'REVIEW (underperforming)';
  } else {
    recommendation = 'MONITOR';
  }

  console.log('  ' + pattern.padEnd(12) + recommendation);
});

// SameDir specific recommendations
if (sdStats.count > 0) {
  const sdWr = (sdStats.wins / sdStats.count) * 100;
  console.log('\nSameDir Specific:');
  if (sdWr < 50) {
    console.log('  - SD Win Rate below 50%, consider tightening pause triggers');
  }
  if (cascades['5+'] > 0 || cascades[4] > 1) {
    console.log('  - Multiple large cascades detected, review resume logic');
  }
  console.log('  - Current SD PnL:', (sdStats.pnl >= 0 ? '+' : '') + sdStats.pnl.toFixed(0));
}

console.log('\n' + '='.repeat(80));
console.log('END OF ANALYSIS');
console.log('='.repeat(80));
