# Ghost Evaluator - Deep Pattern Rules Analysis

## System Overview

The system has 3 buckets: WAITING, MAIN, B&S (Bait & Switch)

### BUCKET TRANSITIONS - COMPLETE SPECIFICATION

#### WAITING Bucket
- Pattern is observing, not betting
- Accumulates `cumulativeProfit` toward activation threshold

**Exit conditions:**
- → MAIN: When activation threshold met (70% single OR 100% cumulative)

#### MAIN Bucket
- Pattern is active, betting normal direction
- Tracks `lastRunProfit` (net of all trades during run)

**Exit conditions:**
- → WAITING: Pattern breaks/kills with `breakRunProfit > -70%`
- → B&S: Pattern breaks/kills with `breakRunProfit <= -70%`

#### B&S Bucket
- Pattern is active, betting INVERSE direction
- Must first confirm BAIT (same as activation: 70% single OR 100% cumulative)
- After bait confirmed, play SWITCH (inverse bet)

**Exit conditions:**
- → WAITING: Kill condition triggered (pattern-specific)
- → WAITING: Switch loss < 70%
- → WAITING: 2+ consecutive opposite pattern wins
- → MAIN: Switch loss >= 70% (B&S strategy invalidated, flip back to normal)
- Stay B&S: Switch win (wait for next bait)

---

## PROFIT TYPES - COMPLETE SPECIFICATION

### All Profit Fields in PatternCycle

| Field | Purpose | When Updated | When Reset | Used For |
|-------|---------|--------------|------------|----------|
| `cumulativeProfit` | Accumulation during OBSERVATION phase | Each observation result | On break, on activation | Activation threshold check (100%) |
| `lastRunProfit` | Net profit during ACTIVE phase | Each active result (starts at 0) | On break | Track current run performance |
| `breakRunProfit` | Snapshot of lastRunProfit at break time | On break (BEFORE lastRunProfit reset) | Never (preserved until next break) | -70% bucket decision |
| `breakLoss` | The single loss that caused break | On break | Never | Analysis only (not used for bucket) |
| `allTimeProfit` | Historical total across all runs | Every result | Never | Statistics display |
| `observationResults` | Array of results during observation | Each observation result | On break | Check if any single >= 70% |
| `activeResults` | Array of results during active phase | Each active result | On break | Track trades made |

### BUGS FIXED (v15.2.2)

**BUG 1:** OZ and AP5 do NOT properly transfer `lastRunProfit` to `breakRunProfit` on break.
- This means -70% bucket decision fails for these patterns.
- **FIXED:** Added `cycle.breakRunProfit = cycle.lastRunProfit` in `breakOZPattern()` and `breakAP5Pattern()`.

**BUG 2:** PP, ST, OZ, AP5 set `lastRunProfit = confirmationProfit` instead of `lastRunProfit = 0`.
- This makes them inconsistent with standard patterns.
- **FIXED:** All patterns now use `lastRunProfit = 0` on activation.

### Profit Accumulation Rules (CORRECT - All Patterns Should Follow)

#### Phase 1: OBSERVATION (state = 'observing')

```
On each observation result:
  if (profit >= 0):
    cumulativeProfit += profit    // Accumulate positive profits
  else:
    cumulativeProfit = 0          // ANY negative resets to zero
```

**Key Point:** A single loss during observation resets cumulative to 0. Pattern must see consecutive profitable observations to reach threshold.

#### Phase 2: ACTIVATION (transition to 'active')

**CORRECT (all patterns should use this):**
```
if (threshold met - 70% single OR 100% cumulative):
  state = 'active'
  lastRunProfit = 0    // Run starts at 0, NOT confirmation profit
```

**Previously incorrect in PP, ST, OZ, AP5 (NOW FIXED):**
```
// Was wrong - these patterns used to do:
lastRunProfit = confirmationProfit    // Now correctly set to 0
```

