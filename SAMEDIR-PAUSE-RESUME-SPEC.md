# SameDir Pause/Resume Specification
## Date: 2025-12-24 Analysis | To Implement: 2025-12-25

---

## SUMMARY

We analyzed two sessions from 2025-12-24 and found the optimal pause/resume strategy for SameDir.

**Best Result: +1504 improvement across both sessions**

---

## THE PROBLEM: Fake Activation Trap

The cycle that causes losses:
1. SD activates → profitable
2. ZZ/XAX becomes profitable (market switches to alternating)
3. SD loses during ZZ/XAX dominance → deactivates
4. ZZ/XAX breaks (loses)
5. SD would be profitable NOW but just deactivated
6. SD reactivates → cycle repeats

**Session 1 Evidence:**
- 4 consecutive SD losses before ZZ/XAX takeover
- SD deactivated, missed 9-block DOWN flow
- 28-block gap with no SD trades

---

## THE SOLUTION

### PAUSE Triggers (any of these)

```javascript
// Trigger 1: High PCT reversal + loss
if (isReversal && evalBlock.pct >= 70 && !trade.isWin) {
  pause();
}

// Trigger 2: 2+ consecutive losses
if (consecutiveLosses >= 1 && !trade.isWin) {
  pause();
}
```

### RESUME Trigger

```javascript
// Resume ONLY when ZZ/XAX breaks (loses)
// Resume takes effect on NEXT trade (not current)
if (isPaused && lastZZXAXResult === 'LOSS') {
  resume();
}
```

---

## RESULTS

| Metric | Session 1 | Session 2 | Total |
|--------|-----------|-----------|-------|
| Actual SD PnL | -638 | +816 | +178 |
| With Pause/Resume | +478 | +1204 | +1682 |
| **Improvement** | **+1116** | **+388** | **+1504** |

---

## COMPARISON OF APPROACHES TESTED

| Resume Strategy | S1 Imp | S2 Imp | Total | Winner? |
|-----------------|--------|--------|-------|---------|
| **ZZ break only** | **+1116** | **+388** | **+1504** | **YES** |
| ZZ break + 1 win confirm | +922 | +322 | +1244 | |
| 2 imaginary wins (no ZZ) | +884 | +322 | +1206 | |
| 80 imaginary profit (no ZZ) | +888 | +322 | +1210 | |
| ZZ break + 2 wins | +884 | +322 | +1206 | |

**Conclusion: ZZ/XAX break is the best resume indicator**

---

## STATE MACHINE

```
INACTIVE ──────> ACTIVE ──────> PAUSED ←────> ACTIVE
                    │              │             │
                    │              │             │
                    └──────────────┴─────────────┘
                                   │
                                   ↓
                                EXPIRED
```

### States:
- **INACTIVE**: SD not activated yet
- **ACTIVE**: SD trading normally (REAL trades)
- **PAUSED**: SD watching but not trading (IMAGINARY trades)
- **EXPIRED**: SD life exhausted

### Transitions:
- ACTIVE → PAUSED: HIGH_PCT reversal + loss OR 2+ consecutive losses
- PAUSED → ACTIVE: ZZ/XAX breaks (loses)
- ACTIVE → EXPIRED: Life exhausted (existing logic)
- PAUSED: Life is PRESERVED (not consumed)

---

## IMPLEMENTATION NOTES

### 1. Track Last ZZ/XAX Result

```javascript
// In trade processing loop
const ZZ_XAX_PATTERNS = ['ZZ', 'AntiZZ', '2A2', '3A3', '4A4', '5A5',
                         'Anti2A2', 'Anti3A3', 'Anti4A4', 'Anti5A5'];

let lastZZXAXResult = null; // 'WIN' or 'LOSS'

// Update when any ZZ/XAX trade occurs
if (ZZ_XAX_PATTERNS.includes(trade.pattern)) {
  lastZZXAXResult = trade.isWin ? 'WIN' : 'LOSS';
}
```

### 2. Pause Logic (on SD trade)

```javascript
function shouldPauseSameDir(trade, evalBlock, prevBlock, consecutiveLosses) {
  const isReversal = prevBlock && evalBlock.dir !== prevBlock.dir;
  const isHighPctReversal = isReversal && evalBlock.pct >= 70;

  // Trigger 1: High PCT reversal with loss
  if (isHighPctReversal && !trade.isWin) {
    return { pause: true, reason: 'HIGH_PCT_REVERSAL' };
  }

  // Trigger 2: 2+ consecutive losses (consecutiveLosses >= 1 means this is 2nd)
  if (consecutiveLosses >= 1 && !trade.isWin) {
    return { pause: true, reason: 'CONSECUTIVE_LOSSES' };
  }

  return { pause: false };
}
```

### 3. Resume Logic

```javascript
function shouldResumeSameDir(lastZZXAXResult) {
  // Resume when ZZ/XAX broke
  if (lastZZXAXResult === 'LOSS') {
    return { resume: true, reason: 'ZZXAX_BROKE' };
  }
  return { resume: false };
}
```

### 4. Trade Classification

