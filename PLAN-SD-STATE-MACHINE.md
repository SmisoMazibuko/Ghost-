# SD State Machine - Complete Plan & Architecture

## Executive Summary

Based on the analysis of 24/12/2025 sessions, we identified the **Fake Activation Trap**:
1. SameDir activates → profitable
2. ZZ/XAX takes over → SameDir loses → deactivates
3. ZZ/XAX breaks → SameDir would be profitable... but it's deactivated
4. SameDir reactivates → cycle repeats

**Key Finding:** Session 1 lost -670 in fake activation costs, missed a 9-block long flow (~642 estimated), while Session 2 had one long 22-trade run (+736).

**Solution:** Implement an SD State Machine with PAUSE capability that:
- Detects hostility signals (>70% reversals, consecutive losses)
- PAUSES betting without losing life
- Tracks imaginary outcomes during pause
- RESUMES when conditions improve
- EXPIRES only when life is exhausted

---

## A) Architecture Design

### A.1 SDStateMachine

```typescript
/**
 * SD State Machine - Controls SameDir betting with pause/resume capability
 *
 * States:
 * - INACTIVE: Not activated, observing for activation conditions
 * - ACTIVE: Actively betting on continuation
 * - PAUSED: Betting paused due to hostility, tracking imaginary outcomes
 * - EXPIRED: Life exhausted, waiting for reactivation
 */
export type SDMachineState = 'INACTIVE' | 'ACTIVE' | 'PAUSED' | 'EXPIRED';

export interface SDStateMachine {
  // Current state
  state: SDMachineState;

  // Direction we're betting (when active/paused)
  direction: Direction | null;

  // When state was entered
  stateEnteredAt: number;  // block index

  // Remaining life (depreciation)
  remainingLife: number;   // starts at 140, decays
  initialLife: number;     // snapshot at activation

  // Pause-specific
  pauseReason: SDPauseReason | null;
  pauseStartBlock: number | null;
  pauseBlocksElapsed: number;
  imaginaryPnL: number;     // track what would have happened
  imaginaryWins: number;
  imaginaryLosses: number;

  // Resume tracking
  lastResumeBlock: number | null;
  resumeCount: number;      // how many times we've resumed this activation

  // Metrics for this activation cycle
  realPnL: number;          // actual betting P/L
  realWins: number;
  realLosses: number;
  consecutiveRealLosses: number;

  // Activation source
  activatedAt: number;      // block index
  activationRunProfit: number;

  // History
  stateHistory: SDStateTransition[];
}
```

### A.2 Pause Reasons & Events

```typescript
/**
 * Reasons why SD can be paused
 */
export type SDPauseReason =
  | 'HIGH_PCT_REVERSAL'      // Single reversal with PCT >= 70
  | 'CONSECUTIVE_HIGH_PCT'   // 2+ consecutive high PCT reversals
  | 'ZZ_XAX_TAKEOVER'        // ZZ or XAX pattern became dominant
  | 'PATTERN_BREAK_EXPECTED' // Detected pattern about to break
  | 'MANUAL';                // Manual pause request

/**
 * Events that can trigger state transitions
 */
export type SDEventType =
  | 'ACTIVATION_THRESHOLD'   // RunProfit >= 140, activates SD
  | 'HIGH_PCT_REVERSAL'      // Block reversed with PCT >= 70
  | 'ZZ_XAX_PROFITABLE'      // ZZ/XAX run ended profitably
  | 'ZZ_XAX_BREAK'           // ZZ/XAX pattern broke (loss)
  | 'LONG_FLOW_DETECTED'     // 7+ consecutive same direction
  | 'CONSECUTIVE_LOSSES'     // 2+ consecutive SameDir losses
  | 'BIG_WIN'                // Single win > accumulated loss
  | 'LIFE_EXHAUSTED'         // remainingLife <= 0
  | 'IMAGINARY_PROFIT'       // Imaginary tracking shows profit
  | 'BLOCK_PROCESSED';       // Regular block processing

export interface SDEvent {
  type: SDEventType;
  blockIndex: number;
  data: {
    reversalPct?: number;
    pattern?: PatternName;
    runProfit?: number;
    flowLength?: number;
    consecutiveLosses?: number;
    winAmount?: number;
    imaginaryPnL?: number;
  };
  ts: string;
}
```

### A.3 Event/Signal Detector

