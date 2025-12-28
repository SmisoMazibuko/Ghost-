# Fix Plan: SD Resume Should Check ZZ First Bet Status

## Problem Summary

SD currently resumes whenever ZZ loses, but it should **only resume if ZZ's first bet was successful**. If ZZ broke on its first bet (`first_bet_negative`), SD should NOT resume because the market is still hostile.

## Current Flow (Broken)

```
reaction.ts:
  Line 506: recordZZXAXResult(pattern, isWin, evalIndex)  // Only passes WIN/LOSS
  Line 511: checkResumeCondition(block.index)             // Resumes on ANY ZZ loss
  ...
  Line 679: recordZZResult() → zzOutcome.action           // Returns 'first_bet_negative' or 'run_ends'
```

**Problem:** Resume check happens BEFORE we know if it was ZZ's first bet.

## Expected Behavior

| Scenario | Current | Expected |
|----------|---------|----------|
| ZZ first bet LOST (`first_bet_negative`) | SD RESUMES | SD should NOT resume |
| ZZ first bet WON, later bet LOST (`run_ends`) | SD RESUMES | SD should resume |

---

## Fix Plan

### Step 1: Add ZZ Action Type to SD Manager

**File:** `ghost-evaluator/src/engine/same-direction.ts`

Add a new field to track ZZ action type:

```typescript
// In SameDirectionState interface (around line 105)
/** Last ZZ action type for resume logic */
lastZZAction: 'first_bet_negative' | 'run_ends' | 'continue' | null;
```

Initialize in `createInitialState()`:
```typescript
lastZZAction: null,
```

### Step 2: Update recordZZXAXResult to Accept Action Type

**File:** `ghost-evaluator/src/engine/same-direction.ts`

Modify the method signature:

```typescript
// Change from:
recordZZXAXResult(pattern: string, isWin: boolean, blockIndex: number): void

// Change to:
recordZZXAXResult(
  pattern: string,
  isWin: boolean,
  blockIndex: number,
  zzAction?: 'first_bet_negative' | 'run_ends' | 'continue' | null
): void
```

Store the action:
```typescript
// Inside the method, after setting lastZZXAXResult
if (pattern === 'ZZ' && zzAction) {
  this.state.lastZZAction = zzAction;
}
```

### Step 3: Update checkResumeCondition to Check ZZ Action

**File:** `ghost-evaluator/src/engine/same-direction.ts`

Modify the resume logic (around line 820):

```typescript
checkResumeCondition(blockIndex: number): boolean {
  if (!this.state.paused) {
    return false;
  }

  // Only resume when ALTERNATION patterns break
  if (this.state.lastZZXAXResult === 'LOSS' &&
      this.state.lastZZXAXPattern &&
      RESUME_TRIGGER_PATTERNS.includes(this.state.lastZZXAXPattern as typeof RESUME_TRIGGER_PATTERNS[number])) {

    // NEW: For ZZ pattern, only resume if first bet was successful
    if (this.state.lastZZXAXPattern === 'ZZ') {
      if (this.state.lastZZAction === 'first_bet_negative') {
        console.log(`[SD] Resume BLOCKED: ZZ broke on first bet (market still hostile)`);
        return false;
      }
      // 'run_ends' means first bet was successful, OK to resume
      console.log(`[SD] Resume triggered: ZZ run ended (first bet was successful)`);
    } else {
      console.log(`[SD] Resume triggered: ${this.state.lastZZXAXPattern} broke (alternation pattern)`);
    }

    this.resume(blockIndex);
    return true;
  }

  // ... rest of method
}
```

### Step 4: Move Resume Check After ZZ Result Processing

**File:** `ghost-evaluator/src/engine/reaction.ts`

The resume check currently happens at line 511 (before ZZ result is processed). We need to:

1. **Remove** the early resume check at line 511
2. **Add** resume check AFTER recordZZResult() with the action type

```typescript
// Around line 678-694, after recordZZResult():
if (trade.pattern === 'ZZ') {
  const zzOutcome = this.zzStateManager.recordZZResult(zzResult, trade.evalIndex);
  console.log(`[Reaction] ZZ trade result recorded: ${isWin ? 'WIN' : 'LOSS'}, action: ${zzOutcome.action}`);

  // UPDATE: Pass action type to SD manager
  this.sameDirectionManager.recordZZXAXResult(trade.pattern, isWin, trade.evalIndex, zzOutcome.action);

  // NEW: Check resume AFTER we know the action type
  if (this.sameDirectionManager.checkResumeCondition(block.index)) {
    console.log(`[Reaction] SD resumed after ZZ ${zzOutcome.action} at block ${block.index}`);
  }

  // ... rest of ZZ handling
}
```

For non-ZZ patterns (AntiZZ, XAX), keep the existing flow since they don't have the first-bet concept:

```typescript
// For AntiZZ and XAX patterns, the existing recordZZXAXResult call at line 506 is fine
// But move the checkResumeCondition call to after the pattern-specific processing
```

### Step 5: Update Tests

**File:** `ghost-evaluator/tests/unit/sd-state-machine.test.ts`

Add new test cases:

```typescript
describe('Resume on ZZ Break - First Bet Check', () => {
  it('should NOT resume when ZZ first bet is negative', () => {
    activateSD(manager);

    // Pause SD
    manager.recordSDTradeResult(false, 40, 10, false);
    manager.recordSDTradeResult(false, 50, 11, false);
    expect(manager.isPaused()).toBe(true);

    // ZZ first bet negative
    manager.recordZZXAXResult('ZZ', false, 15, 'first_bet_negative');

    const shouldResume = manager.checkResumeCondition(16);
    expect(shouldResume).toBe(false);  // Should NOT resume
    expect(manager.isPaused()).toBe(true);
  });

  it('should resume when ZZ run ends (first bet was successful)', () => {
    activateSD(manager);

    // Pause SD
    manager.recordSDTradeResult(false, 40, 10, false);
    manager.recordSDTradeResult(false, 50, 11, false);
    expect(manager.isPaused()).toBe(true);

    // ZZ run ends (first bet was successful, later bet failed)
    manager.recordZZXAXResult('ZZ', false, 15, 'run_ends');

    const shouldResume = manager.checkResumeCondition(16);
    expect(shouldResume).toBe(true);  // Should resume
    expect(manager.isPaused()).toBe(false);
  });
});
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/engine/same-direction.ts` | Add `lastZZAction` state, update `recordZZXAXResult()`, update `checkResumeCondition()` |
| `src/engine/reaction.ts` | Move resume check after ZZ result processing, pass action type |
| `tests/unit/sd-state-machine.test.ts` | Add test cases for first bet check |

---

## Summary

The fix ensures SD only resumes when ZZ's first bet was successful by:

1. Tracking ZZ action type (`first_bet_negative` vs `run_ends`) in SD manager
2. Moving the resume check to AFTER `recordZZResult()` so we know the action type
3. Blocking resume if `lastZZAction === 'first_bet_negative'`

This prevents SD from resuming when the market is still hostile (ZZ broke immediately on first bet).
