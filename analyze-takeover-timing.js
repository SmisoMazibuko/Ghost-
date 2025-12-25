const fs = require('fs');

const s1 = JSON.parse(fs.readFileSync('ghost-evaluator/data/sessions/session_2025-12-24T18-19-24-936Z.json', 'utf8'));
const s2 = JSON.parse(fs.readFileSync('ghost-evaluator/data/sessions/session_2025-12-24T18-57-18-606Z.json', 'utf8'));

console.log('='.repeat(80));
console.log('  ZZ/XAX TAKEOVER TIMING ANALYSIS');
console.log('  What happens BEFORE, DURING, and AFTER takeover?');
console.log('='.repeat(80));

const ZZ_XAX_PATTERNS = ['ZZ', 'AntiZZ', '2A2', '3A3', '4A4', '5A5', 'Anti2A2', 'Anti3A3', 'Anti4A4', 'Anti5A5'];

function analyzeTimingAround(data, sessionName) {
  console.log('\n\n' + '='.repeat(80));
  console.log('  ' + sessionName);
  console.log('='.repeat(80));

  const trades = data.trades.sort((a, b) => a.openIndex - b.openIndex);
  const zzXaxTrades = trades.filter(t => ZZ_XAX_PATTERNS.includes(t.pattern));
  const sameDirTrades = trades.filter(t => t.pattern === 'SameDir');

  // Find takeover periods (2+ consecutive ZZ/XAX wins)
  let consecutiveZZWins = 0;
  let takeoverStart = -1;
  let takeoverPeriods = [];

  zzXaxTrades.forEach((t, i) => {
    if (t.isWin) {
      if (consecutiveZZWins === 0) {
        // First win - mark potential start
      }
      consecutiveZZWins++;
      if (consecutiveZZWins === 2) {
        // Takeover starts now (on 2nd consecutive win)
        // But the signal was available after 1st win!
        takeoverStart = zzXaxTrades[i - 1].openIndex; // Start from 1st win
      }
    } else {
      // ZZ/XAX broke
      if (consecutiveZZWins >= 2) {
        takeoverPeriods.push({
          start: takeoverStart,
          end: t.openIndex,
          firstWinBlock: takeoverStart,
          breakBlock: t.openIndex,
          consecutiveWins: consecutiveZZWins,
        });
      }
      consecutiveZZWins = 0;
      takeoverStart = -1;
    }
  });

  console.log(`\nFound ${takeoverPeriods.length} takeover periods\n`);

  takeoverPeriods.forEach((period, i) => {
    console.log('='.repeat(60));
    console.log(`TAKEOVER PERIOD ${i + 1}`);
    console.log(`ZZ/XAX consecutive wins: ${period.consecutiveWins}`);
    console.log(`Started at block: ${period.start} (1st ZZ win)`);
    console.log(`Ended at block: ${period.end} (ZZ broke)`);
    console.log('='.repeat(60));

    // What SD trades happened BEFORE this takeover?
    const sdBefore = sameDirTrades.filter(t =>
      t.openIndex < period.start && t.openIndex >= period.start - 20
    );

    console.log('\n--- SD TRADES BEFORE TAKEOVER (last 20 blocks) ---');
    if (sdBefore.length === 0) {
      console.log('No SD trades in 20 blocks before takeover');
    } else {
      let runningPnL = 0;
      sdBefore.forEach(t => {
        runningPnL += t.pnl;
        const result = t.isWin ? 'WIN ' : 'LOSS';
        console.log(`  Block ${t.openIndex}: ${result} ${t.pnl} (running: ${runningPnL})`);
      });
      console.log(`  Total: ${runningPnL}`);
    }

    // What SD trades happened DURING takeover?
    const sdDuring = sameDirTrades.filter(t =>
      t.openIndex >= period.start && t.openIndex <= period.end
    );

    console.log('\n--- SD TRADES DURING TAKEOVER ---');
    if (sdDuring.length === 0) {
      console.log('No SD trades during takeover (SD was deactivated or paused)');
    } else {
      sdDuring.forEach(t => {
        const result = t.isWin ? 'WIN ' : 'LOSS';
        console.log(`  Block ${t.openIndex}: ${result} ${t.pnl}`);
      });
    }

    // What SD trades happened AFTER takeover (when ZZ broke)?
    const sdAfter = sameDirTrades.filter(t =>
      t.openIndex > period.end && t.openIndex <= period.end + 20
    );

    console.log('\n--- SD TRADES AFTER TAKEOVER (next 20 blocks) ---');
    if (sdAfter.length === 0) {
      console.log('No SD trades in 20 blocks after takeover ended');
      console.log('>> SD missed opportunity after ZZ/XAX broke!');
    } else {
      let runningPnL = 0;
      sdAfter.forEach(t => {
        runningPnL += t.pnl;
        const result = t.isWin ? 'WIN ' : 'LOSS';
        console.log(`  Block ${t.openIndex}: ${result} ${t.pnl} (running: ${runningPnL})`);
      });
      console.log(`  Total: ${runningPnL}`);
      if (runningPnL > 0) {
        console.log(`  >> SD was profitable after ZZ/XAX broke!`);
      }
    }

    // The early warning: What if we paused SD when 1st ZZ win happened?
    console.log('\n--- EARLY WARNING SIGNAL ---');
    const firstZZWin = period.start;

    // SD trades between first ZZ win and ZZ break
    const sdAfterFirstWin = sameDirTrades.filter(t =>
      t.openIndex >= firstZZWin && t.openIndex <= period.end
    );

    if (sdAfterFirstWin.length > 0) {
      const couldHaveAvoided = sdAfterFirstWin.filter(t => !t.isWin).reduce((sum, t) => sum + t.pnl, 0);
      console.log(`If we paused SD after 1st ZZ win (block ${firstZZWin}):`);
      console.log(`  Would have avoided: ${sdAfterFirstWin.length} trades`);
      console.log(`  Losses avoided: ${couldHaveAvoided}`);
    } else {
      console.log(`No SD trades after 1st ZZ win - SD was already inactive`);
    }

    console.log('');
  });

  // Key insight: Look at the gap after SD losses
  console.log('\n\n' + '='.repeat(60));
  console.log('  THE REAL TRAP: SD LOSSES → ZZ TAKEOVER → SD MISSES RECOVERY');
  console.log('='.repeat(60));

  // Find sequences where SD had losses, then ZZ took over, then ZZ broke
  let trapSequences = [];

  takeoverPeriods.forEach((period, i) => {
    // SD trades before this takeover
    const sdBefore = sameDirTrades.filter(t => t.openIndex < period.start);
    const lastFewSD = sdBefore.slice(-5);

    // Count consecutive losses before takeover
    let consecLosses = 0;
    for (let j = lastFewSD.length - 1; j >= 0; j--) {
      if (!lastFewSD[j].isWin) consecLosses++;
      else break;
    }

    // SD trades after takeover
    const sdAfter = sameDirTrades.filter(t => t.openIndex > period.end);
    const firstFewSD = sdAfter.slice(0, 5);
    const afterPnL = firstFewSD.reduce((sum, t) => sum + t.pnl, 0);

    if (consecLosses >= 2) {
      trapSequences.push({
        period: i + 1,
        consecLossesBefore: consecLosses,
        afterPnL,
        afterTrades: firstFewSD.length,
      });
    }
  });

  if (trapSequences.length > 0) {
    console.log('\nTrap sequences found:');
    trapSequences.forEach(seq => {
      console.log(`\nPeriod ${seq.period}:`);
      console.log(`  ${seq.consecLossesBefore} consecutive SD losses BEFORE takeover`);
      console.log(`  SD likely deactivated due to losses`);
      console.log(`  After ZZ broke: ${seq.afterTrades} trades, PnL = ${seq.afterPnL}`);
      if (seq.afterPnL > 0) {
        console.log(`  >> TRAP CONFIRMED: SD missed profitable period after ZZ broke`);
      }
    });
  } else {
    console.log('\nNo classic trap sequences found');
  }
}

analyzeTimingAround(s1, 'SESSION 1');
analyzeTimingAround(s2, 'SESSION 2');
