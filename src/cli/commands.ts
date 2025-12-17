/**
 * Ghost Evaluator v15.3 - CLI Commands
 * =====================================
 * Command handlers for the CLI interface
 */

import { Direction } from '../types';
import { SessionManager } from '../session/manager';
import { OrchestrationManager, createOrchestrationManager } from '../orchestration';
import { loadRecentAnalytics, aggregateAnalytics, AggregatedAnalytics } from '../data/analytics-storage';

// ============================================================================
// DISPLAY HELPERS
// ============================================================================

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
};

function colorDir(dir: Direction): string {
  return dir > 0
    ? `${COLORS.green}▲ UP${COLORS.reset}`
    : `${COLORS.red}▼ DOWN${COLORS.reset}`;
}

function colorPnl(pnl: number): string {
  if (pnl > 0) return `${COLORS.green}+R${pnl.toFixed(2)}${COLORS.reset}`;
  if (pnl < 0) return `${COLORS.red}R${pnl.toFixed(2)}${COLORS.reset}`;
  return `R${pnl.toFixed(2)}`;
}

function colorState(state: string): string {
  switch (state) {
    case 'playable': return `${COLORS.green}✓ PLAYABLE${COLORS.reset}`;
    case 'unplayable': return `${COLORS.yellow}⏸ UNPLAYABLE${COLORS.reset}`;
    case 'p1_mode': return `${COLORS.red}⚠️ P1 MODE${COLORS.reset}`;
    case 'done': return `${COLORS.cyan}🎯 DONE${COLORS.reset}`;
    default: return state;
  }
}

function colorHealthLevel(level: string): string {
  switch (level) {
    case 'playable': return `${COLORS.green}● PLAYABLE${COLORS.reset}`;
    case 'caution': return `${COLORS.yellow}◐ CAUTION${COLORS.reset}`;
    case 'unplayable': return `${COLORS.red}○ UNPLAYABLE${COLORS.reset}`;
    case 'abort': return `${COLORS.bgRed}${COLORS.white} ABORT ${COLORS.reset}`;
    default: return level;
  }
}

function colorRecoveryMode(mode: string): string {
  switch (mode) {
    case 'normal': return `${COLORS.green}NORMAL${COLORS.reset}`;
    case 'recovery': return `${COLORS.yellow}RECOVERY${COLORS.reset}`;
    case 'reentry': return `${COLORS.cyan}RE-ENTRY${COLORS.reset}`;
    default: return mode;
  }
}

function colorPatternState(state: string): string {
  switch (state) {
    case 'active': return `${COLORS.green}●${COLORS.reset}`;
    case 'observing': return `${COLORS.yellow}○${COLORS.reset}`;
    case 'broken': return `${COLORS.red}✗${COLORS.reset}`;
    default: return state;
  }
}

// ============================================================================
// COMMAND HANDLERS
// ============================================================================

export class CommandHandler {
  private session: SessionManager;
  private orchestration: OrchestrationManager;

  constructor(session: SessionManager) {
    this.session = session;
    this.orchestration = createOrchestrationManager();
  }

  /**
   * Get the orchestration manager
   */
  getOrchestration(): OrchestrationManager {
    return this.orchestration;
  }

