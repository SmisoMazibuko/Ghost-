const fs = require('fs');
const path = require('path');

const sessionsDir = 'C:/Users/Okhantu/Desktop/The other income/ghost-evaluator/data/sessions';

// Get sessions for Dec 29, 30, 31
const sessions29 = [
  'session_2025-12-29T12-07-26-252Z.json',
  'session_2025-12-29T14-02-26-770Z.json',
  'session_2025-12-29T15-23-22-333Z.json',
  'session_2025-12-29T19-37-41-544Z.json',
  'session_2025-12-29T20-11-11-250Z.json',
  'session_2025-12-29T20-18-44-249Z.json',
];

const sessions30 = [
  'session_2025-12-30T06-49-58-137Z.json',
  'session_2025-12-30T06-53-52-022Z.json',
  'session_2025-12-30T09-02-55-295Z.json',
  'session_2025-12-30T16-49-37-401Z.json',
  'session_2025-12-30T19-33-05-629Z.json',
  'session_2025-12-30T22-35-58-183Z.json',
];

const sessions31 = [
  'session_2025-12-31T06-59-38-855Z.json',
  'session_2025-12-31T07-12-15-602Z.json',
];

function analyzeSession(filename) {
  const data = JSON.parse(fs.readFileSync(path.join(sessionsDir, filename)));

  const result = {
    file: filename,
    ts: filename.replace('session_', '').replace('.json', ''),
    blocks: data.blocks.length,
    trades: data.trades.length,
    pnlTotal: data.pnlTotal,
    byTrigger: {}
  };

  // Group by pattern
  data.trades.forEach(t => {
    const pattern = t.pattern || 'unknown';
    if (!result.byTrigger[pattern]) {
      result.byTrigger[pattern] = { count: 0, pnl: 0, wins: 0, losses: 0 };
    }
    result.byTrigger[pattern].count++;
    result.byTrigger[pattern].pnl += t.pnl;
    if (t.isWin) result.byTrigger[pattern].wins++;
    else result.byTrigger[pattern].losses++;
  });

  return result;
}

function printDayAnalysis(dayName, sessionFiles) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`${dayName}`);
  console.log('='.repeat(60));

  const allTriggers = {};
  let totalPnl = 0;
  let totalTrades = 0;

  sessionFiles.forEach(f => {
    try {
      const analysis = analyzeSession(f);
      console.log(`\n--- ${analysis.ts} ---`);
      console.log(`Blocks: ${analysis.blocks}, Trades: ${analysis.trades}, PnL: ${analysis.pnlTotal}`);

      totalPnl += analysis.pnlTotal;
      totalTrades += analysis.trades;

      // Aggregate by trigger
      for (const [trigger, stats] of Object.entries(analysis.byTrigger)) {
        if (!allTriggers[trigger]) {
          allTriggers[trigger] = { count: 0, pnl: 0, wins: 0, losses: 0 };
        }
        allTriggers[trigger].count += stats.count;
        allTriggers[trigger].pnl += stats.pnl;
        allTriggers[trigger].wins += stats.wins;
        allTriggers[trigger].losses += stats.losses;
      }

      console.log('By Trigger:');
      for (const [trigger, stats] of Object.entries(analysis.byTrigger)) {
        const winRate = stats.count > 0 ? ((stats.wins / stats.count) * 100).toFixed(1) : 0;
        console.log(`  ${trigger}: ${stats.count} trades, PnL: ${stats.pnl}, W/L: ${stats.wins}/${stats.losses} (${winRate}%)`);
      }
    } catch(e) {
      console.log(`Error reading ${f}: ${e.message}`);
    }
  });

  console.log(`\n--- ${dayName} SUMMARY ---`);
  console.log(`Total Sessions: ${sessionFiles.length}`);
  console.log(`Total Trades: ${totalTrades}`);
  console.log(`Total PnL: ${totalPnl}`);
  console.log('\nAggregated by Trigger:');

  // Sort by PnL
  const sortedTriggers = Object.entries(allTriggers).sort((a, b) => b[1].pnl - a[1].pnl);
  for (const [trigger, stats] of sortedTriggers) {
    const winRate = stats.count > 0 ? ((stats.wins / stats.count) * 100).toFixed(1) : 0;
    const avgPnl = stats.count > 0 ? (stats.pnl / stats.count).toFixed(1) : 0;
    console.log(`  ${trigger.padEnd(12)}: ${String(stats.count).padStart(4)} trades, PnL: ${String(stats.pnl).padStart(6)}, W/L: ${String(stats.wins).padStart(3)}/${String(stats.losses).padStart(3)} (${winRate.padStart(5)}%), Avg: ${avgPnl}`);
  }
}

// Run analysis
printDayAnalysis('DECEMBER 29, 2025', sessions29);
printDayAnalysis('DECEMBER 30, 2025', sessions30);
printDayAnalysis('DECEMBER 31, 2025', sessions31);

// Grand summary
console.log('\n' + '='.repeat(60));
console.log('GRAND SUMMARY (Dec 29-31)');
console.log('='.repeat(60));

const allSessions = [...sessions29, ...sessions30, ...sessions31];
const grandTriggers = {};
let grandPnl = 0;
let grandTrades = 0;

allSessions.forEach(f => {
  try {
    const analysis = analyzeSession(f);
    grandPnl += analysis.pnlTotal;
    grandTrades += analysis.trades;

    for (const [trigger, stats] of Object.entries(analysis.byTrigger)) {
      if (!grandTriggers[trigger]) {
        grandTriggers[trigger] = { count: 0, pnl: 0, wins: 0, losses: 0 };
      }
      grandTriggers[trigger].count += stats.count;
      grandTriggers[trigger].pnl += stats.pnl;
      grandTriggers[trigger].wins += stats.wins;
      grandTriggers[trigger].losses += stats.losses;
    }
  } catch(e) {}
});

console.log(`\nTotal Sessions: ${allSessions.length}`);
console.log(`Total Trades: ${grandTrades}`);
console.log(`Total PnL: ${grandPnl}`);
console.log('\nBy Trigger (sorted by PnL):');

const sortedGrand = Object.entries(grandTriggers).sort((a, b) => b[1].pnl - a[1].pnl);
for (const [trigger, stats] of sortedGrand) {
  const winRate = stats.count > 0 ? ((stats.wins / stats.count) * 100).toFixed(1) : 0;
  const avgPnl = stats.count > 0 ? (stats.pnl / stats.count).toFixed(1) : 0;
  console.log(`  ${trigger.padEnd(12)}: ${String(stats.count).padStart(4)} trades, PnL: ${String(stats.pnl).padStart(6)}, W/L: ${String(stats.wins).padStart(3)}/${String(stats.losses).padStart(3)} (${winRate.padStart(5)}%), Avg: ${avgPnl}`);
}
