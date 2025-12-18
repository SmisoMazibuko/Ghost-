# HIERARCHY MANAGER SPECIFICATION

> **VERSION:** v1.0 (Authoritative)
> **STATUS:** FINAL - DO NOT REINTERPRET
> **DATE:** 2025-12-17

This document is the **single source of truth** for the Hierarchy Manager implementation.
All code must conform exactly to these rules. Any deviation is a bug.

---

## TABLE OF CONTENTS

1. [Core Philosophy](#1-core-philosophy)
2. [The Three Systems](#2-the-three-systems)
3. [Two-Phase Processing](#3-two-phase-processing)
4. [Betting Priority](#4-betting-priority)
5. [Pause Semantics](#5-pause-semantics)
6. [State Management](#6-state-management)
7. [Required Logging](#7-required-logging)
8. [Integration Points](#8-integration-points)
9. [Complete Flow Examples](#9-complete-flow-examples)
10. [Implementation Checklist](#10-implementation-checklist)

---

## 1. CORE PHILOSOPHY

### 1.1 Separation of Observation and Betting

| Phase | Description | Can Be Paused? |
|-------|-------------|----------------|
| **OBSERVE** | Update internal state based on block data | **NEVER** |
| **BET** | Place real bet on current block | YES (by hierarchy) |

**CRITICAL RULE:** Observation and accumulation NEVER pause for ANY system. Only betting can be paused.

### 1.2 Why This Matters

If you pause observation/accumulation:
- You destroy correct activation timing
- You lose accurate profit tracking
- You break pattern detection sequences
- The entire system becomes unreliable

### 1.3 Single Responsibility

The Hierarchy Manager has **ONE** job:
- Decide **WHO** places the real bet on each block

It does NOT:
- Tell systems to stop observing
- Reset system states
- Override system-internal logic

---

## 2. THE THREE SYSTEMS

### 2.1 System Overview

| System | Priority | Betting Style | State Tracking |
|--------|----------|---------------|----------------|
| **Pocket System** | 1 (Highest) | ZZ indicator-triggered | Pocket positions, runProfitZZ |
| **Same Direction** | 2 (Middle) | Run-profit-activated | accumulatedLoss, active flag |
| **Bucket System** | 3 (Lowest) | Pattern lifecycle-driven | Bucket classification (MAIN/WAITING/BNS) |

### 2.2 Pocket System (ZZ/AntiZZ)

- Triggers on **ZZ indicators** (run of 2+ followed by flip)
- Uses pocket positions to determine who bets
- See `POCKET-SYSTEM-SPEC.md` for full rules
- **NEVER paused by other systems**

### 2.3 Same Direction System

- Triggers on **run breaks with profit >= 140**
- Bets continuation (same direction as previous block)
- See `SAME-DIRECTION-SYSTEM-SPEC.md` for full rules
- **Paused during Pocket betting blocks**

### 2.4 Bucket System

- Triggers on **pattern activations**
- Uses 3-bucket classification (MAIN/WAITING/BNS)
- See `BUCKET-SYSTEM-MANAGEMENT.md` for full rules
- **Paused when Same Direction is active**

---

## 3. TWO-PHASE PROCESSING

### 3.1 Phase 1: OBSERVE (Always Runs)

On **EVERY** block, regardless of who bet:

```
OBSERVE ALL SYSTEMS:
  1. Pocket System:
     - Detect ZZ indicator (run of 2+ followed by flip)
     - Update pocket positions
     - Track runProfitZZ (including imaginary bets)
     - Evaluate ZZ/AntiZZ outcomes

  2. Same Direction System:
     - Track current run (direction, blocks)
     - On run break: calculate RunProfit
     - Update activation state
     - Update accumulatedLoss

  3. Bucket System:
     - Update pattern detection
     - Update cumulative profits
     - Update bucket classifications
     - Track blocked pattern accumulation
```

### 3.2 Phase 2: BET (Hierarchy Decides)

After observation, determine who bets:

```
SELECT WHO BETS:
  IF Pocket System has active signal this block:
    → Pocket System bets
    → Same Direction pauses betting (but observes)
    → Bucket System pauses betting (but observes)

  ELSE IF Same Direction is ACTIVE:
    → Same Direction bets
    → Bucket System pauses betting (but observes)

  ELSE IF Bucket System has eligible pattern:
    → Bucket System bets

  ELSE:
    → No system bets this block
```

---

## 4. BETTING PRIORITY

### 4.1 Priority Matrix

| Priority | System | Condition to Bet |
|----------|--------|------------------|
| **1** | Pocket | ZZ indicator occurs AND (ZZ in P1 OR AntiZZ in P1) |
| **2** | Same Direction | No pocket bet AND Same Direction is ACTIVE |
| **3** | Bucket | No pocket bet AND Same Direction NOT active AND pattern eligible |

### 4.2 Priority Rules (NON-NEGOTIABLE)

1. **Pocket ALWAYS wins** - If ZZ indicator + pocket ready, Pocket bets
2. **Same Direction over Bucket** - If SD active, Bucket waits
3. **Lower priority = observation only** - Still tracks, just doesn't bet

### 4.3 What "Has Active Signal" Means

| System | Active Signal Definition |
|--------|--------------------------|
| Pocket | ZZ indicator detected this block AND (zzPocket === 1 OR antiZZPocket === 1) |
| Same Direction | sameDir.active === true |
| Bucket | Any pattern in MAIN bucket with signal this block |

---

## 5. PAUSE SEMANTICS

### 5.1 What "Pause" Means

**PAUSE = No real bet placed**

It does **NOT** mean:
- Stop tracking state
- Reset accumulators
- Skip pattern detection
- Ignore block outcomes

### 5.2 Same Direction During Pocket Blocks

When Pocket System bets (ZZ indicator block):

| Same Direction Action | Status |
|-----------------------|--------|
| Track run continuation | **CONTINUES** |
| Calculate RunProfit at breaks | **CONTINUES** |
| Update accumulatedLoss | **CONTINUES** |
| Place real bet | **PAUSED** |
| Count Pocket outcome as SD loss | **NO** - SD didn't bet |

**CRITICAL:** Same Direction does NOT accumulate losses from blocks where it didn't bet.

### 5.3 Bucket During Same Direction

When Same Direction is active:

| Bucket Action | Status |
|---------------|--------|
| Pattern detection | **CONTINUES** |
| Cumulative profit tracking | **CONTINUES** |
| Bucket classification | **CONTINUES** |
| Blocked pattern accumulation | **CONTINUES** |
| Place real bet | **PAUSED** |

---

## 6. STATE MANAGEMENT

### 6.1 Hierarchy Decision Record

Each block should record:

```typescript
interface HierarchyDecision {
  blockIndex: number;
  phase1Observed: {
    pocket: boolean;    // Did pocket system observe?
    sameDir: boolean;   // Did same direction observe?
    bucket: boolean;    // Did bucket system observe?
  };
  phase2Decision: {
    source: 'pocket' | 'same-direction' | 'bucket' | 'none';
    pattern?: PatternName;
    direction?: Direction;
    shouldBet: boolean;
    reason: string;
  };
  pausedSystems: ('same-direction' | 'bucket')[];
  ts: string;
}
```

### 6.2 State Consistency Rules

| Rule | Description |
|------|-------------|
| All systems observe every block | No exceptions |
| Only one system bets per block | Hierarchy ensures this |
| Paused systems still update state | Observation continues |
| Decision is deterministic | Same input = same output |

### 6.3 Undo Compatibility

The hierarchy decision must be reproducible:
- Given block index and system states, same decision must result
- State updates are idempotent where possible
- Each system maintains its own rebuild capability

---

## 7. REQUIRED LOGGING

### 7.1 Per-Block Hierarchy Log

```
[HIERARCHY] === BLOCK {N} PROCESSING ===
[HIERARCHY] PHASE 1 - OBSERVATION:
[HIERARCHY]   Pocket: indicator={YES|NO}, zzPocket={1|2}, antiZZPocket={1|2}
[HIERARCHY]   SameDir: active={YES|NO}, accumulatedLoss={X}%
[HIERARCHY]   Bucket: eligible patterns=[list]
[HIERARCHY] PHASE 2 - BET DECISION:
[HIERARCHY]   Priority 1 (Pocket): {BETTING|PASS} - reason
[HIERARCHY]   Priority 2 (SameDir): {BETTING|PASS|PAUSED} - reason
[HIERARCHY]   Priority 3 (Bucket): {BETTING|PASS|PAUSED} - reason
[HIERARCHY]   FINAL: {system} bets {direction} via {pattern}
[HIERARCHY] ================================
```

### 7.2 System Pause Log

When a system is paused:

```
[HIERARCHY] SameDir PAUSED - Pocket is betting (ZZ indicator block)
[HIERARCHY] Bucket PAUSED - SameDir is active
```

---

## 8. INTEGRATION POINTS

### 8.1 Required Interfaces

```typescript
// Pocket System
interface PocketSystemInterface {
  processBlock(block: Block): void;           // Phase 1
  hasActiveSignal(): boolean;                 // Phase 2 check
  getBetDecision(): { pattern: PatternName; direction: Direction } | null;
}

// Same Direction System
interface SameDirectionInterface {
  processBlock(block: Block): void;           // Phase 1
  isActive(): boolean;                        // Phase 2 check
  getBetDecision(): { direction: Direction } | null;
}

// Bucket System
interface BucketSystemInterface {
  processBlock(block: Block): void;           // Phase 1
  getEligibleBet(): { pattern: PatternName; direction: Direction } | null;
}
```

### 8.2 Integration with ReactionEngine

```typescript
// In ReactionEngine.processBlock():

// PHASE 1: OBSERVE ALL SYSTEMS
this.zzStateManager.processBlock(block);
this.sameDirectionManager.processBlock(block);
this.bucketManager.updateFromBlock(block);

// PHASE 2: HIERARCHY DECISION
const decision = this.hierarchyManager.decideBet({
  pocket: this.zzStateManager,
  sameDir: this.sameDirectionManager,
  bucket: this.bucketManager
});

// PHASE 3: EXECUTE DECISION
if (decision.shouldBet) {
  this.openTrade(decision);
}
```

---

## 9. COMPLETE FLOW EXAMPLES

### Example 1: Normal Block - Same Direction Active

```
STATE BEFORE:
  Pocket: zzPocket=2, antiZZPocket=2, no indicator
  SameDir: active=true, accumulatedLoss=50
  Bucket: 3A3 in MAIN bucket

BLOCK 15: G +85%

PHASE 1 - OBSERVATION:
  Pocket: No indicator detected (run length = 1)
  SameDir: Run continues in G direction, tracks block
  Bucket: No 3A3 signal (run length != 3)

PHASE 2 - BET DECISION:
  Priority 1 (Pocket): PASS - no indicator
  Priority 2 (SameDir): BETTING - active, bet G (continuation)
  Priority 3 (Bucket): PAUSED - SameDir is active

RESULT: SameDir bets GREEN
```

### Example 2: ZZ Indicator Block - Pocket Overrides

```
STATE BEFORE:
  Pocket: zzPocket=1, antiZZPocket=2
  SameDir: active=true, accumulatedLoss=80
  Bucket: 2A2 in MAIN bucket

BLOCK 20: R +91% (run: G G G R - indicator!)

PHASE 1 - OBSERVATION:
  Pocket: INDICATOR DETECTED! ZZ in P1, will bet
  SameDir: Run breaks, calculates RunProfit
  Bucket: 3A3 might activate

PHASE 2 - BET DECISION:
  Priority 1 (Pocket): BETTING - ZZ indicator, ZZ in P1
  Priority 2 (SameDir): PAUSED - Pocket is betting
  Priority 3 (Bucket): PAUSED - Pocket is betting

RESULT: Pocket (ZZ) bets opposite direction
SameDir: Observed the break, updated state, but DID NOT BET
Bucket: Observed, but DID NOT BET
```

### Example 3: Same Direction Inactive - Bucket Bets

```
STATE BEFORE:
  Pocket: zzPocket=2, antiZZPocket=2, no indicator
  SameDir: active=false (accumulatedLoss > 140)
  Bucket: 3A3 in MAIN bucket, run length = 3

BLOCK 25: R +70%

PHASE 1 - OBSERVATION:
  Pocket: No indicator (run continues)
  SameDir: Still tracking runs (inactive but observing)
  Bucket: 3A3 signal detected!

PHASE 2 - BET DECISION:
  Priority 1 (Pocket): PASS - no indicator
  Priority 2 (SameDir): PASS - not active
  Priority 3 (Bucket): BETTING - 3A3 signal, pattern in MAIN

RESULT: Bucket (3A3) bets opposite direction
```

### Example 4: No System Bets

```
STATE BEFORE:
  Pocket: zzPocket=2, antiZZPocket=2, no indicator
  SameDir: active=false
  Bucket: All patterns in WAITING bucket

BLOCK 30: G +50%

PHASE 1 - OBSERVATION:
  Pocket: No indicator
  SameDir: Tracks run, still inactive
  Bucket: No eligible patterns

PHASE 2 - BET DECISION:
  Priority 1 (Pocket): PASS - no indicator
  Priority 2 (SameDir): PASS - not active
  Priority 3 (Bucket): PASS - no eligible patterns

RESULT: No bet placed
```

---

## 10. IMPLEMENTATION CHECKLIST

### 10.1 Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/engine/hierarchy-manager.ts` | CREATE | Hierarchy Manager class |
| `src/engine/reaction.ts` | MODIFY | Integrate hierarchy manager |
| `src/types/index.ts` | MODIFY | Add HierarchyDecision type |

### 10.2 Required Methods

```typescript
class HierarchyManager {
  // Main entry point
  processBlock(
    block: Block,
    pocket: PocketSystemInterface,
    sameDir: SameDirectionInterface,
    bucket: BucketSystemInterface
  ): HierarchyDecision;

  // Phase 2 decision
  private decideBet(
    pocket: PocketSystemInterface,
    sameDir: SameDirectionInterface,
    bucket: BucketSystemInterface
  ): HierarchyDecision;

  // Logging
  private logDecision(decision: HierarchyDecision): void;
}
```

### 10.3 Test Cases Required

| Test | Expected Behavior |
|------|-------------------|
| All systems observe on every block | Even when paused for betting |
| Pocket always overrides when indicator | SameDir and Bucket paused |
| SameDir overrides Bucket when active | Bucket paused |
| Paused systems don't accumulate bet losses | Only observation losses count |
| Decision is deterministic | Same input = same decision |

---

## FINAL INSTRUCTION

The Hierarchy Manager is the **traffic controller** of the system.

It does NOT:
- Own the systems
- Store system state
- Make system-internal decisions

It ONLY:
- Observes system states
- Decides who bets
- Logs decisions

**Follow these rules exactly. Any deviation is a bug.**

---

*Document version: v1.0 - Authoritative Specification*
