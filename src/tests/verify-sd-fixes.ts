#!/usr/bin/env ts-node
/**
 * Verify SD Fixes
 * ================
 * Tests the 3 fixes implemented:
 * 1. Resume only on alternation patterns (not Anti patterns)
 * 2. accLoss frozen during pause
 * 3. ZZ formation reversal
 */

import {
  createSameDirectionManager,
  RESUME_TRIGGER_PATTERNS,
} from '../engine/same-direction';
import { Block, Direction } from '../types';

// Helper to create a block
function block(index: number, dir: Direction, pct: number): Block {
  return {
    index,
    dir,
    pct,
    ts: new Date().toISOString(),
  };
}

console.log('='.repeat(80));
console.log('  VERIFY SD FIXES');
console.log('='.repeat(80));

// ============================================================================
// TEST 1: Resume only on alternation patterns
// ============================================================================
console.log('\n' + '='.repeat(80));
console.log('TEST 1: Resume Trigger - Only Alternation Patterns');
console.log('='.repeat(80));

console.log('\nRESUME_TRIGGER_PATTERNS:', RESUME_TRIGGER_PATTERNS);
console.log('Expected: ZZ, 2A2, 3A3, 4A4, 5A5, 6A6 (NO Anti patterns)');

const hasAntiPatterns = RESUME_TRIGGER_PATTERNS.some(p => p.startsWith('Anti'));
console.log(`\n✓ Contains Anti patterns: ${hasAntiPatterns ? 'YES (BAD!)' : 'NO (GOOD!)'}`);

// Test that AntiZZ break does NOT trigger resume
const sd1 = createSameDirectionManager();

// Activate SD
const blocks1 = [
  block(0, 1, 50),
  block(1, 1, 80),
  block(2, 1, 80),
  block(3, 1, 80),
  block(4, -1, 30), // Break - RunProfit = 80+80+80-30 = 210 -> activate
];
blocks1.forEach(b => sd1.processBlock(b));
console.log('\n--- After activation ---');
console.log(`SD Active: ${sd1.isActive()}, Paused: ${sd1.isPaused()}`);

// Pause SD
sd1.pause('HIGH_PCT_REVERSAL', 5);
console.log('\n--- After pause ---');
console.log(`SD Active: ${sd1.isActive()}, Paused: ${sd1.isPaused()}`);

// Try to resume with AntiZZ break
console.log('\n--- Recording AntiZZ LOSS ---');
sd1.recordZZXAXResult('AntiZZ', false, 6);
const resumed1 = sd1.checkResumeCondition(6);
console.log(`Resume triggered by AntiZZ: ${resumed1 ? 'YES (BAD!)' : 'NO (GOOD!)'}`);
console.log(`SD Paused after AntiZZ break: ${sd1.isPaused()}`);

// Try to resume with ZZ break
console.log('\n--- Recording ZZ LOSS ---');
sd1.recordZZXAXResult('ZZ', false, 7);
const resumed2 = sd1.checkResumeCondition(7);
console.log(`Resume triggered by ZZ: ${resumed2 ? 'YES (GOOD!)' : 'NO (BAD!)'}`);
console.log(`SD Paused after ZZ break: ${sd1.isPaused()}`);

const test1Pass = !resumed1 && resumed2;
console.log(`\n${test1Pass ? '✅ TEST 1 PASSED' : '❌ TEST 1 FAILED'}: Resume only on alternation patterns`);

// ============================================================================
// TEST 2: accLoss frozen during pause
// ============================================================================
console.log('\n' + '='.repeat(80));
console.log('TEST 2: accLoss Frozen During Pause');
console.log('='.repeat(80));

const sd2 = createSameDirectionManager();

// Activate SD with some accumulated loss
const blocks2a = [
  block(0, 1, 50),
  block(1, 1, 90),
  block(2, 1, 90),
  block(3, -1, 30), // Break - RunProfit = 90+90-30 = 150 -> activate
];
blocks2a.forEach(b => sd2.processBlock(b));

