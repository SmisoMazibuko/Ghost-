# SameDir Fix Plan
## Date: 2025-12-28
## Status: DRAFT - Awaiting Approval

---

## Overview

Three critical issues identified in the SameDir system:

| Issue | Problem | Impact |
|-------|---------|--------|
| 1. Resume Trigger | Resumes on Anti pattern breaks | 40% bad resumes, -416 pause value |
| 2. Depreciation During Pause | accLoss updates while paused | SD expires before resume |
| 3. ZZ Formation Blocks | Losses from ZZ formation counted | Unfair penalty during ZZ setup |

---

# Issue 1: Resume Trigger Bug

## Current Behavior (Wrong)

```typescript
// same-direction.ts line 621-634
checkResumeCondition(blockIndex: number): boolean {
  if (!this.state.paused) return false;

  // BUG: Resumes on ANY ZZ/XAX pattern loss
  if (this.state.lastZZXAXResult === 'LOSS') {
    this.resume(blockIndex);
    return true;
  }
  return false;
}
```

## Problem

| Pattern | Bets On | When Loses | SD Should |
|---------|---------|------------|-----------|
| ZZ, 2A2, 3A3, 4A4, 5A5 | Alternation | Direction continues | RESUME |
| AntiZZ, Anti2A2, Anti3A3... | Continuation (same as SD!) | Direction changed | STAY PAUSED |

- 40% of resumes (23/57) are from bad patterns
- When Anti pattern loses, direction CHANGED → bad for SD
- SD resumes into unfavorable conditions

## Fix

**Step 1.1:** Add new constant

```typescript
/** Patterns that trigger SD resume when they LOSE (alternation patterns only) */
export const RESUME_TRIGGER_PATTERNS = [
  'ZZ', '2A2', '3A3', '4A4', '5A5', '6A6'
] as const;
```

**Step 1.2:** Update checkResumeCondition

```typescript
checkResumeCondition(blockIndex: number): boolean {
  if (!this.state.paused) return false;

  // Only resume when ALTERNATION patterns break
  // These bet opposite to SD - when they lose, direction continues (good for SD)
  if (this.state.lastZZXAXResult === 'LOSS' &&
      this.state.lastZZXAXPattern &&
      RESUME_TRIGGER_PATTERNS.includes(this.state.lastZZXAXPattern as any)) {
    console.log(`[SD] Resume triggered: ${this.state.lastZZXAXPattern} broke (alternation pattern)`);
    this.resume(blockIndex);
    return true;
  }

  // Anti pattern broke - stay paused (direction changed, bad for SD)
  if (this.state.lastZZXAXResult === 'LOSS' && this.state.lastZZXAXPattern) {
    console.log(`[SD] Resume BLOCKED: ${this.state.lastZZXAXPattern} broke (continuation pattern - bad for SD)`);
  }

  return false;
}
```

---

# Issue 2: Depreciation During Pause

## Current Behavior (Wrong)

```typescript
// In onRunBreak() - line 260-298
if (!this.state.active) {
  // Check for activation
} else {
  // BUG: Runs even when PAUSED (active=true, paused=true)
  if (runProfit < 0) {
    this.state.accumulatedLoss += absLoss;  // Penalizing SD while paused!
  }
}
```

```typescript
// In processBlock() - line 199-208
if (this.state.active && runLength < 2) {
  const flipLoss = block.pct;
  this.state.accumulatedLoss += flipLoss;  // BUG: Also runs when paused!
}
```

## Problem

1. When PAUSED, `active=true` but `paused=true`
2. Code checks `active` but ignores `paused`
3. accumulatedLoss keeps increasing during pause
4. By time SD resumes, accLoss > 140 → immediate EXPIRED
5. XAX profits on reversals but SD still penalized for them

## RunProfit Formula

```
RunProfit = sum(D2..Dk) - B1

Example: G G G R
         D1 D2 D3 B1

RunProfit = D2 + D3 - B1
```

