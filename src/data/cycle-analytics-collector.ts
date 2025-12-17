/**
 * Cycle Analytics Collector
 * =========================
 * Collects comprehensive data for pattern cycle optimization analysis.
 *
 * Features:
 * - Tracks every observation step with running totals
 * - Records state transitions with full context
 * - Captures counterfactuals (what would have happened)
 * - Analyzes breaks with post-break tracking
 * - Enables threshold backtesting
 */

import { v4 as uuid } from 'uuid';
import {
  Direction,
  PatternName,
  PatternCycle,
  EvaluatedResult,
  Block,
  Verdict,
} from '../types';
import {
  CycleState,
  BucketType,
  TransitionTrigger,
  ObservationStepEvent,
  ObservationSummary,
  MarketContext,
  ActiveRunSummary,
  CycleTransitionEvent,
  ActivationQualityRecord,
  ThresholdAlternative,
  CounterfactualEvent,
  BreakAnalysisEvent,
  PatternCycleAnalytics,
  SessionCycleAnalytics,
  CycleAnalyticsStore,
  BACKTEST_SINGLE_THRESHOLDS,
  BACKTEST_CUMULATIVE_THRESHOLDS,
} from '../types/cycle-analytics';

export class CycleAnalyticsCollector {
  private sessionId: string;
  private store: CycleAnalyticsStore;
  private blocks: Block[] = [];
  private recentVerdicts: Verdict[] = [];

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.store = this.createEmptyStore();
  }

  private createEmptyStore(): CycleAnalyticsStore {
    return {
      activeActivations: new Map(),
      activationStartBlocks: new Map(),
      pendingBreakAnalyses: [],
      observationSteps: [],
      counterfactuals: [],
      transitions: [],
      patternSummaries: new Map(),
      currentBuckets: new Map(),
    };
  }

  // ========================================
  // BLOCK & CONTEXT MANAGEMENT
  // ========================================

  updateBlocks(blocks: Block[]): void {
    this.blocks = blocks;
  }

  updateBucket(pattern: PatternName, bucket: BucketType): void {
    this.store.currentBuckets.set(pattern, bucket);
  }

  getBucket(pattern: PatternName): BucketType {
    return this.store.currentBuckets.get(pattern) || 'WAITING';
  }

  private getMarketContext(blockIndex: number): MarketContext {
    const last5 = this.blocks.slice(Math.max(0, blockIndex - 5), blockIndex);
    const last10 = this.blocks.slice(Math.max(0, blockIndex - 10), blockIndex);

    const currentBlock = this.blocks[blockIndex];
    let runLength = 1;
    let runDirection: Direction = currentBlock?.dir || 1;

    // Calculate current run
    for (let i = blockIndex - 1; i >= 0; i--) {
      if (this.blocks[i]?.dir === runDirection) {
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
      recentVerdicts: [...this.recentVerdicts].slice(-5) as Verdict[],
      recentDirections: last5.map(b => b.dir),
      sessionProgress: this.blocks.length / 100,
      totalBlocksInSession: this.blocks.length,
    };
  }

  // ========================================
  // OBSERVATION STEP TRACKING
  // ========================================

  recordObservationStep(
    pattern: PatternName,
    result: EvaluatedResult,
    cycle: PatternCycle,
    blockIndex: number
  ): ObservationStepEvent {
    const bucket = this.getBucket(pattern);
    const cumulativeProfit = cycle.cumulativeProfit;

    // Calculate running max single
    const allObsResults = cycle.observationResults || [];
    const maxSingleSoFar = Math.max(
      ...allObsResults.map(r => r.profit),
      result.profit
    );

    // Count consecutive fair
    let consecutiveFair = 0;
    let consecutiveUnfair = 0;
    const allResults = [...allObsResults, result];
    for (let i = allResults.length - 1; i >= 0; i--) {
      const v = allResults[i].verdict;
      if (v === 'fair' || v === 'neutral') {
        consecutiveFair++;
      } else {
        break;
      }
    }
    for (let i = allResults.length - 1; i >= 0; i--) {
      const v = allResults[i].verdict;
      if (v === 'unfair' || v === 'fake') {
        consecutiveUnfair++;
      } else {
        break;
      }
    }

    const event: ObservationStepEvent = {
      type: 'observation_step',
      ts: new Date().toISOString(),
      sessionId: this.sessionId,
      blockIndex,
      pattern,
      bucket,
      result: {
        pct: result.pct,
        verdict: result.verdict,
        profit: result.profit,
        expectedDirection: result.expectedDirection,
        actualDirection: result.actualDirection,
      },
      runningTotals: {
        cumulativeProfit,
        maxSingleProfitSoFar: maxSingleSoFar,
        observationCount: allResults.length,
        consecutiveFair,
        consecutiveUnfair,
      },
      currentThresholds: {
        crossedSingle70: maxSingleSoFar >= 70,
        crossedCumulative100: cumulativeProfit >= 100,
        wouldActivateNow: maxSingleSoFar >= 70 || cumulativeProfit >= 100,
      },
      alternativeThresholds: {
        wouldCrossSingle50: maxSingleSoFar >= 50,
        wouldCrossSingle60: maxSingleSoFar >= 60,
        wouldCrossSingle80: maxSingleSoFar >= 80,
        wouldCrossSingle90: maxSingleSoFar >= 90,
        wouldCrossCumulative50: cumulativeProfit >= 50,
        wouldCrossCumulative80: cumulativeProfit >= 80,
        wouldCrossCumulative120: cumulativeProfit >= 120,
        wouldCrossCumulative150: cumulativeProfit >= 150,
      },
    };

    this.store.observationSteps.push(event);
    this.recentVerdicts.push(result.verdict);
    if (this.recentVerdicts.length > 20) this.recentVerdicts.shift();

    return event;
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
    cycle?: PatternCycle,
    activeRunSummary?: ActiveRunSummary
  ): CycleTransitionEvent {
    const bucket = this.getBucket(pattern);

    // Build observation summary if transitioning from observing
    let observationSummary: ObservationSummary | undefined;
    if (fromState === 'observing' && cycle) {
      observationSummary = this.buildObservationSummary(cycle);
    }

    const event: CycleTransitionEvent = {
      type: 'cycle_transition',
      id: uuid(),
      ts: new Date().toISOString(),
      sessionId: this.sessionId,
      blockIndex,
      pattern,
      bucket,
      fromState,
      toState,
      trigger,
      triggerValue,
      observationSummary,
      activeRunSummary,
      marketContext: this.getMarketContext(blockIndex),
    };

    this.store.transitions.push(event);

    // Handle activation start
    if (toState === 'active' && fromState === 'observing') {
      this.startActivationTracking(pattern, event, cycle);
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
    transitionEvent: CycleTransitionEvent,
    _cycle?: PatternCycle
  ): void {
    const observationSummary = transitionEvent.observationSummary || this.emptyObservationSummary();

    // Determine trigger type
    let triggerType: 'single' | 'cumulative' = 'single';
    if (transitionEvent.trigger === 'cumulative_100') {
      triggerType = 'cumulative';
    }

    // Get observation steps for this pattern during this observation period
    const patternSteps = this.store.observationSteps.filter(
      s => s.pattern === pattern
    );

    // Calculate threshold alternatives
    const thresholdBacktest = this.calculateThresholdBacktest(patternSteps);

    const record: ActivationQualityRecord = {
      id: uuid(),
      pattern,
      bucket: transitionEvent.bucket,
      activationBlockIndex: transitionEvent.blockIndex,
      activationTrigger: transitionEvent.trigger,
      triggerType,
      triggerValue: transitionEvent.triggerValue || 0,
      observationSteps: observationSummary.count,
      cumulativeAtActivation: observationSummary.cumulativeProfit,
      maxSingleAtActivation: observationSummary.maxSingleProfit,
      consecutiveFairAtActivation: observationSummary.consecutiveFair,
      observationSummary,
      marketContextAtActivation: transitionEvent.marketContext,
      thresholdBacktest,
    };

    // Add B&S context if applicable
    if (transitionEvent.bucket === 'BNS') {
      // Would need to track this from bucket manager
      record.bnsContext = {
        entryLossPct: 0,  // TODO: Get from bucket manager
        entryLossBlockIndex: 0,
        blocksInBnsBeforeActivation: 0,
        accumulatedWhileWaitingForBait: observationSummary.cumulativeProfit,
      };
    }

    this.store.activeActivations.set(pattern, record);
    this.store.activationStartBlocks.set(pattern, transitionEvent.blockIndex);
  }

  private calculateThresholdBacktest(
    observationSteps: ObservationStepEvent[]
  ): ThresholdAlternative[] {
    const alternatives: ThresholdAlternative[] = [];

    // Test single thresholds
    for (const threshold of BACKTEST_SINGLE_THRESHOLDS) {
      const stepIndex = observationSteps.findIndex(
        s => s.runningTotals.maxSingleProfitSoFar >= threshold
      );

      alternatives.push({
        thresholdType: 'single',
        thresholdValue: threshold,
        wouldActivateAtStep: stepIndex >= 0 ? stepIndex : null,
        wouldActivateAtBlock: stepIndex >= 0 ? observationSteps[stepIndex].blockIndex : null,
        stepsDifference: 0,  // Will be calculated when we know actual activation
        hypotheticalPnL: 0,  // Will be calculated when active period ends
        hypotheticalDuration: 0,
        hypotheticalWasSuccessful: false,
      });
    }

    // Test cumulative thresholds
    for (const threshold of BACKTEST_CUMULATIVE_THRESHOLDS) {
      const stepIndex = observationSteps.findIndex(
        s => s.runningTotals.cumulativeProfit >= threshold
      );

      alternatives.push({
        thresholdType: 'cumulative',
        thresholdValue: threshold,
        wouldActivateAtStep: stepIndex >= 0 ? stepIndex : null,
        wouldActivateAtBlock: stepIndex >= 0 ? observationSteps[stepIndex].blockIndex : null,
        stepsDifference: 0,
        hypotheticalPnL: 0,
        hypotheticalDuration: 0,
        hypotheticalWasSuccessful: false,
      });
    }

    return alternatives;
  }

  private endActivationTracking(
    pattern: PatternName,
    endReason: TransitionTrigger,
    endBlockIndex: number,
    activeRunSummary?: ActiveRunSummary
  ): void {
    const record = this.store.activeActivations.get(pattern);
    if (!record) return;

    const summary = activeRunSummary || this.emptyActiveRunSummary();

    record.outcome = {
      endBlockIndex,
      endReason,
      activeRunSummary: summary,
      wasSuccessful: summary.totalPnL > 0,
    };

    // Calculate threshold backtest outcomes
    const actualActivationStep = record.observationSteps;
    for (const alt of record.thresholdBacktest) {
      if (alt.wouldActivateAtStep !== null) {
        alt.stepsDifference = actualActivationStep - alt.wouldActivateAtStep;

        // Calculate hypothetical PnL
        // This would require knowing all results from alt activation point
        // For now, we estimate based on duration difference
        if (alt.stepsDifference > 0) {
          // Would have activated earlier - would have more results
          alt.hypotheticalDuration = summary.duration + alt.stepsDifference;
          // Simple estimate: assume similar per-block performance
          const perBlockPnL = summary.duration > 0 ? summary.totalPnL / summary.duration : 0;
          alt.hypotheticalPnL = perBlockPnL * alt.hypotheticalDuration;
        } else {
          // Would have activated later or same time
          alt.hypotheticalDuration = Math.max(0, summary.duration + alt.stepsDifference);
          const perBlockPnL = summary.duration > 0 ? summary.totalPnL / summary.duration : 0;
          alt.hypotheticalPnL = perBlockPnL * alt.hypotheticalDuration;
        }
        alt.hypotheticalWasSuccessful = alt.hypotheticalPnL > 0;
      }
    }

    // Update pattern summary
    this.updatePatternSummaryFromActivation(record);

    this.store.activeActivations.delete(pattern);
    this.store.activationStartBlocks.delete(pattern);
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
      bucket: this.getBucket(pattern),
      breakType,
      breakReason: breakType,
      breakLossPct,
      activeRunSummary: activeRunSummary || this.emptyActiveRunSummary(),
      postBreakResults: [],
    };

    this.store.pendingBreakAnalyses.push(event);
  }

  /**
   * Called for each result after a break to track post-break performance.
   * Call this for up to 10 results after the break.
   */
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
          hypotheticalProfit: result.profit,
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

  /**
   * Record what would have happened if we had bet on this pattern.
   * Only call when pattern is NOT active (observing or broken).
   */
  recordCounterfactual(
    pattern: PatternName,
    currentState: CycleState,
    result: EvaluatedResult,
    blockIndex: number
  ): void {
    if (currentState === 'active') return;

    const event: CounterfactualEvent = {
      type: 'counterfactual',
      ts: new Date().toISOString(),
      sessionId: this.sessionId,
      blockIndex,
      pattern,
      bucket: this.getBucket(pattern),
      currentState,
      result: {
        blockIndex,
        verdict: result.verdict,
        pct: result.pct,
        expectedDirection: result.expectedDirection,
        actualDirection: result.actualDirection,
        hypotheticalProfit: result.profit,
      },
    };

    this.store.counterfactuals.push(event);

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
        observingPercentage: 0,
      });
    }
    return this.store.patternSummaries.get(pattern)!;
  }

  private updatePatternSummaryFromActivation(record: ActivationQualityRecord): void {
    const summary = this.getOrCreatePatternSummary(record.pattern);

    summary.activationCount++;
    const n = summary.activationCount;

    // Running averages
    summary.avgObservationBeforeActivation =
      ((n - 1) * summary.avgObservationBeforeActivation + record.observationSteps) / n;
    summary.avgConsecutiveFairBeforeActivation =
      ((n - 1) * summary.avgConsecutiveFairBeforeActivation + record.consecutiveFairAtActivation) / n;

    if (record.outcome) {
      const successCount = summary.activationSuccessRate * (n - 1);
      summary.activationSuccessRate = (successCount + (record.outcome.wasSuccessful ? 1 : 0)) / n;

      summary.avgActivePeriodPnL =
        ((n - 1) * summary.avgActivePeriodPnL + record.outcome.activeRunSummary.totalPnL) / n;
      summary.avgActivePeriodDuration =
        ((n - 1) * summary.avgActivePeriodDuration + record.outcome.activeRunSummary.duration) / n;

      summary.blocksInActive += record.outcome.activeRunSummary.duration;
    }

    this.updateObservingPercentage(summary);
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

    this.updateObservingPercentage(summary);
  }

  private updateObservingPercentage(summary: PatternCycleAnalytics): void {
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

    // Calculate per-bucket stats
    const mainActivations = this.store.transitions.filter(
      t => t.toState === 'active' && t.bucket === 'MAIN'
    );
    const bnsActivations = this.store.transitions.filter(
      t => t.toState === 'active' && t.bucket === 'BNS'
    );

    // Get outcomes for bucket stats
    const mainRecords = Array.from(this.store.activeActivations.values())
      .filter(r => r.bucket === 'MAIN' && r.outcome);
    const bnsRecords = Array.from(this.store.activeActivations.values())
      .filter(r => r.bucket === 'BNS' && r.outcome);

    return {
      sessionId: this.sessionId,
      ts: new Date().toISOString(),
      sessionDuration: this.blocks.length,

      totalTransitions: this.store.transitions.length,
      totalActivations: allSummaries.reduce((s, p) => s + p.activationCount, 0),
      totalBreaks: allSummaries.reduce((s, p) => s + p.breakCount, 0),

      overallActivationSuccessRate: this.calculateWeightedRate(
        allSummaries, s => s.activationSuccessRate, s => s.activationCount
      ),
      overallBreakAccuracy: this.calculateWeightedRate(
        allSummaries, s => s.breakAccuracy, s => s.breakCount
      ),
      totalNetObservationValue: allSummaries.reduce((s, p) => s + p.netObservationValue, 0),

      perPattern: perPattern as Record<PatternName, PatternCycleAnalytics>,

      perBucket: {
        MAIN: {
          activations: mainActivations.length,
          successRate: mainRecords.length > 0
            ? mainRecords.filter(r => r.outcome?.wasSuccessful).length / mainRecords.length
            : 0,
          avgPnL: mainRecords.length > 0
            ? mainRecords.reduce((s, r) => s + (r.outcome?.activeRunSummary.totalPnL || 0), 0) / mainRecords.length
            : 0,
        },
        BNS: {
          activations: bnsActivations.length,
          successRate: bnsRecords.length > 0
            ? bnsRecords.filter(r => r.outcome?.wasSuccessful).length / bnsRecords.length
            : 0,
          avgPnL: bnsRecords.length > 0
            ? bnsRecords.reduce((s, r) => s + (r.outcome?.activeRunSummary.totalPnL || 0), 0) / bnsRecords.length
            : 0,
        },
      },

      transitions: this.store.transitions,
      breakAnalyses: [...this.store.pendingBreakAnalyses],
      observationSteps: this.store.observationSteps,
    };
  }

  private calculateWeightedRate(
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

  buildObservationSummary(cycle: PatternCycle): ObservationSummary {
    const results = cycle.observationResults || [];

    let consecutiveFair = 0;
    let consecutiveUnfair = 0;

    // Count consecutive fair from end
    for (let i = results.length - 1; i >= 0; i--) {
      const v = results[i].verdict;
      if (v === 'fair' || v === 'neutral') {
        consecutiveFair++;
      } else {
        break;
      }
    }

    // Count consecutive unfair from end
    for (let i = results.length - 1; i >= 0; i--) {
      const v = results[i].verdict;
      if (v === 'unfair' || v === 'fake') {
        consecutiveUnfair++;
      } else {
        break;
      }
    }

    const profits = results.map(r => r.profit);

    return {
      count: results.length,
      consecutiveFair,
      consecutiveUnfair,
      cumulativeProfit: cycle.cumulativeProfit,
      maxSingleProfit: profits.length > 0 ? Math.max(...profits) : 0,
      minSingleProfit: profits.length > 0 ? Math.min(...profits) : 0,
      fairCount: results.filter(r => r.verdict === 'fair').length,
      unfairCount: results.filter(r => r.verdict === 'unfair').length,
      fakeCount: results.filter(r => r.verdict === 'fake').length,
      neutralCount: results.filter(r => r.verdict === 'neutral').length,
    };
  }

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
      drawdownAtEnd: peak - cumulative,
    };
  }

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
      fakeCount: 0,
      neutralCount: 0,
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
      drawdownAtEnd: 0,
    };
  }

  // ========================================
  // RESET / CLEANUP
  // ========================================

  reset(): void {
    this.store = this.createEmptyStore();
    this.blocks = [];
    this.recentVerdicts = [];
  }

  /**
   * Finalize any pending analyses at end of session
   */
  finalizeSession(): void {
    // Finalize any remaining break analyses
    for (const analysis of [...this.store.pendingBreakAnalyses]) {
      if (analysis.postBreakResults.length > 0) {
        this.finalizeBreakAnalysis(analysis);
      }
    }

    // End any active activations
    for (const [_pattern, record] of this.store.activeActivations) {
      if (!record.outcome) {
        record.outcome = {
          endBlockIndex: this.blocks.length - 1,
          endReason: 'session_end',
          activeRunSummary: this.emptyActiveRunSummary(),
          wasSuccessful: false,
        };
        this.updatePatternSummaryFromActivation(record);
      }
    }
  }
}
