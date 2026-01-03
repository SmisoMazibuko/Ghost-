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
const sessionFiles = allFiles.filter(f => !dupes.includes(f));

console.log('='.repeat(80));
console.log('SD STOLEN TRADES ANALYSIS');
console.log('What would AntiXAX/AP5/ST have made on SD trades?');
console.log('='.repeat(80));
console.log('\nSessions analyzed:', sessionFiles.length);

// Patterns that SD could steal from (same direction as SD - continuation)
const CONTINUATION_PATTERNS = ['Anti2A2', 'Anti3A3', 'Anti4A4', 'Anti5A5', 'Anti6A6', 'AP5', 'ST', 'PP'];

let totalSdPnl = 0;
let totalStolenPnl = 0;  // What the stolen patterns would have made
let totalSdTrades = 0;
let stolenTradeCount = 0;

const sessionDetails = [];

sessionFiles.forEach(file => {
  const session = JSON.parse(fs.readFileSync(path.join(sessionsDir, file)));

  const sdTrades = session.trades.filter(t => t.pattern === 'SameDir');
  if (sdTrades.length === 0) return;

  let sessionSdPnl = 0;
  let sessionStolenPnl = 0;
  let sessionStolenCount = 0;

  const stolenDetails = [];

  sdTrades.forEach(sdTrade => {
    sessionSdPnl += sdTrade.pnl;
    totalSdTrades++;

    // Find what patterns were evaluated at the same block
    const sameBlockResults = session.results.filter(r =>
      r.evalIndex === sdTrade.evalIndex
    );

    // Check for continuation patterns that would have bet same direction as SD
    const alternatives = sameBlockResults.filter(r =>
      CONTINUATION_PATTERNS.includes(r.pattern) &&
      r.expectedDirection === sdTrade.predictedDirection  // Same direction as SD bet
    );

    if (alternatives.length > 0) {
      // These patterns would have taken this trade if SD wasn't there
      // Pick the best one (highest profit potential based on activation state)
      const bestAlt = alternatives.sort((a, b) => b.profit - a.profit)[0];

      // Calculate what this pattern would have made (profit is %, stake is 200)
      const altPnl = bestAlt.profit * 2;  // Convert profit % to actual PnL

      sessionStolenPnl += altPnl;
      sessionStolenCount++;
      stolenTradeCount++;

      stolenDetails.push({
        sdPnl: sdTrade.pnl,
        altPattern: bestAlt.pattern,
        altPnl: altPnl,
        altWon: bestAlt.profit > 0,
        sdWon: sdTrade.isWin,
        pct: sdTrade.pct
      });
    }
  });

  totalSdPnl += sessionSdPnl;
  totalStolenPnl += sessionStolenPnl;

  if (sessionStolenCount > 0) {
    sessionDetails.push({
      file: file.substring(8, 35),
      sdTrades: sdTrades.length,
      sdPnl: sessionSdPnl,
      stolenCount: sessionStolenCount,
      stolenPnl: sessionStolenPnl,
      trueSdValue: sessionSdPnl - sessionStolenPnl,
      stolenDetails
    });
  }
});

console.log('\n' + '='.repeat(80));
console.log('AGGREGATE RESULTS');
console.log('='.repeat(80));

console.log('\nTotal SD Trades:', totalSdTrades);
console.log('Trades with stolen alternatives:', stolenTradeCount, '(' + ((stolenTradeCount/totalSdTrades)*100).toFixed(1) + '%)');

console.log('\n--- PnL Breakdown ---');
console.log('SD Reported PnL:              ' + (totalSdPnl >= 0 ? '+' : '') + totalSdPnl.toFixed(0));
console.log('Stolen Pattern Would-Be PnL:  ' + (totalStolenPnl >= 0 ? '+' : '') + totalStolenPnl.toFixed(0));
console.log('');
console.log('TRUE SD Value (SD - Stolen):  ' + ((totalSdPnl - totalStolenPnl) >= 0 ? '+' : '') + (totalSdPnl - totalStolenPnl).toFixed(0));

if (totalSdPnl - totalStolenPnl < 0) {
  console.log('\n*** SD IS ACTUALLY COSTING ' + Math.abs(totalSdPnl - totalStolenPnl).toFixed(0) + ' ***');
  console.log('*** The patterns it steals from would have made MORE ***');
}

// Per-session breakdown
console.log('\n' + '='.repeat(80));
console.log('PER-SESSION BREAKDOWN (sessions with stolen trades)');
console.log('='.repeat(80));
console.log('-'.repeat(100));
console.log(
  'Session'.padEnd(28) +
  'SD Trades'.padStart(10) +
  'SD PnL'.padStart(10) +
  'Stolen#'.padStart(9) +
  'Stolen PnL'.padStart(12) +
  'TRUE SD'.padStart(12) +
  'Verdict'.padStart(12)
);
console.log('-'.repeat(100));

