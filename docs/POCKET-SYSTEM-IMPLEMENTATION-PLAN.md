# POCKET SYSTEM IMPLEMENTATION PLAN

> **VERSION:** v16.0
> **DATE:** 2025-12-16
> **STATUS:** Ready for Implementation
> **REFERENCE:** `POCKET-SYSTEM-SPEC.md`

---

## EXECUTIVE SUMMARY

This plan addresses **5 critical violations** found in the audit of `zz-state-manager.ts` against the strict POCKET SYSTEM specification.

| Priority | Violation | Impact |
|----------|-----------|--------|
| P0 | Anti-ZZ activates immediately instead of next indicator | Critical logic error |
| P0 | Negative imaginary first bet doesn't update runProfitZZ | Breaks invariant |
| P1 | Anti-ZZ has runProfit fields (should use last bet only) | Structural violation |
| P1 | Anti-ZZ pocket uses runProfit calculation | Logic error |
| P2 | Threshold `>=0` vs `>0` mismatch | Minor inconsistency |

---

## PHASE 1: TYPE DEFINITION CHANGES

### 1.1 Remove Anti-ZZ runProfit Fields

**File:** `src/types/index.ts`

**Current (WRONG):**
```typescript
export interface ZZStrategyState {
  // ...
  antiZZPreviousRunProfit: number;
  antiZZCurrentRunProfit: number;
  antiZZCurrentRunPredictions: number;
  // ...
}
```

**Target (CORRECT):**
```typescript
export interface ZZStrategyState {
  // === ZZ Pattern State ===
  zzPocket: ZZPocket;
  zzCurrentRunProfit: number;          // ZZ's cumulative run profit
  zzFirstBetEvaluated: boolean;

  // === AntiZZ Pattern State ===
  antiZZPocket: ZZPocket;
  antiZZLastBetOutcome: number | null; // ONLY last bet, not cumulative
  antiZZIsCandidate: boolean;          // NEW: waiting to activate on next indicator

  // === Active Pattern Tracking ===
  activePattern: 'ZZ' | 'AntiZZ' | null;

  // === Shared State ===
  savedIndicatorDirection: Direction | null;
  runProfitZZ: number;                 // ALWAYS updated, even for imaginary
  waitingForFirstBet: boolean;
  firstBetBlockIndex: number;

  // ... rest unchanged
}
```

**Changes:**
- Remove `antiZZPreviousRunProfit`
- Remove `antiZZCurrentRunProfit`
- Remove `antiZZCurrentRunPredictions`
- Add `antiZZLastBetOutcome: number | null`
- Add `antiZZIsCandidate: boolean`
- Rename/clarify `runProfitZZ` usage

---

## PHASE 2: STATE MANAGER RESTRUCTURE

### 2.1 Update Initial State

**File:** `src/engine/zz-state-manager.ts`

**Current (WRONG):**
```typescript
private createInitialState(): ZZStrategyState {
  return {
    zzPocket: 1,
    antiZZPocket: 2,
    antiZZPreviousRunProfit: 0,
    antiZZCurrentRunProfit: 0,
    // ...
  };
}
```

**Target (CORRECT):**
```typescript
private createInitialState(): ZZStrategyState {
  return {
    // ZZ State
    zzPocket: 1,                        // ZZ starts POCKET1
    zzCurrentRunProfit: 0,
    zzFirstBetEvaluated: false,

    // AntiZZ State
    antiZZPocket: 2,                    // AntiZZ starts POCKET2
    antiZZLastBetOutcome: null,         // No last bet yet
    antiZZIsCandidate: false,           // Not waiting to activate

    // Active pattern
    activePattern: null,

    // Shared
    savedIndicatorDirection: null,
    runProfitZZ: 0,                     // Will be updated on every indicator
    waitingForFirstBet: false,
    firstBetBlockIndex: -1,

    // ... rest
  };
}
```

---

### 2.2 Rewrite `evaluateImaginaryFirstBet()`

**Current (WRONG):**
```typescript
evaluateImaginaryFirstBet(actualDirection: Direction, profit: number): void {
  const imaginaryProfit = /* ... */;

  if (imaginaryProfit >= 0) {
    // Positive: ZZ activates
    this.state.zzCurrentRunProfit = imaginaryProfit;
    this.state.zzPocket = 1;
    this.state.activePattern = 'ZZ';
  } else {
    // VIOLATION: AntiZZ activates IMMEDIATELY
    this.state.antiZZPocket = 1;
    this.state.activePattern = 'AntiZZ';
    // runProfitZZ NOT updated!
  }
}
```

