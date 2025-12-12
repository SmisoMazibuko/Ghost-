# Bucket System Upgrade - Implementation Plan
## Ghost Evaluator v15.2

---

## SUMMARY OF CHANGES

Based on the corrected ruleset in `BUCKET-SYSTEM-MANAGEMENT.md`, the following changes need to be made to `bucket-manager.ts`:

| # | Change | Current Behavior | Required Behavior |
|---|--------|------------------|-------------------|
| 1 | Bait failed detection | Not implemented | RRR (loss after bait formation) → WAITING |
| 2 | Switch small loss exit | Stays in BNS | → WAITING |
| 3 | Switch big loss exit | Goes to MAIN | → MAIN (correct, no change) |
| 4 | 2+ consecutive opposite wins | Pattern stays BNS (broken state) | → WAITING |
| 5 | Blocked pattern accumulation | Not tracked | Track and use for activation check |
| 6 | Unblock activation check | Just unblocks | Check 70%/accumulation for immediate MAIN activation |

---

## PHASE 1: Data Structure Changes

### 1.1 Add new tracking fields to BnsPatternState

**File:** `src/engine/bucket-manager.ts`
**Location:** Lines 33-42

```typescript
export interface BnsPatternState {
  isWaitingForBait: boolean;
  cumulativeBaitProfit: number;
  baitConfirmed: boolean;
  enteredAtBlock: number;

  // NEW FIELDS
  /** Number of consecutive losses after bait formation (for RRR detection) */
  consecutiveBaitLosses: number;
  /** Whether switch has been played this cycle */
  switchPlayed: boolean;
  /** Profit from the switch trade (to determine exit bucket) */
  switchProfit: number;
}
```

### 1.2 Add blocked pattern accumulation tracking

**File:** `src/engine/bucket-manager.ts`
**Location:** After line 101 (in class properties)

```typescript
// NEW: Track accumulated profit for blocked patterns
private blockedAccumulation: Map<PatternName, number>;
```

**Update `initializePatterns()`** to initialize this map.

---

## PHASE 2: Bait Failed Detection (RRR Rule)

### 2.1 Add method to track bait formation losses

**File:** `src/engine/bucket-manager.ts`
**Location:** After `addBaitProfit()` method (around line 207)

**New Method:**
```typescript
/**
 * Record a loss during bait waiting phase
 * If loss occurs after bait formation (e.g., RRR), bait fails → WAITING
 * @returns true if bait failed and pattern should exit to WAITING
 */
recordBaitLoss(pattern: PatternName, blockIndex: number): boolean {
  const bnsState = this.bnsStates.get(pattern);
  if (!bnsState || !bnsState.isWaitingForBait) return false;

  // Increment consecutive bait losses
  bnsState.consecutiveBaitLosses++;

  // If we had a bait formation and then got a loss (RRR), bait fails
  // This is detected when: formation appeared but confirmation was a loss
  if (bnsState.consecutiveBaitLosses > 0 && bnsState.cumulativeBaitProfit > 0) {
    // Bait failed - exit to WAITING
    this.exitBnsToWaiting(pattern, blockIndex, 'Bait failed (loss after formation)');
    return true;
  }

  return false;
}
```

### 2.2 Modify `addBaitProfit()` to reset loss counter on win

**File:** `src/engine/bucket-manager.ts`
**Location:** Lines 184-207

Add reset of `consecutiveBaitLosses` when positive profit is added:
```typescript
if (profit > 0) {
  bnsState.consecutiveBaitLosses = 0;  // NEW: Reset loss counter on win
  bnsState.cumulativeBaitProfit += profit;
  // ... rest of existing logic
}
```

---

## PHASE 3: Switch Result Handling

### 3.1 Create new exit method for B&S → WAITING

**File:** `src/engine/bucket-manager.ts`
**Location:** After `breakBns()` method (around line 275)

**New Method:**
```typescript
/**
 * Exit B&S mode to WAITING bucket
 * Used when: bait fails, switch loses <70%, or 2+ consecutive opposite wins
 */
private exitBnsToWaiting(pattern: PatternName, blockIndex: number, reason: string): void {
  // Move to WAITING bucket
  const currentBucket = this.patternBuckets.get(pattern);
  if (currentBucket === 'BNS') {
    this.recordBucketChange(pattern, 'BNS', 'WAITING', blockIndex, reason);
    this.patternBuckets.set(pattern, 'WAITING');
  }

  // Clean up B&S state
  this.bnsStates.delete(pattern);

  // Unblock opposite pattern
  const opposite = this.getOppositePattern(pattern);
  if (opposite) {
    this.oppositeBlocked.set(opposite, false);
    console.log(`[Bucket] ${pattern} exited B&S → WAITING (${reason}) - ${opposite} UNBLOCKED`);

    // Check if opposite should immediately activate
    this.checkUnblockedActivation(opposite, blockIndex);
  }

  // Reset consecutive counter
  this.consecutiveOppositeWins.set(pattern, 0);
}
```

