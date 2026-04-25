import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { newGalleryItemKey, presignDownload, presignUpload, deleteObject } from '../lib/storage.js';

export const galleriesRouter = Router();

const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/heic']);

async function loadGalleryForUser(galleryId: string, userId: string) {
  const gallery = await prisma.gallery.findUnique({
    where: { id: galleryId },
    include: {
      booking: {
        include: { photographer: { select: { id: true, userId: true } } },
      },
    },
  });
  if (!gallery) throw new HttpError(404, 'Gallery not found', 'not_found');
  const isCustomer = gallery.booking.customerId === userId;
  const isPhotographer = gallery.booking.photographer.userId === userId;
  if (!isCustomer && !isPhotographer) {
    throw new HttpError(403, 'Forbidden', 'forbidden');
  }
  return { gallery, isCustomer, isPhotographer };
}

// Photographer creates a gallery for a confirmed booking they own.
const CreateGalleryBody = z.object({ bookingId: z.string().min(1) });

galleriesRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const body = CreateGalleryBody.parse(req.body);
    const booking = await prisma.booking.findUnique({
      where: { id: body.bookingId },
      include: { photographer: { select: { userId: true } } },
    });
    if (!booking) throw new HttpError(404, 'Booking not found', 'not_found');
    if (booking.photographer.userId !== req.userId) {
      throw new HttpError(403, 'Only the photographer can deliver photos', 'forbidden');
    }
    if (booking.status !== 'confirmed' && booking.status !== 'completed') {
      throw new HttpError(400, 'Booking must be confirmed before delivery', 'bad_state');
    }
    const gallery = await prisma.gallery.upsert({
      where: { bookingId: booking.id },
      create: { bookingId: booking.id },
      update: {},
    });
    res.status(201).json({ id: gallery.id, status: gallery.status });
  } catch (err) {
    next(err);
  }
});

