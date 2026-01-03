const fs = require('fs');
const path = require('path');

const sessionsDir = 'C:/Users/Okhantu/Desktop/The other income/ghost-evaluator/data/sessions';

// Get ALL session files
const allFiles = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json')).sort();

// Remove duplicates by file size
const bySize = {};
allFiles.forEach(f => {
  const size = fs.statSync(path.join(sessionsDir, f)).size;
  if (!bySize[size]) bySize[size] = [];
  bySize[size].push(f);
});
const dupes = [];
Object.values(bySize).forEach(g => g.length > 1 && g.slice(1).forEach(f => dupes.push(f)));
const session2026Files = allFiles.filter(f => !dupes.includes(f));

console.log('='.repeat(80));
console.log('SAMEDIR REMOVAL SIMULATION - ALL SESSIONS');
console.log('What would PnL be if SD was disabled entirely?');
console.log('='.repeat(80));
console.log('\nTotal sessions found:', session2026Files.length, '(duplicates removed)');

let totalActualPnl = 0;
let totalWithoutSdPnl = 0;
let totalSdPnl = 0;
let totalNonSdPnl = 0;

const sessionResults = [];

session2026Files.forEach(file => {
  const session = JSON.parse(fs.readFileSync(path.join(sessionsDir, file)));

  const sdTrades = session.trades.filter(t => t.pattern === 'SameDir');
  const nonSdTrades = session.trades.filter(t => t.pattern !== 'SameDir');

  const actualPnl = session.pnlTotal;
  const sdPnl = sdTrades.reduce((sum, t) => sum + t.pnl, 0);
  const nonSdPnl = nonSdTrades.reduce((sum, t) => sum + t.pnl, 0);

  // PnL without SD = just remove SD trades entirely
  const withoutSdPnl = nonSdPnl;

  totalActualPnl += actualPnl;
  totalSdPnl += sdPnl;
  totalNonSdPnl += nonSdPnl;
  totalWithoutSdPnl += withoutSdPnl;

  // Check what patterns were available during SD trades
  // Look at the results array for patterns that triggered at same time
  const sdTradeIndices = sdTrades.map(t => t.evalIndex);
  const missedOpportunities = [];

  sdTrades.forEach(sdTrade => {
    // Find results that were evaluated at same block as SD trade
    const sameBlockResults = session.results.filter(r =>
      r.evalIndex === sdTrade.evalIndex &&
      r.wasBet === false &&  // Pattern didn't bet because SD took it
      r.profit !== undefined
    );

    // Check for Anti patterns, AP5, ST, OZ that could have played
    const alternatives = sameBlockResults.filter(r =>
      ['Anti2A2', 'Anti3A3', 'Anti4A4', 'Anti5A5', 'AP5', 'ST', 'OZ', 'PP'].includes(r.pattern)
    );

    if (alternatives.length > 0) {
      // Would any of these have won?
      const bestAlt = alternatives.sort((a, b) => b.profit - a.profit)[0];
      missedOpportunities.push({
        sdPnl: sdTrade.pnl,
        sdWon: sdTrade.isWin,
        altPattern: bestAlt.pattern,
        altProfit: bestAlt.profit,
        altWouldWin: bestAlt.profit > 0
      });
    }
  });

  // Calculate what we would have got with alternatives
  let altPnl = 0;
  missedOpportunities.forEach(m => {
    // If we had taken the alt instead of SD
    altPnl += (m.altProfit * 2); // Convert to actual PnL (profit is %, stake is 200)
  });

  sessionResults.push({
    file: file.substring(8, 35),
    actualPnl,
    sdPnl,
    nonSdPnl,
    withoutSdPnl,
    sdTrades: sdTrades.length,
    sdWins: sdTrades.filter(t => t.isWin).length,
    missedOps: missedOpportunities.length,
    difference: withoutSdPnl - actualPnl
  });
});

console.log('\nPer-Session Comparison:');
console.log('-'.repeat(100));
console.log(
  'Session'.padEnd(30) +
  'Actual'.padStart(9) +
  'SD PnL'.padStart(9) +
  'Non-SD'.padStart(9) +
  'W/O SD'.padStart(9) +
  'Diff'.padStart(9) +
  'SD Trades'.padStart(11) +
  'SD W/L'.padStart(10)
);
console.log('-'.repeat(100));

sessionResults.forEach(r => {
  const diffStr = (r.difference >= 0 ? '+' : '') + r.difference.toFixed(0);
  console.log(
    r.file.padEnd(30) +
    r.actualPnl.toFixed(0).padStart(9) +
    r.sdPnl.toFixed(0).padStart(9) +
    r.nonSdPnl.toFixed(0).padStart(9) +
    r.withoutSdPnl.toFixed(0).padStart(9) +
    diffStr.padStart(9) +
    String(r.sdTrades).padStart(11) +
    (r.sdWins + '/' + (r.sdTrades - r.sdWins)).padStart(10)
  );
});

console.log('-'.repeat(100));

