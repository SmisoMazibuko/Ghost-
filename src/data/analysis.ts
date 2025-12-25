/**
 * Ghost Evaluator v15.3 - Analysis Toolkit
 * =========================================
 * Tools for analyzing logged session data
 */

import {
  SessionLog,
  LoggedPlay,
  PlayFilter,
  AggregatedPlayRecord,
} from './types';
import { loadAllSessions, loadSession } from './session-recorder';
import {
  PatternName,
  SessionState,
  PATTERN_NAMES,
} from '../types';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// ANALYSIS RESULTS TYPES
// ============================================================================

export interface PatternPerformance {
  pattern: PatternName;
  totalSignals: number;
  totalBets: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  avgPnl: number;
  activations: number;
  breaks: number;
  avgActiveBlocks: number;
}

export interface SessionStateAnalysis {
  state: SessionState;
  totalBlocks: number;
  betsPlaced: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  avgPnl: number;
}

export interface P1ModeAnalysis {
  totalOccurrences: number;
  totalBlocksInP1: number;
  avgBlocksPerOccurrence: number;
  precedingPatterns: Record<PatternName, number>;
  precedingRunLengths: number[];
  avgPrecedingRunLength: number;
  recoveryRate: number;
  pnlDuringP1: number;
}

export interface OverallAnalysis {
  totalSessions: number;
  totalBlocks: number;
  totalBets: number;
  totalWins: number;
  totalLosses: number;
  overallWinRate: number;
  totalPnl: number;
  avgPnlPerSession: number;
  avgPnlPerBet: number;
  profitableSessions: number;
  unprofitableSessions: number;
  sessionsReachingTarget: number;
  patternPerformance: PatternPerformance[];
  stateAnalysis: SessionStateAnalysis[];
  p1Analysis: P1ModeAnalysis;
}

// ============================================================================
// DATA LOADER
// ============================================================================

export class DataLoader {
  private sessionsDir: string;
  private logsDir: string;

  constructor(sessionsDir = './data/sessions', logsDir = './data/logs') {
    this.sessionsDir = path.resolve(sessionsDir);
    this.logsDir = path.resolve(logsDir);
  }

  /**
   * Load all sessions
   */
  loadSessions(): SessionLog[] {
    return loadAllSessions(this.sessionsDir);
  }

  /**
   * Load a specific session
   */
  loadSessionById(sessionId: string): SessionLog | null {
    const files = fs.readdirSync(this.sessionsDir)
      .filter(f => f.includes(sessionId) && f.endsWith('.json'));

    if (files.length === 0) return null;
    return loadSession(path.join(this.sessionsDir, files[0]));
  }

  /**
   * Load aggregated plays from JSONL
   */
  loadAggregatedPlays(): AggregatedPlayRecord[] {
    const filePath = path.join(this.logsDir, 'plays.jsonl');
    if (!fs.existsSync(filePath)) return [];

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(l => l.length > 0);

    return lines.map(line => JSON.parse(line) as AggregatedPlayRecord);
  }

  /**
   * Get all plays from all sessions
   */
  getAllPlays(): LoggedPlay[] {
    const sessions = this.loadSessions();
    return sessions.flatMap(s => s.plays);
  }
}

// ============================================================================
// PLAY FILTER
// ============================================================================

export function filterPlays(plays: LoggedPlay[], filter: PlayFilter): LoggedPlay[] {
  return plays.filter(play => {
    if (filter.sessionIds && !filter.sessionIds.includes(play.sessionId)) {
      return false;
    }

    if (filter.dateRange) {
      const ts = new Date(play.timestamp);
      const start = new Date(filter.dateRange.start);
      const end = new Date(filter.dateRange.end);
      if (ts < start || ts > end) return false;
    }

    if (filter.patterns && filter.patterns.length > 0) {
      const hasPattern = filter.patterns.some(p =>
        play.detectedPatterns.includes(p) ||
        play.decision.triggerPattern === p
      );
      if (!hasPattern) return false;
    }

    if (filter.sessionStates && !filter.sessionStates.includes(play.stateAfter.sessionState)) {
      return false;
    }

    if (filter.actions && !filter.actions.includes(play.decision.action)) {
      return false;
    }

    if (filter.minPct !== undefined && play.block.pct < filter.minPct) {
      return false;
    }

    if (filter.maxPct !== undefined && play.block.pct > filter.maxPct) {
      return false;
    }

    if (filter.onlyBets && !play.outcome.betPlaced) {
      return false;
    }

    if (filter.onlyWins && (!play.outcome.betPlaced || !play.outcome.isWin)) {
      return false;
    }

    if (filter.onlyLosses && (!play.outcome.betPlaced || play.outcome.isWin)) {
      return false;
    }

    if (filter.p1ModeOnly && !play.stateAfter.p1Mode) {
      return false;
    }

    return true;
  });
}

// ============================================================================
// ANALYSIS FUNCTIONS
// ============================================================================

/**
 * Analyze pattern performance
 */
