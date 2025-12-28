# SameDir Pause/Resume Analysis Summary
## Last Updated: 2025-12-27
## Last Session Analyzed: session_2025-12-27T19-07-56-605Z.json

---

# RUNNING TOTALS (ALL 33 UNIQUE SESSIONS)

**NOTE: SD Pause/Resume system IS IMPLEMENTED and ACTIVE in all sessions.**

| Metric | Value |
|--------|-------|
| **Total Sessions** | 33 (skipped 2 duplicates) |
| **Total Blocks** | 3,315 |
| **Total Trades** | 1,666 |
| **Total Session PnL** | **+8,692** |
| **SD Trades** | 534 (279W / 255L = 52.2%) |
| **ACTUAL SD PnL** | **-330** |
| Simulated (no pause) | +86 |
| **PAUSE VALUE** | **-416** (COSTING, not saving!) |
| Pause Periods Detected | 89 |
| Total Blocks Paused | 1,680 (51% of blocks) |

## CRITICAL FINDING (Needs Confirmation)

The pause system appears to be **COSTING -416** across all sessions. However, **DO NOT jump to conclusions** - we need more sessions to confirm.

### Root Cause Analysis

**PAUSE is working correctly** - it triggers on:
- HIGH_PCT reversal (>=70%) + loss
- 2+ consecutive losses

**RESUME is NOT configured correctly** - CONFIRMED BY DATA:

#### Resume Trigger Analysis (57 events across 33 sessions)
| Pattern | Count | Type | Correct? |
|---------|-------|------|----------|
| ZZ | 20 | GOOD | YES |
| AntiZZ | 9 | BAD | NO! |
| 2A2 | 8 | GOOD | YES |
| Anti2A2 | 7 | BAD | NO! |
| Anti3A3 | 5 | BAD | NO! |
| 3A3 | 4 | GOOD | YES |
| 4A4 | 2 | GOOD | YES |
| Anti4A4 | 1 | BAD | NO! |
| OZ | 1 | BAD | NO! |

**RESULT: 40% of resumes are from BAD patterns!**

- **34 GOOD resumes** (ZZ/2A2/3A3/4A4) - Correct behavior
- **23 BAD resumes** (Anti*/OZ) - Incorrect, causing SD losses

### Correct Resume Logic (TO BE IMPLEMENTED)

```javascript
// ONLY resume when these DIRECTIONAL patterns break:
const RESUME_TRIGGER_PATTERNS = ['ZZ', '2A2', '3A3', '4A4', '5A5', '6A6'];

// Do NOT resume when these break (they are anti-directional):
const NO_RESUME_PATTERNS = ['AntiZZ', 'Anti2A2', 'Anti3A3', 'Anti4A4', 'Anti5A5', 'OZ'];
```

**Why?**
- ZZ/XAX patterns bet on alternation (direction change)
- When ZZ breaks, it means direction is CONTINUING → good for SameDir
- Anti patterns bet on continuation (same as SameDir!)
- When Anti breaks, direction CHANGED → bad for SameDir

### Patterns That Agree With SameDir

| Pattern | Direction Logic | Agrees with SD? |
|---------|-----------------|-----------------|
| ZZ, 2A2, 3A3, etc. | Bet on alternation | NO (opposite) |
| AntiZZ, Anti2A2, etc. | Bet on continuation | YES (same) |
| OZ | Outside zone | NO (different logic) |
| SameDir | Bet on continuation | - |

### Recommendations (Pending Confirmation)

1. **FIX RESUME TRIGGER**: Only resume when ZZ/2A2/3A3/4A4/5A5 break (not Anti patterns)
2. **INCREASE initialLife**: From 140 to 180-200 (more runway)
3. **ANALYZE MORE SESSIONS**: Confirm pattern before making changes
4. **DO NOT DISABLE PATTERNS YET**: Need more data on Anti patterns vs SD interaction

---

# PATTERN ANALYSIS (ALL 33 SESSIONS)

## TOP 5 WINNERS

| Pattern | Trades | Win% | PnL | Avg/Trade |
|---------|--------|------|-----|-----------|
| **ZZ** | 291 | 55.3% | **+4,646** | +16.0 |
| **2A2** | 199 | 55.3% | **+2,598** | +13.1 |
| **Anti3A3** | 65 | 61.5% | **+1,908** | +29.4 |
| **AP5** | 40 | 67.5% | **+1,398** | +35.0 |
| **4A4** | 58 | 56.9% | **+1,126** | +19.4 |

## TOP 5 LOSERS

