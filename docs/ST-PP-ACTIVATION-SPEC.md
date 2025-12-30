# ST & PP Pattern Activation Specification

**Version:** 1.0
**Date:** 2025-12-30
**Status:** Implemented

---

## 1. Overview

ST (Street) and PP (Ping-Pong) are rhythm-based patterns that require **confirmation** before activation to prevent premature betting.

### Problem Solved

Previously, ST and PP would activate too early:
- Activated on first observation of rhythm
- Lost money before rhythm was truly established
- Blocked BNS inverse opportunities

### Solution

Both patterns now require **structural confirmation** before activation:
- ST requires an indicator (≥3 run) before it can activate
- PP requires a complete 1-2 cycle before it can activate

---

## 2. ST (Street) Pattern

### 2.1 What ST Detects

ST detects a **2-2 rhythm** (doubles alternating):
```
R R  G G  R R  G G  ...
 2    2    2    2
```

### 2.2 Activation Requirements

ST requires **three conditions** to activate:

| Requirement | Description | Why |
|-------------|-------------|-----|
| 1. Indicator | ≥3 run seen | Proves we're not in pure alternation |
| 2. Double after indicator | 2-block run after indicator | Shows 2-2 rhythm forming |
| 3. Profit threshold | 70% single OR 100% cumulative | Rhythm is profitable |

### 2.3 State Tracking

```typescript
interface STCycleState {
  stIndicatorSeen: boolean;      // Has a ≥3 run been seen?
  stDoublesAfterIndicator: number; // Count of doubles after indicator
  cumulativeProfit: number;      // Accumulated observation profit
}
```

### 2.4 Activation Flow

```
1. OBSERVING: stIndicatorSeen = false
   ↓
   [See ≥3 run]
   ↓
2. INDICATOR SEEN: stIndicatorSeen = true, stDoublesAfterIndicator = 0
   ↓
   [See double (2-block run)]
   ↓
3. TRACKING DOUBLES: stDoublesAfterIndicator++
   ↓
   [Check profit threshold]
   ↓
4. ACTIVE (if threshold met)
```

### 2.5 Structure Break (Reset)

When the 2-2 rhythm breaks (≥3 run while observing):

```typescript
// Reset observation state
cycle.cumulativeProfit = 0;
cycle.stDoublesAfterIndicator = 0;
// NOTE: stIndicatorSeen is NOT reset - we just saw the indicator!
```

**CRITICAL**: `stIndicatorSeen` is NOT reset on ≥3 runs because the ≥3 run IS the indicator.

### 2.6 Code References

- Indicator notification: `state.ts:144-146`
- Double tracking: `state.ts:197-207`
- Reset handling: `lifecycle.ts:939-960`
- Confirmation: `lifecycle.ts:827-874`

---

## 3. PP (Ping-Pong) Pattern

### 3.1 What PP Detects

PP detects a **1-2 rhythm** (singles and doubles alternating):
```
R  G G  R  G G  R  G G  ...
1   2   1   2   1   2
```

### 3.2 Activation Requirements

PP requires **two conditions** to activate:

| Requirement | Description | Why |
|-------------|-------------|-----|
| 1. Complete 1-2 cycle | Single followed by double | Shows rhythm exists |
| 2. Profit threshold | 70% single OR 100% cumulative | Rhythm is profitable |

### 3.3 State Tracking

```typescript
interface PPCycleState {
  ppCyclesSeen: number;    // Count of complete 1-2 cycles
  cumulativeProfit: number; // Accumulated observation profit
}
```

### 3.4 Activation Flow

```
1. OBSERVING: ppCyclesSeen = 0
   ↓
   [See single (1) then double (2)]
   ↓
2. CYCLE COMPLETE: ppCyclesSeen++
   ↓
   [Check profit threshold]
   ↓
3. ACTIVE (if threshold met)
```

### 3.5 Structure Break (Reset)

When the 1-2 rhythm breaks:
- Run reaches 3+ (exits 1-2 rhythm)
- Two singles in a row (expected double after single)

```typescript
// Reset observation state
cycle.cumulativeProfit = 0;
cycle.ppCyclesSeen = 0;
```

### 3.6 Code References

- Cycle notification: `state.ts:152-167`
- Reset handling: `lifecycle.ts:799-820`
- Confirmation: `lifecycle.ts:700-779`

---

## 4. Observation Reset Rules

### 4.1 A4: Break Handling Must Reset Accumulated Profit

