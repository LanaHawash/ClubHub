import {
  ConflictException,
} from '@nestjs/common';

import type {
  MembershipApplication,
} from '../../generated/prisma/client';

import type {
  MembershipTransaction,
} from './membership-lock';

import {
  validateNewBoardTerm,
  resolveBoardCoveragePeriod,
  getLocalBoardDate,
} from './board-term';

import {
  evaluateBoardMembershipCoverage,
} from './board-membership-coverage';

import {
  planBoardMembershipPurchase,
} from './board-membership-plan';

import {
  assertNoBoardAppointmentConflict,
} from './board-appointment-conflicts';

/**
 * Validates an exceptional board nomination application
 * and calculates the membership purchase required to
 * qualify the nominee.
 *
 * The caller must hold the club, membership settings
 * and student-club membership locks.
 */
export async function assertBoardNominationPayable(
  tx: MembershipTransaction,
  application: MembershipApplication,
  now: Date,
) {
  if (
    application.kind !== 'BOARD_ONBOARDING' ||
    !application.boardNominationId
  ) {
    throw new ConflictException({
      code: 'INVALID_APPLICATION_KIND',

      message:
        'A board nomination membership application is required.',
    });
  }

  if (application.status !== 'PENDING_PAYMENT') {
    throw new ConflictException({
      code: 'APPLICATION_NOT_PAYABLE',

      message:
        'The nomination application is not awaiting payment.',
    });
  }

  if (now >= application.paymentDeadlineAt) {
    throw new ConflictException({
      code: 'NOMINATION_DEADLINE_PASSED',

      message:
        'The board nomination payment deadline has passed.',
    });
  }

  const nomination =
    await tx.boardNomination.findUnique({
      where: {
        id: application.boardNominationId,
      },
    });

  if (
    !nomination ||
    nomination.clubId !== application.clubId ||
    nomination.studentId !== application.studentId
  ) {
    throw new ConflictException({
      code: 'NOMINATION_APPLICATION_MISMATCH',

      message:
        'The nomination and membership application are inconsistent.',
    });
  }

  if (
    nomination.status !== 'PENDING_PAYMENT' ||
    nomination.boardAppointmentId !== null
  ) {
    throw new ConflictException({
      code: 'NOMINATION_NOT_PAYABLE',

      message:
        'The board nomination is not awaiting payment.',
    });
  }

  if (
    now >= nomination.deadlineAt ||
    nomination.deadlineAt.getTime() !==
      application.paymentDeadlineAt.getTime()
  ) {
    throw new ConflictException({
      code: 'NOMINATION_DEADLINE_INVALID',

      message:
        'The nomination payment deadline is no longer valid.',
    });
  }

  const club =
    await tx.club.findUnique({
      where: {
        id: application.clubId,
      },

      select: {
        status: true,
      },
    });

  if (!club || club.status !== 'ACTIVE') {
    throw new ConflictException({
      code: 'CLUB_UNAVAILABLE',

      message:
        'Board nomination payments are unavailable for this club.',
    });
  }

  /*
   * Validate the original proposed term using the
   * nomination creation timestamp.
   *
   * Payment may occur several days after the
   * originally proposed start date.
   */
  const term =
    validateNewBoardTerm(
      nomination.proposedStartDate
        .toISOString()
        .slice(0, 10),

      nomination.proposedEndDate
        .toISOString()
        .slice(0, 10),

      nomination.nominatedAt,
    );

  /*
   * A nominee cannot become an official board member
   * before their payment has been confirmed.
   */
  const today =
    getLocalBoardDate(now);

  const effectiveStartDate =
    term.startDate < today
      ? today
      : term.startDate;

  if (effectiveStartDate > term.endDate) {
    throw new ConflictException({
      code: 'BOARD_TERM_ALREADY_ENDED',

      message:
        'The proposed board term has already ended.',
    });
  }

  const effectiveTerm = {
    ...term,

    startDate: effectiveStartDate,

    today,
  };

  const period =
    await resolveBoardCoveragePeriod(
      tx,
      effectiveTerm,
      now,
    );

  /*
   * Recheck the candidate and president position
   * before collecting or confirming payment.
   */
  await assertNoBoardAppointmentConflict(
    tx,
    {
      clubId: application.clubId,

      studentId: application.studentId,

      position: nomination.position,

      startDate: effectiveStartDate,

      endDate: nomination.proposedEndDate,

      now,

      excludeNominationId: nomination.id,
    },
  );

  /*
   * Do not sell another membership if the required
   * term is already fully covered.
   */
  const existingCoverage =
    await evaluateBoardMembershipCoverage(
      tx,
      application.clubId,
      application.studentId,
      period,
    );

  if (existingCoverage.fullyCovered) {
    throw new ConflictException({
      code: 'BOARD_TERM_ALREADY_COVERED',

      message:
        'The candidate already has sufficient membership coverage. Review the nomination before collecting payment.',
    });
  }

  const membershipPlan =
    await planBoardMembershipPurchase(
      tx,
      application.clubId,
      application.studentId,
      period,
      now,
    );

  /*
   * The frozen fee must remain appropriate for
   * the actual membership purchase.
   */
  if (
    membershipPlan.feeType !==
    application.feeType
  ) {
    throw new ConflictException({
      code: 'NOMINATION_FEE_TYPE_CHANGED',

      message:
        'The membership history has changed. Review the nomination before collecting payment.',
    });
  }

  const feeVersion =
    await tx.clubMembershipFeeVersion.findFirst({
      where: {
        id: application.feeVersionId,

        clubId: application.clubId,

        purpose: 'BOARD_ONBOARDING',
      },
    });

  if (!feeVersion) {
    throw new ConflictException({
      code: 'NOMINATION_FEE_VERSION_INVALID',

      message:
        'The nomination fee snapshot is unavailable.',
    });
  }

  const expectedAmount =
    application.feeType === 'FIRST_TIME'
      ? feeVersion.firstTimeFee
      : feeVersion.renewalFee;

  if (
    !application.quotedAmount.equals(
      expectedAmount,
    ) ||

    application.currency !== feeVersion.currency ||

    application.currency !== 'ILS' ||

    !application.quotedAmount.greaterThan(0)
  ) {
    throw new ConflictException({
      code: 'NOMINATION_QUOTE_INVALID',

      message:
        'The nomination membership quote is inconsistent.',
    });
  }

  return {
    nomination,

    membershipPlan,

    period,

    effectiveStartDate,

    effectiveEndDate:
      nomination.proposedEndDate,
  };
}