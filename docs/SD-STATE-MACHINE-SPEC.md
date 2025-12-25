# SD State Machine - Technical Specification

**Version:** 1.0
**Date:** 2025-12-25
**Status:** Draft
**Author:** Claude + Human collaboration

---

## 1. Executive Summary

### 1.1 Problem Statement

The current SameDirection system uses binary activation/deactivation:
- **Activate** when RunProfit ≥ 140
- **Deactivate** when accumulatedLoss > 140

This creates a "false deactivation loop" failure mode:
1. Long flow activates SD → profitable
2. High-PCT reversal causes loss → SD deactivates
3. Direction continues in same direction → SD reactivates too late
4. Repeat → outsized drawdowns

**Evidence (2025-12-25 session):**
- Peak equity: 1106
- Final equity: 126
- Max drawdown: 1250
- SD PnL: -550 (worst pattern)
- 7 "killer trades" (70%+ reversals): -1184

### 1.2 Solution

Treat SD as a **long-lived regime** with depreciation, not binary on/off:

```
INACTIVE ──[activation]──▶ ACTIVE ──[hostility]──▶ PAUSED ──[recovery]──▶ ACTIVE
                              │                        │
                              │                        ▼
                              └──[life exhausted]──▶ EXPIRED ──▶ INACTIVE
```

Key insight: A high-PCT reversal is a **HOSTILITY signal**, not a kill signal.

---

## 2. State Definitions

### 2.1 States

| State | Description | Betting | Life Decay |
|-------|-------------|---------|------------|
| `INACTIVE` | SD not activated, observing for activation | None | N/A |
| `ACTIVE` | SD betting on continuation | Real bets | On loss |
| `PAUSED` | SD paused due to hostility, tracking imaginary | Imaginary only | None |
| `EXPIRED` | Life exhausted, waiting for new activation | None | N/A |

### 2.2 State Properties

```typescript
interface SDState {
  // Current state
  state: 'INACTIVE' | 'ACTIVE' | 'PAUSED' | 'EXPIRED';

  // Direction we're betting (null if INACTIVE)
  direction: 1 | -1 | null;

  // Life tracking
  remainingLife: number;      // 0-140, starts at 140
  accumulatedLoss: number;    // Running total of losses

  // Timing
  activatedAt: number;        // Block index
  stateEnteredAt: number;     // Block index of current state

  // Pause-specific
  pauseReason: PauseReason | null;
  pauseStartBlock: number | null;

  // Imaginary tracking (during PAUSED)
  imaginaryPnL: number;
  imaginaryWins: number;
  imaginaryLosses: number;
  consecutiveImaginaryWins: number;

  // Real metrics (during ACTIVE)
  realPnL: number;
  realWins: number;
  realLosses: number;

  // Resume tracking
  resumeCount: number;        // Times resumed this activation cycle
}
```

---

## 3. State Transitions

### 3.1 Transition Diagram

```
                    ┌────────────────────────────────────────┐
                    │                                        │
                    ▼                                        │
              ┌──────────┐                                   │
              │ INACTIVE │◀─────────────────────────────────┐│
              └────┬─────┘                                  ││
                   │                                        ││
                   │ [T1] RunProfit ≥ 140                   ││
                   ▼                                        ││
              ┌──────────┐                                  ││
         ┌───▶│  ACTIVE  │◀──────────────────┐              ││
         │    └────┬─────┘                   │              ││
         │         │                         │              ││
         │         │ [T2] High-PCT reversal  │ [T4] Resume  ││
         │         │ [T3] ZZ/XAX takeover    │              ││
         │         ▼                         │              ││
         │    ┌──────────┐                   │              ││
         │    │  PAUSED  │───────────────────┘              ││
         │    └────┬─────┘                                  ││
         │         │                                        ││
         │         │ [T5] Life exhausted                    ││
         │         ▼                                        ││
         │    ┌──────────┐                                  ││
         │    │ EXPIRED  │──────────────────────────────────┘│
         │    └──────────┘                                   │
         │                                                   │
         └───────────────────────────────────────────────────┘
                    [T6] New activation (RunProfit ≥ 140)
```

