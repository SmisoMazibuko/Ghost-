# Evaluator Rulebook — Aligned with v15.1 (Fixed)

## 1. Introduction

### 1.1 Purpose

The Ghost Manual Evaluator is a system that:

1. Receives **blocks** (direction + percentage + timestamp).
2. Detects **patterns** forming in the sequence of blocks.
3. Tracks each pattern through a **lifecycle** (observing → active → broken).
4. Determines when the session is **playable** (has active patterns) or **unplayable** (no active patterns or P1 mode).
5. Generates **predictions** and places **auto-bets** only when patterns are in the **active** state.
6. Calculates **profit** based on actual bet outcomes.

### 1.2 Core Concepts

| Term | Definition |
|------|------------|
| **Block** | A single data point with direction (Up/Down), percentage (0-100), and timestamp. |
| **Run** | A sequence of consecutive blocks in the same direction. Run length = number of consecutive same-direction blocks. |
| **Pattern** | A specific formation detected in the block/run sequence that predicts the next block's direction. |
| **Session** | The current evaluation period. Ends when daily target is reached or manually cleared. |
| **Observation Phase** | Pattern is being tracked but NO bets are placed. Results are recorded to determine profitability. |
| **Active Phase** | Pattern has proven profitable. Auto-bets ARE placed when the pattern forms. |
| **Broken State** | Pattern lost while active. Immediately transitions to observation phase. |

---

## 2. Global Parameters

These values are defined in the `CFG` object and govern system behavior:

| Parameter | Type | Default Value | Description |
|-----------|------|---------------|-------------|
| `neutral_band` | float | 0.05 | Band around 50% where predictions are considered "neutral" (45%-55%). |
| `daily_target` | int | 2000 | Target profit in Rands. Session ends when reached. |
| `bet_amount` | int | 200 | Fixed stake per bet in Rands. |
| `single_profit_threshold` | int | 70 | A single observation result ≥70% activates the pattern. |
| `cumulative_profit_threshold` | int | 100 | Cumulative observation profit ≥100% activates the pattern. |
| `p1_consecutive_threshold` | int | 7 | Number of consecutive same-direction blocks to trigger P1 Mode. |

---

## 3. Block Structure

Each block consists of:

| Field | Type | Description |
|-------|------|-------------|
| `dir` | int | Direction: `+1` = Up (Green), `-1` = Down (Red) |
| `pct` | float | Percentage strength (0-100) |
| `ts` | string | ISO timestamp of when block was added |

Blocks form a sequence. The system maintains:
- `blocks[]` — Array of all blocks in order.
- `runLens[]` — Array of run lengths (each entry = length of that run).
- `runDirs[]` — Array of run directions (each entry = direction of that run).
- `currentRunLen` — Length of the current (latest) run.
- `currentRunDir` — Direction of the current run.

---

## 4. Pattern Definitions

### 4.1 Patterns List

The system recognizes exactly **12 patterns**:

```
["2A2", "Anti2A2", "3A3", "Anti3A3", "4A4", "5A5", "AP5", "OZ", "ZZ", "AntiZZ", "PP", "ST"]
```

### 4.2 Continuous vs Single-Shot Patterns

| Type | Patterns | Behavior |
|------|----------|----------|
| **Continuous** | `ZZ`, `AntiZZ`, `PP`, `ST` | Pattern can form repeatedly. Breaks on any loss while active. |
| **Single-Shot** | All others | Pattern forms once per trigger. Breaks on loss while active. |

**Note:** PP and ST have no "Anti" versions. When their rhythm breaks, the system falls back to 2A2 which remains active independently.

### 4.3 Pattern Detection Rules

#### 4.3.1 Run-Based Patterns (2A2, Anti2A2, 3A3, Anti3A3, 4A4, 5A5)

These patterns trigger when the current run reaches a specific length:

| Pattern | Trigger Condition | Prediction Direction |
|---------|-------------------|---------------------|
| **2A2** | `runLen === 2` | Opposite of run direction (`-runDir`) |
| **Anti2A2** | `runLen === 2` | Same as run direction (`+runDir`) |
| **3A3** | `runLen === 3` | Opposite of run direction (`-runDir`) |
| **Anti3A3** | `runLen === 3` | Same as run direction (`+runDir`) |
| **4A4** | `runLen === 4` | Opposite of run direction (`-runDir`) |
| **5A5** | `runLen === 5` | Opposite of run direction (`-runDir`) |

