const fs = require('fs');

function analyzeSession(filename, label) {
  const data = JSON.parse(fs.readFileSync(`C:\\Users\\Okhantu\\Desktop\\The other income\\ghost-evaluator\\data\\sessions\\${filename}`, 'utf8'));

  console.log(`\n${'='.repeat(60)}`);
  console.log(`SESSION: ${label}`);
  console.log(`${'='.repeat(60)}\n`);

  const blocks = data.blocks;
  const trades = data.trades || [];

  // Simulate SameDir to understand activation/deactivation
  const ACTIVATION_THRESHOLD = 140;
  const DEACTIVATION_THRESHOLD = 140;

  let active = false;
  let accumulatedLoss = 0;
  let currentRunDir = null;
  let currentRunBlocks = [];

  let activations = [];
  let deactivations = [];
  let runProfits = [];

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
      // Run break
      const runLength = currentRunBlocks.length;

      // Handle single-block flip loss when active
      if (active && runLength < 2) {
        accumulatedLoss += block.pct;
        if (accumulatedLoss > DEACTIVATION_THRESHOLD) {
          deactivations.push({
            blockIndex: block.index,
            reason: 'flip_loss',
            accumulatedLoss,
            runLength: 1
          });
          active = false;
        }
      }

      // Calculate RunProfit if run >= 2
      if (runLength >= 2) {
        const runSum = currentRunBlocks.slice(1).reduce((sum, b) => sum + b.pct, 0);
        const runProfit = runSum - block.pct;
        runProfits.push({ blockIndex: block.index, runLength, runProfit, wasActive: active });

        if (!active) {
          if (runProfit >= ACTIVATION_THRESHOLD) {
            active = true;
            accumulatedLoss = 0;
            activations.push({
              blockIndex: block.index,
              runProfit,
              runLength
            });
          }
        } else {
          if (runProfit < 0) {
            accumulatedLoss += Math.abs(runProfit);
            if (accumulatedLoss > DEACTIVATION_THRESHOLD) {
              deactivations.push({
                blockIndex: block.index,
                reason: 'negative_run',
                accumulatedLoss,
                runProfit,
                runLength
              });
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

  // SameDir trade analysis
  const sdTrades = trades.filter(t => t.pattern === 'SameDir');
  const sdWins = sdTrades.filter(t => t.isWin);
  const sdLosses = sdTrades.filter(t => !t.isWin);

  console.log('SAMEDIR TRADE SUMMARY:');
  console.log(`  Total: ${sdTrades.length}, Wins: ${sdWins.length}, Losses: ${sdLosses.length}`);
  console.log(`  Win Rate: ${sdTrades.length > 0 ? Math.round((sdWins.length / sdTrades.length) * 100) : 0}%`);
  console.log(`  Total PnL: ${Math.round(sdTrades.reduce((sum, t) => sum + t.pnl, 0))}`);

  console.log('\nACTIVATION EVENTS:');
  activations.forEach(a => {
    console.log(`  Block ${a.blockIndex}: RunProfit=${a.runProfit}% (run of ${a.runLength})`);
  });

  console.log('\nDEACTIVATION EVENTS:');
  deactivations.forEach(d => {
    console.log(`  Block ${d.blockIndex}: ${d.reason}, accLoss=${d.accumulatedLoss}%${d.runProfit !== undefined ? `, runProfit=${d.runProfit}%` : ''}`);
  });

  // Analyze activation timing
  console.log('\nACTIVATION TIMING ANALYSIS:');
  if (activations.length > 0) {
    // Check what happens after each activation
    for (let i = 0; i < activations.length; i++) {
      const act = activations[i];
      const nextDeact = deactivations.find(d => d.blockIndex > act.blockIndex);
      const blocksActive = nextDeact ? nextDeact.blockIndex - act.blockIndex : blocks.length - act.blockIndex;

      // Count trades during this active period
      const tradesInPeriod = sdTrades.filter(t => {
        if (nextDeact) {
          return t.openIndex >= act.blockIndex && t.openIndex < nextDeact.blockIndex;
        }
        return t.openIndex >= act.blockIndex;
      });
      const winsInPeriod = tradesInPeriod.filter(t => t.isWin).length;
      const pnlInPeriod = tradesInPeriod.reduce((sum, t) => sum + t.pnl, 0);

      console.log(`  Activation ${i + 1} at block ${act.blockIndex}:`);
      console.log(`    RunProfit trigger: ${act.runProfit}%`);
      console.log(`    Active for: ${blocksActive} blocks`);
      console.log(`    Trades: ${tradesInPeriod.length} (${winsInPeriod} wins)`);
      console.log(`    PnL: ${Math.round(pnlInPeriod)}`);
      if (nextDeact) {
        console.log(`    Deactivated at block ${nextDeact.blockIndex}: ${nextDeact.reason}`);
      }
    }
  }

  // Find good runs that didn't activate (missed opportunities)
  console.log('\nMISSED OPPORTUNITIES (high RunProfit when inactive):');
  const missedOpps = runProfits.filter(r => !r.wasActive && r.runProfit >= 100 && r.runProfit < ACTIVATION_THRESHOLD);
  missedOpps.forEach(m => {
    console.log(`  Block ${m.blockIndex}: RunProfit=${m.runProfit}% (run of ${m.runLength}) - missed by ${ACTIVATION_THRESHOLD - m.runProfit}%`);
  });

  // Find runs that triggered too-early activation
  console.log('\nPOTENTIAL PREMATURE ACTIVATIONS:');
  activations.forEach(a => {
    // Check if the market reversed quickly after
    const nextBlocks = blocks.slice(a.blockIndex, a.blockIndex + 5);
    const flipCount = nextBlocks.filter((b, i) => i > 0 && b.dir !== nextBlocks[i-1].dir).length;
    if (flipCount >= 3) {
      console.log(`  Block ${a.blockIndex}: ${flipCount} flips in next 5 blocks (choppy market)`);
    }
  });

  return { activations, deactivations, sdTrades, runProfits };
}

// Analyze both sessions
analyzeSession('session_2025-12-17T16-22-57-249Z.json', 'GOOD SESSION (+1166, SameDir +346)');
analyzeSession('session_2025-12-17T19-38-31-098Z.json', 'BAD SESSION (+740, SameDir -236)');

// Summary comparison
console.log('\n' + '='.repeat(60));
console.log('RECOMMENDATION ANALYSIS');
console.log('='.repeat(60));
console.log(`
Current Rules:
- Activation: RunProfit >= 140%
- Deactivation: accumulatedLoss > 140%

Potential Issues:
1. 140% threshold might be too high (missing good runs)
2. 140% threshold might be too low (activating on noise)
3. Single-block flip loss accumulation too aggressive
4. No "cooldown" after deactivation

Options to Explore:
A. Lower activation threshold (e.g., 100%)
B. Higher activation threshold (e.g., 180%)
C. Add minimum run length for activation (e.g., 3+ blocks)
D. Add "confirmation" - require 2 consecutive good runs
E. Don't activate during ZZ active period
F. Use run count instead of profit threshold
`);
