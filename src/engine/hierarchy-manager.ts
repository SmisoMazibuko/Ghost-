/**
 * Ghost Evaluator - Hierarchy Manager
 * ====================================
 *
 * Controls which system places the real bet on each block.
 * See docs/HIERARCHY-MANAGER-SPEC.md for authoritative rules.
 *
 * VERSION: v1.0
 *
 * TWO-PHASE PROCESSING:
 * 1. OBSERVE: All systems update state (NEVER paused)
 * 2. BET: Hierarchy decides who bets (priority-based)
 *
 * PRIORITY ORDER:
 * 1. Pocket System (ZZ/AntiZZ) - highest
 * 2. Same Direction System - middle
 * 3. Bucket System - lowest
 *
 * KEY RULE: Observation NEVER pauses. Only betting can be paused.
 */

import {
  Block,
  Direction,
  PatternName,
  HierarchyDecision,
} from '../types';
import { ZZStateManager } from './zz-state-manager';
import { SameDirectionManager } from './same-direction';
import { BucketManager } from './bucket-manager';
import { PatternLifecycleManager } from '../patterns/lifecycle';

// ============================================================================
// HIERARCHY MANAGER
// ============================================================================

export class HierarchyManager {
  private lastDecision: HierarchyDecision | null = null;
  private decisionHistory: HierarchyDecision[] = [];

  constructor() {
    // Manager doesn't own the systems - they are passed in for each decision
  }

  // ==========================================================================
  // MAIN ENTRY POINT
  // ==========================================================================

