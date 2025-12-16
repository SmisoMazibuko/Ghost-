/**
 * Ghost Evaluator v15.3 - Data Collection Types
 * ==============================================
 * Type definitions for the data logging and analysis system
 */

import {
  Block,
  Direction,
  PatternName,
  PatternState,
  SessionState,
  Verdict,
  PatternCycle,
  RunData,
  ZZRunRecord,
  ZZPocket,
} from '../types';

// ============================================================================
// ACTION TYPES
// ============================================================================

/** Evaluator action/decision */
export type EvaluatorAction = 'PLAY' | 'SKIP' | 'HOLD' | 'STOP_SESSION';

/** Reason codes for decisions */
export type DecisionReason =
  | 'PATTERN_ACTIVE'           // Pattern is active and has signal
  | 'PATTERN_OBSERVING'        // Pattern detected but still observing
  | 'NO_ACTIVE_PATTERNS'       // No patterns currently active
  | 'P1_MODE_ACTIVE'           // P1 mode prevents play
  | 'DAILY_TARGET_REACHED'     // Session target met
  | 'OPPOSITE_PREFERRED'       // Opposite pattern is more profitable
  | 'NO_PENDING_SIGNALS'       // No patterns have pending signals
  | 'MANUAL_SKIP'              // User chose to skip
  | 'MANUAL_STOP';             // User stopped session

// ============================================================================
// LOGGED PLAY RECORD (Per Block/Decision)
// ============================================================================

/** Snapshot of pattern states at a moment in time */
export interface PatternSnapshot {
  name: PatternName;
  state: PatternState;
  cumulativeProfit: number;
  allTimeProfit: number;
  observationCount: number;
  activeCount: number;
  lastFormationIndex: number;
}

/** Snapshot of evaluator state at decision time */
export interface EvaluatorStateSnapshot {
  /** Current session state */
  sessionState: SessionState;
  /** Whether P1 mode is active */
  p1Mode: boolean;
  /** Current run length */
  currentRunLength: number;
  /** Current run direction */
  currentRunDirection: Direction;
  /** Total runs so far */
  totalRuns: number;
  /** Total bets placed this session */
  totalBets: number;
  /** Total wins */
  totalWins: number;
  /** Total losses */
  totalLosses: number;
  /** Current win rate (0-100) */
  winRate: number;
  /** Current cumulative P/L */
  cumulativePnl: number;
  /** Progress toward daily target (0-100) */
  targetProgress: number;
  /** Snapshot of all pattern states */
  patternStates: PatternSnapshot[];
  /** Patterns that are currently active */
  activePatterns: PatternName[];
  /** Patterns that have pending signals */
  patternsWithSignals: PatternName[];
}

/** Decision made by the evaluator */
export interface EvaluatorDecision {
  /** Action taken */
  action: EvaluatorAction;
  /** Primary reason for decision */
  reason: DecisionReason;
  /** Human-readable explanation */
  explanation: string;
  /** Pattern that triggered the decision (if applicable) */
  triggerPattern?: PatternName;
  /** Predicted direction (if PLAY) */
  predictedDirection?: Direction;
  /** Confidence level (if PLAY) */
  confidence?: number;
}

/** Outcome of a bet (if one was placed) */
export interface BetOutcome {
  /** Whether the bet was placed */
  betPlaced: boolean;
  /** Pattern used for bet */
  pattern?: PatternName;
  /** Predicted direction */
  predictedDirection?: Direction;
  /** Actual direction that occurred */
  actualDirection?: Direction;
  /** Whether prediction was correct */
  isWin?: boolean;
  /** Result percentage */
  resultPct?: number;
  /** Verdict classification */
  verdict?: Verdict;
  /** P/L for this bet */
  pnl?: number;
  /** New cumulative P/L after this bet */
  newCumulativePnl?: number;
}

/** Complete logged play record for a single block */
export interface LoggedPlay {
  /** Session this play belongs to */
  sessionId: string;
  /** Block index within session */
  blockIndex: number;
  /** Timestamp of this record */
  timestamp: string;

