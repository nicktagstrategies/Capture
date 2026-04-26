import express, { Router } from 'express';
import type { Stripe } from 'stripe';
import { stripe } from '../lib/stripe.js';
import { env } from '../lib/env.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { dispatchPush } from '../services/notifications.js';

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
          // Three flavors of PaymentIntent flow through this app: booking
          // payments, voucher purchases, and tips. Discriminate via metadata.kind.
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
          if (pi.metadata?.kind === 'tip') {
            const tip = await prisma.tip.findUnique({
              where: { stripePaymentIntentId: pi.id },
            });
            if (tip && tip.status === 'pending_payment') {
              await prisma.tip.update({
                where: { id: tip.id },
                data: { status: 'paid', paidAt: new Date() },
              });
            }
            break;
          }
          const booking = await prisma.booking.findUnique({
            where: { stripePaymentIntentId: pi.id },
            include: { photographer: { select: { userId: true } } },
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
          // Notify both sides; never block the webhook ack on this.
          void dispatchPush({
            recipientId: booking.customerId,
            kind: 'booking_confirmed',
            title: 'Booking confirmed',
            body: 'Your photographer is locked in. Tap to see the details.',
            payload: { bookingId: booking.id },
          });
          void dispatchPush({
            recipientId: booking.photographer.userId,
            kind: 'booking_confirmed',
            title: 'New booking',
            body: 'A new session is on your calendar. Tap to see the details.',
            payload: { bookingId: booking.id },
          });
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
          if (pi.metadata?.kind === 'tip') {
            const tip = await prisma.tip.findUnique({
              where: { stripePaymentIntentId: pi.id },
            });
            if (tip && tip.status === 'pending_payment') {
              await prisma.tip.update({
                where: { id: tip.id },
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
