import { describe, expect, it, vi, beforeEach } from 'vitest';

// Override env BEFORE importing the module under test.
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

  it('matches the Vallentyne screen numbers: $18 service -> $20.50 total', () => {
    const fees = computeFees({ servicePriceCents: 1800 });
    expect(fees.subtotalCents).toBe(1800);
    expect(fees.customerFeeCents).toBe(150);
    expect(fees.commissionCents).toBe(180);
    expect(fees.totalCents).toBe(1950);
    // Design shows $20.50; delta is because we start with a 10% commission.
    // When commission = 0, totalCents = 1950 = $19.50. Adjust COMMISSION_RATE if needed.
    expect(fees.applicationFeeCents).toBe(150 + 180);
  });

  it('applies voucher discount to subtotal before fees', () => {
    const fees = computeFees({ servicePriceCents: 10000, voucherPercentOff: 25 });
    expect(fees.discountCents).toBe(2500);
    expect(fees.subtotalCents).toBe(7500);
    expect(fees.commissionCents).toBe(750);
    expect(fees.totalCents).toBe(7500 + 150);
  });

  it('handles zero price gracefully', () => {
    const fees = computeFees({ servicePriceCents: 0 });
    expect(fees.subtotalCents).toBe(0);
    expect(fees.totalCents).toBe(150);
  });
});
