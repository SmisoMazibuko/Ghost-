/**
 * Ghost Evaluator v15.1 - Research Testing Framework
 * ===================================================
 *
 * Methodology to test assumptions about P1 and B&S modes,
 * and to discover new indicators for these modes.
 *
 * PHASE 1: Data logging (DONE)
 * PHASE 2: Hypothesis testing & indicator discovery (THIS FILE)
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  PatternName,
  Block,
  PATTERN_NAMES,
} from '../types';
import { SessionLog } from './types';
import {
  ResearchData,
  P1Event,
  PatternBnSData,
} from './research-types';

// ============================================================================
// HYPOTHESIS DEFINITIONS
// ============================================================================

/**
 * A testable hypothesis about market behavior
 */
export interface Hypothesis {
  id: string;
  name: string;
  description: string;
  category: 'P1' | 'BNS' | 'INDICATOR' | 'GENERAL';
  testFunction: (data: TestingData) => HypothesisResult;
}

/**
 * Result of testing a hypothesis
 */
export interface HypothesisResult {
  hypothesisId: string;
  supported: boolean;
  confidence: number;  // 0-100%
  sampleSize: number;
  details: {
    metric: string;
    expected: string;
    actual: string | number;
    passed: boolean;
  }[];
  rawData?: unknown;
  recommendations: string[];
}

/**
 * Data container for testing
 */
export interface TestingData {
  sessions: SessionLog[];
  researchData: ResearchData[];
  blocks: Block[];
  p1Events: P1Event[];
  patternBnSData: Record<PatternName, PatternBnSData>[];
}

// ============================================================================
// P1 HYPOTHESES
// ============================================================================

export const P1_HYPOTHESES: Hypothesis[] = [
  {
    id: 'P1_H1',
    name: 'P1 Run Length Distribution',
    description: 'Most P1 events (7+ runs) end between 7-9 blocks, with diminishing probability beyond 9',
    category: 'P1',
    testFunction: testP1RunLengthDistribution,
  },
  {
    id: 'P1_H2',
    name: 'P1 Reversal Profitability at 7',
    description: 'Betting reversal at run length 7 is profitable (>50% win rate)',
    category: 'P1',
    testFunction: testP1ReversalAt7,
  },
  {
    id: 'P1_H3',
    name: 'P1 Reversal Profitability Increases with Length',
    description: 'Win rate of reversal bets increases as run length increases (7<8<9<10+)',
    category: 'P1',
    testFunction: testP1ReversalScaling,
  },
  {
    id: 'P1_H4',
    name: 'Pre-P1 Escalation Pattern',
    description: 'Before P1, we see escalating run lengths (3→4→5→6→7+)',
    category: 'P1',
    testFunction: testPreP1Escalation,
  },
  {
    id: 'P1_H5',
    name: 'Pre-P1 Pattern Failures',
    description: 'Multiple patterns break in the 10 blocks before P1',
    category: 'P1',
    testFunction: testPreP1PatternFailures,
  },
  {
    id: 'P1_H6',
    name: 'P1 Recovery Time',
    description: 'After P1 ends, market takes 10-20 blocks to normalize',
    category: 'P1',
    testFunction: testP1RecoveryTime,
  },
  {
    id: 'P1_H7',
    name: 'False P1 vs Real P1 Ratio',
    description: 'Most 7-runs are "false P1" (end at 7-8) vs "real P1" (extend to 9+)',
    category: 'P1',
    testFunction: testFalseVsRealP1Ratio,
  },
];

// ============================================================================
// B&S HYPOTHESES
// ============================================================================

