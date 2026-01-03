const fs = require('fs');
const path = require('path');

const sessionsDir = 'C:/Users/Okhantu/Desktop/The other income/ghost-evaluator/data/sessions';

// Get ALL session files, remove duplicates
const allFiles = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json')).sort();
const bySize = {};
allFiles.forEach(f => {
  const size = fs.statSync(path.join(sessionsDir, f)).size;
  if (!bySize[size]) bySize[size] = [];
  bySize[size].push(f);
});
const dupes = [];
Object.values(bySize).forEach(g => g.length > 1 && g.slice(1).forEach(f => dupes.push(f)));
const sessionFiles = allFiles.filter(f => !dupes.includes(f));

console.log('='.repeat(80));
console.log('SD TRUE VALUE ANALYSIS');
console.log('Is SD adding value or just stealing from other patterns?');
console.log('='.repeat(80));
console.log('\nSessions analyzed:', sessionFiles.length);

// Continuation patterns (same direction as SD)
const CONTINUATION_PATTERNS = ['Anti2A2', 'Anti3A3', 'Anti4A4', 'Anti5A5', 'Anti6A6', 'AP5', 'ST', 'PP'];

let stats = {
  totalSdTrades: 0,
  totalSdPnl: 0,

  // Category 1: SD alone (no alternative would have traded)
  sdAloneTrades: 0,
  sdAlonePnl: 0,

  // Category 2: SD with alternatives (redundant - pattern would have taken it)
  sdRedundantTrades: 0,
  sdRedundantPnl: 0,
  altRedundantPnl: 0,  // What alternative would have made
};

const sessionDetails = [];

sessionFiles.forEach(file => {
  const session = JSON.parse(fs.readFileSync(path.join(sessionsDir, file)));
  const sdTrades = session.trades.filter(t => t.pattern === 'SameDir');

  if (sdTrades.length === 0) return;

  let sessionStats = {
    file: file.substring(8, 35),
    sdTrades: sdTrades.length,
    sdPnl: 0,
    sdAloneTrades: 0,
    sdAlonePnl: 0,
    sdRedundantTrades: 0,
    sdRedundantPnl: 0,
    altWouldBePnl: 0,
  };

  sdTrades.forEach(sdTrade => {
    stats.totalSdTrades++;
    stats.totalSdPnl += sdTrade.pnl;
    sessionStats.sdPnl += sdTrade.pnl;

    // Check if any continuation pattern was ACTIVE and would have bet same direction
    const sameBlockResults = session.results.filter(r =>
      r.evalIndex === sdTrade.evalIndex &&
      CONTINUATION_PATTERNS.includes(r.pattern) &&
      r.expectedDirection === sdTrade.predictedDirection
    );

    // Check pattern cycles to see if pattern was actually active
    const activeAlternatives = sameBlockResults.filter(r => {
      const cycle = session.patternCycles[r.pattern];
      // Pattern was active at this point if it had wasBet=true OR was in active state
      return r.wasBet === true || (cycle && cycle.state === 'active');
    });

    if (activeAlternatives.length > 0) {
      // REDUNDANT: An alternative pattern would have taken this trade
      stats.sdRedundantTrades++;
      stats.sdRedundantPnl += sdTrade.pnl;
      sessionStats.sdRedundantTrades++;
      sessionStats.sdRedundantPnl += sdTrade.pnl;

      // The alternative would have made same PnL (same direction, same outcome)
      const altPnl = sdTrade.pnl;  // Same outcome since same direction
      stats.altRedundantPnl += altPnl;
      sessionStats.altWouldBePnl += altPnl;
    } else {
      // SD ALONE: No alternative would have taken this trade
      stats.sdAloneTrades++;
      stats.sdAlonePnl += sdTrade.pnl;
      sessionStats.sdAloneTrades++;
      sessionStats.sdAlonePnl += sdTrade.pnl;
    }
  });

  sessionDetails.push(sessionStats);
});

console.log('\n' + '='.repeat(80));
console.log('THE KEY INSIGHT');
console.log('='.repeat(80));

console.log('\nTotal SD Trades: ' + stats.totalSdTrades);
console.log('');
console.log('CATEGORY 1 - SD ALONE (unique value):');
console.log('  Trades where NO alternative pattern would have bet: ' + stats.sdAloneTrades + ' (' + ((stats.sdAloneTrades/stats.totalSdTrades)*100).toFixed(1) + '%)');
console.log('  PnL from these trades: ' + (stats.sdAlonePnl >= 0 ? '+' : '') + stats.sdAlonePnl.toFixed(0));
console.log('');
console.log('CATEGORY 2 - SD REDUNDANT (no added value):');
console.log('  Trades where Anti/AP5/ST would have bet anyway: ' + stats.sdRedundantTrades + ' (' + ((stats.sdRedundantTrades/stats.totalSdTrades)*100).toFixed(1) + '%)');
console.log('  SD PnL from these trades: ' + (stats.sdRedundantPnl >= 0 ? '+' : '') + stats.sdRedundantPnl.toFixed(0));
console.log('  (Alternative patterns would make SAME PnL: ' + (stats.altRedundantPnl >= 0 ? '+' : '') + stats.altRedundantPnl.toFixed(0) + ')');

console.log('\n' + '='.repeat(80));
console.log('VERDICT');
console.log('='.repeat(80));

