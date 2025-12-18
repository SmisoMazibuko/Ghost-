/**
 * Ghost Evaluator v15.1 - Type Definitions
 * =========================================
 * Core type definitions aligned with Rulebook v15.1
 */

// ============================================================================
// DIRECTION & BASIC TYPES
// ============================================================================

/** Block direction: +1 = Up (Green), -1 = Down (Red) */
export type Direction = 1 | -1;

/** Pattern lifecycle states */
export type PatternState = 'observing' | 'active' | 'broken';

/** Session playability states */
export type SessionState = 'playable' | 'unplayable' | 'done';

/** Verdict classification for evaluated results */
export type Verdict = 'fair' | 'unfair' | 'fake' | 'neutral';

/** Pattern names as defined in v15.1 */
export type PatternName =
  | '2A2' | 'Anti2A2'
  | '3A3' | 'Anti3A3'
  | '4A4' | 'Anti4A4'
  | '5A5' | 'Anti5A5'
  | '6A6' | 'Anti6A6'
  | 'AP5' | 'OZ'
  | 'ZZ' | 'AntiZZ'
  | 'PP' | 'ST';

/** Pattern type classification */
export type PatternType = 'continuous' | 'single-shot';

// ============================================================================
// BLOCK TYPES
// ============================================================================

/** A single block in the sequence */
export interface Block {
  /** Direction: +1 = Up (Green), -1 = Down (Red) */
  dir: Direction;
  /** Percentage strength (0-100) */
  pct: number;
  /** ISO timestamp when block was added */
  ts: string;
  /** Block index in the sequence */
  index: number;
}

/** Run tracking data */
export interface RunData {
  /** Array of run lengths */
  lengths: number[];
  /** Array of run directions */
  directions: Direction[];
  /** Current run length */
  currentLength: number;
  /** Current run direction */
  currentDirection: Direction;
}

// ============================================================================
// PATTERN TYPES
// ============================================================================

/** Signal raised when a pattern is detected */
export interface PatternSignal {
  /** Pattern that was detected */
  pattern: PatternName;
  /** Block index where pattern was detected */
  signalIndex: number;
  /** Predicted direction for next block */
  expectedDirection: Direction;
  /** Timestamp of detection */
  ts: string;
  /** Indicator direction for ZZ/AntiZZ patterns (direction of the ≥3 run) */
  indicatorDirection?: Direction;
  /** True if this signal is being bet inversely (B&S mode) */
  isBnsInverse?: boolean;
}

/** Evaluated result of a pattern signal */
export interface EvaluatedResult {
  /** Pattern name */
  pattern: PatternName;
  /** Block index where signal was raised */
  signalIndex: number;
  /** Block index where signal was evaluated */
  evalIndex: number;
  /** Expected direction */
  expectedDirection: Direction;
  /** Actual direction that occurred */
  actualDirection: Direction;
  /** Percentage of the result block */
  pct: number;
  /** Current run length at evaluation */
  runLength: number;
  /** Verdict classification */
  verdict: Verdict;
  /** Profit/loss percentage (+pct or -pct) */
  profit: number;
  /** Whether a bet was placed (pattern was active) */
  wasBet: boolean;
  /** Timestamp */
  ts: string;
  /** Indicator direction for ZZ/AntiZZ (for persistence after break) */
  indicatorDirection?: Direction;
  /** True if this was a B&S inverse trade - pattern should break after evaluation */
  isBnsInverse?: boolean;
}

