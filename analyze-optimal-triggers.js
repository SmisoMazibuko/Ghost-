const fs = require('fs');

const s1 = JSON.parse(fs.readFileSync('ghost-evaluator/data/sessions/session_2025-12-24T18-19-24-936Z.json', 'utf8'));
const s2 = JSON.parse(fs.readFileSync('ghost-evaluator/data/sessions/session_2025-12-24T18-57-18-606Z.json', 'utf8'));

console.log('='.repeat(80));
console.log('  OPTIMAL PAUSE TRIGGER ANALYSIS');
console.log('  Testing different trigger configurations');
console.log('='.repeat(80));

const ZZ_XAX_PATTERNS = ['ZZ', 'AntiZZ', '2A2', '3A3', '4A4', '5A5', 'Anti2A2', 'Anti3A3', 'Anti4A4', 'Anti5A5'];

function testConfiguration(data, config, sessionName) {
  const trades = data.trades.sort((a, b) => a.openIndex - b.openIndex);
  const blocks = data.blocks;
  const sameDirTrades = trades.filter(t => t.pattern === 'SameDir');

  let isPaused = false;
  let pauseReason = null;
  let consecutiveLosses = 0;
  let consecutiveHighPct = 0;
  let recentZZXAXPnL = 0;
  let consecutiveImaginaryWins = 0;
  let imaginaryPnL = 0;

  let realPnL = 0;
  let imgPnL = 0;
  let realTrades = 0;
  let imgTrades = 0;
  let pauseCount = 0;
  let resumeCount = 0;

  // Track recent ZZ/XAX trades for takeover detection
  const recentZZXAXTrades = [];

  sameDirTrades.forEach((trade, idx) => {
    const evalBlock = blocks[trade.evalIndex];
    const prevBlock = trade.evalIndex > 0 ? blocks[trade.evalIndex - 1] : null;

    // Update ZZ/XAX context
    const zzXaxBefore = trades.filter(t =>
      ZZ_XAX_PATTERNS.includes(t.pattern) &&
      t.evalIndex < trade.evalIndex &&
      t.evalIndex > trade.evalIndex - 10
    );
    recentZZXAXPnL = zzXaxBefore.reduce((sum, t) => sum + t.pnl, 0);

    // Check for reversal
    const isReversal = prevBlock && evalBlock.dir !== prevBlock.dir;
    const reversalPct = isReversal ? evalBlock.pct : 0;
    const isHighPctReversal = isReversal && reversalPct >= config.highPctThreshold;

    if (!isPaused) {
      let shouldPause = false;
      let reason = '';

      // Trigger 1: High PCT reversal
      if (config.useHighPct && isHighPctReversal && !trade.isWin) {
        shouldPause = true;
        reason = `HIGH_PCT ${reversalPct}%`;
      }

      // Trigger 2: Consecutive losses
      if (config.useConsecLosses && consecutiveLosses >= config.consecLossesThreshold && !trade.isWin) {
        shouldPause = true;
        reason = `${consecutiveLosses + 1} CONSEC LOSSES`;
      }

      // Trigger 3: Consecutive high PCT reversals
      if (config.useConsecHighPct && consecutiveHighPct >= config.consecHighPctThreshold && !trade.isWin) {
        shouldPause = true;
        reason = `${consecutiveHighPct + 1} CONSEC HIGH PCT`;
      }

      // Trigger 4: ZZ/XAX takeover
      if (config.useZZXAXTakeover && recentZZXAXPnL >= config.zzXaxTakeoverThreshold) {
        shouldPause = true;
        reason = `ZZ/XAX TAKEOVER (${recentZZXAXPnL})`;
      }

      if (shouldPause) {
        isPaused = true;
        pauseReason = reason;
        pauseCount++;
        consecutiveImaginaryWins = 0;
        imaginaryPnL = 0;
      }
    }

    // Determine trade type
    let tradeType = isPaused ? 'IMG' : 'REAL';

    // Check resume conditions if paused
    if (isPaused && trade.isWin) {
      consecutiveImaginaryWins++;
      imaginaryPnL += trade.pnl;

      if (config.useConsecWinsResume && consecutiveImaginaryWins >= config.consecWinsResumeThreshold) {
        isPaused = false;
        resumeCount++;
        pauseReason = null;
      } else if (config.useImgProfitResume && imaginaryPnL >= config.imgProfitResumeThreshold) {
        isPaused = false;
        resumeCount++;
        pauseReason = null;
      }
    } else if (isPaused && !trade.isWin) {
      consecutiveImaginaryWins = 0;
      imaginaryPnL += trade.pnl;
    }

    // Track results
    if (tradeType === 'REAL') {
      realTrades++;
      realPnL += trade.pnl;
      if (trade.isWin) {
        consecutiveLosses = 0;
        if (isHighPctReversal) consecutiveHighPct = 0;
      } else {
        consecutiveLosses++;
        if (isHighPctReversal) consecutiveHighPct++;
      }
    } else {
      imgTrades++;
      imgPnL += trade.pnl;
    }
  });

  const actualPnL = sameDirTrades.reduce((sum, t) => sum + t.pnl, 0);
  const improvement = realPnL - actualPnL;

  return {
    actualPnL,
    realPnL,
    imgPnL,
    improvement,
    realTrades,
    imgTrades,
    pauseCount,
    resumeCount,
    sessionName,
  };
}

