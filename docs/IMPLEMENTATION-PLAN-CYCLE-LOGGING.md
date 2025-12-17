# Implementation Plan: Enhanced Cycle Optimization Logging

## Overview
This plan details the code changes needed to collect data for pattern activation/deactivation optimization analysis.

**Goals**:
1. Enable data-driven decisions about activation timing and break sensitivity
2. **Optimize activation thresholds (70% single, 100% cumulative) for both MAIN and B&S buckets**

---

## Phase 1: New Type Definitions

### File: `src/types/cycle-analytics.ts` (NEW)

```typescript
import { Direction, PatternName } from './index';

// ============================================
// CYCLE TRANSITION EVENTS
// ============================================

export type CycleState = 'observing' | 'active' | 'broken';

export type BucketType = 'MAIN' | 'BNS' | 'WAITING';

export type TransitionTrigger =
  | 'single_70'           // Single result >= 70%
  | 'cumulative_100'      // Cumulative >= 100%
  | 'loss_break'          // Lost while active
  | 'structural_kill'     // AP5/OZ/PP/ST rule
  | 'bns_inverse'         // B&S inverse bet
  | 'manual'              // External trigger
  | 'session_start';      // Initial state

// ============================================
// THRESHOLD OPTIMIZATION DATA
// ============================================

// Logged at EVERY observation step (for threshold backtesting)
export interface ObservationStepEvent {
  type: 'observation_step';
  ts: string;
  sessionId: string;
  blockIndex: number;
  pattern: PatternName;
  bucket: BucketType;  // CRITICAL: Which bucket is this pattern in?

  // Current result details
  result: {
    pct: number;
    verdict: string;
    profit: number;
    direction: Direction;
  };

  // Running totals AT THIS MOMENT
  runningTotals: {
    cumulativeProfit: number;
    maxSingleProfitSoFar: number;
    observationCount: number;
    consecutiveFair: number;
  };

  // Threshold crossing status (current thresholds)
  currentThresholds: {
    crossedSingle70: boolean;
    crossedCumulative100: boolean;
    wouldActivateNow: boolean;
  };

  // Alternative threshold analysis (for backtesting)
  alternativeThresholds: {
    wouldCrossSingle50: boolean;
    wouldCrossSingle60: boolean;
    wouldCrossSingle80: boolean;
    wouldCrossSingle90: boolean;
    wouldCrossCumulative50: boolean;
    wouldCrossCumulative80: boolean;
    wouldCrossCumulative120: boolean;
    wouldCrossCumulative150: boolean;
  };
}

// B&S specific activation context
export interface BnsActivationContext {
  entryLossPct: number;              // What loss put pattern into B&S
  entryLossBlockIndex: number;       // When it entered B&S
  blocksInBnsBeforeActivation: number;
  accumulatedWhileWaitingForBait: number;
  baitConfirmedAtIndex?: number;     // When bait was confirmed
}

// Enhanced activation record with bucket context
export interface ActivationThresholdRecord {
  pattern: PatternName;
  bucket: BucketType;                // MAIN or BNS
  blockIndex: number;

  // What triggered activation
  triggerType: 'single' | 'cumulative';
  triggerValue: number;              // The actual value (e.g., 72 for single, 105 for cumulative)

  // State at activation
  observationSteps: number;          // How many steps before activating
  cumulativeAtActivation: number;
  maxSingleAtActivation: number;

  // B&S context (if bucket === 'BNS')
  bnsContext?: BnsActivationContext;

  // Outcome (filled when active period ends)
  outcome?: {
    totalPnL: number;
    duration: number;
    wasSuccessful: boolean;
  };

  // BACKTEST DATA: What would have happened with different thresholds
  thresholdBacktest: ThresholdAlternative[];
}

export interface ThresholdAlternative {
  thresholdType: 'single' | 'cumulative';
  thresholdValue: number;            // e.g., 60, 80, 100, 120

  // When would we have activated?
  wouldActivateAtStep: number | null; // null = never during this observation
  wouldActivateAtBlock: number | null;

  // How different from actual?
  stepsDifference: number;           // Positive = earlier, Negative = later

  // Hypothetical outcome (calculated from actual results)
  hypotheticalPnL: number;           // What PnL would have been
  hypotheticalDuration: number;      // How long active period would be
  hypotheticalWasSuccessful: boolean;
}

export interface ObservationSummary {
  count: number;
  consecutiveFair: number;
  consecutiveUnfair: number;
  cumulativeProfit: number;
  maxSingleProfit: number;
  minSingleProfit: number;
  fairCount: number;
  unfairCount: number;
  fakeCount: number;
}

export interface MarketContext {
  blockIndex: number;
  runLength: number;
  runDirection: Direction;
  avgPctLast5: number;
  avgPctLast10: number;
  recentVerdicts: string[];  // Last 5
  recentDirections: Direction[];  // Last 5
  sessionProgress: number;  // blocks / typical session length
}

export interface CycleTransitionEvent {
  type: 'cycle_transition';
  id: string;
  ts: string;
  sessionId: string;
  blockIndex: number;
  pattern: PatternName;
  fromState: CycleState;
  toState: CycleState;
  trigger: TransitionTrigger;
  triggerValue?: number;  // e.g., the pct that triggered activation

  observationSummary?: ObservationSummary;
  activeRunSummary?: ActiveRunSummary;
  marketContext: MarketContext;
}

// ============================================
// ACTIVE PERIOD TRACKING
// ============================================

export interface ActiveRunSummary {
  startBlockIndex: number;
  endBlockIndex: number;
  duration: number;  // blocks
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnL: number;
  peakProfit: number;
  maxDrawdown: number;
  profitAtEnd: number;
  drawdownAtEnd: number;  // peak - profitAtEnd
}

export interface ActivationQualityRecord {
  pattern: PatternName;
  activationBlockIndex: number;
  activationTrigger: TransitionTrigger;
  activationTriggerValue: number;
  observationSummary: ObservationSummary;
  marketContextAtActivation: MarketContext;

  // Filled when active period ends
  outcome?: {
    endBlockIndex: number;
    endReason: TransitionTrigger;
    activeRunSummary: ActiveRunSummary;
    wasSuccessful: boolean;  // totalPnL > 0
  };
}

// ============================================
// COUNTERFACTUAL TRACKING
// ============================================

export interface CounterfactualResult {
  blockIndex: number;
  verdict: string;
  pct: number;
  expectedDirection: Direction;
  actualDirection: Direction;
  hypotheticalProfit: number;  // + if would have won, - if would have lost
}

export interface CounterfactualEvent {
  type: 'counterfactual';
  ts: string;
  sessionId: string;
  blockIndex: number;
  pattern: PatternName;
  currentState: CycleState;
  result: CounterfactualResult;
}

export interface CounterfactualSummary {
  pattern: PatternName;
  totalWhileObserving: number;
  missedProfits: number;  // Sum of positive hypotheticalProfit
  avoidedLosses: number;  // Sum of negative hypotheticalProfit (as positive)
  netObservationValue: number;  // avoidedLosses - missedProfits
  missedFairCount: number;
  avoidedUnfairCount: number;
  avoidedFakeCount: number;
}

// ============================================
// BREAK ANALYSIS
// ============================================

export interface BreakAnalysisEvent {
  type: 'break_analysis';
  id: string;
  ts: string;
  sessionId: string;
  blockIndex: number;
  pattern: PatternName;
  breakType: 'loss_break' | 'structural_kill' | 'bns_inverse';
  breakReason: string;
  breakLossPct?: number;  // If loss-based

  activeRunSummary: ActiveRunSummary;

  // Populated as subsequent blocks arrive (next 10)
  postBreakResults: CounterfactualResult[];
  postBreakPnL?: number;  // Sum of postBreakResults
  breakWasCorrect?: boolean;  // true if postBreakPnL < 0
}

// ============================================
// SESSION ANALYTICS SUMMARY
// ============================================

export interface PatternCycleAnalytics {
  pattern: PatternName;

  // Activation metrics
  activationCount: number;
  avgObservationBeforeActivation: number;
  avgConsecutiveFairBeforeActivation: number;
  activationSuccessRate: number;
  avgActivePeriodPnL: number;
  avgActivePeriodDuration: number;

  // Break metrics
  breakCount: number;
  lossBreakCount: number;
  structuralKillCount: number;
  avgDrawdownAtBreak: number;
  breakAccuracy: number;  // % that avoided further loss
  avgPostBreakPnL: number;  // What would have happened

  // Counterfactual metrics
  missedProfitWhileObserving: number;
  avoidedLossWhileObserving: number;
  netObservationValue: number;

  // Time distribution
  blocksInObserving: number;
  blocksInActive: number;
  observingPercentage: number;
}

export interface SessionCycleAnalytics {
  sessionId: string;
  ts: string;

  // Aggregates
  totalTransitions: number;
  totalActivations: number;
  totalBreaks: number;
  overallActivationSuccessRate: number;
  overallBreakAccuracy: number;
  totalNetObservationValue: number;

  // Per-pattern breakdown
  perPattern: Record<PatternName, PatternCycleAnalytics>;

  // Events (for detailed analysis)
  transitions: CycleTransitionEvent[];
  breakAnalyses: BreakAnalysisEvent[];
}

// ============================================
// ANALYTICS STORE
// ============================================

export interface CycleAnalyticsStore {
  // Active tracking (during session)
  activeActivations: Map<PatternName, ActivationQualityRecord>;
  pendingBreakAnalyses: BreakAnalysisEvent[];
  counterfactuals: CounterfactualEvent[];
  transitions: CycleTransitionEvent[];

  // Running summaries (updated incrementally)
  patternSummaries: Map<PatternName, PatternCycleAnalytics>;
}
```