```javascript
// During PAUSED state:
// - Track trades as IMAGINARY
// - Don't consume life
// - Don't count toward consecutive losses
// - DO update lastZZXAXResult for all patterns

// Resume takes effect on NEXT trade after condition met
```

---

## KEY INSIGHTS

1. **HIGH_PCT ≥70% reversal** is a direct hostility signal for SD
2. **Consecutive losses** catch developing problems early
3. **ZZ/XAX break** indicates market is returning to trending mode
4. **Resume on NEXT trade** (not immediately) gives market time to confirm
5. **Life preserved during pause** - only real losses consume life

---

## FILES CREATED DURING ANALYSIS

Analysis scripts (in project root):
- `analyze-optimal-triggers.js` - Tested 9 pause configurations
- `analyze-aggressive-detail.js` - Trade-by-trade breakdown
- `analyze-zzxax-takeover-proper.js` - Consecutive wins detection
- `analyze-takeover-timing.js` - Before/during/after analysis
- `analyze-zz-break-resume.js` - ZZ break as resume trigger
- `analyze-zz-break-plus-confirm.js` - ZZ break + confirmation
- `analyze-combined-triggers.js` - All combinations tested
- `ANALYSIS-SUMMARY.md` - Earlier summary
- `ANALYSIS-ZZXAX-SUMMARY.md` - ZZ/XAX analysis summary

---

## SESSION DATA ANALYZED

- `ghost-evaluator/data/sessions/session_2025-12-24T18-19-24-936Z.json` (Session 1)
- `ghost-evaluator/data/sessions/session_2025-12-24T18-57-18-606Z.json` (Session 2)

---

## TOMORROW'S TASKS

1. Review this spec
2. Implement pause/resume in SDStateMachine
3. Add lastZZXAXResult tracking
4. Update logging to show REAL vs IMAGINARY trades
5. Test with replay on both sessions
6. Verify +1504 improvement is achieved

---

---

## DEPRECIATION / LIFE SYSTEM

### Current System (same-direction.ts)

```javascript
// Constants
ACTIVATION_THRESHOLD = 140;
DEACTIVATION_THRESHOLD = 140;

// On activation
accumulatedLoss = 0;

// On run break with negative RunProfit (WHILE ACTIVE)
accumulatedLoss += Math.abs(runProfit);

// On single-block flip (WHILE ACTIVE)
accumulatedLoss += breakBlock.pct;

// Deactivation check
if (accumulatedLoss > 140) → DEACTIVATE

// Big win reset (RunProfit > accumulatedLoss)
accumulatedLoss = 0;
```

### With Pause System

```javascript
// ACTIVE state: Normal depreciation
if (state === 'ACTIVE') {
  if (runProfit < 0) {
    accumulatedLoss += Math.abs(runProfit);  // Real loss
  }
  if (accumulatedLoss > 140) → EXPIRED
}

// PAUSED state: NO depreciation
if (state === 'PAUSED') {
  // Track imaginary outcome but DO NOT add to accumulatedLoss
  imaginaryPnL += runProfit;  // Track for analysis only
  // accumulatedLoss stays frozen
}

// Resume: accumulatedLoss preserved, continue from where we left
if (resume) {
  state = 'ACTIVE';
  // accumulatedLoss unchanged - we continue with remaining "life"
}
```

### Key Rules

| State | Loss Event | accumulatedLoss | Effect |
|-------|------------|-----------------|--------|
| ACTIVE | Real loss | += lossPct | May trigger EXPIRED |
| PAUSED | Imaginary loss | No change | Life preserved |
| ACTIVE | Big win (RunProfit > accLoss) | = 0 | Reset |
| PAUSED | Imaginary win | No change | Counts toward resume |

### Example Flow

```
Block 10: ACTIVATE (accumulatedLoss = 0)
Block 15: Real loss -80  → accumulatedLoss = 80
Block 16: Real loss -30  → accumulatedLoss = 110
Block 17: HIGH_PCT reversal → PAUSE (accumulatedLoss = 110, FROZEN)
Block 18: Imaginary loss -50 → accumulatedLoss = 110 (no change!)
Block 19: Imaginary win +60  → accumulatedLoss = 110 (no change!)
Block 20: ZZ breaks → RESUME (accumulatedLoss = 110, resume with 30 life left)
Block 21: Real loss -40 → accumulatedLoss = 150 → EXPIRED
```

### Why Preserve Life During Pause?

1. Pause is NOT a failure - it's a defensive move
2. We're avoiding losses, not taking them
3. When we resume, we still have "life" to continue
4. Without preservation: pause → immediate expire (defeats purpose)

---

## QUICK REFERENCE

```
PAUSE when:
  - HIGH_PCT ≥70% reversal + SD loss
  - OR 2+ consecutive SD losses

RESUME when:
  - ZZ/XAX breaks (loses)
  - Takes effect on NEXT trade

DEPRECIATION:
  - ACTIVE: accumulatedLoss += |loss|
  - PAUSED: accumulatedLoss frozen (no change)
  - EXPIRED when: accumulatedLoss > 140

Expected improvement: +1504 across 2 sessions
```