  /** Raw block data */
  block: {
    direction: Direction;
    pct: number;
    timestamp: string;
  };

  /** Patterns detected at this block */
  detectedPatterns: PatternName[];
  /** Patterns that were evaluated at this block */
  evaluatedPatterns: PatternName[];

  /** Evaluator state BEFORE this block was processed */
  stateBefore: EvaluatorStateSnapshot;
  /** Evaluator state AFTER this block was processed */
  stateAfter: EvaluatorStateSnapshot;

  /** Decision made for this block */
  decision: EvaluatorDecision;

  /** Outcome of bet (if applicable) */
  outcome: BetOutcome;

  /** Any special events that occurred */
  events: LoggedEvent[];

  // === ENHANCED PER-BLOCK TRACKING ===

  /** Bucket state snapshot at this block */
  bucketSnapshot?: BucketSnapshot;

  /** ZZ state snapshot at this block (if ZZ active) */
  zzSnapshot?: ZZBlockSnapshot;
}

// ============================================================================
// LOGGED EVENTS
// ============================================================================

/** Event types for significant occurrences */
export type LoggedEventType =
  | 'SESSION_START'
  | 'SESSION_END'
  | 'PATTERN_ACTIVATED'
  | 'PATTERN_BROKEN'
  | 'P1_MODE_ENTERED'
  | 'P1_MODE_CLEARED'
  | 'DAILY_TARGET_REACHED'
  | 'FIRST_BET'
  | 'FIRST_WIN'
  | 'FIRST_LOSS'
  | 'STREAK_START'
  | 'STREAK_END'
  | 'MAX_DRAWDOWN'
  | 'STATE_CHANGE';

/** Logged event record */
export interface LoggedEvent {
  type: LoggedEventType;
  timestamp: string;
  blockIndex: number;
  description: string;
  data?: Record<string, unknown>;
}

// ============================================================================
// BUCKET STATE TRACKING TYPES
// ============================================================================

// Import BucketType and PatternBucketState from engine (don't re-export to avoid conflicts)
import { BucketType, PatternBucketState } from '../engine/bucket-manager';

// Re-export for internal use in this module
export type { BucketType, PatternBucketState };

/** Bucket transition record */
export interface BucketTransition {
  /** Pattern that transitioned */
  pattern: PatternName;
  /** Previous bucket */
  from: BucketType;
  /** New bucket */
  to: BucketType;
  /** Block index when transition occurred */
  blockIndex: number;
  /** Reason for transition */
  reason: string;
  /** Break run profit at transition (if entering from break) */
  breakRunProfit?: number;
  /** Whether pattern was killed (structural) vs broken (loss-based) */
  wasKilled?: boolean;
  /** Timestamp */
  ts: string;
}

/** Per-block bucket snapshot */
export interface BucketSnapshot {
  /** Patterns in MAIN bucket */
  main: PatternName[];
  /** Patterns in WAITING bucket */
  waiting: PatternName[];
  /** Patterns in BNS bucket */
  bns: PatternName[];
  /** Bucket transitions that occurred this block (if any) */
  changes?: BucketTransition[];
}

// ============================================================================
// LOSS TRACKING TYPES
// ============================================================================

/** Loss streak summary */
export interface LossStreakSummary {
  /** Maximum consecutive losses */
  maxConsecutive: number;
  /** Total number of 2+ loss streaks */
  totalStreaks: number;
  /** Average streak length */
  avgStreakLength: number;
}

/** B&S effectiveness metrics */
export interface BnsEffectiveness {
  /** Total B&S switch attempts */
  totalBnsSwitches: number;
  /** Successful switches (wins) */
  successfulSwitches: number;
  /** Failed switches (losses) */
  failedSwitches: number;
  /** Switch win rate */
  switchWinRate: number;
}

// ============================================================================
// P1 FLOW TRACKING TYPES
// ============================================================================

