# Data Collection Enhancement Plan

## Overview

This plan addresses the gap in session data collection where bucket system state, loss tracking, P1 flows, and ZZ/AntiZZ pocket system information are not being captured in session JSON files.

**Current Problem:** Session files contain pattern lifecycle states but NOT bucket classification or transitions. This makes it impossible to analyze:
- Which patterns were in B&S mode
- When and why bucket transitions occurred
- ZZ/AntiZZ pocket assignments and performance
- P1 mode trigger patterns and recovery

---

## Phase 1: Bucket State Tracking

### Step 1.1: Extend SessionLog Interface

**File:** `src/data/types.ts`

Add to SessionLog interface:

```typescript
// After finalPatternStates:
finalBucketStates: Record<PatternName, PatternBucketState>;
bucketTransitionHistory: BucketTransition[];
```

Add new interfaces:

```typescript
export interface BucketTransition {
  pattern: PatternName;
  from: 'MAIN' | 'WAITING' | 'BNS';
  to: 'MAIN' | 'WAITING' | 'BNS';
  blockIndex: number;
  reason: string;
  breakRunProfit?: number;  // If entering from break
  wasKilled?: boolean;       // If killed (structural) vs broken (loss-based)
  ts: string;
}

export interface PatternBucketSnapshot {
  pattern: PatternName;
  bucket: 'MAIN' | 'WAITING' | 'BNS';
  lastRunProfit: number;
  isBlockedByOpposite: boolean;
  bnsState?: {
    baitConfirmed: boolean;
    cumulativeBaitProfit: number;
    switchPlayed: boolean;
    switchProfit: number;
    consecutiveBaitLosses: number;
  };
}
```

### Step 1.2: Add Bucket Tracking to SessionRecorder

**File:** `src/data/session-recorder.ts`

Add tracking fields:

```typescript
private bucketTransitions: BucketTransition[] = [];
private lastBucketSnapshot: Map<PatternName, 'MAIN' | 'WAITING' | 'BNS'> = new Map();
```

Add method to detect bucket changes:

```typescript
private trackBucketChanges(
  blockIndex: number,
  bucketManager: BucketManager,
  lifecycle: PatternLifecycleManager
): void {
  const patterns: PatternName[] = ['PP', 'ST', 'OZ', 'AP5'];

  for (const pattern of patterns) {
    const currentBucket = bucketManager.getBucket(pattern);
    const previousBucket = this.lastBucketSnapshot.get(pattern) ?? 'WAITING';

    if (currentBucket !== previousBucket) {
      const cycle = lifecycle.getCycle(pattern);
      this.bucketTransitions.push({
        pattern,
        from: previousBucket,
        to: currentBucket,
        blockIndex,
        reason: this.determineBucketChangeReason(pattern, previousBucket, currentBucket, cycle),
        breakRunProfit: cycle?.breakRunProfit,
        wasKilled: cycle?.wasKilled,
        ts: new Date().toISOString(),
      });
      this.lastBucketSnapshot.set(pattern, currentBucket);
    }
  }
}

private determineBucketChangeReason(
  pattern: PatternName,
  from: 'MAIN' | 'WAITING' | 'BNS',
  to: 'MAIN' | 'WAITING' | 'BNS',
  cycle: PatternCycle | undefined
): string {
  if (to === 'MAIN') {
    return 'Pattern activated - moved to MAIN';
  }
  if (to === 'BNS') {
    const profit = cycle?.breakRunProfit ?? 0;
    return `Pattern broke with ${profit.toFixed(0)}% loss - moved to B&S`;
  }
  if (to === 'WAITING') {
    if (from === 'BNS') {
      return cycle?.wasKilled
        ? 'Pattern killed in B&S (structural break)'
        : 'Pattern broke out of B&S';
    }
    return 'Pattern broke - moved to WAITING';
  }
  return 'Unknown transition';
}
```

### Step 1.3: Extend LoggedPlay with Bucket Snapshot

**File:** `src/data/types.ts`

Add to LoggedPlay interface:

```typescript
bucketSnapshot: {
  main: PatternName[];
  waiting: PatternName[];
  bns: PatternName[];
  changes?: BucketTransition[];  // Only if transitions occurred this block
};
```

### Step 1.4: Update recordBlock() to Include Bucket State

**File:** `src/data/session-recorder.ts`

