import {
  ConflictException,
} from '@nestjs/common';

import {
  getLocalBoardDate,
} from './board-term';

import type {
  MembershipTransaction,
} from './membership-lock';

interface BoardConflictInput {
  clubId: string;

  studentId: string;

  position: string;

  startDate: Date;

  endDate: Date;

  now: Date;

  excludeAppointmentId?: string;

  excludeNominationId?: string;
}

export async function assertNoBoardAppointmentConflict(
  tx: MembershipTransaction,
  input: BoardConflictInput,
): Promise<void> {
  const {
    clubId,
    studentId,
    position,
    startDate,
    endDate,
    now,
  } = input;

  const isPresident =
    position.trim().toLowerCase() ===
    'president';

  const appointments =
    await tx.boardAppointment.findMany({
      where: {
        clubId,

        ...(input.excludeAppointmentId
          ? {
              id: {
                not:
                  input.excludeAppointmentId,
              },
            }
          : {}),

        startDate: {
          lte: endDate,
        },
      },

      select: {
        studentId: true,
        position: true,
        startDate: true,
        endDate: true,
        endedAt: true,
      },
    });

  for (const appointment of appointments) {
    if (
      appointment.endedAt &&

      startDate >=
        getLocalBoardDate(
          appointment.endedAt,
        )
    ) {
      continue;
    }

    const effectiveEnd =
      appointment.endedAt
        ? getLocalBoardDate(
            appointment.endedAt,
          )
        : appointment.endDate;

    const overlaps =
      appointment.startDate <= endDate &&

      (
        !effectiveEnd ||
        effectiveEnd >= startDate
      );

    const conflictingCandidate =
      appointment.studentId === studentId;

    const conflictingPresident =
      isPresident &&

      appointment.position
        .trim()
        .toLowerCase() === 'president';

    if (
      overlaps &&

      (
        conflictingCandidate ||
        conflictingPresident
      )
    ) {
      throw new ConflictException({
        code: 'BOARD_APPOINTMENT_OVERLAP',

        message:
          'The proposed term overlaps an existing board appointment.',
      });
    }
  }

  const nominations =
    await tx.boardNomination.findMany({
      where: {
        clubId,

        ...(input.excludeNominationId
          ? {
              id: {
                not:
                  input.excludeNominationId,
              },
            }
          : {}),

        status: {
          in: [
            'PENDING_PAYMENT',
            'PAYMENT_PROCESSING',
          ],
        },

        deadlineAt: {
          gt: now,
        },

        proposedStartDate: {
          lte: endDate,
        },

        proposedEndDate: {
          gte: startDate,
        },
      },

      select: {
        studentId: true,
        position: true,
      },
    });

  const conflictingNomination =
    nominations.some(
      nomination =>
        nomination.studentId === studentId ||

        (
          isPresident &&

          nomination.position
            .trim()
            .toLowerCase() === 'president'
        ),
    );

  if (conflictingNomination) {
    throw new ConflictException({
      code: 'BOARD_NOMINATION_OVERLAP',

      message:
        'The candidate or president position is reserved by another active nomination.',
    });
  }
}