| Pattern | Trades | Win% | PnL | Avg/Trade | Issue |
|---------|--------|------|-----|-----------|-------|
| **3A3** | 62 | 46.8% | **-1,158** | -18.7 | Low win rate |
| **OZ** | 57 | 43.9% | **-900** | -15.8 | Low win rate |
| **5A5** | 18 | 27.8% | **-736** | -40.9 | Very low win% |
| **Anti4A4** | 17 | 35.3% | **-564** | -33.2 | Low win rate |
| **SameDir** | 534 | 52.2% | **-330** | -0.6 | Too many trades |

## OBSERVATIONS (Need More Data)

### Patterns Performing Well
- ZZ, 2A2, Anti3A3, AP5, 4A4 (+11,676 combined)

### Patterns Underperforming
- 3A3, OZ, 5A5, Anti4A4 (-3,358 combined)
- SameDir (-330) - likely due to resume misconfiguration

### DO NOT DISABLE YET
We need to understand the interaction between patterns:
1. Anti patterns may be losing because they conflict with SameDir timing
2. Once SD resume is fixed, Anti patterns may perform better
3. OZ needs separate analysis - different market conditions

**Action**: Continue analyzing sessions, fix SD resume logic first

---

## SESSIONS ANALYZED (Dec 16-27, 2025)

**33 unique sessions analyzed** (2 duplicates skipped)

### Aggregate Stats (All 33 Sessions)
- **Total Sessions**: 33
- **Total Blocks**: 3,315
- **Total Trades**: 1,666
- **Total Session PnL**: +8,692
- **Total SD Trades**: 534 (279 wins, 255 losses)
- **SD Win Rate**: 52.2%
- **ACTUAL SD PnL**: -330 (with pause system active)
- **Simulated (no pause)**: +86
- **PAUSE VALUE**: -416 (COSTING - resume logic needs fixing!)
- **Pause Periods**: 89 (1,680 blocks paused = 51% of session time)

---

## KEY INSIGHTS FROM NEW SESSIONS

### 1. Optimal Threshold Varies by Session
| Threshold | Sessions Favoring | Notes |
|-----------|-------------------|-------|
| thresh60 | 3 sessions | Best for high-volatility sessions |
| thresh70 | 2 sessions | Good balance, original recommendation |
| k180 | 1 session | Dec 27 12:19 showed +1,088 improvement with higher life |
| k100 | 1 session | Dec 27 13:22 showed +62 improvement with lower life |

### 2. False Deactivation Events
- **Only 1 false deactivation detected** (Dec 27 10:38)
  - Block 31 → 36 (5 blocks gap)
  - Cost: 310 missed PnL
- **Improvement from Dec 24**: False deactivation cost reduced significantly

### 3. Long Flow Capture
| Session | Long Flows | Captured | Missed PnL |
|---------|------------|----------|------------|
| Dec 26 09:53 | 1 (7 blocks UP) | 0% | 396 |
| Dec 26 12:46 | 1 (7 blocks DOWN) | 0% | 380 |
| Dec 27 10:20 | 1 (7 blocks DOWN) | 0% | 776 |
| Dec 27 12:19 | 1 (9 blocks DOWN) | 100% | 0 |
| **Total** | 4 | 25% | 1,552 |

### 4. Reversal Hostility Analysis
- **Average High PCT Reversals per session**: 12
- **Average Reversal PCT**: 85.4%
- **Pause duration K=10 shows best average benefit** across sessions

---

## COMPARISON: DEC 24 vs DEC 26-27

| Metric | Dec 24 Sessions | Dec 26-27 Sessions | Change |
|--------|-----------------|---------------------|--------|
| SD Win Rate | ~48% | 52.3% | +4.3% |
| False Deactivations | 6 events | 1 event | -83% |
| Long Flow Capture | 40% | 25% | -15% |
| Best Improvement | +1,206 | +2,774 (sum) | Better |

---

## UPDATED RECOMMENDATIONS

### HIGH PRIORITY
1. **Implement adaptive threshold**
   - thresh60 for high-volatility periods (avg reversal PCT > 85%)
   - thresh70 for normal conditions
   - Consider session volatility before choosing

2. **Test initialLife = 180**
   - Dec 27 12:19 session showed +1,088 improvement with k180
   - May capture more long flows without premature expiration

### MEDIUM PRIORITY
3. **Improve Long Flow Capture**
   - Current 25% capture rate is too low
   - Consider detecting runs earlier (before 7 blocks)

4. **Short Sessions Analysis**
   - 2 sessions had 0 SD trades (Dec 27 12:41, 13:07)
   - Sessions under 30 blocks may not trigger SD activation

---

## BEST CONFIGURATION (Updated)

