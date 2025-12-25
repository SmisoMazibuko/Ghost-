const fs = require('fs');

const s1 = JSON.parse(fs.readFileSync('ghost-evaluator/data/sessions/session_2025-12-24T18-19-24-936Z.json', 'utf8'));
const s2 = JSON.parse(fs.readFileSync('ghost-evaluator/data/sessions/session_2025-12-24T18-57-18-606Z.json', 'utf8'));

console.log('='.repeat(80));
console.log('  ZZ BREAK + CONFIRMATION RESUME');
console.log('  PAUSE: HIGH_PCT or CONSEC_LOSS');
console.log('  RESUME: ZZ broke + (1 imaginary win OR imaginary profit ≥ 0)');
console.log('='.repeat(80));

const ZZ_XAX_PATTERNS = ['ZZ', 'AntiZZ', '2A2', '3A3', '4A4', '5A5', 'Anti2A2', 'Anti3A3', 'Anti4A4', 'Anti5A5'];

function simulate(data, sessionName, config) {
  console.log('\n\n' + '='.repeat(80));
  console.log(`  ${sessionName} - ${config.name}`);
  console.log('='.repeat(80));

  const blocks = data.blocks;
  const trades = data.trades.sort((a, b) => a.openIndex - b.openIndex);
  const zzXaxTrades = trades.filter(t => ZZ_XAX_PATTERNS.includes(t.pattern));
  const sameDirTrades = trades.filter(t => t.pattern === 'SameDir');

  let isPaused = false;
  let consecutiveLosses = 0;
  let consecutiveImaginaryWins = 0;
  let imaginaryPnL = 0;

  let realPnL = 0;
  let imgPnL = 0;

  // Track last ZZ/XAX result
  let lastZZResult = null;

  sameDirTrades.forEach(trade => {
    const evalBlock = blocks[trade.evalIndex];
    const prevBlock = trade.evalIndex > 0 ? blocks[trade.evalIndex - 1] : null;
    const isReversal = prevBlock && evalBlock.dir !== prevBlock.dir;
    const isHighPctReversal = isReversal && evalBlock.pct >= 70;

    // Get last ZZ/XAX result
    const recentZZ = zzXaxTrades.filter(zz => zz.openIndex < trade.openIndex);
    if (recentZZ.length > 0) {
      lastZZResult = recentZZ[recentZZ.length - 1].isWin ? 'WIN' : 'LOSS';
    }

    // PAUSE triggers
    if (!isPaused) {
      let shouldPause = false;
      if (isHighPctReversal && !trade.isWin) shouldPause = true;
      if (consecutiveLosses >= 1 && !trade.isWin) shouldPause = true;

      if (shouldPause) {
        isPaused = true;
        consecutiveImaginaryWins = 0;
        imaginaryPnL = 0;
      }
    }

    let tradeType = isPaused ? 'IMG' : 'REAL';

    // RESUME logic
    if (isPaused) {
      // Track imaginary performance
      if (trade.isWin) {
        consecutiveImaginaryWins++;
        imaginaryPnL += trade.pnl;
      } else {
        consecutiveImaginaryWins = 0;
        imaginaryPnL += trade.pnl;
      }

      // Check resume conditions based on config
      let canResume = false;

      if (config.requireZZBreak && lastZZResult !== 'LOSS') {
        // ZZ hasn't broken yet - can't resume
        canResume = false;
      } else {
        // ZZ broke (or not required) - check confirmation
        if (config.confirmationType === 'wins') {
          canResume = consecutiveImaginaryWins >= config.confirmationThreshold;
        } else if (config.confirmationType === 'profit') {
          canResume = imaginaryPnL >= config.confirmationThreshold;
        } else if (config.confirmationType === 'any') {
          canResume = consecutiveImaginaryWins >= 1 || imaginaryPnL >= 0;
        } else if (config.confirmationType === 'none') {
          canResume = true; // Just ZZ break
        }
      }

      if (canResume) {
        isPaused = false;
        // Current trade is still IMG, next will be REAL
      }
    }

    // Track PnL
    if (tradeType === 'REAL') {
      realPnL += trade.pnl;
      if (trade.isWin) consecutiveLosses = 0;
      else consecutiveLosses++;
    } else {
      imgPnL += trade.pnl;
    }
  });

  const actualPnL = sameDirTrades.reduce((sum, t) => sum + t.pnl, 0);
  const improvement = realPnL - actualPnL;

  return { actualPnL, realPnL, improvement };
}

