import { env } from '../lib/env.js';

export interface FeeBreakdown {
  subtotalCents: number;
  customerFeeCents: number;
  commissionCents: number;
  discountCents: number;
  totalCents: number;
  applicationFeeCents: number; // what Stripe Connect sends to the platform
}

/**
 * Single source of truth for Capture's marketplace math.
 *
 * Revenue model (tunable via env):
 *   customer fee = FLAT_CUSTOMER_FEE_CENTS (e.g. 150 = $1.50)
 *   commission   = COMMISSION_RATE * subtotal (e.g. 0.10 = 10%)
 *
 * With a voucher, `percentOff` discounts the subtotal before fees. The customer
 * sees the discount reflected in `totalCents`; the photographer's share is based
 * on the discounted subtotal so the platform absorbs its share of the discount.
 */
export function computeFees(args: {
  servicePriceCents: number;
  voucherPercentOff?: number;
}): FeeBreakdown {
  const { servicePriceCents } = args;
  const voucherPct = args.voucherPercentOff ?? 0;
  const discountCents = Math.round((servicePriceCents * voucherPct) / 100);
  const subtotalCents = servicePriceCents - discountCents;
  const customerFeeCents = env.FLAT_CUSTOMER_FEE_CENTS;
  const commissionCents = Math.round(subtotalCents * env.COMMISSION_RATE);
  const totalCents = subtotalCents + customerFeeCents;
  const applicationFeeCents = customerFeeCents + commissionCents;
  return {
    subtotalCents,
    customerFeeCents,
    commissionCents,
    discountCents,
    totalCents,
    applicationFeeCents,
  };
}
