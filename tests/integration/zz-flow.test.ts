/**
 * Ghost Evaluator - ZZ/AntiZZ Integration Tests
 * ==============================================
 *
 * Tests for the complete ZZ/AntiZZ flow through the system.
 * See POCKET-SYSTEM-SPEC.md for the authoritative rules.
 */

import { ZZStateManager, createZZStateManager } from '../../src/engine/zz-state-manager';
import { Direction, EvaluatedResult } from '../../src/types';

describe('ZZ/AntiZZ Complete Flow', () => {
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

  describe('Scenario 1: Normal ZZ Flow (wins continuously)', () => {
    it('should handle: indicator → bet → win → continue → win → continue', () => {
      // Initial state: ZZ in P1
      expect(manager.getZZPocket()).toBe(1);

      // Indicator detected
      manager.handleIndicator(5, 1);
      expect(manager.getActivePattern()).toBe('ZZ');
      expect(manager.shouldGenerateZZSignal()).toBe(true);

      // First bet: WIN
      manager.recordZZResult(createResult('ZZ', 80), 6);
      expect(manager.getActivePattern()).toBe('ZZ'); // Still active
      expect(manager.shouldGenerateZZSignal()).toBe(true); // Continue betting

      // Second bet: WIN
      manager.recordZZResult(createResult('ZZ', 70), 7);
      expect(manager.getActivePattern()).toBe('ZZ'); // Still active
      expect(manager.getRunProfitZZ()).toBe(150); // Cumulative

      // Third bet: LOSS (run ends)
      manager.recordZZResult(createResult('ZZ', -60), 8);
      expect(manager.getActivePattern()).toBeNull(); // Deactivated
      expect(manager.getZZPocket()).toBe(1); // Still P1 (profit was +90)
    });
  });

  describe('Scenario 2: ZZ First Bet Negative → AntiZZ Activates', () => {
    it('should handle: indicator → ZZ first bet loss → AntiZZ becomes candidate → next indicator → AntiZZ plays', () => {
      // Indicator detected
      manager.handleIndicator(5, 1);
      expect(manager.getActivePattern()).toBe('ZZ');

      // First bet: LOSS
      manager.recordZZResult(createResult('ZZ', -70), 6);

      // ZZ should now be inactive
      expect(manager.getActivePattern()).toBeNull();

      // AntiZZ should be candidate for NEXT indicator
      expect(manager.isAntiZZCandidate()).toBe(true);
      expect(manager.getAntiZZPocket()).toBe(1);

      // Next indicator comes
      manager.handleIndicator(10, -1);

      // AntiZZ should activate
      expect(manager.getActivePattern()).toBe('AntiZZ');
      expect(manager.shouldGenerateAntiZZSignal()).toBe(true);
    });
  });

  describe('Scenario 3: AntiZZ Wins → Stays P1 → Bets on Next Indicator', () => {
    it('should handle: AntiZZ active → win → stays P1 → next indicator → AntiZZ plays again', () => {
      // Set up AntiZZ in P1 as candidate
      const state = manager.exportState();
      state.antiZZPocket = 1;
      state.antiZZIsCandidate = true;
      manager.importState(state);

      // First indicator: AntiZZ activates
      manager.handleIndicator(5, 1);
      expect(manager.getActivePattern()).toBe('AntiZZ');

      // AntiZZ bet: WIN
      manager.recordAntiZZResult(createResult('AntiZZ', 75), 6);

      // AntiZZ should deactivate after one bet
      expect(manager.getActivePattern()).toBeNull();

      // But stay in P1
      expect(manager.getAntiZZPocket()).toBe(1);

      // Next indicator: AntiZZ should activate again
      manager.handleIndicator(12, -1);
      expect(manager.getActivePattern()).toBe('AntiZZ');
    });
  });

  describe('Scenario 4: ZZ Run Negative → P2 → Imaginary → Back to P1', () => {
    it('should handle: ZZ run ends negative → P2 → imaginary positive → P1', () => {
      // Start in P1
      manager.handleIndicator(5, 1);

      // First bet: LOSS (goes to P2)
      manager.recordZZResult(createResult('ZZ', -70), 6);
      expect(manager.getZZPocket()).toBe(2);

      // AntiZZ becomes candidate
      expect(manager.isAntiZZCandidate()).toBe(true);

      // Next indicator: AntiZZ plays
      manager.handleIndicator(10, -1);
      expect(manager.getActivePattern()).toBe('AntiZZ');

      // AntiZZ loses → SWAP: AntiZZ to P2, ZZ to P1, ZZ activates immediately
      manager.recordAntiZZResult(createResult('AntiZZ', -60), 11);
      expect(manager.getAntiZZPocket()).toBe(2);
      expect(manager.getZZPocket()).toBe(1);  // SWAP - ZZ goes to P1
      expect(manager.getActivePattern()).toBe('ZZ');  // ZZ activates immediately after SWAP
      expect(manager.getRunProfitZZ()).toBe(60);  // ZZ's imaginary first bet = AntiZZ's pct

      // ZZ should bet immediately (no need for next indicator)
      expect(manager.shouldGenerateZZSignal()).toBe(true);
    });
  });

  describe('Scenario 5: Complete State Machine Traversal', () => {
    it('should traverse all major states correctly', () => {
      // 1. Start: ZZ P1, AntiZZ P2
      expect(manager.getZZPocket()).toBe(1);
      expect(manager.getAntiZZPocket()).toBe(2);

      // 2. Indicator → ZZ activates
      manager.handleIndicator(5, 1);
      expect(manager.getActivePattern()).toBe('ZZ');

      // 3. ZZ wins some, then loses (run ends positive)
      manager.recordZZResult(createResult('ZZ', 80), 6);
      manager.recordZZResult(createResult('ZZ', 50), 7);
      manager.recordZZResult(createResult('ZZ', -60), 8);
      expect(manager.getZZPocket()).toBe(1); // Still P1 (70% profit)

      // 4. Next indicator → ZZ activates again
      manager.handleIndicator(12, -1);
      expect(manager.getActivePattern()).toBe('ZZ');

      // 5. ZZ first bet LOSS → AntiZZ candidate
      manager.recordZZResult(createResult('ZZ', -70), 13);
      expect(manager.isAntiZZCandidate()).toBe(true);
      expect(manager.getZZPocket()).toBe(2); // Now P2

      // 6. Next indicator → AntiZZ plays
      manager.handleIndicator(18, 1);
      expect(manager.getActivePattern()).toBe('AntiZZ');

      // 7. AntiZZ loses → SWAP: AntiZZ to P2, ZZ to P1, ZZ activates immediately
      manager.recordAntiZZResult(createResult('AntiZZ', -65), 19);
      expect(manager.getAntiZZPocket()).toBe(2);
      expect(manager.getZZPocket()).toBe(1);  // SWAP - ZZ goes to P1
      expect(manager.getActivePattern()).toBe('ZZ');  // ZZ activates immediately
      expect(manager.getRunProfitZZ()).toBe(65);  // ZZ's imaginary first bet = AntiZZ's pct

      // 8. ZZ bets (already active from SWAP, no need for indicator)
      manager.recordZZResult(createResult('ZZ', 80), 20);
      expect(manager.getActivePattern()).toBe('ZZ');
      expect(manager.getRunProfitZZ()).toBe(145);  // 65 + 80

      // 9. ZZ loses (not first bet) → run ends, check pocket based on runProfitZZ
      manager.recordZZResult(createResult('ZZ', -70), 21);
      // runProfitZZ = 145 - 70 = 75 (positive) → ZZ stays P1
      expect(manager.getZZPocket()).toBe(1);
      expect(manager.getActivePattern()).toBeNull();

      // 11. State after full traversal
      expect(manager.getZZPocket()).toBe(1);
      expect(manager.getAntiZZPocket()).toBe(2);
      expect(manager.getActivePattern()).toBeNull();
    });
  });

  describe('Scenario 6: B&S Mode Handling', () => {
    it('should not generate signals during B&S but continue tracking', () => {
      // Activate ZZ
      manager.handleIndicator(5, 1);
      expect(manager.shouldGenerateZZSignal()).toBe(true);

      // Enter B&S mode
      manager.setBaitSwitchMode(true);

      // Should not generate signals
      expect(manager.shouldGenerateZZSignal()).toBe(false);

      // But state should still be tracked
      expect(manager.getActivePattern()).toBe('ZZ');
      expect(manager.getState().isInBaitSwitch).toBe(true);
    });
  });

  describe('Scenario 7: Zero Profit Edge Case', () => {
    it('should keep ZZ in P1 when run ends with exactly 0 profit', () => {
      manager.handleIndicator(5, 1);

      // Win 70, lose 70 → exactly 0
      manager.recordZZResult(createResult('ZZ', 70), 6);
      manager.recordZZResult(createResult('ZZ', -70), 7);

      // Per user decision: >= 0 → P1
      expect(manager.getZZPocket()).toBe(1);
    });
  });

  describe('Scenario 8: Multiple Indicators Without Activation', () => {
    it('should handle multiple indicators when both patterns in P2', () => {
      // Force both to P2
      const state = manager.exportState();
      state.zzPocket = 2;
      state.antiZZPocket = 2;
      state.runProfitZZ = -50;
      manager.importState(state);

      // First indicator
      manager.handleIndicator(5, 1);
      expect(manager.isWaitingForFirstBet()).toBe(true);

      // Imaginary negative
      manager.evaluateImaginaryFirstBet(1, 70, 6);
      expect(manager.isAntiZZCandidate()).toBe(true);

      // Second indicator → AntiZZ activates
      manager.handleIndicator(10, -1);
      expect(manager.getActivePattern()).toBe('AntiZZ');
    });
  });
});
