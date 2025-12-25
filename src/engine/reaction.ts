/**
 * Ghost Evaluator v15.3 - Reaction Engine
 * ========================================
 * Generates predictions and manages auto-betting
 *
 * v15.3 Changes:
 * - Integrated new bucket manager methods for B&S lifecycle
 * - markSwitchStarted() called when B&S pattern plays switch
 * - recordBaitLoss() called for bait failed detection (RRR)
 * - addBlockedAccumulation() called for blocked pattern profit tracking
 */

import {
  Direction,
  PatternName,
  Prediction,
  PendingTrade,
  CompletedTrade,
  Block,
  EvaluatorConfig,
  DEFAULT_CONFIG,
  SessionHealthConfig,
  DEFAULT_SESSION_HEALTH_CONFIG,
  EvaluatedResult,
  HostilityConfig,
  DEFAULT_HOSTILITY_CONFIG,
  ProfitTracking,
  ProfitDeltas,
  BspTradeSimulation,
  SessionProfitState,
  ZZStrategyState,
  OPPOSITE_PATTERNS,
  PauseConfig,
  DEFAULT_PAUSE_CONFIG,
  PauseState,
} from '../types';
import { PauseManager } from './pause-manager';
import { ActualSimLedger } from './actual-sim-ledger';
import { BlockStateSnapshotManager, SnapshotComponents } from './block-state-snapshot';
import { BaitSwitchDetector } from './bait-switch-detector';
import { GameStateEngine } from './state';
import { SessionHealthManager, createSessionHealthManager } from './session-health';
import { RecoveryManager, createRecoveryManager } from './recovery';
import { HostilityManager, createHostilityManager } from './hostility';
import {
  BucketManager,
  createBucketManager,
  BucketConfig,
  DEFAULT_BUCKET_CONFIG,
} from './bucket-manager';
import { ZZStateManager, createZZStateManager } from './zz-state-manager';
import { HierarchyManager, createHierarchyManager } from './hierarchy-manager';
import {
  SameDirectionManager,
  createSameDirectionManager,
  SameDirectionState,
} from './same-direction';

// ============================================================================
// CONFIDENCE CALCULATION
// ============================================================================

/**
 * Calculate confidence for a prediction
 * Base: 60%, +10% for AP5/OZ, +20% if profit > 150%
 */
function calculateConfidence(pattern: PatternName, profit: number): number {
  let conf = 60;

  if (pattern === 'AP5' || pattern === 'OZ') {
    conf += 10;
  }

  if (profit > 150) {
    conf += 20;
  }

  return Math.min(95, conf);
}

// ============================================================================
// REACTION ENGINE
// ============================================================================

export class ReactionEngine {
  private config: EvaluatorConfig;
  private healthConfig: SessionHealthConfig;
  private hostilityConfig: HostilityConfig;
  private bucketConfig: BucketConfig;
  private gameState: GameStateEngine;
  private pendingTrade: PendingTrade | null = null;
  private completedTrades: CompletedTrade[] = [];
  private pnlTotal = 0;
  private dailyTargetReached = false;
  private consecutiveLosses = 0;
  // REMOVED: cooldownRemaining - legacy hold removed, hierarchy manager controls betting

  // === PER-SYSTEM TRACKING (for independent pause management) ===
  private bucketConsecutiveLosses = 0;
  private samedirConsecutiveLosses = 0;
  private bucketTotalPnl = 0;
  private samedirTotalPnl = 0;

  // Session health, recovery, and hostility managers
  private healthManager: SessionHealthManager;
  private recoveryManager: RecoveryManager;
  private hostilityManager: HostilityManager;
  private sessionStopped = false;
  private sessionStopReason = '';

  // 3-Bucket system manager (MAIN/WAITING/BNS)
  private bucketManager: BucketManager;

  // ZZ Strategy state manager (corrected implementation)
  private zzStateManager: ZZStateManager;

  // Hierarchy Manager - controls which system places bets
  private hierarchyManager: HierarchyManager;

  // Same Direction Manager - run-based profit regime system
  private sameDirectionManager: SameDirectionManager;

  // === PROFIT/LOSS MANAGEMENT SYSTEM ===
  // Pause Manager - controls when trading pauses
  private pauseManager: PauseManager;
  private pauseConfig: PauseConfig;

  // Dual Ledger - tracks actual vs simulated trades
  private actualSimLedger: ActualSimLedger;

  // Block State Snapshot Manager - for undo system
  private snapshotManager: BlockStateSnapshotManager;

  // Bait-and-Switch Detector - episode-based classification
  private baitSwitchDetector: BaitSwitchDetector;

  // Three-column profit tracking (AP, AAP, BSP)
  private profitTracking: SessionProfitState = {
    totals: {
      actualProfit: 0,              // AP: Real profit from trades
      activationAccumulatedProfit: 0, // AAP: Sum of pattern cumulative profits
      baitSwitchProfit: 0,          // BSP: Reverse-direction profit during locked periods
    },
    history: [],
    bspSimulations: [],
  };

  constructor(
    gameState: GameStateEngine,
    config?: Partial<EvaluatorConfig>,
    healthConfig?: Partial<SessionHealthConfig>,
    hostilityConfig?: Partial<HostilityConfig>,
    bucketConfig?: Partial<BucketConfig>,
    pauseConfig?: Partial<PauseConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.healthConfig = { ...DEFAULT_SESSION_HEALTH_CONFIG, ...healthConfig };
    this.hostilityConfig = { ...DEFAULT_HOSTILITY_CONFIG, ...hostilityConfig };
    this.bucketConfig = { ...DEFAULT_BUCKET_CONFIG, ...bucketConfig };
    this.pauseConfig = { ...DEFAULT_PAUSE_CONFIG, ...pauseConfig };
    this.gameState = gameState;

    // Initialize health, recovery, and hostility managers
    this.healthManager = createSessionHealthManager(this.healthConfig);
    this.recoveryManager = createRecoveryManager(this.healthConfig);
    this.hostilityManager = createHostilityManager(this.hostilityConfig);

    // Initialize 3-Bucket system
    this.bucketManager = createBucketManager(this.bucketConfig);

    // Initialize ZZ Strategy state manager (corrected implementation)
    this.zzStateManager = createZZStateManager();

    // Initialize Hierarchy Manager
    this.hierarchyManager = createHierarchyManager();

    // Initialize Same Direction Manager
    this.sameDirectionManager = createSameDirectionManager();

    // Initialize Profit/Loss Management System
    this.pauseManager = new PauseManager(this.pauseConfig);
    this.actualSimLedger = new ActualSimLedger();
    this.snapshotManager = new BlockStateSnapshotManager(100); // Keep last 100 blocks
    this.baitSwitchDetector = new BaitSwitchDetector();
  }

