#!/usr/bin/env node
/**
 * SD Resume Analysis Script
 * Investigates losses immediately after SD resumes from pause
 */

const fs = require('fs');

const sessionPath = process.argv[2] || 'ghost-evaluator/data/sessions/session_2025-12-28T11-52-58-891Z.json';
const session = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));

const blocks = session.blocks;
const trades = session.trades;

console.log('='.repeat(80));
console.log('  SD POST-RESUME LOSS ANALYSIS');
console.log('  Session: ' + sessionPath.split('/').pop());
console.log('='.repeat(80));
console.log();

// Get all trades sorted by evalIndex
const allTrades = [...trades].sort((a, b) => a.evalIndex - b.evalIndex);
const sdTrades = allTrades.filter(t => t.pattern === 'SameDir').sort((a, b) => a.evalIndex - b.evalIndex);
const zzTrades = allTrades.filter(t => t.pattern === 'ZZ').sort((a, b) => a.evalIndex - b.evalIndex);

console.log(`Total SD trades: ${sdTrades.length}`);
console.log(`Total ZZ trades: ${zzTrades.length}`);
console.log();

// Detect gaps in SD trading (pause periods)
console.log('='.repeat(80));
console.log('  DETECTING SD PAUSE/RESUME EVENTS');
console.log('='.repeat(80));
console.log();

const pauseEvents = [];
for (let i = 1; i < sdTrades.length; i++) {
  const gap = sdTrades[i].evalIndex - sdTrades[i-1].evalIndex;
  if (gap > 2) { // Gap > 2 blocks suggests pause was active
    const pauseStart = sdTrades[i-1].evalIndex;
    const resumeBlock = sdTrades[i].evalIndex;

    // Find what happened during the pause
    const pausedBlocks = [];
    for (let b = pauseStart + 1; b < resumeBlock; b++) {
      pausedBlocks.push(blocks[b]);
    }

    // Find ZZ trades during pause period
    const zzDuringPause = zzTrades.filter(t =>
      t.evalIndex > pauseStart && t.evalIndex < resumeBlock
    );

    // Find ZZ trade that might have triggered resume
    const zzAtResume = zzTrades.find(t =>
      t.evalIndex === resumeBlock || t.evalIndex === resumeBlock - 1
    );

    // Get trades immediately after resume (next 3 SD trades)
    const postResumeTrades = sdTrades.slice(i, i + 5);

    pauseEvents.push({
      pauseStart,
      resumeBlock,
      gapBlocks: gap - 1,
      lastTradeBeforePause: sdTrades[i-1],
      firstTradeAfterResume: sdTrades[i],
      pausedBlocks,
      zzDuringPause,
      zzAtResume,
      postResumeTrades,
    });
  }
}

console.log(`Found ${pauseEvents.length} pause/resume events\n`);

// Analyze each resume event
let totalPostResumeLoss = 0;
let badResumes = 0;