#### Phase 3: ACTIVE (state = 'active')

```
On each active result:
  lastRunProfit += profit    // Simply add (can go negative)
  activeResults.push(result)
```

#### Phase 4: BREAK (transition to 'observing')

```
breakRunProfit = lastRunProfit    // PRESERVE before reset (critical!)
wasKilled = true/false            // Set based on break type
lastRunProfit = 0                 // Reset for next run
cumulativeProfit = 0              // Reset for re-observation
observationResults = []
activeResults = []
state = 'observing'
```

### Profit Flow Example (PP - CORRECT PATTERN SEQUENCE)

PP Pattern: `1-2-1-2` (single-double-single-double)
```
Block 1: G 65%   → Run=1 (single), PP observing
                   Confirmation check: currentLength=1, previousLength=?
                   Not confirmation block yet (need double after single)

Block 2: R 70%   → Run=1 (single), switches direction
Block 3: R 72%   → Run=2 (double), PP confirmation check!
                   currentLength=2, previousRunLength=1 ✓
                   Check 1st block of double (Block 2): 70%
                   70% >= 70% threshold → ACTIVATE
                   lastRunProfit = 0 (CORRECT)

Block 4: G (single) → PP signal raised! Predict: R (1st of next double)
Block 5: R 75%   → PP prediction correct, profit = +75%
                   lastRunProfit = 0 + 75 = +75%

Block 6: R 80%   → Run=2 (double complete)
Block 7: G (single) → PP signal raised! Predict: R
Block 8: R 60%   → PP prediction correct, profit = +60%
                   lastRunProfit = 75 + 60 = +135%

Block 9: R 70%   → Run=3! PP KILL (3+ run)
                   breakRunProfit = +135%
                   +135% > -70% → WAITING
```

---

## PP (Ping Pong)

### Pattern Rhythm
Single-double alternation: `1-2-1-2-1-2`
Example: `G RR G RR G RR`

### Detection (detector.ts:407-433)
- Only raises signals when **already active** (`isActive = true`)
- Requires L2 = 2 (previous double) AND L1 = 1 (current single)
- Predicts flip back to prior direction (1st block of next double)

### Activation (lifecycle.ts:478-505)
- Triggered by `confirmPPPattern(firstBlockProfit)` in state.ts:155-169
- Condition: `currentLength === 2` AND `previousRunLength === 1`
- Checks 1st block of the double (index - 1) for profit

**Profit Accumulation (Observation Phase):**
```
if (firstBlockProfit >= 0):
  cumulativeProfit += firstBlockProfit   // Accumulate positive
else:
  cumulativeProfit = 0                    // Reset on ANY negative
```

**Activation Check:**
```
if (firstBlockProfit >= 70% OR cumulativeProfit >= 100%):
  state = 'active'
  lastRunProfit = 0   // CORRECT: Start at 0, not confirmation profit
```

**FIXED in lifecycle.ts confirmPPPattern():**
```typescript
// Now correctly sets:
cycle.lastRunProfit = 0;  // Run starts at 0, not confirmation profit
```

### Signal Generation
- After double (2), on single (1), predict opposite (flip back)

### MAIN Break (loss-based)
- Handled by `applyResult()` in lifecycle.ts:196-207
- Any loss during active phase triggers break
- `breakRunProfit` = net of all trades during active phase (preserved before reset)

### MAIN Kill (structural) - state.ts:175-189

**Condition 1:** Run reaches 3+ (exits PP rhythm)
```
if (currentLength >= 3) → breakPPPattern()
```

**Condition 2:** Two singles in a row (rhythm broken)
```
if (currentLength === 1 AND previousRunLength === 1) → kill
// Two singles in a row = expected double after single, PP rhythm broken
```

**FIXED in state.ts:**
```typescript
if (previousRunLength === 1) {
  // Previous was single, current is single = two singles in a row
  // PP rhythm broken (expected double after single)
  console.log(`[State] PP broken - two singles in a row (rhythm broken)`);
  this.lifecycle.breakPPPattern();
}
```

