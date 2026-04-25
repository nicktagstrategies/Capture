import type { RequestHandler } from 'express';
import { verifyAccessToken } from '../services/tokens.js';
import { HttpError } from './errorHandler.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    return next(new HttpError(401, 'Missing bearer token', 'unauthenticated'));
  }
  try {
    const payload = verifyAccessToken(header.slice('Bearer '.length));
    req.userId = payload.sub;
    next();
  } catch {
    next(new HttpError(401, 'Invalid or expired token', 'unauthenticated'));
  }
};
