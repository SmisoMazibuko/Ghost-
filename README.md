# Ghost Evaluator v15.3

A TypeScript-based pattern detection and auto-betting evaluation system, designed for terminal execution and easy integration.

## Architecture

```
ghost-evaluator/
├── src/
│   ├── types/           # Type definitions
│   │   └── index.ts     # All TypeScript interfaces and types
│   ├── core/            # Core configuration
│   │   └── config.ts    # Configuration management
│   ├── patterns/        # Pattern detection modules
│   │   ├── detector.ts  # Pattern detection logic
│   │   ├── lifecycle.ts # Pattern state management
│   │   └── index.ts     # Module exports
│   ├── engine/          # Core evaluation engine
│   │   ├── state.ts     # Game state management
│   │   ├── reaction.ts  # Prediction and trading logic
│   │   └── index.ts     # Module exports
│   ├── session/         # Session management
│   │   ├── manager.ts   # Session persistence
│   │   └── index.ts     # Module exports
│   ├── cli/             # Command-line interface
│   │   ├── commands.ts  # CLI command handlers
│   │   └── index.ts     # CLI entry point
│   ├── utils/           # Utility functions
│   │   ├── logger.ts    # Logging system
│   │   └── index.ts     # Module exports
│   └── index.ts         # Main entry point
├── config/
│   └── default.json     # Default configuration
├── data/
│   ├── sessions/        # Saved sessions
│   └── logs/            # Log files
├── tests/
│   ├── unit/            # Unit tests
│   └── integration/     # Integration tests
├── package.json
├── tsconfig.json
└── README.md
```

## Installation

```bash
# Clone or navigate to the project
cd ghost-evaluator

# Install dependencies
npm install

# Build the project
npm run build
```

## Usage

### CLI Mode

```bash
# Start the interactive CLI
npm start

# Or with ts-node for development
npm run dev

# With custom config
npm start -- ./config/custom.json
```

### CLI Commands

| Command | Description |
|---------|-------------|
| `g <pct>` or `r <pct>` | Add a block (green/red with percentage) |
| `status` | Show current session status |
| `health` | Show detailed session health report |
| `pause` | Show pause status for all systems |
| `patterns` | Show pattern states |
| `trades` | Show trade history |
| `blocks` | Show block sequence |
| `undo` | Remove last block |
| `clear` | Clear current session |
| `save [path]` | Save session to file |
| `load <path>` | Load session from file |
| `list` | List saved sessions |
| `analytics` | Show cycle analytics |
| `help` | Show help |
| `exit` | Exit the evaluator |

### Programmatic Usage

```typescript
import {
  createSessionManager,
  createGameStateEngine,
  createReactionEngine
} from 'ghost-evaluator';

// Create a session manager
const session = createSessionManager({
  config: {
    dailyTarget: 2000,
    betAmount: 200,
  }
});

// Get the reaction engine
const reaction = session.getReactionEngine();

// Process blocks
const result = reaction.processBlock(1, 65);  // Green, 65%
console.log(result.prediction);

// Or use individual components
const gameState = createGameStateEngine();
const reactionEngine = createReactionEngine(gameState);

gameState.addBlock(1, 65);
const prediction = reactionEngine.predictNext();
```

## Configuration

Configuration is stored in `config/default.json`:

```json
{
  "evaluator": {
    "neutralBand": 0.05,
    "dailyTarget": 2000,
    "betAmount": 200,
    "singleProfitThreshold": 70,
    "cumulativeProfitThreshold": 100,
    "p1ConsecutiveThreshold": 7
  },
  "patterns": {
    "enabled": ["2A2", "Anti2A2", "3A3", "Anti3A3", "4A4", "5A5", "AP5", "OZ", "ZZ", "AntiZZ"]
  },
  "logging": {
    "level": "info",
    "console": true,
    "file": true,
    "filePath": "./data/logs/evaluator.log"
  },
  "session": {
    "autoSave": true,
    "autoSaveInterval": 5000,
    "sessionDir": "./data/sessions"
  }
}
```

## Patterns

The system recognizes 18 patterns. All patterns require 70% threshold for activation.

### Run Length Patterns (nAn)

| Pattern | Trigger | Prediction |
|---------|---------|------------|
| 2A2 | Run length = 2 | Opposite |
| Anti2A2 | Run length = 2 | Same |
| 3A3 | Run length = 3 | Opposite |
| Anti3A3 | Run length = 3 | Same |
| 4A4 | Run length = 4 | Opposite |
| Anti4A4 | Run length = 4 | Same |
| 5A5 | Run length = 5 | Opposite |
| Anti5A5 | Run length = 5 | Same |
| 6A6 | Run length = 6 | Opposite |
| Anti6A6 | Run length = 6 | Same |

### Complex Patterns

#### AP5 (Alternating Pattern 5)
```
Activation:
G G → R R R → AP5 ACTIVATES (on 3rd R, check 70% on 2nd R)
└─┘   └───┘
 2+    3+ (confirm on 3rd block)

Play (when active):
... R R R → G [signal] → Play G (predict 2nd block)
    └───┘   │
     3+     1st block triggers, predict 2nd same direction

Break:
... G G R [next] → AP5 BREAKS (flip with ≤2 blocks)
    └─┘
     2 blocks
```
- **Activation**: 2+ same → on 3rd block of opposite run (70% on 2nd block) → ACTIVATES
- **Signal**: Only when active; previous 3+ → flip → predict 2nd block continuation
- **Break**: When flip happens with 2 or fewer blocks
- **Continuous**: Keeps playing after every 3+ flip