```typescript
/**
 * Detects signals that affect SD state
 */
export interface SDSignalDetector {
  /**
   * Analyze a block for SD-relevant signals
   */
  analyzeBlock(
    block: Block,
    previousBlock: Block | null,
    recentBlocks: Block[],
    zzState: ZZStrategyState,
    patternCycles: Record<PatternName, PatternCycle>
  ): SDEvent[];

  /**
   * Check if current block is a high PCT reversal
   * Returns true if direction changed and PCT >= threshold
   */
  isHighPctReversal(
    currentBlock: Block,
    previousBlock: Block | null,
    threshold: number  // default 70
  ): boolean;

  /**
   * Detect if ZZ/XAX is taking over (becoming dominant)
   */
  detectPatternTakeover(
    patternCycles: Record<PatternName, PatternCycle>,
    recentTrades: CompletedTrade[]
  ): { isTakeover: boolean; pattern: PatternName | null; runProfit: number };

  /**
   * Detect pattern break (ZZ/XAX losing)
   */
  detectPatternBreak(
    patternCycles: Record<PatternName, PatternCycle>,
    lastTrade: CompletedTrade | null
  ): { isBreak: boolean; pattern: PatternName | null };

  /**
   * Detect long flow (7+ consecutive blocks)
   */
  detectLongFlow(
    blocks: Block[],
    minLength: number  // default 7
  ): { isLongFlow: boolean; length: number; direction: Direction | null };
}
```

### A.4 Depreciation Model

```typescript
/**
 * Handles SD life/depreciation logic
 */
export interface SDDepreciationModel {
  // Configuration
  config: {
    initialLife: number;           // 140 (matches current threshold)
    decayPerPausedBlock: number;   // 0 - no decay while paused
    decayPerLoss: number;          // Loss PCT added to accumulated loss
    bigWinResetThreshold: number;  // Win must exceed accumulated loss to reset
    pauseLifePreservation: boolean; // true = pause doesn't decay life
  };

  /**
   * Calculate remaining life after a loss
   */
  calculateLifeAfterLoss(
    currentLife: number,
    lossPct: number,
    isRealBet: boolean  // false if imaginary
  ): number;

  /**
   * Check if a win should reset life
   */
  shouldResetLife(
    winPct: number,
    accumulatedLoss: number
  ): boolean;

  /**
   * Calculate life after time/blocks passed
   */
  calculatePassiveDecay(
    currentLife: number,
    blocksPassed: number,
    isPaused: boolean
  ): number;
}

/**
 * Default depreciation policy:
 * - Life starts at 140 (matches activation threshold)
 * - Real losses reduce life by loss PCT
 * - Imaginary losses don't affect life (while paused)
 * - Big wins (> accumulated loss) reset life to 140
 * - No passive time decay while paused
 * - Pause preserves life for resume opportunity
 */
export const DEFAULT_DEPRECIATION_CONFIG = {
  initialLife: 140,
  decayPerPausedBlock: 0,
  decayPerLoss: 1,  // 1:1 with loss PCT
  bigWinResetThreshold: 0,  // any win > accumulatedLoss resets
  pauseLifePreservation: true,
};
```

---

## B) Data Structures

### B.1 SDState (Complete State Object)

```typescript
export interface SDState {
  // === MACHINE STATE ===
  state: SDMachineState;
  direction: Direction | null;

  // === TIMING ===
  activatedAt: number;           // block index
  stateEnteredAt: number;        // block index for current state
  lastResumeAt: number | null;   // block index of last resume

  // === LIFE TRACKING ===
  remainingLife: number;         // current life (0-140)
  initialLife: number;           // life at activation
  accumulatedLoss: number;       // mirrors existing SD logic

  // === PAUSE STATE ===
  pauseReason: SDPauseReason | null;
  pauseStartBlock: number | null;
  pauseBlocksElapsed: number;
  resumeCount: number;           // times resumed this activation

  // === METRICS (REAL) ===
  realMetrics: {
    pnl: number;
    wins: number;
    losses: number;
    consecutiveLosses: number;
    tradesTotal: number;
    lastTradeBlock: number | null;
    winRate: number;             // calculated
  };

  // === METRICS (IMAGINARY - during pause) ===
  imaginaryMetrics: {
    pnl: number;
    wins: number;
    losses: number;
    tradesTotal: number;
    lastOutcome: 'WIN' | 'LOSS' | null;
    consecutiveWins: number;     // for resume trigger
  };

  // === ACTIVATION SOURCE ===
  activationRunProfit: number;
  activationRunLength: number;

  // === HISTORY ===
  stateHistory: SDStateTransition[];
  eventLog: SDEvent[];           // last N events
}

export interface SDStateTransition {
  from: SDMachineState;
  to: SDMachineState;
  trigger: SDEventType;
  blockIndex: number;
  reason: string;
  metrics: {
    remainingLife: number;
    realPnL: number;
    imaginaryPnL: number;
  };
  ts: string;
}
```

### B.2 Event Schema for Pattern Break/Takeover/Reversal

