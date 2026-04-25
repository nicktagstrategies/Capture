import { Router } from 'express';
import { env } from '../lib/env.js';

export const configRouter = Router();

/**
 * Runtime config served to the iOS app. Lets clients display fee math
 * without hardcoding it.
 */
configRouter.get('/', (_req, res) => {
  res.json({
    stripePublishableKey: env.STRIPE_PUBLISHABLE_KEY,
    flatCustomerFeeCents: env.FLAT_CUSTOMER_FEE_CENTS,
    commissionRate: env.COMMISSION_RATE,
  });
});