### 3.2 Transition Table

| ID | From | To | Trigger | Condition | Action |
|----|------|-----|---------|-----------|--------|
| T1 | INACTIVE | ACTIVE | ACTIVATION | RunProfit ≥ 140 | Reset life to 140, reset accumulatedLoss |
| T2 | ACTIVE | PAUSED | HIGH_PCT_REVERSAL | reversalPct ≥ threshold AND loss | Set pauseReason, preserve life |
| T3 | ACTIVE | PAUSED | ZZ_XAX_TAKEOVER | ZZ/XAX becomes dominant | Set pauseReason, preserve life |
| T4 | PAUSED | ACTIVE | RESUME | See resume conditions | Reset imaginary counters |
| T5 | PAUSED | EXPIRED | LIFE_EXHAUSTED | remainingLife ≤ 0 | N/A |
| T6 | EXPIRED | ACTIVE | ACTIVATION | New RunProfit ≥ 140 | Full reset |
| T7 | ACTIVE | EXPIRED | LIFE_EXHAUSTED | remainingLife ≤ 0 OR accumulatedLoss > 140 | N/A |

### 3.3 Transition Details

#### T1: INACTIVE → ACTIVE (Activation)

**Trigger:** A run completes with RunProfit ≥ 140

**Conditions:**
- State is INACTIVE
- RunProfit calculation: sum(D2..Dk) - breakBlock.pct ≥ 140

**Actions:**
```typescript
state = 'ACTIVE';
direction = previousBlock.dir;  // Bet on continuation
remainingLife = 140;
accumulatedLoss = 0;
activatedAt = blockIndex;
stateEnteredAt = blockIndex;
realPnL = 0;
realWins = 0;
realLosses = 0;
resumeCount = 0;
```

**Edge Cases:**
- If activation happens during ZZ/XAX dominance, immediately transition to PAUSED (T3)
- Activation RunProfit is logged for analysis

---

#### T2: ACTIVE → PAUSED (High-PCT Reversal)

**Trigger:** Block is a reversal with pct ≥ threshold AND SD bet would lose

**Conditions:**
- State is ACTIVE
- currentBlock.dir ≠ previousBlock.dir (reversal)
- currentBlock.pct ≥ highPctThreshold (default: 60)
- SD bet direction would lose

**Actions:**
```typescript
state = 'PAUSED';
pauseReason = 'HIGH_PCT_REVERSAL';
pauseStartBlock = blockIndex;
stateEnteredAt = blockIndex;
imaginaryPnL = 0;
imaginaryWins = 0;
imaginaryLosses = 0;
consecutiveImaginaryWins = 0;
// remainingLife is PRESERVED (not decayed)
```

**Edge Cases:**
- If reversal pct is high but SD would win, do NOT pause
- Multiple high-PCT reversals in a row: stay paused, update pauseStartBlock
- Already paused: ignore (stay paused)

**Rationale:** A high-PCT reversal that causes a loss indicates the market may be shifting. Pausing preserves life for potential resume.

---

#### T3: ACTIVE → PAUSED (ZZ/XAX Takeover)

**Trigger:** ZZ or XAX pattern becomes dominant (3+ consecutive wins)

**Conditions:**
- State is ACTIVE
- ZZ or XAX has won 3+ consecutive trades
- OR ZZ/XAX is in Pocket 1 (about to bet)

**Actions:**
```typescript
state = 'PAUSED';
pauseReason = 'ZZ_XAX_TAKEOVER';
pauseStartBlock = blockIndex;
stateEnteredAt = blockIndex;
// Same as T2
```

**Edge Cases:**
- If ZZ/XAX takes over but then immediately breaks, trigger resume (T4)
- Bucket patterns (2A2, 3A3) do NOT trigger takeover pause