---

## Phase 2: Analytics Collector Service

### File: `src/data/cycle-analytics-collector.ts` (NEW)

```typescript
import {
  CycleTransitionEvent,
  CounterfactualEvent,
  BreakAnalysisEvent,
  ActivationQualityRecord,
  ObservationSummary,
  MarketContext,
  ActiveRunSummary,
  PatternCycleAnalytics,
  SessionCycleAnalytics,
  CycleAnalyticsStore,
  CycleState,
  TransitionTrigger
} from '../types/cycle-analytics';
import { PatternName, Direction, EvaluatedResult, Block, PatternCycle } from '../types';
import { v4 as uuid } from 'uuid';

export class CycleAnalyticsCollector {
  private sessionId: string;
  private store: CycleAnalyticsStore;
  private blocks: Block[] = [];
  private recentVerdicts: string[] = [];

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.store = {
      activeActivations: new Map(),
      pendingBreakAnalyses: [],
      counterfactuals: [],
      transitions: [],
      patternSummaries: new Map()
    };
  }

  // ========================================
  // MARKET CONTEXT
  // ========================================

  updateBlocks(blocks: Block[]): void {
    this.blocks = blocks;
  }

  private getMarketContext(blockIndex: number): MarketContext {
    const last5 = this.blocks.slice(Math.max(0, blockIndex - 5), blockIndex);
    const last10 = this.blocks.slice(Math.max(0, blockIndex - 10), blockIndex);

    const currentBlock = this.blocks[blockIndex];
    let runLength = 1;
    let runDirection = currentBlock?.dir || 1;

    // Calculate current run
    for (let i = blockIndex - 1; i >= 0; i--) {
      if (this.blocks[i].dir === runDirection) {
        runLength++;
      } else {
        break;
      }
    }

    return {
      blockIndex,
      runLength,
      runDirection,
      avgPctLast5: last5.length > 0
        ? last5.reduce((s, b) => s + b.pct, 0) / last5.length
        : 50,
      avgPctLast10: last10.length > 0
        ? last10.reduce((s, b) => s + b.pct, 0) / last10.length
        : 50,
      recentVerdicts: [...this.recentVerdicts].slice(-5),
      recentDirections: last5.map(b => b.dir),
      sessionProgress: this.blocks.length / 100  // Assume 100 blocks typical
    };
  }

  // ========================================
  // TRANSITION TRACKING
  // ========================================

  recordTransition(
    pattern: PatternName,
    fromState: CycleState,
    toState: CycleState,
    trigger: TransitionTrigger,
    blockIndex: number,
    triggerValue?: number,
    observationSummary?: ObservationSummary,
    activeRunSummary?: ActiveRunSummary
  ): CycleTransitionEvent {
    const event: CycleTransitionEvent = {
      type: 'cycle_transition',
      id: uuid(),
      ts: new Date().toISOString(),
      sessionId: this.sessionId,
      blockIndex,
      pattern,
      fromState,
      toState,
      trigger,
      triggerValue,
      observationSummary,
      activeRunSummary,
      marketContext: this.getMarketContext(blockIndex)
    };

    this.store.transitions.push(event);

    // Handle activation start
    if (toState === 'active' && fromState === 'observing') {
      this.startActivationTracking(pattern, event);
    }

    // Handle break
    if (fromState === 'active' && toState !== 'active') {
      this.endActivationTracking(pattern, trigger, blockIndex, activeRunSummary);
      if (trigger === 'loss_break' || trigger === 'structural_kill' || trigger === 'bns_inverse') {
        this.startBreakAnalysis(pattern, trigger, blockIndex, activeRunSummary, triggerValue);
      }
    }

    return event;
  }

  // ========================================
  // ACTIVATION TRACKING
  // ========================================

  private startActivationTracking(
    pattern: PatternName,
    transitionEvent: CycleTransitionEvent
  ): void {
    const record: ActivationQualityRecord = {
      pattern,
      activationBlockIndex: transitionEvent.blockIndex,
      activationTrigger: transitionEvent.trigger,
      activationTriggerValue: transitionEvent.triggerValue || 0,
      observationSummary: transitionEvent.observationSummary || this.emptyObservationSummary(),
      marketContextAtActivation: transitionEvent.marketContext
    };

    this.store.activeActivations.set(pattern, record);
  }

  private endActivationTracking(
    pattern: PatternName,
    endReason: TransitionTrigger,
    endBlockIndex: number,
    activeRunSummary?: ActiveRunSummary
  ): void {
    const record = this.store.activeActivations.get(pattern);
    if (!record) return;

    record.outcome = {
      endBlockIndex,
      endReason,
      activeRunSummary: activeRunSummary || this.emptyActiveRunSummary(),
      wasSuccessful: (activeRunSummary?.totalPnL || 0) > 0
    };

    // Update pattern summary
    this.updatePatternSummaryFromActivation(record);

    this.store.activeActivations.delete(pattern);
  }

  // ========================================
  // BREAK ANALYSIS
  // ========================================

  private startBreakAnalysis(
    pattern: PatternName,
    breakType: 'loss_break' | 'structural_kill' | 'bns_inverse',
    blockIndex: number,
    activeRunSummary?: ActiveRunSummary,
    breakLossPct?: number
  ): void {
    const event: BreakAnalysisEvent = {
      type: 'break_analysis',
      id: uuid(),
      ts: new Date().toISOString(),
      sessionId: this.sessionId,
      blockIndex,
      pattern,
      breakType,
      breakReason: breakType,
      breakLossPct,
      activeRunSummary: activeRunSummary || this.emptyActiveRunSummary(),
      postBreakResults: []
    };

    this.store.pendingBreakAnalyses.push(event);
  }

  // Called for each result after a break (up to 10)
  recordPostBreakResult(
    pattern: PatternName,
    result: EvaluatedResult,
    blockIndex: number
  ): void {
    const pending = this.store.pendingBreakAnalyses.filter(
      b => b.pattern === pattern && b.postBreakResults.length < 10
    );

    for (const analysis of pending) {
      if (blockIndex > analysis.blockIndex) {
        analysis.postBreakResults.push({
          blockIndex,
          verdict: result.verdict,
          pct: result.pct,
          expectedDirection: result.expectedDirection,
          actualDirection: result.actualDirection,
          hypotheticalProfit: result.profit
        });

        // After 10 results, finalize
        if (analysis.postBreakResults.length >= 10) {
          this.finalizeBreakAnalysis(analysis);
        }
      }
    }
  }

  private finalizeBreakAnalysis(analysis: BreakAnalysisEvent): void {
    analysis.postBreakPnL = analysis.postBreakResults.reduce(
      (sum, r) => sum + r.hypotheticalProfit, 0
    );
    analysis.breakWasCorrect = analysis.postBreakPnL < 0;

    // Update pattern summary
    this.updatePatternSummaryFromBreak(analysis);

    // Remove from pending
    const idx = this.store.pendingBreakAnalyses.indexOf(analysis);
    if (idx >= 0) {
      this.store.pendingBreakAnalyses.splice(idx, 1);
    }
  }

  // ========================================
  // COUNTERFACTUAL TRACKING
  // ========================================

  recordCounterfactual(
    pattern: PatternName,
    currentState: CycleState,
    result: EvaluatedResult,
    blockIndex: number
  ): void {
    if (currentState === 'active') return;  // Only track when NOT betting

    const event: CounterfactualEvent = {
      type: 'counterfactual',
      ts: new Date().toISOString(),
      sessionId: this.sessionId,
      blockIndex,
      pattern,
      currentState,
      result: {
        blockIndex,
        verdict: result.verdict,
        pct: result.pct,
        expectedDirection: result.expectedDirection,
        actualDirection: result.actualDirection,
        hypotheticalProfit: result.profit
      }
    };

    this.store.counterfactuals.push(event);
    this.recentVerdicts.push(result.verdict);
    if (this.recentVerdicts.length > 20) this.recentVerdicts.shift();

    // Update pattern summary
    this.updatePatternSummaryFromCounterfactual(event);
  }

  // ========================================
  // SUMMARY UPDATES
  // ========================================

  private getOrCreatePatternSummary(pattern: PatternName): PatternCycleAnalytics {
    if (!this.store.patternSummaries.has(pattern)) {
      this.store.patternSummaries.set(pattern, {
        pattern,
        activationCount: 0,
        avgObservationBeforeActivation: 0,
        avgConsecutiveFairBeforeActivation: 0,
        activationSuccessRate: 0,
        avgActivePeriodPnL: 0,
        avgActivePeriodDuration: 0,
        breakCount: 0,
        lossBreakCount: 0,
        structuralKillCount: 0,
        avgDrawdownAtBreak: 0,
        breakAccuracy: 0,
        avgPostBreakPnL: 0,
        missedProfitWhileObserving: 0,
        avoidedLossWhileObserving: 0,
        netObservationValue: 0,
        blocksInObserving: 0,
        blocksInActive: 0,
        observingPercentage: 0
      });
    }
    return this.store.patternSummaries.get(pattern)!;
  }

  private updatePatternSummaryFromActivation(record: ActivationQualityRecord): void {
    const summary = this.getOrCreatePatternSummary(record.pattern);

    summary.activationCount++;

    // Running average for observation before activation
    const n = summary.activationCount;
    summary.avgObservationBeforeActivation =
      ((n - 1) * summary.avgObservationBeforeActivation + record.observationSummary.count) / n;
    summary.avgConsecutiveFairBeforeActivation =
      ((n - 1) * summary.avgConsecutiveFairBeforeActivation + record.observationSummary.consecutiveFair) / n;

    if (record.outcome) {
      const successCount = summary.activationSuccessRate * (n - 1);
      summary.activationSuccessRate = (successCount + (record.outcome.wasSuccessful ? 1 : 0)) / n;

      summary.avgActivePeriodPnL =
        ((n - 1) * summary.avgActivePeriodPnL + record.outcome.activeRunSummary.totalPnL) / n;
      summary.avgActivePeriodDuration =
        ((n - 1) * summary.avgActivePeriodDuration + record.outcome.activeRunSummary.duration) / n;

      summary.blocksInActive += record.outcome.activeRunSummary.duration;
    }
  }

  private updatePatternSummaryFromBreak(analysis: BreakAnalysisEvent): void {
    const summary = this.getOrCreatePatternSummary(analysis.pattern);

    summary.breakCount++;
    if (analysis.breakType === 'loss_break') summary.lossBreakCount++;
    if (analysis.breakType === 'structural_kill') summary.structuralKillCount++;

    const n = summary.breakCount;
    summary.avgDrawdownAtBreak =
      ((n - 1) * summary.avgDrawdownAtBreak + analysis.activeRunSummary.drawdownAtEnd) / n;

    if (analysis.breakWasCorrect !== undefined) {
      const correctCount = summary.breakAccuracy * (n - 1);
      summary.breakAccuracy = (correctCount + (analysis.breakWasCorrect ? 1 : 0)) / n;
    }

    if (analysis.postBreakPnL !== undefined) {
      summary.avgPostBreakPnL =
        ((n - 1) * summary.avgPostBreakPnL + analysis.postBreakPnL) / n;
    }
  }

  private updatePatternSummaryFromCounterfactual(event: CounterfactualEvent): void {
    const summary = this.getOrCreatePatternSummary(event.pattern);

    if (event.result.hypotheticalProfit > 0) {
      summary.missedProfitWhileObserving += event.result.hypotheticalProfit;
    } else {
      summary.avoidedLossWhileObserving += Math.abs(event.result.hypotheticalProfit);
    }

    summary.netObservationValue =
      summary.avoidedLossWhileObserving - summary.missedProfitWhileObserving;

    if (event.currentState === 'observing') {
      summary.blocksInObserving++;
    }

    const totalBlocks = summary.blocksInObserving + summary.blocksInActive;
    summary.observingPercentage = totalBlocks > 0
      ? (summary.blocksInObserving / totalBlocks) * 100
      : 0;
  }

  // ========================================
  // EXPORT
  // ========================================

  getSessionAnalytics(): SessionCycleAnalytics {
    const perPattern: Record<string, PatternCycleAnalytics> = {};
    for (const [pattern, summary] of this.store.patternSummaries) {
      perPattern[pattern] = summary;
    }

    const allSummaries = Array.from(this.store.patternSummaries.values());

    return {
      sessionId: this.sessionId,
      ts: new Date().toISOString(),
      totalTransitions: this.store.transitions.length,
      totalActivations: allSummaries.reduce((s, p) => s + p.activationCount, 0),
      totalBreaks: allSummaries.reduce((s, p) => s + p.breakCount, 0),
      overallActivationSuccessRate: this.calculateOverallRate(
        allSummaries, s => s.activationSuccessRate, s => s.activationCount
      ),
      overallBreakAccuracy: this.calculateOverallRate(
        allSummaries, s => s.breakAccuracy, s => s.breakCount
      ),
      totalNetObservationValue: allSummaries.reduce((s, p) => s + p.netObservationValue, 0),
      perPattern: perPattern as Record<PatternName, PatternCycleAnalytics>,
      transitions: this.store.transitions,
      breakAnalyses: this.store.pendingBreakAnalyses
    };
  }

  private calculateOverallRate(
    summaries: PatternCycleAnalytics[],
    rateFn: (s: PatternCycleAnalytics) => number,
    countFn: (s: PatternCycleAnalytics) => number
  ): number {
    let totalWeighted = 0;
    let totalCount = 0;
    for (const s of summaries) {
      const count = countFn(s);
      totalWeighted += rateFn(s) * count;
      totalCount += count;
    }
    return totalCount > 0 ? totalWeighted / totalCount : 0;
  }

  // ========================================
  // HELPERS
  // ========================================

  private emptyObservationSummary(): ObservationSummary {
    return {
      count: 0,
      consecutiveFair: 0,
      consecutiveUnfair: 0,
      cumulativeProfit: 0,
      maxSingleProfit: 0,
      minSingleProfit: 0,
      fairCount: 0,
      unfairCount: 0,
      fakeCount: 0
    };
  }

  private emptyActiveRunSummary(): ActiveRunSummary {
    return {
      startBlockIndex: 0,
      endBlockIndex: 0,
      duration: 0,
      trades: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      totalPnL: 0,
      peakProfit: 0,
      maxDrawdown: 0,
      profitAtEnd: 0,
      drawdownAtEnd: 0
    };
  }

  // Build observation summary from pattern cycle
  buildObservationSummary(cycle: PatternCycle): ObservationSummary {
    const results = cycle.observationResults || [];
    let consecutiveFair = 0;
    let consecutiveUnfair = 0;

    // Count consecutive fair from end
    for (let i = results.length - 1; i >= 0; i--) {
      if (results[i].verdict === 'fair' || results[i].verdict === 'neutral') {
        consecutiveFair++;
      } else {
        break;
      }
    }

    // Count consecutive unfair from end
    for (let i = results.length - 1; i >= 0; i--) {
      if (results[i].verdict === 'unfair' || results[i].verdict === 'fake') {
        consecutiveUnfair++;
      } else {
        break;
      }
    }

    return {
      count: results.length,
      consecutiveFair,
      consecutiveUnfair,
      cumulativeProfit: cycle.cumulativeProfit,
      maxSingleProfit: Math.max(...results.map(r => r.profit), 0),
      minSingleProfit: Math.min(...results.map(r => r.profit), 0),
      fairCount: results.filter(r => r.verdict === 'fair').length,
      unfairCount: results.filter(r => r.verdict === 'unfair').length,
      fakeCount: results.filter(r => r.verdict === 'fake').length
    };
  }

  // Build active run summary from pattern cycle
  buildActiveRunSummary(
    cycle: PatternCycle,
    startBlockIndex: number,
    endBlockIndex: number
  ): ActiveRunSummary {
    const results = cycle.activeResults || [];
    const wins = results.filter(r => r.profit > 0).length;
    const losses = results.filter(r => r.profit < 0).length;

    let cumulative = 0;
    let peak = 0;
    let maxDrawdown = 0;

    for (const r of results) {
      cumulative += r.profit;
      if (cumulative > peak) peak = cumulative;
      const drawdown = peak - cumulative;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    return {
      startBlockIndex,
      endBlockIndex,
      duration: endBlockIndex - startBlockIndex,
      trades: results.length,
      wins,
      losses,
      winRate: results.length > 0 ? wins / results.length : 0,
      totalPnL: cumulative,
      peakProfit: peak,
      maxDrawdown,
      profitAtEnd: cumulative,
      drawdownAtEnd: peak - cumulative
    };
  }
}
```

