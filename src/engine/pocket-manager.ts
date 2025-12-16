/**
 * @deprecated This file is DEPRECATED and should NOT be used.
 *
 * ZZ/AntiZZ pocket management is now handled by ZZStateManager in zz-state-manager.ts.
 * See POCKET-SYSTEM-SPEC.md for the authoritative rules.
 *
 * This file is kept for backwards compatibility but may be removed in a future version.
 *
 * ---
 * Ghost Evaluator v15.3 - ZZ Pocket Manager (DEPRECATED)
 * ======================================================
 * Manages the 2-pocket system for ZZ/Anti-ZZ betting decisions.
 *
 * POCKET RULES (same for both ZZ and Anti-ZZ):
 * - Pocket 1: Previous run profit >= 0 → BET the active pattern
 * - Pocket 2: Previous run profit < 0 → DON'T BET (sit out)
 *
 * PATTERN ACTIVATION:
 * - ZZ activates: On ZZ indicators (if previous first bet was NOT negative)
 * - Anti-ZZ activates: On ZZ indicators (if previous first bet WAS negative)
 *
 * TRANSITIONS:
 * - After profitable run → Pocket 1
 * - After negative run → Pocket 2
 */

import { Direction } from '../types';

// ============================================================================
// TYPES
// ============================================================================

export type PocketNumber = 1 | 2;

export interface PocketState {
  currentPocket: PocketNumber;
  previousRunProfit: number;
  previousRunFirstBetFailed: boolean;
  runHistory: PocketRunRecord[];
}

export interface PocketRunRecord {
  runNumber: number;
  pocket: PocketNumber;
  wasAntiZZ: boolean;
  firstBetProfit: number;
  totalProfit: number;
  betCount: number;
  startBlock: number;
  endBlock: number;
  timestamp: string;
}

export interface CurrentRunState {
  isActive: boolean;
  isAntiZZ: boolean;
  pocket: PocketNumber;
  firstBetProfit: number | null;
  totalProfit: number;
  betCount: number;
  startBlock: number;
  indicatorDirection: Direction | null;
}

// ============================================================================
// POCKET MANAGER CLASS
// ============================================================================

export class PocketManager {
  private state: PocketState;
  private currentRun: CurrentRunState;

  constructor() {
    this.state = this.createInitialState();
    this.currentRun = this.createInactiveRun();
  }

  // --------------------------------------------------------------------------
  // INITIALIZATION
  // --------------------------------------------------------------------------

  private createInitialState(): PocketState {
    return {
      currentPocket: 1,
      previousRunProfit: 0,
      previousRunFirstBetFailed: false,
      runHistory: [],
    };
  }

  private createInactiveRun(): CurrentRunState {
    return {
      isActive: false,
      isAntiZZ: false,
      pocket: 1,
      firstBetProfit: null,
      totalProfit: 0,
      betCount: 0,
      startBlock: -1,
      indicatorDirection: null,
    };
  }

  // --------------------------------------------------------------------------
  // POCKET QUERIES
  // --------------------------------------------------------------------------

  /**
   * Get current pocket (1 or 2)
   */
  getCurrentPocket(): PocketNumber {
    return this.state.currentPocket;
  }

  /**
   * Check if in Pocket 1 (can bet)
   */
  isInPocket1(): boolean {
    return this.state.currentPocket === 1;
  }

  /**
   * Check if in Pocket 2 (sit out)
   */
  isInPocket2(): boolean {
    return this.state.currentPocket === 2;
  }

  /**
   * Check if a ZZ run is currently active
   */
  isRunActive(): boolean {
    return this.currentRun.isActive;
  }

  /**
   * Check if current run is Anti-ZZ
   */
  isAntiZZRun(): boolean {
    return this.currentRun.isActive && this.currentRun.isAntiZZ;
  }

