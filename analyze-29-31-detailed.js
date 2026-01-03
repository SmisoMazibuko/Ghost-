const fs = require('fs');
const path = require('path');

const sessionsDir = 'C:/Users/Okhantu/Desktop/The other income/ghost-evaluator/data/sessions';

// All sessions Dec 29-31 with local times (UTC+2 assumption based on file timestamps)
const allSessions = [
  // Dec 29
  { file: 'session_2025-12-29T12-07-26-252Z.json', utc: '12:07', local: '~14:07', period: 'afternoon', day: 29 },
  { file: 'session_2025-12-29T14-02-26-770Z.json', utc: '14:02', local: '~16:02', period: 'afternoon', day: 29 },
  { file: 'session_2025-12-29T15-23-22-333Z.json', utc: '15:23', local: '~17:23', period: 'afternoon', day: 29 },
  { file: 'session_2025-12-29T19-37-41-544Z.json', utc: '19:37', local: '~21:37', period: 'evening', day: 29 },
  { file: 'session_2025-12-29T20-11-11-250Z.json', utc: '20:11', local: '~22:11', period: 'evening', day: 29 },
  { file: 'session_2025-12-29T20-18-44-249Z.json', utc: '20:18', local: '~22:18', period: 'evening', day: 29 },
  { file: 'session_2025-12-29T20-18-46-614Z.json', utc: '20:18', local: '~22:18', period: 'evening', day: 29, note: 'duplicate?' },
  // Dec 30
  { file: 'session_2025-12-30T06-49-58-137Z.json', utc: '06:49', local: '~08:49', period: 'morning', day: 30 },
  { file: 'session_2025-12-30T06-53-52-022Z.json', utc: '06:53', local: '~08:53', period: 'morning', day: 30 },
  { file: 'session_2025-12-30T09-02-55-295Z.json', utc: '09:02', local: '~11:02', period: 'morning', day: 30 },
  { file: 'session_2025-12-30T16-49-37-401Z.json', utc: '16:49', local: '~18:49', period: 'afternoon', day: 30 },
  { file: 'session_2025-12-30T19-33-05-629Z.json', utc: '19:33', local: '~21:33', period: 'evening', day: 30 },
  { file: 'session_2025-12-30T22-35-58-183Z.json', utc: '22:35', local: '~00:35', period: 'night', day: 30 },
  // Dec 31
  { file: 'session_2025-12-31T06-59-38-855Z.json', utc: '06:59', local: '~08:59', period: 'morning', day: 31 },
  { file: 'session_2025-12-31T07-12-15-602Z.json', utc: '07:12', local: '~09:12', period: 'morning', day: 31 },
];

function analyzeSession(sessionInfo) {
  const data = JSON.parse(fs.readFileSync(path.join(sessionsDir, sessionInfo.file)));

  const result = {
    ...sessionInfo,
    blocks: data.blocks.length,
    totalTrades: data.trades.length,
    pnlTotal: data.pnlTotal,
    patterns: {}
  };

  // Group by pattern
  data.trades.forEach(t => {
    const pattern = t.pattern || 'unknown';
    if (!result.patterns[pattern]) {
      result.patterns[pattern] = { count: 0, pnl: 0, wins: 0, losses: 0, trades: [] };
    }
    result.patterns[pattern].count++;
    result.patterns[pattern].pnl += t.pnl;
    if (t.isWin) result.patterns[pattern].wins++;
    else result.patterns[pattern].losses++;
    result.patterns[pattern].trades.push(t);
  });

  return result;
}

// Analyze all sessions
const results = allSessions.map(s => {
  try {
    return analyzeSession(s);
  } catch(e) {
    return { ...s, error: e.message };
  }
});

// Print detailed session-by-session analysis
console.log('='.repeat(80));
console.log('DETAILED SESSION ANALYSIS: DEC 29-31, 2025');
console.log('='.repeat(80));

