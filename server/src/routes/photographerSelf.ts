import { Router } from 'express';
import { z } from 'zod';
import type { ServiceCategory } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { createConnectAccount, createAccountLink } from '../services/connect.js';
import { findOverlap, validateSlot } from '../services/availability.js';
import { logger } from '../lib/logger.js';
import { env } from '../lib/env.js';

export const photographerSelfRouter = Router();

const SERVICE_CATEGORIES = [
  'portrait',
  'wedding',
  'wedding_video',
  'event',
  'family',
  'headshot',
  'other',
] as const satisfies readonly ServiceCategory[];

/**
 * Loads the caller's photographer profile. Throws if they don't have one —
 * which is what we want for everything except `onboarding/start`, which
 * lazily creates the row.
 */
async function loadProfile(userId: string) {
  const profile = await prisma.photographerProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      userId: true,
      bio: true,
      homeCity: true,
      homeAddress: true,
      heroImageUrl: true,
      hourlyRateCents: true,
      timezone: true,
      stripeAccountId: true,
      onboardingStartedAt: true,
      onboardingCompletedAt: true,
      avgRating: true,
      ratingCount: true,
    },
  });
  if (!profile) throw new HttpError(404, 'Photographer profile not found', 'not_a_photographer');
  return profile;
}

/**
 * POST /me/photographer/onboarding/start — idempotent. Lazily creates the
 * profile row + Stripe Connect account on first call; on subsequent calls
 * it just mints a fresh account link.
 */
photographerSelfRouter.post('/onboarding/start', requireAuth, async (req, res, next) => {
  try {
    const userId = req.userId!;
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, photographerProfile: { select: { id: true, stripeAccountId: true } } },
    });

    let stripeAccountId = user.photographerProfile?.stripeAccountId ?? null;
    if (!stripeAccountId) {
      stripeAccountId = await createConnectAccount({ userId, email: user.email });
    }

    // Upsert ensures we don't blow up if the profile exists but lacks a Stripe account.
    const profile = await prisma.photographerProfile.upsert({
      where: { userId },
      update: {
        stripeAccountId,
        onboardingStartedAt: user.photographerProfile ? undefined : new Date(),
      },
      create: {
        userId,
        // We don't know the photographer's home city yet — they fill it in
        // via PATCH /me/photographer once they're back from Stripe. Use a
        // placeholder that the iOS app rewrites; PostGIS searchLocation is
        // null until they set a city, so they're not visible in search yet.
        homeCity: 'Unspecified',
        stripeAccountId,
        onboardingStartedAt: new Date(),
      },
      select: { id: true },
    });

    const link = await createAccountLink({ accountId: stripeAccountId });

    // Bypass-mode: simulate the Stripe `account.updated` webhook a few seconds
    // out so the iOS dashboard transitions on its own without a real Stripe
    // round-trip. This keeps the dev loop entirely local.
    if (env.STRIPE_CONNECT_DEV_BYPASS) {
      setTimeout(() => {
        void simulateOnboardingComplete(profile.id).catch((err) =>
          logger.error({ err, profileId: profile.id }, 'bypass onboarding sim failed'),
        );
      }, 5_000).unref();
    }

    res.json({
      stripeAccountId,
      accountLinkUrl: link.accountLinkUrl,
      expiresAt: link.expiresAt,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Bypass-mode helper. Mirrors what the real webhook does — flips the user
 * role + sets `onboardingCompletedAt` — without going through Stripe.
 */
async function simulateOnboardingComplete(profileId: string) {
  const { applyOnboardingComplete } = await import('../services/applyOnboardingComplete.js');
  await applyOnboardingComplete(profileId);
}

photographerSelfRouter.post('/onboarding/refresh-link', requireAuth, async (req, res, next) => {
  try {
    const profile = await loadProfile(req.userId!);
    if (!profile.stripeAccountId) {
      throw new HttpError(409, 'Onboarding has not been started', 'onboarding_not_started');
    }
    const link = await createAccountLink({ accountId: profile.stripeAccountId });
    res.json({ accountLinkUrl: link.accountLinkUrl, expiresAt: link.expiresAt });
  } catch (err) {
    next(err);
  }
});

photographerSelfRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const profile = await loadProfile(req.userId!);
    res.json(profile);
  } catch (err) {
    next(err);
  }
});

const ProfilePatchBody = z.object({
  bio: z.string().max(2000).optional(),
  homeCity: z.string().min(1).max(100).optional(),
  homeAddress: z.string().max(300).optional(),
  heroImageUrl: z.string().url().optional(),
  hourlyRateCents: z.number().int().nonnegative().max(1_000_000).optional(),
  timezone: z.string().min(1).max(60).optional(),
});