- D2..Dk = continuation blocks (GAINS for SD)
- B1 = break block (COST for SD)
- Only negative RunProfit hurts SD

## Fix: Freeze + XAX Credit System

**Step 2.1:** Add new state properties

```typescript
interface SameDirectionState {
  // ... existing properties ...

  // NEW: Imaginary run tracking during pause
  imaginaryRunProfits: number[];

  // NEW: XAX credit tracking
  xaxCoveredLosses: number;           // Losses XAX "absorbed" by winning on break blocks
}
```

**Step 2.2:** Update createInitialState()

```typescript
private createInitialState(): SameDirectionState {
  return {
    // ... existing properties ...

    // NEW
    imaginaryRunProfits: [],
    xaxCoveredLosses: 0,
  };
}
```

**Step 2.3:** Update processBlock() for single-block flips

```typescript
// Around line 199
if (this.state.active && runLength < 2) {
  if (this.state.paused) {
    // PAUSED - life frozen, track imaginary only
    console.log(`[SD] PAUSED - flip loss ${block.pct}% not applied (life frozen)`);

    // Check if XAX won on this block
    if (this.wasXAXWinOnBlock(block.index)) {
      this.state.xaxCoveredLosses += block.pct;
      console.log(`[SD]   XAX covered this loss (total covered: ${this.state.xaxCoveredLosses}%)`);
    }
  } else {
    // ACTIVE and not paused - normal behavior
    const flipLoss = block.pct;
    this.state.accumulatedLoss += flipLoss;
    console.log(`[SD] FLIP LOSS: +${flipLoss}% (accLoss: ${this.state.accumulatedLoss}%)`);

    // Check for deactivation
    if (this.state.accumulatedLoss > DEACTIVATION_THRESHOLD) {
      this.deactivate();
    }
  }
}
```

**Step 2.4:** Update onRunBreak()

```typescript
// Around line 260
if (!this.state.active) {
  // Check for activation (unchanged)
  if (runProfit >= ACTIVATION_THRESHOLD) {
    this.activate(breakBlock.index, runProfit);
    wasActivation = true;
  } else {
    console.log(`[SD] Not activated: ${runProfit}% < ${ACTIVATION_THRESHOLD}%`);
  }
} else if (this.state.paused) {
  // NEW: PAUSED - life frozen, track imaginary only
  console.log(`[SD] PAUSED - RunProfit ${runProfit}% not applied to accumulatedLoss`);

  this.state.imaginaryRunProfits.push(runProfit);

  if (runProfit < 0) {
    const wouldHaveLost = Math.abs(runProfit);
    console.log(`[SD]   Would have lost: ${wouldHaveLost}%`);

    // Check if XAX won on the break block
    if (this.wasXAXWinOnBlock(breakBlock.index)) {
      this.state.xaxCoveredLosses += wouldHaveLost;
      console.log(`[SD]   XAX covered this loss (total covered: ${this.state.xaxCoveredLosses}%)`);
    }
  } else if (runProfit > 0) {
    console.log(`[SD]   Imaginary gain: +${runProfit}%`);
  }
} else {
  // ACTIVE and NOT paused - normal depreciation (existing logic)
  if (runProfit < 0) {
    const absLoss = Math.abs(runProfit);
    this.state.accumulatedLoss += absLoss;
    console.log(`[SD] Negative run: +${absLoss}% to accumulatedLoss`);

    if (this.state.accumulatedLoss > DEACTIVATION_THRESHOLD) {
      this.deactivate();
      wasDeactivation = true;
    }
  } else if (runProfit > 0) {
    if (runProfit > this.state.accumulatedLoss) {
      console.log(`[SD] Big win: ${runProfit}% > ${this.state.accumulatedLoss}% → RESET to 0`);
      this.state.accumulatedLoss = 0;
    } else {
      console.log(`[SD] Small win: ${runProfit}% <= ${this.state.accumulatedLoss}% → no change`);
    }
  }
}
```

**Step 2.5:** Add helper method

