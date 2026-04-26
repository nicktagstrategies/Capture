import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { claimReferralCode, mintReferralCodeForUser } from '../services/referrals.js';

export const referralsRouter = Router();

/**
 * GET /referrals/me — caller's referral code, balance, and a count of who's
 * signed up using the code so the share sheet can show "you've referred N
 * friends."
 */
referralsRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    let user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { id: true, referralCode: true, referralCreditCents: true },
    });
    if (!user) throw new HttpError(404, 'User not found', 'not_found');
    // Backfill on first read for legacy users; cheaper than a one-time migration.
    if (!user.referralCode) {
      const code = await mintReferralCodeForUser(user.id);
      user = { ...user, referralCode: code };
    }
    const sentCount = await prisma.referral.count({ where: { referrerId: user.id } });
    res.json({
      code: user.referralCode,
      creditCents: user.referralCreditCents,
      referralsSent: sentCount,
    });
  } catch (err) {
    next(err);
  }
});

const ClaimBody = z.object({ code: z.string().min(1).max(20) });

/**
 * POST /referrals/claim — for users who didn't paste a code at signup. Awards
 * credit to both sides on success. Idempotent per referee: a second claim
 * (any code) returns 409.
 */
referralsRouter.post('/claim', requireAuth, async (req, res, next) => {
  try {
    const body = ClaimBody.parse(req.body);
    const result = await claimReferralCode(req.userId!, body.code);
    if (!result.ok) {
      const status = result.reason === 'already_claimed' ? 409 : 400;
      throw new HttpError(status, result.reason, result.reason);
    }
    res.status(201).json({
      creditCents: result.creditCents,
      referrerId: result.referrerId,
    });
  } catch (err) {
    next(err);
  }
});