---

## Phase 3: Integration Points

### File: `src/patterns/lifecycle.ts` (MODIFY)

Add analytics collector integration:

```typescript
// At top of file
import { CycleAnalyticsCollector } from '../data/cycle-analytics-collector';

export class PatternLifecycleManager {
  private analyticsCollector?: CycleAnalyticsCollector;

  setAnalyticsCollector(collector: CycleAnalyticsCollector): void {
    this.analyticsCollector = collector;
  }

  // In checkActivation() - after activation logic
  private recordActivation(
    pattern: PatternName,
    cycle: PatternCycle,
    trigger: 'single_70' | 'cumulative_100',
    triggerValue: number,
    blockIndex: number
  ): void {
    if (!this.analyticsCollector) return;

    const observationSummary = this.analyticsCollector.buildObservationSummary(cycle);

    this.analyticsCollector.recordTransition(
      pattern,
      'observing',
      'active',
      trigger,
      blockIndex,
      triggerValue,
      observationSummary
    );
  }

  // In breakPattern() - before resetting
  private recordBreak(
    pattern: PatternName,
    cycle: PatternCycle,
    trigger: 'loss_break' | 'structural_kill' | 'bns_inverse',
    blockIndex: number,
    breakLossPct?: number
  ): void {
    if (!this.analyticsCollector) return;

    // Find activation start (would need to track this)
    const startBlockIndex = this.activationStartBlocks.get(pattern) || 0;
    const activeRunSummary = this.analyticsCollector.buildActiveRunSummary(
      cycle, startBlockIndex, blockIndex
    );

    this.analyticsCollector.recordTransition(
      pattern,
      'active',
      'observing',
      trigger,
      blockIndex,
      breakLossPct,
      undefined,
      activeRunSummary
    );
  }

  // Track activation start blocks
  private activationStartBlocks = new Map<PatternName, number>();

  // In applyResult() - for counterfactual tracking
  private recordCounterfactualIfNeeded(
    pattern: PatternName,
    cycle: PatternCycle,
    result: EvaluatedResult,
    blockIndex: number
  ): void {
    if (!this.analyticsCollector) return;
    if (cycle.state === 'active') return;  // Only when NOT active

    this.analyticsCollector.recordCounterfactual(
      pattern,
      cycle.state as 'observing' | 'broken',
      result,
      blockIndex
    );
  }
}
```

