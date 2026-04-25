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
});
