/**
 * Ghost Evaluator v15.1 - Pattern Detector Tests
 * ===============================================
 */

import { PatternDetector, createPatternDetector } from '../../src/patterns/detector';
import { RunData } from '../../src/types';

describe('PatternDetector', () => {
  let detector: PatternDetector;

  beforeEach(() => {
    detector = createPatternDetector();
  });

  describe('2A2 Pattern', () => {
    it('should detect 2A2 when run length is 2', () => {
      const runData: RunData = {
        lengths: [2],
        directions: [1],
        currentLength: 2,
        currentDirection: 1,
      };

      const signals = detector.detectAll(runData, 1);
      const signal = signals.find(s => s.pattern === '2A2');

      expect(signal).toBeDefined();
      expect(signal!.expectedDirection).toBe(-1); // Opposite of run direction
    });

    it('should not detect 2A2 when run length is not 2', () => {
      const runData: RunData = {
        lengths: [3],
        directions: [1],
        currentLength: 3,
        currentDirection: 1,
      };

      const signals = detector.detectAll(runData, 2);
      const signal = signals.find(s => s.pattern === '2A2');

      expect(signal).toBeUndefined();
    });
  });

  describe('Anti2A2 Pattern', () => {
    it('should detect Anti2A2 when run length is 2', () => {
      const runData: RunData = {
        lengths: [2],
        directions: [-1],
        currentLength: 2,
        currentDirection: -1,
      };

      const signals = detector.detectAll(runData, 1);
      const signal = signals.find(s => s.pattern === 'Anti2A2');

      expect(signal).toBeDefined();
      expect(signal!.expectedDirection).toBe(-1); // Same as run direction
    });
  });

  describe('3A3 Pattern', () => {
    it('should detect 3A3 when run length is 3', () => {
      const runData: RunData = {
        lengths: [3],
        directions: [1],
        currentLength: 3,
        currentDirection: 1,
      };

      const signals = detector.detectAll(runData, 2);
      const signal = signals.find(s => s.pattern === '3A3');

      expect(signal).toBeDefined();
      expect(signal!.expectedDirection).toBe(-1);
    });
  });

  describe('AP5 Pattern', () => {
    it('should detect AP5 when previous run >= 3 and current run = 1', () => {
      const runData: RunData = {
        lengths: [3, 1],
        directions: [1, -1],
        currentLength: 1,
        currentDirection: -1,
      };

      const signals = detector.detectAll(runData, 3);
      const signal = signals.find(s => s.pattern === 'AP5');

      expect(signal).toBeDefined();
      expect(signal!.expectedDirection).toBe(-1); // Continue new direction
    });

    it('should not detect AP5 when previous run < 3', () => {
      const runData: RunData = {
        lengths: [2, 1],
        directions: [1, -1],
        currentLength: 1,
        currentDirection: -1,
      };

      const signals = detector.detectAll(runData, 2);
      const signal = signals.find(s => s.pattern === 'AP5');

      expect(signal).toBeUndefined();
    });
  });

  describe('OZ Pattern', () => {
    it('should detect OZ when previous run >= 3 and current run = 1', () => {
      const runData: RunData = {
        lengths: [4, 1],
        directions: [1, -1],
        currentLength: 1,
        currentDirection: -1,
      };

      const signals = detector.detectAll(runData, 4);
      const signal = signals.find(s => s.pattern === 'OZ');

      expect(signal).toBeDefined();
      expect(signal!.expectedDirection).toBe(1); // Return to original direction
    });
  });

  describe('ZZ Pattern', () => {
    it('should detect ZZ when three consecutive runs of length 1', () => {
      const runData: RunData = {
        lengths: [1, 1, 1],
        directions: [1, -1, 1],
        currentLength: 1,
        currentDirection: 1,
      };

      const signals = detector.detectAll(runData, 2);
      const signal = signals.find(s => s.pattern === 'ZZ');

      expect(signal).toBeDefined();
      expect(signal!.expectedDirection).toBe(-1); // Alternation continues
    });

    it('should not detect ZZ when runs are not all length 1', () => {
      const runData: RunData = {
        lengths: [1, 2, 1],
        directions: [1, -1, 1],
        currentLength: 1,
        currentDirection: 1,
      };

      const signals = detector.detectAll(runData, 3);
      const signal = signals.find(s => s.pattern === 'ZZ');

      expect(signal).toBeUndefined();
    });
  });

  describe('AntiZZ Pattern', () => {
    it('should detect AntiZZ with opposite prediction to ZZ', () => {
      const runData: RunData = {
        lengths: [1, 1, 1],
        directions: [1, -1, 1],
        currentLength: 1,
        currentDirection: 1,
      };

      const signals = detector.detectAll(runData, 2);
      const zzSignal = signals.find(s => s.pattern === 'ZZ');
      const antiZZSignal = signals.find(s => s.pattern === 'AntiZZ');

      expect(zzSignal).toBeDefined();
      expect(antiZZSignal).toBeDefined();
      expect(zzSignal!.expectedDirection).toBe(-1);
      expect(antiZZSignal!.expectedDirection).toBe(1);
    });
  });

  describe('Pattern enabling/disabling', () => {
    it('should not detect disabled patterns', () => {
      detector.disablePattern('2A2');

      const runData: RunData = {
        lengths: [2],
        directions: [1],
        currentLength: 2,
        currentDirection: 1,
      };

      const signals = detector.detectAll(runData, 1);
      const signal = signals.find(s => s.pattern === '2A2');

      expect(signal).toBeUndefined();
    });

    it('should detect re-enabled patterns', () => {
      detector.disablePattern('2A2');
      detector.enablePattern('2A2');

      const runData: RunData = {
        lengths: [2],
        directions: [1],
        currentLength: 2,
        currentDirection: 1,
      };

      const signals = detector.detectAll(runData, 1);
      const signal = signals.find(s => s.pattern === '2A2');

      expect(signal).toBeDefined();
    });
  });
});