/** Pattern cycle state tracking */
export interface PatternCycle {
  /** Current lifecycle state */
  state: PatternState;
  /** Whether this is a continuous pattern (ZZ/AntiZZ) */
  isContinuous: boolean;
  /** Results during observation phase */
  observationResults: EvaluatedResult[];
  /** Results during active phase */
  activeResults: EvaluatedResult[];
  /** Cumulative profit during current observation phase */
  cumulativeProfit: number;
  /** All-time profit (never resets) */
  allTimeProfit: number;
  /** Last run profit (resets when pattern breaks and restarts) */
  lastRunProfit: number;
  /**
   * Run profit when pattern broke (preserved for bucket manager).
   * This is set when the pattern breaks and keeps the lastRunProfit value
   * before it's reset to 0.
   */
  breakRunProfit: number;
  /**
   * The single loss that broke the pattern (for 70% rule in bucket manager).
   * This is always negative (the actual loss percentage that caused the break).
   */
  breakLoss: number;
  /** Last block index where pattern formed */
  lastFormationIndex: number;
  /**
   * Saved indicator direction for ZZ/AntiZZ patterns.
   * After a profitable run breaks, ZZ stays ACTIVE waiting for this indicator.
   * When a new indicator (≥3 run) matches this direction, ZZ resumes.
   */
  savedIndicatorDirection?: Direction | null;
  /**
   * Whether ZZ is waiting for indicator (profitable run broke, waiting for next indicator)
   */
  waitingForIndicator?: boolean;
  /**
   * Whether the pattern was killed (stopped by B&S or other mechanism)
   */
  wasKilled?: boolean;
}

// ============================================================================
// ZZ STRATEGY STATE TYPES (Corrected Implementation)
// ============================================================================

/**
 * ZZ Pocket assignment based on previous run profit.
 * - Pocket 1: Previous run was profitable (profit > 0)
 * - Pocket 2: Previous run was unprofitable (profit < 0)
 *
 * NOTE: Pocket placement is for CONFIRMATION only.
 * It does NOT trigger Anti-ZZ activation.
 */
export type ZZPocket = 1 | 2;

/**
 * ZZ Strategy State Machine
 *
 * States:
 * - inactive: ZZ system not active (game start, waiting for trigger)
 * - zz_active: Normal ZZ mode - predicting alternation continues
 * - anti_zz_active: Anti-ZZ mode - predicting alternation breaks
 * - suspended: ZZ suspended during bait-and-switch (main strategy takes over)
 */
export type ZZState = 'inactive' | 'zz_active' | 'anti_zz_active' | 'suspended';

/**
 * Complete ZZ strategy session state
 *
 * NEW DESIGN: ZZ and AntiZZ are tracked SEPARATELY, each with their own pocket.
 * - Pocket 1 = Active (betting)
 * - Pocket 2 = Inactive (observing)
 * - Only ONE pattern can be in Pocket 1 at a time (they are opposites)
 * - BOTH can be in Pocket 2 (neither active)
 */
/**
 * ZZ Strategy State - STRICT POCKET SYSTEM (v16.0)
 *
 * See docs/POCKET-SYSTEM-SPEC.md for authoritative rules.
 *
 * KEY INVARIANTS:
 * - runProfitZZ is ALWAYS updated on every indicator (even imaginary)
 * - AntiZZ has NO runProfit - uses lastBetOutcome only
 * - AntiZZ waits for NEXT indicator after becoming candidate
 */
export interface ZZStrategyState {
  // === ZZ Pattern State ===
  /** ZZ's current pocket (1 = active/bet, 2 = inactive/observe) */
  zzPocket: ZZPocket;
  /** ZZ's current run profit accumulator */
  zzCurrentRunProfit: number;
  /** Whether ZZ's first bet has been evaluated this run */
  zzFirstBetEvaluated: boolean;

  // === AntiZZ Pattern State ===
  /** AntiZZ's current pocket (1 = active/bet, 2 = inactive/observe) */
  antiZZPocket: ZZPocket;
  /**
   * AntiZZ's last bet outcome (NOT cumulative - single bet only)
   * Used to determine pocket: positive = stay P1, negative = move to P2
   */
  antiZZLastBetOutcome: number | null;
  /**
   * Whether AntiZZ is a candidate waiting to activate on NEXT indicator.
   * When true, AntiZZ will play on the next indicator (not immediate).
   */
  antiZZIsCandidate: boolean;

  // === Active Pattern Tracking ===
  /** Which pattern is currently active/betting (null = neither) */
  activePattern: 'ZZ' | 'AntiZZ' | null;

