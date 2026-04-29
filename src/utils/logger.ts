/**
 * Central logging for SlotSync.
 *
 * - debug / info / verbose: development only (__DEV__)
 * - warn: development only (avoid noisy production consoles)
 * - error: always emits a short line in production (no huge objects / URLs by default)
 * - captureException: use for caught errors you might send to Sentry later
 */

type LogContext = Record<string, unknown> | undefined;

const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';

function shortProdMessage(args: unknown[]): string {
  const first = args[0];
  if (typeof first === 'string') return first;
  if (first instanceof Error) return first.message;
  try {
    return JSON.stringify(first).slice(0, 200);
  } catch {
    return '[unserializable]';
  }
}

export const logger = {
  debug(...args: unknown[]): void {
    if (isDev) {
      console.log(...args);
    }
  },

  info(...args: unknown[]): void {
    if (isDev) {
      console.info(...args);
    }
  },

  /** Verbose traces (e.g. navigation). Dev-only. */
  verbose(...args: unknown[]): void {
    if (isDev) {
      console.log(...args);
    }
  },

  warn(...args: unknown[]): void {
    if (isDev) {
      console.warn(...args);
    }
  },

  error(...args: unknown[]): void {
    if (isDev) {
      console.error(...args);
      return;
    }
    console.error('[SlotSync]', shortProdMessage(args));
  },

  /**
   * Use for non-fatal errors you may forward to crash reporting (Sentry, etc.).
   * In production, logs a single sanitized line unless you wire `global.__SLOTSYNC_REPORT_ERROR__`.
   */
  captureException(error: unknown, context?: LogContext): void {
    if (isDev) {
      console.error('[captureException]', context, error);
      return;
    }
    const reporter = (globalThis as { __SLOTSYNC_REPORT_ERROR__?: (e: unknown, c?: LogContext) => void })
      .__SLOTSYNC_REPORT_ERROR__;
    if (typeof reporter === 'function') {
      try {
        reporter(error, context);
      } catch {
        /* ignore */
      }
      return;
    }
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[SlotSync]', context?.screen ?? 'error', msg.slice(0, 300));
  },
};