export const BNS_HYPOTHESES: Hypothesis[] = [
  {
    id: 'BNS_H1',
    name: 'B&S Cycle Detection Threshold',
    description: '2 activation→break cycles reliably predicts continued B&S behavior',
    category: 'BNS',
    testFunction: testBnSCycleThreshold,
  },
  {
    id: 'BNS_H2',
    name: 'Inverse Strategy Profitability',
    description: 'Betting inverse during confirmed B&S (3+ cycles) is profitable',
    category: 'BNS',
    testFunction: testInverseStrategyProfitability,
  },
  {
    id: 'BNS_H3',
    name: 'B&S Pattern Clustering',
    description: 'When one pattern enters B&S, others likely follow within 10 blocks',
    category: 'BNS',
    testFunction: testBnSPatternClustering,
  },
  {
    id: 'BNS_H4',
    name: 'B&S Duration',
    description: 'B&S mode typically lasts 15-30 blocks before patterns recover',
    category: 'BNS',
    testFunction: testBnSDuration,
  },
  {
    id: 'BNS_H5',
    name: 'B&S Exit Reliability',
    description: '2 consecutive confirmations reliably signals B&S exit',
    category: 'BNS',
    testFunction: testBnSExitReliability,
  },
  {
    id: 'BNS_H6',
    name: 'B&S Precedes P1',
    description: 'B&S dominant state often precedes P1 activation',
    category: 'BNS',
    testFunction: testBnSPrecedesP1,
  },
];

// ============================================================================
// INDICATOR DISCOVERY HYPOTHESES
// ============================================================================

export const INDICATOR_HYPOTHESES: Hypothesis[] = [
  {
    id: 'IND_H1',
    name: 'Choppy State Indicator',
    description: 'Average run length < 1.5 reliably indicates choppy/unprofitable state',
    category: 'INDICATOR',
    testFunction: testChoppyIndicator,
  },
  {
    id: 'IND_H2',
    name: 'Direction Imbalance Indicator',
    description: '>65% same direction in 20 blocks predicts P1 or continued trend',
    category: 'INDICATOR',
    testFunction: testDirectionImbalanceIndicator,
  },
  {
    id: 'IND_H3',
    name: 'Pattern Churn Indicator',
    description: '3+ pattern breaks in 10 blocks indicates hostile market',
    category: 'INDICATOR',
    testFunction: testPatternChurnIndicator,
  },
  {
    id: 'IND_H4',
    name: 'Win Rate Decline Indicator',
    description: 'Win rate dropping below 45% predicts continued losses',
    category: 'INDICATOR',
    testFunction: testWinRateDeclineIndicator,
  },
  {
    id: 'IND_H5',
    name: 'High Pct Loss Indicator',
    description: 'Single loss >70% pct indicates hostile market conditions',
    category: 'INDICATOR',
    testFunction: testHighPctLossIndicator,
  },
  {
    id: 'IND_H6',
    name: 'Alternating 3A3 Pre-P1 Indicator',
    description: 'Pure 3-3-3 alternation pattern predicts P1 within 10 blocks',
    category: 'INDICATOR',
    testFunction: testAlternating3A3Indicator,
  },
];

// ============================================================================
// TEST IMPLEMENTATIONS - P1
// ============================================================================

function testP1RunLengthDistribution(data: TestingData): HypothesisResult {
  const p1Events = data.p1Events;
  if (p1Events.length === 0) {
    return createEmptyResult('P1_H1', 'No P1 events found');
  }

  const distribution: Record<number, number> = {};
  for (const event of p1Events) {
    const length = event.peakRunLength;
    distribution[length] = (distribution[length] || 0) + 1;
  }

  const total = p1Events.length;
  const at7to9 = (distribution[7] || 0) + (distribution[8] || 0) + (distribution[9] || 0);
  const percentAt7to9 = (at7to9 / total) * 100;

  const details = Object.entries(distribution)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([length, count]) => ({
      metric: `Run length ${length}`,
      expected: 'Varies',
      actual: `${count} (${((count / total) * 100).toFixed(1)}%)`,
      passed: true,
    }));

  return {
    hypothesisId: 'P1_H1',
    supported: percentAt7to9 >= 60,
    confidence: percentAt7to9,
    sampleSize: total,
    details: [
      {
        metric: 'P1 events at length 7-9',
        expected: '>60%',
        actual: `${percentAt7to9.toFixed(1)}%`,
        passed: percentAt7to9 >= 60,
      },
      ...details,
    ],
    rawData: distribution,
    recommendations: percentAt7to9 < 60
      ? ['P1 runs extend beyond 9 more than expected - adjust reversal timing']
      : ['Distribution matches expectation'],
  };
}