  // === Shared State ===
  /** Saved indicator direction from last ZZ trigger */
  savedIndicatorDirection: Direction | null;
  /**
   * INVARIANT: runProfitZZ is ALWAYS updated on every indicator.
   * This includes imaginary first bets when ZZ is in P2.
   * Used to determine ZZ pocket: >0 = P1, <=0 = P2
   */
  runProfitZZ: number;
  /** Block index when current pattern was activated */
  activationBlockIndex: number;
  /** Whether game is currently in bait-and-switch mode */
  isInBaitSwitch: boolean;
  /** History of ZZ/AntiZZ runs for analysis */
  runHistory: ZZRunRecord[];
  /** Movement history for UI display */
  movementHistory: ZZMovementRecord[];

  // === First Bet Evaluation State ===
  /** Whether we're waiting for first bet evaluation after indicator */
  waitingForFirstBet: boolean;
  /** Block index where first bet should be evaluated */
  firstBetBlockIndex: number;
}

/**
 * Record of ZZ/Anti-ZZ pocket movement for UI display
 */
export interface ZZMovementRecord {
  /** Block index when movement occurred */
  blockIndex: number;
  /** Pattern that moved (ZZ or AntiZZ) */
  pattern: 'ZZ' | 'AntiZZ';
  /** Previous pocket before movement */
  fromPocket: ZZPocket;
  /** New pocket after movement */
  toPocket: ZZPocket;
  /** Run profit that caused the movement */
  triggerProfit: number;
  /** Timestamp */
  ts: string;
}

/**
 * Record of a completed ZZ/Anti-ZZ run
 */
export interface ZZRunRecord {
  /** Run number (1-indexed) */
  runNumber: number;

  /** Whether this was a ZZ or Anti-ZZ run */
  wasAntiZZ: boolean;

  /** Pocket assigned at start of run */
  pocket: ZZPocket;

  /** Whether first prediction was negative */
  firstPredictionNegative: boolean;

  /** Total profit for this run */
  profit: number;

  /** Number of predictions in this run */
  predictionCount: number;

  /** Block index when run started */
  startBlockIndex: number;

  /** Block index when run ended */
  endBlockIndex: number;

  /** Timestamp */
  ts: string;
}

/** Pattern definition for detection */
export interface PatternDefinition {
  /** Pattern name */
  name: PatternName;
  /** Pattern type */
  type: PatternType;
  /** Opposite pattern name (for switching logic) */
  opposite: PatternName | null;
  /** Detection function */
  detect: (runData: RunData, blockIndex: number) => PatternSignal | null;
}

// ============================================================================
// TRADE TYPES
// ============================================================================

/** Pending trade waiting for evaluation */
export interface PendingTrade {
  /** Block index when trade was opened */
  openIndex: number;
  /** Block index when trade will be evaluated */
  evalIndex: number;
  /** Predicted direction */
  direction: Direction;
  /** Confidence percentage */
  confidence: number;
  /** Pattern that triggered the trade */
  pattern: PatternName;
  /** Explanation string */
  reason: string;
  /** Timestamp */
  ts: string;
}

/** Completed trade record */
export interface CompletedTrade {
  /** Trade number */
  id: number;
  /** Block index when opened */
  openIndex: number;
  /** Block index when evaluated */
  evalIndex: number;
  /** Pattern that triggered */
  pattern: PatternName;
  /** Predicted direction */
  predictedDirection: Direction;
  /** Actual direction */
  actualDirection: Direction;
  /** Confidence percentage */
  confidence: number;
  /** Result percentage */
  pct: number;
  /** Whether prediction was correct */
  isWin: boolean;
  /** P/L in currency */
  pnl: number;
  /** Reason for trade */
  reason: string;
  /** Timestamp */
  ts: string;
}

// ============================================================================
// PREDICTION TYPES
// ============================================================================

/** Prediction result from the reaction engine */
export interface Prediction {
  /** Whether a prediction was made */
  hasPrediction: boolean;
  /** Predicted direction (if hasPrediction) */
  direction?: Direction;
  /** Confidence percentage */
  confidence?: number;
  /** Pattern that generated the prediction */
  pattern?: PatternName;
  /** Explanation */
  reason: string;
}