```typescript
/**
 * Event raised when a pattern takes over from SameDir
 */
export interface PatternTakeoverEvent {
  type: 'PATTERN_TAKEOVER';
  blockIndex: number;
  pattern: PatternName;           // ZZ, AntiZZ, 2A2, 3A3, etc.
  runProfit: number;              // profit of the takeover run
  sdStateAtTakeover: SDMachineState;
  sdLifeAtTakeover: number;
  ts: string;
}

/**
 * Event raised when a pattern breaks (ends with loss)
 */
export interface PatternBreakEvent {
  type: 'PATTERN_BREAK';
  blockIndex: number;
  pattern: PatternName;
  breakLoss: number;              // the loss that broke it
  totalRunProfit: number;         // profit before break
  consecutiveLosses: number;
  sdShouldResume: boolean;        // recommendation
  ts: string;
}

/**
 * Event raised on high PCT reversal
 */
export interface HighPctReversalEvent {
  type: 'HIGH_PCT_REVERSAL';
  blockIndex: number;
  reversalPct: number;
  fromDirection: Direction;
  toDirection: Direction;
  isConsecutive: boolean;         // 2nd+ in a row
  consecutiveCount: number;
  sdRecommendation: 'PAUSE' | 'CONTINUE' | 'EXPIRE';
  ts: string;
}

/**
 * Union type for all SD-relevant events
 */
export type SDRelevantEvent =
  | PatternTakeoverEvent
  | PatternBreakEvent
  | HighPctReversalEvent
  | SDEvent;
```

---

## C) Integration Points

### C.1 Hierarchy Decision Pipeline Integration

```typescript
// In HierarchyManager.decideBet()

export class HierarchyManager {
  decideBet(
    blockIndex: number,
    previousBlock: Block | null,
    zzStateManager: ZZStateManager,
    sameDirectionManager: SameDirectionManager,
    sdStateMachine: SDStateMachineManager,  // NEW
    bucketManager: BucketManager,
    lifecycle: PatternLifecycleManager,
    pendingSignals: { pattern: PatternName; expectedDirection: Direction }[]
  ): HierarchyDecision {

    // === PHASE 0: UPDATE SD STATE MACHINE ===
    // Process events BEFORE making bet decision
    const sdEvents = this.sdSignalDetector.analyzeBlock(
      blocks[blockIndex],
      previousBlock,
      blocks.slice(-10),
      zzStateManager.getState(),
      lifecycle.getAllCycles()
    );

    for (const event of sdEvents) {
      sdStateMachine.processEvent(event);
    }

    // === PRIORITY 1: POCKET SYSTEM ===
    // (unchanged)

    // === PRIORITY 2: SAME DIRECTION SYSTEM ===
    const sdState = sdStateMachine.getState();
    const sdActive = sameDirectionManager.isActive();

    console.log(`[HIERARCHY] Priority 2 (SameDir):`);
    console.log(`[HIERARCHY]   machineState=${sdState.state}, active=${sdActive}`);
    console.log(`[HIERARCHY]   remainingLife=${sdState.remainingLife}, pauseReason=${sdState.pauseReason}`);

    if (sdActive && sdState.state === 'ACTIVE') {
      // Normal SameDir betting
      pausedSystems.push('bucket');
      const direction = sameDirectionManager.getBetDirection(previousBlock);
      // ... (existing logic)
    } else if (sdActive && sdState.state === 'PAUSED') {
      // SD is paused - log imaginary outcome but don't bet
      console.log(`[HIERARCHY]   → PAUSED (${sdState.pauseReason}), logging imaginary`);

      // Still pause bucket to maintain hierarchy
      pausedSystems.push('bucket');

      // Let bucket know SD would have bet but is paused
      const decision: HierarchyDecision = {
        blockIndex,
        source: 'same-direction',
        pattern: undefined,
        direction: sameDirectionManager.getBetDirection(previousBlock) ?? undefined,
        shouldBet: false,  // KEY: don't actually bet
        reason: `SameDir PAUSED (${sdState.pauseReason}) - imaginary tracking`,
        pausedSystems,
        sdState: 'PAUSED',  // NEW: include SD state
        sdImaginaryDirection: sameDirectionManager.getBetDirection(previousBlock),
        ts: new Date().toISOString(),
      };

      this.recordDecision(decision);
      return decision;
    }

    // === PRIORITY 3: BUCKET SYSTEM ===
    // (unchanged, but now allowed to bet when SD is PAUSED)
  }
}
```

### C.2 PAUSED SD Representation

