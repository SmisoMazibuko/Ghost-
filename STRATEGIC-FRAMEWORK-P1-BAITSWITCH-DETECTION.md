# Strategic Framework: P1, Bait-and-Switch, and Early Detection
## Ghost Evaluator v15.1 - Research & Design Document

---

# SECTION 1: P1 (Long Run Pattern) Analysis

## 1.1 Current Understanding (Preserved)

Your stated understanding:
- P1 activates when we get **7+ blasts** (consecutive same-direction blocks)
- After activation, there is usually a **short break of roughly 20 blocks**
- Between P1 runs, different behaviours appear:
  - Clean 2A2 / 3A3 / ZZ runs
  - Sometimes just a straight ZZ / 2A2 / 3A3 that flows nicely
  - Sometimes very choppy, short, messy sequences
  - Sometimes a pure alternating 3A3 (indicator P1 might be coming)
  - Sometimes forced breaking of patterns
  - Sometimes a mixture of patterns up to 6A6, then back
- **Not every 7+ activation becomes a long P1 run**

---

## 1.2 Formalizing P1: Real vs False P1

### Definition: Real P1 vs False P1

| Type | Definition | Characteristics |
|------|------------|-----------------|
| **False P1** | 7+ run that does NOT extend significantly | Run ends at 7-8, immediate reversal, market resumes normal alternation |
| **Real P1** | 7+ run that extends to 9+ OR triggers cascading same-direction pressure | Run continues, or after brief pause (1-3 blocks), another long run same direction |

### Recognition Criteria

**FALSE P1 Indicators:**
```
- Run reaches exactly 7 or 8, then reverses
- Reversal block has HIGH pct (70%+) - strong counter-move
- After reversal, run lengths return to normal (1-3 blocks)
- No re-acceleration in same direction within 10 blocks
```

**REAL P1 Indicators:**
```
- Run reaches 9+ blocks
- OR: Run of 7-8, brief pause (1-3 opposite), then another 5+ same direction
- Low pct reversal blocks (weak counters, market still biased)
- Multiple patterns failing in opposite direction
- Escalating pattern formations (2A2 → 3A3 → 4A4 → 5A5)
```

### P1 Lifecycle Phases

```
PHASE 1: PRE-P1 BUILDUP
├── Duration: 10-30 blocks before P1
├── Characteristics:
│   ├── Increasing run lengths (3→4→5→6)
│   ├── Pure alternating 3A3 sequences
│   ├── Patterns start failing in one direction
│   └── Choppy, messy sequences
└── Playability: CAUTION - reduce stake, watch for escalation

PHASE 2: P1 ENTRY (7+ Run)
├── Duration: 7-15+ blocks
├── Characteristics:
│   ├── 7+ consecutive same direction
│   ├── Patterns opposing the trend ALL fail
│   └── High pct moves in trend direction
└── Playability: NO PLAY under main strategy

PHASE 3: P1 PEAK / EXTENSION
├── Duration: Variable (could be 9, 12, 15+ blocks)
├── Characteristics:
│   ├── Run continues beyond 7
│   ├── Brief pauses (1-2 opposite) then resumes
│   └── 5A5, 6A6 patterns forming
└── Playability: NO PLAY or P1-specific strategy only

PHASE 4: P1 BREAK / INITIAL REVERSAL
├── Duration: 3-10 blocks
├── Characteristics:
│   ├── Strong counter-move (high pct opposite)
│   ├── Run of 2-4 opposite direction
│   └── Patterns start forming again
└── Playability: WAIT - confirm reversal

PHASE 5: POST-P1 RECOVERY
├── Duration: 10-30 blocks
├── Characteristics:
│   ├── Run lengths normalize (1-3)
│   ├── ZZ / 2A2 / 3A3 start working again
│   └── Direction balance returns to ~50/50
└── Playability: GRADUAL RE-ENTRY
```

---

## 1.3 Inter-P1 Behaviour Analysis

### Between P1 Runs: State Classification

| State | Description | Characteristics | Playability |
|-------|-------------|-----------------|-------------|
| **CLEAN FLOW** | ZZ/2A2/3A3 working normally | Win rate 60%+, patterns confirm, low churn | PLAY NORMALLY |
| **NICE STRAIGHT** | Single pattern dominates | One pattern (e.g., ZZ) wins repeatedly | PLAY THAT PATTERN |
| **CHOPPY** | Short, messy, unpredictable | Run lengths 1-2-1-1-2-1, no pattern holds | REDUCE STAKE or NO PLAY |
| **ALTERNATING 3A3** | Pure 3-3-3-3 alternation | Sets up higher patterns, P1 warning | PLAY 3A3 BUT WATCH |
| **FORCED BREAKS** | Patterns activate then break | Bait-and-switch territory | B&S STRATEGY |
| **ESCALATION** | 2A2→3A3→4A4→5A5→6A6 | Building toward P1 | REDUCE/EXIT |

### State Transition Diagram

