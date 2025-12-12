/**
 * ZZ Strategy State Manager - Test Cases
 * =======================================
 * Tests for the corrected ZZ/Anti-ZZ implementation.
 *
 * Test Scenarios:
 * 1. ZZ with positive previous run
 * 2. ZZ with positive previous run but first prediction negative
 * 3. ZZ with negative previous run
 * 4. Bait-and-switch present
 * 5. Anti-ZZ run resolving
 */

import { ZZStateManager, createZZStateManager } from '../zz-state-manager';
import { Direction, EvaluatedResult } from '../../types';

// Helper to create mock EvaluatedResult
function createMockResult(
  pattern: 'ZZ' | 'AntiZZ',
  profit: number,
  evalIndex: number,
  expectedDirection: Direction = 1,
  actualDirection?: Direction
): EvaluatedResult {
  const isWin = profit > 0;
  return {
    pattern,
    signalIndex: evalIndex - 1,
    evalIndex,
    expectedDirection,
    actualDirection: actualDirection ?? (isWin ? expectedDirection : -expectedDirection as Direction),
    pct: Math.abs(profit),
    runLength: 1,
    verdict: isWin ? 'fair' : 'unfair',
    profit,
    wasBet: true,
    ts: new Date().toISOString(),
    indicatorDirection: 1,
  };
}