**Example:**
- Blocks: `G → G` (run of 2 Greens)
- Triggers: `2A2` predicts Red, `Anti2A2` predicts Green

#### 4.3.2 AP5 and OZ Patterns

Both trigger under the **same condition**: previous run ≥3 blocks, followed by current run = 1 block (direction change).

| Pattern | Trigger Condition | Prediction Direction |
|---------|-------------------|---------------------|
| **AP5** | `prevRunLen >= 3 AND currRunLen === 1` | Same as current run (`currDir`) — continuation of new direction |
| **OZ** | `prevRunLen >= 3 AND currRunLen === 1` | Opposite of current run (`-currDir`) — return to original direction |

**Example:**
- Blocks: `G → G → G → R` (run of 3 Greens, then 1 Red)
- Triggers: `AP5` predicts Red (continue new), `OZ` predicts Green (return to old)

#### 4.3.3 ZZ and AntiZZ Patterns

Detect **indicator followed by alternation** — a run of 3+ blocks (indicator) followed by 2 alternating single blocks.

| Pattern | Trigger Condition | Prediction Direction |
|---------|-------------------|---------------------|
| **ZZ** | `L3 >= 3 AND L2 === 1 AND L1 === 1` | Return to indicator direction (`indicatorDir`) |
| **AntiZZ** | `L3 >= 3 AND L2 === 1 AND L1 === 1` | Continue alternation (`-indicatorDir`) |

Where:
- `L3` = Indicator run (must be ≥3 blocks)
- `L2` = First alternation (must be 1 block)
- `L1` = Second alternation (must be 1 block, current run)
- `indicatorDir` = Direction of the indicator run (L3)

**Example:**
- Blocks: `G G G G R G R` (run of 4 Greens = indicator, then R-G-R alternation)
- Run lengths: `[4, 1, 1]` where L3=4, L2=1, L1=1
- Indicator direction: G (Green)
- Triggers: `ZZ` predicts **G** (return to indicator), `AntiZZ` predicts **R** (continue alternation)

**Visual:**
```
G  G  G  G  R  G  R  [?]
├────────┤  │  │  │
Indicator   │  │  └── L1 = 1 (current)
  (L3=4)    │  └───── L2 = 1
            └──────── Break from indicator

ZZ plays: G (return to indicator)
AntiZZ plays: R (continue alternation)
```

#### 4.3.4 PP Pattern (Ping-Pong)

Detect **indicator followed by 1-2-1-2 rhythm** — run of 3+ blocks, then alternating singles and doubles.

| Pattern | Trigger Condition | Prediction Direction |
|---------|-------------------|---------------------|
| **PP** | `L5 >= 3 AND L4 === 1 AND L3 === 2 AND L2 === 1 AND L1 === 2` | Opposite direction (continue rhythm) |

Where:
- `L5` = Indicator run (must be ≥3 blocks)
- `L4` = First single after indicator (must be 1)
- `L3` = First double (must be 2)
- `L2` = Second single (must be 1)
- `L1` = Second double / current run (must be 2)

**Example:**
- Blocks: `GGGG R GG R GG` (indicator + 1-2-1-2 rhythm)
- Run lengths: `[4, 1, 2, 1, 2]`
- Triggers: `PP` predicts **R** (continue ping-pong rhythm)

**Visual:**
```
G  G  G  G  R  G  G  R  G  G  [?]
├────────┤  │  ├──┤  │  ├──┤
 Indicator  1    2   1    2   ← PP plays R (continue rhythm)
   (L5=4)   ↑
            First R is ZZ/2A2 territory

PP plays: R (continue the ping-pong)
```

**Note:** PP has no "Anti" version. When rhythm breaks, fall back to 2A2.

#### 4.3.5 ST Pattern (Street)

Detect **indicator followed by 2-2-2 rhythm** — run of 3+ blocks, then all doubles.

