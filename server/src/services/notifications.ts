import type { NotificationKind } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';

export interface DispatchInput {
  recipientId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /// iOS app reads this off `userInfo` to deep-link into the right screen.
  payload?: Record<string, unknown>;
}

/**
 * Provider abstraction. The default `apnsProvider` instance reads APNs config
 * from env and falls back to a no-op when any of the four required values are
 * missing. Tests inject their own provider via `setNotificationProvider`.
 */
export interface PushProvider {
  isConfigured(): boolean;
  send(args: {
    deviceTokens: string[];
    bundleId: string;
    title: string;
    body: string;
    payload?: Record<string, unknown>;
  }): Promise<{ delivered: number; failed: number; errorReason?: string }>;
}

class APNsProvider implements PushProvider {
  isConfigured(): boolean {
    return Boolean(
      env.APNS_BUNDLE_ID && env.APNS_TEAM_ID && env.APNS_KEY_ID && env.APNS_PRIVATE_KEY,
    );
  }

  async send(args: {
    deviceTokens: string[];
    bundleId: string;
    title: string;
    body: string;
    payload?: Record<string, unknown>;
  }) {
    // V1: log + return success. Real HTTP/2 + ES256 JWT delivery is wired in
    // a follow-up — the abstraction is in place so the routes can call this
    // unconditionally without checking env. When that follow-up lands the
    // hooks already pointing at us will start delivering for free.
    logger.info(
      {
        kind: 'apns_stub',
        deviceCount: args.deviceTokens.length,
        title: args.title,
      },
      'apns send (stub) — replace with real http2+jose transport',
    );
    return { delivered: args.deviceTokens.length, failed: 0 };
  }
}

let provider: PushProvider = new APNsProvider();

export function setNotificationProvider(next: PushProvider) {
  provider = next;
}

/**
 * Dispatches a push notification to every device registered to `recipientId`.
 * Always returns; never throws. Failures are recorded on the Notification row
 * for later inspection.
 */
export async function dispatchPush(input: DispatchInput): Promise<void> {
  const notification = await prisma.notification.create({
    data: {
      recipientId: input.recipientId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      payload: input.payload as object | undefined,
    },
  });

  try {
    if (!provider.isConfigured()) {
      await markStatus(notification.id, 'skipped', 'provider_not_configured');
      return;
    }
    const devices = await prisma.device.findMany({
      where: { userId: input.recipientId },
      select: { apnsToken: true },
    });
    if (devices.length === 0) {
      await markStatus(notification.id, 'skipped', 'no_devices');
      return;
    }
    const result = await provider.send({
      deviceTokens: devices.map((d) => d.apnsToken),
      bundleId: env.APNS_BUNDLE_ID!,
      title: input.title,
      body: input.body,
      payload: { kind: input.kind, ...input.payload },
    });
    if (result.failed === devices.length) {
      await markStatus(notification.id, 'failed', result.errorReason ?? 'all_devices_failed');
    } else {
      await markStatus(notification.id, 'sent', null);
    }
  } catch (err) {
    logger.error({ err, notificationId: notification.id }, 'dispatchPush failed');
    await markStatus(notification.id, 'failed', String((err as Error).message ?? err));
  }
}

async function markStatus(id: string, status: 'sent' | 'skipped' | 'failed', errorReason: string | null) {
  await prisma.notification.update({
    where: { id },
    data: {
      status,
      errorReason,
      sentAt: status === 'sent' ? new Date() : null,
    },
  });
}
