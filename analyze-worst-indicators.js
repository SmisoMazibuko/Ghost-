const fs = require('fs');
const path = require('path');

const sessionsDir = 'C:/Users/Okhantu/Desktop/The other income/ghost-evaluator/data/sessions';

// All sessions Dec 29-31
const allSessions = [
  { file: 'session_2025-12-29T12-07-26-252Z.json', utc: '12:07', day: 29, period: 'afternoon' },
  { file: 'session_2025-12-29T14-02-26-770Z.json', utc: '14:02', day: 29, period: 'afternoon' },
  { file: 'session_2025-12-29T15-23-22-333Z.json', utc: '15:23', day: 29, period: 'afternoon' },
  { file: 'session_2025-12-29T19-37-41-544Z.json', utc: '19:37', day: 29, period: 'evening' },
  { file: 'session_2025-12-29T20-11-11-250Z.json', utc: '20:11', day: 29, period: 'evening' },
  { file: 'session_2025-12-29T20-18-44-249Z.json', utc: '20:18', day: 29, period: 'evening' },
  { file: 'session_2025-12-30T06-49-58-137Z.json', utc: '06:49', day: 30, period: 'morning' },
  { file: 'session_2025-12-30T06-53-52-022Z.json', utc: '06:53', day: 30, period: 'morning' },
  { file: 'session_2025-12-30T09-02-55-295Z.json', utc: '09:02', day: 30, period: 'morning' },
  { file: 'session_2025-12-30T16-49-37-401Z.json', utc: '16:49', day: 30, period: 'afternoon' },
  { file: 'session_2025-12-30T19-33-05-629Z.json', utc: '19:33', day: 30, period: 'evening' },
  { file: 'session_2025-12-30T22-35-58-183Z.json', utc: '22:35', day: 30, period: 'night' },
  { file: 'session_2025-12-31T06-59-38-855Z.json', utc: '06:59', day: 31, period: 'morning' },
  { file: 'session_2025-12-31T07-12-15-602Z.json', utc: '07:12', day: 31, period: 'morning' },
  { file: 'session_2025-12-31T09-57-56-256Z.json', utc: '09:57', day: 31, period: 'morning' },
];

function analyzeSessionIndicators(sessionInfo) {
  const data = JSON.parse(fs.readFileSync(path.join(sessionsDir, sessionInfo.file)));

  const result = {
    ...sessionInfo,
    pnl: data.pnlTotal,
    trades: data.trades.length,
    blocks: data.blocks.length,
    indicators: {}
  };

  // 1. High-PCT Losses (>=70%)
  const highPctLosses = data.trades.filter(t => !t.isWin && t.pct >= 70);
  result.indicators.highPctLossCount = highPctLosses.length;
  result.indicators.highPctLossPnl = highPctLosses.reduce((sum, t) => sum + t.pnl, 0);

  // 2. Consecutive Loss Streaks
  let maxLossStreak = 0;
  let currentStreak = 0;
  let lossStreaks3Plus = 0;

  data.trades.forEach(t => {
    if (!t.isWin) {
      currentStreak++;
      maxLossStreak = Math.max(maxLossStreak, currentStreak);
    } else {
      if (currentStreak >= 3) lossStreaks3Plus++;
      currentStreak = 0;
    }
  });
  if (currentStreak >= 3) lossStreaks3Plus++;

  result.indicators.maxLossStreak = maxLossStreak;
  result.indicators.lossStreaks3Plus = lossStreaks3Plus;

  // 3. Bait & Switch Detection
  let baitSwitchCount = 0;
  for (let i = 1; i < data.trades.length; i++) {
    const t = data.trades[i];
    const prev = data.trades[i-1];
    if (!t.isWin && t.confidence >= 70 && prev.isWin && prev.predictedDirection !== t.predictedDirection) {
      baitSwitchCount++;
    }
  }
  result.indicators.baitSwitchCount = baitSwitchCount;

  // 4. Win Rate
  const wins = data.trades.filter(t => t.isWin).length;
  result.indicators.winRate = data.trades.length > 0 ? (wins / data.trades.length * 100) : 0;

  // 5. Run Data Analysis
  if (data.runData && data.runData.lengths && data.runData.lengths.length > 0) {
    result.indicators.maxRun = Math.max(...data.runData.lengths);
    result.indicators.avgRun = data.runData.lengths.reduce((a,b) => a+b, 0) / data.runData.lengths.length;
  } else {
    result.indicators.maxRun = 0;
    result.indicators.avgRun = 0;
  }

  // 6. First 30 Trades Performance
  const first30 = data.trades.slice(0, 30);
  const first30Wins = first30.filter(t => t.isWin).length;
  const first30Pnl = first30.reduce((sum, t) => sum + t.pnl, 0);
  result.indicators.first30WinRate = first30.length > 0 ? (first30Wins / first30.length * 100) : 0;
  result.indicators.first30Pnl = first30Pnl;

  // 7. SameDir Specific
  const sdTrades = data.trades.filter(t => t.pattern === 'SameDir');
  const sdWins = sdTrades.filter(t => t.isWin).length;
  const sdPnl = sdTrades.reduce((sum, t) => sum + t.pnl, 0);
  result.indicators.sdCount = sdTrades.length;
  result.indicators.sdPnl = sdPnl;
  result.indicators.sdWinRate = sdTrades.length > 0 ? (sdWins / sdTrades.length * 100) : 0;

  // 8. High-PCT SameDir Losses
  const sdHighPctLosses = sdTrades.filter(t => !t.isWin && t.pct >= 70);
  result.indicators.sdHighPctLosses = sdHighPctLosses.length;

  return result;
}