| Pattern | Trigger Condition | Prediction Direction |
|---------|-------------------|---------------------|
| **ST** | `L4 >= 3 AND L3 === 2 AND L2 === 2 AND L1 === 2` | Opposite direction (new double) |

Where:
- `L4` = Indicator run (must be ≥3 blocks)
- `L3` = First double after indicator (must be 2) — **This is 2A2 territory**
- `L2` = Second double (must be 2)
- `L1` = Third double / current run (must be 2)

**Example:**
- Blocks: `GGGGG RR GG RR` (indicator + 2-2-2 rhythm)
- Run lengths: `[5, 2, 2, 2]`
- Triggers: `ST` predicts **G** (continue with new double)

**Visual:**
```
G  G  G  G  G  R  R  G  G  R  R  [?]
├──────────┤  ├──┤  ├──┤  ├──┤
  Indicator     2     2     2   ← ST plays G (new double)
    (L4=5)      ↑
                First RR is 2A2 territory

ST plays: G (switch to new double, continue rhythm)
```

**Note:** ST has no "Anti" version. When rhythm breaks, fall back to 2A2.

---

## 5. Pattern Lifecycle (Observation → Active → Broken)

### 5.1 States

Each pattern maintains a **cycle state**:

| State | Description | Betting |
|-------|-------------|---------|
| `observing` | Pattern is being tracked. Results recorded but no bets placed. | NO |
| `active` | Pattern has proven profitable. Auto-bets are placed. | YES |
| `broken` | Pattern lost while active. Immediately transitions to `observing`. | — |

### 5.2 Initial State

All patterns start in `observing` state.

### 5.3 Activation Rules (Observing → Active)

A pattern transitions from `observing` to `active` when **EITHER**:

1. **Single profit threshold:** Any single observation result has profit ≥ `single_profit_threshold` (default: 70%)
2. **Cumulative profit threshold:** Total cumulative profit during observation ≥ `cumulative_profit_threshold` (default: 100%)

```
shouldActivate = hasSingle70 OR hasCumulative100
```

### 5.4 Break Rules (Active → Observing)

A pattern transitions from `active` back to `observing` when:

1. **Continuous patterns (ZZ, AntiZZ):** ANY loss while active triggers break.
2. **Single-shot patterns (all others):** Loss on the evaluated result triggers break.

When a pattern breaks:
- State resets to `observing`
- `observation_results` array is cleared
- `active_results` array is cleared
- `cumulative_profit` resets to 0
- `all_time_profit` is **preserved** (never resets)

---

## 6. Session Playability Rules

### 6.1 Playable Session

A session is **PLAYABLE** when:
1. At least one pattern is in `active` state, AND
2. That pattern has a pending signal (has formed), AND
3. P1 Mode is NOT active, AND
4. Daily target has NOT been reached.

When playable, the state banner shows: `✓ PLAYABLE`

### 6.2 Unplayable Session

A session is **UNPLAYABLE** when:
1. No patterns are in `active` state with pending signals, OR
2. P1 Mode is active, OR
3. Daily target has been reached.

When unplayable, the state banner shows: `⏸ UNPLAYABLE` with message "Waiting for profitable pattern reformation..."

### 6.3 P1 Mode

P1 Mode is a **safety mechanism** that triggers when:

```
currentRunLen >= p1_consecutive_threshold (default: 7)
```

This means 7 or more consecutive blocks in the same direction.

**Effects of P1 Mode:**
- Session becomes unplayable
- State banner shows: `⚠️ P1 MODE (7X RUN)`
- No predictions are made
- No bets are placed

**Clearing P1 Mode:**
P1 Mode clears when a recent result is both:
- Verdict is `fair`, AND
- Profit ≥ 70%

```javascript
const recentProfitable = out.some(e => e.verdict === 'fair' && e.profit >= 70);
if(recentProfitable) P1_MODE = false;
```

### 6.4 Daily Target Completion

When `PNL_TOTAL >= daily_target`:
- `DAILY_TARGET_REACHED` = true
- State banner shows: `🎯 DONE FOR THE DAY`
- No new blocks can be added
- Session must be cleared to continue

---

## 7. Reaction Rules (Predictions and Auto-Betting)

### 7.1 Prediction Logic

The `predictNext()` function determines what to do:

