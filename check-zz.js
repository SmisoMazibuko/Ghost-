const fs = require('fs');
const data = JSON.parse(fs.readFileSync('C:\\Users\\Okhantu\\Desktop\\The other income\\ghost-evaluator\\data\\sessions\\session_2025-12-17T16-22-57-249Z.json', 'utf8'));

// Check ZZ trades
const zzTrades = data.trades.filter(t => t.pattern === 'ZZ' || t.pattern === 'AntiZZ');
console.log('=== ZZ/AntiZZ TRADES ===');
console.log('Total:', zzTrades.length);
zzTrades.forEach(t => {
  console.log(`  Block ${t.openIndex}->${t.evalIndex}: ${t.pattern} ${t.isWin ? 'WIN' : 'LOSS'} ${t.pnl}`);
});

// Check ZZ results
const zzResults = data.results.filter(r => r.pattern === 'ZZ' || r.pattern === 'AntiZZ');
console.log('\n=== ZZ/AntiZZ RESULTS ===');
console.log('Total:', zzResults.length);
zzResults.forEach(r => {
  console.log(`  Block ${r.signalIndex}->${r.evalIndex}: ${r.pattern} expect:${r.expectedDirection > 0 ? 'UP' : 'DOWN'} actual:${r.actualDirection > 0 ? 'UP' : 'DOWN'} ${r.verdict} profit:${r.profit}`);
});

// Check last 30 blocks and their run lengths
const blocks = data.blocks;
console.log('\n=== LAST 30 BLOCKS ===');
const last30 = blocks.slice(-30);
console.log(last30.map(b => b.dir === 1 ? 'G' : 'R').join(' '));

// Check run data
if (data.runData) {
  console.log('\n=== RUN DATA ===');
  console.log('Run lengths (last 15):', data.runData.lengths.slice(-15));
  console.log('Directions (last 15):', data.runData.directions.slice(-15).map(d => d === 1 ? 'G' : 'R'));
  console.log('Current run length:', data.runData.currentLength);
  console.log('Current direction:', data.runData.currentDirection === 1 ? 'GREEN' : 'RED');
}

// Check for ZZ indicator pattern in the data
console.log('\n=== ZZ INDICATOR CHECK ===');
const lengths = data.runData.lengths;
for (let i = 0; i < lengths.length - 4; i++) {
  if (lengths[i] >= 2) {
    // Check if followed by 3+ ones
    let allOnes = true;
    let onesCount = 0;
    for (let j = i + 1; j < lengths.length; j++) {
      if (lengths[j] === 1) {
        onesCount++;
      } else {
        allOnes = false;
        break;
      }
    }
    if (allOnes && onesCount >= 3) {
      console.log(`Found ZZ indicator at run ${i}: indicator=${lengths[i]}, followed by ${onesCount} ones`);
    }
  }
}