// Analyze all sessions
const results = allSessions.map(s => {
  try {
    return analyzeSessionIndicators(s);
  } catch(e) {
    return { ...s, error: e.message };
  }
}).filter(r => !r.error);

// Sort by PnL (worst to best)
results.sort((a, b) => a.pnl - b.pnl);

console.log('='.repeat(90));
console.log('WORST SESSION INDICATORS ANALYSIS');
console.log('='.repeat(90));

console.log('\nSESSIONS RANKED BY PNL (Worst to Best):');
console.log('-'.repeat(90));
console.log('Rank | Session          | PnL    | Trades | WR%  | HiPCT | MaxStrk | B&S | SD PnL | SD HiPCT');
console.log('-'.repeat(90));

results.forEach((r, i) => {
  const rank = String(i + 1).padStart(2);
  const session = `Dec ${r.day} ${r.utc}`.padEnd(14);
  const pnl = (r.pnl >= 0 ? '+' : '') + r.pnl.toFixed(0).padStart(5);
  const trades = String(r.trades).padStart(3);
  const wr = r.indicators.winRate.toFixed(0).padStart(4);
  const hiPct = String(r.indicators.highPctLossCount).padStart(5);
  const maxStrk = String(r.indicators.maxLossStreak).padStart(5);
  const bs = String(r.indicators.baitSwitchCount).padStart(3);
  const sdPnl = (r.indicators.sdPnl >= 0 ? '+' : '') + r.indicators.sdPnl.toFixed(0).padStart(5);
  const sdHi = String(r.indicators.sdHighPctLosses).padStart(6);

  console.log(`  ${rank} | ${session} | ${pnl} | ${trades}    | ${wr} | ${hiPct} | ${maxStrk}   | ${bs} | ${sdPnl} | ${sdHi}`);
});

// Categorize sessions
const badSessions = results.filter(r => r.pnl < 0);
const goodSessions = results.filter(r => r.pnl >= 500);
const mediumSessions = results.filter(r => r.pnl >= 0 && r.pnl < 500);

console.log('\n' + '='.repeat(90));
console.log('INDICATOR COMPARISON: BAD vs GOOD SESSIONS');
console.log('='.repeat(90));

function avgIndicator(sessions, key) {
  if (sessions.length === 0) return 0;
  return sessions.reduce((sum, s) => sum + s.indicators[key], 0) / sessions.length;
}

