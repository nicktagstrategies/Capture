/**
 * Pure helper: does any of `candidates` overlap any of `existing`?
 *
 * Two intervals [a, b) and [c, d) overlap iff `a < d && c < b`. Treating the
 * intervals as half-open avoids edge-equality bugs (a slot that ends exactly
 * when another begins is fine — back-to-back sessions are allowed).
 */
export interface Slot {
  startsAt: Date;
  endsAt: Date;
}

export function findOverlap(candidates: Slot[], existing: Slot[]): { candidate: Slot; existing: Slot } | null {
  for (const c of candidates) {
    for (const e of existing) {
      if (c.startsAt < e.endsAt && e.startsAt < c.endsAt) {
        return { candidate: c, existing: e };
      }
    }
  }
  return null;
}

/**
 * Validates a single slot's shape: ends after start, not in the past.
 * Throws strings (callers wrap in HttpError); we don't import HttpError here
 * so this stays trivially testable.
 */
export function validateSlot(slot: Slot, now = new Date()): { ok: true } | { ok: false; reason: 'invalid_range' | 'in_past' } {
  if (slot.endsAt.getTime() <= slot.startsAt.getTime()) return { ok: false, reason: 'invalid_range' };
  if (slot.startsAt.getTime() < now.getTime()) return { ok: false, reason: 'in_past' };
  return { ok: true };
}
