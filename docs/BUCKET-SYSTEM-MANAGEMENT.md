# Bucket System Management - Complete Ruleset
## Ghost Evaluator v15.1

---

## 1. OVERVIEW

The Bucket System classifies patterns into three buckets based on their trading state and performance history. This determines whether and how a pattern should be played.

### The Three Buckets

| Bucket | Name | Play Direction | Description |
|--------|------|----------------|-------------|
| **1** | MAIN | Normal | Pattern is active, plays in normal direction |
| **2** | WAITING | None | Pattern is observing, not playing |
| **3** | B&S (BNS) | Inverse | Pattern plays in inverse direction (Bait & Switch) |

### Pattern Pairs (Opposites)

Each pattern has an opposite that is mutually exclusive during B&S:

| Pattern | Opposite |
|---------|----------|
| 2A2 | Anti2A2 |
| 3A3 | Anti3A3 |
| 4A4 | Anti4A4 |
| 5A5 | Anti5A5 |
| 6A6 | Anti6A6 |
| AP5 | OZ |
| PP | ST |

**Note:** ZZ and AntiZZ are **EXCLUDED** from the bucket system. They are managed separately by `ZZStateManager`.

---

## 2. BUCKET TRANSITIONS

### 2.1 Entry Points

All patterns start in **WAITING** bucket.

```
┌─────────────────────────────────────────────────────────────┐
│                      INITIAL STATE                          │
│                                                             │
│              All patterns start in WAITING                  │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Transition Diagram

```
                    ┌──────────────┐
                    │   WAITING    │
                    │  (Bucket 2)  │
                    └──────┬───────┘
                           │
                           │ Pattern activates
                           │ (formation detected + not blocked)
                           ▼
                    ┌──────────────┐
                    │    MAIN      │
                    │  (Bucket 1)  │
                    └──────┬───────┘
                           │
                           │ Pattern breaks (loses)
                           │
              ┌────────────┴────────────┐
              │                         │
              ▼                         ▼
    Run Profit > -70%          Run Profit ≤ -70%
              │                         │
              ▼                         ▼
       ┌──────────────┐         ┌──────────────┐
       │   WAITING    │         │    B&S       │
       │  (Bucket 2)  │         │  (Bucket 3)  │
       └──────────────┘         └──────────────┘
```

---

## 3. MAIN BUCKET (Bucket 1) RULES

### 3.1 Entry to MAIN

A pattern enters MAIN when:
1. Pattern formation is detected (activates from lifecycle)
2. Pattern is **NOT blocked** by its opposite being in B&S
3. Pattern was previously in WAITING

### 3.2 Playing in MAIN

- Play in **NORMAL direction** based on pattern signal
- Track cumulative run profit during active phase

### 3.3 Exit from MAIN

When pattern breaks (formation no longer valid):

| Run Profit | Destination | Reason |
|------------|-------------|--------|
| > -70% | WAITING | Small loss or profit, wait for next opportunity |
| ≤ -70% | B&S | Big loss, flip to inverse strategy |

**Run Profit** = Sum of all trade profits during the active phase, including the break loss.

---

## 4. B&S BUCKET (Bucket 3) RULES - DETAILED

### 4.1 Entry to B&S

A pattern enters B&S when:
- Pattern was in **MAIN**
- Pattern breaks with **run profit ≤ -70%**

**On Entry:**
1. Pattern moves to B&S bucket
2. **Opposite pattern is BLOCKED** (cannot activate in MAIN)
3. Pattern begins waiting for **BAIT**

### 4.2 The B&S Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                        B&S LIFECYCLE                            │
│                                                                 │
│  ┌─────────┐    ┌─────────────┐    ┌─────────────┐             │
│  │ ENTER   │───▶│ WAIT FOR    │───▶│ PLAY        │             │
│  │ B&S     │    │ BAIT        │    │ SWITCH      │             │
│  └─────────┘    └──────┬──────┘    └──────┬──────┘             │
│                        │                   │                    │
│                        │                   │                    │
│              ┌─────────┴─────────┐         │                    │
│              ▼                   ▼         ▼                    │
│         Bait Confirmed      Bait Failed   Switch Result         │
│              │                   │         │                    │
│              ▼                   ▼         ▼                    │
│         Play Switch         WAITING    See Section 4.5          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 BAIT - What It Is

**BAIT** = The pattern formation appearing again (e.g., RR for 2A2)

The market is "baiting" traders to think the normal direction will work. In B&S mode, we recognize this as a trap and prepare to play the **SWITCH** (inverse).

### 4.4 BAIT Confirmation Rules

After the BAIT formation appears, the **next outcome** determines confirmation:

Using 2A2 as example (formation = RR):

```
Sequence: ... RR → ?