// Test different configurations
const configs = [
  { name: 'No ZZ req, 2 wins confirm', requireZZBreak: false, confirmationType: 'wins', confirmationThreshold: 2 },
  { name: 'No ZZ req, 80 profit confirm', requireZZBreak: false, confirmationType: 'profit', confirmationThreshold: 80 },
  { name: 'ZZ break only', requireZZBreak: true, confirmationType: 'none' },
  { name: 'ZZ break + 1 win', requireZZBreak: true, confirmationType: 'wins', confirmationThreshold: 1 },
  { name: 'ZZ break + 2 wins', requireZZBreak: true, confirmationType: 'wins', confirmationThreshold: 2 },
  { name: 'ZZ break + profit ≥ 0', requireZZBreak: true, confirmationType: 'profit', confirmationThreshold: 0 },
  { name: 'ZZ break + profit ≥ 80', requireZZBreak: true, confirmationType: 'profit', confirmationThreshold: 80 },
  { name: 'ZZ break + (1 win OR profit ≥ 0)', requireZZBreak: true, confirmationType: 'any' },
];

console.log('\n\n' + '='.repeat(80));
console.log('  RESULTS COMPARISON');
console.log('='.repeat(80));

console.log('\n| Configuration | S1 Imp | S2 Imp | Total | Balanced? |');
console.log('|---------------|--------|--------|-------|-----------|');

const results = [];
configs.forEach(config => {
  const r1 = simulate(s1, 'S1', config);
  const r2 = simulate(s2, 'S2', config);
  const total = r1.improvement + r2.improvement;
  const balanced = r1.improvement >= 0 && r2.improvement >= 0;

  results.push({ ...config, s1: r1.improvement, s2: r2.improvement, total, balanced });

  console.log(
    '| ' + config.name.padEnd(35) + ' | ' +
    String(r1.improvement).padStart(6) + ' | ' +
    String(r2.improvement).padStart(6) + ' | ' +
    String(total).padStart(5) + ' | ' +
    (balanced ? 'YES' : 'NO').padStart(9) + ' |'
  );
});

// Sort by total
results.sort((a, b) => b.total - a.total);

console.log('\n--- RANKED ---\n');
results.forEach((r, i) => {
  console.log(`${i + 1}. ${r.name}: ${r.total} (S1: ${r.s1}, S2: ${r.s2}) ${r.balanced ? '✓ BALANCED' : ''}`);
});

console.log('\n--- KEY INSIGHT ---\n');
const bestBalanced = results.find(r => r.balanced);
const bestOverall = results[0];

console.log(`Best overall: "${bestOverall.name}" = ${bestOverall.total}`);
if (bestBalanced) {
  console.log(`Best balanced: "${bestBalanced.name}" = ${bestBalanced.total}`);
}

console.log('\n--- CONCLUSION ---\n');
console.log('Does requiring ZZ break help?');
const withZZ = results.filter(r => r.requireZZBreak);
const withoutZZ = results.filter(r => !r.requireZZBreak);
const bestWithZZ = withZZ.reduce((a, b) => a.total > b.total ? a : b);
const bestWithoutZZ = withoutZZ.reduce((a, b) => a.total > b.total ? a : b);
console.log(`  Best WITH ZZ break: ${bestWithZZ.name} = ${bestWithZZ.total}`);
console.log(`  Best WITHOUT ZZ break: ${bestWithoutZZ.name} = ${bestWithoutZZ.total}`);
