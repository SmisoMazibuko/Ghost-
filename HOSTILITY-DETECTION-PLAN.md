# Hostility Detection System - Implementation Plan

**Created:** 2026-01-02
**Status:** Approved for Implementation

---

## Problem Statement

The system currently has:
- Per-system pause (BUCKET/SAMEDIR) at -300 milestones
- Minor pause after 2 consecutive losses
- Stop game at -1000 absolute P/L

**What's missing:** Detection of hostile market conditions where ALL patterns fail together, causing cascade failures that the current system doesn't catch early enough.

---

## Data Analysis Summary

### Normal Losses (Profitable Sessions - DON'T TRIGGER ON):

| Metric | Normal Value | Notes |
|--------|--------------|-------|
| Loss rate | 48% | Sessions still highly profitable |
| Single 100% losses | ~33/session | Fully recoverable |
| Consecutive losses | 1-2 typical, max 10 | Still recoverable |
| Recovery time | 1.89 blocks avg | Fast bounce-back |
| Max drawdown | 579 points | Still ended +1938 |
| Opposite pattern fails | 8.6% of time | Both >70% is normal |

### Hostile Losses (Losing Sessions - MUST DETECT):

| Metric | Hostile Value | Difference |
|--------|---------------|------------|
| SameDir cascade | 3-7 consecutive | vs 1-2 normal |
| Opposite sync fail | Both ZZ+AntiZZ lose | Adversarial market |
| 70%+ loss frequency | 77% of all losses | vs ~22% normal |
| Q4 acceleration | 1.36x | vs 1.25x normal |
| Win rate collapse | Drops to 9-40% in Q4 | vs stable 48% |

### Key Finding: The SameDir Paradox

- SameDir triggers 8/28 collapses (most dangerous)
- SameDir also enables 5/34 recoveries (when it works)
- **Difference:** Win rate <30% = collapse, Win rate >60% = recovery

---

## Proposed Solution: Hostility Score System

### Core Concept

Create a **rolling hostility score** that accumulates evidence of hostile market conditions. Trigger pause only when score exceeds threshold, indicating multiple simultaneous warning signs.

### Hostility Indicators

| Indicator | Trigger Condition | Score Weight | Rationale |
|-----------|-------------------|--------------|-----------|
| **Cascade Failure** | 3+ consecutive losses (same pattern) | +3 | SameDir shows 3-7 cascades in hostile |
| **Cross-Pattern Fail** | 2+ different patterns lose in 3 blocks | +2 | Multiple systems failing together |
| **Opposite Sync Fail** | Pattern + Opposite both lose (e.g., ZZ then AntiZZ) | +4 | Adversarial market signature |
| **High-PCT Loss** | Any loss at 80%+ | +1 | Severe losses accumulating |
| **High-PCT Cluster** | 3+ losses >70% in 5 blocks | +3 | Hostile loss pattern |
| **Win Rate Collapse** | Rolling 10-trade WR <30% | +2 | System-wide failure |

### Score Decay

- Each winning trade: Decay score by 2 points
- Each block with no trade: Decay by 0.5 points
- Minimum score: 0

### Thresholds (Confirmed)

| Hostility Score | Action | Affected Systems |
|-----------------|--------|------------------|
| 0-4 | **NORMAL** - continue trading | All systems active |
| 5-7 | **CAUTION** - skip trades <60% confidence | Bucket + SameDir (ZZ/AntiZZ continue) |
| 8-10 | **PAUSE** - 5 blocks | Bucket + SameDir (ZZ/AntiZZ continue) |
| 11+ | **EXTENDED PAUSE** - 10 blocks | Bucket + SameDir (ZZ/AntiZZ continue) |

**Key Decision:** ZZ/AntiZZ are EXEMPT from hostility pause (best performers, only stop on STOP_GAME)

### Recovery Detection (Conservative)

Resume trading when BOTH conditions are met:
1. Hostility score decays below 4, AND
2. One of these recovery signals appears:
   - ZZ or Anti2A2 shows a win
   - SameDir shows 2 consecutive wins
   - Rolling 5-trade WR returns to >50%

**Note:** Both conditions required - won't resume just because time passed OR just because one win occurred.

---

## Implementation Details

### New File: `src/engine/hostility-detector.ts`

```typescript
interface HostilityIndicator {
  type: 'CASCADE' | 'CROSS_PATTERN' | 'OPPOSITE_SYNC' | 'HIGH_PCT' | 'HIGH_PCT_CLUSTER' | 'WR_COLLAPSE';
  weight: number;
  triggeredAt: number;  // block index
  details: string;
}

interface HostilityState {
  score: number;
  level: 'normal' | 'caution' | 'pause' | 'extended_pause';
  indicators: HostilityIndicator[];
  recentTrades: TradeResult[];  // last 10 trades for rolling WR
  lastPatternLosses: Map<string, number[]>;  // track consecutive losses per pattern
  oppositeFailures: OppositeFailure[];  // track opposite pattern failures
  pauseBlocksRemaining: number;  // 0 if not paused
  recoverySignalSeen: boolean;
}

class HostilityDetector {
  // Track and score hostility
  updateAfterTrade(trade: CompletedTrade): void;

  // Get current hostility level
  getLevel(): 'normal' | 'caution' | 'pause' | 'extended_pause';

  // Check if pattern can trade (ZZ/AntiZZ always true, others depend on level)
  canPatternTrade(pattern: string, confidence: number): boolean {
    if (pattern === 'ZZ' || pattern === 'AntiZZ') return true;  // EXEMPT
    if (this.level === 'normal') return true;
    if (this.level === 'caution') return confidence >= 60;  // Skip low confidence
    return false;  // pause or extended_pause
  }

  // Check for recovery signals
  hasRecoverySignal(): boolean;

  // Check if can resume (score <4 AND recovery signal)
  canResume(): boolean {
    return this.score < 4 && this.recoverySignalSeen;
  }

  // Decay score on wins/time
  decayScore(amount: number): void;

  // Get pause duration based on score
  getPauseDuration(): number {
    if (this.score >= 11) return 10;  // extended
    if (this.score >= 8) return 5;    // normal pause
    return 0;  // no pause
  }

  // Get current state for logging/UI
  getState(): HostilityState;
}
```

