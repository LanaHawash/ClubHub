import {
  ConflictException,
} from '@nestjs/common';

import type {
  MembershipTransaction,
} from './membership-lock';

export async function createBoardMembershipFeeSnapshot(
  tx: MembershipTransaction,
  clubId: string,
  nominatedById: string,
  feeType: 'FIRST_TIME' | 'RENEWAL',
  now: Date,
) {
  const settings =
    await tx.clubMembershipSettings.findUnique({
      where: {
        clubId,
      },
    });

  if (!settings) {
    throw new ConflictException({
      code: 'MEMBERSHIP_CONFIGURATION_MISSING',

      message:
        'Configure membership fees before creating a paid board nomination.',
    });
  }

  if (
    settings.currency !== 'ILS' ||

    !settings.pendingFirstTimeFee.greaterThan(0) ||

    !settings.pendingRenewalFee.greaterThan(0)
  ) {
    throw new ConflictException(
      'The club membership fee configuration is invalid.',
    );
  }

  const feeVersion =
    await tx.clubMembershipFeeVersion.create({
      data: {
        clubId,

        purpose: 'BOARD_ONBOARDING',

        firstTimeFee:
          settings.pendingFirstTimeFee,

        renewalFee:
          settings.pendingRenewalFee,

        currency:
          settings.currency,

        effectiveAt: now,

        createdById:
          nominatedById,
      },
    });

  const quotedAmount =
    feeType === 'FIRST_TIME'
      ? feeVersion.firstTimeFee
      : feeVersion.renewalFee;

  return {
    feeVersionId:
      feeVersion.id,

    quotedAmount,

    currency:
      feeVersion.currency,

    feeType,
  };
}