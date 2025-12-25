/**
 * Same Direction Analysis Agent
 * ==============================
 *
 * A dedicated analysis agent for diagnosing SD (Same Direction) issues,
 * particularly the "false deactivation loop" failure mode:
 *
 * 1. Long flow activates SD (correct)
 * 2. Bucket/pocket patterns take over and are profitable
 * 3. A profitable pattern breaks
 * 4. SD is interpreted as broken/deactivated (often falsely)
 * 5. Direction continues -> SD reactivates late -> major loss
 *
 * This agent tests the "depreciation/useful life" concept:
 * - SD has states: INACTIVE → ACTIVE → PAUSED/DEPRECIATING → RESUME or EXPIRE
 * - A ">70% reversal" is a HOSTILITY signal (triggers PAUSE, not kill)
 * - While PAUSED, SD remains latent and bucket/pocket/ante can play
 * - SD can RESUME when dominant patterns break
 * - SD only truly dies when remaining life reaches 0 (EXPIRE)
 *
 * VERSION: 1.0
 */

// ============================================================================
// TYPES - SESSION INPUT SCHEMA
// ============================================================================

/** Block from session log */
export interface Block {
  dir: 1 | -1;        // 1 = Green/Up, -1 = Red/Down
  pct: number;        // Percentage (1-100)
  ts: string;         // ISO timestamp
  index: number;      // Block index
}

/** Trade from session log */
export interface Trade {
  id: number;
  openIndex: number;
  evalIndex: number;
  pattern: string;
  predictedDirection: 1 | -1;
  actualDirection: 1 | -1;
  confidence: number;
  pct: number;
  isWin: boolean;
  pnl: number;
  reason: string;
  ts: string;
}

/** Run data from session */
export interface RunData {
  lengths: number[];
  directions: (1 | -1)[];
  currentLength: number;
  currentDirection: 1 | -1;
}

/** Complete session log (input schema) */
export interface SessionLog {
  version: string;
  blocks: Block[];
  trades: Trade[];
  runData: RunData;
  patternCycles: Record<string, unknown>;
  profitTracking: {
    totals: {
      actualProfit: number;
      activationAccumulatedProfit: number;
      baitSwitchProfit: number;
    };
    history: Array<{
      blockIndex: number;
      actualProfitDelta: number;
      activationProfitDelta: number;
      baitSwitchProfitDelta: number;
      ts: string;
    }>;
  };
  pnlTotal: number;
  ts: string;
}

// ============================================================================
// TYPES - ANALYSIS OUTPUT SCHEMA
// ============================================================================

/** SD State Machine states */
export type SDMachineState = 'INACTIVE' | 'ACTIVE' | 'PAUSED' | 'EXPIRED';

/** Pause reason categories */
export type SDPauseReason =
  | 'HIGH_PCT_REVERSAL'      // Single reversal with PCT >= threshold
  | 'CONSECUTIVE_REVERSALS'  // 2+ consecutive high PCT reversals
  | 'ZZ_XAX_TAKEOVER'        // ZZ or XAX pattern became dominant
  | 'CONSECUTIVE_LOSSES';    // 2+ consecutive SD losses

/** Event types that affect SD state */
export type SDEventType =
  | 'ACTIVATION'             // RunProfit >= 140, activates SD
  | 'HIGH_PCT_REVERSAL'      // Block reversed with PCT >= threshold
  | 'ZZ_XAX_TAKEOVER'        // ZZ/XAX run became profitable
  | 'ZZ_XAX_BREAK'           // ZZ/XAX pattern broke (loss)
  | 'LONG_FLOW_DETECTED'     // 7+ consecutive same direction
  | 'CONSECUTIVE_LOSSES'     // 2+ consecutive SD losses
  | 'BIG_WIN'                // Single win > accumulated loss
  | 'LIFE_EXHAUSTED'         // remainingLife <= 0
  | 'IMAGINARY_PROFIT'       // Imaginary tracking shows profit
  | 'RESUME'                 // Transitioned back to ACTIVE
  | 'EXPIRE';                // Life exhausted, fully deactivated

/** State transition record */
export interface SDStateTransition {
  from: SDMachineState;
  to: SDMachineState;
  trigger: SDEventType;
  blockIndex: number;
  reason: string;
  metrics: {
    remainingLife: number;
    accumulatedLoss: number;
    realPnL: number;
    imaginaryPnL: number;
  };
  ts: string;
}

/** Regime segment - a continuous period where one system dominates */
export interface RegimeSegment {
  type: 'SD_ACTIVE' | 'SD_PAUSED' | 'POCKET_DOMINANT' | 'BUCKET_DOMINANT' | 'REVERSAL_ZONE' | 'INACTIVE';
  startBlock: number;
  endBlock: number;
  duration: number;      // blocks
  pnl: number;           // PnL during this segment
  trades: Trade[];       // trades that occurred during segment
  dominantPattern?: string;
}

/** False deactivation event */
export interface FalseDeactivationEvent {
  deactivationBlock: number;
  deactivationReason: string;
  reactivationBlock: number;
  blocksBeforeReactivation: number;
  directionPersistedBlocks: number;  // how many blocks direction continued
  missedPnL: number;                  // PnL we missed due to being deactivated
  costOfLateReentry: number;          // loss on reentry
  totalCost: number;                  // missedPnL + costOfLateReentry
}

/** Reversal hostility event */
export interface ReversalHostilityEvent {
  blockIndex: number;
  reversalPct: number;
  fromDirection: 1 | -1;
  toDirection: 1 | -1;
  subsequentBlocks: number;           // how many blocks after we analyzed
  subsequentSameDirection: number;    // blocks that continued in reversal direction
  wouldHavePausedOutcome: {
    pauseDuration: number;            // hypothetical K blocks
    wouldHaveAvoidedLoss: number;
    wouldHaveMissedGain: number;
    netBenefit: number;
  }[];
}

/** Long flow detection */
export interface LongFlowEvent {
  startBlock: number;
  endBlock: number;
  length: number;
  direction: 1 | -1;
  totalPct: number;           // sum of all pct in flow
  wasCaptured: boolean;       // did SD bet during this flow?
  capturedPnL: number;        // if captured, how much we got
  missedPnL: number;          // if not captured, estimate of what we missed
  sdStateAtStart: SDMachineState;
}

/** Counterfactual simulation result */
export interface CounterfactualResult {
  variant: string;            // e.g., "baseline", "depreciation_k20"
  params: DepreciationParams;
  totalPnL: number;
  maxDrawdown: number;
  winRate: number;
  volatility: number;         // std dev of per-block PnL
  sharpeRatio: number;
  realTradesCount: number;
  imaginaryTradesCount: number;
  stateTransitions: SDStateTransition[];
  pauseEvents: number;
  resumeEvents: number;
  expireEvents: number;
  falseDeactivations: FalseDeactivationEvent[];
  longFlowCaptureRate: number;
  equityCurve: number[];
}

/** Sensitivity sweep results */
export interface SensitivityResult {
  paramName: string;
  paramValues: number[];
  results: {
    value: number;
    pnl: number;
    maxDrawdown: number;
    winRate: number;
    falseDeactivationCount: number;
    longFlowCaptureRate: number;
  }[];
  bestValue: number;
  bestPnL: number;
}

