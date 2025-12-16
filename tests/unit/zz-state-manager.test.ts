/**
 * Ghost Evaluator - ZZ State Manager Unit Tests
 * ==============================================
 *
 * Tests for the ZZ/AntiZZ pocket system implementation.
 * See POCKET-SYSTEM-SPEC.md for the authoritative rules.
 */

import { ZZStateManager, createZZStateManager } from '../../src/engine/zz-state-manager';
import { Direction, EvaluatedResult } from '../../src/types';

describe('ZZStateManager', () => {
  let manager: ZZStateManager;

  beforeEach(() => {
    manager = createZZStateManager();
  });

  // Helper to create evaluated result
  const createResult = (
    pattern: 'ZZ' | 'AntiZZ',
    profit: number,
    direction: Direction = 1
  ): EvaluatedResult => ({
    pattern,
    signalIndex: 0,
    evalIndex: 1,
    expectedDirection: direction,
    actualDirection: profit >= 0 ? direction : ((-direction) as Direction),
    pct: Math.abs(profit),
    runLength: 1,
    verdict: profit >= 0 ? 'fair' : 'unfair',
    profit,
    wasBet: true,
    ts: new Date().toISOString(),
  });

  describe('Initial State', () => {
    it('should initialize ZZ in Pocket 1', () => {
      expect(manager.getZZPocket()).toBe(1);
    });

    it('should initialize AntiZZ in Pocket 2', () => {
      expect(manager.getAntiZZPocket()).toBe(2);
    });

    it('should initialize runProfitZZ to 0', () => {
      expect(manager.getRunProfitZZ()).toBe(0);
    });

    it('should not have any active pattern', () => {
      expect(manager.getActivePattern()).toBeNull();
    });

    it('should not be waiting for first bet', () => {
      expect(manager.isWaitingForFirstBet()).toBe(false);
    });

    it('should not have AntiZZ as candidate', () => {
      expect(manager.isAntiZZCandidate()).toBe(false);
    });
  });

  describe('Indicator Handling', () => {
    describe('ZZ in Pocket 1', () => {
      it('should activate ZZ when in P1', () => {
        manager.handleIndicator(5, 1);

        expect(manager.getActivePattern()).toBe('ZZ');
        expect(manager.isWaitingForFirstBet()).toBe(false);
      });

      it('should save indicator direction', () => {
        manager.handleIndicator(5, -1);

        const state = manager.getState();
        expect(state.savedIndicatorDirection).toBe(-1);
      });
    });

    describe('ZZ in Pocket 2', () => {
      beforeEach(() => {
        // Force ZZ to P2 by setting negative runProfitZZ
        const state = manager.exportState();
        state.zzPocket = 2;
        state.runProfitZZ = -50;
        manager.importState(state);
      });

      it('should wait for imaginary first bet when ZZ in P2', () => {
        manager.handleIndicator(5, 1);

        expect(manager.getActivePattern()).toBeNull();
        expect(manager.isWaitingForFirstBet()).toBe(true);
        expect(manager.getFirstBetBlockIndex()).toBe(6); // blockIndex + 1
      });
    });

    describe('AntiZZ in Pocket 1', () => {
      beforeEach(() => {
        // Force AntiZZ to P1
        const state = manager.exportState();
        state.antiZZPocket = 1;
        state.antiZZIsCandidate = true;
        manager.importState(state);
      });

      it('should activate AntiZZ when in P1', () => {
        manager.handleIndicator(5, 1);

        expect(manager.getActivePattern()).toBe('AntiZZ');
      });

      it('should clear candidate flag when AntiZZ activates', () => {
        manager.handleIndicator(5, 1);

        expect(manager.isAntiZZCandidate()).toBe(false);
      });
    });
  });

  describe('Imaginary First Bet Evaluation', () => {
    beforeEach(() => {
      // Force ZZ to P2 and set up waiting state
      const state = manager.exportState();
      state.zzPocket = 2;
      state.runProfitZZ = -50;
      manager.importState(state);

      // Trigger indicator to set up waiting for first bet
      manager.handleIndicator(5, 1);
    });

    it('should move ZZ to P1 on positive imaginary', () => {
      // Positive imaginary: ZZ predicted -1 (opposite of 1), actual is -1
      const result = manager.evaluateImaginaryFirstBet(-1, 80, 6);

      expect(result.imaginaryProfit).toBe(80);
      expect(manager.getZZPocket()).toBe(1);
      expect(manager.getActivePattern()).toBe('ZZ');
    });

    it('should NOT return shouldBet: true on positive imaginary (block already passed)', () => {
      const result = manager.evaluateImaginaryFirstBet(-1, 80, 6);

      // The imaginary bet already "consumed" this block
      // ZZ will bet on NEXT block via continuous betting
      expect(result.shouldBet).toBe(false);
    });

    it('should make AntiZZ candidate on negative imaginary', () => {
      // Negative imaginary: ZZ predicted -1, actual is 1 (wrong)
      const result = manager.evaluateImaginaryFirstBet(1, 70, 6);

      expect(result.imaginaryProfit).toBe(-70);
      expect(manager.isAntiZZCandidate()).toBe(true);
      expect(manager.getAntiZZPocket()).toBe(1); // Ready for next indicator
    });

    it('should keep ZZ in P2 on negative imaginary', () => {
      manager.evaluateImaginaryFirstBet(1, 70, 6);

      expect(manager.getZZPocket()).toBe(2);
    });

    it('should set no active pattern on negative imaginary', () => {
      manager.evaluateImaginaryFirstBet(1, 70, 6);

      expect(manager.getActivePattern()).toBeNull();
    });

    it('should always update runProfitZZ even for imaginary', () => {
      manager.evaluateImaginaryFirstBet(1, 70, 6);

      expect(manager.getRunProfitZZ()).toBe(-70);
    });
  });

  describe('Continuous Betting (ZZ)', () => {
    beforeEach(() => {
      // Activate ZZ in P1
      manager.handleIndicator(5, 1);
    });

    it('should return true when ZZ is active in P1', () => {
      expect(manager.shouldGenerateZZSignal()).toBe(true);
    });

    it('should return false when ZZ is not active', () => {
      const state = manager.exportState();
      state.activePattern = null;
      manager.importState(state);

      expect(manager.shouldGenerateZZSignal()).toBe(false);
    });

    it('should return false during B&S', () => {
      manager.setBaitSwitchMode(true);

      expect(manager.shouldGenerateZZSignal()).toBe(false);
    });

    it('should return false when waiting for imaginary', () => {
      const state = manager.exportState();
      state.waitingForFirstBet = true;
      manager.importState(state);

      expect(manager.shouldGenerateZZSignal()).toBe(false);
    });
  });

  describe('Single Bet (AntiZZ)', () => {
    beforeEach(() => {
      // Activate AntiZZ in P1
      const state = manager.exportState();
      state.antiZZPocket = 1;
      state.activePattern = 'AntiZZ';
      manager.importState(state);
    });

    it('should return true when AntiZZ is active in P1', () => {
      expect(manager.shouldGenerateAntiZZSignal()).toBe(true);
    });

    it('should return false when AntiZZ is not active', () => {
      const state = manager.exportState();
      state.activePattern = null;
      manager.importState(state);

      expect(manager.shouldGenerateAntiZZSignal()).toBe(false);
    });

    it('should return false during B&S', () => {
      manager.setBaitSwitchMode(true);

      expect(manager.shouldGenerateAntiZZSignal()).toBe(false);
    });
  });

  describe('ZZ Result Recording', () => {
    beforeEach(() => {
      // Activate ZZ in P1
      manager.handleIndicator(5, 1);
    });

    it('should continue ZZ run on positive result', () => {
      const result = createResult('ZZ', 80);
      const outcome = manager.recordZZResult(result, 6);

      expect(outcome.action).toBe('continue');
      expect(manager.getActivePattern()).toBe('ZZ');
    });

    it('should make AntiZZ candidate on first bet negative', () => {
      const result = createResult('ZZ', -70);
      const outcome = manager.recordZZResult(result, 6);

      expect(outcome.action).toBe('first_bet_negative');
      expect(manager.isAntiZZCandidate()).toBe(true);
    });

    it('should end ZZ run on subsequent negative result', () => {
      // First bet positive
      manager.recordZZResult(createResult('ZZ', 80), 6);

      // Second bet negative
      const outcome = manager.recordZZResult(createResult('ZZ', -70), 7);

      expect(outcome.action).toBe('run_ends');
      expect(manager.getActivePattern()).toBeNull();
    });

    it('should update runProfitZZ with cumulative profit', () => {
      manager.recordZZResult(createResult('ZZ', 80), 6);

      expect(manager.getRunProfitZZ()).toBe(80);

      manager.recordZZResult(createResult('ZZ', 50), 7);

      expect(manager.getRunProfitZZ()).toBe(130);
    });
  });

  describe('AntiZZ Result Recording', () => {
    beforeEach(() => {
      // Activate AntiZZ in P1
      const state = manager.exportState();
      state.antiZZPocket = 1;
      state.activePattern = 'AntiZZ';
      manager.importState(state);
    });

    it('should deactivate AntiZZ after one bet (win)', () => {
      const result = createResult('AntiZZ', 80);
      manager.recordAntiZZResult(result, 6);

      expect(manager.getActivePattern()).toBeNull();
    });

    it('should activate ZZ immediately after AntiZZ loss (SWAP)', () => {
      const result = createResult('AntiZZ', -70);
      manager.recordAntiZZResult(result, 6);

      // After SWAP, ZZ activates immediately
      expect(manager.getActivePattern()).toBe('ZZ');
      expect(manager.getRunProfitZZ()).toBe(70);  // ZZ's imaginary first bet
    });

    it('should stay in P1 on win', () => {
      const result = createResult('AntiZZ', 80);
      manager.recordAntiZZResult(result, 6);

      expect(manager.getAntiZZPocket()).toBe(1);
    });

    it('should move to P2 on loss', () => {
      const result = createResult('AntiZZ', -70);
      manager.recordAntiZZResult(result, 6);

      expect(manager.getAntiZZPocket()).toBe(2);
    });
  });

  describe('Pocket Threshold (>= 0 for P1)', () => {
    it('should put ZZ in P1 when runProfitZZ is positive', () => {
      // Activate and record positive result
      manager.handleIndicator(5, 1);
      manager.recordZZResult(createResult('ZZ', 80), 6);
      manager.recordZZResult(createResult('ZZ', -30), 7); // End run with +50

      expect(manager.getZZPocket()).toBe(1);
    });

    it('should put ZZ in P1 when runProfitZZ is exactly 0 (break-even)', () => {
      manager.handleIndicator(5, 1);
      manager.recordZZResult(createResult('ZZ', 50), 6);
      manager.recordZZResult(createResult('ZZ', -50), 7); // End run with 0

      // Per user decision: >= 0 → P1
      expect(manager.getZZPocket()).toBe(1);
    });

    it('should put ZZ in P2 when runProfitZZ is negative', () => {
      manager.handleIndicator(5, 1);
      manager.recordZZResult(createResult('ZZ', -70), 6);

      expect(manager.getZZPocket()).toBe(2);
    });
  });

  describe('Prediction Direction', () => {
    it('should predict OPPOSITE for ZZ (alternation continues)', () => {
      // Current direction UP, ZZ predicts DOWN
      expect(manager.getPredictedDirection(1, 'ZZ')).toBe(-1);
      expect(manager.getPredictedDirection(-1, 'ZZ')).toBe(1);
    });

    it('should predict SAME for AntiZZ (alternation breaks)', () => {
      // Current direction UP, AntiZZ predicts UP
      expect(manager.getPredictedDirection(1, 'AntiZZ')).toBe(1);
      expect(manager.getPredictedDirection(-1, 'AntiZZ')).toBe(-1);
    });
  });

  describe('Both in P2 Scenario', () => {
    beforeEach(() => {
      // Force both to P2
      const state = manager.exportState();
      state.zzPocket = 2;
      state.antiZZPocket = 2;
      state.runProfitZZ = -50;
      manager.importState(state);
    });

    it('should have both patterns in P2', () => {
      expect(manager.areBothInPocket2()).toBe(true);
    });

    it('should not bet when both in P2', () => {
      expect(manager.shouldBet()).toBe(false);
    });

    it('should wait for imaginary first bet on indicator', () => {
      manager.handleIndicator(5, 1);

      expect(manager.isWaitingForFirstBet()).toBe(true);
    });
  });

  describe('State Reset', () => {
    it('should reset to initial state', () => {
      // Make some changes
      manager.handleIndicator(5, 1);
      manager.recordZZResult(createResult('ZZ', 80), 6);

      // Reset
      manager.reset();

      // Verify initial state
      expect(manager.getZZPocket()).toBe(1);
      expect(manager.getAntiZZPocket()).toBe(2);
      expect(manager.getRunProfitZZ()).toBe(0);
      expect(manager.getActivePattern()).toBeNull();
    });
  });

  describe('State Export/Import', () => {
    it('should export and import state correctly', () => {
      // Make some changes
      manager.handleIndicator(5, 1);
      manager.recordZZResult(createResult('ZZ', 80), 6);

      // Export
      const exported = manager.exportState();

      // Create new manager and import
      const newManager = createZZStateManager();
      newManager.importState(exported);

      // Verify state matches
      expect(newManager.getZZPocket()).toBe(manager.getZZPocket());
      expect(newManager.getActivePattern()).toBe(manager.getActivePattern());
      expect(newManager.getRunProfitZZ()).toBe(manager.getRunProfitZZ());
    });
  });
});