export function analyzePatternPerformance(plays: LoggedPlay[]): PatternPerformance[] {
  const results: PatternPerformance[] = [];

  for (const pattern of PATTERN_NAMES) {
    const patternPlays = plays.filter(p =>
      p.detectedPatterns.includes(pattern) ||
      p.decision.triggerPattern === pattern ||
      p.outcome.pattern === pattern
    );

    const bets = patternPlays.filter(p =>
      p.outcome.betPlaced && p.outcome.pattern === pattern
    );

    const wins = bets.filter(p => p.outcome.isWin);
    const losses = bets.filter(p => !p.outcome.isWin);
    const totalPnl = bets.reduce((sum, p) => sum + (p.outcome.pnl || 0), 0);

    // Count activations and breaks from events
    const activations = plays.filter(p =>
      p.events.some(e => e.type === 'PATTERN_ACTIVATED' && e.data?.pattern === pattern)
    ).length;

    const breaks = plays.filter(p =>
      p.events.some(e => e.type === 'PATTERN_BROKEN' && e.data?.pattern === pattern)
    ).length;

    results.push({
      pattern,
      totalSignals: patternPlays.length,
      totalBets: bets.length,
      wins: wins.length,
      losses: losses.length,
      winRate: bets.length > 0 ? (wins.length / bets.length) * 100 : 0,
      totalPnl,
      avgPnl: bets.length > 0 ? totalPnl / bets.length : 0,
      activations,
      breaks,
      avgActiveBlocks: activations > 0 ? patternPlays.length / activations : 0,
    });
  }

  return results.sort((a, b) => b.totalPnl - a.totalPnl);
}

/**
 * Analyze performance by session state
 */
export function analyzeBySessionState(plays: LoggedPlay[]): SessionStateAnalysis[] {
  const states: SessionState[] = ['playable', 'unplayable', 'done'];
  const results: SessionStateAnalysis[] = [];

  for (const state of states) {
    const statePlays = plays.filter(p => p.stateAfter.sessionState === state);
    const bets = statePlays.filter(p => p.outcome.betPlaced);
    const wins = bets.filter(p => p.outcome.isWin);
    const losses = bets.filter(p => !p.outcome.isWin);
    const totalPnl = bets.reduce((sum, p) => sum + (p.outcome.pnl || 0), 0);

    results.push({
      state,
      totalBlocks: statePlays.length,
      betsPlaced: bets.length,
      wins: wins.length,
      losses: losses.length,
      winRate: bets.length > 0 ? (wins.length / bets.length) * 100 : 0,
      totalPnl,
      avgPnl: bets.length > 0 ? totalPnl / bets.length : 0,
    });
  }

  return results;
}

/**
 * Analyze P1 mode occurrences
 */
export function analyzeP1Mode(sessions: SessionLog[]): P1ModeAnalysis {
  let totalOccurrences = 0;
  let totalBlocksInP1 = 0;
  const precedingPatterns: Record<PatternName, number> = {} as Record<PatternName, number>;
  const precedingRunLengths: number[] = [];
  let recoveries = 0;
  let pnlDuringP1 = 0;

  for (const p of PATTERN_NAMES) {
    precedingPatterns[p] = 0;
  }

  for (const session of sessions) {
    const p1Events = session.events.filter(e => e.type === 'P1_MODE_ENTERED');
    const p1Clears = session.events.filter(e => e.type === 'P1_MODE_CLEARED');

    totalOccurrences += p1Events.length;
    recoveries += p1Clears.length;
    totalBlocksInP1 += session.summary.blocksInP1Mode;

    // Analyze what happened before P1
    for (const event of p1Events) {
      const blockIdx = event.blockIndex;
      if (blockIdx > 0) {
        const prevPlay = session.plays.find(p => p.blockIndex === blockIdx - 1);
        if (prevPlay) {
          precedingRunLengths.push(prevPlay.stateAfter.currentRunLength);
          for (const pattern of prevPlay.stateAfter.activePatterns) {
            precedingPatterns[pattern]++;
          }
        }
      }
    }

    // Calculate P/L during P1
    const p1Plays = session.plays.filter(p => p.stateAfter.p1Mode && p.outcome.betPlaced);
    pnlDuringP1 += p1Plays.reduce((sum, p) => sum + (p.outcome.pnl || 0), 0);
  }

  const avgRunLength = precedingRunLengths.length > 0
    ? precedingRunLengths.reduce((a, b) => a + b, 0) / precedingRunLengths.length
    : 0;

  return {
    totalOccurrences,
    totalBlocksInP1,
    avgBlocksPerOccurrence: totalOccurrences > 0 ? totalBlocksInP1 / totalOccurrences : 0,
    precedingPatterns,
    precedingRunLengths,
    avgPrecedingRunLength: avgRunLength,
    recoveryRate: totalOccurrences > 0 ? (recoveries / totalOccurrences) * 100 : 0,
    pnlDuringP1,
  };
}