const totalDiff = totalWithoutSdPnl - totalActualPnl;
console.log(
  'TOTAL'.padEnd(30) +
  totalActualPnl.toFixed(0).padStart(9) +
  totalSdPnl.toFixed(0).padStart(9) +
  totalNonSdPnl.toFixed(0).padStart(9) +
  totalWithoutSdPnl.toFixed(0).padStart(9) +
  ((totalDiff >= 0 ? '+' : '') + totalDiff.toFixed(0)).padStart(9)
);

console.log('\n' + '='.repeat(80));
console.log('SUMMARY');
console.log('='.repeat(80));

console.log('\nActual Total PnL (with SD):    ' + (totalActualPnl >= 0 ? '+' : '') + totalActualPnl.toFixed(0));
console.log('SameDir Contribution:          ' + (totalSdPnl >= 0 ? '+' : '') + totalSdPnl.toFixed(0));
console.log('Non-SD Contribution:           ' + (totalNonSdPnl >= 0 ? '+' : '') + totalNonSdPnl.toFixed(0));
console.log('PnL WITHOUT SameDir:           ' + (totalWithoutSdPnl >= 0 ? '+' : '') + totalWithoutSdPnl.toFixed(0));
console.log('');
console.log('DIFFERENCE (W/O SD - Actual):  ' + (totalDiff >= 0 ? '+' : '') + totalDiff.toFixed(0));

if (totalDiff > 0) {
  console.log('\n*** DISABLING SD WOULD HAVE SAVED ' + totalDiff.toFixed(0) + ' ***');
} else {
  console.log('\n*** DISABLING SD WOULD HAVE COST ' + Math.abs(totalDiff).toFixed(0) + ' ***');
}

// Count sessions that would have been better without SD
const betterWithoutSd = sessionResults.filter(r => r.difference > 0).length;
const worseWithoutSd = sessionResults.filter(r => r.difference < 0).length;
const sameWithoutSd = sessionResults.filter(r => r.difference === 0).length;

console.log('\nSession Breakdown:');
console.log('  Better without SD: ' + betterWithoutSd + ' sessions');
console.log('  Worse without SD:  ' + worseWithoutSd + ' sessions');
console.log('  Same:              ' + sameWithoutSd + ' sessions');

// Show which sessions would flip from loss to profit or vice versa
console.log('\n' + '='.repeat(80));
console.log('SESSION OUTCOME CHANGES');
console.log('='.repeat(80));

sessionResults.forEach(r => {
  const wasProfit = r.actualPnl > 0;
  const wouldBeProfit = r.withoutSdPnl > 0;

  if (wasProfit !== wouldBeProfit) {
    if (wouldBeProfit) {
      console.log(r.file + ': LOSS -> PROFIT (from ' + r.actualPnl.toFixed(0) + ' to +' + r.withoutSdPnl.toFixed(0) + ')');
    } else {
      console.log(r.file + ': PROFIT -> LOSS (from +' + r.actualPnl.toFixed(0) + ' to ' + r.withoutSdPnl.toFixed(0) + ')');
    }
  }
});

// Stop loss analysis
console.log('\n' + '='.repeat(80));
console.log('STOP LOSS ANALYSIS');
console.log('='.repeat(80));

console.log('\nHow SD affects reaching stop loss faster:');

session2026Files.forEach(file => {
  const session = JSON.parse(fs.readFileSync(path.join(sessionsDir, file)));

  // Simulate cumulative PnL with and without SD
  let cumWithSd = 0;
  let cumWithoutSd = 0;
  let hitStopWithSd = false;
  let hitStopWithoutSd = false;
  let stopTradeWithSd = -1;
  let stopTradeWithoutSd = -1;
  const STOP_LOSS = -500;

  session.trades.forEach((t, i) => {
    cumWithSd += t.pnl;
    if (t.pattern !== 'SameDir') {
      cumWithoutSd += t.pnl;
    }

    if (!hitStopWithSd && cumWithSd <= STOP_LOSS) {
      hitStopWithSd = true;
      stopTradeWithSd = i + 1;
    }
    if (!hitStopWithoutSd && cumWithoutSd <= STOP_LOSS) {
      hitStopWithoutSd = true;
      stopTradeWithoutSd = i + 1;
    }
  });

  const shortName = file.substring(8, 30);

  if (hitStopWithSd && !hitStopWithoutSd) {
    console.log(shortName + ': SD CAUSED stop loss at trade ' + stopTradeWithSd + ' (without SD: never hit)');
  } else if (hitStopWithSd && hitStopWithoutSd) {
    const diff = stopTradeWithSd - stopTradeWithoutSd;
    if (diff < 0) {
      console.log(shortName + ': SD hit stop ' + Math.abs(diff) + ' trades EARLIER (' + stopTradeWithSd + ' vs ' + stopTradeWithoutSd + ')');
    } else if (diff > 0) {
      console.log(shortName + ': SD hit stop ' + diff + ' trades LATER (' + stopTradeWithSd + ' vs ' + stopTradeWithoutSd + ')');
    }
  } else if (!hitStopWithSd && !hitStopWithoutSd) {
    console.log(shortName + ': Neither hit stop loss');
  }
});

console.log('\n' + '='.repeat(80));