```typescript
/**
 * When SD is PAUSED:
 * 1. Hierarchy still considers SD in priority order
 * 2. SD "would bet" but decision.shouldBet = false
 * 3. Imaginary outcome is tracked
 * 4. Bucket can optionally bet (configurable)
 */

// Extended HierarchyDecision
export interface HierarchyDecision {
  // ... existing fields ...

  // NEW: SD-specific fields
  sdState?: SDMachineState;
  sdImaginaryDirection?: Direction;
  sdImaginaryOutcome?: {
    wouldWin: boolean;
    pct: number;
    cumulativeImaginaryPnL: number;
  };
}

// Imaginary tracking in SDStateMachine
class SDStateMachineManager {
  /**
   * Track imaginary outcome when paused
   */
  trackImaginaryOutcome(
    predictedDirection: Direction,
    actualDirection: Direction,
    pct: number
  ): void {
    if (this.state.state !== 'PAUSED') return;

    const isWin = predictedDirection === actualDirection;

    this.state.imaginaryMetrics.tradesTotal++;
    if (isWin) {
      this.state.imaginaryMetrics.wins++;
      this.state.imaginaryMetrics.pnl += pct;
      this.state.imaginaryMetrics.consecutiveWins++;
      this.state.imaginaryMetrics.lastOutcome = 'WIN';
    } else {
      this.state.imaginaryMetrics.losses++;
      this.state.imaginaryMetrics.pnl -= pct;
      this.state.imaginaryMetrics.consecutiveWins = 0;
      this.state.imaginaryMetrics.lastOutcome = 'LOSS';
    }

    // Check resume conditions
    this.checkResumeConditions();
  }

  /**
   * Check if conditions are right to resume
   */
  private checkResumeConditions(): void {
    const im = this.state.imaginaryMetrics;

    // Resume if: 3 consecutive imaginary wins OR imaginary PnL > 100
    if (im.consecutiveWins >= 3 || im.pnl >= 100) {
      this.processEvent({
        type: 'IMAGINARY_PROFIT',
        blockIndex: this.currentBlockIndex,
        data: { imaginaryPnL: im.pnl },
        ts: new Date().toISOString(),
      });
    }
  }
}
```

### C.3 Bucket/Pocket Control During SD Pause

```typescript
/**
 * Configuration for what happens when SD is paused
 */
export interface SDPausePolicy {
  // Can bucket bet while SD is paused?
  allowBucketDuringPause: boolean;  // default: false (maintain hierarchy)

  // Can pocket (ZZ) bet while SD is paused?
  allowPocketDuringPause: boolean;  // default: true (ZZ is higher priority anyway)

  // Should we track what bucket WOULD have done?
  trackBucketImaginary: boolean;    // default: true
}

// In HierarchyManager
if (sdState.state === 'PAUSED') {
  // SD is paused - check policy
  if (this.pausePolicy.allowBucketDuringPause) {
    // Let bucket bet
    console.log(`[HIERARCHY]   SD PAUSED, allowing bucket`);
    // Continue to bucket logic...
  } else {
    // Maintain hierarchy - bucket also paused
    pausedSystems.push('bucket');
    // Return SD paused decision
  }
}
```

---

## D) Logging Upgrades (Mandatory)

### D.1 Enhanced Trade/Decision Logging

```typescript
/**
 * Extended CompletedTrade with real/imaginary distinction
 */
export interface CompletedTrade {
  // ... existing fields ...

  // NEW: Real vs Imaginary
  isRealBet: boolean;           // true = actual bet, false = imaginary during pause
  sdMachineState: SDMachineState | null;  // SD state at time of trade

  // NEW: For imaginary trades
  imaginaryReason?: string;     // why this was imaginary (e.g., "SD_PAUSED")
}

/**
 * Extended LoggedPlay with SD state tracking
 */
export interface LoggedPlay {
  // ... existing fields ...

  // NEW: SD State Snapshot
  sdStateSnapshot: {
    state: SDMachineState;
    remainingLife: number;
    pauseReason: SDPauseReason | null;
    realPnL: number;
    imaginaryPnL: number;
  };

  // NEW: Real vs Imaginary flag for this play
  betType: 'REAL' | 'IMAGINARY' | 'NONE';
}
```

### D.2 State Transition Logging

```typescript
/**
 * State transition log entry
 */
export interface SDStateTransitionLog {
  // Transition details
  from: SDMachineState;
  to: SDMachineState;
  trigger: SDEventType;
  blockIndex: number;

  // Context
  reason: string;               // human-readable explanation
  triggerData: SDEvent['data']; // the event data that caused transition

  // Metrics at transition
  metricsAtTransition: {
    remainingLife: number;
    accumulatedLoss: number;
    realPnL: number;
    realWinRate: number;
    imaginaryPnL: number;
    imaginaryWinRate: number;
    consecutiveRealLosses: number;
  };

  // Recovery info (if resuming)
  resumeInfo?: {
    blocksInPause: number;
    imaginaryTradesDuringPause: number;
    imaginaryPnLDuringPause: number;
  };

  ts: string;
}

// Log function
function logSDStateTransition(
  transition: SDStateTransitionLog
): void {
  console.log(
    `[SD-STATE] ${transition.from} → ${transition.to} ` +
    `| Block: ${transition.blockIndex} ` +
    `| Trigger: ${transition.trigger} ` +
    `| Reason: ${transition.reason}`
  );
  console.log(
    `[SD-STATE]   Life: ${transition.metricsAtTransition.remainingLife}/140 ` +
    `| RealPnL: ${transition.metricsAtTransition.realPnL} ` +
    `| ImgPnL: ${transition.metricsAtTransition.imaginaryPnL}`
  );
  if (transition.resumeInfo) {
    console.log(
      `[SD-STATE]   Resume after ${transition.resumeInfo.blocksInPause} blocks, ` +
      `${transition.resumeInfo.imaginaryTradesDuringPause} img trades, ` +
      `${transition.resumeInfo.imaginaryPnLDuringPause} img PnL`
    );
  }
}
```