Both ST and PP follow the A4 rule:

> When structure breaks during observation, cumulative profit must reset to prevent "activates out of nowhere" bugs.

### 4.2 Reset Summary

| Pattern | Reset Trigger | What Resets | What Persists |
|---------|---------------|-------------|---------------|
| ST | ≥3 run | cumulativeProfit, stDoublesAfterIndicator | **stIndicatorSeen** |
| PP | ≥3 run OR 1-1 | cumulativeProfit, ppCyclesSeen | - |
| OZ | <3 flip back | cumulativeProfit | - |
| AP5 | <3 flip back | cumulativeProfit | - |

### 4.3 Why ST Preserves Indicator

The ≥3 run that triggers ST reset is ALSO the indicator:

```
Previous: 2 2 2 (observing ST rhythm)
Current:  3+ (breaks ST rhythm but IS the indicator!)

WRONG: Reset stIndicatorSeen = false (indicator would never be set)
RIGHT: Keep stIndicatorSeen = true (the ≥3 run we just saw IS the indicator)
```

---

## 5. Confirmation Logic

### 5.1 ST Confirmation

```typescript
confirmSTPattern(firstBlockProfit: number, blockIndex: number): boolean {
  // 1. Must be observing
  if (cycle.state !== 'observing') return false;

  // 2. Must have seen indicator
  if (!cycle.stIndicatorSeen) return false;

  // 3. Track cumulative profit
  cycle.cumulativeProfit += firstBlockProfit;

  // 4. Check thresholds
  if (firstBlockProfit >= 70 || cycle.cumulativeProfit >= 100) {
    // ACTIVATE
    cycle.state = 'active';
    return true;
  }

  return false;
}
```

### 5.2 PP Confirmation

```typescript
confirmPPPattern(firstBlockProfit: number, blockIndex: number): boolean {
  // 1. Must be observing
  if (cycle.state !== 'observing') return false;

  // 2. Must have seen complete cycle
  if (cycle.ppCyclesSeen < 1) return false;

  // 3. Track cumulative profit
  cycle.cumulativeProfit += firstBlockProfit;

  // 4. Check thresholds
  if (firstBlockProfit >= 70 || cycle.cumulativeProfit >= 100) {
    // ACTIVATE
    cycle.state = 'active';
    return true;
  }

  return false;
}
```

---

## 6. Integration with State Manager

### 6.1 Block Processing Order

In `state.ts`, the order of operations matters:

```typescript
processBlock(block: Block): void {
  // 1. ST Indicator tracking (at currentLength === 3)
  if (this.runData.currentLength === 3) {
    this.lifecycle.notifySTIndicator(index);
  }

  // 2. PP cycle tracking (at currentLength === 2 after single)
  if (this.runData.currentLength === 2 && previousRunLength === 1) {
    this.lifecycle.notifyPPCycle(index);
    this.lifecycle.confirmPPPattern(firstBlockPct, index);
  }

  // 3. PP structure break (at currentLength >= 3 OR two singles)
  if (this.runData.currentLength >= 3) {
    this.lifecycle.resetPPObservation(index);
  }

  // 4. ST double tracking (at currentLength === 2 after 2+)
  if (this.runData.currentLength === 2 && previousRunLength >= 2) {
    this.lifecycle.notifySTDouble(index);
    this.lifecycle.confirmSTPattern(secondBlockPct, index);
  }

  // 5. ST structure break (at currentLength >= 3)
  if (this.runData.currentLength >= 3) {
    this.lifecycle.resetSTObservation(index);
  }
}
```

---

## 7. Testing

### 7.1 ST Test Cases

| Test | Input | Expected |
|------|-------|----------|
| No indicator | 2-2-2 | No activation |
| Indicator then double | 3-2 | Can activate |
| Reset cumulative on break | 2-2-3 | cumulativeProfit = 0 |
| Preserve indicator on break | 2-2-3-2 | stIndicatorSeen = true |

### 7.2 PP Test Cases

| Test | Input | Expected |
|------|-------|----------|
| No cycle | 2-2 | No activation |
| Complete cycle | 1-2 | Can activate |
| Reset on 3+ | 1-2-3 | ppCyclesSeen = 0 |
| Reset on 1-1 | 1-1 | ppCyclesSeen = 0 |

---

## 8. Changelog

| Date | Change |
|------|--------|
| 2025-12-30 | Initial specification |
| 2025-12-30 | Fixed ST indicator preservation bug |

---

**End of Specification**
