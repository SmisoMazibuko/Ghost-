const fs = require('fs');

const s1 = JSON.parse(fs.readFileSync('ghost-evaluator/data/sessions/session_2025-12-24T18-19-24-936Z.json', 'utf8'));
const s2 = JSON.parse(fs.readFileSync('ghost-evaluator/data/sessions/session_2025-12-24T18-57-18-606Z.json', 'utf8'));

console.log('='.repeat(80));
console.log('  ZZ/XAX TAKEOVER ANALYSIS - PROPER');
console.log('  Looking at RECENT consecutive ZZ/XAX wins as regime signal');
console.log('='.repeat(80));

const ZZ_XAX_PATTERNS = ['ZZ', 'AntiZZ', '2A2', '3A3', '4A4', '5A5', 'Anti2A2', 'Anti3A3', 'Anti4A4', 'Anti5A5'];

function analyzeZZXAXTakeover(data, sessionName) {
  console.log('\n\n' + '='.repeat(80));
  console.log('  ' + sessionName);
  console.log('='.repeat(80));

  const blocks = data.blocks;
  const trades = data.trades.sort((a, b) => a.openIndex - b.openIndex);

  const zzXaxTrades = trades.filter(t => ZZ_XAX_PATTERNS.includes(t.pattern));
  const sameDirTrades = trades.filter(t => t.pattern === 'SameDir');

  // Timeline of all trades
  console.log('\n--- TRADE TIMELINE (ZZ/XAX and SameDir) ---\n');
  console.log('Block | Pattern     | Result | PnL   | ZZ Consec | SD Context');
  console.log('------|-------------|--------|-------|-----------|------------');

  let consecutiveZZWins = 0;
  let lastZZBlock = -1;

  // Merge and sort
  const relevantTrades = trades.filter(t =>
    t.pattern === 'SameDir' || ZZ_XAX_PATTERNS.includes(t.pattern)
  ).sort((a, b) => a.openIndex - b.openIndex);

  // Track ZZ/XAX consecutive wins and SD performance during takeover
  let inTakeover = false;
  let takeoverStart = -1;
  let sdDuringTakeover = [];
  let sdOutsideTakeover = [];
  let takeoverPeriods = [];

  relevantTrades.forEach(t => {
    const isZZXAX = ZZ_XAX_PATTERNS.includes(t.pattern);
    const isSD = t.pattern === 'SameDir';

    if (isZZXAX) {
      if (t.isWin) {
        consecutiveZZWins++;
      } else {
        // ZZ/XAX broke
        if (inTakeover) {
          takeoverPeriods.push({
            start: takeoverStart,
            end: t.openIndex,
            sdTrades: [...sdDuringTakeover],
          });
          inTakeover = false;
          sdDuringTakeover = [];
        }
        consecutiveZZWins = 0;
      }
      lastZZBlock = t.openIndex;

      // Check if takeover starts (2+ consecutive ZZ wins)
      if (consecutiveZZWins >= 2 && !inTakeover) {
        inTakeover = true;
        takeoverStart = t.openIndex;
      }
    }

    if (isSD) {
      if (inTakeover) {
        sdDuringTakeover.push(t);
      } else {
        sdOutsideTakeover.push(t);
      }
    }

    const result = t.isWin ? 'WIN ' : 'LOSS';
    const pnlStr = (t.pnl >= 0 ? '+' : '') + t.pnl.toFixed(0);
    const zzConsec = isZZXAX ? String(consecutiveZZWins) : '-';
    const sdContext = isSD ? (inTakeover ? 'DURING TAKEOVER' : 'normal') : '';
    const takeoverMark = (isZZXAX && consecutiveZZWins === 2) ? ' << TAKEOVER STARTS' : '';

    console.log(
      String(t.openIndex).padStart(5) + ' | ' +
      t.pattern.padEnd(11) + ' | ' +
      result + '  | ' +
      pnlStr.padStart(5) + ' | ' +
      zzConsec.padStart(9) + ' | ' +
      sdContext + takeoverMark
    );
  });

  // If still in takeover at end
  if (inTakeover && sdDuringTakeover.length > 0) {
    takeoverPeriods.push({
      start: takeoverStart,
      end: relevantTrades[relevantTrades.length - 1].openIndex,
      sdTrades: [...sdDuringTakeover],
    });
  }

  // Analysis
  console.log('\n\n--- TAKEOVER PERIODS (2+ consecutive ZZ/XAX wins) ---\n');

  if (takeoverPeriods.length === 0) {
    console.log('No takeover periods detected.');
  } else {
    takeoverPeriods.forEach((p, i) => {
      const sdPnL = p.sdTrades.reduce((sum, t) => sum + t.pnl, 0);
      const sdWins = p.sdTrades.filter(t => t.isWin).length;
      const sdLosses = p.sdTrades.length - sdWins;

      console.log(`Period ${i + 1}: Blocks ${p.start}-${p.end}`);
      console.log(`  SD trades during: ${p.sdTrades.length} (${sdWins}W / ${sdLosses}L)`);
      console.log(`  SD PnL during: ${sdPnL}`);
      if (sdPnL < 0) {
        console.log(`  >> TAKEOVER CONFIRMED: SD lost ${Math.abs(sdPnL)} during ZZ/XAX dominance`);
      } else {
        console.log(`  >> SD was profitable during this period`);
      }
      console.log('');
    });
  }

  // Summary comparison
  console.log('\n--- SD PERFORMANCE COMPARISON ---\n');

  const sdDuringPnL = takeoverPeriods.reduce((sum, p) =>
    sum + p.sdTrades.reduce((s, t) => s + t.pnl, 0), 0
  );
  const sdDuringCount = takeoverPeriods.reduce((sum, p) => sum + p.sdTrades.length, 0);

  const sdOutsidePnL = sdOutsideTakeover.reduce((sum, t) => sum + t.pnl, 0);
  const sdOutsideCount = sdOutsideTakeover.length;

  console.log(`SD DURING ZZ/XAX takeover:`);
  console.log(`  Trades: ${sdDuringCount}`);
  console.log(`  PnL: ${sdDuringPnL}`);
  console.log(`  Avg per trade: ${sdDuringCount > 0 ? (sdDuringPnL / sdDuringCount).toFixed(1) : 'N/A'}`);

  console.log(`\nSD OUTSIDE ZZ/XAX takeover:`);
  console.log(`  Trades: ${sdOutsideCount}`);
  console.log(`  PnL: ${sdOutsidePnL}`);
  console.log(`  Avg per trade: ${sdOutsideCount > 0 ? (sdOutsidePnL / sdOutsideCount).toFixed(1) : 'N/A'}`);

  console.log(`\nTOTAL SD PnL: ${sdDuringPnL + sdOutsidePnL}`);
  console.log(`If we PAUSED during takeover: ${sdOutsidePnL}`);
  console.log(`Improvement: ${sdOutsidePnL - (sdDuringPnL + sdOutsidePnL)}`);

  return {
    takeoverPeriods,
    sdDuringPnL,
    sdOutsidePnL,
    totalPnL: sdDuringPnL + sdOutsidePnL,
    improvement: -sdDuringPnL, // What we save by pausing
  };
}

const result1 = analyzeZZXAXTakeover(s1, 'SESSION 1');
const result2 = analyzeZZXAXTakeover(s2, 'SESSION 2');

console.log('\n\n' + '='.repeat(80));
console.log('  SUMMARY');
console.log('='.repeat(80));

console.log('\n| Metric | Session 1 | Session 2 |');
console.log('|--------|-----------|-----------|');
console.log(`| Takeover periods | ${result1.takeoverPeriods.length} | ${result2.takeoverPeriods.length} |`);
console.log(`| SD during takeover PnL | ${result1.sdDuringPnL} | ${result2.sdDuringPnL} |`);
console.log(`| SD outside takeover PnL | ${result1.sdOutsidePnL} | ${result2.sdOutsidePnL} |`);
console.log(`| Improvement if paused | ${result1.improvement} | ${result2.improvement} |`);

console.log('\n--- INSIGHT ---\n');
console.log('ZZ/XAX takeover = 2+ consecutive ZZ/XAX wins');
console.log('When ZZ/XAX is winning consecutively, market is alternating.');
console.log('SameDir (continuation) should PAUSE during alternating market.');
console.log('When ZZ/XAX breaks (loses), market returns to trending - SD resumes.');