### D.3 Pattern Dominance Controller Logging

```typescript
/**
 * Per-block pattern dominance log
 */
export interface PatternDominanceLog {
  blockIndex: number;

  // Which system is "in control"
  dominantSystem: 'POCKET' | 'SAMEDIR' | 'BUCKET' | 'NONE';

  // SD status
  sdStatus: {
    machineState: SDMachineState;
    isActivatedInManager: boolean;  // SameDirectionManager.isActive()
    wouldBet: boolean;              // would SD bet this block if not paused
    actuallyBetting: boolean;       // is SD actually betting
  };

  // Pattern status
  patternStatus: {
    zzPocket: 1 | 2;
    antiZZPocket: 1 | 2;
    activePattern: 'ZZ' | 'AntiZZ' | null;
    bucketMainPatterns: PatternName[];
    bucketBnsPatterns: PatternName[];
  };

  // Trade this block
  trade: {
    wasExecuted: boolean;
    pattern: PatternName | null;
    source: HierarchySource;
    isReal: boolean;
  };

  ts: string;
}

// In SessionRecorder.recordBlock():
const dominanceLog: PatternDominanceLog = {
  blockIndex: block.index,
  dominantSystem: decision.source === 'none' ? 'NONE' :
    decision.source === 'pocket' ? 'POCKET' :
    decision.source === 'same-direction' ? 'SAMEDIR' : 'BUCKET',
  sdStatus: {
    machineState: sdStateMachine.getState().state,
    isActivatedInManager: sameDirectionManager.isActive(),
    wouldBet: sameDirectionManager.getBetDirection(previousBlock) !== null,
    actuallyBetting: decision.source === 'same-direction' && decision.shouldBet,
  },
  patternStatus: {
    zzPocket: zzStateManager.getState().zzPocket,
    antiZZPocket: zzStateManager.getState().antiZZPocket,
    activePattern: zzStateManager.getState().activePattern,
    bucketMainPatterns: bucketManager.getBucketSummary().main,
    bucketBnsPatterns: bucketManager.getBucketSummary().bns,
  },
  trade: {
    wasExecuted: decision.shouldBet,
    pattern: decision.pattern ?? null,
    source: decision.source,
    isReal: decision.shouldBet && sdStateMachine.getState().state !== 'PAUSED',
  },
  ts: new Date().toISOString(),
};

this.patternDominanceLogs.push(dominanceLog);
```

---

## E) Testing Plan

### E.1 Unit Tests for SD State Transitions

