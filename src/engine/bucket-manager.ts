/**
 * Ghost Evaluator v15.2 - 3-Bucket System with Corrected B&S Lifecycle
 * =====================================================================
 * Classifies patterns into buckets based on lifecycle state:
 *
 * BUCKET 1 (MAIN): Pattern is ACTIVE → play normal direction
 * BUCKET 2 (WAITING): Pattern is OBSERVING (waiting for activation) or broke with profit → no play
 * BUCKET 3 (B&S): Pattern broke with ≥70% loss → play inverse direction
 *
 * B&S Lifecycle (using 2A2/Anti2A2 as example):
 * 1. 2A2 loses ≥70% in MAIN → enters BNS (Anti2A2 BLOCKED)
 * 2. Wait for BAIT (pattern formation RR appears)
 * 3. BAIT confirmation - next outcome after formation:
 *    - G ≥70% → BAIT CONFIRMED, ready for SWITCH
 *    - G <70% → Accumulate, keep waiting
 *    - R (making RRR) → BAIT FAILED → WAITING
 * 4. Play SWITCH (inverse bet)
 * 5. SWITCH result determines next bucket:
 *    - WIN → Stay in BNS, wait for next bait
 *    - LOSE <70% → WAITING (soft exit)
 *    - LOSE ≥70% → MAIN (B&S invalidated, hard exit)
 * 6. If 2+ consecutive Anti2A2 wins while waiting → WAITING (not stay broken)
 * 7. Anti2A2 unblocked, checks accumulated profit for MAIN activation
 *
 * Blocked Pattern Accumulation:
 * - While blocked, opposite pattern still accumulates profit
 * - On unblock: if accumulated ≥70%, ready for immediate MAIN activation
 *
 * ZZ/AntiZZ Special Rule:
 * - They are managed by ZZStateManager, not bucket system
 */

import { PatternName, PATTERN_NAMES, OPPOSITE_PATTERNS, EvaluatedResult } from '../types';
import { PatternLifecycleManager } from '../patterns/lifecycle';

// ============================================================================
// BUCKET TYPES
// ============================================================================

/** The three bucket classifications */
export type BucketType = 'MAIN' | 'WAITING' | 'BNS';

/** B&S sub-state for patterns in BNS bucket */
export interface BnsPatternState {
  /** Whether B&S is actively waiting for bait (vs broken/observing) */
  isWaitingForBait: boolean;
  /** Cumulative profit towards bait confirmation (for <70% cases) */
  cumulativeBaitProfit: number;
  /** Whether bait is confirmed and ready for switch */
  baitConfirmed: boolean;
  /** Block index when B&S was entered */
  enteredAtBlock: number;
  /** Number of consecutive losses after bait formation (for RRR detection) */
  consecutiveBaitLosses: number;
  /** Whether switch has been played this cycle */
  switchPlayed: boolean;
  /** Profit from the switch trade (to determine exit bucket) */
  switchProfit: number;
}

/** Pattern bucket state - derived from lifecycle */
export interface PatternBucketState {
  pattern: PatternName;
  bucket: BucketType;
  /** Last run profit (from lifecycle) - determines bucket on break */
  lastRunProfit: number;
  /** Cumulative profit (from lifecycle) */
  cumulativeProfit: number;
  /** Whether pattern is active (from lifecycle) */
  isActive: boolean;
  /** Whether this pattern is blocked by opposite B&S */
  isBlockedByOpposite: boolean;
  /** B&S state (if in BNS bucket) */
  bnsState?: BnsPatternState;
  /** History of bucket transitions */
  bucketHistory: {
    from: BucketType;
    to: BucketType;
    blockIndex: number;
    reason: string;
    ts: string;
  }[];
}

/** Bucket manager configuration */
export interface BucketConfig {
  /** Enable ZZ/AntiZZ cross-accumulation */
  enableZZCrossAccumulation: boolean;
  /** Consecutive opposite wins to break B&S (default: 2) */
  consecutiveWinsToBreakBns: number;
  /** Single bait threshold (default: 70%) */
  singleBaitThreshold: number;
  /** Cumulative bait threshold (default: 100%) */
  cumulativeBaitThreshold: number;
}

/** Default bucket configuration */
export const DEFAULT_BUCKET_CONFIG: BucketConfig = {
  enableZZCrossAccumulation: true,
  consecutiveWinsToBreakBns: 2,
  singleBaitThreshold: 70,
  cumulativeBaitThreshold: 100,
};

// ============================================================================
// BUCKET MANAGER CLASS
// ============================================================================

export class BucketManager {
  private config: BucketConfig;
  private patternBuckets: Map<PatternName, BucketType>;
  private bucketHistory: Map<PatternName, PatternBucketState['bucketHistory']>;
  private lastKnownStates: Map<PatternName, { isActive: boolean; lastRunProfit: number }>;

  // B&S Lifecycle tracking
  private bnsStates: Map<PatternName, BnsPatternState>;
  private consecutiveOppositeWins: Map<PatternName, number>;
  private oppositeBlocked: Map<PatternName, boolean>;

  // Track accumulated profit for blocked patterns (for activation check when unblocked)
  private blockedAccumulation: Map<PatternName, number>;

