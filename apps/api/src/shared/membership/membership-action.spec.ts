import {
  resolveMembershipAction,
  MembershipActionInput,
} from './membership-action';

describe('Sprint 6 - Membership action resolver', () => {
  const base: MembershipActionInput = {
    academicallyEligible: true,
    registrationAvailable: true,
    alreadyActiveMember: false,
    hasPreviousMembership: false,
    pendingApplication: null,
  };

  it('offers APPLY to an eligible first-time student', () => {
    expect(
      resolveMembershipAction(base),
    ).toBe('APPLY');
  });

  it('offers RENEW to a previous member', () => {
    expect(
      resolveMembershipAction({
        ...base,
        hasPreviousMembership: true,
      }),
    ).toBe('RENEW');
  });

  it('shows ACTIVE_MEMBER for an active member', () => {
    expect(
      resolveMembershipAction({
        ...base,
        alreadyActiveMember: true,
        hasPreviousMembership: true,
      }),
    ).toBe('ACTIVE_MEMBER');
  });

  it('shows INELIGIBLE for an academically ineligible student', () => {
    expect(
      resolveMembershipAction({
        ...base,
        academicallyEligible: false,
      }),
    ).toBe('INELIGIBLE');
  });

  it('shows REGISTRATION_CLOSED when registration is unavailable', () => {
    expect(
      resolveMembershipAction({
        ...base,
        registrationAvailable: false,
      }),
    ).toBe('REGISTRATION_CLOSED');
  });

  it('shows CONTINUE_PAYMENT for a pending application', () => {
    expect(
      resolveMembershipAction({
        ...base,
        pendingApplication: {
          status: 'PENDING_PAYMENT',
        },
      }),
    ).toBe('CONTINUE_PAYMENT');
  });

  it('shows AWAITING_CASH for an unconfirmed cash payment', () => {
    expect(
      resolveMembershipAction({
        ...base,
        pendingApplication: {
          status: 'PENDING_PAYMENT',
          paymentStatus: 'AWAITING_CASH',
        },
      }),
    ).toBe('AWAITING_CASH');
  });

  it('shows PAYMENT_PROCESSING for an online processing application', () => {
    expect(
      resolveMembershipAction({
        ...base,
        pendingApplication: {
          status: 'PAYMENT_PROCESSING',
          paymentStatus: 'PROCESSING',
        },
      }),
    ).toBe('PAYMENT_PROCESSING');
  });

  it('prioritizes an existing application over offering renewal', () => {
    expect(
      resolveMembershipAction({
        ...base,
        hasPreviousMembership: true,
        pendingApplication: {
          status: 'PENDING_PAYMENT',
        },
      }),
    ).toBe('CONTINUE_PAYMENT');
  });

  it('preserves visibility of an existing application when registration closes', () => {
    expect(
      resolveMembershipAction({
        ...base,
        registrationAvailable: false,
        pendingApplication: {
          status: 'PENDING_PAYMENT',
        },
      }),
    ).toBe('CONTINUE_PAYMENT');
  });
});