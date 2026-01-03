const fs = require('fs');
const path = require('path');

const sessionsDir = 'C:/Users/Okhantu/Desktop/The other income/ghost-evaluator/data/sessions';

// Sessions before Dec 29
const sessionsBefore29 = [
  'session_2025-12-16T11-45-29-775Z.json',
  'session_2025-12-16T13-00-03-370Z.json',
  'session_2025-12-16T20-53-11-947Z.json',
  'session_2025-12-16T21-56-04-344Z.json',
  'session_2025-12-17T06-32-51-236Z.json',
  'session_2025-12-17T07-51-47-569Z.json',
  'session_2025-12-17T08-01-23-574Z.json',
  'session_2025-12-17T16-22-57-249Z.json',
  'session_2025-12-17T18-54-52-065Z.json',
  'session_2025-12-17T19-38-31-098Z.json',
  'session_2025-12-17T19-53-31-143Z.json',
  'session_2025-12-17T21-37-51-550Z.json',
  'session_2025-12-18T08-23-59-880Z.json',
  'session_2025-12-18T08-51-25-415Z.json',
  'session_2025-12-18T13-33-27-683Z.json',
  'session_2025-12-24T18-19-24-936Z.json',
  'session_2025-12-24T18-57-18-606Z.json',
  'session_2025-12-25T14-28-57-799Z.json',
  'session_2025-12-25T14-29-05-512Z.json',
  'session_2025-12-26T09-53-43-729Z.json',
  'session_2025-12-26T12-46-54-833Z.json',
  'session_2025-12-27T10-20-33-003Z.json',
  'session_2025-12-27T10-38-33-070Z.json',
  'session_2025-12-27T11-18-05-522Z.json',
  'session_2025-12-27T12-19-45-876Z.json',
  'session_2025-12-27T12-41-09-991Z.json',
  'session_2025-12-27T13-07-21-165Z.json',
  'session_2025-12-27T13-22-03-072Z.json',
  'session_2025-12-27T14-24-26-198Z.json',
  'session_2025-12-27T14-58-05-955Z.json',
  'session_2025-12-27T18-19-57-269Z.json',
  'session_2025-12-27T19-00-20-292Z.json',
  'session_2025-12-27T19-00-38-341Z.json',
  'session_2025-12-27T19-01-54-045Z.json',
  'session_2025-12-27T19-07-56-605Z.json',
  'session_2025-12-27T20-50-19-131Z.json',
  'session_2025-12-28T11-52-58-891Z.json',
  'session_2025-12-28T12-34-01-210Z.json',
  'session_2025-12-28T12-48-24-908Z.json',
  'session_2025-12-28T17-10-32-885Z.json',
  'session_2025-12-28T18-59-16-142Z.json',
  'session_2025-12-28T18-59-40-234Z.json',
];

// Group by date
const byDate = {};

console.log('='.repeat(70));
console.log('SAMEDIR ANALYSIS - ALL SESSIONS BEFORE DEC 29');
console.log('='.repeat(70));

let totalSD = { count: 0, pnl: 0, wins: 0, losses: 0 };
const allTrades = [];

sessionsBefore29.forEach(filename => {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(sessionsDir, filename)));
    const dateKey = filename.substring(8, 18); // Extract date part

    if (!byDate[dateKey]) {
      byDate[dateKey] = { sessions: 0, count: 0, pnl: 0, wins: 0, losses: 0, trades: [] };
    }
    byDate[dateKey].sessions++;

    // Filter SameDir trades
    const sdTrades = data.trades.filter(t => t.pattern === 'SameDir');

    if (sdTrades.length > 0) {
      const sessionTs = filename.replace('session_', '').replace('.json', '');
      console.log(`\n--- ${sessionTs} ---`);
      console.log(`SameDir trades: ${sdTrades.length}`);

      let sessionPnl = 0;
      let sessionWins = 0;
      let sessionLosses = 0;

      sdTrades.forEach(t => {
        sessionPnl += t.pnl;
        if (t.isWin) sessionWins++;
        else sessionLosses++;

        totalSD.count++;
        totalSD.pnl += t.pnl;
        if (t.isWin) totalSD.wins++;
        else totalSD.losses++;

        byDate[dateKey].count++;
        byDate[dateKey].pnl += t.pnl;
        if (t.isWin) byDate[dateKey].wins++;
        else byDate[dateKey].losses++;
        byDate[dateKey].trades.push(t);

        allTrades.push({ ...t, session: sessionTs, date: dateKey });
      });

      const winRate = sdTrades.length > 0 ? ((sessionWins / sdTrades.length) * 100).toFixed(1) : 0;
      console.log(`  PnL: ${sessionPnl}, W/L: ${sessionWins}/${sessionLosses} (${winRate}%)`);

      // Show individual trades
      sdTrades.forEach((t, i) => {
        const result = t.isWin ? 'WIN' : 'LOSS';
        console.log(`  [${i+1}] ${result} pnl:${t.pnl} conf:${t.confidence} pct:${t.pct} reason:${t.reason.substring(0, 60)}...`);
      });
    }
  } catch(e) {
    console.log(`Error: ${filename}: ${e.message}`);
  }
});