// Test different configurations
const configs = [
  {
    name: 'BASELINE (No pause)',
    useHighPct: false,
    useConsecLosses: false,
    useConsecHighPct: false,
    useZZXAXTakeover: false,
    useConsecWinsResume: false,
    useImgProfitResume: false,
  },
  {
    name: 'HIGH_PCT ≥70% only',
    useHighPct: true,
    highPctThreshold: 70,
    useConsecLosses: false,
    useConsecHighPct: false,
    useZZXAXTakeover: false,
    useConsecWinsResume: true,
    consecWinsResumeThreshold: 3,
    useImgProfitResume: true,
    imgProfitResumeThreshold: 100,
  },
  {
    name: 'HIGH_PCT ≥80% only',
    useHighPct: true,
    highPctThreshold: 80,
    useConsecLosses: false,
    useConsecHighPct: false,
    useZZXAXTakeover: false,
    useConsecWinsResume: true,
    consecWinsResumeThreshold: 3,
    useImgProfitResume: true,
    imgProfitResumeThreshold: 100,
  },
  {
    name: 'CONSEC_LOSSES ≥2',
    useHighPct: false,
    useConsecLosses: true,
    consecLossesThreshold: 2,
    useConsecHighPct: false,
    useZZXAXTakeover: false,
    useConsecWinsResume: true,
    consecWinsResumeThreshold: 3,
    useImgProfitResume: true,
    imgProfitResumeThreshold: 100,
  },
  {
    name: 'CONSEC_LOSSES ≥3',
    useHighPct: false,
    useConsecLosses: true,
    consecLossesThreshold: 3,
    useConsecHighPct: false,
    useZZXAXTakeover: false,
    useConsecWinsResume: true,
    consecWinsResumeThreshold: 3,
    useImgProfitResume: true,
    imgProfitResumeThreshold: 100,
  },
  {
    name: 'HIGH_PCT ≥70% + CONSEC ≥2',
    useHighPct: true,
    highPctThreshold: 70,
    useConsecLosses: true,
    consecLossesThreshold: 2,
    useConsecHighPct: false,
    useZZXAXTakeover: false,
    useConsecWinsResume: true,
    consecWinsResumeThreshold: 3,
    useImgProfitResume: true,
    imgProfitResumeThreshold: 100,
  },
  {
    name: 'AGGRESSIVE: Any 70%+ OR 2+ losses',
    useHighPct: true,
    highPctThreshold: 70,
    useConsecLosses: true,
    consecLossesThreshold: 1,  // Pause after 2nd loss
    useConsecHighPct: false,
    useZZXAXTakeover: false,
    useConsecWinsResume: true,
    consecWinsResumeThreshold: 2,  // Resume faster
    useImgProfitResume: true,
    imgProfitResumeThreshold: 80,
  },
  {
    name: 'ZZ/XAX TAKEOVER ≥200',
    useHighPct: false,
    useConsecLosses: false,
    useConsecHighPct: false,
    useZZXAXTakeover: true,
    zzXaxTakeoverThreshold: 200,
    useConsecWinsResume: true,
    consecWinsResumeThreshold: 3,
    useImgProfitResume: true,
    imgProfitResumeThreshold: 100,
  },
  {
    name: 'COMBINED: 70%+ OR 2+ losses OR ZZ/XAX ≥200',
    useHighPct: true,
    highPctThreshold: 70,
    useConsecLosses: true,
    consecLossesThreshold: 2,
    useConsecHighPct: false,
    useZZXAXTakeover: true,
    zzXaxTakeoverThreshold: 200,
    useConsecWinsResume: true,
    consecWinsResumeThreshold: 3,
    useImgProfitResume: true,
    imgProfitResumeThreshold: 100,
  },
];