function testP1ReversalAt7(data: TestingData): HypothesisResult {
  const p1Events = data.p1Events;
  const validEvents = p1Events.filter(e => e.hypotheticalPlays?.reversalAt7);

  if (validEvents.length === 0) {
    return createEmptyResult('P1_H2', 'No P1 events with reversal data at 7');
  }

  let wins = 0;
  let totalPnL = 0;
  for (const event of validEvents) {
    if (event.hypotheticalPlays.reversalAt7.wouldWin) {
      wins++;
    }
    totalPnL += event.hypotheticalPlays.reversalAt7.pnl;
  }

  const winRate = (wins / validEvents.length) * 100;
  const avgPnL = totalPnL / validEvents.length;

  return {
    hypothesisId: 'P1_H2',
    supported: winRate > 50,
    confidence: winRate,
    sampleSize: validEvents.length,
    details: [
      {
        metric: 'Win rate at reversal 7',
        expected: '>50%',
        actual: `${winRate.toFixed(1)}%`,
        passed: winRate > 50,
      },
      {
        metric: 'Average P/L per reversal',
        expected: '>0',
        actual: avgPnL.toFixed(2),
        passed: avgPnL > 0,
      },
      {
        metric: 'Total hypothetical P/L',
        expected: '>0',
        actual: totalPnL.toFixed(2),
        passed: totalPnL > 0,
      },
    ],
    recommendations: winRate <= 50
      ? ['Reversal at 7 is not profitable - wait for longer runs']
      : ['Reversal at 7 is viable strategy'],
  };
}

function testP1ReversalScaling(data: TestingData): HypothesisResult {
  const p1Events = data.p1Events;

  const winRates: Record<string, { wins: number; total: number }> = {
    at7: { wins: 0, total: 0 },
    at8: { wins: 0, total: 0 },
    at9: { wins: 0, total: 0 },
    at10Plus: { wins: 0, total: 0 },
  };

  for (const event of p1Events) {
    const plays = event.hypotheticalPlays;
    if (plays?.reversalAt7) {
      winRates.at7.total++;
      if (plays.reversalAt7.wouldWin) winRates.at7.wins++;
    }
    if (plays?.reversalAt8) {
      winRates.at8.total++;
      if (plays.reversalAt8.wouldWin) winRates.at8.wins++;
    }
    if (plays?.reversalAt9) {
      winRates.at9.total++;
      if (plays.reversalAt9.wouldWin) winRates.at9.wins++;
    }
    if (plays?.reversalAt10Plus) {
      winRates.at10Plus.total++;
      if (plays.reversalAt10Plus.wouldWin) winRates.at10Plus.wins++;
    }
  }

  const rates = {
    at7: winRates.at7.total > 0 ? (winRates.at7.wins / winRates.at7.total) * 100 : 0,
    at8: winRates.at8.total > 0 ? (winRates.at8.wins / winRates.at8.total) * 100 : 0,
    at9: winRates.at9.total > 0 ? (winRates.at9.wins / winRates.at9.total) * 100 : 0,
    at10Plus: winRates.at10Plus.total > 0 ? (winRates.at10Plus.wins / winRates.at10Plus.total) * 100 : 0,
  };

  const isScaling = rates.at7 <= rates.at8 && rates.at8 <= rates.at9;

  return {
    hypothesisId: 'P1_H3',
    supported: isScaling,
    confidence: isScaling ? 80 : 40,
    sampleSize: p1Events.length,
    details: [
      { metric: 'Win rate at 7', expected: 'Baseline', actual: `${rates.at7.toFixed(1)}% (n=${winRates.at7.total})`, passed: true },
      { metric: 'Win rate at 8', expected: `>${rates.at7.toFixed(1)}%`, actual: `${rates.at8.toFixed(1)}% (n=${winRates.at8.total})`, passed: rates.at8 >= rates.at7 },
      { metric: 'Win rate at 9', expected: `>${rates.at8.toFixed(1)}%`, actual: `${rates.at9.toFixed(1)}% (n=${winRates.at9.total})`, passed: rates.at9 >= rates.at8 },
      { metric: 'Win rate at 10+', expected: `>${rates.at9.toFixed(1)}%`, actual: `${rates.at10Plus.toFixed(1)}% (n=${winRates.at10Plus.total})`, passed: rates.at10Plus >= rates.at9 },
    ],
    rawData: { winRates, rates },
    recommendations: isScaling
      ? ['Reversal win rate scales with run length - larger stakes at longer runs']
      : ['Scaling not confirmed - use flat stake across run lengths'],
  };
}

