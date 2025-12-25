const fs = require('fs');

const s1 = JSON.parse(fs.readFileSync('ghost-evaluator/data/sessions/session_2025-12-24T18-19-24-936Z.json', 'utf8'));
const s2 = JSON.parse(fs.readFileSync('ghost-evaluator/data/sessions/session_2025-12-24T18-57-18-606Z.json', 'utf8'));

console.log('='.repeat(80));
console.log('  COMBINED TRIGGERS ANALYSIS');
console.log('  Testing: ZZ/XAX + HIGH_PCT + CONSECUTIVE LOSSES');
console.log('='.repeat(80));

const ZZ_XAX_PATTERNS = ['ZZ', 'AntiZZ', '2A2', '3A3', '4A4', '5A5', 'Anti2A2', 'Anti3A3', 'Anti4A4', 'Anti5A5'];

function testConfig(data, sessionName, config) {
  const blocks = data.blocks;
  const trades = data.trades.sort((a, b) => a.openIndex - b.openIndex);
  const zzXaxTrades = trades.filter(t => ZZ_XAX_PATTERNS.includes(t.pattern));
  const sameDirTrades = trades.filter(t => t.pattern === 'SameDir');

  let isPaused = false;
  let pauseReason = null;
  let consecutiveLosses = 0;
  let consecutiveImaginaryWins = 0;
  let imaginaryPnL = 0;

  let realPnL = 0;
  let imgPnL = 0;

  sameDirTrades.forEach(trade => {
    const evalBlock = blocks[trade.evalIndex];
    const prevBlock = trade.evalIndex > 0 ? blocks[trade.evalIndex - 1] : null;
    const isReversal = prevBlock && evalBlock.dir !== prevBlock.dir;
    const isHighPctReversal = isReversal && evalBlock.pct >= config.highPctThreshold;

    // Get recent ZZ/XAX state
    const recentZZ = zzXaxTrades.filter(zz => zz.openIndex < trade.openIndex).pop();
    const lastZZWasWin = recentZZ ? recentZZ.isWin : false;

    // Count consecutive ZZ wins
    let zzConsecWins = 0;
    for (let i = zzXaxTrades.length - 1; i >= 0; i--) {
      if (zzXaxTrades[i].openIndex >= trade.openIndex) continue;
      if (zzXaxTrades[i].isWin) zzConsecWins++;
      else break;
    }

    let shouldPause = false;
    let reason = '';

    if (!isPaused) {
      // Trigger 1: HIGH_PCT reversal
      if (config.useHighPct && isHighPctReversal && !trade.isWin) {
        shouldPause = true;
        reason = 'HIGH_PCT';
      }

      // Trigger 2: Consecutive losses
      if (config.useConsecLoss && consecutiveLosses >= config.consecLossThreshold && !trade.isWin) {
        shouldPause = true;
        reason = reason ? reason + '+CONSEC_LOSS' : 'CONSEC_LOSS';
      }

      // Trigger 3: ZZ/XAX takeover (consecutive wins)
      if (config.useZZTakeover && zzConsecWins >= config.zzConsecWinsThreshold) {
        shouldPause = true;
        reason = reason ? reason + '+ZZ_TAKEOVER' : 'ZZ_TAKEOVER';
      }

      if (shouldPause) {
        isPaused = true;
        pauseReason = reason;
        consecutiveImaginaryWins = 0;
        imaginaryPnL = 0;
      }
    }

    // Determine trade type
    let tradeType = isPaused ? 'IMG' : 'REAL';

    // Resume logic
    if (isPaused) {
      // Resume trigger 1: ZZ/XAX broke
      if (config.useZZBreakResume && recentZZ && !recentZZ.isWin) {
        isPaused = false;
        tradeType = 'REAL'; // This trade is real because ZZ just broke
      }

      // Resume trigger 2: Consecutive imaginary wins
      if (isPaused && trade.isWin) {
        consecutiveImaginaryWins++;
        imaginaryPnL += trade.pnl;

        if (config.useImgWinsResume && consecutiveImaginaryWins >= config.imgWinsThreshold) {
          isPaused = false;
        }
        if (config.useImgProfitResume && imaginaryPnL >= config.imgProfitThreshold) {
          isPaused = false;
        }
      } else if (isPaused && !trade.isWin) {
        consecutiveImaginaryWins = 0;
        imaginaryPnL += trade.pnl;
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
  return { actualPnL, realPnL, improvement: realPnL - actualPnL };
}

// Test different configurations
const configs = [
  {
    name: 'BASELINE',
    useHighPct: false, useConsecLoss: false, useZZTakeover: false,
    useZZBreakResume: false, useImgWinsResume: false, useImgProfitResume: false,
  },
  {
    name: 'HIGH_PCT only',
    useHighPct: true, highPctThreshold: 70,
    useConsecLoss: false, useZZTakeover: false,
    useZZBreakResume: false,
    useImgWinsResume: true, imgWinsThreshold: 2,
    useImgProfitResume: true, imgProfitThreshold: 80,
  },
  {
    name: 'CONSEC_LOSS only',
    useHighPct: false,
    useConsecLoss: true, consecLossThreshold: 1,
    useZZTakeover: false,
    useZZBreakResume: false,
    useImgWinsResume: true, imgWinsThreshold: 2,
    useImgProfitResume: true, imgProfitThreshold: 80,
  },
  {
    name: 'ZZ_TAKEOVER only (2+ wins)',
    useHighPct: false, useConsecLoss: false,
    useZZTakeover: true, zzConsecWinsThreshold: 2,
    useZZBreakResume: true,
    useImgWinsResume: false, useImgProfitResume: false,
  },
  {
    name: 'ZZ_TAKEOVER only (1+ wins)',
    useHighPct: false, useConsecLoss: false,
    useZZTakeover: true, zzConsecWinsThreshold: 1,
    useZZBreakResume: true,
    useImgWinsResume: false, useImgProfitResume: false,
  },
  {
    name: 'HIGH_PCT + ZZ_BREAK_RESUME',
    useHighPct: true, highPctThreshold: 70,
    useConsecLoss: false, useZZTakeover: false,
    useZZBreakResume: true,
    useImgWinsResume: true, imgWinsThreshold: 2,
    useImgProfitResume: true, imgProfitThreshold: 80,
  },
  {
    name: 'CONSEC_LOSS + ZZ_BREAK_RESUME',
    useHighPct: false,
    useConsecLoss: true, consecLossThreshold: 1,
    useZZTakeover: false,
    useZZBreakResume: true,
    useImgWinsResume: true, imgWinsThreshold: 2,
    useImgProfitResume: true, imgProfitThreshold: 80,
  },
  {
    name: 'HIGH_PCT + CONSEC + ZZ_BREAK',
    useHighPct: true, highPctThreshold: 70,
    useConsecLoss: true, consecLossThreshold: 1,
    useZZTakeover: false,
    useZZBreakResume: true,
    useImgWinsResume: true, imgWinsThreshold: 2,
    useImgProfitResume: true, imgProfitThreshold: 80,
  },
  {
    name: 'ALL: HIGH_PCT + CONSEC + ZZ_TAKEOVER + ZZ_BREAK',
    useHighPct: true, highPctThreshold: 70,
    useConsecLoss: true, consecLossThreshold: 1,
    useZZTakeover: true, zzConsecWinsThreshold: 2,
    useZZBreakResume: true,
    useImgWinsResume: true, imgWinsThreshold: 2,
    useImgProfitResume: true, imgProfitThreshold: 80,
  },
];

console.log('\n--- RESULTS ---\n');
console.log('Configuration'.padEnd(50) + '| S1 Imp | S2 Imp | Total');
console.log('-'.repeat(80));

const results = [];
configs.forEach(config => {
  const r1 = testConfig(s1, 'S1', config);
  const r2 = testConfig(s2, 'S2', config);
  const total = r1.improvement + r2.improvement;

  results.push({ name: config.name, s1: r1.improvement, s2: r2.improvement, total });

  console.log(
    config.name.padEnd(50) + '| ' +
    String(r1.improvement).padStart(6) + ' | ' +
    String(r2.improvement).padStart(6) + ' | ' +
    String(total).padStart(5)
  );
});

// Sort by total
results.sort((a, b) => b.total - a.total);

console.log('\n--- RANKED BY TOTAL IMPROVEMENT ---\n');
results.forEach((r, i) => {
  const balanced = r.s1 >= 0 && r.s2 >= 0 ? 'BALANCED' : '';
  console.log(`${i + 1}. ${r.name}: ${r.total} (S1: ${r.s1}, S2: ${r.s2}) ${balanced}`);
});

console.log('\n--- KEY INSIGHT ---\n');
const best = results[0];
const bestBalanced = results.find(r => r.s1 >= 0 && r.s2 >= 0);

console.log(`Best overall: "${best.name}" with ${best.total} total`);
if (bestBalanced && bestBalanced !== best) {
  console.log(`Best balanced: "${bestBalanced.name}" with ${bestBalanced.total} total`);
}
