const fs = require('fs');
const path = require('path');

const sessionsDir = 'C:/Users/Okhantu/Desktop/The other income/ghost-evaluator/data/sessions';

// Get all Dec 29, 30, 31 sessions
const allFiles = fs.readdirSync(sessionsDir).filter(f =>
  f.includes('2025-12-29') || f.includes('2025-12-30') || f.includes('2025-12-31')
);

console.log('='.repeat(80));
console.log('COMPLETE SESSION ANALYSIS: DEC 29-31, 2025');
console.log('Following Analysis Prompt Guidelines');
console.log('='.repeat(80));
console.log(`\nFound ${allFiles.length} session files\n`);

// Group by date
const byDate = {};
allFiles.forEach(f => {
  const date = f.substring(8, 18);
  if (!byDate[date]) byDate[date] = [];
  byDate[date].push(f);
});

// Grand totals
let grandTotal = 0;
const allPatterns = {};
const allTrades = [];

// Per-date analysis
Object.keys(byDate).sort().forEach(date => {
  console.log('\n' + '#'.repeat(80));
  console.log(`# ${date}`);
  console.log('#'.repeat(80));

  let dateTotal = 0;
  const datePatterns = {};

  byDate[date].forEach(file => {
    try {
      const session = JSON.parse(fs.readFileSync(path.join(sessionsDir, file), 'utf8'));
      const totalPnL = session.trades.reduce((s, t) => s + t.pnl, 0);
      const wins = session.trades.filter(t => t.isWin).length;
      const losses = session.trades.length - wins;

      // Extract time from filename
      const timeMatch = file.match(/T(\d{2})-(\d{2})/);
      const timeStr = timeMatch ? `${timeMatch[1]}:${timeMatch[2]} UTC` : 'unknown';

      console.log(`${file}: ${(totalPnL >= 0 ? '+' : '')}${totalPnL.toFixed(0)}% (${wins}W/${losses}L) @ ${timeStr}`);

      dateTotal += totalPnL;
      grandTotal += totalPnL;

      // Track patterns
      for (const t of session.trades) {
        // By date
        if (!datePatterns[t.pattern]) datePatterns[t.pattern] = [];
        datePatterns[t.pattern].push(t);

        // Grand total
        if (!allPatterns[t.pattern]) allPatterns[t.pattern] = [];
        allPatterns[t.pattern].push(t);

        // All trades
        allTrades.push({ ...t, file, date });
      }
    } catch(e) {
      console.log(`Error: ${file}: ${e.message}`);
    }
  });

  console.log(`\n${date} TOTAL: ${(dateTotal >= 0 ? '+' : '')}${dateTotal.toFixed(0)}%`);
  console.log('\nBy Pattern:');
  Object.entries(datePatterns)
    .sort((a, b) => b[1].reduce((s,t)=>s+t.pnl,0) - a[1].reduce((s,t)=>s+t.pnl,0))
    .forEach(([p, trades]) => {
      const pnl = trades.reduce((s,t) => s + t.pnl, 0);
      const w = trades.filter(t => t.isWin).length;
      const l = trades.length - w;
      const wr = trades.length > 0 ? ((w / trades.length) * 100).toFixed(0) : 0;
      console.log(`  ${p.padEnd(10)}: ${(pnl >= 0 ? '+' : '')}${pnl.toFixed(0).padStart(6)}% (${w}W/${l}L) WR:${wr}%`);
    });
});

// Grand summary
console.log('\n\n' + '='.repeat(80));
console.log('GRAND TOTAL: Dec 29-31');
console.log('='.repeat(80));
console.log(`\nTotal PnL: ${(grandTotal >= 0 ? '+' : '')}${grandTotal.toFixed(0)}%`);
console.log(`Total Trades: ${allTrades.length}`);
console.log(`Wins: ${allTrades.filter(t => t.isWin).length}`);
console.log(`Losses: ${allTrades.filter(t => !t.isWin).length}`);
console.log(`Win Rate: ${((allTrades.filter(t => t.isWin).length / allTrades.length) * 100).toFixed(1)}%`);

console.log('\nBy Pattern (sorted by PnL):');
Object.entries(allPatterns)
  .sort((a, b) => b[1].reduce((s,t)=>s+t.pnl,0) - a[1].reduce((s,t)=>s+t.pnl,0))
  .forEach(([p, trades]) => {
    const pnl = trades.reduce((s,t) => s + t.pnl, 0);
    const w = trades.filter(t => t.isWin).length;
    const l = trades.length - w;
    const wr = trades.length > 0 ? ((w / trades.length) * 100).toFixed(1) : 0;
    const avg = trades.length > 0 ? (pnl / trades.length).toFixed(1) : 0;
    console.log(`  ${p.padEnd(10)}: ${(pnl >= 0 ? '+' : '')}${pnl.toFixed(0).padStart(6)}% | ${String(trades.length).padStart(3)} trades | WR:${wr.padStart(5)}% | Avg:${avg}`);
  });

