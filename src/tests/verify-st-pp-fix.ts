#!/usr/bin/env ts-node
/**
 * Verify ST & PP Activation Fix - Dec 26, 2025
 *
 * Replays the session and checks which ST/PP trades would have been
 * avoided with the new activation rules:
 *
 * ST requires:
 * - ≥3 indicator run before activation
 * - First double after indicator is 2A2 territory (skip)
 * - 2nd+ double can activate ST
 *
 * PP requires:
 * - At least one complete 1-2 cycle before activation
 */

import * as fs from 'fs';
import * as path from 'path';

interface Trade {
  pattern: string;
  openIndex: number;
  evalIndex: number;
  isWin: boolean;
  pnl: number;
  pct: number;
  predictedDirection: number;
  actualDirection: number;
}

interface Block {
  index: number;
  dir: number;
  pct: number;
}

interface Session {
  blocks: Block[];
  trades: Trade[];
}

interface RunData {
  lengths: number[];
  directions: number[];
  currentLength: number;
  currentDirection: number;
}

function buildRunData(blocks: Block[], upToIndex: number): RunData {
  const lengths: number[] = [];
  const directions: number[] = [];
  let currentLength = 0;
  let currentDirection = 0;

  for (let i = 0; i <= upToIndex && i < blocks.length; i++) {
    const dir = blocks[i].dir;

    if (i === 0) {
      currentDirection = dir;
      currentLength = 1;
    } else if (dir === currentDirection) {
      currentLength++;
    } else {
      // Run break
      lengths.push(currentLength);
      directions.push(currentDirection);
      currentDirection = dir;
      currentLength = 1;
    }
  }

  // Add current run
  if (currentLength > 0) {
    lengths.push(currentLength);
    directions.push(currentDirection);
  }

  return {
    lengths,
    directions,
    currentLength,
    currentDirection,
  };
}

