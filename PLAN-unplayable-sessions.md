# Investigation Plan: Unplayable Session Detection & Loss Minimization

## Executive Summary

The Ghost Evaluator v15.1 currently has a critical gap: it can lose for hours during "unplayable sessions" where every pattern performs a **bait and switch** - showing profitable signals during observation but failing when active. The current P1 mode (7+ consecutive same-direction blocks) is the only session-stop mechanism, but it doesn't detect the broader category of adversarial market conditions.

This plan outlines strategies to:
1. Identify unplayable sessions early
2. Minimize losses during adverse conditions
3. Wait for genuine recovery before resuming

---

## Part 1: Problem Analysis

### 1.1 What is "Bait and Switch"?

A pattern exhibits bait and switch behavior when:
- **Observation phase**: Pattern signals correctly (70%+ profit), triggering activation
- **Active phase**: Same pattern immediately fails when real bets are placed
- **Result**: Engine activates based on false confidence, then loses money

This can cascade across ALL patterns in a session:
- Pattern A activates (looks good) → fails → breaks
- Pattern B activates (looks good) → fails → breaks
- Pattern C activates... (repeat for hours)

### 1.2 Current Detection Gaps

| What's Missing | Current State | Impact |
|----------------|---------------|--------|
| Observation vs Active comparison | Data stored separately, never compared | Cannot detect bait & switch |
| Loss magnitude tracking | Only counts consecutive losses (2) | Small vs large losses treated equally |
| Session drawdown limit | None | Can lose indefinitely |
| Pattern reliability score | None | Bet on patterns with no proven active success |
| Verdict analysis | 'fake' verdict overwritten | Cannot detect market manipulation signals |
| Early session stop | Only P1 mode (7+ same direction) | Hour-long losing streaks possible |

### 1.3 Current Loss Mechanisms (Inadequate)

1. **P1 Mode**: Triggers on 7+ consecutive same-direction blocks
   - Too specific - misses alternating losses
   - Only detects trend, not pattern unreliability

2. **2-Loss Cooldown**: 3-block pause after 2 consecutive losses
   - Resets on single win
   - One win in 10 trades keeps you in the game
   - No cumulative loss consideration

3. **Pattern Break**: Pattern goes back to observing after loss
   - Immediately tries other patterns
   - No "session is bad" recognition

---

## Part 2: Proposed Detection Strategies

### Strategy 1: Session Health Score (SHS)

Create a real-time session quality metric combining:

```
Session Health Score (0-100) =
  (win_rate_factor * 30) +
  (drawdown_factor * 30) +
  (pattern_reliability_factor * 20) +
  (verdict_quality_factor * 20)

Where:
- win_rate_factor: Rolling 20-trade win rate (0-1)
- drawdown_factor: 1 - (current_drawdown / max_acceptable_drawdown)
- pattern_reliability_factor: avg(active_win_rate / observation_win_rate) across patterns
- verdict_quality_factor: 1 - (fake_verdicts / total_losses)
```

**Thresholds:**
- SHS >= 70: Playable (continue betting)
- SHS 50-69: Caution (reduce bet size or pause)
- SHS < 50: Unplayable (full stop, wait for recovery)

### Strategy 2: Bait & Switch Detection

Track per-pattern divergence between observation and active performance:

```
Pattern Divergence Score =
  observation_win_rate - active_win_rate

Flags:
- Divergence > 25%: Pattern is baiting
- Divergence > 40%: Pattern is confirmed bait & switch
- 3+ patterns with divergence > 25%: Session is adversarial
```

**Data Required:**
- `observationWinRate`: Wins during observation / total observation signals
- `activeWinRate`: Wins during active / total active bets
- Track per pattern AND across session

### Strategy 3: Loss Severity Weighting

Not all losses are equal. Track magnitude:

```
Weighted Loss Score =
  sum(abs(loss_pct) for each loss) / count(losses)

Severity Levels:
- Average loss < 10%: Minor (market noise)
- Average loss 10-30%: Moderate (pattern mismatch)
- Average loss > 30%: Severe (market actively opposing)
```

**Alert Triggers:**
- Single loss > 50%: Immediate pause (1 block)
- 3 losses averaging > 30%: Extended pause (5 blocks)
- Session weighted loss > 200%: Stop session

### Strategy 4: Drawdown-Based Stopping

Implement hard session drawdown limits:

```
Drawdown Levels:
- Level 1 (Warning): -R300 (15% of daily target)
  Action: Log warning, reduce confidence threshold by 10%

- Level 2 (Caution): -R500 (25% of daily target)
  Action: Pause for 5 blocks, require 2 consecutive pattern formations

- Level 3 (Stop): -R800 (40% of daily target)
  Action: Session becomes UNPLAYABLE, wait for recovery

- Level 4 (Abort): -R1000 (50% of daily target)
  Action: End session entirely, no recovery possible today
```

