# Fix Implementation Plan

## Overview

This plan addresses 6 bugs/issues identified in the pattern rules analysis. Fixes are ordered by dependency - profit logic fixes first (affects all patterns), then pattern-specific fixes.

---

## Phase 1: Profit Logic Standardization

### Fix 1: Standardize lastRunProfit = 0 on Activation

**Why:** PP, ST, OZ, AP5 currently set `lastRunProfit = confirmationProfit`. This is inconsistent with standard patterns and affects -70% bucket decisions.

**Files to modify:** `src/patterns/lifecycle.ts`

**Step 1.1: Fix confirmPPPattern() (~line 496)**
```typescript
// FIND:
cycle.lastRunProfit = firstBlockProfit;

// REPLACE WITH:
cycle.lastRunProfit = 0;
```

**Step 1.2: Fix confirmSTPattern() (~line 560)**
```typescript
// FIND:
cycle.lastRunProfit = secondBlockProfit;

// REPLACE WITH:
cycle.lastRunProfit = 0;
```

**Step 1.3: Fix confirmOZPattern() (~line 437)**
```typescript
// FIND:
cycle.lastRunProfit = firstBlockProfit;

// REPLACE WITH:
cycle.lastRunProfit = 0;
```

**Step 1.4: Fix confirmAP5Pattern() (~line 375)**
```typescript
// FIND:
cycle.lastRunProfit = secondBlockProfit;

// REPLACE WITH:
cycle.lastRunProfit = 0;
```

**Verification:** After this fix, all patterns start active phase with `lastRunProfit = 0`.

---

## Phase 2: breakRunProfit Transfer Fixes

### Fix 2: OZ breakRunProfit Transfer

**Why:** `breakOZPattern()` does not preserve `lastRunProfit` to `breakRunProfit` before reset. This breaks -70% bucket decision.

**File:** `src/patterns/lifecycle.ts`

**Step 2.1: Find breakOZPattern() (~line 447-468)**

**Step 2.2: Add these lines BEFORE the reset:**
```typescript
// ADD BEFORE: cycle.state = 'observing';
cycle.breakRunProfit = cycle.lastRunProfit;
cycle.wasKilled = true;

console.log(`[Lifecycle] OZ killed - breakRunProfit=${cycle.breakRunProfit.toFixed(0)}%`);
```

---

### Fix 3: AP5 breakRunProfit Transfer

**Why:** `breakAP5Pattern()` does not preserve `lastRunProfit` to `breakRunProfit` before reset.

**File:** `src/patterns/lifecycle.ts`

**Step 3.1: Find breakAP5Pattern() (~line 386-406)**

**Step 3.2: Add these lines BEFORE the reset:**
```typescript
// ADD BEFORE: cycle.state = 'observing';
cycle.breakRunProfit = cycle.lastRunProfit;
cycle.wasKilled = true;

console.log(`[Lifecycle] AP5 killed - breakRunProfit=${cycle.breakRunProfit.toFixed(0)}%`);
```

---

## Phase 3: PP Kill Condition Fixes

### Fix 4: PP MAIN Kill Condition 2

**Why:** Current code kills PP when `previousRunLength >= 2`, but this triggers on correct PP rhythm (double → single). Should only kill when two singles in a row.

**File:** `src/engine/state.ts`

**Step 4.1: Find PP kill condition 2 (~line 181-188)**

**Step 4.2: Change the condition:**
```typescript
// FIND:
if (previousRunLength >= 2) {

// REPLACE WITH:
if (previousRunLength === 1) {
  // Two singles in a row - PP rhythm broken (expected double after single)
```

---

### Fix 5: PP B&S Kill Condition 2

**Why:** Same issue as Fix 4, but in B&S bucket-manager.

**File:** `src/engine/bucket-manager.ts`

**Step 5.1: Find checkPPBnsKillConditions() (~line 835-881)**

