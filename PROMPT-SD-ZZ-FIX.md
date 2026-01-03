# TASK: Fix SD/ZZ Contamination (V-001) and Implement XAX Decay (A2)

## Context
Investigation revealed that ZZ/AntiZZ wins incorrectly clear SD accumulated loss, violating the constitutional rule that ZZ-family must NEVER affect SD state.

## Constitutional Rules (MUST FOLLOW)
- A1: ZZ-Family Hard Isolation - ZZ/AntiZZ must NEVER affect SD accumulatedLoss/accumulatedProfit
- A2: Pause ≠ Full Freeze - SD paused can still receive decay from XAX parties (2A2, 3A3, 4A4, 5A5, 6A6)
- A3: Profitable XAX parties cannot deactivate SD prematurely

## VIOLATION V-001: ZZ Contamination
**Files to modify:**
- `ghost-evaluator/src/engine/reaction.ts`

**Problem locations:**
- Lines 687-691 (ZZ handler): `clearAccumulatedLoss()` called on ZZ win
- Lines 713-716 (AntiZZ handler): `clearAccumulatedLoss()` called on AntiZZ win

**Current code (REMOVE):**
```typescript
// Lines 687-691
// RULE: If ZZ wins, clear Same Direction accumulated loss
// Losses during ZZ's active period don't count against Same Direction
if (isWin) {
  this.sameDirectionManager.clearAccumulatedLoss();
}

// Lines 713-716 (same pattern for AntiZZ)
if (isWin) {
  this.sameDirectionManager.clearAccumulatedLoss();
}
```

**Fix:** DELETE these blocks entirely. ZZ wins should have ZERO effect on SD state.

## FEATURE A2: XAX Decay During SD Pause
**Files to modify:**
- `ghost-evaluator/src/engine/same-direction.ts`
- Possibly `ghost-evaluator/src/engine/reaction.ts` (XAX trade handlers)

**Requirement:**
When SD is paused AND an XAX party (2A2, 3A3, 4A4, 5A5, 6A6) wins an imaginary trade, apply decay to accumulatedLoss.

**Implementation steps:**
1. In `same-direction.ts`, add method `applyXAXDecay(profit: number): void`
2. Decay rule: If XAX profit > 0, reduce accumulatedLoss by decay amount (define decay formula)
3. In reaction.ts XAX handlers, check if SD is paused and call decay method
4. Ensure decay cannot reduce accumulatedLoss below 0
5. Add logging for decay application

**Suggested decay logic:**
```typescript
applyXAXDecay(xaxProfit: number): void {
  if (!this.state.paused || xaxProfit <= 0) return;

  const decayAmount = xaxProfit * 0.5;  // 50% of XAX profit as decay (adjust as needed)
  const oldLoss = this.state.accumulatedLoss;
  this.state.accumulatedLoss = Math.max(0, this.state.accumulatedLoss - decayAmount);

  console.log(`[SD] XAX decay applied: ${oldLoss}% -> ${this.state.accumulatedLoss}% (decay: ${decayAmount}%)`);
}
```

## Testing Requirements
1. Test ZZ win does NOT affect SD accumulatedLoss
2. Test AntiZZ win does NOT affect SD accumulatedLoss
3. Test XAX win during SD pause applies decay
4. Test XAX loss during SD pause does NOT apply decay
5. Test decay does not reduce accumulatedLoss below 0
6. Regression test: SD activation/deactivation thresholds unchanged

## Do NOT
- Change SD activation threshold (140)
- Change SD deactivation threshold (accumulatedLoss > 140)
- Modify any OZ/AP5/ST/PP code
- Touch lifecycle.ts
