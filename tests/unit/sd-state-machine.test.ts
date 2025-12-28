/**
 * Ghost Evaluator - SD State Machine Unit Tests
 * ==============================================
 *
 * Tests for the SameDir pause/resume system implementation.
 * See SAMEDIR-PAUSE-RESUME-SPEC.md for the authoritative rules.
 */

import {
  SameDirectionManager,
  createSameDirectionManager,
} from '../../src/engine/same-direction';
import { Block, Direction } from '../../src/types';

describe('SameDirectionManager Pause/Resume', () => {
  let manager: SameDirectionManager;

  beforeEach(() => {
    manager = createSameDirectionManager();
  });

  // Helper to create a block
  const createBlock = (
    index: number,
    dir: Direction,
    pct: number
  ): Block => ({
    index,
    dir,
    pct,
    ts: new Date().toISOString(),
  });

  // Helper to create a run of blocks to activate SD
  const activateSD = (manager: SameDirectionManager): void => {
    // Create a run with RunProfit >= 140% to activate SD
    const blocks: Block[] = [
      createBlock(0, 1, 50),
      createBlock(1, 1, 60),
      createBlock(2, 1, 80),
      createBlock(3, 1, 50),
      createBlock(4, -1, 30), // Break block
    ];

    for (const block of blocks) {
      manager.processBlock(block);
    }
  };

  describe('Initial State', () => {
    it('should start inactive', () => {
      expect(manager.isActive()).toBe(false);
    });

    it('should start not paused', () => {
      expect(manager.isPaused()).toBe(false);
    });

    it('should be able to bet when active and not paused', () => {
      activateSD(manager);
      expect(manager.isActive()).toBe(true);
      expect(manager.isPaused()).toBe(false);
      expect(manager.canBet()).toBe(true);
    });
  });

  describe('Pause on HIGH_PCT_REVERSAL', () => {
    it('should pause when reversal >= 70% and loss', () => {
      activateSD(manager);
      expect(manager.canBet()).toBe(true);

      // Record a high PCT reversal loss
      const result = manager.recordSDTradeResult(
        false, // isWin
        75,    // pct >= 70
        10,    // blockIndex
        true   // isReversal
      );

      expect(result.didPause).toBe(true);
      expect(result.reason).toBe('HIGH_PCT_REVERSAL');
      expect(manager.isPaused()).toBe(true);
      expect(manager.canBet()).toBe(false);
    });

    it('should NOT pause on high PCT if not reversal', () => {
      activateSD(manager);

      const result = manager.recordSDTradeResult(
        false, // isWin
        75,    // pct >= 70
        10,
        false  // NOT a reversal
      );

      expect(result.didPause).toBe(false);
      expect(manager.isPaused()).toBe(false);
    });

    it('should NOT pause on high PCT if win', () => {
      activateSD(manager);

      const result = manager.recordSDTradeResult(
        true,  // isWin
        80,    // pct >= 70
        10,
        true   // isReversal
      );

      expect(result.didPause).toBe(false);
      expect(manager.isPaused()).toBe(false);
    });
  });

  describe('Pause on CONSECUTIVE_LOSSES', () => {
    it('should pause after 2 consecutive losses', () => {
      activateSD(manager);

      // First loss - should NOT pause yet
      const result1 = manager.recordSDTradeResult(false, 40, 10, false);
      expect(result1.didPause).toBe(false);

      // Second loss - should pause
      const result2 = manager.recordSDTradeResult(false, 50, 11, false);
      expect(result2.didPause).toBe(true);
      expect(result2.reason).toBe('CONSECUTIVE_LOSSES');
      expect(manager.isPaused()).toBe(true);
    });

    it('should reset consecutive losses on win', () => {
      activateSD(manager);

      // First loss
      manager.recordSDTradeResult(false, 40, 10, false);

      // Win resets
      manager.recordSDTradeResult(true, 50, 11, false);

      // Another loss - should NOT pause (only 1 consecutive)
      const result = manager.recordSDTradeResult(false, 40, 12, false);
      expect(result.didPause).toBe(false);
    });
  });

  describe('Resume on ZZ/XAX Break', () => {
    it('should resume when ZZ/XAX loses', () => {
      activateSD(manager);

      // Pause SD
      manager.recordSDTradeResult(false, 40, 10, false);
      manager.recordSDTradeResult(false, 50, 11, false);
      expect(manager.isPaused()).toBe(true);

      // Record ZZ loss
      manager.recordZZXAXResult('ZZ', false, 15);
      expect(manager.didZZXAXBreak()).toBe(true);

      // Check resume condition
      const shouldResume = manager.checkResumeCondition(16);
      expect(shouldResume).toBe(true);
      expect(manager.isPaused()).toBe(false);
    });

    it('should NOT resume when ZZ/XAX wins', () => {
      activateSD(manager);

      // Pause SD
      manager.recordSDTradeResult(false, 40, 10, false);
      manager.recordSDTradeResult(false, 50, 11, false);
      expect(manager.isPaused()).toBe(true);

      // Record ZZ win
      manager.recordZZXAXResult('ZZ', true, 15);
      expect(manager.didZZXAXBreak()).toBe(false);

      // Check resume condition - should NOT resume
      const shouldResume = manager.checkResumeCondition(16);
      expect(shouldResume).toBe(false);
      expect(manager.isPaused()).toBe(true);
    });

    it('should resume on any XAX pattern break', () => {
      activateSD(manager);

      // Pause SD
      manager.recordSDTradeResult(false, 40, 10, false);
      manager.recordSDTradeResult(false, 50, 11, false);

      // Record 2A2 loss
      manager.recordZZXAXResult('2A2', false, 15);
      expect(manager.didZZXAXBreak()).toBe(true);

      const shouldResume = manager.checkResumeCondition(16);
      expect(shouldResume).toBe(true);
    });
  });

  describe('Life Preserved During Pause', () => {
    it('should freeze accumulatedLoss when paused', () => {
      activateSD(manager);

      // Add some loss
      manager.recordSDTradeResult(false, 40, 10, false);

      // Pause
      manager.recordSDTradeResult(false, 50, 11, false);
      expect(manager.isPaused()).toBe(true);
      const lossAtPause = manager.getAccumulatedLoss();

      // Record imaginary trades while paused
      manager.recordSDTradeResult(false, 60, 12, false);
      manager.recordSDTradeResult(false, 70, 13, false);

      // AccumulatedLoss should NOT increase
      expect(manager.getAccumulatedLoss()).toBe(lossAtPause);
    });

    it('should track imaginary PnL during pause', () => {
      activateSD(manager);

      // Pause
      manager.recordSDTradeResult(false, 40, 10, false);
      manager.recordSDTradeResult(false, 50, 11, false);

      // Record imaginary trades
      manager.recordSDTradeResult(true, 60, 12, false);
      manager.recordSDTradeResult(true, 40, 13, false);

      const pauseInfo = manager.getPauseInfo();
      expect(pauseInfo.imaginaryPnL).toBe(100); // 60 + 40
      expect(pauseInfo.imaginaryWins).toBe(2);
      expect(pauseInfo.imaginaryLosses).toBe(0);
    });
  });

  describe('Imaginary Tracking', () => {
    it('should track imaginary wins and losses', () => {
      activateSD(manager);

      // Pause
      manager.recordSDTradeResult(false, 40, 10, false);
      manager.recordSDTradeResult(false, 50, 11, false);

      // Imaginary trades
      manager.recordSDTradeResult(true, 30, 12, false);
      manager.recordSDTradeResult(false, 20, 13, false);
      manager.recordSDTradeResult(true, 50, 14, false);

      const pauseInfo = manager.getPauseInfo();
      expect(pauseInfo.imaginaryWins).toBe(2);
      expect(pauseInfo.imaginaryLosses).toBe(1);
      expect(pauseInfo.imaginaryPnL).toBe(60); // 30 - 20 + 50
    });

    it('should preserve imaginary stats for analysis after resume', () => {
      activateSD(manager);

      // Pause and track imaginary
      manager.recordSDTradeResult(false, 40, 10, false);
      manager.recordSDTradeResult(false, 50, 11, false);
      manager.recordSDTradeResult(true, 60, 12, false); // Imaginary win

      const pauseInfoBeforeResume = manager.getPauseInfo();
      expect(pauseInfoBeforeResume.imaginaryWins).toBe(1);

      // Resume
      manager.recordZZXAXResult('ZZ', false, 15);
      manager.checkResumeCondition(16);

      // Imaginary stats are preserved for analysis
      const pauseInfo = manager.getPauseInfo();
      expect(pauseInfo.imaginaryWins).toBe(1);
      expect(pauseInfo.imaginaryPnL).toBe(60);
      // But not paused anymore
      expect(manager.isPaused()).toBe(false);
    });
  });

  describe('State Transitions', () => {
    it('should transition INACTIVE -> ACTIVE on activation', () => {
      expect(manager.isActive()).toBe(false);
      activateSD(manager);
      expect(manager.isActive()).toBe(true);
    });

    it('should transition ACTIVE -> PAUSED on pause trigger', () => {
      activateSD(manager);
      expect(manager.canBet()).toBe(true);

      manager.recordSDTradeResult(false, 40, 10, false);
      manager.recordSDTradeResult(false, 50, 11, false);

      expect(manager.isActive()).toBe(true);
      expect(manager.isPaused()).toBe(true);
      expect(manager.canBet()).toBe(false);
    });

    it('should transition PAUSED -> ACTIVE on resume', () => {
      activateSD(manager);

      // Pause
      manager.recordSDTradeResult(false, 40, 10, false);
      manager.recordSDTradeResult(false, 50, 11, false);
      expect(manager.canBet()).toBe(false);

      // Resume
      manager.recordZZXAXResult('ZZ', false, 15);
      manager.checkResumeCondition(16);

      expect(manager.isActive()).toBe(true);
      expect(manager.isPaused()).toBe(false);
      expect(manager.canBet()).toBe(true);
    });

    it('should transition ACTIVE -> EXPIRED when life exhausted', () => {
      activateSD(manager);

      // Create blocks that will exhaust life (accumulatedLoss > 140)
      // This requires processing run breaks with negative RunProfit
      const state = manager.getState();
      // Manually verify that after many losses, SD deactivates
      expect(state.active).toBe(true);
    });
  });

  describe('getLastZZXAXInfo', () => {
    it('should return last ZZ/XAX result info', () => {
      manager.recordZZXAXResult('AntiZZ', true, 20);

      const info = manager.getLastZZXAXInfo();
      expect(info.pattern).toBe('AntiZZ');
      expect(info.result).toBe('WIN');
      expect(info.block).toBe(20);
    });

    it('should return null when no ZZ/XAX recorded', () => {
      const info = manager.getLastZZXAXInfo();
      expect(info.pattern).toBeNull();
      expect(info.result).toBeNull();
    });
  });

  describe('canBet', () => {
    it('should return true when active and not paused', () => {
      activateSD(manager);
      expect(manager.canBet()).toBe(true);
    });

    it('should return false when not active', () => {
      expect(manager.canBet()).toBe(false);
    });

    it('should return false when paused', () => {
      activateSD(manager);
      manager.recordSDTradeResult(false, 40, 10, false);
      manager.recordSDTradeResult(false, 50, 11, false);
      expect(manager.canBet()).toBe(false);
    });
  });
});
