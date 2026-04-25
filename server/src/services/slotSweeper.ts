import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

const INTERVAL_MS = 60 * 1000;

/**
 * Releases held slots whose `heldUntil` has passed. Without this, an abandoned
 * checkout leaves a slot stuck in `held` forever.
 *
 * Runs every minute in-process; for a horizontally-scaled deployment, move this
 * into a single worker (BullMQ on Redis) so multiple instances don't race.
 */
export function startSlotSweeper(): NodeJS.Timeout {
  const sweep = async () => {
    try {
      const result = await prisma.availabilitySlot.updateMany({
        where: { status: 'held', heldUntil: { lt: new Date() } },
        data: { status: 'open', heldUntil: null },
      });
      if (result.count > 0) {
        logger.info({ released: result.count }, 'released expired held slots');
      }
    } catch (err) {
      logger.error({ err }, 'slot sweeper failed');
    }
  };
  // Fire once on boot, then on the interval.
  void sweep();
  return setInterval(sweep, INTERVAL_MS);
}
