import express, { Router } from 'express';
import type { Stripe } from 'stripe';
import { stripe } from '../lib/stripe.js';
import { env } from '../lib/env.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

export const stripeWebhookRouter = Router();

stripeWebhookRouter.post(
  '/',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.header('stripe-signature');
    if (!sig) {
      res.status(400).send('missing signature');
      return;
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      logger.warn({ err }, 'stripe signature verification failed');
      res.status(400).send('invalid signature');
      return;
    }

    try {
      switch (event.type) {
        case 'payment_intent.succeeded': {
          const pi = event.data.object as Stripe.PaymentIntent;
          const booking = await prisma.booking.findUnique({
            where: { stripePaymentIntentId: pi.id },
          });
          if (!booking) break;
          await prisma.$transaction([
            prisma.booking.update({
              where: { id: booking.id },
              data: { status: 'confirmed' },
            }),
            prisma.availabilitySlot.update({
              where: { id: booking.slotId },
              data: { status: 'booked', heldUntil: null },
            }),
            ...(booking.voucherId
              ? [
                  prisma.voucher.update({
                    where: { id: booking.voucherId },
                    data: { redeemedAt: new Date() },
                  }),
                ]
              : []),
          ]);
          break;
        }
        case 'payment_intent.payment_failed':
        case 'payment_intent.canceled': {
          const pi = event.data.object as Stripe.PaymentIntent;
          const booking = await prisma.booking.findUnique({
            where: { stripePaymentIntentId: pi.id },
          });
          if (!booking) break;
          await prisma.$transaction([
            prisma.booking.update({ where: { id: booking.id }, data: { status: 'cancelled' } }),
            prisma.availabilitySlot.update({
              where: { id: booking.slotId },
              data: { status: 'open', heldUntil: null },
            }),
          ]);
          break;
        }
        default:
          logger.debug({ type: event.type }, 'unhandled stripe event');
      }
      res.json({ received: true });
    } catch (err) {
      logger.error({ err, type: event.type }, 'error handling stripe event');
      res.status(500).send('handler error');
    }
  },
);