In `recordBlock()`, add bucket tracking:

```typescript
// Get bucket summary
const bucketManager = reactionEngine.getBucketManager();
const bucketSummary = bucketManager.getBucketSummary();

// Track changes
this.trackBucketChanges(blockResult.block.index, bucketManager, lifecycle);

// Get changes for this block
const changesThisBlock = this.bucketTransitions.filter(
  t => t.blockIndex === blockResult.block.index
);

const play: LoggedPlay = {
  // ... existing fields ...
  bucketSnapshot: {
    main: bucketSummary.main,
    waiting: bucketSummary.waiting,
    bns: bucketSummary.bns,
    changes: changesThisBlock.length > 0 ? changesThisBlock : undefined,
  },
};
```

### Step 1.5: Update endSession() to Save Final Bucket State

**File:** `src/data/session-recorder.ts`

In `endSession()`:

```typescript
const bucketManager = reactionEngine.getBucketManager();

const sessionLog: SessionLog = {
  // ... existing fields ...
  finalBucketStates: bucketManager.getAllPatternStates(),
  bucketTransitionHistory: this.bucketTransitions,
};
```

---

## Phase 2: Loss Tracking

### Step 2.1: Add Loss Summary to SessionLog

**File:** `src/data/types.ts`

Add to SessionSummary:

```typescript
losses: number;  // Already exists
lossStreak: {
  maxConsecutive: number;
  totalStreaks: number;      // Count of 2+ consecutive losses
  avgStreakLength: number;
};
lossesPerPattern: Record<PatternName, number>;
lossesInBns: number;         // Losses while in B&S mode
lossesInMain: number;        // Losses while in MAIN bucket
bnsEffectiveness: {
  totalBnsSwitches: number;
  successfulSwitches: number;
  failedSwitches: number;
  switchWinRate: number;
};
```

### Step 2.2: Add Loss Tracking to SessionRecorder

**File:** `src/data/session-recorder.ts`

Add fields:

```typescript
private currentLossStreak = 0;
private maxLossStreak = 0;
private lossStreakCount = 0;  // Count of 2+ streaks
private totalStreakLengths = 0;

private lossesPerPattern: Record<PatternName, number> = {
  PP: 0, ST: 0, OZ: 0, AP5: 0, ZZ: 0, AntiZZ: 0, Null: 0
};
private lossesInBns = 0;
private lossesInMain = 0;

private bnsSwitchAttempts = 0;
private bnsSwitchWins = 0;
```

Track in `recordBlock()`:

```typescript
if (outcome.betPlaced && !outcome.isWin) {
  // Track overall losses
  this.losses++;
  this.currentLossStreak++;
  this.maxLossStreak = Math.max(this.maxLossStreak, this.currentLossStreak);

  // Track per-pattern
  if (outcome.pattern) {
    this.lossesPerPattern[outcome.pattern]++;

    // Track by bucket
    const bucket = bucketManager.getBucket(outcome.pattern);
    if (bucket === 'BNS') {
      this.lossesInBns++;
    } else if (bucket === 'MAIN') {
      this.lossesInMain++;
    }
  }
} else if (outcome.betPlaced && outcome.isWin) {
  // Reset streak and count if it was 2+
  if (this.currentLossStreak >= 2) {
    this.lossStreakCount++;
    this.totalStreakLengths += this.currentLossStreak;
  }
  this.currentLossStreak = 0;
}
```

Track B&S switch effectiveness:

```typescript
// In recordBlock() after switch detection
if (isBnsSwitch) {
  this.bnsSwitchAttempts++;
  if (outcome.isWin) {
    this.bnsSwitchWins++;
  }
}
```

---

## Phase 3: P1 Flow Tracking

### Step 3.1: Add P1 Flow Analysis to SessionLog

**File:** `src/data/types.ts`

Add P1FlowAnalysis interface:

```typescript
export interface P1FlowEvent {
  type: 'enter' | 'exit';
  blockIndex: number;
  runLength: number;          // Run length when P1 triggered
  runDirection: Direction;
  pnlAtEvent: number;
  ts: string;
}

export interface P1FlowAnalysis {
  p1Events: P1FlowEvent[];
  totalP1Entries: number;
  avgRunLengthAtEntry: number;
  avgBlocksInP1: number;
  pnlLostDuringP1: number;    // Cumulative PnL impact during P1 mode
  longestP1Duration: number;  // Blocks
  patterns: {
    // What patterns were active when P1 triggered
    activeAtP1Entry: Record<PatternName, number>;
  };
}
```

