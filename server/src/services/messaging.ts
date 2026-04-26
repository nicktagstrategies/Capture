import { z } from 'zod';

/// Threads stay open for 7 days after a booking is `completed`. After that
/// we lock writes so old bookings don't turn into long-running back-channels.
/// Reads remain available; transcript is preserved.
export const POST_COMPLETION_LOCK_MS = 7 * 24 * 60 * 60 * 1000;

export interface LockableBooking {
  status: string;
  // `updatedAt` proxies for completion time until we add a dedicated
  // `completedAt` column on the booking model.
  updatedAt: Date;
}

export function threadIsLocked(booking: LockableBooking, now: Date = new Date()): boolean {
  if (booking.status !== 'completed') return false;
  return now.getTime() - booking.updatedAt.getTime() > POST_COMPLETION_LOCK_MS;
}

export const SendMessageBody = z.object({
  body: z.string().min(1).max(2000).optional(),
  attachmentUrl: z.string().url().optional(),
  attachmentMime: z.string().max(100).optional(),
}).refine(
  (b) => Boolean(b.body) || Boolean(b.attachmentUrl),
  { message: 'Message must include body or attachmentUrl' },
);

export const ShareLocationBody = z.object({
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
  // Default 30-minute pin; cap at 4 hours so we never broadcast indefinitely.
  durationSeconds: z.number().int().positive().max(4 * 60 * 60).default(1800),
});