  constructor(config?: Partial<BucketConfig>) {
    this.config = { ...DEFAULT_BUCKET_CONFIG, ...config };
    this.patternBuckets = new Map();
    this.bucketHistory = new Map();
    this.lastKnownStates = new Map();
    this.bnsStates = new Map();
    this.consecutiveOppositeWins = new Map();
    this.oppositeBlocked = new Map();
    this.blockedAccumulation = new Map();
    this.initializePatterns();
  }

  // --------------------------------------------------------------------------
  // INITIALIZATION
  // --------------------------------------------------------------------------

  private initializePatterns(): void {
    for (const pattern of PATTERN_NAMES) {
      // All patterns start in WAITING (not yet activated)
      this.patternBuckets.set(pattern, 'WAITING');
      this.bucketHistory.set(pattern, []);
      this.lastKnownStates.set(pattern, { isActive: false, lastRunProfit: 0 });
      this.consecutiveOppositeWins.set(pattern, 0);
      this.oppositeBlocked.set(pattern, false);
      this.blockedAccumulation.set(pattern, 0);
    }
  }

  /** Get config */
  getConfig(): BucketConfig {
    return this.config;
  }

  // --------------------------------------------------------------------------
  // OPPOSITE PATTERN HELPERS
  // --------------------------------------------------------------------------

  /**
   * Get the opposite pattern for a given pattern
   */
  private getOppositePattern(pattern: PatternName): PatternName | null {
    return OPPOSITE_PATTERNS[pattern] ?? null;
  }

  /**
   * Check if a pattern is blocked by its opposite being in B&S waiting for bait
   */
  isBlockedByOpposite(pattern: PatternName): boolean {
    // ZZ/AntiZZ managed separately
    if (pattern === 'ZZ' || pattern === 'AntiZZ') return false;

    return this.oppositeBlocked.get(pattern) ?? false;
  }

  // --------------------------------------------------------------------------
  // B&S STATE MANAGEMENT
  // --------------------------------------------------------------------------

  /**
   * Enter B&S mode for a pattern
   */
  private enterBnsMode(pattern: PatternName, blockIndex: number, initialProfit: number): void {
    // Create B&S state
    const bnsState: BnsPatternState = {
      isWaitingForBait: true,
      cumulativeBaitProfit: Math.abs(initialProfit), // Start with the break loss as potential bait
      baitConfirmed: initialProfit >= this.config.singleBaitThreshold, // Immediate confirm if 70%+
      enteredAtBlock: blockIndex,
      consecutiveBaitLosses: 0,
      switchPlayed: false,
      switchProfit: 0,
    };
    this.bnsStates.set(pattern, bnsState);

    // Block the opposite pattern
    const opposite = this.getOppositePattern(pattern);
    if (opposite) {
      this.oppositeBlocked.set(opposite, true);
      this.consecutiveOppositeWins.set(pattern, 0); // Reset consecutive counter
      console.log(`[Bucket] ${opposite} BLOCKED - ${pattern} in B&S waiting for bait`);
    }
  }

  /**
   * Add profit towards bait confirmation
   */
  addBaitProfit(pattern: PatternName, profit: number): boolean {
    const bnsState = this.bnsStates.get(pattern);
    if (!bnsState || !bnsState.isWaitingForBait) return false;

    // Add to cumulative (only positive profits count as bait)
    if (profit > 0) {
      // Reset consecutive loss counter on win (bait confirmation attempt)
      bnsState.consecutiveBaitLosses = 0;
      bnsState.cumulativeBaitProfit += profit;

      // Check if bait is now confirmed
      if (profit >= this.config.singleBaitThreshold) {
        bnsState.baitConfirmed = true;
        console.log(`[Bucket] ${pattern} BAIT CONFIRMED (single ${profit.toFixed(0)}%)`);
        return true;
      }

      if (bnsState.cumulativeBaitProfit >= this.config.cumulativeBaitThreshold) {
        bnsState.baitConfirmed = true;
        console.log(`[Bucket] ${pattern} BAIT CONFIRMED (cumulative ${bnsState.cumulativeBaitProfit.toFixed(0)}%)`);
        return true;
      }
    }

    return bnsState.baitConfirmed;
  }

  /**
   * Check if bait is confirmed for a B&S pattern
   */
  isBaitConfirmed(pattern: PatternName): boolean {
    const bnsState = this.bnsStates.get(pattern);
    return bnsState?.baitConfirmed ?? false;
  }

  /**
   * Record a trade result for consecutive win tracking
   * Called by reaction engine after each trade
   */
  recordTradeResult(pattern: PatternName, isWin: boolean, profit: number, blockIndex: number): void {
    // Skip ZZ/AntiZZ
    if (pattern === 'ZZ' || pattern === 'AntiZZ') return;

    const opposite = this.getOppositePattern(pattern);
    if (!opposite) return;

    // Check if the OPPOSITE pattern is in B&S waiting for bait
    const oppositeBucket = this.patternBuckets.get(opposite);
    const oppositeBnsState = this.bnsStates.get(opposite);

    if (oppositeBucket === 'BNS' && oppositeBnsState?.isWaitingForBait) {
      if (isWin) {
        // This pattern won - increment consecutive wins counter for the B&S pattern
        const currentCount = this.consecutiveOppositeWins.get(opposite) ?? 0;
        const newCount = currentCount + 1;
        this.consecutiveOppositeWins.set(opposite, newCount);

        console.log(`[Bucket] ${pattern} won while ${opposite} in B&S - consecutive: ${newCount}`);

        // Check if B&S should break
        if (newCount >= this.config.consecutiveWinsToBreakBns) {
          this.breakBns(opposite, blockIndex, `${newCount} consecutive ${pattern} wins`);
        }
      } else {
        // This pattern lost - reset consecutive counter
        this.consecutiveOppositeWins.set(opposite, 0);

        // Also, this loss is a formation for the B&S pattern - add as bait profit
        this.addBaitProfit(opposite, Math.abs(profit));
      }
    }
  }

