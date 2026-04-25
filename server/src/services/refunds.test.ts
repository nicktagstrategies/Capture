import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/env.js', () => ({
  env: {
    HOURS_FOR_FULL_REFUND: 48,
    HOURS_FOR_PARTIAL_REFUND: 24,
    PARTIAL_REFUND_RATE: 0.5,
  },
}));

import { computeRefund } from './refunds.js';

const NOW = new Date('2026-04-25T12:00:00Z');

function startsAt(hoursFromNow: number): Date {
  return new Date(NOW.getTime() + hoursFromNow * 60 * 60 * 1000);
}

describe('computeRefund', () => {
  it('full refund when customer cancels >= 48h ahead', () => {
    const r = computeRefund({
      totalCents: 2050,
      startsAt: startsAt(72),
      now: NOW,
      cancelledBy: 'customer',
    });
    expect(r).toEqual({ refundCents: 2050, rule: 'full' });
  });

  it('partial refund when customer cancels in the 24-48h window', () => {
    const r = computeRefund({
      totalCents: 2050,
      startsAt: startsAt(36),
      now: NOW,
      cancelledBy: 'customer',
    });
    expect(r.rule).toBe('partial');
    expect(r.refundCents).toBe(1025); // round(2050 * 0.5)
  });

  it('no refund when customer cancels < 24h ahead', () => {
    const r = computeRefund({
      totalCents: 2050,
      startsAt: startsAt(6),
      now: NOW,
      cancelledBy: 'customer',
    });
    expect(r).toEqual({ refundCents: 0, rule: 'none' });
  });

  it('photographer always triggers full refund regardless of timing', () => {
    const r = computeRefund({
      totalCents: 2050,
      startsAt: startsAt(2),
      now: NOW,
      cancelledBy: 'photographer',
    });
    expect(r).toEqual({ refundCents: 2050, rule: 'photographer_initiated' });
  });

  it('platform cancellation is full refund', () => {
    const r = computeRefund({
      totalCents: 12500,
      startsAt: startsAt(0),
      now: NOW,
      cancelledBy: 'platform',
    });
    expect(r).toEqual({ refundCents: 12500, rule: 'platform_initiated' });
  });
});
