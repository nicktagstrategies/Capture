import type { RequestHandler, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

/**
 * Persists the response body of unsafe requests keyed by (userId, Idempotency-Key)
 * so retries replay the original outcome instead of producing a second side effect
 * (e.g., a duplicate Stripe PaymentIntent on a double-tapped Book Now).
 *
 * Usage:
 *   router.post('/path', requireAuth, idempotent(), handler)
 *
 * Behavior:
 *   - No header? Pass through unchanged.
 *   - Header + cached entry? Replay the cached status + body.
 *   - Header + no cache? Capture the response and persist it on success (2xx only).
 */
export function idempotent(): RequestHandler {
  return async (req, res, next) => {
    const key = req.header('idempotency-key');
    if (!key || !req.userId) return next();

    const existing = await prisma.idempotencyKey.findUnique({
      where: { userId_key: { userId: req.userId, key } },
    });
    if (existing) {
      res.status(existing.statusCode).type('application/json').send(existing.responseBody);
      return;
    }

    captureResponse(res, async (statusCode, body) => {
      if (statusCode < 200 || statusCode >= 300) return;
      try {
        await prisma.idempotencyKey.create({
          data: {
            userId: req.userId!,
            key,
            method: req.method,
            path: req.path,
            statusCode,
            responseBody: body,
          },
        });
      } catch (err) {
        // Race: another request with the same key won; that's fine — both
        // responses are equivalent.
        logger.debug({ err, key }, 'idempotency persist race');
      }
    });

    next();
  };
}

function captureResponse(
  res: Response,
  onFinish: (status: number, body: string) => void | Promise<void>,
): void {
  const chunks: Buffer[] = [];
  const originalWrite = res.write.bind(res);
  const originalEnd = res.end.bind(res);

  res.write = ((chunk: unknown, ...rest: unknown[]) => {
    if (chunk) chunks.push(toBuffer(chunk));
    return (originalWrite as Function)(chunk, ...rest);
  }) as typeof res.write;

  res.end = ((chunk?: unknown, ...rest: unknown[]) => {
    if (chunk) chunks.push(toBuffer(chunk));
    const body = Buffer.concat(chunks).toString('utf8');
    void onFinish(res.statusCode, body);
    return (originalEnd as Function)(chunk, ...rest);
  }) as typeof res.end;
}

function toBuffer(chunk: unknown): Buffer {
  if (Buffer.isBuffer(chunk)) return chunk;
  if (typeof chunk === 'string') return Buffer.from(chunk, 'utf8');
  return Buffer.from(String(chunk), 'utf8');
}