**Step 5.2: Replace the flip check logic:**
```typescript
// FIND (approximately):
if (isFlip) {
  if (state.previousRunLength === 2 && previousRunLength === 1) {
    return { shouldKill: true, reason: `After double (2), flip back was single (1)` };
  }
  state.previousRunLength = previousRunLength;
}

// REPLACE WITH:
// Kill condition 2: Two singles in a row (rhythm broken)
if (currentRunLength === 1 && previousRunLength === 1) {
  return { shouldKill: true, reason: `Two singles in a row - PP rhythm broken` };
}
```

---

## Phase 4: ST B&S Implementation

### Fix 6: Add ST B&S Kill Conditions

**Why:** ST has no dedicated B&S state or kill conditions. Should have same kill as MAIN (3+ run).

**Files:**
- `src/engine/bucket-manager.ts`
- `src/engine/reaction.ts`

**Step 6.1: Add STBnsState interface in bucket-manager.ts (~after PPBnsState)**
```typescript
export interface STBnsState {
  waitingForFirstFlip: boolean;
  lastSwitchBlock: number;
}
```

**Step 6.2: Add private member in BucketManager class**
```typescript
private stBnsState: STBnsState | null = null;
```

**Step 6.3: Add initializeSTBnsState() method**
```typescript
initializeSTBnsState(blockIndex: number): void {
  this.stBnsState = {
    waitingForFirstFlip: true,
    lastSwitchBlock: blockIndex,
  };
  console.log(`[BucketManager] ST B&S state initialized at block ${blockIndex}`);
}
```

**Step 6.4: Add getSTBnsState() method**
```typescript
getSTBnsState(): STBnsState | null {
  return this.stBnsState;
}
```

**Step 6.5: Add checkSTBnsKillConditions() method**
```typescript
checkSTBnsKillConditions(
  currentRunLength: number,
  previousRunLength: number,
  isFlip: boolean,
  blockIndex: number
): { shouldKill: boolean; reason: string } | null {
  // Only check if ST is in B&S
  if (this.getBucket('ST') !== 'BNS') {
    return null;
  }

  const state = this.stBnsState;
  if (!state) {
    return null;
  }

  // Skip first flip (settling into B&S)
  if (state.waitingForFirstFlip && isFlip) {
    state.waitingForFirstFlip = false;
    return { shouldKill: false, reason: '' };
  }

  // Kill condition: Run reaches 3+ (same as MAIN)
  if (currentRunLength >= 3) {
    return { shouldKill: true, reason: `Run reached ${currentRunLength} - exited 2A2 rhythm` };
  }

  return { shouldKill: false, reason: '' };
}
```

**Step 6.6: Add killSTInBns() method**
```typescript
killSTInBns(blockIndex: number, reason: string): void {
  console.log(`[BucketManager] ST killed in B&S at block ${blockIndex}: ${reason}`);
  this.exitBnsToWaiting('ST', blockIndex, reason);
  this.stBnsState = null;
}
```

**Step 6.7: Update enterBnsMode() to initialize ST state**
Find where ST enters B&S and add:
```typescript
if (pattern === 'ST') {
  this.initializeSTBnsState(blockIndex);
}
```

**Step 6.8: Add ST B&S kill check in reaction.ts processBlock()**
After the PP B&S kill check, add:
```typescript
// === ST B&S KILL CHECK ===
const stKillCheck = this.bucketManager.checkSTBnsKillConditions(
  runData.currentLength,
  previousRunLength,
  isFlip,
  blockResult.block.index
);
if (stKillCheck?.shouldKill) {
  this.bucketManager.killSTInBns(blockResult.block.index, stKillCheck.reason);
}
```

**Step 6.9: Update reset() method to clear stBnsState**
```typescript
this.stBnsState = null;
```

---

## Phase 5: Testing

### Step 7.1: Build the project
```bash
npm run build
```

### Step 7.2: Run existing unit tests
```bash
node dist/tests/oz-bns-kill-unit-test.js
```

