/**
 * Ghost Evaluator v15.1 - Pattern Lifecycle Tests
 * ================================================
 */

import { PatternLifecycleManager, createLifecycleManager } from '../../src/patterns/lifecycle';
import { EvaluatedResult, PatternName } from '../../src/types';

describe('PatternLifecycleManager', () => {
  let lifecycle: PatternLifecycleManager;

  beforeEach(() => {
    lifecycle = createLifecycleManager({
      singleProfitThreshold: 70,
      cumulativeProfitThreshold: 100,
    });
  });

  describe('Initial state', () => {
    it('should start all patterns in observing state', () => {
      const patterns: PatternName[] = ['2A2', 'Anti2A2', 'ZZ', 'AP5'];

      for (const pattern of patterns) {
        expect(lifecycle.isObserving(pattern)).toBe(true);
        expect(lifecycle.isActive(pattern)).toBe(false);
      }
    });

    it('should have zero cumulative profit initially', () => {
      expect(lifecycle.getCumulativeProfit('2A2')).toBe(0);
      expect(lifecycle.getAllTimeProfit('2A2')).toBe(0);
    });
  });

  describe('Activation rules', () => {
    it('should activate pattern when single result >= 70%', () => {
      const result: EvaluatedResult = {
        pattern: '2A2',
        signalIndex: 0,
        evalIndex: 1,
        expectedDirection: 1,
        actualDirection: 1,
        pct: 75,
        runLength: 1,
        verdict: 'fair',
        profit: 75,
        wasBet: false,
        ts: new Date().toISOString(),
      };

      const outcome = lifecycle.applyResult(result);

      expect(outcome.activated).toBe(true);
      expect(outcome.previousState).toBe('observing');
      expect(outcome.newState).toBe('active');
      expect(lifecycle.isActive('2A2')).toBe(true);
    });

    it('should activate pattern when cumulative profit >= 100%', () => {
      // First result: 60%
      lifecycle.applyResult({
        pattern: '2A2',
        signalIndex: 0,
        evalIndex: 1,
        expectedDirection: 1,
        actualDirection: 1,
        pct: 60,
        runLength: 1,
        verdict: 'fair',
        profit: 60,
        wasBet: false,
        ts: new Date().toISOString(),
      });

      expect(lifecycle.isObserving('2A2')).toBe(true);

      // Second result: 50% (cumulative = 110%)
      const outcome = lifecycle.applyResult({
        pattern: '2A2',
        signalIndex: 2,
        evalIndex: 3,
        expectedDirection: 1,
        actualDirection: 1,
        pct: 50,
        runLength: 1,
        verdict: 'fair',
        profit: 50,
        wasBet: false,
        ts: new Date().toISOString(),
      });

      expect(outcome.activated).toBe(true);
      expect(lifecycle.isActive('2A2')).toBe(true);
    });

    it('should not activate pattern with low single results and cumulative < 100%', () => {
      lifecycle.applyResult({
        pattern: '2A2',
        signalIndex: 0,
        evalIndex: 1,
        expectedDirection: 1,
        actualDirection: 1,
        pct: 40,
        runLength: 1,
        verdict: 'neutral',
        profit: 40,
        wasBet: false,
        ts: new Date().toISOString(),
      });

      expect(lifecycle.isObserving('2A2')).toBe(true);
      expect(lifecycle.getCumulativeProfit('2A2')).toBe(40);
    });
  });

  describe('Break rules', () => {
    it('should break pattern on loss when active', () => {
      // First activate the pattern
      lifecycle.applyResult({
        pattern: '2A2',
        signalIndex: 0,
        evalIndex: 1,
        expectedDirection: 1,
        actualDirection: 1,
        pct: 80,
        runLength: 1,
        verdict: 'fair',
        profit: 80,
        wasBet: false,
        ts: new Date().toISOString(),
      });

      expect(lifecycle.isActive('2A2')).toBe(true);

      // Now apply a loss
      const outcome = lifecycle.applyResult({
        pattern: '2A2',
        signalIndex: 2,
        evalIndex: 3,
        expectedDirection: 1,
        actualDirection: -1,
        pct: 60,
        runLength: 1,
        verdict: 'unfair',
        profit: -60,
        wasBet: true,
        ts: new Date().toISOString(),
      });

      expect(outcome.broken).toBe(true);
      expect(lifecycle.isObserving('2A2')).toBe(true);
      expect(lifecycle.getCumulativeProfit('2A2')).toBe(0); // Reset
    });

    it('should preserve all-time profit when pattern breaks', () => {
      // Activate with 80%
      lifecycle.applyResult({
        pattern: '2A2',
        signalIndex: 0,
        evalIndex: 1,
        expectedDirection: 1,
        actualDirection: 1,
        pct: 80,
        runLength: 1,
        verdict: 'fair',
        profit: 80,
        wasBet: false,
        ts: new Date().toISOString(),
      });

      // Break with -60%
      lifecycle.applyResult({
        pattern: '2A2',
        signalIndex: 2,
        evalIndex: 3,
        expectedDirection: 1,
        actualDirection: -1,
        pct: 60,
        runLength: 1,
        verdict: 'unfair',
        profit: -60,
        wasBet: true,
        ts: new Date().toISOString(),
      });

      expect(lifecycle.getAllTimeProfit('2A2')).toBe(20); // 80 - 60
      expect(lifecycle.getCumulativeProfit('2A2')).toBe(0);
    });
  });

  describe('Continuous patterns (ZZ/AntiZZ)', () => {
    it('should mark ZZ as continuous', () => {
      const cycle = lifecycle.getCycle('ZZ');
      expect(cycle.isContinuous).toBe(true);
    });

    it('should mark non-ZZ patterns as single-shot', () => {
      const cycle = lifecycle.getCycle('2A2');
      expect(cycle.isContinuous).toBe(false);
    });
  });

  describe('Opposite pattern switching', () => {
    it('should detect when to switch to opposite pattern', () => {
      // Activate Anti2A2 but not 2A2
      lifecycle.applyResult({
        pattern: 'Anti2A2',
        signalIndex: 0,
        evalIndex: 1,
        expectedDirection: 1,
        actualDirection: 1,
        pct: 80,
        runLength: 1,
        verdict: 'fair',
        profit: 80,
        wasBet: false,
        ts: new Date().toISOString(),
      });

      expect(lifecycle.shouldSwitchToOpposite('2A2')).toBe(true);
      expect(lifecycle.shouldSwitchToOpposite('Anti2A2')).toBe(false);
    });

    it('should return correct opposite patterns', () => {
      expect(lifecycle.getOpposite('2A2')).toBe('Anti2A2');
      expect(lifecycle.getOpposite('AP5')).toBe('OZ');
      expect(lifecycle.getOpposite('ZZ')).toBe('AntiZZ');
      expect(lifecycle.getOpposite('4A4')).toBeNull();
    });
  });

  describe('Statistics', () => {
    it('should return statistics for all patterns', () => {
      const stats = lifecycle.getStatistics();

      expect(stats.length).toBe(10); // All 10 patterns
      expect(stats[0]).toHaveProperty('pattern');
      expect(stats[0]).toHaveProperty('state');
      expect(stats[0]).toHaveProperty('cumulativeProfit');
      expect(stats[0]).toHaveProperty('allTimeProfit');
    });
  });
});