function testPreP1Escalation(data: TestingData): HypothesisResult {
  const p1Events = data.p1Events;
  let escalationCount = 0;

  for (const event of p1Events) {
    if (event.preP1Phase?.wasEscalating) {
      escalationCount++;
    }
  }

  const escalationRate = p1Events.length > 0 ? (escalationCount / p1Events.length) * 100 : 0;

  return {
    hypothesisId: 'P1_H4',
    supported: escalationRate >= 60,
    confidence: escalationRate,
    sampleSize: p1Events.length,
    details: [
      {
        metric: 'P1 events preceded by escalation',
        expected: '>60%',
        actual: `${escalationRate.toFixed(1)}%`,
        passed: escalationRate >= 60,
      },
    ],
    recommendations: escalationRate >= 60
      ? ['Escalation is reliable P1 predictor - reduce stake when escalation detected']
      : ['Escalation not reliable - look for other P1 indicators'],
  };
}

function testPreP1PatternFailures(data: TestingData): HypothesisResult {
  const p1Events = data.p1Events;
  let failureCount = 0;
  let totalPatternsBroken = 0;

  for (const event of p1Events) {
    const broken = event.preP1Phase?.patternsBroken?.length || 0;
    totalPatternsBroken += broken;
    if (broken >= 2) {
      failureCount++;
    }
  }

  const failureRate = p1Events.length > 0 ? (failureCount / p1Events.length) * 100 : 0;
  const avgBroken = p1Events.length > 0 ? totalPatternsBroken / p1Events.length : 0;

  return {
    hypothesisId: 'P1_H5',
    supported: failureRate >= 50,
    confidence: failureRate,
    sampleSize: p1Events.length,
    details: [
      {
        metric: 'P1 events with 2+ patterns broken before',
        expected: '>50%',
        actual: `${failureRate.toFixed(1)}%`,
        passed: failureRate >= 50,
      },
      {
        metric: 'Average patterns broken before P1',
        expected: '>1',
        actual: avgBroken.toFixed(2),
        passed: avgBroken > 1,
      },
    ],
    recommendations: failureRate >= 50
      ? ['Pattern breaks are P1 warning sign - monitor pattern health']
      : ['Pattern breaks not reliable P1 indicator'],
  };
}

function testP1RecoveryTime(data: TestingData): HypothesisResult {
  const p1Events = data.p1Events;
  const recoveryTimes: number[] = [];

  for (const event of p1Events) {
    if (event.postP1?.blocksUntilNormal > 0) {
      recoveryTimes.push(event.postP1.blocksUntilNormal);
    }
  }

  if (recoveryTimes.length === 0) {
    return createEmptyResult('P1_H6', 'No recovery data available');
  }

  const avgRecovery = recoveryTimes.reduce((a, b) => a + b, 0) / recoveryTimes.length;
  const inRange = recoveryTimes.filter(t => t >= 10 && t <= 20).length;
  const inRangeRate = (inRange / recoveryTimes.length) * 100;

  return {
    hypothesisId: 'P1_H6',
    supported: avgRecovery >= 10 && avgRecovery <= 20,
    confidence: inRangeRate,
    sampleSize: recoveryTimes.length,
    details: [
      {
        metric: 'Average recovery time',
        expected: '10-20 blocks',
        actual: `${avgRecovery.toFixed(1)} blocks`,
        passed: avgRecovery >= 10 && avgRecovery <= 20,
      },
      {
        metric: 'Recoveries in 10-20 range',
        expected: '>50%',
        actual: `${inRangeRate.toFixed(1)}%`,
        passed: inRangeRate >= 50,
      },
    ],
    rawData: recoveryTimes,
    recommendations: avgRecovery < 10
      ? ['Recovery faster than expected - can resume trading sooner']
      : avgRecovery > 20
        ? ['Recovery slower than expected - extend wait time after P1']
        : ['Recovery time matches expectation'],
  };
}