Add to SessionLog:

```typescript
p1FlowAnalysis: P1FlowAnalysis;
```

### Step 3.2: Track P1 Events in SessionRecorder

**File:** `src/data/session-recorder.ts`

Add fields:

```typescript
private p1Events: P1FlowEvent[] = [];
private p1EntryPnl = 0;
private currentP1Duration = 0;
private longestP1Duration = 0;
private activeAtP1Entry: Record<PatternName, number> = {
  PP: 0, ST: 0, OZ: 0, AP5: 0, ZZ: 0, AntiZZ: 0, Null: 0
};
```

Track in `recordBlock()`:

```typescript
// P1 entry detection
if (gameState.isP1Mode() && !this.wasInP1Mode) {
  this.wasInP1Mode = true;
  this.p1EntryPnl = gameState.getCumulativePnl();

  // Record entry event
  this.p1Events.push({
    type: 'enter',
    blockIndex: blockResult.block.index,
    runLength: gameState.getRunData().currentLength,
    runDirection: gameState.getRunData().direction,
    pnlAtEvent: this.p1EntryPnl,
    ts: new Date().toISOString(),
  });

  // Track which patterns were active
  for (const pattern of lifecycle.getActivePatterns()) {
    this.activeAtP1Entry[pattern]++;
  }
}

// P1 exit detection
if (!gameState.isP1Mode() && this.wasInP1Mode) {
  this.wasInP1Mode = false;

  // Record exit event
  this.p1Events.push({
    type: 'exit',
    blockIndex: blockResult.block.index,
    runLength: gameState.getRunData().currentLength,
    runDirection: gameState.getRunData().direction,
    pnlAtEvent: gameState.getCumulativePnl(),
    ts: new Date().toISOString(),
  });

  // Track duration
  this.longestP1Duration = Math.max(this.longestP1Duration, this.currentP1Duration);
  this.currentP1Duration = 0;
}

// Count blocks in P1
if (gameState.isP1Mode()) {
  this.currentP1Duration++;
}
```

### Step 3.3: Build P1 Analysis in endSession()

```typescript
const p1FlowAnalysis: P1FlowAnalysis = {
  p1Events: this.p1Events,
  totalP1Entries: this.p1Events.filter(e => e.type === 'enter').length,
  avgRunLengthAtEntry: this.calculateAvgP1RunLength(),
  avgBlocksInP1: this.blocksInP1Mode / Math.max(1, this.p1Events.filter(e => e.type === 'enter').length),
  pnlLostDuringP1: this.calculateP1PnlImpact(),
  longestP1Duration: this.longestP1Duration,
  patterns: {
    activeAtP1Entry: this.activeAtP1Entry,
  },
};
```

---

## Phase 4: ZZ/AntiZZ Pocket System Tracking

### Step 4.1: Add ZZ State to SessionLog

**File:** `src/data/types.ts`

Add ZZ tracking interfaces:

```typescript
export interface ZZRunRecord {
  runNumber: number;
  wasAntiZZ: boolean;
  pocket: 1 | 2;
  firstPredictionNegative: boolean;
  profit: number;
  predictionCount: number;
  startBlockIndex: number;
  endBlockIndex: number;
  ts: string;
}

export interface ZZPocketAnalysis {
  pocket1: {
    totalRuns: number;
    totalBets: number;
    wins: number;
    losses: number;
    profit: number;
    winRate: number;
  };
  pocket2: {
    totalRuns: number;
    observedBlocks: number;  // Blocks observed without betting
  };
  antiZZPerformance: {
    totalRuns: number;
    totalBets: number;
    wins: number;
    profit: number;
    winRate: number;
  };
  zzPerformance: {
    totalRuns: number;
    totalBets: number;
    wins: number;
    profit: number;
    winRate: number;
  };
  pocketTransitions: number;  // How many times pocket changed
  avgRunsPerPocket: number;
}

export interface ZZSessionState {
  finalState: 'inactive' | 'zz_active' | 'anti_zz_active' | 'suspended';
  currentPocket: 1 | 2;
  runHistory: ZZRunRecord[];
  pocketAnalysis: ZZPocketAnalysis;
  activationCount: number;
  totalProfit: number;
}
```

