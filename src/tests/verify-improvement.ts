#!/usr/bin/env ts-node
/**
 * Verify Pause/Resume Improvement
 * ================================
 *
 * Compares actual SD PnL vs simulated pause/resume PnL to verify
 * the expected +1504 improvement from SAMEDIR-PAUSE-RESUME-SPEC.md
 *
 * Methodology (matching the spec's analysis):
 * 1. Take all SD trades as they actually occurred
 * 2. Track pause state based on triggers (HIGH_PCT reversal + loss, 2+ consecutive losses)
 * 3. Track resume state based on ZZ/XAX breaks
 * 4. Simulated PnL = sum of trades that would be REAL (not during pause)
 * 5. Improvement = Simulated PnL - Actual PnL
 */

import * as fs from 'fs';
import * as path from 'path';
import { ZZ_XAX_PATTERNS } from '../engine/same-direction';
import { Direction } from '../types';

// ============================================================================
// TYPES
// ============================================================================

interface Block {
  dir: Direction;
  pct: number;
  index: number;
  ts: string;
}

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

interface SessionResult {
  name: string;
  actualPnL: number;
  simulatedPnL: number;
  improvement: number;
  realTrades: number;
  imaginaryTrades: number;
  pauseEvents: number;
  resumeEvents: number;
}

// ============================================================================
// SIMULATION (matching spec's analysis methodology)
// ============================================================================

