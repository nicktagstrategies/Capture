import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { stripe } from '../lib/stripe.js';
import { HttpError } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { idempotent } from '../middleware/idempotency.js';
import { priceVoucherCents } from '../services/voucherPricing.js';

export const vouchersRouter = Router();

/**
 * Inbox — vouchers the authenticated user has received and can still redeem
 * (status='active', not yet expired). Pending-payment vouchers are hidden
 * until the sender's Stripe charge succeeds.
 */
vouchersRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const vouchers = await prisma.voucher.findMany({
      where: {
        recipientId: req.userId!,
        status: 'active',
        expiresAt: { gt: new Date() },
      },
      orderBy: { expiresAt: 'asc' },
      include: {
        sender: { select: { id: true, name: true, avatarUrl: true } },
      },
    });
    res.json({
      vouchers: vouchers.map((v) => ({
        id: v.id,
        percentOff: v.percentOff,
        category: v.category,
        expiresAt: v.expiresAt,
        note: v.note,
        sender: v.sender,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Sent vouchers — for the sender to track payment + redemption state.
 */
vouchersRouter.get('/sent', requireAuth, async (req, res, next) => {
  try {
    const vouchers = await prisma.voucher.findMany({
      where: { senderId: req.userId! },
      orderBy: { createdAt: 'desc' },
      include: {
        recipient: { select: { id: true, name: true, avatarUrl: true } },
      },
    });
    res.json({
      vouchers: vouchers.map((v) => ({
        id: v.id,
        percentOff: v.percentOff,
        category: v.category,
        expiresAt: v.expiresAt,
        status: v.status,
        recipient: v.recipient,
        purchaseAmountCents: v.purchaseAmountCents,
        createdAt: v.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

const SendVoucherBody = z.object({
  recipientEmail: z.string().email(),
  percentOff: z.number().int().min(5).max(100),
  category: z.enum(['any', 'wedding_video', 'portrait', 'event', 'family', 'headshot']),
  note: z.string().max(200).optional(),
  expiresAt: z.coerce.date(),
});

/**
 * Sender pays Capture up-front for the voucher. We create the voucher in
 * `pending_payment` and a PaymentIntent the client confirms via Stripe Sheet;
 * the webhook handler promotes the voucher to `active` on success.
 */
vouchersRouter.post('/', requireAuth, idempotent(), async (req, res, next) => {
  try {
    const body = SendVoucherBody.parse(req.body);
    const recipient = await prisma.user.findUnique({
      where: { email: body.recipientEmail },
      select: { id: true },
    });
    if (!recipient) {
      // For an MVP we just return an error; later we'll send an invite email
      // that creates the account on first sign-in and finalizes the voucher.
      throw new HttpError(404, 'Recipient not found', 'recipient_not_found');
    }
    if (body.expiresAt <= new Date()) {
      throw new HttpError(400, 'expiresAt must be in the future', 'invalid_expiry');
    }

    const purchaseAmountCents = priceVoucherCents(body.percentOff);

    const voucher = await prisma.voucher.create({
      data: {
        senderId: req.userId!,
        recipientId: recipient.id,
        percentOff: body.percentOff,
        category: body.category,
        note: body.note,
        expiresAt: body.expiresAt,
        status: 'pending_payment',
        purchaseAmountCents,
      },
    });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: purchaseAmountCents,
      currency: 'usd',
      metadata: { voucherId: voucher.id, kind: 'voucher_purchase' },
      automatic_payment_methods: { enabled: true },
    });

    await prisma.voucher.update({
      where: { id: voucher.id },
      data: {
        purchaseStripePaymentIntentId: paymentIntent.id,
        purchaseClientSecret: paymentIntent.client_secret,
      },
    });

    res.status(201).json({
      voucherId: voucher.id,
      clientSecret: paymentIntent.client_secret,
      amountCents: purchaseAmountCents,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Quote — UI uses this to show the sender how much a given % off will cost
 * before they commit.
 */
vouchersRouter.get('/quote', requireAuth, (req, res, next) => {
  try {
    const percentOff = Number(req.query.percentOff);
    if (!Number.isFinite(percentOff)) throw new HttpError(400, 'invalid percentOff', 'bad_request');
    res.json({ amountCents: priceVoucherCents(percentOff) });
  } catch (err) {
    next(err);
  }
});