```typescript
// File: src/tests/sd-state-machine.test.ts

describe('SDStateMachine State Transitions', () => {

  // === ACTIVE → PAUSED on >70 reversal ===
  describe('ACTIVE → PAUSED on high PCT reversal', () => {
    it('should pause on single 70%+ reversal', () => {
      const sm = createSDStateMachine();
      sm.activate(10, 150); // block 10, runProfit 150

      expect(sm.getState().state).toBe('ACTIVE');

      // Simulate 75% reversal
      sm.processEvent({
        type: 'HIGH_PCT_REVERSAL',
        blockIndex: 15,
        data: { reversalPct: 75 },
        ts: new Date().toISOString(),
      });

      expect(sm.getState().state).toBe('PAUSED');
      expect(sm.getState().pauseReason).toBe('HIGH_PCT_REVERSAL');
      expect(sm.getState().pauseStartBlock).toBe(15);
    });

    it('should pause on 70% exactly', () => {
      const sm = createSDStateMachine();
      sm.activate(10, 150);

      sm.processEvent({
        type: 'HIGH_PCT_REVERSAL',
        blockIndex: 15,
        data: { reversalPct: 70 },
        ts: new Date().toISOString(),
      });

      expect(sm.getState().state).toBe('PAUSED');
    });

    it('should NOT pause on 69% reversal', () => {
      const sm = createSDStateMachine();
      sm.activate(10, 150);

      sm.processEvent({
        type: 'HIGH_PCT_REVERSAL',
        blockIndex: 15,
        data: { reversalPct: 69 },
        ts: new Date().toISOString(),
      });

      expect(sm.getState().state).toBe('ACTIVE');
    });

    it('should preserve remaining life when pausing', () => {
      const sm = createSDStateMachine();
      sm.activate(10, 150);
      sm.recordRealLoss(50); // life = 90

      const lifeBefore = sm.getState().remainingLife;

      sm.processEvent({
        type: 'HIGH_PCT_REVERSAL',
        blockIndex: 15,
        data: { reversalPct: 80 },
        ts: new Date().toISOString(),
      });

      expect(sm.getState().remainingLife).toBe(lifeBefore);
    });
  });

  // === PAUSED → RESUME on pattern-break if life > 0 ===
  describe('PAUSED → ACTIVE on pattern break', () => {
    it('should resume when ZZ breaks and life > 0', () => {
      const sm = createSDStateMachine();
      sm.activate(10, 150);
      sm.pause('ZZ_XAX_TAKEOVER', 15);

      expect(sm.getState().state).toBe('PAUSED');
      expect(sm.getState().remainingLife).toBeGreaterThan(0);

      sm.processEvent({
        type: 'ZZ_XAX_BREAK',
        blockIndex: 25,
        data: { pattern: 'ZZ' },
        ts: new Date().toISOString(),
      });

      expect(sm.getState().state).toBe('ACTIVE');
      expect(sm.getState().lastResumeAt).toBe(25);
      expect(sm.getState().resumeCount).toBe(1);
    });

    it('should NOT resume if life = 0', () => {
      const sm = createSDStateMachine();
      sm.activate(10, 150);
      sm.forceSetLife(0); // Simulate exhausted life
      sm.pause('ZZ_XAX_TAKEOVER', 15);

      sm.processEvent({
        type: 'ZZ_XAX_BREAK',
        blockIndex: 25,
        data: { pattern: 'ZZ' },
        ts: new Date().toISOString(),
      });

      expect(sm.getState().state).toBe('EXPIRED');
    });

    it('should resume on imaginary profit threshold', () => {
      const sm = createSDStateMachine();
      sm.activate(10, 150);
      sm.pause('HIGH_PCT_REVERSAL', 15);

      // Simulate 3 consecutive imaginary wins
      sm.trackImaginaryOutcome(1, 1, 40); // win
      sm.trackImaginaryOutcome(1, 1, 35); // win
      sm.trackImaginaryOutcome(1, 1, 30); // win - triggers resume

      expect(sm.getState().state).toBe('ACTIVE');
    });
  });

  // === PAUSED → EXPIRED when life hits 0 ===
  describe('PAUSED → EXPIRED on life exhaustion', () => {
    it('should expire when real loss exhausts remaining life', () => {
      const sm = createSDStateMachine();
      sm.activate(10, 150);
      sm.recordRealLoss(130); // life = 10
      sm.pause('HIGH_PCT_REVERSAL', 15);

      // Even while paused, if we track another real loss (shouldn't happen normally)
      sm.forceRecordLoss(15); // life = 0 or negative

      expect(sm.getState().state).toBe('EXPIRED');
    });

    it('should NOT expire from imaginary losses', () => {
      const sm = createSDStateMachine();
      sm.activate(10, 150);
      sm.pause('HIGH_PCT_REVERSAL', 15);

      // Life at pause = 140
      // Simulate many imaginary losses
      for (let i = 0; i < 20; i++) {
        sm.trackImaginaryOutcome(1, -1, 50); // loss
      }

      // Life should still be 140 (imaginary doesn't affect life)
      expect(sm.getState().remainingLife).toBe(140);
      expect(sm.getState().state).toBe('PAUSED');
    });
  });
});
```

### E.2 Replay Tests Using Real Sessions

