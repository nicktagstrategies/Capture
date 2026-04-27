import type { UserRole } from '@prisma/client';

/**
 * Decides what role a user should hold after Stripe Connect onboarding
 * completes. Pure function so the tests don't need a DB.
 *
 * Rules:
 *  - A `customer` who completes onboarding becomes a `photographer` if they
 *    have no prior bookings as a customer, else `both` (so their booking
 *    history stays addressable as a customer).
 *  - A `photographer` stays a `photographer` — calling onboarding-complete
 *    on someone already onboarded is a no-op (e.g. webhook redelivery).
 *  - `both` stays `both`.
 */
export function nextRoleAfterOnboarding(args: {
  currentRole: UserRole;
  hasPriorCustomerBookings: boolean;
}): UserRole {
  switch (args.currentRole) {
    case 'customer':
      return args.hasPriorCustomerBookings ? 'both' : 'photographer';
    case 'photographer':
    case 'both':
      return args.currentRole;
  }
}
