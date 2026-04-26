import { z } from 'zod';

/// Suggestion percentages shown to the customer post-session. Mirrors the
/// "10 / 15 / 20 / Custom" UI; if marketing wants to change the defaults
/// later they can edit this constant in one place.
export const TIP_SUGGESTION_PERCENTS = [10, 15, 20] as const;

export interface TipSuggestion {
  percent: number;
  amountCents: number;
}

/**
 * Computes the suggested tip amounts off the booking subtotal (post-discount,
 * pre-fee). Subtotal is the right anchor: tipping on the customer fee would
 * effectively tip Capture, and tipping on the total post-fee would
 * over-suggest by ~$1.50/booking.
 *
 * Rounding is to the nearest dollar so the buttons read as round numbers
 * ($2 / $3 / $4 on a $20 session) rather than $1.80 / $2.70 / $3.60.
 */
export function tipSuggestions(subtotalCents: number): TipSuggestion[] {
  return TIP_SUGGESTION_PERCENTS.map((percent) => ({
    percent,
    amountCents: Math.round((subtotalCents * percent) / 100 / 100) * 100,
  }));
}

export const CreateTipBody = z.object({
  amountCents: z.number().int().positive(),
});

/**
 * Hard floor + ceiling on tip amounts. Both are env-tunable. Returns the
 * validated amount or throws — keeps the route handler short.
 */
export function clampTipAmount(amountCents: number, min: number, max: number): number {
  if (amountCents < min) {
    throw new RangeError(`Tip must be at least ${min} cents`);
  }
  if (amountCents > max) {
    throw new RangeError(`Tip cannot exceed ${max} cents`);
  }
  return amountCents;
}
