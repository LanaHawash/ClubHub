import {
  BadRequestException,
} from '@nestjs/common';

import {
  MEMBERSHIP_TIME_ZONE,
  MAX_BOARD_START_DAYS_AHEAD,
  calculateMembershipExpiration,
} from './membership-time';

import type {
  MembershipTransaction,
} from './membership-lock';

export interface ValidatedBoardTerm {
  startDate: Date;

  endDate: Date;

  today: Date;

  exclusiveEndDate: Date;
}

export interface BoardCoveragePeriod {
  startAt: Date;

  endAt: Date;
}

const localDateFormatter =
  new Intl.DateTimeFormat('en-CA', {
    timeZone: MEMBERSHIP_TIME_ZONE,

    year: 'numeric',

    month: '2-digit',

    day: '2-digit',
  });

/**
 * Parses a date-only calendar value.
 *
 * UTC midnight is used as a representation of the
 * calendar date, not the local appointment instant.
 */
export function parseBoardDate(
  value: string,
): Date {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    throw new BadRequestException({
      code: 'INVALID_BOARD_DATE',

      message:
        'Board dates must use YYYY-MM-DD.',
    });
  }

  const date = new Date(
    `${value}T00:00:00.000Z`,
  );

  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new BadRequestException({
      code: 'INVALID_BOARD_DATE',

      message:
        'Invalid board calendar date.',
    });
  }

  return date;
}

/**
 * Returns the calendar date in Palestine.
 */
export function getLocalBoardDate(
  instant: Date,
): Date {
  if (!Number.isFinite(instant.getTime())) {
    throw new RangeError(
      'Invalid date instant.',
    );
  }

  const parts =
    localDateFormatter.formatToParts(
      instant,
    );

  const year =
    parts.find(
      part => part.type === 'year',
    )!.value;

  const month =
    parts.find(
      part => part.type === 'month',
    )!.value;

  const day =
    parts.find(
      part => part.type === 'day',
    )!.value;

  return parseBoardDate(
    `${year}-${month}-${day}`,
  );
}

/**
 * Adds calendar days to a date-only value.
 *
 * This does not add fixed 24-hour durations
 * to a local timezone instant.
 */
export function addBoardCalendarDays(
  date: Date,
  days: number,
): Date {
  const result = new Date(
    date.getTime(),
  );

  result.setUTCDate(
    result.getUTCDate() + days,
  );

  return result;
}

/**
 * Validates a newly proposed board appointment.
 *
 * Existing historical appointments are not modified
 * or automatically validated against these new rules.
 */
export function validateNewBoardTerm(
  startDateValue: string,
  endDateValue: string | undefined | null,
  now: Date,
): ValidatedBoardTerm {
  if (!endDateValue) {
    throw new BadRequestException({
      code: 'BOARD_END_DATE_REQUIRED',

      message:
        'An end date is required for new board appointments.',
    });
  }

  const startDate =
    parseBoardDate(startDateValue);

  const endDate =
    parseBoardDate(endDateValue);

  const today =
    getLocalBoardDate(now);

  const latestStartDate =
    addBoardCalendarDays(
      today,
      MAX_BOARD_START_DAYS_AHEAD,
    );

  if (startDate < today) {
    throw new BadRequestException({
      code: 'BOARD_START_IN_PAST',

      message:
        'A new board appointment cannot start in the past.',
    });
  }

  if (startDate > latestStartDate) {
    throw new BadRequestException({
      code: 'BOARD_START_TOO_FAR',

      message:
        'A board appointment must start within the next 14 calendar days.',
    });
  }

  if (endDate < startDate) {
    throw new BadRequestException({
      code: 'BOARD_END_BEFORE_START',

      message:
        'The board end date cannot precede its start date.',
    });
  }

  /*
   * The end date is inclusive.
   *
   * Convert it into an exclusive calendar boundary
   * before checking the maximum term length.
   */
  const exclusiveEndDate =
    addBoardCalendarDays(
      endDate,
      1,
    );

  const maximumExclusiveEndDate =
    calculateMembershipExpiration(
      startDate,
    );

  if (
    exclusiveEndDate >
    maximumExclusiveEndDate
  ) {
    throw new BadRequestException({
      code: 'BOARD_TERM_TOO_LONG',

      message:
        'A board appointment cannot exceed one calendar year.',
    });
  }

  return {
    startDate,

    endDate,

    today,

    exclusiveEndDate,
  };
}

/**
 * Converts validated board calendar dates into
 * actual timezone-aware membership boundaries.
 *
 * PostgreSQL performs the timezone conversion
 * using its timezone database.
 */
export async function resolveBoardCoveragePeriod(
  tx: MembershipTransaction,
  term: ValidatedBoardTerm,
  now: Date,
): Promise<BoardCoveragePeriod> {
  const startDay =
    term.startDate.toISOString().slice(0, 10);

  const endDay =
    term.exclusiveEndDate
      .toISOString()
      .slice(0, 10);

  const boundaries =
    await tx.$queryRaw<
      {
        startAt: Date;
        endAt: Date;
      }[]
    >`
      SELECT
        (
          ${startDay}::date::timestamp
          AT TIME ZONE ${MEMBERSHIP_TIME_ZONE}
        ) AS "startAt",

        (
          ${endDay}::date::timestamp
          AT TIME ZONE ${MEMBERSHIP_TIME_ZONE}
        ) AS "endAt"
    `;

  const boundary = boundaries[0];

  if (!boundary) {
    throw new Error(
      'Unable to resolve board coverage boundaries.',
    );
  }

  /*
   * An appointment beginning today requires
   * coverage from now, not from a historical
   * local midnight.
   *
   * This also supports qualification after a
   * successful same-day nomination payment.
   */
  const startAt = new Date(
    Math.max(
      boundary.startAt.getTime(),
      now.getTime(),
    ),
  );

  if (startAt >= boundary.endAt) {
    throw new BadRequestException({
      code: 'BOARD_TERM_ALREADY_ENDED',

      message:
        'The proposed board term has already ended.',
    });
  }

  return {
    startAt,

    endAt: boundary.endAt,
  };
}