### Integration Points

1. **reaction.ts** (line ~620, after trade completion):
   ```typescript
   // After recording trade result
   this.hostilityDetector.updateAfterTrade(completedTrade);

   // Check for hostility pause
   if (this.hostilityDetector.shouldPause()) {
     // Trigger global pause for all systems
     this.triggerHostilityPause();
   }
   ```

2. **pause-manager.ts** - Add new pause type:
   ```typescript
   type PauseType = 'STOP_GAME' | 'MAJOR_PAUSE_10_BLOCKS' | 'MINOR_PAUSE_3_BLOCKS' | 'HOSTILITY_PAUSE';
   ```

3. **session-health.ts** - Integrate with existing tracking:
   - Share `recentTrades` data
   - Coordinate with `shouldStopSession()` checks

### Data Flow

```
Trade Completes
     |
HostilityDetector.updateAfterTrade()
     |
Check indicators:
  - Cascade (same pattern 3+ losses)
  - Cross-pattern (2+ patterns in 3 blocks)
  - Opposite sync (ZZ+AntiZZ both lost)
  - High-PCT (80%+ loss)
  - Cluster (3+ 70% losses in 5 blocks)
  - WR collapse (10-trade WR <30%)
     |
Calculate score (sum weights)
     |
Apply decay if win
     |
Determine level: normal/caution/pause/extended
     |
If pause -> Trigger HOSTILITY_PAUSE
If resume check -> Look for recovery signals
```

---

## Critical Safety Rules

### MUST NOT affect profitable sessions:

1. **Single 100% losses are NORMAL** - Don't trigger on one bad loss
2. **48% loss rate is NORMAL** - Don't trigger on loss rate alone
3. **2-3 consecutive losses are NORMAL** - Wait for 3+ cascade
4. **Drawdown up to 500 is NORMAL** - Don't trigger on drawdown alone
5. **Opposite patterns can both lose** - Require it to happen in sequence (not just coincidentally)

### MUST detect hostile sessions:

1. **SameDir 3+ cascade** - Primary danger signal
2. **Opposite sync fail** - ZZ loses THEN AntiZZ loses (not just both lost sometime)
3. **70%+ cluster** - Multiple severe losses in short window
4. **Recovery absence** - No ZZ/Anti2A2 wins appearing

---

## Testing Strategy

### Backtest on Historical Sessions

Run hostility detector on all 64 sessions and verify:

1. **Profitable sessions (36)**:
   - Hostility score should stay <5 most of the time
   - Any pauses should be brief and not cost >200 in missed profits

2. **Losing sessions (28)**:
   - Hostility score should reach 8+ before major collapse
   - Early detection should save >500 vs no detection

### Key Sessions to Validate

| Session | Type | Expected Behavior |
|---------|------|-------------------|
| Jan 1 17:46 | Collapse -26 | Should trigger PAUSE by trade 55-60 |
| Jan 1 21:13 | Collapse -270 | Should trigger PAUSE during cascade |
| Dec 25 14:28 | Recovery +126 | Should PAUSE then RESUME on recovery |
| Dec 31 09:57 | Profitable +2174 | Should NOT trigger pause (normal losses) |
| Dec 30 09:02 | Profitable +1708 | Should NOT trigger pause |

---

## Files to Modify

| File | Change |
|------|--------|
| `src/engine/hostility-detector.ts` | **NEW** - Core hostility detection |
| `src/engine/pause-manager.ts` | Add HOSTILITY_PAUSE type |
| `src/engine/reaction.ts` | Integrate hostility checks |
| `src/types/index.ts` | Add HostilityState types |
| `tests/hostility-detector.test.ts` | **NEW** - Unit tests |

---

## Implementation Order

1. **Phase 1: Core Detector**
   - Create `hostility-detector.ts` with all indicators
   - Add unit tests for each indicator type
   - Backtest on historical sessions (read-only)

2. **Phase 2: Integration**
   - Add HOSTILITY_PAUSE to pause-manager
   - Integrate into reaction.ts
   - Add recovery signal detection

3. **Phase 3: Tuning**
   - Adjust weights based on backtest results
   - Fine-tune thresholds to minimize false positives
   - Validate on latest sessions

4. **Phase 4: Monitoring**
   - Add hostility score to session output
   - Log indicator triggers for analysis
   - Create dashboard metrics

---

## Success Criteria

| Metric | Target |
|--------|--------|
| Profitable session impact | <5% profit reduction |
| Losing session savings | >30% loss reduction |
| False positive rate | <10% (pauses that cost >100) |
| True positive rate | >80% (catches collapses before -500) |

---

## Decisions (Confirmed)

| Question | Decision |
|----------|----------|
| Affect ZZ/AntiZZ? | **NO** - Keep ZZ/AntiZZ trading (best performers) |
| Pause duration? | **DYNAMIC** - 5 blocks (score 8-10), 10 blocks (score 11+) |
| Caution mode? | **YES** - Score 5-7 skips trades <60% confidence |
| Resume trigger? | **CONSERVATIVE** - Score <4 AND recovery signal required |
