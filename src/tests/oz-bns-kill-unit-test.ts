/**
 * OZ B&S Kill Rules - Unit Test
 * ==============================
 * Direct unit tests for OZ B&S kill conditions by
 * manually setting up the B&S state and testing the kill logic.
 *
 * OZ BAIT pattern: [3+ run] → [single opposite] → [3+ flip back]
 *
 * Kill conditions:
 * 1. Waiting for bait: expected single opposite, but got >=2 (no bait)
 * 2. After bait (single confirmed): flip back < 3
 */

import { BucketManager } from '../engine/bucket-manager';

// Helper to create a mock BucketManager with OZ in B&S
function createOZInBnS(): BucketManager {
  const bucketManager = new BucketManager();

  // Manually set OZ to BNS bucket and initialize OZ B&S state
  // @ts-expect-error - accessing private for testing
  bucketManager.patternBuckets.set('OZ', 'BNS');
  bucketManager.initializeOZBnsState(0);

  return bucketManager;
}

// Helper to simulate first flip and start waiting for single
function simulateFirstFlip(bucketManager: BucketManager, blockIndex: number): void {
  // Simulate a flip (isFlip=true, currentRunLength=1) to trigger waitingForFirstFlip -> false
  bucketManager.checkOZBnsKillConditions(1, 3, true, blockIndex);
}

// Helper to log test result
function logTest(name: string, passed: boolean, details?: string): void {
  const status = passed ? '✓ PASS' : '✗ FAIL';
  console.log(`${status}: ${name}`);
  if (details) {
    console.log(`       ${details}`);
  }
}

// Test 1: Kill when run ≥2 instead of single (bait not confirmed)
function testKillOnRunNotSingle(): void {
  console.log('\n--- Test 1: Kill when run ≥2 (bait not confirmed) ---');

  const bucketManager = createOZInBnS();
  simulateFirstFlip(bucketManager, 1);
  const ozBnsState = bucketManager.getOZBnsState()!;

  // State: waiting for single after switch
  console.log(`After first flip: waitingForSingle=${ozBnsState.waitingForSingle}`);

  // Simulate: run reaches 2 (not single)
  const result = bucketManager.checkOZBnsKillConditions(
    2,  // currentRunLength = 2 (NOT single)
    1,  // previousRunLength = 1
    false, // not a flip
    10  // blockIndex
  );

  logTest(
    'Should kill when run ≥2 instead of single',
    result?.shouldKill === true,
    `Result: ${JSON.stringify(result)}`
  );

  // Also test with run = 3
  const bucketManager2 = createOZInBnS();
  simulateFirstFlip(bucketManager2, 1);
  const result2 = bucketManager2.checkOZBnsKillConditions(
    3,  // currentRunLength = 3
    1,  // previousRunLength
    false,
    10
  );

  logTest(
    'Should kill when run = 3 instead of single',
    result2?.shouldKill === true,
    `Result: ${JSON.stringify(result2)}`
  );
}

// Test 2: Kill when flip back < 3 after bait (single)
function testKillOnFlipBackLessThan3(): void {
  console.log('\n--- Test 2: Kill when flip back < 3 after bait ---');
  console.log('Scenario: After switch, single (bait) detected, then flip back < 3 → KILL');

  const bucketManager = createOZInBnS();
  simulateFirstFlip(bucketManager, 1);

  // Step 1: Bait detected (single appeared) - simulate single then flip
  // First, the single stays at 1 (no kill)
  const stateAfterSingleStart = bucketManager.getOZBnsState()!;
  console.log(`After first flip: waitingForSingle=${stateAfterSingleStart.waitingForSingle}`);

  // Step 2: Single ends with flip (previousRunLength = 1), bait confirmed
  bucketManager.checkOZBnsKillConditions(
    1,  // currentRunLength = 1 (start of flip back)
    1,  // previousRunLength = 1 (single!)
    true, // IS a flip
    10
  );

  const stateAfterBait = bucketManager.getOZBnsState()!;
  console.log(`After bait confirmed: baitConfirmed=${stateAfterBait.baitConfirmed}, waitingForSingle=${stateAfterBait.waitingForSingle}`);

  // Step 3: Flip back is only 2 (< 3), then another flip → KILL
  const result = bucketManager.checkOZBnsKillConditions(
    1,  // currentRunLength = 1 (new flip)
    2,  // previousRunLength = 2 (flip back was < 3!)
    true, // IS a flip
    12
  );

  logTest(
    'Should kill when flip back < 3 after bait',
    result?.shouldKill === true,
    `Result: ${JSON.stringify(result)}`
  );
}

// Test 3: NOT kill when single appears (bait forming)
function testNotKillOnSingle(): void {
  console.log('\n--- Test 3: NOT kill when single appears (bait forming) ---');

  const bucketManager = createOZInBnS();
  simulateFirstFlip(bucketManager, 1);

  // Single stays at 1 (no kill, bait is forming)
  const result = bucketManager.checkOZBnsKillConditions(
    1,  // currentRunLength = 1 (single!)
    3,  // previousRunLength
    false, // not a flip yet
    10
  );

  logTest(
    'Should NOT kill when run stays at 1 (single/bait)',
    result?.shouldKill === false || result === null,
    `Result: ${JSON.stringify(result)}`
  );
}

// Test 4: NOT kill when OZ not in B&S
function testNotKillWhenNotInBnS(): void {
  console.log('\n--- Test 4: NOT kill when OZ not in B&S ---');

  const bucketManager = new BucketManager();
  // OZ is in WAITING by default, not B&S

  const result = bucketManager.checkOZBnsKillConditions(
    2,  // currentRunLength = 2
    1,
    false,
    10
  );

  logTest(
    'Should return null when OZ not in B&S',
    result === null,
    `Result: ${JSON.stringify(result)}`
  );
}

