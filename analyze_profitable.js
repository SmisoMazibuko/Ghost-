const fs = require('fs');
const path = require('path');

const sessionDir = 'C:/Users/Okhantu/Desktop/The other income/ghost-evaluator/data/sessions/';
const files = fs.readdirSync(sessionDir).filter(f => f.endsWith('.json'));

const profitableSessions = [];

for (const file of files) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(sessionDir, file), 'utf8'));
    const blocks = data.blocks || [];
    
    if (blocks.length === 0) continue;
    
    let pnl = 0;
    for (const block of blocks) {
      pnl += block.dir * block.pct;
    }
    
    if (pnl > 0) {
      profitableSessions.push({ file, blocks, pnl });
    }
  } catch (e) {}
}

profitableSessions.sort((a, b) => b.pnl - a.pnl);

const analysis = {
  totalSessions: profitableSessions.length,
  totalBlocks: 0,
  totalLosses: 0,
  totalWins: 0,
  lossStats: { minPct: Infinity, maxPct: 0, sumPct: 0, count: 0 },
  consecutiveLossPatterns: {},
  maxConsecutiveLosses: 0,
  drawdownInfo: [],
  recoveryTimes: [],
  allLossValues: [],
  sessionDetails: []
};

for (const session of profitableSessions) {
  const { blocks, file, pnl } = session;
  analysis.totalBlocks += blocks.length;
  
  let currentConsecutiveLosses = 0;
  let sessionLosses = [];
  let maxDrawdown = 0;
  let currentDrawdown = 0;
  let lastWinIndex = -1;
  let recoveryTimes = [];
  
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const result = block.dir * block.pct;
    
    if (result < 0) {
      analysis.totalLosses++;
      analysis.lossStats.count++;
      analysis.lossStats.sumPct += block.pct;
      analysis.lossStats.minPct = Math.min(analysis.lossStats.minPct, block.pct);
      analysis.lossStats.maxPct = Math.max(analysis.lossStats.maxPct, block.pct);
      analysis.allLossValues.push(block.pct);
      
      currentConsecutiveLosses++;
      currentDrawdown += result;
      maxDrawdown = Math.min(maxDrawdown, currentDrawdown);
      
      sessionLosses.push({ index: i, pct: block.pct });
    } else {
      analysis.totalWins++;
      
      if (currentConsecutiveLosses > 0) {
        const pattern = currentConsecutiveLosses.toString();
        analysis.consecutiveLossPatterns[pattern] = (analysis.consecutiveLossPatterns[pattern] || 0) + 1;
        analysis.maxConsecutiveLosses = Math.max(analysis.maxConsecutiveLosses, currentConsecutiveLosses);
      }
      
      if (lastWinIndex >= 0) {
        recoveryTimes.push(i - lastWinIndex);
      }
      lastWinIndex = i;
      currentDrawdown = 0;
      currentConsecutiveLosses = 0;
    }
  }
  
  if (currentConsecutiveLosses > 0) {
    const pattern = currentConsecutiveLosses.toString();
    analysis.consecutiveLossPatterns[pattern] = (analysis.consecutiveLossPatterns[pattern] || 0) + 1;
    analysis.maxConsecutiveLosses = Math.max(analysis.maxConsecutiveLosses, currentConsecutiveLosses);
  }
  
  analysis.drawdownInfo.push({ file, maxDrawdown, lossCount: sessionLosses.length, totalBlocks: blocks.length });
  analysis.recoveryTimes.push(...recoveryTimes);
  
  analysis.sessionDetails.push({
    file,
    pnl,
    blocks: blocks.length,
    losses: sessionLosses.length,
    wins: blocks.length - sessionLosses.length,
    maxDrawdown,
    lossRate: ((sessionLosses.length / blocks.length) * 100).toFixed(1)
  });
}

const avgLossPct = (analysis.lossStats.sumPct / analysis.lossStats.count).toFixed(2);
const lossPercentage = ((analysis.totalLosses / analysis.totalBlocks) * 100).toFixed(1);

analysis.allLossValues.sort((a, b) => a - b);
const len = analysis.allLossValues.length;
const q1 = analysis.allLossValues[Math.floor(len * 0.25)];
const median = analysis.allLossValues[Math.floor(len * 0.5)];
const q3 = analysis.allLossValues[Math.floor(len * 0.75)];

console.log('=== PROFITABLE SESSION LOSS BEHAVIOR ANALYSIS ===\n');
console.log('SUMMARY:');
console.log('  Sessions: ' + analysis.totalSessions);
console.log('  Total Blocks: ' + analysis.totalBlocks);
console.log('  Total Losses: ' + analysis.totalLosses + ' (' + lossPercentage + '%)');
console.log('  Total Wins: ' + analysis.totalWins);

console.log('\nLOSS PCT DISTRIBUTION:');
console.log('  Min: ' + analysis.lossStats.minPct);
console.log('  Q1: ' + q1);
console.log('  Median: ' + median);
console.log('  Q3: ' + q3);
console.log('  Max: ' + analysis.lossStats.maxPct);
console.log('  Average: ' + avgLossPct);

console.log('\nCONSECUTIVE LOSS PATTERNS:');
const patterns = Object.entries(analysis.consecutiveLossPatterns).sort((a, b) => b[1] - a[1]).slice(0, 10);
const totalPatterns = Object.values(analysis.consecutiveLossPatterns).reduce((a, b) => a + b, 0);

for (const [pat, count] of patterns) {
  const pct = ((count / totalPatterns) * 100).toFixed(1);
  console.log('  ' + pat + ' loss(es): ' + count + ' (' + pct + '%)');
}

console.log('\nMax consecutive losses: ' + analysis.maxConsecutiveLosses);

if (analysis.recoveryTimes.length > 0) {
  const avg = (analysis.recoveryTimes.reduce((a, b) => a + b, 0) / analysis.recoveryTimes.length).toFixed(2);
  const max = Math.max(...analysis.recoveryTimes);
  const min = Math.min(...analysis.recoveryTimes);
  console.log('\nRECOVERY TIME (blocks to next win):');
  console.log('  Avg: ' + avg);
  console.log('  Min: ' + min);
  console.log('  Max: ' + max);
}

const drawdowns = analysis.drawdownInfo.sort((a, b) => a.maxDrawdown - b.maxDrawdown);
const medIdx = Math.floor(drawdowns.length / 2);
console.log('\nDRAWDOWN (worst loss before recovery):');
console.log('  Worst: ' + drawdowns[0].maxDrawdown);
console.log('  Median: ' + drawdowns[medIdx].maxDrawdown);
console.log('  Best: ' + drawdowns[drawdowns.length - 1].maxDrawdown);

console.log('\nTOP 10 PROFITABLE SESSIONS:');
for (let i = 0; i < Math.min(10, analysis.sessionDetails.length); i++) {
  const s = analysis.sessionDetails[i];
  console.log('  ' + (i+1) + '. ' + s.file + ': PnL=' + s.pnl + ' Blocks=' + s.blocks + ' LossRate=' + s.lossRate + '%');
}