  /**
   * Add a block command
   */
  addBlock(dirStr: string, pctStr: string): void {
    const dir = this.parseDirection(dirStr);
    const pct = parseFloat(pctStr);

    if (dir === null) {
      console.log(`${COLORS.red}Invalid direction. Use: g/green/up/1 or r/red/down/-1${COLORS.reset}`);
      return;
    }

    if (isNaN(pct) || pct < 0 || pct > 100) {
      console.log(`${COLORS.red}Invalid percentage. Must be 0-100${COLORS.reset}`);
      return;
    }

    const reaction = this.session.getReactionEngine();
    const result = reaction.processBlock(dir, pct);

    // Display block info
    console.log(`\n${COLORS.bright}Block #${result.blockResult.block.index}${COLORS.reset}`);
    console.log(`  Direction: ${colorDir(dir)}`);
    console.log(`  Percentage: ${pct.toFixed(1)}%`);
    console.log(`  Run Length: ${this.session.getGameState().getCurrentRunLength()}`);

    // Display new signals
    if (result.blockResult.newSignals.length > 0) {
      console.log(`\n${COLORS.cyan}Patterns Detected:${COLORS.reset}`);
      for (const signal of result.blockResult.newSignals) {
        const lifecycle = this.session.getGameState().getLifecycle();
        const state = lifecycle.getCycle(signal.pattern).state;
        console.log(`  ${colorPatternState(state)} ${signal.pattern} → ${colorDir(signal.expectedDirection)}`);
      }
    }

    // Display evaluated results
    if (result.blockResult.evaluatedResults.length > 0) {
      console.log(`\n${COLORS.magenta}Evaluations:${COLORS.reset}`);
      for (const ev of result.blockResult.evaluatedResults) {
        const profitStr = ev.profit > 0
          ? `${COLORS.green}+${ev.profit.toFixed(0)}%${COLORS.reset}`
          : `${COLORS.red}${ev.profit.toFixed(0)}%${COLORS.reset}`;
        const betStr = ev.wasBet ? '💰' : '👁️';
        console.log(`  ${betStr} ${ev.pattern}: ${ev.verdict} (${profitStr})`);
      }
    }

    // Display closed trade
    if (result.closedTrade) {
      const t = result.closedTrade;
      console.log(`\n${COLORS.bright}Trade Closed:${COLORS.reset}`);
      console.log(`  ${t.isWin ? COLORS.green + '✓ WIN' : COLORS.red + '✗ LOSS'}${COLORS.reset}`);
      console.log(`  P/L: ${colorPnl(t.pnl)}`);
    }

    // Display prediction
    console.log(`\n${COLORS.bright}Prediction:${COLORS.reset}`);
    if (result.prediction.hasPrediction) {
      console.log(`  ${colorDir(result.prediction.direction!)} (${result.prediction.confidence}%)`);
      console.log(`  Pattern: ${result.prediction.pattern}`);
      console.log(`  ${result.prediction.reason}`);
    } else {
      console.log(`  ${COLORS.dim}${result.prediction.reason}${COLORS.reset}`);
    }

    // Display opened trade
    if (result.openedTrade) {
      console.log(`\n${COLORS.yellow}Trade Opened:${COLORS.reset}`);
      console.log(`  Pattern: ${result.openedTrade.pattern}`);
      console.log(`  Direction: ${colorDir(result.openedTrade.direction)}`);
    }

    // Display session state
    this.displayStatus();
  }

  /**
   * Parse direction from string
   */
  private parseDirection(str: string): Direction | null {
    const s = str.toLowerCase().trim();
    if (['g', 'green', 'up', '1', '+1', 'u'].includes(s)) return 1;
    if (['r', 'red', 'down', '-1', 'd'].includes(s)) return -1;
    return null;
  }

  /**
   * Display current status
   */
  displayStatus(): void {
    const summary = this.session.getSummary();
    const state = this.session.getGameState();
    const reaction = this.session.getReactionEngine();

    console.log(`\n${'─'.repeat(50)}`);
    console.log(`${COLORS.bright}Session Status${COLORS.reset}`);
    console.log(`${'─'.repeat(50)}`);
    console.log(`  State: ${colorState(summary.sessionState)}`);
    console.log(`  Blocks: ${summary.blockCount}`);
    console.log(`  Trades: ${summary.tradeCount}`);
    console.log(`  P/L: ${colorPnl(summary.pnlTotal)}`);
    console.log(`  Win Rate: ${summary.winRate.toFixed(1)}%`);
    console.log(`  Target: ${summary.targetProgress.toFixed(1)}%`);

    // Session Health display
    console.log(`\n  ${COLORS.bright}Session Health:${COLORS.reset}`);
    console.log(`    Score: ${summary.sessionHealth.score.toFixed(1)}/100`);
    console.log(`    Level: ${colorHealthLevel(summary.sessionHealth.level)}`);
    console.log(`    Mode: ${colorRecoveryMode(summary.recoveryMode)}`);
    if (summary.stakeMultiplier < 1) {
      console.log(`    Stake: ${COLORS.yellow}${Math.round(summary.stakeMultiplier * 100)}%${COLORS.reset}`);
    }
    if (summary.isSessionStopped) {
      console.log(`    ${COLORS.red}⚠️ ${summary.sessionStopReason}${COLORS.reset}`);
    }

    if (state.isP1Mode()) {
      console.log(`  ${COLORS.red}⚠️ P1 Mode Active (${state.getCurrentRunLength()}X run)${COLORS.reset}`);
    }

    // Show pending trade
    const pending = reaction.getPendingTrade();
    if (pending) {
      console.log(`\n  ${COLORS.yellow}Pending: ${pending.pattern} → ${colorDir(pending.direction)}${COLORS.reset}`);
    }
  }

