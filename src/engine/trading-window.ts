/**
 * Trading Window Manager
 * ======================
 * Prevents trading outside optimal UTC time windows.
 *
 * Based on analysis showing:
 * - Best times: 08:00-12:00 UTC, 18:00-22:00 UTC
 * - Worst times: 00:00-07:00 UTC (night), 12:00-17:00 UTC (afternoon)
 *
 * Jan 3, 2026 proved this: ALL sessions outside optimal windows = -2,190% loss
 */

// ============================================================================
// TYPES
// ============================================================================

/** Trading window time range */
export interface TradingWindow {
  /** Start hour in UTC (0-23) */
  startHourUTC: number;
  /** End hour in UTC (0-23, exclusive) */
  endHourUTC: number;
  /** Optional label for this window */
  label?: string;
}

/** Trading window configuration */
export interface TradingWindowConfig {
  /** Whether timing enforcement is enabled */
  enabled: boolean;
  /** Array of allowed trading windows */
  windows: TradingWindow[];
  /** Whether to allow closing existing trades outside windows */
  allowCloseOutsideWindow: boolean;
  /** Whether to show warnings when outside window */
  showWarnings: boolean;
}

/** Result of trading window check */
export interface TradingWindowStatus {
  isAllowed: boolean;
  currentHourUTC: number;
  currentMinuteUTC: number;
  currentWindow: TradingWindow | null;
  nextWindow: TradingWindow | null;
  minutesToNextWindow: number | null;
  message: string;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

/**
 * Default trading windows - OPTIMAL TIMES ONLY
 * Based on Dec 29 - Jan 2 analysis showing these windows are profitable
 */
export const DEFAULT_TRADING_WINDOW_CONFIG: TradingWindowConfig = {
  enabled: true,
  windows: [
    { startHourUTC: 8, endHourUTC: 12, label: 'Morning Window' },   // 08:00-11:59 UTC
    { startHourUTC: 18, endHourUTC: 22, label: 'Evening Window' },  // 18:00-21:59 UTC
  ],
  allowCloseOutsideWindow: true,
  showWarnings: true,
};

// ============================================================================
// TRADING WINDOW CHECKER
// ============================================================================

/**
 * Check if current time is within trading windows
 */
export function checkTradingWindow(
  config: TradingWindowConfig = DEFAULT_TRADING_WINDOW_CONFIG
): TradingWindowStatus {
  // If disabled, always allow
  if (!config.enabled) {
    return {
      isAllowed: true,
      currentHourUTC: new Date().getUTCHours(),
      currentMinuteUTC: new Date().getUTCMinutes(),
      currentWindow: null,
      nextWindow: null,
      minutesToNextWindow: null,
      message: 'Trading window check disabled',
    };
  }

  const now = new Date();
  const currentHourUTC = now.getUTCHours();
  const currentMinuteUTC = now.getUTCMinutes();

  // Check if we're in any trading window
  let currentWindow: TradingWindow | null = null;
  for (const window of config.windows) {
    if (currentHourUTC >= window.startHourUTC && currentHourUTC < window.endHourUTC) {
      currentWindow = window;
      break;
    }
  }

  // If in a window, return allowed
  if (currentWindow) {
    const remainingMinutes = (currentWindow.endHourUTC - currentHourUTC - 1) * 60 + (60 - currentMinuteUTC);
    return {
      isAllowed: true,
      currentHourUTC,
      currentMinuteUTC,
      currentWindow,
      nextWindow: null,
      minutesToNextWindow: null,
      message: `IN ${currentWindow.label || 'trading window'} (${remainingMinutes}m remaining)`,
    };
  }

  // Find next window
  let nextWindow: TradingWindow | null = null;
  let minutesToNext: number | null = null;

  // Sort windows by start time
  const sortedWindows = [...config.windows].sort((a, b) => a.startHourUTC - b.startHourUTC);

  // Find next window today
  for (const window of sortedWindows) {
    if (window.startHourUTC > currentHourUTC) {
      nextWindow = window;
      minutesToNext = (window.startHourUTC - currentHourUTC) * 60 - currentMinuteUTC;
      break;
    }
  }

  // If no window found today, next window is tomorrow's first
  if (!nextWindow && sortedWindows.length > 0) {
    nextWindow = sortedWindows[0];
    minutesToNext = (24 - currentHourUTC + nextWindow.startHourUTC) * 60 - currentMinuteUTC;
  }

  // Format time remaining
  let timeRemaining = '';
  if (minutesToNext !== null) {
    const hours = Math.floor(minutesToNext / 60);
    const mins = minutesToNext % 60;
    timeRemaining = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  }

  return {
    isAllowed: false,
    currentHourUTC,
    currentMinuteUTC,
    currentWindow: null,
    nextWindow,
    minutesToNextWindow: minutesToNext,
    message: nextWindow
      ? `OUTSIDE TRADING WINDOW (${currentHourUTC}:${currentMinuteUTC.toString().padStart(2, '0')} UTC). Next: ${nextWindow.label} at ${nextWindow.startHourUTC}:00 UTC (${timeRemaining})`
      : 'No trading windows configured',
  };
}

/**
 * Get a formatted status string for display
 */
export function getTradingWindowStatusString(
  config: TradingWindowConfig = DEFAULT_TRADING_WINDOW_CONFIG
): string {
  const status = checkTradingWindow(config);

  if (!config.enabled) {
    return '[TIMING: OFF]';
  }

  if (status.isAllowed) {
    return `[TIMING: OK - ${status.currentWindow?.label || 'In Window'}]`;
  }

  return `[TIMING: BLOCKED - ${status.message}]`;
}

/**
 * Check if we should block new trades
 */
export function shouldBlockNewTrades(
  config: TradingWindowConfig = DEFAULT_TRADING_WINDOW_CONFIG
): boolean {
  if (!config.enabled) return false;
  return !checkTradingWindow(config).isAllowed;
}

/**
 * Get time until next trading window in human-readable format
 */
export function getTimeUntilNextWindow(
  config: TradingWindowConfig = DEFAULT_TRADING_WINDOW_CONFIG
): string | null {
  const status = checkTradingWindow(config);

  if (status.isAllowed || status.minutesToNextWindow === null) {
    return null;
  }

  const hours = Math.floor(status.minutesToNextWindow / 60);
  const mins = status.minutesToNextWindow % 60;

  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}
