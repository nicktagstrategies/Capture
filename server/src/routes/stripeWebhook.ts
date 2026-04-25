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

    // Stripe retries on 5xx and may deliver duplicates. Persist the event ID
    // on first sight; replays short-circuit. The unique constraint on
    // stripeEventId makes the dedupe race-free.
    try {
      await prisma.webhookEvent.create({
        data: { stripeEventId: event.id, type: event.type },
      });
    } catch {
      logger.debug({ id: event.id }, 'duplicate stripe event ignored');
      res.json({ received: true, deduped: true });
      return;
    }

    try {
      switch (event.type) {
        case 'payment_intent.succeeded': {
          const pi = event.data.object as Stripe.PaymentIntent;
          // Two flavors of PaymentIntent flow through this app: booking
          // payments and voucher purchases. Discriminate via metadata.kind.
          if (pi.metadata?.kind === 'voucher_purchase') {
            const voucher = await prisma.voucher.findUnique({
              where: { purchaseStripePaymentIntentId: pi.id },
            });
            if (voucher && voucher.status === 'pending_payment') {
              await prisma.voucher.update({
                where: { id: voucher.id },
                data: { status: 'active' },
              });
            }
            break;
          }
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
                    data: { status: 'redeemed', redeemedAt: new Date() },
                  }),
                ]
              : []),
          ]);
          break;
        }
        case 'payment_intent.payment_failed':
        case 'payment_intent.canceled': {
          const pi = event.data.object as Stripe.PaymentIntent;
          if (pi.metadata?.kind === 'voucher_purchase') {
            const voucher = await prisma.voucher.findUnique({
              where: { purchaseStripePaymentIntentId: pi.id },
            });
            if (voucher && voucher.status === 'pending_payment') {
              await prisma.voucher.update({
                where: { id: voucher.id },
                data: { status: 'voided' },
              });
            }
            break;
          }
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
      // Roll back the dedupe record so Stripe's retry can try us again.
      await prisma.webhookEvent.delete({ where: { stripeEventId: event.id } }).catch(() => {});
      res.status(500).send('handler error');
    }
  },
);
