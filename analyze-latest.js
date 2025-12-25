const fs = require('fs');

const data = JSON.parse(fs.readFileSync('C:\\Users\\Okhantu\\Desktop\\The other income\\ghost-evaluator\\data\\sessions\\session_2025-12-17T19-53-31-143Z.json', 'utf8'));

console.log('=== SESSION: 2025-12-17T19-53-31 ===\n');

// Session summary
console.log('SESSION SUMMARY:');
console.log('Total PnL:', data.pnlTotal);
console.log('Total Trades:', data.trades ? data.trades.length : 0);
console.log('Total Blocks:', data.blocks ? data.blocks.length : 0);

if (data.trades && data.trades.length > 0) {
  const wins = data.trades.filter(t => t.isWin).length;
  console.log('Win Rate:', Math.round((wins / data.trades.length) * 100) + '%');
}

// Pattern performance from trades
console.log('\n=== TRADE PERFORMANCE BY PATTERN ===\n');
const tradesByPattern = {};
if (data.trades) {
  data.trades.forEach(t => {
    if (!tradesByPattern[t.pattern]) {
      tradesByPattern[t.pattern] = { total: 0, wins: 0, totalPnl: 0 };
    }
    tradesByPattern[t.pattern].total++;
    if (t.isWin) tradesByPattern[t.pattern].wins++;
    tradesByPattern[t.pattern].totalPnl += t.pnl;
  });

  const sortedTrades = Object.entries(tradesByPattern)
    .map(([name, stats]) => ({ name, ...stats, winRate: Math.round((stats.wins / stats.total) * 100) }))
    .sort((a, b) => b.totalPnl - a.totalPnl);

  console.log('Pattern       | Trades | Wins | W.Rate | Total PnL');
  console.log('--------------|--------|------|--------|----------');
  sortedTrades.forEach(p => {
    console.log(
      p.name.padEnd(13) + ' | ' +
      String(p.total).padStart(6) + ' | ' +
      String(p.wins).padStart(4) + ' | ' +
      String(p.winRate + '%').padStart(6) + ' | ' +
      String(Math.round(p.totalPnl)).padStart(9)
    );
  });
}

// SameDir Analysis
console.log('\n=== SAMEDIR DETAILED ANALYSIS ===\n');

const ACTIVATION_THRESHOLD = 140;
const blocks = data.blocks;
let active = false;
let accumulatedLoss = 0;
let currentRunDir = null;
let currentRunBlocks = [];
let activations = [];
let deactivations = [];

for (let i = 0; i < blocks.length; i++) {
  const block = blocks[i];

  if (currentRunDir === null) {
    currentRunDir = block.dir;
    currentRunBlocks = [block];
    continue;
  }

  if (block.dir === currentRunDir) {
    currentRunBlocks.push(block);
  } else {
    const runLength = currentRunBlocks.length;

    if (active && runLength < 2) {
      accumulatedLoss += block.pct;
      if (accumulatedLoss > 140) {
        deactivations.push({ blockIndex: block.index, reason: 'flip_loss', accumulatedLoss });
        active = false;
      }
    }

    if (runLength >= 2) {
      const runSum = currentRunBlocks.slice(1).reduce((sum, b) => sum + b.pct, 0);
      const runProfit = runSum - block.pct;

      if (!active) {
        if (runProfit >= ACTIVATION_THRESHOLD) {
          active = true;
          accumulatedLoss = 0;
          activations.push({ blockIndex: block.index, runProfit, runLength });
        }
      } else {
        if (runProfit < 0) {
          accumulatedLoss += Math.abs(runProfit);
          if (accumulatedLoss > 140) {
            deactivations.push({ blockIndex: block.index, reason: 'negative_run', accumulatedLoss, runProfit });
            active = false;
          }
        } else if (runProfit > accumulatedLoss) {
          accumulatedLoss = 0;
        }
      }
    }

    currentRunDir = block.dir;
    currentRunBlocks = [block];
  }
}

