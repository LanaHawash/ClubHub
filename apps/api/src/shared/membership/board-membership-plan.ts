import {
  ConflictException,
} from '@nestjs/common';

import {
  calculateMembershipExpiration,
} from './membership-time';

import {
  evaluateMembershipCoverage,
} from './membership-coverage';

import type {
  MembershipTransaction,
} from './membership-lock';

import type {
  BoardCoveragePeriod,
} from './board-term';

export interface BoardMembershipPlan {
  feeType:
    | 'FIRST_TIME'
    | 'RENEWAL';

  activationMode:
    | 'IMMEDIATE'
    | 'PREPAID_RENEWAL';

  projectedActivatedAt: Date;

  projectedExpiresAt: Date;
}

export async function planBoardMembershipPurchase(
  tx: MembershipTransaction,
  clubId: string,
  studentId: string,
  period: BoardCoveragePeriod,
  now: Date,
): Promise<BoardMembershipPlan> {
  const memberships =
    await tx.membership.findMany({
      where: {
        clubId,
        studentId,
      },

      select: {
        activatedAt: true,
        expiresAt: true,
      },

      orderBy: {
        activatedAt: 'asc',
      },
    });

  const activeMembership =
    memberships.find(
      membership =>
        membership.activatedAt <= now &&
        membership.expiresAt > now,
    );

  /*
   * A first-time membership or a renewal after
   * expiration begins immediately upon payment.
   *
   * A nominee with existing continuous coverage
   * may prepay a renewal starting at its boundary.
   */
  let projectedActivatedAt = now;

  let activationMode:
    BoardMembershipPlan['activationMode'] =
      'IMMEDIATE';

  if (activeMembership) {
    projectedActivatedAt =
      activeMembership.expiresAt;

    /*
     * Include any already-purchased adjacent
     * membership periods.
     */
    for (const membership of memberships) {
      if (
        membership.activatedAt.getTime() ===
        projectedActivatedAt.getTime()
      ) {
        projectedActivatedAt =
          membership.expiresAt;
      }
    }

    activationMode = 'PREPAID_RENEWAL';
  }

  const projectedExpiresAt =
    calculateMembershipExpiration(
      projectedActivatedAt,
    );

  /*
   * Do not propose a membership that overlaps
   * another existing paid membership.
   */
  const overlaps =
    memberships.some(
      membership =>
        membership.activatedAt <
          projectedExpiresAt &&

        membership.expiresAt >
          projectedActivatedAt,
    );

  if (overlaps) {
    throw new ConflictException({
      code: 'BOARD_MEMBERSHIP_PLAN_OVERLAP',

      message:
        'The proposed membership purchase would overlap existing membership coverage.',
    });
  }

  const coverage =
    evaluateMembershipCoverage(
      [
        ...memberships,

        {
          activatedAt:
            projectedActivatedAt,

          expiresAt:
            projectedExpiresAt,
        },
      ],

      period.startAt,

      period.endAt,
    );

  if (!coverage.fullyCovered) {
    throw new ConflictException({
      code: 'BOARD_TERM_NOT_COVERABLE',

      message:
        'One membership purchase cannot cover the proposed board term. Adjust the appointment dates before collecting payment.',

      missingIntervals:
        coverage.missingIntervals,

      projectedActivatedAt,

      projectedExpiresAt,
    });
  }

  return {
    feeType:
      memberships.length > 0
        ? 'RENEWAL'
        : 'FIRST_TIME',

    activationMode,

    projectedActivatedAt,

    projectedExpiresAt,
  };
}