### 3.2 Modify `updateFromLifecycle()` for switch loss handling

**File:** `src/engine/bucket-manager.ts`
**Location:** Lines 415-442 (B&S pattern broke section)

**Change FROM:**
```typescript
if (currentBucket === 'BNS') {
  if (bigLoss) {
    // Big loss in B&S → flip back to MAIN
    newBucket = 'MAIN';
    // ...
  } else {
    // Small loss or profit in B&S → STAY in BNS
    newBucket = 'BNS';
    // ...
  }
}
```

**Change TO:**
```typescript
if (currentBucket === 'BNS') {
  const bnsState = this.bnsStates.get(pattern);
  const wasSwitch = bnsState?.switchPlayed ?? false;

  if (wasSwitch) {
    // SWITCH was played - check result
    if (bigLoss) {
      // Big switch loss (≥70%) → MAIN (B&S strategy invalidated)
      newBucket = 'MAIN';
      reason = `Switch lost ${runProfit.toFixed(0)}% → B&S invalidated → MAIN`;
      this.bnsStates.delete(pattern);
      const opposite = this.getOppositePattern(pattern);
      if (opposite) {
        this.oppositeBlocked.set(opposite, false);
        this.checkUnblockedActivation(opposite, blockIndex);
      }
    } else if (runProfit < 0) {
      // Small switch loss (<70%) → WAITING
      newBucket = 'WAITING';
      reason = `Switch lost ${runProfit.toFixed(0)}% → WAITING`;
      this.exitBnsToWaiting(pattern, blockIndex, reason);
    } else {
      // Switch won → stay in BNS, wait for next bait
      newBucket = 'BNS';
      reason = `Switch won ${runProfit.toFixed(0)}% → stay B&S (wait next bait)`;
      if (bnsState) {
        bnsState.baitConfirmed = false;
        bnsState.cumulativeBaitProfit = 0;
        bnsState.switchPlayed = false;
        bnsState.consecutiveBaitLosses = 0;
      }
    }
  } else {
    // Not a switch trade - shouldn't happen in BNS normally
    // Handle gracefully by treating as switch loss
    if (bigLoss) {
      newBucket = 'MAIN';
      // ...
    } else {
      newBucket = 'WAITING';
      // ...
    }
  }
}
```

### 3.3 Add method to mark switch as played

**File:** `src/engine/bucket-manager.ts`
**Location:** Modify existing `markSwitchCompleted()` or add new method

```typescript
/**
 * Mark that switch trade is about to be played
 * Called when B&S pattern with confirmed bait makes a trade
 */
markSwitchStarted(pattern: PatternName): void {
  const bnsState = this.bnsStates.get(pattern);
  if (bnsState) {
    bnsState.switchPlayed = true;
  }
}
```

---

## PHASE 4: Consecutive Opposite Wins → WAITING

### 4.1 Modify `breakBns()` to go to WAITING instead of staying BNS

**File:** `src/engine/bucket-manager.ts`
**Location:** Lines 258-275

**Change FROM:**
```typescript
private breakBns(pattern: PatternName, _blockIndex: number, reason: string): void {
  const bnsState = this.bnsStates.get(pattern);
  if (!bnsState) return;

  // Mark as not waiting for bait (broken, just observing)
  bnsState.isWaitingForBait = false;
  bnsState.baitConfirmed = false;

  // Unblock the opposite pattern
  // ...
}
```

**Change TO:**
```typescript
private breakBns(pattern: PatternName, blockIndex: number, reason: string): void {
  // Use exitBnsToWaiting instead of just marking as broken
  this.exitBnsToWaiting(pattern, blockIndex, `B&S broken: ${reason}`);
}
```

---

## PHASE 5: Blocked Pattern Accumulation

### 5.1 Add accumulation tracking method

**File:** `src/engine/bucket-manager.ts`
**Location:** After `isBlockedByOpposite()` method

**New Methods:**
```typescript
/**
 * Add profit to blocked pattern's accumulation
 * Called even when pattern is blocked, so we know if it should activate when unblocked
 */
addBlockedAccumulation(pattern: PatternName, profit: number): void {
  if (!this.isBlockedByOpposite(pattern)) return;

  const current = this.blockedAccumulation.get(pattern) ?? 0;
  this.blockedAccumulation.set(pattern, current + profit);

  console.log(`[Bucket] ${pattern} (blocked) accumulated ${profit.toFixed(0)}%, total: ${(current + profit).toFixed(0)}%`);
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
```

### 5.2 Add unblock activation check

**File:** `src/engine/bucket-manager.ts`
**Location:** After the accumulation methods

