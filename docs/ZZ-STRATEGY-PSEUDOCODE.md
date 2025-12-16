# ZZ/AntiZZ Strategy Rules (Corrected Implementation)

## Overview

This document defines the complete rules for ZZ/AntiZZ pattern behavior.

---

## 1. Indicator & Predictions

**ZZ indicator** appears with a direction (up or down)

- **ZZ** predicts **OPPOSITE** to indicator direction
- **AntiZZ** predicts **SAME** as indicator direction

**Example:**
```
Indicator direction: UP
ZZ predicts: DOWN
AntiZZ predicts: UP
```

---

## 2. Three Types of Profit

### A. First Bet Profit
- The result of the single first bet after indicator
- Determines if AntiZZ should activate
- Negative → AntiZZ activates
- Positive → ZZ continues

### B. Current Run Profit
- Cumulative sum of all bet profits in the current run
- Starts at first bet after indicator (even if imaginary)
- Resets when new indicator appears

### C. Previous Run Profit
- Profit from the last completed run
- Determines pocket placement after run ends
- >= 0 → P1
- < 0 → P2

---

## 3. First Bet Definition

- "First bet" = the evaluation that occurs after indicator
- This is the bet ZZ **COULD HAVE** made if in P1
- Tied to the **INDICATOR**, not to who actually bets
- Even if AntiZZ takes the bet, it's still "first bet" from ZZ's perspective

**Example:**
```
Block 4: ZZ indicator appears (direction UP)
Block 5: First bet evaluation
         ZZ would predict DOWN
         Actual result: UP
         ZZ's first bet profit: NEGATIVE (ZZ would have lost)
         → AntiZZ activates
```

---

## 4. When ZZ is in P1

ZZ bets directly (no imaginary evaluation needed)

**First bet evaluated:**
- If first bet **NEGATIVE** → AntiZZ → P1, ZZ → P2
- If first bet **POSITIVE** → ZZ continues in P1

**Example - First bet positive:**
```
ZZ in P1
Indicator at block 10 (direction DOWN)
Block 11: First bet
          ZZ predicts UP
          Actual: UP
          First bet profit: +85% (POSITIVE)
          → ZZ stays P1, continues betting
```

**Example - First bet negative:**
```
ZZ in P1
Indicator at block 10 (direction DOWN)
Block 11: First bet
          ZZ predicts UP
          Actual: DOWN
          First bet profit: -85% (NEGATIVE)
          → AntiZZ → P1, ZZ → P2
```

---

## 5. When ZZ is in P2

