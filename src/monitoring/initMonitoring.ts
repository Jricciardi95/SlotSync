/**
 * Sentry for preview/production release builds only (__DEV__ stays quiet).
 *
 * Setup:
 * 1. Create a project at https://sentry.io (React Native).
 * 2. EAS: `eas secret:create --name EXPO_PUBLIC_SENTRY_DSN --value https://...@....ingest.sentry.io/...`
 *    Or add EXPO_PUBLIC_SENTRY_DSN to the `env` block of `preview` / `production` in eas.json.
 * 3. Rebuild the native app after changing DSN (Expo prebuild embeds config).
 *
 * Optional source maps: set SENTRY_AUTH_TOKEN in EAS and follow Sentry’s Expo upload docs.
 */

import * as Sentry from '@sentry/react-native';
import { logger } from '../utils/logger';

let initialized = false;

export function isMonitoringReady(): boolean {
  return initialized;
}

export function initMonitoring(): void {
  if (__DEV__) {
    logger.debug('[monitoring] Sentry off in __DEV__');
    return;
  }

  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();
  if (!dsn) {
    logger.debug('[monitoring] No EXPO_PUBLIC_SENTRY_DSN — crash reporting disabled');
    return;
  }

  Sentry.init({
    dsn,
    enableAutoSessionTracking: true,
    tracesSampleRate: 0.05,
    attachStacktrace: true,
  });

  (globalThis as { __SLOTSYNC_REPORT_ERROR__?: (e: unknown, c?: Record<string, unknown>) => void }).__SLOTSYNC_REPORT_ERROR__ = (
    error: unknown,
    context?: Record<string, unknown>
  ) => {
    Sentry.captureException(error, { extra: context as Record<string, string> });
  };

  initialized = true;
  logger.debug('[monitoring] Sentry initialized');
}
