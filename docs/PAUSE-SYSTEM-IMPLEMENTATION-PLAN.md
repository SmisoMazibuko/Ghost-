# Pause System Implementation Plan

## Problem Statement

The 3-block pause (MINOR_PAUSE) for consecutive losses is **NOT implemented**. The PauseManager has the methods, but they are never called, and consecutive losses are tracked globally instead of per-system.

## Current State

### What Exists
- `PauseManager` class with `checkSystemPause(system, healthData)` method
- `canBucketTrade()` and `canSamedirTrade()` methods
- Global `consecutiveLosses` counter in ReactionEngine
- STOP_GAME check (global) - partially working

### What's Missing
1. Per-system consecutive loss tracking (Bucket vs SameDir)
2. Calls to `checkSystemPause()` after trades close
3. Tracking which system made each trade
4. Per-system drawdown tracking for MAJOR_PAUSE

## Investigation Tasks

### 1. Understand Trade Flow
- [ ] Read `src/engine/reaction.ts` - `evaluateTrade()` method
- [ ] Identify where trades are closed and P/L is recorded
- [ ] Understand how `actualSimLedger` records trades
- [ ] Find where `consecutiveLosses` is incremented/reset

### 2. Understand Prediction Flow
- [ ] Read `predictNext()` method in reaction.ts
- [ ] Identify how predictions are tagged with system (Pocket/Bucket/SameDir)
- [ ] Check if `openedTrade` includes system information

### 3. Review Current Pause Integration
- [ ] Search for all `pauseManager` usages in reaction.ts
- [ ] Check what triggers STOP_GAME currently
- [ ] Verify `advanceBlock()` is called correctly

## Implementation Plan

### Phase 1: Per-System Loss Tracking

**File: `src/engine/reaction.ts`**

Add per-system tracking:
```typescript
// Replace single consecutiveLosses with per-system tracking
private bucketConsecutiveLosses = 0;
private samedirConsecutiveLosses = 0;
private bucketTotalPnl = 0;
private samedirTotalPnl = 0;
```

### Phase 2: Tag Trades with System

**Modify trade/prediction types to include system:**
```typescript
type TradingSystem = 'POCKET' | 'BUCKET' | 'SAMEDIR';

interface OpenedTrade {
  // existing fields...
  system: TradingSystem;
}
```

**In `predictNext()`**, tag each prediction with its system:
- ZZ/AntiZZ predictions → `system: 'POCKET'`
- SameDir predictions → `system: 'SAMEDIR'`
- All other patterns → `system: 'BUCKET'`

### Phase 3: Update Trade Evaluation

**In `evaluateTrade()` or where trades close:**

```typescript
// After trade closes, update per-system stats
if (closedTrade.system === 'BUCKET') {
  this.bucketTotalPnl += closedTrade.pnl;
  if (closedTrade.isWin) {
    this.bucketConsecutiveLosses = 0;
  } else {
    this.bucketConsecutiveLosses++;
  }

  // Check for Bucket system pause
  this.pauseManager.checkSystemPause('BUCKET', {
    consecutiveLosses: this.bucketConsecutiveLosses,
    totalPnl: this.bucketTotalPnl,
    currentBlock: this.currentBlockIndex,
  });

} else if (closedTrade.system === 'SAMEDIR') {
  this.samedirTotalPnl += closedTrade.pnl;
  if (closedTrade.isWin) {
    this.samedirConsecutiveLosses = 0;
  } else {
    this.samedirConsecutiveLosses++;
  }

  // Check for SameDir system pause
  this.pauseManager.checkSystemPause('SAMEDIR', {
    consecutiveLosses: this.samedirConsecutiveLosses,
    totalPnl: this.samedirTotalPnl,
    currentBlock: this.currentBlockIndex,
  });
}
// Note: POCKET (ZZ) does not trigger MINOR_PAUSE or MAJOR_PAUSE
```

### Phase 4: Update Ledger

**File: `src/engine/actual-sim-ledger.ts`**

Add system field to LedgerEntry:
```typescript
interface LedgerEntry {
  // existing fields...
  system: TradingSystem;
}
```

Add per-system queries:
```typescript
getSystemPnl(system: TradingSystem): number;
getSystemConsecutiveLosses(system: TradingSystem): number;
```

### Phase 5: State Persistence

Update snapshot/restore to include per-system state:
- `bucketConsecutiveLosses`
- `samedirConsecutiveLosses`
- `bucketTotalPnl`
- `samedirTotalPnl`

### Phase 6: UI Updates

**File: `src/cli/commands.ts`**

Update `displayPause()` to show per-system consecutive losses:
```
Bucket System:
  Status: TRADING
  Consecutive Losses: 1
  Total P/L: -150

SameDir System:
  Status: PAUSED (2 blocks remaining)
  Reason: 2 consecutive losses
  Total P/L: -80
```

## Testing Scenarios

### Scenario 1: SameDir MINOR_PAUSE
```
1. SameDir makes trade → LOSS
2. SameDir makes trade → LOSS (2 consecutive)
3. → SameDir MINOR_PAUSE triggered (3 blocks)
4. Bucket should still trade
5. Pocket should still trade
6. After 3 blocks → SameDir resumes
```

### Scenario 2: Bucket MINOR_PAUSE
```
1. Bucket pattern makes trade → LOSS
2. Bucket pattern makes trade → LOSS (2 consecutive)
3. → Bucket MINOR_PAUSE triggered (3 blocks)
4. SameDir should still trade
5. Pocket should still trade
6. After 3 blocks → Bucket resumes
```

### Scenario 3: Both Systems Paused
```
1. SameDir triggers MINOR_PAUSE
2. While SameDir paused, Bucket has 2 losses
3. → Bucket also triggers MINOR_PAUSE
4. Only Pocket trades
5. Each system resumes independently
```

### Scenario 4: MAJOR_PAUSE (10 blocks)
```
1. Bucket P/L reaches -300
2. → Bucket MAJOR_PAUSE (10 blocks)
3. SameDir still trades
4. Bucket P/L milestone tracked independently
```

## Files to Modify

| File | Changes |
|------|---------|
| `src/types/index.ts` | Add `TradingSystem` type, update `LedgerEntry` |
| `src/engine/reaction.ts` | Per-system tracking, tag predictions, call `checkSystemPause()` |
| `src/engine/actual-sim-ledger.ts` | Add system field, per-system queries |
| `src/engine/pause-manager.ts` | Already has methods, may need minor tweaks |
| `src/cli/commands.ts` | Display per-system stats |

## Verification Steps

1. Build succeeds: `npm run build`
2. Add blocks and trigger SameDir
3. Force 2 SameDir losses
4. Verify SameDir pauses, Bucket continues
5. Wait 3 blocks, verify SameDir resumes
6. Repeat for Bucket system
7. Test MAJOR_PAUSE at -300 milestone

## Notes

- Pocket (ZZ/AntiZZ) should NEVER trigger MINOR_PAUSE or MAJOR_PAUSE
- Pocket is ONLY affected by global STOP_GAME
- Each system's pause is completely independent
- Consecutive losses reset on WIN, not on pause end
