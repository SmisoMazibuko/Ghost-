/**
 * OZ B&S Kill Rules Test
 * =======================
 * Tests the OZ-specific B&S kill conditions:
 * 1. After switch, run goes ≥2 instead of single (bait not confirmed) → KILL
 * 2. After switch, see 3+ run then flip (AP5 territory) → KILL
 * 3. After bait, flip back < 3 → KILL
 */

import { createGameStateEngine } from '../engine/state';
import { createReactionEngine } from '../engine/reaction';
import { Direction } from '../types';

// Helper to convert string sequence to blocks
function parseSequence(seq: string): { dir: Direction; pct: number }[] {
  const blocks: { dir: Direction; pct: number }[] = [];
  for (const char of seq) {
    if (char === 'G') {
      blocks.push({ dir: 1, pct: 75 }); // Green = Up = 1
    } else if (char === 'R') {
      blocks.push({ dir: -1, pct: 75 }); // Red = Down = -1
    }
  }
  return blocks;
}

// Helper to run a sequence and track OZ state
function runSequence(sequence: string, description: string): void {
  console.log('\n' + '='.repeat(70));
  console.log(`TEST: ${description}`);
  console.log(`Sequence: ${sequence}`);
  console.log('='.repeat(70));

  const gameState = createGameStateEngine();
  const reactionEngine = createReactionEngine(gameState);
  const bucketManager = reactionEngine.getBucketManager();

  const blocks = parseSequence(sequence);

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    reactionEngine.processBlock(block.dir, block.pct);

    const runData = gameState.getRunData();
    const ozBucket = bucketManager.getBucket('OZ');
    const ozBnsState = bucketManager.getOZBnsState();
    const ozCycle = gameState.getLifecycle().getCycle('OZ');

    console.log(
      `Block ${i}: ${block.dir > 0 ? 'G' : 'R'} | ` +
      `Run: ${runData.currentLength} | ` +
      `OZ: ${ozCycle.state} | ` +
      `Bucket: ${ozBucket} | ` +
      `OZ-BNS: ${ozBnsState ? `waitFlip=${ozBnsState.waitingForFirstFlip}, waitSingle=${ozBnsState.waitingForSingle}, baitConfirmed=${ozBnsState.baitConfirmed}` : 'null'}`
    );
  }

  // Final state
  const finalOzBucket = bucketManager.getBucket('OZ');
  const finalOzBnsState = bucketManager.getOZBnsState();
  console.log('\n--- FINAL STATE ---');
  console.log(`OZ Bucket: ${finalOzBucket}`);
  console.log(`OZ BNS State: ${finalOzBnsState ? JSON.stringify(finalOzBnsState) : 'null'}`);
}

// Test sequence that should confirm bait (NOT kill)
function testBaitConfirmed(): void {
  // GGRGGGRRRGR - bait confirmed
  // After RRR, single G appears, then single R - bait confirmed
  runSequence('GGRGGGRRRGR', 'Bait Confirmed (should NOT kill OZ)');
}

// Test sequence where switch is played (NOT kill yet)
function testSwitchPlayed(): void {
  // GGRGGGRRRGRRRGG - switch played
  // After bait (G), flip back RRR (3+), then GG (switch played)
  runSequence('GGRGGGRRRGRRRGG', 'Switch Played (should NOT kill OZ yet)');
}

// Test sequence where bait is NOT confirmed (should KILL)
function testBaitNotConfirmed(): void {
  // GGRGGGRRRGRRRGGGRRR - bait not confirmed
  // After switch (GG), next is GGG (3+, not single) → KILL OZ
  runSequence('GGRGGGRRRGRRRGGGRRR', 'Bait NOT Confirmed (should KILL OZ)');
}

// Test sequence where AP5 territory is detected (should KILL)
function testAP5Territory(): void {
  // After switch, 3+ run then flip → AP5 territory
  // GG R GGG RRR G RRR GG RRR G
  // After switch (GG), RRR (3+), then G (flip) → AP5 territory → KILL
  runSequence('GGRGGGRRRGRRRGGRRRGR', 'AP5 Territory (3+ then flip - should KILL OZ)');
}

// Test OZ MAIN kill (flip back < 3)
function testMainKill(): void {
  // OZ in MAIN, flip back only 2 → KILL
  // GG R GGG R GG R
  // OZ activates on GGG (3+ flip back after single R)
  // Next: single R, then GG (only 2, not 3+) → structural break
  runSequence('GGRGGGRGGR', 'MAIN Kill (flip back < 3)');
}

// Run all tests
console.log('\n');
console.log('╔══════════════════════════════════════════════════════════════════════╗');
console.log('║                    OZ B&S KILL RULES TEST SUITE                      ║');
console.log('╚══════════════════════════════════════════════════════════════════════╝');

testBaitConfirmed();
testSwitchPlayed();
testBaitNotConfirmed();
testAP5Territory();
testMainKill();

console.log('\n');
console.log('╔══════════════════════════════════════════════════════════════════════╗');
console.log('║                         TEST COMPLETE                                 ║');
console.log('╚══════════════════════════════════════════════════════════════════════╝');