### Strategy 5: Verdict-Based Market Detection

Use the 'fake' verdict (currently not utilized):

```
Fake Ratio = fake_verdicts / total_losses

Market States:
- Fake Ratio < 20%: Normal market (genuine losses)
- Fake Ratio 20-40%: Suspicious (market may be faking)
- Fake Ratio > 40%: Adversarial market (clear bait & switch)
```

**When 'fake' verdict occurs:**
- Wrong prediction on a 70%+ move
- Market moved strongly in opposite direction of all signals
- This is the clearest indicator of bait & switch

### Strategy 6: Pattern Activation Velocity

Track how quickly patterns are cycling (activating then breaking):

```
Activation Velocity =
  pattern_breaks_last_hour / pattern_activations_last_hour

Interpretation:
- Velocity < 0.3: Patterns are stable (good)
- Velocity 0.3-0.6: Moderate churn (caution)
- Velocity > 0.6: High churn (patterns failing immediately after activation)
```

---

## Part 3: Recovery Detection

### 3.1 What Indicates Recovery?

Recovery signals that the market has returned to a playable state:

1. **Win Streak Signal**
   - 3 consecutive wins across any patterns
   - At least 2 different patterns won

2. **Verdict Improvement**
   - Last 5 trades: > 60% fair verdicts
   - No fake verdicts in last 10 blocks

3. **Pattern Stability**
   - At least 1 pattern active for 5+ blocks without breaking
   - Observation win rate aligns with active win rate

4. **Drawdown Recovery**
   - Current P/L improved by 50% from max drawdown
   - Or: 3 consecutive profitable trades totaling > R100

### 3.2 Recovery Wait Mechanism

When session becomes unplayable:

```
ENTER RECOVERY WAIT MODE:
1. Stop all betting immediately
2. Continue observing and recording pattern signals
3. Track "shadow" performance (what would have happened)
4. Monitor recovery indicators every block

RECOVERY CRITERIA (must meet ALL):
- 5+ consecutive blocks observed without betting
- Shadow performance: >60% would-have-been-wins in last 10
- Fake verdict rate < 20% in last 10 blocks
- At least 1 pattern reformed and signaling

EXIT RECOVERY MODE:
- If criteria met: Resume betting (SHS recalculated)
- If 20+ blocks pass without recovery: End session
```

### 3.3 Gradual Re-entry

After recovery, don't immediately bet at full confidence:

```
Re-entry Protocol:
1. First 3 trades: Half stake (R100 instead of R200)
2. If 2/3 win: Resume normal stake
3. If 2/3 lose: Return to recovery wait mode
```

---

## Part 4: Implementation Considerations

### 4.1 Data Structures Needed

```typescript
interface SessionHealth {
  score: number;                    // 0-100 SHS
  winRateFactor: number;
  drawdownFactor: number;
  patternReliabilityFactor: number;
  verdictQualityFactor: number;
  lastCalculatedBlock: number;
}

interface PatternDivergence {
  pattern: PatternName;
  observationWinRate: number;
  activeWinRate: number;
  divergenceScore: number;
  isBaiting: boolean;
}

interface LossSeverity {
  totalWeightedLoss: number;
  averageLossMagnitude: number;
  severityLevel: 'minor' | 'moderate' | 'severe';
}

interface RecoveryState {
  isInRecoveryMode: boolean;
  blocksInRecovery: number;
  shadowPerformance: ShadowTrade[];
  recoveryIndicators: RecoveryIndicator[];
}
```

### 4.2 Decision Flow

```
For each block:
  1. Calculate Session Health Score
  2. Check drawdown levels
  3. Calculate pattern divergence scores
  4. Check fake verdict ratio

  If SHS < 50 OR drawdown at Level 3+:
    Enter Recovery Wait Mode

  While in Recovery Wait:
    Track shadow performance
    Check recovery criteria

  If recovery criteria met:
    Begin gradual re-entry protocol
```

### 4.3 Configuration Parameters

```json
{
  "sessionHealth": {
    "playableThreshold": 70,
    "cautionThreshold": 50,
    "unplayableThreshold": 50
  },
  "drawdown": {
    "warningLevel": -300,
    "cautionLevel": -500,
    "stopLevel": -800,
    "abortLevel": -1000
  },
  "baitSwitch": {
    "divergenceWarning": 0.25,
    "divergenceConfirmed": 0.40,
    "patternCountTrigger": 3
  },
  "verdicts": {
    "fakeRatioWarning": 0.20,
    "fakeRatioStop": 0.40
  },
  "recovery": {
    "minBlocksObserved": 5,
    "minShadowWinRate": 0.60,
    "maxFakeRatio": 0.20,
    "maxBlocksBeforeAbort": 20
  },
  "reentry": {
    "reducedStake": 100,
    "trialTradeCount": 3,
    "requiredWins": 2
  }
}
```