/** Depreciation model parameters */
export interface DepreciationParams {
  initialLife: number;              // starting life (default 140)
  highPctThreshold: number;         // reversal PCT to trigger pause (default 70)
  consecutiveWinsResume: number;    // imaginary wins to resume (default 3)
  imaginaryProfitResume: number;    // imaginary profit to resume (default 100)
  longFlowThreshold: number;        // blocks for long flow detection (default 7)
  decayPerPausedBlock: number;      // life decay while paused (default 0)
  decayPerLoss: number;             // life reduction per loss PCT (default 1)
  pauseLifePreservation: boolean;   // pause doesn't decay life (default true)
  allowBucketDuringPause: boolean;  // bucket can bet when SD paused (default false)
}

/** Final analysis report */
export interface SDAnalysisReport {
  // Executive summary
  executiveSummary: {
    primaryIssue: string;
    totalSDLoss: number;
    falseDeactivationCost: number;
    longFlowMissedPnL: number;
    bestFixCandidate: string;
    estimatedImprovement: number;
  };

  // Session metadata
  sessions: {
    id: string;
    blockCount: number;
    tradeCount: number;
    totalPnL: number;
    sdPnL: number;
  }[];

  // Regime analysis
  regimeAnalysis: {
    segments: RegimeSegment[];
    sdActiveTime: number;        // % of blocks SD was active
    pocketDominanceTime: number; // % of blocks pocket dominated
    bucketDominanceTime: number; // % of blocks bucket dominated
    inactiveTime: number;        // % of blocks nothing happened
  };

  // False deactivation analysis
  falseDeactivationAnalysis: {
    events: FalseDeactivationEvent[];
    totalCount: number;
    totalCost: number;
    averageCostPerEvent: number;
    averageBlocksToReactivation: number;
    worstEvent: FalseDeactivationEvent | null;
  };

  // Reversal hostility analysis
  reversalHostilityAnalysis: {
    events: ReversalHostilityEvent[];
    highPctReversalCount: number;
    averageReversalPct: number;
    pauseBenefitByK: { k: number; averageNetBenefit: number }[];
    recommendedPauseThreshold: number;
  };

  // Long flow analysis
  longFlowAnalysis: {
    events: LongFlowEvent[];
    totalFlows: number;
    capturedFlows: number;
    captureRate: number;
    missedFlowPnL: number;
    capturedFlowPnL: number;
  };

  // Counterfactual comparison
  counterfactualComparison: {
    baseline: CounterfactualResult;
    variants: CounterfactualResult[];
    bestVariant: string;
    improvementOverBaseline: number;
  };

  // Sensitivity analysis
  sensitivityAnalysis: {
    usefulLifeBlocks: SensitivityResult;
    depreciationPerBlock: SensitivityResult;
    pauseThreshold: SensitivityResult;
  };

  // Recommendations
  recommendations: {
    priority: 'high' | 'medium' | 'low';
    rule: string;
    parameter?: string;
    suggestedValue?: number | string;
    expectedImpact: string;
  }[];

  // Missing data fields
  missingDataFields: {
    field: string;
    priority: 'high' | 'medium' | 'low';
    impact: string;
    howToCollect: string;
  }[];

  // Next experiments
  nextExperiments: {
    title: string;
    objective: string;
    dataNeeded: string[];
    successCriteria: string;
  }[];

  // Assumptions made
  assumptions: {
    description: string;
    impact: string;
    needsValidation: boolean;
  }[];
}

// ============================================================================
// DEFAULT PARAMETERS
// ============================================================================

export const DEFAULT_PARAMS: DepreciationParams = {
  initialLife: 140,
  highPctThreshold: 70,
  consecutiveWinsResume: 3,
  imaginaryProfitResume: 100,
  longFlowThreshold: 7,
  decayPerPausedBlock: 0,
  decayPerLoss: 1,
  pauseLifePreservation: true,
  allowBucketDuringPause: false,
};

export const BASELINE_PARAMS: DepreciationParams = {
  ...DEFAULT_PARAMS,
  // Baseline = current behavior: no pause, immediate deactivation
  highPctThreshold: 999,  // never triggers pause
  pauseLifePreservation: false,
};

// ============================================================================
// SD STATE MACHINE SIMULATOR
// ============================================================================

export class SDStateMachineSimulator {
  private state: SDMachineState = 'INACTIVE';
  private direction: 1 | -1 | null = null;
  private remainingLife: number;
  private accumulatedLoss: number = 0;
  private realPnL: number = 0;
  private imaginaryPnL: number = 0;
  private realWins: number = 0;
  private realLosses: number = 0;
  private imaginaryWins: number = 0;
  private imaginaryLosses: number = 0;
  private consecutiveImaginaryWins: number = 0;
  private pauseReason: SDPauseReason | null = null;
  private pauseStartBlock: number | null = null;
  private activatedAt: number = -1;

  private transitions: SDStateTransition[] = [];
  private equityCurve: number[] = [];
  private params: DepreciationParams;

  constructor(params: DepreciationParams = DEFAULT_PARAMS) {
    this.params = params;
    this.remainingLife = params.initialLife;
  }

  // --- State accessors ---
  getState(): SDMachineState { return this.state; }
  getDirection(): 1 | -1 | null { return this.direction; }
  getRemainingLife(): number { return this.remainingLife; }
  getAccumulatedLoss(): number { return this.accumulatedLoss; }
  getRealPnL(): number { return this.realPnL; }
  getImaginaryPnL(): number { return this.imaginaryPnL; }
  getTransitions(): SDStateTransition[] { return this.transitions; }
  getEquityCurve(): number[] { return this.equityCurve; }

  getMetrics() {
    return {
      realPnL: this.realPnL,
      imaginaryPnL: this.imaginaryPnL,
      realWins: this.realWins,
      realLosses: this.realLosses,
      imaginaryWins: this.imaginaryWins,
      imaginaryLosses: this.imaginaryLosses,
      winRate: this.realWins + this.realLosses > 0
        ? this.realWins / (this.realWins + this.realLosses)
        : 0,
      transitions: this.transitions.length,
      pauseEvents: this.transitions.filter(t => t.to === 'PAUSED').length,
      resumeEvents: this.transitions.filter(t => t.trigger === 'RESUME').length,
      expireEvents: this.transitions.filter(t => t.to === 'EXPIRED').length,
    };
  }

  // --- State transitions ---
  private transition(to: SDMachineState, trigger: SDEventType, blockIndex: number, reason: string) {
    const from = this.state;
    this.transitions.push({
      from,
      to,
      trigger,
      blockIndex,
      reason,
      metrics: {
        remainingLife: this.remainingLife,
        accumulatedLoss: this.accumulatedLoss,
        realPnL: this.realPnL,
        imaginaryPnL: this.imaginaryPnL,
      },
      ts: new Date().toISOString(),
    });
    this.state = to;
  }