1. If daily target reached → return `"DONE FOR THE DAY"`
2. If P1 Mode active → return `"P1 MODE — Waiting for profitable pattern to clear"`
3. Sort patterns by cumulative profit (highest first)
4. For each pattern (in profit order):
   - Check if pattern cycle is in `active` state
   - Check if pattern has pending signals
   - Skip if should switch to opposite pattern
   - If all gates pass → return prediction

**Priority:** Patterns are sorted by `cumulative_profit` descending. The first pattern that passes all gates wins.

### 7.2 Opposite Pattern Switching

The system checks if it should use the opposite pattern instead:

| Pattern | Opposite |
|---------|----------|
| AP5 | OZ |
| OZ | AP5 |
| PP | *(none)* |
| ST | *(none)* |
| 2A2 | Anti2A2 |
| Anti2A2 | 2A2 |
| 3A3 | Anti3A3 |
| Anti3A3 | 3A3 |
| ZZ | AntiZZ |
| AntiZZ | ZZ |

Switch occurs when: current pattern is NOT profitable AND opposite IS profitable.

### 7.3 Auto-Bet Placement

When a valid prediction exists:

1. Create `pendingTrade` object with:
   - `open_idx`: Block index when trade was opened
   - `eval_idx`: Block index when trade will be evaluated (next block)
   - `dir`: Predicted direction
   - `prob`: Confidence percentage
   - `pattern`: Pattern name
   - `why`: Explanation string
   - `ts`: Timestamp

2. Display pending trade in UI

3. On next block, evaluate:
   - If prediction correct: `pnl = +STAKE * (pct/100)`
   - If prediction wrong: `pnl = -STAKE * (pct/100)`

### 7.4 Confidence Calculation

Base confidence: 60%
Adjustments:
- +10% if pattern is AP5 or OZ
- +20% if current profit > 150%

```javascript
let conf = 60;
if(p.includes('AP5') || p.includes('OZ')) conf += 10;
if(an.getCurrentProfit(p) > 150) conf += 20;
return Math.min(95, conf);
```

---

## 8. Profit Logic

### 8.1 Pattern Profit Calculation

For each evaluated signal:

```javascript
profit = signedProfit(pct, ok)
// where:
signedProfit(p, ok) = ok ? +p : -p
```

- If prediction was correct: `+pct`
- If prediction was wrong: `-pct`

### 8.2 Session P/L Calculation

When a bet is placed and evaluated:

```javascript
pnl = (ok ? +1 : -1) * STAKE * (b.pct / 100)
PNL_TOTAL += pnl
```

Where:
- `STAKE` = bet amount (default: R200)
- `b.pct` = percentage of the result block
- `ok` = whether prediction was correct

### 8.3 Profit Tracking Per Pattern

Each pattern tracks:
- `cumulative_profit`: Sum of profits during current observation phase
- `all_time_profit`: Sum of all profits across all time (never resets)

**Important:** Profit is calculated per actual result, not as a rolling average or windowed metric.

---

## 9. Verdict Classification

The `verdictFrom()` function classifies each result:

```javascript
function verdictFrom(p, ok, band) {
  if(!ok) return (p >= 70 ? "fake" : "unfair");
  const low = 50 - 100*band;   // 45 with default band
  const high = 50 + 100*band;  // 55 with default band
  return (p < low || p > high) ? "fair" : "neutral";
}
```

| Condition | Verdict |
|-----------|---------|
| Wrong prediction, pct ≥ 70% | `fake` |
| Wrong prediction, pct < 70% | `unfair` |
| Correct prediction, pct outside 45-55% | `fair` |
| Correct prediction, pct within 45-55% | `neutral` |

---

## 10. Edge Cases and Priority

### 10.1 Multiple Patterns Triggering Simultaneously

When multiple patterns trigger on the same block:
- All are added to the pending queue
- Priority is determined by **cumulative profit** (highest first)
- Only the highest-priority active pattern generates a bet

### 10.2 Opposite Patterns

When both a pattern and its opposite trigger (e.g., 2A2 and Anti2A2):
- Both are tracked separately
- The one with higher cumulative profit takes priority
- The system may switch to opposite if current pattern becomes unprofitable

### 10.3 Pattern Reformation