Case 1: RR → G (Win for normal direction)
        ├── G ≥ 70%  → BAIT CONFIRMED! Ready to play SWITCH
        └── G < 70%  → ACCUMULATE profit, keep waiting for more

Case 2: RR → R (Loss, making RRR)
        └── BAIT FAILED → Exit to WAITING
```

#### Confirmation Thresholds

| Condition | Result |
|-----------|--------|
| Single win ≥ 70% | Immediate bait confirmation |
| Cumulative wins ≥ 100% | Bait confirmed via accumulation |
| Loss after bait formation (e.g., RRR) | Bait failed → WAITING |

### 4.5 SWITCH - Playing Inverse

Once BAIT is confirmed:
1. Pattern **re-activates** in B&S bucket
2. Play the **SWITCH** (inverse direction bet)
3. After switch plays, evaluate result:

| Switch Result | Destination | Reason |
|---------------|-------------|--------|
| Win (any %) | Stay in B&S | Reset bait tracking, wait for next bait |
| Loss < 70% | **WAITING** | Switch didn't work, B&S cycle ends softly |
| Loss ≥ 70% | **MAIN** | Big switch loss = B&S strategy invalidated, return to normal play |

**Key Point:** A big switch loss (≥70%) means the inverse strategy also failed - the entire B&S premise is invalidated, so the pattern goes back to MAIN to play normally.

### 4.6 B&S Exit Conditions Summary

| Condition | Destination | Explanation |
|-----------|-------------|-------------|
| Bait failed (e.g., RRR) | **WAITING** | Expected confirmation didn't happen |
| Switch loses < 70% | **WAITING** | Inverse play didn't work strongly |
| Switch loses ≥ 70% | **MAIN** | B&S strategy completely invalidated |
| 2+ consecutive opposite wins | **WAITING** | Opposite pattern breaking B&S |

**Important:** Only a big switch loss (≥70%) sends pattern to MAIN. All other B&S exits go to WAITING.

---

## 5. OPPOSITE PATTERN BLOCKING

### 5.1 When Blocking Occurs

When pattern X enters B&S:
- Opposite pattern Y is **BLOCKED**
- Y cannot activate in MAIN while blocked

### 5.2 Blocked Pattern Behavior

While blocked:
1. Pattern stays in WAITING bucket
2. **Still accumulates profit** towards activation threshold
3. Waits for unblock

### 5.3 Unblocking Rules

Opposite pattern is unblocked when:

| Event | What Happens |
|-------|--------------|
| B&S pattern exits to WAITING | Opposite unblocked |
| 2+ consecutive opposite wins (while blocked) | B&S breaks, opposite unblocked |

### 5.4 After Unblock - Activation Check

When opposite is unblocked:

1. Check if pattern formation is present
2. If formation present:
   - Check if accumulated profit ≥ 70% → Activate in MAIN
   - If not, check cumulative threshold → Activate if met
   - Otherwise, stay in WAITING until next formation

---

## 6. CONSECUTIVE OPPOSITE WINS RULE

### 6.1 The Rule

If the **opposite pattern** wins **2 or more consecutive times** while a pattern is in B&S:
- B&S breaks
- Opposite is unblocked
- B&S pattern goes to **WAITING**

### 6.2 Example

```
2A2 is in B&S (Anti2A2 is blocked)

Sequence: Anti2A2 would have won...
  Trade 1: Anti2A2 wins → consecutive count = 1
  Trade 2: Anti2A2 wins → consecutive count = 2 → B&S BREAKS!