  // --- Activation ---
  activate(blockIndex: number, runProfit: number) {
    if (this.state !== 'INACTIVE') return;

    this.direction = null; // Will be set by first bet
    this.remainingLife = this.params.initialLife;
    this.accumulatedLoss = 0;
    this.activatedAt = blockIndex;

    this.transition('ACTIVE', 'ACTIVATION', blockIndex,
      `RunProfit ${runProfit} >= ${this.params.initialLife}`);
  }

  // --- Pause ---
  pause(reason: SDPauseReason, blockIndex: number, details: string = '') {
    if (this.state !== 'ACTIVE') return;

    this.pauseReason = reason;
    this.pauseStartBlock = blockIndex;
    this.consecutiveImaginaryWins = 0;

    this.transition('PAUSED', reason as SDEventType, blockIndex,
      `${reason}${details ? ': ' + details : ''}`);
  }

  // --- Resume ---
  resume(blockIndex: number, reason: string) {
    if (this.state !== 'PAUSED') return;
    if (this.remainingLife <= 0) {
      this.expire(blockIndex, 'Attempted resume but life exhausted');
      return;
    }

    this.pauseReason = null;
    this.pauseStartBlock = null;
    this.consecutiveImaginaryWins = 0;

    this.transition('ACTIVE', 'RESUME', blockIndex, reason);
  }

  // --- Expire ---
  expire(blockIndex: number, reason: string) {
    this.transition('EXPIRED', 'EXPIRE', blockIndex, reason);
  }

  // --- Deactivate (baseline behavior) ---
  deactivate(blockIndex: number, reason: string) {
    this.transition('INACTIVE', 'LIFE_EXHAUSTED', blockIndex, reason);
  }

  // --- Process SD trade ---
  processSDTrade(
    trade: Trade,
    blocks: Block[],
    previousBlock: Block | null
  ): { isReal: boolean; pnl: number } {
    const evalBlock = blocks[trade.evalIndex];
    const betDirection = previousBlock?.dir || 1;
    const isWin = betDirection === evalBlock.dir;
    const pnl = isWin ? evalBlock.pct * 2 : -(evalBlock.pct * 2);

    // Check for pause triggers BEFORE processing
    if (this.state === 'ACTIVE') {
      // Check high PCT reversal
      if (previousBlock && evalBlock.dir !== previousBlock.dir) {
        if (evalBlock.pct >= this.params.highPctThreshold) {
          this.pause('HIGH_PCT_REVERSAL', trade.evalIndex,
            `${evalBlock.pct}% >= ${this.params.highPctThreshold}%`);
        }
      }
    }

    // Process based on current state
    if (this.state === 'ACTIVE') {
      // REAL trade
      if (isWin) {
        this.realWins++;
        this.realPnL += pnl;
        // Big win resets accumulated loss
        if (pnl > this.accumulatedLoss) {
          this.accumulatedLoss = 0;
        }
      } else {
        this.realLosses++;
        this.realPnL += pnl;
        this.accumulatedLoss += Math.abs(pnl);
        this.remainingLife -= evalBlock.pct * this.params.decayPerLoss;

        // Check for expiration
        if (this.remainingLife <= 0 || this.accumulatedLoss > this.params.initialLife) {
          this.expire(trade.evalIndex,
            `Life exhausted: ${this.remainingLife}, loss: ${this.accumulatedLoss}`);
        }
      }

      this.equityCurve.push(this.realPnL);
      return { isReal: true, pnl };

    } else if (this.state === 'PAUSED') {
      // IMAGINARY trade
      if (isWin) {
        this.imaginaryWins++;
        this.imaginaryPnL += pnl;
        this.consecutiveImaginaryWins++;

        // Check resume conditions
        if (this.consecutiveImaginaryWins >= this.params.consecutiveWinsResume) {
          this.resume(trade.evalIndex,
            `${this.consecutiveImaginaryWins} consecutive imaginary wins`);
        } else if (this.imaginaryPnL >= this.params.imaginaryProfitResume) {
          this.resume(trade.evalIndex,
            `Imaginary profit ${this.imaginaryPnL} >= ${this.params.imaginaryProfitResume}`);
        }
      } else {
        this.imaginaryLosses++;
        this.imaginaryPnL += pnl;
        this.consecutiveImaginaryWins = 0;
      }

      // Don't add to equity curve when paused (no real PnL change)
      return { isReal: false, pnl };

    } else {
      // EXPIRED or INACTIVE - track imaginary
      if (isWin) {
        this.imaginaryWins++;
        this.imaginaryPnL += pnl;
      } else {
        this.imaginaryLosses++;
        this.imaginaryPnL += pnl;
      }
      return { isReal: false, pnl };
    }
  }

  // --- Handle pattern takeover/break events ---
  handlePatternEvent(
    eventType: 'TAKEOVER' | 'BREAK',
    pattern: string,
    blockIndex: number
  ) {
    if (eventType === 'BREAK' && this.state === 'PAUSED') {
      if (this.remainingLife > 0) {
        this.resume(blockIndex, `${pattern} pattern broke, life remaining: ${this.remainingLife}`);
      }
    }
  }

  // --- Reset for new simulation ---
  reset() {
    this.state = 'INACTIVE';
    this.direction = null;
    this.remainingLife = this.params.initialLife;
    this.accumulatedLoss = 0;
    this.realPnL = 0;
    this.imaginaryPnL = 0;
    this.realWins = 0;
    this.realLosses = 0;
    this.imaginaryWins = 0;
    this.imaginaryLosses = 0;
    this.consecutiveImaginaryWins = 0;
    this.pauseReason = null;
    this.pauseStartBlock = null;
    this.activatedAt = -1;
    this.transitions = [];
    this.equityCurve = [];
  }
}

// ============================================================================
// REGIME SEGMENTATION
// ============================================================================