---

## Part 5: Metrics & Monitoring

### 5.1 New Metrics to Track

| Metric | Frequency | Purpose |
|--------|-----------|---------|
| Session Health Score | Every block | Real-time quality assessment |
| Pattern Divergence | On pattern break | Detect bait & switch patterns |
| Weighted Loss Score | Every loss | Track loss severity |
| Fake Verdict Ratio | Every 10 blocks | Detect adversarial market |
| Activation Velocity | Every hour | Detect pattern instability |
| Recovery Attempts | Per session | Track how often we enter/exit recovery |
| Shadow Performance | During recovery | Validate recovery criteria |

### 5.2 Alerting Thresholds

```
IMMEDIATE ALERTS:
- Session Health Score drops 20+ points in 5 blocks
- Single 'fake' verdict > 80%
- Drawdown crosses any level threshold
- 3 patterns break within 10 blocks

MONITORING ALERTS:
- Session in recovery mode > 10 blocks
- Fake ratio trending upward
- Win rate declining over 20-block window
```

### 5.3 Post-Session Analysis

Add to session summary:
- Time spent in recovery mode
- Number of recovery attempts
- Peak drawdown and recovery amount
- Bait & switch patterns identified
- Optimal stop point (retrospective analysis)

---

## Part 6: Open Questions for Investigation

### 6.1 Threshold Tuning

- What SHS threshold best balances false positives vs catching bad sessions?
- How many blocks of observation are needed for reliable divergence detection?
- What drawdown levels make sense given the daily target (R2,000)?

### 6.2 Pattern-Specific Behavior

- Do certain patterns (ZZ, PP, etc.) bait more than others?
- Should some patterns have different reliability requirements?
- Is there a "canary" pattern that fails first in bad sessions?

### 6.3 Recovery Timing

- How long do adverse conditions typically last?
- What percentage of sessions recover vs stay unplayable?
- Is there a time-of-day correlation with unplayable sessions?

### 6.4 Historical Analysis Needed

- Review past session logs to identify:
  - Common bait & switch patterns
  - Average time in unplayable state
  - False positive rate of current P1 mode
  - Correlation between early losses and session outcome

---

## Part 7: Recommended Investigation Steps

### Phase 1: Data Collection (Pre-Implementation Analysis)

1. **Export historical session data** to analyze:
   - Sessions with > R500 drawdown
   - Pattern activation/break velocities
   - Verdict distributions per session
   - Observation vs active performance (if recoverable)

2. **Identify prototype "bait & switch" sessions**:
   - Sessions that lost for extended periods
   - Sessions where multiple patterns activated then broke quickly
   - Sessions with high fake verdict ratios

3. **Establish baselines**:
   - Normal session SHS range
   - Typical pattern divergence in good vs bad sessions
   - Average recovery time after entering adverse conditions

### Phase 2: Design Validation

1. **Simulate proposed thresholds** against historical data:
   - Would the proposed drawdown stops have saved money?
   - What's the false positive rate (good sessions marked unplayable)?
   - How accurate is bait & switch detection?

2. **Refine parameters** based on simulation results

### Phase 3: Implementation

1. Implement SessionHealth calculation
2. Add PatternDivergence tracking
3. Implement LossSeverity weighting
4. Add Recovery mode with criteria
5. Implement gradual re-entry
6. Add new metrics to logging

---

## Summary: Key Takeaways

**The Problem:**
- Sessions can lose for hours because patterns consistently bait and switch
- Current P1 mode only catches trending markets, not pattern unreliability
- No mechanism to detect or respond to cumulative losses

**The Solution:**
1. **Session Health Score**: Real-time composite quality metric
2. **Bait & Switch Detection**: Compare observation vs active performance
3. **Drawdown Limits**: Hard stops at defined loss levels
4. **Verdict Analysis**: Use 'fake' verdict as adversarial market signal
5. **Recovery Mode**: Shadow trading until market stabilizes
6. **Gradual Re-entry**: Half-stake trial after recovery

**Expected Outcome:**
- Early detection of unplayable sessions (within 5-10 blocks instead of hours)
- Maximum loss limited to defined drawdown threshold (e.g., R800)
- Structured recovery process instead of continuous betting into losses
- Data-driven decision to resume or end session

---

*Document Version: 1.0*
*Created: 2025-12-06*
*Status: Investigation & Planning Phase*
