/**
 * Ghost Evaluator v15.3 - Play Logger
 * =====================================
 * Handles logging of individual plays and decisions
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  LoggedPlay,
  LoggedEvent,
  LoggedEventType,
  EvaluatorStateSnapshot,
  EvaluatorDecision,
  BetOutcome,
  PatternSnapshot,
  AggregatedPlayRecord,
  EvaluatorAction,
  DecisionReason,
} from './types';
import {
  Block,
  PatternName,
  PATTERN_NAMES,
  CompletedTrade,
  Prediction,
} from '../types';
import { GameStateEngine } from '../engine/state';
import { ReactionEngine } from '../engine/reaction';

// ============================================================================
// PLAY LOGGER CLASS
// ============================================================================

export class PlayLogger {
  private sessionId: string;
  private plays: LoggedPlay[] = [];
  private events: LoggedEvent[] = [];
  private logsDir: string;
  private aggregatedLogPath: string;

  constructor(sessionId: string, logsDir = './data/logs') {
    this.sessionId = sessionId;
    this.logsDir = path.resolve(logsDir);
    this.aggregatedLogPath = path.join(this.logsDir, 'plays.jsonl');
    this.ensureLogDir();
  }

  /**
   * Ensure logs directory exists
   */
  private ensureLogDir(): void {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  /**
   * Create a snapshot of the current evaluator state
   */
  createStateSnapshot(
    gameState: GameStateEngine,
    reactionEngine: ReactionEngine
  ): EvaluatorStateSnapshot {
    const lifecycle = gameState.getLifecycle();
    const stats = lifecycle.getStatistics();
    const tradeStats = reactionEngine.getTradeStats();
    const pendingSignals = gameState.getPendingSignals();
    const runData = gameState.getRunData();

    const patternStates: PatternSnapshot[] = stats.map(s => ({
      name: s.pattern,
      state: s.state,
      cumulativeProfit: s.cumulativeProfit,
      allTimeProfit: s.allTimeProfit,
      observationCount: s.observationCount,
      activeCount: s.activeCount,
      lastFormationIndex: lifecycle.getCycle(s.pattern).lastFormationIndex,
    }));

    const activePatterns = PATTERN_NAMES.filter(p => lifecycle.isActive(p));
    const patternsWithSignals = [...new Set(pendingSignals.map(s => s.pattern))];

    return {
      sessionState: gameState.getSessionState(),
      p1Mode: gameState.isP1Mode(),
      currentRunLength: runData.currentLength,
      currentRunDirection: runData.currentDirection,
      totalRuns: runData.lengths.length,
      totalBets: tradeStats.totalTrades,
      totalWins: tradeStats.wins,
      totalLosses: tradeStats.losses,
      winRate: tradeStats.winRate,
      cumulativePnl: tradeStats.totalPnl,
      targetProgress: reactionEngine.getTargetProgress(),
      patternStates,
      activePatterns,
      patternsWithSignals,
    };
  }

  /**
   * Convert a prediction to an evaluator decision
   */
  createDecision(
    prediction: Prediction,
    gameState: GameStateEngine
  ): EvaluatorDecision {
    let action: EvaluatorAction;
    let reason: DecisionReason;

    if (prediction.hasPrediction) {
      action = 'PLAY';
      reason = 'PATTERN_ACTIVE';
    } else if (gameState.isP1Mode()) {
      action = 'HOLD';
      reason = 'P1_MODE_ACTIVE';
    } else if (prediction.reason.includes('DONE')) {
      action = 'STOP_SESSION';
      reason = 'DAILY_TARGET_REACHED';
    } else {
      action = 'SKIP';
      reason = 'NO_ACTIVE_PATTERNS';
    }

    return {
      action,
      reason,
      explanation: prediction.reason,
      triggerPattern: prediction.pattern,
      predictedDirection: prediction.direction,
      confidence: prediction.confidence,
    };
  }

  /**
   * Create bet outcome from completed trade
   */
  createBetOutcome(
    closedTrade: CompletedTrade | null,
    cumulativePnl: number
  ): BetOutcome {
    if (!closedTrade) {
      return { betPlaced: false };
    }

    return {
      betPlaced: true,
      pattern: closedTrade.pattern,
      predictedDirection: closedTrade.predictedDirection,
      actualDirection: closedTrade.actualDirection,
      isWin: closedTrade.isWin,
      resultPct: closedTrade.pct,
      verdict: closedTrade.isWin ? 'fair' : 'unfair',
      pnl: closedTrade.pnl,
      newCumulativePnl: cumulativePnl,
    };
  }

  /**
   * Log a play (block + decision + outcome)
   */
  logPlay(
    block: Block,
    detectedPatterns: PatternName[],
    evaluatedPatterns: PatternName[],
    stateBefore: EvaluatorStateSnapshot,
    stateAfter: EvaluatorStateSnapshot,
    decision: EvaluatorDecision,
    outcome: BetOutcome
  ): LoggedPlay {
    const play: LoggedPlay = {
      sessionId: this.sessionId,
      blockIndex: block.index,
      timestamp: new Date().toISOString(),
      block: {
        direction: block.dir,
        pct: block.pct,
        timestamp: block.ts,
      },
      detectedPatterns,
      evaluatedPatterns,
      stateBefore,
      stateAfter,
      decision,
      outcome,
      events: [],
    };

    // Detect and log events
    const events = this.detectEvents(stateBefore, stateAfter, block.index, outcome);
    play.events = events;
    this.events.push(...events);

    this.plays.push(play);

    // Append to aggregated log (fail-safe)
    this.appendToAggregatedLog(play);

    return play;
  }

  /**
   * Detect significant events from state changes
   */
  private detectEvents(
    before: EvaluatorStateSnapshot,
    after: EvaluatorStateSnapshot,
    blockIndex: number,
    outcome: BetOutcome
  ): LoggedEvent[] {
    const events: LoggedEvent[] = [];
    const ts = new Date().toISOString();

    // P1 mode changes
    if (!before.p1Mode && after.p1Mode) {
      events.push({
        type: 'P1_MODE_ENTERED',
        timestamp: ts,
        blockIndex,
        description: `P1 mode entered at run length ${after.currentRunLength}`,
        data: { runLength: after.currentRunLength },
      });
    }

    if (before.p1Mode && !after.p1Mode) {
      events.push({
        type: 'P1_MODE_CLEARED',
        timestamp: ts,
        blockIndex,
        description: 'P1 mode cleared',
      });
    }

    // Pattern activations
    for (const pattern of after.activePatterns) {
      if (!before.activePatterns.includes(pattern)) {
        events.push({
          type: 'PATTERN_ACTIVATED',
          timestamp: ts,
          blockIndex,
          description: `Pattern ${pattern} activated`,
          data: { pattern },
        });
      }
    }

    // Pattern breaks
    for (const pattern of before.activePatterns) {
      if (!after.activePatterns.includes(pattern)) {
        events.push({
          type: 'PATTERN_BROKEN',
          timestamp: ts,
          blockIndex,
          description: `Pattern ${pattern} broken`,
          data: { pattern },
        });
      }
    }

    // Session state changes
    if (before.sessionState !== after.sessionState) {
      events.push({
        type: 'STATE_CHANGE',
        timestamp: ts,
        blockIndex,
        description: `Session state changed from ${before.sessionState} to ${after.sessionState}`,
        data: { from: before.sessionState, to: after.sessionState },
      });
    }

    // First bet
    if (before.totalBets === 0 && after.totalBets === 1) {
      events.push({
        type: 'FIRST_BET',
        timestamp: ts,
        blockIndex,
        description: 'First bet placed',
      });
    }

    // First win/loss
    if (outcome.betPlaced) {
      if (before.totalWins === 0 && after.totalWins === 1) {
        events.push({
          type: 'FIRST_WIN',
          timestamp: ts,
          blockIndex,
          description: `First win: ${outcome.pnl?.toFixed(2)}`,
          data: { pnl: outcome.pnl },
        });
      }
      if (before.totalLosses === 0 && after.totalLosses === 1) {
        events.push({
          type: 'FIRST_LOSS',
          timestamp: ts,
          blockIndex,
          description: `First loss: ${outcome.pnl?.toFixed(2)}`,
          data: { pnl: outcome.pnl },
        });
      }
    }

    // Daily target reached
    if (after.targetProgress >= 100 && before.targetProgress < 100) {
      events.push({
        type: 'DAILY_TARGET_REACHED',
        timestamp: ts,
        blockIndex,
        description: `Daily target reached with P/L: ${after.cumulativePnl.toFixed(2)}`,
        data: { pnl: after.cumulativePnl },
      });
    }

    return events;
  }

  /**
   * Append play to aggregated JSONL log
   */
  private appendToAggregatedLog(play: LoggedPlay): void {
    try {
      const record: AggregatedPlayRecord = {
        sessionId: play.sessionId,
        timestamp: play.timestamp,
        blockIndex: play.blockIndex,
        direction: play.block.direction,
        pct: play.block.pct,
        runLength: play.stateAfter.currentRunLength,
        sessionState: play.stateAfter.sessionState,
        p1Mode: play.stateAfter.p1Mode,
        detectedPatterns: play.detectedPatterns.join(','),
        action: play.decision.action,
        reason: play.decision.reason,
        triggerPattern: play.decision.triggerPattern || '',
        predictedDirection: play.decision.predictedDirection || 0,
        actualDirection: play.outcome.actualDirection || play.block.direction,
        isWin: play.outcome.isWin ? 1 : 0,
        pnl: play.outcome.pnl || 0,
        cumulativePnl: play.stateAfter.cumulativePnl,
        activePatterns: play.stateAfter.activePatterns.join(','),
        winRate: play.stateAfter.winRate,
      };

      const line = JSON.stringify(record) + '\n';
      fs.appendFileSync(this.aggregatedLogPath, line, 'utf-8');
    } catch (error) {
      // Fail-safe: log error but don't break the evaluator
      console.error('Failed to append to aggregated log:', error);
    }
  }

  /**
   * Log a custom event
   */
  logEvent(
    type: LoggedEventType,
    blockIndex: number,
    description: string,
    data?: Record<string, unknown>
  ): LoggedEvent {
    const event: LoggedEvent = {
      type,
      timestamp: new Date().toISOString(),
      blockIndex,
      description,
      data,
    };
    this.events.push(event);
    return event;
  }

  /**
   * Get all logged plays
   */
  getPlays(): LoggedPlay[] {
    return [...this.plays];
  }

  /**
   * Get all logged events
   */
  getEvents(): LoggedEvent[] {
    return [...this.events];
  }

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Clear all logged data (for new session)
   */
  clear(): void {
    this.plays = [];
    this.events = [];
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createPlayLogger(sessionId?: string, logsDir?: string): PlayLogger {
  const id = sessionId || generateSessionId();
  return new PlayLogger(id, logsDir);
}

/**
 * Generate a unique session ID
 */
export function generateSessionId(): string {
  const now = new Date();
  const date = now.toISOString().split('T')[0];
  const time = now.toTimeString().split(' ')[0].replace(/:/g, '-');
  const random = Math.random().toString(36).substring(2, 6);
  return `session_${date}_${time}_${random}`;
}
