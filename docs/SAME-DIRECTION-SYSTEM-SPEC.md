# SAME DIRECTION SYSTEM SPECIFICATION

> **VERSION:** v1.1 (Authoritative)
> **STATUS:** FINAL - DO NOT REINTERPRET
> **DATE:** 2025-12-30 (Updated from v1.0 2025-12-17)

This document is the **single source of truth** for the Same Direction System implementation.
All code must conform exactly to these rules. Any deviation is a bug.

---

## TABLE OF CONTENTS

1. [What Same Direction IS and IS NOT](#1-what-same-direction-is-and-is-not)
2. [Core Definitions](#2-core-definitions)
3. [RunProfit Calculation](#3-runprofit-calculation)
4. [Activation Rules](#4-activation-rules)
5. [Betting Rules](#5-betting-rules)
6. [Loss Accumulation](#6-loss-accumulation)
7. [Deactivation (Cut)](#7-deactivation-cut)
8. [Pocket System Interaction](#8-pocket-system-interaction)
9. [State Management](#9-state-management)
10. [Required Logging](#10-required-logging)
11. [Complete Flow Examples](#11-complete-flow-examples)
12. [Implementation Checklist](#12-implementation-checklist)
13. [Reference Pseudocode](#13-reference-pseudocode)

---

## 1. WHAT SAME DIRECTION IS AND IS NOT

### 1.1 What Same Direction IS NOT (CRITICAL)

Same Direction is **NOT**:

| Wrong Interpretation | Why It's Wrong |
|---------------------|----------------|
| "Pick GREEN and bet GREEN until loss" | Fails in alternating clusters |
| "Pick RED and bet RED until loss" | Naive same-direction betting loses heavily |
| "Bet the direction you like" | Direction is inferred, not chosen |
| "Simple continuation betting" | It's profit-regime-based, not per-bet |

### 1.2 What Same Direction ACTUALLY IS

Same Direction is a **run-based profit regime**:

| Property | Description |
|----------|-------------|
| **Trigger** | RunProfit >= 140 (profit proves regime exists) |
| **Basis** | Inferred from run data, not arbitrary choice |
| **Profit calculation** | Per run, not per bet |
| **Loss tracking** | Accumulates across runs |
| **Exit** | Only when accumulated losses exceed threshold |

### 1.3 Why This System Exists

| Problem | Solution |
|---------|----------|
| XAX patterns fail during same-direction dominance | Same Direction captures those regimes |
| Long runs can trap bucket patterns | Same Direction profits from continuation |
| Need mode alternation, not strategy stacking | Hierarchy manages which mode is active |

---

## 2. CORE DEFINITIONS

### 2.1 Direction

Each block has a direction:

| Symbol | Meaning | Value |
|--------|---------|-------|
| **G** | Green / Up | +1 |
| **R** | Red / Down | -1 |

### 2.2 Run

A **run** is a sequence of consecutive blocks with the **same direction**.

```
G G G G R   ← Run of 4 G's, ended by R

R R R G     ← Run of 3 R's, ended by G
```

### 2.3 Break Block

The **break block** is the first opposite-direction block that ends a run.

```
Run:        G G G G
Break:              R  ← This is the break block

The break block is ALWAYS part of the calculation.
```

### 2.4 Run Blocks vs Break Block

| Term | Definition |
|------|------------|
| **Run blocks (D1..Dk)** | Consecutive blocks in same direction |
| **Break block (B1)** | First opposite block that ends the run |

```
D1  D2  D3  D4  B1
G   G   G   G   R
↑               ↑
Run blocks      Break block
```

---

## 3. RUNPROFIT CALCULATION

### 3.1 The Formula (EXACT)

```
RunProfit = sum(D2..Dk) - B1

Where:
- D1 = First block of run (NEVER counted)
- D2..Dk = Remaining blocks of run (counted)
- B1 = Break block (ALWAYS subtracted)
```

### 3.2 Why D1 is Skipped

The first block of a run is **not predictable** at the time it occurs:
- You don't know a run is starting until you see continuation
- D1 is the "establishing" block
- Profit starts from D2 onwards

### 3.3 Why B1 is Subtracted

The break block represents:
- The cost of continuation betting when the run ends
- You would bet "same" on this block and lose
- This loss is part of the run's net profit

### 3.4 Minimum Run Length

| Run Length | Can Calculate RunProfit? |
|------------|--------------------------|
| 1 block | NO - no D2 exists |
| 2+ blocks | YES - D2 exists |

```
G R        ← Length 1, cannot calculate
G G R      ← Length 2, RunProfit = D2 - B1 = G[2] - R
G G G R    ← Length 3, RunProfit = D2 + D3 - B1
```

### 3.5 Concrete Examples

**Example 1 - Activation Scenario:**
```
Blocks:     G   G   G   R
Profits:    -   91  91  30

D1 = G (skipped)
D2 = 91%
D3 = 91%
B1 = 30%

RunProfit = 91 + 91 - 30 = +152%

→ Since 152 >= 140, Same Direction ACTIVATES
```

**Example 2 - Not Activated:**
```
Blocks:     G   G   R
Profits:    -   70  40

D1 = G (skipped)
D2 = 70%
B1 = 40%

RunProfit = 70 - 40 = +30%

→ 30 < 140, no activation
```

**Example 3 - Negative Run (Loss):**
```
Blocks:     G   G   G   R
Profits:    -   40  40  120

D1 = G (skipped)
D2 = 40%
D3 = 40%
B1 = 120%

RunProfit = 40 + 40 - 120 = -40%

→ This is a LOSS run
```

**Example 4 - Large Activation:**
```
Blocks:     R   R   R   R   R   G
Profits:    -   85  85  85  85  50

RunProfit = 85 + 85 + 85 + 85 - 50 = +290%

→ 290 >= 140, ACTIVATES
```

---

## 4. ACTIVATION RULES

### 4.1 Activation Condition

Same Direction becomes **ACTIVE** when:

```
A run breaks AND RunProfit >= 140
```

### 4.2 Activation Is Data-Driven

Activation is **NOT** based on:
- Number of blocks
- Number of wins
- Direction guess
- User preference

Activation is **ONLY** based on:
- Net run profit meeting threshold

### 4.3 On Activation

When Same Direction activates:

```typescript
sameDir.active = true;
sameDir.accumulatedLoss = 0;  // Start clean
sameDir.currentDirection = previousBlockDirection;  // For continuation
sameDir.activationBlockIndex = currentBlockIndex;
```

### 4.4 Activation Example Flow

```
BLOCK 10: G +85%  (run starts)
BLOCK 11: G +91%  (run continues)
BLOCK 12: G +91%  (run continues)
BLOCK 13: R +30%  (run breaks!)

RunProfit = 91 + 91 - 30 = +152%
152 >= 140 → ACTIVATE

sameDir.active = true
sameDir.accumulatedLoss = 0
sameDir.currentDirection = G (previous direction)
```

---

## 5. BETTING RULES

### 5.1 When Same Direction Bets

Same Direction bets when:
1. `sameDir.active === true`
2. Hierarchy allows (no Pocket System betting this block)

### 5.2 Betting Direction (CRITICAL)

**Same Direction bets the SAME direction as the PREVIOUS block.**

| Previous Block | Bet Direction | Prediction |
|----------------|---------------|------------|
| G | G | Continuation |
| R | R | Continuation |

This is **continuation betting**, not prediction of run direction.

### 5.3 Win/Loss Evaluation

| Actual Result | Bet Result |
|---------------|------------|
| Same as previous | **WIN** (continuation happened) |
| Opposite of previous | **LOSS** (break happened) |

### 5.4 Betting Does NOT Use Individual Block Outcomes Directly

Important: Same Direction's accumulatedLoss is updated from **RunProfit at run breaks**, NOT from individual bet outcomes.

```
WRONG:
  Each block: if bet loses, add to accumulatedLoss

CORRECT:
  At run break: calculate RunProfit, update accumulatedLoss
```

---

## 6. LOSS ACCUMULATION

### 6.1 The Reset Rule (MOST IMPORTANT)

**Loss accumulation happens ONLY at run breaks, NOT per block.**

### 6.2 What Happens at Each Run Break

```
At run break:
  1. Calculate RunProfit
  2. Reset runAccumulator = 0 (for next run)
  3. Update accumulatedLoss based on RunProfit:

     IF RunProfit < 0:
       accumulatedLoss += abs(RunProfit)
       IF accumulatedLoss > 140:
         DEACTIVATE

     ELSE IF RunProfit > 0:
       IF RunProfit > accumulatedLoss:
         accumulatedLoss = 0  ← RESET RULE
       ELSE:
         // Do nothing to accumulatedLoss
         // It remains unchanged
```

### 6.3 Why This Design

| Scenario | Behavior | Reason |
|----------|----------|--------|
| Negative RunProfit | Add to accumulatedLoss | Losses stack |
| Positive RunProfit > accumulatedLoss | Reset to 0 | Big win wipes slate |
| Positive RunProfit <= accumulatedLoss | No change | Small win doesn't help |

### 6.4 Loss Accumulation Examples

**Example 1 - Losses Accumulate:**
```
Initial: accumulatedLoss = 0

Run 1 breaks: RunProfit = -50
  → accumulatedLoss = 0 + 50 = 50

Run 2 breaks: RunProfit = -40
  → accumulatedLoss = 50 + 40 = 90

Run 3 breaks: RunProfit = -60
  → accumulatedLoss = 90 + 60 = 150
  → 150 > 140 → DEACTIVATE
```

**Example 2 - Big Win Resets:**
```
Initial: accumulatedLoss = 100

Run breaks: RunProfit = +150
  → 150 > 100 → accumulatedLoss = 0 (RESET!)

Continue playing with clean slate.
```

**Example 3 - Small Win Doesn't Reset:**
```
Initial: accumulatedLoss = 100

Run breaks: RunProfit = +80
  → 80 < 100 → accumulatedLoss remains 100

Still playing, but losses haven't been wiped.
```

**Example 4 - Mixed Scenario:**
```
Initial: accumulatedLoss = 0

Run 1: RunProfit = -30  → accumulatedLoss = 30
Run 2: RunProfit = +20  → 20 < 30, no change, accumulatedLoss = 30
Run 3: RunProfit = -50  → accumulatedLoss = 30 + 50 = 80
Run 4: RunProfit = +100 → 100 > 80, RESET → accumulatedLoss = 0
Run 5: RunProfit = -70  → accumulatedLoss = 70
Run 6: RunProfit = -80  → accumulatedLoss = 150 → DEACTIVATE
```

---

## 7. DEACTIVATION (CUT)

### 7.1 Deactivation Condition

Same Direction **DEACTIVATES** when:

```
accumulatedLoss > 140
```

### 7.2 On Deactivation

```typescript
sameDir.active = false;
// Keep observing runs
// Allow re-activation on next qualifying RunProfit
```

### 7.3 After Deactivation

| Action | Status |
|--------|--------|
| Continue observing runs | YES |
| Track RunProfit at breaks | YES |
| Place bets | NO |
| Can re-activate | YES (on next RunProfit >= 140) |

### 7.4 Re-Activation

After deactivation, Same Direction can re-activate:

```
Deactivated at block 50

Block 55-58: G G G G R
RunProfit = sum(blocks 56-58) - block 59 = +160%
160 >= 140 → RE-ACTIVATE

sameDir.active = true
sameDir.accumulatedLoss = 0  // Fresh start
```

---

## 8. POCKET SYSTEM INTERACTION

### 8.1 ZZ Indicator Blocks

On ZZ indicator blocks:
- **Pocket System places the bet**
- **Same Direction does NOT bet**
- **Same Direction CONTINUES observing runs**

### 8.2 Critical: No False Losses

Same Direction does NOT accumulate losses from ZZ indicator blocks because:
- Same Direction did not bet on that block
- Only RunProfit (calculated at run breaks) affects accumulatedLoss
- Individual block outcomes don't directly change accumulatedLoss

### 8.3 Why This Matters

ZZ exists to break same-direction traps:
- ZZ predicts alternation (opposite direction)
- Same Direction predicts continuation (same direction)
- These are **conflicting strategies**
- Pocket System overriding prevents Same Direction from losing on ZZ blocks

### 8.4 Implementation Detail

```typescript
// In hierarchyManager.decideBet():
if (pocketSystem.hasActiveSignal()) {
  // Pocket bets
  // Same Direction observes but doesn't bet
  // Same Direction's accumulatedLoss is NOT updated from this block
  return { source: 'pocket', ... };
}

if (sameDirectionManager.isActive()) {
  // Same Direction bets
  return { source: 'same-direction', ... };
}
```

---

## 8.5 ZZ-FAMILY HARD ISOLATION (V-001/A1)

### 8.5.1 The Problem

ZZ/AntiZZ and XAX patterns (2A2-5A5, Anti2A2-Anti5A5) are **alternation-prediction patterns**. When they are active:

1. They predict **direction change** (opposite of continuation)
2. SD predicts **continuation** (same direction)
3. These are **conflicting strategies**

If ZZ/XAX flip losses are accumulated on SD, it creates **false contamination** - SD appears to fail when it didn't actually bet.

### 8.5.2 ZZ Indicator vs Active ZZ

| Concept | Definition | Impact on SD |
|---------|------------|--------------|
| **ZZ Indicator** | 3 alternating blocks detected | Losses during this period are REVERSED |
| **Active ZZ** | ZZ/AntiZZ is actively betting | Losses during this period are SKIPPED |
| **ZZ Family Active** | ZZ, AntiZZ, or XAX is in P1 | SD flip losses not accumulated |

### 8.5.3 ZZ Indicator Loss Reversal

When ZZ indicator fires (3 alternating blocks detected):
- Any flip losses accumulated during those blocks are **REVERSED**
- These losses were from alternating behavior, not continuation failure

```typescript
reverseZZIndicatorLosses(alternatingCount: number): void {
  // The alternating blocks leading to ZZ indicator
  // produced flip losses that should be reversed
  // because they were ZZ-pattern behavior, not SD failure
}
```

### 8.5.4 Active ZZ Period Skip

When ZZ/AntiZZ or XAX is active:
- Pass `isZZFamilyActive = true` to `processBlock()`
- SD does NOT accumulate flip losses during this period
- SD continues observing runs but ignores flip losses

### 8.5.5 ZZ/AntiZZ Wins Do NOT Clear SD Accumulated Loss

**CRITICAL (V-001):** When ZZ or AntiZZ WINS, SD's accumulated loss is **NOT reset**.

| Event | SD accumulatedLoss Effect |
|-------|---------------------------|
| ZZ wins | **NO CHANGE** to SD accumulatedLoss |
| AntiZZ wins | **NO CHANGE** to SD accumulatedLoss |
| SD big win (RunProfit > accumulatedLoss) | RESET to 0 |

**Rationale:** ZZ/AntiZZ wins are from alternation betting. They don't prove the same-direction regime is profitable. Only SD's own RunProfit can reset its accumulated loss.

### 8.5.6 ZZ_XAX_PATTERNS List

```typescript
const ZZ_XAX_PATTERNS = [
  'ZZ', 'AntiZZ',
  '2A2', '3A3', '4A4', '5A5',
  'Anti2A2', 'Anti3A3', 'Anti4A4', 'Anti5A5'
];
```

---

## 8.6 XAX DECAY DURING PAUSE (A2)

### 8.6.1 Purpose

When SD is paused and an XAX pattern wins, apply partial decay to SD's accumulated loss. This recognizes that XAX success indicates market conditions may be shifting back toward continuation.

### 8.6.2 Decay Rule

```
IF SD is PAUSED
AND XAX pattern wins (2A2, 3A3, 4A4, 5A5)
THEN accumulatedLoss -= (XAX_win_profit * 0.5)
```

### 8.6.3 Implementation

```typescript
applyXAXDecay(profit: number): void {
  if (this.state.sdPaused) {
    const decay = profit * 0.5;  // 50% decay factor
    this.state.accumulatedLoss = Math.max(0, this.state.accumulatedLoss - decay);
  }
}
```

### 8.6.4 When to Apply

- Only during PAUSED state
- Only for XAX patterns (2A2-5A5), NOT AntiXAX
- Does not apply to ZZ/AntiZZ wins

---

## 9. STATE MANAGEMENT

### 9.1 State Variables

```typescript
interface SameDirectionState {
  // Core state
  active: boolean;
  accumulatedLoss: number;

  // Run tracking
  currentRunDirection: Direction | null;
  currentRunBlocks: Block[];
  currentRunStartIndex: number;

  // Activation tracking
  activationBlockIndex: number;
  activationRunProfit: number;

  // History (for debugging/UI)
  runHistory: SameDirectionRun[];
}

interface SameDirectionRun {
  startBlockIndex: number;
  endBlockIndex: number;  // Break block index
  direction: Direction;
  runLength: number;
  runProfit: number;
  wasActivation: boolean;
  wasDeactivation: boolean;
  accumulatedLossAfter: number;
  ts: string;
}
```

### 9.2 State Transitions

```
                    ┌─────────────────────────────────────┐
                    │                                     │
                    │     RunProfit >= 140                │
                    │     (at run break)                  │
                    ▼                                     │
┌───────────────────────────┐                ┌───────────────────────────┐
│                           │                │                           │
│       INACTIVE            │                │        ACTIVE             │
│   (observing only)        │◀───────────────│   (betting + observing)   │
│                           │                │                           │
└───────────────────────────┘                └───────────────────────────┘
        ▲                                              │
        │                                              │
        │     accumulatedLoss > 140                    │
        │     (at run break)                           │
        │                                              │
        └──────────────────────────────────────────────┘
```

### 9.3 Rebuild from History

For undo compatibility, Same Direction state must be rebuildable:

```typescript
rebuildFromBlocks(blocks: Block[]): void {
  this.reset();

  let runStart = 0;
  let currentDir = blocks[0]?.dir;

  for (let i = 1; i < blocks.length; i++) {
    if (blocks[i].dir !== currentDir) {
      // Run break at index i
      const runBlocks = blocks.slice(runStart, i);
      const breakBlock = blocks[i];
      this.processRunBreak(runBlocks, breakBlock);

      runStart = i;
      currentDir = blocks[i].dir;
    }
  }

  // Track current ongoing run
  this.currentRunBlocks = blocks.slice(runStart);
}
```

---

## 10. REQUIRED LOGGING

### 10.1 Per-Block Log (When Active)

```
[SD] Block {N}: dir={G|R}, betting={YES|NO}
[SD]   Previous: {G|R}, Bet: {G|R}, Actual: {G|R}
[SD]   Run continues: length={X}
```

### 10.2 Run Break Log

```
[SD] === RUN BREAK AT BLOCK {N} ===
[SD] Run: {dir} x {length} blocks
[SD] Blocks: [{indices}]
[SD] Profits: D2..Dk = [{profits}], B1 = {breakProfit}
[SD] RunProfit = {sum} - {breakProfit} = {runProfit}%
[SD] Before: active={YES|NO}, accumulatedLoss={X}%
[SD] Update:
[SD]   {RunProfit evaluation and action}
[SD] After: active={YES|NO}, accumulatedLoss={Y}%
[SD] ================================
```

### 10.3 Activation/Deactivation Log

```
[SD] *** ACTIVATED at block {N} ***
[SD]     RunProfit: {X}% >= 140%
[SD]     Direction: {G|R}
[SD]     accumulatedLoss reset to 0

[SD] *** DEACTIVATED at block {N} ***
[SD]     accumulatedLoss: {X}% > 140%
[SD]     Will observe for re-activation
```

---

## 11. COMPLETE FLOW EXAMPLES

### Example 1: Activation and Profitable Run

```
INITIAL STATE:
  active = false
  accumulatedLoss = 0

BLOCK 10: G +85%
  Run starts, tracking

BLOCK 11: G +91%
  Run continues, length = 2

BLOCK 12: G +91%
  Run continues, length = 3

BLOCK 13: R +30%
  RUN BREAKS!
  RunProfit = 91 + 91 - 30 = +152%
  152 >= 140 → ACTIVATE!
  active = true
  accumulatedLoss = 0

BLOCK 14: R +70%
  Same Direction ACTIVE, bets R (continuation)
  Run starts in R direction

BLOCK 15: R +85%
  Bets R, wins
  Run continues

BLOCK 16: G +40%
  RUN BREAKS!
  RunProfit = 85 - 40 = +45%
  45 > 0, but 45 <= 0 (accumulatedLoss)
  45 > 0 → accumulatedLoss = 0 (already 0)
  Still ACTIVE
```

### Example 2: Deactivation

```
STATE:
  active = true
  accumulatedLoss = 90

BLOCK 20: G +50%
  Betting G (continuation)
  Run starts

BLOCK 21: R +85%
  RUN BREAKS!
  RunProfit = -85% (only D1, no D2)
  Wait, run length = 1, cannot calculate

BLOCK 20: G +50% (run starts)
BLOCK 21: G +40%
BLOCK 22: R +85%
  RUN BREAKS!
  RunProfit = 40 - 85 = -45%
  -45 < 0 → accumulatedLoss += 45
  accumulatedLoss = 90 + 45 = 135
  135 <= 140, still active

BLOCK 23: R +60%
  Run starts in R

BLOCK 24: R +30%
  Run continues

BLOCK 25: G +100%
  RUN BREAKS!
  RunProfit = 30 - 100 = -70%
  accumulatedLoss += 70 = 135 + 70 = 205
  205 > 140 → DEACTIVATE!

  active = false
  Observing for re-activation...
```

### Example 3: Big Win Resets Loss

```
STATE:
  active = true
  accumulatedLoss = 120

BLOCK 30-34: R R R R R G
  Run of 5 R's

BLOCK 34: G +40% (break block)
  RunProfit = sum(blocks 31-34 profits) - 40
  Let's say: 80 + 80 + 80 + 80 - 40 = +280%

  280 > 0
  280 > 120 (accumulatedLoss)
  → RESET! accumulatedLoss = 0

  Still ACTIVE with clean slate!
```

### Example 4: Pocket Override

```
STATE:
  SameDir: active = true, accumulatedLoss = 50
  Pocket: zzPocket = 1

BLOCK 40: G +70%
  SameDir betting G (continuation)

BLOCK 41: G +85%
  SameDir betting G

BLOCK 42: G +91%
  Run continues

BLOCK 43: R +80%  ← ZZ INDICATOR DETECTED!
  Hierarchy: Pocket bets (ZZ in P1)
  SameDir: PAUSED for betting
  SameDir: Still observes run break

  RUN BREAKS!
  RunProfit = 85 + 91 - 80 = +96%
  96 > 0, 96 > 50 (accumulatedLoss)
  → RESET! accumulatedLoss = 0

  Note: SameDir did NOT lose on block 43
  (Pocket bet, not SameDir)
```

---

## 12. IMPLEMENTATION CHECKLIST

### 12.1 Files to Create

| File | Purpose |
|------|---------|
| `src/engine/same-direction.ts` | SameDirectionManager class |

### 12.2 Required Methods

```typescript
class SameDirectionManager {
  // Core state
  private state: SameDirectionState;

  // Phase 1: Observation (called every block)
  processBlock(block: Block): void;

  // Run break handling
  private onRunBreak(runBlocks: Block[], breakBlock: Block): void;

  // RunProfit calculation
  private calculateRunProfit(runBlocks: Block[], breakBlock: Block): number;

  // Activation/deactivation
  private checkActivation(runProfit: number): void;
  private checkDeactivation(runProfit: number): void;
  private activate(blockIndex: number, runProfit: number): void;
  private deactivate(): void;

  // Phase 2: Bet decision (called by hierarchy)
  isActive(): boolean;
  getBetDirection(previousBlockDirection: Direction): Direction;

  // State management
  getState(): SameDirectionState;
  reset(): void;
  rebuildFromBlocks(blocks: Block[]): void;
}
```

### 12.3 Test Cases Required

| Test | Expected |
|------|----------|
| RunProfit calculation skips D1 | sum(D2..Dk) - B1 |
| Activation at 140 threshold | >= 140 activates |
| Loss accumulation | Negative RunProfit adds |
| Reset on big win | RunProfit > accumulatedLoss → reset to 0 |
| No reset on small win | RunProfit <= accumulatedLoss → no change |
| Deactivation at 140 | > 140 deactivates |
| Pocket override doesn't cause SD loss | Only RunProfit affects accumulatedLoss |
| Re-activation after cut | Can activate again |

---

## 13. REFERENCE PSEUDOCODE

### 13.1 Main Processing

```typescript
processBlock(block: Block): void {
  // Check for run break
  if (this.currentRunDirection !== null &&
      block.dir !== this.currentRunDirection) {
    // Run just broke
    this.onRunBreak(this.currentRunBlocks, block);
    // Start new run with break block
    this.currentRunBlocks = [block];
    this.currentRunDirection = block.dir;
  } else {
    // Run continues (or first block)
    this.currentRunBlocks.push(block);
    this.currentRunDirection = block.dir;
  }
}
```

### 13.2 Run Break Handling

```typescript
onRunBreak(runBlocks: Block[], breakBlock: Block): void {
  // Minimum 2 blocks needed for RunProfit
  if (runBlocks.length < 2) {
    this.logRunBreak(runBlocks, breakBlock, null, 'Too short');
    return;
  }

  // Calculate RunProfit (skip D1, subtract break)
  const runProfit = this.calculateRunProfit(runBlocks, breakBlock);

  this.logRunBreak(runBlocks, breakBlock, runProfit, 'Calculated');

  if (!this.state.active) {
    // Check for activation
    if (runProfit >= 140) {
      this.activate(breakBlock.index, runProfit);
    }
  } else {
    // Already active - update accumulated loss
    if (runProfit < 0) {
      this.state.accumulatedLoss += Math.abs(runProfit);
      if (this.state.accumulatedLoss > 140) {
        this.deactivate();
      }
    } else {
      // Positive or zero
      if (runProfit > this.state.accumulatedLoss) {
        this.state.accumulatedLoss = 0; // RESET RULE
      }
      // Else: do nothing, accumulatedLoss remains
    }
  }

  // Record in history
  this.recordRun(runBlocks, breakBlock, runProfit);
}
```

### 13.3 RunProfit Calculation

```typescript
calculateRunProfit(runBlocks: Block[], breakBlock: Block): number {
  // Skip D1, sum D2..Dk
  const runSum = runBlocks
    .slice(1)  // Skip first block
    .reduce((sum, b) => sum + b.pct, 0);

  // Subtract break block
  return runSum - breakBlock.pct;
}
```

---

## FINAL INSTRUCTION

Same Direction is a **profit-regime detection system**, not naive continuation betting.

**DO NOT:**
- Reduce Same Direction to "bet until loss"
- Remove break-block subtraction from RunProfit
- Carry profits forward between runs
- Pause observation due to hierarchy
- Update accumulatedLoss from individual bets

**DO:**
- Calculate RunProfit exactly as specified
- Only update accumulatedLoss at run breaks
- Apply reset rule when RunProfit > accumulatedLoss
- Continue observing even when deactivated
- Continue observing even when Pocket is betting

If any of the above are missing, the system **WILL FAIL**.

---

*Document version: v1.0 - Authoritative Specification*