/**
 * Generate complete analysis
 */
export function generateOverallAnalysis(sessions: SessionLog[]): OverallAnalysis {
  const allPlays = sessions.flatMap(s => s.plays);
  const allBets = allPlays.filter(p => p.outcome.betPlaced);

  const totalWins = allBets.filter(p => p.outcome.isWin).length;
  const totalLosses = allBets.length - totalWins;
  const totalPnl = sessions.reduce((sum, s) => sum + s.summary.finalPnl, 0);

  return {
    totalSessions: sessions.length,
    totalBlocks: allPlays.length,
    totalBets: allBets.length,
    totalWins,
    totalLosses,
    overallWinRate: allBets.length > 0 ? (totalWins / allBets.length) * 100 : 0,
    totalPnl,
    avgPnlPerSession: sessions.length > 0 ? totalPnl / sessions.length : 0,
    avgPnlPerBet: allBets.length > 0 ? totalPnl / allBets.length : 0,
    profitableSessions: sessions.filter(s => s.summary.finalPnl > 0).length,
    unprofitableSessions: sessions.filter(s => s.summary.finalPnl < 0).length,
    sessionsReachingTarget: sessions.filter(s => s.summary.targetReached).length,
    patternPerformance: analyzePatternPerformance(allPlays),
    stateAnalysis: analyzeBySessionState(allPlays),
    p1Analysis: analyzeP1Mode(sessions),
  };
}

// ============================================================================
// EXPORT FUNCTIONS
// ============================================================================

/**
 * Export analysis to JSON
 */
export function exportAnalysisToJson(analysis: OverallAnalysis, filePath: string): void {
  fs.writeFileSync(filePath, JSON.stringify(analysis, null, 2), 'utf-8');
}

/**
 * Export plays to CSV
 */
export function exportPlaysToCSV(plays: LoggedPlay[], filePath: string): void {
  const headers = [
    'sessionId', 'blockIndex', 'timestamp', 'direction', 'pct',
    'runLength', 'sessionState', 'p1Mode', 'detectedPatterns',
    'action', 'reason', 'triggerPattern', 'predictedDirection',
    'betPlaced', 'isWin', 'pnl', 'cumulativePnl', 'activePatterns', 'winRate'
  ].join(',');

  const rows = plays.map(p => [
    p.sessionId,
    p.blockIndex,
    p.timestamp,
    p.block.direction,
    p.block.pct,
    p.stateAfter.currentRunLength,
    p.stateAfter.sessionState,
    p.stateAfter.p1Mode ? 1 : 0,
    `"${p.detectedPatterns.join(';')}"`,
    p.decision.action,
    p.decision.reason,
    p.decision.triggerPattern || '',
    p.decision.predictedDirection || '',
    p.outcome.betPlaced ? 1 : 0,
    p.outcome.isWin ? 1 : 0,
    p.outcome.pnl || 0,
    p.stateAfter.cumulativePnl,
    `"${p.stateAfter.activePatterns.join(';')}"`,
    p.stateAfter.winRate.toFixed(2)
  ].join(','));

  fs.writeFileSync(filePath, [headers, ...rows].join('\n'), 'utf-8');
}

// ============================================================================
// QUERY HELPERS
// ============================================================================

/**
 * Find plays where a specific pattern performed well/poorly
 */
export function findPatternPlays(
  plays: LoggedPlay[],
  pattern: PatternName,
  onlyWins?: boolean
): LoggedPlay[] {
  return plays.filter(p =>
    p.outcome.betPlaced &&
    p.outcome.pattern === pattern &&
    (onlyWins === undefined || p.outcome.isWin === onlyWins)
  );
}

/**
 * Find plays that preceded P1 mode
 */
export function findPreP1Plays(plays: LoggedPlay[], lookback = 5): LoggedPlay[] {
  const results: LoggedPlay[] = [];

  for (let i = lookback; i < plays.length; i++) {
    if (plays[i].events.some(e => e.type === 'P1_MODE_ENTERED')) {
      results.push(...plays.slice(i - lookback, i));
    }
  }

  return results;
}

/**
 * Find unplayable periods
 */
export function findUnplayablePeriods(plays: LoggedPlay[]): { start: number; end: number; duration: number }[] {
  const periods: { start: number; end: number; duration: number }[] = [];
  let inUnplayable = false;
  let startIdx = 0;

  for (let i = 0; i < plays.length; i++) {
    if (plays[i].stateAfter.sessionState === 'unplayable' && !inUnplayable) {
      inUnplayable = true;
      startIdx = i;
    } else if (plays[i].stateAfter.sessionState !== 'unplayable' && inUnplayable) {
      inUnplayable = false;
      periods.push({
        start: startIdx,
        end: i - 1,
        duration: i - startIdx,
      });
    }
  }

  if (inUnplayable) {
    periods.push({
      start: startIdx,
      end: plays.length - 1,
      duration: plays.length - startIdx,
    });
  }

  return periods;
}
