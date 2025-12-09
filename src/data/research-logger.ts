/**
 * Ghost Evaluator v15.1 - Research Logger
 * ========================================
 * Data collection for P1, Bait-and-Switch, and Early Detection research.
 *
 * PHASE 1: Data logging only - NO changes to pattern logic.
 * This logger observes the existing system and collects research data.
 */

import {
  Direction,
  PatternName,
  PatternState,
  PatternCycle,
  RunData,
  Block,
  PATTERN_NAMES,
} from '../types';
import {
  MarketState,
  ActivationEvent,
  BreakEvent,
  BnSCycle,
  PatternBnSData,
  P1Event,
  P1Type,
  PreP1Analysis,
  HypotheticalP1Play,
  BlockRecord,
  RunContext,
  P1Context,
  PatternStateSnapshot,
  WarningScore,
  WarningFactors,
  WarningLevel,
  ResearchData,
  ResearchSessionSummary,
  ResearchConfig,
  DEFAULT_RESEARCH_CONFIG,
  StateDistributionEntry,
  PatternBnSAnalysis,
  WarningSystemAnalysis,
} from './research-types';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function average(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// ============================================================================
// RESEARCH LOGGER CLASS
// ============================================================================

export class ResearchLogger {
  private sessionId: string;
  private config: ResearchConfig;

  // Block records
  private blockRecords: BlockRecord[] = [];

  // B&S tracking per pattern
  private patternBnSTracking: Record<PatternName, PatternBnSData>;

  // P1 tracking
  private p1Events: P1Event[] = [];
  private currentP1Event: Partial<P1Event> | null = null;
  private preP1Buffer: Block[] = [];

  // State tracking
  private previousMarketState: MarketState = 'CLEAN';
  private previousPatternStates: Record<PatternName, PatternState> = {} as Record<PatternName, PatternState>;
  private blocksInCurrentState: number = 0;
  private stateHistory: { state: MarketState; startBlock: number; endBlock: number }[] = [];

  // Warning tracking
  private warningHistory: { blockIndex: number; level: WarningLevel; score: number }[] = [];

  // Trade tracking for research
  private tradesInState: Record<MarketState, { wins: number; losses: number; pnl: number }>;

  constructor(sessionId: string, config: ResearchConfig = DEFAULT_RESEARCH_CONFIG) {
    this.sessionId = sessionId;
    this.config = config;

    // Initialize B&S tracking for all patterns
    this.patternBnSTracking = {} as Record<PatternName, PatternBnSData>;
    for (const pattern of PATTERN_NAMES) {
      this.patternBnSTracking[pattern] = {
        pattern,
        activations: [],
        breaks: [],
        cycles: [],
        currentMode: 'normal',
        cyclesInWindow: 0,
        lastModeChangeBlock: 0,
        consecutiveConfirmations: 0,
      };
      this.previousPatternStates[pattern] = 'observing';
    }

    // Initialize state trade tracking
    this.tradesInState = {
      CLEAN: { wins: 0, losses: 0, pnl: 0 },
      CHOPPY: { wins: 0, losses: 0, pnl: 0 },
      ESCALATING: { wins: 0, losses: 0, pnl: 0 },
      P1_ACTIVE: { wins: 0, losses: 0, pnl: 0 },
      P1_RECOVERY: { wins: 0, losses: 0, pnl: 0 },
      BNS_DOMINANT: { wins: 0, losses: 0, pnl: 0 },
    };
  }

  // ============================================================================
  // MAIN LOGGING METHOD - Call this for each block
  // ============================================================================

  /**
   * Log research data for a block.
   * This is the main entry point - call after each block is processed.
   */
  logBlock(
    block: Block,
    runData: RunData,
    patternCycles: Record<PatternName, PatternCycle>,
    isP1Mode: boolean,
    tradeResult?: { pattern: PatternName; isWin: boolean; pnl: number } | null
  ): BlockRecord {
    const timestamp = new Date().toISOString();

    // 1. Build run context
    const runContext = this.buildRunContext(runData);

    // 2. Detect market state (read-only classification)
    const marketState = this.classifyMarketState(runContext, patternCycles, isP1Mode);

    // 3. Calculate warning score
    const warningScore = this.calculateWarningScore(runContext, marketState);

    // 4. Build P1 context
    const p1Context = this.buildP1Context(runData, isP1Mode);

    // 5. Update B&S tracking and build pattern state snapshots
    const patternSnapshots = this.updatePatternTracking(
      block.index,
      patternCycles,
      timestamp
    );

    // 6. Generate tags
    const tags = this.generateTags(marketState, p1Context, runContext);

    // 7. Build block record
    const blockRecord: BlockRecord = {
      blockIndex: block.index,
      timestamp,
      direction: block.dir,
      pct: block.pct,
      run: runContext,
      marketState: {
        current: marketState,
        previous: this.previousMarketState,
        warningLevel: warningScore.level,
        warningScore: warningScore.score,
      },
      p1: p1Context,
      patternStates: patternSnapshots,
      tags,
    };

    // 8. Track P1 events
    this.trackP1Event(block, runData, isP1Mode, patternCycles);

    // 9. Update state tracking
    this.updateStateTracking(marketState, block.index, tradeResult);

    // 10. Store block record
    this.blockRecords.push(blockRecord);

    // 11. Update previous states
    this.previousMarketState = marketState;
    for (const pattern of PATTERN_NAMES) {
      this.previousPatternStates[pattern] = patternCycles[pattern].state;
    }

    // 12. Maintain pre-P1 buffer
    this.preP1Buffer.push(block);
    if (this.preP1Buffer.length > this.config.preP1AnalysisBlocks) {
      this.preP1Buffer.shift();
    }

    return blockRecord;
  }

  // ============================================================================
  // RUN CONTEXT
  // ============================================================================

  private buildRunContext(runData: RunData): RunContext {
    const recentLengths = runData.lengths.slice(-this.config.runLengthWindowSize);

    return {
      currentLength: runData.currentLength,
      currentDirection: runData.currentDirection,
      recentLengths,
      avgLength: average(recentLengths),
      maxLengthInWindow: recentLengths.length > 0 ? Math.max(...recentLengths) : 0,
    };
  }

  // ============================================================================
  // MARKET STATE CLASSIFICATION (Read-Only)
  // ============================================================================

  private classifyMarketState(
    runContext: RunContext,
    patternCycles: Record<PatternName, PatternCycle>,
    isP1Mode: boolean
  ): MarketState {
    // P1 Active takes priority
    if (isP1Mode || runContext.currentLength >= 7) {
      return 'P1_ACTIVE';
    }

    // Check if just exited P1
    if (this.previousMarketState === 'P1_ACTIVE' && runContext.currentLength < 7) {
      return 'P1_RECOVERY';
    }

    // Check recovery completion
    if (this.previousMarketState === 'P1_RECOVERY') {
      if (this.isRecoveryComplete(runContext)) {
        // Continue to check other states
      } else if (this.isEscalating(runContext)) {
        return 'ESCALATING';
      } else {
        return 'P1_RECOVERY';
      }
    }

    // Check B&S dominance
    const patternsInBnS = this.countPatternsInBnS();
    if (patternsInBnS >= 3) {
      return 'BNS_DOMINANT';
    }

    // Check escalation
    if (this.isEscalating(runContext)) {
      return 'ESCALATING';
    }

    // Check choppy
    if (this.isChoppy(runContext, patternCycles)) {
      return 'CHOPPY';
    }

    // Default to clean
    return 'CLEAN';
  }

  private isRecoveryComplete(runContext: RunContext): boolean {
    // Recovery complete when run lengths normalize
    return runContext.avgLength <= 2.5 && runContext.maxLengthInWindow <= 4;
  }

  private isEscalating(runContext: RunContext): boolean {
    const recent = runContext.recentLengths.slice(-5);
    if (recent.length < 3) return false;

    // Check if run lengths are trending upward
    let increasing = 0;
    for (let i = 1; i < recent.length; i++) {
      if (recent[i] > recent[i - 1]) increasing++;
    }

    // Escalating if mostly increasing and recent max >= 5
    return increasing >= 2 && runContext.maxLengthInWindow >= 5;
  }

  private isChoppy(
    runContext: RunContext,
    patternCycles: Record<PatternName, PatternCycle>
  ): boolean {
    // Very short average run length
    if (runContext.avgLength <= 1.5) return true;

    // Count consecutive 1s in recent runs
    const consecutiveOnes = runContext.recentLengths.filter(l => l === 1).length;
    if (consecutiveOnes >= 5) return true;

    // Check pattern churn (many patterns broken recently)
    let brokenPatterns = 0;
    for (const pattern of PATTERN_NAMES) {
      if (patternCycles[pattern].state === 'observing' &&
          this.previousPatternStates[pattern] === 'active') {
        brokenPatterns++;
      }
    }
    if (brokenPatterns >= 3) return true;

    return false;
  }

  private countPatternsInBnS(): number {
    let count = 0;
    for (const pattern of PATTERN_NAMES) {
      if (this.patternBnSTracking[pattern].currentMode === 'bns') {
        count++;
      }
    }
    return count;
  }

  // ============================================================================
  // WARNING SCORE CALCULATION
  // ============================================================================

  private calculateWarningScore(
    runContext: RunContext,
    marketState: MarketState
  ): WarningScore {
    const factors: WarningFactors = {
      runLengthFactor: 0,
      bnsPatternFactor: 0,
      winRateFactor: 0,
      escalationFactor: 0,
    };

    // Run length factor (0-25)
    factors.runLengthFactor = Math.min(25,
      Math.max(0, (runContext.avgLength - 2) * 5) +
      (runContext.maxLengthInWindow >= 6 ? 10 : 0)
    );

    // B&S pattern factor (0-25)
    const patternsInBnS = this.countPatternsInBnS();
    const patternsInWarning = this.countPatternsInWarning();
    factors.bnsPatternFactor = Math.min(25,
      patternsInBnS * 8 + patternsInWarning * 3
    );

    // Win rate factor (0-25) - based on recent block records
    // For now, use a simplified calculation since we don't track trades here
    // TODO: Enhance when trade data is integrated
    factors.winRateFactor = 0;

    // Escalation factor (0-25)
    if (marketState === 'ESCALATING') {
      factors.escalationFactor = 15;
    }
    if (marketState === 'P1_ACTIVE') {
      factors.escalationFactor = 25;
    }
    if (this.isEscalating(runContext)) {
      factors.escalationFactor = Math.min(25, factors.escalationFactor + 10);
    }

    // Total score
    const score = factors.runLengthFactor + factors.bnsPatternFactor +
                  factors.winRateFactor + factors.escalationFactor;

    // Determine level
    let level: WarningLevel;
    if (score < 15) level = 0;
    else if (score < 30) level = 1;
    else if (score < 50) level = 2;
    else if (score < 70) level = 3;
    else level = 4;

    // Generate recommendations
    const recommendations = this.generateRecommendations(level, factors, marketState);

    // Track warning
    const blockIndex = this.blockRecords.length;
    this.warningHistory.push({ blockIndex, level, score });

    return { level, score, factors, recommendations };
  }

  private countPatternsInWarning(): number {
    let count = 0;
    for (const pattern of PATTERN_NAMES) {
      if (this.patternBnSTracking[pattern].currentMode === 'warning') {
        count++;
      }
    }
    return count;
  }

  private generateRecommendations(
    level: WarningLevel,
    factors: WarningFactors,
    marketState: MarketState
  ): string[] {
    const recommendations: string[] = [];

    if (level === 0) {
      recommendations.push('All clear - normal trading');
    }

    if (level >= 1 && factors.bnsPatternFactor > 0) {
      recommendations.push('Monitor B&S patterns closely');
    }

    if (level >= 2) {
      recommendations.push('Consider reducing stake to 50%');
    }

    if (level >= 3) {
      recommendations.push('Consider stopping main strategy');
      if (marketState === 'ESCALATING') {
        recommendations.push('P1 may be approaching');
      }
    }

    if (level === 4) {
      recommendations.push('Stop main strategy - special plays only');
    }

    return recommendations;
  }

  // ============================================================================
  // P1 CONTEXT
  // ============================================================================

  private buildP1Context(runData: RunData, isP1Mode: boolean): P1Context {
    const isActive = isP1Mode || runData.currentLength >= 7;
    const blocksIntoP1 = isActive ? runData.currentLength - 6 : 0;

    // Check for escalation pattern
    const escalationSequence: PatternName[] = [];
    const recentLengths = runData.lengths.slice(-10);

    // Simple escalation detection: look for increasing pattern formations
    if (recentLengths.some(l => l >= 6)) {
      escalationSequence.push('6A6');
    }
    if (recentLengths.some(l => l >= 5)) {
      escalationSequence.push('5A5');
    }
    if (recentLengths.some(l => l >= 4)) {
      escalationSequence.push('4A4');
    }

    return {
      isActive,
      blocksIntoP1: Math.max(0, blocksIntoP1),
      p1Direction: isActive ? runData.currentDirection : null,
      isEscalating: escalationSequence.length >= 2,
      escalationSequence,
    };
  }

  // ============================================================================
  // PATTERN B&S TRACKING
  // ============================================================================

  private updatePatternTracking(
    blockIndex: number,
    patternCycles: Record<PatternName, PatternCycle>,
    timestamp: string
  ): Record<PatternName, PatternStateSnapshot> {
    const snapshots: Record<PatternName, PatternStateSnapshot> = {} as Record<PatternName, PatternStateSnapshot>;

    for (const pattern of PATTERN_NAMES) {
      const cycle = patternCycles[pattern];
      const tracking = this.patternBnSTracking[pattern];
      const prevState = this.previousPatternStates[pattern];

      // Detect activation (observing → active)
      if (cycle.state === 'active' && prevState === 'observing') {
        const activation: ActivationEvent = {
          blockIndex,
          direction: cycle.observationResults.length > 0
            ? cycle.observationResults[cycle.observationResults.length - 1].expectedDirection
            : 1,
          predictedDirection: cycle.observationResults.length > 0
            ? cycle.observationResults[cycle.observationResults.length - 1].expectedDirection
            : 1,
          activationPct: cycle.cumulativeProfit,
          timestamp,
        };
        tracking.activations.push(activation);
        tracking.consecutiveConfirmations = 0;
      }

      // Detect break (active → observing)
      if (cycle.state === 'observing' && prevState === 'active') {
        const lastActivation = tracking.activations[tracking.activations.length - 1];
        if (lastActivation) {
          // Determine break reason
          const lastResult = cycle.activeResults[cycle.activeResults.length - 1];
          let breakReason: BreakEvent['breakReason'] = 'unknown';
          if (lastResult && lastResult.actualDirection !== lastResult.expectedDirection) {
            breakReason = 'loss';
          }

          const breakEvent: BreakEvent = {
            blockIndex,
            activationBlockIndex: lastActivation.blockIndex,
            breakReason,
            breakPct: lastResult?.pct || 0,
            actualDirection: lastResult?.actualDirection || 1,
            predictedDirection: lastActivation.predictedDirection,
            timestamp,
          };
          tracking.breaks.push(breakEvent);

          // Create cycle
          const bnsCycle: BnSCycle = {
            cycleId: generateId(),
            pattern,
            activation: lastActivation,
            break: breakEvent,
            cycleDuration: blockIndex - lastActivation.blockIndex,
            hypotheticalInversePnL: this.calculateHypotheticalInverse(lastActivation, breakEvent),
            hypotheticalBreakDirectionPnL: breakEvent.actualDirection === breakEvent.predictedDirection
              ? -breakEvent.breakPct
              : breakEvent.breakPct,
          };
          tracking.cycles.push(bnsCycle);
        }
      }

      // Track consecutive confirmations (pattern stays active through a signal)
      if (cycle.state === 'active' && prevState === 'active') {
        // Check if we had a win (confirmation)
        const recentActiveResult = cycle.activeResults[cycle.activeResults.length - 1];
        if (recentActiveResult &&
            recentActiveResult.actualDirection === recentActiveResult.expectedDirection) {
          tracking.consecutiveConfirmations++;
        }
      }

      // Update cycles in window
      tracking.cyclesInWindow = tracking.cycles.filter(c =>
        c.activation.blockIndex >= blockIndex - this.config.bnsWindowSize
      ).length;

      // Update B&S mode
      this.updateBnSMode(pattern, blockIndex);

      // Build snapshot
      snapshots[pattern] = {
        state: cycle.state,
        mode: tracking.currentMode,
        cyclesInWindow: tracking.cyclesInWindow,
        lastActivationBlock: tracking.activations.length > 0
          ? tracking.activations[tracking.activations.length - 1].blockIndex
          : null,
        lastBreakBlock: tracking.breaks.length > 0
          ? tracking.breaks[tracking.breaks.length - 1].blockIndex
          : null,
      };
    }

    return snapshots;
  }

  private calculateHypotheticalInverse(
    activation: ActivationEvent,
    breakEvent: BreakEvent
  ): number {
    // If we had bet inverse of the predicted direction
    const inversePrediction = activation.predictedDirection * -1;
    if (breakEvent.actualDirection === inversePrediction) {
      return breakEvent.breakPct; // Win
    } else {
      return -breakEvent.breakPct; // Loss
    }
  }

  private updateBnSMode(pattern: PatternName, blockIndex: number): void {
    const tracking = this.patternBnSTracking[pattern];

    // Check transitions
    if (tracking.cyclesInWindow >= this.config.bnsConfirmedThreshold && tracking.currentMode !== 'bns') {
      tracking.currentMode = 'bns';
      tracking.lastModeChangeBlock = blockIndex;
    } else if (tracking.cyclesInWindow >= this.config.bnsWarningThreshold &&
               tracking.cyclesInWindow < this.config.bnsConfirmedThreshold &&
               tracking.currentMode === 'normal') {
      tracking.currentMode = 'warning';
      tracking.lastModeChangeBlock = blockIndex;
    }

    // Check exit from B&S
    if (tracking.currentMode === 'bns') {
      if (tracking.consecutiveConfirmations >= 2) {
        tracking.currentMode = 'normal';
        tracking.lastModeChangeBlock = blockIndex;
        tracking.consecutiveConfirmations = 0;
      }
    }

    // Check exit from warning
    if (tracking.currentMode === 'warning') {
      if (tracking.consecutiveConfirmations >= 2) {
        tracking.currentMode = 'normal';
        tracking.lastModeChangeBlock = blockIndex;
        tracking.consecutiveConfirmations = 0;
      }
    }
  }

  // ============================================================================
  // P1 EVENT TRACKING
  // ============================================================================

  private trackP1Event(
    block: Block,
    runData: RunData,
    isP1Mode: boolean,
    patternCycles: Record<PatternName, PatternCycle>
  ): void {
    const isP1 = isP1Mode || runData.currentLength >= 7;

    // Start new P1 event
    if (isP1 && !this.currentP1Event) {
      this.currentP1Event = {
        eventId: generateId(),
        startBlockIndex: block.index,
        direction: runData.currentDirection,
        peakRunLength: runData.currentLength,
        preP1Phase: this.analyzePreP1Phase(patternCycles),
        duringP1: {
          totalBlocks: 1,
          pauseCount: 0,
          avgPctInTrend: block.dir === runData.currentDirection ? block.pct : 0,
          avgPctAgainstTrend: block.dir !== runData.currentDirection ? block.pct : 0,
          patternsFailedAgainstTrend: [],
        },
        hypotheticalPlays: {
          reversalAt7: { wouldWin: false, pnl: 0, pct: 0 },
          reversalAt8: null,
          reversalAt9: null,
          reversalAt10Plus: null,
        },
      };
    }

    // Update ongoing P1 event
    if (this.currentP1Event && isP1) {
      this.currentP1Event.peakRunLength = Math.max(
        this.currentP1Event.peakRunLength || 0,
        runData.currentLength
      );

      if (this.currentP1Event.duringP1) {
        this.currentP1Event.duringP1.totalBlocks++;
      }

      // Track hypothetical reversal plays
      this.trackHypotheticalP1Plays(block, runData);
    }

    // End P1 event
    if (this.currentP1Event && !isP1) {
      this.finishP1Event(block, runData);
    }
  }

  private analyzePreP1Phase(patternCycles: Record<PatternName, PatternCycle>): PreP1Analysis {
    const runLengths = this.preP1Buffer.map(() => {
      // Simplified - would need proper run calculation
      return 1;
    });

    const patternsBroken: PatternName[] = [];
    for (const pattern of PATTERN_NAMES) {
      if (patternCycles[pattern].state === 'observing' &&
          this.previousPatternStates[pattern] === 'active') {
        patternsBroken.push(pattern);
      }
    }

    return {
      startBlock: this.blockRecords.length - this.preP1Buffer.length,
      wasChoppy: this.previousMarketState === 'CHOPPY',
      wasEscalating: this.previousMarketState === 'ESCALATING',
      hadAlternating3A3: false, // Would need specific detection
      patternsBroken,
      runLengthSequence: runLengths.slice(-10),
    };
  }

  private trackHypotheticalP1Plays(block: Block, runData: RunData): void {
    if (!this.currentP1Event) return;

    const reversalDirection = (runData.currentDirection * -1) as Direction;
    const wouldWin = block.dir === reversalDirection;
    const pnl = wouldWin ? block.pct : -block.pct;

    const play: HypotheticalP1Play = { wouldWin, pnl, pct: block.pct };

    if (runData.currentLength === 7 && !this.currentP1Event.hypotheticalPlays?.reversalAt7.pct) {
      this.currentP1Event.hypotheticalPlays!.reversalAt7 = play;
    } else if (runData.currentLength === 8 && !this.currentP1Event.hypotheticalPlays?.reversalAt8) {
      this.currentP1Event.hypotheticalPlays!.reversalAt8 = play;
    } else if (runData.currentLength === 9 && !this.currentP1Event.hypotheticalPlays?.reversalAt9) {
      this.currentP1Event.hypotheticalPlays!.reversalAt9 = play;
    } else if (runData.currentLength >= 10 && !this.currentP1Event.hypotheticalPlays?.reversalAt10Plus) {
      this.currentP1Event.hypotheticalPlays!.reversalAt10Plus = play;
    }
  }

  private finishP1Event(block: Block, _runData: RunData): void {
    if (!this.currentP1Event) return;

    const p1Event: P1Event = {
      eventId: this.currentP1Event.eventId!,
      startBlockIndex: this.currentP1Event.startBlockIndex!,
      endBlockIndex: block.index,
      direction: this.currentP1Event.direction!,
      type: this.classifyP1Type(this.currentP1Event),
      peakRunLength: this.currentP1Event.peakRunLength!,
      preP1Phase: this.currentP1Event.preP1Phase!,
      duringP1: this.currentP1Event.duringP1!,
      postP1: {
        recoveryBlocks: 0, // Will be updated later
        firstPatternToRecover: null,
        blocksUntilNormal: 0,
      },
      hypotheticalPlays: this.currentP1Event.hypotheticalPlays!,
    };

    this.p1Events.push(p1Event);
    this.currentP1Event = null;
  }

  private classifyP1Type(p1Event: Partial<P1Event>): P1Type {
    // Real P1: peak >= 9 or cascading same direction
    if ((p1Event.peakRunLength || 0) >= 9) {
      return 'real_p1';
    }
    return 'false_p1';
  }

  // ============================================================================
  // TAG GENERATION
  // ============================================================================

  private generateTags(
    marketState: MarketState,
    p1Context: P1Context,
    runContext: RunContext
  ): string[] {
    const tags: string[] = [];

    // Market state tag
    tags.push(`state:${marketState.toLowerCase()}`);

    // P1 related tags
    if (p1Context.isActive) {
      tags.push('p1_active');
      tags.push(`p1_blocks:${p1Context.blocksIntoP1}`);
    }
    if (p1Context.isEscalating) {
      tags.push('escalating');
    }

    // Run length tags
    if (runContext.currentLength >= 5) {
      tags.push('long_run');
    }
    if (runContext.avgLength <= 1.5) {
      tags.push('choppy_runs');
    }

    // B&S tags
    const patternsInBnS = this.countPatternsInBnS();
    if (patternsInBnS > 0) {
      tags.push(`bns_patterns:${patternsInBnS}`);
    }

    return tags;
  }

  // ============================================================================
  // STATE TRACKING
  // ============================================================================

  private updateStateTracking(
    marketState: MarketState,
    blockIndex: number,
    tradeResult?: { pattern: PatternName; isWin: boolean; pnl: number } | null
  ): void {
    // Track state changes
    if (marketState !== this.previousMarketState) {
      // Close previous state period
      if (this.stateHistory.length > 0) {
        this.stateHistory[this.stateHistory.length - 1].endBlock = blockIndex - 1;
      }

      // Start new state period
      this.stateHistory.push({
        state: marketState,
        startBlock: blockIndex,
        endBlock: blockIndex, // Will be updated
      });

      this.blocksInCurrentState = 0;
    }

    this.blocksInCurrentState++;

    // Track trades by state
    if (tradeResult) {
      const stateTrack = this.tradesInState[marketState];
      if (tradeResult.isWin) {
        stateTrack.wins++;
      } else {
        stateTrack.losses++;
      }
      stateTrack.pnl += tradeResult.pnl;
    }
  }

  // ============================================================================
  // SUMMARY GENERATION
  // ============================================================================

  /**
   * Generate research session summary
   */
  generateSummary(
    sessionId: string,
    startTime: string,
    endTime: string,
    totalTrades: number,
    totalWins: number,
    totalPnL: number
  ): ResearchSessionSummary {
    const totalBlocks = this.blockRecords.length;

    // Calculate state distribution
    const stateDistribution: Record<MarketState, StateDistributionEntry> = {
      CLEAN: this.calculateStateDistribution('CLEAN', totalBlocks),
      CHOPPY: this.calculateStateDistribution('CHOPPY', totalBlocks),
      ESCALATING: this.calculateStateDistribution('ESCALATING', totalBlocks),
      P1_ACTIVE: this.calculateStateDistribution('P1_ACTIVE', totalBlocks),
      P1_RECOVERY: this.calculateStateDistribution('P1_RECOVERY', totalBlocks),
      BNS_DOMINANT: this.calculateStateDistribution('BNS_DOMINANT', totalBlocks),
    };

    // Calculate B&S analysis per pattern
    const bnsAnalysis: Record<PatternName, PatternBnSAnalysis> = {} as Record<PatternName, PatternBnSAnalysis>;
    for (const pattern of PATTERN_NAMES) {
      bnsAnalysis[pattern] = this.calculatePatternBnSAnalysis(pattern);
    }

    // Calculate warning system analysis
    const warningSystemAnalysis = this.calculateWarningAnalysis();

    return {
      sessionId,
      startTime,
      endTime,
      totalBlocks,
      results: {
        totalTrades,
        wins: totalWins,
        losses: totalTrades - totalWins,
        winRate: totalTrades > 0 ? totalWins / totalTrades : 0,
        totalPnL,
      },
      byStrategy: {
        main: { trades: totalTrades, wins: totalWins, pnl: totalPnL, winRate: totalTrades > 0 ? totalWins / totalTrades : 0 },
        bns: { trades: 0, wins: 0, pnl: 0, winRate: 0 }, // For future B&S plays
        p1: { trades: 0, wins: 0, pnl: 0, winRate: 0 },  // For future P1 plays
      },
      stateDistribution,
      p1Events: this.p1Events,
      bnsAnalysis,
      warningSystemAnalysis,
    };
  }

  private calculateStateDistribution(state: MarketState, totalBlocks: number): StateDistributionEntry {
    const blocksInState = this.blockRecords.filter(b => b.marketState.current === state).length;
    const stateTrack = this.tradesInState[state];
    const trades = stateTrack.wins + stateTrack.losses;

    return {
      blocksInState,
      percentageOfSession: totalBlocks > 0 ? (blocksInState / totalBlocks) * 100 : 0,
      tradesInState: trades,
      winRateInState: trades > 0 ? stateTrack.wins / trades : 0,
      pnlInState: stateTrack.pnl,
    };
  }

  private calculatePatternBnSAnalysis(pattern: PatternName): PatternBnSAnalysis {
    const tracking = this.patternBnSTracking[pattern];

    // Calculate time in B&S mode
    let timeInBnsMode = 0;
    for (const record of this.blockRecords) {
      if (record.patternStates[pattern].mode === 'bns') {
        timeInBnsMode++;
      }
    }

    // Calculate hypothetical inverse P/L
    let hypotheticalInversePnL = 0;
    for (const cycle of tracking.cycles) {
      hypotheticalInversePnL += cycle.hypotheticalInversePnL;
    }

    return {
      totalCycles: tracking.cycles.length,
      timeInBnsMode,
      bnsPlays: 0, // For future actual B&S plays
      bnsWinRate: 0,
      bnsPnL: 0,
      hypotheticalInversePnL,
    };
  }

  private calculateWarningAnalysis(): WarningSystemAnalysis {
    const level3Triggers = this.warningHistory.filter(w => w.level === 3).length;
    const level4Triggers = this.warningHistory.filter(w => w.level === 4).length;

    return {
      timesLevel3Triggered: level3Triggers,
      timesLevel4Triggered: level4Triggers,
      accuracyOfWarnings: 0, // Would need trade correlation
      missedWarnings: 0,     // Would need trade correlation
    };
  }

  // ============================================================================
  // GETTERS
  // ============================================================================

  getSessionId(): string {
    return this.sessionId;
  }

  getBlockRecords(): BlockRecord[] {
    return this.blockRecords;
  }

  getPatternBnSTracking(): Record<PatternName, PatternBnSData> {
    return this.patternBnSTracking;
  }

  getP1Events(): P1Event[] {
    return this.p1Events;
  }

  getResearchData(
    sessionId: string,
    startTime: string,
    endTime: string,
    totalTrades: number,
    totalWins: number,
    totalPnL: number
  ): ResearchData {
    return {
      sessionId,
      evaluatorVersion: '15.1',
      blockRecords: this.blockRecords,
      patternBnSTracking: this.patternBnSTracking,
      p1Events: this.p1Events,
      summary: this.generateSummary(sessionId, startTime, endTime, totalTrades, totalWins, totalPnL),
    };
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createResearchLogger(
  sessionId: string,
  config?: ResearchConfig
): ResearchLogger {
  return new ResearchLogger(sessionId, config);
}
