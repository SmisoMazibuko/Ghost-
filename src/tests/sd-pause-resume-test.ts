#!/usr/bin/env ts-node
/**
 * SD Pause/Resume Test
 * ====================
 *
 * Tests the pause/resume functionality by replaying session data.
 *
 * Usage:
 *   npx ts-node src/tests/sd-pause-resume-test.ts [session.json]
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

interface PauseResumeEvent {
  type: 'PAUSE' | 'RESUME';
  block: number;
  reason: string;
  accumulatedLoss: number;
  imaginaryPnL?: number;
}

// ============================================================================
// MAIN TEST
// ============================================================================

function runPauseResumeTest(sessionPath: string): void {
  console.log('='.repeat(80));
  console.log('  SD PAUSE/RESUME TEST');
  console.log('='.repeat(80));
  console.log();

  // Load session
  const data = fs.readFileSync(sessionPath, 'utf8');
  const session: SessionLog = JSON.parse(data);

  console.log(`Session: ${path.basename(sessionPath)}`);
  console.log(`Blocks: ${session.blocks.length}`);
  console.log(`Trades: ${session.trades.length}`);
  console.log();

  // Create manager
  const sdManager = createSameDirectionManager();

  // Track events
  const events: PauseResumeEvent[] = [];
  let sdTradeCount = 0;
  let zzXaxTradeCount = 0;

  // Filter trades by type
  const sdTrades = session.trades.filter(t => t.pattern === 'SameDir');
  const zzXaxTrades = session.trades.filter(t =>
    ZZ_XAX_PATTERNS.includes(t.pattern as typeof ZZ_XAX_PATTERNS[number])
  );

  console.log(`SD trades: ${sdTrades.length}`);
  console.log(`ZZ/XAX trades: ${zzXaxTrades.length}`);
  console.log();

  // Sort all trades by evalIndex for chronological processing
  const allTrades = [...sdTrades, ...zzXaxTrades].sort((a, b) => a.evalIndex - b.evalIndex);

  console.log('-'.repeat(80));
  console.log('PROCESSING TRADES CHRONOLOGICALLY');
  console.log('-'.repeat(80));
  console.log();

  // Process blocks to build SD state
  for (const block of session.blocks) {
    sdManager.processBlock(block);

    // Check if there are trades at this block
    const tradesAtBlock = allTrades.filter(t => t.evalIndex === block.index);

    for (const trade of tradesAtBlock) {
      const prevBlock = block.index > 0 ? session.blocks[block.index - 1] : null;
      const isReversal = prevBlock !== null && block.dir !== prevBlock.dir;

      if (trade.pattern === 'SameDir') {
        sdTradeCount++;

        // Record SD trade result (this handles pause logic)
        const pauseResult = sdManager.recordSDTradeResult(
          trade.isWin,
          trade.pct,
          block.index,
          isReversal
        );

        const state = sdManager.canBet() ? 'ACTIVE' : (sdManager.isPaused() ? 'PAUSED' : 'INACTIVE');
        const result = trade.isWin ? 'WIN' : 'LOSS';

        console.log(`[Block ${block.index}] SD ${result} ${trade.pct}% | State: ${state} | ConsecLoss: ${sdManager.getState().sdConsecutiveLosses}`);

        if (pauseResult.didPause) {
          events.push({
            type: 'PAUSE',
            block: block.index,
            reason: pauseResult.reason || 'UNKNOWN',
            accumulatedLoss: sdManager.getAccumulatedLoss(),
          });
          console.log(`  >>> PAUSED: ${pauseResult.reason}`);
        }
      } else {
        // ZZ/XAX trade
        zzXaxTradeCount++;

        // Record ZZ/XAX result
        sdManager.recordZZXAXResult(trade.pattern, trade.isWin, block.index);

        const result = trade.isWin ? 'WIN' : 'LOSS';
        console.log(`[Block ${block.index}] ${trade.pattern} ${result} ${trade.pct}%`);

        // Check for resume
        if (sdManager.checkResumeCondition(block.index)) {
          const pauseInfo = sdManager.getPauseInfo();
          events.push({
            type: 'RESUME',
            block: block.index,
            reason: `${trade.pattern} LOSS`,
            accumulatedLoss: sdManager.getAccumulatedLoss(),
            imaginaryPnL: pauseInfo.imaginaryPnL,
          });
          console.log(`  >>> RESUMED after ${trade.pattern} break`);
        }
      }
    }
  }

  // Summary
  console.log();
  console.log('='.repeat(80));
  console.log('  SUMMARY');
  console.log('='.repeat(80));
  console.log();

  console.log(`SD trades processed: ${sdTradeCount}`);
  console.log(`ZZ/XAX trades processed: ${zzXaxTradeCount}`);
  console.log();

  console.log('PAUSE/RESUME EVENTS:');
  console.log('-'.repeat(40));

  if (events.length === 0) {
    console.log('No pause/resume events occurred.');
  } else {
    let pauseCount = 0;
    let resumeCount = 0;

    for (const event of events) {
      if (event.type === 'PAUSE') {
        pauseCount++;
        console.log(`${pauseCount}. PAUSE at block ${event.block}`);
        console.log(`   Reason: ${event.reason}`);
        console.log(`   accumulatedLoss frozen at: ${event.accumulatedLoss}%`);
      } else {
        resumeCount++;
        console.log(`${pauseCount}. RESUME at block ${event.block}`);
        console.log(`   Trigger: ${event.reason}`);
        console.log(`   Imaginary P/L during pause: ${event.imaginaryPnL}%`);
        console.log(`   Resuming with accumulatedLoss: ${event.accumulatedLoss}%`);
      }
      console.log();
    }

    console.log(`Total pauses: ${pauseCount}`);
    console.log(`Total resumes: ${resumeCount}`);
  }

  // Final state
  console.log();
  console.log('FINAL STATE:');
  console.log('-'.repeat(40));
  const finalState = sdManager.getState();
  console.log(`Active: ${finalState.active}`);
  console.log(`Paused: ${finalState.paused}`);
  console.log(`Pause reason: ${finalState.pauseReason || 'N/A'}`);
  console.log(`accumulatedLoss: ${finalState.accumulatedLoss}%`);
  console.log(`Consecutive losses: ${finalState.sdConsecutiveLosses}`);
  console.log(`Last ZZ/XAX: ${finalState.lastZZXAXPattern} ${finalState.lastZZXAXResult} at block ${finalState.lastZZXAXTradeBlock}`);
  console.log(`Imaginary P/L: ${finalState.imaginaryPnL}%`);
  console.log(`Imaginary wins/losses: ${finalState.imaginaryWins}W / ${finalState.imaginaryLosses}L`);
}

// ============================================================================
// CLI
// ============================================================================

const DEFAULT_SESSION = 'data/sessions/session_2025-12-24T18-19-24-936Z.json';

const args = process.argv.slice(2);
const sessionPath = args[0] || DEFAULT_SESSION;

const baseDir = path.resolve(__dirname, '..', '..');
const resolvedPath = path.isAbsolute(sessionPath)
  ? sessionPath
  : path.join(baseDir, sessionPath);

try {
  runPauseResumeTest(resolvedPath);
} catch (err) {
  console.error('Error:', (err as Error).message);
  process.exit(1);
}