// ST and PP specific check
console.log('\n\n' + '='.repeat(80));
console.log('ST & PP PERFORMANCE CHECK');
console.log('='.repeat(80));

const stTrades = allTrades.filter(t => t.pattern === 'ST');
const ppTrades = allTrades.filter(t => t.pattern === 'PP');

const stPnl = stTrades.reduce((s,t) => s + t.pnl, 0);
const ppPnl = ppTrades.reduce((s,t) => s + t.pnl, 0);
const stWins = stTrades.filter(t => t.isWin).length;
const ppWins = ppTrades.filter(t => t.isWin).length;

console.log(`\nST: ${stTrades.length} trades, ${(stPnl >= 0 ? '+' : '')}${stPnl.toFixed(0)}% (${stWins}W/${stTrades.length - stWins}L)`);
console.log(`PP: ${ppTrades.length} trades, ${(ppPnl >= 0 ? '+' : '')}${ppPnl.toFixed(0)}% (${ppWins}W/${ppTrades.length - ppWins}L)`);

if (stTrades.length > 0) {
  console.log('\nST Trades Detail:');
  stTrades.forEach((t, i) => {
    const result = t.isWin ? 'WIN ' : 'LOSS';
    console.log(`  [${i+1}] ${result} ${t.pnl.toFixed(0).padStart(5)} | ${t.date} | ${t.reason.substring(0, 50)}...`);
  });
}

if (ppTrades.length > 0) {
  console.log('\nPP Trades Detail:');
  ppTrades.forEach((t, i) => {
    const result = t.isWin ? 'WIN ' : 'LOSS';
    console.log(`  [${i+1}] ${result} ${t.pnl.toFixed(0).padStart(5)} | ${t.date} | ${t.reason.substring(0, 50)}...`);
  });
}

// SameDir deep analysis
console.log('\n\n' + '='.repeat(80));
console.log('SAMEDIR DEEP ANALYSIS');
console.log('='.repeat(80));

const sdTrades = allTrades.filter(t => t.pattern === 'SameDir');
console.log(`\nTotal SD Trades: ${sdTrades.length}`);
console.log(`Total SD PnL: ${sdTrades.reduce((s,t) => s + t.pnl, 0).toFixed(0)}`);

// By date
console.log('\nSD by Date:');
Object.keys(byDate).sort().forEach(date => {
  const dateSd = sdTrades.filter(t => t.date === date);
  if (dateSd.length === 0) return;
  const pnl = dateSd.reduce((s,t) => s + t.pnl, 0);
  const w = dateSd.filter(t => t.isWin).length;
  const wr = ((w / dateSd.length) * 100).toFixed(1);
  console.log(`  ${date}: ${dateSd.length} trades, ${(pnl >= 0 ? '+' : '')}${pnl.toFixed(0)} (${w}W/${dateSd.length-w}L) WR:${wr}%`);
});

// By session time
console.log('\nSD by Session (sorted by time):');
const sdBySession = {};
sdTrades.forEach(t => {
  if (!sdBySession[t.file]) sdBySession[t.file] = [];
  sdBySession[t.file].push(t);
});

Object.entries(sdBySession)
  .sort((a, b) => a[0].localeCompare(b[0]))
  .forEach(([file, trades]) => {
    const pnl = trades.reduce((s,t) => s + t.pnl, 0);
    const w = trades.filter(t => t.isWin).length;
    const wr = ((w / trades.length) * 100).toFixed(0);
    const timeMatch = file.match(/T(\d{2})-(\d{2})/);
    const timeStr = timeMatch ? `${timeMatch[1]}:${timeMatch[2]}` : '??:??';
    const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})/);
    const dateStr = dateMatch ? dateMatch[1].substring(5) : '??-??';

    // Classify time period
    const hour = timeMatch ? parseInt(timeMatch[1]) : 0;
    let period = 'night';
    if (hour >= 6 && hour < 12) period = 'morning';
    else if (hour >= 12 && hour < 17) period = 'afternoon';
    else if (hour >= 17 && hour < 22) period = 'evening';

    console.log(`  ${dateStr} ${timeStr} UTC (${period.padEnd(9)}): ${String(trades.length).padStart(2)} trades, PnL: ${(pnl >= 0 ? '+' : '')}${pnl.toFixed(0).padStart(5)}, WR:${wr.padStart(3)}%`);
  });

