# TASK: Fix cumulativeProfit Carryover During Observation (V-002)

## Context
Investigation revealed that cumulativeProfit persists across structure breaks during observation state, causing "activates out of nowhere" bug where patterns activate with accumulated profit from previous broken observations.

## Constitutional Rule (MUST FOLLOW)
- A4: Break Handling Must Reset Accumulated Profit - When OZ/AP5/ST/PP experiences structural break during observation, cumulativeProfit MUST reset to 0

## VIOLATION V-002: cumulativeProfit Not Reset on Structure Break
**File to modify:**
- `ghost-evaluator/src/patterns/lifecycle.ts`

**Problem:** The `confirmXXPattern()` methods only reset cumulativeProfit when firstBlockProfit < 0, NOT when structure breaks during observation.

**Affected methods:**
1. `confirmOZPattern()` - line 586-591
2. `confirmAP5Pattern()` - line 697-701
3. `confirmPPPattern()` - line 838-842
4. `confirmSTPattern()` - line 482-486

**Current problematic pattern:**
```typescript
if (firstBlockProfit >= 0) {
  cycle.cumulativeProfit += firstBlockProfit;  // ACCUMULATES without structure check
} else {
  cycle.cumulativeProfit = 0;
}
```

## Fix Strategy

### Option A: Add Structure Break Detection in Confirm Methods (RECOMMENDED)

Before accumulating profit, verify structure is valid. If structure broke since last observation, reset cumulativeProfit.

**For OZ (run length === 3 AND previous run length === 1):**
```typescript
confirmOZPattern(cycle: OZCycle, currentRunLength: number, previousRunLength: number, firstBlockProfit: number): void {
  // Check if structure is valid for OZ continuation
  const isValidOZStructure = currentRunLength === 3 && previousRunLength === 1;

  // If structure broke, reset cumulative profit before processing
  if (!isValidOZStructure && cycle.cumulativeProfit > 0) {
    console.log(`[Lifecycle] OZ structure break during observation - resetting cumulativeProfit from ${cycle.cumulativeProfit}% to 0`);
    cycle.cumulativeProfit = 0;
  }

  // Original logic
  if (firstBlockProfit >= 0) {
    cycle.cumulativeProfit += firstBlockProfit;
  } else {
    cycle.cumulativeProfit = 0;
  }
  // ... rest of method
}
```

**For AP5 (run length >= 5):**
```typescript
confirmAP5Pattern(cycle: AP5Cycle, currentRunLength: number, firstBlockProfit: number): void {
  const isValidAP5Structure = currentRunLength >= 5;

  if (!isValidAP5Structure && cycle.cumulativeProfit > 0) {
    console.log(`[Lifecycle] AP5 structure break during observation - resetting cumulativeProfit from ${cycle.cumulativeProfit}% to 0`);
    cycle.cumulativeProfit = 0;
  }
  // ... original logic
}
```

**For ST (uses indicator + doubles pattern):**
```typescript
confirmSTPattern(cycle: STCycle, /* params */): void {
  // ST structure: indicator (>=3 run) + specific doubles pattern
  // Reset if structure requirements not met
  if (!isValidSTStructure && cycle.cumulativeProfit > 0) {
    console.log(`[Lifecycle] ST structure break during observation - resetting cumulativeProfit`);
    cycle.cumulativeProfit = 0;
  }
  // ... original logic
}
```

**For PP (has ppCyclesSeen counter):**
```typescript
confirmPPPattern(cycle: PPCycle, /* params */): void {
  // PP structure: specific cycle pattern
  // Reset if structure requirements not met
  if (!isValidPPStructure && cycle.cumulativeProfit > 0) {
    console.log(`[Lifecycle] PP structure break during observation - resetting cumulativeProfit`);
    cycle.cumulativeProfit = 0;
    cycle.ppCyclesSeen = 0;  // Also reset cycle counter
  }
  // ... original logic
}
```

### Option B: Track Last Valid Structure Block

Add a field to each cycle to track the last block where valid structure was seen. If gap detected, reset.

```typescript
interface OZCycle {
  // ... existing fields
  lastValidStructureBlock?: number;
}

// In confirmOZPattern:
if (isValidOZStructure) {
  if (cycle.lastValidStructureBlock !== undefined &&
      currentBlock - cycle.lastValidStructureBlock > 1) {
    // Gap in structure - reset
    cycle.cumulativeProfit = 0;
  }
  cycle.lastValidStructureBlock = currentBlock;
}
```

## Files to Read First
- `ghost-evaluator/src/patterns/lifecycle.ts` - understand full method signatures
- `ghost-evaluator/src/engine/state.ts` - understand structure validation (ozMonitoringStartBlock, etc.)

## Testing Requirements
1. Test OZ: Structure break (run length !== 3) resets cumulativeProfit
2. Test OZ: Structure break (previous run !== 1) resets cumulativeProfit
3. Test AP5: Run length < 5 resets cumulativeProfit
4. Test ST: Invalid indicator/doubles pattern resets cumulativeProfit
5. Test PP: Invalid cycle pattern resets cumulativeProfit and ppCyclesSeen
6. Test: Valid structure continuation preserves cumulativeProfit
7. Test: Negative profit still resets (existing behavior preserved)
8. Regression: Activation thresholds (70% single, 100% cumulative) unchanged
9. Regression: Active state break methods still work correctly

## Do NOT
- Modify SD/ZZ code (same-direction.ts, zz-state-manager.ts)
- Change activation thresholds (70% single block, 100% cumulative)
- Modify reaction.ts
- Change break methods that handle ACTIVE state breaks (they work correctly)
