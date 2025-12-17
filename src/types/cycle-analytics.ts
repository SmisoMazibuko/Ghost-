/**
 * Ghost Evaluator - Cycle Analytics Types
 * ========================================
 * Types for pattern cycle optimization analysis.
 *
 * Purpose: Enable data-driven decisions about:
 * 1. Activation timing (when to start betting)
 * 2. Break sensitivity (when to stop betting)
 * 3. Threshold optimization (70% single, 100% cumulative)
 * 4. MAIN vs B&S bucket behavior differences
 */

import { Direction, PatternName, Verdict } from './index';

// ============================================================================
// CORE TYPES
// ============================================================================

/** Cycle states for patterns */
export type CycleState = 'observing' | 'active' | 'broken';

/** Bucket classification for patterns */
export type BucketType = 'MAIN' | 'BNS' | 'WAITING';

/** What triggered a state transition */
export type TransitionTrigger =
  | 'single_70'           // Single result >= 70%
  | 'cumulative_100'      // Cumulative >= 100%
  | 'loss_break'          // Lost while active
  | 'structural_kill'     // AP5/OZ/PP/ST structural rule
  | 'bns_inverse'         // B&S inverse bet completed
  | 'manual'              // External/manual trigger
  | 'session_start'       // Initial state
  | 'session_end';        // Session ended

// ============================================================================
// OBSERVATION STEP TRACKING (For Threshold Optimization)
// ============================================================================

/**
 * Logged at EVERY observation step.
 * Enables backtesting of alternative activation thresholds.
 */
export interface ObservationStepEvent {
  type: 'observation_step';
  ts: string;
  sessionId: string;
  blockIndex: number;
  pattern: PatternName;
  bucket: BucketType;

  // Current result details
  result: {
    pct: number;
    verdict: Verdict;
    profit: number;
    expectedDirection: Direction;
    actualDirection: Direction;
  };

  // Running totals AT THIS MOMENT
  runningTotals: {
    cumulativeProfit: number;
    maxSingleProfitSoFar: number;
    observationCount: number;
    consecutiveFair: number;
    consecutiveUnfair: number;
  };

  // Threshold crossing status (current thresholds: 70/100)
  currentThresholds: {
    crossedSingle70: boolean;
    crossedCumulative100: boolean;
    wouldActivateNow: boolean;
  };

  // Alternative threshold analysis (for backtesting)
  alternativeThresholds: {
    // Single thresholds
    wouldCrossSingle50: boolean;
    wouldCrossSingle60: boolean;
    wouldCrossSingle80: boolean;
    wouldCrossSingle90: boolean;
    // Cumulative thresholds
    wouldCrossCumulative50: boolean;
    wouldCrossCumulative80: boolean;
    wouldCrossCumulative120: boolean;
    wouldCrossCumulative150: boolean;
  };
}

// ============================================================================
// CYCLE TRANSITION EVENTS
// ============================================================================

/** Summary of observation period before activation */
export interface ObservationSummary {
  /** Number of results during observation */
  count: number;
  /** Consecutive fair verdicts at end */
  consecutiveFair: number;
  /** Consecutive unfair verdicts at end */
  consecutiveUnfair: number;
  /** Total cumulative profit during observation */
  cumulativeProfit: number;
  /** Maximum single result profit */
  maxSingleProfit: number;
  /** Minimum single result profit (most negative) */
  minSingleProfit: number;
  /** Count of fair verdicts */
  fairCount: number;
  /** Count of unfair verdicts */
  unfairCount: number;
  /** Count of fake verdicts */
  fakeCount: number;
  /** Count of neutral verdicts */
  neutralCount: number;
}

/** Market context at time of transition */
export interface MarketContext {
  blockIndex: number;
  runLength: number;
  runDirection: Direction;
  avgPctLast5: number;
  avgPctLast10: number;
  recentVerdicts: Verdict[];  // Last 5
  recentDirections: Direction[];  // Last 5
  sessionProgress: number;  // blocks / typical session length (100)
  totalBlocksInSession: number;
}

/** Summary of active period performance */
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

/** Event logged when pattern transitions between states */
export interface CycleTransitionEvent {
  type: 'cycle_transition';
  id: string;
  ts: string;
  sessionId: string;
  blockIndex: number;
  pattern: PatternName;
  bucket: BucketType;
  fromState: CycleState;
  toState: CycleState;
  trigger: TransitionTrigger;
  triggerValue?: number;  // e.g., the pct that triggered activation

