/**
 * Ghost Evaluator v15.1 - Session Recorder
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
} from './types';
import {
  PatternName,
  EvaluatorConfig,
  PATTERN_NAMES,
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

  // Research logger for P1/B&S data collection
  private researchLogger: ResearchLogger;
  private researchConfig: ResearchConfig;

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

      // Track P1 mode
      if (gameState.isP1Mode()) {
        if (!this.wasInP1Mode) {
          this.wasInP1Mode = true;
          if (this.firstP1ModeBlock === null) {
            this.firstP1ModeBlock = blockResult.block.index;
          }
        }
        this.blocksInP1Mode++;
      } else {
        this.wasInP1Mode = false;
      }

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

      // Track bets and outcomes
      if (closedTrade) {
        this.betsPerPattern[closedTrade.pattern]++;
        this.pnlPerPattern[closedTrade.pattern] += closedTrade.pnl;
        if (closedTrade.isWin) {
          this.winsPerPattern[closedTrade.pattern]++;
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

    // Create full session log
    const sessionLog: SessionLog = {
      sessionId: this.sessionId,
      evaluatorVersion: '15.1',
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