  /**
   * Check if should bet based on pocket
   *
   * RULES (same for ZZ and Anti-ZZ):
   * - Pocket 1: BET the active pattern
   * - Pocket 2: DON'T BET (sit out)
   */
  shouldBet(): boolean {
    if (!this.currentRun.isActive) {
      return false;
    }

    // Both ZZ and Anti-ZZ follow the same pocket rule
    return this.state.currentPocket === 1;
  }

  /**
   * Check if next activation should be Anti-ZZ
   * (based on previous run's first bet being negative)
   */
  shouldActivateAntiZZ(): boolean {
    return this.state.previousRunFirstBetFailed;
  }

  // --------------------------------------------------------------------------
  // RUN MANAGEMENT
  // --------------------------------------------------------------------------

  /**
   * Start a new ZZ or Anti-ZZ run
   */
  startRun(blockIndex: number, indicatorDirection: Direction): void {
    // Determine if this should be Anti-ZZ
    const isAntiZZ = this.state.previousRunFirstBetFailed;

    // Assign pocket based on previous run profit
    const pocket = this.assignPocket();

    this.currentRun = {
      isActive: true,
      isAntiZZ,
      pocket,
      firstBetProfit: null,
      totalProfit: 0,
      betCount: 0,
      startBlock: blockIndex,
      indicatorDirection,
    };

    // Update state
    this.state.currentPocket = pocket;

    // Clear the Anti-ZZ trigger (consumed)
    this.state.previousRunFirstBetFailed = false;

    const runType = isAntiZZ ? 'Anti-ZZ' : 'ZZ';
    console.log(`[Pocket] ${runType} run started at block ${blockIndex}, Pocket ${pocket}`);
  }

  /**
   * Record a bet result in the current run
   */
  recordBet(profit: number): void {
    if (!this.currentRun.isActive) {
      console.warn('[Pocket] recordBet called but no run active');
      return;
    }

    this.currentRun.betCount++;
    this.currentRun.totalProfit += profit;

    // Track first bet for Anti-ZZ trigger
    if (this.currentRun.firstBetProfit === null) {
      this.currentRun.firstBetProfit = profit;
      const result = profit >= 0 ? 'POSITIVE' : 'NEGATIVE';
      console.log(`[Pocket] First bet: ${profit.toFixed(0)}% (${result})`);
    }
  }

  /**
   * End the current run
   * Returns the run record
   */
  endRun(blockIndex: number): PocketRunRecord | null {
    if (!this.currentRun.isActive) {
      return null;
    }

    // Create run record
    const record: PocketRunRecord = {
      runNumber: this.state.runHistory.length + 1,
      pocket: this.currentRun.pocket,
      wasAntiZZ: this.currentRun.isAntiZZ,
      firstBetProfit: this.currentRun.firstBetProfit ?? 0,
      totalProfit: this.currentRun.totalProfit,
      betCount: this.currentRun.betCount,
      startBlock: this.currentRun.startBlock,
      endBlock: blockIndex,
      timestamp: new Date().toISOString(),
    };

    // Store for history
    this.state.runHistory.push(record);

    // Update state for next run
    this.state.previousRunProfit = this.currentRun.totalProfit;
    this.state.previousRunFirstBetFailed = (this.currentRun.firstBetProfit ?? 0) < 0;

    // Log the transition
    const runType = record.wasAntiZZ ? 'Anti-ZZ' : 'ZZ';
    const nextTrigger = this.state.previousRunFirstBetFailed ? ' → Next will be Anti-ZZ' : '';
    console.log(`[Pocket] ${runType} run ended: Profit=${record.totalProfit.toFixed(0)}%, FirstBet=${record.firstBetProfit.toFixed(0)}%${nextTrigger}`);

    // Reset current run
    this.currentRun = this.createInactiveRun();

    return record;
  }

  /**
   * Check if run should continue (profitable) or end (loss)
   * Returns true if run should continue
   */
  shouldContinueRun(): boolean {
    if (!this.currentRun.isActive) {
      return false;
    }

    // Run continues while total profit is positive
    return this.currentRun.totalProfit >= 0;
  }

  // --------------------------------------------------------------------------
  // POCKET ASSIGNMENT
  // --------------------------------------------------------------------------