### File: `src/engine/state.ts` (MODIFY)

Add analytics updates for blocks:

```typescript
// In addBlock()
if (this.analyticsCollector) {
  this.analyticsCollector.updateBlocks(this.blocks);
}

// After evaluating each result
if (this.analyticsCollector && !result.wasBet) {
  // This pattern was not bet on, record for counterfactual
  // Already handled in lifecycle.ts
}

// For post-break tracking
for (const result of evaluatedResults) {
  if (this.analyticsCollector) {
    this.analyticsCollector.recordPostBreakResult(
      result.pattern,
      result,
      blockIndex
    );
  }
}
```

### File: `src/session/manager.ts` (MODIFY)

Add analytics export:

```typescript
// In session save/export
const cycleAnalytics = this.analyticsCollector?.getSessionAnalytics();
if (cycleAnalytics) {
  // Save alongside session data
  await this.saveCycleAnalytics(cycleAnalytics);
}
```

---

## Phase 4: Data Export & Storage

### File: `src/data/analytics-storage.ts` (NEW)

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { SessionCycleAnalytics } from '../types/cycle-analytics';

const ANALYTICS_DIR = './data/cycle-analytics';

export async function saveCycleAnalytics(
  analytics: SessionCycleAnalytics
): Promise<void> {
  const dir = path.join(ANALYTICS_DIR, getDateFolder());
  await fs.promises.mkdir(dir, { recursive: true });

  const filename = `cycle-analytics_${analytics.sessionId}.json`;
  const filepath = path.join(dir, filename);

  await fs.promises.writeFile(
    filepath,
    JSON.stringify(analytics, null, 2)
  );
}

