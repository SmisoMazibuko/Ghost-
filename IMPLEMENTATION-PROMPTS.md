# SameDir Pause/Resume Implementation Prompts

Use each prompt in a separate chat session to implement the feature step by step.

---

## PHASE 1: Track ZZ/XAX Last Result

### Prompt:

```
I need to track the last ZZ/XAX trade result (WIN or LOSS) so that SameDir can know when ZZ/XAX breaks.

CONTEXT:
- We have a ghost-evaluator trading system
- ZZ/XAX patterns are: ZZ, AntiZZ, 2A2, 3A3, 4A4, 5A5, Anti2A2, Anti3A3, Anti4A4, Anti5A5
- When ZZ/XAX LOSES, it means the pattern "broke"
- SameDir needs to know when ZZ/XAX breaks to resume trading

TASK:
1. Find where trades are processed/logged in the codebase
2. Add tracking for lastZZXAXResult: 'WIN' | 'LOSS' | null
3. Update this value whenever a ZZ/XAX pattern trade completes
4. Make this value accessible to SameDirectionManager

FILES TO CHECK:
- ghost-evaluator/src/engine/hierarchy-manager.ts
- ghost-evaluator/src/engine/state.ts
- ghost-evaluator/src/engine/zz-state-manager.ts
- ghost-evaluator/src/data/session-recorder.ts

REQUIREMENTS:
- Track the result of the MOST RECENT ZZ/XAX trade
- Include which pattern it was (ZZ, 2A2, etc.)
- Include the block index where it happened
- Must be accessible from SameDirectionManager

DO NOT change any existing betting logic. Only add tracking.
```

---

## PHASE 2: Add PAUSED State to SameDirectionManager

### Prompt:

```
I need to add a PAUSED state to the SameDirectionManager for the pause/resume system.

CONTEXT:
- Current states: active (boolean) - either betting or not
- New states needed: INACTIVE, ACTIVE, PAUSED, EXPIRED
- PAUSED means: SD is activated but temporarily not betting (tracking imaginary trades)
- During PAUSED: accumulatedLoss is FROZEN (no depreciation)

CURRENT FILE: ghost-evaluator/src/engine/same-direction.ts

TASK:
1. Replace `active: boolean` with `state: 'INACTIVE' | 'ACTIVE' | 'PAUSED' | 'EXPIRED'`
2. Add new state properties:
   - pauseReason: string | null
   - pauseStartBlock: number | null
   - imaginaryPnL: number
   - imaginaryWins: number
   - imaginaryLosses: number
   - consecutiveImaginaryWins: number
3. Update isActive() to return state === 'ACTIVE'
4. Add new methods:
   - isPaused(): boolean
   - getState(): string
   - getPauseReason(): string | null
5. Update activate() to set state = 'ACTIVE'
6. Update deactivate() to set state = 'EXPIRED' (not INACTIVE)
7. Keep all existing logic working - just add the new state structure

IMPORTANT:
- Do NOT implement pause/resume triggers yet (that's Phase 3 & 4)
- Just add the state structure and methods
- All existing tests should still pass
- INACTIVE = never activated
- EXPIRED = was active, life exhausted
```

---

## PHASE 3: Implement Pause Triggers

### Prompt:

```
I need to implement pause triggers for SameDir. When these conditions are met, SD should transition from ACTIVE to PAUSED.

CONTEXT:
- SameDirectionManager now has states: INACTIVE, ACTIVE, PAUSED, EXPIRED
- Pause means: stop real betting, track imaginary outcomes, preserve life (accumulatedLoss frozen)

PAUSE TRIGGERS (any of these):
1. HIGH_PCT reversal + loss:
   - Current block direction != previous block direction (reversal)
   - Current block PCT >= 70
   - SD bet would LOSE (predicted wrong direction)

2. Consecutive losses:
   - SD has 1+ real consecutive losses already
   - Current trade is also a loss
   - (This means pause on 2nd consecutive loss)

FILE: ghost-evaluator/src/engine/same-direction.ts

TASK:
1. Add a method: checkPauseTriggers(currentBlock, previousBlock, wouldWin: boolean)
2. This method should:
   - Check for HIGH_PCT reversal (pct >= 70, direction changed, would lose)
   - Check for consecutive losses (consecutiveLosses >= 1 && !wouldWin)
   - Return { shouldPause: boolean, reason: string }
3. Add tracking for consecutiveRealLosses
4. Add method: transitionToPaused(reason: string, blockIndex: number)
   - Set state = 'PAUSED'
   - Set pauseReason = reason
   - Set pauseStartBlock = blockIndex
   - Reset imaginary counters to 0
   - DO NOT modify accumulatedLoss (frozen)
5. When PAUSED, track imaginary outcomes:
   - Add method: recordImaginaryTrade(isWin: boolean, pnl: number)
   - Update imaginaryPnL, imaginaryWins/Losses, consecutiveImaginaryWins

IMPORTANT:
- Only trigger pause when state === 'ACTIVE'
- accumulatedLoss must NOT change while PAUSED
- consecutiveRealLosses resets to 0 on any real win
```

