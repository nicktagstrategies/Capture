/**
 * Pricing for a sent gift-card voucher.
 *
 * The sender pays Capture up-front; the recipient redeems the percentage-off
 * at checkout. Without a paid send-flow anyone could mint free money, so this
 * is the anti-fraud floor.
 *
 * Heuristic: a flat base ($5) + a per-percent-off rate ($0.50). A 25% voucher
 * therefore costs $5 + $12.50 = $17.50. Tunable; revisit once we have data on
 * average redeemed booking value.
 */
const BASE_CENTS = 500;
const PER_PERCENT_CENTS = 50;

export function priceVoucherCents(percentOff: number): number {
  if (percentOff < 5 || percentOff > 100) {
    throw new Error('percentOff out of range');
  }
  return BASE_CENTS + percentOff * PER_PERCENT_CENTS;
}
