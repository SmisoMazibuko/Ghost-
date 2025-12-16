/**
 * Ghost Evaluator v15.3 - Research Data Types
 * ============================================
 * Type definitions for P1, Bait-and-Switch, and Early Detection research.
 *
 * PHASE 1: Data logging only - NO changes to pattern logic.
 * These types extend the existing logging system for research purposes.
 */

import { Direction, PatternName, PatternState } from '../types';

// ============================================================================
// MARKET STATE TYPES (Read-Only Classification)
// ============================================================================

/**
 * Market state classification for research/analysis.
 * This is READ-ONLY observation - does not affect trading decisions.
 */
export type MarketState =
  | 'CLEAN'          // Patterns working, normal alternation
  | 'CHOPPY'         // Short runs, no pattern holds, messy
  | 'ESCALATING'     // Run lengths increasing, P1 building
  | 'P1_ACTIVE'      // 7+ run in progress
  | 'P1_RECOVERY'    // Just exited P1, normalizing
  | 'BNS_DOMINANT';  // Multiple patterns in B&S mode

/**
 * Warning levels for research tracking
 */
export type WarningLevel = 0 | 1 | 2 | 3 | 4;

// ============================================================================
// B&S (BAIT-AND-SWITCH) TRACKING TYPES
// ============================================================================

/**
 * Pattern B&S mode for research tracking
 */
export type PatternBnSMode = 'normal' | 'warning' | 'bns';

/**
 * Activation event - when a pattern enters 'active' state
 */
export interface ActivationEvent {
  /** Block index when activation occurred */
  blockIndex: number;
  /** Direction at activation */
  direction: Direction;
  /** What direction the pattern predicted */
  predictedDirection: Direction;
  /** Cumulative profit that triggered activation */
  activationPct: number;
  /** Timestamp */
  timestamp: string;
}

/**
 * Break event - when an active pattern returns to 'observing'
 */
export interface BreakEvent {
  /** Block index when break occurred */
  blockIndex: number;
  /** Which activation this break is linked to */
  activationBlockIndex: number;
  /** Reason for break */
  breakReason: 'loss' | 'opposite_direction' | 'manual' | 'unknown';
  /** The pct of the block that caused break */
  breakPct: number;
  /** Actual direction that occurred */
  actualDirection: Direction;
  /** What pattern had predicted */
  predictedDirection: Direction;
  /** Timestamp */
  timestamp: string;
}

/**
 * Complete B&S cycle (activation followed by break)
 */
export interface BnSCycle {
  /** Unique cycle ID */
  cycleId: string;
  /** Pattern this cycle belongs to */
  pattern: PatternName;
  /** The activation event */
  activation: ActivationEvent;
  /** The break event */
  break: BreakEvent;
  /** Blocks from activation to break */
  cycleDuration: number;
  /** Hypothetical P/L if we had bet inverse */
  hypotheticalInversePnL: number;
  /** Hypothetical P/L if we had bet break direction */
  hypotheticalBreakDirectionPnL: number;
}

/**
 * Complete B&S tracking data per pattern
 */
export interface PatternBnSData {
  /** Pattern being tracked */
  pattern: PatternName;
  /** All activation events */
  activations: ActivationEvent[];
  /** All break events */
  breaks: BreakEvent[];
  /** Complete cycles (activation→break pairs) */
  cycles: BnSCycle[];
  /** Current B&S mode (for research observation) */
  currentMode: PatternBnSMode;
  /** Cycles in current window */
  cyclesInWindow: number;
  /** Last mode change block */
  lastModeChangeBlock: number;
  /** Consecutive confirmations (activations that didn't break) */
  consecutiveConfirmations: number;
}

// ============================================================================
// P1 (LONG RUN) TRACKING TYPES
// ============================================================================

/**
 * P1 classification type
 */
export type P1Type = 'false_p1' | 'real_p1';

/**
 * Pre-P1 phase analysis
 */
export interface PreP1Analysis {
  /** Block where pre-P1 buildup started */
  startBlock: number;
  /** Whether market was choppy before P1 */
  wasChoppy: boolean;
  /** Whether we saw escalating run lengths */
  wasEscalating: boolean;
  /** Whether alternating 3A3 was detected */
  hadAlternating3A3: boolean;
  /** Patterns that broke during buildup */
  patternsBroken: PatternName[];
  /** Run length sequence leading to P1 */
  runLengthSequence: number[];
}

/**
 * During P1 phase analysis
 */