Result:
  - 2A2 moves to WAITING
  - Anti2A2 is UNBLOCKED
  - Anti2A2 can now activate in MAIN if formation present
```

### 6.3 Counter Reset

The consecutive counter resets to 0 when:
- Opposite pattern loses a trade
- B&S breaks for any reason

---

## 7. COMPLETE STATE MACHINE

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          BUCKET STATE MACHINE                               │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌─────────────┐
                              │   START     │
                              │  (WAITING)  │
                              └──────┬──────┘
                                     │
                         Formation detected + Not blocked
                                     │
                                     ▼
                              ┌─────────────┐
                       ┌─────▶│    MAIN     │◀───────────────────┐
                       │      └──────┬──────┘                    │
                       │             │                           │
                       │        Pattern breaks                   │
                       │             │                           │
                       │    ┌───────┴───────┐                   │
                       │    ▼               ▼                   │
                       │  >-70%          ≤-70%                  │
                       │    │               │                   │
                       │    ▼               ▼                   │
                       │ WAITING          B&S                   │
                       │    ▲               │                   │
                       │    │    ┌──────────┤                   │
                       │    │    │          │                   │
                       │    │    ▼          ▼                   │
                       │    │  Wait      Bait                   │
                       │    │  for       Failed                 │
                       │    │  Bait     (e.g.RRR)               │
                       │    │    │          │                   │
                       │    │    │          ▼                   │
                       │    │    │      WAITING                 │
                       │    │    ▼                              │
                       │    │  Bait                             │
                       │    │  Confirmed                        │
                       │    │    │                              │
                       │    │    ▼                              │
                       │    │  Play SWITCH                      │
                       │    │    │                              │
                       │    │    ├─── Win ──────▶ Stay B&S (wait next bait)
                       │    │    │                              │
                       │    │    ├─── Lose <70% ──▶ WAITING     │
                       │    │    │                              │
                       │    │    └─── Lose ≥70% ────────────────┘
                       │    │                        (B&S invalidated → MAIN)
                       │    │
                       └────┴──── (Formation detected + Not blocked)


BLOCKING FLOW (parallel state):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Pattern X enters B&S ──▶ Opposite Y BLOCKED
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
         X exits B&S    2+ consecutive    X plays switch
         (any reason)    Y wins           and loses
              │               │               │
              ▼               ▼               ▼
         Y UNBLOCKED     Y UNBLOCKED     Y UNBLOCKED
              │               │               │
              └───────────────┼───────────────┘
                              │
                              ▼
                     Y checks activation:
                     - Formation present?
                     - Accumulated ≥ 70%?
                              │
                     ┌────────┴────────┐
                     ▼                 ▼
                   Yes                No
                     │                 │
                     ▼                 ▼
              Activate MAIN      Stay WAITING
```

---

## 8. CONFIGURATION PARAMETERS

| Parameter | Default | Description |
|-----------|---------|-------------|
| `consecutiveWinsToBreakBns` | 2 | Consecutive opposite wins needed to break B&S |
| `singleBaitThreshold` | 70 | Single win % to confirm bait |
| `cumulativeBaitThreshold` | 100 | Cumulative % to confirm bait |

---

## 9. EXAMPLES

### Example 1: Normal MAIN → WAITING Flow

```
Block 1: 2A2 activates (RR detected) → MAIN
Block 2: 2A2 wins +50%
Block 3: 2A2 wins +30%
Block 4: 2A2 loses -40% (breaks)

Run Profit = +50 +30 -40 = +40%
Since +40% > -70% → 2A2 goes to WAITING
```

### Example 2: MAIN → B&S Flow

```
Block 1: 2A2 activates (RR detected) → MAIN
Block 2: 2A2 loses -80% (breaks)

Run Profit = -80%
Since -80% ≤ -70% → 2A2 goes to B&S
Anti2A2 is now BLOCKED
```

### Example 3: B&S Bait Confirmed → Switch Wins

