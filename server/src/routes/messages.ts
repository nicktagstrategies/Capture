import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  threadIsLocked,
  SendMessageBody,
  ShareLocationBody,
} from '../services/messaging.js';

export const messagesRouter = Router();

async function loadThreadForBooking(bookingId: string, userId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      photographer: { select: { id: true, userId: true } },
      messageThread: true,
    },
  });
  if (!booking) throw new HttpError(404, 'Booking not found', 'not_found');
  const isCustomer = booking.customerId === userId;
  const isPhotographer = booking.photographer.userId === userId;
  if (!isCustomer && !isPhotographer) {
    throw new HttpError(403, 'Forbidden', 'forbidden');
  }
  return { booking, isCustomer, isPhotographer };
}

/**
 * GET /messages/:bookingId
 *
 * Returns the full thread transcript. Marks the caller's unread messages
 * (those sent by the other party with `readAt: null`) as read in the same
 * round-trip so the client doesn't need a second call.
 */
messagesRouter.get('/:bookingId', requireAuth, async (req, res, next) => {
  try {
    const { booking } = await loadThreadForBooking(req.params.bookingId!, req.userId!);
    if (!booking.messageThread) {
      // No thread yet → empty transcript. Don't create on read; lazy-create
      // on the first send instead.
      return res.json({ bookingId: booking.id, threadId: null, messages: [], locked: threadIsLocked(booking) });
    }
    const messages = await prisma.message.findMany({
      where: { threadId: booking.messageThread.id },
      orderBy: { createdAt: 'asc' },
    });
    // Mark messages from the other party as read.
    await prisma.message.updateMany({
      where: {
        threadId: booking.messageThread.id,
        senderId: { not: req.userId! },
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    res.json({
      bookingId: booking.id,
      threadId: booking.messageThread.id,
      locked: threadIsLocked(booking),
      messages: messages.map((m) => ({
        id: m.id,
        senderId: m.senderId,
        body: m.body,
        attachmentUrl: m.attachmentUrl,
        attachmentMime: m.attachmentMime,
        location: m.locationLat != null && m.locationLng != null
          ? { lat: m.locationLat, lng: m.locationLng, expiresAt: m.locationExpiresAt }
          : null,
        createdAt: m.createdAt,
        readAt: m.readAt,
        // Convenience flag for the client.
        isMine: m.senderId === req.userId,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /messages/:bookingId
 *
 * Sends a text and/or image message. Lazily creates the thread on first send.
 * Bookings in `cancelled` / `refunded` state still allow messages so the
 * customer and photographer can sort out logistics post-cancellation, but
 * stale `completed` bookings (>7 days) are locked.
 */
messagesRouter.post('/:bookingId', requireAuth, async (req, res, next) => {
  try {
    const body = SendMessageBody.parse(req.body);
    const { booking } = await loadThreadForBooking(req.params.bookingId!, req.userId!);
    if (threadIsLocked(booking)) {
      throw new HttpError(409, 'Thread is closed', 'thread_locked');
    }

    const thread = booking.messageThread
      ?? await prisma.messageThread.create({
        data: {
          bookingId: booking.id,
          customerId: booking.customerId,
          photographerId: booking.photographer.id,
        },
      });

    const message = await prisma.message.create({
      data: {
        threadId: thread.id,
        senderId: req.userId!,
        body: body.body ?? null,
        attachmentUrl: body.attachmentUrl ?? null,
        attachmentMime: body.attachmentMime ?? null,
      },
    });
    await prisma.messageThread.update({
      where: { id: thread.id },
      data: { lastMessageAt: message.createdAt },
    });

    res.status(201).json({
      id: message.id,
      threadId: thread.id,
      senderId: message.senderId,
      body: message.body,
      attachmentUrl: message.attachmentUrl,
      attachmentMime: message.attachmentMime,
      createdAt: message.createdAt,
      isMine: true,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /messages/:bookingId/share-location
 *
 * Drops an ephemeral location pin into the thread. Stored as a regular
 * Message row so the transcript stays in order, but the lat/lng auto-expire
 * — clients should hide pins where `location.expiresAt < now`.
 */
messagesRouter.post('/:bookingId/share-location', requireAuth, async (req, res, next) => {
  try {
    const body = ShareLocationBody.parse(req.body);
    const { booking } = await loadThreadForBooking(req.params.bookingId!, req.userId!);
    if (threadIsLocked(booking)) {
      throw new HttpError(409, 'Thread is closed', 'thread_locked');
    }
    const thread = booking.messageThread
      ?? await prisma.messageThread.create({
        data: {
          bookingId: booking.id,
          customerId: booking.customerId,
          photographerId: booking.photographer.id,
        },
      });
    const expiresAt = new Date(Date.now() + body.durationSeconds * 1000);
    const message = await prisma.message.create({
      data: {
        threadId: thread.id,
        senderId: req.userId!,
        locationLat: body.lat,
        locationLng: body.lng,
        locationExpiresAt: expiresAt,
      },
    });
    await prisma.messageThread.update({
      where: { id: thread.id },
      data: { lastMessageAt: message.createdAt },
    });
    res.status(201).json({
      id: message.id,
      threadId: thread.id,
      senderId: message.senderId,
      location: { lat: body.lat, lng: body.lng, expiresAt },
      createdAt: message.createdAt,
      isMine: true,
    });
  } catch (err) {
    next(err);
  }
});