```javascript
const CONFIG = {
  // PAUSE TRIGGERS
  highPctThreshold: 65,        // Lowered from 70 based on new data
  consecLossesThreshold: 1,    // Pause after 2nd consecutive loss

  // RESUME TRIGGERS
  consecWinsResumeThreshold: 2,   // Resume after 2 imaginary wins
  imgProfitResumeThreshold: 80,   // Resume after 80+ imaginary profit

  // LIFE PARAMETERS (consider testing)
  initialLife: 140,               // Default, but 180 showed benefits in some sessions
};
```

---

## HISTORICAL BASELINE (Dec 24, 2025)

| Metric | Session 1 | Session 2 | Difference |
|--------|-----------|-----------|------------|
| SameDir PnL | -638 | +816 | 1,454 swing |
| Total Trades | 22 | 26 | |
| Win Rate | ~32% | ~65% | |

**The Problem**: Session 1's SameDir lost money due to "fake activation trap" pattern.

---

## THE FAKE ACTIVATION TRAP (Session 1 - Dec 24)

The cycle:
1. SD activates and is profitable initially
2. ZZ/XAX becomes profitable (takes over)
3. SD loses during ZZ/XAX dominance → deactivates
4. ZZ/XAX breaks
5. SD would be profitable NOW but just deactivated
6. SD reactivates → cycle repeats

**Session 1 Evidence**:
- 6 activation runs (fragmented) vs Session 2's 3 runs
- Missed a 9-block long flow entirely
- Fake activation cost: -670

---

## PAUSE TRIGGER COMPARISON (Dec 24)

| Configuration | S1 Improvement | S2 Improvement | Total | Balanced? |
|---------------|----------------|----------------|-------|-----------|
| **AGGRESSIVE (70%+ OR 2L)** | +884 | +322 | **+1,206** | YES |
| HIGH_PCT >=70% only | +816 | +322 | +1,138 | YES |
| HIGH_PCT >=80% only | +816 | +322 | +1,138 | YES |
| HIGH_PCT + CONSEC >=2 | +752 | +322 | +1,074 | YES |
| CONSEC_LOSSES >=2 | +752 | -80 | +672 | NO |
| ZZ/XAX TAKEOVER >=200 | 0 | -80 | -80 | NO |
| BASELINE (no pause) | 0 | 0 | 0 | N/A |

---

## STATE MACHINE STATES

```
INACTIVE → ACTIVE → PAUSED ↔ ACTIVE → EXPIRED
                 ↓
              EXPIRED
```

### Pause Triggers (check on each trade)
```javascript
// Trigger 1: High PCT reversal with loss
if (isReversal && evalBlock.pct >= 65 && !trade.isWin) {
  pause("HIGH_PCT_REVERSAL");
}

// Trigger 2: Consecutive losses
if (consecutiveLosses >= 1 && !trade.isWin) {
  pause("CONSECUTIVE_LOSSES");
}
```

### Resume Triggers (check during pause)
```javascript
// Trigger 1: Consecutive imaginary wins
if (consecutiveImaginaryWins >= 2) {
  resume("IMAGINARY_WINS");
}

// Trigger 2: Imaginary profit threshold
if (imaginaryPnL >= 80) {
  resume("IMAGINARY_PROFIT");
}
```

### Life Preservation
- Life is NOT consumed during PAUSED state
- Imaginary losses don't affect life
- Only REAL losses depreciate life

---

## COMBINED PERFORMANCE POTENTIAL

| Metric | Without Pause | With Pause | Improvement |
|--------|---------------|------------|-------------|
| Dec 24 Sessions | +178 | +1,384 | +1,206 |
| Dec 26-27 Sessions | +612 | ~+3,386 | ~+2,774 |
| **TOTAL** | **+790** | **~+4,770** | **~+3,980** |

---

## FILES CREATED DURING ANALYSIS

### Dec 24 Analysis
1. `analyze-optimal-triggers.js` - Tested 9 configurations
2. `analyze-aggressive-detail.js` - Detailed trade-by-trade analysis
3. `analyze-zzxax-pnl-levels.js` - ZZ/XAX threshold analysis
4. `analyze-long-flow-capture.js` - Long flow capture verification
5. `analyze-missed-flow.js` - Session 1 gap investigation

### Tools
6. `run-sd-analysis-agent.js` - Standalone analysis runner
7. `ANALYSIS-SUMMARY.md` - This summary (updated Dec 27)

---

## NEXT STEPS

