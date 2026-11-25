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
  isBeforeDeadline,
} from './membership-time';

/**
 * Validates whether an ordinary membership application
 * can start a payment or receive a cash confirmation.
 *
 * Must be called inside a transaction after obtaining
 * the appropriate membership locks.
 *
 * Online callback reconciliation uses separate validation
 * because verified online payments may qualify for grace.
 */
export async function assertOrdinaryApplicationPayable(
  tx: MembershipTransaction,
  application: MembershipApplication,
  now: Date,
): Promise<void> {
  if (application.kind !== 'ORDINARY') {
    throw new ConflictException({
      code: 'INVALID_APPLICATION_KIND',
      message:
        'This operation requires an ordinary membership application.',
    });
  }

  if (application.status !== 'PENDING_PAYMENT') {
    throw new ConflictException({
      code: 'APPLICATION_NOT_PAYABLE',
      message:
        'This application is not awaiting payment.',
    });
  }

  if (
    !isBeforeDeadline(
      now,
      application.paymentDeadlineAt,
    )
  ) {
    throw new ConflictException({
      code: 'APPLICATION_DEADLINE_PASSED',
      message:
        'The membership application payment deadline has passed.',
    });
  }

  const club = await tx.club.findUnique({
    where: {
      id: application.clubId,
    },

    select: {
      status: true,

      membershipSettings: {
        select: {
          registrationMode: true,
        },
      },
    },
  });

  if (!club || club.status !== 'ACTIVE') {
    throw new ConflictException({
      code: 'CLUB_UNAVAILABLE',
      message:
        'The club is not accepting membership payments.',
    });
  }

  if (
    !club.membershipSettings ||
    club.membershipSettings.registrationMode !==
      application.registrationModeAtSubmission
  ) {
    throw new ConflictException({
      code: 'REGISTRATION_POLICY_CHANGED',
      message:
        'The original registration policy is no longer available.',
    });
  }

  if (
    application.registrationModeAtSubmission ===
    'WINDOWED'
  ) {
    if (!application.registrationWindowId) {
      throw new ConflictException({
        code: 'REGISTRATION_WINDOW_UNAVAILABLE',
        message:
          'The application registration window is unavailable.',
      });
    }

    const window =
      await tx.clubRegistrationWindow.findFirst({
        where: {
          id: application.registrationWindowId,
          clubId: application.clubId,
        },
      });

    if (
      !window ||
      window.canceledAt ||
      window.closedAt ||
      window.opensAt > now ||
      window.closesAt <= now
    ) {
      throw new ConflictException({
        code: 'REGISTRATION_CLOSED',
        message:
          'The application registration window is closed.',
      });
    }
  }

  const activeMembership =
    await tx.membership.findFirst({
      where: {
        clubId: application.clubId,
        studentId: application.studentId,

        activatedAt: {
          lte: now,
        },

        expiresAt: {
          gt: now,
        },
      },

      select: {
        id: true,
      },
    });

  if (activeMembership) {
    throw new ConflictException({
      code: 'ALREADY_ACTIVE_MEMBER',
      message:
        'The student already has an active membership.',
    });
  }
}