A pattern is considered "reformed" if it has at least one pending signal in the queue:

```javascript
hasReformed(pattern) {
  return this.pending.some(s => s.pattern === pattern);
}
```

---

## 11. UI States and Indicators

### 11.1 State Banner

| State | Banner Class | Display |
|-------|--------------|---------|
| Playable | `playable` | `✓ PLAYABLE` |
| Unplayable | `unplayable` | `⏸ UNPLAYABLE` |
| Done | `done` | `🎯 DONE FOR THE DAY` |
| P1 Mode | `p1` | `⚠️ P1 MODE (7X RUN)` |

### 11.2 Pattern Card States

| Class | Meaning |
|-------|---------|
| `active` | Pattern is in active state |
| `dormant` | Pattern is in observing state |
| `locked` | Pattern is broken or inactive |

### 11.3 Gate Indicators

| Class | Meaning |
|-------|---------|
| `gate-pass` (green) | Gate condition met |
| `gate-fail` (red) | Gate condition not met |
| `gate-dormant` (purple) | In observation phase |

---

## 12. Data Persistence

The system auto-saves to `localStorage` with key `ghost_manual_eval_v15_1`.

Saved data includes:
- `version`: "15.1"
- `blocks`: All blocks
- `results`: All evaluation results
- `pattern_cycles`: State of each pattern cycle
- `flags`: `{dailyTargetReached, p1Mode}`
- `trades`: Trade log
- `pnl_total`: Total P/L
- `stake_default`: Stake amount
- `daily_target`: Target value
- `currentRun`: Current run length
- `ts`: Timestamp

---

## 13. Versioning Notes

**Rulebook Version:** Aligned with Ghost Manual Evaluator v15.1 (Auto-Betting Fixed)

**Key Fixes in v15.1:**
- AP5/OZ detection fixed
- ZZ detection fixed
- Auto-betting now checks **cycle state** (observing/active), not signal state

---

## Change Summary (from Previous Rulebook)

### Removed Concepts (Not in v15.1)

1. **`cutX` and `lockX` parameters** — Removed. The old "cut at 6x, lock at 7x" multiplier logic does not exist in v15.1. Instead, v15.1 uses the observation/active lifecycle with profit thresholds.

2. **`zzPrefix` and `zzReturn` parameters** — Removed. ZZ detection in v15.1 simply looks for three consecutive runs of length 1.

3. **`ap5Follow` parameter** — Removed. AP5 triggers when prevRun ≥ 3 and currRun = 1.

4. **`twoA2Free` parameter** — Removed. 2A2 simply triggers when runLen = 2.

5. **`minWR` (minimum win rate)** — Removed. v15.1 does not track or enforce win rate.

6. **`window` parameter** — Removed. No windowed calculations exist.

7. **`timerSeconds` parameter** — Removed. v15.1 is a manual evaluator, not timed.

8. **"First A2 skip, second A2 play" logic** — Removed. In v15.1, 2A2 triggers every time runLen = 2. The observation/active lifecycle handles profitability.

### Added Concepts (New in v15.1)

1. **Pattern Lifecycle (observing → active → broken)** — Major new system. Patterns must prove profitability during observation before auto-betting begins.

2. **Activation Thresholds** — `single_profit_threshold` (70%) and `cumulative_profit_threshold` (100%) determine when patterns activate.

3. **Continuous vs Single-Shot Patterns** — ZZ/AntiZZ are continuous; others are single-shot. Affects break behavior.

4. **P1 Mode** — Triggers on 7+ consecutive same-direction blocks. Pauses all betting.

5. **Opposite Pattern Switching** — System can switch to opposite pattern (e.g., 2A2 → Anti2A2) based on profitability.

6. **Verdict Classification** — `fair`, `unfair`, `fake`, `neutral` based on correctness and percentage.

### Clarified Concepts

1. **Pattern Detection** — Now fully specified with exact trigger conditions for each pattern.

2. **Profit Calculation** — Clarified that profit is `±pct` per result, not a rolling average.

3. **Playability** — Now tied to having active patterns with pending signals, not abstract "chaos" detection.

4. **Priority** — Patterns sorted by cumulative profit, not a fixed hierarchy.