  /**
   * Generate prediction for next block
   */
  predictNext(): Prediction {
    // Check if daily target reached
    if (this.dailyTargetReached) {
      return {
        hasPrediction: false,
        reason: 'DONE FOR THE DAY',
      };
    }

    // === PAUSE MANAGEMENT ===
    // STOP_GAME: Affects everything (Pocket + SameDir)
    // MAJOR_PAUSE (10 blocks): Affects BOTH SameDir AND Pocket system
    // MINOR_PAUSE (3 blocks): Only affects SameDir, NOT Pocket
    if (this.pauseManager.isGameStopped()) {
      return {
        hasPrediction: false,
        reason: `GAME STOPPED — ${this.pauseManager.getSummary()}`,
      };
    }

    // Check if session is locked by hostility manager
    const isLocked = this.hostilityManager.isLocked();

    if (isLocked) {
      // Check if we have any playable patterns (MAIN or BNS bucket)
      const mainPatterns = this.bucketManager.getPatternsInBucket('MAIN');
      const bnsPatterns = this.bucketManager.getPatternsInBucket('BNS');
      const hasPlayablePatterns = mainPatterns.length > 0 || bnsPatterns.length > 0;

      if (!hasPlayablePatterns) {
        // No playable patterns - stay locked
        return {
          hasPrediction: false,
          reason: `LOCKED — ${this.hostilityManager.getStatusMessage()}`,
        };
      }

      // Has playable patterns - continue to selection (allow Bucket 1 & 3 plays)
      console.log(`[Prediction] Locked but has playable patterns (M:${mainPatterns.length} B:${bnsPatterns.length}) - continuing`);
    }

    // Check if session is stopped due to hard limits (drawdown abort)
    if (this.sessionStopped) {
      // Check if aborted (no recovery possible)
      if (this.healthManager.isAborted()) {
        return {
          hasPrediction: false,
          reason: `SESSION ABORTED — ${this.sessionStopReason}`,
        };
      }

      // Check if in recovery mode (legacy - kept for compatibility)
      if (this.recoveryManager.isInRecoveryMode()) {
        return {
          hasPrediction: false,
          reason: `RECOVERY MODE — ${this.recoveryManager.getStatusMessage()}`,
        };
      }

      // If stopped but not in recovery, enter recovery mode
      this.recoveryManager.enterRecoveryMode(this.gameState.getBlockCount());
      return {
        hasPrediction: false,
        reason: `ENTERING RECOVERY — ${this.sessionStopReason}`,
      };
    }

    // Check if in re-entry mode
    if (this.recoveryManager.isInReentryMode()) {
      // Allow trading but at reduced stake - let the prediction through
      // The modified prediction will indicate re-entry mode
    }

    // Show bucket status in prediction
    const bucketSummary = this.bucketManager.getBucketSummary();
    const bucketStatus = `[M:${bucketSummary.stats.mainCount} W:${bucketSummary.stats.waitingCount} B:${bucketSummary.stats.bnsCount}]`;

    // REMOVED: Cooldown check - legacy hold removed, hierarchy manager controls betting
    // REMOVED: P1 mode check - legacy hold removed, Same Direction System handles long runs

    const lifecycle = this.gameState.getLifecycle();
    const pendingSignals = this.gameState.getPendingSignals();

    // === ZZ STRATEGY SPECIAL HANDLING ===
    // RULE: ZZ NEVER goes to bait-and-switch. It ignores B&S entirely.
    // ZZ always bets freely without any hostility/B&S blocking.
    this.zzStateManager.setBaitSwitchMode(false); // Always false - ZZ is never blocked

    // === ZZ/AntiZZ CONTINUOUS BETTING CHECK (POCKET SYSTEM) ===
    // ZZ/AntiZZ signals are generated by ZZStateManager, not detector.
    // PAUSE RULES: Pocket (ZZ/AntiZZ) is ONLY affected by STOP_GAME
    const zzPrediction = this.generateZZPrediction(lifecycle, bucketStatus);
    if (zzPrediction && zzPrediction.pattern) {
      if (this.pauseManager.canPocketTrade()) {
        return zzPrediction;
      } else {
        console.log(`[Prediction] ${zzPrediction.pattern} BLOCKED by STOP_GAME`);
        // Fall through - no prediction from Pocket
      }
    }

    // === SAME DIRECTION SYSTEM CHECK ===
    // Priority 2: Same Direction bets continuation when active and not paused
    // SameDir has internal pause (market conditions) and external pause (drawdown)
    if (this.sameDirectionManager.canBet()) {
      // Check external pause (drawdown-based via PauseManager)
      if (!this.pauseManager.canSamedirTrade()) {
        console.log(`[Prediction] SameDir BLOCKED by external pause: ${this.pauseManager.getSummary()}`);
        // Fall through to check if any other pattern can trade
      } else {
        const blocks = this.gameState.getBlocks();
        const previousBlock = blocks.length > 0 ? blocks[blocks.length - 1] : null;
        const sdDirection = this.sameDirectionManager.getBetDirection(previousBlock);

        if (sdDirection !== null) {
          // === REVERSAL PATTERN CHECK ===
          // Skip SameDir if a strong reversal pattern is in MAIN
          // XAX patterns (2A2-6A6): trigger at run length 2-6, predict reversal
          // OZ: triggers at run length 1, predicts flip back (reversal)
          // PP: triggers at run length 1 after double, predicts flip back (reversal)
          const runData = this.gameState.getRunData();
          const currentRunLength = runData.currentLength;
          const previousRunLength = runData.lengths.length >= 2
            ? runData.lengths[runData.lengths.length - 2]
            : 0;

          const conflictingPattern = this.getConflictingReversalPattern(currentRunLength, previousRunLength);

          if (conflictingPattern) {
            const patternBucket = this.bucketManager.getBucket(conflictingPattern);
            if (patternBucket === 'MAIN') {
              console.log(`[Prediction] SameDir SKIPPED: ${conflictingPattern} is in MAIN (run length ${currentRunLength})`);
              // Don't return - fall through to bucket system
            } else {
              const accLoss = this.sameDirectionManager.getAccumulatedLoss();
              return {
                hasPrediction: true,
                direction: sdDirection,
                // SameDir is a pseudo-pattern, not in PATTERN_NAMES - cast to avoid type errors
                pattern: 'SameDir' as unknown as PatternName,
                confidence: 75,
                reason: `Same Direction ACTIVE (loss: ${accLoss.toFixed(0)}/140) - betting continuation ${bucketStatus}`,
              };
            }
          } else {
            // No conflicting reversal pattern, proceed with SameDir
            const accLoss = this.sameDirectionManager.getAccumulatedLoss();
            return {
              hasPrediction: true,
              direction: sdDirection,
              // SameDir is a pseudo-pattern, not in PATTERN_NAMES - cast to avoid type errors
              pattern: 'SameDir' as unknown as PatternName,
              confidence: 75,
              reason: `Same Direction ACTIVE (loss: ${accLoss.toFixed(0)}/140) - betting continuation ${bucketStatus}`,
            };
          }
        }
      }
    }

    // Sort patterns by cumulative profit (highest first)
    const sortedPatterns = lifecycle.getAllPatternsByProfit();

    for (const pattern of sortedPatterns) {
      // Skip ZZ/AntiZZ - handled above (Pocket system)
      if (pattern === 'ZZ' || pattern === 'AntiZZ') {
        continue;
      }

      // === BUCKET SYSTEM PAUSE CHECK ===
      // Bucket has its own independent pause tracking
      if (!this.pauseManager.canBucketTrade()) {
        continue; // Bucket pattern blocked by its own pause
      }

      // Check for pending signals first
      const signals = pendingSignals.filter(s => s.pattern === pattern);
      if (signals.length === 0) continue;

      const signal = signals[0];

      // === 3-BUCKET SYSTEM CHECK (for non-ZZ patterns) ===
      const bucket = this.bucketManager.getBucket(pattern);

      // Debug: Log bucket check for patterns with signals
      console.log(`[Prediction] Pattern ${pattern} has signal, bucket=${bucket}`);

      // Check if blocked by opposite pattern's B&S
      if (this.bucketManager.isBlockedByOpposite(pattern)) {
        console.log(`[Prediction] ${pattern} blocked by opposite B&S - skipping`);
        continue;
      }

      // WAITING bucket = no play (pattern not activated or broke with profit)
      if (bucket === 'WAITING') {
        continue;
      }

      // B&S bucket: Pattern must be ACTIVE in lifecycle (bait must be confirmed)
      // A B&S pattern in "observing" state means it's waiting for the bait (70%+ observation)
      // Only after re-activation (bait confirmed) can we play inverse
      if (bucket === 'BNS') {
        const isActive = lifecycle.isActive(pattern);
        if (!isActive) {
          console.log(`[Prediction] B&S pattern ${pattern} waiting for bait (not active yet)`);
          continue;
        }
        console.log(`[Prediction] B&S pattern ${pattern} BAIT CONFIRMED (active) - playing inverse`);
      }

      // NOTE: Opposite patterns can both be active at the same time
      // e.g., 2A2 in B&S and Anti2A2 in MAIN can both generate predictions
      // They are independent strategies - B&S waits for bait, MAIN works normally

      // Get the play direction based on bucket
      const mainDirection = signal.expectedDirection;
      let playDirection: Direction;

      if (bucket === 'MAIN') {
        // MAIN bucket = play the pattern's predicted direction
        playDirection = mainDirection;
      } else {
        // BNS bucket = play the INVERSE of pattern's predicted direction
        playDirection = (mainDirection * -1) as Direction;
      }

      const profit = lifecycle.getCumulativeProfit(pattern);
      const confidence = calculateConfidence(pattern, profit);

      // Determine bucket label for display
      const isInverse = bucket === 'BNS';
      const directionLabel = playDirection > 0 ? 'Up' : 'Down';
      const bucketLabel = isInverse ? '[B&S]' : '[MAIN]';

      // IMPORTANT: Mark the signal as inverse so lifecycle evaluates it correctly
      // When B&S inverse wins, we need the profit to be positive, not negative
      if (isInverse) {
        signal.isBnsInverse = true;
        // Mark switch as started for bucket manager tracking
        this.bucketManager.markSwitchStarted(pattern);
      }

      let prediction: Prediction = {
        hasPrediction: true,
        direction: playDirection,
        confidence,
        pattern,
        reason: `${pattern} ${bucketLabel} → ${directionLabel} (Cum: ${profit.toFixed(0)}%) ${bucketStatus}`,
      };

      // Modify prediction if in re-entry mode
      const modified = this.recoveryManager.modifyPrediction(prediction);
      return modified ?? prediction;
    }

    return {
      hasPrediction: false,
      reason: `HOLD — no pattern ready ${bucketStatus}`,
    };
  }

  /**
   * Open a trade based on prediction
   */
  openTrade(prediction: Prediction): PendingTrade | null {
    if (!prediction.hasPrediction) return null;
    if (this.pendingTrade) return null; // Already have pending trade

    const blockCount = this.gameState.getBlockCount();

    this.pendingTrade = {
      openIndex: blockCount - 1,
      evalIndex: blockCount,
      direction: prediction.direction!,
      confidence: prediction.confidence!,
      pattern: prediction.pattern!,
      reason: prediction.reason,
      ts: new Date().toISOString(),
    };

    return { ...this.pendingTrade };
  }