  /**
   * Decide who bets on this block.
   *
   * IMPORTANT: This is called AFTER all systems have observed the block.
   * The hierarchy manager does NOT call observe methods - that's the caller's job.
   *
   * Priority:
   * 1. Pocket System (ZZ indicator + pocket ready)
   * 2. Same Direction (if active)
   * 3. Bucket System (if pattern eligible)
   */
  decideBet(
    blockIndex: number,
    previousBlock: Block | null,
    zzStateManager: ZZStateManager,
    sameDirectionManager: SameDirectionManager,
    bucketManager: BucketManager,
    lifecycle: PatternLifecycleManager,
    pendingSignals: { pattern: PatternName; expectedDirection: Direction }[]
  ): HierarchyDecision {
    const pausedSystems: ('same-direction' | 'bucket')[] = [];

    console.log(`[HIERARCHY] === BLOCK ${blockIndex} DECISION ===`);

    // ========================================================================
    // PRIORITY 1: POCKET SYSTEM (ZZ/AntiZZ)
    // ========================================================================

    const zzState = zzStateManager.getState();
    const pocketHasSignal = this.checkPocketSignal(zzStateManager);

    console.log(`[HIERARCHY] Priority 1 (Pocket):`);
    console.log(`[HIERARCHY]   zzPocket=${zzState.zzPocket}, antiZZPocket=${zzState.antiZZPocket}`);
    console.log(`[HIERARCHY]   activePattern=${zzState.activePattern || 'none'}`);
    console.log(`[HIERARCHY]   waitingForFirstBet=${zzState.waitingForFirstBet}`);

    if (pocketHasSignal) {
      // Pocket System bets - pause others
      pausedSystems.push('same-direction', 'bucket');

      const pattern = zzState.activePattern as PatternName;
      const direction = this.getPocketDirection(zzStateManager, previousBlock);
      const sdMachineState = this.getSDMachineState(sameDirectionManager);

      const decision: HierarchyDecision = {
        blockIndex,
        source: 'pocket',
        pattern,
        direction: direction ?? undefined,
        shouldBet: direction !== null,
        reason: `Pocket (${pattern}) in P1 - betting`,
        pausedSystems,
        ts: new Date().toISOString(),
        sdState: sdMachineState,
      };

      console.log(`[HIERARCHY]   → BETTING: ${pattern}`);
      console.log(`[HIERARCHY]   SameDir PAUSED (${sdMachineState}), Bucket PAUSED`);

      this.recordDecision(decision);
      return decision;
    }

    console.log(`[HIERARCHY]   → PASS (no active pocket signal)`);

    // ========================================================================
    // PRIORITY 2: SAME DIRECTION SYSTEM
    // ========================================================================

    const sdActive = sameDirectionManager.isActive();
    const sdPaused = sameDirectionManager.isPaused();
    const sdCanBet = sameDirectionManager.canBet();
    const sdAccumulatedLoss = sameDirectionManager.getAccumulatedLoss();
    const sdMachineState = this.getSDMachineState(sameDirectionManager);

    console.log(`[HIERARCHY] Priority 2 (SameDir):`);
    console.log(`[HIERARCHY]   state=${sdMachineState}, accumulatedLoss=${sdAccumulatedLoss}`);

    if (sdCanBet) {
      // Same Direction can bet (active AND not paused) - pause Bucket
      pausedSystems.push('bucket');

      const direction = sameDirectionManager.getBetDirection(previousBlock);

      const decision: HierarchyDecision = {
        blockIndex,
        source: 'same-direction',
        pattern: undefined,
        direction: direction ?? undefined,
        shouldBet: direction !== null,
        reason: `Same Direction active (loss: ${sdAccumulatedLoss}/140) - betting continuation`,
        pausedSystems,
        ts: new Date().toISOString(),
        sdState: sdMachineState,
      };

      console.log(`[HIERARCHY]   → BETTING: ${direction === 1 ? 'GREEN' : 'RED'} (continuation)`);
      console.log(`[HIERARCHY]   Bucket PAUSED`);

      this.recordDecision(decision);
      return decision;
    }

    if (sdPaused) {
      // SD is paused - record imaginary direction but fall through to bucket
      const imaginaryDirection = sameDirectionManager.getBetDirection(previousBlock);
      console.log(`[HIERARCHY]   → PAUSED (would bet ${imaginaryDirection === 1 ? 'GREEN' : 'RED'}) - falling through to Bucket`);
    } else if (sdActive) {
      console.log(`[HIERARCHY]   → PASS (active but cannot bet)`);
    } else {
      console.log(`[HIERARCHY]   → PASS (${sdMachineState})`);
    }

    // ========================================================================
    // PRIORITY 3: BUCKET SYSTEM
    // ========================================================================

    console.log(`[HIERARCHY] Priority 3 (Bucket):`);

    const bucketBet = this.getBucketBet(bucketManager, lifecycle, pendingSignals);

    if (bucketBet) {
      // Include imaginary direction if SD is paused
      const sdImaginaryDir = sdPaused ? sameDirectionManager.getBetDirection(previousBlock) : undefined;

      const decision: HierarchyDecision = {
        blockIndex,
        source: 'bucket',
        pattern: bucketBet.pattern,
        direction: bucketBet.direction,
        shouldBet: true,
        reason: `Bucket (${bucketBet.pattern}) in ${bucketBet.bucket} - betting`,
        pausedSystems,
        ts: new Date().toISOString(),
        sdState: sdMachineState,
        sdImaginaryDirection: sdImaginaryDir ?? undefined,
      };

      console.log(`[HIERARCHY]   → BETTING: ${bucketBet.pattern} (${bucketBet.bucket})`);

      this.recordDecision(decision);
      return decision;
    }

    console.log(`[HIERARCHY]   → PASS (no eligible pattern)`);

    // ========================================================================
    // NO SYSTEM BETS
    // ========================================================================

    // Include imaginary direction if SD is paused
    const sdImaginaryDir = sdPaused ? sameDirectionManager.getBetDirection(previousBlock) : undefined;

    const decision: HierarchyDecision = {
      blockIndex,
      source: 'none',
      pattern: undefined,
      direction: undefined,
      shouldBet: false,
      reason: 'No system ready to bet',
      pausedSystems,
      ts: new Date().toISOString(),
      sdState: sdMachineState,
      sdImaginaryDirection: sdImaginaryDir ?? undefined,
    };

    console.log(`[HIERARCHY] FINAL: No bet this block`);
    console.log(`[HIERARCHY] ================================`);

    this.recordDecision(decision);
    return decision;
  }

  // ==========================================================================
  // SAME DIRECTION HELPERS
  // ==========================================================================

  /**
   * Get SD machine state for decision logging
   */
  private getSDMachineState(
    sameDirectionManager: SameDirectionManager
  ): 'INACTIVE' | 'ACTIVE' | 'PAUSED' | 'EXPIRED' {
    const sdState = sameDirectionManager.getState();
    if (!sdState.active) {
      return sdState.accumulatedLoss > 140 ? 'EXPIRED' : 'INACTIVE';
    } else if (sdState.paused) {
      return 'PAUSED';
    } else {
      return 'ACTIVE';
    }
  }

