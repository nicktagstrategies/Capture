import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  accountsCreate: vi.fn(),
  accountLinksCreate: vi.fn(),
  env: {
    STRIPE_CONNECT_DEV_BYPASS: false,
    STRIPE_CONNECT_RETURN_URL: 'capture://onboarding/return',
    STRIPE_CONNECT_REFRESH_URL: 'capture://onboarding/refresh',
  },
}));

vi.mock('../lib/stripe.js', () => ({
  stripe: {
    accounts: { create: mocks.accountsCreate },
    accountLinks: { create: mocks.accountLinksCreate },
  },
}));

vi.mock('../lib/env.js', () => ({ env: mocks.env }));

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { createConnectAccount, createAccountLink, accountIsReady } from './connect.js';

describe('connect', () => {
  beforeEach(() => {
    mocks.accountsCreate.mockReset();
    mocks.accountLinksCreate.mockReset();
    mocks.env.STRIPE_CONNECT_DEV_BYPASS = false;
  });

  describe('createConnectAccount', () => {
    it('returns a deterministic stub in bypass mode without hitting Stripe', async () => {
      mocks.env.STRIPE_CONNECT_DEV_BYPASS = true;
      const id = await createConnectAccount({ userId: 'usr_123', email: 'a@b.com' });
      expect(id).toBe('acct_dev_usr_123');
      expect(mocks.accountsCreate).not.toHaveBeenCalled();
    });

    it('delegates to stripe.accounts.create with the right capabilities', async () => {
      mocks.accountsCreate.mockResolvedValue({ id: 'acct_real_abc' });
      const id = await createConnectAccount({ userId: 'usr_123', email: 'a@b.com' });
      expect(id).toBe('acct_real_abc');
      expect(mocks.accountsCreate).toHaveBeenCalledWith(expect.objectContaining({
        type: 'express',
        country: 'US',
        email: 'a@b.com',
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: { userId: 'usr_123' },
      }));
    });
  });

  describe('createAccountLink', () => {
    it('returns a capture:// URL in bypass mode (no Stripe call)', async () => {
      mocks.env.STRIPE_CONNECT_DEV_BYPASS = true;
      const link = await createAccountLink({ accountId: 'acct_dev_xyz' });
      expect(link.accountLinkUrl).toContain('capture://onboarding/return');
      expect(link.accountLinkUrl).toContain('acct_dev_xyz');
      expect(mocks.accountLinksCreate).not.toHaveBeenCalled();
    });

    it('delegates to stripe.accountLinks.create and converts the unix expiry', async () => {
      mocks.accountLinksCreate.mockResolvedValue({
        url: 'https://connect.stripe.com/setup/abc',
        expires_at: 1_700_000_000,
      });
      const link = await createAccountLink({ accountId: 'acct_real_abc' });
      expect(link.accountLinkUrl).toBe('https://connect.stripe.com/setup/abc');
      expect(link.expiresAt.getTime()).toBe(1_700_000_000 * 1000);
      expect(mocks.accountLinksCreate).toHaveBeenCalledWith({
        account: 'acct_real_abc',
        refresh_url: 'capture://onboarding/refresh',
        return_url: 'capture://onboarding/return',
        type: 'account_onboarding',
      });
    });
  });

  describe('accountIsReady', () => {
    it('is true only when all three flags are true', () => {
      expect(accountIsReady({ charges_enabled: true, payouts_enabled: true, details_submitted: true })).toBe(true);
    });

    it('is false when any flag is missing or false', () => {
      expect(accountIsReady({ charges_enabled: true, payouts_enabled: false, details_submitted: true })).toBe(false);
      expect(accountIsReady({ charges_enabled: true, payouts_enabled: true, details_submitted: false })).toBe(false);
      expect(accountIsReady({ charges_enabled: false, payouts_enabled: true, details_submitted: true })).toBe(false);
      expect(accountIsReady({})).toBe(false);
    });
  });
});