export async function loadCycleAnalytics(
  sessionId: string
): Promise<SessionCycleAnalytics | null> {
  // Search in date folders
  const folders = await fs.promises.readdir(ANALYTICS_DIR);
  for (const folder of folders) {
    const filepath = path.join(
      ANALYTICS_DIR,
      folder,
      `cycle-analytics_${sessionId}.json`
    );
    if (fs.existsSync(filepath)) {
      const data = await fs.promises.readFile(filepath, 'utf-8');
      return JSON.parse(data);
    }
  }
  return null;
}

export async function loadAnalyticsRange(
  startDate: Date,
  endDate: Date
): Promise<SessionCycleAnalytics[]> {
  const results: SessionCycleAnalytics[] = [];
  const folders = await fs.promises.readdir(ANALYTICS_DIR);

  for (const folder of folders) {
    const folderDate = parseDateFolder(folder);
    if (folderDate >= startDate && folderDate <= endDate) {
      const files = await fs.promises.readdir(
        path.join(ANALYTICS_DIR, folder)
      );
      for (const file of files) {
        if (file.startsWith('cycle-analytics_')) {
          const data = await fs.promises.readFile(
            path.join(ANALYTICS_DIR, folder, file),
            'utf-8'
          );
          results.push(JSON.parse(data));
        }
      }
    }
  }

  return results;
}