console.log('\n\n--- SESSION 1 RESULTS ---\n');
console.log('Configuration'.padEnd(45) + '| Actual | Simul  | Improve| Pauses | Resumes');
console.log('-'.repeat(85));

const results1 = [];
configs.forEach(config => {
  const result = testConfiguration(s1, config, 'Session 1');
  results1.push({ config: config.name, ...result });
  console.log(
    config.name.padEnd(45) + '| ' +
    String(result.actualPnL).padStart(6) + ' | ' +
    String(result.realPnL).padStart(6) + ' | ' +
    String(result.improvement > 0 ? '+' : '').padStart(0) + String(result.improvement).padStart(6) + ' | ' +
    String(result.pauseCount).padStart(6) + ' | ' +
    String(result.resumeCount).padStart(7)
  );
});

console.log('\n\n--- SESSION 2 RESULTS ---\n');
console.log('Configuration'.padEnd(45) + '| Actual | Simul  | Improve| Pauses | Resumes');
console.log('-'.repeat(85));

const results2 = [];
configs.forEach(config => {
  const result = testConfiguration(s2, config, 'Session 2');
  results2.push({ config: config.name, ...result });
  console.log(
    config.name.padEnd(45) + '| ' +
    String(result.actualPnL).padStart(6) + ' | ' +
    String(result.realPnL).padStart(6) + ' | ' +
    String(result.improvement > 0 ? '+' : '').padStart(0) + String(result.improvement).padStart(6) + ' | ' +
    String(result.pauseCount).padStart(6) + ' | ' +
    String(result.resumeCount).padStart(7)
  );
});

console.log('\n\n--- COMBINED IMPROVEMENT ---\n');
console.log('Configuration'.padEnd(45) + '| S1 Impr | S2 Impr | TOTAL  | Rank');
console.log('-'.repeat(75));

const combined = [];
for (let i = 0; i < configs.length; i++) {
  const total = results1[i].improvement + results2[i].improvement;
  combined.push({
    config: configs[i].name,
    s1: results1[i].improvement,
    s2: results2[i].improvement,
    total,
  });
}

// Sort by total improvement
combined.sort((a, b) => b.total - a.total);

combined.forEach((c, i) => {
  console.log(
    c.config.padEnd(45) + '| ' +
    String(c.s1 > 0 ? '+' : '') + String(c.s1).padStart(6) + ' | ' +
    String(c.s2 > 0 ? '+' : '') + String(c.s2).padStart(6) + ' | ' +
    String(c.total > 0 ? '+' : '') + String(c.total).padStart(5) + ' | ' +
    String(i + 1).padStart(4)
  );
});

console.log('\n\n--- RECOMMENDATION ---\n');
const best = combined[0];
console.log(`Best configuration: "${best.config}"`);
console.log(`  Session 1 improvement: ${best.s1 > 0 ? '+' : ''}${best.s1}`);
console.log(`  Session 2 improvement: ${best.s2 > 0 ? '+' : ''}${best.s2}`);
console.log(`  Total improvement: ${best.total > 0 ? '+' : ''}${best.total}`);

// Check for over-optimization
console.log('\n--- OVER-OPTIMIZATION CHECK ---\n');
const s2Only = combined.filter(c => c.s2 < 0);
if (s2Only.length > 0) {
  console.log('Configurations that HURT Session 2 (over-optimized for S1):');
  s2Only.forEach(c => {
    console.log(`  ${c.config}: S2 = ${c.s2}`);
  });
} else {
  console.log('No configurations hurt Session 2 - all are balanced.');
}

// Find balanced best
const balancedBest = combined.find(c => c.s1 > 0 && c.s2 >= 0);
if (balancedBest && balancedBest !== best) {
  console.log(`\nBalanced recommendation: "${balancedBest.config}"`);
  console.log(`  Improves both sessions without hurting either.`);
}