photographerSelfRouter.patch('/', requireAuth, async (req, res, next) => {
  try {
    const body = ProfilePatchBody.parse(req.body);
    const profile = await loadProfile(req.userId!);
    const updated = await prisma.photographerProfile.update({
      where: { id: profile.id },
      data: body,
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

const ServiceCreateBody = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(2000).optional(),
  durationMinutes: z.number().int().min(5).max(60 * 24),
  priceCents: z.number().int().nonnegative().max(10_000_00),
  category: z.enum(SERVICE_CATEGORIES),
});

photographerSelfRouter.post('/services', requireAuth, async (req, res, next) => {
  try {
    const body = ServiceCreateBody.parse(req.body);
    const profile = await loadProfile(req.userId!);
    const service = await prisma.service.create({
      data: { ...body, photographerId: profile.id },
    });
    res.status(201).json(service);
  } catch (err) {
    next(err);
  }
});

const ServicePatchBody = ServiceCreateBody.partial().extend({
  active: z.boolean().optional(),
});

photographerSelfRouter.patch('/services/:id', requireAuth, async (req, res, next) => {
  try {
    const body = ServicePatchBody.parse(req.body);
    const profile = await loadProfile(req.userId!);
    const existing = await prisma.service.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.photographerId !== profile.id) {
      throw new HttpError(404, 'Service not found', 'not_found');
    }
    const updated = await prisma.service.update({ where: { id: existing.id }, data: body });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

photographerSelfRouter.delete('/services/:id', requireAuth, async (req, res, next) => {
  try {
    const profile = await loadProfile(req.userId!);
    const existing = await prisma.service.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.photographerId !== profile.id) {
      throw new HttpError(404, 'Service not found', 'not_found');
    }
    // Soft delete — Booking rows reference Service by id, so we keep the row
    // around for receipts + history. `active=false` hides it from search.
    const futureBookings = await prisma.booking.count({
      where: {
        serviceId: existing.id,
        status: { in: ['pending', 'confirmed'] },
        startsAt: { gt: new Date() },
      },
    });
    if (futureBookings > 0) {
      throw new HttpError(409, 'Service has upcoming bookings — cancel them first', 'has_future_bookings');
    }
    await prisma.service.update({ where: { id: existing.id }, data: { active: false } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

const SlotsCreateBody = z.object({
  slots: z
    .array(
      z.object({
        startsAt: z.coerce.date(),
        endsAt: z.coerce.date(),
      }),
    )
    .min(1)
    .max(50),
});

photographerSelfRouter.post('/availability/slots', requireAuth, async (req, res, next) => {
  try {
    const body = SlotsCreateBody.parse(req.body);
    const profile = await loadProfile(req.userId!);

    for (const s of body.slots) {
      const v = validateSlot(s);
      if (!v.ok) {
        const code = v.reason === 'invalid_range' ? 'invalid_slot_range' : 'invalid_slot_past';
        const message = v.reason === 'invalid_range'
          ? 'Slot endsAt must be after startsAt'
          : 'Cannot create slots in the past';
        throw new HttpError(400, message, code);
      }
    }

    // Reject if any new slot overlaps an existing slot. All slot statuses
    // (open / held / booked) block new overlapping slots — the photographer
    // can't double-book themselves regardless of whether a customer has paid.
    const existing = await prisma.availabilitySlot.findMany({
      where: {
        photographerId: profile.id,
        // Bound the search window so this stays a small read; widest possible
        // start before any new slot's end, narrowest possible end after any
        // new slot's start.
        endsAt: { gt: new Date(Math.min(...body.slots.map((s) => s.startsAt.getTime()))) },
        startsAt: { lt: new Date(Math.max(...body.slots.map((s) => s.endsAt.getTime()))) },
      },
      select: { startsAt: true, endsAt: true },
    });
    if (findOverlap(body.slots, existing)) {
      throw new HttpError(409, 'Slot overlaps existing availability', 'slot_overlap');
    }
    // Within-batch overlap check (catches the case where a single request
    // creates two slots that overlap each other).
    for (let i = 0; i < body.slots.length; i++) {
      for (let j = i + 1; j < body.slots.length; j++) {
        if (findOverlap([body.slots[i]!], [body.slots[j]!])) {
          throw new HttpError(409, 'Two slots in the same batch overlap', 'slot_overlap');
        }
      }
    }

    const created = await prisma.availabilitySlot.createManyAndReturn({
      data: body.slots.map((s) => ({
        photographerId: profile.id,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
      })),
      select: { id: true, startsAt: true, endsAt: true, status: true },
    });
    res.status(201).json({ slots: created });
  } catch (err) {
    next(err);
  }
});

photographerSelfRouter.delete('/availability/slots/:id', requireAuth, async (req, res, next) => {
  try {
    const profile = await loadProfile(req.userId!);
    const existing = await prisma.availabilitySlot.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.photographerId !== profile.id) {
      throw new HttpError(404, 'Slot not found', 'not_found');
    }
    if (existing.status !== 'open') {
      throw new HttpError(409, 'Only open slots can be deleted', 'slot_not_open');
    }
    await prisma.availabilitySlot.delete({ where: { id: existing.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
