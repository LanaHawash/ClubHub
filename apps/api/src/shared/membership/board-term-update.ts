import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';

import {
  addBoardCalendarDays,
  getLocalBoardDate,
} from './board-term';

import type {
  ValidatedBoardTerm,
} from './board-term';

import {
  calculateMembershipExpiration,
  MAX_BOARD_START_DAYS_AHEAD,
} from './membership-time';

export function validateUpdatedBoardTerm(
  originalStartDate: Date,

  proposedStartDate: Date,

  proposedEndDate: Date | null,

  now: Date,
): ValidatedBoardTerm {
  const today =
    getLocalBoardDate(now);

  if (!proposedEndDate) {
    throw new BadRequestException({
      code: 'BOARD_END_DATE_REQUIRED',

      message:
        'A modified board term must have an end date.',
    });
  }

  const startChanged =
    originalStartDate.getTime() !==
    proposedStartDate.getTime();

  /*
   * Preserve the historical start of an appointment
   * that has already begun.
   */
  if (
    startChanged &&
    originalStartDate <= today
  ) {
    throw new ConflictException({
      code: 'BOARD_START_ALREADY_EFFECTIVE',

      message:
        'The start date of an existing board term cannot be changed after the term has begun.',
    });
  }

  if (
    startChanged &&
    proposedStartDate < today
  ) {
    throw new BadRequestException({
      code: 'BOARD_START_IN_PAST',

      message:
        'The modified start date cannot be in the past.',
    });
  }

  if (
    proposedStartDate >
      addBoardCalendarDays(
        today,

        MAX_BOARD_START_DAYS_AHEAD,
      )
  ) {
    throw new BadRequestException({
      code: 'BOARD_START_TOO_FAR',

      message:
        'A future board term must start within the next 14 calendar days.',
    });
  }

  if (
    proposedEndDate <
    proposedStartDate
  ) {
    throw new BadRequestException({
      code: 'BOARD_END_BEFORE_START',

      message:
        'The board end date cannot precede its start date.',
    });
  }

  if (
    proposedEndDate < today
  ) {
    throw new BadRequestException({
      code: 'BOARD_TERM_ALREADY_ENDED',

      message:
        'Use the board appointment ending operation instead of backdating the end date.',
    });
  }

  const exclusiveEndDate =
    addBoardCalendarDays(
      proposedEndDate,

      1,
    );

  if (
    exclusiveEndDate >
      calculateMembershipExpiration(
        proposedStartDate,
      )
  ) {
    throw new BadRequestException({
      code: 'BOARD_TERM_TOO_LONG',

      message:
        'A modified board term cannot exceed one calendar year.',
    });
  }

  return {
    startDate:
      proposedStartDate,

    endDate:
      proposedEndDate,

    today,

    exclusiveEndDate,
  };
}