  /**
   * Break B&S mode for a pattern (opposite has won enough times)
   * NOW: Goes to WAITING instead of staying in broken BNS state
   */
  private breakBns(pattern: PatternName, blockIndex: number, reason: string): void {
    // Use exitBnsToWaiting - pattern goes to WAITING when B&S is broken
    this.exitBnsToWaiting(pattern, blockIndex, `B&S broken: ${reason}`);
  }

  /**
   * Exit B&S mode to WAITING bucket
   * Used when: bait fails (RRR), switch loses <70%, or 2+ consecutive opposite wins
   */
  private exitBnsToWaiting(pattern: PatternName, blockIndex: number, reason: string): void {
    const currentBucket = this.patternBuckets.get(pattern);

    // Only process if actually in BNS
    if (currentBucket !== 'BNS') return;

    // Record bucket change
    this.recordBucketChange(pattern, 'BNS', 'WAITING', blockIndex, reason);
    this.patternBuckets.set(pattern, 'WAITING');

    // Clean up B&S state
    this.bnsStates.delete(pattern);

    // Unblock opposite pattern
    const opposite = this.getOppositePattern(pattern);
    if (opposite) {
      this.oppositeBlocked.set(opposite, false);
      console.log(`[Bucket] ${pattern} exited B&S → WAITING (${reason}) - ${opposite} UNBLOCKED`);

      // Check if opposite should immediately activate based on accumulated profit
      this.checkUnblockedActivation(opposite, blockIndex);
    }

    // Reset consecutive counter
    this.consecutiveOppositeWins.set(pattern, 0);
  }

  /**
   * Exit B&S mode to MAIN bucket
   * Used when: switch loses ≥70% (B&S strategy invalidated)
   */
  private exitBnsToMain(pattern: PatternName, blockIndex: number, reason: string): void {
    const currentBucket = this.patternBuckets.get(pattern);

    // Only process if actually in BNS
    if (currentBucket !== 'BNS') return;

    // Record bucket change
    this.recordBucketChange(pattern, 'BNS', 'MAIN', blockIndex, reason);
    this.patternBuckets.set(pattern, 'MAIN');

    // Clean up B&S state
    this.bnsStates.delete(pattern);

    // Unblock opposite pattern
    const opposite = this.getOppositePattern(pattern);
    if (opposite) {
      this.oppositeBlocked.set(opposite, false);
      console.log(`[Bucket] ${pattern} exited B&S → MAIN (${reason}) - ${opposite} UNBLOCKED`);

      // Check if opposite should immediately activate
      this.checkUnblockedActivation(opposite, blockIndex);
    }

    // Reset consecutive counter
    this.consecutiveOppositeWins.set(pattern, 0);
  }

  // --------------------------------------------------------------------------
  // BLOCKED PATTERN ACCUMULATION
  // --------------------------------------------------------------------------

  /**
   * Add profit to blocked pattern's accumulation
   * Called even when pattern is blocked, so we know if it should activate when unblocked
   */
  addBlockedAccumulation(pattern: PatternName, profit: number): void {
    if (!this.isBlockedByOpposite(pattern)) return;

    const current = this.blockedAccumulation.get(pattern) ?? 0;
    const newTotal = current + profit;
    this.blockedAccumulation.set(pattern, newTotal);

    console.log(`[Bucket] ${pattern} (blocked) accumulated ${profit.toFixed(0)}%, total: ${newTotal.toFixed(0)}%`);
  }

  /**
   * Get accumulated profit for a blocked pattern
   */
  getBlockedAccumulation(pattern: PatternName): number {
    return this.blockedAccumulation.get(pattern) ?? 0;
  }

  /**
   * Reset blocked accumulation (called when pattern activates or is no longer blocked)
   */
  resetBlockedAccumulation(pattern: PatternName): void {
    this.blockedAccumulation.set(pattern, 0);
  }

  /**
   * Check if an unblocked pattern should immediately activate in MAIN
   * Called when opposite exits B&S and unblocks this pattern
   */
  private checkUnblockedActivation(pattern: PatternName, _blockIndex: number): void {
    const accumulated = this.blockedAccumulation.get(pattern) ?? 0;

    // Check if accumulated profit meets threshold for activation
    if (accumulated >= this.config.singleBaitThreshold) {
      console.log(`[Bucket] ${pattern} unblocked with ${accumulated.toFixed(0)}% accumulated → ready for MAIN activation`);
      // Pattern will activate on next formation detection via lifecycle
      // The accumulated profit indicates it should activate immediately when formation appears
    } else if (accumulated > 0) {
      console.log(`[Bucket] ${pattern} unblocked with ${accumulated.toFixed(0)}% accumulated (below ${this.config.singleBaitThreshold}% threshold)`);
    }

    // Reset accumulation after check (will start fresh)
    this.resetBlockedAccumulation(pattern);
  }

