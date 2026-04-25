import * as Sentry from '@sentry/node';
import type { Express } from 'express';
import { env } from './env.js';
import { logger } from './logger.js';

/**
 * Sentry is opt-in via env. Without `SENTRY_DSN` we no-op so local dev and CI
 * don't pollute a real project. The Express SDK auto-instruments incoming
 * requests once we call `setupExpressErrorHandler` after the routes.
 */
export function initSentry(): void {
  if (!env.SENTRY_DSN) {
    logger.info('Sentry disabled (no SENTRY_DSN)');
    return;
  }
  Sentry.init({
    dsn: env.SENTRY_DSN,
    release: env.SENTRY_RELEASE,
    environment: env.SENTRY_ENVIRONMENT,
    tracesSampleRate: env.SENTRY_ENVIRONMENT === 'production' ? 0.1 : 1.0,
  });
  logger.info({ environment: env.SENTRY_ENVIRONMENT }, 'Sentry initialized');
}

export function attachSentryToExpress(app: Express): void {
  if (!env.SENTRY_DSN) return;
  Sentry.setupExpressErrorHandler(app);
}

export { Sentry };
