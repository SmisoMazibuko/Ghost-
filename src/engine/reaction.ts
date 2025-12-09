/**
 * Ghost Evaluator v15.1 - Reaction Engine
 * ========================================
 * Generates predictions and manages auto-betting
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
} from '../types';
import { GameStateEngine } from './state';
import { SessionHealthManager, createSessionHealthManager } from './session-health';
import { RecoveryManager, createRecoveryManager } from './recovery';
import { HostilityManager, createHostilityManager } from './hostility';

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
  private gameState: GameStateEngine;
  private pendingTrade: PendingTrade | null = null;
  private completedTrades: CompletedTrade[] = [];
  private pnlTotal = 0;
  private dailyTargetReached = false;
  private consecutiveLosses = 0;
  private cooldownRemaining = 0; // Blocks remaining in cooldown

  // Session health, recovery, and hostility managers
  private healthManager: SessionHealthManager;
  private recoveryManager: RecoveryManager;
  private hostilityManager: HostilityManager;
  private sessionStopped = false;
  private sessionStopReason = '';

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
    hostilityConfig?: Partial<HostilityConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.healthConfig = { ...DEFAULT_SESSION_HEALTH_CONFIG, ...healthConfig };
    this.hostilityConfig = { ...DEFAULT_HOSTILITY_CONFIG, ...hostilityConfig };
    this.gameState = gameState;

    // Initialize health, recovery, and hostility managers
    this.healthManager = createSessionHealthManager(this.healthConfig);
    this.recoveryManager = createRecoveryManager(this.healthConfig);
    this.hostilityManager = createHostilityManager(this.hostilityConfig);
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

    // Check if session is locked by hostility manager (PRIMARY CHECK)
    if (this.hostilityManager.isLocked()) {
      return {
        hasPrediction: false,
        reason: `LOCKED — ${this.hostilityManager.getStatusMessage()}`,
      };
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

    // Show hostility warning if score is elevated (but not locked)
    const hostilityScore = this.hostilityManager.getHostilityScore();
    const hostilityWarning = hostilityScore > 0
      ? ` [Hostility: ${hostilityScore.toFixed(1)}/${this.hostilityConfig.lockThreshold}]`
      : '';

    // Check cooldown after consecutive losses
    if (this.cooldownRemaining > 0) {
      return {
        hasPrediction: false,
        reason: `COOLDOWN — ${this.cooldownRemaining} block(s) remaining${hostilityWarning}`,
      };
    }

    // Check P1 mode
    if (this.gameState.isP1Mode()) {
      return {
        hasPrediction: false,
        reason: 'P1 MODE — Waiting for profitable pattern to clear',
      };
    }

    const lifecycle = this.gameState.getLifecycle();
    const pendingSignals = this.gameState.getPendingSignals();

    // Sort patterns by cumulative profit (highest first)
    const sortedPatterns = lifecycle.getAllPatternsByProfit();

    for (const pattern of sortedPatterns) {
      // Check if pattern is active
      if (!lifecycle.isActive(pattern)) continue;

      // Check if should switch to opposite
      if (lifecycle.shouldSwitchToOpposite(pattern)) continue;

      // Check for pending signals
      const signals = pendingSignals.filter(s => s.pattern === pattern);
      if (signals.length === 0) continue;

      const signal = signals[0];
      const profit = lifecycle.getCumulativeProfit(pattern);
      const confidence = calculateConfidence(pattern, profit);

      let prediction: Prediction = {
        hasPrediction: true,
        direction: signal.expectedDirection,
        confidence,
        pattern,
        reason: `${pattern} → ${signal.expectedDirection > 0 ? 'Up' : 'Down'} (Active: ${profit.toFixed(0)}%)`,
      };

      // Modify prediction if in re-entry mode
      const modified = this.recoveryManager.modifyPrediction(prediction);
      return modified ?? prediction;
    }

    return {
      hasPrediction: false,
      reason: 'HOLD — no working pattern meets strict gates',
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

    // Update session health with trade result (for drawdown tracking)
    this.healthManager.updateAfterTrade(trade);

    // Update hostility manager with trade result (PRIMARY tracking)
    this.hostilityManager.processTradeResult(trade);

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

    // Track consecutive losses for cooldown (but don't stop - let hostility decide)
    if (isWin) {
      this.consecutiveLosses = 0;
    } else {
      this.consecutiveLosses++;
      // Trigger cooldown after 2 consecutive losses (skip 3 blocks)
      // This is a PAUSE, not a stop - hostility accumulates but we're just cooling down
      if (this.consecutiveLosses >= 2) {
        this.cooldownRemaining = 3;
        this.consecutiveLosses = 0; // Reset after triggering cooldown
      }
    }

    // Check if session should stop based on health (ONLY for hard abort limits)
    this.checkSessionHealth();

    // Check daily target
    if (this.pnlTotal >= this.config.dailyTarget) {
      this.dailyTargetReached = true;
    }

    return trade;
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
   */
  processBlock(dir: Direction, pct: number): {
    blockResult: ReturnType<GameStateEngine['addBlock']>;
    prediction: Prediction;
    closedTrade: CompletedTrade | null;
    openedTrade: PendingTrade | null;
    cooldownRemaining: number;
    sessionHealth: ReturnType<SessionHealthManager['getHealth']>;
    recoveryMode: string;
    hostilityState: ReturnType<HostilityManager['getState']>;
    profitTracking: SessionProfitState;
  } {
    // Add block to game state
    const blockResult = this.gameState.addBlock(dir, pct);

    // Update health manager with evaluated results
    for (const result of blockResult.evaluatedResults) {
      this.healthManager.updateAfterResult(result);
    }

    // Check for bait & switch and update hostility
    this.processBaitSwitchDetection();

    // Check for pattern run completions (breaks)
    const lifecycle = this.gameState.getLifecycle();
    for (const result of blockResult.evaluatedResults) {
      // If pattern just broke, check its net profit
      const cycle = lifecycle.getCycle(result.pattern);
      if (cycle && cycle.state === 'observing' && result.wasBet) {
        // Pattern just broke (was active, now observing)
        this.processPatternRunCompletion(result.pattern, cycle.lastRunProfit);
      }
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

    // Evaluate any pending trade
    const closedTrade = this.evaluateTrade(blockResult.block);

    // Decrement cooldown if active (after evaluating trade, before prediction)
    if (this.cooldownRemaining > 0) {
      this.cooldownRemaining--;
    }

    // Generate new prediction
    const prediction = this.predictNext();

    // Open trade if prediction exists and no pending trade
    const openedTrade = this.openTrade(prediction);

    // Update profit tracking (AP, AAP, BSP)
    const actualProfitDelta = closedTrade ? closedTrade.pnl : 0;
    this.updateProfitTracking(blockResult.block.index, actualProfitDelta, wasLockedBeforeBlock);

    return {
      blockResult,
      prediction,
      closedTrade,
      openedTrade,
      cooldownRemaining: this.cooldownRemaining,
      sessionHealth: this.healthManager.getHealth(),
      recoveryMode: this.recoveryManager.getCurrentMode(),
      hostilityState: this.hostilityManager.getState(),
      profitTracking: this.getProfitTracking(), // Include profit tracking in response
    };
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
    this.cooldownRemaining = 0;
    this.sessionStopped = false;
    this.sessionStopReason = '';
    this.healthManager.reset();
    this.recoveryManager.reset();
    this.hostilityManager.reset();

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
  } {
    return {
      pendingTrade: this.getPendingTrade(),
      completedTrades: this.getCompletedTrades(),
      pnlTotal: this.pnlTotal,
      dailyTargetReached: this.dailyTargetReached,
      consecutiveLosses: this.consecutiveLosses,
      cooldownRemaining: this.cooldownRemaining,
      sessionStopped: this.sessionStopped,
      sessionStopReason: this.sessionStopReason,
      healthState: this.healthManager.exportState(),
      recoveryState: this.recoveryManager.exportState(),
      hostilityState: this.hostilityManager.exportState(),
      profitTracking: this.getProfitTracking(),
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
    this.cooldownRemaining = state.cooldownRemaining ?? 0;
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
  }

  /**
   * Get cooldown remaining
   */
  getCooldownRemaining(): number {
    return this.cooldownRemaining;
  }

  /**
   * Get consecutive losses count
   */
  getConsecutiveLosses(): number {
    return this.consecutiveLosses;
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

    // Reset cooldown (will be recalculated from consecutive losses)
    this.cooldownRemaining = 0;

    // Replay all completed trades to rebuild health and hostility state
    for (const trade of this.completedTrades) {
      this.healthManager.updateAfterTrade(trade);
      this.hostilityManager.processTradeResult(trade);
    }

    // Recalculate consecutive losses from remaining trades (max 2 from end)
    this.consecutiveLosses = 0;
    for (let i = this.completedTrades.length - 1; i >= 0; i--) {
      if (!this.completedTrades[i].isWin) {
        this.consecutiveLosses++;
        if (this.consecutiveLosses >= 2) break; // Cap at 2 for cooldown trigger
      } else {
        break;
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
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createReactionEngine(
  gameState: GameStateEngine,
  config?: Partial<EvaluatorConfig>,
  healthConfig?: Partial<SessionHealthConfig>,
  hostilityConfig?: Partial<HostilityConfig>
): ReactionEngine {
  return new ReactionEngine(gameState, config, healthConfig, hostilityConfig);
}