### HIGH PRIORITY (Fix Resume Logic)
1. [ ] **FIX SD RESUME TRIGGER** - Only resume when ZZ/2A2/3A3/4A4/5A5/6A6 break
2. [ ] **DO NOT resume** when AntiZZ/Anti2A2/Anti3A3/Anti4A4/Anti5A5/OZ break
3. [ ] Test initialLife = 180-200 for more runway

### MEDIUM PRIORITY (After Resume Fix)
4. [ ] Re-analyze all sessions with corrected resume logic
5. [ ] Test adaptive threshold (70-85% based on volatility)
6. [ ] Add logging for sdMachineState, isRealBet, resumeTriggerPattern

### LOW PRIORITY (Later)
7. [ ] Analyze pattern interactions (Anti patterns vs SD timing)
8. [ ] Consider disabling underperforming patterns after more data

---

## ANALYSIS PROMPT FOR NEXT SESSIONS

Use this prompt to analyze new sessions:

```bash
# Analyze ALL unique sessions (skip duplicates)
node -e "
const fs = require('fs');
const path = require('path');
const dir = 'ghost-evaluator/data/sessions';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
const bySize = {};
files.forEach(f => {
  const size = fs.statSync(path.join(dir, f)).size;
  if (!bySize[size]) bySize[size] = [];
  bySize[size].push(f);
});
const dupes = [];
Object.values(bySize).forEach(g => g.length > 1 && g.slice(1).forEach(f => dupes.push(f)));
const unique = files.filter(f => !dupes.includes(f));
console.log('Unique sessions:', unique.length);
console.log(unique.map(f => path.join(dir, f)).join(' '));
"

# Then run analysis
node run-sd-analysis-agent.js [paste unique session paths]

# Or analyze specific new session
node run-sd-analysis-agent.js ghost-evaluator/data/sessions/[session-file].json
```

### What to Look For:

#### 1. SD Performance
- **SD Win Rate** - Current: 52.2%, Target: > 55%
- **SD PnL** - Is it positive or negative?
- **Pause Value** - Is pause helping or hurting?

#### 2. Resume Trigger Analysis (CRITICAL)
- When did SD resume? After which pattern broke?
- Did resume happen after ZZ/XAX break? (GOOD)
- Did resume happen after Anti pattern break? (BAD - shouldn't resume!)
- Track which patterns triggered resume

#### 3. Pattern Interactions
- When Anti patterns win, is SD also winning? (should be - same direction)
- When ZZ patterns win, is SD losing? (expected - opposite direction)
- Correlate Anti pattern performance with SD pause/resume timing

#### 4. Long Flow Capture
- Are long directional flows being captured?
- Is SD paused during good flows? (BAD)
- Is SD active during choppy periods? (BAD)

### Key Considerations for Analysis

```
PAUSE TRIGGER (working correctly):
- HIGH_PCT reversal (>=70%) + loss → PAUSE
- 2+ consecutive losses → PAUSE

RESUME TRIGGER (NEEDS FIXING):
CURRENT (wrong): Resume when ANY ZZ/XAX pattern breaks
CORRECT: Resume ONLY when directional patterns break:
  - ZZ, 2A2, 3A3, 4A4, 5A5, 6A6 break → RESUME (direction continuing)
  - AntiZZ, Anti2A2, Anti3A3, etc. break → DO NOT RESUME (direction changed!)
  - OZ break → DO NOT RESUME (different logic)

WHY?
- ZZ/XAX bet on ALTERNATION (direction change)
- Anti patterns bet on CONTINUATION (same as SD!)
- When ZZ breaks → direction continues → good for SD
- When Anti breaks → direction changed → bad for SD
```

### Update This File With:
- Session date/time and file name
- Total PnL and SD PnL
- Number of pause/resume events
- Which patterns triggered resume (track this!)
- Any new observations about pattern interactions
- Running totals (update the table at top)

### Pattern Alignment Reference

| Pattern | Bets On | When It Breaks | SD Should |
|---------|---------|----------------|-----------|
| ZZ | Alternation | Direction continues | RESUME |
| 2A2 | Alternation | Direction continues | RESUME |
| 3A3 | Alternation | Direction continues | RESUME |
| 4A4 | Alternation | Direction continues | RESUME |
| 5A5 | Alternation | Direction continues | RESUME |
| AntiZZ | Continuation | Direction changed | STAY PAUSED |
| Anti2A2 | Continuation | Direction changed | STAY PAUSED |
| Anti3A3 | Continuation | Direction changed | STAY PAUSED |
| Anti4A4 | Continuation | Direction changed | STAY PAUSED |
| Anti5A5 | Continuation | Direction changed | STAY PAUSED |
| OZ | Outside Zone | Different logic | STAY PAUSED |