const indicators = [
  { key: 'highPctLossCount', name: 'High-PCT Losses (>=70%)' },
  { key: 'maxLossStreak', name: 'Max Loss Streak' },
  { key: 'lossStreaks3Plus', name: 'Loss Streaks >=3' },
  { key: 'baitSwitchCount', name: 'Bait & Switch Count' },
  { key: 'winRate', name: 'Win Rate %' },
  { key: 'first30WinRate', name: 'First 30 Trades WR%' },
  { key: 'first30Pnl', name: 'First 30 Trades PnL' },
  { key: 'avgRun', name: 'Average Run Length' },
  { key: 'maxRun', name: 'Max Run Length' },
  { key: 'sdPnl', name: 'SameDir PnL' },
  { key: 'sdWinRate', name: 'SameDir Win Rate %' },
  { key: 'sdHighPctLosses', name: 'SameDir High-PCT Losses' },
];

console.log('\n' + 'Indicator'.padEnd(28) + '| Bad Sessions   | Good Sessions  | Difference');
console.log('-'.repeat(28) + '+' + '-'.repeat(16) + '+' + '-'.repeat(16) + '+' + '-'.repeat(15));

indicators.forEach(ind => {
  const badAvg = avgIndicator(badSessions, ind.key);
  const goodAvg = avgIndicator(goodSessions, ind.key);
  const diff = goodAvg - badAvg;
  const diffSign = diff >= 0 ? '+' : '';

  console.log(
    ind.name.padEnd(28) + '| ' +
    badAvg.toFixed(1).padStart(13) + ' | ' +
    goodAvg.toFixed(1).padStart(13) + ' | ' +
    diffSign + diff.toFixed(1).padStart(12)
  );
});

console.log('\n' + '='.repeat(90));
console.log('KEY FINDINGS: WHAT PREDICTS A BAD SESSION?');
console.log('='.repeat(90));

// Calculate threshold values
console.log('\nTHRESHOLD ANALYSIS:');
console.log('-'.repeat(60));

// High-PCT Losses threshold
const badHiPctAvg = avgIndicator(badSessions, 'highPctLossCount');
const goodHiPctAvg = avgIndicator(goodSessions, 'highPctLossCount');
console.log(`\n1. HIGH-PCT LOSSES (>=70%):`);
console.log(`   Bad sessions avg: ${badHiPctAvg.toFixed(1)}`);
console.log(`   Good sessions avg: ${goodHiPctAvg.toFixed(1)}`);
console.log(`   THRESHOLD: If high-PCT losses >= ${Math.ceil((badHiPctAvg + goodHiPctAvg) / 2)}, likely bad session`);

// Max Loss Streak threshold
const badStreakAvg = avgIndicator(badSessions, 'maxLossStreak');
const goodStreakAvg = avgIndicator(goodSessions, 'maxLossStreak');
console.log(`\n2. MAX LOSS STREAK:`);
console.log(`   Bad sessions avg: ${badStreakAvg.toFixed(1)}`);
console.log(`   Good sessions avg: ${goodStreakAvg.toFixed(1)}`);
console.log(`   THRESHOLD: If max streak >= ${Math.ceil((badStreakAvg + goodStreakAvg) / 2)}, consider pausing`);

// First 30 trades
const badFirst30 = avgIndicator(badSessions, 'first30Pnl');
const goodFirst30 = avgIndicator(goodSessions, 'first30Pnl');
console.log(`\n3. FIRST 30 TRADES PNL:`);
console.log(`   Bad sessions avg: ${badFirst30.toFixed(0)}`);
console.log(`   Good sessions avg: ${goodFirst30.toFixed(0)}`);
console.log(`   THRESHOLD: If first 30 PnL < ${Math.floor((badFirst30 + goodFirst30) / 2)}, consider pausing`);

// SameDir specific
const badSdPnl = avgIndicator(badSessions, 'sdPnl');
const goodSdPnl = avgIndicator(goodSessions, 'sdPnl');
console.log(`\n4. SAMEDIR PNL:`);
console.log(`   Bad sessions avg: ${badSdPnl.toFixed(0)}`);
console.log(`   Good sessions avg: ${goodSdPnl.toFixed(0)}`);
console.log(`   THRESHOLD: If SD PnL < ${Math.floor((badSdPnl + goodSdPnl) / 2)} early, consider SD pause`);

