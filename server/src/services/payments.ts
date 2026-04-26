import { env } from '../lib/env.js';

export interface FeeBreakdown {
  subtotalCents: number;
  customerFeeCents: number;
  commissionCents: number;
  discountCents: number;
  referralCreditAppliedCents: number;
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
 *
 * Referral credit (`availableReferralCreditCents`) is applied last and capped
 * at the platform's application fee. It reduces the customer's total and the
 * platform's application fee by the same amount, so the photographer's net
 * take (subtotal − commission, paid via Stripe Connect) is unchanged.
 * Capture absorbs the cost of the credit by giving up its own take.
 */
export function computeFees(args: {
  servicePriceCents: number;
  voucherPercentOff?: number;
  availableReferralCreditCents?: number;
}): FeeBreakdown {
  const { servicePriceCents } = args;
  const voucherPct = args.voucherPercentOff ?? 0;
  const discountCents = Math.round((servicePriceCents * voucherPct) / 100);
  const subtotalCents = servicePriceCents - discountCents;
  const customerFeeCents = env.FLAT_CUSTOMER_FEE_CENTS;
  const commissionCents = Math.round(subtotalCents * env.COMMISSION_RATE);
  const grossTotalCents = subtotalCents + customerFeeCents;
  const grossApplicationFee = customerFeeCents + commissionCents;
  const referralCreditAppliedCents = Math.max(
    0,
    Math.min(args.availableReferralCreditCents ?? 0, grossApplicationFee),
  );
  const totalCents = grossTotalCents - referralCreditAppliedCents;
  const applicationFeeCents = grossApplicationFee - referralCreditAppliedCents;
  return {
    subtotalCents,
    customerFeeCents,
    commissionCents,
    discountCents,
    referralCreditAppliedCents,
    totalCents,
    applicationFeeCents,
  };
}