### Step 7.3: Create new unit test for PP fixes
Test that:
- PP activates with lastRunProfit = 0
- PP kills on two singles in a row (1-1)
- PP does NOT kill on double-single (2-1) - this is correct rhythm

### Step 7.4: Create new unit test for ST B&S
Test that:
- ST in B&S kills when run reaches 3+

### Step 7.5: Manual integration test
Run the CLI and verify patterns work as expected.

---

## Phase 6: Documentation Update

### Step 8.1: Update PATTERN_RULES_DEEP_ANALYSIS.md
- Remove "FIX REQUIRED" labels
- Update profit logic section to reflect corrected code
- Mark all bugs as resolved

---

## Execution Order

1. **Fix 1** (lastRunProfit = 0) - Foundation fix, affects all patterns
2. **Fix 2** (OZ breakRunProfit) - Required for OZ bucket decisions
3. **Fix 3** (AP5 breakRunProfit) - Required for AP5 bucket decisions
4. **Build & quick test** - Verify no compilation errors
5. **Fix 4** (PP MAIN kill) - PP-specific
6. **Fix 5** (PP B&S kill) - PP-specific
7. **Fix 6** (ST B&S) - ST-specific, most complex
8. **Build & full test** - Run all unit tests
9. **Documentation update**

---

## Risk Assessment

| Fix | Risk Level | Notes |
|-----|------------|-------|
| Fix 1 | Medium | Affects 4 patterns, changes profit calculation |
| Fix 2 | Low | Adds missing line |
| Fix 3 | Low | Adds missing line |
| Fix 4 | Medium | Changes kill behavior |
| Fix 5 | Medium | Changes B&S kill behavior |
| Fix 6 | High | New functionality, multiple file changes |

---

## Rollback Plan

If issues occur:
1. Git revert the specific commit
2. Rebuild
3. Investigate issue before re-applying

---

## Estimated Complexity

- **Phase 1:** 4 single-line changes
- **Phase 2:** 2 small block additions
- **Phase 3:** 2 condition changes
- **Phase 4:** ~60 lines of new code across 2 files
- **Phase 5:** Testing time
- **Phase 6:** Documentation updates

Total new/modified code: ~80-100 lines

---

## ADDITIONAL FIXES DISCOVERED DURING TESTING (v15.2.2)

### Fix 7: AP5/OZ Structural Break Timing
**Problem:** AP5 never entered B&S because structural breaks happened BEFORE bet results were evaluated.
**Solution:** Moved AP5 BREAK and OZ BREAK checks in state.ts to AFTER `evaluatePendingSignals()`.

**File:** `src/engine/state.ts`
- Removed AP5/OZ break checks from before signal evaluation
- Added AP5/OZ break checks after `evaluatePendingSignals()`
- Now bet losses are counted in `breakRunProfit`

### Fix 8: markSwitchCompleted() Pattern State Sync
**Problem:** After switch win, pattern-specific state (e.g., `ozBnsState.baitConfirmed`) wasn't synced with general state.
**Solution:** Updated `markSwitchCompleted()` to sync pattern-specific state.

**File:** `src/engine/bucket-manager.ts`
```typescript
if (pattern === 'OZ' && this.ozBnsState) {
  this.ozBnsState.baitConfirmed = false;
  this.ozBnsState.waitingForSingle = true;
}
```

### Fix 9: markSwitchCompleted() lastSwitchBlock Update
**Problem:** OZ was being killed immediately after switch win because kill checks ran on the same block.
**Solution:** Updated `markSwitchCompleted()` to set `lastSwitchBlock = blockIndex`.

**File:** `src/engine/bucket-manager.ts`
- Added `lastSwitchBlock = blockIndex` for OZ, AP5, PP, ST
- Added `switchPlayed = false` reset for next cycle

---

## STATUS: ALL FIXES IMPLEMENTED ✓

All 9 fixes have been implemented and tested:
- Fix 1-6: Original plan fixes
- Fix 7-9: Additional fixes discovered during testing

Documentation updated in PATTERN_RULES_DEEP_ANALYSIS.md