#### OZ (Opposite Zone)
```
Activation:
G G → R → G G G → OZ ACTIVATES (on 3rd G, check 70% on 1st G)
└─┘   │   └───┘
 1+   1    3+ flip back (confirm on 3rd block)

Play (when active):
G G G → R → [G] predict flip back
└───┘   │    ↑
 any    1    PLAY

Break:
G G G → R → G G → R → OZ BREAKS (flip back < 3 blocks)
            └─┘
             2 blocks
```
- **Activation**: 1+ same → single opposite → on 3rd block of flip back (70% on 1st block) → ACTIVATES
- **Signal**: Only when active; single opposite → predict flip back
- **Break**: When flip back is less than 3 blocks
- **Continuous**: Keeps playing after every single → flip back

#### ZZ (Zig-Zag)
```
G G R G R G R [signal] → predict G (alternation continues)
└─┘ │ │ │ │ │
 2+ └─┴─┴─┴─┘ 3+ consecutive singles (alternation)
```
- **Trigger**: Indicator (2+) followed by **3+ consecutive singles**
- **Play**: Opposite of current (alternation continues)
- **Activation**: Immediately on first detection (no 70% required)
- **On Loss**: If lastRunProfit > 0, stay active. If ≤ 0, switch to AntiZZ

#### AntiZZ
- **Trigger**: Same as ZZ (indicator + 3+ singles)
- **Play**: Same as current (alternation breaks)
- **Activation**: ONLY when ZZ becomes unprofitable (never through observation)
- **On Loss**: If lastRunProfit > 0, stay active. If ≤ 0, switch back to ZZ

#### PP (Ping-Pong)
```
G G G G R G G R G G [signal] → Play R
├─────┤ │ ├┤ │ ├┤
Indicator 1  2 1  2  → 1-2-1-2 rhythm established
```
- **Trigger**: Indicator (3+) followed by 1-2-1-2 rhythm
- **Play**: Opposite (rhythm continues)

#### AntiPP
- Same trigger as PP
- **Play**: Same direction (rhythm breaks)

#### ST (Street)
```
G G G G G R R G G R R [signal] → Play G
├───────┤ ├┤ ├┤ ├┤
Indicator  2  2  2  → 2-2-2 rhythm established
```
- **Trigger**: Indicator (3+) followed by 2-2-2 rhythm
- **Play**: Opposite (new double starts)

#### AntiST
- Same trigger as ST
- **Play**: Same direction (rhythm breaks)

## Pattern Lifecycle

1. **Observing**: Pattern is tracked but no bets placed
2. **Active**: Pattern has proven profitable, auto-bets are placed
3. **Broken**: Pattern lost while active, resets to observing

### Standard Activation (most patterns):
- Single result ≥70% profit, OR
- Cumulative observation profit ≥100%

### Special Rules:
- **ZZ**: Activates immediately on first detection (no 70% required)
- **AntiZZ**: Never activates through observation; only activates when ZZ becomes unprofitable
- **ZZ/AntiZZ Switching**: Based on lastRunProfit - if profitable (> 0), stay active; if not (≤ 0), switch to opposite
- **AP5**: Activates on 3rd block of opposite run (70% on 2nd block); breaks when flip with ≤2 blocks
- **OZ**: Activates on 3rd block of flip back (70% on 1st block); breaks when flip back < 3 blocks

## Trading Systems

The evaluator uses three independent trading systems:

| System | Description | Patterns |
|--------|-------------|----------|
| **Pocket** | ZZ/AntiZZ continuous betting | ZZ, AntiZZ |
| **Bucket** | 3-bucket pattern management | XAX (2A2-6A6), OZ, PP and Anti variants |
| **Same Direction** | Run continuation betting | N/A (direction-based) |

Each system operates independently and has its own pause tracking.

## Pause System

The pause system provides profit/loss protection with independent tracking per system.

### Pause Types

| Type | Trigger | Duration | Affects |
|------|---------|----------|---------|
| **STOP_GAME** | -1000 drawdown OR -500 actual loss | Permanent | ALL systems |
| **MAJOR_PAUSE** | Every -300 drawdown milestone | 10 blocks | Per-system only |
| **MINOR_PAUSE** | 2 consecutive losses | 3 blocks | Per-system only |

### Key Points

- **Pocket (ZZ/AntiZZ)** is ONLY affected by STOP_GAME
- **Bucket** and **SameDir** track pauses independently
- If SameDir triggers a pause, only SameDir pauses (Bucket continues)
- If Bucket triggers a pause, only Bucket pauses (SameDir continues)

See `docs/PAUSE-SYSTEM-SPEC.md` for detailed documentation.

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

## Development

```bash
# Lint code
npm run lint

# Fix lint errors
npm run lint:fix

# Clean build
npm run clean
```

## License

MIT
