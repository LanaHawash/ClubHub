import {
  ConflictException,
} from '@nestjs/common';

import type {
  MembershipApplication,
} from '../../generated/prisma/client';

import type {
  MembershipTransaction,
} from './membership-lock';

type NominationTerminationReason =
  | 'NOMINATION_TIMEOUT'
  | 'WITHDRAWN'
  | 'CLUB_ARCHIVED';

interface NominationTerminationResult {
  applicationId: string;

  changed: boolean;

  status:
    | 'PENDING_PAYMENT'
    | 'PAYMENT_PROCESSING'
    | 'PAID'
    | 'EXPIRED'
    | 'CANCELED';

  endReason:
    MembershipApplication['endReason'];
}

function unchanged(
  application: MembershipApplication,
): NominationTerminationResult {
  return {
    applicationId: application.id,

    changed: false,

    status: application.status,

    endReason: application.endReason,
  };
}

/**
 * Terminates an unpaid board nomination and
 * its associated financial workflow.
 *
 * The caller must hold the club and applicable
 * membership locks.
 */
export async function terminateBoardNomination(
  tx: MembershipTransaction,
  application: MembershipApplication,
  now: Date,
  reason: NominationTerminationReason,
): Promise<NominationTerminationResult> {
  if (
    application.kind !== 'BOARD_ONBOARDING' ||
    !application.boardNominationId ||
    (
      application.status !== 'PENDING_PAYMENT' &&
      application.status !== 'PAYMENT_PROCESSING'
    )
  ) {
    return unchanged(application);
  }

  const nomination =
    await tx.boardNomination.findUniqueOrThrow({
      where: {
        id: application.boardNominationId,
      },
    });

  if (
    nomination.clubId !== application.clubId ||
    nomination.studentId !== application.studentId
  ) {
    throw new ConflictException(
      'Nomination and application records are inconsistent.',
    );
  }

  if (
    nomination.status !== 'PENDING_PAYMENT' &&
    nomination.status !== 'PAYMENT_PROCESSING'
  ) {
    throw new ConflictException(
      'The unpaid nomination has an inconsistent lifecycle state.',
    );
  }

  if (
    nomination.boardAppointmentId !== null
  ) {
    throw new ConflictException(
      'A nomination linked to an official appointment cannot be terminated.',
    );
  }

  const isExpiration =
    reason === 'NOMINATION_TIMEOUT';

  const applicationStatus =
    isExpiration
      ? 'EXPIRED'
      : 'CANCELED';

  const nominationStatus =
    isExpiration
      ? 'EXPIRED'
      : 'WITHDRAWN';

  /*
   * Update the application conditionally.
   */
  const applicationUpdated =
    await tx.membershipApplication.updateMany({
      where: {
        id: application.id,

        status: application.status,
      },

      data: {
        status: applicationStatus,

        endReason: reason,

        canceledAt:
          isExpiration
            ? null
            : now,

        processingGraceEndsAt: null,
      },
    });

  if (applicationUpdated.count !== 1) {
    throw new ConflictException(
      'The application changed during nomination termination.',
    );
  }

  /*
   * Expire live payments without deleting
   * their financial records.
   */
  await tx.payment.updateMany({
    where: {
      membershipApplicationId:
        application.id,

      status: {
        in: [
          'AWAITING_CASH',
          'PROCESSING',
        ],
      },
    },

    data: {
      status: 'EXPIRED',
    },
  });

  /*
   * Expiring an online attempt does not prove
   * that a provider charge never occurred.
   *
   * Later verified success must still enter
   * the financial reconciliation workflow.
   */
  await tx.paymentAttempt.updateMany({
    where: {
      payment: {
        membershipApplicationId:
          application.id,
      },

      status: {
        in: [
          'INITIATED',
          'PROCESSING',
          'UNKNOWN',
        ],
      },
    },

    data: {
      status: 'EXPIRED',

      resolvedAt: now,
    },
  });

  /*
   * Terminate the nomination itself.
   */
  const nominationUpdated =
    await tx.boardNomination.updateMany({
      where: {
        id: nomination.id,

        status: nomination.status,

        boardAppointmentId: null,
      },

      data: {
        status: nominationStatus,

        expiredAt:
          isExpiration
            ? now
            : null,

        withdrawnAt:
          isExpiration
            ? null
            : now,
      },
    });

  if (nominationUpdated.count !== 1) {
    throw new ConflictException(
      'The nomination changed during termination.',
    );
  }

  return {
    applicationId: application.id,

    changed: true,

    status: applicationStatus,

    endReason: reason,
  };
}

/**
 * Reconciles the current state of an unpaid
 * board nomination.
 */
export async function reconcileBoardNominationApplication(
  tx: MembershipTransaction,
  application: MembershipApplication,
  now: Date,
): Promise<NominationTerminationResult> {
  if (
    application.kind !== 'BOARD_ONBOARDING' ||
    (
      application.status !== 'PENDING_PAYMENT' &&
      application.status !== 'PAYMENT_PROCESSING'
    )
  ) {
    return unchanged(application);
  }

  if (!application.boardNominationId) {
    throw new ConflictException(
      'Board onboarding application has no nomination.',
    );
  }

  const nomination =
    await tx.boardNomination.findUniqueOrThrow({
      where: {
        id: application.boardNominationId,
      },
    });

  const club =
    await tx.club.findUniqueOrThrow({
      where: {
        id: application.clubId,
      },

      select: {
        status: true,
      },
    });

  /*
   * Administrative invalidation takes precedence
   * over normal deadline expiration.
   */
  if (club.status !== 'ACTIVE') {
    return terminateBoardNomination(
      tx,
      application,
      now,
      'CLUB_ARCHIVED',
    );
  }

  /*
   * Board nominations receive no additional
   * online processing grace.
   */
  if (
    now >= nomination.deadlineAt ||
    now >= application.paymentDeadlineAt
  ) {
    return terminateBoardNomination(
      tx,
      application,
      now,
      'NOMINATION_TIMEOUT',
    );
  }

  return unchanged(application);
}

/**
 * Permanently invalidates all unpaid nominations
 * when a club is archived.
 *
 * Caller must hold the club and membership
 * settings locks.
 */
export async function withdrawClubBoardNominations(
  tx: MembershipTransaction,
  clubId: string,
  now: Date,
): Promise<number> {
  const applications =
    await tx.membershipApplication.findMany({
      where: {
        clubId,

        kind: 'BOARD_ONBOARDING',

        status: {
          in: [
            'PENDING_PAYMENT',
            'PAYMENT_PROCESSING',
          ],
        },
      },

      orderBy: {
        id: 'asc',
      },
    });

  let changedCount = 0;

  for (const application of applications) {
    const result =
      await terminateBoardNomination(
        tx,
        application,
        now,
        'CLUB_ARCHIVED',
      );

    if (result.changed) {
      changedCount++;
    }
  }

  return changedCount;
}