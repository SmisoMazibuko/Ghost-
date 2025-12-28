#!/usr/bin/env ts-node
/**
 * SD Replay Comparison: Old vs New Logic
 * =======================================
 *
 * Compares SD performance with and without pause/resume logic.
 *
 * Usage:
 *   npx ts-node src/tests/sd-replay-comparison.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  createSameDirectionManager,
  ZZ_XAX_PATTERNS,
} from '../engine/same-direction';
import { Block, Direction } from '../types';

// ============================================================================
// TYPES
// ============================================================================

interface SessionLog {
  version: string;
  blocks: Block[];
  trades: SessionTrade[];
}

interface SessionTrade {
  pattern: string;
  openIndex: number;
  evalIndex: number;
  isWin: boolean;
  pnl: number;
  predictedDirection: Direction;
  actualDirection: Direction;
  pct: number;
  ts: string;
}

interface ReplayResult {
  sessionName: string;
  totalSDTrades: number;
  realTrades: number;
  imaginaryTrades: number;
  realPnL: number;
  imaginaryPnL: number;
  pauseCount: number;
  resumeCount: number;
  activationCount: number;
}

// ============================================================================
// REPLAY WITH PAUSE/RESUME (NEW LOGIC)
// ============================================================================

function replayWithPauseResume(session: SessionLog, sessionName: string): ReplayResult {
  const sdManager = createSameDirectionManager();

  let realTrades = 0;
  let imaginaryTrades = 0;
  let realPnL = 0;
  let imaginaryPnL = 0;
  let pauseCount = 0;
  let resumeCount = 0;
  let activationCount = 0;
  let wasPaused = false;
  let wasActive = false;

  // Filter trades by type
  const sdTrades = session.trades.filter(t => t.pattern === 'SameDir');
  const zzXaxTrades = session.trades.filter(t =>
    ZZ_XAX_PATTERNS.includes(t.pattern as typeof ZZ_XAX_PATTERNS[number])
  );

  // Sort all trades by evalIndex for chronological processing
  const allTrades = [...sdTrades, ...zzXaxTrades].sort((a, b) => a.evalIndex - b.evalIndex);

  // Process blocks to build SD state
  for (const block of session.blocks) {
    sdManager.processBlock(block);

    // Track activations
    if (sdManager.isActive() && !wasActive) {
      activationCount++;
    }
    wasActive = sdManager.isActive();

    // Check if there are trades at this block
    const tradesAtBlock = allTrades.filter(t => t.evalIndex === block.index);

    for (const trade of tradesAtBlock) {
      if (ZZ_XAX_PATTERNS.includes(trade.pattern as typeof ZZ_XAX_PATTERNS[number])) {
        // ZZ/XAX trade - record for resume trigger
        sdManager.recordZZXAXResult(trade.pattern, trade.isWin, block.index);

        // Check resume
        if (sdManager.checkResumeCondition(block.index)) {
          resumeCount++;
        }
      } else if (trade.pattern === 'SameDir') {
        // SD trade
        const prevBlock = block.index > 0 ? session.blocks[block.index - 1] : null;
        const isReversal = prevBlock !== null && block.dir !== prevBlock.dir;

        // Check if this is a real or imaginary trade
        if (sdManager.canBet()) {
          // Real trade
          realTrades++;
          realPnL += trade.pnl;

          // Record and check for pause
          const result = sdManager.recordSDTradeResult(
            trade.isWin,
            trade.pct,
            block.index,
            isReversal
          );

          if (result.didPause) {
            pauseCount++;
          }
        } else if (sdManager.isPaused()) {
          // Imaginary trade (during pause)
          imaginaryTrades++;
          imaginaryPnL += trade.pnl;

          // Still record for tracking
          sdManager.recordSDTradeResult(
            trade.isWin,
            trade.pct,
            block.index,
            isReversal
          );
        }

        // Track pause state changes
        if (sdManager.isPaused() && !wasPaused) {
          wasPaused = true;
        } else if (!sdManager.isPaused() && wasPaused) {
          wasPaused = false;
        }
      }
    }
  }

  return {
    sessionName,
    totalSDTrades: sdTrades.length,
    realTrades,
    imaginaryTrades,
    realPnL,
    imaginaryPnL,
    pauseCount,
    resumeCount,
    activationCount,
  };
}

// ============================================================================
// REPLAY WITHOUT PAUSE/RESUME (OLD LOGIC)
// ============================================================================

function replayWithoutPauseResume(session: SessionLog, sessionName: string): ReplayResult {
  const sdManager = createSameDirectionManager();

  let realTrades = 0;
  let realPnL = 0;
  let activationCount = 0;
  let wasActive = false;

  // Filter SD trades
  const sdTrades = session.trades.filter(t => t.pattern === 'SameDir');

  // Process blocks to build SD state
  for (const block of session.blocks) {
    sdManager.processBlock(block);

    // Track activations
    if (sdManager.isActive() && !wasActive) {
      activationCount++;
    }
    wasActive = sdManager.isActive();

    // Check if there are SD trades at this block
    const sdTradesAtBlock = sdTrades.filter(t => t.evalIndex === block.index);

    for (const trade of sdTradesAtBlock) {
      // OLD LOGIC: No pause/resume - all trades are real if SD is active
      if (sdManager.isActive()) {
        realTrades++;
        realPnL += trade.pnl;
      }
    }
  }

  return {
    sessionName,
    totalSDTrades: sdTrades.length,
    realTrades,
    imaginaryTrades: 0,
    realPnL,
    imaginaryPnL: 0,
    pauseCount: 0,
    resumeCount: 0,
    activationCount,
  };
}

// ============================================================================
// MAIN COMPARISON
// ============================================================================

function runComparison(): void {
  console.log('='.repeat(80));
  console.log('  SD REPLAY COMPARISON: OLD VS NEW LOGIC');
  console.log('='.repeat(80));
  console.log();

  // Find session files
  const sessionsDir = path.join(__dirname, '../../data/sessions');
  const sessionFiles = fs.readdirSync(sessionsDir)
    .filter(f => f.startsWith('session_') && f.endsWith('.json') && !f.includes('.partial.'))
    .map(f => path.join(sessionsDir, f));

  if (sessionFiles.length === 0) {
    console.log('No session files found in', sessionsDir);
    return;
  }

  console.log(`Found ${sessionFiles.length} session(s) to compare`);
  console.log();

  // Results storage
  const oldResults: ReplayResult[] = [];
  const newResults: ReplayResult[] = [];

  for (const sessionPath of sessionFiles) {
    const sessionName = path.basename(sessionPath);
    console.log('-'.repeat(80));
    console.log(`Processing: ${sessionName}`);
    console.log('-'.repeat(80));

    try {
      const data = fs.readFileSync(sessionPath, 'utf8');
      const session: SessionLog = JSON.parse(data);

      // Run old logic (no pause/resume)
      const oldResult = replayWithoutPauseResume(session, sessionName);
      oldResults.push(oldResult);

      // Run new logic (with pause/resume)
      const newResult = replayWithPauseResume(session, sessionName);
      newResults.push(newResult);

      // Print session comparison
      console.log();
      console.log(`  Total SD trades: ${session.trades.filter(t => t.pattern === 'SameDir').length}`);
      console.log();
      console.log('  OLD LOGIC (no pause/resume):');
      console.log(`    Real trades: ${oldResult.realTrades}`);
      console.log(`    Real P/L: ${oldResult.realPnL >= 0 ? '+' : ''}${oldResult.realPnL}%`);
      console.log();
      console.log('  NEW LOGIC (with pause/resume):');
      console.log(`    Real trades: ${newResult.realTrades}`);
      console.log(`    Real P/L: ${newResult.realPnL >= 0 ? '+' : ''}${newResult.realPnL}%`);
      console.log(`    Imaginary trades: ${newResult.imaginaryTrades}`);
      console.log(`    Imaginary P/L: ${newResult.imaginaryPnL >= 0 ? '+' : ''}${newResult.imaginaryPnL}%`);
      console.log(`    Pauses: ${newResult.pauseCount}`);
      console.log(`    Resumes: ${newResult.resumeCount}`);
      console.log();

      const improvement = newResult.realPnL - oldResult.realPnL;
      console.log(`  IMPROVEMENT: ${improvement >= 0 ? '+' : ''}${improvement}%`);
      console.log();
    } catch (error) {
      console.error(`  Error processing session: ${error}`);
      console.log();
    }
  }

  // Print summary table
  console.log('='.repeat(80));
  console.log('  SUMMARY');
  console.log('='.repeat(80));
  console.log();

  console.log('| Session | Without Pause | With Pause | Improvement |');
  console.log('|---------|---------------|------------|-------------|');

  let totalOld = 0;
  let totalNew = 0;

  for (let i = 0; i < oldResults.length; i++) {
    const old = oldResults[i];
    const newR = newResults[i];
    const improvement = newR.realPnL - old.realPnL;
    const shortName = old.sessionName.replace('session_', '').replace('.json', '').substring(0, 20);

    console.log(`| ${shortName.padEnd(7)} | ${old.realPnL >= 0 ? '+' : ''}${old.realPnL.toString().padStart(12)}% | ${newR.realPnL >= 0 ? '+' : ''}${newR.realPnL.toString().padStart(9)}% | ${improvement >= 0 ? '+' : ''}${improvement.toString().padStart(10)}% |`);

    totalOld += old.realPnL;
    totalNew += newR.realPnL;
  }

  const totalImprovement = totalNew - totalOld;
  console.log('|---------|---------------|------------|-------------|');
  console.log(`| TOTAL   | ${totalOld >= 0 ? '+' : ''}${totalOld.toString().padStart(12)}% | ${totalNew >= 0 ? '+' : ''}${totalNew.toString().padStart(9)}% | ${totalImprovement >= 0 ? '+' : ''}${totalImprovement.toString().padStart(10)}% |`);
  console.log();

  // Print pause/resume stats
  console.log('PAUSE/RESUME STATISTICS:');
  console.log();
  for (const r of newResults) {
    const shortName = r.sessionName.replace('session_', '').replace('.json', '').substring(0, 20);
    console.log(`  ${shortName}:`);
    console.log(`    Pauses: ${r.pauseCount}, Resumes: ${r.resumeCount}`);
    console.log(`    Avoided losses (imaginary): ${r.imaginaryPnL >= 0 ? '+' : ''}${r.imaginaryPnL}%`);
    console.log();
  }
}

// Run comparison
runComparison();
