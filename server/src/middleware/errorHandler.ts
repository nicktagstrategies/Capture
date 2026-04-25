import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { logger } from '../lib/logger.js';
import { Sentry } from '../lib/sentry.js';

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'validation_error', issues: err.flatten() });
    return;
  }
  if (err instanceof HttpError) {
    // 4xx are expected; we log but don't ping Sentry.
    res.status(err.status).json({ error: err.code ?? 'error', message: err.message });
    return;
  }
  logger.error({ err }, 'unhandled error');
  Sentry.captureException(err);
  res.status(500).json({ error: 'internal_error' });
};