// Bait & Switch
const badBS = avgIndicator(badSessions, 'baitSwitchCount');
const goodBS = avgIndicator(goodSessions, 'baitSwitchCount');
console.log(`\n5. BAIT & SWITCH:`);
console.log(`   Bad sessions avg: ${badBS.toFixed(1)}`);
console.log(`   Good sessions avg: ${goodBS.toFixed(1)}`);
if (badBS > goodBS) {
  console.log(`   FINDING: Bad sessions have MORE B&S - this IS an indicator`);
} else {
  console.log(`   FINDING: B&S count NOT a strong indicator of bad sessions`);
}

console.log('\n' + '='.repeat(90));
console.log('EARLY WARNING SYSTEM RULES');
console.log('='.repeat(90));

console.log(`
Based on analysis of ${badSessions.length} bad sessions vs ${goodSessions.length} good sessions:

RULE 1: HIGH-PCT REVERSAL PAUSE
  - Trigger: 3+ high-PCT (>=70%) losses in first 30 trades
  - Action: Pause SameDir for 10 blocks
  - Rationale: Bad sessions average ${badHiPctAvg.toFixed(1)} vs ${goodHiPctAvg.toFixed(1)} for good

RULE 2: CONSECUTIVE LOSS PAUSE
  - Trigger: 4+ consecutive losses on any pattern
  - Action: Pause that pattern for 5 blocks
  - Rationale: Bad sessions max streak ${badStreakAvg.toFixed(1)} vs ${goodStreakAvg.toFixed(1)} for good

RULE 3: EARLY SESSION CHECK
  - Check: First 30 trades PnL
  - If negative + high-PCT losses >= 2: Reduce position sizes 50%
  - Rationale: First 30 PnL predicts session outcome

RULE 4: TIME-OF-DAY ADJUSTMENT
  - Morning (06-12 UTC): Full position sizes
  - Afternoon (12-17 UTC): 50% position sizes for SameDir
  - Evening (17-22 UTC): Monitor closely
  - Night (22+ UTC): Full position sizes

RULE 5: SAMEDIR EMERGENCY STOP
  - If SD loses 3 consecutive trades with PCT >= 60%
  - Stop SD for remainder of session
  - Switch to ZZ-only mode
`);

// Individual worst session deep dive
console.log('\n' + '='.repeat(90));
console.log('WORST SESSIONS DEEP DIVE');
console.log('='.repeat(90));

badSessions.forEach(r => {
  console.log(`\n--- Dec ${r.day} ${r.utc} UTC (${r.period}) | PnL: ${r.pnl} ---`);
  console.log(`  Trades: ${r.trades} | Win Rate: ${r.indicators.winRate.toFixed(0)}%`);
  console.log(`  High-PCT Losses: ${r.indicators.highPctLossCount} (${r.indicators.highPctLossPnl.toFixed(0)} PnL impact)`);
  console.log(`  Max Loss Streak: ${r.indicators.maxLossStreak}`);
  console.log(`  Bait & Switch: ${r.indicators.baitSwitchCount}`);
  console.log(`  First 30 Trades: WR ${r.indicators.first30WinRate.toFixed(0)}%, PnL ${r.indicators.first30Pnl.toFixed(0)}`);
  console.log(`  SameDir: ${r.indicators.sdCount} trades, PnL ${r.indicators.sdPnl.toFixed(0)}, WR ${r.indicators.sdWinRate.toFixed(0)}%`);
  console.log(`  SameDir High-PCT Losses: ${r.indicators.sdHighPctLosses}`);

  // Identify primary cause
  const causes = [];
  if (r.indicators.highPctLossCount >= 3) causes.push('HIGH_PCT_REVERSALS');
  if (r.indicators.maxLossStreak >= 4) causes.push('LOSS_STREAK');
  if (r.indicators.sdPnl < -200) causes.push('SAMEDIR_FAILURE');
  if (r.indicators.baitSwitchCount >= 2) causes.push('BAIT_SWITCH');
  if (r.indicators.first30Pnl < -100) causes.push('BAD_START');

  console.log(`  PRIMARY CAUSES: ${causes.length > 0 ? causes.join(', ') : 'Multiple small losses'}`);
});