  // --------------------------------------------------------------------------
  // BAIT FAILED DETECTION (RRR RULE)
  // --------------------------------------------------------------------------

  /**
   * Record a loss during bait waiting phase
   * If loss occurs after bait formation started accumulating, bait fails → WAITING
   *
   * @returns true if bait failed and pattern should exit to WAITING
   */
  recordBaitLoss(pattern: PatternName, profit: number, blockIndex: number): boolean {
    const bnsState = this.bnsStates.get(pattern);
    if (!bnsState || !bnsState.isWaitingForBait) return false;

    // If bait was already confirmed, this isn't a bait loss - it's a switch scenario
    if (bnsState.baitConfirmed) return false;

    // Increment consecutive bait losses
    bnsState.consecutiveBaitLosses++;

    console.log(`[Bucket] ${pattern} bait loss #${bnsState.consecutiveBaitLosses} (${profit.toFixed(0)}%), cumulative bait: ${bnsState.cumulativeBaitProfit.toFixed(0)}%`);

    // If we had started accumulating bait profit (formation appeared) and now got a loss,
    // this is the RRR scenario - bait failed
    // The rule: after bait formation (RR), if next is R (loss) instead of G (win), bait fails
    if (bnsState.cumulativeBaitProfit > 0 && bnsState.consecutiveBaitLosses > 0) {
      // Bait failed - exit to WAITING
      console.log(`[Bucket] ${pattern} BAIT FAILED (loss after ${bnsState.cumulativeBaitProfit.toFixed(0)}% bait accumulation)`);
      this.exitBnsToWaiting(pattern, blockIndex, 'Bait failed (RRR - loss after formation)');
      return true;
    }

    return false;
  }

  /**
   * Mark that switch trade is about to be played
   * Called when B&S pattern with confirmed bait makes a trade
   */
  markSwitchStarted(pattern: PatternName): void {
    const bnsState = this.bnsStates.get(pattern);
    if (bnsState && bnsState.baitConfirmed) {
      bnsState.switchPlayed = true;
      console.log(`[Bucket] ${pattern} SWITCH started`);
    }
  }

  /**
   * Handle when a pattern in MAIN breaks - may trigger auto-bait for opposite
   */
  handlePatternBreak(pattern: PatternName, breakProfit: number, _blockIndex: number): void {
    // Skip ZZ/AntiZZ
    if (pattern === 'ZZ' || pattern === 'AntiZZ') return;

    const opposite = this.getOppositePattern(pattern);
    if (!opposite) return;

    const oppositeBucket = this.patternBuckets.get(opposite);
    const oppositeBnsState = this.bnsStates.get(opposite);

    // Check if opposite is in BNS but broken (not waiting for bait)
    // This happens after consecutive wins broke the B&S
    if (oppositeBucket === 'BNS' && oppositeBnsState && !oppositeBnsState.isWaitingForBait) {
      // This pattern breaking = formation for opposite = auto bait
      const absProfit = Math.abs(breakProfit);

      console.log(`[Bucket] ${pattern} broke (${breakProfit.toFixed(0)}%) - AUTO BAIT for ${opposite}`);

      // Re-enter waiting for bait mode
      oppositeBnsState.isWaitingForBait = true;
      oppositeBnsState.cumulativeBaitProfit = absProfit;

      // Check if immediate confirmation
      if (absProfit >= this.config.singleBaitThreshold) {
        oppositeBnsState.baitConfirmed = true;
        console.log(`[Bucket] ${opposite} BAIT CONFIRMED (auto from ${pattern} break ${absProfit.toFixed(0)}%)`);
      } else {
        oppositeBnsState.baitConfirmed = false;
        console.log(`[Bucket] ${opposite} waiting for bait (cumulative: ${absProfit.toFixed(0)}%, need ${this.config.cumulativeBaitThreshold}%)`);
      }

      // Block the breaking pattern
      this.oppositeBlocked.set(pattern, true);
      console.log(`[Bucket] ${pattern} BLOCKED - ${opposite} B&S reactivated`);
    }
  }

  /**
   * Mark switch trade completed - B&S pattern should break and wait for next bait
   */
  markSwitchCompleted(pattern: PatternName, _isWin: boolean, _profit: number, _blockIndex: number): void {
    const bnsState = this.bnsStates.get(pattern);
    if (!bnsState) return;

    // Reset bait confirmation (need new bait for next switch)
    bnsState.baitConfirmed = false;
    bnsState.cumulativeBaitProfit = 0;

    // If switch won, stay in B&S waiting for next bait
    // If switch lost big (70%+), flip to MAIN (handled by updateFromLifecycle)
    // If switch lost small, stay in B&S

    console.log(`[Bucket] ${pattern} SWITCH completed - waiting for next bait`);
  }

  // --------------------------------------------------------------------------
  // CORE BUCKET LOGIC
  // --------------------------------------------------------------------------

