import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const photographersRouter = Router();

const SearchQuery = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().positive().max(100).default(25),
  category: z.string().optional(),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

interface SearchRow {
  id: string;
  name: string;
  avatarUrl: string | null;
  heroImageUrl: string | null;
  homeCity: string;
  timezone: string;
  bio: string | null;
  hourlyRateCents: number;
  avgRating: number;
  ratingCount: number;
  distanceMeters: number;
}

photographersRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const q = SearchQuery.parse(req.query);
    // PostGIS radius search. Joins User for display name + avatar.
    const rows = await prisma.$queryRawUnsafe<SearchRow[]>(
      `
      SELECT
        p.id,
        u.name,
        u."avatarUrl" AS "avatarUrl",
        p."heroImageUrl" AS "heroImageUrl",
        p."homeCity" AS "homeCity",
        p.timezone,
        p.bio,
        p."hourlyRateCents" AS "hourlyRateCents",
        p."avgRating" AS "avgRating",
        p."ratingCount" AS "ratingCount",
        ST_Distance(p."searchLocation", ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS "distanceMeters"
      FROM "PhotographerProfile" p
      JOIN "User" u ON u.id = p."userId"
      WHERE p."searchLocation" IS NOT NULL
        AND ST_DWithin(
          p."searchLocation",
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
          $3
        )
      ORDER BY "distanceMeters" ASC
      LIMIT $4
      `,
      q.lng,
      q.lat,
      q.radiusKm * 1000,
      q.limit,
    );
    res.json({ photographers: rows });
  } catch (err) {
    next(err);
  }
});

photographersRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const profile = await prisma.photographerProfile.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { id: true, name: true, avatarUrl: true } },
        services: { where: { active: true }, orderBy: { priceCents: 'asc' } },
      },
    });
    if (!profile) throw new HttpError(404, 'Photographer not found', 'not_found');
    res.json({
      id: profile.id,
      name: profile.user.name,
      avatarUrl: profile.user.avatarUrl,
      heroImageUrl: profile.heroImageUrl,
      homeCity: profile.homeCity,
      timezone: profile.timezone,
      bio: profile.bio,
      hourlyRateCents: profile.hourlyRateCents,
      avgRating: profile.avgRating,
      ratingCount: profile.ratingCount,
      services: profile.services.map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        durationMinutes: s.durationMinutes,
        priceCents: s.priceCents,
        category: s.category,
      })),
    });
  } catch (err) {
    next(err);
  }
});

const AvailabilityQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

photographersRouter.get('/:id/availability', requireAuth, async (req, res, next) => {
  try {
    const q = AvailabilityQuery.parse(req.query);
    const from = q.from ?? new Date();
    const to = q.to ?? new Date(from.getTime() + 14 * 24 * 60 * 60 * 1000);
    const slots = await prisma.availabilitySlot.findMany({
      where: {
        photographerId: req.params.id,
        status: 'open',
        startsAt: { gte: from, lt: to },
      },
      orderBy: { startsAt: 'asc' },
      select: { id: true, startsAt: true, endsAt: true },
    });
    res.json({ slots });
  } catch (err) {
    next(err);
  }
});

const ReviewsQuery = z.object({
  limit: z.coerce.number().int().positive().max(50).default(20),
});

photographersRouter.get('/:id/reviews', requireAuth, async (req, res, next) => {
  try {
    const q = ReviewsQuery.parse(req.query);
    // The Review table joins to Booking, which joins to the customer's User.
    // We avoid leaking the customer's email by only selecting name + avatar.
    const reviews = await prisma.review.findMany({
      where: { booking: { photographerId: req.params.id } },
      orderBy: { createdAt: 'desc' },
      take: q.limit,
      include: {
        booking: {
          select: {
            customer: { select: { name: true, avatarUrl: true } },
            service: { select: { title: true } },
            startsAt: true,
          },
        },
      },
    });
    res.json({
      reviews: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        body: r.body,
        createdAt: r.createdAt,
        customer: {
          name: r.booking.customer.name,
          avatarUrl: r.booking.customer.avatarUrl,
        },
        serviceTitle: r.booking.service.title,
        sessionDate: r.booking.startsAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});