  /**
   * Evaluate pending trade against new block
   */
  evaluateTrade(block: Block): CompletedTrade | null {
    if (!this.pendingTrade) return null;
    if (block.index !== this.pendingTrade.evalIndex) return null;

    const isWin = block.dir === this.pendingTrade.direction;

    // Apply stake multiplier for re-entry mode
    const stakeMultiplier = this.recoveryManager.getStakeMultiplier();
    const adjustedBetAmount = this.config.betAmount * stakeMultiplier;
    const pnl = (isWin ? 1 : -1) * adjustedBetAmount * (block.pct / 100);

    this.pnlTotal += pnl;

    const trade: CompletedTrade = {
      id: this.completedTrades.length + 1,
      openIndex: this.pendingTrade.openIndex,
      evalIndex: block.index,
      pattern: this.pendingTrade.pattern,
      predictedDirection: this.pendingTrade.direction,
      actualDirection: block.dir,
      confidence: this.pendingTrade.confidence,
      pct: block.pct,
      isWin,
      pnl,
      reason: this.pendingTrade.reason,
      ts: new Date().toISOString(),
    };

    this.completedTrades.push(trade);
    this.pendingTrade = null;

    // === TRACK ZZ/XAX RESULT FOR SD PAUSE/RESUME ===
    // Update SameDirectionManager with ZZ/XAX trade results
    // This is used to detect ZZ/XAX breaks for resume triggers
    this.sameDirectionManager.recordZZXAXResult(trade.pattern, isWin, trade.evalIndex);

    // === SD RESUME CHECK (Phase 3) ===
    // Check if SD should resume after ZZ/XAX break
    // Resume takes effect on NEXT trade (this just changes state)
    if (this.sameDirectionManager.checkResumeCondition(block.index)) {
      console.log(`[Reaction] SD resumed after ZZ/XAX break at block ${block.index}`);
    }

    // Update session health with trade result (for drawdown tracking)
    this.healthManager.updateAfterTrade(trade);

    // === RECORD TO ACTUAL LEDGER ===
    this.actualSimLedger.recordActualTrade({
      blockIndex: block.index,
      pattern: trade.pattern,
      pnl: trade.pnl,
      timestamp: Date.now(),
      isWin: trade.isWin,
      predictedDirection: trade.predictedDirection,
      actualDirection: trade.actualDirection,
    });

    // === CHECK PAUSE TRIGGERS ===
    const pauseTriggerData = this.healthManager.getPauseTriggerData(
      block.index,
      this.actualSimLedger.getActualPnl()
    );
    const newPause = this.pauseManager.checkAndTriggerPause(pauseTriggerData);
    if (newPause) {
      console.log(`[Reaction] Pause triggered: ${newPause.type} - ${newPause.reason}`);
      // Reset consecutive losses after minor pause is triggered
      if (newPause.type === 'MINOR_PAUSE_3_BLOCKS') {
        this.healthManager.resetConsecutiveLosses();
      }
    }

    // Update hostility manager with trade result (legacy)
    this.hostilityManager.processTradeResult(trade);

    // Update bucket manager with trade result for consecutive win tracking
    // This is used to determine when B&S should break (2+ consecutive opposite wins)
    const tradeProfit = isWin ? block.pct : -block.pct;
    this.bucketManager.recordTradeResult(
      trade.pattern,
      isWin,
      tradeProfit,
      block.index
    );

    // If this was a B&S inverse trade, mark switch completed
    const tradeBucket = this.bucketManager.getBucket(trade.pattern);
    if (tradeBucket === 'BNS') {
      this.bucketManager.markSwitchCompleted(trade.pattern, isWin, tradeProfit, block.index);
    }

    // Record trial trade if in re-entry mode
    if (this.recoveryManager.isInReentryMode()) {
      this.recoveryManager.recordTrialTrade(isWin);

      // Check if re-entry failed and we need to go back to recovery
      if (!this.recoveryManager.isInReentryMode() && !this.recoveryManager.isInRecoveryMode()) {
        // Re-entry completed successfully, resume normal trading
        this.sessionStopped = false;
        this.sessionStopReason = '';
      } else if (this.recoveryManager.isInRecoveryMode()) {
        // Re-entry failed, back in recovery mode
        this.sessionStopped = true;
        this.sessionStopReason = 'Re-entry trial failed';
      }
    }

    // REMOVED: Cooldown trigger after consecutive losses
    // Legacy hold removed - hierarchy manager controls betting now
    // Track consecutive losses for statistics only
    if (isWin) {
      this.consecutiveLosses = 0;
    } else {
      this.consecutiveLosses++;
    }

    // === PER-SYSTEM PAUSE TRACKING ===
    // Identify which system made this trade and update its stats
    // Pocket (ZZ/AntiZZ) is ONLY affected by STOP_GAME - no MINOR/MAJOR pause
    const tradingSystem = this.getTradeSystem(trade.pattern);

    if (tradingSystem === 'BUCKET') {
      // Update Bucket system stats
      this.bucketTotalPnl += tradeProfit;
      if (isWin) {
        this.bucketConsecutiveLosses = 0;
      } else {
        this.bucketConsecutiveLosses++;
      }

      // Check for Bucket system pause
      const bucketPause = this.pauseManager.checkSystemPause('BUCKET', {
        consecutiveLosses: this.bucketConsecutiveLosses,
        totalPnl: this.bucketTotalPnl,
        currentBlock: block.index,
      });
      if (bucketPause) {
        console.log(`[Reaction] Bucket pause triggered: ${bucketPause.type} - ${bucketPause.reason}`);
        // Reset consecutive losses after pause triggers
        this.bucketConsecutiveLosses = 0;
      }
    } else if (tradingSystem === 'SAMEDIR') {
      // Update SameDir system stats
      this.samedirTotalPnl += tradeProfit;
      if (isWin) {
        this.samedirConsecutiveLosses = 0;
      } else {
        this.samedirConsecutiveLosses++;
      }

      // Check for SameDir system pause (external - drawdown based)
      const samedirPause = this.pauseManager.checkSystemPause('SAMEDIR', {
        consecutiveLosses: this.samedirConsecutiveLosses,
        totalPnl: this.samedirTotalPnl,
        currentBlock: block.index,
      });
      if (samedirPause) {
        console.log(`[Reaction] SameDir pause triggered: ${samedirPause.type} - ${samedirPause.reason}`);
        // Reset consecutive losses after pause triggers
        this.samedirConsecutiveLosses = 0;
      }

      // === SD INTERNAL PAUSE LOGIC (Phase 2) ===
      // Check for market-condition based pause (HIGH_PCT reversal + loss, consecutive losses)
      const blocks = this.gameState.getBlocks();
      const prevBlock = trade.evalIndex > 0 ? blocks[trade.evalIndex - 1] : null;
      const isReversal = prevBlock !== null && prevBlock !== undefined && block.dir !== prevBlock.dir;

      const pauseResult = this.sameDirectionManager.recordSDTradeResult(
        isWin,
        block.pct,
        block.index,
        isReversal
      );

      if (pauseResult.didPause) {
        console.log(`[Reaction] SD internal pause: ${pauseResult.reason}`);
      }
    }
    // Note: Pocket (ZZ/AntiZZ) does NOT trigger MINOR_PAUSE or MAJOR_PAUSE

    // Check if session should stop based on health (ONLY for hard abort limits)
    this.checkSessionHealth();

    // Check daily target
    if (this.pnlTotal >= this.config.dailyTarget) {
      this.dailyTargetReached = true;
    }

    // === ZZ/AntiZZ RESULT RECORDING ===
    // When a ZZ or AntiZZ trade closes, record the result to update state machine
    // This is critical for ZZ to know when to stop betting (after loss)
    if (trade.pattern === 'ZZ' || trade.pattern === 'AntiZZ') {
      const zzResult: EvaluatedResult = {
        pattern: trade.pattern,
        signalIndex: trade.openIndex,
        evalIndex: trade.evalIndex,
        expectedDirection: trade.predictedDirection,
        actualDirection: trade.actualDirection,
        pct: trade.pct,
        runLength: this.gameState.getRunData().currentLength,
        verdict: isWin ? 'fair' : 'fake',
        profit: isWin ? trade.pct : -trade.pct,
        wasBet: true,
        ts: trade.ts,
      };

      if (trade.pattern === 'ZZ') {
        const zzOutcome = this.zzStateManager.recordZZResult(zzResult, trade.evalIndex);
        console.log(`[Reaction] ZZ trade result recorded: ${isWin ? 'WIN' : 'LOSS'}, action: ${zzOutcome.action}`);

        // RULE: If ZZ wins, clear Same Direction accumulated loss
        // Losses during ZZ's active period don't count against Same Direction
        if (isWin) {
          this.sameDirectionManager.clearAccumulatedLoss();
        }

        if (zzOutcome.action === 'first_bet_negative') {
          // First bet negative → AntiZZ becomes candidate
          console.log(`[Reaction] ZZ first bet negative → AntiZZ is candidate for next indicator`);
        } else if (zzOutcome.action === 'run_ends') {
          // Run ended
          console.log(`[Reaction] ZZ run ended → waiting for next indicator`);
        }
      } else if (trade.pattern === 'AntiZZ') {
        this.zzStateManager.recordAntiZZResult(zzResult, trade.evalIndex);
        console.log(`[Reaction] AntiZZ trade result recorded: ${isWin ? 'WIN' : 'LOSS'}`);

        // RULE: If AntiZZ wins, clear Same Direction accumulated loss
        // Losses during AntiZZ's active period don't count against Same Direction
        if (isWin) {
          this.sameDirectionManager.clearAccumulatedLoss();
        }

        console.log(`[Reaction] AntiZZ deactivated → waiting for next indicator`);
      }
    }

    return trade;
  }

  /**
   * Get the opposite pattern for a given pattern
   */
  private getOppositePattern(pattern: PatternName): PatternName | null {
    return OPPOSITE_PATTERNS[pattern] ?? null;
  }

  /**
   * Get the trading system for a given pattern.
   * Used to determine which system's pause tracking to update.
   *
   * @param pattern - The pattern name
   * @returns 'POCKET' for ZZ/AntiZZ, 'SAMEDIR' for SameDir, 'BUCKET' for all others
   */
  private getTradeSystem(pattern: PatternName | string): 'POCKET' | 'BUCKET' | 'SAMEDIR' {
    if (pattern === 'ZZ' || pattern === 'AntiZZ') {
      return 'POCKET';
    }
    if (pattern === 'SameDir') {
      return 'SAMEDIR';
    }
    return 'BUCKET';
  }

  /**
   * Get a conflicting reversal pattern for the current run state.
   * These patterns predict REVERSAL (opposite of SameDir's continuation).
   *
   * Patterns checked:
   * - XAX (2A2-6A6): triggers at run length 2-6, predicts reversal
   * - OZ: triggers at run length 1, predicts flip back (reversal)
   * - PP: triggers at run length 1 after double (prevLen=2), predicts flip back (reversal)
   *
   * NOT included (they predict continuation like SameDir):
   * - ST: triggers at run length 1 after double, but predicts continuation
   * - AP5: triggers at run length 1 after 3+, but predicts continuation
   *
   * @param currentRunLength - Current run length
   * @param previousRunLength - Previous run length (for PP check)
   * @returns The conflicting pattern name, or null if none
   */
  private getConflictingReversalPattern(currentRunLength: number, previousRunLength: number): PatternName | null {
    // XAX patterns trigger at specific run lengths
    switch (currentRunLength) {
      case 2: return '2A2';
      case 3: return '3A3';
      case 4: return '4A4';
      case 5: return '5A5';
      case 6: return '6A6';
      case 1:
        // At run length 1, check OZ and PP
        // PP triggers after double (previousRunLength = 2)
        if (previousRunLength === 2) {
          return 'PP';
        }
        // OZ triggers at single (any previous run length when OZ is active)
        // Check OZ as fallback for run length 1
        return 'OZ';
      default:
        return null;
    }
  }

  /**
   * Check session health and trigger stop/recovery if needed
   * NOTE: This now only checks for HARD ABORT (drawdown limit)
   * Regular loss handling is done by HostilityManager
   */
  private checkSessionHealth(): void {
    if (this.sessionStopped) return; // Already stopped

    // Only stop for hard abort (drawdown limit exceeded)
    if (this.healthManager.isAborted()) {
      this.sessionStopped = true;
      this.sessionStopReason = this.healthManager.getStopReason();
      console.log(`[ReactionEngine] Session ABORTED: ${this.sessionStopReason}`);
    }
  }

  /**
   * Process bait & switch detection and update hostility
   */
  private processBaitSwitchDetection(): void {
    const divergences = this.healthManager.getAllPatternDivergences();
    const baitingPatterns: PatternName[] = [];

    for (const divergence of divergences) {
      if (divergence.isBaiting) {
        baitingPatterns.push(divergence.pattern);
        this.hostilityManager.logBaitSwitch(
          this.gameState.getBlockCount(),
          divergence
        );
        this.hostilityManager.updatePatternBaitSwitch(divergence);
      }
    }

    // Check for multi-pattern bait (conclusive hostility)
    if (baitingPatterns.length >= 2) {
      this.hostilityManager.logMultiPatternBait(
        this.gameState.getBlockCount(),
        baitingPatterns
      );
    }
  }

