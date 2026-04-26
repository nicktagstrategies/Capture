import { describe, expect, it, vi } from 'vitest';

// referrals.ts imports prisma + env at module load. We don't exercise either
// from the pure helpers tested here, but the imports themselves trigger env
// validation (which exits the process when DATABASE_URL etc. are missing in
// test). Mocking both keeps this test free of real-env dependencies.
vi.mock('../lib/prisma.js', () => ({ prisma: {} }));
vi.mock('../lib/env.js', () => ({
  env: {
    REFERRAL_CREDIT_CENTS: 1000,
  },
}));

import { generateReferralCode, applicableReferralCredit } from './referrals.js';

describe('generateReferralCode', () => {
  it('returns a 6-char code', () => {
    expect(generateReferralCode()).toHaveLength(6);
  });

  it('only uses unambiguous alphanumeric characters', () => {
    // No I, O, 0, 1 — these are too easy to confuse over phone/SMS.
    const allowed = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
    for (let i = 0; i < 50; i++) {
      expect(generateReferralCode()).toMatch(allowed);
    }
  });

  it('produces effectively unique codes across runs', () => {
    // 50 draws from 32^6 ≈ 1B keyspace — collisions should never happen here.
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) seen.add(generateReferralCode());
    expect(seen.size).toBe(50);
  });
});

describe('applicableReferralCredit', () => {
  it('returns the credit when it fits inside the application fee', () => {
    expect(applicableReferralCredit({ availableCreditCents: 500, applicationFeeCents: 1000 })).toBe(500);
  });

  it('caps at the application fee so the platform never goes negative', () => {
    expect(applicableReferralCredit({ availableCreditCents: 5000, applicationFeeCents: 330 })).toBe(330);
  });

  it('returns zero when no credit is available', () => {
    expect(applicableReferralCredit({ availableCreditCents: 0, applicationFeeCents: 330 })).toBe(0);
  });

  it('returns zero when the application fee is zero (e.g. $0 booking)', () => {
    expect(applicableReferralCredit({ availableCreditCents: 1000, applicationFeeCents: 0 })).toBe(0);
  });

  it('floors negative inputs to zero defensively', () => {
    expect(applicableReferralCredit({ availableCreditCents: -100, applicationFeeCents: 500 })).toBe(0);
  });
});
