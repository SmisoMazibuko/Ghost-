# ZZ Strategy Pseudocode (Corrected Implementation)

## Overview

This document provides pseudocode for all ZZ strategy functions based on the corrected rules.

## Core Rules Summary

1. **ZZ NEVER goes to bait-and-switch** - It ignores B&S entirely
2. **Anti-ZZ triggers ONLY on first prediction negativity** - NOT from run profit
3. **Pocket placement is for confirmation only** - Does NOT trigger Anti-ZZ
4. **ZZ continues with main strategy during B&S** - No state changes

---

## Function: `activateZZ()`

Activates the ZZ system at game start or after a completed ZZ run.

```pseudocode
function activateZZ(blockIndex, previousRunProfit, indicatorDirection):
    // RULE: Don't activate during bait-and-switch
    if isInBaitSwitch:
        log("Cannot activate ZZ during B&S - suspended")
        return

    // Assign pocket based on PREVIOUS run profit (for confirmation only)
    pocket = assignPocket(previousRunProfit)

    // Initialize state
    state.currentState = 'zz_active'
    state.currentPocket = pocket
    state.previousRunProfit = previousRunProfit
    state.firstPredictionNegative = false
    state.firstPredictionEvaluated = false
    state.currentRunProfit = 0
    state.currentRunPredictions = 0
    state.savedIndicatorDirection = indicatorDirection
    state.activationBlockIndex = blockIndex
    state.antiZZActivationBlockIndex = -1

    log("ZZ activated at block {blockIndex}, Pocket {pocket}")
```

---

## Function: `assignPocket()`

Assigns pocket based on previous run profit. This is for CONFIRMATION only.

```pseudocode
function assignPocket(previousRunProfit):
    // RULE: Pocket assignment does NOT trigger Anti-ZZ
    // It only confirms correctness on the next run

    if previousRunProfit > 0:
        return 1  // Pocket 1 = previous run was profitable
    else if previousRunProfit < 0:
        return 2  // Pocket 2 = previous run was unprofitable
    else:
        return currentPocket  // Breakeven = keep current pocket
```

---

## Function: `evaluateFirstPrediction()`

**THE CORRECT ANTI-ZZ TRIGGER**

Evaluates the first prediction of a ZZ run to determine if Anti-ZZ should activate.

```pseudocode
function evaluateFirstPrediction(result):
    // Only evaluate if ZZ is active and first prediction not yet evaluated
    if state.currentState != 'zz_active':
        return false

    if state.firstPredictionEvaluated:
        return false  // Already evaluated

    // Mark as evaluated
    state.firstPredictionEvaluated = true
    state.currentRunPredictions++

    // Check if prediction was NEGATIVE for ZZ
    // Negative = result was opposite of what ZZ predicted (loss)
    isNegativeForZZ = (result.profit < 0)

    state.firstPredictionNegative = isNegativeForZZ
    state.currentRunProfit += result.profit

    if isNegativeForZZ:
        // *** THIS IS THE CORRECT TRIGGER FOR ANTI-ZZ ***
        activateAntiZZ(result.evalIndex)
        log("First prediction NEGATIVE ({result.profit}%) → Anti-ZZ activated")
        return true
    else:
        log("First prediction POSITIVE ({result.profit}%) → Continue normal ZZ")
        return false
```

---

## Function: `activateAntiZZ()`

Activates Anti-ZZ mode. Called ONLY when first prediction is negative.

```pseudocode
function activateAntiZZ(blockIndex):
    // This is ONLY called when first prediction is negative
    // NEVER called from:
    //   - Previous run profit
    //   - Bait-and-switch
    //   - Trend or block behavior

    state.currentState = 'anti_zz_active'
    state.antiZZActivationBlockIndex = blockIndex

    log("Anti-ZZ activated at block {blockIndex}")
```

---

## Function: `resolveZZRun()`

Resolves a completed ZZ/Anti-ZZ run.