function testFalseVsRealP1Ratio(data: TestingData): HypothesisResult {
  const p1Events = data.p1Events;
  const falseP1 = p1Events.filter(e => e.type === 'false_p1').length;
  const realP1 = p1Events.filter(e => e.type === 'real_p1').length;

  const falseRate = p1Events.length > 0 ? (falseP1 / p1Events.length) * 100 : 0;

  return {
    hypothesisId: 'P1_H7',
    supported: falseRate >= 50,
    confidence: falseRate,
    sampleSize: p1Events.length,
    details: [
      {
        metric: 'False P1 (ends at 7-8)',
        expected: '>50%',
        actual: `${falseP1} (${falseRate.toFixed(1)}%)`,
        passed: falseRate >= 50,
      },
      {
        metric: 'Real P1 (extends to 9+)',
        expected: '<50%',
        actual: `${realP1} (${(100 - falseRate).toFixed(1)}%)`,
        passed: falseRate >= 50,
      },
    ],
    recommendations: falseRate >= 50
      ? ['Most P1s are false - reversal at 7-8 is reasonable']
      : ['Real P1s are common - wait for longer runs before reversal'],
  };
}

// ============================================================================
// TEST IMPLEMENTATIONS - B&S
// ============================================================================

function testBnSCycleThreshold(data: TestingData): HypothesisResult {
  // Analyze if 2 cycles reliably predicts more cycles
  const allBnSData = data.patternBnSData;
  let twoThenMore = 0;
  let twoThenStop = 0;

  for (const patternData of allBnSData) {
    for (const pattern of PATTERN_NAMES) {
      const pData = patternData[pattern];
      if (!pData?.cycles) continue;

      // Look for sequences where we had 2 cycles - did a 3rd follow?
      for (let i = 1; i < pData.cycles.length - 1; i++) {
        const cycle1 = pData.cycles[i - 1];
        const cycle2 = pData.cycles[i];
        const cycle3 = pData.cycles[i + 1];

        // If cycles 1 and 2 are within window (30 blocks)
        if (cycle2.activation.blockIndex - cycle1.activation.blockIndex <= 30) {
          // Check if cycle 3 followed within window
          if (cycle3.activation.blockIndex - cycle2.activation.blockIndex <= 30) {
            twoThenMore++;
          } else {
            twoThenStop++;
          }
        }
      }
    }
  }

  const total = twoThenMore + twoThenStop;
  const continuationRate = total > 0 ? (twoThenMore / total) * 100 : 0;

  return {
    hypothesisId: 'BNS_H1',
    supported: continuationRate >= 60,
    confidence: continuationRate,
    sampleSize: total,
    details: [
      {
        metric: '2 cycles followed by more',
        expected: '>60%',
        actual: `${twoThenMore} (${continuationRate.toFixed(1)}%)`,
        passed: continuationRate >= 60,
      },
      {
        metric: '2 cycles then stopped',
        expected: '<40%',
        actual: `${twoThenStop} (${(100 - continuationRate).toFixed(1)}%)`,
        passed: continuationRate >= 60,
      },
    ],
    recommendations: continuationRate >= 60
      ? ['2 cycles is reliable B&S predictor - switch to inverse at 2']
      : ['2 cycles not reliable - wait for 3 cycles before inverse'],
  };
}

function testInverseStrategyProfitability(data: TestingData): HypothesisResult {
  let totalInversePnL = 0;
  let totalCycles = 0;
  let wins = 0;

  for (const patternData of data.patternBnSData) {
    for (const pattern of PATTERN_NAMES) {
      const pData = patternData[pattern];
      if (!pData?.cycles) continue;

      for (const cycle of pData.cycles) {
        totalCycles++;
        totalInversePnL += cycle.hypotheticalInversePnL;
        if (cycle.hypotheticalInversePnL > 0) {
          wins++;
        }
      }
    }
  }

  const winRate = totalCycles > 0 ? (wins / totalCycles) * 100 : 0;
  const avgPnL = totalCycles > 0 ? totalInversePnL / totalCycles : 0;

  return {
    hypothesisId: 'BNS_H2',
    supported: winRate > 50 && totalInversePnL > 0,
    confidence: winRate,
    sampleSize: totalCycles,
    details: [
      {
        metric: 'Inverse strategy win rate',
        expected: '>50%',
        actual: `${winRate.toFixed(1)}%`,
        passed: winRate > 50,
      },
      {
        metric: 'Total hypothetical inverse P/L',
        expected: '>0',
        actual: totalInversePnL.toFixed(2),
        passed: totalInversePnL > 0,
      },
      {
        metric: 'Average P/L per inverse trade',
        expected: '>0',
        actual: avgPnL.toFixed(2),
        passed: avgPnL > 0,
      },
    ],
    recommendations: winRate > 50
      ? ['Inverse strategy is profitable during B&S - implement it']
      : ['Inverse strategy not profitable - reconsider B&S play'],
  };
}

