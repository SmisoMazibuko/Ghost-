#!/usr/bin/env ts-node
/**
 * ST & PP Activation Analysis - Dec 26, 2025
 * Shows the problem of premature activation
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

function analyze(): void {
  console.log('═'.repeat(80));
  console.log('  ST & PP ACTIVATION ANALYSIS - 26/12/2025');
  console.log('  Problem: Premature activation blocking BNS inverse play');
  console.log('═'.repeat(80));
  console.log();

  // Load session
  const sessionPath = path.join(__dirname, '../../data/sessions/session_2025-12-26T09-53-43-729Z.json');
  const session: Session = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));

  // Analyze ST
  console.log('═'.repeat(80));
  console.log('  ST (STREET) PATTERN ANALYSIS');
  console.log('═'.repeat(80));

  const stTrades = session.trades.filter(t => t.pattern === 'ST');
  console.log(`\n  Total ST Trades: ${stTrades.length}`);
  console.log(`  Result: ${stTrades.filter(t => t.isWin).length}W/${stTrades.filter(t => !t.isWin).length}L = ${stTrades.reduce((s, t) => s + t.pnl, 0)}%`);
  console.log();

  console.log('  ST Trade Details:');
  console.log('  ─'.repeat(35));

  for (const t of stTrades) {
    const result = t.isWin ? 'WIN ' : 'LOSS';
    const pnlStr = (t.pnl >= 0 ? '+' : '') + t.pnl.toFixed(0);
    console.log(`  Block ${t.evalIndex}: ${result} ${pnlStr}% (predicted: ${t.predictedDirection > 0 ? 'G' : 'R'}, actual: ${t.actualDirection > 0 ? 'G' : 'R'})`);

    // Show context - blocks around the trade
    const start = Math.max(0, t.openIndex - 5);
    const end = Math.min(session.blocks.length - 1, t.evalIndex + 2);
    const context = session.blocks.slice(start, end + 1);
    const contextStr = context.map(b => {
      const marker = b.index === t.openIndex ? '[' : b.index === t.evalIndex ? ']' : ' ';
      return `${marker}${b.dir > 0 ? 'G' : 'R'}${b.pct}${marker}`;
    }).join(' ');
    console.log(`    Context: ${contextStr}`);

    // Analyze what went wrong
    if (!t.isWin) {
      // Check if inverse would have won
      const inverseWouldWin = t.predictedDirection !== t.actualDirection;
      console.log(`    → Inverse would have: ${inverseWouldWin ? 'LOST' : 'WON'} (${inverseWouldWin ? 'same as actual' : 'MISSED OPPORTUNITY'})`);
    }
    console.log();
  }

  // What ST should require
  console.log('  ACTIVATION RULES (Current):');
  console.log('  ─'.repeat(35));
  console.log('    - Requires: double (2) → flip (1)');
  console.log('    - Activates on: 70% single OR 100% cumulative');
  console.log('    - Problem: Activates too easily, not enough confirmation');
  console.log();

  console.log('  RECOMMENDATION:');
  console.log('  ─'.repeat(35));
  console.log('    - Require: ≥3 indicator → 2-2 rhythm established (min 2 doubles)');
  console.log('    - Confirm: 70% on BOTH doubles before first bet');
  console.log('    - OR: Keep in WAITING until proven rhythm (cumulative 200%+)');
  console.log();

  // Analyze PP
  console.log('═'.repeat(80));
  console.log('  PP (PING-PONG) PATTERN ANALYSIS');
  console.log('═'.repeat(80));

  const ppTrades = session.trades.filter(t => t.pattern === 'PP');
  console.log(`\n  Total PP Trades: ${ppTrades.length}`);
  console.log(`  Result: ${ppTrades.filter(t => t.isWin).length}W/${ppTrades.filter(t => !t.isWin).length}L = ${ppTrades.reduce((s, t) => s + t.pnl, 0)}%`);
  console.log();

  console.log('  PP Trade Details:');
  console.log('  ─'.repeat(35));

  let ppInversePnL = 0;

  for (const t of ppTrades) {
    const result = t.isWin ? 'WIN ' : 'LOSS';
    const pnlStr = (t.pnl >= 0 ? '+' : '') + t.pnl.toFixed(0);
    console.log(`  Block ${t.evalIndex}: ${result} ${pnlStr}% (predicted: ${t.predictedDirection > 0 ? 'G' : 'R'}, actual: ${t.actualDirection > 0 ? 'G' : 'R'})`);

    // Show context
    const start = Math.max(0, t.openIndex - 5);
    const end = Math.min(session.blocks.length - 1, t.evalIndex + 2);
    const context = session.blocks.slice(start, end + 1);
    const contextStr = context.map(b => {
      const marker = b.index === t.openIndex ? '[' : b.index === t.evalIndex ? ']' : ' ';
      return `${marker}${b.dir > 0 ? 'G' : 'R'}${b.pct}${marker}`;
    }).join(' ');
    console.log(`    Context: ${contextStr}`);

    // Analyze inverse performance
    if (!t.isWin) {
      // Loss means actual was opposite of predicted, so inverse would have won
      ppInversePnL += Math.abs(t.pnl); // Would have been a win
      console.log(`    → If INVERSE (BNS): Would have WON +${Math.abs(t.pnl)}%`);
    } else {
      // Win means actual matched predicted, so inverse would have lost
      ppInversePnL -= Math.abs(t.pnl); // Would have been a loss
      console.log(`    → If INVERSE (BNS): Would have LOST -${Math.abs(t.pnl)}%`);
    }
    console.log();
  }

  console.log('  BNS INVERSE SIMULATION:');
  console.log('  ─'.repeat(35));
  console.log(`    Actual PP P/L:     ${ppTrades.reduce((s, t) => s + t.pnl, 0)}%`);
  console.log(`    If BNS Inverse:    ${ppInversePnL >= 0 ? '+' : ''}${ppInversePnL}%`);
  console.log(`    Difference:        ${ppInversePnL - ppTrades.reduce((s, t) => s + t.pnl, 0) >= 0 ? '+' : ''}${ppInversePnL - ppTrades.reduce((s, t) => s + t.pnl, 0)}%`);
  console.log();

  console.log('  ACTIVATION RULES (Current):');
  console.log('  ─'.repeat(35));
  console.log('    - Confirms on: double (2) with 70% on 1st block');
  console.log('    - Signals on: double (2) → single (1)');
  console.log('    - Problem: 1-2 rhythm may not be established yet');
  console.log();

  console.log('  RECOMMENDATION:');
  console.log('  ─'.repeat(35));
  console.log('    - Require: 1-2-1-2 sequence (at least 2 cycles) before activation');
  console.log('    - OR: Higher threshold (90%+ or cumulative 200%+)');
  console.log('    - OR: Start in BNS bucket until proven profitable');
  console.log();

  // Summary
  console.log('═'.repeat(80));
  console.log('  SUMMARY: PREMATURE ACTIVATION IMPACT');
  console.log('═'.repeat(80));
  console.log();

  const stActualPnL = stTrades.reduce((s, t) => s + t.pnl, 0);
  const ppActualPnL = ppTrades.reduce((s, t) => s + t.pnl, 0);

  // Calculate what BNS inverse would have gotten for ST
  let stInversePnL = 0;
  for (const t of stTrades) {
    if (t.isWin) {
      stInversePnL -= Math.abs(t.pnl);
    } else {
      stInversePnL += Math.abs(t.pnl);
    }
  }

  console.log('  PATTERN | ACTUAL P/L | IF BNS INVERSE | LOST OPPORTUNITY');
  console.log('  ─'.repeat(35));
  console.log(`  ST      | ${stActualPnL >= 0 ? '+' : ''}${stActualPnL.toString().padStart(5)}%    | ${stInversePnL >= 0 ? '+' : ''}${stInversePnL.toString().padStart(5)}%         | ${(stInversePnL - stActualPnL) >= 0 ? '+' : ''}${(stInversePnL - stActualPnL)}%`);
  console.log(`  PP      | ${ppActualPnL >= 0 ? '+' : ''}${ppActualPnL.toString().padStart(5)}%    | ${ppInversePnL >= 0 ? '+' : ''}${ppInversePnL.toString().padStart(5)}%         | ${(ppInversePnL - ppActualPnL) >= 0 ? '+' : ''}${(ppInversePnL - ppActualPnL)}%`);
  console.log('  ─'.repeat(35));
  const totalActual = stActualPnL + ppActualPnL;
  const totalInverse = stInversePnL + ppInversePnL;
  console.log(`  TOTAL   | ${totalActual >= 0 ? '+' : ''}${totalActual.toString().padStart(5)}%    | ${totalInverse >= 0 ? '+' : ''}${totalInverse.toString().padStart(5)}%         | ${(totalInverse - totalActual) >= 0 ? '+' : ''}${(totalInverse - totalActual)}%`);
  console.log();

  console.log('  CONCLUSION:');
  console.log('  ─'.repeat(35));
  console.log(`    ST & PP lost a combined ${Math.abs(totalActual)}% due to premature activation.`);
  console.log(`    If they had been in BNS bucket with inverse play: ${totalInverse >= 0 ? '+' : ''}${totalInverse}%`);
  console.log(`    Total opportunity cost: ${(totalInverse - totalActual) >= 0 ? '+' : ''}${totalInverse - totalActual}%`);
  console.log();
  console.log('  The patterns activated before the rhythm was truly established,');
  console.log('  resulting in losses that also blocked BNS inverse opportunities.');
  console.log('═'.repeat(80));
}

analyze();