```typescript
/**
 * Check if XAX won on a specific block.
 * Used to determine if a loss during pause was "covered" by XAX.
 */
private wasXAXWinOnBlock(blockIndex: number): boolean {
  return (
    this.state.lastZZXAXTradeBlock === blockIndex &&
    this.state.lastZZXAXResult === 'WIN'
  );
}
```

**Step 2.6:** Reset credit on pause start

```typescript
pause(reason: SDPauseReason, blockIndex: number): void {
  if (this.state.paused) return;

  this.state.paused = true;
  this.state.pauseReason = reason;
  this.state.pauseBlock = blockIndex;

  // Reset tracking for this pause period
  this.state.imaginaryPnL = 0;
  this.state.imaginaryWins = 0;
  this.state.imaginaryLosses = 0;
  this.state.imaginaryRunProfits = [];
  this.state.xaxCoveredLosses = 0;

  console.log(`[SD] >>> PAUSED at block ${blockIndex} (${reason})`);
  console.log(`[SD]     accumulatedLoss FROZEN at: ${this.state.accumulatedLoss}%`);
}
```

**Step 2.7:** Enhanced resume logging

```typescript
resume(blockIndex: number): void {
  if (!this.state.paused) return;

  const pauseDuration = blockIndex - this.state.pauseBlock;
  const pattern = this.state.lastZZXAXPattern || 'ZZ/XAX';
  const imgRuns = this.state.imaginaryRunProfits;
  const totalImgProfit = imgRuns.reduce((a, b) => a + b, 0);

  console.log(`[SD] <<< RESUMED at block ${blockIndex} (${pattern} broke)`);
  console.log(`[SD]     Paused for ${pauseDuration} blocks`);
  console.log(`[SD]     Imaginary: ${this.state.imaginaryWins}W/${this.state.imaginaryLosses}L = ${this.state.imaginaryPnL > 0 ? '+' : ''}${this.state.imaginaryPnL}%`);
  console.log(`[SD]     Imaginary runs: ${imgRuns.length} (net: ${totalImgProfit > 0 ? '+' : ''}${totalImgProfit}%)`);
  console.log(`[SD]     XAX covered losses: ${this.state.xaxCoveredLosses}%`);
  console.log(`[SD]     Resuming with accumulatedLoss: ${this.state.accumulatedLoss}% (was FROZEN)`);

  this.state.paused = false;
  this.state.pauseReason = null;
  this.state.pauseBlock = -1;
  this.state.sdConsecutiveLosses = 0;
}
```

---

# Issue 3: ZZ Formation Block Reversal

## Problem

When ZZ signal forms, it takes 3 alternating blocks:

```
ZZ Formation Example:
Block N:   G  ← D1 (start)
Block N+1: R  ← Break (SD loses: flip loss = R1)
Block N+2: G  ← Break (SD loses: flip loss = G2) → ZZ SIGNAL CONFIRMED!
```

During this formation:
- SD takes 2 flip losses (from blocks N+1 and N+2)
- But these alternations CREATED the ZZ signal
- ZZ now has a valid prediction
- SD shouldn't be penalized for the alternations that formed ZZ

## Example

```
SD active, accLoss = 50

Block 10: G (run starts)
Block 11: R (flip) → accLoss += 60 → accLoss = 110
Block 12: G (flip) → accLoss += 50 → accLoss = 160 → DEACTIVATED!

But Block 12 = ZZ SIGNAL FORMED!

Without fix: SD deactivated at accLoss = 160
With fix:    accLoss = 50 (reverse the 110 from formation blocks)
```

## Fix: ZZ Formation Reversal

**Step 3.1:** Add new state properties

```typescript
interface SameDirectionState {
  // ... existing properties ...

  // NEW: ZZ formation tracking
  zzFormationBlocks: number[];        // Block indices of last 3 alternations
  zzFormationLosses: number[];        // Losses taken on those blocks
}
```

**Step 3.2:** Update createInitialState()