function testBnSPatternClustering(data: TestingData): HypothesisResult {
  // Check if B&S tends to affect multiple patterns at once
  // This requires analyzing block records for concurrent B&S modes
  const blockRecords = data.researchData.flatMap(r => r.blockRecords);

  let clusteringCount = 0;
  let nonClusteringCount = 0;

  for (const record of blockRecords) {
    if (!record.patternStates) continue;

    const patternsInBnS = PATTERN_NAMES.filter(
      p => record.patternStates[p]?.mode === 'bns'
    ).length;

    if (patternsInBnS === 1) {
      nonClusteringCount++;
    } else if (patternsInBnS >= 2) {
      clusteringCount++;
    }
  }

  const total = clusteringCount + nonClusteringCount;
  const clusteringRate = total > 0 ? (clusteringCount / total) * 100 : 0;

  return {
    hypothesisId: 'BNS_H3',
    supported: clusteringRate >= 40,
    confidence: clusteringRate,
    sampleSize: total,
    details: [
      {
        metric: 'Blocks with 2+ patterns in B&S',
        expected: '>40%',
        actual: `${clusteringCount} (${clusteringRate.toFixed(1)}%)`,
        passed: clusteringRate >= 40,
      },
    ],
    recommendations: clusteringRate >= 40
      ? ['B&S clusters across patterns - when one enters B&S, watch others']
      : ['B&S is pattern-specific - treat each pattern independently'],
  };
}

function testBnSDuration(data: TestingData): HypothesisResult {
  // Analyze how long patterns stay in B&S mode
  const durations: number[] = [];

  for (const patternData of data.patternBnSData) {
    for (const pattern of PATTERN_NAMES) {
      const pData = patternData[pattern];
      if (!pData?.cycles || pData.cycles.length < 3) continue;

      // Find B&S periods (3+ cycles within window)
      let bnsStart: number | null = null;
      let lastCycleEnd = 0;

      for (let i = 2; i < pData.cycles.length; i++) {
        const recent3 = pData.cycles.slice(i - 2, i + 1);
        const windowStart = recent3[0].activation.blockIndex;
        const windowEnd = recent3[2].break.blockIndex;

        if (windowEnd - windowStart <= 30) {
          if (bnsStart === null) {
            bnsStart = windowStart;
          }
          lastCycleEnd = windowEnd;
        } else if (bnsStart !== null) {
          durations.push(lastCycleEnd - bnsStart);
          bnsStart = null;
        }
      }

      if (bnsStart !== null) {
        durations.push(lastCycleEnd - bnsStart);
      }
    }
  }

  if (durations.length === 0) {
    return createEmptyResult('BNS_H4', 'No B&S duration data available');
  }

  const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
  const inRange = durations.filter(d => d >= 15 && d <= 30).length;
  const inRangeRate = (inRange / durations.length) * 100;

  return {
    hypothesisId: 'BNS_H4',
    supported: avgDuration >= 15 && avgDuration <= 30,
    confidence: inRangeRate,
    sampleSize: durations.length,
    details: [
      {
        metric: 'Average B&S duration',
        expected: '15-30 blocks',
        actual: `${avgDuration.toFixed(1)} blocks`,
        passed: avgDuration >= 15 && avgDuration <= 30,
      },
      {
        metric: 'Durations in 15-30 range',
        expected: '>50%',
        actual: `${inRangeRate.toFixed(1)}%`,
        passed: inRangeRate >= 50,
      },
    ],
    rawData: durations,
    recommendations: [],
  };
}

function testBnSExitReliability(_data: TestingData): HypothesisResult {
  // This would need tracking of when B&S mode was exited and if it returned
  // Placeholder implementation
  return createEmptyResult('BNS_H5', 'Requires tracking of B&S mode transitions - implement in Phase 3');
}