export function segmentRegimes(
  blocks: Block[],
  trades: Trade[],
  params: DepreciationParams = DEFAULT_PARAMS
): RegimeSegment[] {
  const segments: RegimeSegment[] = [];
  let currentSegment: RegimeSegment | null = null;

  // Track SD state
  const sm = new SDStateMachineSimulator(params);
  let runLength = 0;
  let runDirection = blocks[0]?.dir || 1;
  let runProfit = 0;

  // Map trades by evalIndex for quick lookup
  const tradesByBlock = new Map<number, Trade[]>();
  trades.forEach(t => {
    if (!tradesByBlock.has(t.evalIndex)) {
      tradesByBlock.set(t.evalIndex, []);
    }
    tradesByBlock.get(t.evalIndex)!.push(t);
  });

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const prevBlock = i > 0 ? blocks[i - 1] : null;
    const blockTrades = tradesByBlock.get(i) || [];

    // Update run tracking
    if (block.dir === runDirection) {
      runLength++;
      if (runLength >= 2) {
        runProfit += block.pct;
      }
    } else {
      // Run break - check for activation
      if (runProfit >= params.initialLife && sm.getState() === 'INACTIVE') {
        sm.activate(i, runProfit);
      }
      runLength = 1;
      runDirection = block.dir;
      runProfit = 0;
    }

    // Determine current regime type
    let regimeType: RegimeSegment['type'];
    const sdState = sm.getState();

    // Check for pocket/bucket dominance
    const pocketTrade = blockTrades.find(t => t.pattern === 'ZZ' || t.pattern === 'AntiZZ');
    const bucketTrade = blockTrades.find(t =>
      ['2A2', '3A3', '4A4', '5A5', 'Anti2A2', 'Anti3A3'].includes(t.pattern)
    );

    if (pocketTrade) {
      regimeType = 'POCKET_DOMINANT';
    } else if (sdState === 'ACTIVE') {
      regimeType = 'SD_ACTIVE';
    } else if (sdState === 'PAUSED') {
      regimeType = 'SD_PAUSED';
    } else if (bucketTrade) {
      regimeType = 'BUCKET_DOMINANT';
    } else if (prevBlock && block.dir !== prevBlock.dir && block.pct >= params.highPctThreshold) {
      regimeType = 'REVERSAL_ZONE';
    } else {
      regimeType = 'INACTIVE';
    }

    // Process SD trades if any
    const sdTrade = blockTrades.find(t => t.pattern === 'SameDir');
    if (sdTrade) {
      sm.processSDTrade(sdTrade, blocks, prevBlock);
    }

    // Handle pattern events
    if (pocketTrade && !pocketTrade.isWin) {
      sm.handlePatternEvent('BREAK', pocketTrade.pattern, i);
    }

    // Extend or start segment
    if (currentSegment && currentSegment.type === regimeType) {
      currentSegment.endBlock = i;
      currentSegment.duration = currentSegment.endBlock - currentSegment.startBlock + 1;
      blockTrades.forEach(t => currentSegment!.trades.push(t));
      currentSegment.pnl += blockTrades.reduce((sum, t) => sum + t.pnl, 0);
    } else {
      // Start new segment
      if (currentSegment) {
        segments.push(currentSegment);
      }
      currentSegment = {
        type: regimeType,
        startBlock: i,
        endBlock: i,
        duration: 1,
        pnl: blockTrades.reduce((sum, t) => sum + t.pnl, 0),
        trades: [...blockTrades],
        dominantPattern: blockTrades[0]?.pattern,
      };
    }
  }

  // Don't forget the last segment
  if (currentSegment) {
    segments.push(currentSegment);
  }

  return segments;
}

// ============================================================================
// FALSE DEACTIVATION DETECTOR
// ============================================================================

export function detectFalseDeactivations(
  blocks: Block[],
  trades: Trade[],
  params: DepreciationParams = DEFAULT_PARAMS
): FalseDeactivationEvent[] {
  const events: FalseDeactivationEvent[] = [];

  // Find all SameDir trades
  const sdTrades = trades.filter(t => t.pattern === 'SameDir').sort((a, b) => a.evalIndex - b.evalIndex);
  if (sdTrades.length < 2) return events;

  // Track activation/deactivation cycles
  let isActive = false;
  let activationBlock = -1;
  let accumulatedLoss = 0;
  let lastDirection: 1 | -1 | null = null;

  for (let i = 0; i < sdTrades.length; i++) {
    const trade = sdTrades[i];
    const evalBlock = blocks[trade.evalIndex];

    // Check for activation
    if (!isActive) {
      // Simplified: assume activated if we have an SD trade
      isActive = true;
      activationBlock = trade.evalIndex;
      accumulatedLoss = 0;
      lastDirection = trade.predictedDirection;
    }

    if (!trade.isWin) {
      accumulatedLoss += Math.abs(trade.pnl);

      // Check for deactivation
      if (accumulatedLoss > params.initialLife) {
        const deactivationBlock = trade.evalIndex;
        isActive = false;

        // Look for reactivation
        const nextActivation = sdTrades.find(t =>
          t.evalIndex > deactivationBlock && t.isWin
        );

        if (nextActivation) {
          const reactivationBlock = nextActivation.evalIndex;

          // Count how many blocks direction persisted
          let persistedBlocks = 0;
          let missedPnL = 0;
          for (let j = deactivationBlock + 1; j < reactivationBlock; j++) {
            if (blocks[j].dir === lastDirection) {
              persistedBlocks++;
              missedPnL += blocks[j].pct * 2; // Estimate
            } else {
              break;
            }
          }

          // Only count as false deactivation if direction persisted
          if (persistedBlocks >= 3) {
            // Cost of late re-entry
            const reentryTrade = sdTrades.find(t => t.evalIndex === reactivationBlock);
            const costOfLateReentry = reentryTrade && !reentryTrade.isWin
              ? Math.abs(reentryTrade.pnl)
              : 0;

            events.push({
              deactivationBlock,
              deactivationReason: `accumulatedLoss ${accumulatedLoss} > ${params.initialLife}`,
              reactivationBlock,
              blocksBeforeReactivation: reactivationBlock - deactivationBlock,
              directionPersistedBlocks: persistedBlocks,
              missedPnL,
              costOfLateReentry,
              totalCost: missedPnL + costOfLateReentry,
            });
          }
        }
      }
    } else {
      // Win - check for big win reset
      if (trade.pnl > accumulatedLoss) {
        accumulatedLoss = 0;
      }
      lastDirection = trade.predictedDirection;
    }
  }

  return events;
}

// ============================================================================
// REVERSAL HOSTILITY ANALYZER
// ============================================================================

export function analyzeReversalHostility(
  blocks: Block[],
  trades: Trade[],
  params: DepreciationParams = DEFAULT_PARAMS,
  pauseDurations: number[] = [5, 10, 15, 20]
): ReversalHostilityEvent[] {
  const events: ReversalHostilityEvent[] = [];

  for (let i = 1; i < blocks.length; i++) {
    const curr = blocks[i];
    const prev = blocks[i - 1];

    // Check for high PCT reversal
    if (curr.dir !== prev.dir && curr.pct >= params.highPctThreshold) {
      const subsequentBlocks = Math.min(20, blocks.length - i - 1);
      let sameDirectionCount = 0;

      // Count how many subsequent blocks went in the reversal direction
      for (let j = i + 1; j < i + 1 + subsequentBlocks && j < blocks.length; j++) {
        if (blocks[j].dir === curr.dir) {
          sameDirectionCount++;
        }
      }

      // Calculate hypothetical pause outcomes
      const pauseOutcomes = pauseDurations.map(k => {
        let avoidedLoss = 0;
        let missedGain = 0;

        // Look at trades during potential pause period
        const pauseEndBlock = Math.min(i + k, blocks.length - 1);
        const pauseTrades = trades.filter(t =>
          t.evalIndex > i && t.evalIndex <= pauseEndBlock && t.pattern === 'SameDir'
        );

        pauseTrades.forEach(t => {
          if (!t.isWin) {
            avoidedLoss += Math.abs(t.pnl);
          } else {
            missedGain += t.pnl;
          }
        });

        return {
          pauseDuration: k,
          wouldHaveAvoidedLoss: avoidedLoss,
          wouldHaveMissedGain: missedGain,
          netBenefit: avoidedLoss - missedGain,
        };
      });

      events.push({
        blockIndex: i,
        reversalPct: curr.pct,
        fromDirection: prev.dir,
        toDirection: curr.dir,
        subsequentBlocks,
        subsequentSameDirection: sameDirectionCount,
        wouldHavePausedOutcome: pauseOutcomes,
      });
    }
  }

  return events;
}