console.log('\nSD Reported Total PnL: ' + (stats.totalSdPnl >= 0 ? '+' : '') + stats.totalSdPnl.toFixed(0));
console.log('');
console.log('But ' + ((stats.sdRedundantTrades/stats.totalSdTrades)*100).toFixed(1) + '% of that (' + (stats.sdRedundantPnl >= 0 ? '+' : '') + stats.sdRedundantPnl.toFixed(0) + ') would have been captured by Anti/AP5/ST anyway!');
console.log('');
console.log('SD UNIQUE CONTRIBUTION: ' + (stats.sdAlonePnl >= 0 ? '+' : '') + stats.sdAlonePnl.toFixed(0));
console.log('  (Only ' + ((stats.sdAloneTrades/stats.totalSdTrades)*100).toFixed(1) + '% of trades)');

if (stats.sdAlonePnl < 0) {
  console.log('\n*** SD IS NET NEGATIVE ***');
  console.log('*** Even its unique trades are losing money! ***');
  console.log('*** RECOMMENDATION: DISABLE SD ***');
} else if (stats.sdAlonePnl > 0 && stats.sdAlonePnl < Math.abs(stats.sdRedundantPnl) * 0.5) {
  console.log('\n*** SD UNIQUE VALUE IS MINIMAL ***');
  console.log('*** Most profit comes from trades that patterns would capture anyway ***');
}

// Per-session breakdown for SD ALONE trades
console.log('\n' + '='.repeat(80));
console.log('PER-SESSION: SD ALONE TRADES (unique contribution)');
console.log('='.repeat(80));

console.log('-'.repeat(90));
console.log(
  'Session'.padEnd(28) +
  'Total SD'.padStart(10) +
  'Alone#'.padStart(8) +
  'Alone PnL'.padStart(12) +
  'Redund#'.padStart(9) +
  'Redund PnL'.padStart(12)
);
console.log('-'.repeat(90));

sessionDetails.sort((a, b) => a.sdAlonePnl - b.sdAlonePnl).forEach(s => {
  console.log(
    s.file.padEnd(28) +
    String(s.sdTrades).padStart(10) +
    String(s.sdAloneTrades).padStart(8) +
    s.sdAlonePnl.toFixed(0).padStart(12) +
    String(s.sdRedundantTrades).padStart(9) +
    s.sdRedundantPnl.toFixed(0).padStart(12)
  );
});

console.log('-'.repeat(90));
console.log(
  'TOTAL'.padEnd(28) +
  String(stats.totalSdTrades).padStart(10) +
  String(stats.sdAloneTrades).padStart(8) +
  stats.sdAlonePnl.toFixed(0).padStart(12) +
  String(stats.sdRedundantTrades).padStart(9) +
  stats.sdRedundantPnl.toFixed(0).padStart(12)
);

// What happens if we disable SD?
console.log('\n' + '='.repeat(80));
console.log('SCENARIO: DISABLE SD COMPLETELY');
console.log('='.repeat(80));

console.log('\nIf SD is disabled:');
console.log('  - Redundant trades (' + stats.sdRedundantTrades + '): Anti/AP5/ST capture them → PnL: ' + (stats.altRedundantPnl >= 0 ? '+' : '') + stats.altRedundantPnl.toFixed(0));
console.log('  - SD Alone trades (' + stats.sdAloneTrades + '): NO ONE takes them → PnL: 0');
console.log('');
console.log('Net change if SD disabled: ' + (stats.altRedundantPnl - stats.totalSdPnl >= 0 ? '+' : '') + (stats.altRedundantPnl - stats.totalSdPnl).toFixed(0));

if (stats.altRedundantPnl >= stats.totalSdPnl) {
  console.log('\n*** NO LOSS FROM DISABLING SD ***');
  console.log('*** Alternative patterns capture ' + ((stats.sdRedundantTrades/stats.totalSdTrades)*100).toFixed(0) + '% of the value ***');
} else {
  console.log('\n*** COST OF DISABLING SD: ' + (stats.totalSdPnl - stats.altRedundantPnl).toFixed(0) + ' ***');
  console.log('*** This is the value of SD Alone trades ***');
}

// But wait - SD Alone trades might be the problem!
console.log('\n' + '='.repeat(80));
console.log('THE REAL QUESTION: Are SD Alone trades helping or hurting?');
console.log('='.repeat(80));

const sdAloneWins = sessionDetails.reduce((sum, s) => sum + (s.sdAlonePnl > 0 ? 1 : 0), 0);
const sdAloneLosses = sessionDetails.reduce((sum, s) => sum + (s.sdAlonePnl < 0 ? 1 : 0), 0);

console.log('\nSessions where SD Alone is POSITIVE: ' + sdAloneWins);
console.log('Sessions where SD Alone is NEGATIVE: ' + sdAloneLosses);
console.log('');
console.log('SD Alone Total PnL: ' + (stats.sdAlonePnl >= 0 ? '+' : '') + stats.sdAlonePnl.toFixed(0));

if (stats.sdAlonePnl < 0) {
  console.log('\n==> SD ALONE TRADES ARE LOSING MONEY');
  console.log('==> These are trades that NO pattern would take');
  console.log('==> SD is taking BAD trades that patterns wisely avoid!');
  console.log('\n*** STRONG RECOMMENDATION: DISABLE SD ***');
}

console.log('\n' + '='.repeat(80));