  // ==========================================================================
  // POCKET SYSTEM HELPERS
  // ==========================================================================

  /**
   * Check if Pocket System has an active signal to bet
   */
  private checkPocketSignal(zzStateManager: ZZStateManager): boolean {
    const state = zzStateManager.getState();

    // Check if there's an active pattern that can bet
    if (state.activePattern === 'ZZ' && state.zzPocket === 1) {
      return true;
    }

    if (state.activePattern === 'AntiZZ' && state.antiZZPocket === 1) {
      return true;
    }

    return false;
  }

  /**
   * Get the direction Pocket System wants to bet
   */
  private getPocketDirection(
    zzStateManager: ZZStateManager,
    previousBlock: Block | null
  ): Direction | null {
    const state = zzStateManager.getState();

    if (!previousBlock) {
      return null;
    }

    if (state.activePattern === 'ZZ') {
      // ZZ predicts OPPOSITE (alternation continues)
      return (previousBlock.dir * -1) as Direction;
    }

    if (state.activePattern === 'AntiZZ') {
      // AntiZZ predicts SAME (alternation breaks)
      return previousBlock.dir;
    }

    return null;
  }

  // ==========================================================================
  // BUCKET SYSTEM HELPERS
  // ==========================================================================

  /**
   * Get eligible bet from Bucket System
   */
  private getBucketBet(
    bucketManager: BucketManager,
    _lifecycle: PatternLifecycleManager,
    pendingSignals: { pattern: PatternName; expectedDirection: Direction }[]
  ): { pattern: PatternName; direction: Direction; bucket: string } | null {
    // Check pending signals for eligible patterns
    for (const signal of pendingSignals) {
      const { pattern, expectedDirection } = signal;

      // Skip ZZ/AntiZZ - handled by Pocket System
      if (pattern === 'ZZ' || pattern === 'AntiZZ') {
        continue;
      }

      // Check if pattern should play (MAIN or BNS, not blocked)
      if (!bucketManager.shouldPlay(pattern)) {
        continue;
      }

      // Check if in BNS (inverse play)
      const isInverse = bucketManager.isInversPlay(pattern);
      const bucket = bucketManager.getBucket(pattern);

      // Final direction (may be inverted for BNS)
      const direction = isInverse
        ? ((expectedDirection * -1) as Direction)
        : expectedDirection;

      console.log(
        `[HIERARCHY]   Found: ${pattern} in ${bucket}${isInverse ? ' (inverse)' : ''}`
      );

      return { pattern, direction, bucket };
    }

    // No eligible pattern found
    const summary = bucketManager.getBucketSummary();
    console.log(`[HIERARCHY]   MAIN: [${summary.main.join(', ') || 'none'}]`);
    console.log(`[HIERARCHY]   No pending signals for eligible patterns`);

    return null;
  }

  // ==========================================================================
  // DECISION HISTORY
  // ==========================================================================

  /**
   * Record a decision in history
   */
  private recordDecision(decision: HierarchyDecision): void {
    this.lastDecision = decision;
    this.decisionHistory.push(decision);

    // Keep history manageable (last 100 decisions)
    if (this.decisionHistory.length > 100) {
      this.decisionHistory.shift();
    }
  }

  /**
   * Get last decision
   */
  getLastDecision(): HierarchyDecision | null {
    return this.lastDecision;
  }

  /**
   * Get decision history
   */
  getDecisionHistory(): HierarchyDecision[] {
    return [...this.decisionHistory];
  }

  /**
   * Get status message for display
   */
  getStatusMessage(): string {
    if (!this.lastDecision) {
      return 'No decision yet';
    }

    const { source, pattern, shouldBet } = this.lastDecision;

    if (!shouldBet) {
      return 'No bet';
    }

    switch (source) {
      case 'pocket':
        return `Pocket (${pattern})`;
      case 'same-direction':
        return 'Same Direction';
      case 'bucket':
        return `Bucket (${pattern})`;
      default:
        return 'Unknown';
    }
  }

  // ==========================================================================
  // RESET
  // ==========================================================================

  /**
   * Reset hierarchy manager state
   */
  reset(): void {
    this.lastDecision = null;
    this.decisionHistory = [];
    console.log('[HIERARCHY] Reset');
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createHierarchyManager(): HierarchyManager {
  return new HierarchyManager();
}
