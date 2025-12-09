/**
 * Ghost Evaluator v15.1 - Session Manager
 * ========================================
 * Manages session persistence and data
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  SessionData,
  EvaluatorConfig,
  DEFAULT_CONFIG,
  PatternName,
  PATTERN_NAMES,
  SessionHealthConfig,
  DEFAULT_SESSION_HEALTH_CONFIG,
  SessionHealth,
  RecoveryState,
  ReentryState,
  ProfitTracking,
} from '../types';
import { GameStateEngine, createGameStateEngine } from '../engine/state';
import { ReactionEngine, createReactionEngine } from '../engine/reaction';
import { SessionHealthManager } from '../engine/session-health';

// ============================================================================
// SESSION MANAGER
// ============================================================================

export class SessionManager {
  private config: EvaluatorConfig;
  private healthConfig: SessionHealthConfig;
  private gameState: GameStateEngine;
  private reactionEngine: ReactionEngine;
  private sessionDir: string;
  private currentSessionPath: string | null = null;
  private autoSaveInterval: NodeJS.Timeout | null = null;

  constructor(options?: {
    config?: Partial<EvaluatorConfig>;
    healthConfig?: Partial<SessionHealthConfig>;
    sessionDir?: string;
  }) {
    this.config = { ...DEFAULT_CONFIG, ...options?.config };
    this.healthConfig = { ...DEFAULT_SESSION_HEALTH_CONFIG, ...options?.healthConfig };
    this.sessionDir = options?.sessionDir ?? './data/sessions';
    this.gameState = createGameStateEngine(this.config);
    this.reactionEngine = createReactionEngine(this.gameState, this.config, this.healthConfig);

    // Ensure session directory exists
    this.ensureSessionDir();
  }

  /**
   * Ensure session directory exists
   */
  private ensureSessionDir(): void {
    const absolutePath = path.resolve(this.sessionDir);
    if (!fs.existsSync(absolutePath)) {
      fs.mkdirSync(absolutePath, { recursive: true });
    }
  }

  /**
   * Get the game state engine
   */
  getGameState(): GameStateEngine {
    return this.gameState;
  }

  /**
   * Get the reaction engine
   */
  getReactionEngine(): ReactionEngine {
    return this.reactionEngine;
  }

  /**
   * Create a new session
   */
  newSession(): void {
    this.gameState.reset();
    this.reactionEngine.reset();
    this.currentSessionPath = null;
  }

  /**
   * Export current session to SessionData
   */
  exportSession(): SessionData {
    const gameExport = this.gameState.exportState();
    const reactionExport = this.reactionEngine.exportState();

    return {
      version: '15.1',
      blocks: gameExport.blocks,
      results: gameExport.results,
      patternCycles: gameExport.patternCycles,
      pendingSignals: gameExport.pendingSignals,
      flags: {
        dailyTargetReached: reactionExport.dailyTargetReached,
        p1Mode: gameExport.p1Mode,
      },
      trades: reactionExport.completedTrades,
      pendingTrade: reactionExport.pendingTrade,
      pnlTotal: reactionExport.pnlTotal,
      runData: gameExport.runData,
      ts: new Date().toISOString(),
      profitTracking: reactionExport.profitTracking,
    };
  }

  /**
   * Import session from SessionData
   */
  importSession(data: SessionData): void {
    // Rebuild game state
    this.gameState.reset();

    // Import pattern cycles
    this.gameState.getLifecycle().loadCycles(data.patternCycles);

    // Replay blocks to rebuild state
    for (const block of data.blocks) {
      this.gameState.addBlock(block.dir, block.pct);
    }

    // Import reaction state - create a compatible state object
    // Note: healthState, recoveryState, hostilityState, and profitTracking may not exist in older session files
    const reactionState: Parameters<typeof this.reactionEngine.importState>[0] = {
      pendingTrade: data.pendingTrade,
      completedTrades: data.trades,
      pnlTotal: data.pnlTotal,
      dailyTargetReached: data.flags.dailyTargetReached,
      consecutiveLosses: 0,
      cooldownRemaining: 0,
      sessionStopped: false,
      sessionStopReason: '',
      healthState: this.reactionEngine.getHealthManager().exportState(),
      recoveryState: this.reactionEngine.getRecoveryManager().exportState(),
      hostilityState: this.reactionEngine.getHostilityManager().exportState(),
      profitTracking: data.profitTracking ?? {
        totals: { actualProfit: data.pnlTotal, activationAccumulatedProfit: 0, baitSwitchProfit: 0 },
        history: [],
        bspSimulations: [],
      },
    };

    this.reactionEngine.importState(reactionState);
  }

  /**
   * Save session to file
   */
  saveToFile(filePath?: string): string {
    const data = this.exportSession();
    const targetPath = filePath ?? this.generateSessionPath();
    const absolutePath = path.resolve(targetPath);

    const content = JSON.stringify(data, null, 2);
    fs.writeFileSync(absolutePath, content, 'utf-8');

    this.currentSessionPath = absolutePath;
    return absolutePath;
  }

  /**
   * Load session from file
   */
  loadFromFile(filePath: string): void {
    const absolutePath = path.resolve(filePath);
    const content = fs.readFileSync(absolutePath, 'utf-8');
    const data = JSON.parse(content) as SessionData;

    this.importSession(data);
    this.currentSessionPath = absolutePath;
  }

  /**
   * Generate session file path
   */
  private generateSessionPath(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `session_${timestamp}.json`;
    return path.join(this.sessionDir, filename);
  }

  /**
   * Get current session path
   */
  getCurrentSessionPath(): string | null {
    return this.currentSessionPath;
  }

  /**
   * List all saved sessions
   */
  listSessions(): { path: string; timestamp: string; pnl: number }[] {
    const absolutePath = path.resolve(this.sessionDir);

    if (!fs.existsSync(absolutePath)) {
      return [];
    }

    const files = fs.readdirSync(absolutePath)
      .filter(f => f.endsWith('.json'))
      .map(f => path.join(absolutePath, f));

    return files.map(filePath => {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content) as SessionData;
        return {
          path: filePath,
          timestamp: data.ts,
          pnl: data.pnlTotal,
        };
      } catch {
        return {
          path: filePath,
          timestamp: 'unknown',
          pnl: 0,
        };
      }
    }).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  /**
   * Delete a session file
   */
  deleteSession(filePath: string): void {
    const absolutePath = path.resolve(filePath);
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
    }
  }

  /**
   * Start auto-save
   */
  startAutoSave(intervalMs = 5000): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }

    this.autoSaveInterval = setInterval(() => {
      if (this.currentSessionPath) {
        this.saveToFile(this.currentSessionPath);
      }
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
   * Get session summary
   */
  getSummary(): {
    blockCount: number;
    tradeCount: number;
    pnlTotal: number;
    winRate: number;
    targetProgress: number;
    sessionState: string;
    activePatterns: PatternName[];
    observingPatterns: PatternName[];
    sessionHealth: SessionHealth;
    isSessionStopped: boolean;
    sessionStopReason: string;
    recoveryMode: string;
    stakeMultiplier: number;
    profitTracking: ProfitTracking;
  } {
    const tradeStats = this.reactionEngine.getTradeStats();
    const healthManager = this.reactionEngine.getHealthManager();
    const recoveryManager = this.reactionEngine.getRecoveryManager();

    return {
      blockCount: this.gameState.getBlockCount(),
      tradeCount: tradeStats.totalTrades,
      pnlTotal: tradeStats.totalPnl,
      winRate: tradeStats.winRate,
      targetProgress: this.reactionEngine.getTargetProgress(),
      sessionState: this.gameState.getSessionState(),
      activePatterns: PATTERN_NAMES.filter(p => this.gameState.getLifecycle().isActive(p)),
      observingPatterns: PATTERN_NAMES.filter(p => this.gameState.getLifecycle().isObserving(p)),
      sessionHealth: healthManager.getHealth(),
      isSessionStopped: this.reactionEngine.isSessionStopped(),
      sessionStopReason: this.reactionEngine.getSessionStopReason(),
      recoveryMode: recoveryManager.getCurrentMode(),
      stakeMultiplier: recoveryManager.getStakeMultiplier(),
      profitTracking: this.reactionEngine.getProfitTotals(),
    };
  }

  /**
   * Get detailed health report
   */
  getHealthReport(): {
    health: SessionHealth;
    drawdown: ReturnType<SessionHealthManager['getDrawdownState']>;
    lossSeverity: ReturnType<SessionHealthManager['getLossSeverity']>;
    verdicts: ReturnType<SessionHealthManager['getVerdictAnalysis']>;
    velocity: ReturnType<SessionHealthManager['getActivationVelocity']>;
    patternDivergences: ReturnType<SessionHealthManager['getAllPatternDivergences']>;
    recovery: RecoveryState;
    reentry: ReentryState;
  } {
    const healthManager = this.reactionEngine.getHealthManager();
    const recoveryManager = this.reactionEngine.getRecoveryManager();

    return {
      health: healthManager.getHealth(),
      drawdown: healthManager.getDrawdownState(),
      lossSeverity: healthManager.getLossSeverity(),
      verdicts: healthManager.getVerdictAnalysis(),
      velocity: healthManager.getActivationVelocity(),
      patternDivergences: healthManager.getAllPatternDivergences(),
      recovery: recoveryManager.getRecoveryState(),
      reentry: recoveryManager.getReentryState(),
    };
  }

  /**
   * Get session health config
   */
  getHealthConfig(): SessionHealthConfig {
    return JSON.parse(JSON.stringify(this.healthConfig));
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createSessionManager(options?: {
  config?: Partial<EvaluatorConfig>;
  healthConfig?: Partial<SessionHealthConfig>;
  sessionDir?: string;
}): SessionManager {
  return new SessionManager(options);
}
