/**
 * Pause Manager - Independent System Pause Tracking
 * ==================================================
 *
 * THREE SYSTEMS with independent pause tracking:
 * 1. Pocket System (ZZ/AntiZZ) - Only affected by STOP_GAME
 * 2. Bucket System (XAX, OZ, PP) - Has own pause tracking
 * 3. Same Direction System - Has own pause tracking
 *
 * Pause Types:
 * - STOP_GAME: Global. Triggered at -1000 drawdown OR -500 actual loss. Everything stops.
 * - MAJOR_PAUSE_10_BLOCKS: Per-system. Triggered every -300 drawdown milestone.
 * - MINOR_PAUSE_3_BLOCKS: Per-system. Triggered after 2 consecutive losses.
 *
 * Bucket and SameDir track their own losses and pauses independently.
 */

import {
  PauseType,
  PauseState,
  PauseConfig,
  DEFAULT_PAUSE_CONFIG,
} from '../types';

export type SystemType = 'BUCKET' | 'SAMEDIR';

export interface SystemHealthData {
  consecutiveLosses: number;
  totalPnl: number;
  currentBlock: number;
}

export interface GlobalHealthData {
  totalPnl: number;
  actualPnl: number;
  currentBlock: number;
}

interface SystemPauseState {
  currentPause: PauseState | null;
  lastMajorPauseMilestone: number;
  pauseHistory: PauseState[];
}

export class PauseManager {
  // Global state (STOP_GAME)
  private globalStopGame: PauseState | null = null;

  // Per-system pause tracking
  private bucketPause: SystemPauseState = {
    currentPause: null,
    lastMajorPauseMilestone: 0,
    pauseHistory: [],
  };

  private samedirPause: SystemPauseState = {
    currentPause: null,
    lastMajorPauseMilestone: 0,
    pauseHistory: [],
  };

  private config: PauseConfig;

  constructor(config: Partial<PauseConfig> = {}) {
    this.config = { ...DEFAULT_PAUSE_CONFIG, ...config };
  }

  /**
   * Check global health data for STOP_GAME
   */
  checkGlobalStopGame(healthData: GlobalHealthData): PauseState | null {
    const { totalPnl, actualPnl, currentBlock } = healthData;

    if (totalPnl <= this.config.stopGameDrawdown) {
      return this.triggerStopGame(`Drawdown reached ${this.config.stopGameDrawdown}`, currentBlock, totalPnl);
    }

    if (actualPnl <= this.config.stopGameActualLoss) {
      return this.triggerStopGame(`Actual loss reached ${this.config.stopGameActualLoss}`, currentBlock, actualPnl);
    }

    return null;
  }

  /**
   * Trigger STOP_GAME (global)
   */
  private triggerStopGame(reason: string, currentBlock: number, triggerValue: number): PauseState {
    if (this.globalStopGame) {
      return this.globalStopGame;
    }

    this.globalStopGame = {
      type: 'STOP_GAME',
      reason,
      startBlock: currentBlock,
      blocksRemaining: Infinity,
      triggerValue,
    };

    console.log(`[PauseManager] STOP_GAME triggered: ${reason}`);
    return this.globalStopGame;
  }

  /**
   * Check and trigger pause for a specific system (Bucket or SameDir)
   */
  checkSystemPause(system: SystemType, healthData: SystemHealthData): PauseState | null {
    const systemState = system === 'BUCKET' ? this.bucketPause : this.samedirPause;
    const { consecutiveLosses, totalPnl, currentBlock } = healthData;

    // Already in a pause for this system?
    if (systemState.currentPause) {
      return null;
    }

    // Priority 1: MAJOR_PAUSE (milestone-based)
    const drawdownMilestone = Math.floor(Math.abs(totalPnl) / Math.abs(this.config.majorPauseInterval));
    if (drawdownMilestone > systemState.lastMajorPauseMilestone && totalPnl < 0) {
      systemState.lastMajorPauseMilestone = drawdownMilestone;
      const milestoneValue = drawdownMilestone * this.config.majorPauseInterval;
      return this.triggerSystemPause(
        system,
        'MAJOR_PAUSE_10_BLOCKS',
        `${system} drawdown milestone ${milestoneValue}`,
        currentBlock,
        totalPnl
      );
    }

    // Priority 2: MINOR_PAUSE (consecutive losses)
    if (consecutiveLosses >= this.config.minorPauseLosses) {
      return this.triggerSystemPause(
        system,
        'MINOR_PAUSE_3_BLOCKS',
        `${system} ${consecutiveLosses} consecutive losses`,
        currentBlock,
        0
      );
    }

    return null;
  }