  /**
   * Display pattern status
   */
  displayPatterns(): void {
    const lifecycle = this.session.getGameState().getLifecycle();
    const stats = lifecycle.getStatistics();

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`${COLORS.bright}Pattern Status${COLORS.reset}`);
    console.log(`${'─'.repeat(60)}`);
    console.log(`  ${'Pattern'.padEnd(10)} ${'State'.padEnd(12)} ${'Cumulative'.padEnd(12)} ${'All-Time'.padEnd(12)}`);
    console.log(`  ${'-'.repeat(46)}`);

    for (const s of stats) {
      const stateIcon = colorPatternState(s.state);
      const cumStr = s.cumulativeProfit >= 0
        ? `${COLORS.green}+${s.cumulativeProfit.toFixed(0)}%${COLORS.reset}`
        : `${COLORS.red}${s.cumulativeProfit.toFixed(0)}%${COLORS.reset}`;
      const allStr = s.allTimeProfit >= 0
        ? `${COLORS.green}+${s.allTimeProfit.toFixed(0)}%${COLORS.reset}`
        : `${COLORS.red}${s.allTimeProfit.toFixed(0)}%${COLORS.reset}`;

      console.log(`  ${stateIcon} ${s.pattern.padEnd(9)} ${s.state.padEnd(11)} ${cumStr.padEnd(20)} ${allStr}`);
    }
  }

  /**
   * Display trade history
   */
  displayTrades(): void {
    const trades = this.session.getReactionEngine().getCompletedTrades();

    if (trades.length === 0) {
      console.log(`\n${COLORS.dim}No trades yet${COLORS.reset}`);
      return;
    }

    console.log(`\n${'─'.repeat(70)}`);
    console.log(`${COLORS.bright}Trade History${COLORS.reset}`);
    console.log(`${'─'.repeat(70)}`);
    console.log(`  ${'#'.padEnd(4)} ${'Pattern'.padEnd(10)} ${'Pred'.padEnd(6)} ${'Actual'.padEnd(8)} ${'Pct'.padEnd(8)} ${'Result'.padEnd(8)} ${'P/L'.padEnd(12)}`);
    console.log(`  ${'-'.repeat(56)}`);

    for (const t of trades.slice(-20)) {
      const predStr = t.predictedDirection > 0 ? 'UP' : 'DOWN';
      const actStr = t.actualDirection > 0 ? 'UP' : 'DOWN';
      const resultStr = t.isWin
        ? `${COLORS.green}WIN${COLORS.reset}`
        : `${COLORS.red}LOSS${COLORS.reset}`;

      console.log(`  ${String(t.id).padEnd(4)} ${t.pattern.padEnd(10)} ${predStr.padEnd(6)} ${actStr.padEnd(8)} ${t.pct.toFixed(1).padEnd(8)} ${resultStr.padEnd(16)} ${colorPnl(t.pnl)}`);
    }

    const stats = this.session.getReactionEngine().getTradeStats();
    console.log(`\n  Total: ${stats.totalTrades} trades | Wins: ${stats.wins} | Losses: ${stats.losses} | Win Rate: ${stats.winRate.toFixed(1)}%`);
  }

  /**
   * Display blocks
   */
  displayBlocks(): void {
    const blocks = this.session.getGameState().getBlocks();

    if (blocks.length === 0) {
      console.log(`\n${COLORS.dim}No blocks yet${COLORS.reset}`);
      return;
    }

    console.log(`\n${COLORS.bright}Block Sequence (last 20):${COLORS.reset}`);

    const display = blocks.slice(-20);
    let line = '  ';

    for (const b of display) {
      const symbol = b.dir > 0
        ? `${COLORS.bgGreen}${COLORS.white} ${b.pct.toFixed(0).padStart(2)} ${COLORS.reset}`
        : `${COLORS.bgRed}${COLORS.white} ${b.pct.toFixed(0).padStart(2)} ${COLORS.reset}`;
      line += symbol + ' ';
    }

    console.log(line);
    console.log(`  ${COLORS.dim}Total: ${blocks.length} blocks${COLORS.reset}`);
  }

  /**
   * Undo last block
   */
  undo(): void {
    const removed = this.session.getGameState().undoLastBlock();
    if (removed) {
      console.log(`${COLORS.yellow}Removed block #${removed.index}${COLORS.reset}`);
      this.displayStatus();
    } else {
      console.log(`${COLORS.dim}No blocks to undo${COLORS.reset}`);
    }
  }

  /**
   * Clear session
   */
  clear(): void {
    this.session.newSession();
    console.log(`${COLORS.cyan}Session cleared${COLORS.reset}`);
  }

  /**
   * Save session
   */
  save(filePath?: string): void {
    const path = this.session.saveToFile(filePath);
    console.log(`${COLORS.green}Session saved to: ${path}${COLORS.reset}`);
  }

  /**
   * Load session
   */
  load(filePath: string): void {
    try {
      this.session.loadFromFile(filePath);
      console.log(`${COLORS.green}Session loaded from: ${filePath}${COLORS.reset}`);
      this.displayStatus();
    } catch (error) {
      console.log(`${COLORS.red}Failed to load session: ${error}${COLORS.reset}`);
    }
  }

  /**
   * List sessions
   */
  listSessions(): void {
    const sessions = this.session.listSessions();

    if (sessions.length === 0) {
      console.log(`${COLORS.dim}No saved sessions${COLORS.reset}`);
      return;
    }

    console.log(`\n${COLORS.bright}Saved Sessions:${COLORS.reset}`);
    for (const s of sessions) {
      console.log(`  ${s.timestamp} | ${colorPnl(s.pnl)} | ${s.path}`);
    }
  }

  // ============================================================================
  // ORCHESTRATION COMMANDS
  // ============================================================================

  /**
   * Process AI command (natural language)
   */
  ai(input: string): void {
    const response = this.orchestration.processCommand(input);
    console.log(`\n${response.message}`);
    if (response.suggestions && response.suggestions.length > 0) {
      console.log(`\n${COLORS.dim}Suggestions:${COLORS.reset}`);
      for (const s of response.suggestions) {
        console.log(`  ${COLORS.cyan}→${COLORS.reset} ${s}`);
      }
    }
    if (response.warnings && response.warnings.length > 0) {
      console.log(`\n${COLORS.yellow}Warnings:${COLORS.reset}`);
      for (const w of response.warnings) {
        console.log(`  ⚠ ${w}`);
      }
    }
  }

  /**
   * Run orchestration tests
   */
  runTests(): void {
    console.log(`\n${COLORS.bright}Running Tests...${COLORS.reset}\n`);
    const report = this.orchestration.runTests();
    console.log(report);
  }

  /**
   * Show rules
   */
  showRules(): void {
    const rules = this.orchestration.getRuleManager().getActiveRules();
    console.log(`\n${COLORS.bright}Active Rules (${rules.length}):${COLORS.reset}`);
    console.log(`${'─'.repeat(60)}`);

    for (const rule of rules) {
      const icon = rule.enabled ? `${COLORS.green}●${COLORS.reset}` : `${COLORS.red}○${COLORS.reset}`;
      console.log(`${icon} ${rule.name}`);
      console.log(`  ${COLORS.dim}${rule.description}${COLORS.reset}`);
      console.log(`  Category: ${rule.category} | Priority: ${rule.priority}`);
    }
  }

  /**
   * Show change history
   */
  showChanges(): void {
    const response = this.orchestration.getHistory();
    console.log(response.message);
  }

  /**
   * Get AI suggestions
   */
  suggest(): void {
    const response = this.orchestration.getSuggestions();
    console.log(response.message);
  }

  /**
   * Validate rules
   */
  validateRules(): void {
    const response = this.orchestration.validate();
    console.log(response.message);
  }

  /**
   * Display detailed session health report
   */
  displayHealth(): void {
    const report = this.session.getHealthReport();

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`${COLORS.bright}Session Health Report${COLORS.reset}`);
    console.log(`${'─'.repeat(60)}`);

    // Overall health
    console.log(`\n${COLORS.cyan}Overall Health:${COLORS.reset}`);
    console.log(`  Score: ${report.health.score.toFixed(1)}/100`);
    console.log(`  Level: ${colorHealthLevel(report.health.level)}`);
    console.log(`  Win Rate Factor: ${(report.health.winRateFactor * 100).toFixed(1)}%`);
    console.log(`  Drawdown Factor: ${(report.health.drawdownFactor * 100).toFixed(1)}%`);
    console.log(`  Pattern Reliability: ${(report.health.patternReliabilityFactor * 100).toFixed(1)}%`);
    console.log(`  Verdict Quality: ${(report.health.verdictQualityFactor * 100).toFixed(1)}%`);

    // Drawdown
    console.log(`\n${COLORS.cyan}Drawdown:${COLORS.reset}`);
    console.log(`  Current P/L: ${colorPnl(report.drawdown.currentPnL)}`);
    console.log(`  Peak P/L: ${colorPnl(report.drawdown.peakPnL)}`);
    console.log(`  Current Drawdown: ${colorPnl(report.drawdown.currentDrawdown)}`);
    console.log(`  Max Drawdown: ${colorPnl(report.drawdown.maxDrawdown)}`);
    console.log(`  Level: ${report.drawdown.level}/4`);
    if (report.drawdown.isStopped) {
      console.log(`  ${COLORS.red}⚠️ Session STOPPED${COLORS.reset}`);
    }
    if (report.drawdown.isAborted) {
      console.log(`  ${COLORS.bgRed}${COLORS.white} SESSION ABORTED ${COLORS.reset}`);
    }

    // Loss Severity
    console.log(`\n${COLORS.cyan}Loss Severity:${COLORS.reset}`);
    console.log(`  Total Weighted Loss: ${report.lossSeverity.totalWeightedLoss.toFixed(1)}%`);
    console.log(`  Average Loss: ${report.lossSeverity.averageLossMagnitude.toFixed(1)}%`);
    console.log(`  Loss Count: ${report.lossSeverity.lossCount}`);
    console.log(`  Severity: ${report.lossSeverity.severityLevel.toUpperCase()}`);

    // Verdicts
    console.log(`\n${COLORS.cyan}Verdict Analysis:${COLORS.reset}`);
    console.log(`  Total: ${report.verdicts.totalVerdicts}`);
    console.log(`  Fair: ${report.verdicts.fairCount}`);
    console.log(`  Unfair: ${report.verdicts.unfairCount}`);
    console.log(`  Fake: ${report.verdicts.fakeCount}`);
    console.log(`  Fake Ratio: ${(report.verdicts.fakeRatio * 100).toFixed(1)}%`);
    console.log(`  Market State: ${report.verdicts.marketState.toUpperCase()}`);

    // Recovery state
    console.log(`\n${COLORS.cyan}Recovery:${COLORS.reset}`);
    console.log(`  Mode: ${colorRecoveryMode(report.recovery.isInRecoveryMode ? 'recovery' : (report.reentry.isInReentry ? 'reentry' : 'normal'))}`);
    if (report.recovery.isInRecoveryMode) {
      console.log(`  Blocks in Recovery: ${report.recovery.blocksInRecovery}`);
      console.log(`  Shadow Trades: ${report.recovery.shadowTrades.length}`);
      console.log(`  Shadow Win Rate: ${(report.recovery.shadowWinRate * 100).toFixed(1)}%`);
      console.log(`  Fake Ratio: ${(report.recovery.fakeVerdictRatio * 100).toFixed(1)}%`);
      console.log(`  Recovery Attempts: ${report.recovery.recoveryAttempts}`);
    }
    if (report.reentry.isInReentry) {
      console.log(`  Stake: ${Math.round(report.reentry.stakeMultiplier * 100)}%`);
      console.log(`  Trial Trades: ${report.reentry.trialTradesCompleted}/${report.reentry.totalTrialTrades}`);
      console.log(`  Trial Wins: ${report.reentry.trialWins}/${report.reentry.requiredWins} needed`);
    }

    // Pattern Divergences (show only baiting patterns)
    const baitingPatterns = report.patternDivergences.filter(p => p.isBaiting || p.isConfirmedBaitSwitch);
    if (baitingPatterns.length > 0) {
      console.log(`\n${COLORS.yellow}Bait & Switch Detection:${COLORS.reset}`);
      for (const p of baitingPatterns) {
        const status = p.isConfirmedBaitSwitch ? `${COLORS.red}CONFIRMED${COLORS.reset}` : `${COLORS.yellow}SUSPECTED${COLORS.reset}`;
        console.log(`  ${p.pattern}: ${status}`);
        console.log(`    Observation WR: ${(p.observationWinRate * 100).toFixed(1)}%`);
        console.log(`    Active WR: ${(p.activeWinRate * 100).toFixed(1)}%`);
        console.log(`    Divergence: ${(p.divergenceScore * 100).toFixed(1)}%`);
      }
    }
  }

  // ========================================
  // CYCLE ANALYTICS COMMANDS
  // ========================================

  /**
   * Display current session's cycle analytics
   */
  displayCycleAnalytics(): void {
    const analytics = this.session.getCycleAnalytics();

    if (!analytics) {
      console.log(`${COLORS.yellow}No cycle analytics available yet.${COLORS.reset}`);
      return;
    }

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`${COLORS.bright}Cycle Analytics - Current Session${COLORS.reset}`);
    console.log(`${'─'.repeat(60)}`);

    // Overall stats
    console.log(`\n${COLORS.cyan}Overview:${COLORS.reset}`);
    console.log(`  Session Duration: ${analytics.sessionDuration} blocks`);
    console.log(`  Total Transitions: ${analytics.totalTransitions}`);
    console.log(`  Total Activations: ${analytics.totalActivations}`);
    console.log(`  Total Breaks: ${analytics.totalBreaks}`);
    console.log(`  Activation Success Rate: ${(analytics.overallActivationSuccessRate * 100).toFixed(1)}%`);
    console.log(`  Break Accuracy: ${(analytics.overallBreakAccuracy * 100).toFixed(1)}%`);
    console.log(`  Net Observation Value: ${colorPnl(analytics.totalNetObservationValue)}`);

    // Per-bucket stats
    console.log(`\n${COLORS.cyan}Bucket Performance:${COLORS.reset}`);
    console.log(`  MAIN: ${analytics.perBucket.MAIN.activations} activations, ` +
      `${(analytics.perBucket.MAIN.successRate * 100).toFixed(1)}% success, ` +
      `avg ${analytics.perBucket.MAIN.avgPnL.toFixed(0)}% PnL`);
    console.log(`  B&S: ${analytics.perBucket.BNS.activations} activations, ` +
      `${(analytics.perBucket.BNS.successRate * 100).toFixed(1)}% success, ` +
      `avg ${analytics.perBucket.BNS.avgPnL.toFixed(0)}% PnL`);

    // Per-pattern stats (only show patterns with data)
    const patternsWithData = Object.entries(analytics.perPattern)
      .filter(([_, stats]) => stats.activationCount > 0 || stats.breakCount > 0);

    if (patternsWithData.length > 0) {
      console.log(`\n${COLORS.cyan}Per-Pattern Performance:${COLORS.reset}`);
      for (const [pattern, stats] of patternsWithData) {
        console.log(`\n  ${COLORS.bright}${pattern}:${COLORS.reset}`);
        console.log(`    Activations: ${stats.activationCount} (${(stats.activationSuccessRate * 100).toFixed(1)}% success)`);
        console.log(`    Avg Observation: ${stats.avgObservationBeforeActivation.toFixed(1)} steps`);
        console.log(`    Avg Active PnL: ${stats.avgActivePeriodPnL.toFixed(0)}%`);
        console.log(`    Breaks: ${stats.breakCount} (loss: ${stats.lossBreakCount}, structural: ${stats.structuralKillCount})`);
        console.log(`    Break Accuracy: ${(stats.breakAccuracy * 100).toFixed(1)}%`);
        console.log(`    Net Obs Value: ${colorPnl(stats.netObservationValue)}`);
        console.log(`    Time Split: ${(stats.observingPercentage * 100).toFixed(0)}% observing / ${((1 - stats.observingPercentage) * 100).toFixed(0)}% active`);
      }
    }
  }

  /**
   * Display aggregated analytics from recent sessions
   */
  async displayAggregatedAnalytics(days: number = 7): Promise<void> {
    console.log(`\n${COLORS.dim}Loading analytics from last ${days} days...${COLORS.reset}`);

    const sessions = await loadRecentAnalytics(days);

    if (sessions.length === 0) {
      console.log(`${COLORS.yellow}No cycle analytics found for the last ${days} days.${COLORS.reset}`);
      console.log(`Run some sessions and save their analytics to populate this data.`);
      return;
    }

    const agg = aggregateAnalytics(sessions);
    this.displayAggregated(agg, days);
  }

  /**
   * Display aggregated analytics
   */
  private displayAggregated(agg: AggregatedAnalytics, days: number): void {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`${COLORS.bright}Aggregated Cycle Analytics (${agg.sessionCount} sessions, ${days} days)${COLORS.reset}`);
    console.log(`${'─'.repeat(60)}`);

    // Date range
    const startStr = agg.dateRange.start.toLocaleDateString();
    const endStr = agg.dateRange.end.toLocaleDateString();
    console.log(`\n${COLORS.cyan}Date Range:${COLORS.reset} ${startStr} - ${endStr}`);

    // Overall stats
    console.log(`\n${COLORS.cyan}Overall Performance:${COLORS.reset}`);
    console.log(`  Total Transitions: ${agg.totalTransitions}`);
    console.log(`  Total Activations: ${agg.totalActivations}`);
    console.log(`  Total Breaks: ${agg.totalBreaks}`);
    console.log(`  Activation Success Rate: ${(agg.overallActivationSuccessRate * 100).toFixed(1)}%`);
    console.log(`  Break Accuracy: ${(agg.overallBreakAccuracy * 100).toFixed(1)}%`);
    console.log(`  Net Observation Value: ${colorPnl(agg.totalNetObservationValue)}`);

    // Per-bucket stats
    console.log(`\n${COLORS.cyan}Bucket Comparison:${COLORS.reset}`);
    console.log(`  ${COLORS.green}MAIN:${COLORS.reset}`);
    console.log(`    Activations: ${agg.perBucket.MAIN.activations}`);
    console.log(`    Success Rate: ${(agg.perBucket.MAIN.successRate * 100).toFixed(1)}%`);
    console.log(`    Avg PnL: ${agg.perBucket.MAIN.avgPnL.toFixed(0)}%`);
    console.log(`  ${COLORS.yellow}B&S:${COLORS.reset}`);
    console.log(`    Activations: ${agg.perBucket.BNS.activations}`);
    console.log(`    Success Rate: ${(agg.perBucket.BNS.successRate * 100).toFixed(1)}%`);
    console.log(`    Avg PnL: ${agg.perBucket.BNS.avgPnL.toFixed(0)}%`);

    // Per-pattern summary (sorted by activations)
    const sortedPatterns = Object.entries(agg.perPattern)
      .filter(([_, stats]) => stats.activations > 0)
      .sort((a, b) => b[1].activations - a[1].activations);

    if (sortedPatterns.length > 0) {
      console.log(`\n${COLORS.cyan}Pattern Rankings (by activation count):${COLORS.reset}`);
      console.log(`  ${'Pattern'.padEnd(10)} ${'Act'.padStart(5)} ${'Succ%'.padStart(7)} ${'AvgPnL'.padStart(8)} ${'Breaks'.padStart(7)} ${'BrkAcc%'.padStart(8)} ${'NetObs'.padStart(8)}`);
      console.log(`  ${'─'.repeat(57)}`);

      for (const [pattern, stats] of sortedPatterns) {
        const successColor = stats.successRate >= 0.5 ? COLORS.green : COLORS.red;
        const netObsColor = stats.netObservationValue >= 0 ? COLORS.green : COLORS.red;

        console.log(
          `  ${pattern.padEnd(10)} ` +
          `${stats.activations.toString().padStart(5)} ` +
          `${successColor}${(stats.successRate * 100).toFixed(1).padStart(7)}${COLORS.reset} ` +
          `${stats.avgPnL.toFixed(0).padStart(8)} ` +
          `${stats.breaks.toString().padStart(7)} ` +
          `${(stats.breakAccuracy * 100).toFixed(1).padStart(8)} ` +
          `${netObsColor}${stats.netObservationValue.toFixed(0).padStart(8)}${COLORS.reset}`
        );
      }
    }

    // Key insights
    console.log(`\n${COLORS.cyan}Key Insights:${COLORS.reset}`);

    // Best and worst patterns
    if (sortedPatterns.length > 0) {
      const bestBySuccess = [...sortedPatterns].sort((a, b) => b[1].successRate - a[1].successRate)[0];
      const worstBySuccess = [...sortedPatterns].sort((a, b) => a[1].successRate - b[1].successRate)[0];

      console.log(`  Best Success Rate: ${bestBySuccess[0]} (${(bestBySuccess[1].successRate * 100).toFixed(1)}%)`);
      console.log(`  Worst Success Rate: ${worstBySuccess[0]} (${(worstBySuccess[1].successRate * 100).toFixed(1)}%)`);

      // Patterns with high observation value (avoiding losses)
      const highObsValue = sortedPatterns.filter(([_, s]) => s.netObservationValue > 50);
      if (highObsValue.length > 0) {
        console.log(`  High Observation Value: ${highObsValue.map(([p, _]) => p).join(', ')}`);
      }
    }

    // MAIN vs B&S comparison
    if (agg.perBucket.MAIN.activations > 0 && agg.perBucket.BNS.activations > 0) {
      const mainBetter = agg.perBucket.MAIN.successRate > agg.perBucket.BNS.successRate;
      const diff = Math.abs(agg.perBucket.MAIN.successRate - agg.perBucket.BNS.successRate) * 100;
      console.log(`  ${mainBetter ? 'MAIN' : 'B&S'} bucket outperforms by ${diff.toFixed(1)}% success rate`);
    }
  }

  /**
   * Save current session's cycle analytics
   */
  async saveCycleAnalytics(): Promise<void> {
    const filepath = await this.session.saveCycleAnalytics();
    if (filepath) {
      console.log(`${COLORS.green}Cycle analytics saved to: ${filepath}${COLORS.reset}`);
    } else {
      console.log(`${COLORS.yellow}No analytics to save.${COLORS.reset}`);
    }
  }

  /**
   * Display help
   */
  help(): void {
    console.log(`
${COLORS.bright}Ghost Evaluator v15.3 - Commands${COLORS.reset}
${'─'.repeat(50)}

${COLORS.cyan}Block Entry:${COLORS.reset}
  <dir> <pct>     Add block (e.g., "g 65" or "r 42")
                  Directions: g/green/up/1 or r/red/down/-1

${COLORS.cyan}Display:${COLORS.reset}
  status          Show current session status
  health          Show detailed session health report
  patterns        Show pattern states
  trades          Show trade history
  blocks          Show block sequence

${COLORS.cyan}Session:${COLORS.reset}
  undo            Remove last block
  clear           Clear current session
  save [path]     Save session to file
  load <path>     Load session from file
  list            List saved sessions

${COLORS.cyan}AI Orchestration:${COLORS.reset}
  ai <command>    Natural language AI commands
                  Examples: "ai status", "ai suggest", "ai explain ZZ"
  test            Run orchestration tests
  rules           Show active rules
  changes         Show change history
  suggest         Get AI recommendations
  validate        Validate all rules

${COLORS.cyan}Analytics:${COLORS.reset}
  analytics       Show current session cycle analytics
  analytics-agg [days]  Show aggregated analytics (default: 7 days)
  save-analytics  Save current session analytics to storage

${COLORS.cyan}Other:${COLORS.reset}
  help            Show this help
  exit/quit       Exit the evaluator
`);
  }
}