**Target (CORRECT):**
```typescript
evaluateImaginaryFirstBet(actualDirection: Direction, profit: number): void {
  const zzPredictedDirection = this.getPredictedDirection('ZZ');
  const imaginaryProfit = (actualDirection === zzPredictedDirection) ? profit : -profit;

  // INVARIANT: runProfitZZ is ALWAYS updated, even for imaginary
  this.state.runProfitZZ = imaginaryProfit;

  console.log(`[ZZ] Imaginary first bet: ${imaginaryProfit.toFixed(0)}%`);
  console.log(`[ZZ] runProfitZZ updated to: ${this.state.runProfitZZ.toFixed(0)}%`);

  if (imaginaryProfit >= 0) {
    // POSITIVE imaginary → ZZ moves P2→P1, ZZ bets
    this.state.zzPocket = 1;
    this.state.zzCurrentRunProfit = imaginaryProfit;
    this.state.activePattern = 'ZZ';
    this.state.antiZZIsCandidate = false;

    console.log(`[ZZ] Positive imaginary → ZZ moves to P1, bets`);
  } else {
    // NEGATIVE imaginary → ZZ stays P2, AntiZZ becomes CANDIDATE
    // AntiZZ does NOT play immediately - waits for NEXT indicator
    this.state.zzPocket = 2;
    this.state.antiZZIsCandidate = true;  // Mark as candidate
    this.state.antiZZPocket = 1;          // Will be P1 on next indicator
    this.state.activePattern = null;      // NO ONE plays this indicator

    console.log(`[ZZ] Negative imaginary → ZZ stays P2, AntiZZ CANDIDATE for next indicator`);
  }

  this.state.waitingForFirstBet = false;
}
```

---

### 2.3 Rewrite `handleIndicator()`

Add logic to check if AntiZZ is a candidate and should play:

**Target (CORRECT):**
```typescript
handleIndicator(blockIndex: number, indicatorDirection: Direction): void {
  const zzPocket = this.state.zzPocket;
  const antiZZPocket = this.state.antiZZPocket;
  const antiZZIsCandidate = this.state.antiZZIsCandidate;

  console.log(`[ZZ] === INDICATOR AT BLOCK ${blockIndex} ===`);
  console.log(`[ZZ] Pockets BEFORE: ZZ=P${zzPocket}, AntiZZ=P${antiZZPocket}`);
  console.log(`[ZZ] AntiZZ is candidate: ${antiZZIsCandidate}`);

  this.state.savedIndicatorDirection = indicatorDirection;

  // Case 1: AntiZZ was candidate from previous indicator, now plays
  if (antiZZIsCandidate && antiZZPocket === 1) {
    this.state.activePattern = 'AntiZZ';
    this.state.antiZZIsCandidate = false;  // No longer candidate, now active
    console.log(`[ZZ] AntiZZ was candidate, now plays ONE bet`);
    return;
  }

  // Case 2: ZZ is in P1 - ZZ activates
  if (zzPocket === 1) {
    this.state.activePattern = 'ZZ';
    this.state.zzCurrentRunProfit = 0;
    this.state.zzFirstBetEvaluated = false;
    this.state.waitingForFirstBet = true;
    this.state.firstBetBlockIndex = blockIndex + 1;
    console.log(`[ZZ] ZZ in P1, activating ZZ`);
    return;
  }

  // Case 3: ZZ is in P2 - need imaginary first bet evaluation
  if (zzPocket === 2) {
    this.state.waitingForFirstBet = true;
    this.state.firstBetBlockIndex = blockIndex + 1;
    console.log(`[ZZ] ZZ in P2, waiting for imaginary first bet evaluation`);
    return;
  }
}
```

---

### 2.4 Rewrite Anti-ZZ Result Recording

**Current (WRONG):**
```typescript
recordAntiZZResult(profit: number, blockIndex: number): void {
  this.state.antiZZCurrentRunProfit += profit;  // WRONG: uses cumulative

  if (profit < 0) {
    const newPocket = this.calculatePocket(this.state.antiZZCurrentRunProfit);  // WRONG
    this.state.antiZZPocket = newPocket;
  }
}
```