  /**
   * Trigger a pause for a specific system
   */
  private triggerSystemPause(
    system: SystemType,
    type: PauseType,
    reason: string,
    currentBlock: number,
    triggerValue: number
  ): PauseState {
    const systemState = system === 'BUCKET' ? this.bucketPause : this.samedirPause;
    const blocksRemaining = type === 'MAJOR_PAUSE_10_BLOCKS'
      ? this.config.majorPauseBlocks
      : this.config.minorPauseBlocks;

    systemState.currentPause = {
      type,
      reason,
      startBlock: currentBlock,
      blocksRemaining,
      triggerValue,
    };

    systemState.pauseHistory.push({ ...systemState.currentPause });
    console.log(`[PauseManager] ${system} ${type} triggered: ${reason} (${blocksRemaining} blocks)`);

    return systemState.currentPause;
  }

  /**
   * Advance block counter for all system pauses
   */
  advanceBlock(): void {
    this.advanceSystemBlock('BUCKET');
    this.advanceSystemBlock('SAMEDIR');
  }

  private advanceSystemBlock(system: SystemType): void {
    const systemState = system === 'BUCKET' ? this.bucketPause : this.samedirPause;

    if (systemState.currentPause) {
      systemState.currentPause.blocksRemaining--;

      if (systemState.currentPause.blocksRemaining <= 0) {
        console.log(`[PauseManager] ${system} ${systemState.currentPause.type} ended`);
        systemState.currentPause = null;
      }
    }
  }

  /**
   * Check if game is stopped (global STOP_GAME)
   */
  isGameStopped(): boolean {
    return this.globalStopGame !== null;
  }

  /**
   * Check if a specific system is paused
   */
  isSystemPaused(system: SystemType): boolean {
    if (this.globalStopGame) return true;

    const systemState = system === 'BUCKET' ? this.bucketPause : this.samedirPause;
    return systemState.currentPause !== null;
  }

  /**
   * Check if Pocket system can trade (only blocked by STOP_GAME)
   */
  canPocketTrade(): boolean {
    return !this.globalStopGame;
  }

  /**
   * Check if Bucket system can trade
   */
  canBucketTrade(): boolean {
    if (this.globalStopGame) return false;
    return !this.bucketPause.currentPause;
  }

  /**
   * Check if SameDir system can trade
   */
  canSamedirTrade(): boolean {
    if (this.globalStopGame) return false;
    return !this.samedirPause.currentPause;
  }

  /**
   * Get current pause state for a system (or global if STOP_GAME)
   */
  getSystemPauseState(system: SystemType): PauseState | null {
    if (this.globalStopGame) return this.globalStopGame;

    const systemState = system === 'BUCKET' ? this.bucketPause : this.samedirPause;
    return systemState.currentPause ? { ...systemState.currentPause } : null;
  }

  /**
   * Get global pause state (for UI display)
   */
  getPauseState(): PauseState | null {
    if (this.globalStopGame) return this.globalStopGame;
    // Return most severe active pause for display
    if (this.bucketPause.currentPause) return this.bucketPause.currentPause;
    if (this.samedirPause.currentPause) return this.samedirPause.currentPause;
    return null;
  }

  /**
   * Check if currently paused (any system)
   */
  isPaused(): boolean {
    return this.globalStopGame !== null ||
           this.bucketPause.currentPause !== null ||
           this.samedirPause.currentPause !== null;
  }