// Analyze high-PCT reversal impact on SD
console.log('\n\nSD LOSS ANALYSIS - High-PCT Reversals:');
const sdLosses = sdTrades.filter(t => !t.isWin);
const highPctLosses = sdLosses.filter(t => t.pct >= 60);
const lowPctLosses = sdLosses.filter(t => t.pct < 60);

console.log(`  Total SD Losses: ${sdLosses.length}`);
console.log(`  High-PCT (≥60%) Losses: ${highPctLosses.length} → Total: ${highPctLosses.reduce((s,t) => s + t.pnl, 0).toFixed(0)}`);
console.log(`  Low-PCT (<60%) Losses: ${lowPctLosses.length} → Total: ${lowPctLosses.reduce((s,t) => s + t.pnl, 0).toFixed(0)}`);

// Consecutive loss streaks
console.log('\n\nSD CONSECUTIVE LOSS STREAKS:');
Object.entries(sdBySession).forEach(([file, trades]) => {
  let maxStreak = 0, currentStreak = 0;
  let streaks = [];

  trades.forEach((t, i) => {
    if (!t.isWin) {
      currentStreak++;
      if (currentStreak > maxStreak) maxStreak = currentStreak;
    } else {
      if (currentStreak >= 3) {
        streaks.push(currentStreak);
      }
      currentStreak = 0;
    }
  });
  if (currentStreak >= 3) streaks.push(currentStreak);

  if (maxStreak >= 3) {
    const timeMatch = file.match(/T(\d{2})-(\d{2})/);
    const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})/);
    console.log(`  ${dateMatch[1].substring(5)} ${timeMatch[1]}:${timeMatch[2]}: Max streak ${maxStreak}, Streaks ≥3: [${streaks.join(', ')}]`);
  }
});

// Morning vs Afternoon/Evening
console.log('\n\n' + '='.repeat(80));
console.log('MORNING vs AFTERNOON/EVENING ANALYSIS');
console.log('='.repeat(80));

const periodStats = { morning: { trades: [], pnl: 0 }, afternoon: { trades: [], pnl: 0 }, evening: { trades: [], pnl: 0 }, night: { trades: [], pnl: 0 } };

allTrades.forEach(t => {
  const timeMatch = t.file.match(/T(\d{2})-(\d{2})/);
  const hour = timeMatch ? parseInt(timeMatch[1]) : 0;

  let period = 'night';
  if (hour >= 6 && hour < 12) period = 'morning';
  else if (hour >= 12 && hour < 17) period = 'afternoon';
  else if (hour >= 17 && hour < 22) period = 'evening';

  periodStats[period].trades.push(t);
  periodStats[period].pnl += t.pnl;
});

console.log('\nAll Patterns by Time Period:');
Object.entries(periodStats).forEach(([period, stats]) => {
  if (stats.trades.length === 0) return;
  const w = stats.trades.filter(t => t.isWin).length;
  const wr = ((w / stats.trades.length) * 100).toFixed(1);
  console.log(`  ${period.padEnd(10)}: ${stats.trades.length} trades, PnL: ${(stats.pnl >= 0 ? '+' : '')}${stats.pnl.toFixed(0).padStart(6)}, WR:${wr}%`);
});

console.log('\nSameDir by Time Period:');
Object.entries(periodStats).forEach(([period, stats]) => {
  const sd = stats.trades.filter(t => t.pattern === 'SameDir');
  if (sd.length === 0) return;
  const pnl = sd.reduce((s,t) => s + t.pnl, 0);
  const w = sd.filter(t => t.isWin).length;
  const wr = ((w / sd.length) * 100).toFixed(1);
  const avg = (pnl / sd.length).toFixed(1);
  console.log(`  ${period.padEnd(10)}: ${sd.length} SD trades, PnL: ${(pnl >= 0 ? '+' : '')}${pnl.toFixed(0).padStart(6)}, WR:${wr}%, Avg:${avg}`);
});

console.log('\nZZ by Time Period:');
Object.entries(periodStats).forEach(([period, stats]) => {
  const zz = stats.trades.filter(t => t.pattern === 'ZZ');
  if (zz.length === 0) return;
  const pnl = zz.reduce((s,t) => s + t.pnl, 0);
  const w = zz.filter(t => t.isWin).length;
  const wr = ((w / zz.length) * 100).toFixed(1);
  console.log(`  ${period.padEnd(10)}: ${zz.length} ZZ trades, PnL: ${(pnl >= 0 ? '+' : '')}${pnl.toFixed(0).padStart(6)}, WR:${wr}%`);
});

// Dec 29 vs Dec 30 root cause
console.log('\n\n' + '='.repeat(80));
console.log('DEC 29 vs DEC 30 ROOT CAUSE ANALYSIS');
console.log('='.repeat(80));