function getDateFolder(): string {
  return new Date().toISOString().split('T')[0];
}

function parseDateFolder(folder: string): Date {
  return new Date(folder);
}
```

---

## Phase 5: Analysis CLI Commands

### File: `src/cli/commands/analyze-cycles.ts` (NEW)

```typescript
import { loadAnalyticsRange } from '../../data/analytics-storage';
import { SessionCycleAnalytics, PatternCycleAnalytics } from '../../types/cycle-analytics';

export async function analyzeActivations(days: number = 7): Promise<void> {
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

  const sessions = await loadAnalyticsRange(startDate, endDate);

  console.log(`\n=== ACTIVATION ANALYSIS (${days} days, ${sessions.length} sessions) ===\n`);

  // Aggregate by pattern
  const patternStats = aggregatePatternStats(sessions);

  // Display results
  console.log('Pattern          Activations  SuccessRate  AvgObsBefore  AvgPnL');
  console.log('─'.repeat(70));

  for (const [pattern, stats] of Object.entries(patternStats)) {
    console.log(
      `${pattern.padEnd(16)} ${stats.activations.toString().padStart(11)} ` +
      `${(stats.successRate * 100).toFixed(1).padStart(10)}% ` +
      `${stats.avgObservation.toFixed(1).padStart(13)} ` +
      `${stats.avgPnL.toFixed(0).padStart(7)}`
    );
  }

  // Recommendations
  console.log('\n=== RECOMMENDATIONS ===\n');

  for (const [pattern, stats] of Object.entries(patternStats)) {
    if (stats.successRate < 0.5 && stats.avgObservation < 3) {
      console.log(`⚠️  ${pattern}: Consider increasing observation requirement (current avg: ${stats.avgObservation.toFixed(1)})`);
    }
    if (stats.successRate > 0.7 && stats.netObservationValue < -50) {
      console.log(`💡 ${pattern}: Consider faster activation (missing ${Math.abs(stats.netObservationValue).toFixed(0)} while observing)`);
    }
  }
}

