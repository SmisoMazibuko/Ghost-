# Ghost Evaluator - Analysis Guide

This directory contains tools and documentation for analyzing logged session data.

## Data Structure

### Sessions Directory (`../sessions/`)
Each session is saved as a JSON file with the following structure:
- `sessionId`: Unique identifier
- `startTime` / `endTime`: Session duration
- `config`: Configuration used
- `plays[]`: Array of all logged plays
- `events[]`: Significant events
- `summary`: Session statistics
- `blockSequence`: Raw block data
- `finalPatternStates`: End-of-session pattern states

### Logs Directory (`../logs/`)
- `plays.jsonl`: Aggregated plays across all sessions (JSONL format, one record per line)

## How to Analyze Data

### Using TypeScript/Node.js

```typescript
import {
  DataLoader,
  generateOverallAnalysis,
  analyzePatternPerformance,
  analyzeP1Mode,
  filterPlays,
  exportPlaysToCSV,
} from '../src/data/analysis';

// Load all data
const loader = new DataLoader();
const sessions = loader.loadSessions();
const allPlays = loader.getAllPlays();

// Generate complete analysis
const analysis = generateOverallAnalysis(sessions);
console.log('Overall Win Rate:', analysis.overallWinRate);
console.log('Total P/L:', analysis.totalPnl);

// Analyze specific patterns
const patternStats = analyzePatternPerformance(allPlays);
console.log('Best performing pattern:', patternStats[0].pattern);

// Filter plays
const anti2A2Wins = filterPlays(allPlays, {
  patterns: ['Anti2A2'],
  onlyWins: true,
});

// Export to CSV
exportPlaysToCSV(allPlays, './data/analysis/all_plays.csv');
```

### Key Questions to Answer

1. **Pattern Performance**
   - Which patterns have the highest win rate?
   - Which patterns generate the most profit?
   - When do patterns get activated vs broken?

2. **ANTI Pattern Analysis**
   - In which session states does ANTI perform best?
   - What precedes successful ANTI plays?
   - When should we avoid ANTI?

3. **P1 Mode Analysis**
   - What patterns/conditions precede P1?
   - How long do P1 periods last?
   - What's the recovery rate from P1?

4. **Unplayable Detection**
   - How early can we detect unplayable sessions?
   - What signals indicate an upcoming unplayable period?
   - What's the optimal response to unplayable detection?

5. **Loss Avoidance**
   - What conditions lead to losses?
   - Which patterns should be avoided in certain states?
   - What's the optimal skip criteria?

## Analysis Workflow

### Step 1: Collect Data
Play sessions with recording enabled:
```typescript
const manager = createRecordedSessionManager({
  enableRecording: true,
});
manager.startSession();
// ... play ...
manager.endSession('Session notes here');
```

### Step 2: Load and Explore
```typescript
const loader = new DataLoader();
const sessions = loader.loadSessions();

// Basic stats
console.log(`Total sessions: ${sessions.length}`);
console.log(`Total blocks: ${sessions.reduce((s, x) => s + x.summary.totalBlocks, 0)}`);
```

### Step 3: Deep Analysis
```typescript
// Pattern performance
const patterns = analyzePatternPerformance(allPlays);

// Find what precedes P1
const preP1 = findPreP1Plays(allPlays, 10);

// Find unplayable periods
const unplayablePeriods = findUnplayablePeriods(allPlays);
```

### Step 4: Export and Share
```typescript
// Export analysis
exportAnalysisToJson(analysis, './data/analysis/analysis_report.json');

// Export plays for external tools
exportPlaysToCSV(allPlays, './data/analysis/all_plays.csv');
```

## Sharing with Claude for Strategy Improvement

When ready to improve the strategy:

1. Generate the analysis report:
```typescript
const analysis = generateOverallAnalysis(sessions);
exportAnalysisToJson(analysis, './data/analysis/analysis_report.json');
```

2. Export relevant plays:
```typescript
// All bets
exportPlaysToCSV(filterPlays(allPlays, { onlyBets: true }), './bets.csv');

// P1 related
exportPlaysToCSV(findPreP1Plays(allPlays), './pre_p1.csv');
```

3. Share with Claude:
   - The `analysis_report.json`
   - Specific questions about strategy
   - Examples of problematic situations

## Future Improvements

- [ ] Add visualization scripts
- [ ] Pattern correlation analysis
- [ ] Sequence pattern detection
- [ ] Machine learning integration
- [ ] Real-time analysis dashboard
