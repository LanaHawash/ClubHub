import {
  parseBoardDate,
  getLocalBoardDate,
  addBoardCalendarDays,
  validateNewBoardTerm,
} from './board-term';

describe('Sprint 6.G - Board term dates', () => {
  const now = new Date(
    '2026-11-27T10:00:00.000Z',
  );

  // TEST 1
  it('parses a valid date-only value', () => {
    expect(
      parseBoardDate(
        '2026-11-27',
      ).toISOString(),
    ).toBe(
      '2026-11-27T00:00:00.000Z',
    );
  });

  // TEST 2
  it('rejects an invalid calendar date', () => {
    expect(() =>
      parseBoardDate('2026-02-30'),
    ).toThrow();
  });

  // TEST 3
  it('rejects timestamps instead of date-only values', () => {
    expect(() =>
      parseBoardDate(
        '2026-11-27T10:00:00Z',
      ),
    ).toThrow();
  });

  // TEST 4
  it('determines today using Palestine local time', () => {
    const instant = new Date(
      '2026-11-26T23:00:00.000Z',
    );

    expect(
      getLocalBoardDate(
        instant,
      ).toISOString().slice(0, 10),
    ).toBe('2026-11-27');
  });

  // TEST 5
  it('allows an appointment starting today', () => {
    const term =
      validateNewBoardTerm(
        '2026-11-27',

        '2027-02-27',

        now,
      );

    expect(term.startDate).toEqual(
      parseBoardDate('2026-11-27'),
    );
  });

  // TEST 6
  it('allows an appointment starting exactly 14 calendar days later', () => {
    const term =
      validateNewBoardTerm(
        '2026-12-11',

        '2027-02-28',

        now,
      );

    expect(term.startDate).toEqual(
      parseBoardDate('2026-12-11'),
    );
  });

  // TEST 7
  it('rejects an appointment starting 15 calendar days later', () => {
    expect(() =>
      validateNewBoardTerm(
        '2026-12-12',

        '2027-02-28',

        now,
      ),
    ).toThrow();
  });

  // TEST 8
  it('rejects appointments starting in the past', () => {
    expect(() =>
      validateNewBoardTerm(
        '2026-11-26',

        '2027-02-28',

        now,
      ),
    ).toThrow();
  });

  // TEST 9
  it('requires an end date for new appointments', () => {
    expect(() =>
      validateNewBoardTerm(
        '2026-11-27',

        undefined,

        now,
      ),
    ).toThrow();
  });

  // TEST 10
  it('rejects an end date before the start date', () => {
    expect(() =>
      validateNewBoardTerm(
        '2026-11-28',

        '2026-11-27',

        now,
      ),
    ).toThrow();
  });

  // TEST 11
  it('allows a same-day board appointment', () => {
    const term =
      validateNewBoardTerm(
        '2026-11-27',

        '2026-11-27',

        now,
      );

    expect(term.exclusiveEndDate).toEqual(
      parseBoardDate('2026-11-28'),
    );
  });

  // TEST 12
  it('allows a board term of exactly one calendar year', () => {
    const term =
      validateNewBoardTerm(
        '2026-11-27',

        '2027-11-26',

        now,
      );

    expect(term.exclusiveEndDate).toEqual(
      parseBoardDate('2027-11-27'),
    );
  });

  // TEST 13
  it('rejects a board term exceeding one calendar year by one day', () => {
    expect(() =>
      validateNewBoardTerm(
        '2026-11-27',

        '2027-11-27',

        now,
      ),
    ).toThrow();
  });

  // TEST 14
  it('handles calendar-day arithmetic across month boundaries', () => {
    const result =
      addBoardCalendarDays(
        parseBoardDate('2026-12-31'),

        1,
      );

    expect(result).toEqual(
      parseBoardDate('2027-01-01'),
    );
  });

  // TEST 15
  it('handles leap-year calendar dates', () => {
    expect(
      parseBoardDate(
        '2028-02-29',
      ).toISOString(),
    ).toBe(
      '2028-02-29T00:00:00.000Z',
    );
  });

  // TEST 16
  it('handles one-calendar-year term limits across leap years', () => {
    const leapYearNow = new Date(
      '2028-02-29T10:00:00.000Z',
    );

    const term =
      validateNewBoardTerm(
        '2028-02-29',

        '2029-02-27',

        leapYearNow,
      );

    expect(term.exclusiveEndDate).toEqual(
      parseBoardDate('2029-02-28'),
    );

    expect(() =>
      validateNewBoardTerm(
        '2028-02-29',

        '2029-02-28',

        leapYearNow,
      ),
    ).toThrow();
  });
});