import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { stripe } from '../lib/stripe.js';
import { env } from '../lib/env.js';
import { HttpError } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { idempotent } from '../middleware/idempotency.js';
import {
  CreateTipBody,
  clampTipAmount,
  tipSuggestions,
} from '../services/tipping.js';

export const tipsRouter = Router();

/**
 * POST /bookings/:id/tip — mounted under /bookings via `app.use`.
 *
 * Customer-only. Creates a separate Stripe PaymentIntent that routes 100% to
 * the photographer's Connect account (no application_fee_amount). Webhook
 * flips status to `paid`. Tip is unique per booking; double-submits return the
 * existing client secret instead of creating a second one.
 */
tipsRouter.post('/:id/tip', requireAuth, idempotent(), async (req, res, next) => {
  try {
    const body = CreateTipBody.parse(req.body);
    const amountCents = clampTipAmount(body.amountCents, env.TIP_MIN_CENTS, env.TIP_MAX_CENTS);

    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id! },
      include: {
        photographer: { select: { id: true, stripeAccountId: true } },
        tip: true,
      },
    });
    if (!booking) throw new HttpError(404, 'Booking not found', 'not_found');
    if (booking.customerId !== req.userId) {
      throw new HttpError(403, 'Only the customer can tip', 'forbidden');
    }
    // Tipping a not-yet-confirmed booking would let customers pre-tip a
    // session they haven't paid for yet. Restrict to confirmed/completed.
    if (booking.status !== 'confirmed' && booking.status !== 'completed') {
      throw new HttpError(409, 'Booking is not eligible for a tip yet', 'bad_state');
    }
    if (!booking.photographer.stripeAccountId) {
      throw new HttpError(409, 'Photographer is not set up to accept tips', 'no_connect_account');
    }
    // Already tipped? Replay the existing PaymentIntent's client secret so the
    // sheet can re-open without creating duplicates. If it's already paid,
    // 409 — they'd need a separate flow to tip more (not supported in V1).
    if (booking.tip) {
      if (booking.tip.status === 'paid') {
        throw new HttpError(409, 'Tip already submitted', 'already_tipped');
      }
      return res.status(200).json({
        tipId: booking.tip.id,
        clientSecret: booking.tip.stripeClientSecret,
        amountCents: booking.tip.amountCents,
      });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      // 100% to the photographer; no application_fee_amount.
      transfer_data: { destination: booking.photographer.stripeAccountId },
      metadata: {
        kind: 'tip',
        bookingId: booking.id,
        customerId: req.userId!,
      },
    });

    const tip = await prisma.tip.create({
      data: {
        bookingId: booking.id,
        customerId: req.userId!,
        photographerId: booking.photographer.id,
        amountCents,
        stripePaymentIntentId: paymentIntent.id,
        stripeClientSecret: paymentIntent.client_secret,
      },
    });

    res.status(201).json({
      tipId: tip.id,
      clientSecret: paymentIntent.client_secret,
      amountCents: tip.amountCents,
    });
  } catch (err) {
    if (err instanceof RangeError) {
      next(new HttpError(400, err.message, 'invalid_amount'));
      return;
    }
    next(err);
  }
});

/**
 * GET /bookings/:id/tip-suggestions — mounted under /bookings.
 *
 * Returns the canonical 10/15/20 suggestion amounts for a booking so the iOS
 * client doesn't have to guess what "10%" means relative to the receipt.
 */
tipsRouter.get('/:id/tip-suggestions', requireAuth, async (req, res, next) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id! },
      include: { photographer: { select: { userId: true } } },
    });
    if (!booking) throw new HttpError(404, 'Booking not found', 'not_found');
    if (booking.customerId !== req.userId && booking.photographer.userId !== req.userId) {
      throw new HttpError(403, 'Forbidden', 'forbidden');
    }
    res.json({
      bookingId: booking.id,
      subtotalCents: booking.subtotalCents,
      suggestions: tipSuggestions(booking.subtotalCents),
      minCents: env.TIP_MIN_CENTS,
      maxCents: env.TIP_MAX_CENTS,
    });
  } catch (err) {
    next(err);
  }
});