describe('ZZStateManager', () => {
  let zzManager: ZZStateManager;

  beforeEach(() => {
    zzManager = createZZStateManager();
  });

  // =========================================================================
  // TEST CASE 1: ZZ with positive previous run
  // Should place in Pocket 1, first prediction positive → normal ZZ run
  // =========================================================================
  describe('Test Case 1: ZZ with positive previous run, first prediction positive', () => {
    it('should place ZZ in Pocket 1 when previous run was profitable', () => {
      // Activate ZZ with positive previous run profit
      zzManager.activateZZ(10, 150, 1); // blockIndex=10, prevProfit=+150%, indicatorDir=1

      expect(zzManager.getCurrentState()).toBe('zz_active');
      expect(zzManager.getCurrentPocket()).toBe(1); // Pocket 1 because profit > 0
    });

    it('should continue normal ZZ when first prediction is positive', () => {
      // Activate ZZ
      zzManager.activateZZ(10, 150, 1);

      // First prediction is positive (win)
      const result = createMockResult('ZZ', 80, 11);
      const antiZZTriggered = zzManager.evaluateFirstPrediction(result);

      expect(antiZZTriggered).toBe(false);
      expect(zzManager.getCurrentState()).toBe('zz_active'); // Still ZZ, not Anti-ZZ
      expect(zzManager.isAntiZZActive()).toBe(false);
    });

    it('should predict opposite direction (alternation continues) in normal ZZ', () => {
      zzManager.activateZZ(10, 150, 1);

      // First prediction positive
      const result = createMockResult('ZZ', 80, 11);
      zzManager.evaluateFirstPrediction(result);

      // ZZ predicts opposite of current direction
      const predicted = zzManager.getPredictedDirection(1); // Current is UP
      expect(predicted).toBe(-1); // Predict DOWN (opposite)

      const predicted2 = zzManager.getPredictedDirection(-1); // Current is DOWN
      expect(predicted2).toBe(1); // Predict UP (opposite)
    });
  });

  // =========================================================================
  // TEST CASE 2: ZZ with positive previous run but first prediction negative
  // Should place in Pocket 1 → immediately activate Anti-ZZ
  // =========================================================================
  describe('Test Case 2: ZZ with positive previous run, first prediction NEGATIVE', () => {
    it('should place ZZ in Pocket 1 when previous run was profitable', () => {
      zzManager.activateZZ(10, 150, 1);

      expect(zzManager.getCurrentPocket()).toBe(1);
    });

    it('should activate Anti-ZZ when first prediction is negative', () => {
      zzManager.activateZZ(10, 150, 1);

      // First prediction is NEGATIVE (loss) - THIS IS THE CORRECT ANTI-ZZ TRIGGER
      const result = createMockResult('ZZ', -80, 11);
      const antiZZTriggered = zzManager.evaluateFirstPrediction(result);

      expect(antiZZTriggered).toBe(true);
      expect(zzManager.getCurrentState()).toBe('anti_zz_active');
      expect(zzManager.isAntiZZActive()).toBe(true);
    });

    it('should predict same direction (alternation breaks) in Anti-ZZ', () => {
      zzManager.activateZZ(10, 150, 1);

      // First prediction negative → triggers Anti-ZZ
      const result = createMockResult('ZZ', -80, 11);
      zzManager.evaluateFirstPrediction(result);

      expect(zzManager.getCurrentState()).toBe('anti_zz_active');

      // Anti-ZZ predicts same as current direction (alternation breaks)
      const predicted = zzManager.getPredictedDirection(1); // Current is UP
      expect(predicted).toBe(1); // Predict UP (same)

      const predicted2 = zzManager.getPredictedDirection(-1); // Current is DOWN
      expect(predicted2).toBe(-1); // Predict DOWN (same)
    });

    it('should only evaluate first prediction once', () => {
      zzManager.activateZZ(10, 150, 1);

      // First prediction - negative
      const result1 = createMockResult('ZZ', -80, 11);
      const trigger1 = zzManager.evaluateFirstPrediction(result1);
      expect(trigger1).toBe(true);
      expect(zzManager.getCurrentState()).toBe('anti_zz_active');

      // Second call - should not change state (already evaluated)
      const result2 = createMockResult('ZZ', 90, 12);
      const trigger2 = zzManager.evaluateFirstPrediction(result2);
      expect(trigger2).toBe(false); // Returns false because already evaluated
      expect(zzManager.getCurrentState()).toBe('anti_zz_active'); // Still Anti-ZZ
    });
  });

  // =========================================================================
  // TEST CASE 3: ZZ with negative previous run
  // Should place in Pocket 2, confirm behaviour
  // =========================================================================
  describe('Test Case 3: ZZ with negative previous run', () => {
    it('should place ZZ in Pocket 2 when previous run was unprofitable', () => {
      // Activate ZZ with NEGATIVE previous run profit
      zzManager.activateZZ(10, -100, 1); // prevProfit = -100%

      expect(zzManager.getCurrentState()).toBe('zz_active');
      expect(zzManager.getCurrentPocket()).toBe(2); // Pocket 2 because profit < 0
    });

    it('should NOT automatically activate Anti-ZZ from negative previous run', () => {
      // IMPORTANT: This tests that Anti-ZZ is NOT triggered by run profit
      zzManager.activateZZ(10, -100, 1);

      // ZZ should still be active, NOT Anti-ZZ
      expect(zzManager.getCurrentState()).toBe('zz_active');
      expect(zzManager.isAntiZZActive()).toBe(false);
    });

    it('should wait for first prediction to decide Anti-ZZ', () => {
      zzManager.activateZZ(10, -100, 1);

      // Pocket is 2, but ZZ is still active
      expect(zzManager.getCurrentPocket()).toBe(2);
      expect(zzManager.isZZActive()).toBe(true);

      // First prediction positive → stay in ZZ
      const result = createMockResult('ZZ', 70, 11);
      zzManager.evaluateFirstPrediction(result);

      expect(zzManager.getCurrentState()).toBe('zz_active'); // Still ZZ
    });

    it('should switch to Anti-ZZ only if first prediction is negative', () => {
      zzManager.activateZZ(10, -100, 1); // Pocket 2

      // First prediction negative → NOW switch to Anti-ZZ
      const result = createMockResult('ZZ', -70, 11);
      zzManager.evaluateFirstPrediction(result);

      expect(zzManager.getCurrentState()).toBe('anti_zz_active');
    });
  });

  // =========================================================================
  // TEST CASE 4: Bait-and-switch present
  // ZZ must not activate Anti-ZZ, must not do pocket logic, must follow main strategy
  // =========================================================================
  describe('Test Case 4: Bait-and-switch present', () => {
    it('should not activate ZZ during bait-and-switch', () => {
      // Set B&S mode BEFORE activation
      zzManager.setBaitSwitchMode(true);

      // Try to activate ZZ
      zzManager.activateZZ(10, 150, 1);

      // ZZ should NOT be active
      expect(zzManager.isSystemActive()).toBe(false);
      expect(zzManager.getCurrentState()).toBe('inactive');
    });

    it('should ignore B&S when ZZ is already active', () => {
      // Activate ZZ first
      zzManager.activateZZ(10, 150, 1);
      expect(zzManager.isZZActive()).toBe(true);

      // Enter B&S mode
      zzManager.setBaitSwitchMode(true);

      // ZZ state should be preserved (not changed)
      expect(zzManager.isZZActive()).toBe(true);
      expect(zzManager.getCurrentState()).toBe('zz_active');
    });

    it('should report shouldIgnoreBaitSwitch() correctly', () => {
      zzManager.activateZZ(10, 150, 1);

      expect(zzManager.shouldIgnoreBaitSwitch()).toBe(false);

      zzManager.setBaitSwitchMode(true);
      expect(zzManager.shouldIgnoreBaitSwitch()).toBe(true);

      zzManager.setBaitSwitchMode(false);
      expect(zzManager.shouldIgnoreBaitSwitch()).toBe(false);
    });

    it('should resume normally when B&S ends', () => {
      zzManager.activateZZ(10, 150, 1);

      // Enter and exit B&S
      zzManager.setBaitSwitchMode(true);
      zzManager.setBaitSwitchMode(false);

      // ZZ should still be active and working normally
      expect(zzManager.isZZActive()).toBe(true);

      // Can still get predictions
      const predicted = zzManager.getPredictedDirection(1);
      expect(predicted).toBe(-1); // ZZ predicts opposite
    });

    it('should not change ZZ state during B&S', () => {
      zzManager.activateZZ(10, 150, 1);

      // Enter B&S mode
      zzManager.setBaitSwitchMode(true);

      // State should NOT change to 'suspended' - ZZ ignores B&S
      // The state stays as-is, but predictions are skipped by the reaction engine
      expect(zzManager.getCurrentState()).toBe('zz_active');
    });
  });

  // =========================================================================
  // TEST CASE 5: Anti-ZZ run resolving
  // Should return to normal ZZ cycle
  // =========================================================================
  describe('Test Case 5: Anti-ZZ run resolving', () => {
    it('should resolve Anti-ZZ run and return to inactive', () => {
      // Activate ZZ
      zzManager.activateZZ(10, 150, 1);

      // First prediction negative → Anti-ZZ
      const result = createMockResult('ZZ', -80, 11);
      zzManager.evaluateFirstPrediction(result);
      expect(zzManager.isAntiZZActive()).toBe(true);

      // Record some more predictions
      zzManager.recordPredictionResult(createMockResult('AntiZZ', 60, 12));
      zzManager.recordPredictionResult(createMockResult('AntiZZ', -40, 13));

      // Resolve the run
      const record = zzManager.resolveZZRun(14);

      expect(record).not.toBeNull();
      expect(record!.wasAntiZZ).toBe(true);
      expect(record!.pocket).toBe(1);
      expect(record!.firstPredictionNegative).toBe(true);
      expect(record!.profit).toBe(-80 + 60 - 40); // -60%
      expect(record!.predictionCount).toBe(3);
    });

    it('should return to inactive state after resolution', () => {
      zzManager.activateZZ(10, 150, 1);
      const result = createMockResult('ZZ', -80, 11);
      zzManager.evaluateFirstPrediction(result);

      zzManager.resolveZZRun(14);

      expect(zzManager.getCurrentState()).toBe('inactive');
      expect(zzManager.isSystemActive()).toBe(false);
    });

    it('should preserve previous run profit for next activation', () => {
      // First run
      zzManager.activateZZ(10, 100, 1);
      const result = createMockResult('ZZ', 80, 11);
      zzManager.evaluateFirstPrediction(result);
      zzManager.recordPredictionResult(createMockResult('ZZ', 70, 12));

      const record = zzManager.resolveZZRun(13);
      expect(record!.profit).toBe(150); // 80 + 70

      // Second activation - should use previous run profit for pocket
      zzManager.activateZZ(15, record!.profit, 1);

      expect(zzManager.getCurrentPocket()).toBe(1); // Profit > 0 → Pocket 1
    });

    it('should assign Pocket 2 after negative Anti-ZZ run', () => {
      // Run with overall loss
      zzManager.activateZZ(10, 100, 1);
      const result = createMockResult('ZZ', -80, 11);
      zzManager.evaluateFirstPrediction(result); // Triggers Anti-ZZ
      zzManager.recordPredictionResult(createMockResult('AntiZZ', -50, 12));

      const record = zzManager.resolveZZRun(13);
      expect(record!.profit).toBe(-130); // -80 - 50

      // Next activation
      zzManager.activateZZ(15, record!.profit, 1);
      expect(zzManager.getCurrentPocket()).toBe(2); // Profit < 0 → Pocket 2
    });
  });

  // =========================================================================
  // Additional edge cases
  // =========================================================================
  describe('Edge Cases', () => {
    it('should handle breakeven previous run', () => {
      // First activation with default pocket
      expect(zzManager.getCurrentPocket()).toBe(1); // Default

      zzManager.activateZZ(10, 0, 1); // Breakeven = 0

      // Should keep current pocket (1)
      expect(zzManager.getCurrentPocket()).toBe(1);
    });

    it('should track run history correctly', () => {
      // Run 1: ZZ with profit
      zzManager.activateZZ(10, 0, 1);
      zzManager.evaluateFirstPrediction(createMockResult('ZZ', 80, 11));
      zzManager.resolveZZRun(12);

      // Run 2: Anti-ZZ with loss
      zzManager.activateZZ(13, 80, 1);
      zzManager.evaluateFirstPrediction(createMockResult('ZZ', -70, 14));
      zzManager.resolveZZRun(15);

      const history = zzManager.getRunHistory();
      expect(history.length).toBe(2);
      expect(history[0].wasAntiZZ).toBe(false);
      expect(history[1].wasAntiZZ).toBe(true);
    });

    it('should provide correct statistics', () => {
      // Run 1: ZZ in Pocket 1
      zzManager.activateZZ(10, 0, 1);
      zzManager.evaluateFirstPrediction(createMockResult('ZZ', 80, 11));
      zzManager.resolveZZRun(12);

      // Run 2: Anti-ZZ in Pocket 1
      zzManager.activateZZ(13, 80, 1);
      zzManager.evaluateFirstPrediction(createMockResult('ZZ', -70, 14));
      zzManager.recordPredictionResult(createMockResult('AntiZZ', 50, 15));
      zzManager.resolveZZRun(16);

      const stats = zzManager.getStatistics();
      expect(stats.totalRuns).toBe(2);
      expect(stats.zzRuns).toBe(1);
      expect(stats.antiZZRuns).toBe(1);
      expect(stats.zzProfit).toBe(80);
      expect(stats.antiZZProfit).toBe(-70 + 50); // -20
      expect(stats.pocket1Runs).toBe(2);
      expect(stats.pocket2Runs).toBe(0);
      expect(stats.firstPredictionNegativeCount).toBe(1);
    });

    it('should reset all state correctly', () => {
      zzManager.activateZZ(10, 150, 1);
      zzManager.evaluateFirstPrediction(createMockResult('ZZ', 80, 11));

      zzManager.reset();

      expect(zzManager.getCurrentState()).toBe('inactive');
      expect(zzManager.getCurrentPocket()).toBe(1);
      expect(zzManager.getRunHistory().length).toBe(0);
      expect(zzManager.isSystemActive()).toBe(false);
    });

    it('should export and import state correctly', () => {
      zzManager.activateZZ(10, 150, 1);
      zzManager.evaluateFirstPrediction(createMockResult('ZZ', 80, 11));

      const exported = zzManager.exportState();

      const newManager = createZZStateManager();
      newManager.importState(exported);

      expect(newManager.getCurrentState()).toBe('zz_active');
      expect(newManager.getCurrentPocket()).toBe(1);
      expect(newManager.getState().firstPredictionEvaluated).toBe(true);
    });
  });
});
