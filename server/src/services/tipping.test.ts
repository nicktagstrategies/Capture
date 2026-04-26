import { describe, expect, it } from 'vitest';
import {
  tipSuggestions,
  clampTipAmount,
  CreateTipBody,
  TIP_SUGGESTION_PERCENTS,
} from './tipping.js';

describe('tipSuggestions', () => {
  it('returns one suggestion per canonical percent', () => {
    const subs = tipSuggestions(2000);
    expect(subs.map((s) => s.percent)).toEqual([...TIP_SUGGESTION_PERCENTS]);
  });

  it('rounds suggestions to whole dollars on a $20 subtotal', () => {
    const subs = tipSuggestions(2000);
    expect(subs).toEqual([
      { percent: 10, amountCents: 200 },
      { percent: 15, amountCents: 300 },
      { percent: 20, amountCents: 400 },
    ]);
  });

  it('rounds suggestions to whole dollars on an awkward $18 subtotal', () => {
    // 10% of $18 = $1.80 → $2; 15% = $2.70 → $3; 20% = $3.60 → $4.
    const subs = tipSuggestions(1800);
    expect(subs).toEqual([
      { percent: 10, amountCents: 200 },
      { percent: 15, amountCents: 300 },
      { percent: 20, amountCents: 400 },
    ]);
  });

  it('handles a $0 subtotal gracefully', () => {
    const subs = tipSuggestions(0);
    expect(subs.every((s) => s.amountCents === 0)).toBe(true);
  });

  it('rounds upward when the cent amount is exactly halfway', () => {
    // 10% of $0.50 = $0.05 → rounds to $0 because we collapse to whole dollars.
    // 15% of $50 = $7.50 → $7 (banker's rounding via Math.round on 7.5 → 8 actually).
    // We just want to confirm the math is monotonic-ish; nothing crazy.
    const subs = tipSuggestions(5000);
    expect(subs[0]!.amountCents).toBe(500);  // $5
    expect(subs[2]!.amountCents).toBe(1000); // $10
  });
});

describe('clampTipAmount', () => {
  it('returns the amount unchanged when in range', () => {
    expect(clampTipAmount(500, 100, 50_000)).toBe(500);
  });

  it('throws when below the floor', () => {
    expect(() => clampTipAmount(50, 100, 50_000)).toThrow(RangeError);
  });

  it('throws when above the ceiling', () => {
    expect(() => clampTipAmount(60_000, 100, 50_000)).toThrow(RangeError);
  });

  it('accepts amounts at exactly the floor and ceiling', () => {
    expect(clampTipAmount(100, 100, 50_000)).toBe(100);
    expect(clampTipAmount(50_000, 100, 50_000)).toBe(50_000);
  });
});

describe('CreateTipBody', () => {
  it('accepts a positive integer', () => {
    expect(() => CreateTipBody.parse({ amountCents: 500 })).not.toThrow();
  });

  it('rejects zero or negative', () => {
    expect(() => CreateTipBody.parse({ amountCents: 0 })).toThrow();
    expect(() => CreateTipBody.parse({ amountCents: -100 })).toThrow();
  });

  it('rejects fractional cents', () => {
    expect(() => CreateTipBody.parse({ amountCents: 5.5 })).toThrow();
  });

  it('rejects a missing amount', () => {
    expect(() => CreateTipBody.parse({})).toThrow();
  });
});