```typescript
private createInitialState(): SameDirectionState {
  return {
    // ... existing properties ...

    // NEW
    zzFormationBlocks: [],
    zzFormationLosses: [],
  };
}
```

**Step 3.3:** Track potential ZZ formation losses

When SD takes a flip loss, record it as a potential ZZ formation loss:

```typescript
// In processBlock(), when handling flip loss (not paused)
if (this.state.active && !this.state.paused && runLength < 2) {
  const flipLoss = block.pct;
  this.state.accumulatedLoss += flipLoss;
  console.log(`[SD] FLIP LOSS: +${flipLoss}% (accLoss: ${this.state.accumulatedLoss}%)`);

  // Track as potential ZZ formation loss
  this.state.zzFormationBlocks.push(block.index);
  this.state.zzFormationLosses.push(flipLoss);

  // Keep only last 3
  if (this.state.zzFormationBlocks.length > 3) {
    this.state.zzFormationBlocks.shift();
    this.state.zzFormationLosses.shift();
  }

  // Check for deactivation
  if (this.state.accumulatedLoss > DEACTIVATION_THRESHOLD) {
    this.deactivate();
  }
}
```

**Step 3.4:** Add method to reverse ZZ formation losses

```typescript
/**
 * Reverse losses from ZZ formation blocks.
 * Called when ZZ signal is confirmed.
 *
 * @param zzSignalBlock - Block index where ZZ signal formed
 */
reverseZZFormationLosses(zzSignalBlock: number): void {
  if (!this.state.active) return;

  // Check if we have recent formation losses
  if (this.state.zzFormationLosses.length === 0) {
    console.log(`[SD] ZZ formed but no formation losses to reverse`);
    return;
  }

  // Find losses from blocks within the ZZ formation window (last 3 blocks)
  const formationWindow = [zzSignalBlock - 2, zzSignalBlock - 1, zzSignalBlock];
  let totalReversed = 0;

  for (let i = this.state.zzFormationBlocks.length - 1; i >= 0; i--) {
    const blockIdx = this.state.zzFormationBlocks[i];
    const loss = this.state.zzFormationLosses[i];

    if (formationWindow.includes(blockIdx)) {
      totalReversed += loss;
      console.log(`[SD]   Reversing ${loss}% from block ${blockIdx}`);
    }
  }

  if (totalReversed > 0) {
    const oldAccLoss = this.state.accumulatedLoss;
    this.state.accumulatedLoss = Math.max(0, this.state.accumulatedLoss - totalReversed);
    console.log(`[SD] ZZ FORMATION REVERSAL: -${totalReversed}%`);
    console.log(`[SD]   accumulatedLoss: ${oldAccLoss}% → ${this.state.accumulatedLoss}%`);

    // Clear formation tracking
    this.state.zzFormationBlocks = [];
    this.state.zzFormationLosses = [];
  }
}
```

**Step 3.5:** Call reversal when ZZ signal forms

In `recordZZXAXResult()`:

```typescript
recordZZXAXResult(pattern: string, isWin: boolean, blockIndex: number): void {
  // Only track ZZ/XAX patterns
  if (!ZZ_XAX_PATTERNS.includes(pattern as typeof ZZ_XAX_PATTERNS[number])) {
    return;
  }

  const result: ZZXAXResult = isWin ? 'WIN' : 'LOSS';
  this.state.lastZZXAXResult = result;
  this.state.lastZZXAXTradeBlock = blockIndex;
  this.state.lastZZXAXPattern = pattern;

  console.log(`[SD] ZZ/XAX result: ${pattern} ${result} at block ${blockIndex}`);

  // NEW: If ZZ signal just formed (first ZZ trade), reverse formation losses
  if (pattern === 'ZZ' && this.state.active && !this.state.paused) {
    this.reverseZZFormationLosses(blockIndex);
  }
}
```

**Step 3.6:** Alternative - Call from ZZStateManager

If ZZ signal detection happens elsewhere, we need a method to be called when ZZ activates:

