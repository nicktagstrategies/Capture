import rateLimit from 'express-rate-limit';

/**
 * In-memory rate limits. For production with horizontally-scaled servers,
 * swap the store for `rate-limit-redis` against the Redis instance in compose.
 */

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many auth attempts, slow down.' },
});

export const bookingRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'rate_limited' },
});
