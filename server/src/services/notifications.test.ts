import { describe, expect, it, vi, beforeEach } from 'vitest';

// vi.mock factories run before the rest of the file. Hoist the mock fns
// alongside them so the factory can capture stable references.
const mocks = vi.hoisted(() => ({
  notificationCreate: vi.fn(),
  notificationUpdate: vi.fn(),
  deviceFindMany: vi.fn(),
}));

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    notification: { create: mocks.notificationCreate, update: mocks.notificationUpdate },
    device: { findMany: mocks.deviceFindMany },
  },
}));

vi.mock('../lib/env.js', () => ({
  env: {
    APNS_BUNDLE_ID: undefined,
    APNS_TEAM_ID: undefined,
    APNS_KEY_ID: undefined,
    APNS_PRIVATE_KEY: undefined,
    APNS_HOST: 'api.sandbox.push.apple.com',
  },
}));

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { notificationCreate, notificationUpdate, deviceFindMany } = mocks;

import { dispatchPush, setNotificationProvider, type PushProvider } from './notifications.js';

function makeProvider(over: Partial<PushProvider> = {}): PushProvider {
  return {
    isConfigured: () => true,
    send: async () => ({ delivered: 1, failed: 0 }),
    ...over,
  };
}

describe('dispatchPush', () => {
  beforeEach(() => {
    notificationCreate.mockReset();
    notificationUpdate.mockReset();
    deviceFindMany.mockReset();
    notificationCreate.mockResolvedValue({ id: 'notif_1' });
    notificationUpdate.mockResolvedValue({});
  });

  it('marks `skipped` when the provider is not configured', async () => {
    setNotificationProvider(makeProvider({ isConfigured: () => false }));
    await dispatchPush({
      recipientId: 'user_1',
      kind: 'booking_confirmed',
      title: 'Booking confirmed',
      body: '...',
    });
    expect(notificationUpdate).toHaveBeenCalledWith({
      where: { id: 'notif_1' },
      data: expect.objectContaining({ status: 'skipped', errorReason: 'provider_not_configured' }),
    });
    expect(deviceFindMany).not.toHaveBeenCalled();
  });

  it('marks `skipped` when the user has no registered devices', async () => {
    deviceFindMany.mockResolvedValue([]);
    setNotificationProvider(makeProvider());
    await dispatchPush({
      recipientId: 'user_1',
      kind: 'message_received',
      title: 'New message',
      body: '...',
    });
    expect(notificationUpdate).toHaveBeenCalledWith({
      where: { id: 'notif_1' },
      data: expect.objectContaining({ status: 'skipped', errorReason: 'no_devices' }),
    });
  });

  it('marks `sent` when at least one device receives it', async () => {
    deviceFindMany.mockResolvedValue([{ apnsToken: 'tok_a' }, { apnsToken: 'tok_b' }]);
    const send = vi.fn().mockResolvedValue({ delivered: 2, failed: 0 });
    setNotificationProvider(makeProvider({ send }));
    await dispatchPush({
      recipientId: 'user_1',
      kind: 'gallery_delivered',
      title: 'Photos are ready',
      body: '...',
      payload: { bookingId: 'bk_1' },
    });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      deviceTokens: ['tok_a', 'tok_b'],
      payload: expect.objectContaining({ kind: 'gallery_delivered', bookingId: 'bk_1' }),
    }));
    expect(notificationUpdate).toHaveBeenCalledWith({
      where: { id: 'notif_1' },
      data: expect.objectContaining({ status: 'sent' }),
    });
  });

  it('marks `failed` when every device errors', async () => {
    deviceFindMany.mockResolvedValue([{ apnsToken: 'tok_a' }]);
    const send = vi.fn().mockResolvedValue({ delivered: 0, failed: 1, errorReason: 'BadDeviceToken' });
    setNotificationProvider(makeProvider({ send }));
    await dispatchPush({
      recipientId: 'user_1',
      kind: 'tip_paid',
      title: 'Tip received',
      body: '...',
    });
    expect(notificationUpdate).toHaveBeenCalledWith({
      where: { id: 'notif_1' },
      data: expect.objectContaining({ status: 'failed', errorReason: 'BadDeviceToken' }),
    });
  });

  it('never throws, even when the provider blows up', async () => {
    deviceFindMany.mockResolvedValue([{ apnsToken: 'tok_a' }]);
    const send = vi.fn().mockRejectedValue(new Error('apns down'));
    setNotificationProvider(makeProvider({ send }));
    await expect(dispatchPush({
      recipientId: 'user_1',
      kind: 'booking_confirmed',
      title: '...',
      body: '...',
    })).resolves.toBeUndefined();
    expect(notificationUpdate).toHaveBeenCalledWith({
      where: { id: 'notif_1' },
      data: expect.objectContaining({ status: 'failed' }),
    });
  });
});
