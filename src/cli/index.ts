/**
 * Ghost Evaluator v15.3 - CLI Entry Point
 * ========================================
 * Interactive command-line interface
 */

import * as readline from 'readline';
import { createSessionManager } from '../session/manager';
import { initLogger } from '../utils/logger';
import { initConfig, getConfig } from '../core/config';
import { CommandHandler } from './commands';

// ============================================================================
// COLORS
// ============================================================================

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
};

// ============================================================================
// CLI CLASS
// ============================================================================

export class GhostEvaluatorCLI {
  private rl: readline.Interface;
  private handler: CommandHandler;
  private running = false;

  constructor(configPath?: string) {
    // Initialize config
    if (configPath) {
      initConfig(configPath);
    }

    const config = getConfig();

    // Initialize logger
    const logConfig = config.getLoggingConfig();
    initLogger({
      level: logConfig.level,
      console: false, // Don't log to console in CLI mode
      file: logConfig.file,
      filePath: logConfig.filePath,
    });

    // Initialize session
    const sessionConfig = config.getSessionConfig();
    const evaluatorConfig = config.getEvaluatorConfig();
    const session = createSessionManager({
      config: evaluatorConfig,
      sessionDir: sessionConfig.sessionDir,
    });

    // Initialize command handler
    this.handler = new CommandHandler(session);

    // Initialize readline
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  /**
   * Display banner
   */
  private displayBanner(): void {
    console.log(`
${COLORS.cyan}╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   ${COLORS.bright}Ghost Evaluator v15.3${COLORS.cyan}                                 ║
║   ${COLORS.dim}Pattern Detection & Auto-Betting System${COLORS.cyan}                ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝${COLORS.reset}

${COLORS.dim}Type 'help' for commands, 'exit' to quit${COLORS.reset}
`);
  }

  /**
   * Parse and execute command
   */
  private executeCommand(input: string): boolean {
    const trimmed = input.trim();
    if (!trimmed) return true;

    const parts = trimmed.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
      case 'exit':
      case 'quit':
      case 'q':
        return false;

      case 'help':
      case 'h':
      case '?':
        this.handler.help();
        break;

      case 'status':
      case 's':
        this.handler.displayStatus();
        break;

      case 'patterns':
      case 'p':
        this.handler.displayPatterns();
        break;

      case 'trades':
      case 't':
        this.handler.displayTrades();
        break;

      case 'blocks':
      case 'b':
        this.handler.displayBlocks();
        break;

      case 'health':
        this.handler.displayHealth();
        break;

      case 'pause':
        this.handler.displayPause();
        break;

      case 'undo':
      case 'u':
        this.handler.undo();
        break;

      case 'clear':
        this.handler.clear();
        break;

      case 'save':
        this.handler.save(args[0]);
        break;

      case 'load':
        if (args[0]) {
          this.handler.load(args[0]);
        } else {
          console.log(`${COLORS.yellow}Usage: load <filepath>${COLORS.reset}`);
        }
        break;

      case 'list':
        this.handler.listSessions();
        break;

      // Cycle Analytics commands
      case 'analytics':
        this.handler.displayCycleAnalytics();
        break;

      case 'analytics-agg':
        const days = args[0] ? parseInt(args[0], 10) : 7;
        this.handler.displayAggregatedAnalytics(days).catch(err => {
          console.log(`${COLORS.yellow}Error loading analytics: ${err.message}${COLORS.reset}`);
        });
        break;

      case 'save-analytics':
        this.handler.saveCycleAnalytics().catch(err => {
          console.log(`${COLORS.yellow}Error saving analytics: ${err.message}${COLORS.reset}`);
        });
        break;

      // Block entry: first arg is direction, second is percentage
      case 'g':
      case 'green':
      case 'up':
        if (args[0]) {
          this.handler.addBlock('g', args[0]);
        } else {
          console.log(`${COLORS.yellow}Usage: g <percentage>${COLORS.reset}`);
        }
        break;

      case 'r':
      case 'red':
      case 'down':
        if (args[0]) {
          this.handler.addBlock('r', args[0]);
        } else {
          console.log(`${COLORS.yellow}Usage: r <percentage>${COLORS.reset}`);
        }
        break;

      default:
        // Check if it's a quick block entry like "g65" or "r42"
        if (/^[gr]\d+/.test(cmd)) {
          const dir = cmd[0];
          const pct = cmd.slice(1);
          this.handler.addBlock(dir, pct);
        } else if (/^\d+$/.test(cmd) && args[0]) {
          // Number first, direction second (e.g., "65 g")
          this.handler.addBlock(args[0], cmd);
        } else if (args[0] && /^\d+/.test(args[0])) {
          // Direction first, percentage second (e.g., "g 65")
          this.handler.addBlock(cmd, args[0]);
        } else {
          console.log(`${COLORS.yellow}Unknown command: ${cmd}. Type 'help' for commands.${COLORS.reset}`);
        }
    }

    return true;
  }

  /**
   * Prompt for input
   */
  private prompt(): void {
    this.rl.question(`${COLORS.green}ghost>${COLORS.reset} `, (answer) => {
      const continueRunning = this.executeCommand(answer);

      if (continueRunning && this.running) {
        this.prompt();
      } else {
        this.shutdown();
      }
    });
  }

  /**
   * Start the CLI
   */
  start(): void {
    this.running = true;
    this.displayBanner();
    this.handler.displayStatus();
    this.prompt();
  }

  /**
   * Shutdown the CLI
   */
  shutdown(): void {
    this.running = false;
    console.log(`\n${COLORS.dim}Goodbye!${COLORS.reset}\n`);
    this.rl.close();
    process.exit(0);
  }
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

export function startCLI(configPath?: string): void {
  const cli = new GhostEvaluatorCLI(configPath);

  // Handle Ctrl+C gracefully
  process.on('SIGINT', () => {
    cli.shutdown();
  });

  cli.start();
}

// Run if executed directly
if (require.main === module) {
  const configPath = process.argv[2];
  startCLI(configPath);
}