// ============================================================================
// SESSION TYPES
// ============================================================================

/** Session flags */
export interface SessionFlags {
  /** Whether daily target was reached */
  dailyTargetReached: boolean;
}

/** Complete session state for persistence */
export interface SessionData {
  /** Version identifier */
  version: string;
  /** All blocks in sequence */
  blocks: Block[];
  /** All evaluated results */
  results: EvaluatedResult[];
  /** Pattern cycle states */
  patternCycles: Record<PatternName, PatternCycle>;
  /** Pending signals awaiting evaluation */
  pendingSignals: PatternSignal[];
  /** Session flags */
  flags: SessionFlags;
  /** Completed trades */
  trades: CompletedTrade[];
  /** Pending trade (if any) */
  pendingTrade: PendingTrade | null;
  /** Total P/L */
  pnlTotal: number;
  /** Run tracking data */
  runData: RunData;
  /** Timestamp of last save */
  ts: string;
  /** Three-column profit tracking state (AP, AAP, BSP) */
  profitTracking?: SessionProfitState;
}

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

/** System configuration */
export interface EvaluatorConfig {
  /** Band around 50% for neutral classification (default: 0.05) */
  neutralBand: number;
  /** Daily target profit in currency (default: 2000) */
  dailyTarget: number;
  /** Fixed stake per bet (default: 200) */
  betAmount: number;
  /** Single result threshold for activation (default: 70) */
  singleProfitThreshold: number;
  /** Cumulative profit threshold for activation (default: 100) */
  cumulativeProfitThreshold: number;
  /** Consecutive same-direction blocks to trigger P1 (default: 7) */
  p1ConsecutiveThreshold: number;
}

/** Default configuration values */
export const DEFAULT_CONFIG: EvaluatorConfig = {
  neutralBand: 0.05,
  dailyTarget: 2000,
  betAmount: 200,
  singleProfitThreshold: 70,
  cumulativeProfitThreshold: 100,
  p1ConsecutiveThreshold: 7,
};

// ============================================================================
// EVENT TYPES (for logging/hooks)
// ============================================================================

/** Event types emitted by the system */
export type EventType =
  | 'block_added'
  | 'pattern_detected'
  | 'pattern_evaluated'
  | 'pattern_activated'
  | 'pattern_broken'
  | 'trade_opened'
  | 'trade_closed'
  | 'session_playable'
  | 'session_unplayable'
  | 'daily_target_reached'
  | 'same_direction_activated'
  | 'same_direction_deactivated';