### breakPPPattern() - lifecycle.ts:515-533
- Sets `wasKilled = true` (structural kill marker)
- Preserves `breakRunProfit = lastRunProfit` BEFORE reset
- Resets: state→observing, results→[], cumulative→0, lastRunProfit→0

### B&S Entry
- If `breakRunProfit <= -70`: Enter B&S via `enterBnsMode()`
- If `breakRunProfit > -70`: Go to WAITING

### B&S Kill Conditions - bucket-manager.ts:835-881

**Kill 1:** Run exceeds 2 (reaches 3+) - no switch opportunity
```
if (currentRunLength >= 3) → kill
```

**Kill 2:** Two singles in a row (PP rhythm broken)
```
if (currentRunLength === 1 AND previousRunLength === 1) → kill
// Two singles in a row = rhythm broken (expected double after single)
```

**FIXED in bucket-manager.ts:**
```typescript
// Kill Condition 2: Two singles in a row (1-1) - PP rhythm broken
if (currentRunLength === 1 && previousRunLength === 1) {
  return {
    shouldKill: true,
    reason: `Two singles in a row - PP rhythm broken (expected double after single)`,
  };
}
```

### B&S Exit
- Kill → WAITING (via `killPPInBns()`)
- Switch win → Stay B&S (wait for next bait)
- Switch loss < 70% → WAITING
- Switch loss >= 70% → MAIN (B&S invalidated)

---

## ST (Switch Twin)

### Pattern Rhythm
Double-double alternation: `2-2-2-2`
Example: `GG RR GG RR`

### Detection (detector.ts:449-477)
- Only raises signals when **already active**
- Requires L2 = 2 (previous double) AND L1 = 1 (just flipped)
- Predicts 2nd block of continuation (same direction)

### Activation (lifecycle.ts:542-569)
- Triggered by `confirmSTPattern(secondBlockProfit)` in state.ts:191-201
- Condition: `currentLength === 2` AND `previousRunLength >= 2`
- Checks 2nd block of current double (current block) for profit
- Same accumulation rules as PP (70% single or 100% cumulative)

**FIXED in lifecycle.ts confirmSTPattern():**
```typescript
// Now correctly sets:
cycle.lastRunProfit = 0;  // Run starts at 0, not confirmation profit
```

### Signal Generation
- After double (2), on flip (1), predict 2nd block continues same direction

### MAIN Break (loss-based)
- Same as PP - handled by `applyResult()`

### MAIN Kill (structural) - state.ts:203-207

**Condition:** Run reaches 3+ (exits 2A2 rhythm)
```
if (currentLength >= 3) → breakSTPattern()
```

### breakSTPattern() - lifecycle.ts:579-597
- Sets `wasKilled = true`
- Preserves `breakRunProfit = lastRunProfit`
- Resets to observing

### B&S State (STBnsState) - IMPLEMENTED in v15.2.1

```typescript
interface STBnsState {
  waitingForFirstFlip: boolean;  // Wait for first flip after entering B&S
  lastSwitchBlock: number;       // Block index when last switch was played
}
```

### B&S Kill Conditions - bucket-manager.ts

**Kill:** Run reaches 3+ (exits 2A2 rhythm)
```typescript
if (currentRunLength >= 3) {
  return {
    shouldKill: true,
    reason: `Run reached ${currentRunLength} - exited 2A2 rhythm`,
  };
}
```

ST B&S kill check is called in reaction.ts processBlock():
```typescript
// === ST B&S KILL CHECK ===
const stKillCheck = this.bucketManager.checkSTBnsKillConditions(
  runData.currentLength,
  previousRunLength,
  isFlip,
  blockResult.block.index
);
if (stKillCheck?.shouldKill) {
  this.bucketManager.killSTInBns(blockResult.block.index, stKillCheck.reason);
}
```

