export type MembershipAvailabilityStatus =
  | 'ALWAYS_OPEN'
  | 'SCHEDULED'
  | 'OPEN'
  | 'CLOSED'
  | 'CLOSED_EARLY'
  | 'NOT_SCHEDULED'
  | 'NOT_CONFIGURED'
  | 'CLUB_ARCHIVED';

export type EffectiveMembershipFees = {
  firstTimeFee: string;
  renewalFee: string;
  currency: string;
  feeVersionId: string;
  effectiveAt: Date;
};

export type MembershipAvailabilityResult = {
  clubId: string;

  registrationMode: 'ALWAYS_OPEN' | 'WINDOWED' | null;

  status: MembershipAvailabilityStatus;

  registrationAvailable: boolean;

  effectiveFees: EffectiveMembershipFees | null;

  window: {
    id: string;
    opensAt: Date;
    closesAt: Date;
    closedAt: Date | null;
    effectiveFeeVersionId: string | null;
  } | null;

  checkedAt: Date;
};