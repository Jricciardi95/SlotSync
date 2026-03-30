/**
 * Frontend Logger Utility
 * 
 * Provides a lightweight logging utility that respects production builds.
 * - debug/info: Only log in __DEV__ mode (development)
 * - warn/error: Always log (even in production)
 * 
 * Usage:
 *   import { logger } from '../utils/logger';
 *   logger.debug('Detailed debug info');
 *   logger.info('General information');
 *   logger.warn('Warning message');
 *   logger.error('Error message');
 */

const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';

export const logger = {
  /**
   * Debug level logging - only shown in development
   */
  debug(...args: unknown[]): void {
    if (isDev) {
      console.log(...args);
    }
  },

  /**
   * Info level logging - only shown in development
   */
  info(...args: unknown[]): void {
    if (isDev) {
      console.info(...args);
    }
  },

  /**
   * Warn level logging - always shown (even in production)
   */
  warn(...args: unknown[]): void {
    console.warn(...args);
  },

  /**
   * Error level logging - always shown (even in production)
   */
  error(...args: unknown[]): void {
    console.error(...args);
  },
};