---

## OZ (Opposite Zone)

### Pattern Rhythm
3+ run → single → 3+ flip back
Example: `GGG R GGG R GGG`

### Detection (detector.ts:233-259)
- Only raises signals when **already active**
- Requires L1 = 1 (current is single)
- Predicts flip back to prior direction

### Activation (lifecycle.ts:419-446)
- Triggered by `confirmOZPattern(firstBlockProfit)` in state.ts:127-141
- Condition: `currentLength === 3` AND `previousRunLength === 1`
- Checks 1st block of flip back (index - 2) for profit

**FIXED in lifecycle.ts confirmOZPattern():**
```typescript
// Now correctly sets:
cycle.lastRunProfit = 0;  // Run starts at 0, not confirmation profit
```

### MAIN Break - state.ts:143-153
- When flip happens (currentLength === 1)
- If previousRunLength < 3: `breakOZPattern()`

**FIXED in lifecycle.ts breakOZPattern():**
```typescript
// Now correctly preserves profit before reset:
cycle.breakRunProfit = cycle.lastRunProfit;
cycle.wasKilled = true;
console.log(`[Lifecycle] OZ killed (flip back < 3 blocks) - breakRunProfit=${cycle.breakRunProfit.toFixed(0)}%`);
```

### B&S State (OZBnsState) - bucket-manager.ts:70-79
```typescript
interface OZBnsState {
  waitingForFirstFlip: boolean;
  waitingForSingle: boolean;   // Waiting for bait (single)
  baitConfirmed: boolean;      // Single seen, waiting for flip back >= 3
  lastSwitchBlock: number;
}
```

### B&S Kill Conditions - bucket-manager.ts:597-640

**Kill 1:** Expected single (bait), got 2+ (no bait)
```
if (waitingForSingle AND currentRunLength >= 2) → kill
```

**Kill 2:** After bait (single), flip back < 3
```
if (baitConfirmed AND isFlip AND previousRunLength < 3) → kill
```

**Success:** After bait, flip back >= 3
```
if (baitConfirmed AND isFlip AND previousRunLength >= 3) → reset to waitingForSingle
```

---

## AP5 (After Point 5)

### Pattern Rhythm
2+ setup → 3+ opposite → play on flip
Play the 2nd block of continuation after 3+ runs

### Detection (detector.ts:180-208)
- Only raises signals when **already active**
- Requires L2 >= 3 (previous 3+ run) AND L1 = 1 (just flipped)
- Predicts 2nd block continues same direction

### Activation (lifecycle.ts:357-384)
- Triggered by `confirmAP5Pattern(secondBlockProfit)` in state.ts:100-113
- Condition: `currentLength === 3` AND `previousRunLength >= 2`
- Checks 2nd block of current run for profit

**FIXED in lifecycle.ts confirmAP5Pattern():**
```typescript
// Now correctly sets:
cycle.lastRunProfit = 0;  // Run starts at 0, not confirmation profit
```

### MAIN Kill - state.ts:115-125
- When flip happens with previous run <= 2 blocks: `breakAP5Pattern()`

**FIXED in lifecycle.ts breakAP5Pattern():**
```typescript
// Now correctly preserves profit before reset:
cycle.breakRunProfit = cycle.lastRunProfit;
cycle.wasKilled = true;
console.log(`[Lifecycle] AP5 killed (flip back <= 2 blocks) - breakRunProfit=${cycle.breakRunProfit.toFixed(0)}%`);
```

### B&S State (AP5BnsState) - bucket-manager.ts:90-103
```typescript
interface AP5BnsState {
  waitingForFirstFlip: boolean;
  waitingForSetup: boolean;       // Waiting for 2+ same direction
  waitingForBait: boolean;        // Waiting for 3+ opposite
  baitConfirmed: boolean;         // 3+ opposite seen
  currentMonitoredRunLength: number;
  lastSwitchBlock: number;
}
```

