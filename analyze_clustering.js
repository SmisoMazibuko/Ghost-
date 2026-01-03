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

console.log('=== LOSS CLUSTERING AND PATTERN ANALYSIS ===\n');

let clusterAnalysis = {
  totalClusters: 0,
  clusterSizes: {},
  spreadMetrics: [],
  oppositePatternFailures: 0,
  totalConsecutiveRuns: 0,
  consecutiveRunLengths: []
};

for (const session of profitableSessions.slice(0, 10)) {
  const { blocks, file } = session;
  
  console.log('\n--- ' + file + ' ---');
  
  let lossClusters = [];
  let currentCluster = [];
  
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const result = block.dir * block.pct;
    
    if (result < 0) {
      currentCluster.push(i);
    } else {
      if (currentCluster.length > 0) {
        lossClusters.push(currentCluster);
        currentCluster = [];
      }
    }
  }
  if (currentCluster.length > 0) {
    lossClusters.push(currentCluster);
  }
  
  console.log('  Loss clusters: ' + lossClusters.length);
  
  let clusterSpacing = [];
  for (let i = 1; i < lossClusters.length; i++) {
    const spacingFromEnd = lossClusters[i][0] - lossClusters[i-1][lossClusters[i-1].length - 1];
    clusterSpacing.push(spacingFromEnd);
  }
  
  if (clusterSpacing.length > 0) {
    const avgSpacing = (clusterSpacing.reduce((a, b) => a + b, 0) / clusterSpacing.length).toFixed(2);
    const minSpacing = Math.min(...clusterSpacing);
    const maxSpacing = Math.max(...clusterSpacing);
    console.log('  Spacing between clusters: Avg=' + avgSpacing + ' Min=' + minSpacing + ' Max=' + maxSpacing);
  }
  
  const clusterSizeFreq = {};
  for (const cluster of lossClusters) {
    const size = cluster.length;
    clusterSizeFreq[size] = (clusterSizeFreq[size] || 0) + 1;
  }
  
  console.log('  Cluster sizes: ' + Object.entries(clusterSizeFreq).map(([k, v]) => k + '=' + v).join(' '));
  
  // Check opposite pattern failures
  let oppositeFailures = 0;
  for (let i = 0; i < blocks.length - 1; i++) {
    const current = blocks[i];
    const next = blocks[i + 1];
    
    if (current.dir === 1 && next.dir === -1 && current.pct > 50 && next.pct > 50) {
      oppositeFailures++;
    }
    if (current.dir === -1 && next.dir === 1 && current.pct > 50 && next.pct > 50) {
      oppositeFailures++;
    }
  }
  
  if (oppositeFailures > 0) {
    console.log('  High-PCT opposite patterns: ' + oppositeFailures);
  }
}

console.log('\n=== AGGREGATE CLUSTERING STATISTICS ===');

let totalClusters = 0;
let totalSpacing = 0;
let spacingCount = 0;

for (const session of profitableSessions) {
  const { blocks } = session;
  
  let lossClusters = [];
  let currentCluster = [];
  
  for (let i = 0; i < blocks.length; i++) {
    const result = blocks[i].dir * blocks[i].pct;
    if (result < 0) {
      currentCluster.push(i);
    } else {
      if (currentCluster.length > 0) {
        lossClusters.push(currentCluster);
        currentCluster = [];
      }
    }
  }
  if (currentCluster.length > 0) {
    lossClusters.push(currentCluster);
  }
  
  totalClusters += lossClusters.length;
  
  for (let i = 1; i < lossClusters.length; i++) {
    const spacing = lossClusters[i][0] - lossClusters[i-1][lossClusters[i-1].length - 1];
    totalSpacing += spacing;
    spacingCount++;
  }
}

console.log('  Total loss clusters across all sessions: ' + totalClusters);
if (spacingCount > 0) {
  const avgSpacing = (totalSpacing / spacingCount).toFixed(2);
  console.log('  Average spacing between clusters: ' + avgSpacing + ' blocks');
}

const clustersPerSession = (totalClusters / profitableSessions.length).toFixed(2);
console.log('  Average clusters per session: ' + clustersPerSession);

