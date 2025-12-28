/**
 * Ghost Evaluator v15.4 - Session Recorder
 * ==========================================
 * Handles complete session recording and persistence
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  SessionLog,
  SessionSummary,
  ConfigSnapshot,
  LoggedPlay,
  BucketTransition,
  BucketSnapshot,
  PatternBucketState,
  LossStreakSummary,
  BnsEffectiveness,
  P1FlowEvent,
  P1FlowAnalysis,
  ZZSessionState,
  ZZPocketAnalysis,
  ZZBlockSnapshot,
  BucketType,
  SDStateSnapshot,
  SDSessionSummary,
  SDBetType,
} from './types';
import {
  PatternName,
  EvaluatorConfig,
  PATTERN_NAMES,
  ZZRunRecord,
} from '../types';
import { PlayLogger, generateSessionId } from './play-logger';
import { GameStateEngine } from '../engine/state';
import { ReactionEngine } from '../engine/reaction';
import { ResearchLogger, createResearchLogger } from './research-logger';
import { ResearchData, ResearchConfig, DEFAULT_RESEARCH_CONFIG } from './research-types';

// ============================================================================
// SESSION RECORDER CLASS
// ============================================================================

export class SessionRecorder {
  private sessionId: string;
  private startTime: Date;
  private sessionsDir: string;
  private playLogger: PlayLogger;
  private config: EvaluatorConfig;
  private isRecording = false;
  private autoSaveInterval: NodeJS.Timeout | null = null;
  private currentFilePath: string | null = null;

  // Track pattern activations for summary
  private patternActivations: Record<PatternName, number>;
  private betsPerPattern: Record<PatternName, number>;
  private winsPerPattern: Record<PatternName, number>;
  private pnlPerPattern: Record<PatternName, number>;

  // Track P1 mode
  private firstP1ModeBlock: number | null = null;
  private blocksInP1Mode = 0;
  private wasInP1Mode = false;

  // Track P/L extremes
  private maxPnl = 0;
  private minPnl = 0;

  // === ENHANCED TRACKING FIELDS ===

  // Bucket tracking
  private bucketTransitions: BucketTransition[] = [];
  private lastBucketSnapshot: Map<PatternName, BucketType> = new Map();

  // Loss tracking
  private currentLossStreak = 0;
  private maxLossStreak = 0;
  private lossStreakCount = 0;
  private totalStreakLengths = 0;
  private lossesPerPattern: Record<PatternName, number> = {} as Record<PatternName, number>;
  private lossesInBns = 0;
  private lossesInMain = 0;
  private bnsSwitchAttempts = 0;
  private bnsSwitchWins = 0;

  // P1 flow tracking
  private p1Events: P1FlowEvent[] = [];
  private currentP1Duration = 0;
  private longestP1Duration = 0;
  private patternsActiveAtP1Entry: Record<PatternName, number> = {} as Record<PatternName, number>;

  // Research logger for P1/B&S data collection
  private researchLogger: ResearchLogger;
  private researchConfig: ResearchConfig;

  // === SAMEDIR PAUSE/RESUME TRACKING ===
  private sdRealTrades = 0;
  private sdImaginaryTrades = 0;
  private sdRealPnL = 0;
  private sdImaginaryPnL = 0;
  private sdPauseCount = 0;
  private sdResumeCount = 0;
  private sdPauseReasons: { HIGH_PCT_REVERSAL: number; CONSECUTIVE_LOSSES: number } = {
    HIGH_PCT_REVERSAL: 0,
    CONSECUTIVE_LOSSES: 0,
  };
  private sdBlocksInPause = 0;
  private sdActivationCount = 0;
  private sdExpirationCount = 0;
  private lastSDState: 'INACTIVE' | 'ACTIVE' | 'PAUSED' | 'EXPIRED' = 'INACTIVE';

  constructor(config: EvaluatorConfig, sessionsDir = './data/sessions', logsDir = './data/logs', researchConfig?: ResearchConfig) {
    this.sessionId = generateSessionId();
    this.startTime = new Date();
    this.sessionsDir = path.resolve(sessionsDir);
    this.config = config;
    this.playLogger = new PlayLogger(this.sessionId, logsDir);

    // Initialize tracking maps
    this.patternActivations = {} as Record<PatternName, number>;
    this.betsPerPattern = {} as Record<PatternName, number>;
    this.winsPerPattern = {} as Record<PatternName, number>;
    this.pnlPerPattern = {} as Record<PatternName, number>;

    for (const p of PATTERN_NAMES) {
      this.patternActivations[p] = 0;
      this.betsPerPattern[p] = 0;
      this.winsPerPattern[p] = 0;
      this.pnlPerPattern[p] = 0;
      this.lossesPerPattern[p] = 0;
      this.patternsActiveAtP1Entry[p] = 0;
    }

    // Initialize research logger
    this.researchConfig = researchConfig || DEFAULT_RESEARCH_CONFIG;
    this.researchLogger = createResearchLogger(this.sessionId, this.researchConfig);

    this.ensureSessionsDir();
  }

  /**
   * Ensure sessions directory exists
   */
  private ensureSessionsDir(): void {
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  // =========================================================================
  // BUCKET TRACKING HELPERS
  // =========================================================================

  /**
   * Track bucket changes for all patterns
   */
  private trackBucketChanges(
    blockIndex: number,
    reactionEngine: ReactionEngine,
    gameState: GameStateEngine
  ): BucketTransition[] {
    const bucketManager = reactionEngine.getBucketManager();
    const lifecycle = gameState.getLifecycle();
    const patterns: PatternName[] = ['PP', 'ST', 'OZ', 'AP5'];
    const changesThisBlock: BucketTransition[] = [];

    for (const pattern of patterns) {
      const currentBucket = bucketManager.getBucket(pattern);
      const previousBucket = this.lastBucketSnapshot.get(pattern) ?? 'WAITING';

      if (currentBucket !== previousBucket) {
        const cycle = lifecycle.getCycle(pattern);
        const transition: BucketTransition = {
          pattern,
          from: previousBucket,
          to: currentBucket,
          blockIndex,
          reason: this.determineBucketChangeReason(previousBucket, currentBucket, cycle),
          breakRunProfit: cycle?.breakRunProfit,
          wasKilled: cycle?.wasKilled,
          ts: new Date().toISOString(),
        };
        this.bucketTransitions.push(transition);
        changesThisBlock.push(transition);
        this.lastBucketSnapshot.set(pattern, currentBucket);
      }
    }

    return changesThisBlock;
  }

  /**
   * Determine the reason for a bucket change
   */
  private determineBucketChangeReason(
    from: BucketType,
    to: BucketType,
    cycle: ReturnType<ReturnType<GameStateEngine['getLifecycle']>['getCycle']>
  ): string {
    if (to === 'MAIN') {
      return 'Pattern activated - moved to MAIN';
    }
    if (to === 'BNS') {
      const profit = cycle?.breakRunProfit ?? 0;
      return `Pattern broke with ${profit.toFixed(0)}% loss - moved to B&S`;
    }
    if (to === 'WAITING') {
      if (from === 'BNS') {
        return cycle?.wasKilled
          ? 'Pattern killed in B&S (structural break)'
          : 'Pattern exited B&S';
      }
      return 'Pattern broke - moved to WAITING';
    }
    return 'Unknown transition';
  }

  /**
   * Create bucket snapshot for current state
   */
  private createBucketSnapshot(
    reactionEngine: ReactionEngine,
    changes: BucketTransition[]
  ): BucketSnapshot {
    const bucketManager = reactionEngine.getBucketManager();
    const summary = bucketManager.getBucketSummary();

    return {
      main: summary.main,
      waiting: summary.waiting,
      bns: summary.bns,
      changes: changes.length > 0 ? changes : undefined,
    };
  }

  // =========================================================================
  // ZZ TRACKING HELPERS
  // =========================================================================

  /**
   * Create ZZ snapshot for current state
   */
  private createZZSnapshot(
    reactionEngine: ReactionEngine,
    gameState: GameStateEngine
  ): ZZBlockSnapshot | undefined {
    const zzStateManager = reactionEngine.getZZStateManager();
    if (!zzStateManager) return undefined;

    // Use legacy compatibility methods
    const currentState = zzStateManager.getCurrentState();
    if (currentState === 'inactive') return undefined;

    const zzState = zzStateManager.getState();
    const currentDirection = gameState.getCurrentRunDirection();

    return {
      state: currentState,
      pocket: zzStateManager.getCurrentPocket(),
      currentRunProfit: zzStateManager.getCurrentRunProfit(),
      predictedDirection: zzStateManager.getPredictedDirection(currentDirection) ?? undefined,
      indicatorDirection: zzState.savedIndicatorDirection ?? undefined,
    };
  }

  /**
   * Build ZZ session state for final summary
   */
  private buildZZSessionState(reactionEngine: ReactionEngine): ZZSessionState {
    const zzStateManager = reactionEngine.getZZStateManager();
    const zzStats = zzStateManager?.getStatistics();
    const runHistory = zzStateManager?.getRunHistory() ?? [];

    const pocketAnalysis = this.buildZZPocketAnalysis(runHistory);

    return {
      finalState: zzStateManager?.getCurrentState() ?? 'inactive',
      currentPocket: zzStateManager?.getCurrentPocket() ?? 1,
      runHistory,
      pocketAnalysis,
      activationCount: zzStats?.totalRuns ?? 0,  // Use totalRuns as activation count
      totalProfit: zzStats?.totalProfit ?? 0,
    };
  }

  /**
   * Build ZZ pocket analysis from run history
   */
  private buildZZPocketAnalysis(runHistory: ZZRunRecord[]): ZZPocketAnalysis {
    // Analyze pocket 1 runs
    const pocket1Runs = runHistory.filter(r => r.pocket === 1);
    const pocket2Runs = runHistory.filter(r => r.pocket === 2);
    const zzRuns = runHistory.filter(r => !r.wasAntiZZ);
    const antiZZRuns = runHistory.filter(r => r.wasAntiZZ);

    const calcPerformance = (runs: ZZRunRecord[]) => {
      const totalBets = runs.reduce((sum, r) => sum + r.predictionCount, 0);
      const wins = runs.filter(r => r.profit > 0).length;
      const losses = runs.filter(r => r.profit < 0).length;
      const profit = runs.reduce((sum, r) => sum + r.profit, 0);
      return {
        totalRuns: runs.length,
        totalBets,
        wins,
        losses,
        profit,
        winRate: totalBets > 0 ? (wins / runs.length) * 100 : 0,
      };
    };

    // Count pocket transitions
    let pocketTransitions = 0;
    for (let i = 1; i < runHistory.length; i++) {
      if (runHistory[i].pocket !== runHistory[i - 1].pocket) {
        pocketTransitions++;
      }
    }

    return {
      pocket1: calcPerformance(pocket1Runs),
      pocket2: {
        totalRuns: pocket2Runs.length,
        observedBlocks: pocket2Runs.reduce((sum, r) => sum + r.predictionCount, 0),
      },
      zzPerformance: calcPerformance(zzRuns),
      antiZZPerformance: calcPerformance(antiZZRuns),
      pocketTransitions,
      avgRunsPerPocket: pocketTransitions > 0 ? runHistory.length / (pocketTransitions + 1) : runHistory.length,
    };
  }

  // =========================================================================
  // P1 FLOW TRACKING HELPERS
  // =========================================================================

  /**
   * Track P1 mode entry/exit
   */
  private trackP1Flow(
    blockIndex: number,
    gameState: GameStateEngine,
    reactionEngine: ReactionEngine
  ): void {
    const isP1Mode = gameState.isP1Mode();
    const runData = gameState.getRunData();
    const currentPnl = reactionEngine.getPnlTotal();

    // P1 entry detection
    if (isP1Mode && !this.wasInP1Mode) {
      this.wasInP1Mode = true;

      // Record entry event
      this.p1Events.push({
        type: 'enter',
        blockIndex,
        runLength: runData.currentLength,
        runDirection: runData.currentDirection,
        pnlAtEvent: currentPnl,
        ts: new Date().toISOString(),
      });

      // Track which patterns were active
      const lifecycle = gameState.getLifecycle();
      const patterns: PatternName[] = ['PP', 'ST', 'OZ', 'AP5', 'ZZ', 'AntiZZ'];
      for (const pattern of patterns) {
        if (lifecycle.isActive(pattern)) {
          this.patternsActiveAtP1Entry[pattern]++;
        }
      }
    }

    // P1 exit detection
    if (!isP1Mode && this.wasInP1Mode) {
      this.wasInP1Mode = false;

      // Record exit event
      this.p1Events.push({
        type: 'exit',
        blockIndex,
        runLength: runData.currentLength,
        runDirection: runData.currentDirection,
        pnlAtEvent: currentPnl,
        ts: new Date().toISOString(),
      });

      // Track duration
      this.longestP1Duration = Math.max(this.longestP1Duration, this.currentP1Duration);
      this.currentP1Duration = 0;
    }

    // Count blocks in P1
    if (isP1Mode) {
      this.currentP1Duration++;
      this.blocksInP1Mode++;
      if (this.firstP1ModeBlock === null) {
        this.firstP1ModeBlock = blockIndex;
      }
    }
  }

  /**
   * Build P1 flow analysis for final summary
   */
  private buildP1FlowAnalysis(): P1FlowAnalysis {
    const entryEvents = this.p1Events.filter(e => e.type === 'enter');
    const totalEntries = entryEvents.length;

    const avgRunLengthAtEntry = totalEntries > 0
      ? entryEvents.reduce((sum, e) => sum + e.runLength, 0) / totalEntries
      : 0;

    const avgBlocksInP1 = totalEntries > 0
      ? this.blocksInP1Mode / totalEntries
      : 0;

    // Calculate P/L impact (difference between entry and exit P/L)
    let pnlLostDuringP1 = 0;
    for (let i = 0; i < this.p1Events.length - 1; i++) {
      if (this.p1Events[i].type === 'enter' && this.p1Events[i + 1].type === 'exit') {
        pnlLostDuringP1 += this.p1Events[i + 1].pnlAtEvent - this.p1Events[i].pnlAtEvent;
      }
    }

    return {
      p1Events: this.p1Events,
      totalP1Entries: totalEntries,
      avgRunLengthAtEntry,
      avgBlocksInP1,
      pnlLostDuringP1,
      longestP1Duration: this.longestP1Duration,
      patternsActiveAtP1Entry: { ...this.patternsActiveAtP1Entry },
    };
  }

  // =========================================================================
  // LOSS TRACKING HELPERS
  // =========================================================================

  /**
   * Track loss for loss streak and per-bucket analysis
   */
  private trackLoss(
    pattern: PatternName,
    reactionEngine: ReactionEngine,
    isBnsSwitch: boolean
  ): void {
    // Track overall loss streak
    this.currentLossStreak++;
    this.maxLossStreak = Math.max(this.maxLossStreak, this.currentLossStreak);

    // Track per-pattern
    this.lossesPerPattern[pattern]++;

    // Track by bucket
    const bucketManager = reactionEngine.getBucketManager();
    const bucket = bucketManager.getBucket(pattern);
    if (bucket === 'BNS') {
      this.lossesInBns++;
    } else if (bucket === 'MAIN') {
      this.lossesInMain++;
    }

    // Track B&S switch failures
    if (isBnsSwitch) {
      this.bnsSwitchAttempts++;
    }
  }

  /**
   * Track win (resets loss streak)
   */
  private trackWin(isBnsSwitch: boolean): void {
    // Count streak if it was 2+
    if (this.currentLossStreak >= 2) {
      this.lossStreakCount++;
      this.totalStreakLengths += this.currentLossStreak;
    }
    this.currentLossStreak = 0;

    // Track B&S switch wins
    if (isBnsSwitch) {
      this.bnsSwitchAttempts++;
      this.bnsSwitchWins++;
    }
  }

  /**
   * Build loss streak summary
   */
  private buildLossStreakSummary(): LossStreakSummary {
    return {
      maxConsecutive: this.maxLossStreak,
      totalStreaks: this.lossStreakCount,
      avgStreakLength: this.lossStreakCount > 0
        ? this.totalStreakLengths / this.lossStreakCount
        : 0,
    };
  }

  /**
   * Build B&S effectiveness metrics
   */
  private buildBnsEffectiveness(): BnsEffectiveness {
    return {
      totalBnsSwitches: this.bnsSwitchAttempts,
      successfulSwitches: this.bnsSwitchWins,
      failedSwitches: this.bnsSwitchAttempts - this.bnsSwitchWins,
      switchWinRate: this.bnsSwitchAttempts > 0
        ? (this.bnsSwitchWins / this.bnsSwitchAttempts) * 100
        : 0,
    };
  }

  /**
   * Build final bucket states
   */
  private buildFinalBucketStates(reactionEngine: ReactionEngine): Record<PatternName, PatternBucketState> {
    const bucketManager = reactionEngine.getBucketManager();
    return bucketManager.getAllPatternStates();
  }

  // =========================================================================
  // SAMEDIR PAUSE/RESUME TRACKING HELPERS
  // =========================================================================

  /**
   * Create SD state snapshot for current block
   */
  private createSDStateSnapshot(reactionEngine: ReactionEngine): SDStateSnapshot {
    const sdManager = reactionEngine.getSameDirectionManager();
    const sdState = sdManager.getState();
    const pauseInfo = sdManager.getPauseInfo();
    const zzInfo = sdManager.getLastZZXAXInfo();

    // Determine machine state
    let machineState: 'INACTIVE' | 'ACTIVE' | 'PAUSED' | 'EXPIRED';
    if (!sdState.active) {
      machineState = sdState.accumulatedLoss > 140 ? 'EXPIRED' : 'INACTIVE';
    } else if (sdState.paused) {
      machineState = 'PAUSED';
    } else {
      machineState = 'ACTIVE';
    }

    return {
      state: machineState,
      accumulatedLoss: sdState.accumulatedLoss,
      pauseReason: pauseInfo.reason,
      imaginaryPnL: pauseInfo.imaginaryPnL,
      imaginaryWins: pauseInfo.imaginaryWins,
      imaginaryLosses: pauseInfo.imaginaryLosses,
      consecutiveLosses: sdState.sdConsecutiveLosses,
      lastZZXAXResult: zzInfo.result,
      lastZZXAXPattern: zzInfo.pattern,
    };
  }

  /**
   * Track SD state changes for summary
   */
  private trackSDStateChanges(
    reactionEngine: ReactionEngine,
    closedTrade: ReturnType<ReactionEngine['evaluateTrade']>
  ): SDBetType {
    const sdManager = reactionEngine.getSameDirectionManager();
    const sdState = sdManager.getState();
    const pauseInfo = sdManager.getPauseInfo();

    // Determine current machine state
    let currentState: 'INACTIVE' | 'ACTIVE' | 'PAUSED' | 'EXPIRED';
    if (!sdState.active) {
      currentState = sdState.accumulatedLoss > 140 ? 'EXPIRED' : 'INACTIVE';
    } else if (sdState.paused) {
      currentState = 'PAUSED';
    } else {
      currentState = 'ACTIVE';
    }

    // Track state transitions
    if (currentState !== this.lastSDState) {
      // Activation
      if (currentState === 'ACTIVE' && this.lastSDState === 'INACTIVE') {
        this.sdActivationCount++;
      }
      // Pause
      if (currentState === 'PAUSED' && this.lastSDState === 'ACTIVE') {
        this.sdPauseCount++;
        if (pauseInfo.reason === 'HIGH_PCT_REVERSAL') {
          this.sdPauseReasons.HIGH_PCT_REVERSAL++;
        } else if (pauseInfo.reason === 'CONSECUTIVE_LOSSES') {
          this.sdPauseReasons.CONSECUTIVE_LOSSES++;
        }
      }
      // Resume
      if (currentState === 'ACTIVE' && this.lastSDState === 'PAUSED') {
        this.sdResumeCount++;
      }
      // Expiration
      if (currentState === 'EXPIRED' && (this.lastSDState === 'ACTIVE' || this.lastSDState === 'PAUSED')) {
        this.sdExpirationCount++;
      }
      // Re-activation after expiration
      if (currentState === 'ACTIVE' && this.lastSDState === 'EXPIRED') {
        this.sdActivationCount++;
      }

      this.lastSDState = currentState;
    }

    // Track blocks in pause
    if (currentState === 'PAUSED') {
      this.sdBlocksInPause++;
    }

    // Track SD trades (SameDir is a pseudo-pattern, cast as string for comparison)
    let betType: SDBetType = 'NONE';
    if (closedTrade && (closedTrade.pattern as unknown as string) === 'SameDir') {
      if (sdState.paused) {
        // Trade was imaginary (tracked during pause)
        betType = 'IMAGINARY';
        this.sdImaginaryTrades++;
        this.sdImaginaryPnL += closedTrade.pnl;
      } else {
        // Trade was real
        betType = 'REAL';
        this.sdRealTrades++;
        this.sdRealPnL += closedTrade.pnl;
      }
    }

    return betType;
  }

  /**
   * Build SD session summary
   */
  private buildSDSessionSummary(): SDSessionSummary {
    return {
      realTrades: this.sdRealTrades,
      imaginaryTrades: this.sdImaginaryTrades,
      realPnL: this.sdRealPnL,
      imaginaryPnL: this.sdImaginaryPnL,
      pauseCount: this.sdPauseCount,
      resumeCount: this.sdResumeCount,
      pauseReasons: { ...this.sdPauseReasons },
      blocksInPause: this.sdBlocksInPause,
      activationCount: this.sdActivationCount,
      expirationCount: this.sdExpirationCount,
    };
  }

  /**
   * Start recording a new session
   */
  startSession(): void {
    this.isRecording = true;
    this.startTime = new Date();

    // Log session start event
    this.playLogger.logEvent('SESSION_START', 0, `Session ${this.sessionId} started`, {
      config: this.createConfigSnapshot(),
    });

    // Generate file path
    this.currentFilePath = this.generateSessionFilePath();
  }

  /**
   * Record a block being processed
   */
  recordBlock(
    gameState: GameStateEngine,
    reactionEngine: ReactionEngine,
    blockResult: ReturnType<GameStateEngine['addBlock']>,
    prediction: ReturnType<ReactionEngine['predictNext']>,
    closedTrade: ReturnType<ReactionEngine['evaluateTrade']>,
    _openedTrade: ReturnType<ReactionEngine['openTrade']>
  ): LoggedPlay | null {
    if (!this.isRecording) return null;

    try {
      // Get state before (from previous snapshot or initial)
      const stateBefore = this.playLogger.createStateSnapshot(gameState, reactionEngine);

      // Track P1 flow (enhanced tracking)
      this.trackP1Flow(blockResult.block.index, gameState, reactionEngine);

      // Track bucket changes
      const bucketChanges = this.trackBucketChanges(blockResult.block.index, reactionEngine, gameState);

      // Track pattern activations from events
      for (const result of blockResult.evaluatedResults) {
        const lifecycle = gameState.getLifecycle();
        if (lifecycle.isActive(result.pattern)) {
          // Check if it was just activated
          const prevState = stateBefore.patternStates.find(p => p.name === result.pattern);
          if (prevState && prevState.state !== 'active') {
            this.patternActivations[result.pattern]++;
          }
        }
      }

      // Track bets and outcomes with enhanced loss tracking
      if (closedTrade) {
        this.betsPerPattern[closedTrade.pattern]++;
        this.pnlPerPattern[closedTrade.pattern] += closedTrade.pnl;

        // Check if pattern is in B&S bucket (for switch tracking)
        const bucketManager = reactionEngine.getBucketManager();
        const isInBns = bucketManager.getBucket(closedTrade.pattern) === 'BNS';
        const bnsState = bucketManager.getBnsState(closedTrade.pattern);
        // A switch is when the pattern is in B&S and has confirmed bait (waiting for or playing switch)
        const isBnsSwitch = isInBns && bnsState?.baitConfirmed === true;

        if (closedTrade.isWin) {
          this.winsPerPattern[closedTrade.pattern]++;
          this.trackWin(isBnsSwitch);
        } else {
          this.trackLoss(closedTrade.pattern, reactionEngine, isBnsSwitch);
        }

        // Track P/L extremes
        const currentPnl = reactionEngine.getPnlTotal();
        if (currentPnl > this.maxPnl) this.maxPnl = currentPnl;
        if (currentPnl < this.minPnl) this.minPnl = currentPnl;
      }

      // Create state after
      const stateAfter = this.playLogger.createStateSnapshot(gameState, reactionEngine);

      // Create decision
      const decision = this.playLogger.createDecision(prediction, gameState);

      // Create outcome
      const outcome = this.playLogger.createBetOutcome(closedTrade, reactionEngine.getPnlTotal());

      // Log the play
      const play = this.playLogger.logPlay(
        blockResult.block,
        blockResult.newSignals.map(s => s.pattern),
        blockResult.evaluatedResults.map(r => r.pattern),
        stateBefore,
        stateAfter,
        decision,
        outcome
      );

      // === ENHANCED: Add bucket and ZZ snapshots ===
      play.bucketSnapshot = this.createBucketSnapshot(reactionEngine, bucketChanges);
      play.zzSnapshot = this.createZZSnapshot(reactionEngine, gameState);

      // === SAMEDIR PAUSE/RESUME: Add SD state snapshot ===
      play.sdStateSnapshot = this.createSDStateSnapshot(reactionEngine);
      play.sdBetType = this.trackSDStateChanges(reactionEngine, closedTrade);

      // Research logging - collect P1/B&S data (non-invasive, read-only)
      try {
        const tradeResult = closedTrade ? {
          pattern: closedTrade.pattern,
          isWin: closedTrade.isWin,
          pnl: closedTrade.pnl,
        } : null;

        this.researchLogger.logBlock(
          blockResult.block,
          gameState.getRunData(),
          gameState.getLifecycle().getAllCycles(),
          gameState.isP1Mode(),
          tradeResult
        );
      } catch (researchError) {
        // Research logging is non-critical - fail silently
        console.error('Research logging error (non-critical):', researchError);
      }

      // Auto-save partial data (fail-safe)
      this.savePartial();

      return play;
    } catch (error) {
      // Fail-safe: log error but don't break the evaluator
      console.error('Failed to record block:', error);
      return null;
    }
  }

  /**
   * End and finalize the session recording
   */
  endSession(
    gameState: GameStateEngine,
    reactionEngine: ReactionEngine,
    notes?: string
  ): SessionLog {
    const endTime = new Date();

    // Log session end event
    this.playLogger.logEvent('SESSION_END', gameState.getBlockCount() - 1, `Session ${this.sessionId} ended`, {
      duration: endTime.getTime() - this.startTime.getTime(),
      finalPnl: reactionEngine.getPnlTotal(),
    });

    // Create summary
    const summary = this.createSummary(gameState, reactionEngine);

    // Create full session log with enhanced data collection
    const sessionLog: SessionLog = {
      sessionId: this.sessionId,
      evaluatorVersion: '15.3',  // Updated for enhanced data collection
      startTime: this.startTime.toISOString(),
      endTime: endTime.toISOString(),
      durationMs: endTime.getTime() - this.startTime.getTime(),
      config: this.createConfigSnapshot(),
      plays: this.playLogger.getPlays(),
      events: this.playLogger.getEvents(),
      summary,
      blockSequence: gameState.getBlocks(),
      finalPatternStates: gameState.getLifecycle().getAllCycles(),
      finalRunData: gameState.getRunData(),
      notes,

      // === ENHANCED DATA COLLECTION ===
      finalBucketStates: this.buildFinalBucketStates(reactionEngine),
      bucketTransitionHistory: this.bucketTransitions,
      p1FlowAnalysis: this.buildP1FlowAnalysis(),
      zzSessionState: this.buildZZSessionState(reactionEngine),
    };

    // Save final session file
    this.saveSessionFile(sessionLog);

    // Save research data to separate file
    this.saveResearchData(gameState, reactionEngine, endTime);

    this.isRecording = false;
    this.stopAutoSave();

    return sessionLog;
  }

  /**
   * Save research data to a separate file
   */
  private saveResearchData(
    _gameState: GameStateEngine,
    reactionEngine: ReactionEngine,
    endTime: Date
  ): void {
    try {
      const tradeStats = reactionEngine.getTradeStats();
      const researchData = this.researchLogger.getResearchData(
        this.sessionId,
        this.startTime.toISOString(),
        endTime.toISOString(),
        tradeStats.totalTrades,
        tradeStats.wins,
        reactionEngine.getPnlTotal()
      );

      const researchFilePath = path.join(this.sessionsDir, `${this.sessionId}.research.json`);
      fs.writeFileSync(researchFilePath, JSON.stringify(researchData, null, 2), 'utf-8');
    } catch (error) {
      // Research data save is non-critical
      console.error('Failed to save research data (non-critical):', error);
    }
  }

  /**
   * Create configuration snapshot
   */
  private createConfigSnapshot(): ConfigSnapshot {
    return {
      neutralBand: this.config.neutralBand,
      dailyTarget: this.config.dailyTarget,
      betAmount: this.config.betAmount,
      singleProfitThreshold: this.config.singleProfitThreshold,
      cumulativeProfitThreshold: this.config.cumulativeProfitThreshold,
      p1ConsecutiveThreshold: this.config.p1ConsecutiveThreshold,
      enabledPatterns: [...PATTERN_NAMES],
    };
  }

  /**
   * Create session summary
   */
  private createSummary(
    gameState: GameStateEngine,
    reactionEngine: ReactionEngine
  ): SessionSummary {
    const tradeStats = reactionEngine.getTradeStats();
    const currentPnl = reactionEngine.getPnlTotal();

    // Calculate max drawdown
    const maxDrawdown = this.maxPnl - this.minPnl;

    return {
      totalBlocks: gameState.getBlockCount(),
      totalBets: tradeStats.totalTrades,
      wins: tradeStats.wins,
      losses: tradeStats.losses,
      winRate: tradeStats.winRate,
      finalPnl: currentPnl,
      maxPnl: this.maxPnl,
      minPnl: this.minPnl,
      maxDrawdown,
      finalState: gameState.getSessionState(),
      targetReached: reactionEngine.isDailyTargetReached(),
      firstP1ModeBlock: this.firstP1ModeBlock ?? undefined,
      blocksInP1Mode: this.blocksInP1Mode,
      patternActivations: { ...this.patternActivations },
      betsPerPattern: { ...this.betsPerPattern },
      winsPerPattern: { ...this.winsPerPattern },
      pnlPerPattern: { ...this.pnlPerPattern },

      // === ENHANCED LOSS TRACKING ===
      lossStreak: this.buildLossStreakSummary(),
      lossesPerPattern: { ...this.lossesPerPattern },
      lossesInBns: this.lossesInBns,
      lossesInMain: this.lossesInMain,
      bnsEffectiveness: this.buildBnsEffectiveness(),

      // === SAMEDIR PAUSE/RESUME SUMMARY ===
      sdSummary: this.buildSDSessionSummary(),
    };
  }

  /**
   * Generate session file path
   */
  private generateSessionFilePath(): string {
    return path.join(this.sessionsDir, `${this.sessionId}.json`);
  }

  /**
   * Save session file
   */
  private saveSessionFile(sessionLog: SessionLog): void {
    try {
      const filePath = this.currentFilePath || this.generateSessionFilePath();
      const content = JSON.stringify(sessionLog, null, 2);
      fs.writeFileSync(filePath, content, 'utf-8');
    } catch (error) {
      console.error('Failed to save session file:', error);
    }
  }

  /**
   * Save partial session data (for crash recovery)
   */
  private savePartial(): void {
    try {
      if (!this.currentFilePath) return;

      const partialPath = this.currentFilePath.replace('.json', '.partial.json');
      const partial = {
        sessionId: this.sessionId,
        startTime: this.startTime.toISOString(),
        lastUpdate: new Date().toISOString(),
        plays: this.playLogger.getPlays(),
        events: this.playLogger.getEvents(),
      };
      fs.writeFileSync(partialPath, JSON.stringify(partial, null, 2), 'utf-8');
    } catch (error) {
      // Fail silently for partial saves
    }
  }

  /**
   * Start auto-save interval
   */
  startAutoSave(intervalMs = 10000): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }
    this.autoSaveInterval = setInterval(() => {
      this.savePartial();
    }, intervalMs);
  }

  /**
   * Stop auto-save
   */
  stopAutoSave(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
  }

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Get play logger
   */
  getPlayLogger(): PlayLogger {
    return this.playLogger;
  }

  /**
   * Check if recording
   */
  isActive(): boolean {
    return this.isRecording;
  }

  /**
   * Get current play count
   */
  getPlayCount(): number {
    return this.playLogger.getPlays().length;
  }

  /**
   * Get research logger for direct access
   */
  getResearchLogger(): ResearchLogger {
    return this.researchLogger;
  }

  /**
   * Get current research block records (for real-time monitoring)
   */
  getResearchBlockRecords() {
    return this.researchLogger.getBlockRecords();
  }

  /**
   * Get current P1 events detected
   */
  getP1Events() {
    return this.researchLogger.getP1Events();
  }

  /**
   * Get B&S tracking data per pattern
   */
  getPatternBnSTracking() {
    return this.researchLogger.getPatternBnSTracking();
  }
}

