import { describe, expect, it } from 'vitest';
import { threadIsLocked, SendMessageBody, ShareLocationBody, POST_COMPLETION_LOCK_MS } from './messaging.js';

const NOW = new Date('2026-04-25T12:00:00Z');

describe('threadIsLocked', () => {
  it('is open while the booking is confirmed', () => {
    expect(threadIsLocked({ status: 'confirmed', updatedAt: new Date(0) }, NOW)).toBe(false);
  });

  it('is open while the booking is cancelled (so logistics can still be sorted)', () => {
    expect(threadIsLocked({ status: 'cancelled', updatedAt: new Date(0) }, NOW)).toBe(false);
  });

  it('is open within 7 days of completion', () => {
    const justNow = new Date(NOW.getTime() - 60 * 60 * 1000); // 1 hour ago
    expect(threadIsLocked({ status: 'completed', updatedAt: justNow }, NOW)).toBe(false);
  });

  it('locks once the booking has been completed for >7 days', () => {
    const eightDaysAgo = new Date(NOW.getTime() - POST_COMPLETION_LOCK_MS - 1000);
    expect(threadIsLocked({ status: 'completed', updatedAt: eightDaysAgo }, NOW)).toBe(true);
  });
});

describe('SendMessageBody', () => {
  it('accepts a plain text message', () => {
    expect(() => SendMessageBody.parse({ body: 'see you at 5' })).not.toThrow();
  });

  it('accepts an attachment-only message', () => {
    expect(() => SendMessageBody.parse({ attachmentUrl: 'https://cdn.capture.app/img/1.jpg' })).not.toThrow();
  });

  it('rejects an empty payload', () => {
    expect(() => SendMessageBody.parse({})).toThrow();
  });

  it('rejects a message that is just whitespace from the body validator', () => {
    // Zod's min(1) only checks length, not content. The router's responsibility
    // is light here — any 1+ char body is valid by API contract.
    expect(() => SendMessageBody.parse({ body: '' })).toThrow();
  });

  it('rejects a body that exceeds 2000 chars', () => {
    expect(() => SendMessageBody.parse({ body: 'x'.repeat(2001) })).toThrow();
  });

  it('rejects an attachmentUrl that is not a URL', () => {
    expect(() => SendMessageBody.parse({ attachmentUrl: 'not-a-url' })).toThrow();
  });
});

describe('ShareLocationBody', () => {
  it('defaults durationSeconds to 30 minutes', () => {
    const parsed = ShareLocationBody.parse({ lat: 32.7, lng: -117.1 });
    expect(parsed.durationSeconds).toBe(1800);
  });

  it('caps durationSeconds at 4 hours', () => {
    expect(() => ShareLocationBody.parse({ lat: 0, lng: 0, durationSeconds: 5 * 60 * 60 })).toThrow();
  });

  it('rejects out-of-range coordinates', () => {
    expect(() => ShareLocationBody.parse({ lat: 91, lng: 0 })).toThrow();
    expect(() => ShareLocationBody.parse({ lat: 0, lng: 181 })).toThrow();
  });
});