function testBnSPrecedesP1(data: TestingData): HypothesisResult {
  // Check if B&S dominant state precedes P1
  const p1Events = data.p1Events;
  const blockRecords = data.researchData.flatMap(r => r.blockRecords);

  let bnsPrecedesCount = 0;
  let checkedCount = 0;

  for (const p1 of p1Events) {
    const preP1Blocks = blockRecords.filter(
      b => b.blockIndex >= p1.startBlockIndex - 20 && b.blockIndex < p1.startBlockIndex
    );

    if (preP1Blocks.length === 0) continue;
    checkedCount++;

    const hadBnSDominant = preP1Blocks.some(b => b.marketState?.current === 'BNS_DOMINANT');
    if (hadBnSDominant) {
      bnsPrecedesCount++;
    }
  }

  const precedesRate = checkedCount > 0 ? (bnsPrecedesCount / checkedCount) * 100 : 0;

  return {
    hypothesisId: 'BNS_H6',
    supported: precedesRate >= 30,
    confidence: precedesRate,
    sampleSize: checkedCount,
    details: [
      {
        metric: 'P1 events preceded by B&S dominant',
        expected: '>30%',
        actual: `${bnsPrecedesCount} (${precedesRate.toFixed(1)}%)`,
        passed: precedesRate >= 30,
      },
    ],
    recommendations: precedesRate >= 30
      ? ['B&S can indicate approaching P1 - extra caution when B&S dominant']
      : ['B&S and P1 are independent conditions'],
  };
}

// ============================================================================
// TEST IMPLEMENTATIONS - INDICATORS
// ============================================================================

function testChoppyIndicator(_data: TestingData): HypothesisResult {
  // Would analyze blockRecords for choppy conditions and correlate with trade outcomes
  return createEmptyResult('IND_H1', 'Requires trade correlation data - implement in Phase 3');
}

function testDirectionImbalanceIndicator(_data: TestingData): HypothesisResult {
  return createEmptyResult('IND_H2', 'Requires direction tracking implementation');
}

function testPatternChurnIndicator(_data: TestingData): HypothesisResult {
  return createEmptyResult('IND_H3', 'Requires pattern break tracking correlation');
}

function testWinRateDeclineIndicator(_data: TestingData): HypothesisResult {
  return createEmptyResult('IND_H4', 'Requires win rate tracking correlation');
}

function testHighPctLossIndicator(_data: TestingData): HypothesisResult {
  return createEmptyResult('IND_H5', 'Requires loss magnitude tracking');
}

