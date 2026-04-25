import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { stripe } from '../lib/stripe.js';
import { HttpError } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { idempotent } from '../middleware/idempotency.js';
import { bookingRateLimit } from '../middleware/rateLimit.js';
import { computeFees } from '../services/payments.js';

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
      })),
    });
  } catch (err) {
    next(err);
  }
});