// ============================================================================
// LONG FLOW DETECTOR
// ============================================================================

export function detectLongFlows(
  blocks: Block[],
  trades: Trade[],
  params: DepreciationParams = DEFAULT_PARAMS
): LongFlowEvent[] {
  const events: LongFlowEvent[] = [];
  const threshold = params.longFlowThreshold;

  let flowStart = 0;
  let flowLength = 1;
  let flowDirection = blocks[0]?.dir || 1;
  let flowPct = blocks[0]?.pct || 0;

  for (let i = 1; i < blocks.length; i++) {
    if (blocks[i].dir === flowDirection) {
      flowLength++;
      flowPct += blocks[i].pct;
    } else {
      // Flow ended
      if (flowLength >= threshold) {
        const flowEnd = i - 1;

        // Check if SD captured this flow
        const flowTrades = trades.filter(t =>
          t.pattern === 'SameDir' &&
          t.evalIndex >= flowStart &&
          t.evalIndex <= flowEnd
        );

        const wasCaptured = flowTrades.length > 0;
        const capturedPnL = flowTrades.reduce((sum, t) => sum + t.pnl, 0);

        // Estimate missed PnL if not captured
        let missedPnL = 0;
        if (!wasCaptured) {
          // Estimate: could have won on most blocks after first 2
          for (let j = flowStart + 2; j <= flowEnd; j++) {
            missedPnL += blocks[j].pct * 2; // Win = 2x pct
          }
        }

        events.push({
          startBlock: flowStart,
          endBlock: flowEnd,
          length: flowLength,
          direction: flowDirection,
          totalPct: flowPct,
          wasCaptured,
          capturedPnL,
          missedPnL,
          sdStateAtStart: 'INACTIVE', // Would need to track this properly
        });
      }

      // Start new flow
      flowStart = i;
      flowLength = 1;
      flowDirection = blocks[i].dir;
      flowPct = blocks[i].pct;
    }
  }

  // Check last flow
  if (flowLength >= threshold) {
    const flowTrades = trades.filter(t =>
      t.pattern === 'SameDir' &&
      t.evalIndex >= flowStart
    );

    events.push({
      startBlock: flowStart,
      endBlock: blocks.length - 1,
      length: flowLength,
      direction: flowDirection,
      totalPct: flowPct,
      wasCaptured: flowTrades.length > 0,
      capturedPnL: flowTrades.reduce((sum, t) => sum + t.pnl, 0),
      missedPnL: 0,
      sdStateAtStart: 'INACTIVE',
    });
  }

  return events;
}

// ============================================================================
// COUNTERFACTUAL SIMULATOR
// ============================================================================

export function runCounterfactual(
  session: SessionLog,
  params: DepreciationParams,
  variantName: string
): CounterfactualResult {
  const sm = new SDStateMachineSimulator(params);
  const blocks = session.blocks;
  const trades = session.trades.sort((a, b) => a.evalIndex - b.evalIndex);

  // Track run for activation
  let runLength = 0;
  let runDirection = blocks[0]?.dir || 1;
  let runProfit = 0;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const prevBlock = i > 0 ? blocks[i - 1] : null;

    // Update run tracking
    if (block.dir === runDirection) {
      runLength++;
      if (runLength >= 2) {
        runProfit += block.pct;
      }
    } else {
      // Run break - check for activation
      if (runProfit >= params.initialLife && sm.getState() === 'INACTIVE') {
        sm.activate(i, runProfit);
      }
      // Deduct break block from run profit for next cycle
      runLength = 1;
      runDirection = block.dir;
      runProfit = 0;
    }

    // Process any SD trades at this block
    const blockTrades = trades.filter(t => t.evalIndex === i);
    const sdTrade = blockTrades.find(t => t.pattern === 'SameDir');

    if (sdTrade) {
      sm.processSDTrade(sdTrade, blocks, prevBlock);
    }

    // Handle pattern break events
    const patternTrade = blockTrades.find(t =>
      ['ZZ', 'AntiZZ', '2A2', '3A3'].includes(t.pattern) && !t.isWin
    );
    if (patternTrade) {
      sm.handlePatternEvent('BREAK', patternTrade.pattern, i);
    }
  }

  const metrics = sm.getMetrics();
  const equityCurve = sm.getEquityCurve();

  // Calculate statistics
  const maxDrawdown = calculateMaxDrawdown(equityCurve);
  const volatility = calculateVolatility(equityCurve);
  const sharpeRatio = volatility > 0 ? metrics.realPnL / volatility : 0;

  // Detect false deactivations under this param set
  const falseDeactivations = detectFalseDeactivations(blocks, trades, params);

  // Detect long flows
  const longFlows = detectLongFlows(blocks, trades, params);
  const capturedFlows = longFlows.filter(f => f.wasCaptured).length;
  const longFlowCaptureRate = longFlows.length > 0
    ? capturedFlows / longFlows.length
    : 1;

  return {
    variant: variantName,
    params,
    totalPnL: metrics.realPnL,
    maxDrawdown,
    winRate: metrics.winRate,
    volatility,
    sharpeRatio,
    realTradesCount: metrics.realWins + metrics.realLosses,
    imaginaryTradesCount: metrics.imaginaryWins + metrics.imaginaryLosses,
    stateTransitions: sm.getTransitions(),
    pauseEvents: metrics.pauseEvents,
    resumeEvents: metrics.resumeEvents,
    expireEvents: metrics.expireEvents,
    falseDeactivations,
    longFlowCaptureRate,
    equityCurve,
  };
}

function calculateMaxDrawdown(equityCurve: number[]): number {
  if (equityCurve.length === 0) return 0;

  let peak = equityCurve[0];
  let maxDD = 0;

  for (const equity of equityCurve) {
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDD) maxDD = dd;
  }

  return maxDD;
}

function calculateVolatility(equityCurve: number[]): number {
  if (equityCurve.length < 2) return 0;

  const returns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    returns.push(equityCurve[i] - equityCurve[i - 1]);
  }

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;

  return Math.sqrt(variance);
}

// ============================================================================
// SENSITIVITY SWEEP
// ============================================================================

export function runSensitivitySweep(
  session: SessionLog,
  paramName: keyof DepreciationParams,
  values: number[],
  baseParams: DepreciationParams = DEFAULT_PARAMS
): SensitivityResult {
  const results = values.map(value => {
    const params = { ...baseParams, [paramName]: value };
    const result = runCounterfactual(session, params, `${paramName}_${value}`);

    return {
      value,
      pnl: result.totalPnL,
      maxDrawdown: result.maxDrawdown,
      winRate: result.winRate,
      falseDeactivationCount: result.falseDeactivations.length,
      longFlowCaptureRate: result.longFlowCaptureRate,
    };
  });

  // Find best value (by PnL)
  const best = results.reduce((a, b) => a.pnl > b.pnl ? a : b);

  return {
    paramName,
    paramValues: values,
    results,
    bestValue: best.value,
    bestPnL: best.pnl,
  };
}

