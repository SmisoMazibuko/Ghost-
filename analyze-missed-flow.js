const fs = require('fs');

const s1 = JSON.parse(fs.readFileSync('ghost-evaluator/data/sessions/session_2025-12-24T18-19-24-936Z.json', 'utf8'));

console.log('='.repeat(80));
console.log('  SESSION 1 MISSED FLOW ANALYSIS');
console.log('  (Why were there no SD trades during blocks 45-53?)');
console.log('='.repeat(80));

const blocks = s1.blocks;
const trades = s1.trades.sort((a, b) => a.openIndex - b.openIndex);
const sameDirTrades = trades.filter(t => t.pattern === 'SameDir');

// Show all blocks around the missed flow
console.log('\n--- BLOCK SEQUENCE (blocks 35-60) ---\n');
console.log('Block | Dir  | PCT  | SameDir Trade?');
console.log('------|------|------|----------------');

for (let i = 35; i <= 60 && i < blocks.length; i++) {
  const block = blocks[i];
  const dir = block.dir === 1 ? 'UP' : 'DN';
  const sdTrade = sameDirTrades.find(t => t.evalIndex === i || t.openIndex === i);
  const sdStr = sdTrade ? `${sdTrade.isWin ? 'WIN' : 'LOSS'} ${sdTrade.pnl}` : '-';

  // Highlight the missed flow
  const highlight = (i >= 45 && i <= 53) ? ' << LONG FLOW' : '';

  console.log(
    String(i).padStart(5) + ' | ' +
    dir.padEnd(4) + ' | ' +
    String(block.pct).padStart(4) + ' | ' +
    sdStr + highlight
  );
}

// Find all SD trades before and after the missed flow
console.log('\n\n--- SD TRADES BEFORE/AFTER MISSED FLOW ---\n');

const beforeFlow = sameDirTrades.filter(t => t.evalIndex < 45).sort((a, b) => b.evalIndex - a.evalIndex).slice(0, 5);
const afterFlow = sameDirTrades.filter(t => t.evalIndex > 53).sort((a, b) => a.evalIndex - b.evalIndex).slice(0, 5);

console.log('Last 5 SD trades BEFORE flow (blocks 45-53):');
beforeFlow.reverse().forEach(t => {
  console.log(`  Block ${t.evalIndex}: ${t.isWin ? 'WIN' : 'LOSS'} ${t.pnl}`);
});

console.log('\nFirst 5 SD trades AFTER flow (blocks 45-53):');
afterFlow.forEach(t => {
  console.log(`  Block ${t.evalIndex}: ${t.isWin ? 'WIN' : 'LOSS'} ${t.pnl}`);
});

// Analyze the gap
const lastBefore = beforeFlow[beforeFlow.length - 1];
const firstAfter = afterFlow[0];

console.log('\n\n--- GAP ANALYSIS ---\n');
console.log(`Last SD trade before flow: Block ${lastBefore.evalIndex}`);
console.log(`First SD trade after flow: Block ${firstAfter.evalIndex}`);
console.log(`Gap size: ${firstAfter.evalIndex - lastBefore.evalIndex} blocks`);

// What happened before the gap?
const lastFew = sameDirTrades.filter(t => t.evalIndex <= 45).slice(-5);
console.log('\nLast 5 SD trades before gap:');
lastFew.forEach((t, i) => {
  const result = t.isWin ? 'WIN ' : 'LOSS';
  console.log(`  ${i + 1}. Block ${t.evalIndex}: ${result} ${t.pnl}`);
});

// Count consecutive losses
let consecLosses = 0;
for (let i = lastFew.length - 1; i >= 0; i--) {
  if (!lastFew[i].isWin) consecLosses++;
  else break;
}
console.log(`\nConsecutive losses before gap: ${consecLosses}`);

// Check what other patterns were active during the flow
console.log('\n\n--- OTHER PATTERNS DURING MISSED FLOW ---\n');
const otherTrades = trades.filter(t => t.pattern !== 'SameDir' && t.openIndex >= 45 && t.openIndex <= 53);
otherTrades.forEach(t => {
  console.log(`  Block ${t.openIndex}: ${t.pattern} - ${t.isWin ? 'WIN' : 'LOSS'} ${t.pnl}`);
});

console.log('\n\n--- CONCLUSION ---\n');
console.log('The missed flow (blocks 45-53) happened because:');
if (consecLosses >= 2) {
  console.log(`1. SD had ${consecLosses} consecutive losses before the flow`);
  console.log('2. This likely caused SD to DEACTIVATE (not just pause)');
  console.log('3. During deactivation, the 9-block DOWN flow occurred');
  console.log('4. SD missed the entire profitable flow');
} else {
  console.log('1. SD was likely not active during this period');
  console.log('2. Need to investigate activation conditions');
}
console.log('\nThis is the FAKE ACTIVATION TRAP in action:');
console.log('- SD deactivates due to losses');
console.log('- Long profitable flow starts right after');
console.log('- SD misses the opportunity');
