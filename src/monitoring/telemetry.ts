import * as Sentry from '@sentry/react-native';
import { logger } from '../utils/logger';

type EventPayload = Record<string, unknown>;

/**
 * Minimal beta telemetry for scan loop quality.
 * Avoids broad analytics setup; logs locally and drops breadcrumbs to Sentry when enabled.
 */
export function trackBetaEvent(event: string, data: EventPayload = {}): void {
  logger.info(`[telemetry] ${event}`, data);
  try {
    Sentry.addBreadcrumb({
      category: 'beta-flow',
      message: event,
      level: 'info',
      data,
    });
  } catch {
    // Sentry may be disabled in dev or when DSN is unset.
  }
}