export interface DuringP1Analysis {
  /** Total blocks in P1 */
  totalBlocks: number;
  /** Number of brief pauses (1-2 block reversals) */
  pauseCount: number;
  /** Average pct of blocks in trend direction */
  avgPctInTrend: number;
  /** Average pct of blocks against trend */
  avgPctAgainstTrend: number;
  /** Patterns that failed against the trend */
  patternsFailedAgainstTrend: PatternName[];
}

/**
 * Post-P1 recovery analysis
 */
export interface PostP1Analysis {
  /** Blocks until market normalized */
  recoveryBlocks: number;
  /** First pattern to recover/work again */
  firstPatternToRecover: PatternName | null;
  /** Blocks until normal trading resumed */
  blocksUntilNormal: number;
}

/**
 * Hypothetical P1 reversal play result
 */
export interface HypotheticalP1Play {
  /** Would the reversal bet have won */
  wouldWin: boolean;
  /** Hypothetical P/L */
  pnl: number;
  /** The pct at that block */
  pct: number;
}

/**
 * Complete P1 event record
 */
export interface P1Event {
  /** Unique event ID */
  eventId: string;
  /** Block where P1 started (run reached 7) */
  startBlockIndex: number;
  /** Block where P1 ended (direction changed) */
  endBlockIndex: number;
  /** Direction of the P1 run */
  direction: Direction;
  /** Classification (false vs real P1) */
  type: P1Type;
  /** Peak run length achieved */
  peakRunLength: number;
  /** Pre-P1 analysis */
  preP1Phase: PreP1Analysis;
  /** During P1 analysis */
  duringP1: DuringP1Analysis;
  /** Post-P1 analysis */
  postP1: PostP1Analysis;
  /** Hypothetical reversal plays */
  hypotheticalPlays: {
    reversalAt7: HypotheticalP1Play;
    reversalAt8: HypotheticalP1Play | null;
    reversalAt9: HypotheticalP1Play | null;
    reversalAt10Plus: HypotheticalP1Play | null;
  };
}

// ============================================================================
// BLOCK-LEVEL RESEARCH DATA
// ============================================================================

/**
 * Run context at a specific block
 */
export interface RunContext {
  /** Current run length */
  currentLength: number;
  /** Current run direction */
  currentDirection: Direction;
  /** Recent run lengths (last 20) */
  recentLengths: number[];
  /** Average run length in window */
  avgLength: number;
  /** Max run length in window */
  maxLengthInWindow: number;
}

/**
 * Market state context at a specific block
 */
export interface MarketStateContext {
  /** Current market state classification */
  current: MarketState;
  /** Previous market state */
  previous: MarketState;
  /** Warning level (0-4) */
  warningLevel: WarningLevel;
  /** Warning score (0-100) */
  warningScore: number;
}

/**
 * P1 context at a specific block
 */
export interface P1Context {
  /** Whether P1 mode is active */
  isActive: boolean;
  /** Blocks into current P1 (0 if not active) */
  blocksIntoP1: number;
  /** Direction of P1 (null if not active) */
  p1Direction: Direction | null;
  /** Whether run lengths are escalating */
  isEscalating: boolean;
  /** Escalation sequence if applicable */
  escalationSequence: PatternName[];
}

/**
 * Pattern state snapshot for research
 */
export interface PatternStateSnapshot {
  /** Pattern state (observing/active) */
  state: PatternState;
  /** B&S mode classification */
  mode: PatternBnSMode;
  /** Cycles in current window */
  cyclesInWindow: number;
  /** Last activation block */
  lastActivationBlock: number | null;
  /** Last break block */
  lastBreakBlock: number | null;
}

/**
 * Complete block record for research analysis
 */
export interface BlockRecord {
  /** Block index */
  blockIndex: number;
  /** Timestamp */
  timestamp: string;
  /** Block direction */
  direction: Direction;
  /** Block percentage */
  pct: number;
  /** Run context */
  run: RunContext;
  /** Market state classification */
  marketState: MarketStateContext;
  /** P1 tracking */
  p1: P1Context;
  /** Pattern states snapshot */
  patternStates: Record<PatternName, PatternStateSnapshot>;
  /** Research tags/labels */
  tags: string[];
}

// ============================================================================
// WARNING SCORE TYPES
// ============================================================================

/**
 * Warning score factors breakdown
 */
export interface WarningFactors {
  /** Run length factor (0-25) */
  runLengthFactor: number;
  /** B&S pattern factor (0-25) */
  bnsPatternFactor: number;
  /** Win rate factor (0-25) */
  winRateFactor: number;
  /** Escalation factor (0-25) */
  escalationFactor: number;
}