```pseudocode
function resolveZZRun(blockIndex):
    // Only resolve if ZZ system is active
    if not isSystemActive():
        return null

    // Create run record
    record = {
        runNumber: runHistory.length + 1,
        wasAntiZZ: (state.currentState == 'anti_zz_active'),
        pocket: state.currentPocket,
        firstPredictionNegative: state.firstPredictionNegative,
        profit: state.currentRunProfit,
        predictionCount: state.currentRunPredictions,
        startBlockIndex: state.activationBlockIndex,
        endBlockIndex: blockIndex,
        ts: now()
    }

    // Add to history
    runHistory.push(record)

    // Store profit for NEXT activation's pocket assignment
    state.previousRunProfit = state.currentRunProfit

    // Calculate next pocket (for confirmation purposes)
    nextPocket = assignPocket(record.profit)
    log("{record.wasAntiZZ ? 'Anti-ZZ' : 'ZZ'} run resolved: Profit={record.profit}%, Next Pocket={nextPocket}")

    // Reset run state (NOT pocket or previousRunProfit)
    resetRunState()

    return record
```

---

## Function: `ignoreBaitSwitch()`

Handles ZZ behavior during bait-and-switch periods.

```pseudocode
function setBaitSwitchMode(isInBaitSwitch):
    wasInBaitSwitch = state.isInBaitSwitch
    state.isInBaitSwitch = isInBaitSwitch

    if isInBaitSwitch and not wasInBaitSwitch:
        // Entering B&S
        if isSystemActive():
            log("Entering B&S - ZZ suspended (main strategy takes over)")
            // NOTE: We do NOT change currentState here
            // ZZ ignores B&S - the reaction engine uses main strategy instead

    else if not isInBaitSwitch and wasInBaitSwitch:
        // Exiting B&S
        if isSystemActive():
            log("Exiting B&S - ZZ resumes normally")

function shouldIgnoreBaitSwitch():
    // ZZ always ignores B&S
    return state.isInBaitSwitch
```

---

## Function: `getPredictedDirection()`

Gets the predicted direction based on current ZZ/Anti-ZZ state.

```pseudocode
function getPredictedDirection(currentDirection):
    if not isSystemActive():
        return null

    if state.currentState == 'zz_active':
        // ZZ predicts OPPOSITE of current direction (alternation continues)
        return -currentDirection

    else if state.currentState == 'anti_zz_active':
        // Anti-ZZ predicts SAME as current direction (alternation breaks)
        return currentDirection

    return null
```

---

## Integration Flow: `processBlock()`

Shows how ZZ integrates with block processing.

```pseudocode
function processBlock(direction, percentage):
    // 1. Add block to game state (triggers pattern detection)
    blockResult = gameState.addBlock(direction, percentage)

    // 2. Check for bait & switch
    isInBaitSwitch = hostilityManager.isLocked()
    zzStateManager.setBaitSwitchMode(isInBaitSwitch)

    // 3. Process ZZ results (if not in B&S)
    if not isInBaitSwitch:
        for result in blockResult.evaluatedResults:
            if result.pattern == 'ZZ' or result.pattern == 'AntiZZ':
                if result.wasBet:
                    zzStateManager.recordPredictionResult(result)

    // 4. Check for ZZ activation (if not in B&S)
    if not isInBaitSwitch and not zzStateManager.isSystemActive():
        zzSignal = findSignal(blockResult.newSignals, 'ZZ')
        if zzSignal:
            previousRunProfit = lifecycle.getCycle('ZZ').lastRunProfit
            zzStateManager.activateZZ(blockIndex, previousRunProfit, zzSignal.indicatorDirection)

    // 5. Check for ZZ run resolution (pattern broke)
    for result in blockResult.evaluatedResults:
        if (result.pattern == 'ZZ' or result.pattern == 'AntiZZ') and result.wasBet:
            cycle = lifecycle.getCycle(result.pattern)
            if cycle.state == 'observing':  // Pattern just broke
                if zzStateManager.isSystemActive():
                    zzStateManager.resolveZZRun(blockIndex)

    // 6. Generate prediction
    prediction = predictNext()

    return blockResult, prediction
```

