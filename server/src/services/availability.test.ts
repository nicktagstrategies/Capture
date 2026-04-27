import { describe, expect, it } from 'vitest';
import { findOverlap, validateSlot } from './availability.js';

const at = (iso: string) => new Date(iso);

describe('findOverlap', () => {
  it('returns null when intervals are disjoint', () => {
    const candidates = [{ startsAt: at('2030-01-01T10:00Z'), endsAt: at('2030-01-01T11:00Z') }];
    const existing = [{ startsAt: at('2030-01-01T12:00Z'), endsAt: at('2030-01-01T13:00Z') }];
    expect(findOverlap(candidates, existing)).toBeNull();
  });

  it('treats intervals as half-open — back-to-back is allowed', () => {
    const candidates = [{ startsAt: at('2030-01-01T11:00Z'), endsAt: at('2030-01-01T12:00Z') }];
    const existing = [{ startsAt: at('2030-01-01T10:00Z'), endsAt: at('2030-01-01T11:00Z') }];
    expect(findOverlap(candidates, existing)).toBeNull();
  });

  it('detects partial overlap on the right edge', () => {
    const candidates = [{ startsAt: at('2030-01-01T10:30Z'), endsAt: at('2030-01-01T11:30Z') }];
    const existing = [{ startsAt: at('2030-01-01T11:00Z'), endsAt: at('2030-01-01T12:00Z') }];
    expect(findOverlap(candidates, existing)).not.toBeNull();
  });

  it('detects a candidate fully inside an existing slot', () => {
    const candidates = [{ startsAt: at('2030-01-01T11:15Z'), endsAt: at('2030-01-01T11:45Z') }];
    const existing = [{ startsAt: at('2030-01-01T11:00Z'), endsAt: at('2030-01-01T12:00Z') }];
    expect(findOverlap(candidates, existing)).not.toBeNull();
  });

  it('detects two candidates overlapping each other when re-checked together', () => {
    // Caller can reuse findOverlap to dedupe within a batch by passing the
    // same array on both sides minus the current one — exercise the loop here.
    const candidates = [
      { startsAt: at('2030-01-01T10:00Z'), endsAt: at('2030-01-01T11:00Z') },
      { startsAt: at('2030-01-01T10:30Z'), endsAt: at('2030-01-01T11:30Z') },
    ];
    expect(findOverlap([candidates[1]!], [candidates[0]!])).not.toBeNull();
  });
});

describe('validateSlot', () => {
  const now = at('2030-01-01T00:00Z');

  it('rejects ends <= starts', () => {
    expect(validateSlot({ startsAt: at('2030-02-01T10:00Z'), endsAt: at('2030-02-01T10:00Z') }, now))
      .toEqual({ ok: false, reason: 'invalid_range' });
    expect(validateSlot({ startsAt: at('2030-02-01T11:00Z'), endsAt: at('2030-02-01T10:00Z') }, now))
      .toEqual({ ok: false, reason: 'invalid_range' });
  });

  it('rejects past slots', () => {
    expect(validateSlot({ startsAt: at('2029-12-31T10:00Z'), endsAt: at('2029-12-31T11:00Z') }, now))
      .toEqual({ ok: false, reason: 'in_past' });
  });

  it('accepts a future slot with positive duration', () => {
    expect(validateSlot({ startsAt: at('2030-02-01T10:00Z'), endsAt: at('2030-02-01T11:00Z') }, now))
      .toEqual({ ok: true });
  });
});
