import { prisma } from '../lib/prisma.js';
import { env } from '../lib/env.js';

/// 6-char codes drawn from a 32-char alphabet (no I, O, 0, 1 to avoid the
/// "is that a one or an L?" support tickets). 32^6 ≈ 1B → effectively
/// unique at our scale; the @unique constraint catches the rest.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

export function generateReferralCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

/**
 * Atomically assigns a referral code to a user. Retries up to 5 times if the
 * randomly-drawn code collides with an existing one. After 5 collisions
 * something is very wrong (the keyspace is a billion entries) and we throw.
 */
export async function mintReferralCodeForUser(userId: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode();
    try {
      const updated = await prisma.user.update({
        where: { id: userId },
        data: { referralCode: code },
      });
      return updated.referralCode!;
    } catch (err) {
      // P2002 is Prisma's unique-constraint violation. Anything else bubbles up.
      if ((err as { code?: string }).code !== 'P2002') throw err;
      // Otherwise: try a fresh code on the next loop iteration.
    }
  }
  throw new Error('Failed to mint a unique referral code after 5 attempts');
}

export type ClaimResult =
  | { ok: true; creditCents: number; referrerId: string }
  | { ok: false; reason: 'unknown_code' | 'self_referral' | 'already_claimed' };

/**
 * Claims a referral code on behalf of `refereeId`. On success both sides get
 * `REFERRAL_CREDIT_CENTS` added to their balance. Idempotent per referee:
 * a second claim with any code returns `already_claimed`.
 */
export async function claimReferralCode(refereeId: string, code: string): Promise<ClaimResult> {
  const normalizedCode = code.trim().toUpperCase();
  return await prisma.$transaction(async (tx) => {
    // Block double-claims first so we never inflate balances if someone calls
    // the endpoint twice with two different valid codes.
    const existing = await tx.referral.findFirst({ where: { refereeId } });
    if (existing) return { ok: false as const, reason: 'already_claimed' as const };

    const referrer = await tx.user.findUnique({ where: { referralCode: normalizedCode } });
    if (!referrer) return { ok: false as const, reason: 'unknown_code' as const };
    if (referrer.id === refereeId) return { ok: false as const, reason: 'self_referral' as const };

    const credit = env.REFERRAL_CREDIT_CENTS;
    await tx.referral.create({
      data: {
        referrerId: referrer.id,
        refereeId,
        code: normalizedCode,
        creditCents: credit,
        status: 'signed_up',
      },
    });
    await tx.user.update({
      where: { id: referrer.id },
      data: { referralCreditCents: { increment: credit } },
    });
    await tx.user.update({
      where: { id: refereeId },
      data: { referralCreditCents: { increment: credit } },
    });
    return { ok: true as const, creditCents: credit, referrerId: referrer.id };
  });
}

/**
 * How much referral credit to actually apply to a booking. Caps at the
 * application fee (= customer fee + commission) so the marketplace's cost is
 * always at most "we gave back our take." Photographer always receives full
 * subtotal regardless of credit applied.
 */
export function applicableReferralCredit(args: {
  availableCreditCents: number;
  applicationFeeCents: number;
}): number {
  return Math.max(0, Math.min(args.availableCreditCents, args.applicationFeeCents));
}