```typescript
// File: src/tests/sd-state-machine-replay.test.ts

describe('SDStateMachine Replay Tests', () => {

  const SESSION_1_PATH = 'data/sessions/session_2025-12-24T18-19-24-936Z.json';
  const SESSION_2_PATH = 'data/sessions/session_2025-12-24T18-57-18-606Z.json';

  describe('Session 1 (24/12/2025 18:19) - Expected Fake Activation Pattern', () => {
    let session: SessionData;

    beforeAll(() => {
      session = JSON.parse(fs.readFileSync(SESSION_1_PATH, 'utf8'));
    });

    it('should produce deterministic output on replay', () => {
      // Replay 1
      const sm1 = createSDStateMachine();
      const result1 = replaySession(sm1, session.blocks);

      // Replay 2
      const sm2 = createSDStateMachine();
      const result2 = replaySession(sm2, session.blocks);

      // Compare
      expect(result1.stateHistory).toEqual(result2.stateHistory);
      expect(result1.finalState).toEqual(result2.finalState);
    });

    it('should detect the 9-block long flow at blocks 45-53', () => {
      const sm = createSDStateMachine();
      const result = replaySession(sm, session.blocks);

      const longFlowEvent = result.events.find(
        e => e.type === 'LONG_FLOW_DETECTED' && e.blockIndex >= 45 && e.blockIndex <= 53
      );

      expect(longFlowEvent).toBeDefined();
      expect(longFlowEvent?.data?.flowLength).toBeGreaterThanOrEqual(7);
    });

    it('should pause on high PCT reversals in Session 1', () => {
      const sm = createSDStateMachine();
      const result = replaySession(sm, session.blocks);

      // Session 1 had 6 high PCT (>=70) reversals that caused losses
      const pauseTransitions = result.stateHistory.filter(
        t => t.to === 'PAUSED' && t.trigger === 'HIGH_PCT_REVERSAL'
      );

      expect(pauseTransitions.length).toBeGreaterThan(0);
    });

    it('should track imaginary outcomes during pause', () => {
      const sm = createSDStateMachine();
      const result = replaySession(sm, session.blocks);

      expect(result.finalState.imaginaryMetrics.tradesTotal).toBeGreaterThan(0);
    });
  });

  describe('Session 2 (24/12/2025 18:57) - Expected Long Run Pattern', () => {
    let session: SessionData;

    beforeAll(() => {
      session = JSON.parse(fs.readFileSync(SESSION_2_PATH, 'utf8'));
    });

    it('should produce deterministic output on replay', () => {
      const sm1 = createSDStateMachine();
      const result1 = replaySession(sm1, session.blocks);

      const sm2 = createSDStateMachine();
      const result2 = replaySession(sm2, session.blocks);

      expect(result1.stateHistory).toEqual(result2.stateHistory);
    });

    it('should detect the long run from blocks 20-41 (22 trades)', () => {
      const sm = createSDStateMachine();
      const result = replaySession(sm, session.blocks);

      // Session 2 had one long 22-trade run
      // SM should stay ACTIVE for most of this
      const activeBlocks = result.blockStates.filter(s => s.state === 'ACTIVE');
      expect(activeBlocks.length).toBeGreaterThan(15);
    });

    it('should have fewer pause events than Session 1', () => {
      const sm1 = createSDStateMachine();
      const session1 = JSON.parse(fs.readFileSync(SESSION_1_PATH, 'utf8'));
      const result1 = replaySession(sm1, session1.blocks);

      const sm2 = createSDStateMachine();
      const result2 = replaySession(sm2, session.blocks);

      const pauses1 = result1.stateHistory.filter(t => t.to === 'PAUSED').length;
      const pauses2 = result2.stateHistory.filter(t => t.to === 'PAUSED').length;

      expect(pauses2).toBeLessThan(pauses1);
    });
  });

  describe('Comparison: Session 1 vs Session 2', () => {
    it('should show Session 2 has better imaginary tracking profile', () => {
      const session1 = JSON.parse(fs.readFileSync(SESSION_1_PATH, 'utf8'));
      const session2 = JSON.parse(fs.readFileSync(SESSION_2_PATH, 'utf8'));

      const sm1 = createSDStateMachine();
      const result1 = replaySession(sm1, session1.blocks);

      const sm2 = createSDStateMachine();
      const result2 = replaySession(sm2, session2.blocks);

      // Session 2 should have less time in PAUSED state
      const pausedBlocks1 = result1.blockStates.filter(s => s.state === 'PAUSED').length;
      const pausedBlocks2 = result2.blockStates.filter(s => s.state === 'PAUSED').length;

      console.log(`Session 1: ${pausedBlocks1} blocks paused`);
      console.log(`Session 2: ${pausedBlocks2} blocks paused`);

      // Session 2 should have better real PnL
      expect(result2.finalState.realMetrics.pnl).toBeGreaterThan(result1.finalState.realMetrics.pnl);
    });
  });
});

// Helper function for replay
function replaySession(sm: SDStateMachine, blocks: Block[]): ReplayResult {
  const events: SDEvent[] = [];
  const stateHistory: SDStateTransition[] = [];
  const blockStates: Array<{ blockIndex: number; state: SDMachineState }> = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const prevBlock = i > 0 ? blocks[i - 1] : null;

    // Detect events
    const detector = createSDSignalDetector();
    const blockEvents = detector.analyzeBlock(block, prevBlock, blocks.slice(0, i + 1));

    for (const event of blockEvents) {
      sm.processEvent(event);
      events.push(event);
    }

    blockStates.push({
      blockIndex: block.index,
      state: sm.getState().state,
    });
  }

  return {
    events,
    stateHistory: sm.getState().stateHistory,
    blockStates,
    finalState: sm.getState(),
  };
}
```

### E.3 Integration Tests (Phase 1 - Logging Only)

