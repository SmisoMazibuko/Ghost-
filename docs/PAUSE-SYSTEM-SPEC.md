# Pause System Specification

## Overview

The Pause System provides profit/loss protection by temporarily halting trading for specific systems when certain thresholds are reached. Each trading system has independent pause tracking.

## Three Trading Systems

| System | Description | Pause Behavior |
|--------|-------------|----------------|
| **Pocket** | ZZ and AntiZZ patterns | Only affected by STOP_GAME |
| **Bucket** | XAX (2A2-6A6), OZ, PP patterns with 3-bucket logic | Independent pause tracking |
| **Same Direction** | Continuation betting during runs | Independent pause tracking |

## Pause Types

### 1. STOP_GAME (Global)

**Triggers:**
- Total drawdown reaches -1000
- Actual loss reaches -500

**Effect:**
- Blocks ALL systems (Pocket, Bucket, SameDir)
- Permanent until session ends
- No recovery possible

**Example:**
```
Block 50: Total P/L = -1000
  → STOP_GAME triggered
  → All trading stops permanently
```

### 2. MAJOR_PAUSE_10_BLOCKS (Per-System)

**Triggers:**
- Every -300 drawdown milestone (per system)
- Tracked independently: -300, -600, -900...

**Effect:**
- Only blocks the system that triggered it
- Lasts 10 blocks
- Other systems continue trading

**Example:**
```
Block 30: Bucket P/L reaches -300
  → MAJOR_PAUSE for Bucket (10 blocks)
  → SameDir continues trading
  → Pocket continues trading

Block 40: Bucket pause ends, resumes trading
```

### 3. MINOR_PAUSE_3_BLOCKS (Per-System)

**Triggers:**
- 2 consecutive losses (per system)

**Effect:**
- Only blocks the system that triggered it
- Lasts 3 blocks
- Resets consecutive loss counter

**Example:**
```
Block 20: SameDir loss #1
Block 21: SameDir loss #2
  → MINOR_PAUSE for SameDir (3 blocks)
  → Bucket continues trading
  → Pocket continues trading

Block 24: SameDir pause ends, resumes trading
```

## Independent Tracking

Each system (Bucket and SameDir) tracks independently:
- Its own consecutive losses
- Its own drawdown milestones
- Its own pause state

**Key Point:** If SameDir triggers a pause, only SameDir is paused. Bucket and Pocket continue unaffected (and vice versa).

## Pause Summary Table

| Pause Type | Pocket (ZZ) | Bucket | SameDir | Duration |
|------------|-------------|--------|---------|----------|
| STOP_GAME | BLOCKED | BLOCKED | BLOCKED | Permanent |
| MAJOR_PAUSE | Not affected | Per-system | Per-system | 10 blocks |
| MINOR_PAUSE | Not affected | Per-system | Per-system | 3 blocks |

## Code Implementation

### PauseManager Methods

```typescript
// Check if systems can trade
canPocketTrade(): boolean   // Only false if STOP_GAME
canBucketTrade(): boolean   // False if STOP_GAME or Bucket pause
canSamedirTrade(): boolean  // False if STOP_GAME or SameDir pause

// Check system pause status
checkSystemPause(system: 'BUCKET' | 'SAMEDIR', healthData): PauseState | null

// Get detailed status for UI
getDetailedStatus(): {
  globalStopGame: PauseState | null;
  bucketPause: PauseState | null;
  samedirPause: PauseState | null;
  canPocketTrade: boolean;
  canBucketTrade: boolean;
  canSamedirTrade: boolean;
}
```

### Integration in ReactionEngine

```typescript
// Pocket System (ZZ/AntiZZ)
if (zzPrediction && pauseManager.canPocketTrade()) {
  return zzPrediction;
}

// SameDir System
if (sameDirectionManager.isActive() && pauseManager.canSamedirTrade()) {
  // Generate SameDir prediction
}

// Bucket System
if (pauseManager.canBucketTrade()) {
  // Generate Bucket pattern prediction
}
```

## Configuration

Default thresholds (in `types/index.ts`):

```typescript
export const DEFAULT_PAUSE_CONFIG: PauseConfig = {
  stopGameDrawdown: -1000,      // Global stop
  stopGameActualLoss: -500,     // Global stop
  majorPauseInterval: -300,     // Every 300 drawdown
  majorPauseBlocks: 10,         // 10 block pause
  minorPauseLosses: 2,          // 2 consecutive losses
  minorPauseBlocks: 3,          // 3 block pause
};
```

## CLI Commands

- `status` - Shows system pause status in summary
- `pause` - Detailed pause information for all systems

## Example Session Flow

```
Block 1-10: Normal trading, all systems active
Block 11: SameDir loss
Block 12: SameDir loss #2
  → SameDir MINOR_PAUSE (3 blocks)
  → Bucket still trading
  → Pocket still trading

Block 13-14: SameDir paused, others active
Block 15: SameDir resumes

Block 20: Bucket P/L hits -300
  → Bucket MAJOR_PAUSE (10 blocks)
  → SameDir still trading
  → Pocket still trading

Block 21-29: Bucket paused, others active
Block 30: Bucket resumes

Block 50: Total P/L hits -1000
  → STOP_GAME
  → ALL systems stopped permanently
```

## Files

| File | Purpose |
|------|---------|
| `src/engine/pause-manager.ts` | Core pause logic with independent tracking |
| `src/engine/reaction.ts` | Integration with prediction pipeline |
| `src/cli/commands.ts` | UI display of pause status |
| `src/types/index.ts` | Type definitions and config |