/** P1 mode event */
export interface P1FlowEvent {
  /** Event type */
  type: 'enter' | 'exit';
  /** Block index */
  blockIndex: number;
  /** Run length at event */
  runLength: number;
  /** Run direction at event */
  runDirection: Direction;
  /** Cumulative P/L at event */
  pnlAtEvent: number;
  /** Timestamp */
  ts: string;
}

/** P1 flow analysis summary */
export interface P1FlowAnalysis {
  /** All P1 events */
  p1Events: P1FlowEvent[];
  /** Total P1 entries */
  totalP1Entries: number;
  /** Average run length when P1 entered */
  avgRunLengthAtEntry: number;
  /** Average blocks spent in P1 mode */
  avgBlocksInP1: number;
  /** P/L impact during P1 mode (hypothetical losses avoided) */
  pnlLostDuringP1: number;
  /** Longest P1 duration in blocks */
  longestP1Duration: number;
  /** Patterns active when P1 triggered */
  patternsActiveAtP1Entry: Record<PatternName, number>;
}

// ============================================================================
// ZZ/ANTIZZ POCKET SYSTEM TRACKING TYPES
// ============================================================================

/** ZZ pocket performance */
export interface ZZPocketPerformance {
  /** Total runs in this pocket */
  totalRuns: number;
  /** Total bets placed */
  totalBets: number;
  /** Wins */
  wins: number;
  /** Losses */
  losses: number;
  /** Total profit */
  profit: number;
  /** Win rate */
  winRate: number;
}

/** ZZ pocket 2 stats (observation only) */
export interface ZZPocket2Stats {
  /** Total runs in pocket 2 */
  totalRuns: number;
  /** Blocks observed without betting */
  observedBlocks: number;
}

/** ZZ pocket analysis */
export interface ZZPocketAnalysis {
  /** Pocket 1 performance (active betting) */
  pocket1: ZZPocketPerformance;
  /** Pocket 2 stats (observation) */
  pocket2: ZZPocket2Stats;
  /** Anti-ZZ specific performance */
  antiZZPerformance: ZZPocketPerformance;
  /** ZZ specific performance */
  zzPerformance: ZZPocketPerformance;
  /** Number of pocket transitions */
  pocketTransitions: number;
  /** Average runs per pocket */
  avgRunsPerPocket: number;
}

/** ZZ session state for data collection */
export interface ZZSessionState {
  /** Final ZZ state */
  finalState: 'inactive' | 'zz_active' | 'anti_zz_active' | 'suspended';
  /** Final pocket */
  currentPocket: ZZPocket;
  /** Complete run history */
  runHistory: ZZRunRecord[];
  /** Pocket analysis */
  pocketAnalysis: ZZPocketAnalysis;
  /** Total activations */
  activationCount: number;
  /** Total ZZ/AntiZZ profit */
  totalProfit: number;
}

/** Per-block ZZ snapshot */
export interface ZZBlockSnapshot {
  /** Current ZZ state */
  state: 'inactive' | 'zz_active' | 'anti_zz_active' | 'suspended';
  /** Current pocket */
  pocket: ZZPocket;
  /** Current run profit */
  currentRunProfit: number;
  /** Predicted direction (if active) */
  predictedDirection?: Direction;
  /** Indicator direction */
  indicatorDirection?: Direction;
}

// ============================================================================
// SESSION LOG (Complete Session Record)
// ============================================================================

/** Summary statistics for a session */
export interface SessionSummary {
  /** Total blocks in session */
  totalBlocks: number;
  /** Total bets placed */
  totalBets: number;
  /** Total wins */
  wins: number;
  /** Total losses */
  losses: number;
  /** Final win rate */
  winRate: number;
  /** Final P/L */
  finalPnl: number;
  /** Maximum P/L reached */
  maxPnl: number;
  /** Minimum P/L (max drawdown) */
  minPnl: number;
  /** Maximum drawdown from peak */
  maxDrawdown: number;
  /** Final session state */
  finalState: SessionState;
  /** Whether daily target was reached */
  targetReached: boolean;
  /** Time P1 mode was first entered (if any) */
  firstP1ModeBlock?: number;
  /** Total time in P1 mode (blocks) */
  blocksInP1Mode: number;
  /** Number of times each pattern was activated */
  patternActivations: Record<PatternName, number>;
  /** Number of bets per pattern */
  betsPerPattern: Record<PatternName, number>;
  /** Wins per pattern */
  winsPerPattern: Record<PatternName, number>;
  /** P/L per pattern */
  pnlPerPattern: Record<PatternName, number>;