// ============================================================================
// SESSION LOADER (For Analysis)
// ============================================================================

/**
 * Load a single session from file
 */
export function loadSession(filePath: string): SessionLog | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as SessionLog;
  } catch (error) {
    console.error(`Failed to load session from ${filePath}:`, error);
    return null;
  }
}

/**
 * Load all sessions from a directory
 */
export function loadAllSessions(sessionsDir = './data/sessions'): SessionLog[] {
  const sessions: SessionLog[] = [];
  const dirPath = path.resolve(sessionsDir);

  if (!fs.existsSync(dirPath)) {
    return sessions;
  }

  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.json') && !f.includes('.partial.'));

  for (const file of files) {
    const session = loadSession(path.join(dirPath, file));
    if (session) {
      sessions.push(session);
    }
  }

  return sessions.sort((a, b) => a.startTime.localeCompare(b.startTime));
}

/**
 * List available session files
 */
export function listSessionFiles(sessionsDir = './data/sessions'): string[] {
  const dirPath = path.resolve(sessionsDir);

  if (!fs.existsSync(dirPath)) {
    return [];
  }

  return fs.readdirSync(dirPath)
    .filter(f => f.endsWith('.json') && !f.includes('.partial.'))
    .map(f => path.join(dirPath, f));
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createSessionRecorder(
  config: EvaluatorConfig,
  sessionsDir?: string,
  logsDir?: string,
  researchConfig?: ResearchConfig
): SessionRecorder {
  return new SessionRecorder(config, sessionsDir, logsDir, researchConfig);
}

/**
 * Load research data from file
 */
export function loadResearchData(filePath: string): ResearchData | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as ResearchData;
  } catch (error) {
    console.error(`Failed to load research data from ${filePath}:`, error);
    return null;
  }
}

/**
 * Load research data for a session by session ID
 */
export function loadResearchDataForSession(sessionId: string, sessionsDir = './data/sessions'): ResearchData | null {
  const researchFilePath = path.join(path.resolve(sessionsDir), `${sessionId}.research.json`);
  return loadResearchData(researchFilePath);
}

/**
 * List all research data files
 */
export function listResearchFiles(sessionsDir = './data/sessions'): string[] {
  const dirPath = path.resolve(sessionsDir);

  if (!fs.existsSync(dirPath)) {
    return [];
  }

  return fs.readdirSync(dirPath)
    .filter(f => f.endsWith('.research.json'))
    .map(f => path.join(dirPath, f));
}