// Summary by date
console.log('\n' + '='.repeat(70));
console.log('SUMMARY BY DATE');
console.log('='.repeat(70));

const sortedDates = Object.keys(byDate).sort();
sortedDates.forEach(date => {
  const d = byDate[date];
  if (d.count > 0) {
    const winRate = d.count > 0 ? ((d.wins / d.count) * 100).toFixed(1) : 0;
    console.log(`${date}: ${d.sessions} sessions, ${d.count} SD trades, PnL: ${d.pnl.toFixed(0)}, W/L: ${d.wins}/${d.losses} (${winRate}%)`);
  }
});

// Grand total
console.log('\n' + '='.repeat(70));
console.log('GRAND TOTAL - SAMEDIR BEFORE DEC 29');
console.log('='.repeat(70));
console.log(`Total SameDir trades: ${totalSD.count}`);
console.log(`Total PnL: ${totalSD.pnl.toFixed(0)}`);
console.log(`Wins: ${totalSD.wins}, Losses: ${totalSD.losses}`);
console.log(`Win Rate: ${totalSD.count > 0 ? ((totalSD.wins / totalSD.count) * 100).toFixed(1) : 0}%`);
console.log(`Average PnL per trade: ${totalSD.count > 0 ? (totalSD.pnl / totalSD.count).toFixed(1) : 0}`);

// Analyze patterns in losses
console.log('\n' + '='.repeat(70));
console.log('LOSS ANALYSIS');
console.log('='.repeat(70));

const losses = allTrades.filter(t => !t.isWin);
const wins = allTrades.filter(t => t.isWin);

console.log(`\nTotal Losses: ${losses.length}`);
console.log(`Total Loss Amount: ${losses.reduce((s, t) => s + t.pnl, 0).toFixed(0)}`);
console.log(`Average Loss: ${losses.length > 0 ? (losses.reduce((s, t) => s + t.pnl, 0) / losses.length).toFixed(1) : 0}`);

console.log(`\nTotal Wins: ${wins.length}`);
console.log(`Total Win Amount: ${wins.reduce((s, t) => s + t.pnl, 0).toFixed(0)}`);
console.log(`Average Win: ${wins.length > 0 ? (wins.reduce((s, t) => s + t.pnl, 0) / wins.length).toFixed(1) : 0}`);

// Analyze by confidence level
console.log('\n' + '='.repeat(70));
console.log('BY CONFIDENCE LEVEL');
console.log('='.repeat(70));

const byConf = {};
allTrades.forEach(t => {
  const conf = t.confidence;
  if (!byConf[conf]) byConf[conf] = { count: 0, pnl: 0, wins: 0, losses: 0 };
  byConf[conf].count++;
  byConf[conf].pnl += t.pnl;
  if (t.isWin) byConf[conf].wins++;
  else byConf[conf].losses++;
});

Object.keys(byConf).sort((a, b) => a - b).forEach(conf => {
  const c = byConf[conf];
  const winRate = c.count > 0 ? ((c.wins / c.count) * 100).toFixed(1) : 0;
  console.log(`Conf ${conf}: ${c.count} trades, PnL: ${c.pnl.toFixed(0)}, W/L: ${c.wins}/${c.losses} (${winRate}%)`);
});

// Look for consecutive losses
console.log('\n' + '='.repeat(70));
console.log('CONSECUTIVE LOSS STREAKS (per session)');
console.log('='.repeat(70));

const sessionGroups = {};
allTrades.forEach(t => {
  if (!sessionGroups[t.session]) sessionGroups[t.session] = [];
  sessionGroups[t.session].push(t);
});

Object.keys(sessionGroups).forEach(session => {
  const trades = sessionGroups[session];
  let maxStreak = 0;
  let currentStreak = 0;

  trades.forEach(t => {
    if (!t.isWin) {
      currentStreak++;
      maxStreak = Math.max(maxStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  });

  if (maxStreak >= 3) {
    console.log(`${session}: Max loss streak: ${maxStreak}`);
  }
});

// Analyze reason patterns
console.log('\n' + '='.repeat(70));
console.log('REASON ANALYSIS (common patterns in losses)');
console.log('='.repeat(70));

const reasonPatterns = {};
losses.forEach(t => {
  // Extract key parts of reason
  const reason = t.reason;
  const match = reason.match(/\[([^\]]+)\]/g);
  if (match) {
    const key = match.join(' ');
    if (!reasonPatterns[key]) reasonPatterns[key] = { count: 0, pnl: 0 };
    reasonPatterns[key].count++;
    reasonPatterns[key].pnl += t.pnl;
  }
});

const sortedReasons = Object.entries(reasonPatterns).sort((a, b) => a[1].pnl - b[1].pnl);
sortedReasons.slice(0, 15).forEach(([reason, stats]) => {
  console.log(`${stats.count}x | PnL: ${stats.pnl.toFixed(0)} | ${reason}`);
});
