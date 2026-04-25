import { Router } from 'express';
import { z } from 'zod';
import type { CancelledBy } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { stripe } from '../lib/stripe.js';
import { logger } from '../lib/logger.js';
import { HttpError } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { idempotent } from '../middleware/idempotency.js';
import { bookingRateLimit } from '../middleware/rateLimit.js';
import { computeFees } from '../services/payments.js';
import { computeRefund } from '../services/refunds.js';

export const bookingsRouter = Router();

const HOLD_WINDOW_MS = 15 * 60 * 1000;

const CreateBookingBody = z.object({
  serviceId: z.string().min(1),
  slotId: z.string().min(1),
  voucherId: z.string().optional(),
  bookingAddress: z.string().max(300).optional(),
});

bookingsRouter.post('/', bookingRateLimit, requireAuth, idempotent(), async (req, res, next) => {
  try {
    const body = CreateBookingBody.parse(req.body);
    const customerId = req.userId!;

    const booking = await prisma.$transaction(async (tx) => {
      // Atomic reservation: only succeeds if the slot is still 'open'.
      // updateMany returns the affected row count without throwing on no-match,
      // which is exactly the "compare-and-swap" we need for concurrent bookers.
      const reservation = await tx.availabilitySlot.updateMany({
        where: { id: body.slotId, status: 'open' },
        data: {
          status: 'held',
          heldUntil: new Date(Date.now() + HOLD_WINDOW_MS),
        },
      });
      if (reservation.count === 0) {
        throw new HttpError(409, 'Slot no longer available', 'slot_unavailable');
      }

      const slot = await tx.availabilitySlot.findUniqueOrThrow({ where: { id: body.slotId } });
      const service = await tx.service.findUnique({
        where: { id: body.serviceId },
        include: { photographer: true },
      });
      if (!service || !service.active) {
        throw new HttpError(404, 'Service not found', 'not_found');
      }
      if (service.photographerId !== slot.photographerId) {
        throw new HttpError(400, 'Slot belongs to a different photographer', 'mismatch');
      }

      let voucherPercentOff: number | undefined;
      if (body.voucherId) {
        const voucher = await tx.voucher.findUnique({ where: { id: body.voucherId } });
        if (
          !voucher ||
          voucher.recipientId !== customerId ||
          voucher.redeemedAt ||
          voucher.expiresAt < new Date()
        ) {
          throw new HttpError(400, 'Invalid voucher', 'invalid_voucher');
        }
        voucherPercentOff = voucher.percentOff;
      }

      const fees = computeFees({
        servicePriceCents: service.priceCents,
        voucherPercentOff,
      });

      return await tx.booking.create({
        data: {
          customerId,
          photographerId: service.photographerId,
          serviceId: service.id,
          slotId: slot.id,
          status: 'pending',
          subtotalCents: fees.subtotalCents,
          customerFeeCents: fees.customerFeeCents,
          commissionCents: fees.commissionCents,
          discountCents: fees.discountCents,
          totalCents: fees.totalCents,
          bookingAddress: body.bookingAddress ?? null,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          voucherId: body.voucherId ?? null,
        },
        include: { photographer: true },
      });
    });

    const applicationFee = booking.customerFeeCents + booking.commissionCents;
    const transferData = booking.photographer.stripeAccountId
      ? { transfer_data: { destination: booking.photographer.stripeAccountId }, application_fee_amount: applicationFee }
      : {};

    const paymentIntent = await stripe.paymentIntents.create({
      amount: booking.totalCents,
      currency: 'usd',
      metadata: { bookingId: booking.id, customerId },
      automatic_payment_methods: { enabled: true },
      ...transferData,
    });

    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        stripePaymentIntentId: paymentIntent.id,
        stripeClientSecret: paymentIntent.client_secret,
      },
    });

    res.status(201).json({
      bookingId: booking.id,
      clientSecret: paymentIntent.client_secret,
      totalCents: booking.totalCents,
    });
  } catch (err) {
    next(err);
  }
});

bookingsRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const bookings = await prisma.booking.findMany({
      where: { customerId: req.userId! },
      orderBy: { startsAt: 'desc' },
      include: {
        photographer: { include: { user: { select: { name: true, avatarUrl: true } } } },
        service: { select: { title: true } },
        gallery: { select: { id: true, status: true, deliveredAt: true } },
      },
    });
    res.json({
      bookings: bookings.map((b) => ({
        id: b.id,
        status: b.status,
        startsAt: b.startsAt,
        endsAt: b.endsAt,
        totalCents: b.totalCents,
        photographer: {
          id: b.photographerId,
          name: b.photographer.user.name,
          avatarUrl: b.photographer.user.avatarUrl,
          homeCity: b.photographer.homeCity,
          timezone: b.photographer.timezone,
        },
        service: { title: b.service.title },
        gallery: b.gallery
          ? { id: b.gallery.id, status: b.gallery.status, deliveredAt: b.gallery.deliveredAt }
          : null,
        cancelledAt: b.cancelledAt,
        refundAmountCents: b.refundAmountCents,
      })),
    });
  } catch (err) {
    next(err);
  }
});

bookingsRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id! },
      include: {
        photographer: { include: { user: { select: { name: true, avatarUrl: true } } } },
        service: true,
        gallery: { select: { id: true, status: true, deliveredAt: true } },
      },
    });
    if (!booking) throw new HttpError(404, 'Booking not found', 'not_found');
    const isCustomer = booking.customerId === req.userId;
    const isPhotographer = booking.photographer.userId === req.userId;
    if (!isCustomer && !isPhotographer) throw new HttpError(403, 'Forbidden', 'forbidden');

    // Refund preview — what would happen if the customer cancelled right now.
    const refundPreview = computeRefund({
      totalCents: booking.totalCents,
      startsAt: booking.startsAt,
      cancelledBy: 'customer',
    });

    res.json({
      id: booking.id,
      status: booking.status,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      bookingAddress: booking.bookingAddress,
      subtotalCents: booking.subtotalCents,
      customerFeeCents: booking.customerFeeCents,
      totalCents: booking.totalCents,
      refundAmountCents: booking.refundAmountCents,
      cancelledAt: booking.cancelledAt,
      cancelledBy: booking.cancelledBy,
      photographer: {
        id: booking.photographerId,
        name: booking.photographer.user.name,
        avatarUrl: booking.photographer.user.avatarUrl,
        homeCity: booking.photographer.homeCity,
        timezone: booking.photographer.timezone,
      },
      service: {
        id: booking.service.id,
        title: booking.service.title,
        durationMinutes: booking.service.durationMinutes,
        priceCents: booking.service.priceCents,
      },
      gallery: booking.gallery
        ? { id: booking.gallery.id, status: booking.gallery.status, deliveredAt: booking.gallery.deliveredAt }
        : null,
      refundPreview,
      role: isPhotographer ? 'photographer' : 'customer',
    });
  } catch (err) {
    next(err);
  }
});

const CancelBody = z.object({ reason: z.string().max(500).optional() });

bookingsRouter.post('/:id/cancel', requireAuth, async (req, res, next) => {
  try {
    const body = CancelBody.parse(req.body);
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id! },
      include: { photographer: { select: { userId: true } } },
    });
    if (!booking) throw new HttpError(404, 'Booking not found', 'not_found');
    if (booking.status === 'cancelled' || booking.status === 'refunded') {
      throw new HttpError(409, 'Booking is already cancelled', 'already_cancelled');
    }
    let cancelledBy: CancelledBy;
    if (booking.customerId === req.userId) cancelledBy = 'customer';
    else if (booking.photographer.userId === req.userId) cancelledBy = 'photographer';
    else throw new HttpError(403, 'Forbidden', 'forbidden');

    const decision = computeRefund({
      totalCents: booking.totalCents,
      startsAt: booking.startsAt,
      cancelledBy,
    });

    // Issue the refund through Stripe. We always reverse the application fee
    // proportionally so Capture's take scales with the refund amount.
    if (decision.refundCents > 0 && booking.stripePaymentIntentId) {
      try {
        await stripe.refunds.create({
          payment_intent: booking.stripePaymentIntentId,
          amount: decision.refundCents,
          reverse_transfer: true,
          refund_application_fee: true,
          metadata: { bookingId: booking.id, rule: decision.rule },
        });
      } catch (err) {
        logger.error({ err, bookingId: booking.id }, 'stripe refund failed');
        throw new HttpError(502, 'Refund failed; try again or contact support', 'refund_failed');
      }
    }

    await prisma.$transaction([
      prisma.booking.update({
        where: { id: booking.id },
        data: {
          status: decision.refundCents > 0 ? 'refunded' : 'cancelled',
          cancelledAt: new Date(),
          cancelledBy,
          cancelReason: body.reason ?? null,
          refundAmountCents: decision.refundCents,
        },
      }),
      prisma.availabilitySlot.update({
        where: { id: booking.slotId },
        data: { status: 'open', heldUntil: null },
      }),
    ]);

    res.json({
      bookingId: booking.id,
      cancelledBy,
      refund: decision,
    });
  } catch (err) {
    next(err);
  }
});

const RescheduleBody = z.object({ slotId: z.string().min(1) });

bookingsRouter.post('/:id/reschedule', requireAuth, async (req, res, next) => {
  try {
    const body = RescheduleBody.parse(req.body);
    const result = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: req.params.id! },
        include: { photographer: { select: { userId: true } } },
      });
      if (!booking) throw new HttpError(404, 'Booking not found', 'not_found');
      const isCustomer = booking.customerId === req.userId;
      const isPhotographer = booking.photographer.userId === req.userId;
      if (!isCustomer && !isPhotographer) throw new HttpError(403, 'Forbidden', 'forbidden');
      if (booking.status !== 'confirmed' && booking.status !== 'pending') {
        throw new HttpError(409, 'Booking cannot be rescheduled in this state', 'bad_state');
      }
      const target = await tx.availabilitySlot.findUnique({ where: { id: body.slotId } });
      if (!target || target.photographerId !== booking.photographerId) {
        throw new HttpError(400, 'Slot belongs to a different photographer', 'mismatch');
      }
      // Atomic swap on the new slot.
      const reservation = await tx.availabilitySlot.updateMany({
        where: { id: body.slotId, status: 'open' },
        data: { status: 'booked' },
      });
      if (reservation.count === 0) {
        throw new HttpError(409, 'New slot no longer available', 'slot_unavailable');
      }
      // Free the old slot.
      await tx.availabilitySlot.update({
        where: { id: booking.slotId },
        data: { status: 'open', heldUntil: null },
      });
      const updated = await tx.booking.update({
        where: { id: booking.id },
        data: {
          slotId: target.id,
          startsAt: target.startsAt,
          endsAt: target.endsAt,
        },
      });
      return updated;
    });
    res.json({ bookingId: result.id, startsAt: result.startsAt });
  } catch (err) {
    next(err);
  }
});
