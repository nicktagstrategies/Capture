import { env } from '../lib/env.js';
import type { CancelledBy } from '@prisma/client';

export interface RefundDecision {
  refundCents: number;
  rule: 'full' | 'partial' | 'none' | 'photographer_initiated' | 'platform_initiated';
}

/**
 * Single source of truth for the cancellation refund policy.
 *
 * Customer cancels:
 *   - >= HOURS_FOR_FULL_REFUND before start: full refund
 *   - >= HOURS_FOR_PARTIAL_REFUND before start: PARTIAL_REFUND_RATE × total
 *   - otherwise: no refund (still allowed to cancel; deters last-minute bailing)
 *
 * Photographer cancels:
 *   - always full refund. Photographer reliability is enforced separately.
 *
 * Platform cancels (e.g. fraud, T&S):
 *   - always full refund.
 */
export function computeRefund(args: {
  totalCents: number;
  startsAt: Date;
  now?: Date;
  cancelledBy: CancelledBy;
}): RefundDecision {
  const now = args.now ?? new Date();
  if (args.cancelledBy === 'photographer') {
    return { refundCents: args.totalCents, rule: 'photographer_initiated' };
  }
  if (args.cancelledBy === 'platform') {
    return { refundCents: args.totalCents, rule: 'platform_initiated' };
  }
  const hoursUntil = (args.startsAt.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (hoursUntil >= env.HOURS_FOR_FULL_REFUND) {
    return { refundCents: args.totalCents, rule: 'full' };
  }
  if (hoursUntil >= env.HOURS_FOR_PARTIAL_REFUND) {
    return {
      refundCents: Math.round(args.totalCents * env.PARTIAL_REFUND_RATE),
      rule: 'partial',
    };
  }
  return { refundCents: 0, rule: 'none' };
}