```
                    ┌──────────────┐
                    │  CLEAN FLOW  │
                    │   (Normal)   │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │  CHOPPY  │ │ALTERNATING│ │  FORCED  │
        │          │ │   3A3    │ │  BREAKS  │
        └────┬─────┘ └────┬─────┘ └────┬─────┘
             │            │            │
             │            ▼            │
             │      ┌──────────┐       │
             └─────►│ESCALATION│◄──────┘
                    └────┬─────┘
                         │
                         ▼
                    ┌──────────┐
                    │    P1    │
                    │ (7+ Run) │
                    └────┬─────┘
                         │
                         ▼
                    ┌──────────┐
                    │ RECOVERY │
                    └────┬─────┘
                         │
                         ▼
                    ┌──────────┐
                    │CLEAN FLOW│
                    └──────────┘
```

---

## 1.4 P1 Play Rules by Phase

### PHASE 1: PRE-P1 BUILDUP

**When to Play:**
- If patterns are still confirming (win rate > 55%)
- If run lengths staying ≤ 5
- If no escalation pattern visible

**When NOT to Play:**
- If 3+ patterns have broken in last 10 blocks
- If run lengths increasing (3→4→5→6)
- If pure alternating 3A3 detected (P1 warning)

**Exit Timing:**
- Exit any pattern after 2 consecutive losses
- Exit all patterns if run reaches 6

### PHASE 2: P1 ENTRY (7+ Run)

**When to Play:**
- DO NOT play main strategy
- Optional: P1-specific reversal plays (see below)

**When NOT to Play:**
- Any pattern predicting against the trend
- Any pattern that has been "baited" during buildup

**P1-Specific Play Option:**
```
IF run_length >= 7:
  - Small stake (25-50%) bet on REVERSAL
  - Increase stake slightly at 8, 9, 10+ run
  - Single attempt per run length milestone

IF reversal bet wins:
  - Take profit
  - Wait for confirmation of trend end

IF reversal bet loses:
  - Do NOT chase
  - Wait for next milestone (e.g., 8 if bet at 7)
```

### PHASE 3: P1 PEAK / EXTENSION

**When to Play:**
- Only P1-specific reversal plays
- Stake increases with run length (higher probability of reversal)

**When NOT to Play:**
- Main strategy patterns
- Trend-following (too late)

### PHASE 4: P1 BREAK

**When to Play:**
- WAIT - do not immediately re-enter

**Confirmation Required:**
- At least 2 blocks opposite direction
- High pct on reversal blocks (strong counter)
- Run length of reversal ≥ 2

### PHASE 5: POST-P1 RECOVERY