const sdTrades = data.trades ? data.trades.filter(t => t.pattern === 'SameDir') : [];

console.log('ACTIVATIONS:');
activations.forEach((a, i) => {
  const nextDeact = deactivations.find(d => d.blockIndex > a.blockIndex);
  const endBlock = nextDeact ? nextDeact.blockIndex : blocks.length;
  const tradesInPeriod = sdTrades.filter(t => t.openIndex >= a.blockIndex && t.openIndex < endBlock);
  const pnl = tradesInPeriod.reduce((sum, t) => sum + t.pnl, 0);
  const wins = tradesInPeriod.filter(t => t.isWin).length;

  console.log(`  #${i+1} Block ${a.blockIndex}: RunProfit=${a.runProfit}% → ${tradesInPeriod.length} trades (${wins} wins), PnL: ${Math.round(pnl)}`);
  if (nextDeact) {
    console.log(`      Deactivated at ${nextDeact.blockIndex}: ${nextDeact.reason} (accLoss: ${nextDeact.accumulatedLoss}%)`);
  }
});

// ZZ Analysis
console.log('\n=== ZZ/AntiZZ ANALYSIS ===\n');
const zzTrades = data.trades ? data.trades.filter(t => t.pattern === 'ZZ' || t.pattern === 'AntiZZ') : [];
if (zzTrades.length > 0) {
  console.log(`Trades: ${zzTrades.length}, Wins: ${zzTrades.filter(t => t.isWin).length}`);
  console.log(`Win Rate: ${Math.round((zzTrades.filter(t => t.isWin).length / zzTrades.length) * 100)}%`);
  console.log(`Total PnL: ${Math.round(zzTrades.reduce((sum, t) => sum + t.pnl, 0))}`);
  console.log('\nTrade Details:');
  zzTrades.forEach(t => {
    console.log(`  Block ${t.openIndex}->${t.evalIndex}: ${t.pattern} ${t.isWin ? 'WIN' : 'LOSS'} ${Math.round(t.pnl)}`);
  });
} else {
  console.log('No ZZ/AntiZZ trades');
}

// Session comparison
console.log('\n=== SESSION COMPARISON (Last 3) ===\n');
const sessions = [
  { file: 'session_2025-12-17T16-22-57-249Z.json', label: '16:22' },
  { file: 'session_2025-12-17T19-38-31-098Z.json', label: '19:38' },
  { file: 'session_2025-12-17T19-53-31-143Z.json', label: '19:53' }
];

console.log('Session | Total PnL | SameDir PnL | ZZ PnL | Win Rate');
console.log('--------|-----------|-------------|--------|----------');

sessions.forEach(s => {
  try {
    const d = JSON.parse(fs.readFileSync(`C:\\Users\\Okhantu\\Desktop\\The other income\\ghost-evaluator\\data\\sessions\\${s.file}`, 'utf8'));
    const sd = d.trades ? d.trades.filter(t => t.pattern === 'SameDir') : [];
    const zz = d.trades ? d.trades.filter(t => t.pattern === 'ZZ' || t.pattern === 'AntiZZ') : [];
    const wins = d.trades ? d.trades.filter(t => t.isWin).length : 0;
    const total = d.trades ? d.trades.length : 0;

    console.log(
      s.label.padEnd(7) + ' | ' +
      String(d.pnlTotal).padStart(9) + ' | ' +
      String(Math.round(sd.reduce((sum, t) => sum + t.pnl, 0))).padStart(11) + ' | ' +
      String(Math.round(zz.reduce((sum, t) => sum + t.pnl, 0))).padStart(6) + ' | ' +
      String(total > 0 ? Math.round((wins/total)*100) + '%' : 'N/A').padStart(8)
    );
  } catch (e) {
    console.log(s.label + ': Error loading');
  }
});
