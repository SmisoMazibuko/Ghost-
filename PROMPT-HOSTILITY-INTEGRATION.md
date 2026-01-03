# Prompt: Integrate Hostility Detection into Reaction Engine

## Context

We have implemented a hostility detection system to minimize losses during hostile market conditions. The core components are complete:

1. **`ghost-evaluator/src/engine/hostility-detector.ts`** - Full implementation with:
   - 6 indicators: CASCADE, CROSS_PATTERN, OPPOSITE_SYNC, HIGH_PCT, HIGH_PCT_CLUSTER, WR_COLLAPSE
   - Score tracking with decay on wins
   - Levels: normal, caution, pause, extended_pause
   - ZZ/AntiZZ are EXEMPT from hostility pause

2. **`ghost-evaluator/src/types/index.ts`** - Types added:
   - `EnhancedHostilityIndicatorType`, `EnhancedHostilityState`, `HostilityLevel`
   - `HOSTILITY_PAUSE` added to `PauseType`
   - Tuned config: `DEFAULT_ENHANCED_HOSTILITY_CONFIG`

3. **Backtest Results** (65 sessions):
   - Net Improvement: +898 (+4.4%)
   - Profitable Session Impact: 1.9% (PASS)
   - False Positive Rate: 5.7% (PASS)

## Task

Integrate the hostility detector into `ghost-evaluator/src/engine/reaction.ts`:

### Step 1: Import and Instantiate

```typescript
import { HostilityDetector, createHostilityDetector } from './hostility-detector';

// In class constructor or initialization:
private hostilityDetector: HostilityDetector;

constructor(...) {
  this.hostilityDetector = createHostilityDetector();
}
```

### Step 2: Call updateAfterTrade() After Each Trade

Find where trades are completed (around line 620+) and add:

```typescript
// After recording completed trade
this.hostilityDetector.updateAfterTrade(completedTrade);
```

### Step 3: Check canPatternTrade() Before Placing Trades

Find where betting decisions are made and add check:

```typescript
// Before placing a bet for non-exempt patterns
if (!this.hostilityDetector.canPatternTrade(pattern, confidence)) {
  // Skip this trade - hostility detected
  continue; // or return early
}
```

### Step 4: Advance Block Counter

In the block processing loop, call:

```typescript
this.hostilityDetector.advanceBlock();
```

### Step 5: Add to Session Export/Logging

Add hostility state to session data for monitoring:

```typescript
// In session export
hostilityState: this.hostilityDetector.getState()
```

## Key Files to Read

1. `ghost-evaluator/src/engine/reaction.ts` - Main file to modify
2. `ghost-evaluator/src/engine/hostility-detector.ts` - Implementation to integrate
3. `ghost-evaluator/src/types/index.ts` - Type definitions

## Important Rules

1. **ZZ/AntiZZ are EXEMPT** - The detector handles this, but verify integration doesn't override
2. **Caution mode** (score 10-19): Skip trades with confidence <60%
3. **Pause mode** (score 20+): Block all non-exempt patterns for 5-10 blocks
4. **Resume requires**: Score <8 AND recovery signal (ZZ/Anti2A2 win)

## Testing

After integration:
1. Build: `npm run build`
2. Test with a session file to verify hostility detection logs appear
3. Verify ZZ/AntiZZ trades still execute during pause

## Reference Docs

- `HOSTILITY-DETECTION-PLAN.md` - Full implementation plan
- `SESSION-ANALYSIS-REPORT.md` - Data analysis backing the design
- `backtest-hostility.js` - Backtest script showing expected behavior