/** System event */
export interface SystemEvent {
  type: EventType;
  timestamp: string;
  data: Record<string, unknown>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** All pattern names */
export const PATTERN_NAMES: PatternName[] = [
  '2A2', 'Anti2A2', '3A3', 'Anti3A3', '4A4', 'Anti4A4', '5A5', 'Anti5A5', '6A6', 'Anti6A6',
  'AP5', 'OZ', 'ZZ', 'AntiZZ', 'PP', 'ST'
];

/** Continuous patterns (break on any loss) - Note: AntiZZ is single-shot, not continuous */
export const CONTINUOUS_PATTERNS: PatternName[] = ['ZZ', 'PP', 'ST'];

// ============================================================================
// SESSION HEALTH TYPES
// ============================================================================

/** Session health state */
export type SessionHealthLevel = 'playable' | 'caution' | 'unplayable' | 'abort';

/** Session health score tracking */
export interface SessionHealth {
  /** Overall score (0-100) */
  score: number;
  /** Current health level based on score thresholds */
  level: SessionHealthLevel;
  /** Win rate factor (0-1), based on rolling 20-trade window */
  winRateFactor: number;
  /** Drawdown factor (0-1), based on current drawdown vs max acceptable */
  drawdownFactor: number;
  /** Pattern reliability factor (0-1), avg(active_win_rate / observation_win_rate) */
  patternReliabilityFactor: number;
  /** Verdict quality factor (0-1), based on fake verdict ratio */
  verdictQualityFactor: number;
  /** Block index when last calculated */
  lastCalculatedBlock: number;
}

/** Pattern divergence tracking for bait & switch detection */
export interface PatternDivergence {
  /** Pattern being tracked */
  pattern: PatternName;
  /** Win rate during observation phase */
  observationWinRate: number;
  /** Win rate during active phase */
  activeWinRate: number;
  /** Divergence score (observation - active) */
  divergenceScore: number;
  /** Whether this pattern is showing bait behavior (divergence > 25%) */
  isBaiting: boolean;
  /** Whether this pattern is confirmed bait & switch (divergence > 40%) */
  isConfirmedBaitSwitch: boolean;
  /** Total observation signals */
  observationCount: number;
  /** Total active bets */
  activeCount: number;
}

/** Loss severity tracking */
export interface LossSeverity {
  /** Sum of absolute loss percentages */
  totalWeightedLoss: number;
  /** Average loss magnitude */
  averageLossMagnitude: number;
  /** Number of losses */
  lossCount: number;
  /** Severity classification */
  severityLevel: 'minor' | 'moderate' | 'severe';
}

/** Drawdown level tracking */
export interface DrawdownState {
  /** Current P/L */
  currentPnL: number;
  /** Peak P/L during session */
  peakPnL: number;
  /** Maximum drawdown (negative value) */
  maxDrawdown: number;
  /** Current drawdown (negative value or 0) */
  currentDrawdown: number;
  /** Current drawdown level (1-4) */
  level: 0 | 1 | 2 | 3 | 4;
  /** Whether session is stopped due to drawdown */
  isStopped: boolean;
  /** Whether session is aborted (no recovery possible) */
  isAborted: boolean;
}

/** Shadow trade for recovery mode */
export interface ShadowTrade {
  /** Block index */
  blockIndex: number;
  /** Pattern that would have been traded */
  pattern: PatternName;
  /** Predicted direction */
  predictedDirection: Direction;
  /** Actual direction */
  actualDirection: Direction;
  /** Whether it would have been a win */
  wouldBeWin: boolean;
  /** Percentage */
  pct: number;
  /** Verdict */
  verdict: Verdict;
  /** Timestamp */
  ts: string;
}

/** Recovery state tracking */
export interface RecoveryState {
  /** Whether currently in recovery mode */
  isInRecoveryMode: boolean;
  /** Block index when recovery mode was entered */
  enteredAtBlock: number;
  /** Number of blocks spent in recovery */
  blocksInRecovery: number;
  /** Shadow trades during recovery */
  shadowTrades: ShadowTrade[];
  /** Shadow win rate (last 10 trades) */
  shadowWinRate: number;
  /** Fake verdict ratio during recovery */
  fakeVerdictRatio: number;
  /** Number of recovery attempts this session */
  recoveryAttempts: number;
  /** Whether recovery criteria are met */
  recoveryMet: boolean;
}

/** Re-entry state after recovery */
export interface ReentryState {
  /** Whether currently in re-entry trial period */
  isInReentry: boolean;
  /** Current stake multiplier (0.5 for half stake) */
  stakeMultiplier: number;
  /** Number of trial trades completed */
  trialTradesCompleted: number;
  /** Number of trial wins */
  trialWins: number;
  /** Required wins to exit re-entry */
  requiredWins: number;
  /** Total trial trades required */
  totalTrialTrades: number;
}

/** Pattern activation velocity tracking */
export interface ActivationVelocity {
  /** Pattern activations in the last hour */
  activationsLastHour: number;
  /** Pattern breaks in the last hour */
  breaksLastHour: number;
  /** Velocity ratio (breaks/activations) */
  velocity: number;
  /** Stability classification */
  stability: 'stable' | 'moderate' | 'high-churn';
  /** Timestamps of recent activations */
  activationTimestamps: string[];
  /** Timestamps of recent breaks */
  breakTimestamps: string[];
}

/** Verdict analysis tracking */
export interface VerdictAnalysis {
  /** Total verdicts */
  totalVerdicts: number;
  /** Fair verdicts count */
  fairCount: number;
  /** Unfair verdicts count */
  unfairCount: number;
  /** Fake verdicts count */
  fakeCount: number;
  /** Neutral verdicts count */
  neutralCount: number;
  /** Total losses */
  totalLosses: number;
  /** Fake ratio (fake / total_losses) */
  fakeRatio: number;
  /** Market state based on fake ratio */
  marketState: 'normal' | 'suspicious' | 'adversarial';
}

/** Complete session health configuration */
export interface SessionHealthConfig {
  /** Session health thresholds */
  sessionHealth: {
    /** Score above which session is playable (default: 70) */
    playableThreshold: number;
    /** Score above which session is caution (default: 50) */
    cautionThreshold: number;
    /** Score below which session is unplayable (default: 50) */
    unplayableThreshold: number;
  };
  /** Drawdown level thresholds (in currency) */
  drawdown: {
    /** Warning level (default: -300) */
    warningLevel: number;
    /** Caution level (default: -500) */
    cautionLevel: number;
    /** Stop level (default: -800) */
    stopLevel: number;
    /** Abort level (default: -1000) */
    abortLevel: number;
  };
  /** Bait & switch detection thresholds */
  baitSwitch: {
    /** Divergence warning threshold (default: 0.25) */
    divergenceWarning: number;
    /** Divergence confirmed threshold (default: 0.40) */
    divergenceConfirmed: number;
    /** Number of baiting patterns to trigger session adversarial (default: 3) */
    patternCountTrigger: number;
  };
  /** Verdict analysis thresholds */
  verdicts: {
    /** Fake ratio warning threshold (default: 0.20) */
    fakeRatioWarning: number;
    /** Fake ratio stop threshold (default: 0.40) */
    fakeRatioStop: number;
  };
  /** Recovery mode configuration */
  recovery: {
    /** Minimum blocks observed before can recover (default: 5) */
    minBlocksObserved: number;
    /** Minimum shadow win rate for recovery (default: 0.60) */
    minShadowWinRate: number;
    /** Maximum fake ratio for recovery (default: 0.20) */
    maxFakeRatio: number;
    /** Maximum blocks before abort (default: 20) */
    maxBlocksBeforeAbort: number;
  };
  /** Re-entry configuration */
  reentry: {
    /** Reduced stake amount during re-entry (default: 100) */
    reducedStake: number;
    /** Number of trial trades (default: 3) */
    trialTradeCount: number;
    /** Required wins to pass re-entry (default: 2) */
    requiredWins: number;
  };
  /** Loss severity thresholds (percentages) */
  lossSeverity: {
    /** Minor loss average threshold (default: 10) */
    minorThreshold: number;
    /** Moderate loss average threshold (default: 30) */
    moderateThreshold: number;
    /** Single severe loss threshold for immediate pause (default: 50) */
    singleSevereThreshold: number;
    /** Session weighted loss threshold for stop (default: 200) */
    sessionWeightedLossStop: number;
  };
}

/** Default session health configuration */
export const DEFAULT_SESSION_HEALTH_CONFIG: SessionHealthConfig = {
  sessionHealth: {
    playableThreshold: 70,
    cautionThreshold: 50,
    unplayableThreshold: 50,
  },
  drawdown: {
    warningLevel: -300,
    cautionLevel: -500,
    stopLevel: -800,
    abortLevel: -1000,
  },
  baitSwitch: {
    divergenceWarning: 0.25,
    divergenceConfirmed: 0.40,
    patternCountTrigger: 3,
  },
  verdicts: {
    fakeRatioWarning: 0.20,
    fakeRatioStop: 0.40,
  },
  recovery: {
    minBlocksObserved: 5,
    minShadowWinRate: 0.60,
    maxFakeRatio: 0.20,
    maxBlocksBeforeAbort: 20,
  },
  reentry: {
    reducedStake: 100,
    trialTradeCount: 3,
    requiredWins: 2,
  },
  lossSeverity: {
    minorThreshold: 10,
    moderateThreshold: 30,
    singleSevereThreshold: 50,
    sessionWeightedLossStop: 200,
  },
};

// ============================================================================
// HOSTILITY TRACKING TYPES
// ============================================================================

/** Types of hostility indicators */
export type HostilityIndicatorType =
  | 'severe_loss'           // Single loss >= 85%
  | 'pattern_run_negative'  // Pattern run ended with negative net P/L
  | 'bait_switch'           // Bait & switch detected for a pattern
  | 'consecutive_losses'    // Average loss over consecutive trades
  | 'multi_pattern_bait';   // Multiple patterns showing bait behavior

/** Individual hostility indicator */
export interface HostilityIndicator {
  /** Type of indicator */
  type: HostilityIndicatorType;
  /** Pattern involved (if applicable) */
  pattern?: PatternName;
  /** Block index when indicator was logged */
  blockIndex: number;
  /** Severity (1-3 scale) */
  severity: number;
  /** Detailed description */
  details: string;
  /** Timestamp */
  ts: string;
}

/** Pattern recovery state for pattern-based recovery */
export interface PatternRecoveryState {
  /** Pattern being tracked */
  pattern: PatternName;
  /** Whether this pattern has recovered */
  isRecovered: boolean;
  /** Shadow wins during recovery */
  shadowWins: number;
  /** Total shadow trades during recovery */
  shadowTotal: number;
  /** Shadow win rate */
  shadowWinRate: number;
  /** Cumulative profit during shadow trading (sum of win% - loss%) */
  cumulativeProfit: number;
  /** Whether pattern is showing bait & switch */
  hasBaitSwitch: boolean;
  /** Whether pattern is forming signals */
  isFormingSignals: boolean;
  /** Last signal block index */
  lastSignalBlock: number;
}

/** Complete hostility state */
export interface HostilityState {
  /** All logged indicators */
  indicators: HostilityIndicator[];
  /** Current hostility score (accumulated) */
  hostilityScore: number;
  /** Whether session is locked */
  isLocked: boolean;
  /** Reason for lock (if locked) */
  lockReason: string;
  /** Block index when locked */
  lockedAtBlock: number;
  /** Consecutive wins (for decay) */
  consecutiveWins: number;
  /** Last block index processed */
  lastBlockIndex: number;
}

/** Hostility configuration */
export interface HostilityConfig {
  /** Blocks before indicator expires (sliding window) */
  indicatorTTL: number;
  /** Hostility reduction per win */
  winReduction: number;
  /** Extra reduction for 3+ consecutive wins */
  consecutiveWinBonus: number;
  /** Session P/L threshold to trigger full reset */
  profitResetThreshold: number;
  /** Hostility score threshold to trigger lock */
  lockThreshold: number;
  /** Decay per block (passive reduction) */
  decayPerBlock: number;
  /** Severity weights for different indicator types */
  severityWeights: {
    severe_loss: number;
    pattern_run_negative: number;
    bait_switch: number;
    consecutive_losses: number;
    multi_pattern_bait: number;
  };
  /** Threshold for severe loss (percentage) */
  severeLossThreshold: number;
  /** Number of consecutive losses to trigger indicator */
  consecutiveLossCount: number;
}

/** Default hostility configuration */
export const DEFAULT_HOSTILITY_CONFIG: HostilityConfig = {
  indicatorTTL: 15,
  winReduction: 0.5,
  consecutiveWinBonus: 1.0,
  profitResetThreshold: 100,
  lockThreshold: 5,
  decayPerBlock: 0.1,
  severityWeights: {
    severe_loss: 1,
    pattern_run_negative: 1,
    bait_switch: 2,
    consecutive_losses: 1,
    multi_pattern_bait: 3,
  },
  severeLossThreshold: 85,
  consecutiveLossCount: 3,
};

// ============================================================================
// PROFIT TRACKING TYPES (AP, AAP, BSP)
// ============================================================================

/**
 * Three-column profit tracking for the evaluator
 *
 * AP  - Actual Profit: Real profit from played trades only
 * AAP - Accumulated Activation Profit: Existing evaluator accumulation (drives pattern activation)
 * BSP - Bait & Switch Profit: Hypothetical profit from reverse-direction plays during locked periods
 */
export interface ProfitTracking {
  /** Actual Profit - Real profit from trades actually placed */
  actualProfit: number;
  /** Accumulated Activation Profit - Sum of cumulative profits for activation logic */
  activationAccumulatedProfit: number;
  /** Bait & Switch Profit - Hypothetical profit during locked/unplayable periods */
  baitSwitchProfit: number;
}

/**
 * Per-block profit deltas for tracking changes
 */
export interface ProfitDeltas {
  /** Block index */
  blockIndex: number;
  /** Actual profit delta for this block */
  actualProfitDelta: number;
  /** Activation profit delta for this block */
  activationProfitDelta: number;
  /** BSP delta for this block (only non-zero when locked) */
  baitSwitchProfitDelta: number;
  /** Timestamp */
  ts: string;
}

/**
 * Simulated trade during locked/BSP periods
 * Tracks what would have happened if we bet the reverse direction
 */
export interface BspTradeSimulation {
  /** Block index */
  blockIndex: number;
  /** Pattern that was active */
  pattern: PatternName;
  /** Original expected direction from pattern */
  originalDirection: Direction;
  /** Reverse direction (what we simulate betting) */
  reverseDirection: Direction;
  /** Actual direction that occurred */
  actualDirection: Direction;
  /** Whether reverse bet would have won */
  reverseWouldWin: boolean;
  /** Percentage of the result */
  pct: number;
  /** Profit/loss from reverse bet (+pct if win, -pct if loss) */
  profit: number;
  /** Timestamp */
  ts: string;
}

/**
 * Complete profit state for session tracking
 */
export interface SessionProfitState {
  /** Current profit totals */
  totals: ProfitTracking;
  /** History of profit deltas per block */
  history: ProfitDeltas[];
  /** BSP trade simulations (only during locked periods) */
  bspSimulations: BspTradeSimulation[];
}

/** Opposite pattern mapping */
export const OPPOSITE_PATTERNS: Record<PatternName, PatternName | null> = {
  '2A2': 'Anti2A2',
  'Anti2A2': '2A2',
  '3A3': 'Anti3A3',
  'Anti3A3': '3A3',
  '4A4': 'Anti4A4',
  'Anti4A4': '4A4',
  '5A5': 'Anti5A5',
  'Anti5A5': '5A5',
  '6A6': 'Anti6A6',
  'Anti6A6': '6A6',
  'AP5': 'OZ',
  'OZ': 'AP5',
  'ZZ': 'AntiZZ',
  'AntiZZ': 'ZZ',
  'PP': 'ST',
  'ST': 'PP',
};

// ============================================================================
// HIERARCHY MANAGER TYPES
// ============================================================================

/** Source of betting decision in hierarchy */
export type HierarchySource = 'pocket' | 'same-direction' | 'bucket' | 'none';

/** Result of hierarchy manager's bet decision */
export interface HierarchyDecision {
  /** Block index for this decision */
  blockIndex: number;
  /** Which system is betting (or 'none') */
  source: HierarchySource;
  /** Pattern that generated the signal (if applicable) */
  pattern?: PatternName;
  /** Direction to bet (if betting) */
  direction?: Direction;
  /** Whether a bet should be placed */
  shouldBet: boolean;
  /** Explanation of the decision */
  reason: string;
  /** Systems that were paused for betting this block */
  pausedSystems: ('same-direction' | 'bucket')[];
  /** Timestamp */
  ts: string;
}

/** Hierarchy observation state for a single block */
export interface HierarchyObservation {
  /** Block index */
  blockIndex: number;
  /** Pocket system state after observation */
  pocket: {
    hasIndicator: boolean;
    zzPocket: 1 | 2;
    antiZZPocket: 1 | 2;
    activePattern: 'ZZ' | 'AntiZZ' | null;
  };
  /** Same Direction state after observation */
  sameDirection: {
    active: boolean;
    accumulatedLoss: number;
    currentRunLength: number;
  };
  /** Bucket system state summary */
  bucket: {
    eligiblePatterns: PatternName[];
    mainBucketPatterns: PatternName[];
  };
}