  /**
   * Process pattern run completion and update hostility
   */
  private processPatternRunCompletion(pattern: PatternName, netProfit: number): void {
    if (netProfit < 0) {
      this.hostilityManager.logPatternRunNegative(
        this.gameState.getBlockCount(),
        pattern,
        netProfit
      );
    } else if (netProfit > 0) {
      // Profitable run - clear this pattern's indicators
      this.hostilityManager.clearPatternIndicators(pattern);
    }
  }

  /**
   * Process a new block (detect, evaluate, predict, trade)
   * @param dir - Block direction (1 = up, -1 = down)
   * @param pct - Block percentage
   * @param skipTrades - If true, don't open/evaluate trades (preload mode)
   */
  processBlock(dir: Direction, pct: number, skipTrades = false): {
    blockResult: ReturnType<GameStateEngine['addBlock']>;
    prediction: Prediction;
    closedTrade: CompletedTrade | null;
    openedTrade: PendingTrade | null;
    cooldownRemaining: number;
    sessionHealth: ReturnType<SessionHealthManager['getHealth']>;
    recoveryMode: string;
    hostilityState: ReturnType<HostilityManager['getState']>;
    profitTracking: SessionProfitState;
    bucketSummary: ReturnType<BucketManager['getBucketSummary']>;
    zzState: ZZStrategyState;
    sameDirectionState: SameDirectionState;
    pauseState: PauseState | null;
  } {
    // Add block to game state
    // Note: B&S patterns must re-activate through normal lifecycle (observe 70%+) before generating signals
    const blockResult = this.gameState.addBlock(dir, pct);

    // === CAPTURE SNAPSHOT FOR UNDO SYSTEM ===
    this.captureBlockSnapshot(blockResult.block.index);

    // Update health manager with evaluated results
    for (const result of blockResult.evaluatedResults) {
      this.healthManager.updateAfterResult(result);
    }

    // Check for bait & switch and update hostility
    this.processBaitSwitchDetection();

    // Check for pattern run completions (breaks)
    const lifecycle = this.gameState.getLifecycle();

    // === ZZ STRATEGY STATE MANAGEMENT ===
    // Process ZZ-related results for first prediction evaluation and run tracking
    this.processZZResults(blockResult.evaluatedResults, blockResult.block);

    // Check for ZZ pattern detection and activation
    this.checkZZActivation(blockResult.newSignals, blockResult.block.index, lifecycle);

    // === PROCESS BUCKET MANAGER UPDATES ===
    // Track blocked pattern accumulation and bait loss detection BEFORE lifecycle update
    for (const result of blockResult.evaluatedResults) {
      // Skip ZZ/AntiZZ - managed by ZZStateManager
      if (result.pattern === 'ZZ' || result.pattern === 'AntiZZ') continue;

      const bucket = this.bucketManager.getBucket(result.pattern);
      const opposite = this.getOppositePattern(result.pattern);

      // Track accumulation and imaginary wins for blocked patterns
      if (opposite && this.bucketManager.isBlockedByOpposite(result.pattern)) {
        // Pattern is blocked - accumulate its profit for activation check when unblocked
        this.bucketManager.addBlockedAccumulation(result.pattern, result.profit);

        // Record imaginary result - if blocked pattern gets consecutive wins,
        // it kills the opposite's B&S → WAITING
        const isImaginaryWin = result.profit > 0;
        const bnsKilled = this.bucketManager.recordBlockedPatternResult(
          result.pattern,
          isImaginaryWin,
          blockResult.block.index
        );
        if (bnsKilled) {
          console.log(`[Reaction] ${opposite} B&S killed by ${result.pattern} imaginary wins`);
        }
      }

      // Check for bait loss (RRR detection) for patterns in B&S waiting for bait
      if (bucket === 'BNS' && result.profit < 0) {
        const baitFailed = this.bucketManager.recordBaitLoss(
          result.pattern,
          result.profit,
          blockResult.block.index
        );
        if (baitFailed) {
          console.log(`[Reaction] ${result.pattern} bait failed - exited to WAITING`);
        }
      }
    }

    // === UPDATE BUCKET MANAGER FROM LIFECYCLE ===
    // The bucket system reads from lifecycle state - it doesn't track separately
    // Call this AFTER lifecycle has processed all results
    // NOTE: ZZ/AntiZZ are now managed by ZZStateManager, not bucket manager
    this.bucketManager.updateFromLifecycle(lifecycle, blockResult.block.index);

    // === SAME DIRECTION SYSTEM PROCESSING ===
    // Process block through Same Direction system
    // SameDirectionManager.processBlock() internally handles:
    // - Run tracking (adding blocks to current run)
    // - Run break detection (when direction changes)
    // - RunProfit calculation and activation/deactivation
    this.sameDirectionManager.processBlock(blockResult.block);

    // Get run data for B&S kill checks
    const runData = this.gameState.getRunData();
    const isFlip = runData.currentLength === 1 && blockResult.block.index > 0;
    const previousRunLength = runData.lengths.length >= 2
      ? runData.lengths[runData.lengths.length - 2]
      : 0;

    // === OZ B&S KILL CHECK ===
    // Check if OZ should be killed in B&S based on run conditions

    const ozKillCheck = this.bucketManager.checkOZBnsKillConditions(
      runData.currentLength,
      previousRunLength,
      isFlip,
      blockResult.block.index
    );
    if (ozKillCheck?.shouldKill) {
      this.bucketManager.killOZInBns(blockResult.block.index, ozKillCheck.reason);
    }

    // === AP5 B&S KILL CHECK ===
    // Check if AP5 should be killed in B&S based on run conditions
    const ap5KillCheck = this.bucketManager.checkAP5BnsKillConditions(
      runData.currentLength,
      previousRunLength,
      isFlip,
      blockResult.block.index
    );
    if (ap5KillCheck?.shouldKill) {
      this.bucketManager.killAP5InBns(blockResult.block.index, ap5KillCheck.reason);
    }

    // === PP B&S KILL CHECK ===
    // Check if PP should be killed in B&S based on run conditions
    const ppKillCheck = this.bucketManager.checkPPBnsKillConditions(
      runData.currentLength,
      previousRunLength,
      isFlip,
      blockResult.block.index
    );
    if (ppKillCheck?.shouldKill) {
      this.bucketManager.killPPInBns(blockResult.block.index, ppKillCheck.reason);
    }

    // === ST B&S KILL CHECK ===
    // Check if ST should be killed in B&S based on run conditions
    const stKillCheck = this.bucketManager.checkSTBnsKillConditions(
      runData.currentLength,
      previousRunLength,
      isFlip,
      blockResult.block.index
    );
    if (stKillCheck?.shouldKill) {
      this.bucketManager.killSTInBns(blockResult.block.index, stKillCheck.reason);
    }

    for (const result of blockResult.evaluatedResults) {
      // If pattern just broke, check its net profit
      const cycle = lifecycle.getCycle(result.pattern);
      if (cycle && cycle.state === 'observing' && result.wasBet) {
        // Pattern just broke (was active, now observing)
        this.processPatternRunCompletion(result.pattern, cycle.lastRunProfit);
      }

      // NOTE: ZZ/AntiZZ run resolution is handled in processZZResults()
      // via recordZZResult() and recordAntiZZResult() - no duplicate logic needed
    }

    // Track whether we were locked BEFORE processing (for BSP)
    const wasLockedBeforeBlock = this.hostilityManager.isLocked();

    // Handle hostility-based locking (pattern-based recovery)
    if (this.hostilityManager.isLocked()) {
      // Add shadow trades for patterns that would have been traded
      this.addShadowTrades(blockResult.evaluatedResults);

      // Update pattern recovery states with cumulative profit tracking
      for (const result of blockResult.evaluatedResults) {
        if (result.wasBet) {
          const isWin = result.expectedDirection === result.actualDirection;
          this.hostilityManager.updatePatternRecovery(
            result.pattern,
            isWin,
            result.pct, // Pass the percentage for cumulative profit calculation
            result.evalIndex
          );
        }
      }

      // Simulate BSP trades during locked periods
      this.simulateBspTrades(blockResult.evaluatedResults, blockResult.block.index);
    }

    // Handle legacy recovery mode (for hard abort scenarios)
    if (this.recoveryManager.isInRecoveryMode()) {
      this.recoveryManager.updateRecoveryBlock();

      // Add shadow trades for patterns that would have been traded
      this.addShadowTrades(blockResult.evaluatedResults);

      // Check if recovery criteria are met
      if (this.recoveryManager.isRecoveryMet()) {
        this.recoveryManager.exitRecoveryMode();
        // Stay in sessionStopped=true until re-entry completes
      }

      // Check if recovery should abort
      if (this.recoveryManager.shouldAbortRecovery()) {
        console.log('[ReactionEngine] Recovery aborted - max blocks reached');
        // Session is done for the day
        this.dailyTargetReached = true; // Use this to signal session end
      }
    }

    // Evaluate any pending trade (skip in preload mode)
    const closedTrade = skipTrades ? null : this.evaluateTrade(blockResult.block);

    // REMOVED: Cooldown decrement - legacy hold removed

    // Generate new prediction
    const prediction = this.predictNext();

    // Open trade if prediction exists and no pending trade (skip in preload mode)
    const openedTrade = skipTrades ? null : this.openTrade(prediction);

    // Clear any pending trade in preload mode (we don't want stale trades)
    if (skipTrades && this.pendingTrade) {
      this.pendingTrade = null;
    }

    // Update profit tracking (AP, AAP, BSP)
    const actualProfitDelta = closedTrade ? closedTrade.pnl : 0;
    this.updateProfitTracking(blockResult.block.index, actualProfitDelta, wasLockedBeforeBlock);

    // === ADVANCE PAUSE COUNTER ===
    // This decrements the blocks remaining in current pause
    this.pauseManager.advanceBlock();

    return {
      blockResult,
      prediction,
      closedTrade,
      openedTrade,
      cooldownRemaining: 0, // Legacy field - always 0 now
      sessionHealth: this.healthManager.getHealth(),
      recoveryMode: this.recoveryManager.getCurrentMode(),
      hostilityState: this.hostilityManager.getState(),
      profitTracking: this.getProfitTracking(),
      bucketSummary: this.bucketManager.getBucketSummary(),
      zzState: this.zzStateManager.getState(),
      sameDirectionState: this.sameDirectionManager.getState(),
      pauseState: this.pauseManager.getPauseState(),
    };
  }

  // --------------------------------------------------------------------------
  // ZZ PREDICTION GENERATION
  // --------------------------------------------------------------------------