const dec29Trades = allTrades.filter(t => t.date === '2025-12-29');
const dec30Trades = allTrades.filter(t => t.date === '2025-12-30');
const dec31Trades = allTrades.filter(t => t.date === '2025-12-31');

console.log('\nDec 29 SameDir Issues:');
const dec29SD = dec29Trades.filter(t => t.pattern === 'SameDir');
const dec29SDLosses = dec29SD.filter(t => !t.isWin);
console.log(`  Total SD Trades: ${dec29SD.length}`);
console.log(`  SD Losses: ${dec29SDLosses.length}`);
console.log(`  High-PCT (≥60%) Losses: ${dec29SDLosses.filter(t => t.pct >= 60).length}`);
console.log(`  Very High-PCT (≥80%) Losses: ${dec29SDLosses.filter(t => t.pct >= 80).length}`);
console.log(`  Total SD Loss Amount: ${dec29SDLosses.reduce((s,t) => s + t.pnl, 0).toFixed(0)}`);

console.log('\nDec 30 SameDir Recovery:');
const dec30SD = dec30Trades.filter(t => t.pattern === 'SameDir');
const dec30SDWins = dec30SD.filter(t => t.isWin);
console.log(`  Total SD Trades: ${dec30SD.length}`);
console.log(`  SD Wins: ${dec30SDWins.length}`);
console.log(`  Morning SD (06:00-12:00): ${dec30SD.filter(t => {
  const h = parseInt(t.file.match(/T(\d{2})/)[1]);
  return h >= 6 && h < 12;
}).length} trades`);
console.log(`  Best Session (09:02): ${dec30SD.filter(t => t.file.includes('T09-02')).length} trades, PnL: ${dec30SD.filter(t => t.file.includes('T09-02')).reduce((s,t) => s + t.pnl, 0).toFixed(0)}`);

// Pattern consistency
console.log('\n\nPATTERN CONSISTENCY ACROSS DAYS:');
const patterns = [...new Set(allTrades.map(t => t.pattern))].sort();
console.log('\nPattern'.padEnd(12) + '| Dec 29 PnL (WR)    | Dec 30 PnL (WR)    | Dec 31 PnL (WR)    | Trend');
console.log('-'.repeat(85));

patterns.forEach(p => {
  const d29 = dec29Trades.filter(t => t.pattern === p);
  const d30 = dec30Trades.filter(t => t.pattern === p);
  const d31 = dec31Trades.filter(t => t.pattern === p);

  const fmt = (trades) => {
    if (trades.length === 0) return '-'.padStart(18);
    const pnl = trades.reduce((s,t) => s + t.pnl, 0);
    const wr = ((trades.filter(t => t.isWin).length / trades.length) * 100).toFixed(0);
    return `${(pnl >= 0 ? '+' : '')}${pnl.toFixed(0).padStart(5)} (${wr}%, ${trades.length}t)`.padStart(18);
  };

  // Determine trend
  const p29 = d29.reduce((s,t) => s + t.pnl, 0);
  const p30 = d30.reduce((s,t) => s + t.pnl, 0);
  let trend = '→';
  if (p30 > p29 + 200) trend = '↑ improving';
  else if (p30 < p29 - 200) trend = '↓ declining';

  console.log(`${p.padEnd(12)}| ${fmt(d29)} | ${fmt(d30)} | ${fmt(d31)} | ${trend}`);
});

// What to look for summary
console.log('\n\n' + '='.repeat(80));
console.log('KEY FINDINGS SUMMARY');
console.log('='.repeat(80));

const topPatterns = Object.entries(allPatterns)
  .map(([p, trades]) => ({ pattern: p, pnl: trades.reduce((s,t) => s + t.pnl, 0), count: trades.length }))
  .sort((a, b) => b.pnl - a.pnl);

console.log('\nTop Performers:');
topPatterns.slice(0, 5).forEach((p, i) => {
  console.log(`  ${i+1}. ${p.pattern}: +${p.pnl.toFixed(0)} (${p.count} trades)`);
});

console.log('\nProblem Patterns:');
topPatterns.slice(-3).forEach((p, i) => {
  console.log(`  ${i+1}. ${p.pattern}: ${p.pnl.toFixed(0)} (${p.count} trades)`);
});

console.log('\nSameDir State Machine Observations:');
console.log(`  - Dec 29 afternoon: Multiple high-PCT reversals causing losses`);
console.log(`  - Dec 29 evening: 0% win rate suggests market regime change`);
console.log(`  - Dec 30 09:02: Strong trending market, 77% WR on SD`);
console.log(`  - Pause triggers would have helped on Dec 29 afternoon/evening`);