  /**
   * Assign pocket based on previous run profit
   */
  private assignPocket(): PocketNumber {
    if (this.state.previousRunProfit >= 0) {
      return 1;
    } else {
      return 2;
    }
  }

  // --------------------------------------------------------------------------
  // STATE ACCESS
  // --------------------------------------------------------------------------

  /**
   * Get full pocket state
   */
  getState(): PocketState {
    return { ...this.state };
  }

  /**
   * Get current run state
   */
  getCurrentRun(): CurrentRunState {
    return { ...this.currentRun };
  }

  /**
   * Get run history
   */
  getRunHistory(): PocketRunRecord[] {
    return [...this.state.runHistory];
  }

  /**
   * Get summary for UI display
   */
  getSummary(): {
    currentPocket: PocketNumber;
    isRunActive: boolean;
    isAntiZZ: boolean;
    shouldBet: boolean;
    nextWillBeAntiZZ: boolean;
    currentRunProfit: number;
    previousRunProfit: number;
    totalRuns: number;
    pocket1Runs: number;
    pocket2Runs: number;
  } {
    const history = this.state.runHistory;
    return {
      currentPocket: this.state.currentPocket,
      isRunActive: this.currentRun.isActive,
      isAntiZZ: this.currentRun.isAntiZZ,
      shouldBet: this.shouldBet(),
      nextWillBeAntiZZ: this.state.previousRunFirstBetFailed,
      currentRunProfit: this.currentRun.totalProfit,
      previousRunProfit: this.state.previousRunProfit,
      totalRuns: history.length,
      pocket1Runs: history.filter(r => r.pocket === 1).length,
      pocket2Runs: history.filter(r => r.pocket === 2).length,
    };
  }

  // --------------------------------------------------------------------------
  // STATISTICS
  // --------------------------------------------------------------------------

  /**
   * Get pocket statistics
   */
  getStatistics(): {
    totalRuns: number;
    zzRuns: number;
    antiZZRuns: number;
    pocket1: { runs: number; profit: number; winRate: number };
    pocket2: { runs: number; profit: number; winRate: number };
    totalProfit: number;
    averageRunProfit: number;
  } {
    const history = this.state.runHistory;
    const zzRuns = history.filter(r => !r.wasAntiZZ);
    const antiZZRuns = history.filter(r => r.wasAntiZZ);
    const pocket1Runs = history.filter(r => r.pocket === 1);
    const pocket2Runs = history.filter(r => r.pocket === 2);

    const calcStats = (runs: PocketRunRecord[]) => ({
      runs: runs.length,
      profit: runs.reduce((sum, r) => sum + r.totalProfit, 0),
      winRate: runs.length > 0
        ? (runs.filter(r => r.totalProfit > 0).length / runs.length) * 100
        : 0,
    });

    const totalProfit = history.reduce((sum, r) => sum + r.totalProfit, 0);

    return {
      totalRuns: history.length,
      zzRuns: zzRuns.length,
      antiZZRuns: antiZZRuns.length,
      pocket1: calcStats(pocket1Runs),
      pocket2: calcStats(pocket2Runs),
      totalProfit,
      averageRunProfit: history.length > 0 ? totalProfit / history.length : 0,
    };
  }

  // --------------------------------------------------------------------------
  // PERSISTENCE
  // --------------------------------------------------------------------------

  /**
   * Export state for saving
   */
  exportState(): { pocketState: PocketState; currentRun: CurrentRunState } {
    return {
      pocketState: { ...this.state },
      currentRun: { ...this.currentRun },
    };
  }

  /**
   * Import state from saved data
   */
  importState(data: { pocketState: PocketState; currentRun: CurrentRunState }): void {
    this.state = { ...data.pocketState };
    this.currentRun = { ...data.currentRun };
  }

  /**
   * Reset all state
   */
  reset(): void {
    this.state = this.createInitialState();
    this.currentRun = this.createInactiveRun();
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createPocketManager(): PocketManager {
  return new PocketManager();
}
