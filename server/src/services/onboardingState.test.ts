import { describe, expect, it } from 'vitest';
import { nextRoleAfterOnboarding } from './onboardingState.js';

describe('nextRoleAfterOnboarding', () => {
  it('promotes a customer with no booking history to photographer', () => {
    expect(
      nextRoleAfterOnboarding({ currentRole: 'customer', hasPriorCustomerBookings: false }),
    ).toBe('photographer');
  });

  it('promotes a customer with prior bookings to both', () => {
    expect(
      nextRoleAfterOnboarding({ currentRole: 'customer', hasPriorCustomerBookings: true }),
    ).toBe('both');
  });

  it('is a no-op for an existing photographer (idempotent webhook redelivery)', () => {
    expect(
      nextRoleAfterOnboarding({ currentRole: 'photographer', hasPriorCustomerBookings: false }),
    ).toBe('photographer');
    expect(
      nextRoleAfterOnboarding({ currentRole: 'photographer', hasPriorCustomerBookings: true }),
    ).toBe('photographer');
  });

  it('keeps both as both', () => {
    expect(
      nextRoleAfterOnboarding({ currentRole: 'both', hasPriorCustomerBookings: true }),
    ).toBe('both');
    expect(
      nextRoleAfterOnboarding({ currentRole: 'both', hasPriorCustomerBookings: false }),
    ).toBe('both');
  });
});