[29, 30, 31].forEach(day => {
  console.log(`\n${'#'.repeat(80)}`);
  console.log(`# DECEMBER ${day}, 2025`);
  console.log('#'.repeat(80));

  const daySessions = results.filter(r => r.day === day);
  let dayTotal = { trades: 0, pnl: 0, patterns: {} };

  daySessions.forEach(r => {
    if (r.error) {
      console.log(`\n[${r.utc} UTC] ERROR: ${r.error}`);
      return;
    }

    const note = r.note ? ` (${r.note})` : '';
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`SESSION: ${r.utc} UTC (${r.local} local) - ${r.period.toUpperCase()}${note}`);
    console.log(`─`.repeat(80));
    console.log(`Blocks: ${r.blocks} | Trades: ${r.totalTrades} | PnL: ${r.pnlTotal}`);

    dayTotal.trades += r.totalTrades;
    dayTotal.pnl += r.pnlTotal;

    // All patterns for this session
    console.log('\nPATTERN BREAKDOWN:');
    const sortedPatterns = Object.entries(r.patterns).sort((a, b) => b[1].pnl - a[1].pnl);

    sortedPatterns.forEach(([pattern, stats]) => {
      const wr = stats.count > 0 ? ((stats.wins / stats.count) * 100).toFixed(0) : 0;
      const avg = stats.count > 0 ? (stats.pnl / stats.count).toFixed(1) : 0;
      const bar = stats.pnl >= 0 ? '+' : '';
      console.log(`  ${pattern.padEnd(10)}: ${String(stats.count).padStart(3)} trades, PnL: ${bar}${stats.pnl.toFixed(0).padStart(6)}, WR: ${String(wr).padStart(3)}% (${stats.wins}W/${stats.losses}L), Avg: ${avg}`);

      // Aggregate for day
      if (!dayTotal.patterns[pattern]) {
        dayTotal.patterns[pattern] = { count: 0, pnl: 0, wins: 0, losses: 0 };
      }
      dayTotal.patterns[pattern].count += stats.count;
      dayTotal.patterns[pattern].pnl += stats.pnl;
      dayTotal.patterns[pattern].wins += stats.wins;
      dayTotal.patterns[pattern].losses += stats.losses;
    });

    // SameDir specific detail if present
    if (r.patterns.SameDir && r.patterns.SameDir.count > 0) {
      const sd = r.patterns.SameDir;
      console.log(`\n  SAMEDIR TRADES DETAIL:`);
      sd.trades.forEach((t, i) => {
        const result = t.isWin ? 'WIN ' : 'LOSS';
        const reasonShort = t.reason.substring(0, 55);
        console.log(`    [${String(i+1).padStart(2)}] ${result} pnl:${String(t.pnl.toFixed(0)).padStart(5)} pct:${String(t.pct).padStart(3)} | ${reasonShort}...`);
      });
    }
  });

  // Day summary
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`DAY ${day} SUMMARY: ${daySessions.length} sessions, ${dayTotal.trades} trades, PnL: ${dayTotal.pnl}`);
  console.log('═'.repeat(80));
  console.log('\nPATTERN TOTALS:');
  const sortedDayPatterns = Object.entries(dayTotal.patterns).sort((a, b) => b[1].pnl - a[1].pnl);
  sortedDayPatterns.forEach(([pattern, stats]) => {
    const wr = stats.count > 0 ? ((stats.wins / stats.count) * 100).toFixed(0) : 0;
    const avg = stats.count > 0 ? (stats.pnl / stats.count).toFixed(1) : 0;
    const bar = stats.pnl >= 0 ? '+' : '';
    console.log(`  ${pattern.padEnd(10)}: ${String(stats.count).padStart(3)} trades, PnL: ${bar}${stats.pnl.toFixed(0).padStart(6)}, WR: ${String(wr).padStart(3)}% (${stats.wins}W/${stats.losses}L), Avg: ${avg}`);
  });
});

// SameDir Morning vs Afternoon/Evening comparison
console.log('\n\n' + '='.repeat(80));
console.log('SAMEDIR: MORNING vs AFTERNOON/EVENING ANALYSIS');
console.log('='.repeat(80));

const sdByPeriod = { morning: { count: 0, pnl: 0, wins: 0, losses: 0 }, afternoon: { count: 0, pnl: 0, wins: 0, losses: 0 }, evening: { count: 0, pnl: 0, wins: 0, losses: 0 }, night: { count: 0, pnl: 0, wins: 0, losses: 0 } };
const sdByDay = { 29: { count: 0, pnl: 0, wins: 0, losses: 0 }, 30: { count: 0, pnl: 0, wins: 0, losses: 0 }, 31: { count: 0, pnl: 0, wins: 0, losses: 0 } };

results.forEach(r => {
  if (r.error || !r.patterns || !r.patterns.SameDir) return;
  const sd = r.patterns.SameDir;

  sdByPeriod[r.period].count += sd.count;
  sdByPeriod[r.period].pnl += sd.pnl;
  sdByPeriod[r.period].wins += sd.wins;
  sdByPeriod[r.period].losses += sd.losses;

  sdByDay[r.day].count += sd.count;
  sdByDay[r.day].pnl += sd.pnl;
  sdByDay[r.day].wins += sd.wins;
  sdByDay[r.day].losses += sd.losses;
});