  /**
   * Update bucket classifications based on lifecycle state
   * This should be called after each block is processed
   *
   * NOTE: ZZ and AntiZZ are EXCLUDED from bucket management.
   * They are managed by ZZStateManager with separate rules.
   *
   * @param lifecycle - The pattern lifecycle manager
   * @param blockIndex - Current block index
   */
  updateFromLifecycle(lifecycle: PatternLifecycleManager, blockIndex: number): void {
    for (const pattern of PATTERN_NAMES) {
      // SKIP ZZ and AntiZZ - they are managed by ZZStateManager, not bucket system
      if (pattern === 'ZZ' || pattern === 'AntiZZ') {
        continue;
      }

      const cycle = lifecycle.getCycle(pattern);
      const lastState = this.lastKnownStates.get(pattern)!;
      const currentBucket = this.patternBuckets.get(pattern)!;

      let newBucket: BucketType = currentBucket;
      let reason = '';

      // DEBUG: Log state for debugging bucket transitions (on any state change)
      const expectedState = lastState.isActive ? 'active' : 'observing';
      if (cycle.state !== expectedState) {
        console.log(`[Bucket Debug] ${pattern}: state=${cycle.state}, lastActive=${lastState.isActive}, breakRunProfit=${cycle.breakRunProfit.toFixed(0)}%, currentBucket=${currentBucket}`);
      }

      // Check if pattern just became active
      if (cycle.state === 'active' && !lastState.isActive) {
        // Check if blocked by opposite B&S
        if (this.isBlockedByOpposite(pattern)) {
          // Pattern trying to activate but blocked - stay in WAITING
          console.log(`[Bucket] ${pattern} blocked from activating - opposite in B&S`);
          newBucket = 'WAITING';
          reason = 'Blocked by opposite B&S';
        }
        // If pattern was in BNS, it STAYS in BNS (this is the "bait" activation)
        else if (currentBucket === 'BNS') {
          // Stay in BNS - pattern re-activated (the bait), now we wait for signal to play inverse
          newBucket = 'BNS';
          reason = 'Pattern re-activated in B&S (bait confirmed)';

          // Update B&S state - bait is confirmed via lifecycle activation
          const bnsState = this.bnsStates.get(pattern);
          if (bnsState) {
            bnsState.baitConfirmed = true;
          }
        } else {
          // WAITING → MAIN (if not blocked)
          newBucket = 'MAIN';
          reason = 'Pattern activated';
        }
      }
      // Check if pattern just broke (was active, now observing)
      else if (cycle.state === 'observing' && lastState.isActive) {
        // Pattern broke - check the RUN PROFIT (net of all trades during active phase)
        const runProfit = cycle.breakRunProfit;

        console.log(`[Bucket] ${pattern} BROKE: runProfit=${runProfit.toFixed(0)}%, currentBucket=${currentBucket}`);

        // 70% RULE for bucket transitions:
        // Run profit = all trades during active phase INCLUDING the break loss
        //
        // MAIN bucket:
        //   - If net run profit <= -70% → flip to BNS
        //   - If net run profit > -70% → go to WAITING
        //
        // BNS bucket (switch confirmed, playing inverse):
        //   - If net run profit <= -70% → flip to MAIN (inverse also failed)
        //   - If net run profit > -70% → STAY in BNS (switch is working, wait for next bait)

        const bigLoss = runProfit <= -70;

        if (currentBucket === 'BNS') {
          // B&S pattern broke - check if switch was played
          const bnsState = this.bnsStates.get(pattern);
          const wasSwitch = bnsState?.switchPlayed ?? false;

          if (wasSwitch) {
            // SWITCH was played - apply new switch result rules
            if (bigLoss) {
              // Big switch loss (≥70%) → MAIN (B&S strategy invalidated)
              // Both normal AND inverse failed, reset to normal play
              this.exitBnsToMain(pattern, blockIndex, `Switch lost ${runProfit.toFixed(0)}% → B&S invalidated`);
              newBucket = 'MAIN';
              reason = `Switch lost ${runProfit.toFixed(0)}% → B&S invalidated → MAIN`;
            } else if (runProfit < 0) {
              // Small switch loss (<70%) → WAITING
              this.exitBnsToWaiting(pattern, blockIndex, `Switch lost ${runProfit.toFixed(0)}%`);
              newBucket = 'WAITING';
              reason = `Switch lost ${runProfit.toFixed(0)}% → WAITING`;
            } else {
              // Switch won → stay in BNS, wait for next bait
              newBucket = 'BNS';
              reason = `Switch won ${runProfit.toFixed(0)}% → stay B&S (wait next bait)`;

              // Reset for next bait cycle
              if (bnsState) {
                bnsState.baitConfirmed = false;
                bnsState.cumulativeBaitProfit = 0;
                bnsState.switchPlayed = false;
                bnsState.consecutiveBaitLosses = 0;
                bnsState.switchProfit = 0;
              }
            }
          } else {
            // Not a switch trade - pattern broke while waiting for bait or without switch
            // This shouldn't normally happen, but handle gracefully
            if (bigLoss) {
              // Big loss → MAIN
              this.exitBnsToMain(pattern, blockIndex, `B&S broke (no switch) ${runProfit.toFixed(0)}%`);
              newBucket = 'MAIN';
              reason = `B&S broke (no switch) with ${runProfit.toFixed(0)}% → MAIN`;
            } else {
              // Small loss → WAITING
              this.exitBnsToWaiting(pattern, blockIndex, `B&S broke (no switch) ${runProfit.toFixed(0)}%`);
              newBucket = 'WAITING';
              reason = `B&S broke (no switch) with ${runProfit.toFixed(0)}% → WAITING`;
            }
          }
        } else {
          // MAIN or WAITING bucket pattern broke
          if (bigLoss) {
            // Big loss → check if can enter B&S
            const opposite = this.getOppositePattern(pattern);
            const oppositeInBns = opposite && this.patternBuckets.get(opposite) === 'BNS';

            if (oppositeInBns) {
              // RULE: Only ONE pattern from a pair can be in B&S at a time
              // Opposite is already in B&S, so this pattern cannot enter B&S
              // Just go to WAITING instead
              newBucket = 'WAITING';
              reason = `Pattern broke with ${runProfit.toFixed(0)}% but ${opposite} already in B&S → WAITING`;
              console.log(`[Bucket] ${pattern} cannot enter B&S - ${opposite} already in B&S`);
            } else {
              // Normal: enter B&S
              newBucket = 'BNS';
              reason = `Pattern broke with run profit ${runProfit.toFixed(0)}% → flip to B&S`;

              // Enter B&S mode - this also blocks the opposite pattern
              this.enterBnsMode(pattern, blockIndex, Math.abs(runProfit));
            }
          } else {
            // Small loss or profit in MAIN → go to WAITING
            newBucket = 'WAITING';
            reason = `Pattern broke with run profit ${runProfit.toFixed(0)}% → WAITING`;
          }

          // Notify about pattern break for auto-bait logic
          this.handlePatternBreak(pattern, runProfit, blockIndex);
        }
      }
      // Pattern is active - stay in current bucket (MAIN or BNS)
      else if (cycle.state === 'active') {
        // Don't change bucket - active BNS stays BNS, active MAIN stays MAIN
        // newBucket already equals currentBucket

        // But check if blocked - if somehow active but blocked, force to WAITING
        if (this.isBlockedByOpposite(pattern) && currentBucket !== 'BNS') {
          newBucket = 'WAITING';
          reason = 'Blocked by opposite B&S while active';
        }
      }
      // Pattern is observing and wasn't just broken - stay in current bucket
      // (WAITING or BNS depending on how it got there)

      // Record bucket change if it happened
      if (newBucket !== currentBucket) {
        this.recordBucketChange(pattern, currentBucket, newBucket, blockIndex, reason);
        this.patternBuckets.set(pattern, newBucket);
      }

      // Update last known state for next comparison
      this.lastKnownStates.set(pattern, {
        isActive: cycle.state === 'active',
        lastRunProfit: cycle.breakRunProfit, // Use breakRunProfit for bucket decisions
      });
    }
  }