export async function analyzeBreaks(days: number = 7): Promise<void> {
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

  const sessions = await loadAnalyticsRange(startDate, endDate);

  console.log(`\n=== BREAK ANALYSIS (${days} days, ${sessions.length} sessions) ===\n`);

  const patternStats = aggregatePatternStats(sessions);

  console.log('Pattern          Breaks  Accuracy  AvgDrawdown  AvgPostBreakPnL');
  console.log('─'.repeat(70));

  for (const [pattern, stats] of Object.entries(patternStats)) {
    console.log(
      `${pattern.padEnd(16)} ${stats.breaks.toString().padStart(6)} ` +
      `${(stats.breakAccuracy * 100).toFixed(1).padStart(8)}% ` +
      `${stats.avgDrawdown.toFixed(0).padStart(11)} ` +
      `${stats.avgPostBreakPnL.toFixed(0).padStart(15)}`
    );
  }

  // Recommendations
  console.log('\n=== RECOMMENDATIONS ===\n');

  for (const [pattern, stats] of Object.entries(patternStats)) {
    if (stats.breakAccuracy < 0.4) {
      console.log(`⚠️  ${pattern}: Breaking too early (${(stats.breakAccuracy * 100).toFixed(0)}% accuracy)`);
    }
    if (stats.avgDrawdown > 100) {
      console.log(`⚠️  ${pattern}: Breaking too late (avg drawdown: ${stats.avgDrawdown.toFixed(0)})`);
    }
  }
}

