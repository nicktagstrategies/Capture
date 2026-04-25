import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../lib/env.js';
import { prisma } from '../lib/prisma.js';

export interface AccessTokenPayload {
  sub: string;
  typ: 'access';
}

export function signAccessToken(userId: string): string {
  const payload: AccessTokenPayload = { sub: userId, typ: 'access' };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL_SECONDS,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
  if (decoded.typ !== 'access') throw new Error('wrong token type');
  return decoded;
}

function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function issueRefreshToken(userId: string): Promise<string> {
  const raw = crypto.randomBytes(48).toString('hex');
  const expiresAt = new Date(Date.now() + env.JWT_REFRESH_TTL_SECONDS * 1000);
  await prisma.refreshToken.create({
    data: { userId, tokenHash: hashRefreshToken(raw), expiresAt },
  });
  return raw;
}

export async function consumeRefreshToken(raw: string): Promise<string> {
  const hash = hashRefreshToken(raw);
  const record = await prisma.refreshToken.findUnique({ where: { tokenHash: hash } });
  if (!record || record.revokedAt || record.expiresAt < new Date()) {
    throw new Error('invalid refresh token');
  }
  // Rotate: revoke the consumed token, caller issues a fresh one.
  await prisma.refreshToken.update({
    where: { id: record.id },
    data: { revokedAt: new Date() },
  });
  return record.userId;
}