  /**
   * Record a bucket change in history
   */
  private recordBucketChange(
    pattern: PatternName,
    from: BucketType,
    to: BucketType,
    blockIndex: number,
    reason: string
  ): void {
    const history = this.bucketHistory.get(pattern)!;
    history.push({
      from,
      to,
      blockIndex,
      reason,
      ts: new Date().toISOString(),
    });
    console.log(`[Bucket] ${pattern}: ${from} → ${to} (${reason})`);
  }

  /**
   * Get the bucket classification for a pattern
   *
   * NOTE: ZZ and AntiZZ always return 'WAITING' from bucket system
   * because they are managed by ZZStateManager, not bucket system.
   */
  getBucket(pattern: PatternName): BucketType {
    // ZZ and AntiZZ are managed by ZZStateManager, not bucket system
    // Return WAITING so they don't get processed by bucket logic
    if (pattern === 'ZZ' || pattern === 'AntiZZ') {
      return 'WAITING';
    }
    return this.patternBuckets.get(pattern) ?? 'WAITING';
  }

  /**
   * Get all patterns in a specific bucket
   * NOTE: Excludes ZZ and AntiZZ as they are managed separately
   */
  getPatternsInBucket(bucket: BucketType): PatternName[] {
    const patterns: PatternName[] = [];
    for (const [pattern, b] of this.patternBuckets) {
      // Exclude ZZ and AntiZZ - they are managed by ZZStateManager
      if (pattern === 'ZZ' || pattern === 'AntiZZ') {
        continue;
      }
      if (b === bucket) {
        patterns.push(pattern);
      }
    }
    return patterns;
  }

  /**
   * Check if a pattern should be played
   * Returns true for MAIN and BNS buckets (if not blocked), false for WAITING
   *
   * NOTE: ZZ and AntiZZ always return false here - use ZZStateManager instead
   */
  shouldPlay(pattern: PatternName): boolean {
    // ZZ and AntiZZ are managed by ZZStateManager
    if (pattern === 'ZZ' || pattern === 'AntiZZ') {
      return false;
    }

    // Check if blocked by opposite B&S
    if (this.isBlockedByOpposite(pattern)) {
      return false;
    }

    const bucket = this.getBucket(pattern);
    return bucket === 'MAIN' || bucket === 'BNS';
  }

  /**
   * Check if pattern is in B&S mode (inverse play)
   * NOTE: ZZ and AntiZZ always return false here - use ZZStateManager instead
   */
  isInversPlay(pattern: PatternName): boolean {
    // ZZ and AntiZZ are managed by ZZStateManager
    if (pattern === 'ZZ' || pattern === 'AntiZZ') {
      return false;
    }
    return this.getBucket(pattern) === 'BNS';
  }

  // --------------------------------------------------------------------------
  // STATISTICS AND REPORTING
  // --------------------------------------------------------------------------

