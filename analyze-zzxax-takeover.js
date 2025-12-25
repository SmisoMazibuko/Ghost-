const fs = require('fs');

const s1 = JSON.parse(fs.readFileSync('ghost-evaluator/data/sessions/session_2025-12-24T18-19-24-936Z.json', 'utf8'));
const s2 = JSON.parse(fs.readFileSync('ghost-evaluator/data/sessions/session_2025-12-24T18-57-18-606Z.json', 'utf8'));

console.log('='.repeat(80));
console.log('  ZZ/XAX TAKEOVER PATTERN ANALYSIS');
console.log('  The Trap: SD profit → ZZ/XAX profit → SD loss → ZZ/XAX break → SD miss');
console.log('='.repeat(80));

const ZZ_XAX_PATTERNS = ['ZZ', 'AntiZZ', '2A2', '3A3', '4A4', '5A5', 'Anti2A2', 'Anti3A3', 'Anti4A4', 'Anti5A5'];

function analyzeZZXAXTakeover(data, sessionName) {
  console.log('\n\n' + '='.repeat(80));
  console.log('  ' + sessionName);
  console.log('='.repeat(80));

  const trades = data.trades.sort((a, b) => a.openIndex - b.openIndex);

  // Group trades by pattern type
  const sameDirTrades = trades.filter(t => t.pattern === 'SameDir');
  const zzXaxTrades = trades.filter(t => ZZ_XAX_PATTERNS.includes(t.pattern));

  console.log('\n--- TRADE TIMELINE ---\n');
  console.log('Block | Pattern     | Result | PnL    | Running SD | Running ZZ/XAX');
  console.log('------|-------------|--------|--------|------------|---------------');

  let runningSD = 0;
  let runningZZXAX = 0;
  let sdIdx = 0;
  let zzIdx = 0;

  // Merge and sort all trades
  const allTrades = [...trades].sort((a, b) => a.openIndex - b.openIndex);

  allTrades.forEach(t => {
    const isSD = t.pattern === 'SameDir';
    const isZZXAX = ZZ_XAX_PATTERNS.includes(t.pattern);

    if (isSD) {
      runningSD += t.pnl;
    } else if (isZZXAX) {
      runningZZXAX += t.pnl;
    }

    const result = t.isWin ? 'WIN ' : 'LOSS';
    const pnlStr = (t.pnl >= 0 ? '+' : '') + t.pnl.toFixed(0);
    const type = isSD ? 'SD' : (isZZXAX ? 'ZZ/XAX' : 'OTHER');

    if (isSD || isZZXAX) {
      console.log(
        String(t.openIndex).padStart(5) + ' | ' +
        t.pattern.padEnd(11) + ' | ' +
        result + '  | ' +
        pnlStr.padStart(6) + ' | ' +
        String(runningSD).padStart(10) + ' | ' +
        String(runningZZXAX).padStart(14)
      );
    }
  });

  // Find periods where ZZ/XAX was profitable while SD was not
  console.log('\n\n--- PHASE ANALYSIS ---\n');

  // Identify runs of consecutive pattern types
  let phases = [];
  let currentPhase = null;

  allTrades.forEach(t => {
    const isSD = t.pattern === 'SameDir';
    const isZZXAX = ZZ_XAX_PATTERNS.includes(t.pattern);
    const type = isSD ? 'SameDir' : (isZZXAX ? 'ZZ/XAX' : 'Other');

    if (!currentPhase || currentPhase.type !== type) {
      if (currentPhase) {
        phases.push(currentPhase);
      }
      currentPhase = {
        type,
        trades: [],
        pnl: 0,
        wins: 0,
        losses: 0,
        startBlock: t.openIndex,
        endBlock: t.openIndex,
      };
    }

    currentPhase.trades.push(t);
    currentPhase.pnl += t.pnl;
    if (t.isWin) currentPhase.wins++;
    else currentPhase.losses++;
    currentPhase.endBlock = t.openIndex;
  });
  if (currentPhase) phases.push(currentPhase);

  console.log('Phases:');
  phases.forEach((p, i) => {
    const status = p.pnl > 0 ? '✓ PROFIT' : '✗ LOSS';
    console.log(
      `${i + 1}. ${p.type.padEnd(8)} | Blocks ${p.startBlock}-${p.endBlock} | ` +
      `${p.wins}W/${p.losses}L | PnL: ${p.pnl.toFixed(0)} | ${status}`
    );
  });

  // Find the trap pattern: SD(+) → ZZ/XAX(+) → SD(-)
  console.log('\n\n--- TRAP PATTERN DETECTION ---\n');
  console.log('Looking for: SameDir(profit) → ZZ/XAX(profit) → SameDir(loss)\n');

  let trapCount = 0;
  let trapLoss = 0;
  for (let i = 0; i < phases.length - 2; i++) {
    const p1 = phases[i];
    const p2 = phases[i + 1];
    const p3 = phases[i + 2];

    // Check for SD → ZZ/XAX → SD sequence
    if (p1.type === 'SameDir' && p2.type === 'ZZ/XAX' && p3.type === 'SameDir') {
      trapCount++;
      console.log(`SEQUENCE ${trapCount}:`);
      console.log(`  1. SameDir (${p1.startBlock}-${p1.endBlock}): ${p1.pnl.toFixed(0)} ${p1.pnl > 0 ? '✓' : '✗'}`);
      console.log(`  2. ZZ/XAX  (${p2.startBlock}-${p2.endBlock}): ${p2.pnl.toFixed(0)} ${p2.pnl > 0 ? '✓' : '✗'}`);
      console.log(`  3. SameDir (${p3.startBlock}-${p3.endBlock}): ${p3.pnl.toFixed(0)} ${p3.pnl > 0 ? '✓' : '✗'}`);

      // Classify the trap
      if (p1.pnl > 0 && p2.pnl > 0 && p3.pnl < 0) {
        console.log(`  >> CLASSIC TRAP: SD profit → ZZ/XAX takes over → SD loses on return`);
        trapLoss += p3.pnl;
      } else if (p2.pnl > 0 && p3.pnl < 0) {
        console.log(`  >> PARTIAL TRAP: ZZ/XAX profitable → SD loses on return`);
        trapLoss += p3.pnl;
      } else if (p1.pnl < 0 && p2.pnl > 0 && p3.pnl < 0) {
        console.log(`  >> DOUBLE TRAP: SD losing, ZZ/XAX takes over, SD loses again`);
        trapLoss += p1.pnl + p3.pnl;
      } else {
        console.log(`  >> Pattern variant (not classic trap)`);
      }
      console.log('');
    }
  }

  if (trapCount === 0) {
    console.log('No SD → ZZ/XAX → SD sequences found.');
  } else {
    console.log(`\nTotal trap sequences: ${trapCount}`);
    console.log(`Total trap loss: ${trapLoss.toFixed(0)}`);
  }

  // Analyze what happens when ZZ/XAX breaks
  console.log('\n\n--- ZZ/XAX BREAK ANALYSIS ---\n');
  console.log('What happens to SameDir when ZZ/XAX breaks?\n');

  // Find ZZ/XAX losses (breaks)
  const zzXaxLosses = zzXaxTrades.filter(t => !t.isWin);
  zzXaxLosses.forEach(t => {
    // Find the next SameDir trade after this break
    const nextSD = sameDirTrades.find(sd => sd.openIndex > t.openIndex);
    if (nextSD) {
      const gap = nextSD.openIndex - t.openIndex;
      const sdResult = nextSD.isWin ? 'WIN' : 'LOSS';
      console.log(
        `${t.pattern} broke at block ${t.openIndex} → ` +
        `Next SD at block ${nextSD.openIndex} (gap: ${gap}) → ${sdResult} ${nextSD.pnl.toFixed(0)}`
      );
    } else {
      console.log(`${t.pattern} broke at block ${t.openIndex} → No more SD trades after`);
    }
  });

  // Calculate correlation
  console.log('\n\n--- CORRELATION ANALYSIS ---\n');

  // When ZZ/XAX is profitable, how does SD perform?
  let sdDuringZZXAXProfit = [];
  let sdDuringZZXAXLoss = [];

  phases.forEach((p, i) => {
    if (p.type === 'ZZ/XAX') {
      // Look at the next SD phase
      const nextSD = phases[i + 1];
      if (nextSD && nextSD.type === 'SameDir') {
        if (p.pnl > 0) {
          sdDuringZZXAXProfit.push(nextSD.pnl);
        } else {
          sdDuringZZXAXLoss.push(nextSD.pnl);
        }
      }
    }
  });

  console.log('SD performance AFTER profitable ZZ/XAX phases:');
  if (sdDuringZZXAXProfit.length > 0) {
    const avg = sdDuringZZXAXProfit.reduce((a, b) => a + b, 0) / sdDuringZZXAXProfit.length;
    console.log(`  Count: ${sdDuringZZXAXProfit.length}`);
    console.log(`  Average PnL: ${avg.toFixed(0)}`);
    console.log(`  Values: [${sdDuringZZXAXProfit.map(v => v.toFixed(0)).join(', ')}]`);
  } else {
    console.log('  No data');
  }

  console.log('\nSD performance AFTER losing ZZ/XAX phases:');
  if (sdDuringZZXAXLoss.length > 0) {
    const avg = sdDuringZZXAXLoss.reduce((a, b) => a + b, 0) / sdDuringZZXAXLoss.length;
    console.log(`  Count: ${sdDuringZZXAXLoss.length}`);
    console.log(`  Average PnL: ${avg.toFixed(0)}`);
    console.log(`  Values: [${sdDuringZZXAXLoss.map(v => v.toFixed(0)).join(', ')}]`);
  } else {
    console.log('  No data');
  }

  return {
    trapCount,
    trapLoss,
    phases,
  };
}

const result1 = analyzeZZXAXTakeover(s1, 'SESSION 1 (18:19)');
const result2 = analyzeZZXAXTakeover(s2, 'SESSION 2 (18:57)');

console.log('\n\n' + '='.repeat(80));
console.log('  KEY INSIGHT');
console.log('='.repeat(80));

console.log('\nThe "Fake Activation" pattern:');
console.log('1. SameDir activates → profitable');
console.log('2. ZZ/XAX becomes profitable (takes over)');
console.log('3. During ZZ/XAX dominance, SameDir loses (fake bets or deactivates)');
console.log('4. ZZ/XAX breaks');
console.log('5. SameDir would be profitable NOW but it just deactivated!');
console.log('6. SameDir reactivates → but ZZ/XAX may take over again...\n');

console.log('Solution: PAUSE SameDir when ZZ/XAX is dominant, RESUME when ZZ/XAX breaks');
