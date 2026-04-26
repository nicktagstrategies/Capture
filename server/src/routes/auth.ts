import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../middleware/errorHandler.js';
import { consumeRefreshToken, issueRefreshToken, signAccessToken } from '../services/tokens.js';
import { verifyAppleIdToken } from '../services/appleAuth.js';
import { verifyGoogleIdToken } from '../services/googleAuth.js';
import { mintReferralCodeForUser, claimReferralCode } from '../services/referrals.js';
import { logger } from '../lib/logger.js';

export const authRouter = Router();

/**
 * Best-effort: assign a referral code if the user doesn't have one yet, and
 * (if a referrer code was passed) record the inbound referral. We swallow
 * errors here so a flaky referral system never blocks signup — referrals are
 * a nice-to-have, sessions are core.
 */
async function attachReferralArtifacts(userId: string, claimedCode: string | undefined) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true },
    });
    if (!user?.referralCode) {
      await mintReferralCodeForUser(userId);
    }
    if (claimedCode) {
      const result = await claimReferralCode(userId, claimedCode);
      if (!result.ok) {
        logger.info({ userId, reason: result.reason }, 'referral claim rejected');
      }
    }
  } catch (err) {
    logger.warn({ err, userId }, 'attachReferralArtifacts failed');
  }
}

async function issueSessionForUser(userId: string) {
  const [accessToken, refreshToken] = await Promise.all([
    Promise.resolve(signAccessToken(userId)),
    issueRefreshToken(userId),
  ]);
  return { accessToken, refreshToken };
}

function userToSession(user: { id: string; email: string; name: string; role: string; avatarUrl: string | null }) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    avatarUrl: user.avatarUrl,
  };
}

const EmailSignupBody = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(80),
  referralCode: z.string().min(1).max(20).optional(),
});

authRouter.post('/email/signup', async (req, res, next) => {
  try {
    const body = EmailSignupBody.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) throw new HttpError(409, 'Email already in use', 'email_taken');
    const user = await prisma.user.create({
      data: {
        email: body.email,
        name: body.name,
        passwordHash: await bcrypt.hash(body.password, 10),
      },
    });
    await attachReferralArtifacts(user.id, body.referralCode);
    const session = await issueSessionForUser(user.id);
    res.status(201).json({ ...session, user: userToSession(user) });
  } catch (err) {
    next(err);
  }
});

const EmailLoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post('/email/login', async (req, res, next) => {
  try {
    const body = EmailLoginBody.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user?.passwordHash || !(await bcrypt.compare(body.password, user.passwordHash))) {
      throw new HttpError(401, 'Invalid email or password', 'invalid_credentials');
    }
    // Backfill referral code for legacy accounts that signed up before codes existed.
    await attachReferralArtifacts(user.id, undefined);
    const session = await issueSessionForUser(user.id);
    res.json({ ...session, user: userToSession(user) });
  } catch (err) {
    next(err);
  }
});

const AppleBody = z.object({
  idToken: z.string().min(1),
  name: z.string().optional(),
  referralCode: z.string().min(1).max(20).optional(),
});

authRouter.post('/apple', async (req, res, next) => {
  try {
    const body = AppleBody.parse(req.body);
    const claims = await verifyAppleIdToken(body.idToken);
    const user = await prisma.user.upsert({
      where: { appleSub: claims.sub },
      update: {},
      create: {
        appleSub: claims.sub,
        email: claims.email ?? `${claims.sub}@privaterelay.appleid.com`,
        name: body.name ?? 'Capture User',
      },
    });
    await attachReferralArtifacts(user.id, body.referralCode);
    const session = await issueSessionForUser(user.id);
    res.json({ ...session, user: userToSession(user) });
  } catch (err) {
    next(err);
  }
});

const GoogleBody = z.object({
  idToken: z.string().min(1),
  referralCode: z.string().min(1).max(20).optional(),
});

authRouter.post('/google', async (req, res, next) => {
  try {
    const body = GoogleBody.parse(req.body);
    const claims = await verifyGoogleIdToken(body.idToken);
    const user = await prisma.user.upsert({
      where: { googleSub: claims.sub },
      update: {
        name: claims.name ?? undefined,
        avatarUrl: claims.picture ?? undefined,
      },
      create: {
        googleSub: claims.sub,
        email: claims.email ?? `${claims.sub}@google.capture.test`,
        name: claims.name ?? 'Capture User',
        avatarUrl: claims.picture ?? null,
      },
    });
    await attachReferralArtifacts(user.id, body.referralCode);
    const session = await issueSessionForUser(user.id);
    res.json({ ...session, user: userToSession(user) });
  } catch (err) {
    next(err);
  }
});

const RefreshBody = z.object({ refreshToken: z.string().min(1) });

authRouter.post('/refresh', async (req, res, next) => {
  try {
    const body = RefreshBody.parse(req.body);
    const userId = await consumeRefreshToken(body.refreshToken);
    const session = await issueSessionForUser(userId);
    res.json(session);
  } catch {
    next(new HttpError(401, 'Invalid refresh token', 'invalid_refresh_token'));
  }
});