  /**
   * Get bucket summary for all patterns
   */
  getBucketSummary(): {
    main: PatternName[];
    waiting: PatternName[];
    bns: PatternName[];
    stats: {
      mainCount: number;
      waitingCount: number;
      bnsCount: number;
    };
  } {
    const main = this.getPatternsInBucket('MAIN');
    const waiting = this.getPatternsInBucket('WAITING');
    const bns = this.getPatternsInBucket('BNS');

    return {
      main,
      waiting,
      bns,
      stats: {
        mainCount: main.length,
        waitingCount: waiting.length,
        bnsCount: bns.length,
      },
    };
  }

  /**
   * Get pattern state with bucket info
   */
  getPatternState(pattern: PatternName): PatternBucketState {
    return {
      pattern,
      bucket: this.getBucket(pattern),
      lastRunProfit: this.lastKnownStates.get(pattern)?.lastRunProfit ?? 0,
      cumulativeProfit: 0, // Will be populated from lifecycle when needed
      isActive: this.lastKnownStates.get(pattern)?.isActive ?? false,
      isBlockedByOpposite: this.isBlockedByOpposite(pattern),
      bnsState: this.bnsStates.get(pattern),
      bucketHistory: [...(this.bucketHistory.get(pattern) ?? [])],
    };
  }

  /**
   * Get all pattern states
   */
  getAllPatternStates(): Record<PatternName, PatternBucketState> {
    const result: Partial<Record<PatternName, PatternBucketState>> = {};
    for (const pattern of PATTERN_NAMES) {
      result[pattern] = this.getPatternState(pattern);
    }
    return result as Record<PatternName, PatternBucketState>;
  }

  /**
   * Get bucket history for a pattern
   */
  getBucketHistory(pattern: PatternName): PatternBucketState['bucketHistory'] {
    return [...(this.bucketHistory.get(pattern) ?? [])];
  }

  /**
   * Get B&S state for a pattern
   */
  getBnsState(pattern: PatternName): BnsPatternState | undefined {
    return this.bnsStates.get(pattern);
  }

  /**
   * Get consecutive opposite wins count for a pattern
   */
  getConsecutiveOppositeWins(pattern: PatternName): number {
    return this.consecutiveOppositeWins.get(pattern) ?? 0;
  }

  /**
   * Reset all buckets to initial state
   */
  reset(): void {
    this.initializePatterns();
    this.bnsStates.clear();
  }

  /**
   * Reset a specific pattern's bucket
   */
  resetPattern(pattern: PatternName): void {
    this.patternBuckets.set(pattern, 'WAITING');
    this.bucketHistory.set(pattern, []);
    this.lastKnownStates.set(pattern, { isActive: false, lastRunProfit: 0 });
    this.consecutiveOppositeWins.set(pattern, 0);
    this.oppositeBlocked.set(pattern, false);
    this.blockedAccumulation.set(pattern, 0);
    this.bnsStates.delete(pattern);
  }

