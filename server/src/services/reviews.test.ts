import { describe, expect, it } from 'vitest';
import { foldRating } from './reviews.js';

describe('foldRating', () => {
  it('seeds the aggregate from zero', () => {
    const next = foldRating({ avgRating: 0, ratingCount: 0 }, 5);
    expect(next).toEqual({ avgRating: 5, ratingCount: 1 });
  });

  it('updates the rolling average', () => {
    const next = foldRating({ avgRating: 5, ratingCount: 1 }, 3);
    expect(next.ratingCount).toBe(2);
    expect(next.avgRating).toBe(4);
  });

  it('handles a long history without recomputing every prior rating', () => {
    let agg = { avgRating: 0, ratingCount: 0 };
    const ratings = [5, 4, 5, 3, 5, 4, 4, 5, 3, 4];
    for (const r of ratings) agg = foldRating(agg, r);
    expect(agg.ratingCount).toBe(10);
    // 5+4+5+3+5+4+4+5+3+4 = 42 → 4.2
    expect(agg.avgRating).toBeCloseTo(4.2, 5);
  });

  it('rejects out-of-range ratings', () => {
    expect(() => foldRating({ avgRating: 0, ratingCount: 0 }, 0)).toThrow(RangeError);
    expect(() => foldRating({ avgRating: 0, ratingCount: 0 }, 6)).toThrow(RangeError);
    expect(() => foldRating({ avgRating: 0, ratingCount: 0 }, NaN)).toThrow(RangeError);
  });
});