  /**
   * Generate ZZ or AntiZZ prediction using ZZStateManager.
   *
   * This replaces the old detector-based signal generation for ZZ/AntiZZ.
   * ZZ/AntiZZ signals are now generated exclusively by this method,
   * which uses shouldGenerateZZSignal() and shouldGenerateAntiZZSignal()
   * to determine if a bet should be placed.
   *
   * @param lifecycle - The lifecycle manager
   * @param bucketStatus - Status string for display
   * @returns Prediction if ZZ/AntiZZ should bet, null otherwise
   */
  private generateZZPrediction(
    lifecycle: import('../patterns/lifecycle').PatternLifecycleManager,
    bucketStatus: string
  ): Prediction | null {
    // If waiting for first bet evaluation, don't generate prediction yet
    if (this.zzStateManager.isWaitingForFirstBet()) {
      console.log(`[Prediction] ZZ waiting for first bet evaluation - skipping`);
      return null;
    }

    // Check if ZZ should generate a continuous signal
    if (this.zzStateManager.shouldGenerateZZSignal()) {
      const currentDirection = this.gameState.getCurrentRunDirection();
      const zzDirection = this.zzStateManager.getPredictedDirection(currentDirection, 'ZZ');

      if (zzDirection) {
        const profit = lifecycle.getCumulativeProfit('ZZ');
        const confidence = calculateConfidence('ZZ', profit);
        const directionLabel = zzDirection > 0 ? 'Up' : 'Down';
        const pocketLabel = `P${this.zzStateManager.getZZPocket()}`;

        let prediction: Prediction = {
          hasPrediction: true,
          direction: zzDirection,
          confidence,
          pattern: 'ZZ',
          reason: `[ZZ] ${pocketLabel} → ${directionLabel} (Cum: ${profit.toFixed(0)}%) ${bucketStatus}`,
        };

        // Modify prediction if in re-entry mode
        const modified = this.recoveryManager.modifyPrediction(prediction);
        return modified ?? prediction;
      }
    }

    // Check if AntiZZ should generate a signal (one bet per indicator)
    if (this.zzStateManager.shouldGenerateAntiZZSignal()) {
      const currentDirection = this.gameState.getCurrentRunDirection();
      const antiZZDirection = this.zzStateManager.getPredictedDirection(currentDirection, 'AntiZZ');

      if (antiZZDirection) {
        const profit = lifecycle.getCumulativeProfit('AntiZZ');
        const confidence = calculateConfidence('AntiZZ', profit);
        const directionLabel = antiZZDirection > 0 ? 'Up' : 'Down';
        const pocketLabel = `P${this.zzStateManager.getAntiZZPocket()}`;

        let prediction: Prediction = {
          hasPrediction: true,
          direction: antiZZDirection,
          confidence,
          pattern: 'AntiZZ',
          reason: `[Anti-ZZ] ${pocketLabel} → ${directionLabel} (Cum: ${profit.toFixed(0)}%) ${bucketStatus}`,
        };

        // Modify prediction if in re-entry mode
        const modified = this.recoveryManager.modifyPrediction(prediction);
        return modified ?? prediction;
      }
    }

    return null;
  }

  // --------------------------------------------------------------------------
  // ZZ STRATEGY METHODS
  // --------------------------------------------------------------------------

  /**
   * Process ZZ-related results for a block.
   *
   * CORRECT FLOW:
   * 1. Check if waiting for imaginary first bet evaluation (ZZ was in P2)
   * 2. If yes, evaluate imaginary first bet to determine ZZ vs AntiZZ activation
   * 3. If ZZ already active, process results with recordZZResult()
   * 4. If AntiZZ active, process result with recordAntiZZResult()
   *
   * KEY RULES:
   * - ZZ IGNORES bait-and-switch for betting, but CONTINUES STATE TRACKING
   * - ZZ is CONTINUOUS (bets every block until negative result)
   * - AntiZZ bets ONCE then waits for next indicator
   * - First bet negative → AntiZZ activates immediately
   *
   * IMPORTANT: ZZ state tracking (runProfitZZ, pocket transitions) continues
   * even during B&S. Only actual betting is suppressed.
   * See POCKET-SYSTEM-SPEC.md - "ZZ ignores B&S entirely"
   */
  private processZZResults(results: EvaluatedResult[], currentBlock: Block): void {
    // NOTE: We intentionally DO NOT skip during B&S.
    // ZZ state tracking continues during B&S, only betting is suppressed.
    // The shouldGenerateZZSignal() method handles B&S for betting decisions.

    const lifecycle = this.gameState.getLifecycle();
    const blockIndex = currentBlock.index;

    // === IMAGINARY FIRST BET EVALUATION (ZZ was in P2) ===
    // This only runs when ZZ was in P2 and we're waiting for imaginary first bet
    if (this.zzStateManager.isWaitingForFirstBet()) {
      // Evaluate imaginary first bet with actual block direction and percentage
      const evalResult = this.zzStateManager.evaluateImaginaryFirstBet(
        currentBlock.dir,
        currentBlock.pct,
        blockIndex
      );

      if (evalResult.pattern) {
        console.log(`[Reaction] Imaginary first bet: ${evalResult.pattern} activated`);
        console.log(`[Reaction]   imaginaryProfit: ${evalResult.imaginaryProfit.toFixed(0)}%`);

        // Sync with lifecycle
        if (evalResult.pattern === 'AntiZZ') {
          lifecycle.forceActivate('AntiZZ');
          const indicatorDir = this.zzStateManager.getState().savedIndicatorDirection;
          if (indicatorDir) {
            lifecycle.setSavedIndicatorDirection('AntiZZ', indicatorDir);
          }
        } else if (evalResult.pattern === 'ZZ') {
          lifecycle.forceActivate('ZZ');
          const indicatorDir = this.zzStateManager.getState().savedIndicatorDirection;
          if (indicatorDir) {
            lifecycle.setSavedIndicatorDirection('ZZ', indicatorDir);
          }
        }
      } else {
        // Negative imaginary → AntiZZ becomes CANDIDATE (waits for NEXT indicator)
        console.log(`[Reaction] Imaginary first bet NEGATIVE: ${evalResult.imaginaryProfit.toFixed(0)}%`);
        console.log(`[Reaction] AntiZZ is now CANDIDATE - will play on NEXT indicator`);
      }

      // Imaginary first bet evaluation done - return
      return;
    }

    // === PROCESS RESULTS FOR ACTIVE PATTERN ===
    // Only process if ZZ system is active
    if (!this.zzStateManager.isSystemActive()) {
      return;
    }

    for (const result of results) {
      // Only process ZZ/AntiZZ results
      if (result.pattern !== 'ZZ' && result.pattern !== 'AntiZZ') {
        continue;
      }

      // Only process imaginary results (wasBet === false) here.
      // Real bets (wasBet === true) are processed in evaluateTrade() to avoid double recording.
      // This matches how the bucket system handles imaginary vs real results.
      if (result.wasBet) {
        continue;
      }

      // Only record results that match the ACTIVE pattern
      const activePattern = this.zzStateManager.getActivePattern();
      if (result.pattern !== activePattern) {
        continue;
      }

      // === PROCESS ZZ IMAGINARY RESULT ===
      if (activePattern === 'ZZ') {
        console.log(`[Reaction] Processing ZZ imaginary result: ${result.profit.toFixed(0)}%`);
        const zzResult = this.zzStateManager.recordZZResult(result, blockIndex);

        if (zzResult.action === 'first_bet_negative') {
          // First bet negative → AntiZZ becomes candidate
          console.log(`[Reaction] ZZ first bet negative → AntiZZ is candidate for next indicator`);
          // Note: AntiZZ activation happens on NEXT indicator, not immediately
        } else if (zzResult.action === 'run_ends') {
          // Run ended, wait for next indicator
          console.log(`[Reaction] ZZ run ended → waiting for next indicator`);
        }
        // 'continue' → ZZ keeps betting (handled by predictNext)
      }

      // === PROCESS ANTIZZ IMAGINARY RESULT ===
      else if (activePattern === 'AntiZZ') {
        console.log(`[Reaction] Processing AntiZZ imaginary result: ${result.profit.toFixed(0)}%`);
        const antiZZResult = this.zzStateManager.recordAntiZZResult(result, blockIndex);

        // AntiZZ ALWAYS deactivates after one bet - waits for next indicator
        console.log(`[Reaction] AntiZZ imaginary bet complete (${antiZZResult.didWin ? 'WIN' : 'LOSS'}) → waiting for next indicator`);

        // Sync with lifecycle
        if (!antiZZResult.didWin) {
          // AntiZZ lost → SWAP: ZZ activates immediately
          console.log(`[Reaction] AntiZZ lost → SWAP: ZZ activates immediately`);
        }
      }
    }
  }

  /**
   * Check for ZZ indicator detection and handle activation.
   *
   * CORRECT FLOW (based on pocket):
   * - ZZ in P1 → ZZ bets IMMEDIATELY (no waiting)
   * - ZZ in P2 → Wait for imaginary first bet evaluation
   *
   * handleIndicator() does the right thing based on pocket.
   *
   * NOTE: ZZ indicator detection is done directly here using detectZZIndicator(),
   * NOT from the detector's signals array (since ZZ/AntiZZ are skipped in detectAll).
   */
  private checkZZActivation(
    _signals: ReturnType<GameStateEngine['addBlock']>['newSignals'],
    blockIndex: number,
    _lifecycle: ReturnType<GameStateEngine['getLifecycle']>
  ): void {
    // REMOVED: hostilityManager.isLocked() check - ZZ should always be able to activate

    // Already active or waiting - no need to start again
    if (this.zzStateManager.isSystemActive() || this.zzStateManager.isWaitingForFirstBet()) {
      return;
    }

    // Detect ZZ indicator directly (not from signals - ZZ is skipped in detectAll)
    const runData = this.gameState.getRunData();
    const zzIndicator = this.detectZZIndicator(runData, blockIndex);
    if (!zzIndicator) return;

    // Get CURRENT block direction - needed for ZZ prediction (opposite of current)
    const currentBlockDirection = this.gameState.getCurrentRunDirection();

    // Handle indicator - this checks pocket and either:
    // - ZZ in P1 → activates ZZ immediately (bets on next block)
    // - ZZ in P2 → sets up waiting for imaginary first bet evaluation
    // - AntiZZ in P1 → activates AntiZZ immediately
    this.zzStateManager.handleIndicator(blockIndex, currentBlockDirection);

    const lifecycle = this.gameState.getLifecycle();
    const activePattern = this.zzStateManager.getActivePattern();

    // Sync with lifecycle so signals get generated
    if (activePattern === 'ZZ') {
      lifecycle.forceActivate('ZZ');
      lifecycle.setSavedIndicatorDirection('ZZ', currentBlockDirection);
      console.log(`[Reaction] ZZ indicator at block ${blockIndex} - ZZ in P1, betting immediately`);
    } else if (activePattern === 'AntiZZ') {
      lifecycle.forceActivate('AntiZZ');
      lifecycle.setSavedIndicatorDirection('AntiZZ', currentBlockDirection);
      console.log(`[Reaction] ZZ indicator at block ${blockIndex} - AntiZZ in P1, betting immediately`);
    } else if (this.zzStateManager.isWaitingForFirstBet()) {
      console.log(`[Reaction] ZZ indicator at block ${blockIndex} - ZZ in P2, waiting for imaginary first bet`);
    }
  }

