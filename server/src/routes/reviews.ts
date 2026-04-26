import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { foldRating } from '../services/reviews.js';

export const reviewsRouter = Router();

const CreateReviewBody = z.object({
  bookingId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  body: z.string().max(2000).optional(),
});

/**
 * POST /reviews — customer leaves a 1–5 star review on their own booking.
 *
 * One review per booking (enforced by `Review.bookingId @unique`). We update
 * the photographer's `avgRating` + `ratingCount` aggregate inline so search
 * results stay current without a recompute pass; the math is done from the
 * old aggregate to avoid scanning all reviews on every write.
 */
reviewsRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const body = CreateReviewBody.parse(req.body);
    const review = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: body.bookingId },
        include: { photographer: { select: { id: true, avgRating: true, ratingCount: true } } },
      });
      if (!booking) throw new HttpError(404, 'Booking not found', 'not_found');
      if (booking.customerId !== req.userId) {
        throw new HttpError(403, 'Only the customer can leave a review', 'forbidden');
      }
      // Reviews are only meaningful after the session happened. Allow
      // `confirmed` (Stripe paid + slot booked) too, since the `completed`
      // flip depends on a webhook that may lag.
      if (booking.status !== 'confirmed' && booking.status !== 'completed') {
        throw new HttpError(409, 'Booking is not eligible for a review yet', 'bad_state');
      }
      const existing = await tx.review.findUnique({ where: { bookingId: booking.id } });
      if (existing) {
        throw new HttpError(409, 'Booking already has a review', 'already_reviewed');
      }
      const created = await tx.review.create({
        data: {
          bookingId: booking.id,
          rating: body.rating,
          body: body.body ?? null,
        },
      });
      const aggregate = foldRating(
        { avgRating: booking.photographer.avgRating, ratingCount: booking.photographer.ratingCount },
        body.rating,
      );
      await tx.photographerProfile.update({
        where: { id: booking.photographer.id },
        data: aggregate,
      });
      return created;
    });
    res.status(201).json({
      id: review.id,
      bookingId: review.bookingId,
      rating: review.rating,
      body: review.body,
      createdAt: review.createdAt,
    });
  } catch (err) {
    next(err);
  }
});