/**
 * Complete warning score
 */
export interface WarningScore {
  /** Warning level (0-4) */
  level: WarningLevel;
  /** Total score (0-100) */
  score: number;
  /** Factor breakdown */
  factors: WarningFactors;
  /** Recommendations (for logging) */
  recommendations: string[];
}

// ============================================================================
// SESSION RESEARCH SUMMARY
// ============================================================================

/**
 * Strategy breakdown in research summary
 */
export interface StrategyBreakdown {
  /** Number of trades */
  trades: number;
  /** Number of wins */
  wins: number;
  /** Total P/L */
  pnl: number;
  /** Win rate */
  winRate: number;
}

/**
 * State distribution entry
 */
export interface StateDistributionEntry {
  /** Blocks spent in this state */
  blocksInState: number;
  /** Percentage of session in this state */
  percentageOfSession: number;
  /** Trades made in this state */
  tradesInState: number;
  /** Win rate in this state */
  winRateInState: number;
  /** P/L in this state */
  pnlInState: number;
}

/**
 * B&S analysis per pattern in summary
 */
export interface PatternBnSAnalysis {
  /** Total cycles detected */
  totalCycles: number;
  /** Blocks spent in B&S mode */
  timeInBnsMode: number;
  /** Actual B&S plays made */
  bnsPlays: number;
  /** B&S play win rate */
  bnsWinRate: number;
  /** B&S play P/L */
  bnsPnL: number;
  /** Hypothetical inverse strategy P/L */
  hypotheticalInversePnL: number;
}

/**
 * Warning system performance analysis
 */
export interface WarningSystemAnalysis {
  /** Times level 3 was triggered */
  timesLevel3Triggered: number;
  /** Times level 4 was triggered */
  timesLevel4Triggered: number;
  /** Accuracy of warnings (did they precede losses?) */
  accuracyOfWarnings: number;
  /** Losses that occurred without prior warning */
  missedWarnings: number;
}

/**
 * Complete research session summary
 */
export interface ResearchSessionSummary {
  /** Session ID */
  sessionId: string;
  /** Start time */
  startTime: string;
  /** End time */
  endTime: string;
  /** Total blocks */
  totalBlocks: number;

  /** Overall results */
  results: {
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number;
    totalPnL: number;
  };

  /** Results by strategy (for future B&S/P1 plays) */
  byStrategy: {
    main: StrategyBreakdown;
    bns: StrategyBreakdown;
    p1: StrategyBreakdown;
  };

  /** Market state distribution */
  stateDistribution: Record<MarketState, StateDistributionEntry>;

  /** All P1 events in session */
  p1Events: P1Event[];

  /** B&S analysis per pattern */
  bnsAnalysis: Record<PatternName, PatternBnSAnalysis>;

  /** Warning system performance */
  warningSystemAnalysis: WarningSystemAnalysis;
}

// ============================================================================
// RESEARCH DATA CONTAINER
// ============================================================================

/**
 * Complete research data for a session
 */
export interface ResearchData {
  /** Session ID */
  sessionId: string;
  /** Evaluator version */
  evaluatorVersion: string;
  /** All block records */
  blockRecords: BlockRecord[];
  /** B&S tracking per pattern */
  patternBnSTracking: Record<PatternName, PatternBnSData>;
  /** All P1 events */
  p1Events: P1Event[];
  /** Research summary */
  summary: ResearchSessionSummary;
}

// ============================================================================
// RESEARCH CONFIG
// ============================================================================

/**
 * Configuration for research data collection
 */
export interface ResearchConfig {
  /** Window size for B&S cycle detection (blocks) */
  bnsWindowSize: number;
  /** Cycles needed for B&S warning mode */
  bnsWarningThreshold: number;
  /** Cycles needed for confirmed B&S mode */
  bnsConfirmedThreshold: number;
  /** Window size for run length analysis */
  runLengthWindowSize: number;
  /** Blocks to analyze before P1 */
  preP1AnalysisBlocks: number;
  /** Blocks to analyze after P1 */
  postP1AnalysisBlocks: number;
}

/**
 * Default research configuration
 */
export const DEFAULT_RESEARCH_CONFIG: ResearchConfig = {
  bnsWindowSize: 30,
  bnsWarningThreshold: 2,
  bnsConfirmedThreshold: 3,
  runLengthWindowSize: 20,
  preP1AnalysisBlocks: 20,
  postP1AnalysisBlocks: 15,
};
