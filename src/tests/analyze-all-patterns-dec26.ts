#!/usr/bin/env ts-node
/**
 * Full Pattern Analysis - Dec 26, 2025 Real Results
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
  ts: string;
}

interface Block {
  index: number;
  dir: number;
  pct: number;
  ts: string;
}

interface Session {
  blocks: Block[];
  trades: Trade[];
}

function analyze(): void {
  console.log('═'.repeat(80));
  console.log('  26/12/2025 REAL SESSION - COMPLETE PATTERN ANALYSIS');
  console.log('═'.repeat(80));
  console.log();

  // Load session
  const sessionPath = path.join(__dirname, '../../data/sessions/session_2025-12-26T09-53-43-729Z.json');
  const session: Session = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));

  // ========================================================================
  // OVERALL SESSION STATS
  // ========================================================================
  console.log('SESSION OVERVIEW');
  console.log('─'.repeat(40));
  console.log(`  Duration: Block 0 → Block ${session.blocks.length - 1}`);
  console.log(`  Total Blocks: ${session.blocks.length}`);
  console.log(`  Total Trades: ${session.trades.length}`);

  const totalWins = session.trades.filter(t => t.isWin).length;
  const totalPnL = session.trades.reduce((sum, t) => sum + t.pnl, 0);
  console.log(`  Total Wins: ${totalWins} / ${session.trades.length} (${(totalWins/session.trades.length*100).toFixed(1)}%)`);
  console.log(`  Total P/L: ${totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(0)}%`);
  console.log();

  // ========================================================================
  // GROUP BY PATTERN
  // ========================================================================
  const byPattern: Record<string, Trade[]> = {};
  for (const t of session.trades) {
    if (!byPattern[t.pattern]) byPattern[t.pattern] = [];
    byPattern[t.pattern].push(t);
  }

  // Calculate stats per pattern
  interface PatternStats {
    pattern: string;
    trades: number;
    wins: number;
    losses: number;
    winRate: number;
    pnl: number;
    avgWin: number;
    avgLoss: number;
    maxWin: number;
    maxLoss: number;
    streak: { maxWin: number; maxLoss: number };
  }

  const stats: PatternStats[] = [];

  for (const [pattern, trades] of Object.entries(byPattern)) {
    const wins = trades.filter(t => t.isWin);
    const losses = trades.filter(t => !t.isWin);
    const pnl = trades.reduce((sum, t) => sum + t.pnl, 0);

    // Calculate streaks
    let maxWinStreak = 0, maxLossStreak = 0;
    let currentWinStreak = 0, currentLossStreak = 0;
    for (const t of trades) {
      if (t.isWin) {
        currentWinStreak++;
        currentLossStreak = 0;
        maxWinStreak = Math.max(maxWinStreak, currentWinStreak);
      } else {
        currentLossStreak++;
        currentWinStreak = 0;
        maxLossStreak = Math.max(maxLossStreak, currentLossStreak);
      }
    }

    stats.push({
      pattern,
      trades: trades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: wins.length / trades.length * 100,
      pnl,
      avgWin: wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0,
      avgLoss: losses.length > 0 ? losses.reduce((s, t) => s + Math.abs(t.pnl), 0) / losses.length : 0,
      maxWin: wins.length > 0 ? Math.max(...wins.map(t => t.pnl)) : 0,
      maxLoss: losses.length > 0 ? Math.max(...losses.map(t => Math.abs(t.pnl))) : 0,
      streak: { maxWin: maxWinStreak, maxLoss: maxLossStreak },
    });
  }

  // Sort by P/L
  stats.sort((a, b) => b.pnl - a.pnl);

  // ========================================================================
  // PATTERN RANKINGS
  // ========================================================================
  console.log('PATTERN RANKINGS (by P/L)');
  console.log('─'.repeat(80));
  console.log('| Rank | Pattern    | Trades | W/L    | Win%  | P/L      | AvgW | AvgL | Streak |');
  console.log('|------|------------|--------|--------|-------|----------|------|------|--------|');

  let rank = 1;
  for (const s of stats) {
    const pnlStr = (s.pnl >= 0 ? '+' : '') + s.pnl.toFixed(0);
    const streakStr = `${s.streak.maxWin}W/${s.streak.maxLoss}L`;
    console.log(`| ${String(rank).padStart(4)} | ${s.pattern.padEnd(10)} | ${String(s.trades).padStart(6)} | ${s.wins}/${s.losses}`.padEnd(17) + ` | ${s.winRate.toFixed(0).padStart(4)}% | ${pnlStr.padStart(7)}% | ${s.avgWin.toFixed(0).padStart(4)} | ${s.avgLoss.toFixed(0).padStart(4)} | ${streakStr.padStart(6)} |`);
    rank++;
  }
  console.log();

  // ========================================================================
  // CATEGORY ANALYSIS
  // ========================================================================
  console.log('CATEGORY BREAKDOWN');
  console.log('─'.repeat(60));

  // ZZ Family
  const zzFamily = ['ZZ', 'AntiZZ'];
  const zzStats = stats.filter(s => zzFamily.includes(s.pattern));
  const zzTotal = zzStats.reduce((sum, s) => sum + s.pnl, 0);
  const zzTrades = zzStats.reduce((sum, s) => sum + s.trades, 0);
  const zzWins = zzStats.reduce((sum, s) => sum + s.wins, 0);
  console.log(`  ZZ FAMILY (ZZ, AntiZZ):`);
  console.log(`    Trades: ${zzTrades}, Wins: ${zzWins} (${(zzWins/zzTrades*100).toFixed(0)}%)`);
  console.log(`    P/L: ${zzTotal >= 0 ? '+' : ''}${zzTotal}%`);
  console.log();

  // XAX Family
  const xaxFamily = ['2A2', 'Anti2A2', '3A3', 'Anti3A3', '4A4', 'Anti4A4', '5A5', 'Anti5A5'];
  const xaxStats = stats.filter(s => xaxFamily.includes(s.pattern));
  const xaxTotal = xaxStats.reduce((sum, s) => sum + s.pnl, 0);
  const xaxTrades = xaxStats.reduce((sum, s) => sum + s.trades, 0);
  const xaxWins = xaxStats.reduce((sum, s) => sum + s.wins, 0);
  console.log(`  XAX FAMILY (2A2-5A5 + Anti):`);
  console.log(`    Trades: ${xaxTrades}, Wins: ${xaxWins} (${(xaxWins/xaxTrades*100).toFixed(0)}%)`);
  console.log(`    P/L: ${xaxTotal >= 0 ? '+' : ''}${xaxTotal}%`);
  for (const s of xaxStats.sort((a,b) => b.pnl - a.pnl)) {
    console.log(`      ${s.pattern.padEnd(8)}: ${s.wins}W/${s.losses}L = ${s.pnl >= 0 ? '+' : ''}${s.pnl}%`);
  }
  console.log();

  // SameDir
  const sdStats = stats.find(s => s.pattern === 'SameDir');
  if (sdStats) {
    console.log(`  SAMEDIR:`);
    console.log(`    Trades: ${sdStats.trades}, Wins: ${sdStats.wins} (${sdStats.winRate.toFixed(0)}%)`);
    console.log(`    P/L: ${sdStats.pnl >= 0 ? '+' : ''}${sdStats.pnl}%`);
    console.log(`    Avg Win: +${sdStats.avgWin.toFixed(0)}%, Avg Loss: -${sdStats.avgLoss.toFixed(0)}%`);
    console.log(`    Max Win: +${sdStats.maxWin.toFixed(0)}%, Max Loss: -${sdStats.maxLoss.toFixed(0)}%`);
    console.log();
  }

  // Other patterns
  const otherPatterns = ['OZ', 'AP5', 'ST', 'PP'];
  const otherStats = stats.filter(s => otherPatterns.includes(s.pattern));
  console.log(`  OTHER PATTERNS:`);
  for (const s of otherStats.sort((a,b) => b.pnl - a.pnl)) {
    const status = s.pnl >= 0 ? '✓' : '✗';
    console.log(`    ${status} ${s.pattern.padEnd(4)}: ${s.wins}W/${s.losses}L (${s.winRate.toFixed(0)}%) = ${s.pnl >= 0 ? '+' : ''}${s.pnl}%`);
  }
  console.log();

  // ========================================================================
  // PROBLEM PATTERNS
  // ========================================================================
  const losers = stats.filter(s => s.pnl < 0);
  if (losers.length > 0) {
    console.log('UNDERPERFORMING PATTERNS');
    console.log('─'.repeat(60));
    for (const s of losers) {
      console.log(`  ${s.pattern}:`);
      console.log(`    Result: ${s.wins}W/${s.losses}L = ${s.pnl}%`);
      console.log(`    Win Rate: ${s.winRate.toFixed(0)}% (below breakeven)`);
      console.log(`    Max Loss Streak: ${s.streak.maxLoss}`);

      // Show the losing trades
      const patternTrades = byPattern[s.pattern];
      console.log(`    Trade sequence:`);
      for (const t of patternTrades) {
        const result = t.isWin ? 'W' : 'L';
        console.log(`      Block ${t.evalIndex}: ${result} ${t.pnl >= 0 ? '+' : ''}${t.pnl}%`);
      }
      console.log();
    }
  }

  // ========================================================================
  // TOP PERFORMERS DEEP DIVE
  // ========================================================================
  console.log('TOP PERFORMERS ANALYSIS');
  console.log('─'.repeat(60));

  const topPerformers = stats.slice(0, 3);
  for (const s of topPerformers) {
    console.log(`  ${s.pattern}:`);
    console.log(`    Performance: ${s.wins}W/${s.losses}L (${s.winRate.toFixed(0)}%) = +${s.pnl}%`);
    console.log(`    Avg Win: +${s.avgWin.toFixed(0)}%, Max Win: +${s.maxWin.toFixed(0)}%`);
    if (s.losses > 0) {
      console.log(`    Avg Loss: -${s.avgLoss.toFixed(0)}%, Max Loss: -${s.maxLoss.toFixed(0)}%`);
    }
    console.log(`    Best Streak: ${s.streak.maxWin} wins in a row`);

    // Show trade sequence
    const patternTrades = byPattern[s.pattern];
    const sequence = patternTrades.map(t => t.isWin ? 'W' : 'L').join('');
    console.log(`    Sequence: ${sequence}`);
    console.log();
  }

  // ========================================================================
  // TIMING ANALYSIS
  // ========================================================================
  console.log('TIMING ANALYSIS (by block ranges)');
  console.log('─'.repeat(60));

  const ranges = [
    { name: 'Early (0-50)', min: 0, max: 50 },
    { name: 'Mid (51-100)', min: 51, max: 100 },
    { name: 'Late (101-150)', min: 101, max: 150 },
    { name: 'Final (151+)', min: 151, max: 999 },
  ];

  for (const range of ranges) {
    const tradesInRange = session.trades.filter(t => t.evalIndex >= range.min && t.evalIndex <= range.max);
    if (tradesInRange.length === 0) continue;

    const rangeWins = tradesInRange.filter(t => t.isWin).length;
    const rangePnL = tradesInRange.reduce((sum, t) => sum + t.pnl, 0);
    console.log(`  ${range.name}:`);
    console.log(`    Trades: ${tradesInRange.length}, Wins: ${rangeWins} (${(rangeWins/tradesInRange.length*100).toFixed(0)}%)`);
    console.log(`    P/L: ${rangePnL >= 0 ? '+' : ''}${rangePnL.toFixed(0)}%`);
  }
  console.log();

  // ========================================================================
  // SUMMARY
  // ========================================================================
  console.log('═'.repeat(80));
  console.log('SUMMARY');
  console.log('═'.repeat(80));

  const profitable = stats.filter(s => s.pnl > 0).length;
  const unprofitable = stats.filter(s => s.pnl < 0).length;

  console.log(`  Profitable Patterns: ${profitable}/${stats.length}`);
  console.log(`  Unprofitable Patterns: ${unprofitable}/${stats.length}`);
  console.log();
  console.log(`  Best Pattern:  ${stats[0].pattern} (+${stats[0].pnl}%)`);
  console.log(`  Worst Pattern: ${stats[stats.length-1].pattern} (${stats[stats.length-1].pnl}%)`);
  console.log();
  console.log(`  ZZ Family Contribution:    +${zzTotal}% (${(zzTotal/totalPnL*100).toFixed(0)}% of total)`);
  console.log(`  XAX Family Contribution:   +${xaxTotal}% (${(xaxTotal/totalPnL*100).toFixed(0)}% of total)`);
  if (sdStats) {
    console.log(`  SameDir Contribution:      +${sdStats.pnl}% (${(sdStats.pnl/totalPnL*100).toFixed(0)}% of total)`);
  }
  console.log();
  console.log(`  SESSION TOTAL: ${totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(0)}%`);
  console.log('═'.repeat(80));
}

analyze();
