#!/usr/bin/env ts-node
/**
 * Verify PP Cumulative Profit Reset Fix - Dec 26, 2025
 *
 * This simulates how cumulative profit accumulates for PP pattern
 * and shows the difference between old behavior (no reset) and new behavior (reset on break).
 */

import * as fs from 'fs';
import * as path from 'path';

interface Block {
  index: number;
  dir: number;
  pct: number;
}

interface Session {
  blocks: Block[];
}

interface PPState {
  cumulativeProfit: number;
  cyclesSeen: number;
  isActive: boolean;
  activatedAt: number | null;
  trades: Array<{
    blockIndex: number;
    predictedDir: number;
    result: 'win' | 'loss';
    pnl: number;
  }>;
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
      lengths.push(currentLength);
      directions.push(currentDirection);
      currentDirection = dir;
      currentLength = 1;
    }
  }

  if (currentLength > 0) {
    lengths.push(currentLength);
    directions.push(currentDirection);
  }

  return { lengths, directions, currentLength, currentDirection };
}

function simulatePP(blocks: Block[], resetOnBreak: boolean): PPState {
  const state: PPState = {
    cumulativeProfit: 0,
    cyclesSeen: 0,
    isActive: false,
    activatedAt: null,
    trades: [],
  };

  let lastRunLength = 0;
  let currentRunLength = 0;
  let previousBlockDir = 0;

  console.log(`\n  Simulation (resetOnBreak=${resetOnBreak}):`);
  console.log('  ' + '─'.repeat(70));

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const runData = buildRunData(blocks, i);
    currentRunLength = runData.currentLength;

    // Check for run break (direction change)
    if (i > 0 && block.dir !== previousBlockDir) {
      lastRunLength = runData.lengths[runData.lengths.length - 2] || 0;
    }

    // PP structure break: run of 3+ breaks PP rhythm
    if (currentRunLength >= 3) {
      if (state.isActive) {
        console.log(`  Block ${i}: PP BREAK (active) - run of ${currentRunLength}`);
        state.isActive = false;
        state.activatedAt = null;
        state.cumulativeProfit = 0;
        state.cyclesSeen = 0;
      } else if (state.cumulativeProfit > 0 || state.cyclesSeen > 0) {
        if (resetOnBreak) {
          console.log(`  Block ${i}: PP observation RESET - run of ${currentRunLength} (was: ${state.cumulativeProfit}% cumulative, ${state.cyclesSeen} cycles)`);
          state.cumulativeProfit = 0;
          state.cyclesSeen = 0;
        } else {
          console.log(`  Block ${i}: PP observation NOT reset (old bug) - run of ${currentRunLength} (keeping: ${state.cumulativeProfit}% cumulative)`);
        }
      }
    }

    // PP cycle detection: previous run = 1, current run = 2
    if (currentRunLength === 2 && lastRunLength === 1) {
      state.cyclesSeen++;

      // Record observation profit (first block of the double)
      const firstBlockOfDouble = blocks[i - 1]; // Previous block was first of this double
      if (firstBlockOfDouble) {
        const observationProfit = firstBlockOfDouble.pct;
        state.cumulativeProfit += observationProfit;

        console.log(`  Block ${i}: PP cycle detected (1→2) - observation +${observationProfit}% (cumulative: ${state.cumulativeProfit}%, cycles: ${state.cyclesSeen})`);

        // Check activation
        if (!state.isActive) {
          const singleBlockActivation = observationProfit >= 70;
          const cumulativeActivation = state.cumulativeProfit >= 100;

          if (singleBlockActivation || cumulativeActivation) {
            state.isActive = true;
            state.activatedAt = i;
            console.log(`  Block ${i}: PP ACTIVATED! (${singleBlockActivation ? '70% single' : '100% cumulative'})`);
          }
        }
      }
    }

    // PP signal: current run = 1, previous run = 2 (flip after double)
    if (state.isActive && currentRunLength === 1 && lastRunLength === 2) {
      // Would signal a trade here
      const predictedDir = -block.dir; // Predict continuation of flip
      const nextBlock = blocks[i + 1];
      if (nextBlock) {
        const result = nextBlock.dir === predictedDir ? 'win' : 'loss';
        const pnl = result === 'win' ? nextBlock.pct : -nextBlock.pct;
        state.trades.push({ blockIndex: i + 1, predictedDir, result, pnl });
        console.log(`  Block ${i + 1}: PP TRADE - ${result.toUpperCase()} ${pnl >= 0 ? '+' : ''}${pnl}%`);
      }
    }

    previousBlockDir = block.dir;
  }

  return state;
}

function verify(): void {
  console.log('═'.repeat(80));
  console.log('  VERIFY PP CUMULATIVE RESET FIX - Dec 26, 2025');
  console.log('═'.repeat(80));

  // Load session
  const sessionPath = path.join(__dirname, '../../data/sessions/session_2025-12-26T09-53-43-729Z.json');
  const session: Session = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));

  console.log(`\n  Session: ${session.blocks.length} blocks`);

  // Simulate full session
  const testBlocks = session.blocks;

  console.log('\n' + '═'.repeat(80));
  console.log('  OLD BEHAVIOR (no reset on observation break)');
  console.log('═'.repeat(80));
  const oldResult = simulatePP(testBlocks, false);

  console.log('\n' + '═'.repeat(80));
  console.log('  NEW BEHAVIOR (reset on observation break)');
  console.log('═'.repeat(80));
  const newResult = simulatePP(testBlocks, true);

  console.log('\n' + '═'.repeat(80));
  console.log('  COMPARISON');
  console.log('═'.repeat(80));
  console.log(`\n  Old behavior trades: ${oldResult.trades.length}`);
  console.log(`  New behavior trades: ${newResult.trades.length}`);

  const oldPnL = oldResult.trades.reduce((s, t) => s + t.pnl, 0);
  const newPnL = newResult.trades.reduce((s, t) => s + t.pnl, 0);

  console.log(`  Old P/L: ${oldPnL >= 0 ? '+' : ''}${oldPnL}%`);
  console.log(`  New P/L: ${newPnL >= 0 ? '+' : ''}${newPnL}%`);
  console.log(`  Difference: ${(newPnL - oldPnL) >= 0 ? '+' : ''}${newPnL - oldPnL}%`);
  console.log('═'.repeat(80));
}

verify();