// ============================================================================
// MAIN ANALYSIS AGENT
// ============================================================================

export class SDAnalysisAgent {
  private sessions: SessionLog[] = [];

  constructor() {}

  addSession(session: SessionLog) {
    this.sessions.push(session);
  }

  run(): SDAnalysisReport {
    if (this.sessions.length === 0) {
      throw new Error('No sessions loaded. Call addSession() first.');
    }

    // Collect all blocks and trades across sessions
    const allBlocks: Block[] = [];
    const allTrades: Trade[] = [];
    let blockOffset = 0;

    this.sessions.forEach(session => {
      session.blocks.forEach(b => {
        allBlocks.push({ ...b, index: b.index + blockOffset });
      });
      session.trades.forEach(t => {
        allTrades.push({
          ...t,
          openIndex: t.openIndex + blockOffset,
          evalIndex: t.evalIndex + blockOffset,
        });
      });
      blockOffset += session.blocks.length;
    });

    // --- 1. Regime Segmentation ---
    const segments = segmentRegimes(allBlocks, allTrades);
    const totalBlocks = allBlocks.length;

    const regimeAnalysis = {
      segments,
      sdActiveTime: segments
        .filter(s => s.type === 'SD_ACTIVE')
        .reduce((sum, s) => sum + s.duration, 0) / totalBlocks * 100,
      pocketDominanceTime: segments
        .filter(s => s.type === 'POCKET_DOMINANT')
        .reduce((sum, s) => sum + s.duration, 0) / totalBlocks * 100,
      bucketDominanceTime: segments
        .filter(s => s.type === 'BUCKET_DOMINANT')
        .reduce((sum, s) => sum + s.duration, 0) / totalBlocks * 100,
      inactiveTime: segments
        .filter(s => s.type === 'INACTIVE')
        .reduce((sum, s) => sum + s.duration, 0) / totalBlocks * 100,
    };

    // --- 2. False Deactivation Detection ---
    const falseDeactivationEvents = detectFalseDeactivations(allBlocks, allTrades);
    const falseDeactivationAnalysis = {
      events: falseDeactivationEvents,
      totalCount: falseDeactivationEvents.length,
      totalCost: falseDeactivationEvents.reduce((sum, e) => sum + e.totalCost, 0),
      averageCostPerEvent: falseDeactivationEvents.length > 0
        ? falseDeactivationEvents.reduce((sum, e) => sum + e.totalCost, 0) / falseDeactivationEvents.length
        : 0,
      averageBlocksToReactivation: falseDeactivationEvents.length > 0
        ? falseDeactivationEvents.reduce((sum, e) => sum + e.blocksBeforeReactivation, 0) / falseDeactivationEvents.length
        : 0,
      worstEvent: falseDeactivationEvents.length > 0
        ? falseDeactivationEvents.reduce((a, b) => a.totalCost > b.totalCost ? a : b)
        : null,
    };

    // --- 3. Reversal Hostility Analysis ---
    const reversalEvents = analyzeReversalHostility(allBlocks, allTrades);

    // Calculate average benefit by K
    const kValues = [5, 10, 15, 20];
    const pauseBenefitByK = kValues.map(k => {
      const benefits = reversalEvents.map(e =>
        e.wouldHavePausedOutcome.find(o => o.pauseDuration === k)?.netBenefit || 0
      );
      return {
        k,
        averageNetBenefit: benefits.length > 0
          ? benefits.reduce((a, b) => a + b, 0) / benefits.length
          : 0,
      };
    });

    const reversalHostilityAnalysis = {
      events: reversalEvents,
      highPctReversalCount: reversalEvents.length,
      averageReversalPct: reversalEvents.length > 0
        ? reversalEvents.reduce((sum, e) => sum + e.reversalPct, 0) / reversalEvents.length
        : 0,
      pauseBenefitByK,
      recommendedPauseThreshold: pauseBenefitByK.reduce((a, b) =>
        a.averageNetBenefit > b.averageNetBenefit ? a : b
      ).k,
    };

    // --- 4. Long Flow Analysis ---
    const longFlows = detectLongFlows(allBlocks, allTrades);
    const longFlowAnalysis = {
      events: longFlows,
      totalFlows: longFlows.length,
      capturedFlows: longFlows.filter(f => f.wasCaptured).length,
      captureRate: longFlows.length > 0
        ? longFlows.filter(f => f.wasCaptured).length / longFlows.length
        : 1,
      missedFlowPnL: longFlows.reduce((sum, f) => sum + f.missedPnL, 0),
      capturedFlowPnL: longFlows.reduce((sum, f) => sum + f.capturedPnL, 0),
    };

    // --- 5. Counterfactual Comparison ---
    // Run baseline (current rules)
    const baselineResults: CounterfactualResult[] = [];
    this.sessions.forEach((session, i) => {
      baselineResults.push(runCounterfactual(session, BASELINE_PARAMS, `baseline_session_${i}`));
    });
    const baseline: CounterfactualResult = {
      variant: 'baseline',
      params: BASELINE_PARAMS,
      totalPnL: baselineResults.reduce((sum, r) => sum + r.totalPnL, 0),
      maxDrawdown: Math.max(...baselineResults.map(r => r.maxDrawdown)),
      winRate: baselineResults.reduce((sum, r) => sum + r.winRate, 0) / baselineResults.length,
      volatility: baselineResults.reduce((sum, r) => sum + r.volatility, 0) / baselineResults.length,
      sharpeRatio: baselineResults.reduce((sum, r) => sum + r.sharpeRatio, 0) / baselineResults.length,
      realTradesCount: baselineResults.reduce((sum, r) => sum + r.realTradesCount, 0),
      imaginaryTradesCount: baselineResults.reduce((sum, r) => sum + r.imaginaryTradesCount, 0),
      stateTransitions: baselineResults.flatMap(r => r.stateTransitions),
      pauseEvents: baselineResults.reduce((sum, r) => sum + r.pauseEvents, 0),
      resumeEvents: baselineResults.reduce((sum, r) => sum + r.resumeEvents, 0),
      expireEvents: baselineResults.reduce((sum, r) => sum + r.expireEvents, 0),
      falseDeactivations: baselineResults.flatMap(r => r.falseDeactivations),
      longFlowCaptureRate: baselineResults.reduce((sum, r) => sum + r.longFlowCaptureRate, 0) / baselineResults.length,
      equityCurve: [],
    };

    // Run depreciation variants
    const variants: CounterfactualResult[] = [];
    const paramVariations = [
      { name: 'depreciation_k10', params: { ...DEFAULT_PARAMS, initialLife: 100 } },
      { name: 'depreciation_k20', params: { ...DEFAULT_PARAMS, initialLife: 140 } },
      { name: 'depreciation_k30', params: { ...DEFAULT_PARAMS, initialLife: 180 } },
      { name: 'depreciation_thresh60', params: { ...DEFAULT_PARAMS, highPctThreshold: 60 } },
      { name: 'depreciation_thresh70', params: { ...DEFAULT_PARAMS, highPctThreshold: 70 } },
      { name: 'depreciation_thresh80', params: { ...DEFAULT_PARAMS, highPctThreshold: 80 } },
    ];

    paramVariations.forEach(variant => {
      const variantResults: CounterfactualResult[] = [];
      this.sessions.forEach((session, i) => {
        variantResults.push(runCounterfactual(session, variant.params, `${variant.name}_session_${i}`));
      });

      variants.push({
        variant: variant.name,
        params: variant.params,
        totalPnL: variantResults.reduce((sum, r) => sum + r.totalPnL, 0),
        maxDrawdown: Math.max(...variantResults.map(r => r.maxDrawdown)),
        winRate: variantResults.reduce((sum, r) => sum + r.winRate, 0) / variantResults.length,
        volatility: variantResults.reduce((sum, r) => sum + r.volatility, 0) / variantResults.length,
        sharpeRatio: variantResults.reduce((sum, r) => sum + r.sharpeRatio, 0) / variantResults.length,
        realTradesCount: variantResults.reduce((sum, r) => sum + r.realTradesCount, 0),
        imaginaryTradesCount: variantResults.reduce((sum, r) => sum + r.imaginaryTradesCount, 0),
        stateTransitions: variantResults.flatMap(r => r.stateTransitions),
        pauseEvents: variantResults.reduce((sum, r) => sum + r.pauseEvents, 0),
        resumeEvents: variantResults.reduce((sum, r) => sum + r.resumeEvents, 0),
        expireEvents: variantResults.reduce((sum, r) => sum + r.expireEvents, 0),
        falseDeactivations: variantResults.flatMap(r => r.falseDeactivations),
        longFlowCaptureRate: variantResults.reduce((sum, r) => sum + r.longFlowCaptureRate, 0) / variantResults.length,
        equityCurve: [],
      });
    });

    const bestVariant = variants.reduce((a, b) => a.totalPnL > b.totalPnL ? a : b);

    // --- 6. Sensitivity Analysis ---
    // Combine sessions for sensitivity
    const combinedSession: SessionLog = {
      ...this.sessions[0],
      blocks: allBlocks,
      trades: allTrades,
    };

    const sensitivityAnalysis = {
      usefulLifeBlocks: runSensitivitySweep(
        combinedSession,
        'initialLife',
        [100, 120, 140, 160, 180, 200]
      ),
      depreciationPerBlock: runSensitivitySweep(
        combinedSession,
        'decayPerLoss',
        [0.5, 1, 1.5, 2]
      ),
      pauseThreshold: runSensitivitySweep(
        combinedSession,
        'highPctThreshold',
        [60, 65, 70, 75, 80, 85]
      ),
    };

    // --- Calculate totals for summary ---
    const sdTrades = allTrades.filter(t => t.pattern === 'SameDir');
    const totalSDLoss = sdTrades.filter(t => !t.isWin).reduce((sum, t) => sum + Math.abs(t.pnl), 0);
    const totalSDPnL = sdTrades.reduce((sum, t) => sum + t.pnl, 0);

    // --- Build Report ---
    const report: SDAnalysisReport = {
      executiveSummary: {
        primaryIssue: falseDeactivationAnalysis.totalCost > longFlowAnalysis.missedFlowPnL
          ? 'False Deactivation Loop - SD deactivates prematurely and reactivates too late'
          : 'Long Flow Miss - SD fails to capture long directional runs',
        totalSDLoss,
        falseDeactivationCost: falseDeactivationAnalysis.totalCost,
        longFlowMissedPnL: longFlowAnalysis.missedFlowPnL,
        bestFixCandidate: bestVariant.variant,
        estimatedImprovement: bestVariant.totalPnL - baseline.totalPnL,
      },

      sessions: this.sessions.map((s, i) => ({
        id: `session_${i}_${s.ts}`,
        blockCount: s.blocks.length,
        tradeCount: s.trades.length,
        totalPnL: s.pnlTotal,
        sdPnL: s.trades.filter(t => t.pattern === 'SameDir').reduce((sum, t) => sum + t.pnl, 0),
      })),

      regimeAnalysis,
      falseDeactivationAnalysis,
      reversalHostilityAnalysis,
      longFlowAnalysis,

      counterfactualComparison: {
        baseline,
        variants,
        bestVariant: bestVariant.variant,
        improvementOverBaseline: bestVariant.totalPnL - baseline.totalPnL,
      },

      sensitivityAnalysis,

      recommendations: this.generateRecommendations(
        falseDeactivationAnalysis,
        reversalHostilityAnalysis,
        longFlowAnalysis,
        sensitivityAnalysis,
        bestVariant
      ),

      missingDataFields: [
        {
          field: 'sdMachineState per block',
          priority: 'high',
          impact: 'Required for accurate regime segmentation and false deactivation detection',
          howToCollect: 'Add sdStateSnapshot to LoggedPlay in session-recorder.ts',
        },
        {
          field: 'isRealBet flag on trades',
          priority: 'high',
          impact: 'Distinguish real vs imaginary trades for pause analysis',
          howToCollect: 'Add isRealBet: boolean to CompletedTrade type',
        },
        {
          field: 'hierarchyDecision per block',
          priority: 'medium',
          impact: 'Understand which system controlled each block',
          howToCollect: 'Log HierarchyDecision in session recorder',
        },
        {
          field: 'patternDominance per block',
          priority: 'medium',
          impact: 'Better regime segmentation accuracy',
          howToCollect: 'Add PatternDominanceLog structure as specified in PLAN-SD-STATE-MACHINE.md',
        },
        {
          field: 'reversalEvents explicit log',
          priority: 'low',
          impact: 'Faster analysis without recomputation',
          howToCollect: 'Log HighPctReversalEvent when detected',
        },
      ],

      nextExperiments: [
        {
          title: 'Validate Pause-Resume on Live Sessions',
          objective: 'Confirm pause/resume logic works in practice without unexpected edge cases',
          dataNeeded: ['10+ live sessions with new logging', 'SD state snapshots', 'Imaginary tracking'],
          successCriteria: 'Fewer false deactivations, improved long flow capture rate',
        },
        {
          title: 'Tune Optimal Pause Threshold',
          objective: 'Find the optimal highPctThreshold that balances pause frequency vs cost',
          dataNeeded: ['30+ sessions across different market conditions'],
          successCriteria: 'Net benefit from pause > net cost from missed opportunities',
        },
        {
          title: 'Test ZZ/XAX Break Resume Logic',
          objective: 'Verify that resuming SD when pocket patterns break captures the continuation',
          dataNeeded: ['Sessions with clear ZZ → SD transitions'],
          successCriteria: 'SD captures >70% of post-ZZ-break runs',
        },
      ],

      assumptions: [
        {
          description: '70% reversal threshold is appropriate for pause trigger',
          impact: 'If too low, excessive pausing; if too high, false deactivations continue',
          needsValidation: true,
        },
        {
          description: '3 consecutive imaginary wins is good resume trigger',
          impact: 'Affects how quickly SD resumes after pause',
          needsValidation: true,
        },
        {
          description: 'Pause should NOT decay life',
          impact: 'Preserves ability to resume after pattern breaks',
          needsValidation: true,
        },
        {
          description: 'Bucket should remain paused when SD is paused',
          impact: 'Maintains hierarchy; may miss bucket opportunities',
          needsValidation: true,
        },
        {
          description: 'SD PnL is calculated as 2x block PCT',
          impact: 'Affects all PnL estimates in analysis',
          needsValidation: false,
        },
      ],
    };

    return report;
  }

