# Ghost Evaluator - Session Analysis Report

**Generated:** 2026-01-02
**Sessions Analyzed:** 67 (Dec 16, 2025 - Jan 2, 2026)
**Purpose:** Differentiate normal losses from hostile market conditions

---

## Executive Summary

| Category | Sessions | Total PnL | Avg PnL |
|----------|----------|-----------|---------|
| Profitable | 36 (56%) | +19,944 | +554 |
| Losing | 28 (44%) | -13,118 | -468 |
| **Net** | **64** | **+6,826** | **+107** |

---

## Part 1: Normal Loss Behavior (Profitable Sessions)

### Key Metrics from 36 Profitable Sessions (3,542 blocks, 1,694 losses)

| Metric | Value | Implication |
|--------|-------|-------------|
| **Overall Loss Rate** | 48% | Nearly half are losses - THIS IS NORMAL |
| **Avg Recovery Time** | 1.89 blocks | Fast bounce-back |
| **Median Loss PCT** | 51% | Mix of small and large losses |
| **100% Losses per Session** | ~33 | Extreme losses are common and recoverable |
| **Max Consecutive Losses** | 10 | Even 10-loss streaks can recover |
| **Max Drawdown (recovered)** | 579 points | Ended session at +1938 |

### Loss Clustering Pattern

| Cluster Size | Frequency | Percentage |
|--------------|-----------|------------|
| Single loss | 445 | 50.3% |
| 2 consecutive | 253 | 28.6% |
| 3 consecutive | 81 | 9.2% |
| 4 consecutive | 61 | 6.9% |
| 5+ consecutive | 44 | 5.0% |

**Key Insight:** 79% of loss events are isolated (1-2 losses). Clusters of 3+ are less common.

### Loss Magnitude Distribution

| Range | Count | Percentage |
|-------|-------|------------|
| 1-25% | 345 | 20.4% |
| 26-50% | 498 | 29.4% |
| 51-75% | 470 | 27.7% |
| 76-100% | 381 | 22.5% |

**Key Insight:** Losses are evenly distributed across ALL magnitudes. Even 100% losses occur regularly.

### What NOT to Trigger On (Normal in Profitable Sessions)

1. 48% loss rate - baseline, still profitable
2. Single 100% losses - happen ~33 times per session
3. 2-3 consecutive losses - 79% of all loss events
4. Drawdowns up to 500 points - fully recoverable
5. 3-block spacing between loss clusters - standard cadence
6. Opposite patterns both losing (8.6% of time both >70%)

---

## Part 2: Hostile Loss Behavior (Losing Sessions)

### Key Metrics from 28 Losing Sessions (1,157 trades, cumulative -13,118)

| Metric | Hostile Value | Normal Value | Difference |
|--------|---------------|--------------|------------|
| **Loss Rate** | 56.9% | 47.8% | +9.1% |
| **70%+ Loss Frequency** | 77% of losses | 22% of losses | +55% |
| **SameDir Win Rate** | 43.1% | 56.5% | -13.4% |
| **Max SameDir Cascade** | 7 consecutive | 1-2 | Much worse |
| **Q4 Acceleration** | 1.36x | 1.25x | +8.8% faster |

### Hostile Market Signatures

#### 1. SameDir Cascade Failures
- Maximum 7 consecutive SameDir losses in worst session
- SameDir represents 26% of trades but causes 77% of collapse damage
- **SameDir is uniquely vulnerable** to cascade failures

#### 2. Opposite Pattern Sync Failures
When market is hostile, BOTH paired patterns fail:

| Pattern Pair | Hostile WR | Normal WR | Gap |
|--------------|------------|-----------|-----|
| ZZ + AntiZZ | 48.6% + 44.1% | 58.8% + 60.9% | -10% to -17% |
| 2A2 + Anti2A2 | 49.1% + 40.5% | 54.4% + 58.5% | -5% to -18% |
| 3A3 + Anti3A3 | 49.3% + 50.8% | 50.9% + 70.1% | -1% to -19% |

**Key Insight:** This is adversarial, not random. Market actively works against BOTH strategies.

#### 3. High-PCT Loss Patterns
Patterns with highest 70%+ loss ratios in hostile sessions:

| Pattern | 70%+ Losses | Total Losses | Ratio |
|---------|-------------|--------------|-------|
| Anti4A4 | 13 | 14 | 93% |
| OZ | 28 | 31 | 90% |
| 5A5 | 9 | 11 | 82% |
| Anti5A5 | 4 | 5 | 80% |
| SameDir | 133 | 173 | 77% |

#### 4. Q4 Collapse Pattern
Hostile sessions show win rate collapse in final quarter:

| Session | Q1 | Q2 | Q3 | Q4 (Collapse) |
|---------|----|----|----|----|
| 2025-12-18T08:51 | 67% | 42% | 75% | **9%** |
| 2025-12-17T06:32 | 50% | 0% | 50% | **25%** |
| 2025-12-27T12:41 | 50% | 0% | 50% | **0%** |

**Key Insight:** Markets appear normal for 75%, then catastrophically fail in Q4.

### Most Vulnerable Patterns in Hostile Markets

