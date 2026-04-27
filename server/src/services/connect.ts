import { stripe } from '../lib/stripe.js';
import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';

export interface ConnectAccountLink {
  accountLinkUrl: string;
  expiresAt: Date;
}

/**
 * Creates a Stripe Connect Express account for a photographer-to-be. We pin
 * `card_payments` + `transfers` because that's what booking PaymentIntents
 * with `transfer_data.destination` need; the rest of the capabilities matrix
 * (legacy_payments, etc.) isn't relevant for our flow.
 *
 * Country is hardcoded to US for the V1 launch market. When we expand we'll
 * thread the user's country through (likely from `User.homeCountry`, not yet
 * a column).
 *
 * In bypass mode we return a deterministic stub ID so dev iteration doesn't
 * hit Stripe at all.
 */
export async function createConnectAccount(args: { userId: string; email: string }): Promise<string> {
  if (env.STRIPE_CONNECT_DEV_BYPASS) {
    logger.info({ userId: args.userId }, 'connect bypass: returning stub accountId');
    return `acct_dev_${args.userId}`;
  }
  const account = await stripe.accounts.create({
    type: 'express',
    country: 'US',
    email: args.email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: { userId: args.userId },
  });
  return account.id;
}

/**
 * Generates a one-time hosted onboarding URL. The URL expires; if the user
 * doesn't complete onboarding before it does, the iOS app calls
 * `/me/photographer/onboarding/refresh-link` to mint a new one.
 *
 * In bypass mode we return a `capture://` URL the iOS app can intercept
 * locally — the webhook fake will fire `account.updated` shortly after.
 */
export async function createAccountLink(args: { accountId: string }): Promise<ConnectAccountLink> {
  if (env.STRIPE_CONNECT_DEV_BYPASS) {
    return {
      accountLinkUrl: `${env.STRIPE_CONNECT_RETURN_URL}?dev=1&acct=${encodeURIComponent(args.accountId)}`,
      // Stub expiry well in the future — bypass mode never fails on expiry.
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    };
  }
  const link = await stripe.accountLinks.create({
    account: args.accountId,
    refresh_url: env.STRIPE_CONNECT_REFRESH_URL,
    return_url: env.STRIPE_CONNECT_RETURN_URL,
    type: 'account_onboarding',
  });
  return {
    accountLinkUrl: link.url,
    // Stripe returns a unix timestamp in seconds.
    expiresAt: new Date(link.expires_at * 1000),
  };
}

/**
 * Mirrors what the `account.updated` webhook checks — exposes the same
 * predicate so the photographer dashboard can show "Stripe is reviewing your
 * account" vs. "Ready to take bookings."
 */
export function accountIsReady(account: {
  charges_enabled?: boolean | null;
  payouts_enabled?: boolean | null;
  details_submitted?: boolean | null;
}): boolean {
  return Boolean(account.charges_enabled && account.payouts_enabled && account.details_submitted);
}