### B&S Kill Conditions - bucket-manager.ts:699-776

**Kill 1:** Expected 3+ opposite (bait), but flipped before reaching 3
```
if (waitingForBait AND isFlip AND previousRunLength < 3) → kill
```

**Kill 2:** After bait (3+ opposite), flip back < 3
```
if (baitConfirmed AND isFlip AND previousRunLength < 3) → kill
```

---

## Pattern Relationships

### Opposite Pairs
- OZ ↔ AP5
- ST ↔ PP
- 2A2 ↔ Anti2A2
- ZZ ↔ AntiZZ (special - managed by ZZStateManager)

### Blocking Rule
- Only ONE pattern from a pair can be in B&S at a time
- When pattern enters B&S, opposite is BLOCKED
- Blocked pattern still accumulates profit for when unblocked

---

## SUMMARY OF ALL FIXES - IMPLEMENTED in v15.2.2

### Fix 1: Standardize lastRunProfit on Activation ✓
All patterns now use `lastRunProfit = 0` on activation.
- **lifecycle.ts confirmPPPattern():** ✓ Changed to `lastRunProfit = 0`
- **lifecycle.ts confirmSTPattern():** ✓ Changed to `lastRunProfit = 0`
- **lifecycle.ts confirmOZPattern():** ✓ Changed to `lastRunProfit = 0`
- **lifecycle.ts confirmAP5Pattern():** ✓ Changed to `lastRunProfit = 0`

### Fix 2: OZ breakRunProfit Transfer ✓
**lifecycle.ts breakOZPattern():** ✓ Added `cycle.breakRunProfit = cycle.lastRunProfit` before reset.

### Fix 3: AP5 breakRunProfit Transfer ✓
**lifecycle.ts breakAP5Pattern():** ✓ Added `cycle.breakRunProfit = cycle.lastRunProfit` before reset.

### Fix 4: PP MAIN Kill Condition 2 ✓
**state.ts:** ✓ Changed `previousRunLength >= 2` to `previousRunLength === 1`
Two singles in a row now correctly triggers kill.

### Fix 5: PP B&S Kill Condition 2 ✓
**bucket-manager.ts:** ✓ Changed to check `currentRunLength === 1 AND previousRunLength === 1`
Two singles in a row now correctly triggers kill in B&S.

### Fix 6: Add ST B&S Kill Conditions ✓
- ✓ Added `STBnsState` interface
- ✓ Added `initializeSTBnsState()` method
- ✓ Added `checkSTBnsKillConditions()` method
- ✓ Added `killSTInBns()` method
- ✓ Added `getSTBnsState()` method
- ✓ Added `resetSTBnsState()` method
- ✓ Added kill check in reaction.ts processBlock()
- ✓ Updated enterBnsMode() to initialize ST state
- ✓ Updated reset() to clear ST state

### Fix 7: AP5/OZ Structural Break Timing ✓
**state.ts:** ✓ Moved AP5 BREAK and OZ BREAK checks to AFTER `evaluatePendingSignals()`
- Previously, structural breaks happened BEFORE bet results were evaluated
- This meant `breakRunProfit` didn't include the current block's loss
- Now bet losses are counted before `breakRunProfit` is captured
- Enables AP5/OZ to properly enter B&S when losing >= 70%

### Fix 8: markSwitchCompleted() Pattern State Sync ✓
**bucket-manager.ts:** ✓ Updated `markSwitchCompleted()` to sync pattern-specific B&S state
- For OZ: Sets `baitConfirmed = false`, `waitingForSingle = true`
- For AP5: Sets `baitConfirmed = false`, `waitingForSetup = true`
- The flip after switch IS the next bait, so state is ready to detect it
- Prevents patterns from being stuck in stale bait-confirmed state