**Target (CORRECT):**
```typescript
recordAntiZZResult(profit: number, blockIndex: number): void {
  // AntiZZ only tracks LAST BET outcome
  this.state.antiZZLastBetOutcome = profit;

  console.log(`[ZZ] AntiZZ bet result: ${profit.toFixed(0)}%`);

  // AntiZZ pocket is based ONLY on last bet
  if (profit < 0) {
    // LOSS → AntiZZ moves to P2
    this.state.antiZZPocket = 2;
    this.state.activePattern = null;
    console.log(`[ZZ] AntiZZ lost → moves to P2`);
  } else {
    // WIN → AntiZZ stays P1
    this.state.antiZZPocket = 1;
    // activePattern stays 'AntiZZ' until next indicator
    console.log(`[ZZ] AntiZZ won → stays P1`);
  }

  // AntiZZ always deactivates after ONE bet (waits for next indicator)
  this.state.activePattern = null;
}
```

---

### 2.5 Rewrite ZZ Result Recording

**Current (WRONG):**
```typescript
recordZZResult(profit: number, blockIndex: number): void {
  this.state.zzCurrentRunProfit += profit;

  // First bet tracking for Anti-ZZ
  if (!this.state.zzFirstBetEvaluated) {
    this.state.zzFirstBetEvaluated = true;
    if (profit < 0) {
      // VIOLATION: activates AntiZZ immediately
      this.state.antiZZPocket = 1;
      this.state.activePattern = 'AntiZZ';
    }
  }
}
```

**Target (CORRECT):**
```typescript
recordZZResult(profit: number, blockIndex: number): void {
  // Update cumulative run profit
  this.state.zzCurrentRunProfit += profit;
  this.state.runProfitZZ = this.state.zzCurrentRunProfit;

  console.log(`[ZZ] ZZ bet result: ${profit.toFixed(0)}%, runProfitZZ: ${this.state.runProfitZZ.toFixed(0)}%`);

  // First bet tracking for Anti-ZZ activation
  if (!this.state.zzFirstBetEvaluated) {
    this.state.zzFirstBetEvaluated = true;

    if (profit < 0) {
      // First bet NEGATIVE → ZZ breaks, AntiZZ becomes CANDIDATE
      console.log(`[ZZ] ZZ first bet NEGATIVE → AntiZZ becomes CANDIDATE`);

      // ZZ moves to P2 based on runProfitZZ
      this.state.zzPocket = 2;
      this.state.activePattern = null;

      // AntiZZ becomes candidate for NEXT indicator (NOT immediate)
      this.state.antiZZIsCandidate = true;
      this.state.antiZZPocket = 1;
    }
    return;
  }

  // Subsequent bets
  if (profit < 0) {
    // Run breaks on negative result
    this.resolveZZRun(blockIndex);
  }
}

private resolveZZRun(blockIndex: number): void {
  const runProfit = this.state.runProfitZZ;

  console.log(`[ZZ] ZZ run ended with runProfitZZ: ${runProfit.toFixed(0)}%`);

  // ZZ pocket based on runProfitZZ
  if (runProfit > 0) {
    this.state.zzPocket = 1;
    console.log(`[ZZ] runProfitZZ > 0 → ZZ stays P1`);
  } else {
    this.state.zzPocket = 2;
    console.log(`[ZZ] runProfitZZ <= 0 → ZZ moves to P2`);
  }

  this.state.activePattern = null;
  this.state.zzFirstBetEvaluated = false;
}
```

---

### 2.6 Add Required Logging Function

**New function:**
```typescript
private logIndicatorState(phase: 'BEFORE' | 'AFTER', blockIndex: number): void {
  console.log(`[ZZ] Pockets ${phase}: ZZ=P${this.state.zzPocket}, AntiZZ=P${this.state.antiZZPocket}`);
  console.log(`[ZZ] runProfitZZ: ${this.state.runProfitZZ.toFixed(0)}%`);
  console.log(`[ZZ] activePattern: ${this.state.activePattern || 'none'}`);
  console.log(`[ZZ] antiZZIsCandidate: ${this.state.antiZZIsCandidate}`);
}
```

---

## PHASE 3: THRESHOLD CLARIFICATION

### 3.1 Clarify `>0` vs `>=0`

**Specification says:**
- `runProfitZZ > 0` → POCKET1
- `runProfitZZ <= 0` → POCKET2

**Current code uses `>= 0`.**

**Decision:** Update to match specification strictly.

