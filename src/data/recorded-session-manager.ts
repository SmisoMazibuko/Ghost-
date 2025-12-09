/**
 * Ghost Evaluator v15.1 - Recorded Session Manager
 * =================================================
 * Session manager with integrated data recording
 *
 * This wraps the existing session manager and adds recording
 * WITHOUT changing any evaluation logic.
 */

import {
  Direction,
  EvaluatorConfig,
  DEFAULT_CONFIG,
  PatternName,
  PATTERN_NAMES,
} from '../types';
import { GameStateEngine, createGameStateEngine } from '../engine/state';
import { ReactionEngine, createReactionEngine } from '../engine/reaction';
import { SessionRecorder, createSessionRecorder } from './session-recorder';
import { SessionLog, LoggedPlay } from './types';

// ============================================================================
// RECORDED SESSION MANAGER
// ============================================================================

export class RecordedSessionManager {
  private config: EvaluatorConfig;
  private gameState: GameStateEngine;
  private reactionEngine: ReactionEngine;
  private recorder: SessionRecorder;
  private recordingEnabled: boolean;

  constructor(options?: {
    config?: Partial<EvaluatorConfig>;
    sessionsDir?: string;
    logsDir?: string;
    enableRecording?: boolean;
  }) {
    this.config = { ...DEFAULT_CONFIG, ...options?.config };
    this.gameState = createGameStateEngine(this.config);
    this.reactionEngine = createReactionEngine(this.gameState, this.config);
    this.recorder = createSessionRecorder(
      this.config,
      options?.sessionsDir,
      options?.logsDir
    );
    this.recordingEnabled = options?.enableRecording ?? true;
  }

  /**
   * Start a new recorded session
   */
  startSession(): void {
    this.gameState.reset();
    this.reactionEngine.reset();

    if (this.recordingEnabled) {
      this.recorder.startSession();
      this.recorder.startAutoSave(10000);
    }
  }

  /**
   * Process a block with recording
   * This is the main entry point - wraps the reaction engine
   */
  processBlock(dir: Direction, pct: number): {
    blockResult: ReturnType<GameStateEngine['addBlock']>;
    prediction: ReturnType<ReactionEngine['predictNext']>;
    closedTrade: ReturnType<ReactionEngine['evaluateTrade']>;
    openedTrade: ReturnType<ReactionEngine['openTrade']>;
    loggedPlay: LoggedPlay | null;
  } {
    // Use the reaction engine's processBlock (unchanged logic)
    const result = this.reactionEngine.processBlock(dir, pct);

    // Record if enabled
    let loggedPlay: LoggedPlay | null = null;
    if (this.recordingEnabled && this.recorder.isActive()) {
      loggedPlay = this.recorder.recordBlock(
        this.gameState,
        this.reactionEngine,
        result.blockResult,
        result.prediction,
        result.closedTrade,
        result.openedTrade
      );
    }

    return {
      ...result,
      loggedPlay,
    };
  }

  /**
   * End the session and save the recording
   */
  endSession(notes?: string): SessionLog | null {
    if (this.recordingEnabled && this.recorder.isActive()) {
      return this.recorder.endSession(this.gameState, this.reactionEngine, notes);
    }
    return null;
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
   * Get the recorder
   */
  getRecorder(): SessionRecorder {
    return this.recorder;
  }

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.recorder.getSessionId();
  }

  /**
   * Enable/disable recording
   */
  setRecordingEnabled(enabled: boolean): void {
    this.recordingEnabled = enabled;
  }

  /**
   * Check if recording is enabled
   */
  isRecordingEnabled(): boolean {
    return this.recordingEnabled;
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
    recordedPlays: number;
    sessionId: string;
  } {
    const tradeStats = this.reactionEngine.getTradeStats();

    return {
      blockCount: this.gameState.getBlockCount(),
      tradeCount: tradeStats.totalTrades,
      pnlTotal: tradeStats.totalPnl,
      winRate: tradeStats.winRate,
      targetProgress: this.reactionEngine.getTargetProgress(),
      sessionState: this.gameState.getSessionState(),
      activePatterns: PATTERN_NAMES.filter(p => this.gameState.getLifecycle().isActive(p)),
      observingPatterns: PATTERN_NAMES.filter(p => this.gameState.getLifecycle().isObserving(p)),
      recordedPlays: this.recorder.getPlayCount(),
      sessionId: this.recorder.getSessionId(),
    };
  }

  /**
   * Undo last block (also removes from recording)
   */
  undoLastBlock(): void {
    this.gameState.undoLastBlock();
    // Note: Recording keeps the history for analysis
    // We log an event but don't remove the play record
    if (this.recordingEnabled) {
      this.recorder.getPlayLogger().logEvent(
        'STATE_CHANGE',
        this.gameState.getBlockCount(),
        'Block undone by user'
      );
    }
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createRecordedSessionManager(options?: {
  config?: Partial<EvaluatorConfig>;
  sessionsDir?: string;
  logsDir?: string;
  enableRecording?: boolean;
}): RecordedSessionManager {
  return new RecordedSessionManager(options);
}