**Rationale:** When ZZ/XAX is dominant, SD's continuation bets are likely to conflict. Better to pause and let ZZ/XAX play.

---

#### T4: PAUSED → ACTIVE (Resume)

**Trigger:** Resume conditions met

**Resume Conditions (any one):**
1. `consecutiveImaginaryWins ≥ 3` - SD would have won 3 in a row
2. `imaginaryPnL ≥ imaginaryProfitThreshold` (default: 100)
3. `ZZ/XAX pattern broke` - ZZ/XAX lost, opportunity to resume
4. `pauseBlocksElapsed ≥ maxPauseBlocks` (optional timeout)

**Additional Requirement:**
- `remainingLife > 0` - Must have life left to resume

**Actions:**
```typescript
state = 'ACTIVE';
stateEnteredAt = blockIndex;
resumeCount++;
pauseReason = null;
pauseStartBlock = null;
// Keep remainingLife as-is (preserved during pause)
// Reset imaginary counters
imaginaryPnL = 0;
imaginaryWins = 0;
imaginaryLosses = 0;
consecutiveImaginaryWins = 0;
```

**Edge Cases:**
- If resume condition met but life = 0, transition to EXPIRED instead
- Multiple resume conditions met simultaneously: log all, use first
- Resume into immediate reversal: may pause again immediately (that's OK)

---

#### T5: PAUSED → EXPIRED (Life Exhausted While Paused)

**Trigger:** Life reaches 0 while paused (shouldn't happen normally)

**Conditions:**
- State is PAUSED
- remainingLife ≤ 0

**When This Happens:**
- Bug: life shouldn't decay while paused
- Or: explicit force-expire for some reason

**Actions:**
```typescript
state = 'EXPIRED';
stateEnteredAt = blockIndex;
pauseReason = null;
```

---

#### T6: EXPIRED → ACTIVE (New Activation)

**Trigger:** New run completes with RunProfit ≥ 140

**Conditions:**
- State is EXPIRED
- New RunProfit ≥ 140 (independent of previous activation)

**Actions:**
- Same as T1 (full reset)

---

#### T7: ACTIVE → EXPIRED (Life Exhausted While Active)

**Trigger:** Life exhausted from real losses

**Conditions:**
- State is ACTIVE
- remainingLife ≤ 0 OR accumulatedLoss > 140

**Actions:**
```typescript
state = 'EXPIRED';
stateEnteredAt = blockIndex;
```

**Note:** This is the current behavior. With the pause system, this should happen less often because we pause before taking fatal damage.

---

## 4. Signal Detection

### 4.1 Signals

| Signal | Detection | Priority |
|--------|-----------|----------|
| `HIGH_PCT_REVERSAL` | block.dir ≠ prevBlock.dir AND block.pct ≥ 60 | High |
| `ZZ_XAX_TAKEOVER` | ZZ/XAX consecutive wins ≥ 3 OR pocket = 1 | High |
| `ZZ_XAX_BREAK` | ZZ/XAX trade lost | Medium |
| `CONSECUTIVE_IMG_WINS` | imaginary wins ≥ 3 consecutive | Medium |
| `IMAGINARY_PROFIT` | imaginaryPnL ≥ 100 | Low |
| `LIFE_EXHAUSTED` | remainingLife ≤ 0 | Critical |

### 4.2 Signal Detector Implementation

```typescript
class SDSignalDetector {
  detectSignals(
    block: Block,
    prevBlock: Block | null,
    sdState: SDState,
    zzState: ZZState,
    lastTrade: Trade | null
  ): SDSignal[] {
    const signals: SDSignal[] = [];

    // 1. Check high-PCT reversal
    if (prevBlock && block.dir !== prevBlock.dir) {
      if (block.pct >= this.config.highPctThreshold) {
        signals.push({
          type: 'HIGH_PCT_REVERSAL',
          blockIndex: block.index,
          data: { pct: block.pct, fromDir: prevBlock.dir, toDir: block.dir }
        });
      }
    }

    // 2. Check ZZ/XAX takeover
    if (zzState.activePattern && zzState.consecutiveWins >= 3) {
      signals.push({
        type: 'ZZ_XAX_TAKEOVER',
        blockIndex: block.index,
        data: { pattern: zzState.activePattern, wins: zzState.consecutiveWins }
      });
    }

    // 3. Check ZZ/XAX break
    if (lastTrade &&
        (lastTrade.pattern === 'ZZ' || lastTrade.pattern === 'AntiZZ') &&
        !lastTrade.isWin) {
      signals.push({
        type: 'ZZ_XAX_BREAK',
        blockIndex: block.index,
        data: { pattern: lastTrade.pattern, loss: lastTrade.pnl }
      });
    }

    // 4. Check imaginary resume conditions (only when PAUSED)
    if (sdState.state === 'PAUSED') {
      if (sdState.consecutiveImaginaryWins >= this.config.consecutiveWinsResume) {
        signals.push({
          type: 'CONSECUTIVE_IMG_WINS',
          blockIndex: block.index,
          data: { count: sdState.consecutiveImaginaryWins }
        });
      }
      if (sdState.imaginaryPnL >= this.config.imaginaryProfitResume) {
        signals.push({
          type: 'IMAGINARY_PROFIT',
          blockIndex: block.index,
          data: { profit: sdState.imaginaryPnL }
        });
      }
    }

    return signals;
  }
}
```

---

## 5. Life Management

### 5.1 Life Rules

| Event | Life Change | Condition |
|-------|-------------|-----------|
| Activation | life = 140 | Always on activation |
| Real loss (ACTIVE) | life -= lossPct × decayPerLoss | Only during ACTIVE |
| Imaginary loss (PAUSED) | No change | Life preserved during pause |
| Big win | life = 140 (reset) | winPnL > accumulatedLoss |
| Small win | No change | winPnL ≤ accumulatedLoss |
| Time while PAUSED | No change | pauseLifePreservation = true |

### 5.2 Life Calculation

```typescript
function updateLifeOnLoss(state: SDState, lossPct: number, isReal: boolean): void {
  if (!isReal) {
    // Imaginary loss during PAUSED - no life impact
    return;
  }

  // Real loss during ACTIVE
  state.remainingLife -= lossPct * config.decayPerLoss;
  state.accumulatedLoss += lossPct * 2;  // PnL is 2× pct

  // Check for expiration
  if (state.remainingLife <= 0 || state.accumulatedLoss > 140) {
    // Trigger EXPIRED transition
  }
}

function updateLifeOnWin(state: SDState, winPnL: number): void {
  if (winPnL > state.accumulatedLoss) {
    // Big win - reset
    state.remainingLife = 140;
    state.accumulatedLoss = 0;
  }
  // Small win - no change
}
```

### 5.3 Life Preservation Rationale

During PAUSED state, life does NOT decay because:
1. We're not taking real losses
2. We want to preserve the option to resume
3. The pause is temporary, not a failure

---

## 6. Configuration Parameters

### 6.1 Parameter Table

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `highPctThreshold` | 60 | 50-80 | Reversal pct to trigger pause |
| `consecutiveWinsResume` | 3 | 2-5 | Imaginary wins to resume |
| `imaginaryProfitResume` | 100 | 50-200 | Imaginary profit to resume |
| `initialLife` | 140 | 100-200 | Life on activation |
| `decayPerLoss` | 1.0 | 0.5-2.0 | Life decay per loss pct |
| `pauseLifePreservation` | true | bool | Don't decay life while paused |
| `allowBucketDuringPause` | false | bool | Bucket can bet when SD paused |
| `maxPauseBlocks` | null | null/10-50 | Auto-resume after N blocks |

### 6.2 Parameter Tuning Guidelines

Based on 2025-12-25 analysis:

| Parameter | Evidence | Recommendation |
|-----------|----------|----------------|
| `highPctThreshold` | 60% gave +622 improvement | Start at 60, may lower to 55 |
| `consecutiveWinsResume` | 3 worked well in sim | Keep at 3 |
| `initialLife` | 140-200 similar results | Keep at 140 for now |

---

## 7. Integration Points

### 7.1 With SameDirectionManager

```typescript
// In SameDirectionManager
class SameDirectionManager {
  private stateMachine: SDStateMachine;

  processBlock(block: Block): void {
    // Existing run tracking logic...

    // Feed signals to state machine
    const signals = this.signalDetector.detectSignals(block, prevBlock, ...);
    for (const signal of signals) {
      this.stateMachine.processSignal(signal);
    }
  }

  // NEW: Query if we should bet real or imaginary
  shouldBetReal(): boolean {
    return this.stateMachine.getState() === 'ACTIVE';
  }

  // NEW: Track imaginary outcome
  trackImaginaryOutcome(predictedDir: Direction, actualDir: Direction, pct: number): void {
    if (this.stateMachine.getState() === 'PAUSED') {
      this.stateMachine.recordImaginaryTrade(predictedDir === actualDir, pct);
    }
  }
}
```

### 7.2 With HierarchyManager

```typescript
// In HierarchyManager.decideBet()
if (sdActive) {
  const sdMachineState = sameDirectionManager.getStateMachine().getState();

  if (sdMachineState === 'ACTIVE') {
    // Normal SD bet
    pausedSystems.push('bucket');
    return {
      source: 'same-direction',
      shouldBet: true,
      direction: sameDirectionManager.getBetDirection(prevBlock),
    };

  } else if (sdMachineState === 'PAUSED') {
    // SD paused - track imaginary, optionally let bucket bet
    pausedSystems.push('bucket');  // Or remove if allowBucketDuringPause
    return {
      source: 'same-direction',
      shouldBet: false,
      sdState: 'PAUSED',
      sdPauseReason: sameDirectionManager.getPauseReason(),
      imaginaryDirection: sameDirectionManager.getBetDirection(prevBlock),
    };
  }
}
```

### 7.3 With SessionRecorder

```typescript
// Add to LoggedPlay
interface LoggedPlay {
  // ... existing fields ...

  // NEW: SD State Machine snapshot
  sdStateSnapshot: {
    state: SDMachineState;
    remainingLife: number;
    accumulatedLoss: number;
    pauseReason: string | null;
    imaginaryPnL: number;
    realPnL: number;
  };

  // NEW: Trade type
  betType: 'REAL' | 'IMAGINARY' | 'NONE';
}
```

---

## 8. Edge Cases

### 8.1 Rapid Transitions

**Scenario:** Activate → Pause → Resume → Pause in quick succession

**Handling:**
- Each transition is logged with full context
- `resumeCount` tracks how many times we've resumed
- If `resumeCount > 3` in same activation cycle, consider reducing sensitivity

### 8.2 Pause During Activation Block

**Scenario:** Run completes with RunProfit ≥ 140, but the break block is also a high-PCT reversal

**Handling:**
- Activate first (T1)
- Immediately check for pause signals
- If high-PCT reversal detected, transition to PAUSED (T2)
- Net: INACTIVE → ACTIVE → PAUSED (two transitions logged)

### 8.3 ZZ/XAX Break During Pause

**Scenario:** SD is PAUSED (ZZ_XAX_TAKEOVER), ZZ loses

**Handling:**
- Trigger resume (T4) with reason "ZZ pattern broke"
- Resume to ACTIVE if life > 0
- If life = 0, transition to EXPIRED instead

### 8.4 Multiple Pause Reasons

**Scenario:** Both HIGH_PCT_REVERSAL and ZZ_XAX_TAKEOVER detected same block

**Handling:**
- Use first detected (HIGH_PCT_REVERSAL has priority)
- Log all signals for analysis
- Only one transition occurs

### 8.5 Resume Into Immediate Loss

**Scenario:** Resume on block N, block N+1 is high-PCT reversal loss

**Handling:**
- This is expected and OK
- Will pause again immediately
- The pause system is designed to be reactive

### 8.6 Life Exactly Zero

**Scenario:** After a loss, remainingLife = 0 exactly

**Handling:**
- Treat as EXPIRED (≤ 0 check)
- Cannot resume without new activation

### 8.7 Imaginary Tracking Overflow

**Scenario:** Paused for very long time, imaginary counters get large

**Handling:**
- No practical limit needed
- Counters reset on resume
- Log cumulative for analysis

---

## 9. Logging Requirements

### 9.1 State Transition Log

Every state transition MUST log:

```typescript
interface SDStateTransitionLog {
  timestamp: string;
  blockIndex: number;

  // Transition
  from: SDMachineState;
  to: SDMachineState;
  trigger: SDSignalType;
  reason: string;  // Human-readable

  // State at transition
  remainingLife: number;
  accumulatedLoss: number;
  realPnL: number;
  imaginaryPnL: number;

  // Additional context
  resumeCount?: number;
  pauseBlocksElapsed?: number;
  triggerData?: Record<string, any>;
}
```

### 9.2 Per-Block Log

Every block MUST log SD state:

```typescript
interface PerBlockSDLog {
  blockIndex: number;
  sdState: SDMachineState;
  remainingLife: number;
  wouldBet: boolean;
  actuallyBet: boolean;
  betDirection: Direction | null;
  imaginaryOutcome?: {
    direction: Direction;
    isWin: boolean;
    pct: number;
    cumulativeImaginaryPnL: number;
  };
}
```

### 9.3 Signal Log

Log all detected signals (even if no transition):

```typescript
interface SDSignalLog {
  blockIndex: number;
  signals: SDSignal[];
  transitionTriggered: boolean;
}
```

---

## 10. Testing Plan

### 10.1 Unit Tests

| Test | Description | Expected |
|------|-------------|----------|
| `test_activation` | RunProfit 140 → ACTIVE | State = ACTIVE, life = 140 |
| `test_high_pct_pause` | 60% reversal loss | State = PAUSED, life preserved |
| `test_resume_3_wins` | 3 imaginary wins | State = ACTIVE |
| `test_no_resume_zero_life` | Resume attempt with life=0 | State = EXPIRED |
| `test_life_decay` | Real loss 50% | Life decreased by 50 |
| `test_imaginary_no_decay` | Imaginary loss 50% | Life unchanged |
| `test_big_win_reset` | Win > accumulatedLoss | Life = 140, accLoss = 0 |
| `test_zz_break_resume` | ZZ loses while PAUSED | State = ACTIVE |

### 10.2 Integration Tests

| Test | Description | Expected |
|------|-------------|----------|
| `test_hierarchy_paused` | SD PAUSED, check hierarchy | shouldBet = false |
| `test_imaginary_tracking` | PAUSED, track outcomes | Imaginary counters updated |
| `test_session_logging` | Full session replay | All logs present |

### 10.3 Replay Tests

Using existing sessions:
- `session_2025-12-24T18-19-24-936Z.json` (fake activation trap)
- `session_2025-12-24T18-57-18-606Z.json` (long run success)
- `session_2025-12-25T14-28-57-799Z.json` (high-PCT reversal massacre)

| Test | Expected |
|------|----------|
| Dec 25 session with pause | SD PnL improves from -550 to ~+72 |
| Dec 24 session 1 | Fewer false deactivations |
| Determinism | Same input → same output |

---

## 11. Rollout Plan

### Phase 1: Logging Only (Week 1)
- Implement SDStateMachine
- Implement SDSignalDetector
- Add to SameDirectionManager (observe only)
- Log what SM would do
- **No behavior change**

### Phase 2: Imaginary Tracking (Week 2)
- Enable imaginary outcome tracking
- Compare real outcomes vs what pause would have done
- Validate improvements match simulation
- **No behavior change**

### Phase 3: Pause Enable (Week 3)
- Enable actual pause/resume
- Start with conservative thresholds (70%)
- Monitor closely
- **Behavior change - reversible**

### Phase 4: Tuning (Ongoing)
- Adjust thresholds based on data
- Add/remove pause triggers
- Optimize resume conditions

---

## 12. Success Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| SD Win Rate | 54% | 60%+ | Per-session |
| False Deactivation Count | ~1/session | 0 | Detection algorithm |
| Long Flow Capture Rate | 33% | 70%+ | Analysis agent |
| Max Drawdown | 1250 (Dec 25) | <500 | Per-session |
| SD PnL Contribution | Negative | Positive | Per-session |

---

## 13. Open Questions

1. **Should bucket bet while SD is paused?**
   - Current: No (maintain hierarchy)
   - Alternative: Yes (don't waste opportunities)
   - Need data to decide

2. **Maximum pause duration?**
   - Current: None (only resume on conditions)
   - Alternative: Force resume after N blocks
   - Risk: Resuming into bad conditions

3. **Should we decay life over time even while ACTIVE?**
   - Current: No (only on losses)
   - Alternative: Slow passive decay (1 per 10 blocks)
   - Rationale: Old activations become stale

4. **How to handle Ante system?**
   - Not addressed in this spec
   - May need separate coordination

---

## 14. Appendix

### A. Type Definitions

```typescript
type SDMachineState = 'INACTIVE' | 'ACTIVE' | 'PAUSED' | 'EXPIRED';

type SDPauseReason =
  | 'HIGH_PCT_REVERSAL'
  | 'CONSECUTIVE_REVERSALS'
  | 'ZZ_XAX_TAKEOVER'
  | 'CONSECUTIVE_LOSSES';

type SDSignalType =
  | 'ACTIVATION'
  | 'HIGH_PCT_REVERSAL'
  | 'ZZ_XAX_TAKEOVER'
  | 'ZZ_XAX_BREAK'
  | 'CONSECUTIVE_IMG_WINS'
  | 'IMAGINARY_PROFIT'
  | 'LIFE_EXHAUSTED'
  | 'RESUME'
  | 'EXPIRE';

interface SDSignal {
  type: SDSignalType;
  blockIndex: number;
  data: Record<string, any>;
  timestamp: string;
}

interface SDConfig {
  highPctThreshold: number;
  consecutiveWinsResume: number;
  imaginaryProfitResume: number;
  initialLife: number;
  decayPerLoss: number;
  pauseLifePreservation: boolean;
  allowBucketDuringPause: boolean;
  maxPauseBlocks: number | null;
}
```

### B. Example Trace (Dec 25 Session)

```
Block 015: INACTIVE → ACTIVE    (RunProfit 155)
Block 015: ACTIVE   → PAUSED    (85% reversal, life=140)
Block 143: PAUSED   → ACTIVE    (3 consecutive wins, life=140)
Block 144: ACTIVE   bet WIN     +148
Block 145: ACTIVE   bet LOSS    -112
Block 146: ACTIVE   bet LOSS    -90
Block 150: ACTIVE   bet LOSS    -16
Block 151: ACTIVE   → PAUSED    (76% reversal, life=82)
Block 155: PAUSED   imaginary   WIN +106
Block 156: PAUSED   imaginary   LOSS -118
Block 157: PAUSED   imaginary   LOSS -84
... (stays paused, avoiding losses) ...
Block 177: PAUSED   imaginary   WIN +172
Block 178: PAUSED   imaginary   WIN +54
Block 179: PAUSED   → ACTIVE    (3 consecutive wins, life=82)
Block 180: ACTIVE   bet WIN     +80
Block 181: ACTIVE   → PAUSED    (100% reversal, life=82)
... (avoids -200 killer trade) ...
```

---

**End of Specification**
