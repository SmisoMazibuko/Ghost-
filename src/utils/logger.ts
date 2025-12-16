/**
 * Ghost Evaluator v15.3 - Logger
 * ===============================
 * Logging utility for the evaluator system
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// LOG LEVELS
// ============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// ============================================================================
// COLORS FOR TERMINAL
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
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: COLORS.dim,
  info: COLORS.cyan,
  warn: COLORS.yellow,
  error: COLORS.red,
};

// ============================================================================
// LOGGER CLASS
// ============================================================================

export class Logger {
  private level: LogLevel;
  private enableConsole: boolean;
  private enableFile: boolean;
  private filePath: string | null;
  private fileStream: fs.WriteStream | null = null;

  constructor(options?: {
    level?: LogLevel;
    console?: boolean;
    file?: boolean;
    filePath?: string;
  }) {
    this.level = options?.level ?? 'info';
    this.enableConsole = options?.console ?? true;
    this.enableFile = options?.file ?? false;
    this.filePath = options?.filePath ?? null;

    if (this.enableFile && this.filePath) {
      this.initFileStream();
    }
  }

  /**
   * Initialize file stream for logging
   */
  private initFileStream(): void {
    if (!this.filePath) return;

    const absolutePath = path.resolve(this.filePath);
    const dir = path.dirname(absolutePath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.fileStream = fs.createWriteStream(absolutePath, { flags: 'a' });
  }

  /**
   * Check if level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }

  /**
   * Format message for output
   */
  private formatMessage(level: LogLevel, message: string, data?: unknown): string {
    const timestamp = new Date().toISOString();
    const levelStr = level.toUpperCase().padEnd(5);
    let formatted = `[${timestamp}] [${levelStr}] ${message}`;

    if (data !== undefined) {
      const dataStr = typeof data === 'object'
        ? JSON.stringify(data, null, 2)
        : String(data);
      formatted += `\n${dataStr}`;
    }

    return formatted;
  }

  /**
   * Format message for console with colors
   */
  private formatConsoleMessage(level: LogLevel, message: string, data?: unknown): string {
    const timestamp = new Date().toISOString();
    const color = LEVEL_COLORS[level];
    const levelStr = level.toUpperCase().padEnd(5);

    let formatted = `${COLORS.dim}[${timestamp}]${COLORS.reset} ${color}[${levelStr}]${COLORS.reset} ${message}`;

    if (data !== undefined) {
      const dataStr = typeof data === 'object'
        ? JSON.stringify(data, null, 2)
        : String(data);
      formatted += `\n${COLORS.dim}${dataStr}${COLORS.reset}`;
    }

    return formatted;
  }

  /**
   * Log a message
   */
  private log(level: LogLevel, message: string, data?: unknown): void {
    if (!this.shouldLog(level)) return;

    if (this.enableConsole) {
      const consoleMsg = this.formatConsoleMessage(level, message, data);
      if (level === 'error') {
        console.error(consoleMsg);
      } else if (level === 'warn') {
        console.warn(consoleMsg);
      } else {
        console.log(consoleMsg);
      }
    }

    if (this.enableFile && this.fileStream) {
      const fileMsg = this.formatMessage(level, message, data);
      this.fileStream.write(fileMsg + '\n');
    }
  }

  /**
   * Log debug message
   */
  debug(message: string, data?: unknown): void {
    this.log('debug', message, data);
  }

  /**
   * Log info message
   */
  info(message: string, data?: unknown): void {
    this.log('info', message, data);
  }

  /**
   * Log warning message
   */
  warn(message: string, data?: unknown): void {
    this.log('warn', message, data);
  }

  /**
   * Log error message
   */
  error(message: string, data?: unknown): void {
    this.log('error', message, data);
  }

  /**
   * Set log level
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Close file stream
   */
  close(): void {
    if (this.fileStream) {
      this.fileStream.end();
      this.fileStream = null;
    }
  }
}

// ============================================================================
// SINGLETON LOGGER
// ============================================================================

let globalLogger: Logger | null = null;

export function initLogger(options?: {
  level?: LogLevel;
  console?: boolean;
  file?: boolean;
  filePath?: string;
}): Logger {
  globalLogger = new Logger(options);
  return globalLogger;
}

export function getLogger(): Logger {
  if (!globalLogger) {
    globalLogger = new Logger();
  }
  return globalLogger;
}
