# ZZ and Anti-ZZ Pattern Analysis Report

> **VERSION:** v1.1
> **DATE:** 2025-12-30

## Executive Summary

This document provides a detailed analysis of the ZZ and Anti-ZZ patterns, their objectives, activation rules, and the current implementation in Ghost Evaluator v15.3.

---

## 1. Pattern Objectives

### 1.1 ZZ (Zig-Zag)

**Purpose:** Predict that market alternation will CONTINUE.

**Logic:**
- Detects a "zig-zag" pattern: run of 2+ blocks → flip → expects alternation to continue
- Predicts OPPOSITE of current direction
- Example: If current direction is UP, ZZ predicts DOWN (alternation continues)

### 1.2 Anti-ZZ

**Purpose:** Predict that market alternation will BREAK (fake-out detection).

**Logic:**
- Activates when ZZ's first bet of the PREVIOUS run was NEGATIVE
- Predicts SAME as current direction (continuation, not alternation)
- Example: If current direction is UP, Anti-ZZ predicts UP (alternation breaks)

**Key Insight:** Anti-ZZ is a "fool me once" strategy. If the market faked the alternation before (ZZ's first bet lost), assume they'll fake it again.

---

## 2. Activation Rules

### 2.1 ZZ Activation

| Condition | Result |
|-----------|--------|
| ZZ indicators detected (2+ run → flip) | ZZ activates |
| Previous run's first bet was negative | Anti-ZZ activates INSTEAD of ZZ |
| Both conditions false | Both inactive |

### 2.2 Anti-ZZ Activation

**Trigger:** ZZ's first BET of the PREVIOUS run was NEGATIVE.

**Important Distinctions:**
- `firstBetNegative` ≠ `lastRunProfit < 0`
- First bet can be positive (+70%) but run can still end negative (-10% total)
- Anti-ZZ triggers based on FIRST BET result, not total run profit

**Example:**
```
Run 1:
  - First bet: -80% (NEGATIVE) ← This triggers Anti-ZZ
  - Run ends

Run 2 (ZZ indicators appear):
  - Anti-ZZ activates (because Run 1's first bet was negative)
  - NOT regular ZZ
```

### 2.3 Both Can Be Inactive

ZZ and Anti-ZZ are NOT always active. Both are inactive when:
- No ZZ indicators present
- Pattern broke and waiting for new indicators

---

## 3. Pocket System

### 3.1 Pocket Assignment

| Previous Run Profit | Pocket | Action |
|---------------------|--------|--------|
| >= 0 (positive or zero) | Pocket 1 | ACTIVE - BET normally |
| < 0 (negative) | Pocket 2 | INACTIVE - OBSERVE only |

### 3.2 No Exceptions

**Rule:** Both ZZ and Anti-ZZ follow the SAME pocket rules.

- Pocket 1 (ACTIVE) → BET (whichever pattern is active)
- Pocket 2 (INACTIVE) → DON'T BET (observe only, track hypothetical profit)

Anti-ZZ does NOT override Pocket 2. If you're in Pocket 2, you observe even if Anti-ZZ is active.

### 3.3 Pocket Transitions

```
ZZ loses (profit < 0)
  → previousRunProfit = negative
  → Next activation = Pocket 2 (INACTIVE)

ZZ in Pocket 2 observes
  → Track hypothetical profit
  → If observation profitable: next activation = Pocket 1
  → If observation negative: next activation = Pocket 2
```

---

## 4. Continuity Rules

### 4.1 ZZ Continuity

ZZ continues while indicators are present:
- On ZZ indicator → activate and bet (if Pocket 1)
- If ZZ wins → wait for next indicator
- If ZZ loses → resolve run, assign pocket for next activation

### 4.2 Anti-ZZ Pseudo-Continuity

**Anti-ZZ stays in Pocket 1 after winning:**

When Anti-ZZ wins:
1. `continueAntiZZAfterWin()` is called
2. Anti-ZZ stays ACTIVE (doesn't break)
3. Pocket stays at 1 (always after win)
4. `savedIndicatorDirection` is preserved
5. Waits for next ZZ indicator to bet again

```
Anti-ZZ Run 1: +70% (positive)
  → continueAntiZZAfterWin() called
  → Stay active in Pocket 1

ZZ Indicator appears:
  → BET Anti-ZZ again

Anti-ZZ Run 2: +65% (positive)
  → Stay active in Pocket 1

Anti-ZZ Run 3: -80% (negative)
  → resolveZZRun() called
  → previousRunProfit = -80%
  → Next activation = Pocket 2
```

---

## 5. Implementation Details (v15.3)

### 5.1 Code Components

| Component | File | Purpose |
|-----------|------|---------|
| ZZStateManager | `zz-state-manager.ts` | Tracks ZZ/Anti-ZZ state, pocket, profit |
| Lifecycle | `lifecycle.ts` | Tracks pattern state, generates signals |
| GameState | `state.ts` | Evaluates signals, manages blocks |
| ReactionEngine | `reaction.ts` | Coordinates all components |

### 5.2 Key Functions

#### `activateZZ(blockIndex, _, indicatorDirection)`
- Called when ZZ indicators detected and ZZStateManager is inactive
- Uses `previousRunProfit` to calculate pocket
- Sets `currentState` to 'zz_active' or 'anti_zz_active'

#### `recordPredictionResult(result)`
- Records ZZ/Anti-ZZ bet results
- Updates `currentRunProfit`
- First prediction triggers `evaluateFirstPrediction()` for Anti-ZZ tracking

#### `resolveZZRun(blockIndex)`
- Called when ZZ/Anti-ZZ pattern breaks (loses)
- Saves `previousRunProfit = currentRunProfit`
- Saves `previousRunFirstBetFailed` for Anti-ZZ trigger
- Resets state to 'inactive'

#### `continueAntiZZAfterWin(indicatorDirection)`
- Called when Anti-ZZ wins (profit > 0)
- Keeps state as 'anti_zz_active'
- Sets pocket to 1 (always after win)
- Preserves indicator direction for next signal

### 5.3 Flow Diagram

```
Block N: ZZ indicators detected
  1. addBlock() → lifecycle activates ZZ
  2. processZZResults() → no result yet
  3. checkZZActivation() → activateZZ() called
     → pocket = assignPocket(previousRunProfit)

Block N+1: ZZ signal evaluated
  1. addBlock() → lifecycle evaluates signal
     → If loss: breakPattern() called
  2. processZZResults() → recordPredictionResult()
     → currentRunProfit updated
  3. Resolution check → if broken: resolveZZRun()
     → previousRunProfit = currentRunProfit

Block N+2: New ZZ indicators
  1. checkZZActivation() → activateZZ()
     → pocket = assignPocket(previousRunProfit)
     → If prev was negative: Pocket 2
```

---

## 6. State Machine

```
                    ┌─────────────────────────────────────────────┐
                    │                                             │
                    ▼                                             │
┌──────────┐   ZZ indicators   ┌──────────┐                      │
│          │ ────────────────► │          │                      │
│ INACTIVE │                   │ ZZ_ACTIVE│──── Win ─────────────┤
│          │ ◄──── Loss ────── │          │     (stay active)    │
└──────────┘   (run negative)  └──────────┘                      │
     │                              │                             │
     │                              │ First bet                   │
     │                              │ negative                    │
     │                              ▼                             │
     │         ZZ indicators   ┌──────────────┐                  │
     │         (prev 1st bet   │              │                  │
     │          was negative)  │ ANTI_ZZ_ACTIVE│── Win ──────────┘
     └────────────────────────►│              │   (Pocket 1,
                               └──────────────┘    continue)
                                     │
                                     │ Loss (run negative)
                                     ▼
                               ┌──────────┐
                               │ INACTIVE │
                               └──────────┘
```

---

## 7. Key Rules Summary

### 7.1 ZZ Rules

1. Activates on ZZ indicators (2+ run → flip)
2. Predicts OPPOSITE direction
3. Pocket assigned by `previousRunProfit`
4. Breaks to INACTIVE on loss
5. Does NOT go to Anti-ZZ based on run profit (only first bet)

### 7.2 Anti-ZZ Rules

1. Activates ONLY when previous ZZ's FIRST BET was negative
2. Predicts SAME direction
3. After WIN: stays in Pocket 1, continues betting
4. After LOSS: breaks, pocket assigned by profit
5. Follows same pocket rules as ZZ

### 7.3 Pocket Rules

1. Pocket 1 (prev profit >= 0): ACTIVE - BET the pattern
2. Pocket 2 (prev profit < 0): INACTIVE - OBSERVE only
3. Same rules apply to BOTH ZZ and Anti-ZZ (no exceptions)
4. Anti-ZZ after win: always Pocket 1

### 7.4 Debug Logs

Console logs for debugging pocket assignment:
- `[ZZ POCKET] ZZ activating: prevProfit=X% → Pocket N`
- `[ZZ POCKET] Run ended: profit=X% → next pocket will be N`

---

## 8. Test Scenarios

### Scenario 1: Normal ZZ Flow
```
Block 1-3: Run of 3 UP
Block 4: Flip to DOWN → ZZ indicator detected
  → ZZ activates in Pocket 1 (prevProfit=0)
Block 5: ZZ predicts UP, result: UP (+70%)
  → ZZ wins, stays active
```

### Scenario 2: ZZ Loss → Pocket 2
```
ZZ Run 1 in Pocket 1:
  Bet: -80%
  → resolveZZRun(): previousRunProfit = -80%
  → Log: "Run ended: profit=-80% → next pocket will be 2"

Next ZZ indicators:
  → activateZZ(): pocket = assignPocket(-80%) = 2
  → Log: "ZZ activating: prevProfit=-80% → Pocket 2"
  → ZZ in Pocket 2 = OBSERVE only, don't bet
```

### Scenario 3: ZZ → Anti-ZZ Transition
```
ZZ Run 1:
  First bet: -80% (NEGATIVE) ← Triggers Anti-ZZ
  Run ends

Next ZZ indicator:
  → activateZZ() checks previousRunFirstBetFailed = true
  → Anti-ZZ activates instead of ZZ
```

### Scenario 4: Anti-ZZ Continuation
```
Anti-ZZ Run 1: +70%
  → continueAntiZZAfterWin() called
  → Stay active in Pocket 1

ZZ Indicator appears:
  → BET Anti-ZZ again (still active, Pocket 1)

Anti-ZZ Run 2: -80%
  → resolveZZRun(): previousRunProfit = -80%
  → Next activation = Pocket 2
```

---

## 9. Files Involved

- `src/engine/zz-state-manager.ts` - ZZ state tracking, pocket assignment
- `src/patterns/lifecycle.ts` - Pattern lifecycle management
- `src/engine/state.ts` - Signal generation
- `src/engine/reaction.ts` - Coordination, activation, resolution

---

## 10. ZZ/AntiZZ and Same Direction Interaction

### 10.1 ZZ-Family Hard Isolation (V-001/A1)

ZZ/AntiZZ and SD are **conflicting strategies**:
- ZZ/AntiZZ predicts **alternation** (direction change)
- SD predicts **continuation** (same direction)

When ZZ/AntiZZ is active, SD's flip losses must be isolated.

### 10.2 Key Rules

| Rule | Description |
|------|-------------|
| **V-001** | ZZ/AntiZZ wins do NOT clear SD accumulated loss |
| **A1** | Flip losses during ZZ indicator/active period don't count against SD |

### 10.3 ZZ Indicator Loss Reversal

When ZZ indicator fires (3 alternating blocks detected):
- Any flip losses SD accumulated during those blocks are **reversed**
- Those losses were from alternation behavior, not continuation failure

### 10.4 Active ZZ Period

When ZZ/AntiZZ is actively betting:
- SD continues observing runs
- SD does NOT accumulate flip losses
- `isZZFamilyActive = true` flag skips loss accumulation

### 10.5 Why This Matters

Without isolation:
1. ZZ indicator fires during alternating market
2. SD accumulates flip losses from alternation
3. SD deactivates due to "losses" it never actually bet
4. SD misses the next same-direction run

With isolation:
1. ZZ indicator fires during alternating market
2. SD's flip losses from indicator blocks are reversed
3. SD remains healthy for next same-direction run
4. Both systems work without contaminating each other

---

*Report updated for Ghost Evaluator v15.3*