function testAlternating3A3Indicator(_data: TestingData): HypothesisResult {
  return createEmptyResult('IND_H6', 'Requires 3A3 pattern detection');
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createEmptyResult(hypothesisId: string, reason: string): HypothesisResult {
  return {
    hypothesisId,
    supported: false,
    confidence: 0,
    sampleSize: 0,
    details: [
      {
        metric: 'Data availability',
        expected: 'Sufficient data',
        actual: reason,
        passed: false,
      },
    ],
    recommendations: ['Collect more data or implement required tracking'],
  };
}

// ============================================================================
// RESEARCH TEST RUNNER
// ============================================================================

export class ResearchTestRunner {
  private sessionsDir: string;

  constructor(sessionsDir = './data/sessions') {
    this.sessionsDir = path.resolve(sessionsDir);
  }

  /**
   * Load all available data for testing
   */
  loadTestingData(): TestingData {
    const sessions: SessionLog[] = [];
    const researchData: ResearchData[] = [];

    if (!fs.existsSync(this.sessionsDir)) {
      return { sessions, researchData, blocks: [], p1Events: [], patternBnSData: [] };
    }

    const files = fs.readdirSync(this.sessionsDir);

    // Load session files
    for (const file of files) {
      if (file.endsWith('.json') && !file.includes('.partial.') && !file.includes('.research.')) {
        try {
          const content = fs.readFileSync(path.join(this.sessionsDir, file), 'utf-8');
          sessions.push(JSON.parse(content));
        } catch (e) {
          console.error(`Failed to load session ${file}:`, e);
        }
      }
    }

    // Load research files
    for (const file of files) {
      if (file.endsWith('.research.json')) {
        try {
          const content = fs.readFileSync(path.join(this.sessionsDir, file), 'utf-8');
          researchData.push(JSON.parse(content));
        } catch (e) {
          console.error(`Failed to load research data ${file}:`, e);
        }
      }
    }

    // Aggregate data
    const blocks = sessions.flatMap(s => s.blockSequence || []);
    const p1Events = researchData.flatMap(r => r.p1Events || []);
    const patternBnSData = researchData.map(r => r.patternBnSTracking);

    return { sessions, researchData, blocks, p1Events, patternBnSData };
  }

  /**
   * Run all hypotheses tests
   */
  runAllTests(): HypothesisResult[] {
    const data = this.loadTestingData();
    const allHypotheses = [...P1_HYPOTHESES, ...BNS_HYPOTHESES, ...INDICATOR_HYPOTHESES];

    const results: HypothesisResult[] = [];
    for (const hypothesis of allHypotheses) {
      try {
        const result = hypothesis.testFunction(data);
        results.push(result);
      } catch (error) {
        results.push(createEmptyResult(hypothesis.id, `Test error: ${error}`));
      }
    }

    return results;
  }

  /**
   * Run tests by category
   */
  runCategoryTests(category: 'P1' | 'BNS' | 'INDICATOR'): HypothesisResult[] {
    const data = this.loadTestingData();
    let hypotheses: Hypothesis[];

    switch (category) {
      case 'P1':
        hypotheses = P1_HYPOTHESES;
        break;
      case 'BNS':
        hypotheses = BNS_HYPOTHESES;
        break;
      case 'INDICATOR':
        hypotheses = INDICATOR_HYPOTHESES;
        break;
    }

    return hypotheses.map(h => {
      try {
        return h.testFunction(data);
      } catch (error) {
        return createEmptyResult(h.id, `Test error: ${error}`);
      }
    });
  }

  /**
   * Generate test report
   */
  generateReport(results: HypothesisResult[]): string {
    let report = '# Research Hypothesis Test Report\n\n';
    report += `Generated: ${new Date().toISOString()}\n\n`;

    // Summary
    const supported = results.filter(r => r.supported).length;
    const total = results.length;
    report += `## Summary\n\n`;
    report += `- **Total Hypotheses Tested**: ${total}\n`;
    report += `- **Supported**: ${supported} (${((supported / total) * 100).toFixed(1)}%)\n`;
    report += `- **Not Supported**: ${total - supported}\n\n`;

    // By category
    const categories = ['P1', 'BNS', 'INDICATOR'] as const;
    for (const cat of categories) {
      const catResults = results.filter(r => r.hypothesisId.startsWith(cat.substring(0, 3)));
      const catSupported = catResults.filter(r => r.supported).length;
      report += `### ${cat} Hypotheses: ${catSupported}/${catResults.length} supported\n\n`;

      for (const result of catResults) {
        const hypothesis = [...P1_HYPOTHESES, ...BNS_HYPOTHESES, ...INDICATOR_HYPOTHESES]
          .find(h => h.id === result.hypothesisId);

        report += `#### ${result.hypothesisId}: ${hypothesis?.name || 'Unknown'}\n`;
        report += `- **Supported**: ${result.supported ? '✅ YES' : '❌ NO'}\n`;
        report += `- **Confidence**: ${result.confidence.toFixed(1)}%\n`;
        report += `- **Sample Size**: ${result.sampleSize}\n`;
        report += `- **Details**:\n`;
        for (const detail of result.details) {
          const status = detail.passed ? '✓' : '✗';
          report += `  - ${status} ${detail.metric}: ${detail.actual} (expected: ${detail.expected})\n`;
        }
        if (result.recommendations.length > 0) {
          report += `- **Recommendations**: ${result.recommendations.join('; ')}\n`;
        }
        report += '\n';
      }
    }

    return report;
  }

  /**
   * Save report to file
   */
  saveReport(results: HypothesisResult[], filename = 'hypothesis-test-report.md'): void {
    const report = this.generateReport(results);
    const reportPath = path.join(this.sessionsDir, '..', filename);
    fs.writeFileSync(reportPath, report, 'utf-8');
    console.log(`Report saved to: ${reportPath}`);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export function createResearchTestRunner(sessionsDir?: string): ResearchTestRunner {
  return new ResearchTestRunner(sessionsDir);
}

export const ALL_HYPOTHESES = [...P1_HYPOTHESES, ...BNS_HYPOTHESES, ...INDICATOR_HYPOTHESES];