// Add some loss
const blocks2b = [
  block(4, -1, 40),
  block(5, 1, 80), // Break - RunProfit = 40-80 = -40 -> accLoss += 40
];
blocks2b.forEach(b => sd2.processBlock(b));
const accLossBeforePause = sd2.getAccumulatedLoss();
console.log(`\nAccumulated loss before pause: ${accLossBeforePause}%`);

// Pause
sd2.pause('HIGH_PCT_REVERSAL', 6);
console.log('--- SD Paused ---');

// Process blocks that would cause loss during pause
const blocks2c = [
  block(6, 1, 60),
  block(7, -1, 100), // Break - RunProfit = 60-100 = -40 (should NOT add to accLoss)
];
blocks2c.forEach(b => sd2.processBlock(b));

const accLossAfterPause = sd2.getAccumulatedLoss();
console.log(`Accumulated loss after pause blocks: ${accLossAfterPause}%`);

const test2Pass = accLossBeforePause === accLossAfterPause;
console.log(`\n${test2Pass ? '✅ TEST 2 PASSED' : '❌ TEST 2 FAILED'}: accLoss frozen during pause (${accLossBeforePause} -> ${accLossAfterPause})`);

// ============================================================================
// TEST 3: ZZ Formation Reversal
// ============================================================================
console.log('\n' + '='.repeat(80));
console.log('TEST 3: ZZ Formation Reversal');
console.log('='.repeat(80));

const sd3 = createSameDirectionManager();

// Activate SD
const blocks3a = [
  block(0, 1, 50),
  block(1, 1, 90),
  block(2, 1, 90),
  block(3, -1, 30), // Break - RunProfit = 150 -> activate
];
blocks3a.forEach(b => sd3.processBlock(b));
console.log(`\nSD Active: ${sd3.isActive()}, accLoss: ${sd3.getAccumulatedLoss()}%`);

// Create alternating blocks that form ZZ (SD takes flip losses)
const blocks3b = [
  block(4, -1, 40), // run of 1
  block(5, 1, 60),  // flip - accLoss should += 60
  block(6, -1, 50), // flip - accLoss should += 50
  block(7, 1, 40),  // flip - accLoss should += 40 -> ZZ forms here!
];
blocks3b.forEach(b => sd3.processBlock(b));

const accLossAfterFlips = sd3.getAccumulatedLoss();
console.log(`\nAccumulated loss after flip losses: ${accLossAfterFlips}%`);

// ZZ signal forms (first ZZ trade)
console.log('\n--- Recording ZZ WIN (signal formed) ---');
sd3.recordZZXAXResult('ZZ', true, 7);

const accLossAfterZZSignal = sd3.getAccumulatedLoss();
console.log(`Accumulated loss after ZZ formation: ${accLossAfterZZSignal}%`);

const lossReversed = accLossAfterFlips - accLossAfterZZSignal;
console.log(`Loss reversed: ${lossReversed}%`);

const test3Pass = lossReversed > 0;
console.log(`\n${test3Pass ? '✅ TEST 3 PASSED' : '❌ TEST 3 FAILED'}: ZZ formation reversal (reversed ${lossReversed}%)`);

// ============================================================================
// SUMMARY
// ============================================================================
console.log('\n' + '='.repeat(80));
console.log('  SUMMARY');
console.log('='.repeat(80));

const allPassed = test1Pass && test2Pass && test3Pass;
console.log(`\nTest 1 (Resume Trigger):     ${test1Pass ? '✅ PASS' : '❌ FAIL'}`);
console.log(`Test 2 (accLoss Frozen):     ${test2Pass ? '✅ PASS' : '❌ FAIL'}`);
console.log(`Test 3 (ZZ Formation Rev.):  ${test3Pass ? '✅ PASS' : '❌ FAIL'}`);
console.log(`\n${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
console.log('='.repeat(80));