  /**
   * Get pause history (combined)
   */
  getPauseHistory(): PauseState[] {
    const combined = [
      ...this.bucketPause.pauseHistory,
      ...this.samedirPause.pauseHistory,
    ];
    if (this.globalStopGame) {
      combined.push(this.globalStopGame);
    }
    return combined.sort((a, b) => a.startBlock - b.startBlock);
  }

  /**
   * Get last major pause milestone for a system
   */
  getLastMajorPauseMilestone(system?: SystemType): number {
    if (!system) {
      return Math.max(
        this.bucketPause.lastMajorPauseMilestone,
        this.samedirPause.lastMajorPauseMilestone
      );
    }
    const systemState = system === 'BUCKET' ? this.bucketPause : this.samedirPause;
    return systemState.lastMajorPauseMilestone;
  }

  /**
   * Clear pause for a specific system (for undo/manual intervention)
   */
  clearSystemPause(system: SystemType): void {
    const systemState = system === 'BUCKET' ? this.bucketPause : this.samedirPause;
    if (systemState.currentPause) {
      console.log(`[PauseManager] ${system} pause manually cleared: ${systemState.currentPause.type}`);
      systemState.currentPause = null;
    }
  }

  /**
   * Restore from snapshot
   */
  restoreFromSnapshot(
    globalStopGame: PauseState | null,
    bucketPause: PauseState | null,
    bucketMilestone: number,
    samedirPause: PauseState | null,
    samedirMilestone: number
  ): void {
    this.globalStopGame = globalStopGame ? { ...globalStopGame } : null;
    this.bucketPause.currentPause = bucketPause ? { ...bucketPause } : null;
    this.bucketPause.lastMajorPauseMilestone = bucketMilestone;
    this.samedirPause.currentPause = samedirPause ? { ...samedirPause } : null;
    this.samedirPause.lastMajorPauseMilestone = samedirMilestone;
  }

  /**
   * Get summary for logging
   */
  getSummary(): string {
    const parts: string[] = [];

    if (this.globalStopGame) {
      return `STOP_GAME: ${this.globalStopGame.reason}`;
    }

    if (this.bucketPause.currentPause) {
      const bp = this.bucketPause.currentPause;
      parts.push(`Bucket: ${bp.type} (${bp.blocksRemaining} blocks)`);
    }

    if (this.samedirPause.currentPause) {
      const sp = this.samedirPause.currentPause;
      parts.push(`SameDir: ${sp.type} (${sp.blocksRemaining} blocks)`);
    }

    return parts.length > 0 ? parts.join(' | ') : 'No active pauses';
  }

  /**
   * Get detailed status for UI
   */
  getDetailedStatus(): {
    globalStopGame: PauseState | null;
    bucketPause: PauseState | null;
    samedirPause: PauseState | null;
    canPocketTrade: boolean;
    canBucketTrade: boolean;
    canSamedirTrade: boolean;
  } {
    return {
      globalStopGame: this.globalStopGame,
      bucketPause: this.bucketPause.currentPause,
      samedirPause: this.samedirPause.currentPause,
      canPocketTrade: this.canPocketTrade(),
      canBucketTrade: this.canBucketTrade(),
      canSamedirTrade: this.canSamedirTrade(),
    };
  }

  // Legacy compatibility methods
  getPauseType(): PauseType | null {
    return this.getPauseState()?.type || null;
  }

  canPatternTrade(pattern: string): boolean {
    // For legacy compatibility - check if it's ZZ/AntiZZ (Pocket)
    if (pattern === 'ZZ' || pattern === 'AntiZZ') {
      return this.canPocketTrade();
    }
    if (pattern === 'SameDir') {
      return this.canSamedirTrade();
    }
    // All other patterns are Bucket system
    return this.canBucketTrade();
  }

  // Legacy method - now checks global only
  checkAndTriggerPause(healthData: { totalPnl: number; actualPnl: number; consecutiveLosses: number; currentBlock: number }): PauseState | null {
    return this.checkGlobalStopGame({
      totalPnl: healthData.totalPnl,
      actualPnl: healthData.actualPnl,
      currentBlock: healthData.currentBlock,
    });
  }
}
