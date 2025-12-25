/**
 * Actual/Simulated Ledger - Dual Ledger for Profit/Loss Management
 * =================================================================
 *
 * Tracks two separate ledgers:
 * - Actual: Real trades with real money
 * - Simulated: Trades that would have happened during pauses
 *
 * This allows evaluation of "what would have happened" during pauses
 * while protecting actual capital.
 */

import {
  LedgerEntry,
  DualLedger,
  PatternName,
} from '../types';

export class ActualSimLedger {
  private actual: LedgerEntry[] = [];
  private simulated: LedgerEntry[] = [];

  /**
   * Record an actual trade (real money)
   */
  recordActualTrade(entry: Omit<LedgerEntry, 'isActual'>): void {
    this.actual.push({
      ...entry,
      isActual: true,
    });
  }

  /**
   * Record a simulated trade (during pause)
   */
  recordSimulatedTrade(entry: Omit<LedgerEntry, 'isActual'>): void {
    this.simulated.push({
      ...entry,
      isActual: false,
    });
  }

  /**
   * Get total PnL from actual trades only
   */
  getActualPnl(): number {
    return this.actual.reduce((sum, entry) => sum + entry.pnl, 0);
  }

  /**
   * Get total PnL from simulated trades only
   */
  getSimulatedPnl(): number {
    return this.simulated.reduce((sum, entry) => sum + entry.pnl, 0);
  }

  /**
   * Get combined PnL (actual + simulated) for evaluation purposes
   */
  getTotalPnl(): number {
    return this.getActualPnl() + this.getSimulatedPnl();
  }

  /**
   * Get all actual trades
   */
  getActualTrades(): LedgerEntry[] {
    return [...this.actual];
  }

  /**
   * Get all simulated trades
   */
  getSimulatedTrades(): LedgerEntry[] {
    return [...this.simulated];
  }

  /**
   * Get actual trade count
   */
  getActualTradeCount(): number {
    return this.actual.length;
  }

  /**
   * Get simulated trade count
   */
  getSimulatedTradeCount(): number {
    return this.simulated.length;
  }

  /**
   * Get actual win rate
   */
  getActualWinRate(): number {
    if (this.actual.length === 0) return 0;
    const wins = this.actual.filter(e => e.isWin).length;
    return wins / this.actual.length;
  }

  /**
   * Get simulated win rate
   */
  getSimulatedWinRate(): number {
    if (this.simulated.length === 0) return 0;
    const wins = this.simulated.filter(e => e.isWin).length;
    return wins / this.simulated.length;
  }

  /**
   * Get performance during a specific block range (for pause evaluation)
   */
  getSimulatedPerformance(blockRange: [number, number]): {
    trades: number;
    wins: number;
    pnl: number;
    patterns: Record<PatternName, { trades: number; pnl: number; wins: number }>;
  } {
    const [startBlock, endBlock] = blockRange;
    const rangeEntries = this.simulated.filter(
      e => e.blockIndex >= startBlock && e.blockIndex <= endBlock
    );

    const patterns: Record<PatternName, { trades: number; pnl: number; wins: number }> = {} as any;

    rangeEntries.forEach(entry => {
      if (!patterns[entry.pattern]) {
        patterns[entry.pattern] = { trades: 0, pnl: 0, wins: 0 };
      }
      patterns[entry.pattern].trades++;
      patterns[entry.pattern].pnl += entry.pnl;
      if (entry.isWin) patterns[entry.pattern].wins++;
    });

    return {
      trades: rangeEntries.length,
      wins: rangeEntries.filter(e => e.isWin).length,
      pnl: rangeEntries.reduce((sum, e) => sum + e.pnl, 0),
      patterns,
    };
  }

  /**
   * Get consecutive losses count from actual trades
   */
  getConsecutiveLosses(): number {
    let count = 0;
    for (let i = this.actual.length - 1; i >= 0; i--) {
      if (!this.actual[i].isWin) {
        count++;
      } else {
        break;
      }
    }
    return count;
  }

  /**
   * Get last N actual trades
   */
  getLastActualTrades(n: number): LedgerEntry[] {
    return this.actual.slice(-n);
  }

  /**
   * Get last N simulated trades
   */
  getLastSimulatedTrades(n: number): LedgerEntry[] {
    return this.simulated.slice(-n);
  }

  /**
   * Get snapshot of current ledger state (for undo system)
   */
  getSnapshot(): DualLedger {
    return {
      actual: [...this.actual],
      simulated: [...this.simulated],
    };
  }

  /**
   * Restore ledger from snapshot (for undo system)
   */
  restoreFromSnapshot(snapshot: DualLedger): void {
    this.actual = [...snapshot.actual];
    this.simulated = [...snapshot.simulated];
  }

  /**
   * Clear all entries (for reset/new session)
   */
  clear(): void {
    this.actual = [];
    this.simulated = [];
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    actual: { trades: number; wins: number; pnl: number; winRate: number };
    simulated: { trades: number; wins: number; pnl: number; winRate: number };
    combined: { trades: number; wins: number; pnl: number; winRate: number };
  } {
    const actualWins = this.actual.filter(e => e.isWin).length;
    const simWins = this.simulated.filter(e => e.isWin).length;
    const totalTrades = this.actual.length + this.simulated.length;
    const totalWins = actualWins + simWins;

    return {
      actual: {
        trades: this.actual.length,
        wins: actualWins,
        pnl: this.getActualPnl(),
        winRate: this.actual.length > 0 ? actualWins / this.actual.length : 0,
      },
      simulated: {
        trades: this.simulated.length,
        wins: simWins,
        pnl: this.getSimulatedPnl(),
        winRate: this.simulated.length > 0 ? simWins / this.simulated.length : 0,
      },
      combined: {
        trades: totalTrades,
        wins: totalWins,
        pnl: this.getTotalPnl(),
        winRate: totalTrades > 0 ? totalWins / totalTrades : 0,
      },
    };
  }
}