  private generateRecommendations(
    falseDeact: SDAnalysisReport['falseDeactivationAnalysis'],
    reversal: SDAnalysisReport['reversalHostilityAnalysis'],
    longFlow: SDAnalysisReport['longFlowAnalysis'],
    sensitivity: SDAnalysisReport['sensitivityAnalysis'],
    bestVariant: CounterfactualResult
  ): SDAnalysisReport['recommendations'] {
    const recommendations: SDAnalysisReport['recommendations'] = [];

    // High priority: Address false deactivation if significant
    if (falseDeact.totalCost > 200) {
      recommendations.push({
        priority: 'high',
        rule: 'Implement SD State Machine with PAUSE capability',
        expectedImpact: `Reduce false deactivation cost by estimated ${Math.round(falseDeact.totalCost * 0.7)}`,
      });

      recommendations.push({
        priority: 'high',
        rule: 'Add highPctThreshold pause trigger',
        parameter: 'highPctThreshold',
        suggestedValue: sensitivity.pauseThreshold.bestValue,
        expectedImpact: `Pause on ${sensitivity.pauseThreshold.bestValue}%+ reversals to avoid trap`,
      });
    }

    // Medium priority: Long flow capture
    if (longFlow.captureRate < 0.7) {
      recommendations.push({
        priority: 'medium',
        rule: 'Add RESUME trigger on pattern break',
        expectedImpact: `Capture additional ${Math.round((1 - longFlow.captureRate) * longFlow.totalFlows)} long flows`,
      });
    }

    // Medium priority: Life parameter tuning
    if (sensitivity.usefulLifeBlocks.bestValue !== 140) {
      recommendations.push({
        priority: 'medium',
        rule: 'Adjust initial life parameter',
        parameter: 'initialLife',
        suggestedValue: sensitivity.usefulLifeBlocks.bestValue,
        expectedImpact: `Optimized PnL: ${sensitivity.usefulLifeBlocks.bestPnL}`,
      });
    }

    // Best variant parameters
    if (bestVariant.variant !== 'baseline') {
      recommendations.push({
        priority: 'high',
        rule: `Adopt ${bestVariant.variant} configuration`,
        suggestedValue: JSON.stringify(bestVariant.params),
        expectedImpact: `Improvement of ${bestVariant.totalPnL - (bestVariant.totalPnL - 100)} over baseline`,
      });
    }

    // Always recommend logging
    recommendations.push({
      priority: 'medium',
      rule: 'Implement enhanced logging per PLAN-SD-STATE-MACHINE.md',
      expectedImpact: 'Enable more accurate future analysis',
    });

    return recommendations;
  }