sessionDetails.sort((a, b) => a.trueSdValue - b.trueSdValue).forEach(s => {
  const verdict = s.trueSdValue >= 0 ? 'SD helped' : 'SD HURT';
  console.log(
    s.file.padEnd(28) +
    String(s.sdTrades).padStart(10) +
    s.sdPnl.toFixed(0).padStart(10) +
    String(s.stolenCount).padStart(9) +
    s.stolenPnl.toFixed(0).padStart(12) +
    s.trueSdValue.toFixed(0).padStart(12) +
    verdict.padStart(12)
  );
});

console.log('-'.repeat(100));

// Summary by pattern stolen from
console.log('\n' + '='.repeat(80));
console.log('BREAKDOWN BY STOLEN PATTERN');
console.log('='.repeat(80));

const byPattern = {};
sessionDetails.forEach(s => {
  s.stolenDetails.forEach(d => {
    if (!byPattern[d.altPattern]) {
      byPattern[d.altPattern] = { count: 0, stolenPnl: 0, sdPnl: 0, altWins: 0, sdWins: 0 };
    }
    byPattern[d.altPattern].count++;
    byPattern[d.altPattern].stolenPnl += d.altPnl;
    byPattern[d.altPattern].sdPnl += d.sdPnl;
    if (d.altWon) byPattern[d.altPattern].altWins++;
    if (d.sdWon) byPattern[d.altPattern].sdWins++;
  });
});

console.log('\nPattern'.padEnd(12) + 'Count'.padStart(8) + 'Alt WR%'.padStart(10) + 'SD WR%'.padStart(10) + 'Alt PnL'.padStart(12) + 'SD PnL'.padStart(12) + 'Difference'.padStart(12));
console.log('-'.repeat(76));

Object.entries(byPattern).sort((a, b) => (b[1].stolenPnl - b[1].sdPnl) - (a[1].stolenPnl - a[1].sdPnl)).forEach(([pattern, stats]) => {
  const altWr = ((stats.altWins / stats.count) * 100).toFixed(1);
  const sdWr = ((stats.sdWins / stats.count) * 100).toFixed(1);
  const diff = stats.stolenPnl - stats.sdPnl;
  console.log(
    pattern.padEnd(12) +
    String(stats.count).padStart(8) +
    (altWr + '%').padStart(10) +
    (sdWr + '%').padStart(10) +
    stats.stolenPnl.toFixed(0).padStart(12) +
    stats.sdPnl.toFixed(0).padStart(12) +
    ((diff >= 0 ? '+' : '') + diff.toFixed(0)).padStart(12)
  );
});

// Show worst cases - where SD lost but alt would have won
console.log('\n' + '='.repeat(80));
console.log('WORST CASES: SD Lost but Alternative Would Have Won');
console.log('='.repeat(80));

let worstCases = [];
sessionDetails.forEach(s => {
  s.stolenDetails.forEach(d => {
    if (!d.sdWon && d.altWon) {
      worstCases.push({
        session: s.file,
        pattern: d.altPattern,
        sdPnl: d.sdPnl,
        altPnl: d.altPnl,
        pct: d.pct,
        damage: d.sdPnl - d.altPnl  // How much we lost vs what we could have gained
      });
    }
  });
});

worstCases.sort((a, b) => a.damage - b.damage).slice(0, 20).forEach((w, i) => {
  console.log(
    String(i+1).padStart(3) + '. ' +
    w.session.substring(0, 22).padEnd(24) +
    w.pattern.padEnd(10) +
    'SD: ' + w.sdPnl.toFixed(0).padStart(5) +
    ' vs Alt: +' + w.altPnl.toFixed(0).padStart(4) +
    ' (Damage: ' + w.damage.toFixed(0) + ')' +
    ' PCT: ' + w.pct
  );
});

console.log('\n' + '='.repeat(80));
console.log('FINAL VERDICT');
console.log('='.repeat(80));

const trueSdValue = totalSdPnl - totalStolenPnl;
console.log('\nSD Reported Contribution:  ' + (totalSdPnl >= 0 ? '+' : '') + totalSdPnl.toFixed(0));
console.log('Stolen from other patterns: ' + (totalStolenPnl >= 0 ? '+' : '') + totalStolenPnl.toFixed(0));
console.log('');
console.log('TRUE SD VALUE:             ' + (trueSdValue >= 0 ? '+' : '') + trueSdValue.toFixed(0));

if (trueSdValue < 0) {
  console.log('\n==> SD IS NET NEGATIVE BY ' + Math.abs(trueSdValue).toFixed(0));
  console.log('==> RECOMMENDATION: DISABLE SD');
} else {
  console.log('\n==> SD IS NET POSITIVE BY ' + trueSdValue.toFixed(0));
}

console.log('\n' + '='.repeat(80));
