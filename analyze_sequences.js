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

console.log('=== LOSS SEQUENCE DEPTH AND RECOVERY ANALYSIS ===\n');

let recoveryAnalysis = {
  recoveryWithinBlocks: [0, 0, 0, 0, 0],
  recoverySteps: {},
  drawdownRecoveries: [],
  failedRecoveries: []
};

for (const session of profitableSessions.slice(0, 5)) {
  const { blocks, file } = session;
  
  console.log('\n--- ' + file + ' (Top Profitable) ---');
  
  let drawdownEvents = [];
  let currentDD = 0;
  let ddStart = -1;
  
  for (let i = 0; i < blocks.length; i++) {
    const result = blocks[i].dir * blocks[i].pct;
    
    if (result < 0) {
      if (currentDD === 0) ddStart = i;
      currentDD += result;
    } else {
      if (currentDD < 0) {
        let recovered = false;
        let stepsToRecover = 0;
        
        for (let j = i; j < blocks.length; j++) {
          stepsToRecover++;
          currentDD += blocks[j].dir * blocks[j].pct;
          
          if (currentDD >= 0) {
            recovered = true;
            drawdownEvents.push({
              startIdx: ddStart,
              endIdx: j,
              depth: currentDD - (blocks[j].dir * blocks[j].pct),
              recoverySteps: stepsToRecover,
              recovered: true
            });
            break;
          }
        }
        
        if (!recovered) {
          drawdownEvents.push({
            startIdx: ddStart,
            endIdx: blocks.length - 1,
            depth: currentDD,
            recoverySteps: -1,
            recovered: false
          });
        }
      }
      currentDD = 0;
    }
  }
  
  console.log('  Drawdown events: ' + drawdownEvents.length);
  const avgDepth = drawdownEvents.length > 0 
    ? (drawdownEvents.reduce((s, d) => s + d.depth, 0) / drawdownEvents.length).toFixed(1)
    : 0;
  console.log('  Avg drawdown depth: ' + avgDepth);
  
  const recoveries = drawdownEvents.filter(d => d.recovered);
  if (recoveries.length > 0) {
    const avgSteps = (recoveries.reduce((s, d) => s + d.recoverySteps, 0) / recoveries.length).toFixed(2);
    const maxSteps = Math.max(...recoveries.map(d => d.recoverySteps));
    console.log('  Recovery: Avg=' + avgSteps + ' blocks, Max=' + maxSteps);
  }
  
  // Find longest unbroken loss sequence and then recovery
  let longestLossSeq = 0;
  let currentSeq = 0;
  
  for (let i = 0; i < blocks.length; i++) {
    const result = blocks[i].dir * blocks[i].pct;
    if (result < 0) {
      currentSeq++;
      longestLossSeq = Math.max(longestLossSeq, currentSeq);
    } else {
      currentSeq = 0;
    }
  }
  
  console.log('  Longest unbroken loss sequence: ' + longestLossSeq);
}

console.log('\n=== OPPOSITE PATTERN FAILURE ANALYSIS ===\n');

let oppositeAnalysis = {
  highPctOppositePairs: 0,
  midPctOppositePairs: 0,
  lowPctOppositePairs: 0,
  consecutiveHighPctOpposites: 0
};

for (const session of profitableSessions) {
  const { blocks } = session;
  
  for (let i = 0; i < blocks.length - 1; i++) {
    const curr = blocks[i];
    const next = blocks[i + 1];
    
    if (curr.dir !== next.dir) {
      if (curr.pct > 70 && next.pct > 70) {
        oppositeAnalysis.highPctOppositePairs++;
      } else if (curr.pct > 40 && next.pct > 40) {
        oppositeAnalysis.midPctOppositePairs++;
      } else {
        oppositeAnalysis.lowPctOppositePairs++;
      }
    }
  }
}

console.log('Opposite direction patterns (within profitable sessions):');
console.log('  High PCT (>70 both): ' + oppositeAnalysis.highPctOppositePairs);
console.log('  Mid PCT (>40 both): ' + oppositeAnalysis.midPctOppositePairs);
console.log('  Low PCT (<=40): ' + oppositeAnalysis.lowPctOppositePairs);

const totalOpposites = oppositeAnalysis.highPctOppositePairs + oppositeAnalysis.midPctOppositePairs + oppositeAnalysis.lowPctOppositePairs;
console.log('  Total opposite pairs: ' + totalOpposites);
console.log('  High PCT as percent: ' + ((oppositeAnalysis.highPctOppositePairs / totalOpposites) * 100).toFixed(1) + '%');