// Photographer requests a presigned upload URL for one item.
const PresignBody = z.object({
  mimeType: z.string().refine((m) => ALLOWED_MIMES.has(m), 'unsupported mime'),
  bytes: z.number().int().positive().max(50_000_000).optional(), // 50 MB cap
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

galleriesRouter.post('/:id/items', requireAuth, async (req, res, next) => {
  try {
    const body = PresignBody.parse(req.body);
    const { gallery, isPhotographer } = await loadGalleryForUser(req.params.id!, req.userId!);
    if (!isPhotographer) {
      throw new HttpError(403, 'Only the photographer can upload', 'forbidden');
    }
    const storageKey = newGalleryItemKey(gallery.id, body.mimeType);
    const item = await prisma.galleryItem.create({
      data: {
        galleryId: gallery.id,
        storageKey,
        mimeType: body.mimeType,
        bytes: body.bytes,
        width: body.width,
        height: body.height,
        status: 'pending_upload',
      },
    });
    const uploadUrl = await presignUpload(storageKey, body.mimeType);
    res.status(201).json({ itemId: item.id, storageKey, uploadUrl });
  } catch (err) {
    next(err);
  }
});

// Photographer marks the upload as done. We trust the photographer here (they
// uploaded directly to S3); a later HEAD-object check could verify size.
galleriesRouter.post('/:id/items/:itemId/finalize', requireAuth, async (req, res, next) => {
  try {
    const { gallery, isPhotographer } = await loadGalleryForUser(req.params.id!, req.userId!);
    if (!isPhotographer) throw new HttpError(403, 'Forbidden', 'forbidden');
    const item = await prisma.galleryItem.findUnique({ where: { id: req.params.itemId! } });
    if (!item || item.galleryId !== gallery.id) {
      throw new HttpError(404, 'Item not found', 'not_found');
    }
    await prisma.galleryItem.update({
      where: { id: item.id },
      data: { status: 'ready', uploadedAt: new Date() },
    });
    // First successful upload promotes the gallery to delivered.
    if (gallery.status === 'awaiting_delivery') {
      await prisma.gallery.update({
        where: { id: gallery.id },
        data: { status: 'delivered', deliveredAt: new Date() },
      });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

galleriesRouter.delete('/:id/items/:itemId', requireAuth, async (req, res, next) => {
  try {
    const { gallery, isPhotographer } = await loadGalleryForUser(req.params.id!, req.userId!);
    if (!isPhotographer) throw new HttpError(403, 'Forbidden', 'forbidden');
    const item = await prisma.galleryItem.findUnique({ where: { id: req.params.itemId! } });
    if (!item || item.galleryId !== gallery.id) {
      throw new HttpError(404, 'Item not found', 'not_found');
    }
    await deleteObject(item.storageKey).catch(() => {}); // best-effort
    await prisma.galleryItem.update({
      where: { id: item.id },
      data: { status: 'removed' },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// View — both customer and photographer get presigned download URLs for each
// `ready` item, scoped to a short TTL to keep the bytes private.
galleriesRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const { gallery, isCustomer, isPhotographer } = await loadGalleryForUser(
      req.params.id!,
      req.userId!,
    );
    const items = await prisma.galleryItem.findMany({
      where: { galleryId: gallery.id, status: 'ready' },
      orderBy: { createdAt: 'asc' },
    });
    const signed = await Promise.all(
      items.map(async (it) => ({
        id: it.id,
        mimeType: it.mimeType,
        width: it.width,
        height: it.height,
        url: await presignDownload(it.storageKey, 600),
      })),
    );
    res.json({
      id: gallery.id,
      status: gallery.status,
      portfolioConsent: gallery.portfolioConsent,
      deliveredAt: gallery.deliveredAt,
      bookingId: gallery.bookingId,
      role: isPhotographer ? 'photographer' : isCustomer ? 'customer' : 'unknown',
      items: signed,
    });
  } catch (err) {
    next(err);
  }
});

// Customer toggles whether the photographer can use these photos in their
// public portfolio. Defaults to false; this is the only place to flip it.
const ConsentBody = z.object({ portfolioConsent: z.boolean() });

galleriesRouter.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const body = ConsentBody.parse(req.body);
    const { gallery, isCustomer } = await loadGalleryForUser(req.params.id!, req.userId!);
    if (!isCustomer) {
      throw new HttpError(403, 'Only the customer can change consent', 'forbidden');
    }
    const updated = await prisma.gallery.update({
      where: { id: gallery.id },
      data: { portfolioConsent: body.portfolioConsent },
    });
    res.json({ portfolioConsent: updated.portfolioConsent });
  } catch (err) {
    next(err);
  }
});

// Customer creates a public share link.
galleriesRouter.post('/:id/share', requireAuth, async (req, res, next) => {
  try {
    const { gallery, isCustomer } = await loadGalleryForUser(req.params.id!, req.userId!);
    if (!isCustomer) {
      throw new HttpError(403, 'Only the customer can share', 'forbidden');
    }
    const token = crypto.randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    const link = await prisma.galleryShareLink.create({
      data: { galleryId: gallery.id, token, expiresAt },
    });
    res.status(201).json({ token: link.token, expiresAt: link.expiresAt });
  } catch (err) {
    next(err);
  }
});

galleriesRouter.delete('/:id/share/:token', requireAuth, async (req, res, next) => {
  try {
    const { gallery, isCustomer } = await loadGalleryForUser(req.params.id!, req.userId!);
    if (!isCustomer) throw new HttpError(403, 'Forbidden', 'forbidden');
    await prisma.galleryShareLink.updateMany({
      where: { galleryId: gallery.id, token: req.params.token! },
      data: { revokedAt: new Date() },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Public gallery view via signed token. No auth required.
galleriesRouter.get('/public/:token', async (req, res, next) => {
  try {
    const link = await prisma.galleryShareLink.findUnique({
      where: { token: req.params.token! },
      include: { gallery: true },
    });
    if (!link || link.revokedAt || (link.expiresAt && link.expiresAt < new Date())) {
      throw new HttpError(404, 'Gallery not available', 'not_found');
    }
    const items = await prisma.galleryItem.findMany({
      where: { galleryId: link.galleryId, status: 'ready' },
      orderBy: { createdAt: 'asc' },
    });
    const signed = await Promise.all(
      items.map(async (it) => ({
        id: it.id,
        mimeType: it.mimeType,
        width: it.width,
        height: it.height,
        url: await presignDownload(it.storageKey, 600),
      })),
    );
    res.json({
      id: link.gallery.id,
      status: link.gallery.status,
      deliveredAt: link.gallery.deliveredAt,
      items: signed,
    });
  } catch (err) {
    next(err);
  }
});