New indicator comes → **Imaginary first bet evaluation** (don't actually bet)

- If first bet **NEGATIVE** → AntiZZ → P1, ZZ stays P2
- If first bet **POSITIVE** → ZZ moves P2 → P1, ZZ bets

**Example - First bet positive, ZZ moves to P1:**
```
ZZ in P2 (previous run was negative)
Indicator at block 15 (direction UP)
Block 16: Imaginary first bet evaluation
          ZZ would predict DOWN
          Actual: DOWN
          First bet profit: +85% (POSITIVE)
          → ZZ moves from P2 → P1
          → ZZ now bets
```

**Example - First bet negative, ZZ stays P2:**
```
ZZ in P2 (previous run was negative)
Indicator at block 15 (direction UP)
Block 16: Imaginary first bet evaluation
          ZZ would predict DOWN
          Actual: UP
          First bet profit: -85% (NEGATIVE)
          → AntiZZ → P1, ZZ stays P2
          → AntiZZ bets
```

---

## 6. AntiZZ Behavior

- AntiZZ bets **until it loses**
- When AntiZZ loses → ZZ activates

**Example:**
```
AntiZZ in P1
Block 17: AntiZZ bets, wins (+85%)
Block 18: AntiZZ bets, wins (+85%)
Block 19: AntiZZ bets, loses (-85%)
→ AntiZZ run ends
→ ZZ activates
→ Wait for next indicator
```

---

## 7. ZZ Behavior

- ZZ bets **until it gets a negative result**
- Run ends → calculate current run profit
- Current run profit >= 0 → ZZ stays P1
- Current run profit < 0 → ZZ → P2

**Example - Run profit positive:**
```
ZZ in P1
Block 11: ZZ bets, wins (+85%)
Block 12: ZZ bets, wins (+85%)
Block 13: ZZ bets, loses (-85%)
→ Run ends
→ Run profit: +85% + 85% - 85% = +85% (POSITIVE)
→ ZZ stays P1
```

**Example - Run profit negative:**
```
ZZ in P1
Block 11: ZZ bets, wins (+85%)
Block 12: ZZ bets, loses (-85%)
Block 13: ZZ bets, loses (-85%)
→ Run ends
→ Run profit: +85% - 85% - 85% = -85% (NEGATIVE)
→ ZZ → P2
```

---

## 8. Run Profit Calculation

**For ZZ:**
- Starts at first bet after indicator (even if imaginary)
- Includes all subsequent bets until negative result
- Even if no actual bet was made (imaginary), it's counted

**For AntiZZ:**
- Starts when AntiZZ takes P1
- Ends when AntiZZ loses

**Edge case - ZZ reactivates after AntiZZ fails:**
```
Block 10: AntiZZ loses, ZZ activates
Block 11: New indicator
Block 12: First bet (this is where ZZ run profit starts)
          Even if this was imaginary, run profit starts here
          This ensures we don't count AntiZZ's losses as ZZ's
```

---

## 9. Pocket System

- **P1** = Active (bets)
- **P2** = Inactive (observes)

**After run ends:**
- Previous run profit >= 0 → P1
- Previous run profit < 0 → P2

**Both can be in P2 simultaneously** (no one bets until imaginary first bet evaluation determines who goes to P1)

---

## 10. Complete Flow Example

```
GAME START
ZZ in P1 (default)

Block 3: Indicator (UP)
Block 4: First bet
         ZZ predicts DOWN, actual DOWN
         First bet: +85% (POSITIVE)
         → ZZ stays P1, bets

Block 5: ZZ bets, wins +85%
Block 6: ZZ bets, loses -85%
         → Run ends
         → Run profit: +85% + 85% - 85% = +85%
         → ZZ stays P1

Block 8: Indicator (DOWN)
Block 9: First bet
         ZZ predicts UP, actual DOWN
         First bet: -85% (NEGATIVE)
         → AntiZZ → P1, ZZ → P2

Block 10: AntiZZ bets, wins +85%
Block 11: AntiZZ bets, wins +85%
Block 12: AntiZZ bets, loses -85%
          → AntiZZ run ends
          → ZZ activates

Block 14: Indicator (UP)
Block 15: Imaginary first bet (ZZ in P2)
          ZZ would predict DOWN, actual DOWN
          First bet: +85% (POSITIVE)
          → ZZ moves P2 → P1, bets

Block 16: ZZ bets, loses -85%
          → Run ends
          → Run profit: +85% - 85% = 0%
          → ZZ stays P1 (>= 0)
```

---

## 11. What Does NOT Trigger AntiZZ

- ❌ Previous run profit being negative (only affects pocket)
- ❌ Bait-and-switch
- ❌ Trend behavior
- ❌ Any bet after the first one losing

## 12. The ONLY AntiZZ Trigger

- ✅ **First bet after indicator is NEGATIVE**

---

## 13. Key Distinctions

| Concept | Purpose |
|---------|---------|
| First bet profit | Determines AntiZZ activation |
| Current run profit | Tracked during run |
| Previous run profit | Determines pocket after run ends |
| Imaginary first bet | Used when ZZ is in P2 to determine if ZZ can move to P1 |

---

## 14. State Machine

```
                         First bet NEGATIVE
              ┌─────────────────────────────────────┐
              │                                     │
              ▼                                     │
┌──────────────────┐                    ┌──────────────────┐
│   ZZ in P1       │                    │  AntiZZ in P1    │
│   (ZZ bets)      │                    │  (AntiZZ bets)   │
└──────────────────┘                    └──────────────────┘
         │                                       │
         │ Negative result                       │ AntiZZ loses
         │ Run profit < 0                        │
         ▼                                       │
┌──────────────────┐                             │
│   ZZ in P2       │◀────────────────────────────┘
│   (observes)     │         ZZ activates
└──────────────────┘
         │
         │ New indicator
         │ Imaginary first bet POSITIVE
         │
         └──────────────────┐
                            │
                            ▼
                   ZZ moves to P1
```
