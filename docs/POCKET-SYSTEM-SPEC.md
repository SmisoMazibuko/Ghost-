# ZZ + Anti-ZZ POCKET SYSTEM SPECIFICATION (STRICT)

> **VERSION:** v16.0 (Authoritative)
> **STATUS:** FINAL - DO NOT REINTERPRET
> **DATE:** 2025-12-16

This document is the **single source of truth** for the ZZ/Anti-ZZ pocket system implementation.
All code must conform exactly to these rules. Any deviation is a bug.

---

## TABLE OF CONTENTS

1. [Core Principles (NON-NEGOTIABLE)](#1-core-principles-non-negotiable)
2. [Initial State](#2-initial-state)
3. [The Only Trigger: ZZ Indicator](#3-the-only-trigger-zz-indicator)
4. [ZZ Rules](#4-zz-rules)
5. [Anti-ZZ Rules](#5-anti-zz-rules)
6. [Both in POCKET2 Scenario](#6-both-in-pocket2-scenario)
7. [POCKET Consistency](#7-pocket-consistency)
8. [Required Logging](#8-required-logging)
9. [Required Tests](#9-required-tests)
10. [State Diagram](#10-state-diagram)
11. [Complete Flow Examples](#11-complete-flow-examples)

---

## 1. CORE PRINCIPLES (NON-NEGOTIABLE)

### 1.1 POCKET Meaning

| POCKET | Meaning | Action |
|--------|---------|--------|
| **POCKET1** | ACTIVE | Allowed to place real bets |
| **POCKET2** | OBSERVE | NOT allowed to place real bets |

### 1.2 No `wasBet` Variable

- **DO NOT** use `wasBet` (or equivalent) for ZZ/Anti-ZZ decisions
- Pocket position is the **only truth**
- Whether a bet was actually placed is **irrelevant** for calculations

### 1.3 Imaginary First Bet is MANDATORY

For **every** ZZ indicator:
- You **MUST** compute the ZZ first bet outcome
- Even if ZZ is in POCKET2 (observe)
- That "imaginary" first bet outcome **MUST** be counted into `runProfitZZ`

### 1.4 Run Profit Applies ONLY to ZZ

| Pattern | Has runProfit? | What it uses |
|---------|----------------|--------------|
| **ZZ** | YES (`runProfitZZ`) | Cumulative run profit |
| **Anti-ZZ** | **NO** | Last bet outcome ONLY |

**Anti-ZZ NEVER has runProfit.** Anti-ZZ pocket movement uses last bet outcome only.

---

## 2. INITIAL STATE

| Pattern | Starting Pocket | Reason |
|---------|-----------------|--------|
| **ZZ** | POCKET1 | Default active |
| **Anti-ZZ** | POCKET2 | Inactive until triggered |

```typescript
// Initial state
zzPocket = 1;      // ZZ starts in POCKET1
antiZZPocket = 2;  // Anti-ZZ starts in POCKET2
runProfitZZ = 0;   // No profit yet
```

---

## 3. THE ONLY TRIGGER: ZZ INDICATOR

The **ONLY** event that drives both patterns is the **ZZ indicator**.

- No indicator = no action
- At each ZZ indicator, you **MUST** execute the full pocket logic

```
ZZ Indicator = run of 2+ blocks followed by a flip
Example: G G G R ← indicator detected at R (direction was UP)
```

---

## 4. ZZ RULES

### 4.1 ZZ First Bet (ALWAYS Computed)

At **every** ZZ indicator, compute:

```
firstOutcomeZZ = outcome of ZZ's first bet on the first block after the indicator
```

This is computed **ALWAYS**, regardless of pocket:
- If ZZ in POCKET1 → real bet
- If ZZ in POCKET2 → imaginary bet (but still counted)

### 4.2 ZZ Run Playing Rule (Only When ACTIVE)

If ZZ is in POCKET1 at the indicator:

1. ZZ bets the **alternate/opposite** direction
2. ZZ continues betting each subsequent block using the alternating rule
3. **As long as** the previous bet result is positive
4. The run **breaks immediately** on the first negative result

### 4.3 ZZ `runProfitZZ` (MUST Include Imaginary First Bet)

**INVARIANT:** Every ZZ indicator updates `runProfitZZ` by including the first bet outcome, whether real or imaginary.

| ZZ Pocket | Calculation |
|-----------|-------------|
| POCKET1 (active) | `runProfitZZ = firstOutcomeZZ + sum(subsequent real bets until break)` |
| POCKET2 (observe) | `runProfitZZ = firstOutcomeZZ` (imaginary, but still counted!) |

**Critical Rule:** Even when ZZ is in POCKET2 and does NOT place a real bet, you **STILL** update `runProfitZZ` with the imaginary first bet outcome.

### 4.4 ZZ Pocket Movement (Based ONLY on `runProfitZZ`)

After resolving the ZZ run context for that indicator:

| Condition | Action |
|-----------|--------|
| `runProfitZZ > 0` | ZZ must be in POCKET1 |
| `runProfitZZ <= 0` | ZZ must move to POCKET2 |

This rule is **absolute**.

### 4.5 Anti-ZZ Activation (Depends ONLY on ZZ FIRST BET)

| First Bet Outcome | Result |
|-------------------|--------|
| `firstOutcomeZZ` is **NEGATIVE** | Anti-ZZ becomes candidate |
| `firstOutcomeZZ` is **POSITIVE** | Anti-ZZ is NOT activated |

**Critical:** A negative `runProfitZZ` does **NOT** activate Anti-ZZ unless `firstOutcomeZZ` was negative.

---

## 5. ANTI-ZZ RULES

### 5.1 Anti-ZZ is NOT a Run Pattern

| Property | Value |
|----------|-------|
| Continuous? | **NO** |
| Plays block-by-block? | **NO** |
| Enters long flow / P1? | **NO** |
| Has runProfit? | **NO** |

Anti-ZZ plays **only** when:
1. A ZZ indicator occurs, AND
2. Anti-ZZ is in POCKET1

### 5.2 Anti-ZZ Activation + Waiting Rule

When `firstOutcomeZZ` is negative at an indicator:

1. Anti-ZZ becomes the **"candidate"**
2. Anti-ZZ does **NOT** play immediately on that same indicator if currently in POCKET2
3. Anti-ZZ **waits for the NEXT ZZ indicator**
4. Then it plays **only if** it is in POCKET1 at that time

```
Block N: Indicator, firstOutcomeZZ = -85%
         Anti-ZZ is candidate, but in POCKET2
         Anti-ZZ does NOT play yet

Block M: Next indicator
         Anti-ZZ now in POCKET1
         Anti-ZZ plays ONE bet
```

### 5.3 Anti-ZZ Action (ONE Bet Per Indicator)

When Anti-ZZ plays:
- Exactly **ONE** bet for that indicator event
- **NO continuation** beyond that one bet
- Uses Anti-ZZ direction rule (same as current direction)

### 5.4 Anti-ZZ Pocket Movement (LAST BET Only - No runProfit)

When Anti-ZZ plays its one bet:

| Last Bet Outcome | Action |
|------------------|--------|
| **NEGATIVE** | Anti-ZZ moves immediately to POCKET2 |
| **POSITIVE** | Anti-ZZ stays in POCKET1 |

That's it. **No runProfit calculation.** No other triggers.

---

## 6. BOTH IN POCKET2 SCENARIO

It is possible that **both** are in POCKET2:
- ZZ is in POCKET2 because `runProfitZZ <= 0`
- Anti-ZZ is in POCKET2 because its last bet was negative

### At the Next ZZ Indicator:

1. **Still compute** `firstOutcomeZZ` (imaginary)
2. **Still update** `runProfitZZ` to include that imaginary first bet
3. Use `firstOutcomeZZ` sign to decide activation:

| `firstOutcomeZZ` | Action |
|------------------|--------|
| **POSITIVE** | Activate ZZ (move to POCKET1), ZZ plays its continuous run. Anti-ZZ stays POCKET2. |
| **NEGATIVE** | Do NOT activate ZZ. Set up Anti-ZZ for NEXT indicator (move Anti-ZZ to POCKET1 for next cycle). ZZ remains POCKET2. |

---

## 7. POCKET CONSISTENCY

### 7.1 Only One Active Betting Pocket

- Only **POCKET1** is the "active betting pocket"
- Never allow both patterns to be treated as active bet placers simultaneously

### 7.2 POCKET2 is Always Observation Only

- POCKET2 patterns **observe** and track hypothetical outcomes
- They do **NOT** place real bets

### 7.3 Mutual Exclusivity

At any given indicator:
- Either ZZ is in POCKET1 (ZZ bets)
- Or Anti-ZZ is in POCKET1 (Anti-ZZ bets)
- Or both are in POCKET2 (no one bets, imaginary evaluation)

---

## 8. REQUIRED LOGGING

Every ZZ indicator **MUST** log:

```
[ZZ] === INDICATOR AT BLOCK {N} ===
[ZZ] Pockets BEFORE: ZZ=P{X}, AntiZZ=P{Y}
[ZZ] firstOutcomeZZ: {profit}% ({REAL|IMAGINARY})
[ZZ] runProfitZZ AFTER update: {profit}%
[ZZ] ZZ activated/played: {YES|NO}
[ZZ] AntiZZ played: {YES|NO} (bet count: {0|1})
[ZZ] AntiZZ last bet result: {profit}% (if played)
[ZZ] Pockets AFTER: ZZ=P{X}, AntiZZ=P{Y}
[ZZ] ==============================
```

---

## 9. REQUIRED TESTS

The following tests **MUST** pass:

| # | Test | Expected |
|---|------|----------|
| 1 | `runProfitZZ` changes on **every** indicator | Because it always includes `firstOutcomeZZ`, even when ZZ is in POCKET2 |
| 2 | Anti-ZZ never places more than one bet per indicator | Max 1 bet per indicator cycle |
| 3 | Anti-ZZ never places bets on non-indicator blocks | Only triggered by ZZ indicators |
| 4 | Anti-ZZ only leaves POCKET1 on a negative last bet | Win = stay POCKET1, Loss = POCKET2 |
| 5 | Negative `runProfitZZ` does NOT activate Anti-ZZ unless `firstOutcomeZZ` is negative | First bet is the trigger, not run profit |

---

## 10. STATE DIAGRAM

```
                                    ┌─────────────────────────────────────────────────┐
                                    │                                                 │
                                    │  firstOutcomeZZ NEGATIVE                        │
                                    │  (and ZZ in P1 → first bet loses)               │
                                    │                                                 │
                                    ▼                                                 │
┌─────────────────────┐       ┌─────────────────────┐       ┌─────────────────────┐  │
│                     │       │                     │       │                     │  │
│   ZZ in POCKET1     │◀──────│   BOTH in POCKET2   │──────▶│  AntiZZ in POCKET1  │──┘
│   (ZZ bets)         │       │   (imaginary eval)  │       │  (AntiZZ bets once) │
│                     │       │                     │       │                     │
└─────────────────────┘       └─────────────────────┘       └─────────────────────┘
         │                            ▲       ▲                      │
         │                            │       │                      │
         │ runProfitZZ <= 0           │       │ AntiZZ last bet      │
         │ (run ends negative)        │       │ NEGATIVE             │
         │                            │       │                      │
         └────────────────────────────┘       └──────────────────────┘

Legend:
- ZZ in P1: ZZ bets continuously until negative result
- AntiZZ in P1: AntiZZ bets ONCE per indicator
- Both in P2: Imaginary first bet evaluation determines next activation
```

---

## 11. COMPLETE FLOW EXAMPLES

### Example 1: Normal ZZ Flow

```
INITIAL STATE:
  ZZ = POCKET1, AntiZZ = POCKET2, runProfitZZ = 0

BLOCK 3: ZZ Indicator detected (direction UP)
  Pockets BEFORE: ZZ=P1, AntiZZ=P2

BLOCK 4: First bet evaluation
  ZZ predicts DOWN, Actual: DOWN
  firstOutcomeZZ = +85% (POSITIVE)
  runProfitZZ = +85%
  ZZ stays P1, continues betting

BLOCK 5: ZZ bets
  ZZ predicts UP, Actual: UP
  runProfitZZ = +85% + 85% = +170%

BLOCK 6: ZZ bets
  ZZ predicts DOWN, Actual: UP
  runProfitZZ = +170% - 85% = +85%
  Run ends (negative result)
  runProfitZZ > 0 → ZZ stays P1

  Pockets AFTER: ZZ=P1, AntiZZ=P2
```

### Example 2: ZZ First Bet Negative → Anti-ZZ Activates

```
INITIAL STATE:
  ZZ = POCKET1, AntiZZ = POCKET2

BLOCK 8: ZZ Indicator detected (direction DOWN)
  Pockets BEFORE: ZZ=P1, AntiZZ=P2

BLOCK 9: First bet evaluation
  ZZ predicts UP, Actual: DOWN
  firstOutcomeZZ = -85% (NEGATIVE)
  runProfitZZ = -85%

  → firstOutcomeZZ NEGATIVE
  → AntiZZ activates, moves to POCKET1
  → ZZ moves to POCKET2

  Pockets AFTER: ZZ=P2, AntiZZ=P1

BLOCK 10: AntiZZ plays ONE bet
  AntiZZ predicts DOWN (same direction)
  Actual: DOWN
  AntiZZ last bet = +85% (POSITIVE)
  AntiZZ stays P1

BLOCK 12: Next ZZ Indicator
  AntiZZ plays ONE bet
  ...
```

### Example 3: Both in POCKET2

```
STATE:
  ZZ = POCKET2 (previous runProfitZZ was negative)
  AntiZZ = POCKET2 (previous last bet was negative)

BLOCK 15: ZZ Indicator detected (direction UP)
  Pockets BEFORE: ZZ=P2, AntiZZ=P2

BLOCK 16: Imaginary first bet evaluation
  ZZ would predict DOWN, Actual: DOWN
  firstOutcomeZZ = +85% (POSITIVE - imaginary)
  runProfitZZ = +85% (updated even though imaginary!)

  → firstOutcomeZZ POSITIVE
  → ZZ moves P2 → P1
  → ZZ now bets (starting from next block)
  → AntiZZ stays P2

  Pockets AFTER: ZZ=P1, AntiZZ=P2
```

### Example 4: Both in POCKET2, Imaginary Negative

```
STATE:
  ZZ = POCKET2
  AntiZZ = POCKET2

BLOCK 20: ZZ Indicator detected (direction UP)
  Pockets BEFORE: ZZ=P2, AntiZZ=P2

BLOCK 21: Imaginary first bet evaluation
  ZZ would predict DOWN, Actual: UP
  firstOutcomeZZ = -85% (NEGATIVE - imaginary)
  runProfitZZ = -85% (updated even though imaginary!)

  → firstOutcomeZZ NEGATIVE
  → ZZ stays P2
  → AntiZZ becomes candidate
  → AntiZZ moves to P1 for NEXT indicator

  Pockets AFTER: ZZ=P2, AntiZZ=P1 (but AntiZZ waits for next indicator)

BLOCK 24: Next ZZ Indicator
  AntiZZ is in P1 → AntiZZ plays ONE bet
  ...
```

---

## FINAL INSTRUCTION

If your code violates any rule above, it is **incorrect**.

**Do not guess. Follow the pocket rules exactly.**

---

*Document version: v16.0 - Authoritative Specification*