```typescript
/**
 * Called when ZZ signal is confirmed (3 alternating blocks).
 * Reverses any SD losses from the formation blocks.
 *
 * @param signalBlock - Block where ZZ signal was confirmed
 */
onZZSignalFormed(signalBlock: number): void {
  if (!this.state.active) {
    console.log(`[SD] ZZ formed but SD not active - no reversal needed`);
    return;
  }

  if (this.state.paused) {
    console.log(`[SD] ZZ formed while SD paused - no reversal needed`);
    return;
  }

  this.reverseZZFormationLosses(signalBlock);
}
```

---

# Integration Points

## Where to Call ZZ Formation Reversal

The ZZ formation reversal should be called when ZZ signal is detected. This could be:

**Option A:** In `recordZZXAXResult()` when pattern is 'ZZ' (Step 3.5)
- Simpler, self-contained in SameDirectionManager
- Assumes first ZZ trade = signal just formed

**Option B:** Call from ReactionEngine or ZZStateManager
- More accurate timing
- Requires integration with ZZ state machine

**Recommendation:** Start with Option A, refine if needed.

---

# Files to Modify

| File | Changes |
|------|---------|
| `ghost-evaluator/src/engine/same-direction.ts` | All 3 fixes |
| `ghost-evaluator/src/types/index.ts` | Update SameDirectionState if exported there |

---

# New State Properties Summary

```typescript
interface SameDirectionState {
  // ... existing properties ...

  // Issue 2: Pause depreciation fix
  imaginaryRunProfits: number[];      // RunProfits during pause (for analysis)
  xaxCoveredLosses: number;           // Losses XAX absorbed during pause

  // Issue 3: ZZ formation reversal
  zzFormationBlocks: number[];        // Block indices of recent flip losses
  zzFormationLosses: number[];        // Loss amounts on those blocks
}
```

---

# Testing Plan

## Unit Tests

| Test | Expected |
|------|----------|
| **Issue 1** | |
| Resume on ZZ break | SD resumes |
| Resume on 2A2 break | SD resumes |
| Resume blocked on AntiZZ break | SD stays paused |
| Resume blocked on Anti2A2 break | SD stays paused |
| **Issue 2** | |
| accLoss frozen during pause | No change when paused |
| Flip loss during pause | accLoss unchanged, tracked as imaginary |
| Negative RunProfit during pause | accLoss unchanged |
| XAX win on break block | xaxCoveredLosses increases |
| Resume shows correct stats | Logs show covered losses |
| **Issue 3** | |
| ZZ forms after 2 flip losses | Losses reversed, accLoss decreased |
| ZZ forms with no prior losses | No reversal (no losses to reverse) |
| ZZ forms while SD paused | No reversal needed |
| ZZ forms while SD inactive | No reversal needed |

## Replay Tests

Re-run analysis on all 33 sessions:
- Expected: PAUSE VALUE should become positive (was -416)
- Verify resume only on correct patterns
- Verify ZZ formation reversal working

---

# Expected Impact

| Metric | Before | After (Expected) |
|--------|--------|------------------|
| Bad resumes | 23 (40%) | 0 |
| Pause value | -416 | Positive |
| SD win rate | 52.2% | > 55% |
| False expirations during pause | Many | None |
| ZZ formation penalties | Counted | Reversed |

---

# Documentation Updates (After Implementation)

1. `ANALYSIS-SUMMARY.md` - Update with fix results
2. `SAMEDIR-PAUSE-RESUME-SPEC.md` - Add credit system and ZZ reversal
3. `SD-STATE-MACHINE-SPEC.md` - Update state properties
4. `SAME-DIRECTION-SYSTEM-SPEC.md` - Add ZZ interaction rules

---

# Approval Checklist

- [ ] Issue 1: Resume trigger fix (only alternation patterns)
- [ ] Issue 2: Freeze accLoss during pause + XAX credit tracking
- [ ] Issue 3: ZZ formation block loss reversal
- [ ] Ready to implement

---

**Awaiting your review and approval before implementation.**