---

## Integration Flow: `predictNext()`

Shows how ZZ predictions are generated.

```pseudocode
function predictNext():
    // Check ZZ state
    zzState = zzStateManager.getCurrentState()
    isZZSystemActive = zzStateManager.isSystemActive()
    zzPocket = zzStateManager.getCurrentPocket()

    // Check B&S mode
    isInBaitSwitch = hostilityManager.isLocked()
    zzStateManager.setBaitSwitchMode(isInBaitSwitch)

    for pattern in sortedPatterns:
        signals = getPendingSignals(pattern)
        if signals.empty():
            continue

        signal = signals[0]

        // === ZZ/AntiZZ SPECIAL HANDLING ===
        if pattern == 'ZZ' or pattern == 'AntiZZ':

            // RULE: ZZ ignores B&S entirely
            if isInBaitSwitch:
                log("ZZ ignores B&S - deferring to main strategy")
                continue  // Skip to next pattern (main strategy)

            // Use ZZ state manager for direction
            if isZZSystemActive:
                currentDirection = gameState.getCurrentRunDirection()
                zzDirection = zzStateManager.getPredictedDirection(currentDirection)

                if zzDirection:
                    stateLabel = zzState == 'anti_zz_active' ? '[Anti-ZZ]' : '[ZZ]'
                    pocketLabel = "P{zzPocket}"

                    return Prediction {
                        hasPrediction: true,
                        direction: zzDirection,
                        pattern: zzState == 'anti_zz_active' ? 'AntiZZ' : 'ZZ',
                        reason: "{stateLabel} {pocketLabel} → {zzDirection}"
                    }

            continue  // ZZ not active, try next pattern

        // === Normal pattern handling (non-ZZ) ===
        // ... (bucket system logic for other patterns)

    return Prediction { hasPrediction: false, reason: "HOLD" }
```

---

## State Machine Diagram

```
                    ┌─────────────────────────────────────────────┐
                    │                                             │
                    ▼                                             │
    ┌──────────┐  ZZ Signal   ┌───────────┐  First Pred   ┌──────────────┐
    │ INACTIVE │ ────────────▶│ ZZ_ACTIVE │ ─────────────▶│ ANTI_ZZ_ACTIVE│
    └──────────┘              └───────────┘   Negative     └──────────────┘
         ▲                          │                            │
         │                          │ Pattern                    │ Pattern
         │                          │ Break                      │ Break
         │                          │                            │
         │                          ▼                            ▼
         └──────────────── resolveZZRun() ◀──────────────────────┘
                            (returns to INACTIVE,
                             stores profit for
                             next pocket assignment)

    Note: SUSPENDED state exists but ZZ ignores B&S by design.
    During B&S, ZZ state is preserved but predictions are skipped.
```

---

## What NOT to Do (Common Mistakes)

```pseudocode
// ❌ WRONG: Activating Anti-ZZ from run profit
function breakPattern_WRONG(pattern):
    if lastRunProfit <= 0:
        activateAntiZZ()  // WRONG! Never do this!

// ❌ WRONG: Activating Anti-ZZ from bait-and-switch
function handleBaitSwitch_WRONG():
    if isBaitSwitch:
        activateAntiZZ()  // WRONG! ZZ ignores B&S!

// ❌ WRONG: Activating Anti-ZZ from trend behavior
function analyzeTrend_WRONG():
    if trendIsNegative:
        activateAntiZZ()  // WRONG! Only first prediction matters!

// ✅ CORRECT: Only activate Anti-ZZ from first prediction
function evaluateFirstPrediction_CORRECT(result):
    if result.profit < 0:  // First prediction was negative
        activateAntiZZ()   // ✅ This is the ONLY correct trigger!
```
