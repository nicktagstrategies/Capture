import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { stripe } from '../lib/stripe.js';
import { HttpError } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { computeFees } from '../services/payments.js';

export const bookingsRouter = Router();

const CreateBookingBody = z.object({
  serviceId: z.string().min(1),
  slotId: z.string().min(1),
  voucherId: z.string().optional(),
  bookingAddress: z.string().max(300).optional(),
});

bookingsRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const body = CreateBookingBody.parse(req.body);
    const customerId = req.userId!;

    const booking = await prisma.$transaction(async (tx) => {
      const slot = await tx.availabilitySlot.findUnique({ where: { id: body.slotId } });
      if (!slot || slot.status !== 'open') {
        throw new HttpError(409, 'Slot no longer available', 'slot_unavailable');
      }

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

      // Reserve the slot so nobody else can grab it while the client completes payment.
      await tx.availabilitySlot.update({
        where: { id: slot.id },
        data: {
          status: 'held',
          heldUntil: new Date(Date.now() + 15 * 60 * 1000),
        },
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

    // Create the Stripe Connect PaymentIntent. `application_fee_amount` is what
    // Capture keeps; the rest is auto-transferred to the photographer's Connect account.
    if (!booking.photographer.stripeAccountId) {
      // For the MVP/seed photographers we don't have real Connect accounts, so we
      // create a regular PaymentIntent and reconcile payouts manually. Switch to
      // transfer_data once each photographer finishes onboarding.
      const paymentIntent = await stripe.paymentIntents.create({
        amount: booking.totalCents,
        currency: 'usd',
        metadata: { bookingId: booking.id },
        automatic_payment_methods: { enabled: true },
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
      return;
    }

    const applicationFee =
      booking.customerFeeCents + booking.commissionCents;
    const paymentIntent = await stripe.paymentIntents.create({
      amount: booking.totalCents,
      currency: 'usd',
      application_fee_amount: applicationFee,
      transfer_data: { destination: booking.photographer.stripeAccountId },
      metadata: { bookingId: booking.id },
      automatic_payment_methods: { enabled: true },
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
        },
        service: { title: b.service.title },
      })),
    });
  } catch (err) {
    next(err);
  }
});
