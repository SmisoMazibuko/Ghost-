# Pattern Cycle Optimization Analysis Guide

## Purpose
This document serves as a comprehensive reference for analyzing pattern activation and deactivation (killing/breaking) logic. The goal is to optimize WHEN patterns transition between states, not which patterns to use.

**Core Insight**: All patterns have winning phases. The challenge is knowing when to activate and when to break.

---

## Table of Contents
1. [Key Analysis Questions](#key-analysis-questions)
2. [Data Requirements](#data-requirements)
3. [Metrics & Calculations](#metrics--calculations)
4. [Analysis Procedures](#analysis-procedures)
5. [Decision Framework](#decision-framework)

---

## Key Analysis Questions

### Category 1: Activation Timing

#### Q1.1: Are we activating too early?
**What we're measuring**: Do patterns that activate quickly (few observations) perform worse than those that wait longer?

**Data needed**:
- `observationCountBeforeActivation`: How many results accumulated before activation
- `activePeriodPnL`: Total profit during the subsequent active period
- `activePeriodWinRate`: Win rate during active period

**Hypothesis**: Activating after more observations = better performance

**Analysis**:
```
Group activations by observation count (1-2, 3-4, 5-6, 7+)
Compare average active period PnL across groups
```

---

#### Q1.2: Are we activating too late?
**What we're measuring**: How much profit do we miss while observing?

**Data needed**:
- `missedProfitWhileObserving`: Sum of positive results we didn't bet on
- `avoidedLossWhileObserving`: Sum of negative results we didn't bet on
- `netObservationCost`: missed - avoided

**Analysis**:
```
If netObservationCost > 0: We're waiting too long (missing more than avoiding)
If netObservationCost < 0: Observation is protecting us (avoiding more than missing)
```

---

#### Q1.3: What observation streak best predicts successful activation?
**What we're measuring**: Does requiring consecutive fair verdicts before activation improve outcomes?

**Data needed**:
- `consecutiveFairBeforeActivation`: Streak length at activation moment
- `activePeriodPnL`: Subsequent performance

**Current threshold**: 70% single OR 100% cumulative
**Question**: Should we add a streak requirement?

**Analysis**:
```
Compare activation outcomes by streak length:
- Activated after 0-1 consecutive fair
- Activated after 2-3 consecutive fair
- Activated after 4+ consecutive fair
```

---

#### Q1.4: Does market context affect activation success?
**What we're measuring**: Are activations during certain market conditions more successful?

**Data needed**:
- `runLengthAtActivation`: Current run length when activating
- `avgPctLast5Blocks`: Recent volatility measure
- `directionBalanceLast10`: Recent direction distribution
- `activePeriodPnL`: Outcome

**Analysis**:
```
Correlation analysis:
- Activation success vs run length
- Activation success vs recent volatility
- Activation success vs direction balance
```

---

### Category 2: Break/Kill Timing

#### Q2.1: Are we breaking too early?
**What we're measuring**: After breaking, would continuing have been profitable?

**Data needed**:
- `postBreakResults[5]`: Next 5 pattern results after break
- `postBreakPnL`: What we would have made/lost
- `breakWasCorrect`: True if postBreakPnL < 0

**Analysis**:
```
breakAccuracy = count(breakWasCorrect) / totalBreaks
If breakAccuracy < 50%: We're breaking too early
```

---

#### Q2.2: Are we breaking too late?
**What we're measuring**: How much do we lose before breaking?

**Data needed**:
- `peakProfitDuringActive`: Highest cumulative during active period
- `profitAtBreak`: Cumulative when we broke
- `drawdownAtBreak`: peak - profitAtBreak

**Analysis**:
```
avgDrawdownAtBreak = average of all drawdownAtBreak values
If avgDrawdownAtBreak > threshold: We're holding too long
```

---

#### Q2.3: Should break threshold depend on pattern type?
**What we're measuring**: Do different patterns need different break sensitivity?

**Data needed**:
- Per-pattern break outcomes
- Per-pattern recovery rates after breaking
- Per-pattern typical run lengths

**Current behavior**: All patterns break on first loss while active
**Question**: Should some patterns have more tolerance?

**Analysis**:
```
For each pattern:
- Calculate % of breaks that were "premature" (would have recovered)
- Calculate % of breaks that were "correct" (avoided further loss)
- Recommend adjustment if pattern-specific rates differ significantly
```

---

#### Q2.4: Does the break loss size predict recovery?
**What we're measuring**: Are patterns that break on small losses more likely to recover than those breaking on large losses?

**Data needed**:
- `breakLossPct`: The percentage of the losing block
- `postBreakRecovery`: Did pattern become profitable again?
- `blocksToRecovery`: How long until profitable activation?

**Analysis**:
```
Group breaks by breakLossPct (low: <40, medium: 40-70, high: >70)
Compare recovery rates across groups
```

---

### Category 3: Structural Kills

#### Q3.1: Are structural kill rules accurate?
**What we're measuring**: When we kill AP5/OZ/PP/ST for structural reasons, was it correct?

**Data needed**:
- `structuralKillReason`: Which rule triggered
- `postKillResults[10]`: What would have happened
- `killWasCorrect`: True if postKillResults show loss

**Current rules**:
- AP5: Kill when flip < 2 blocks
- OZ: Kill when flip-back < 3 blocks
- PP: Kill when run >= 3 or two singles
- ST: Kill when run >= 3

**Analysis**:
```
Per pattern, per rule:
- Count total kills by this rule
- Count correct vs incorrect kills
- Calculate rule accuracy
```

---

#### Q3.2: Should structural kill rules be modified?
**What we're measuring**: Would different thresholds perform better?

**Data needed**:
- Historical data with counterfactual analysis
- What if AP5 kill threshold was 1 instead of 2?
- What if PP allowed run of 3?

**Analysis**:
```
Backtest alternative rules against historical data
Compare total PnL under current vs alternative rules
```

---

### Category 4: Observation Period Analysis

#### Q4.1: What happens during observation?
**What we're measuring**: Full characterization of observation periods

**Data needed**:
- `observationDuration`: Blocks spent observing
- `observationResults[]`: All results during observation
- `observationEndReason`: "activated" or "session_ended"

**Analysis**:
```
Distribution of observation durations
Pattern of results during observation (streaks, alternations)
Activation rate (% of observations that become active)
```

---

#### Q4.2: Is observation serving its purpose?
**What we're measuring**: Does observation filter out bad periods?

**Data needed**:
- Compare sessions where patterns activated quickly vs slowly
- Overall session PnL correlation with observation strictness

**Analysis**:
```
Hypothesis: Sessions with more careful observation have better outcomes
Test: Correlation(avgObservationDuration, sessionPnL)
```

---

### Category 5: B&S (Bait-and-Switch) Effectiveness

#### Q5.1: Is B&S bucket entry accurate?
**What we're measuring**: When we enter B&S (pattern broke on >= 70% loss), does the inverse bet work?

**Data needed**:
- `bnsEntryLoss`: Loss that triggered B&S
- `bnsInverseResults[]`: Results of inverse bets
- `bnsExitReason`: How we left B&S

**Analysis**:
```
bnsSuccessRate = wins / totalBnsBets
Compare bnsSuccessRate to regular pattern success rate
```

---

#### Q5.2: Should B&S entry threshold change?
**What we're measuring**: Is 70% the right threshold for entering B&S?

**Data needed**:
- Break events with loss amount
- Post-break behavior (would inverse have worked?)

**Analysis**:
```
Test thresholds: 60%, 70%, 80%, 90%
For each: Calculate hypothetical B&S success rate
Recommend optimal threshold
```

---

### Category 6: Activation Threshold Optimization

#### Q6.1: Is the 70% single threshold optimal for MAIN bucket?
**What we're measuring**: Would different single thresholds produce better outcomes?

**Data needed**:
- `ObservationStepEvent` with all threshold crossing flags
- `ActivationThresholdRecord` with backtest data
- Outcome PnL for each activation

**Alternative thresholds to test**: 50%, 60%, 80%, 90%

**Analysis**:
```
For each threshold T in [50, 60, 70, 80, 90]:
  - Find all activations that WOULD have triggered at T
  - Calculate hypothetical PnL for each
  - Compare to actual performance

Optimal threshold = argmax(average hypothetical PnL)
```

---

#### Q6.2: Is the 100% cumulative threshold optimal for MAIN bucket?
**What we're measuring**: Would different cumulative thresholds produce better outcomes?

**Data needed**:
- `ObservationStepEvent` with running cumulative totals
- `ActivationThresholdRecord` with backtest data

**Alternative thresholds to test**: 50%, 80%, 120%, 150%

**Analysis**:
```
For each threshold T in [50, 80, 100, 120, 150]:
  - Find first observation step where cumulative >= T
  - Calculate what PnL would have been from that point
  - Compare across thresholds
```

---

#### Q6.3: Should B&S bucket have different thresholds than MAIN?
**What we're measuring**: Do inverse bets benefit from stricter/looser activation?

**Data needed**:
- Separate `ActivationThresholdRecord` tagged with `bucket: 'BNS'`
- B&S-specific outcome tracking
- `BnsActivationContext` for entry conditions

**Hypothesis**: B&S might need:
- Higher single threshold (more confirmation before inverse)
- OR lower threshold (capitalize on bait faster)

**Analysis**:
```
Split activations by bucket (MAIN vs BNS)
Run threshold optimization separately for each
Compare optimal thresholds:
  - If BNS optimal > MAIN optimal: B&S needs more confirmation
  - If BNS optimal < MAIN optimal: B&S should be more aggressive
```

---

#### Q6.4: Does optimal threshold depend on pattern type?
**What we're measuring**: Should 2A2 have different thresholds than PP?

**Data needed**:
- Per-pattern threshold backtest data
- Per-pattern outcome distributions

**Analysis**:
```
For each pattern:
  Run threshold optimization

Result table:
Pattern    Optimal Single    Optimal Cumulative
2A2        75%              100%
PP         65%              80%
ZZ         N/A              N/A (pocket system)
...
```

---

#### Q6.5: Does optimal threshold depend on market context?
**What we're measuring**: Should thresholds adapt to volatility/trends?

**Data needed**:
- `MarketContext` at each activation
- Threshold backtest outcomes grouped by context

**Analysis**:
```
Segment activations by:
- High volatility (avgPctLast5 > 60) vs Low volatility (< 40)
- Trending (direction balance > 70%) vs Choppy (< 60%)

Run threshold optimization for each segment
Check if optimal differs significantly
```

---

#### Q6.6: What's the cost of the current 70%/100% thresholds?
**What we're measuring**: How much are we leaving on the table?

**Data needed**:
- All `ObservationStepEvent` sequences
- Counterfactual calculations

**Analysis**:
```
For each observation period that ended in activation:
  actual_activation_point = when 70% or 100% crossed
  optimal_activation_point = backtest-determined best point

  If optimal < actual: We waited too long
    cost = profit missed between optimal and actual

  If optimal > actual: We activated too early
    cost = losses incurred between actual and optimal

Total threshold cost = sum of all costs
```

---

### Category 7: ZZ/AntiZZ Pocket System

#### Q7.1: Is the pocket system working?
**What we're measuring**: Does pocket 1 (active) outperform pocket 2 (observe)?

**Data needed**:
- `zzPocket1Results[]`: All ZZ results when in pocket 1
- `zzPocket2Results[]`: All ZZ results when in pocket 2 (imaginary)

**Analysis**:
```
pocket1AvgProfit vs pocket2AvgProfit
If pocket2AvgProfit > pocket1AvgProfit: System is backwards
```

---

#### Q7.2: Is runProfitZZ threshold correct?
**What we're measuring**: Should pocket determination use a different threshold than 0?

**Current rule**: `runProfitZZ >= 0 ? pocket1 : pocket2`
**Question**: What if threshold was -50 or +50?

**Data needed**:
- All pocket transitions with runProfitZZ values
- Subsequent performance after transition

**Analysis**:
```
Backtest alternative thresholds
Compare performance under different rules
```

---

#### Q7.3: Is AntiZZ activation timing correct?
**What we're measuring**: Should AntiZZ activate on different conditions?

**Current rule**: AntiZZ activates when ZZ first bet is negative
**Question**: Should it require larger negative or wait for confirmation?

**Data needed**:
- `antiZZActivationContext`: ZZ loss that triggered
- `antiZZResult`: Win or loss
- `antiZZProfitAmount`: Profit/loss amount

**Analysis**:
```
AntiZZ win rate by triggering ZZ loss size
Optimal activation threshold
```

---

### Category 8: Cross-Pattern Analysis

#### Q8.1: Do patterns interfere with each other?
**What we're measuring**: When multiple patterns are active, do they cannibalize?

**Data needed**:
- `activePatternsAtBlock`: Which patterns were active
- `betPlacedFor`: Which pattern got the bet
- `otherPatternsWouldHave`: What other active patterns predicted

**Analysis**:
```
When 2+ patterns active:
- Agreement rate (same direction)
- Performance when agreeing vs disagreeing
- Should we have priority rules?
```

---

#### Q8.2: Should patterns have activation dependencies?
**What we're measuring**: Should some patterns only activate when others are in certain states?

**Data needed**:
- Pattern activation sequences
- Co-activation outcomes

**Analysis**:
```
Identify patterns that perform poorly when others are active
Test dependency rules: "Don't activate X when Y is active"
```

---

### Category 9: Session-Level Patterns

#### Q9.1: Are there session types?
**What we're measuring**: Do sessions cluster into types (trending, choppy, etc.)?

**Data needed**:
- Per-session: direction balance, avg run length, volatility
- Per-session: which patterns performed best

**Analysis**:
```
Cluster analysis on session characteristics
Pattern performance by cluster
```

---

#### Q9.2: Can we adapt mid-session?
**What we're measuring**: Can early session behavior predict optimal strategy?

**Data needed**:
- First N blocks characteristics
- Remaining session pattern performance

**Analysis**:
```
Predict session type from first 20 blocks
Adjust activation aggressiveness based on prediction
```

---

## Data Requirements

### New Events to Log

#### 1. CycleTransitionEvent
```typescript
{
  type: 'cycle_transition',
  ts: string,
  blockIndex: number,
  pattern: PatternName,
  fromState: 'observing' | 'active' | 'broken',
  toState: 'observing' | 'active' | 'broken',
  trigger: string,  // 'single_70', 'cumulative_100', 'loss', 'structural_kill', etc.

  observationSummary?: {
    count: number,
    consecutiveFair: number,
    cumulativeProfit: number,
    maxSingleProfit: number
  },

  marketContext: {
    runLength: number,
    runDirection: Direction,
    avgPctLast5: number,
    recentVerdicts: string[]  // Last 5
  }
}
```

#### 2. CounterfactualEvent
```typescript
{
  type: 'counterfactual',
  ts: string,
  blockIndex: number,
  pattern: PatternName,
  actualState: 'observing' | 'broken',
  hypotheticalResult: {
    wouldHaveBet: boolean,
    verdict: string,
    pct: number,
    profit: number  // + or -
  }
}
```

#### 3. BreakAnalysisEvent
```typescript
{
  type: 'break_analysis',
  ts: string,
  blockIndex: number,
  pattern: PatternName,
  breakType: 'loss' | 'structural_kill',
  breakReason: string,

  activeRunSummary: {
    duration: number,
    trades: number,
    peakProfit: number,
    profitAtBreak: number,
    drawdown: number
  },

  // Populated as subsequent blocks arrive
  postBreakResults: {
    index: number,
    verdict: string,
    pct: number,
    hypotheticalProfit: number
  }[]  // Next 5-10 results
}
```

#### 4. ActivationQualityEvent
```typescript
{
  type: 'activation_quality',
  ts: string,
  pattern: PatternName,
  activationBlockIndex: number,

  // Filled when activation period ends
  outcome: {
    duration: number,
    totalPnL: number,
    winRate: number,
    wasSuccessful: boolean  // PnL > 0
  }
}
```

### Enhanced Session Summary

```typescript
{
  // ... existing summary fields ...

  cycleOptimizationMetrics: {
    perPattern: {
      [pattern: PatternName]: {
        // Activation metrics
        activationCount: number,
        avgObservationBeforeActivation: number,
        activationSuccessRate: number,  // % that were profitable

        // Break metrics
        breakCount: number,
        avgDrawdownAtBreak: number,
        breakAccuracy: number,  // % that avoided further loss

        // Counterfactual metrics
        missedProfitWhileObserving: number,
        avoidedLossWhileObserving: number,
        netObservationValue: number
      }
    },

    // Session-level
    totalActivations: number,
    totalBreaks: number,
    avgActivationSuccess: number,
    avgBreakAccuracy: number
  }
}
```

---

## Metrics & Calculations

### Activation Success Rate
```
activationSuccessRate = count(activePeriodPnL > 0) / totalActivations
```

### Break Accuracy
```
breakAccuracy = count(postBreakPnL < 0) / totalBreaks
// Higher = breaks were correct decisions
```

### Net Observation Value
```
netObservationValue = avoidedLoss - missedProfit
// Positive = observation helped
// Negative = observation hurt
```

### Optimal Observation Length
```
For each observationLength in [1, 2, 3, ...]:
  Calculate avgActivePeriodPnL for activations with this observation length
Find length that maximizes avgActivePeriodPnL
```

### Pattern Interaction Score
```
For patterns A and B:
  coActiveBlocks = blocks where both were active
  A_pnl_when_coactive = sum of A results during coActiveBlocks
  A_pnl_when_solo = sum of A results when only A active
  interactionScore = A_pnl_when_coactive - A_pnl_when_solo
// Negative = B hurts A's performance
```

---

## Analysis Procedures

### Procedure 1: Weekly Activation Review
1. Export all CycleTransitionEvents from past week
2. Group by pattern
3. For each pattern:
   - Calculate activation success rate
   - Compare to previous week
   - Identify trends

### Procedure 2: Break Timing Audit
1. For each break event:
   - Wait 10 blocks
   - Calculate postBreakPnL
   - Mark as correct/incorrect
2. Calculate overall break accuracy
3. Identify patterns with poor break timing

### Procedure 3: Observation Cost Analysis
1. Sum all counterfactual profits (while observing)
2. Separate into missed profits vs avoided losses
3. Calculate net observation value
4. Compare across patterns

### Procedure 4: Threshold Optimization
1. Collect historical activation thresholds crossed
2. Backtest alternative thresholds
3. Calculate hypothetical performance
4. Recommend adjustments

---

## Decision Framework

### When to Increase Activation Threshold
- Activation success rate < 50%
- Net observation value > 0 (observation is helping)
- Many premature activations followed by immediate breaks

### When to Decrease Activation Threshold
- Activation success rate > 70%
- Net observation value < -100 per session (missing too much)
- Long observation periods with consistent fair results

### When to Adjust Break Sensitivity
- Break accuracy < 40% (breaking too early)
- Average drawdown at break > 150 (breaking too late)
- Significant difference between pattern break accuracies

### When to Modify Structural Kill Rules
- Kill accuracy < 50% for a specific rule
- Pattern showing different behavior than rule assumes
- New market conditions invalidating old rules

---

## Implementation Priority

### Phase 1: Core Transition Logging
1. Add CycleTransitionEvent logging
2. Capture observation summary at activation
3. Capture market context at transition

### Phase 2: Counterfactual Tracking
1. Track results for patterns in observing state
2. Calculate missed/avoided profits
3. Add to session summary

### Phase 3: Break Analysis
1. Track post-break results (next 5-10)
2. Calculate break accuracy
3. Add to session summary

### Phase 4: Advanced Analytics
1. Pattern interaction analysis
2. Session type classification
3. Adaptive threshold recommendations

---

## Usage Notes

This document should be referenced when:
1. Analyzing session performance
2. Debugging unexpected losses
3. Tuning activation/break parameters
4. Evaluating system changes

All analysis should start with the question: "Is this a timing issue (activation/breaking) or a pattern issue (detection logic)?"

Based on session comparisons, **timing is the primary lever** - patterns themselves are sound.