  /**
   * Rebuild bucket state from evaluation results history.
   * This is called after undo to restore correct bucket positions.
   *
   * Updated Logic (v15.2):
   * - All patterns start in WAITING
   * - MAIN breaks with ≤-70% → BNS
   * - MAIN breaks with >-70% → WAITING
   * - BNS switch wins → stays BNS (wait for next bait)
   * - BNS switch loses <70% → WAITING
   * - BNS switch loses ≥70% → MAIN (B&S invalidated)
   * - 2+ consecutive opposite wins → WAITING (not stay broken in BNS)
   */
  rebuildFromResults(results: EvaluatedResult[]): void {
    // Reset all to WAITING first
    this.initializePatterns();
    this.bnsStates.clear();

    // Track run profits per pattern (resets each activation cycle)
    const runProfits = new Map<PatternName, number>();
    const wasActive = new Map<PatternName, boolean>();

    for (const pattern of PATTERN_NAMES) {
      if (pattern === 'ZZ' || pattern === 'AntiZZ') continue;
      runProfits.set(pattern, 0);
      wasActive.set(pattern, false);
    }

    // Process results in order to track bucket transitions
    for (const result of results) {
      const pattern = result.pattern;

      // Skip ZZ/AntiZZ - managed by ZZStateManager
      if (pattern === 'ZZ' || pattern === 'AntiZZ') continue;

      const currentBucket = this.patternBuckets.get(pattern)!;
      const opposite = this.getOppositePattern(pattern);

      // If wasBet is true, pattern was active (MAIN or BNS)
      if (result.wasBet) {
        // First bet after WAITING → pattern was activated to MAIN or stayed in BNS
        if (!wasActive.get(pattern)) {
          if (currentBucket === 'WAITING') {
            // Check if blocked by opposite B&S
            if (opposite && this.isBlockedByOpposite(pattern)) {
              // Blocked - stay in WAITING (shouldn't have bet, but handle gracefully)
              console.log(`[Bucket Rebuild] ${pattern}: blocked by ${opposite} B&S, staying WAITING`);
            } else {
              // Pattern activated to MAIN
              this.patternBuckets.set(pattern, 'MAIN');
              console.log(`[Bucket Rebuild] ${pattern}: WAITING → MAIN (activated)`);
            }
          }
          // If BNS, it stays BNS (bait activation)
          wasActive.set(pattern, true);
          runProfits.set(pattern, 0); // Reset run profit on activation
        }

        // Add profit to run
        const currentRunProfit = runProfits.get(pattern)! + result.profit;
        runProfits.set(pattern, currentRunProfit);

        // Track consecutive wins for opposite B&S break → WAITING
        if (opposite && result.profit > 0) {
          const oppBucket = this.patternBuckets.get(opposite);
          if (oppBucket === 'BNS') {
            const oppBnsState = this.bnsStates.get(opposite);
            if (oppBnsState?.isWaitingForBait) {
              const count = (this.consecutiveOppositeWins.get(opposite) ?? 0) + 1;
              this.consecutiveOppositeWins.set(opposite, count);

              if (count >= this.config.consecutiveWinsToBreakBns) {
                // B&S breaks → WAITING (not stay broken in BNS)
                this.patternBuckets.set(opposite, 'WAITING');
                this.bnsStates.delete(opposite);
                this.oppositeBlocked.set(pattern, false);
                this.consecutiveOppositeWins.set(opposite, 0);
                console.log(`[Bucket Rebuild] ${opposite} B&S BROKEN (${count} consecutive ${pattern} wins) → WAITING`);
              }
            }
          }
        } else if (opposite && result.profit < 0) {
          // Reset consecutive counter on loss
          const oppBucket = this.patternBuckets.get(opposite);
          if (oppBucket === 'BNS') {
            this.consecutiveOppositeWins.set(opposite, 0);
          }
        }

        // Check if this result caused a break (negative profit means loss)
        if (result.profit < 0) {
          const bucket = this.patternBuckets.get(pattern)!;

          if (result.isBnsInverse) {
            // B&S inverse (switch) trade result
            if (currentRunProfit <= -70) {
              // Big switch loss (≥70%) → MAIN (B&S invalidated)
              this.patternBuckets.set(pattern, 'MAIN');
              this.bnsStates.delete(pattern);
              if (opposite) {
                this.oppositeBlocked.set(opposite, false);
              }
              console.log(`[Bucket Rebuild] ${pattern}: BNS → MAIN (switch big loss ${currentRunProfit.toFixed(0)}%)`);
            } else {
              // Small switch loss (<70%) → WAITING
              this.patternBuckets.set(pattern, 'WAITING');
              this.bnsStates.delete(pattern);
              if (opposite) {
                this.oppositeBlocked.set(opposite, false);
              }
              console.log(`[Bucket Rebuild] ${pattern}: BNS → WAITING (switch small loss ${currentRunProfit.toFixed(0)}%)`);
            }
            wasActive.set(pattern, false);
            runProfits.set(pattern, 0);
          } else {
            // Normal trade loss
            if (currentRunProfit <= -70) {
              if (bucket === 'MAIN' || bucket === 'WAITING') {
                // Big loss → check if can enter B&S
                const oppositeInBns = opposite && this.patternBuckets.get(opposite) === 'BNS';

                if (oppositeInBns) {
                  // RULE: Only ONE pattern from a pair can be in B&S at a time
                  // Opposite is already in B&S, so this pattern cannot enter B&S
                  this.patternBuckets.set(pattern, 'WAITING');
                  console.log(`[Bucket Rebuild] ${pattern}: cannot enter B&S - ${opposite} already in B&S → WAITING`);
                } else {
                  // Normal: enter B&S
                  this.patternBuckets.set(pattern, 'BNS');
                  this.enterBnsMode(pattern, result.evalIndex, Math.abs(currentRunProfit));
                  console.log(`[Bucket Rebuild] ${pattern}: MAIN → BNS (big loss ${currentRunProfit.toFixed(0)}%)`);
                }
              } else if (bucket === 'BNS') {
                // Big loss in BNS (normal direction - shouldn't happen normally) → MAIN
                this.patternBuckets.set(pattern, 'MAIN');
                this.bnsStates.delete(pattern);
                if (opposite) {
                  this.oppositeBlocked.set(opposite, false);
                }
                console.log(`[Bucket Rebuild] ${pattern}: BNS → MAIN (big loss ${currentRunProfit.toFixed(0)}%)`);
              }
              wasActive.set(pattern, false);
              runProfits.set(pattern, 0);
            }
            // Small loss might not break the pattern, depends on lifecycle
          }
        }

        // B&S inverse win - stays in BNS, waits for next bait
        if (result.isBnsInverse && result.profit >= 0) {
          // B&S switch win - pattern stays in BNS bucket, waits for next bait
          const bnsState = this.bnsStates.get(pattern);
          if (bnsState) {
            bnsState.baitConfirmed = false;
            bnsState.cumulativeBaitProfit = 0;
            bnsState.switchPlayed = false;
            bnsState.consecutiveBaitLosses = 0;
          }
          console.log(`[Bucket Rebuild] ${pattern}: B&S switch win ${result.profit.toFixed(0)}% - stays BNS, waiting for bait`);
          wasActive.set(pattern, false);
          runProfits.set(pattern, 0);
        }
      }
    }

    console.log('[Bucket Rebuild] Complete. Buckets:', Object.fromEntries(this.patternBuckets));
    console.log('[Bucket Rebuild] Blocked:', Object.fromEntries(this.oppositeBlocked));
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createBucketManager(config?: Partial<BucketConfig>): BucketManager {
  return new BucketManager(config);
}
