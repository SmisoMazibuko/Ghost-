# LEGACY HOLDS REMOVAL SPECIFICATION

> **VERSION:** v1.0 (Authoritative)
> **STATUS:** FINAL - Implementation Guide
> **DATE:** 2025-12-17

This document specifies exactly which hold/lock/pause mechanisms must be removed
and provides the exact file locations and code sections to modify.

---

## TABLE OF CONTENTS

1. [Overview](#1-overview)
2. [Mechanisms to REMOVE](#2-mechanisms-to-remove)
3. [Mechanisms to KEEP](#3-mechanisms-to-keep)
4. [File-by-File Changes](#4-file-by-file-changes)
5. [Verification Checklist](#5-verification-checklist)

---

## 1. OVERVIEW

### 1.1 Core Principle

**The Hierarchy Manager is the ONLY mechanism that controls betting.**

No other system should:
- Globally pause betting
- Lock the session
- Skip blocks
- Disable patterns

### 1.2 What Replaces Legacy Holds

| Legacy Mechanism | Replacement |
|------------------|-------------|
| Cooldown (2 loss pause) | NONE - removed |
| P1 Mode (consecutive blocks) | NONE - removed |
| Hostility Lock | Observation only (no betting control) |
| Two-block control | NONE - removed |
| Recovery Mode pause | NONE - removed |

### 1.3 What Remains

| Mechanism | Status | Purpose |
|-----------|--------|---------|
| Session Health tracking | KEEP | Hard abort on extreme drawdown |
| Hostility Manager | KEEP (modified) | Observation/logging only |
| Drawdown abort | KEEP | Emergency stop only |

---

## 2. MECHANISMS TO REMOVE

### 2.1 Cooldown System

**What it does:** Pauses trading for 3 blocks after 2 consecutive losses.

**Why remove:** The Hierarchy Manager handles betting priority. Consecutive losses
don't justify global pauses - each system handles its own state.

**Locations:**

| File | Location | Code to Remove |
|------|----------|----------------|
| `reaction.ts` | Line ~83 | `private cooldownRemaining: number = 0;` |
| `reaction.ts` | Lines ~203-208 | Cooldown check in `predictNext()` |
| `reaction.ts` | Lines ~427-437 | Cooldown trigger after losses |
| `reaction.ts` | Lines ~755-758 | Cooldown decrement in `processBlock()` |

### 2.2 P1 Mode (Consecutive Blocks Blocking)

**What it does:** Blocks all betting when run length >= threshold (default 5-7).

**Why remove:** Long runs are handled by Same Direction System, not by blocking.
P1 mode was a crude solution to same-direction dominance.

**Locations:**

| File | Location | Code to Remove |
|------|----------|----------------|
| `state.ts` | Line ~60 | `private p1Mode: boolean = false;` |
| `state.ts` | Lines ~104-107 | P1 mode trigger logic |
| `state.ts` | Lines ~295-301 | P1 mode clearing logic |
| `state.ts` | Method | `isP1Mode(): boolean` |
| `reaction.ts` | Lines ~211-216 | P1 mode check in `predictNext()` |
| `types/index.ts` | Line ~18 | Remove `'p1_mode'` from SessionState |
| `types/index.ts` | Line ~395 | `p1Mode: boolean` in SessionFlags |

### 2.3 Hostility Lock (Betting Control)

**What it does:** Locks betting when hostility score exceeds threshold.

**Why modify:** Keep hostility tracking for observation/logging, but remove
its ability to lock betting. Betting control is Hierarchy Manager's job.

**Locations:**

| File | Location | Modification |
|------|----------|--------------|
| `hostility.ts` | Line ~461-462 | `isLocked()` should always return false for betting |
| `hostility.ts` | Line ~523-525 | `shouldSuppressBetting()` should always return false |
| `reaction.ts` | Lines ~147-165 | Remove hostility lock checks |

### 2.4 Two-Block Control / Pause

**What it does:** Various mechanisms that pause for 2 blocks.

**Why remove:** No global pauses should exist outside Hierarchy Manager.

**Search for:** `twoBlock`, `two_block`, `blockPause`, `pauseBlocks`

### 2.5 Recovery Mode Betting Suppression

**What it does:** Prevents betting during recovery mode after hard abort.

**Why modify:** Keep recovery tracking for observation, but don't suppress betting.
After hard abort, session should end - not enter recovery mode betting suppression.

**Locations:**

| File | Location | Modification |
|------|----------|--------------|
| `reaction.ts` | Lines ~176-191 | Remove recovery mode betting check |
| `recovery.ts` | Various | Keep for tracking, remove betting control |

---

## 3. MECHANISMS TO KEEP

### 3.1 Session Health Tracking (Keep for Hard Abort)

**Purpose:** Track drawdown for emergency session end.

**Behavior:**
- Continue tracking drawdown
- When drawdown exceeds absolute limit (e.g., -1000), END SESSION
- This is a hard stop, not a pause
- Session cannot continue after hard abort

**DO NOT use for:**
- Pausing betting
- Entering recovery mode
- Temporary holds

### 3.2 Hostility Manager (Keep for Observation)

**Purpose:** Track and log hostility indicators for analysis.

**New behavior:**
- Continue logging hostility indicators
- Continue calculating hostility score
- DO NOT lock betting based on score
- Useful for post-session analysis

**Modify:**
```typescript
// In HostilityManager
shouldSuppressBetting(): boolean {
  return false;  // ALWAYS return false now
}

isLocked(): boolean {
  // Keep for UI/logging, but don't use for betting control
  return this.state.isLocked;
}
```

### 3.3 Pattern-Level Controls (Keep)

**What stays:**
- Bucket classification (MAIN/WAITING/BNS)
- Pattern activation thresholds
- B&S kill conditions

These are **pattern-level** controls, not global holds. The Hierarchy Manager
respects pattern states when deciding who bets.

---

## 4. FILE-BY-FILE CHANGES

### 4.1 `src/engine/reaction.ts`

```typescript
// ============================================
// REMOVE: Cooldown property
// ============================================
// Line ~83
// BEFORE:
private cooldownRemaining: number = 0;
// AFTER:
// [DELETE THIS LINE]

// ============================================
// REMOVE: Cooldown check in predictNext()
// ============================================
// Lines ~203-208
// BEFORE:
if (this.cooldownRemaining > 0) {
  return {
    hasPrediction: false,
    reason: `COOLDOWN: ${this.cooldownRemaining} blocks remaining`,
  };
}
// AFTER:
// [DELETE THIS BLOCK]

// ============================================
// REMOVE: P1 mode check in predictNext()
// ============================================
// Lines ~211-216
// BEFORE:
if (this.gameState.isP1Mode()) {
  return {
    hasPrediction: false,
    reason: `P1 MODE — Waiting for profitable pattern to clear ${bucketStatus}`,
  };
}
// AFTER:
// [DELETE THIS BLOCK]

// ============================================
// REMOVE: Hostility lock check
// ============================================
// Lines ~147-165 (approximate)
// BEFORE:
if (this.hostilityManager.shouldSuppressBetting()) {
  // ... suppress betting logic
}
// AFTER:
// [DELETE OR CONVERT TO LOGGING ONLY]

// ============================================
// REMOVE: Recovery mode betting suppression
// ============================================
// Lines ~176-191 (approximate)
// BEFORE:
if (this.recoveryManager.isInRecoveryMode()) {
  // ... suppress betting logic
}
// AFTER:
// [DELETE THIS BLOCK]

// ============================================
// REMOVE: Cooldown trigger
// ============================================
// Lines ~427-437 (approximate)
// BEFORE:
if (consecutiveLosses >= 2) {
  this.cooldownRemaining = 3;
  console.log('[Reaction] COOLDOWN ACTIVATED: 2 consecutive losses');
}
// AFTER:
// [DELETE THIS BLOCK]

// ============================================
// REMOVE: Cooldown decrement
// ============================================
// Lines ~755-758 (approximate)
// BEFORE:
if (this.cooldownRemaining > 0) {
  this.cooldownRemaining--;
  console.log(`[Reaction] Cooldown: ${this.cooldownRemaining} blocks remaining`);
}
// AFTER:
// [DELETE THIS BLOCK]
```

### 4.2 `src/engine/state.ts`

```typescript
// ============================================
// REMOVE: P1 mode property
// ============================================
// Line ~60
// BEFORE:
private p1Mode: boolean = false;
// AFTER:
// [DELETE THIS LINE]

// ============================================
// REMOVE: P1 mode trigger
// ============================================
// Lines ~104-107
// BEFORE:
const wasP1 = this.p1Mode;
if (this.runData.currentLength >= this.config.p1ConsecutiveThreshold) {
  this.p1Mode = true;
}
// AFTER:
// [DELETE THIS BLOCK]

// ============================================
// REMOVE: P1 mode clearing logic
// ============================================
// Lines ~295-301 (approximate)
// BEFORE:
if (this.p1Mode) {
  // ... clearing logic
}
// AFTER:
// [DELETE THIS BLOCK]

// ============================================
// REMOVE: isP1Mode() method
// ============================================
// Method (exact location varies)
// BEFORE:
isP1Mode(): boolean {
  return this.p1Mode;
}
// AFTER:
// [DELETE THIS METHOD]
// Or replace with stub:
isP1Mode(): boolean {
  return false;  // Always return false
}
```

### 4.3 `src/engine/hostility.ts`

```typescript
// ============================================
// MODIFY: shouldSuppressBetting()
// ============================================
// Line ~523-525
// BEFORE:
shouldSuppressBetting(): boolean {
  return this.state.isLocked;
}
// AFTER:
shouldSuppressBetting(): boolean {
  return false;  // Hierarchy Manager controls betting now
}

// ============================================
// KEEP BUT DON'T USE FOR BETTING: isLocked()
// ============================================
// Keep for UI/logging purposes
isLocked(): boolean {
  return this.state.isLocked;  // Keep for display
}
```

### 4.4 `src/types/index.ts`

```typescript
// ============================================
// MODIFY: SessionState type
// ============================================
// Line ~18
// BEFORE:
export type SessionState = 'playable' | 'unplayable' | 'p1_mode' | 'done';
// AFTER:
export type SessionState = 'playable' | 'unplayable' | 'done';

// ============================================
// MODIFY: SessionFlags interface
// ============================================
// Line ~395
// BEFORE:
export interface SessionFlags {
  dailyTargetReached: boolean;
  p1Mode: boolean;
}
// AFTER:
export interface SessionFlags {
  dailyTargetReached: boolean;
  // p1Mode removed
}

// ============================================
// REMOVE: p1_mode_entered/cleared events
// ============================================
// Line ~471-472
// BEFORE:
| 'p1_mode_entered'
| 'p1_mode_cleared'
// AFTER:
// [DELETE THESE LINES]
```

---

## 5. VERIFICATION CHECKLIST

### 5.1 After Removal - Must Pass

| Check | Expected Result |
|-------|-----------------|
| Search for `cooldown` | No functional references (only comments ok) |
| Search for `p1Mode` or `p1_mode` | No functional references |
| Search for `shouldSuppressBetting` | Should always return false |
| Build compiles | No type errors |
| All tests pass | Existing tests updated if needed |

### 5.2 Behavioral Verification

| Scenario | Old Behavior | New Behavior |
|----------|--------------|--------------|
| 2 consecutive losses | 3-block cooldown | No pause, continue betting |
| Run length >= 5 | P1 mode, stop betting | Continue, Hierarchy decides |
| Hostility score high | Lock betting | Continue, Hierarchy decides |
| Recovery mode active | Suppress betting | Continue (or hard stop) |

### 5.3 Integration Tests

Create tests that verify:

1. **No cooldown activation:**
   ```typescript
   // After 2 losses, next block should still allow betting
   engine.evaluateTrade(/* loss */);
   engine.evaluateTrade(/* loss */);
   const prediction = engine.predictNext();
   expect(prediction.hasPrediction).toBe(true); // Should have prediction
   ```

2. **No P1 mode:**
   ```typescript
   // After 7 consecutive blocks, should still allow betting
   for (let i = 0; i < 7; i++) {
     engine.addBlock({ dir: 1, pct: 80, ... });
   }
   const prediction = engine.predictNext();
   // Prediction based on hierarchy, not blocked
   ```

3. **Hostility doesn't lock:**
   ```typescript
   hostilityManager.state.hostilityScore = 100;
   hostilityManager.state.isLocked = true;
   expect(hostilityManager.shouldSuppressBetting()).toBe(false);
   ```

---

## SUMMARY

### What's Being Removed

| Mechanism | File | Status |
|-----------|------|--------|
| Cooldown (2-loss pause) | reaction.ts | **REMOVE** |
| P1 Mode | state.ts, reaction.ts, types | **REMOVE** |
| Hostility betting lock | hostility.ts, reaction.ts | **DISABLE** |
| Recovery mode betting suppression | reaction.ts, recovery.ts | **REMOVE** |
| Two-block control | Various | **REMOVE** |

### What Replaces Them

**The Hierarchy Manager** now controls all betting decisions based on:
1. Pocket System state (highest priority)
2. Same Direction System state (middle priority)
3. Bucket System state (lowest priority)

No other mechanism should prevent betting. If betting needs to stop, it should be
through system deactivation (Same Direction cuts at 140 loss) or hard session abort
(extreme drawdown).

---

*Document version: v1.0 - Implementation Guide*