pauseEvents.forEach((event, idx) => {
  console.log('-'.repeat(80));
  console.log(`RESUME EVENT #${idx + 1}`);
  console.log('-'.repeat(80));
  console.log(`Pause started after block: ${event.pauseStart}`);
  console.log(`Resume at block: ${event.resumeBlock}`);
  console.log(`Blocks paused: ${event.gapBlocks}`);
  console.log();

  // Last trade before pause
  const lastTrade = event.lastTradeBeforePause;
  const lastBlock = blocks[lastTrade.evalIndex];
  console.log(`Last SD trade before pause:`);
  console.log(`  Block ${lastTrade.evalIndex}: ${lastTrade.isWin ? 'WIN' : 'LOSS'} ${lastTrade.pnl} (${lastBlock.dir === 1 ? 'UP' : 'DOWN'} ${lastBlock.pct}%)`);
  console.log();

  // What happened during pause
  console.log(`During pause (${event.gapBlocks} blocks):`);
  let pauseDirection = null;
  let directionChanges = 0;
  event.pausedBlocks.forEach((b, i) => {
    const prevDir = i === 0 ? lastBlock.dir : event.pausedBlocks[i-1].dir;
    if (b.dir !== prevDir) directionChanges++;
    if (i === 0) pauseDirection = b.dir;
  });

  const pauseDirCounts = { up: 0, down: 0 };
  event.pausedBlocks.forEach(b => {
    if (b.dir === 1) pauseDirCounts.up++;
    else pauseDirCounts.down++;
  });
  console.log(`  Direction: ${pauseDirCounts.up} UP, ${pauseDirCounts.down} DOWN (${directionChanges} reversals)`);

  // ZZ during pause
  if (event.zzDuringPause.length > 0) {
    console.log(`  ZZ trades during pause: ${event.zzDuringPause.length}`);
    event.zzDuringPause.forEach(zz => {
      console.log(`    Block ${zz.evalIndex}: ${zz.isWin ? 'WIN' : 'LOSS'} ${zz.pnl}`);
    });
  } else {
    console.log(`  ZZ trades during pause: 0`);
  }
  console.log();

  // What triggered resume?
  console.log(`Resume trigger analysis:`);
  if (event.zzAtResume) {
    console.log(`  ZZ at/near resume block ${event.zzAtResume.evalIndex}: ${event.zzAtResume.isWin ? 'WIN' : 'LOSS'} ${event.zzAtResume.pnl}`);
    if (!event.zzAtResume.isWin) {
      console.log(`  >>> PROBLEM: Resumed on ZZ LOSS (single failure, not pattern break)`);
    }
  } else {
    // Check if there was a ZZ win followed by loss
    const recentZZ = zzTrades.filter(t =>
      t.evalIndex >= event.pauseStart && t.evalIndex <= event.resumeBlock
    );
    if (recentZZ.length >= 2) {
      const lastTwo = recentZZ.slice(-2);
      if (lastTwo[0].isWin && !lastTwo[1].isWin) {
        console.log(`  ZZ pattern break detected: WIN at ${lastTwo[0].evalIndex}, then LOSS at ${lastTwo[1].evalIndex}`);
        console.log(`  >>> CORRECT: This is a proper pattern break`);
      } else {
        console.log(`  Recent ZZ: ${recentZZ.map(z => `${z.evalIndex}:${z.isWin ? 'W' : 'L'}`).join(', ')}`);
      }
    } else {
      console.log(`  No clear ZZ trigger found`);
    }
  }
  console.log();

  // Post-resume performance (CRITICAL)
  console.log(`POST-RESUME PERFORMANCE (first 5 SD trades):`);
  let postResumePnL = 0;
  let consecutiveLosses = 0;
  let maxConsecLosses = 0;

  event.postResumeTrades.forEach((t, i) => {
    const block = blocks[t.evalIndex];
    const prevBlock = t.evalIndex > 0 ? blocks[t.evalIndex - 1] : null;
    const prevDir = prevBlock ? (prevBlock.dir === 1 ? 'UP' : 'DOWN') : 'N/A';
    const currDir = block.dir === 1 ? 'UP' : 'DOWN';

    postResumePnL += t.pnl;

    if (!t.isWin) {
      consecutiveLosses++;
      maxConsecLosses = Math.max(maxConsecLosses, consecutiveLosses);
    } else {
      consecutiveLosses = 0;
    }

    const marker = i === 0 ? ' <-- FIRST AFTER RESUME' : '';
    console.log(`  ${i+1}. Block ${t.evalIndex}: ${prevDir} -> ${currDir} | ${t.isWin ? 'WIN ' : 'LOSS'} ${String(t.pnl).padStart(5)}${marker}`);
  });

  console.log();
  console.log(`  Post-resume PnL (5 trades): ${postResumePnL}`);
  console.log(`  Max consecutive losses: ${maxConsecLosses}`);

  // First trade analysis
  const firstTrade = event.postResumeTrades[0];
  if (firstTrade && !firstTrade.isWin) {
    console.log();
    console.log(`  >>> IMMEDIATE LOSS after resume: ${firstTrade.pnl}`);
    totalPostResumeLoss += firstTrade.pnl;
    badResumes++;

    // Why did it lose?
    const resumeBlock = blocks[firstTrade.evalIndex];
    const prevBlock = blocks[firstTrade.evalIndex - 1];
    console.log(`  >>> Bet ${firstTrade.predictedDirection === 1 ? 'UP' : 'DOWN'} (following ${prevBlock.dir === 1 ? 'UP' : 'DOWN'}), but block went ${resumeBlock.dir === 1 ? 'UP' : 'DOWN'}`);
    console.log(`  >>> REVERSAL at ${resumeBlock.pct}% intensity`);
  }

  console.log();
});

