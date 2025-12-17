/**
 * Analytics Storage
 * =================
 * Persistence layer for cycle analytics data.
 * Stores analytics alongside session data for later analysis.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SessionCycleAnalytics } from '../types/cycle-analytics';
import { PatternName } from '../types';

const DATA_DIR = './data';
const ANALYTICS_DIR = path.join(DATA_DIR, 'cycle-analytics');

// ============================================================================
// STORAGE FUNCTIONS
// ============================================================================

/**
 * Save cycle analytics for a session
 */
export async function saveCycleAnalytics(
  analytics: SessionCycleAnalytics
): Promise<string> {
  const dir = path.join(ANALYTICS_DIR, getDateFolder());
  await ensureDir(dir);

  const filename = `cycle-analytics_${analytics.sessionId}.json`;
  const filepath = path.join(dir, filename);

  await fs.promises.writeFile(
    filepath,
    JSON.stringify(analytics, null, 2)
  );

  return filepath;
}

/**
 * Load cycle analytics for a specific session
 */
export async function loadCycleAnalytics(
  sessionId: string
): Promise<SessionCycleAnalytics | null> {
  try {
    const folders = await fs.promises.readdir(ANALYTICS_DIR);
    for (const folder of folders) {
      const filepath = path.join(
        ANALYTICS_DIR,
        folder,
        `cycle-analytics_${sessionId}.json`
      );
      if (fs.existsSync(filepath)) {
        const data = await fs.promises.readFile(filepath, 'utf-8');
        return JSON.parse(data);
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Load all analytics within a date range
 */
export async function loadAnalyticsRange(
  startDate: Date,
  endDate: Date
): Promise<SessionCycleAnalytics[]> {
  const results: SessionCycleAnalytics[] = [];

  try {
    await ensureDir(ANALYTICS_DIR);
    const folders = await fs.promises.readdir(ANALYTICS_DIR);

    for (const folder of folders) {
      const folderDate = parseDateFolder(folder);
      if (folderDate && folderDate >= startDate && folderDate <= endDate) {
        const folderPath = path.join(ANALYTICS_DIR, folder);
        const files = await fs.promises.readdir(folderPath);

        for (const file of files) {
          if (file.startsWith('cycle-analytics_') && file.endsWith('.json')) {
            try {
              const data = await fs.promises.readFile(
                path.join(folderPath, file),
                'utf-8'
              );
              results.push(JSON.parse(data));
            } catch {
              // Skip invalid files
            }
          }
        }
      }
    }
  } catch {
    // Directory doesn't exist yet
  }

  return results;
}

/**
 * Load analytics for the last N days
 */
export async function loadRecentAnalytics(
  days: number
): Promise<SessionCycleAnalytics[]> {
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
  return loadAnalyticsRange(startDate, endDate);
}

// ============================================================================
// AGGREGATION FUNCTIONS
// ============================================================================

export interface AggregatedPatternStats {
  pattern: PatternName;
  sessions: number;
  activations: number;
  successRate: number;
  avgObservation: number;
  avgPnL: number;
  breaks: number;
  breakAccuracy: number;
  avgDrawdown: number;
  avgPostBreakPnL: number;
  netObservationValue: number;
}

export interface AggregatedBucketStats {
  bucket: 'MAIN' | 'BNS';
  activations: number;
  successRate: number;
  avgPnL: number;
}

export interface AggregatedAnalytics {
  sessionCount: number;
  dateRange: { start: Date; end: Date };
  totalTransitions: number;
  totalActivations: number;
  totalBreaks: number;
  overallActivationSuccessRate: number;
  overallBreakAccuracy: number;
  totalNetObservationValue: number;
  perPattern: Record<string, AggregatedPatternStats>;
  perBucket: {
    MAIN: AggregatedBucketStats;
    BNS: AggregatedBucketStats;
  };
}

/**
 * Aggregate multiple session analytics into summary stats
 */
export function aggregateAnalytics(
  sessions: SessionCycleAnalytics[]
): AggregatedAnalytics {
  if (sessions.length === 0) {
    return createEmptyAggregation();
  }

  const perPattern: Record<string, AggregatedPatternStats> = {};

  // Initialize pattern stats
  const allPatterns = new Set<string>();
  for (const session of sessions) {
    for (const pattern of Object.keys(session.perPattern)) {
      allPatterns.add(pattern);
    }
  }

  for (const pattern of allPatterns) {
    perPattern[pattern] = {
      pattern: pattern as PatternName,
      sessions: 0,
      activations: 0,
      successRate: 0,
      avgObservation: 0,
      avgPnL: 0,
      breaks: 0,
      breakAccuracy: 0,
      avgDrawdown: 0,
      avgPostBreakPnL: 0,
      netObservationValue: 0,
    };
  }

  // Aggregate per-pattern stats
  for (const session of sessions) {
    for (const [pattern, stats] of Object.entries(session.perPattern)) {
      const agg = perPattern[pattern];
      if (!agg) continue;

      agg.sessions++;
      agg.activations += stats.activationCount;
      agg.breaks += stats.breakCount;
      agg.netObservationValue += stats.netObservationValue;

      // Weighted averages
      if (stats.activationCount > 0) {
        const totalAct = agg.activations;
        const prevAct = totalAct - stats.activationCount;

        agg.successRate = (agg.successRate * prevAct + stats.activationSuccessRate * stats.activationCount) / totalAct;
        agg.avgObservation = (agg.avgObservation * prevAct + stats.avgObservationBeforeActivation * stats.activationCount) / totalAct;
        agg.avgPnL = (agg.avgPnL * prevAct + stats.avgActivePeriodPnL * stats.activationCount) / totalAct;
      }

      if (stats.breakCount > 0) {
        const totalBreaks = agg.breaks;
        const prevBreaks = totalBreaks - stats.breakCount;

        agg.breakAccuracy = (agg.breakAccuracy * prevBreaks + stats.breakAccuracy * stats.breakCount) / totalBreaks;
        agg.avgDrawdown = (agg.avgDrawdown * prevBreaks + stats.avgDrawdownAtBreak * stats.breakCount) / totalBreaks;
        agg.avgPostBreakPnL = (agg.avgPostBreakPnL * prevBreaks + stats.avgPostBreakPnL * stats.breakCount) / totalBreaks;
      }
    }
  }

  // Aggregate totals
  const totalTransitions = sessions.reduce((s, sess) => s + sess.totalTransitions, 0);
  const totalActivations = sessions.reduce((s, sess) => s + sess.totalActivations, 0);
  const totalBreaks = sessions.reduce((s, sess) => s + sess.totalBreaks, 0);
  const totalNetObservationValue = sessions.reduce((s, sess) => s + sess.totalNetObservationValue, 0);

  // Weighted overall rates
  let overallActivationSuccessRate = 0;
  let overallBreakAccuracy = 0;

  if (totalActivations > 0) {
    let weightedSuccess = 0;
    for (const session of sessions) {
      weightedSuccess += session.overallActivationSuccessRate * session.totalActivations;
    }
    overallActivationSuccessRate = weightedSuccess / totalActivations;
  }

  if (totalBreaks > 0) {
    let weightedAccuracy = 0;
    for (const session of sessions) {
      weightedAccuracy += session.overallBreakAccuracy * session.totalBreaks;
    }
    overallBreakAccuracy = weightedAccuracy / totalBreaks;
  }

  // Aggregate bucket stats
  let mainActivations = 0;
  let mainSuccessSum = 0;
  let mainPnLSum = 0;
  let bnsActivations = 0;
  let bnsSuccessSum = 0;
  let bnsPnLSum = 0;

  for (const session of sessions) {
    mainActivations += session.perBucket.MAIN.activations;
    mainSuccessSum += session.perBucket.MAIN.successRate * session.perBucket.MAIN.activations;
    mainPnLSum += session.perBucket.MAIN.avgPnL * session.perBucket.MAIN.activations;

    bnsActivations += session.perBucket.BNS.activations;
    bnsSuccessSum += session.perBucket.BNS.successRate * session.perBucket.BNS.activations;
    bnsPnLSum += session.perBucket.BNS.avgPnL * session.perBucket.BNS.activations;
  }

  // Find date range
  const timestamps = sessions.map(s => new Date(s.ts).getTime());
  const startDate = new Date(Math.min(...timestamps));
  const endDate = new Date(Math.max(...timestamps));

  return {
    sessionCount: sessions.length,
    dateRange: { start: startDate, end: endDate },
    totalTransitions,
    totalActivations,
    totalBreaks,
    overallActivationSuccessRate,
    overallBreakAccuracy,
    totalNetObservationValue,
    perPattern,
    perBucket: {
      MAIN: {
        bucket: 'MAIN',
        activations: mainActivations,
        successRate: mainActivations > 0 ? mainSuccessSum / mainActivations : 0,
        avgPnL: mainActivations > 0 ? mainPnLSum / mainActivations : 0,
      },
      BNS: {
        bucket: 'BNS',
        activations: bnsActivations,
        successRate: bnsActivations > 0 ? bnsSuccessSum / bnsActivations : 0,
        avgPnL: bnsActivations > 0 ? bnsPnLSum / bnsActivations : 0,
      },
    },
  };
}

function createEmptyAggregation(): AggregatedAnalytics {
  return {
    sessionCount: 0,
    dateRange: { start: new Date(), end: new Date() },
    totalTransitions: 0,
    totalActivations: 0,
    totalBreaks: 0,
    overallActivationSuccessRate: 0,
    overallBreakAccuracy: 0,
    totalNetObservationValue: 0,
    perPattern: {},
    perBucket: {
      MAIN: { bucket: 'MAIN', activations: 0, successRate: 0, avgPnL: 0 },
      BNS: { bucket: 'BNS', activations: 0, successRate: 0, avgPnL: 0 },
    },
  };
}

// ============================================================================
// THRESHOLD ANALYSIS
// ============================================================================

export interface ThresholdAnalysisResult {
  thresholdType: 'single' | 'cumulative';
  thresholdValue: number;
  activations: number;
  avgPnL: number;
  successRate: number;
  avgDuration: number;
  comparedToCurrent: {
    pnlDifference: number;
    successRateDifference: number;
  };
}

/**
 * Analyze performance at different threshold values
 */
export function analyzeThresholds(
  _sessions: SessionCycleAnalytics[]
): ThresholdAnalysisResult[] {
  // This would require the threshold backtest data from ActivationQualityRecords
  // For now, return placeholder structure
  // TODO: Implement when we have real data with threshold backtest info

  const results: ThresholdAnalysisResult[] = [];

  // Single thresholds
  for (const threshold of [50, 60, 70, 80, 90]) {
    results.push({
      thresholdType: 'single',
      thresholdValue: threshold,
      activations: 0,
      avgPnL: 0,
      successRate: 0,
      avgDuration: 0,
      comparedToCurrent: {
        pnlDifference: 0,
        successRateDifference: 0,
      },
    });
  }

  // Cumulative thresholds
  for (const threshold of [50, 80, 100, 120, 150]) {
    results.push({
      thresholdType: 'cumulative',
      thresholdValue: threshold,
      activations: 0,
      avgPnL: 0,
      successRate: 0,
      avgDuration: 0,
      comparedToCurrent: {
        pnlDifference: 0,
        successRateDifference: 0,
      },
    });
  }

  return results;
}

// ============================================================================
// HELPERS
// ============================================================================

function getDateFolder(): string {
  return new Date().toISOString().split('T')[0];
}

function parseDateFolder(folder: string): Date | null {
  const match = folder.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (match) {
    return new Date(match[1]);
  }
  return null;
}

async function ensureDir(dir: string): Promise<void> {
  try {
    await fs.promises.mkdir(dir, { recursive: true });
  } catch {
    // Directory might already exist
  }
}