```
2A2 is in B&S, Anti2A2 is BLOCKED

Block 5: RR appears (bait formation)
Block 6: G result, +75% → BAIT CONFIRMED (≥70%)
Block 7: 2A2 re-activates, plays SWITCH (inverse)
Block 8: SWITCH wins +60%

Result: 2A2 stays in B&S, resets bait tracking, waits for next bait
```

### Example 4: B&S Bait Failed (RRR)

```
2A2 is in B&S, Anti2A2 is BLOCKED

Block 5: RR appears (bait formation)
Block 6: R result (making RRR) → BAIT FAILED

Result:
- 2A2 goes to WAITING
- Anti2A2 is UNBLOCKED
```

### Example 5: B&S Switch Loses (Small Loss)

```
2A2 is in B&S, BAIT confirmed

Block 7: Play SWITCH (inverse)
Block 8: SWITCH loses -50%

Result:
- 2A2 goes to WAITING (switch didn't work strongly)
- Anti2A2 is UNBLOCKED
```

### Example 5b: B&S Switch Loses (Big Loss)

```
2A2 is in B&S, BAIT confirmed

Block 7: Play SWITCH (inverse)
Block 8: SWITCH loses -80%

Result:
- 2A2 goes to MAIN (B&S strategy invalidated - both normal AND inverse failed)
- Anti2A2 is UNBLOCKED
- 2A2 plays normally in MAIN on next activation
```

### Example 6: B&S Broken by Consecutive Opposite Wins

```
2A2 is in B&S, Anti2A2 is BLOCKED

Block 5: Anti2A2 would have won +60% → consecutive = 1
Block 6: Anti2A2 would have won +55% → consecutive = 2 → B&S BREAKS

Result:
- 2A2 goes to WAITING
- Anti2A2 is UNBLOCKED
- Anti2A2 checks if it should activate in MAIN
```

### Example 7: Blocked Pattern Accumulation

```
2A2 is in B&S, Anti2A2 is BLOCKED

Block 5: Anti2A2 would have won +40% → accumulated = 40%
Block 6: Anti2A2 would have won +35% → accumulated = 75%
Block 7: 2A2 exits B&S (any reason) → Anti2A2 UNBLOCKED

Anti2A2 checks activation:
- Formation present? Yes
- Accumulated 75% ≥ 70%? Yes
- Result: Anti2A2 activates in MAIN
```

---

## 10. KEY DIFFERENCES FROM PREVIOUS IMPLEMENTATION

| Aspect | Old Behavior | Correct Behavior |
|--------|--------------|------------------|
| Bait failed (RRR) | Not handled | → **WAITING** |
| Switch loses < 70% | Stays in BNS | → **WAITING** |
| Switch loses ≥ 70% | Goes to MAIN | → **MAIN** (this was correct!) |
| Blocked accumulation | Not tracked | **Track and use for activation** |
| 2+ consecutive breaks | Goes to MAIN | → **WAITING** |

---

## 11. SUMMARY QUICK REFERENCE

### Entry Rules
- **MAIN**: Formation detected + not blocked
- **B&S**: Break from MAIN with ≤ -70% run profit

### Exit Rules
- **MAIN → WAITING**: Break with > -70%
- **MAIN → B&S**: Break with ≤ -70%
- **B&S → WAITING**: Bait failed (RRR) OR Switch loses <70% OR 2+ consecutive opposite wins
- **B&S → MAIN**: Switch loses ≥70% (B&S strategy invalidated)

### Play Rules
- **MAIN**: Play normal direction
- **WAITING**: Don't play
- **B&S**: Play inverse (SWITCH) only after bait confirmed

### Blocking Rules
- Pattern enters B&S → Opposite is BLOCKED
- B&S exits → Opposite is UNBLOCKED
- Blocked patterns still accumulate for activation check

### The 70% Threshold Summary
| Context | ≥70% Loss Means |
|---------|-----------------|
| MAIN breaks | → B&S (normal failed badly) |
| SWITCH loses | → MAIN (inverse also failed badly, reset to normal) |
| Bait confirmation | Single win ≥70% confirms bait |

---

*Document Version: 2.0*
*Last Updated: December 2024*
*For Ghost Evaluator v15.2*
