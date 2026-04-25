import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const vouchersRouter = Router();

/**
 * Inbox — vouchers the authenticated user has received and has not redeemed.
 * Matches the "Congrats, Jad!" screen.
 */
vouchersRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const vouchers = await prisma.voucher.findMany({
      where: { recipientId: req.userId!, redeemedAt: null },
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

const SendVoucherBody = z.object({
  recipientEmail: z.string().email(),
  percentOff: z.number().int().min(5).max(100),
  category: z.enum(['any', 'wedding_video', 'portrait', 'event', 'family', 'headshot']),
  note: z.string().max(200).optional(),
  expiresAt: z.coerce.date(),
});

vouchersRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const body = SendVoucherBody.parse(req.body);
    const recipient = await prisma.user.findUnique({
      where: { email: body.recipientEmail },
      select: { id: true },
    });
    if (!recipient) {
      // For an MVP we just return an error; a later iteration can send an invite
      // email that creates the account on first sign-in.
      res.status(404).json({ error: 'recipient_not_found' });
      return;
    }
    const voucher = await prisma.voucher.create({
      data: {
        senderId: req.userId!,
        recipientId: recipient.id,
        percentOff: body.percentOff,
        category: body.category,
        note: body.note,
        expiresAt: body.expiresAt,
      },
    });
    res.status(201).json({ id: voucher.id });
  } catch (err) {
    next(err);
  }
});
