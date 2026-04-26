import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../lib/env.js', () => ({
  env: {
    FLAT_CUSTOMER_FEE_CENTS: 150,
    COMMISSION_RATE: 0.1,
  },
}));

import { computeFees } from './payments.js';

describe('computeFees', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches Vallentyne base case: $18 service -> $19.50 customer total + $3.30 platform take', () => {
    const fees = computeFees({ servicePriceCents: 1800 });
    expect(fees.subtotalCents).toBe(1800);
    expect(fees.customerFeeCents).toBe(150);
    expect(fees.commissionCents).toBe(180);
    expect(fees.totalCents).toBe(1950);
    expect(fees.applicationFeeCents).toBe(330);
  });

  it('applies voucher discount to subtotal before fees', () => {
    const fees = computeFees({ servicePriceCents: 10000, voucherPercentOff: 25 });
    expect(fees.discountCents).toBe(2500);
    expect(fees.subtotalCents).toBe(7500);
    expect(fees.commissionCents).toBe(750);
    expect(fees.totalCents).toBe(7500 + 150);
  });

  it('handles zero-priced service', () => {
    const fees = computeFees({ servicePriceCents: 0 });
    expect(fees.subtotalCents).toBe(0);
    expect(fees.totalCents).toBe(150);
  });

  it('rounds commission to nearest cent', () => {
    const fees = computeFees({ servicePriceCents: 1799 });
    expect(fees.commissionCents).toBe(180);
  });

  it('applies referral credit, capped at the application fee, and reduces total + applicationFee equally', () => {
    // $18 service: gross app fee = $1.50 + $1.80 = $3.30
    // Available credit $10 → caps at $3.30 so the platform never goes negative.
    const fees = computeFees({
      servicePriceCents: 1800,
      availableReferralCreditCents: 1000,
    });
    expect(fees.referralCreditAppliedCents).toBe(330);
    expect(fees.totalCents).toBe(1950 - 330);
    expect(fees.applicationFeeCents).toBe(0);
    // Photographer take is `total - applicationFee` (= subtotal - commission)
    // and is unchanged by credit because credit reduces both equally.
    expect(fees.totalCents - fees.applicationFeeCents).toBe(fees.subtotalCents - fees.commissionCents);
  });

  it('applies a partial credit without burning the full balance', () => {
    const fees = computeFees({
      servicePriceCents: 5000,
      availableReferralCreditCents: 200,
    });
    expect(fees.referralCreditAppliedCents).toBe(200);
    expect(fees.totalCents).toBe(5000 + 150 - 200);
  });

  it('treats no credit as zero', () => {
    const fees = computeFees({ servicePriceCents: 1800 });
    expect(fees.referralCreditAppliedCents).toBe(0);
    expect(fees.totalCents).toBe(1950);
  });
});