  // Populated for observing -> active transitions
  observationSummary?: ObservationSummary;

  // Populated for active -> observing/broken transitions
  activeRunSummary?: ActiveRunSummary;

  marketContext: MarketContext;
}

// ============================================================================
// B&S SPECIFIC TRACKING
// ============================================================================

/** Context for B&S bucket activations */
export interface BnsActivationContext {
  /** Loss percentage that put pattern into B&S */
  entryLossPct: number;
  /** Block index when entered B&S */
  entryLossBlockIndex: number;
  /** Blocks spent in B&S before activation */
  blocksInBnsBeforeActivation: number;
  /** Profit accumulated while waiting for bait */
  accumulatedWhileWaitingForBait: number;
  /** Block index when bait was confirmed (if applicable) */
  baitConfirmedAtIndex?: number;
}

// ============================================================================
// ACTIVATION QUALITY TRACKING
// ============================================================================

/** Complete record of an activation for quality analysis */
export interface ActivationQualityRecord {
  id: string;
  pattern: PatternName;
  bucket: BucketType;
  activationBlockIndex: number;
  activationTrigger: TransitionTrigger;
  triggerType: 'single' | 'cumulative';
  triggerValue: number;

  // State at activation
  observationSteps: number;
  cumulativeAtActivation: number;
  maxSingleAtActivation: number;
  consecutiveFairAtActivation: number;

  // Context
  observationSummary: ObservationSummary;
  marketContextAtActivation: MarketContext;

  // B&S context (if bucket === 'BNS')
  bnsContext?: BnsActivationContext;

  // Outcome (filled when active period ends)
  outcome?: {
    endBlockIndex: number;
    endReason: TransitionTrigger;
    activeRunSummary: ActiveRunSummary;
    wasSuccessful: boolean;  // totalPnL > 0
  };

  // Threshold backtest data
  thresholdBacktest: ThresholdAlternative[];
}

/** Hypothetical outcome at different threshold */
export interface ThresholdAlternative {
  thresholdType: 'single' | 'cumulative';
  thresholdValue: number;  // e.g., 60, 80, 100, 120

  // When would we have activated?
  wouldActivateAtStep: number | null;  // null = never during observation
  wouldActivateAtBlock: number | null;

  // Difference from actual
  stepsDifference: number;  // Positive = earlier, Negative = later

  // Hypothetical outcome (calculated from actual results)
  hypotheticalPnL: number;
  hypotheticalDuration: number;
  hypotheticalWasSuccessful: boolean;
}

// ============================================================================
// COUNTERFACTUAL TRACKING
// ============================================================================

/** Single counterfactual result (what would have happened) */
export interface CounterfactualResult {
  blockIndex: number;
  verdict: Verdict;
  pct: number;
  expectedDirection: Direction;
  actualDirection: Direction;
  hypotheticalProfit: number;  // + if would have won, - if would have lost
}

/** Event for tracking missed opportunities while observing */
export interface CounterfactualEvent {
  type: 'counterfactual';
  ts: string;
  sessionId: string;
  blockIndex: number;
  pattern: PatternName;
  bucket: BucketType;
  currentState: CycleState;
  result: CounterfactualResult;
}

/** Summary of counterfactuals for a pattern */
export interface CounterfactualSummary {
  pattern: PatternName;
  totalWhileObserving: number;
  missedProfits: number;  // Sum of positive hypotheticalProfit
  avoidedLosses: number;  // Sum of negative hypotheticalProfit (as positive)
  netObservationValue: number;  // avoidedLosses - missedProfits
  missedFairCount: number;
  missedNeutralCount: number;
  avoidedUnfairCount: number;
  avoidedFakeCount: number;
}

// ============================================================================
// BREAK ANALYSIS
// ============================================================================

/** Detailed analysis of a break event */
export interface BreakAnalysisEvent {
  type: 'break_analysis';
  id: string;
  ts: string;
  sessionId: string;
  blockIndex: number;
  pattern: PatternName;
  bucket: BucketType;
  breakType: 'loss_break' | 'structural_kill' | 'bns_inverse';
  breakReason: string;
  breakLossPct?: number;  // If loss-based, the losing pct

  // State at break
  activeRunSummary: ActiveRunSummary;

  // Post-break analysis (populated as blocks arrive, up to 10)
  postBreakResults: CounterfactualResult[];
  postBreakPnL?: number;  // Sum of postBreakResults hypothetical profits
  breakWasCorrect?: boolean;  // true if postBreakPnL < 0 (we avoided loss)
}