function aggregatePatternStats(sessions: SessionCycleAnalytics[]): Record<string, AggregatedStats> {
  const result: Record<string, AggregatedStats> = {};

  for (const session of sessions) {
    for (const [pattern, stats] of Object.entries(session.perPattern)) {
      if (!result[pattern]) {
        result[pattern] = {
          activations: 0,
          successRate: 0,
          avgObservation: 0,
          avgPnL: 0,
          breaks: 0,
          breakAccuracy: 0,
          avgDrawdown: 0,
          avgPostBreakPnL: 0,
          netObservationValue: 0,
          _totalActivations: 0,
          _totalBreaks: 0
        };
      }

      const r = result[pattern];
      r.activations += stats.activationCount;
      r.breaks += stats.breakCount;
      r.netObservationValue += stats.netObservationValue;

      // Weighted averages
      r._totalActivations += stats.activationCount;
      r.successRate = (r.successRate * (r._totalActivations - stats.activationCount) +
        stats.activationSuccessRate * stats.activationCount) / r._totalActivations;
      r.avgObservation = (r.avgObservation * (r._totalActivations - stats.activationCount) +
        stats.avgObservationBeforeActivation * stats.activationCount) / r._totalActivations;
      r.avgPnL = (r.avgPnL * (r._totalActivations - stats.activationCount) +
        stats.avgActivePeriodPnL * stats.activationCount) / r._totalActivations;

      r._totalBreaks += stats.breakCount;
      if (r._totalBreaks > 0) {
        r.breakAccuracy = (r.breakAccuracy * (r._totalBreaks - stats.breakCount) +
          stats.breakAccuracy * stats.breakCount) / r._totalBreaks;
        r.avgDrawdown = (r.avgDrawdown * (r._totalBreaks - stats.breakCount) +
          stats.avgDrawdownAtBreak * stats.breakCount) / r._totalBreaks;
        r.avgPostBreakPnL = (r.avgPostBreakPnL * (r._totalBreaks - stats.breakCount) +
          stats.avgPostBreakPnL * stats.breakCount) / r._totalBreaks;
      }
    }
  }

  return result;
}

interface AggregatedStats {
  activations: number;
  successRate: number;
  avgObservation: number;
  avgPnL: number;
  breaks: number;
  breakAccuracy: number;
  avgDrawdown: number;
  avgPostBreakPnL: number;
  netObservationValue: number;
  _totalActivations: number;
  _totalBreaks: number;
}
```

---

## Implementation Order

### Week 1: Foundation
1. Create `src/types/cycle-analytics.ts` with all type definitions
2. Create `src/data/cycle-analytics-collector.ts` (core collector)
3. Create `src/data/analytics-storage.ts` (persistence)

### Week 2: Integration
4. Modify `src/patterns/lifecycle.ts` to emit transition events
5. Modify `src/engine/state.ts` to pass blocks and results
6. Modify `src/session/manager.ts` to save analytics

### Week 3: Analysis Tools
7. Create `src/cli/commands/analyze-cycles.ts`
8. Add CLI commands for analysis
9. Test with live sessions

### Week 4: Refinement
10. Review collected data
11. Adjust metrics based on findings
12. Document insights

---

## Testing Strategy

### Unit Tests
- CycleAnalyticsCollector methods
- Observation summary building
- Active run summary building
- Metric calculations

### Integration Tests
- Full session with analytics enabled
- Data persistence and retrieval
- Multi-session aggregation

### Validation
- Compare analytics output to manual session review
- Verify counterfactual tracking accuracy
- Confirm break accuracy calculations

---

## Success Criteria

After implementation, we should be able to answer:
1. "Should pattern X wait longer before activating?" (with data)
2. "Is pattern Y breaking too early?" (with accuracy metrics)
3. "How much are we losing by being too cautious?" (with counterfactual sums)
4. "Which patterns need parameter tuning?" (with comparative analysis)