| Pattern | Hostile WR | Normal WR | Danger Level |
|---------|------------|-----------|--------------|
| 6A6 | 0% | 75% | Extreme |
| Anti5A5 | 17% | 57% | Extreme |
| Anti4A4 | 26% | 67% | Extreme |
| OZ | 38% | 61% | Very High |
| Anti3A3 | 51% | 70% | High |
| Anti2A2 | 41% | 59% | High |
| PP | 39% | 55% | High |
| SameDir | 43% | 57% | High (common) |

---

## Part 3: Big P&L Swing Analysis

### Sessions with Major Drawdowns (>300 points)

| Recovery Status | Count | Percentage |
|-----------------|-------|------------|
| Recovered | 34 | 60% |
| Did not recover | 23 | 40% |

### Case Study: Jan 1 17:46 (No Recovery)

**Peak: +1324 -> Valley: -26 (Drawdown: 1350)**

| Phase | Trades | What Happened |
|-------|--------|---------------|
| Peak | 1-47 | Reached +1324 with ZZ pattern |
| Collapse Start | 48-52 | SameDir failed (-26, -100) |
| Rapid Decline | 53-64 | Win rate 30.8%, SameDir dominant |
| Final Plunge | 65-73 | SameDir -160, Anti3A3 -128 |

**Critical Point:** By trade 53 (6 trades after peak), already down 358 (-27% of peak)

### Case Study: Dec 25 14:28 (Successful Recovery)

**Peak: +1106 -> Valley: -144 (Drawdown: 1250) -> Final: +126**

| Phase | Trades | What Happened |
|-------|--------|---------------|
| Peak | 1-65 | Reached +1106 |
| Collapse | 66-99 | Win rate dropped to 32.3% |
| Recovery | 100-114 | SameDir 15 trades, 66.7% WR |
| Result | - | Recovered +428 in 23 trades |

**Key Insight:** SameDir triggered collapse AND enabled recovery. The difference is win rate.

### Recovery Patterns

**What triggers recovery:**
1. ZZ pattern appears with win (8 sessions)
2. Anti2A2 kicks in (6 sessions)
3. SameDir returns to >60% WR (5 sessions)
4. Valley occurs before half the session

**What prevents recovery:**
1. Session ends at/near valley (no time)
2. SameDir stays below 30% WR
3. 40-80 trades without any winning pattern
4. Valley occurs in final quarter

### Collapse-Triggering vs Recovery-Enabling Patterns

| Role | Patterns | Count |
|------|----------|-------|
| Collapse Triggers | SameDir (8), ZZ (6), 2A2 (3), Anti3A3 (2) | - |
| Recovery Enablers | ZZ (8), Anti2A2 (6), SameDir (5), AntiZZ (4) | - |

---

## Part 4: Early Warning Indicators

### Warning Signs (Can be detected early):

| Signal | Detection Point | Reliability |
|--------|-----------------|-------------|
| Win rate <30% in 10 trades | Trade 10+ | High |
| 3+ consecutive same-pattern losses | Trade 3+ | High |
| ZZ + AntiZZ both lose in sequence | After both | Very High |
| 3+ losses >70% in 5 blocks | 5 blocks | High |
| Pattern switching without wins | 5+ patterns | Medium |

### What Cannot Be Detected Early:

1. Q4 collapse - only visible at 75% of session
2. Single 100% loss turning into cascade
3. Market regime change mid-session
4. Session that "looks normal" then fails

---

## Part 5: Recommendations

### Don't Trigger On (Normal):

| Metric | Threshold | Reason |
|--------|-----------|--------|
| Loss rate | <55% | 48% is baseline |
| Single losses | Any magnitude | 100% losses recover |
| Consecutive losses | <3 | 79% are 1-2 losses |
| Drawdown | <600 points | 579 recovered to +1938 |
| Recovery time | <10 blocks | Average is 1.89 |

### Do Trigger On (Hostile):

| Metric | Threshold | Reason |
|--------|-----------|--------|
| SameDir cascade | 3+ consecutive | Primary collapse signature |
| Opposite sync fail | Both lose in sequence | Adversarial market |
| 70%+ loss cluster | 3+ in 5 blocks | Hostile loss pattern |
| Win rate collapse | <30% over 10 trades | System-wide failure |
| Cross-pattern fail | 2+ patterns in 3 blocks | Multiple systems down |

### The SameDir Rule

**Monitor SameDir win rate:**
- If <30% over 5+ trades: Hostile, consider pause
- If >60% over 5+ trades: Recovery mode, continue
- SameDir is both the biggest danger AND the biggest recovery signal

---

## Appendix: Top Sessions

### Most Profitable (Recovered from Large Drawdowns)

| Session | Drawdown | Final PnL | Recovery |
|---------|----------|-----------|----------|
| Dec 31 09:57 | 540 | +2632 | Full |
| Dec 17 19:53 | 530 | +2054 | Full |
| Dec 30 09:02 | 352 | +1854 | Full |
| Dec 30 19:33 | 812 | +1608 | Full |
| Dec 29 12:07 | 610 | +1618 | Full |

### Most Damaging (Never Recovered)

| Session | Peak | Valley | Final PnL |
|---------|------|--------|-----------|
| Dec 28 11:52 | - | -1520 DD | -364 |
| Dec 17 21:37 | - | -1362 DD | -1088 |
| Jan 1 17:46 | +1324 | -26 | -26 |
| Dec 17 08:01 | - | -1280 DD | -738 |
| Dec 18 08:51 | - | -1262 DD | -650 |

---

*This analysis is based on 64 sessions with 4,892 total trades.*