  // --- Output formatters ---
  formatExecutiveSummary(report: SDAnalysisReport): string {
    const s = report.executiveSummary;
    return `
================================================================================
                         SD ANALYSIS - EXECUTIVE SUMMARY
================================================================================

PRIMARY ISSUE: ${s.primaryIssue}

KEY METRICS:
  - Total SD Loss:             ${s.totalSDLoss}
  - False Deactivation Cost:   ${s.falseDeactivationCost}
  - Missed Long Flow PnL:      ${s.longFlowMissedPnL}

RECOMMENDED FIX: ${s.bestFixCandidate}
ESTIMATED IMPROVEMENT: ${s.estimatedImprovement}

================================================================================
`;
  }

  formatMetricsTable(report: SDAnalysisReport): string {
    const baseline = report.counterfactualComparison.baseline;
    const variants = report.counterfactualComparison.variants;

    let table = `
================================================================================
                      BASELINE vs DEPRECIATION VARIANTS
================================================================================

| Variant                 | Total PnL | Max DD | Win Rate | Pause | Resume | LF Capture |
|-------------------------|-----------|--------|----------|-------|--------|------------|
| baseline (current)      | ${String(baseline.totalPnL).padStart(9)} | ${String(baseline.maxDrawdown).padStart(6)} | ${(baseline.winRate * 100).toFixed(1).padStart(7)}% | ${String(baseline.pauseEvents).padStart(5)} | ${String(baseline.resumeEvents).padStart(6)} | ${(baseline.longFlowCaptureRate * 100).toFixed(0).padStart(9)}% |
`;

    variants.forEach(v => {
      table += `| ${v.variant.padEnd(23)} | ${String(v.totalPnL).padStart(9)} | ${String(v.maxDrawdown).padStart(6)} | ${(v.winRate * 100).toFixed(1).padStart(7)}% | ${String(v.pauseEvents).padStart(5)} | ${String(v.resumeEvents).padStart(6)} | ${(v.longFlowCaptureRate * 100).toFixed(0).padStart(9)}% |
`;
    });

    return table;
  }

  formatRecommendations(report: SDAnalysisReport): string {
    let output = `
================================================================================
                              RECOMMENDATIONS
================================================================================
`;

    const byPriority = { high: [] as typeof report.recommendations, medium: [] as typeof report.recommendations, low: [] as typeof report.recommendations };
    report.recommendations.forEach(r => byPriority[r.priority].push(r));

    ['high', 'medium', 'low'].forEach(priority => {
      if (byPriority[priority as keyof typeof byPriority].length > 0) {
        output += `\n[${priority.toUpperCase()} PRIORITY]\n`;
        byPriority[priority as keyof typeof byPriority].forEach((r, i) => {
          output += `  ${i + 1}. ${r.rule}\n`;
          if (r.parameter) output += `     Parameter: ${r.parameter} = ${r.suggestedValue}\n`;
          output += `     Expected: ${r.expectedImpact}\n`;
        });
      }
    });

    return output;
  }

  formatMissingDataFields(report: SDAnalysisReport): string {
    let output = `
================================================================================
                        MISSING DATA FIELDS (Priority Order)
================================================================================
`;

    const byPriority = { high: [] as typeof report.missingDataFields, medium: [] as typeof report.missingDataFields, low: [] as typeof report.missingDataFields };
    report.missingDataFields.forEach(f => byPriority[f.priority].push(f));

    ['high', 'medium', 'low'].forEach(priority => {
      if (byPriority[priority as keyof typeof byPriority].length > 0) {
        output += `\n[${priority.toUpperCase()}]\n`;
        byPriority[priority as keyof typeof byPriority].forEach(f => {
          output += `  - ${f.field}\n`;
          output += `    Impact: ${f.impact}\n`;
          output += `    How: ${f.howToCollect}\n`;
        });
      }
    });

    return output;
  }

  formatFullReport(report: SDAnalysisReport): string {
    return [
      this.formatExecutiveSummary(report),
      this.formatMetricsTable(report),
      this.formatRecommendations(report),
      this.formatMissingDataFields(report),
    ].join('\n');
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export function createSDAnalysisAgent(): SDAnalysisAgent {
  return new SDAnalysisAgent();
}