---

## PHASE 4: Implement Resume Trigger (ZZ Break)

### Prompt:

```
I need to implement the resume trigger for SameDir. When ZZ/XAX breaks, SD should transition from PAUSED back to ACTIVE.

CONTEXT:
- SameDirectionManager has PAUSED state
- We track lastZZXAXResult from Phase 1
- Resume should happen when ZZ/XAX LOSES (breaks)
- Resume takes effect on the NEXT trade (not immediately)

RESUME TRIGGER:
- lastZZXAXResult === 'LOSS' (ZZ/XAX pattern just lost/broke)

FILE: ghost-evaluator/src/engine/same-direction.ts

TASK:
1. Add method: checkResumeTrigger(lastZZXAXResult: 'WIN' | 'LOSS' | null)
   - Return { shouldResume: boolean, reason: string }
   - shouldResume = true if lastZZXAXResult === 'LOSS'
2. Add method: transitionToActive(reason: string, blockIndex: number)
   - Set state = 'ACTIVE'
   - Clear pauseReason and pauseStartBlock
   - Reset imaginary counters
   - DO NOT modify accumulatedLoss (continue with remaining life)
   - Increment resumeCount
3. Add resumeCount tracking (how many times resumed in this activation cycle)
4. The resume check should happen BEFORE processing each SD trade
5. If resume condition met, next trade becomes REAL

INTEGRATION:
- The caller (hierarchy-manager or processBlock) should:
  1. Check if state === 'PAUSED'
  2. Get lastZZXAXResult from ZZ tracking
  3. Call checkResumeTrigger()
  4. If shouldResume, call transitionToActive()
  5. Then process the trade as REAL

IMPORTANT:
- Resume only when state === 'PAUSED'
- Must have remainingLife > 0 to resume (or accumulatedLoss <= 140)
- If would resume but life exhausted, transition to EXPIRED instead
```

---

## PHASE 5: Update Logging (REAL vs IMAGINARY)

### Prompt:

```
I need to update the logging system to distinguish between REAL and IMAGINARY trades for SameDir.

CONTEXT:
- SameDir now has ACTIVE and PAUSED states
- ACTIVE = REAL trades (actually betting)
- PAUSED = IMAGINARY trades (tracking only)
- We need to log both types for analysis

FILES TO UPDATE:
- ghost-evaluator/src/data/session-recorder.ts
- ghost-evaluator/src/data/play-logger.ts
- ghost-evaluator/src/types/index.ts

TASK:
1. Add to LoggedPlay interface:
   - betType: 'REAL' | 'IMAGINARY' | 'NONE'
   - sdStateSnapshot: {
       state: string;
       accumulatedLoss: number;
       pauseReason: string | null;
       imaginaryPnL: number;
       consecutiveImaginaryWins: number;
     }

2. Update session recording to include:
   - SD state at each block
   - Whether trade was real or imaginary
   - Running imaginary PnL during paused periods

3. Add to session summary:
   - sdRealTrades: number
   - sdImaginaryTrades: number
   - sdRealPnL: number
   - sdImaginaryPnL: number
   - pauseCount: number
   - resumeCount: number

4. Console logging should show:
   [SD] REAL WIN +140 (accLoss: 80)
   [SD] REAL LOSS -70 (accLoss: 150) >>> PAUSED (HIGH_PCT 75%)
   [SD] IMG WIN +120 (imagPnL: 120)
   [SD] IMG LOSS -80 (imagPnL: 40)
   [SD] <<< RESUMED (ZZ broke)
   [SD] REAL WIN +90 (accLoss: 150)

IMPORTANT:
- Keep all existing log fields
- Add new fields, don't replace
- Both JSON session files and console logs should show the distinction
```

---

## PHASE 6: Integration with HierarchyManager

### Prompt:

```
I need to integrate the SameDir pause/resume system with the HierarchyManager.

CONTEXT:
- SameDirectionManager now has: INACTIVE, ACTIVE, PAUSED, EXPIRED states
- HierarchyManager decides which pattern bets
- When SD is PAUSED, it should NOT bet but should still track imaginary outcomes
- Other patterns (bucket, ZZ) behavior during SD pause: TBD (keep existing for now)

FILE: ghost-evaluator/src/engine/hierarchy-manager.ts

CURRENT FLOW:
1. HierarchyManager.decideBet() checks if SD is active
2. If SD active, SD bets and pauses bucket
3. If SD not active, check ZZ, then bucket

NEW FLOW:
1. Get SD state from SameDirectionManager
2. If SD state === 'ACTIVE':
   - Check pause triggers before betting
   - If should pause, transition to PAUSED, return no bet
   - If not pausing, proceed with real bet
3. If SD state === 'PAUSED':
   - Check resume trigger (ZZ broke?)
   - If should resume, transition to ACTIVE
   - If still paused, track imaginary outcome, return no bet (or let bucket bet?)
4. If SD state === 'EXPIRED' or 'INACTIVE':
   - Proceed to ZZ/bucket as normal

TASK:
1. Update decideBet() to handle all 4 SD states
2. Before SD would bet:
   - Get current and previous block
   - Determine if SD bet would win
   - Call SD.checkPauseTriggers()
   - If pause triggered, call SD.transitionToPaused()
3. When SD is PAUSED:
   - Get lastZZXAXResult
   - Call SD.checkResumeTrigger()
   - If resume, call SD.transitionToActive()
   - Track imaginary outcome for the skipped trade
4. Return appropriate decision object with sdState info

IMPORTANT:
- When PAUSED, still call SD.recordImaginaryTrade() with what would have happened
- Keep bucket/ZZ logic unchanged for now
- Add sdState to decision result for logging
```

---

## PHASE 7: Testing and Validation

### Prompt:

```
I need to test and validate the SameDir pause/resume implementation.

CONTEXT:
- SameDir now has pause/resume with:
  - Pause triggers: HIGH_PCT ≥70% reversal + loss, 2+ consecutive losses
  - Resume trigger: ZZ/XAX breaks (loses)
  - Life preserved during pause
- Expected improvement: +1504 across test sessions

TEST SESSIONS:
- ghost-evaluator/data/sessions/session_2025-12-24T18-19-24-936Z.json (Session 1: -638 SD)
- ghost-evaluator/data/sessions/session_2025-12-24T18-57-18-606Z.json (Session 2: +816 SD)

TASK:
1. Create unit tests for SameDirectionManager:
   - test_pause_on_high_pct_reversal
   - test_pause_on_consecutive_losses
   - test_resume_on_zz_break
   - test_life_preserved_during_pause
   - test_no_resume_if_life_exhausted
   - test_imaginary_tracking

2. Create integration test:
   - Replay Session 1 with new pause/resume
   - Expected: SD PnL improves from -638 to ~+478
   - Verify pause events at correct blocks
   - Verify resume events at correct blocks

3. Create replay comparison script:
   - Run both sessions with OLD logic (no pause)
   - Run both sessions with NEW logic (with pause)
   - Compare SD PnL, pause count, resume count
   - Print improvement

EXPECTED RESULTS:
| Session | Without Pause | With Pause | Improvement |
|---------|---------------|------------|-------------|
| Session 1 | -638 | +478 | +1116 |
| Session 2 | +816 | +1204 | +388 |
| TOTAL | +178 | +1682 | +1504 |

VALIDATION CRITERIA:
- All existing tests pass
- New pause/resume tests pass
- Replay shows improvement close to expected
- No regressions in other patterns (ZZ, bucket)
```

---

## QUICK REFERENCE: File Locations

```
ghost-evaluator/
├── src/
│   ├── engine/
│   │   ├── same-direction.ts      # Main SD logic (Phases 2-4)
│   │   ├── hierarchy-manager.ts   # Integration (Phase 6)
│   │   ├── zz-state-manager.ts    # ZZ tracking (Phase 1)
│   │   └── state.ts               # Global state
│   ├── data/
│   │   ├── session-recorder.ts    # Logging (Phase 5)
│   │   └── play-logger.ts         # Logging (Phase 5)
│   └── types/
│       └── index.ts               # Type definitions
├── tests/
│   └── unit/                      # Unit tests (Phase 7)
└── data/
    └── sessions/                  # Test session files
```

---

## ORDER OF IMPLEMENTATION

1. **Phase 1** - Track ZZ/XAX result (dependency for Phase 4)
2. **Phase 2** - Add PAUSED state structure
3. **Phase 3** - Implement pause triggers
4. **Phase 4** - Implement resume trigger
5. **Phase 5** - Update logging
6. **Phase 6** - Integration
7. **Phase 7** - Testing

Each phase can be done in a separate chat session. Complete one before starting the next.