// Test 5: NOT kill when flip back >= 3 (successful bait cycle)
function testNotKillOnSuccessfulFlipBack(): void {
  console.log('\n--- Test 5: NOT kill when flip back >= 3 (success) ---');

  const bucketManager = createOZInBnS();
  simulateFirstFlip(bucketManager, 1);

  // Step 1: Bait (single) confirmed via flip
  bucketManager.checkOZBnsKillConditions(
    1,  // currentRunLength = 1 (start of flip back)
    1,  // previousRunLength = 1 (single!)
    true, // IS a flip
    10
  );

  const stateAfterBait = bucketManager.getOZBnsState()!;
  console.log(`After bait confirmed: baitConfirmed=${stateAfterBait.baitConfirmed}`);

  // Step 2: Flip back reaches 3+ then flips → NO KILL (success!)
  const result = bucketManager.checkOZBnsKillConditions(
    1,  // currentRunLength = 1 (new flip)
    3,  // previousRunLength = 3 (flip back was >= 3!)
    true, // IS a flip
    14
  );

  logTest(
    'Should NOT kill when flip back >= 3 (successful cycle)',
    result?.shouldKill === false,
    `Result: ${JSON.stringify(result)}`
  );

  // Check that state reset for next bait
  const stateAfterSuccess = bucketManager.getOZBnsState()!;
  logTest(
    'Should reset to wait for next bait after success',
    stateAfterSuccess.waitingForSingle === true && stateAfterSuccess.baitConfirmed === false,
    `State: waitingForSingle=${stateAfterSuccess.waitingForSingle}, baitConfirmed=${stateAfterSuccess.baitConfirmed}`
  );
}

// Test 6: Full kill scenario - no bait (run extends)
function testFullKillScenarioNoBait(): void {
  console.log('\n--- Test 6: Full Kill Scenario (no bait) ---');

  const bucketManager = createOZInBnS();

  console.log('Step 1: OZ in B&S, waiting for first flip...');
  console.log(`  Bucket: ${bucketManager.getBucket('OZ')}`);
  console.log(`  OZ B&S State: ${JSON.stringify(bucketManager.getOZBnsState())}`);

  console.log('\nStep 2: First flip happens...');
  simulateFirstFlip(bucketManager, 1);
  console.log(`  OZ B&S State after flip: ${JSON.stringify(bucketManager.getOZBnsState())}`);

  console.log('\nStep 3: Run reaches 2 (not single)...');
  const killCheck = bucketManager.checkOZBnsKillConditions(2, 1, false, 10);
  console.log(`  Kill check result: ${JSON.stringify(killCheck)}`);

  if (killCheck?.shouldKill) {
    console.log('\nStep 4: Killing OZ...');
    bucketManager.killOZInBns(10, killCheck.reason);
    console.log(`  Bucket after kill: ${bucketManager.getBucket('OZ')}`);
    console.log(`  OZ B&S State after kill: ${JSON.stringify(bucketManager.getOZBnsState())}`);
  }

  logTest(
    'Full kill scenario (no bait) executed correctly',
    bucketManager.getBucket('OZ') === 'WAITING' && bucketManager.getOZBnsState() === null,
    `Final bucket: ${bucketManager.getBucket('OZ')}, OZ state: ${bucketManager.getOZBnsState()}`
  );
}

// Test 7: Full kill scenario - flip back < 3
function testFullKillScenarioFlipBackShort(): void {
  console.log('\n--- Test 7: Full Kill Scenario (flip back < 3) ---');

  const bucketManager = createOZInBnS();

  console.log('Step 1: OZ in B&S, first flip...');
  simulateFirstFlip(bucketManager, 1);

  console.log('\nStep 2: Single (bait) confirmed via flip...');
  bucketManager.checkOZBnsKillConditions(1, 1, true, 5);
  console.log(`  State: ${JSON.stringify(bucketManager.getOZBnsState())}`);

  console.log('\nStep 3: Flip back only 2, then flip again...');
  const killCheck = bucketManager.checkOZBnsKillConditions(1, 2, true, 8);
  console.log(`  Kill check result: ${JSON.stringify(killCheck)}`);

  if (killCheck?.shouldKill) {
    console.log('\nStep 4: Killing OZ...');
    bucketManager.killOZInBns(8, killCheck.reason);
    console.log(`  Bucket after kill: ${bucketManager.getBucket('OZ')}`);
  }

  logTest(
    'Full kill scenario (flip back < 3) executed correctly',
    bucketManager.getBucket('OZ') === 'WAITING' && bucketManager.getOZBnsState() === null,
    `Final bucket: ${bucketManager.getBucket('OZ')}`
  );
}

// Run all tests
console.log('\n');
console.log('╔══════════════════════════════════════════════════════════════════════╗');
console.log('║              OZ B&S KILL RULES - UNIT TESTS                          ║');
console.log('╚══════════════════════════════════════════════════════════════════════╝');

testKillOnRunNotSingle();
testKillOnFlipBackLessThan3();
testNotKillOnSingle();
testNotKillWhenNotInBnS();
testNotKillOnSuccessfulFlipBack();
testFullKillScenarioNoBait();
testFullKillScenarioFlipBackShort();

console.log('\n');
console.log('╔══════════════════════════════════════════════════════════════════════╗');
console.log('║                      UNIT TESTS COMPLETE                              ║');
console.log('╚══════════════════════════════════════════════════════════════════════╝');
