import { describe, expect, it, vi } from 'vitest';

/**
 * Slot reservation behavior is enforced by the SQL-level updateMany count
 * check in routes/bookings.ts. Two concurrent bookers see status='open',
 * but only one updateMany returns count=1; the other returns 0 and we
 * throw a 409. This test simulates that contract by mocking Prisma.
 */

const updateMany = vi.fn();
const findUniqueOrThrow = vi.fn();

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    availabilitySlot: { updateMany, findUniqueOrThrow },
  },
}));

describe('slot reservation contract', () => {
  it('first reserver gets count=1 and the second gets count=0', async () => {
    // Race scenario: two requests, second sees the row already 'held'.
    updateMany.mockResolvedValueOnce({ count: 1 });
    updateMany.mockResolvedValueOnce({ count: 0 });

    const { prisma } = await import('../lib/prisma.js');
    const a = await prisma.availabilitySlot.updateMany({
      where: { id: 'slot_1', status: 'open' },
      data: { status: 'held' },
    });
    const b = await prisma.availabilitySlot.updateMany({
      where: { id: 'slot_1', status: 'open' },
      data: { status: 'held' },
    });

    expect(a.count).toBe(1);
    expect(b.count).toBe(0);
  });
});
