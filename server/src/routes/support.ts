import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { env } from '../lib/env.js';

export const supportRouter = Router();

const TicketBody = z.object({
  email: z.string().email().optional(),
  category: z.enum(['booking', 'payment', 'photographer', 'account', 'other']).default('other'),
  subject: z.string().min(1).max(120),
  body: z.string().min(1).max(4000),
  bookingId: z.string().optional(),
});

/**
 * Authenticated callers leave userId attached; unauthenticated tickets fall
 * back to the email in the body. We log + persist; a transactional email
 * provider (Postmark / Resend) plugs in here later to email SUPPORT_INBOX_EMAIL.
 */
supportRouter.post('/tickets', async (req, res, next) => {
  try {
    const body = TicketBody.parse(req.body);
    const authedUserId = req.userId; // may be undefined when unauthenticated
    let email = body.email;
    if (!email && authedUserId) {
      const user = await prisma.user.findUnique({ where: { id: authedUserId } });
      email = user?.email ?? undefined;
    }
    if (!email) {
      res.status(400).json({ error: 'email_required' });
      return;
    }
    const ticket = await prisma.supportTicket.create({
      data: {
        userId: authedUserId ?? null,
        email,
        category: body.category,
        subject: body.subject,
        body: body.body,
        bookingId: body.bookingId ?? null,
      },
    });
    logger.info(
      { ticketId: ticket.id, inbox: env.SUPPORT_INBOX_EMAIL, email, category: ticket.category },
      'support ticket received',
    );
    // TODO: dispatch transactional email to SUPPORT_INBOX_EMAIL with ticket
    // contents + reply-to set to `email`.
    res.status(201).json({ id: ticket.id, status: 'received' });
  } catch (err) {
    next(err);
  }
});