// ============================================================================
// SESSION ANALYTICS SUMMARY
// ============================================================================

/** Per-pattern analytics for a session */
export interface PatternCycleAnalytics {
  pattern: PatternName;

  // Activation metrics
  activationCount: number;
  avgObservationBeforeActivation: number;
  avgConsecutiveFairBeforeActivation: number;
  activationSuccessRate: number;  // % of activations that were profitable
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

  // Threshold analysis (per-pattern)
  thresholdAnalysis?: {
    currentSingleThreshold: number;
    currentCumulativeThreshold: number;
    optimalSingleThreshold?: number;
    optimalCumulativeThreshold?: number;
    potentialGainFromOptimal?: number;
  };
}

/** Complete session analytics */
export interface SessionCycleAnalytics {
  sessionId: string;
  ts: string;
  sessionDuration: number;  // Total blocks

  // Aggregates
  totalTransitions: number;
  totalActivations: number;
  totalBreaks: number;
  overallActivationSuccessRate: number;
  overallBreakAccuracy: number;
  totalNetObservationValue: number;

  // Per-pattern breakdown
  perPattern: Record<PatternName, PatternCycleAnalytics>;

  // Per-bucket breakdown
  perBucket: {
    MAIN: {
      activations: number;
      successRate: number;
      avgPnL: number;
    };
    BNS: {
      activations: number;
      successRate: number;
      avgPnL: number;
    };
  };

  // Raw events (for detailed analysis)
  transitions: CycleTransitionEvent[];
  breakAnalyses: BreakAnalysisEvent[];
  observationSteps: ObservationStepEvent[];
}

// ============================================================================
// ANALYTICS STORE (Runtime State)
// ============================================================================

/** Runtime store for analytics collection */
export interface CycleAnalyticsStore {
  // Active tracking (during session)
  activeActivations: Map<PatternName, ActivationQualityRecord>;
  activationStartBlocks: Map<PatternName, number>;
  pendingBreakAnalyses: BreakAnalysisEvent[];

  // Event logs
  observationSteps: ObservationStepEvent[];
  counterfactuals: CounterfactualEvent[];
  transitions: CycleTransitionEvent[];

  // Running summaries (updated incrementally)
  patternSummaries: Map<PatternName, PatternCycleAnalytics>;

  // Bucket tracking
  currentBuckets: Map<PatternName, BucketType>;
}

// ============================================================================
// THRESHOLD BACKTEST CONFIGURATION
// ============================================================================

/** Thresholds to test during backtest analysis */
export const BACKTEST_SINGLE_THRESHOLDS = [50, 60, 70, 80, 90] as const;
export const BACKTEST_CUMULATIVE_THRESHOLDS = [50, 80, 100, 120, 150] as const;

/** Configuration for threshold optimization */
export interface ThresholdOptimizationConfig {
  /** Single thresholds to test */
  singleThresholds: number[];
  /** Cumulative thresholds to test */
  cumulativeThresholds: number[];
  /** Minimum activations required for statistical significance */
  minActivationsForSignificance: number;
  /** Whether to run per-pattern optimization */
  perPatternOptimization: boolean;
  /** Whether to run per-bucket optimization */
  perBucketOptimization: boolean;
}

export const DEFAULT_THRESHOLD_OPTIMIZATION_CONFIG: ThresholdOptimizationConfig = {
  singleThresholds: [50, 60, 70, 80, 90],
  cumulativeThresholds: [50, 80, 100, 120, 150],
  minActivationsForSignificance: 10,
  perPatternOptimization: true,
  perBucketOptimization: true,
};

// ============================================================================
// HELPER TYPE GUARDS
// ============================================================================

export function isCycleTransitionEvent(event: unknown): event is CycleTransitionEvent {
  return typeof event === 'object' && event !== null && (event as CycleTransitionEvent).type === 'cycle_transition';
}

export function isObservationStepEvent(event: unknown): event is ObservationStepEvent {
  return typeof event === 'object' && event !== null && (event as ObservationStepEvent).type === 'observation_step';
}

export function isBreakAnalysisEvent(event: unknown): event is BreakAnalysisEvent {
  return typeof event === 'object' && event !== null && (event as BreakAnalysisEvent).type === 'break_analysis';
}

export function isCounterfactualEvent(event: unknown): event is CounterfactualEvent {
  return typeof event === 'object' && event !== null && (event as CounterfactualEvent).type === 'counterfactual';
}