**When to Play:**
- After 5+ blocks of normalized run lengths
- When fresh pattern activates (one that wasn't baited during P1)
- First 3 trades at 50% stake

**When NOT to Play:**
- If run lengths still volatile
- If same direction pressure resumes
- If patterns that were broken during P1 haven't reset

**Exit Timing:**
- Normal pattern rules apply
- Extra caution: exit on 1st loss (not 2nd) for first 10 blocks

---

## 1.5 P1 Data Collection Requirements

### Per-Block Data (P1-Related)

```typescript
interface P1BlockData {
  blockIndex: number;
  direction: 1 | -1;
  pct: number;
  currentRunLength: number;
  currentRunDirection: 1 | -1;

  // P1 specific
  isP1Active: boolean;
  blocksIntoP1: number;  // 0 if not in P1
  p1Direction: 1 | -1 | null;

  // Run history (last 20)
  recentRunLengths: number[];
  recentRunDirections: (1 | -1)[];

  // Pattern state during P1
  patternsFailingAgainstTrend: PatternName[];
  patternsStillWorking: PatternName[];

  // Escalation tracking
  highestPatternFormed: PatternName;  // 2A2, 3A3, 4A4, etc.
  escalationSequence: PatternName[];  // [2A2, 3A3, 4A4] if escalating
}
```

### Per-P1-Event Data

```typescript
interface P1Event {
  eventId: string;
  startBlockIndex: number;
  endBlockIndex: number;
  direction: 1 | -1;

  // Classification
  type: 'false_p1' | 'real_p1';
  peakRunLength: number;

  // Pre-P1 analysis
  preP1Phase: {
    startBlock: number;
    wasChoppy: boolean;
    wasEscalating: boolean;
    hadAlternating3A3: boolean;
    patternsBroken: PatternName[];
  };

  // During P1
  duringP1: {
    totalBlocks: number;
    pauseCount: number;  // Brief reversals
    avgPctInTrend: number;
    avgPctAgainstTrend: number;
  };

  // Post-P1
  postP1: {
    recoveryBlocks: number;
    firstPatternToRecover: PatternName;
    blocksUntilNormal: number;
  };

  // Hypothetical P1 plays
  hypotheticalPlays: {
    reversalAt7: { wouldWin: boolean; pnl: number };
    reversalAt8: { wouldWin: boolean; pnl: number };
    reversalAt9: { wouldWin: boolean; pnl: number };
  };
}
```

---

# SECTION 2: Bait-and-Switch Sub-Strategy

## 2.1 Authoritative Definition (Per Your Specification)

**Bait-and-Switch is defined PER PATTERN:**

- **Bait** = The pattern ACTIVATES (forms / confirms activation)
- **Switch** = That activation BREAKS (doesn't follow through; flips or fails)
- **Bait-and-Switch** = Repeated activation → break cycles for that specific pattern

**Critical Understanding:**
- Main strategy is NOT VALID during B&S
- We need a SEPARATE sub-strategy to PLAY the B&S behaviour
- Goal: Profit FROM the activation→break cycles, not avoid them

---

## 2.2 Detecting B&S Mode (Per Pattern)

### Detection Criteria

For each pattern independently, track:

```
ACTIVATION = Pattern enters "active" state (observation threshold met)
BREAK = Pattern returns to "observing" state (due to loss/failure)

B&S CYCLE = One activation followed by one break

B&S MODE DETECTION:
- Count activation→break cycles within rolling window
- Window size: Last 30 blocks OR last 5 pattern signals (whichever is longer)
```

### B&S Entry Thresholds

| Cycles in Window | Classification | Action |
|------------------|----------------|--------|
| 0-1 cycles | NORMAL | Main strategy valid |
| 2 cycles | B&S WARNING | Monitor closely |
| 3+ cycles | B&S CONFIRMED | Switch to B&S sub-strategy |

### B&S Detection Algorithm

```typescript
function detectBaitAndSwitch(pattern: PatternName, history: PatternHistory): BnSStatus {
  const window = getRecentCycles(pattern, { blocks: 30, signals: 5 });

  const cycles = window.filter(event =>
    event.type === 'activation_then_break'
  ).length;

  if (cycles >= 3) {
    return { status: 'confirmed', cycleCount: cycles };
  } else if (cycles === 2) {
    return { status: 'warning', cycleCount: cycles };
  } else {
    return { status: 'normal', cycleCount: cycles };
  }
}
```

---

## 2.3 Bait-and-Switch Sub-Strategy Design

### Core Concept

When a pattern is in B&S mode:
- **Do NOT bet on the pattern's activation signal** (it will break)
- **Instead, bet on the BREAK** (the switch)

### B&S Play Rules

```
WHEN PATTERN IS IN B&S MODE:

ON ACTIVATION (Bait):
├── Do NOT place main strategy bet
├── WAIT for the break
└── Log: "Bait detected for {pattern}"

ON BREAK (Switch):
├── The break IS the opportunity
├── Option A: Bet OPPOSITE of what pattern predicted at activation
├── Option B: Bet WITH the direction that caused the break
└── Log: "Switch detected for {pattern}"
```

### B&S Sub-Strategy Options

**Option A: Inverse Activation**

```
CONCEPT: Bet opposite of what the pattern predicted during activation

EXAMPLE:
- 2A2 activates, predicts DOWN
- We wait (don't bet)
- 2A2 breaks (market went UP instead)
- NEXT 2A2 signal: Bet OPPOSITE of its prediction

LOGIC: If pattern is "wrong" repeatedly, inverse should be "right"

RISK: Pattern might suddenly start working again
```

**Option B: Break Direction**

```
CONCEPT: Bet in the direction that CAUSED the break

EXAMPLE:
- 2A2 activates, predicts DOWN
- We wait (don't bet)
- 2A2 breaks because market went UP
- NOW bet UP (the break direction)

LOGIC: The break direction is the "real" market direction

RISK: Market might immediately reverse after break
```

**Option C: Anticipate Next Bait**

```
CONCEPT: Once you see the switch, bet that the NEXT activation will also fail

EXAMPLE:
- 2A2 activates (bait #1), breaks (switch #1)
- 2A2 activates again (bait #2)
- Immediately bet OPPOSITE of 2A2's prediction
- Expecting switch #2

LOGIC: B&S patterns repeat; next bait will likely also switch

RISK: Pattern might finally confirm on this activation
```

### Recommended B&S Sub-Strategy

**HYBRID APPROACH:**

```
PHASE 1: DETECTION
- Track activation→break cycles per pattern
- When cycle count ≥ 3 in window: Pattern enters B&S mode

PHASE 2: FIRST B&S PLAY (After 3rd cycle confirmed)
- On NEXT activation of this pattern:
  - Do NOT bet the main signal
  - Place INVERSE bet (opposite of pattern's prediction)
  - Stake: 50% of normal
  - Label: "B&S_PLAY_1"

PHASE 3: CONTINUE B&S PLAYS
- If B&S_PLAY_1 wins:
  - Continue inverse betting on this pattern
  - Increase stake to 75%

- If B&S_PLAY_1 loses:
  - Pattern might be exiting B&S mode
  - Next signal: 25% stake inverse (cautious)
  - If loses again: Exit B&S mode for this pattern

PHASE 4: EXIT B&S MODE
- Exit when:
  - Pattern confirms 2 consecutive activations (no breaks)
  - OR: 2 consecutive B&S plays lose
  - OR: Pattern goes 15+ blocks without new activation
```

---

## 2.4 B&S and Main Strategy Coexistence

### State Machine Per Pattern

```
           ┌─────────────────────────────────────────┐
           │                                         │
           ▼                                         │
    ┌──────────────┐                                 │
    │    NORMAL    │──── 2 cycles ────►┌─────────┐  │
    │(Main Strategy)│                   │ WARNING │  │
    └──────┬───────┘◄── confirms 2x ───└────┬────┘  │
           │                                 │       │
           │                            3+ cycles    │
           │                                 │       │
           │                                 ▼       │
           │                          ┌──────────┐  │
           │                          │   B&S    │  │
           │                          │  MODE    │──┘
           │                          └────┬─────┘
           │                               │
           │                         2 B&S losses
           │                         or 2 confirms
           │                               │
           └───────────────────────────────┘
```

### Multi-Pattern Handling

```typescript
interface PatternStrategyState {
  pattern: PatternName;
  mode: 'normal' | 'warning' | 'bns';

  // For normal mode
  mainStrategyActive: boolean;

  // For B&S mode
  bnsActivationsCount: number;
  bnsBreaksCount: number;
  bnsCycleCount: number;
  bnsPlaysAttempted: number;
  bnsPlaysWon: number;

  // Transition tracking
  lastModeChange: number;  // block index
  modeChangeReason: string;
}

// Engine logic
function getStrategyForPattern(pattern: PatternName): Strategy {
  const state = patternStates[pattern];

  switch (state.mode) {
    case 'normal':
      return mainStrategy;
    case 'warning':
      return mainStrategyWithCaution;  // Reduced stake
    case 'bns':
      return baitAndSwitchStrategy;
  }
}
```

### Transition Rules

**Normal → Warning:**
- 2 activation→break cycles detected
- Action: Reduce stake to 50%, monitor

**Warning → B&S Mode:**
- 3rd activation→break cycle detected
- Action: Switch to B&S sub-strategy

**Warning → Normal:**
- Pattern confirms 2 activations without breaking
- Action: Return to main strategy

**B&S Mode → Normal:**
- Pattern confirms 2 consecutive activations
- OR: 2 consecutive B&S plays lose
- OR: 15 blocks without pattern signal
- Action: Reset, return to main strategy

**B&S Mode → Warning:**
- 1 B&S play loses
- Action: Reduce to warning, cautious plays

---

## 2.5 B&S Data Collection Requirements

### Per-Pattern B&S Tracking

```typescript
interface PatternBnSData {
  pattern: PatternName;

  // Cycle tracking
  activations: ActivationEvent[];
  breaks: BreakEvent[];
  cycles: BnSCycle[];

  // Current state
  currentMode: 'normal' | 'warning' | 'bns';
  cyclesInWindow: number;

  // B&S play results
  bnsPlays: BnSPlay[];
  bnsWinRate: number;
  bnsPnL: number;
}

interface ActivationEvent {
  blockIndex: number;
  direction: 1 | -1;
  predictedDirection: 1 | -1;
  activationPct: number;  // Cumulative profit that triggered activation
  timestamp: string;
}

interface BreakEvent {
  blockIndex: number;
  activationBlockIndex: number;  // Links to which activation broke
  breakReason: 'loss' | 'opposite_direction' | 'manual';
  breakPct: number;  // The pct of the block that caused break
  actualDirection: 1 | -1;
  predictedDirection: 1 | -1;  // What pattern predicted
  timestamp: string;
}

interface BnSCycle {
  cycleId: string;
  pattern: PatternName;
  activation: ActivationEvent;
  break: BreakEvent;
  cycleDuration: number;  // Blocks from activation to break

  // Hypothetical analysis
  hypotheticalInversePnL: number;  // If we had bet inverse
  hypotheticalBreakDirectionPnL: number;  // If we had bet break direction
}

interface BnSPlay {
  playId: string;
  pattern: PatternName;
  blockIndex: number;

  strategy: 'inverse' | 'break_direction' | 'anticipate_next';
  predictedDirection: 1 | -1;
  actualDirection: 1 | -1;

  stake: number;
  pct: number;
  isWin: boolean;
  pnl: number;

  cycleNumber: number;  // Which B&S cycle triggered this play
}
```

### Aggregated B&S Analytics

```typescript
interface BnSAnalytics {
  // Per pattern
  patternStats: Record<PatternName, {
    totalCycles: number;
    avgCycleDuration: number;
    avgBlocksBetweenCycles: number;

    // Hypothetical strategy performance
    inverseWinRate: number;
    inversePnL: number;
    breakDirectionWinRate: number;
    breakDirectionPnL: number;
    anticipateNextWinRate: number;
    anticipateNextPnL: number;

    // Actual B&S plays
    actualBnsPlays: number;
    actualBnsWinRate: number;
    actualBnsPnL: number;
  }>;

  // Session level
  sessionStats: {
    totalBnsCycles: number;
    patternsInBnsMode: PatternName[];
    bnsModeDuration: number;  // Total blocks in B&S mode
    bnsPlaysPnL: number;
  };
}
```

---

# SECTION 3: Early Detection Framework

## 3.1 State Detection System

### Market States

```
┌─────────────────────────────────────────────────────────────────┐
│                        MARKET STATES                            │
├─────────────────────────────────────────────────────────────────┤
│  CLEAN         │ Patterns working, normal alternation           │
│  CHOPPY        │ Short runs, no pattern holds, messy            │
│  ESCALATING    │ Run lengths increasing, P1 building            │
│  P1_ACTIVE     │ 7+ run in progress                             │
│  P1_RECOVERY   │ Just exited P1, normalizing                    │
│  BNS_DOMINANT  │ Multiple patterns in B&S mode                  │
└─────────────────────────────────────────────────────────────────┘
```

### State Detection Indicators

#### CLEAN State

```typescript
const CLEAN_INDICATORS = {
  runLengthAvg: { max: 2.5 },          // Average run length ≤ 2.5
  runLengthMax: { max: 5 },            // No run > 5 in window
  patternWinRate: { min: 0.55 },       // Overall pattern win rate ≥ 55%
  patternsInBnS: { max: 1 },           // At most 1 pattern in B&S
  directionBalance: { min: 0.4, max: 0.6 },  // ~50/50 direction split
};
```

#### CHOPPY State

```typescript
const CHOPPY_INDICATORS = {
  runLengthAvg: { max: 1.5 },          // Very short runs
  consecutiveOnes: { min: 5 },         // 5+ runs of length 1
  patternWinRate: { max: 0.50 },       // Win rate ≤ 50%
  patternChurn: { min: 3 },            // 3+ patterns broken in window
  noDominantPattern: true,             // No pattern winning consistently
};
```

#### ESCALATING State (Pre-P1)

```typescript
const ESCALATING_INDICATORS = {
  runLengthTrend: 'increasing',        // Runs getting longer
  recentRunLengths: [3, 4, 5, 6],      // Escalation visible
  highestPattern: { min: '4A4' },      // 4A4 or higher forming
  singleDirectionBias: { min: 0.65 },  // 65%+ one direction
  alternating3A3: true,                // Pure 3-3-3 pattern
};
```

#### P1_ACTIVE State

```typescript
const P1_ACTIVE_INDICATORS = {
  currentRunLength: { min: 7 },        // 7+ run in progress
  // That's the primary indicator
};
```

#### P1_RECOVERY State

```typescript
const P1_RECOVERY_INDICATORS = {
  justExitedP1: true,                  // P1 ended in last 10 blocks
  runLengthsNormalizing: true,         // Runs returning to 1-3
  directionBalance: 'improving',       // Moving toward 50/50
};
```

#### BNS_DOMINANT State

```typescript
const BNS_DOMINANT_INDICATORS = {
  patternsInBnS: { min: 3 },           // 3+ patterns in B&S mode
  mainStrategyWinRate: { max: 0.40 },  // Main strategy failing
  cycleFrequency: { min: 0.5 },        // 1 cycle per 2 blocks avg
};
```

---

## 3.2 State Transition Detection

### Transition Matrix

| From State | To State | Trigger |
|------------|----------|---------|
| CLEAN | CHOPPY | Win rate drops < 50%, run lengths erratic |
| CLEAN | ESCALATING | Run length trend increasing, 5+ run detected |
| CLEAN | BNS_DOMINANT | 3+ patterns enter B&S mode |
| CHOPPY | CLEAN | Win rate recovers > 55%, stability |
| CHOPPY | ESCALATING | Run lengths start increasing |
| CHOPPY | BNS_DOMINANT | 3+ patterns cycling |
| ESCALATING | P1_ACTIVE | Run reaches 7 |
| ESCALATING | CLEAN | Run lengths normalize without P1 |
| P1_ACTIVE | P1_RECOVERY | Run ends (direction changes) |
| P1_RECOVERY | CLEAN | 10+ blocks stable, patterns working |
| P1_RECOVERY | ESCALATING | Another long run building |
| BNS_DOMINANT | CLEAN | B&S cycles stop, patterns confirm |

### State Detection Algorithm

```typescript
function detectMarketState(
  currentState: MarketState,
  blockData: BlockData,
  patternStates: PatternStates,
  runHistory: RunHistory
): MarketState {

  // Check P1 first (highest priority)
  if (runHistory.currentRunLength >= 7) {
    return 'P1_ACTIVE';
  }

  // Check if just exited P1
  if (currentState === 'P1_ACTIVE' && runHistory.currentRunLength < 7) {
    return 'P1_RECOVERY';
  }

  // Check recovery completion
  if (currentState === 'P1_RECOVERY') {
    if (isRecoveryComplete(runHistory, patternStates)) {
      return 'CLEAN';
    }
    if (isEscalating(runHistory)) {
      return 'ESCALATING';
    }
    return 'P1_RECOVERY';
  }

  // Check B&S dominance
  const patternsInBnS = countPatternsInBnS(patternStates);
  if (patternsInBnS >= 3) {
    return 'BNS_DOMINANT';
  }

  // Check escalation
  if (isEscalating(runHistory)) {
    return 'ESCALATING';
  }

  // Check choppy
  if (isChoppy(runHistory, patternStates)) {
    return 'CHOPPY';
  }

  // Default to clean
  return 'CLEAN';
}
```

---

## 3.3 Strategy Selection by State

| State | Main Strategy | B&S Strategy | P1 Strategy | Stake |
|-------|--------------|--------------|-------------|-------|
| CLEAN | ACTIVE | Per pattern | N/A | 100% |
| CHOPPY | REDUCED | Per pattern | N/A | 50% |
| ESCALATING | CAUTION | Per pattern | PREPARE | 50% |
| P1_ACTIVE | INACTIVE | INACTIVE | ACTIVE | 25-50% |
| P1_RECOVERY | GRADUAL | Per pattern | N/A | 50% |
| BNS_DOMINANT | INACTIVE | ACTIVE | N/A | 75% |

### Strategy Selection Logic

```typescript
function selectStrategy(
  marketState: MarketState,
  pattern: PatternName,
  patternState: PatternState
): StrategyDecision {

  // P1 Active - special handling
  if (marketState === 'P1_ACTIVE') {
    return {
      mainStrategy: false,
      bnsStrategy: false,
      p1Strategy: true,
      stakeMultiplier: 0.25,
      notes: 'P1 active - reversal plays only'
    };
  }

  // B&S Dominant - only B&S plays
  if (marketState === 'BNS_DOMINANT') {
    if (patternState.mode === 'bns') {
      return {
        mainStrategy: false,
        bnsStrategy: true,
        p1Strategy: false,
        stakeMultiplier: 0.75,
        notes: 'B&S mode for this pattern'
      };
    } else {
      return {
        mainStrategy: false,
        bnsStrategy: false,
        p1Strategy: false,
        stakeMultiplier: 0,
        notes: 'Pattern not in B&S, market too chaotic'
      };
    }
  }

  // Pattern-specific B&S handling
  if (patternState.mode === 'bns') {
    return {
      mainStrategy: false,
      bnsStrategy: true,
      p1Strategy: false,
      stakeMultiplier: 0.5,
      notes: 'Pattern in B&S mode'
    };
  }

  // Escalating - caution
  if (marketState === 'ESCALATING') {
    return {
      mainStrategy: true,
      bnsStrategy: patternState.mode === 'bns',
      p1Strategy: false,
      stakeMultiplier: 0.5,
      notes: 'Escalating toward P1 - reduced stake'
    };
  }

  // Choppy - reduced
  if (marketState === 'CHOPPY') {
    return {
      mainStrategy: true,
      bnsStrategy: patternState.mode === 'bns',
      p1Strategy: false,
      stakeMultiplier: 0.5,
      notes: 'Choppy market - reduced stake'
    };
  }

  // Recovery - gradual
  if (marketState === 'P1_RECOVERY') {
    return {
      mainStrategy: true,
      bnsStrategy: patternState.mode === 'bns',
      p1Strategy: false,
      stakeMultiplier: 0.5,
      notes: 'Post-P1 recovery - gradual re-entry'
    };
  }

  // Clean - normal
  return {
    mainStrategy: true,
    bnsStrategy: false,
    p1Strategy: false,
    stakeMultiplier: 1.0,
    notes: 'Normal market conditions'
  };
}
```

---

## 3.4 Early Warning System

### Warning Levels

```
LEVEL 0: ALL CLEAR
├── Market state: CLEAN
├── No patterns in B&S warning
├── Run lengths normal
└── Action: Play normally

LEVEL 1: MONITOR
├── Market state: CLEAN but 1-2 patterns in B&S warning
├── OR: Run lengths slightly elevated (avg 3+)
└── Action: Continue but watch closely

LEVEL 2: CAUTION
├── Market state: CHOPPY or ESCALATING
├── OR: 2+ patterns in B&S mode
├── OR: Run of 5-6 detected
└── Action: Reduce stake 50%

LEVEL 3: WARNING
├── Market state: ESCALATING with run of 6
├── OR: 3+ patterns in B&S mode
├── OR: Win rate < 45% last 10 trades
└── Action: Consider stopping or B&S only

LEVEL 4: CRITICAL
├── Market state: P1_ACTIVE or BNS_DOMINANT
├── OR: 5+ consecutive losses
├── OR: Drawdown > threshold
└── Action: Stop main strategy, special plays only
```

### Warning Score Calculation

```typescript
interface WarningScore {
  level: 0 | 1 | 2 | 3 | 4;
  score: number;  // 0-100
  factors: {
    runLengthFactor: number;      // 0-25
    bnsPatternFactor: number;     // 0-25
    winRateFactor: number;        // 0-25
    escalationFactor: number;     // 0-25
  };
  recommendations: string[];
}

function calculateWarningScore(
  marketState: MarketState,
  patternStates: PatternStates,
  runHistory: RunHistory,
  recentTrades: Trade[]
): WarningScore {

  let score = 0;
  const factors = {
    runLengthFactor: 0,
    bnsPatternFactor: 0,
    winRateFactor: 0,
    escalationFactor: 0
  };

  // Run length factor (0-25)
  const avgRunLength = average(runHistory.recentLengths);
  const maxRunLength = max(runHistory.recentLengths);
  factors.runLengthFactor = Math.min(25,
    (avgRunLength - 2) * 5 + (maxRunLength >= 6 ? 10 : 0)
  );

  // B&S pattern factor (0-25)
  const patternsInBnS = countPatternsInBnS(patternStates);
  const patternsInWarning = countPatternsInWarning(patternStates);
  factors.bnsPatternFactor = Math.min(25,
    patternsInBnS * 8 + patternsInWarning * 3
  );

  // Win rate factor (0-25)
  const recentWinRate = calculateWinRate(recentTrades.slice(-10));
  factors.winRateFactor = Math.min(25,
    Math.max(0, (0.55 - recentWinRate) * 50)
  );

  // Escalation factor (0-25)
  if (marketState === 'ESCALATING') {
    factors.escalationFactor = 15;
  }
  if (marketState === 'P1_ACTIVE') {
    factors.escalationFactor = 25;
  }
  if (isRunLengthTrendIncreasing(runHistory)) {
    factors.escalationFactor += 10;
  }
  factors.escalationFactor = Math.min(25, factors.escalationFactor);

  // Total score
  score = factors.runLengthFactor + factors.bnsPatternFactor +
          factors.winRateFactor + factors.escalationFactor;

  // Determine level
  let level: 0 | 1 | 2 | 3 | 4;
  if (score < 15) level = 0;
  else if (score < 30) level = 1;
  else if (score < 50) level = 2;
  else if (score < 70) level = 3;
  else level = 4;

  // Generate recommendations
  const recommendations = generateRecommendations(level, factors, marketState);

  return { level, score, factors, recommendations };
}
```

---

## 3.5 Complete Data Collection Schema

### Block-Level Data

```typescript
interface BlockRecord {
  // Core block data
  blockIndex: number;
  timestamp: string;
  direction: 1 | -1;
  pct: number;

  // Run context
  run: {
    currentLength: number;
    currentDirection: 1 | -1;
    recentLengths: number[];  // Last 20
    avgLength: number;
    maxLengthInWindow: number;
  };

  // Market state
  marketState: {
    current: MarketState;
    previous: MarketState;
    warningLevel: 0 | 1 | 2 | 3 | 4;
    warningScore: number;
  };

  // P1 tracking
  p1: {
    isActive: boolean;
    blocksIntoP1: number;
    p1Direction: 1 | -1 | null;
    isEscalating: boolean;
    escalationSequence: PatternName[];
  };

  // Pattern states snapshot
  patternStates: Record<PatternName, {
    state: 'observing' | 'active';
    mode: 'normal' | 'warning' | 'bns';
    cyclesInWindow: number;
    lastActivationBlock: number;
    lastBreakBlock: number;
  }>;

  // Labels/tags for analysis
  tags: string[];  // e.g., ['pre_p1', 'choppy', 'bns_candidate']
}
```

### Pattern-Level Data

```typescript
interface PatternRecord {
  pattern: PatternName;
  blockIndex: number;
  timestamp: string;

  // Signal data
  signal: {
    type: 'formation' | 'activation' | 'break' | 'signal';
    direction: 1 | -1;
    predictedDirection: 1 | -1;
    confidence: number;
    cumulativeProfit: number;
  };

  // B&S tracking
  bns: {
    currentMode: 'normal' | 'warning' | 'bns';
    cycleCount: number;
    lastCycleBlock: number;
    activationsInWindow: number;
    breaksInWindow: number;
  };

  // If this is a trade
  trade?: {
    tradeId: string;
    strategy: 'main' | 'bns' | 'p1';
    stake: number;
    actualDirection: 1 | -1;
    isWin: boolean;
    pnl: number;
  };

  // Hypothetical tracking (for analysis)
  hypothetical: {
    mainStrategyPnL: number;
    inverseStrategyPnL: number;
    breakDirectionPnL: number;
  };
}
```

### Session-Level Summary

```typescript
interface SessionSummary {
  sessionId: string;
  startTime: string;
  endTime: string;
  totalBlocks: number;

  // Overall results
  results: {
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number;
    totalPnL: number;
  };

  // By strategy
  byStrategy: {
    main: { trades: number; wins: number; pnl: number };
    bns: { trades: number; wins: number; pnl: number };
    p1: { trades: number; wins: number; pnl: number };
  };

  // State distribution
  stateDistribution: Record<MarketState, {
    blocksInState: number;
    percentageOfSession: number;
    tradesInState: number;
    winRateInState: number;
    pnlInState: number;
  }>;

  // P1 events
  p1Events: P1Event[];

  // B&S analysis per pattern
  bnsAnalysis: Record<PatternName, {
    totalCycles: number;
    timeInBnsMode: number;
    bnsPlays: number;
    bnsWinRate: number;
    bnsPnL: number;
    hypotheticalInversePnL: number;
  }>;

  // Warning system performance
  warningSystemAnalysis: {
    timesLevel3Triggered: number;
    timesLevel4Triggered: number;
    accuracyOfWarnings: number;  // Did warnings precede losses?
    missedWarnings: number;  // Losses without prior warning
  };
}
```

---

# SECTION 4: Research Plan

## 4.1 Phase 1: Data Collection Enhancement

**Objective**: Implement comprehensive logging to capture all required data.

**Tasks**:
1. Add BlockRecord logging for every block
2. Add PatternRecord logging for every pattern event
3. Implement P1Event detection and logging
4. Implement B&S cycle detection and logging
5. Add market state classification
6. Add warning score calculation

**Output**:
- Enhanced session files with full schema
- Ability to replay and analyze historical sessions

## 4.2 Phase 2: Historical Analysis

**Objective**: Analyze existing session data to validate hypotheses.

**Research Questions**:
1. What % of 7-runs are "real P1" vs "false P1"?
2. What's the average duration between P1 events?
3. For each pattern, what's the B&S cycle frequency?
4. What's the hypothetical win rate of inverse strategy during B&S?
5. How accurate is the warning score at predicting losses?

**Tasks**:
1. Parse all existing sessions with new schema
2. Calculate P1 statistics
3. Calculate B&S statistics per pattern
4. Backtest inverse strategy on B&S periods
5. Backtest P1 reversal strategy
6. Validate warning score thresholds

## 4.3 Phase 3: Strategy Refinement

**Objective**: Refine strategies based on data analysis.

**Tasks**:
1. Tune B&S detection thresholds (cycles needed, window size)
2. Tune P1 entry thresholds (run length for reversal plays)
3. Tune warning score weights and thresholds
4. Determine optimal stake multipliers for each state
5. Validate state transition rules

## 4.4 Phase 4: Implementation

**Objective**: Implement refined strategies in Ghost Evaluator.

**Tasks**:
1. Implement market state detection
2. Implement pattern-level B&S tracking
3. Implement B&S sub-strategy
4. Implement P1 play option
5. Implement warning system UI
6. Implement strategy selection logic

## 4.5 Phase 5: Live Testing

**Objective**: Test strategies in live conditions.

**Tasks**:
1. Run with enhanced logging
2. Compare predicted states to actual outcomes
3. Measure strategy performance by state
4. Iterate on thresholds and rules

---

# SECTION 5: Algorithm Outlines

## 5.1 Main Engine Loop (Enhanced)

```typescript
async function processBlock(block: Block) {
  // 1. Update run tracking
  updateRunHistory(block);

  // 2. Update pattern states
  for (const pattern of ALL_PATTERNS) {
    updatePatternState(pattern, block);
    updatePatternBnSTracking(pattern);
  }

  // 3. Detect market state
  const marketState = detectMarketState();

  // 4. Calculate warning score
  const warning = calculateWarningScore();

  // 5. Log block data
  logBlockRecord(block, marketState, warning);

  // 6. Make trading decision
  const decision = makeDecision(marketState, warning);

  // 7. Execute if applicable
  if (decision.shouldTrade) {
    executeTrade(decision);
  }

  // 8. Log pattern events
  logPatternRecords();
}
```

## 5.2 Decision Making (Enhanced)

```typescript
function makeDecision(
  marketState: MarketState,
  warning: WarningScore
): TradingDecision {

  // Check if any pattern has a signal
  const signals = getActiveSignals();

  if (signals.length === 0) {
    return { shouldTrade: false, reason: 'No signals' };
  }

  for (const signal of signals) {
    const patternState = getPatternState(signal.pattern);
    const strategy = selectStrategy(marketState, signal.pattern, patternState);

    // Determine if we should trade this signal
    if (strategy.mainStrategy && patternState.mode === 'normal') {
      return {
        shouldTrade: true,
        strategy: 'main',
        pattern: signal.pattern,
        direction: signal.predictedDirection,
        stake: BASE_STAKE * strategy.stakeMultiplier,
        reason: strategy.notes
      };
    }

    if (strategy.bnsStrategy && patternState.mode === 'bns') {
      return {
        shouldTrade: true,
        strategy: 'bns',
        pattern: signal.pattern,
        direction: signal.predictedDirection * -1,  // INVERSE
        stake: BASE_STAKE * strategy.stakeMultiplier,
        reason: 'B&S inverse play'
      };
    }

    if (strategy.p1Strategy && marketState === 'P1_ACTIVE') {
      const runLength = getCurrentRunLength();
      if (runLength >= P1_PLAY_THRESHOLD) {
        return {
          shouldTrade: true,
          strategy: 'p1',
          pattern: null,
          direction: getCurrentRunDirection() * -1,  // Reversal
          stake: BASE_STAKE * strategy.stakeMultiplier,
          reason: `P1 reversal at run ${runLength}`
        };
      }
    }
  }

  return { shouldTrade: false, reason: 'No valid strategy for current signals' };
}
```

## 5.3 B&S Tracking Per Pattern

```typescript
function updatePatternBnSTracking(pattern: PatternName) {
  const state = patternStates[pattern];
  const history = patternHistory[pattern];

  // Check for new activation
  if (state.justActivated) {
    history.activations.push({
      blockIndex: currentBlock,
      direction: state.direction,
      predictedDirection: state.predictedDirection,
      activationPct: state.cumulativeProfit,
      timestamp: new Date().toISOString()
    });
    state.justActivated = false;
  }

  // Check for new break
  if (state.justBroke) {
    const lastActivation = history.activations[history.activations.length - 1];

    history.breaks.push({
      blockIndex: currentBlock,
      activationBlockIndex: lastActivation.blockIndex,
      breakReason: state.breakReason,
      breakPct: currentBlock.pct,
      actualDirection: currentBlock.direction,
      predictedDirection: lastActivation.predictedDirection,
      timestamp: new Date().toISOString()
    });

    // Record cycle
    history.cycles.push({
      cycleId: generateId(),
      pattern: pattern,
      activation: lastActivation,
      break: history.breaks[history.breaks.length - 1],
      cycleDuration: currentBlock - lastActivation.blockIndex,
      hypotheticalInversePnL: calculateHypotheticalInverse(lastActivation, currentBlock),
      hypotheticalBreakDirectionPnL: calculateHypotheticalBreakDirection(currentBlock)
    });

    state.justBroke = false;
  }

  // Update cycle count in window
  const cyclesInWindow = history.cycles.filter(c =>
    c.activation.blockIndex >= currentBlock - BNS_WINDOW_SIZE
  ).length;

  // Update mode
  if (cyclesInWindow >= 3 && state.mode !== 'bns') {
    state.mode = 'bns';
    logModeChange(pattern, 'bns', `${cyclesInWindow} cycles detected`);
  } else if (cyclesInWindow === 2 && state.mode === 'normal') {
    state.mode = 'warning';
    logModeChange(pattern, 'warning', '2 cycles detected');
  }

  // Check for exit from B&S
  if (state.mode === 'bns') {
    if (state.consecutiveConfirmations >= 2) {
      state.mode = 'normal';
      logModeChange(pattern, 'normal', '2 consecutive confirmations');
    }
  }
}
```

---

*Document Version: 1.0*
*Created: 2025-12-09*
*Status: Research & Design Phase*
*Ready for: Data Collection Implementation*