  /**
   * Detect ZZ indicator pattern directly.
   *
   * ZZ indicator = run of ≥2 blocks followed by 3+ alternating singles.
   * Example: G G R G R G (2-run indicator, then 1-1-1-1 alternation)
   *
   * This is called directly instead of relying on detector signals,
   * since ZZ/AntiZZ are skipped in detectAll() to avoid conflicts.
   */
  private detectZZIndicator(runData: { lengths: number[]; directions: number[]; currentLength: number; currentDirection: number }, blockIndex: number): boolean {
    // Need at least 4 runs to establish the pattern (indicator + 3 singles)
    if (runData.lengths.length < 4) return false;

    const L1 = runData.lengths[runData.lengths.length - 1]; // Current run

    // Current run must be length 1 (alternation continuing)
    if (L1 !== 1) return false;

    // Find the indicator: scan backwards for a run of ≥2
    // The indicator must be followed by all 1s (alternation)
    for (let i = runData.lengths.length - 2; i >= 0; i--) {
      if (runData.lengths[i] >= 2) {
        // Found potential indicator - check that all runs after it are 1s
        let allOnes = true;
        for (let j = i + 1; j < runData.lengths.length; j++) {
          if (runData.lengths[j] !== 1) {
            allOnes = false;
            break;
          }
        }

        if (allOnes) {
          // Count how many 1s after indicator
          const onesCount = runData.lengths.length - i - 1;
          // Need at least 3 ones (R-G-R) for initial trigger
          if (onesCount >= 3) {
            console.log(`[Reaction] ZZ indicator detected at block ${blockIndex}: indicator run of ${runData.lengths[i]}, followed by ${onesCount} alternating singles`);
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Get ZZ state manager (for external access)
   */
  getZZStateManager(): ZZStateManager {
    return this.zzStateManager;
  }

  /**
   * Get ZZ strategy state (for display)
   */
  getZZState(): ZZStrategyState {
    return this.zzStateManager.getState();
  }

  /**
   * Get ZZ strategy statistics
   */
  getZZStatistics(): ReturnType<ZZStateManager['getStatistics']> {
    return this.zzStateManager.getStatistics();
  }

  /**
   * Add shadow trades during recovery mode
   */
  private addShadowTrades(results: EvaluatedResult[]): void {
    for (const result of results) {
      // Only track results from patterns that would have been active
      if (result.wasBet) {
        this.recoveryManager.addShadowTrade(
          result.evalIndex,
          result.pattern,
          result.expectedDirection,
          result.actualDirection,
          result.pct,
          result.verdict
        );
      }
    }
  }

  /**
   * Simulate BSP (Bait & Switch Profit) trades during locked periods
   * This simulates betting the REVERSE direction of what the pattern predicts
   *
   * Only runs when the session is LOCKED (hostile/unplayable)
   * Does NOT influence strategy - purely for data collection
   */
  private simulateBspTrades(results: EvaluatedResult[], blockIndex: number): void {
    // Only simulate when locked
    if (!this.hostilityManager.isLocked()) {
      return;
    }

    let blockBspDelta = 0;

    for (const result of results) {
      // Only simulate for patterns that would have been active (had a bet)
      if (!result.wasBet) {
        continue;
      }

      // Calculate reverse direction
      const reverseDirection: Direction = (result.expectedDirection * -1) as Direction;

      // Check if reverse would have won
      const reverseWouldWin = result.actualDirection === reverseDirection;

      // Calculate profit from reverse bet
      const profit = reverseWouldWin ? +result.pct : -result.pct;

      // Create BSP simulation record
      const simulation: BspTradeSimulation = {
        blockIndex,
        pattern: result.pattern,
        originalDirection: result.expectedDirection,
        reverseDirection,
        actualDirection: result.actualDirection,
        reverseWouldWin,
        pct: result.pct,
        profit,
        ts: new Date().toISOString(),
      };

      // Add to simulations
      this.profitTracking.bspSimulations.push(simulation);

      // Accumulate block BSP delta
      blockBspDelta += profit;
    }

    // Update BSP total
    if (blockBspDelta !== 0) {
      this.profitTracking.totals.baitSwitchProfit += blockBspDelta;
      console.log(`[BSP] Simulated reverse trades: delta=${blockBspDelta.toFixed(0)}%, total=${this.profitTracking.totals.baitSwitchProfit.toFixed(0)}%`);
    }
  }

  /**
   * Calculate AAP (Accumulated Activation Profit) from all patterns
   * This is the sum of cumulative profits that drive pattern activation
   */
  private calculateAap(): number {
    const lifecycle = this.gameState.getLifecycle();
    const stats = lifecycle.getStatistics();

    // Sum all positive cumulative profits (negative don't count for activation)
    let aap = 0;
    for (const stat of stats) {
      if (stat.cumulativeProfit > 0) {
        aap += stat.cumulativeProfit;
      }
    }

    return aap;
  }

  /**
   * Update profit tracking after a block is processed
   */
  private updateProfitTracking(
    blockIndex: number,
    actualProfitDelta: number,
    wasLocked: boolean
  ): void {
    // Update AP (Actual Profit) - already tracked in pnlTotal
    // We use pnlTotal as the source of truth for AP
    this.profitTracking.totals.actualProfit = this.pnlTotal;

    // Update AAP (Accumulated Activation Profit)
    this.profitTracking.totals.activationAccumulatedProfit = this.calculateAap();

    // BSP is updated in simulateBspTrades() during locked periods

    // Calculate deltas for history
    const prevHistory = this.profitTracking.history.length > 0
      ? this.profitTracking.history[this.profitTracking.history.length - 1]
      : null;

    // Add to history
    const historyEntry: ProfitDeltas = {
      blockIndex,
      actualProfitDelta,
      activationProfitDelta: this.profitTracking.totals.activationAccumulatedProfit - (prevHistory
        ? this.profitTracking.history.reduce((sum, h) => sum + h.activationProfitDelta, 0)
        : 0),
      baitSwitchProfitDelta: wasLocked
        ? (this.profitTracking.bspSimulations
            .filter(s => s.blockIndex === blockIndex)
            .reduce((sum, s) => sum + s.profit, 0))
        : 0,
      ts: new Date().toISOString(),
    };

    this.profitTracking.history.push(historyEntry);
  }

  /**
   * Get pending trade
   */
  getPendingTrade(): PendingTrade | null {
    return this.pendingTrade ? { ...this.pendingTrade } : null;
  }

  /**
   * Get completed trades
   */
  getCompletedTrades(): CompletedTrade[] {
    return [...this.completedTrades];
  }

  /**
   * Get total P/L
   */
  getPnlTotal(): number {
    return this.pnlTotal;
  }

  /**
   * Check if daily target reached
   */
  isDailyTargetReached(): boolean {
    return this.dailyTargetReached;
  }

  /**
   * Get progress towards daily target
   */
  getTargetProgress(): number {
    return Math.min(100, (this.pnlTotal / this.config.dailyTarget) * 100);
  }

  /**
   * Get trade statistics
   */
  getTradeStats(): {
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number;
    totalPnl: number;
    averagePnl: number;
  } {
    const wins = this.completedTrades.filter(t => t.isWin).length;
    const losses = this.completedTrades.length - wins;

    return {
      totalTrades: this.completedTrades.length,
      wins,
      losses,
      winRate: this.completedTrades.length > 0
        ? (wins / this.completedTrades.length) * 100
        : 0,
      totalPnl: this.pnlTotal,
      averagePnl: this.completedTrades.length > 0
        ? this.pnlTotal / this.completedTrades.length
        : 0,
    };
  }

  /**
   * Get session health manager
   */
  getHealthManager(): SessionHealthManager {
    return this.healthManager;
  }

  /**
   * Get recovery manager
   */
  getRecoveryManager(): RecoveryManager {
    return this.recoveryManager;
  }

  /**
   * Get hostility manager
   */
  getHostilityManager(): HostilityManager {
    return this.hostilityManager;
  }

  /**
   * Get bucket manager (3-Bucket system)
   */
  getBucketManager(): BucketManager {
    return this.bucketManager;
  }

  /**
   * Get hierarchy manager
   */
  getHierarchyManager(): HierarchyManager {
    return this.hierarchyManager;
  }

  /**
   * Get same direction manager
   */
  getSameDirectionManager(): SameDirectionManager {
    return this.sameDirectionManager;
  }

  /**
   * Check if session is stopped
   */
  isSessionStopped(): boolean {
    return this.sessionStopped;
  }

  /**
   * Get session stop reason
   */
  getSessionStopReason(): string {
    return this.sessionStopReason;
  }

  /**
   * Get current stake multiplier (for display)
   */
  getCurrentStakeMultiplier(): number {
    return this.recoveryManager.getStakeMultiplier();
  }

  /**
   * Reset all trades and P/L
   */
  reset(): void {
    this.pendingTrade = null;
    this.completedTrades = [];
    this.pnlTotal = 0;
    this.dailyTargetReached = false;
    this.consecutiveLosses = 0;
    // REMOVED: cooldownRemaining - legacy hold removed
    this.sessionStopped = false;
    this.sessionStopReason = '';

    // Reset per-system tracking
    this.bucketConsecutiveLosses = 0;
    this.samedirConsecutiveLosses = 0;
    this.bucketTotalPnl = 0;
    this.samedirTotalPnl = 0;

    this.healthManager.reset();
    this.recoveryManager.reset();
    this.hostilityManager.reset();
    this.bucketManager.reset();
    this.zzStateManager.reset();
    this.hierarchyManager.reset();
    this.sameDirectionManager.reset();

    // Reset profit tracking
    this.profitTracking = {
      totals: {
        actualProfit: 0,
        activationAccumulatedProfit: 0,
        baitSwitchProfit: 0,
      },
      history: [],
      bspSimulations: [],
    };
  }

  /**
   * Rebuild all manager states after undo operation
   * This ensures all managers are synchronized with game state
   *
   * ============================================================================
   * UNDO SYNC CHECKLIST - UPDATE THIS WHEN ADDING NEW STATE/MANAGERS
   * ============================================================================
   * When adding new state or managers to ReactionEngine, you MUST update this
   * function to ensure proper state rebuild after undo. Failure to do so will
   * cause state desync bugs (e.g., false activations, stale data).
   *
   * Current state that gets rebuilt:
   * 1. healthManager.reset() + replay trades + rebuildResultsState()
   * 2. recoveryManager.reset()
   * 3. hostilityManager.reset() + replay trades
   * 4. zzStateManager.rebuildFromResults() - rebuilds pocket positions & runProfitZZ
   * 5. bucketManager.rebuildFromResults() + sync lastKnownStates with lifecycle
   * 6. consecutiveLosses - recalculated from trade history
   * 7. REMOVED: cooldownRemaining - legacy hold removed
   * 8. sessionStopped/sessionStopReason - recalculated from health
   * 9. profitTracking - recalculated (AAP from lifecycle)
   * 10. Per-system pause tracking - bucketConsecutiveLosses, samedirConsecutiveLosses,
   *     bucketTotalPnl, samedirTotalPnl - recalculated from trade history
   *
   * If you add a NEW manager or state variable:
   * - Add reset/rebuild logic here
   * - If it depends on lifecycle state, sync AFTER bucketManager.rebuildFromResults()
   * - If it depends on trade history, replay from this.completedTrades
   * - If it depends on results history, use this.gameState.getResults()
   *
   * Related functions that may also need updates:
   * - BucketManager.rebuildFromResults() - for bucket-related state
   * - GameStateEngine.undoLastBlock() - for core game state
   * - undoLastTrade() / rebuildHealthState() - for trade-related state
   * ============================================================================
   */
  rebuildAllState(): void {
    // Reset all managers (except ZZ - rebuilt from results below)
    this.healthManager.reset();
    this.recoveryManager.reset();
    this.hostilityManager.reset();

    this.sessionStopped = false;
    this.sessionStopReason = '';
    // REMOVED: cooldownRemaining - legacy hold removed
    this.consecutiveLosses = 0;

    // Reset per-system tracking
    this.bucketConsecutiveLosses = 0;
    this.samedirConsecutiveLosses = 0;
    this.bucketTotalPnl = 0;
    this.samedirTotalPnl = 0;

    // Reset profit tracking - will be recalculated
    this.profitTracking = {
      totals: {
        actualProfit: this.pnlTotal, // This is still valid from remaining trades
        activationAccumulatedProfit: 0,
        baitSwitchProfit: 0,
      },
      history: [],
      bspSimulations: [],
    };

    // Replay trades for health, hostility, and per-system tracking
    for (const trade of this.completedTrades) {
      this.healthManager.updateAfterTrade(trade);
      this.hostilityManager.processTradeResult(trade);

      // Rebuild per-system stats
      const tradingSystem = this.getTradeSystem(trade.pattern);
      const tradeProfit = trade.isWin ? trade.pct : -trade.pct;

      if (tradingSystem === 'BUCKET') {
        this.bucketTotalPnl += tradeProfit;
      } else if (tradingSystem === 'SAMEDIR') {
        this.samedirTotalPnl += tradeProfit;
      }
    }

    // Recalculate consecutive losses from trade history (for statistics)
    this.consecutiveLosses = 0;
    for (let i = this.completedTrades.length - 1; i >= 0; i--) {
      if (!this.completedTrades[i].isWin) {
        this.consecutiveLosses++;
      } else {
        break;
      }
    }

    // Recalculate per-system consecutive losses from trade history
    // Each system's consecutive losses are counted separately
    this.bucketConsecutiveLosses = 0;
    this.samedirConsecutiveLosses = 0;

    // Calculate Bucket consecutive losses (iterate backward through Bucket trades only)
    for (let i = this.completedTrades.length - 1; i >= 0; i--) {
      const trade = this.completedTrades[i];
      if (this.getTradeSystem(trade.pattern) === 'BUCKET') {
        if (!trade.isWin) {
          this.bucketConsecutiveLosses++;
        } else {
          break; // Stop on first Bucket win
        }
      }
    }

    // Calculate SameDir consecutive losses (iterate backward through SameDir trades only)
    for (let i = this.completedTrades.length - 1; i >= 0; i--) {
      const trade = this.completedTrades[i];
      if (this.getTradeSystem(trade.pattern) === 'SAMEDIR') {
        if (!trade.isWin) {
          this.samedirConsecutiveLosses++;
        } else {
          break; // Stop on first SameDir win
        }
      }
    }

    // Rebuild divergences from results
    const results = this.gameState.getResults();
    this.healthManager.rebuildResultsState(results);

    // Rebuild bucket manager from results history (NOT from lifecycle state)
    // This preserves BNS bucket state across undo operations
    // IMPORTANT: Do NOT call updateFromLifecycle() here!
    // The bucket state should only come from historical results during undo.
    // Calling updateFromLifecycle() would cause new pattern activations from
    // the replayed lifecycle state, which is the bug that causes 7+ patterns
    // to activate unexpectedly on undo.
    //
    // v15.5 FIX: Now passes lifecycle to sync lastKnownStates after rebuild.
    // This prevents false activations when the next block arrives.
    const lifecycle = this.gameState.getLifecycle();
    this.bucketManager.rebuildFromResults(results, lifecycle);

    // v16.0 FIX: Rebuild ZZ state from results history
    // This preserves pocket positions and runProfitZZ across undo operations.
    // Uses rebuildFromResults() instead of reset() to maintain ZZ/AntiZZ state.
    this.zzStateManager.rebuildFromResults(results);

    // Reset hierarchy manager (no state to rebuild from results)
    this.hierarchyManager.reset();

    // Rebuild Same Direction state from blocks
    this.sameDirectionManager.reset();
    // Note: Same Direction state can be rebuilt by replaying blocks if needed
    // For now, reset is sufficient as it will reactivate based on next run break

    // NOTE: Do NOT trigger new cooldown here!
    // Cooldown was already reset to 0 at the start.
    // We only track consecutiveLosses for future reference, not to trigger cooldown.
    // Cooldown is only triggered by NEW losses, not by replaying history.

    // Recalculate AAP from current lifecycle state
    this.profitTracking.totals.activationAccumulatedProfit = this.calculateAap();

    // Check session health
    if (this.healthManager.isAborted()) {
      this.sessionStopped = true;
      this.sessionStopReason = this.healthManager.getStopReason();
    }

    console.log('[ReactionEngine] State rebuilt after undo');
  }

  /**
   * Export state for persistence
   */
  exportState(): {
    pendingTrade: PendingTrade | null;
    completedTrades: CompletedTrade[];
    pnlTotal: number;
    dailyTargetReached: boolean;
    consecutiveLosses: number;
    cooldownRemaining: number;
    sessionStopped: boolean;
    sessionStopReason: string;
    healthState: ReturnType<SessionHealthManager['exportState']>;
    recoveryState: ReturnType<RecoveryManager['exportState']>;
    hostilityState: ReturnType<HostilityManager['exportState']>;
    profitTracking: SessionProfitState;
    zzState: ZZStrategyState;
    sameDirectionState: SameDirectionState;
    // Per-system pause tracking
    bucketConsecutiveLosses: number;
    samedirConsecutiveLosses: number;
    bucketTotalPnl: number;
    samedirTotalPnl: number;
  } {
    return {
      pendingTrade: this.getPendingTrade(),
      completedTrades: this.getCompletedTrades(),
      pnlTotal: this.pnlTotal,
      dailyTargetReached: this.dailyTargetReached,
      consecutiveLosses: this.consecutiveLosses,
      cooldownRemaining: 0, // Legacy field - always 0 now
      sessionStopped: this.sessionStopped,
      sessionStopReason: this.sessionStopReason,
      healthState: this.healthManager.exportState(),
      recoveryState: this.recoveryManager.exportState(),
      hostilityState: this.hostilityManager.exportState(),
      profitTracking: this.getProfitTracking(),
      zzState: this.zzStateManager.exportState(),
      sameDirectionState: this.sameDirectionManager.exportState(),
      // Per-system pause tracking
      bucketConsecutiveLosses: this.bucketConsecutiveLosses,
      samedirConsecutiveLosses: this.samedirConsecutiveLosses,
      bucketTotalPnl: this.bucketTotalPnl,
      samedirTotalPnl: this.samedirTotalPnl,
    };
  }

  /**
   * Import state from persistence
   */
  importState(state: ReturnType<ReactionEngine['exportState']>): void {
    this.pendingTrade = state.pendingTrade;
    this.completedTrades = state.completedTrades;
    this.pnlTotal = state.pnlTotal;
    this.dailyTargetReached = state.dailyTargetReached;
    this.consecutiveLosses = state.consecutiveLosses ?? 0;
    // REMOVED: cooldownRemaining import - legacy hold removed
    this.sessionStopped = state.sessionStopped ?? false;
    this.sessionStopReason = state.sessionStopReason ?? '';

    if (state.healthState) {
      this.healthManager.importState(state.healthState);
    }
    if (state.recoveryState) {
      this.recoveryManager.importState(state.recoveryState);
    }
    if (state.hostilityState) {
      this.hostilityManager.importState(state.hostilityState);
    }

    // Import profit tracking (with defaults for older sessions)
    if (state.profitTracking) {
      this.profitTracking = {
        totals: { ...state.profitTracking.totals },
        history: [...state.profitTracking.history],
        bspSimulations: [...state.profitTracking.bspSimulations],
      };
    } else {
      // Calculate from existing data for older sessions
      this.profitTracking = {
        totals: {
          actualProfit: this.pnlTotal,
          activationAccumulatedProfit: this.calculateAap(),
          baitSwitchProfit: 0,
        },
        history: [],
        bspSimulations: [],
      };
    }

    // Import ZZ state (with defaults for older sessions)
    if (state.zzState) {
      this.zzStateManager.importState(state.zzState);
    }

    // Import Same Direction state (with defaults for older sessions)
    if (state.sameDirectionState) {
      this.sameDirectionManager.importState(state.sameDirectionState);
    }

    // Import per-system pause tracking (with defaults for older sessions)
    this.bucketConsecutiveLosses = state.bucketConsecutiveLosses ?? 0;
    this.samedirConsecutiveLosses = state.samedirConsecutiveLosses ?? 0;
    this.bucketTotalPnl = state.bucketTotalPnl ?? 0;
    this.samedirTotalPnl = state.samedirTotalPnl ?? 0;
  }

  /**
   * Get cooldown remaining
   * @deprecated Legacy hold removed - always returns 0
   */
  getCooldownRemaining(): number {
    return 0; // Legacy hold removed
  }

  /**
   * Get consecutive losses count
   */
  getConsecutiveLosses(): number {
    return this.consecutiveLosses;
  }

  /**
   * Get per-system pause tracking stats
   */
  getPerSystemStats(): {
    bucket: { consecutiveLosses: number; totalPnl: number; isPaused: boolean };
    samedir: { consecutiveLosses: number; totalPnl: number; isPaused: boolean };
  } {
    return {
      bucket: {
        consecutiveLosses: this.bucketConsecutiveLosses,
        totalPnl: this.bucketTotalPnl,
        isPaused: this.pauseManager.isSystemPaused('BUCKET'),
      },
      samedir: {
        consecutiveLosses: this.samedirConsecutiveLosses,
        totalPnl: this.samedirTotalPnl,
        isPaused: this.pauseManager.isSystemPaused('SAMEDIR'),
      },
    };
  }

  /**
   * Get Bucket system consecutive losses
   */
  getBucketConsecutiveLosses(): number {
    return this.bucketConsecutiveLosses;
  }

  /**
   * Get SameDir system consecutive losses
   */
  getSamedirConsecutiveLosses(): number {
    return this.samedirConsecutiveLosses;
  }

  /**
   * Get Bucket system total P/L
   */
  getBucketTotalPnl(): number {
    return this.bucketTotalPnl;
  }

  /**
   * Get SameDir system total P/L
   */
  getSamedirTotalPnl(): number {
    return this.samedirTotalPnl;
  }

  /**
   * Get profit tracking state (AP, AAP, BSP)
   */
  getProfitTracking(): SessionProfitState {
    return {
      totals: { ...this.profitTracking.totals },
      history: [...this.profitTracking.history],
      bspSimulations: [...this.profitTracking.bspSimulations],
    };
  }

  /**
   * Get profit totals only (for quick access)
   */
  getProfitTotals(): ProfitTracking {
    return { ...this.profitTracking.totals };
  }

  /**
   * Get BSP simulations (for analysis)
   */
  getBspSimulations(): BspTradeSimulation[] {
    return [...this.profitTracking.bspSimulations];
  }

  /**
   * Undo the last trade (reverse P/L)
   * Called when a block is undone
   */
  undoLastTrade(blockIndex: number): CompletedTrade | null {
    // Check if the last trade was evaluated at this block index
    if (this.completedTrades.length === 0) {
      return null;
    }

    const lastTrade = this.completedTrades[this.completedTrades.length - 1];
    if (lastTrade.evalIndex !== blockIndex) {
      return null;
    }

    // Remove the trade and reverse the P/L
    this.completedTrades.pop();
    this.pnlTotal -= lastTrade.pnl;

    // Reset daily target if we dropped below it
    if (this.pnlTotal < this.config.dailyTarget) {
      this.dailyTargetReached = false;
    }

    // Rebuild health state from remaining trades
    this.rebuildHealthState();

    return lastTrade;
  }

  /**
   * Rebuild health manager state from completed trades
   * Called after undo to recalculate health correctly
   */
  private rebuildHealthState(): void {
    // Reset health manager
    this.healthManager.reset();

    // Reset recovery manager (undo takes us back to a previous state)
    this.recoveryManager.reset();

    // Reset hostility manager
    this.hostilityManager.reset();

    // Reset session stopped state (will be recalculated)
    this.sessionStopped = false;
    this.sessionStopReason = '';

    // REMOVED: cooldownRemaining - legacy hold removed

    // Reset per-system tracking
    this.bucketConsecutiveLosses = 0;
    this.samedirConsecutiveLosses = 0;
    this.bucketTotalPnl = 0;
    this.samedirTotalPnl = 0;

    // Clear any per-system pauses (they will be re-evaluated if needed)
    this.pauseManager.clearSystemPause('BUCKET');
    this.pauseManager.clearSystemPause('SAMEDIR');

    // Replay all completed trades to rebuild health, hostility, and per-system state
    for (const trade of this.completedTrades) {
      this.healthManager.updateAfterTrade(trade);
      this.hostilityManager.processTradeResult(trade);

      // Rebuild per-system stats
      const tradingSystem = this.getTradeSystem(trade.pattern);
      const tradeProfit = trade.isWin ? trade.pct : -trade.pct;

      if (tradingSystem === 'BUCKET') {
        this.bucketTotalPnl += tradeProfit;
      } else if (tradingSystem === 'SAMEDIR') {
        this.samedirTotalPnl += tradeProfit;
      }
    }

    // Recalculate consecutive losses from remaining trades (for statistics)
    this.consecutiveLosses = 0;
    for (let i = this.completedTrades.length - 1; i >= 0; i--) {
      if (!this.completedTrades[i].isWin) {
        this.consecutiveLosses++;
      } else {
        break;
      }
    }

    // Recalculate per-system consecutive losses
    // Calculate Bucket consecutive losses (iterate backward through Bucket trades only)
    for (let i = this.completedTrades.length - 1; i >= 0; i--) {
      const trade = this.completedTrades[i];
      if (this.getTradeSystem(trade.pattern) === 'BUCKET') {
        if (!trade.isWin) {
          this.bucketConsecutiveLosses++;
        } else {
          break; // Stop on first Bucket win
        }
      }
    }

    // Calculate SameDir consecutive losses (iterate backward through SameDir trades only)
    for (let i = this.completedTrades.length - 1; i >= 0; i--) {
      const trade = this.completedTrades[i];
      if (this.getTradeSystem(trade.pattern) === 'SAMEDIR') {
        if (!trade.isWin) {
          this.samedirConsecutiveLosses++;
        } else {
          break; // Stop on first SameDir win
        }
      }
    }

    // Check if session should still be stopped based on rebuilt health (hard abort only)
    if (this.healthManager.isAborted()) {
      this.sessionStopped = true;
      this.sessionStopReason = this.healthManager.getStopReason();
    }
  }

  /**
   * Cancel pending trade (if block that opened it is undone)
   */
  cancelPendingTrade(blockIndex: number): PendingTrade | null {
    if (this.pendingTrade && this.pendingTrade.openIndex === blockIndex) {
      const cancelled = this.pendingTrade;
      this.pendingTrade = null;
      return cancelled;
    }
    return null;
  }

  /**
   * Clear pending trade unconditionally (used during undo)
   */
  clearPendingTrade(): PendingTrade | null {
    const cleared = this.pendingTrade;
    this.pendingTrade = null;
    return cleared;
  }

  // ==========================================================================
  // PROFIT/LOSS MANAGEMENT SYSTEM METHODS
  // ==========================================================================

  /**
   * Capture a snapshot of the current state for undo system
   */
  private captureBlockSnapshot(blockIndex: number): void {
    const bucketStates: Record<PatternName, 'MAIN' | 'WAITING' | 'BNS'> = {} as any;
    const patterns: PatternName[] = ['2A2', 'Anti2A2', '3A3', 'Anti3A3', '4A4', 'Anti4A4',
      '5A5', 'Anti5A5', '6A6', 'Anti6A6', 'AP5', 'OZ', 'ZZ', 'AntiZZ', 'PP', 'ST'];

    for (const pattern of patterns) {
      bucketStates[pattern] = this.bucketManager.getBucket(pattern);
    }

    const components: SnapshotComponents = {
      blockIndex,
      bucketStates,
      pauseState: this.pauseManager.getPauseState(),
      healthState: {
        totalPnl: this.healthManager.getTotalPnl(),
        consecutiveLosses: this.healthManager.getConsecutiveLosses(),
        drawdownLevel: this.healthManager.getDrawdownLevel(),
        lastMajorPauseMilestone: this.pauseManager.getLastMajorPauseMilestone(),
      },
      sameDirectionState: {
        isActive: this.sameDirectionManager.isActive(),
        runProfit: this.sameDirectionManager.getState().activationRunProfit,
        accumulatedLoss: this.sameDirectionManager.getAccumulatedLoss(),
      },
      hostilityState: {
        score: this.hostilityManager.getState().hostilityScore,
        isLocked: this.hostilityManager.isLocked(),
      },
      ledgerState: this.actualSimLedger.getSnapshot(),
    };

    this.snapshotManager.captureSnapshot(components);
  }

  /**
   * Get the pause manager instance
   */
  getPauseManager(): PauseManager {
    return this.pauseManager;
  }

  /**
   * Get the actual/sim ledger instance
   */
  getActualSimLedger(): ActualSimLedger {
    return this.actualSimLedger;
  }

  /**
   * Get the snapshot manager instance
   */
  getSnapshotManager(): BlockStateSnapshotManager {
    return this.snapshotManager;
  }

  /**
   * Get the bait-switch detector instance
   */
  getBaitSwitchDetector(): BaitSwitchDetector {
    return this.baitSwitchDetector;
  }

  /**
   * Get current pause state
   */
  getPauseState(): PauseState | null {
    return this.pauseManager.getPauseState();
  }

  /**
   * Check if currently paused
   */
  isPaused(): boolean {
    return this.pauseManager.isPaused();
  }

  /**
   * Check if game is stopped (STOP_GAME active)
   */
  isGameStopped(): boolean {
    return this.pauseManager.isGameStopped();
  }

  /**
   * Get ledger summary (actual vs simulated trades)
   */
  getLedgerSummary(): {
    actual: { trades: number; wins: number; pnl: number; winRate: number };
    simulated: { trades: number; wins: number; pnl: number; winRate: number };
  } {
    const summary = this.actualSimLedger.getSummary();
    return {
      actual: summary.actual,
      simulated: summary.simulated,
    };
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createReactionEngine(
  gameState: GameStateEngine,
  config?: Partial<EvaluatorConfig>,
  healthConfig?: Partial<SessionHealthConfig>,
  hostilityConfig?: Partial<HostilityConfig>,
  bucketConfig?: Partial<BucketConfig>,
  pauseConfig?: Partial<PauseConfig>
): ReactionEngine {
  return new ReactionEngine(gameState, config, healthConfig, hostilityConfig, bucketConfig, pauseConfig);
}