  // === ENHANCED LOSS TRACKING ===
  /** Loss streak metrics */
  lossStreak: LossStreakSummary;
  /** Losses per pattern */
  lossesPerPattern: Record<PatternName, number>;
  /** Losses while in B&S mode */
  lossesInBns: number;
  /** Losses while in MAIN bucket */
  lossesInMain: number;
  /** B&S switch effectiveness */
  bnsEffectiveness: BnsEffectiveness;
}

/** Configuration snapshot for the session */
export interface ConfigSnapshot {
  neutralBand: number;
  dailyTarget: number;
  betAmount: number;
  singleProfitThreshold: number;
  cumulativeProfitThreshold: number;
  p1ConsecutiveThreshold: number;
  enabledPatterns: PatternName[];
}

/** Complete session log */
export interface SessionLog {
  /** Unique session identifier */
  sessionId: string;
  /** Version of the evaluator */
  evaluatorVersion: string;
  /** When session started */
  startTime: string;
  /** When session ended */
  endTime: string;
  /** Duration in milliseconds */
  durationMs: number;

  /** Configuration used for this session */
  config: ConfigSnapshot;

  /** All plays in this session */
  plays: LoggedPlay[];

  /** All events in this session */
  events: LoggedEvent[];

  /** Summary statistics */
  summary: SessionSummary;

  /** Raw block sequence (for quick access) */
  blockSequence: Block[];

  /** Final pattern states */
  finalPatternStates: Record<PatternName, PatternCycle>;

  /** Final run data */
  finalRunData: RunData;

  /** Notes or comments (optional) */
  notes?: string;

  // === ENHANCED DATA COLLECTION ===

  /** Final bucket states for all patterns */
  finalBucketStates: Record<PatternName, PatternBucketState>;

  /** All bucket transitions during session */
  bucketTransitionHistory: BucketTransition[];

  /** P1 flow analysis */
  p1FlowAnalysis: P1FlowAnalysis;

  /** ZZ/AntiZZ session state and analysis */
  zzSessionState: ZZSessionState;
}

// ============================================================================
// AGGREGATED PLAY LOG (For Cross-Session Analysis)
// ============================================================================

/** Minimal play record for aggregated CSV/JSONL log */
export interface AggregatedPlayRecord {
  sessionId: string;
  timestamp: string;
  blockIndex: number;
  direction: Direction;
  pct: number;
  runLength: number;
  sessionState: SessionState;
  p1Mode: boolean;
  detectedPatterns: string;  // Comma-separated
  action: EvaluatorAction;
  reason: DecisionReason;
  triggerPattern: string;
  predictedDirection: number;
  actualDirection: number;
  isWin: number;  // 0/1 for CSV
  pnl: number;
  cumulativePnl: number;
  activePatterns: string;  // Comma-separated
  winRate: number;
}

// ============================================================================
// ANALYSIS QUERY TYPES
// ============================================================================

/** Filter criteria for querying plays */
export interface PlayFilter {
  sessionIds?: string[];
  dateRange?: { start: string; end: string };
  patterns?: PatternName[];
  sessionStates?: SessionState[];
  actions?: EvaluatorAction[];
  minPct?: number;
  maxPct?: number;
  onlyBets?: boolean;
  onlyWins?: boolean;
  onlyLosses?: boolean;
  p1ModeOnly?: boolean;
}

/** Aggregation options for analysis */
export interface AggregationOptions {
  groupBy: 'pattern' | 'sessionState' | 'action' | 'session' | 'hour' | 'day';
  metrics: ('count' | 'winRate' | 'totalPnl' | 'avgPnl' | 'maxPnl' | 'minPnl')[];
}