function simulateSession(sessionPath: string): SessionResult {
  const data = fs.readFileSync(sessionPath, 'utf8');
  const session: SessionLog = JSON.parse(data);
  const name = path.basename(sessionPath);

  // Get SD and ZZ/XAX trades
  const sdTrades = session.trades.filter(t => t.pattern === 'SameDir');
  const zzXaxTrades = session.trades.filter(t =>
    ZZ_XAX_PATTERNS.includes(t.pattern as typeof ZZ_XAX_PATTERNS[number])
  );

  // Calculate actual SD PnL
  const actualPnL = sdTrades.reduce((sum, t) => sum + t.pnl, 0);

  // Pause/resume state tracking
  let isPaused = false;
  let consecutiveLosses = 0;
  let breakSignalReceived = false;  // True if ZZ/XAX loss occurred while paused

  // Results tracking
  let simulatedPnL = 0;
  let realTrades = 0;
  let imaginaryTrades = 0;
  let pauseEvents = 0;
  let resumeEvents = 0;

  // Sort all trades by evalIndex for chronological processing
  const allTrades = [...sdTrades, ...zzXaxTrades].sort((a, b) => a.evalIndex - b.evalIndex);

  console.log(`\n--- ${name} ---`);

  for (const trade of allTrades) {
    const isSDTrade = trade.pattern === 'SameDir';
    const block = session.blocks[trade.evalIndex];
    const prevBlock = trade.evalIndex > 0 ? session.blocks[trade.evalIndex - 1] : null;
    const isReversal = prevBlock !== null && block.dir !== prevBlock.dir;

    if (isSDTrade) {
      // === LOGIC ORDER (matching original analyze-zz-break-resume.js) ===
      // 1. Check PAUSE triggers FIRST (before determining trade type)
      // 2. Determine trade type based on isPaused
      // 3. Check RESUME (can override tradeType to REAL)
      // 4. Update consecutive losses based on final tradeType

      let event = '';

      // Step 1: Check PAUSE triggers (only if not already paused)
      if (!isPaused) {
        let shouldPause = false;

        // Trigger 1: HIGH_PCT reversal + loss
        if (isReversal && block.pct >= 70 && !trade.isWin) {
          shouldPause = true;
          event = `PAUSE: HIGH_PCT ${block.pct}%`;
        }

        // Trigger 2: 2+ consecutive losses (consecutiveLosses >= 1 means this is 2nd)
        if (consecutiveLosses >= 1 && !trade.isWin) {
          shouldPause = true;
          event = event || `PAUSE: CONSEC ${consecutiveLosses + 1}L`;
        }

        if (shouldPause) {
          isPaused = true;
          pauseEvents++;
        }
      }

      // Step 2: Initial trade type based on isPaused
      let tradeType: 'REAL' | 'IMG' = isPaused ? 'IMG' : 'REAL';

      // Step 3: Check RESUME (can override tradeType to REAL)
      if (isPaused && breakSignalReceived) {
        isPaused = false;
        breakSignalReceived = false;
        tradeType = 'REAL';  // This trade is real because ZZ just broke
        event = 'RESUME (ZZ broke)';
        resumeEvents++;
      }

      // Step 4: Track PnL and update consecutive losses
      if (tradeType === 'REAL') {
        realTrades++;
        simulatedPnL += trade.pnl;
        if (trade.isWin) {
          consecutiveLosses = 0;
        } else {
          consecutiveLosses++;
        }
        console.log(`  [Block ${trade.evalIndex}] SD ${trade.isWin ? 'WIN' : 'LOSS'} ${trade.pnl} -> REAL${event ? ' | ' + event : ''}`);
      } else {
        imaginaryTrades++;
        console.log(`  [Block ${trade.evalIndex}] SD ${trade.isWin ? 'WIN' : 'LOSS'} ${trade.pnl} -> IMG${event ? ' | ' + event : ''}`);
      }
    } else {
      // ZZ/XAX trade - check for break signal while paused
      if (isPaused && !trade.isWin) {
        breakSignalReceived = true;
        console.log(`  [Block ${trade.evalIndex}] ${trade.pattern} LOSS << BREAK SIGNAL`);
      } else {
        console.log(`  [Block ${trade.evalIndex}] ${trade.pattern} ${trade.isWin ? 'WIN' : 'LOSS'}`);
      }
    }
  }

  return {
    name,
    actualPnL,
    simulatedPnL,
    improvement: simulatedPnL - actualPnL,
    realTrades,
    imaginaryTrades,
    pauseEvents,
    resumeEvents,
  };
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
  console.log('='.repeat(80));
  console.log('  PAUSE/RESUME IMPROVEMENT VERIFICATION');
  console.log('='.repeat(80));

  const baseDir = path.resolve(__dirname, '..', '..');
  const sessions = [
    'data/sessions/session_2025-12-24T18-19-24-936Z.json',
    'data/sessions/session_2025-12-24T18-57-18-606Z.json',
  ];

  const results: SessionResult[] = [];

  for (const sessionPath of sessions) {
    const fullPath = path.join(baseDir, sessionPath);
    const result = simulateSession(fullPath);
    results.push(result);
    console.log(`\n  Summary:`);
    console.log(`    Actual PnL: ${result.actualPnL}`);
    console.log(`    Simulated PnL: ${result.simulatedPnL}`);
    console.log(`    Improvement: ${result.improvement > 0 ? '+' : ''}${result.improvement}`);
    console.log(`    Real trades: ${result.realTrades}, Imaginary: ${result.imaginaryTrades}`);
    console.log(`    Pauses: ${result.pauseEvents}, Resumes: ${result.resumeEvents}`);
  }

  // Summary
  const totalActual = results.reduce((sum, r) => sum + r.actualPnL, 0);
  const totalSimulated = results.reduce((sum, r) => sum + r.simulatedPnL, 0);
  const totalImprovement = totalSimulated - totalActual;

  console.log('\n' + '='.repeat(80));
  console.log('  SUMMARY');
  console.log('='.repeat(80));
  console.log();
  console.log('| Metric              | Session 1 | Session 2 | Total   |');
  console.log('|---------------------|-----------|-----------|---------|');
  console.log(`| Actual SD PnL       | ${String(results[0].actualPnL).padStart(9)} | ${String(results[1].actualPnL).padStart(9)} | ${String(totalActual).padStart(7)} |`);
  console.log(`| With Pause/Resume   | ${String(results[0].simulatedPnL).padStart(9)} | ${String(results[1].simulatedPnL).padStart(9)} | ${String(totalSimulated).padStart(7)} |`);
  console.log(`| **Improvement**     | ${String((results[0].improvement > 0 ? '+' : '') + results[0].improvement).padStart(9)} | ${String((results[1].improvement > 0 ? '+' : '') + results[1].improvement).padStart(9)} | ${String((totalImprovement > 0 ? '+' : '') + totalImprovement).padStart(7)} |`);
  console.log();

  // Expected values from spec
  console.log('EXPECTED (from SAMEDIR-PAUSE-RESUME-SPEC.md):');
  console.log('| Metric              | Session 1 | Session 2 | Total   |');
  console.log('|---------------------|-----------|-----------|---------|');
  console.log('| Actual SD PnL       |      -638 |      +816 |    +178 |');
  console.log('| With Pause/Resume   |      +478 |     +1204 |   +1682 |');
  console.log('| **Improvement**     |     +1116 |      +388 |   +1504 |');
  console.log();

  // Verification
  console.log('='.repeat(80));
  console.log('  VERIFICATION');
  console.log('='.repeat(80));
  console.log();

  const expectedImprovement = 1504;
  const tolerance = 200; // Allow some variance

  if (Math.abs(totalImprovement - expectedImprovement) <= tolerance) {
    console.log(`✓ PASSED: Improvement ${totalImprovement > 0 ? '+' : ''}${totalImprovement} is within tolerance of expected +${expectedImprovement}`);
  } else if (totalImprovement > 0) {
    console.log(`~ PARTIAL: Improvement ${totalImprovement > 0 ? '+' : ''}${totalImprovement} is positive but differs from expected +${expectedImprovement}`);
    console.log(`  Difference: ${totalImprovement - expectedImprovement}`);
  } else {
    console.log(`✗ FAILED: Improvement ${totalImprovement} is not positive`);
  }
  console.log();
}

main();