```typescript
// File: src/tests/sd-integration-phase1.test.ts

describe('SD State Machine Integration - Phase 1 (Logging Only)', () => {

  it('should not change existing betting behavior', () => {
    // Replay session with and without SD state machine
    const session = loadSession(SESSION_1_PATH);

    // Without SM (existing behavior)
    const resultWithout = replayWithoutSM(session);

    // With SM (new logging, same behavior)
    const resultWith = replayWithSM(session);

    // Trades should be identical
    expect(resultWith.trades).toEqual(resultWithout.trades);
    expect(resultWith.finalPnL).toEqual(resultWithout.finalPnL);
  });

  it('should add SD state snapshots to logs', () => {
    const session = loadSession(SESSION_1_PATH);
    const result = replayWithSM(session);

    // Every logged play should have SD state snapshot
    for (const play of result.logs) {
      expect(play.sdStateSnapshot).toBeDefined();
      expect(play.sdStateSnapshot.state).toBeDefined();
      expect(play.sdStateSnapshot.remainingLife).toBeDefined();
    }
  });

  it('should track imaginary outcomes when SD would be paused', () => {
    const session = loadSession(SESSION_1_PATH);
    const result = replayWithSM(session);

    // Find blocks where SD was "paused" (would have paused in new system)
    const pausedBlocks = result.logs.filter(
      p => p.sdStateSnapshot.state === 'PAUSED'
    );

    // All paused blocks should have imaginary tracking
    for (const block of pausedBlocks) {
      expect(block.sdStateSnapshot.imaginaryPnL).toBeDefined();
    }
  });

  it('should log state transitions with full context', () => {
    const session = loadSession(SESSION_1_PATH);
    const result = replayWithSM(session);

    // Check transition logs
    for (const transition of result.sdTransitions) {
      expect(transition.from).toBeDefined();
      expect(transition.to).toBeDefined();
      expect(transition.trigger).toBeDefined();
      expect(transition.reason).not.toBe('');
      expect(transition.metricsAtTransition).toBeDefined();
    }
  });
});
```

---

## F) Implementation Phases

### Phase 1: Logging Only (No Behavior Change)
1. Implement SDStateMachine class
2. Implement SDSignalDetector
3. Integrate into HierarchyManager (observe only)
4. Add logging upgrades
5. Run replay tests to verify determinism
6. **Acceptance:** All existing session replays produce identical trades

### Phase 2: Imaginary Tracking
1. Enable imaginary outcome tracking
2. Add imaginary metrics to logs
3. Add resume condition detection
4. **Acceptance:** Imaginary PnL tracked correctly, no behavior change

### Phase 3: Pause Activation
1. Enable actual pause/resume logic
2. Configure pause policy (allow bucket during pause?)
3. Enable life preservation during pause
4. **Acceptance:** Session replays show improved theoretical PnL

### Phase 4: Production Testing
1. Run live sessions with SD state machine
2. Compare real vs imaginary outcomes
3. Tune thresholds (70% reversal, 3 consecutive wins, etc.)
4. Document findings

---

## G) Assumptions & Unknowns

### Assumptions
1. **70% reversal threshold is appropriate** - Based on Session 1 analysis showing 6 high PCT reversals caused -982 PnL
2. **3 consecutive imaginary wins is good resume trigger** - Needs validation
3. **Pause should NOT decay life** - Key assumption for life preservation
4. **Bucket should remain paused when SD is paused** - Maintains hierarchy

### Unknowns (Need Data)
1. **Optimal resume conditions** - Is imaginary profit threshold (100) too high/low?
2. **ZZ/XAX takeover detection accuracy** - How to distinguish takeover from temporary fluctuation?
3. **Long flow detection latency** - At block 7, is it too late to capitalize?
4. **Multiple pattern interaction** - What if ZZ and 2A2 both become profitable?

### Fields Needed Immediately (Not Currently Logged)
1. **Per-block SD machine state** - Add to LoggedPlay
2. **Real vs Imaginary flag on trades** - Add to CompletedTrade
3. **Pattern dominance per block** - New log structure
4. **Reversal PCT on direction changes** - Currently have block.pct but not as "reversal" event

---

## H) File Structure

```
ghost-evaluator/src/
├── engine/
│   ├── sd-state-machine.ts      # NEW: SDStateMachine class
│   ├── sd-signal-detector.ts    # NEW: Event detection
│   ├── sd-depreciation.ts       # NEW: Life/decay model
│   ├── same-direction.ts        # MODIFIED: Add machine integration
│   └── hierarchy-manager.ts     # MODIFIED: Add SD state handling
├── types/
│   ├── index.ts                 # MODIFIED: Add SD types
│   └── sd-types.ts              # NEW: All SD-related types
├── data/
│   ├── session-recorder.ts      # MODIFIED: Add SD logging
│   └── types.ts                 # MODIFIED: Add logging types
└── tests/
    ├── sd-state-machine.test.ts # NEW: Unit tests
    ├── sd-replay.test.ts        # NEW: Replay tests
    └── sd-integration.test.ts   # NEW: Integration tests
```

---

## I) Success Metrics

1. **Determinism:** Replaying same session produces identical SD state history
2. **No Regression:** Phase 1 produces identical trades as current system
3. **Improved Theoretical:** Imaginary tracking shows pauses would have avoided losses
4. **Quantifiable Improvement:**
   - Session 1 fake activation cost (-670) would be reduced
   - Long flow capture rate increases (0% → >50%)

---

## J) Next Steps

1. Review this plan and provide feedback
2. Clarify any unknowns before implementation
3. Begin Phase 1 implementation