### Fix 9: markSwitchCompleted() lastSwitchBlock Update ✓
**bucket-manager.ts:** ✓ Updated `markSwitchCompleted()` to set `lastSwitchBlock = blockIndex`
- Kill checks use `lastSwitchBlock` to skip blocks on/before switch
- Without this, patterns were being killed immediately after switch win
- Now applies to OZ, AP5, PP, and ST
- Also resets `switchPlayed = false` for next cycle

---

## Key Code Paths

### Pattern Activation Flow
1. state.ts: Block added, run updated
2. state.ts: Check confirmation conditions (e.g., currentLength === 2)
3. lifecycle.ts: `confirmXXPattern()` called with profit
4. lifecycle.ts: Accumulation rules applied
5. lifecycle.ts: If threshold met, `state = 'active'`, `lastRunProfit = 0`

### Pattern Break/Kill Flow
1. state.ts: Block added, run updated
2. state.ts: Pattern confirmations checked (PP, ST, OZ, AP5)
3. state.ts: PP/ST structural kills checked (before evaluation - they don't need bet loss)
4. state.ts: Signals detected, pending signals updated
5. state.ts: `evaluatePendingSignals()` - bet results applied to `lastRunProfit`
6. state.ts: **AP5/OZ structural kills checked (AFTER evaluation - so bet losses are counted)**
7. lifecycle.ts: `breakXXPattern()` called → `breakRunProfit = lastRunProfit`, `wasKilled = true`
8. reaction.ts: `processBlock()` called
9. bucket-manager.ts: `updateFromLifecycle()` reads cycle state
10. bucket-manager.ts: If `breakRunProfit <= -70%` → `enterBnsMode()`

### B&S Kill Flow
1. reaction.ts: After lifecycle update
2. reaction.ts: Get runData, calculate isFlip
3. bucket-manager.ts: `checkXXBnsKillConditions()` called
4. bucket-manager.ts: If shouldKill → `killXXInBns()`
5. bucket-manager.ts: `exitBnsToWaiting()` called

### B&S Switch Completion Flow
1. Pattern in B&S, bait confirmed, switch signal raised
2. reaction.ts: `markSwitchStarted()` called → `bnsState.switchPlayed = true`
3. Next block: Switch bet evaluated
4. reaction.ts: `markSwitchCompleted()` called with result
5. bucket-manager.ts: `markSwitchCompleted()`:
   - Resets `bnsState.baitConfirmed = false`
   - Resets `bnsState.switchPlayed = false`
   - Syncs pattern-specific state (e.g., `ozBnsState.waitingForSingle = true`)
   - Updates `lastSwitchBlock = blockIndex` (skip kill checks for this block)
6. bucket-manager.ts: `updateFromLifecycle()` sees pattern broke:
   - If switch won (`runProfit >= 0`) → stay in B&S, wait for next bait
   - If switch lost small (`runProfit > -70%`) → exit to WAITING
   - If switch lost big (`runProfit <= -70%`) → exit to MAIN (B&S invalidated)

---

## Critical Edge Cases

1. **wasKilled flag**: Must be set for structural kills so bucket-manager knows it wasn't a bet loss

2. **breakRunProfit preservation**: MUST be saved BEFORE resetting lastRunProfit in break methods

3. **Opposite blocking**: When entering B&S, must block opposite to prevent both being in B&S

4. **B&S state initialization**: Must call `initializeXXBnsState()` when entering B&S

5. **Signal isBnsInverse flag**: Must mark signals as inverse for correct profit calculation in B&S

6. **AP5/OZ structural break timing**: Must happen AFTER `evaluatePendingSignals()` so bet losses are counted in `breakRunProfit`

7. **lastSwitchBlock update**: Must update `lastSwitchBlock` in `markSwitchCompleted()` so kill checks skip the switch result block

8. **Pattern state sync after switch**: Must sync pattern-specific state (e.g., `waitingForSingle`) in `markSwitchCompleted()` so next bait detection works
