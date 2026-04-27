import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { dispatchPush } from './notifications.js';
import { nextRoleAfterOnboarding } from './onboardingState.js';

/**
 * Idempotently marks a photographer as fully onboarded:
 *  - sets `onboardingCompletedAt` (no-op if already set)
 *  - flips `User.role` per `onboardingState.nextRoleAfterOnboarding`
 *  - fires a one-time `booking_confirmed`-style push (kind:
 *    `booking_confirmed` is reused as the closest match — Notification kinds
 *    are intentionally coarse for V1)
 *
 * Called from the Stripe `account.updated` webhook and from the dev-bypass
 * simulator. Webhook redelivery is safe — the role transition is a no-op the
 * second time and the push only fires when the timestamp was previously null.
 */
export async function applyOnboardingComplete(profileId: string): Promise<void> {
  const profile = await prisma.photographerProfile.findUnique({
    where: { id: profileId },
    select: {
      id: true,
      userId: true,
      onboardingCompletedAt: true,
      user: { select: { role: true } },
    },
  });
  if (!profile) {
    logger.warn({ profileId }, 'applyOnboardingComplete: profile not found');
    return;
  }
  if (profile.onboardingCompletedAt) {
    return;
  }

  const priorBookings = await prisma.booking.count({
    where: { customerId: profile.userId },
  });
  const newRole = nextRoleAfterOnboarding({
    currentRole: profile.user.role,
    hasPriorCustomerBookings: priorBookings > 0,
  });

  await prisma.$transaction([
    prisma.photographerProfile.update({
      where: { id: profile.id },
      data: { onboardingCompletedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: profile.userId },
      data: { role: newRole },
    }),
  ]);

  void dispatchPush({
    recipientId: profile.userId,
    kind: 'booking_confirmed',
    title: "You're ready to take bookings",
    body: 'Your photographer account is live. Set your services and availability to get discovered.',
    payload: { type: 'onboarding_complete', photographerId: profile.id },
  });
}
