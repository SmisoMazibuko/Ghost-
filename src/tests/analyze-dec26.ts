#!/usr/bin/env ts-node
/**
 * Analyze Dec 26, 2025 Session Results
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

interface Session {
  blocks: { index: number; dir: number; pct: number }[];
  trades: Trade[];
}

function analyze(): void {
  console.log('========================================');
  console.log('  26/12/2025 SESSION ANALYSIS');
  console.log('========================================');
  console.log();

  // Load session
  const sessionPath = path.join(__dirname, '../../data/sessions/session_2025-12-26T09-53-43-729Z.json');
  const session: Session = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));

  console.log('OVERVIEW:');
  console.log(`  Blocks: ${session.blocks.length}`);
  console.log(`  Total Trades: ${session.trades.length}`);
  console.log();

  // Group by pattern
  const byPattern: Record<string, { wins: number; losses: number; pnl: number }> = {};
  for (const t of session.trades) {
    if (!byPattern[t.pattern]) byPattern[t.pattern] = { wins: 0, losses: 0, pnl: 0 };
    if (t.isWin) byPattern[t.pattern].wins++;
    else byPattern[t.pattern].losses++;
    byPattern[t.pattern].pnl += t.pnl;
  }

  console.log('BREAKDOWN BY PATTERN:');
  console.log('| Pattern    | Wins | Losses | Win%  | P/L     |');
  console.log('|------------|------|--------|-------|---------|');

  const sorted = Object.entries(byPattern).sort((a, b) => b[1].pnl - a[1].pnl);
  for (const [pat, data] of sorted) {
    const total = data.wins + data.losses;
    const wr = (data.wins / total * 100).toFixed(0);
    const pnlStr = (data.pnl >= 0 ? '+' : '') + data.pnl.toFixed(0);
    console.log(`| ${pat.padEnd(10)} | ${String(data.wins).padStart(4)} | ${String(data.losses).padStart(6)} | ${wr.padStart(4)}% | ${pnlStr.padStart(7)}% |`);
  }
  console.log();

  // SD specific analysis
  const sdTrades = session.trades.filter(t => t.pattern === 'SameDir');
  console.log('SAMEDIR ANALYSIS:');
  console.log(`  Total SD Trades: ${sdTrades.length}`);

  if (sdTrades.length > 0) {
    const wins = sdTrades.filter(t => t.isWin).length;
    const losses = sdTrades.length - wins;
    const pnl = sdTrades.reduce((sum, t) => sum + t.pnl, 0);

    console.log(`  Wins: ${wins}, Losses: ${losses}`);
    console.log(`  Win Rate: ${(wins / sdTrades.length * 100).toFixed(1)}%`);
    console.log(`  Total P/L: ${pnl >= 0 ? '+' : ''}${pnl}%`);

    // Analyze pause triggers
    let maxConsecLosses = 0;
    let currentConsec = 0;
    let pauseTriggers = 0;

    for (const t of sdTrades) {
      if (!t.isWin) {
        currentConsec++;
        maxConsecLosses = Math.max(maxConsecLosses, currentConsec);

        // Check pause triggers
        if (t.pct >= 70) {
          pauseTriggers++;
          console.log(`    [PAUSE TRIGGER] Block ${t.evalIndex}: HIGH_PCT_REVERSAL (${t.pct}%)`);
        } else if (currentConsec >= 2) {
          pauseTriggers++;
          console.log(`    [PAUSE TRIGGER] Block ${t.evalIndex}: CONSECUTIVE_LOSSES (${currentConsec})`);
        }
      } else {
        currentConsec = 0;
      }
    }

    console.log();
    console.log(`  Max Consecutive Losses: ${maxConsecLosses}`);
    console.log(`  Potential Pause Triggers: ${pauseTriggers}`);

    // Calculate what would have been avoided
    let avoidedPnL = 0;
    let inPause = false;
    let avoidedTrades = 0;
    currentConsec = 0;

    for (const t of sdTrades) {
      if (!t.isWin) {
        currentConsec++;

        // Would pause trigger?
        if (!inPause && (t.pct >= 70 || currentConsec >= 2)) {
          inPause = true;
        }
      } else {
        currentConsec = 0;
      }

      // If in pause, this trade would be imaginary
      if (inPause && !t.isWin) {
        avoidedPnL += Math.abs(t.pnl);
        avoidedTrades++;
      }
    }

    console.log();
    console.log('PAUSE SYSTEM IMPACT (ESTIMATE):');
    console.log(`  Trades that would be IMAGINARY: ${avoidedTrades}`);
    console.log(`  Potential avoided losses: +${avoidedPnL}%`);
  }

  // ZZ/XAX analysis
  const zzPatterns = ['ZZ', 'AntiZZ', '2A2', 'Anti2A2', '3A3', 'Anti3A3'];
  const zzTrades = session.trades.filter(t => zzPatterns.includes(t.pattern));

  if (zzTrades.length > 0) {
    console.log();
    console.log('ZZ/XAX PATTERNS (Resume Triggers):');
    const zzLosses = zzTrades.filter(t => !t.isWin);
    console.log(`  Total ZZ/XAX Trades: ${zzTrades.length}`);
    console.log(`  ZZ/XAX Losses (Resume Triggers): ${zzLosses.length}`);

    for (const t of zzLosses) {
      console.log(`    Block ${t.evalIndex}: ${t.pattern} LOSS → SD would RESUME`);
    }
  }

  // SD trade sequence with pause simulation
  console.log();
  console.log('SD TRADE SEQUENCE (with pause simulation):');
  console.log('-'.repeat(70));

  let consecLosses = 0;
  let isPaused = false;
  let realPnL = 0;
  let imagPnL = 0;

  for (let i = 0; i < sdTrades.length; i++) {
    const t = sdTrades[i];
    const result = t.isWin ? 'WIN ' : 'LOSS';
    const pnlSign = t.pnl >= 0 ? '+' : '';

    let status = '';
    let tradeType = 'REAL';

    if (!t.isWin) {
      consecLosses++;
    } else {
      consecLosses = 0;
    }

    // Check pause trigger
    if (!isPaused && !t.isWin) {
      if (t.pct >= 70) {
        isPaused = true;
        status = ' >>> PAUSE (HIGH_PCT)';
      } else if (consecLosses >= 2) {
        isPaused = true;
        status = ' >>> PAUSE (2 LOSSES)';
      }
    }

    if (isPaused) {
      tradeType = 'IMG ';
      imagPnL += t.pnl;
    } else {
      realPnL += t.pnl;
    }

    console.log(`  #${String(i + 1).padStart(2)} Block ${String(t.evalIndex).padStart(3)}: ${tradeType} ${result} ${pnlSign}${t.pnl}% (pct:${t.pct}%)${status}`);

    // Check for ZZ/XAX loss after this trade that would resume
    if (isPaused) {
      const nextZZLoss = zzTrades.find(z => !z.isWin && z.evalIndex > t.evalIndex && z.evalIndex <= (sdTrades[i + 1]?.evalIndex ?? Infinity));
      if (nextZZLoss) {
        isPaused = false;
        consecLosses = 0;
        console.log(`       >>> RESUME (${nextZZLoss.pattern} broke at block ${nextZZLoss.evalIndex})`);
      }
    }
  }

  console.log('-'.repeat(70));
  console.log(`  REAL P/L:      ${realPnL >= 0 ? '+' : ''}${realPnL}%`);
  console.log(`  IMAGINARY P/L: ${imagPnL >= 0 ? '+' : ''}${imagPnL}%`);
  console.log(`  DIFFERENCE:    ${(realPnL - (realPnL + imagPnL)) >= 0 ? '+' : ''}${realPnL - (realPnL + imagPnL)}% (avoided)`);
}

analyze();
