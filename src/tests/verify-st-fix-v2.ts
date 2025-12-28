#!/usr/bin/env ts-node
/**
 * Verify ST Activation Fix v2 - Dec 27, 2025
 *
 * Correct ST rules:
 * - Indicator: ≥3 run (GGG)
 * - Signal: Double after indicator (RR)
 * - Activation on 2nd R:
 *   - If 2nd block ≥70% → activate immediately
 *   - If <70% → accumulate, activate when cumulative ≥100%
 *
 * ST and 2A2 can co-exist - no skipping!
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

interface STState {
  indicatorSeen: boolean;
  cumulativeProfit: number;
  isActive: boolean;
  activatedAt: number | null;
  trades: Array<{
    blockIndex: number;
    predictedDir: number;
    result: 'win' | 'loss';
    pnl: number;
  }>;
}

function simulateST(blocks: Block[]): STState {
  const state: STState = {
    indicatorSeen: false,
    cumulativeProfit: 0,
    isActive: false,
    activatedAt: null,
    trades: [],
  };

  let currentRunLength = 0;
  let previousRunLength = 0;
  let previousBlockDir = 0;

  console.log('  ST Simulation:');
  console.log('  ' + '─'.repeat(70));

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    // Track run
    if (i === 0) {
      currentRunLength = 1;
    } else if (block.dir === previousBlockDir) {
      currentRunLength++;
    } else {
      // Run break
      previousRunLength = currentRunLength;
      currentRunLength = 1;
    }

    // Check for indicator (≥3 run)
    if (currentRunLength === 3 && !state.isActive) {
      if (!state.indicatorSeen) {
        state.indicatorSeen = true;
        state.cumulativeProfit = 0; // Reset on new indicator
        console.log(`  Block ${i}: ST INDICATOR seen (run of 3+)`);
      }
    }

    // ST structure break: run of 3+ breaks ST
    if (currentRunLength >= 3 && state.isActive) {
      console.log(`  Block ${i}: ST BREAK (active) - run of ${currentRunLength}`);
      state.isActive = false;
      state.activatedAt = null;
      state.indicatorSeen = true; // Current run is new indicator
      state.cumulativeProfit = 0;
    } else if (currentRunLength >= 3 && state.indicatorSeen && state.cumulativeProfit > 0) {
      // Reset observation if we had accumulated profit but didn't activate
      console.log(`  Block ${i}: ST observation reset - run of ${currentRunLength} (was: ${state.cumulativeProfit.toFixed(0)}% cumulative)`);
      state.indicatorSeen = true; // Current run is new indicator
      state.cumulativeProfit = 0;
    }

    // Check for double after indicator (run length = 2)
    if (currentRunLength === 2 && state.indicatorSeen && !state.isActive) {
      // This is the 2nd block of a double - check activation
      const secondBlockPct = block.pct;
      state.cumulativeProfit += secondBlockPct;

      const singleActivation = secondBlockPct >= 70;
      const cumulativeActivation = state.cumulativeProfit >= 100;

      if (singleActivation || cumulativeActivation) {
        state.isActive = true;
        state.activatedAt = i;
        console.log(`  Block ${i}: ST ACTIVATED! ${secondBlockPct}% (cumulative: ${state.cumulativeProfit.toFixed(0)}%) - ${singleActivation ? '70% single' : '100% cumulative'}`);
      } else {
        console.log(`  Block ${i}: ST double detected - ${secondBlockPct}% (cumulative: ${state.cumulativeProfit.toFixed(0)}%) - waiting`);
      }
    }

    // ST signal: when active, signal on flip after double (run length = 1 after double)
    if (state.isActive && currentRunLength === 1 && previousRunLength === 2) {
      // Predict continuation (same as flip direction)
      const predictedDir = block.dir;
      const nextBlock = blocks[i + 1];
      if (nextBlock) {
        const result = nextBlock.dir === predictedDir ? 'win' : 'loss';
        const pnl = result === 'win' ? nextBlock.pct : -nextBlock.pct;
        state.trades.push({ blockIndex: i + 1, predictedDir, result, pnl });
        console.log(`  Block ${i + 1}: ST TRADE - ${result.toUpperCase()} ${pnl >= 0 ? '+' : ''}${pnl.toFixed(0)}%`);
      }
    }

    previousBlockDir = block.dir;
  }

  return state;
}

function verify(): void {
  console.log('═'.repeat(80));
  console.log('  VERIFY ST ACTIVATION FIX v2 - Dec 27, 2025');
  console.log('═'.repeat(80));
  console.log();
  console.log('  Correct ST Rules:');
  console.log('  - Indicator: ≥3 run (GGG)');
  console.log('  - Signal: Double after indicator (RR)');
  console.log('  - Activation on 2nd R: ≥70% immediate, <70% accumulate to 100%');
  console.log('  - ST and 2A2 co-exist (no skipping)');
  console.log();

  // Test with Dec 27 sessions
  const sessionFiles = [
    'session_2025-12-27T10-20-33-003Z.json',
    'session_2025-12-27T10-38-33-070Z.json',
    'session_2025-12-27T11-18-05-522Z.json',
  ];

  let totalTrades = 0;
  let totalPnL = 0;

  for (const file of sessionFiles) {
    const sessionPath = path.join(__dirname, '../../data/sessions/', file);
    if (!fs.existsSync(sessionPath)) {
      console.log(`  Session not found: ${file}`);
      continue;
    }

    const session: Session = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
    const timeMatch = file.match(/T(\d+)-(\d+)-/);
    const time = timeMatch ? timeMatch[1] + ':' + timeMatch[2] : 'unknown';

    console.log('═'.repeat(80));
    console.log(`  SESSION: ${time} UTC (${session.blocks.length} blocks)`);
    console.log('═'.repeat(80));

    const result = simulateST(session.blocks);

    const sessionPnL = result.trades.reduce((s, t) => s + t.pnl, 0);
    const wins = result.trades.filter(t => t.result === 'win').length;

    console.log();
    console.log(`  Session Result: ${result.trades.length} trades, ${wins}W/${result.trades.length - wins}L, ${sessionPnL >= 0 ? '+' : ''}${sessionPnL.toFixed(0)}%`);

    totalTrades += result.trades.length;
    totalPnL += sessionPnL;
  }

  console.log();
  console.log('═'.repeat(80));
  console.log('  TOTAL ACROSS ALL SESSIONS');
  console.log('═'.repeat(80));
  console.log(`  Total ST trades: ${totalTrades}`);
  console.log(`  Total ST P/L: ${totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(0)}%`);
  console.log('═'.repeat(80));
}

verify();