Add to SessionLog:

```typescript
zzSessionState: ZZSessionState;
```

### Step 4.2: Extend LoggedPlay with ZZ State

Add to LoggedPlay:

```typescript
zzSnapshot?: {
  state: 'inactive' | 'zz_active' | 'anti_zz_active' | 'suspended';
  pocket: 1 | 2;
  currentRunProfit: number;
  predictedDirection?: Direction;
  indicatorDirection?: Direction;
};
```

### Step 4.3: Track ZZ State in SessionRecorder

**File:** `src/data/session-recorder.ts`

In `recordBlock()`:

```typescript
// Get ZZ state
const zzStateManager = reactionEngine.getZZStateManager();
const zzState = zzStateManager?.getState();

// Add to play record
if (zzState && zzState.currentState !== 'inactive') {
  play.zzSnapshot = {
    state: zzState.currentState,
    pocket: zzState.currentPocket,
    currentRunProfit: zzState.currentRunProfit,
    predictedDirection: zzStateManager?.getPredictedDirection(gameState.getRunData().direction),
    indicatorDirection: zzState.savedIndicatorDirection ?? undefined,
  };
}
```

### Step 4.4: Build ZZ Analysis in endSession()

```typescript
const zzStateManager = reactionEngine.getZZStateManager();
const zzState = zzStateManager?.getState();
const zzStats = zzStateManager?.getStatistics();
const zzRunHistory = zzStateManager?.getRunHistory() ?? [];

const zzSessionState: ZZSessionState = {
  finalState: zzState?.currentState ?? 'inactive',
  currentPocket: zzState?.currentPocket ?? 1,
  runHistory: zzRunHistory,
  pocketAnalysis: this.buildZZPocketAnalysis(zzRunHistory, zzStats),
  activationCount: zzStats?.activationCount ?? 0,
  totalProfit: zzStats?.totalProfit ?? 0,
};
```

---

## Phase 5: Per-Block Extended Snapshot

### Step 5.1: Create Comprehensive Block Snapshot

For deep analysis, create an extended snapshot that captures ALL relevant state:

**File:** `src/data/types.ts`

```typescript
export interface ExtendedBlockSnapshot {
  // Block basics
  blockIndex: number;
  block: Block;

  // Run state
  runData: {
    direction: Direction;
    currentLength: number;
    lengths: number[];
    isFlip: boolean;
    previousRunLength?: number;
  };

  // Pattern lifecycle state
  patternStates: Record<PatternName, {
    state: 'observing' | 'active' | 'broken';
    cumulativeProfit: number;
    lastRunProfit: number;
    breakRunProfit: number;
    observationCount: number;
    activeCount: number;
  }>;

  // Bucket state
  buckets: {
    main: PatternName[];
    waiting: PatternName[];
    bns: PatternName[];
  };

  // B&S pattern-specific state
  bnsPatternStates: {
    oz?: OZBnsState;
    ap5?: AP5BnsState;
    pp?: PPBnsState;
    st?: STBnsState;
  };

  // ZZ state
  zz?: {
    state: 'inactive' | 'zz_active' | 'anti_zz_active' | 'suspended';
    pocket: 1 | 2;
    currentRunProfit: number;
    firstPredictionNegative: boolean;
  };

  // P1 mode
  p1Mode: boolean;

  // Decision made
  decision: EvaluatorDecision;

  // Outcome (if bet placed)
  outcome?: BetOutcome;
}
```

### Step 5.2: Option for Full Snapshot Recording

Add configuration option:

```typescript
interface SessionRecorderConfig {
  enableFullSnapshots: boolean;  // Default: false (saves space)
  snapshotInterval?: number;     // Record every N blocks (default: 1)
}
```

When enabled, record `ExtendedBlockSnapshot` in a separate array for deep analysis.

---

## Implementation Order

1. **Phase 1: Bucket State** (Priority: HIGH)
   - Core requirement - fixes the main data gap
   - ~100 lines of new code
   - Files: `types.ts`, `session-recorder.ts`

2. **Phase 2: Loss Tracking** (Priority: HIGH)
   - Essential for performance analysis
   - ~50 lines of new code
   - Files: `types.ts`, `session-recorder.ts`