```typescript
private calculateZZPocket(): ZZPocket {
  return this.state.runProfitZZ > 0 ? 1 : 2;  // Strict: > 0, not >= 0
}
```

---

## PHASE 4: REACTION ENGINE UPDATES

### 4.1 Update `processZZResults()` in reaction.ts

Ensure the reaction engine correctly:
1. Calls `evaluateImaginaryFirstBet()` when ZZ is in P2
2. Calls `recordZZResult()` when ZZ is in P1
3. Calls `recordAntiZZResult()` when AntiZZ plays (max once per indicator)

---

## PHASE 5: TEST IMPLEMENTATION

### 5.1 Required Test Cases

**File:** `tests/unit/zz-pocket-system.test.ts`

```typescript
describe('ZZ Pocket System - Strict Spec Compliance', () => {

  test('runProfitZZ changes on EVERY indicator (including imaginary)', () => {
    // Setup: ZZ in P2
    // Action: New indicator, imaginary first bet
    // Assert: runProfitZZ was updated
  });

  test('Anti-ZZ never places more than one bet per indicator', () => {
    // Setup: AntiZZ in P1
    // Action: AntiZZ plays
    // Assert: Exactly 1 bet placed, then waits for next indicator
  });

  test('Anti-ZZ waits for NEXT indicator after becoming candidate', () => {
    // Setup: Both in P2, imaginary first bet negative
    // Action: Process indicator
    // Assert: AntiZZ becomes candidate but does NOT play
    // Action: Next indicator
    // Assert: AntiZZ now plays
  });

  test('Anti-ZZ pocket based on last bet only (no runProfit)', () => {
    // Setup: AntiZZ plays, wins +85%
    // Assert: AntiZZ stays P1
    // Action: AntiZZ plays, loses -85%
    // Assert: AntiZZ moves to P2
  });

  test('Negative runProfitZZ does NOT activate Anti-ZZ unless firstOutcomeZZ negative', () => {
    // Setup: ZZ run ends with negative total but first bet was positive
    // Assert: Anti-ZZ NOT activated
  });

});
```

---

## IMPLEMENTATION ORDER

| Step | Task | Files | Priority |
|------|------|-------|----------|
| 1 | Update type definitions | `src/types/index.ts` | P0 |
| 2 | Update initial state | `src/engine/zz-state-manager.ts` | P0 |
| 3 | Rewrite `evaluateImaginaryFirstBet()` | `src/engine/zz-state-manager.ts` | P0 |
| 4 | Rewrite `handleIndicator()` | `src/engine/zz-state-manager.ts` | P0 |
| 5 | Rewrite `recordAntiZZResult()` | `src/engine/zz-state-manager.ts` | P0 |
| 6 | Rewrite `recordZZResult()` | `src/engine/zz-state-manager.ts` | P0 |
| 7 | Add logging function | `src/engine/zz-state-manager.ts` | P1 |
| 8 | Update threshold to `>0` | `src/engine/zz-state-manager.ts` | P2 |
| 9 | Update reaction engine | `src/engine/reaction.ts` | P1 |
| 10 | Write test cases | `tests/unit/zz-pocket-system.test.ts` | P1 |
| 11 | Run full test suite | - | P1 |
| 12 | Manual integration testing | - | P2 |

---

## VALIDATION CHECKLIST

Before marking complete, verify:

- [ ] All type definitions updated
- [ ] Initial state matches spec
- [ ] `runProfitZZ` updated on EVERY indicator (including imaginary)
- [ ] Anti-ZZ has NO runProfit fields
- [ ] Anti-ZZ pocket based on last bet ONLY
- [ ] Anti-ZZ waits for NEXT indicator after becoming candidate
- [ ] Anti-ZZ places MAX 1 bet per indicator
- [ ] Required logging implemented
- [ ] All required tests pass
- [ ] Build succeeds with no type errors
- [ ] Manual testing confirms correct behavior

---

## RISK ASSESSMENT

| Risk | Mitigation |
|------|------------|
| Breaking existing sessions | Sessions will reset on upgrade (document in changelog) |
| Type errors during migration | Implement changes incrementally, fix errors as they appear |
| Regression in other patterns | Run full test suite after changes |
| Incorrect pocket transitions | Manual testing with debug logging enabled |

---

## ROLLBACK PLAN

If critical issues found:
1. Git revert to pre-implementation commit
2. Document specific failure case
3. Update plan with fix
4. Re-implement

---

*Plan version: v16.0 - Ready for Implementation*
