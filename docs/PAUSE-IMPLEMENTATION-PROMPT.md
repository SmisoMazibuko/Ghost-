# Prompt for New Chat Session

Copy and paste the following into a new chat:

---

## Task: Implement Per-System Pause Tracking

I need you to implement the 3-block pause (MINOR_PAUSE) system for my Ghost Evaluator trading platform. The pause system exists but is NOT working - consecutive losses are tracked globally instead of per-system.

### IMPORTANT: Investigation First

Before writing any code, you MUST first investigate the codebase to understand:

1. **Read the implementation plan**: `docs/PAUSE-SYSTEM-IMPLEMENTATION-PLAN.md`
2. **Understand the three trading systems**:
   - Pocket (ZZ/AntiZZ) - Only affected by STOP_GAME
   - Bucket (XAX, OZ, PP patterns) - Needs independent pause tracking
   - SameDir (continuation betting) - Needs independent pause tracking

3. **Investigate these files**:
   - `src/engine/reaction.ts` - Find `evaluateTrade()`, `predictNext()`, and where trades close
   - `src/engine/pause-manager.ts` - Understand `checkSystemPause()` method
   - `src/engine/actual-sim-ledger.ts` - How trades are recorded
   - `src/types/index.ts` - Current type definitions

4. **Answer these questions before coding**:
   - Where exactly are trades closed and P/L calculated?
   - How do I know which system (Bucket vs SameDir) made a trade?
   - Where should `checkSystemPause()` be called?

### Requirements

1. Track consecutive losses SEPARATELY for Bucket and SameDir
2. When Bucket has 2 consecutive losses → pause Bucket for 3 blocks (SameDir continues)
3. When SameDir has 2 consecutive losses → pause SameDir for 3 blocks (Bucket continues)
4. Pocket (ZZ/AntiZZ) should NEVER trigger MINOR_PAUSE or MAJOR_PAUSE
5. Each prediction/trade must be tagged with its system

### Do NOT:
- Skip the investigation phase
- Assume you know how the code works without reading it
- Break existing functionality
- Change the pause rules (they are correct in pause-manager.ts)

### After Implementation:
- Build must pass: `npm run build`
- Update UI to show per-system consecutive losses
- Test with manual scenarios

---