3. **Phase 4: ZZ/AntiZZ Pocket System** (Priority: HIGH)
   - Already has infrastructure in ZZStateManager
   - ~80 lines to expose in session data
   - Files: `types.ts`, `session-recorder.ts`

4. **Phase 3: P1 Flow Tracking** (Priority: MEDIUM)
   - Important for understanding protection mode behavior
   - ~70 lines of new code
   - Files: `types.ts`, `session-recorder.ts`

5. **Phase 5: Extended Snapshots** (Priority: LOW)
   - For deep debugging/analysis
   - Optional feature with config flag
   - ~100 lines of new code

---

## Expected Session JSON Size Impact

Current: ~50-100KB per session (varies by session length)

With enhancements:
- Bucket tracking: +10-20KB
- Loss tracking: +2KB
- ZZ tracking: +5-15KB
- P1 tracking: +2-5KB
- Extended snapshots (if enabled): +100-500KB

Total with all phases: ~70-150KB per session (without extended snapshots)

---

## Verification Checklist

After implementation, verify session JSON contains:

- [ ] `finalBucketStates` with all pattern bucket states
- [ ] `bucketTransitionHistory` with all transitions
- [ ] Each `LoggedPlay` has `bucketSnapshot`
- [ ] `summary.lossStreak` metrics
- [ ] `summary.lossesPerPattern` breakdown
- [ ] `summary.bnsEffectiveness` metrics
- [ ] `p1FlowAnalysis` with events and patterns
- [ ] `zzSessionState` with run history and pocket analysis
- [ ] Each `LoggedPlay` has `zzSnapshot` when ZZ active

---

## Example Enhanced Session JSON Structure

```json
{
  "sessionId": "session_2025-12-14T05-06-40-335Z",
  "evaluatorVersion": "15.3",

  "summary": {
    "totalBlocks": 150,
    "totalBets": 45,
    "wins": 28,
    "losses": 17,
    "winRate": 62.2,
    "finalPnl": 340,

    "lossStreak": {
      "maxConsecutive": 3,
      "totalStreaks": 5,
      "avgStreakLength": 2.4
    },

    "lossesInBns": 4,
    "lossesInMain": 13,

    "bnsEffectiveness": {
      "totalBnsSwitches": 6,
      "successfulSwitches": 4,
      "failedSwitches": 2,
      "switchWinRate": 66.7
    }
  },

  "bucketTransitionHistory": [
    {
      "pattern": "OZ",
      "from": "MAIN",
      "to": "BNS",
      "blockIndex": 45,
      "reason": "Pattern broke with -85% loss - moved to B&S",
      "breakRunProfit": -85,
      "wasKilled": false
    }
  ],

  "finalBucketStates": {
    "PP": { "bucket": "MAIN", "lastRunProfit": 30 },
    "ST": { "bucket": "WAITING", "lastRunProfit": 0 },
    "OZ": { "bucket": "BNS", "bnsState": { "baitConfirmed": true } },
    "AP5": { "bucket": "WAITING", "lastRunProfit": 45 }
  },

  "p1FlowAnalysis": {
    "p1Events": [
      { "type": "enter", "blockIndex": 78, "runLength": 7 },
      { "type": "exit", "blockIndex": 82, "runLength": 2 }
    ],
    "totalP1Entries": 1,
    "avgBlocksInP1": 4,
    "longestP1Duration": 4
  },

  "zzSessionState": {
    "finalState": "zz_active",
    "currentPocket": 1,
    "runHistory": [...],
    "pocketAnalysis": {
      "pocket1": { "totalRuns": 8, "wins": 5, "winRate": 62.5 },
      "pocket2": { "totalRuns": 3, "observedBlocks": 15 }
    }
  },

  "plays": [
    {
      "blockIndex": 45,
      "bucketSnapshot": {
        "main": ["PP"],
        "waiting": ["ST", "AP5"],
        "bns": ["OZ"],
        "changes": [{ "pattern": "OZ", "from": "MAIN", "to": "BNS" }]
      },
      "zzSnapshot": {
        "state": "zz_active",
        "pocket": 1,
        "currentRunProfit": 70
      }
    }
  ]
}
```

---

## Status: READY FOR IMPLEMENTATION

All phases are designed and documented. Ready to begin implementation starting with Phase 1 (Bucket State Tracking).
