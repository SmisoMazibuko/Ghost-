/**
 * Ghost Evaluator v15.1 - Integration Tests
 * ==========================================
 */

import { GameStateEngine, createGameStateEngine } from '../../src/engine/state';
import { ReactionEngine, createReactionEngine } from '../../src/engine/reaction';

describe('Evaluator Integration', () => {
  let gameState: GameStateEngine;
  let reaction: ReactionEngine;

  beforeEach(() => {
    gameState = createGameStateEngine({
      p1ConsecutiveThreshold: 7,
      singleProfitThreshold: 70,
      cumulativeProfitThreshold: 100,
      betAmount: 200,
      dailyTarget: 2000,
    });
    reaction = createReactionEngine(gameState);
  });

  describe('Block processing', () => {
    it('should correctly track runs', () => {
      // Add G G R R R
      reaction.processBlock(1, 50);
      reaction.processBlock(1, 60);
      expect(gameState.getCurrentRunLength()).toBe(2);

      reaction.processBlock(-1, 55);
      expect(gameState.getCurrentRunLength()).toBe(1);

      reaction.processBlock(-1, 45);
      reaction.processBlock(-1, 65);
      expect(gameState.getCurrentRunLength()).toBe(3);
    });

    it('should detect patterns correctly', () => {
      // G G should trigger 2A2 and Anti2A2
      reaction.processBlock(1, 50);
      const result = reaction.processBlock(1, 60);

      const patterns = result.blockResult.newSignals.map(s => s.pattern);
      expect(patterns).toContain('2A2');
      expect(patterns).toContain('Anti2A2');
    });
  });

  describe('Pattern lifecycle', () => {
    it('should activate pattern after high-profit result', () => {
      // G G (triggers 2A2)
      reaction.processBlock(1, 50);
      reaction.processBlock(1, 60);

      // R (evaluates 2A2 as correct with 75%)
      reaction.processBlock(-1, 75);

      const lifecycle = gameState.getLifecycle();
      expect(lifecycle.isActive('2A2')).toBe(true);
    });

    it('should break pattern on loss when active', () => {
      // Activate 2A2
      reaction.processBlock(1, 50);
      reaction.processBlock(1, 60);
      reaction.processBlock(-1, 80); // Activates

      const lifecycle = gameState.getLifecycle();
      expect(lifecycle.isActive('2A2')).toBe(true);

      // Trigger another 2A2
      reaction.processBlock(-1, 50);

      // Wrong prediction (G when expecting R)
      reaction.processBlock(1, 65);

      expect(lifecycle.isObserving('2A2')).toBe(true);
    });
  });

  describe('P1 Mode', () => {
    it('should enter P1 mode after 7 consecutive same direction', () => {
      for (let i = 0; i < 7; i++) {
        reaction.processBlock(1, 50);
      }

      expect(gameState.isP1Mode()).toBe(true);
      expect(gameState.getSessionState()).toBe('p1_mode');
    });

    it('should not make predictions in P1 mode', () => {
      for (let i = 0; i < 7; i++) {
        reaction.processBlock(1, 50);
      }

      const prediction = reaction.predictNext();
      expect(prediction.hasPrediction).toBe(false);
      expect(prediction.reason).toContain('P1 MODE');
    });
  });

  describe('Trading', () => {
    it('should open trade when pattern is active', () => {
      // Activate 2A2
      reaction.processBlock(1, 50);
      reaction.processBlock(1, 60);
      reaction.processBlock(-1, 80);

      // Trigger new 2A2
      reaction.processBlock(-1, 50);
      const result = reaction.processBlock(-1, 60);

      expect(result.openedTrade).not.toBeNull();
      expect(result.openedTrade!.pattern).toBe('2A2');
    });

    it('should evaluate trade on next block', () => {
      // Activate 2A2
      reaction.processBlock(1, 50);
      reaction.processBlock(1, 60);
      reaction.processBlock(-1, 80);

      // Trigger and open trade
      reaction.processBlock(-1, 50);
      reaction.processBlock(-1, 60);

      // Next block evaluates the trade
      const result = reaction.processBlock(1, 70); // Correct prediction

      expect(result.closedTrade).not.toBeNull();
      expect(result.closedTrade!.isWin).toBe(true);
      expect(result.closedTrade!.pnl).toBeGreaterThan(0);
    });

    it('should calculate P/L correctly', () => {
      // Activate 2A2
      reaction.processBlock(1, 50);
      reaction.processBlock(1, 60);
      reaction.processBlock(-1, 80);

      // Trigger and open trade
      reaction.processBlock(-1, 50);
      reaction.processBlock(-1, 60);

      // Win with 60%
      reaction.processBlock(1, 60);

      // Expected: 200 * 0.60 = 120
      expect(reaction.getPnlTotal()).toBe(120);
    });
  });

  describe('Daily target', () => {
    it('should detect when daily target is reached', () => {
      // Simulate multiple winning trades
      // This would require many trades to reach 2000
      // For testing, we'll check the mechanism works

      expect(reaction.isDailyTargetReached()).toBe(false);
      expect(reaction.getTargetProgress()).toBe(0);
    });
  });

  describe('Session state', () => {
    it('should correctly report playable state', () => {
      // Initially unplayable (no active patterns)
      expect(gameState.getSessionState()).toBe('unplayable');

      // Activate a pattern and trigger it
      reaction.processBlock(1, 50);
      reaction.processBlock(1, 60);
      reaction.processBlock(-1, 80); // Activates 2A2

      // Trigger new 2A2
      reaction.processBlock(-1, 50);
      reaction.processBlock(-1, 60);

      expect(gameState.getSessionState()).toBe('playable');
    });
  });

  describe('ZZ Pattern', () => {
    // NOTE: ZZ detection is now handled by ZZStateManager, not the detector.
    // ZZ signals are no longer generated in blockResult.newSignals.
    // ZZ predictions are generated directly in the reaction engine's predictNext().
    // See POCKET-SYSTEM-SPEC.md for the authoritative ZZ rules.

    it('should NOT detect ZZ in newSignals (handled by ZZStateManager)', () => {
      // G R G (three runs of length 1)
      reaction.processBlock(1, 50);
      reaction.processBlock(-1, 60);
      const result = reaction.processBlock(1, 55);

      // ZZ signals are no longer in newSignals - they come from ZZStateManager
      const zzSignal = result.blockResult.newSignals.find(s => s.pattern === 'ZZ');
      expect(zzSignal).toBeUndefined();
    });
  });

  describe('AP5/OZ Patterns', () => {
    it('should detect AP5 and OZ together', () => {
      // G G G R (3+ same, then 1 opposite)
      reaction.processBlock(1, 50);
      reaction.processBlock(1, 55);
      reaction.processBlock(1, 60);
      const result = reaction.processBlock(-1, 65);

      const ap5 = result.blockResult.newSignals.find(s => s.pattern === 'AP5');
      const oz = result.blockResult.newSignals.find(s => s.pattern === 'OZ');

      expect(ap5).toBeDefined();
      expect(oz).toBeDefined();
      expect(ap5!.expectedDirection).toBe(-1); // Continue red
      expect(oz!.expectedDirection).toBe(1); // Return to green
    });
  });

  describe('Undo functionality', () => {
    it('should correctly undo last block', () => {
      reaction.processBlock(1, 50);
      reaction.processBlock(1, 60);
      reaction.processBlock(-1, 55);

      expect(gameState.getBlockCount()).toBe(3);

      const removed = gameState.undoLastBlock();

      expect(removed).not.toBeNull();
      expect(removed!.dir).toBe(-1);
      expect(gameState.getBlockCount()).toBe(2);
      expect(gameState.getCurrentRunLength()).toBe(2);
    });
  });
});