function verify(): void {
  console.log('═'.repeat(80));
  console.log('  VERIFY ST & PP ACTIVATION FIX - Dec 26, 2025');
  console.log('═'.repeat(80));
  console.log();

  // Load session
  const sessionPath = path.join(__dirname, '../../data/sessions/session_2025-12-26T09-53-43-729Z.json');
  const session: Session = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));

  // =========================================================================
  // ANALYZE ST TRADES
  // =========================================================================
  console.log('ST ACTIVATION ANALYSIS');
  console.log('─'.repeat(60));
  console.log('New Rule: Requires ≥3 indicator, then 2nd+ double to activate');
  console.log();

  const stTrades = session.trades.filter(t => t.pattern === 'ST');
  let stAvoided = 0;
  let stAvoidedPnL = 0;

  for (const t of stTrades) {
    // Build run data at the signal block (openIndex)
    const runData = buildRunData(session.blocks, t.openIndex);

    // Check: Was there a ≥3 indicator before this point?
    let indicatorSeen = false;
    let doublesAfterIndicator = 0;

    for (let i = 0; i < runData.lengths.length; i++) {
      if (runData.lengths[i] >= 3) {
        indicatorSeen = true;
        doublesAfterIndicator = 0; // Reset count after new indicator
      } else if (runData.lengths[i] === 2 && indicatorSeen) {
        doublesAfterIndicator++;
      }
    }

    // Would this trade have been taken with new rules?
    const wouldActivate = indicatorSeen && doublesAfterIndicator >= 2; // 2nd+ double

    const result = t.isWin ? 'WIN' : 'LOSS';
    const pnlStr = (t.pnl >= 0 ? '+' : '') + t.pnl.toFixed(0);

    console.log(`Block ${t.evalIndex}: ${result} ${pnlStr}%`);
    console.log(`  Run structure: ${runData.lengths.slice(-5).join('-')}`);
    console.log(`  Indicator seen: ${indicatorSeen ? 'YES' : 'NO'}`);
    console.log(`  Doubles after indicator: ${doublesAfterIndicator}`);

    if (!wouldActivate) {
      console.log(`  → WOULD BE AVOIDED (${!indicatorSeen ? 'no indicator' : 'only ' + doublesAfterIndicator + ' doubles'})`);
      stAvoided++;
      stAvoidedPnL += t.pnl;
    } else {
      console.log(`  → Would still trade`);
    }
    console.log();
  }

  const stOldPnL = stTrades.reduce((s, t) => s + t.pnl, 0);
  const stNewPnL = stOldPnL - stAvoidedPnL;

  console.log('ST SUMMARY:');
  console.log(`  Old P/L: ${stOldPnL >= 0 ? '+' : ''}${stOldPnL}%`);
  console.log(`  Trades avoided: ${stAvoided}/${stTrades.length}`);
  console.log(`  Avoided P/L: ${stAvoidedPnL >= 0 ? '+' : ''}${stAvoidedPnL}%`);
  console.log(`  New P/L: ${stNewPnL >= 0 ? '+' : ''}${stNewPnL}%`);
  console.log(`  Improvement: ${(-stAvoidedPnL) >= 0 ? '+' : ''}${-stAvoidedPnL}%`);
  console.log();

  // =========================================================================
  // ANALYZE PP TRADES
  // =========================================================================
  console.log('═'.repeat(60));
  console.log('PP ACTIVATION ANALYSIS');
  console.log('─'.repeat(60));
  console.log('New Rule: Requires at least one complete 1-2 cycle before activation');
  console.log();

  const ppTrades = session.trades.filter(t => t.pattern === 'PP');
  let ppAvoided = 0;
  let ppAvoidedPnL = 0;

  for (const t of ppTrades) {
    // Build run data at the signal block (openIndex)
    const runData = buildRunData(session.blocks, t.openIndex);

    // Check: How many complete 1-2 cycles were there before this point?
    let cyclesSeen = 0;

    for (let i = 1; i < runData.lengths.length; i++) {
      const prevLen = runData.lengths[i - 1];
      const currLen = runData.lengths[i];
      if (prevLen === 1 && currLen === 2) {
        cyclesSeen++;
      }
    }

    // Would this trade have been taken with new rules?
    const wouldActivate = cyclesSeen >= 1;

    const result = t.isWin ? 'WIN' : 'LOSS';
    const pnlStr = (t.pnl >= 0 ? '+' : '') + t.pnl.toFixed(0);

    console.log(`Block ${t.evalIndex}: ${result} ${pnlStr}%`);
    console.log(`  Run structure: ${runData.lengths.slice(-6).join('-')}`);
    console.log(`  Complete 1-2 cycles: ${cyclesSeen}`);

    if (!wouldActivate) {
      console.log(`  → WOULD BE AVOIDED (no complete 1-2 cycle yet)`);
      ppAvoided++;
      ppAvoidedPnL += t.pnl;
    } else {
      console.log(`  → Would still trade`);
    }
    console.log();
  }

  const ppOldPnL = ppTrades.reduce((s, t) => s + t.pnl, 0);
  const ppNewPnL = ppOldPnL - ppAvoidedPnL;

  console.log('PP SUMMARY:');
  console.log(`  Old P/L: ${ppOldPnL >= 0 ? '+' : ''}${ppOldPnL}%`);
  console.log(`  Trades avoided: ${ppAvoided}/${ppTrades.length}`);
  console.log(`  Avoided P/L: ${ppAvoidedPnL >= 0 ? '+' : ''}${ppAvoidedPnL}%`);
  console.log(`  New P/L: ${ppNewPnL >= 0 ? '+' : ''}${ppNewPnL}%`);
  console.log(`  Improvement: ${(-ppAvoidedPnL) >= 0 ? '+' : ''}${-ppAvoidedPnL}%`);
  console.log();

  // =========================================================================
  // OVERALL SUMMARY
  // =========================================================================
  console.log('═'.repeat(80));
  console.log('OVERALL IMPACT OF FIXES');
  console.log('═'.repeat(80));
  console.log();

  const totalOldPnL = stOldPnL + ppOldPnL;
  const totalNewPnL = stNewPnL + ppNewPnL;
  const totalImprovement = totalNewPnL - totalOldPnL;

  console.log('| Pattern | Old P/L | Avoided | New P/L | Improvement |');
  console.log('|---------|---------|---------|---------|-------------|');
  console.log(`| ST      | ${stOldPnL >= 0 ? '+' : ''}${stOldPnL.toString().padStart(5)}% | ${stAvoided}/${stTrades.length} trades | ${stNewPnL >= 0 ? '+' : ''}${stNewPnL.toString().padStart(5)}% | ${(-stAvoidedPnL) >= 0 ? '+' : ''}${(-stAvoidedPnL).toString().padStart(9)}% |`);
  console.log(`| PP      | ${ppOldPnL >= 0 ? '+' : ''}${ppOldPnL.toString().padStart(5)}% | ${ppAvoided}/${ppTrades.length} trades | ${ppNewPnL >= 0 ? '+' : ''}${ppNewPnL.toString().padStart(5)}% | ${(-ppAvoidedPnL) >= 0 ? '+' : ''}${(-ppAvoidedPnL).toString().padStart(9)}% |`);
  console.log('|---------|---------|---------|---------|-------------|');
  console.log(`| TOTAL   | ${totalOldPnL >= 0 ? '+' : ''}${totalOldPnL.toString().padStart(5)}% |         | ${totalNewPnL >= 0 ? '+' : ''}${totalNewPnL.toString().padStart(5)}% | ${totalImprovement >= 0 ? '+' : ''}${totalImprovement.toString().padStart(9)}% |`);
  console.log();

  const sessionTotal = 2090; // From session analysis
  const newSessionTotal = sessionTotal + totalImprovement;

  console.log('SESSION IMPACT:');
  console.log(`  Original session P/L: +${sessionTotal}%`);
  console.log(`  With ST/PP fix:       +${newSessionTotal}%`);
  console.log(`  Improvement:          ${totalImprovement >= 0 ? '+' : ''}${totalImprovement}% (${(totalImprovement/sessionTotal*100).toFixed(1)}% better)`);
  console.log('═'.repeat(80));
}

verify();
