# Research Testing Methodology
## Ghost Evaluator v15.1 - Hypothesis Testing Framework

---

## Purpose

Test assumptions about P1 and B&S modes, and discover new indicators through systematic hypothesis testing.

---

## How It Works

### 1. Data Collection (Phase 1 - DONE)
- `ResearchLogger` collects block-by-block data
- Tracks P1 events with hypothetical reversal plays
- Tracks B&S cycles per pattern with hypothetical inverse P/L
- Saves to `.research.json` files

### 2. Hypothesis Testing (Phase 2 - THIS)
- Define testable hypotheses
- Run tests against collected data
- Generate confidence scores
- Identify which assumptions hold

### 3. Indicator Discovery (Phase 3 - FUTURE)
- Correlate indicators with outcomes
- Find new predictive signals
- Refine thresholds

---

## Defined Hypotheses

### P1 Hypotheses (7 tests)

| ID | Hypothesis | What We're Testing |
|----|------------|-------------------|
| P1_H1 | Run Length Distribution | Do most P1s end at 7-9? |
| P1_H2 | Reversal at 7 Profitable | Is betting reversal at run 7 profitable (>50% win)? |
| P1_H3 | Reversal Scales with Length | Does win rate increase at 8, 9, 10+? |
| P1_H4 | Pre-P1 Escalation | Do run lengths escalate before P1 (3→4→5→6→7)? |
| P1_H5 | Pre-P1 Pattern Failures | Do patterns break before P1? |
| P1_H6 | Recovery Time | Does market take 10-20 blocks to normalize after P1? |
| P1_H7 | False vs Real P1 Ratio | Are most 7-runs "false P1" (end at 7-8)? |

### B&S Hypotheses (6 tests)

| ID | Hypothesis | What We're Testing |
|----|------------|-------------------|
| BNS_H1 | 2 Cycle Threshold | Does 2 cycles reliably predict more B&S? |
| BNS_H2 | Inverse Profitable | Is betting inverse during B&S profitable? |
| BNS_H3 | Pattern Clustering | Does B&S affect multiple patterns together? |
| BNS_H4 | Duration | Does B&S last 15-30 blocks? |
| BNS_H5 | Exit Reliability | Does 2 confirmations reliably exit B&S? |
| BNS_H6 | B&S Precedes P1 | Does B&S dominant state precede P1? |

### Indicator Hypotheses (6 tests)

| ID | Hypothesis | What We're Testing |
|----|------------|-------------------|
| IND_H1 | Choppy Indicator | Does avg run < 1.5 predict unprofitable state? |
| IND_H2 | Direction Imbalance | Does >65% same direction predict trend/P1? |
| IND_H3 | Pattern Churn | Does 3+ breaks in 10 blocks indicate hostile market? |
| IND_H4 | Win Rate Decline | Does <45% win rate predict continued losses? |
| IND_H5 | High Pct Loss | Does single >70% loss indicate hostile conditions? |
| IND_H6 | Alternating 3A3 | Does 3-3-3 pattern predict P1 within 10 blocks? |

---

## Usage

### Running Tests

```typescript
import { createResearchTestRunner } from './data';

// Create runner
const runner = createResearchTestRunner('./data/sessions');

// Run all tests
const results = runner.runAllTests();

// Run by category
const p1Results = runner.runCategoryTests('P1');
const bnsResults = runner.runCategoryTests('BNS');

// Generate report
runner.saveReport(results);
```

### Interpreting Results

Each hypothesis result includes:

```typescript
{
  hypothesisId: 'P1_H2',
  supported: true,          // Is the hypothesis supported?
  confidence: 67.5,         // How confident (0-100%)
  sampleSize: 40,           // How many data points
  details: [                // Specific metrics
    {
      metric: 'Win rate at reversal 7',
      expected: '>50%',
      actual: '67.5%',
      passed: true
    }
  ],
  recommendations: [...]    // What to do based on results
}
```

### Report Output

The runner generates a markdown report:

```
# Research Hypothesis Test Report

## Summary
- Total Hypotheses Tested: 19
- Supported: 12 (63.2%)
- Not Supported: 7

### P1 Hypotheses: 5/7 supported

#### P1_H2: Reversal at 7 Profitable
- Supported: ✅ YES
- Confidence: 67.5%
- Sample Size: 40
- Details:
  - ✓ Win rate at reversal 7: 67.5% (expected: >50%)
- Recommendations: Reversal at 7 is viable strategy
```

---

## Data Requirements

For meaningful results, you need:

| Hypothesis Type | Minimum Data |
|-----------------|--------------|
| P1 | 20+ P1 events |
| B&S | 50+ B&S cycles across patterns |
| Indicators | 500+ blocks with trade outcomes |

Current data in sessions will be analyzed. More sessions = higher confidence.

---

## Adding New Hypotheses

To test a new assumption:

```typescript
const NEW_HYPOTHESIS: Hypothesis = {
  id: 'P1_H8',
  name: 'Your Hypothesis Name',
  description: 'What you are testing',
  category: 'P1',
  testFunction: (data: TestingData) => {
    // Your test logic
    // Return HypothesisResult
  },
};
```

---

## What This Tells Us

### If P1_H2 is Supported (Reversal at 7 profitable):
→ We can implement P1 reversal plays at run length 7

### If P1_H3 is Supported (Win rate scales):
→ Use larger stakes at longer runs (7 < 8 < 9 < 10+)

### If BNS_H1 is Supported (2 cycles predicts more):
→ Switch to inverse at 2 cycles, not 3

### If BNS_H2 is Supported (Inverse profitable):
→ Implement inverse sub-strategy during B&S

### If IND_H1 is Supported (Choppy indicator):
→ Use avg run length < 1.5 as stop signal

---

## Next Steps

1. **Run sessions** to collect more research data
2. **Execute tests** with `runner.runAllTests()`
3. **Review report** to see which assumptions hold
4. **Refine thresholds** based on actual data
5. **Implement strategies** for supported hypotheses

---

*Document Version: 1.0*
*Created: 2025-12-09*