console.log('\nSAMEDIR BY TIME PERIOD:');
Object.entries(sdByPeriod).forEach(([period, stats]) => {
  if (stats.count === 0) return;
  const wr = stats.count > 0 ? ((stats.wins / stats.count) * 100).toFixed(1) : 0;
  const avg = stats.count > 0 ? (stats.pnl / stats.count).toFixed(1) : 0;
  console.log(`  ${period.padEnd(10)}: ${String(stats.count).padStart(3)} trades, PnL: ${String(stats.pnl.toFixed(0)).padStart(6)}, WR: ${wr}% (${stats.wins}W/${stats.losses}L), Avg: ${avg}`);
});

console.log('\nSAMEDIR BY DAY:');
Object.entries(sdByDay).forEach(([day, stats]) => {
  if (stats.count === 0) return;
  const wr = stats.count > 0 ? ((stats.wins / stats.count) * 100).toFixed(1) : 0;
  const avg = stats.count > 0 ? (stats.pnl / stats.count).toFixed(1) : 0;
  console.log(`  Dec ${day}     : ${String(stats.count).padStart(3)} trades, PnL: ${String(stats.pnl.toFixed(0)).padStart(6)}, WR: ${wr}% (${stats.wins}W/${stats.losses}L), Avg: ${avg}`);
});

// Compare Dec 29 SameDir session by session
console.log('\n\nSAMEDIR SESSION-BY-SESSION COMPARISON:');
console.log('─'.repeat(80));

results.filter(r => !r.error && r.patterns && r.patterns.SameDir).forEach(r => {
  const sd = r.patterns.SameDir;
  const wr = sd.count > 0 ? ((sd.wins / sd.count) * 100).toFixed(0) : 0;
  const avg = sd.count > 0 ? (sd.pnl / sd.count).toFixed(1) : 0;
  const bar = sd.pnl >= 0 ? '+' : '';
  console.log(`Dec ${r.day} ${r.utc} (${r.period.padEnd(9)}): ${String(sd.count).padStart(2)} trades, PnL: ${bar}${String(sd.pnl.toFixed(0)).padStart(5)}, WR: ${String(wr).padStart(3)}% (${sd.wins}W/${sd.losses}L), Avg: ${avg}`);
});

// Grand summary
console.log('\n\n' + '='.repeat(80));
console.log('GRAND PATTERN COMPARISON: DEC 29 vs 30 vs 31');
console.log('='.repeat(80));

const grandByDay = { 29: {}, 30: {}, 31: {} };
results.forEach(r => {
  if (r.error) return;
  Object.entries(r.patterns).forEach(([pattern, stats]) => {
    if (!grandByDay[r.day][pattern]) {
      grandByDay[r.day][pattern] = { count: 0, pnl: 0, wins: 0, losses: 0 };
    }
    grandByDay[r.day][pattern].count += stats.count;
    grandByDay[r.day][pattern].pnl += stats.pnl;
    grandByDay[r.day][pattern].wins += stats.wins;
    grandByDay[r.day][pattern].losses += stats.losses;
  });
});

// Get all unique patterns
const allPatterns = new Set();
Object.values(grandByDay).forEach(day => Object.keys(day).forEach(p => allPatterns.add(p)));

console.log('\n' + 'Pattern'.padEnd(12) + '│ Dec 29 PnL (WR%)    │ Dec 30 PnL (WR%)    │ Dec 31 PnL (WR%)');
console.log('─'.repeat(12) + '┼' + '─'.repeat(21) + '┼' + '─'.repeat(21) + '┼' + '─'.repeat(21));

[...allPatterns].sort().forEach(pattern => {
  let row = pattern.padEnd(12) + '│';
  [29, 30, 31].forEach(day => {
    const stats = grandByDay[day][pattern];
    if (stats && stats.count > 0) {
      const wr = ((stats.wins / stats.count) * 100).toFixed(0);
      const pnlStr = (stats.pnl >= 0 ? '+' : '') + stats.pnl.toFixed(0);
      row += ` ${pnlStr.padStart(6)} (${wr}%, ${stats.count}t)`.padEnd(21) + '│';
    } else {
      row += ' -'.padEnd(21) + '│';
    }
  });
  console.log(row);
});