// Summary
console.log('='.repeat(80));
console.log('  SUMMARY: POST-RESUME LOSSES');
console.log('='.repeat(80));
console.log();
console.log(`Total resume events: ${pauseEvents.length}`);
console.log(`Resumes with immediate loss: ${badResumes} (${(badResumes/pauseEvents.length*100).toFixed(0)}%)`);
console.log(`Total immediate post-resume losses: ${totalPostResumeLoss}`);
console.log();

// Calculate what proper resume logic would save
let properResumeWouldSave = 0;
pauseEvents.forEach(event => {
  // Check if this was a bad resume (ZZ single loss, not pattern break)
  const zzBeforeResume = zzTrades.filter(t =>
    t.evalIndex >= event.pauseStart && t.evalIndex < event.resumeBlock
  );

  const lastZZ = zzBeforeResume[zzBeforeResume.length - 1];
  const secondLastZZ = zzBeforeResume[zzBeforeResume.length - 2];

  // If last ZZ was a loss but no prior ZZ win, this is NOT a proper pattern break
  if (lastZZ && !lastZZ.isWin) {
    if (!secondLastZZ || !secondLastZZ.isWin) {
      // Bad resume - no profitable ZZ broke
      const firstPostResume = event.postResumeTrades[0];
      if (firstPostResume && !firstPostResume.isWin) {
        properResumeWouldSave += Math.abs(firstPostResume.pnl);
      }
    }
  }
});

console.log(`If resume required "profitable ZZ break":`);
console.log(`  Estimated savings: ${properResumeWouldSave}`);
console.log();

// Detailed block-by-block around resumes
console.log('='.repeat(80));
console.log('  BLOCK-BY-BLOCK AROUND RESUME EVENTS');
console.log('='.repeat(80));
console.log();

pauseEvents.forEach((event, idx) => {
  console.log(`--- Resume Event #${idx + 1} (block ${event.resumeBlock}) ---`);

  const startBlock = Math.max(0, event.pauseStart - 2);
  const endBlock = Math.min(blocks.length - 1, event.resumeBlock + 5);

  for (let b = startBlock; b <= endBlock; b++) {
    const block = blocks[b];
    const dir = block.dir === 1 ? 'UP  ' : 'DOWN';

    // Find trades at this block
    const tradesAtBlock = allTrades.filter(t => t.evalIndex === b);
    const sdAtBlock = tradesAtBlock.find(t => t.pattern === 'SameDir');
    const zzAtBlock = tradesAtBlock.find(t => t.pattern === 'ZZ');

    let marker = '';
    if (b === event.pauseStart) marker = ' <-- PAUSE STARTS';
    if (b === event.resumeBlock) marker = ' <-- RESUME HERE';

    let tradeInfo = '';
    if (sdAtBlock) {
      tradeInfo += ` SD:${sdAtBlock.isWin ? 'W' : 'L'}${sdAtBlock.pnl > 0 ? '+' : ''}${sdAtBlock.pnl}`;
    }
    if (zzAtBlock) {
      tradeInfo += ` ZZ:${zzAtBlock.isWin ? 'W' : 'L'}${zzAtBlock.pnl > 0 ? '+' : ''}${zzAtBlock.pnl}`;
    }

    console.log(`  Block ${String(b).padStart(3)}: ${dir} ${String(block.pct).padStart(3)}%${tradeInfo}${marker}`);
  }
  console.log();
});

// Final recommendations
console.log('='.repeat(80));
console.log('  RECOMMENDATIONS');
console.log('='.repeat(80));
console.log();
console.log('1. PROPER RESUME CONDITION:');
console.log('   Resume SD only when:');
console.log('   - ZZ indicator was present AND');
console.log('   - ZZ had at least one WIN (pattern was working) AND');
console.log('   - THEN ZZ fails (pattern breaks)');
console.log();
console.log('2. DO NOT RESUME when:');
console.log('   - ZZ just has a single loss (first block after indicator)');
console.log('   - No prior ZZ win to confirm pattern was established');
console.log();
console.log('3. ADDITIONAL SAFEGUARD:');
console.log('   - Check block PCT at resume - high PCT reversals are hostile');
console.log('   - Consider waiting 1 block after ZZ break before resuming');