**New Method:**
```typescript
/**
 * Check if an unblocked pattern should immediately activate in MAIN
 * Called when opposite exits B&S and unblocks this pattern
 */
private checkUnblockedActivation(pattern: PatternName, blockIndex: number): void {
  const accumulated = this.blockedAccumulation.get(pattern) ?? 0;

  // Check if accumulated profit meets threshold for activation
  if (accumulated >= this.config.singleBaitThreshold) {
    console.log(`[Bucket] ${pattern} unblocked with ${accumulated.toFixed(0)}% accumulated → ready for MAIN`);
    // Pattern will activate on next formation detection via lifecycle
    // The accumulated profit indicates it should activate
  }

  // Reset accumulation after check
  this.resetBlockedAccumulation(pattern);
}
```

### 5.3 Integrate accumulation into reaction engine

**File:** `src/engine/reaction.ts`
**Location:** Where trade results are processed

Need to call `bucketManager.addBlockedAccumulation()` when a pattern would have had a result but was blocked.

---

## PHASE 6: Update `rebuildFromResults()`

### 6.1 Add new logic for rebuild

**File:** `src/engine/bucket-manager.ts`
**Location:** Lines 689-830

Update to handle:
1. Bait failed (RRR) → WAITING
2. Switch small loss → WAITING
3. Switch big loss → MAIN
4. Consecutive opposite wins → WAITING
5. Blocked accumulation tracking

This is a significant refactor of the rebuild logic to match the new rules.

---

## PHASE 7: Update Header Comments

**File:** `src/engine/bucket-manager.ts`
**Location:** Lines 1-20

Update the header comments to reflect the corrected B&S lifecycle:

```typescript
/**
 * Ghost Evaluator v15.2 - 3-Bucket System with Corrected B&S Lifecycle
 * =====================================================================
 *
 * B&S Lifecycle (using 2A2/Anti2A2 as example):
 * 1. 2A2 loses 70%+ in MAIN → enters BNS (Anti2A2 BLOCKED)
 * 2. Wait for BAIT (pattern formation RR)
 * 3. BAIT confirmation: next outcome after RR
 *    - G ≥70% → BAIT CONFIRMED, ready for SWITCH
 *    - G <70% → Accumulate, keep waiting
 *    - R (making RRR) → BAIT FAILED → WAITING
 * 4. Play SWITCH (inverse bet)
 * 5. SWITCH result:
 *    - WIN → Stay BNS, wait for next bait
 *    - LOSE <70% → WAITING
 *    - LOSE ≥70% → MAIN (B&S invalidated)
 * 6. If 2+ consecutive Anti2A2 wins while waiting → WAITING
 * 7. Anti2A2 unblocked, checks accumulated profit for MAIN activation
 */
```

---

## IMPLEMENTATION ORDER

| Step | Phase | Estimated Effort | Dependencies |
|------|-------|------------------|--------------|
| 1 | Phase 1.1 | Small | None |
| 2 | Phase 1.2 | Small | None |
| 3 | Phase 3.1 | Medium | Phase 1 |
| 4 | Phase 4.1 | Small | Phase 3.1 |
| 5 | Phase 2.1-2.2 | Medium | Phase 1 |
| 6 | Phase 3.2-3.3 | Large | Phase 3.1, 4.1 |
| 7 | Phase 5.1-5.3 | Medium | Phase 3.1 |
| 8 | Phase 6 | Large | All above |
| 9 | Phase 7 | Small | All above |
| 10 | Testing | Large | All above |

---

## TESTING REQUIREMENTS

### Unit Tests to Add/Update

1. **Bait Failed (RRR) Test**
   - Pattern in B&S, bait formation appears, next is loss → verify goes to WAITING

2. **Switch Loss Tests**
   - Switch loses <70% → verify goes to WAITING
   - Switch loses ≥70% → verify goes to MAIN
   - Switch wins → verify stays in B&S

3. **Consecutive Opposite Wins Test**
   - 2+ consecutive opposite wins → verify B&S goes to WAITING (not stays broken in BNS)

4. **Blocked Accumulation Test**
   - Pattern blocked, accumulates profits → unblocked with high accumulation → verify activation ready

5. **Rebuild Test**
   - Test `rebuildFromResults()` with all the new scenarios

### Integration Tests

1. Full B&S cycle test with all exit paths
2. Opposite pattern interaction test
3. Multiple patterns in B&S simultaneously

---

## FILES TO MODIFY

| File | Changes |
|------|---------|
| `src/engine/bucket-manager.ts` | Major - all phases |
| `src/engine/reaction.ts` | Minor - accumulation integration |
| `tests/bucket-manager.test.ts` | Major - new test cases |

---

## ROLLBACK PLAN

If issues are found:
1. Keep old `bucket-manager.ts` as `bucket-manager.v15.1.ts`
2. New implementation in `bucket-manager.ts`
3. Config flag to switch between old/new behavior during testing

---

*Plan Version: 1.0*
*Created: December 2024*
*For Ghost Evaluator v15.2*
