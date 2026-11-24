export type MembershipAction =
  | 'APPLY'
  | 'RENEW'
  | 'CONTINUE_PAYMENT'
  | 'AWAITING_CASH'
  | 'PAYMENT_PROCESSING'
  | 'ACTIVE_MEMBER'
  | 'REGISTRATION_CLOSED'
  | 'INELIGIBLE';

export interface MembershipActionInput {
  academicallyEligible: boolean;
  registrationAvailable: boolean;
  alreadyActiveMember: boolean;
  hasPreviousMembership: boolean;

  pendingApplication: {
    status: 'PENDING_PAYMENT' | 'PAYMENT_PROCESSING';
    paymentStatus?: string | null;
  } | null;
}

export function resolveMembershipAction(
  input: MembershipActionInput,
): MembershipAction {
  if (input.alreadyActiveMember) {
    return 'ACTIVE_MEMBER';
  }

  if (input.pendingApplication) {
    if (
      input.pendingApplication.status ===
        'PAYMENT_PROCESSING' ||
      input.pendingApplication.paymentStatus ===
        'PROCESSING'
    ) {
      return 'PAYMENT_PROCESSING';
    }

    if (
      input.pendingApplication.paymentStatus ===
      'AWAITING_CASH'
    ) {
      return 'AWAITING_CASH';
    }

    return 'CONTINUE_PAYMENT';
  }

  if (!input.academicallyEligible) {
    return 'INELIGIBLE';
  }

  if (!input.registrationAvailable) {
    return 'REGISTRATION_CLOSED';
  }

  return input.hasPreviousMembership
    ? 'RENEW'
    : 'APPLY';
}