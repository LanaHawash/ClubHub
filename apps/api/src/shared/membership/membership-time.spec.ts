import {
  calculateAlwaysOpenDeadline,
  calculateNominationDeadline,
  calculateOnlineGraceDeadline,
  calculateEarlyClosureGraceDeadline,
  isBeforeDeadline,
  isMembershipActive,
  calculateMembershipExpiration,
} from './membership-time';

describe('Sprint 6 - Membership time calculations', () => {
  const submittedAt = new Date('2026-11-24T10:00:00.000Z');

  describe('ordinary application deadline', () => {
    it('expires exactly 14 days after submission', () => {
      expect(
        calculateAlwaysOpenDeadline(submittedAt).toISOString(),
      ).toBe('2026-12-08T10:00:00.000Z');
    });
  });

  describe('board nomination deadline', () => {
    it('expires exactly 72 hours after nomination', () => {
      expect(
        calculateNominationDeadline(submittedAt).toISOString(),
      ).toBe('2026-11-27T10:00:00.000Z');
    });
  });

  describe('online payment grace', () => {
    it('adds exactly 30 minutes to the payment deadline', () => {
      expect(
        calculateOnlineGraceDeadline(submittedAt).toISOString(),
      ).toBe('2026-11-24T10:30:00.000Z');
    });
  });

  describe('early window closure grace', () => {
    it('allows 30 minutes after early closure', () => {
      const closedAt = new Date('2026-11-24T10:00:00.000Z');

      const originalGraceDeadline = new Date(
        '2026-11-24T12:30:00.000Z',
      );

      expect(
        calculateEarlyClosureGraceDeadline(
          closedAt,
          originalGraceDeadline,
        ).toISOString(),
      ).toBe('2026-11-24T10:30:00.000Z');
    });

    it('never extends an earlier existing processing cutoff', () => {
      const closedAt = new Date('2026-11-24T10:00:00.000Z');

      const originalGraceDeadline = new Date(
        '2026-11-24T10:15:00.000Z',
      );

      expect(
        calculateEarlyClosureGraceDeadline(
          closedAt,
          originalGraceDeadline,
        ).toISOString(),
      ).toBe('2026-11-24T10:15:00.000Z');
    });
  });

  describe('payment deadline boundary', () => {
    const deadline = new Date('2026-11-24T10:00:00.000Z');

    it('allows payment one millisecond before deadline', () => {
      const now = new Date('2026-11-24T09:59:59.999Z');

      expect(isBeforeDeadline(now, deadline)).toBe(true);
    });

    it('rejects payment exactly at the deadline', () => {
      expect(isBeforeDeadline(deadline, deadline)).toBe(false);
    });

    it('rejects payment after the deadline', () => {
      const now = new Date('2026-11-24T10:00:00.001Z');

      expect(isBeforeDeadline(now, deadline)).toBe(false);
    });
  });

  describe('membership interval boundaries', () => {
    const activatedAt = new Date('2026-11-24T10:00:00.000Z');
    const expiresAt = new Date('2027-11-24T10:00:00.000Z');

    it('does not activate a future membership early', () => {
      const now = new Date('2026-11-24T09:59:59.999Z');

      expect(
        isMembershipActive(activatedAt, expiresAt, now),
      ).toBe(false);
    });

    it('activates exactly at the activation timestamp', () => {
      expect(
        isMembershipActive(
          activatedAt,
          expiresAt,
          activatedAt,
        ),
      ).toBe(true);
    });

    it('remains active one millisecond before expiration', () => {
      const now = new Date('2027-11-24T09:59:59.999Z');

      expect(
        isMembershipActive(activatedAt, expiresAt, now),
      ).toBe(true);
    });

    it('expires exactly at the expiration timestamp', () => {
      expect(
        isMembershipActive(
          activatedAt,
          expiresAt,
          expiresAt,
        ),
      ).toBe(false);
    });

    it('remains expired after the expiration timestamp', () => {
      const now = new Date('2027-11-24T10:00:00.001Z');

      expect(
        isMembershipActive(activatedAt, expiresAt, now),
      ).toBe(false);
    });
  });
  describe('membership calendar-year expiration', () => {
  it('adds exactly one calendar year', () => {
    expect(
      calculateMembershipExpiration(
        new Date('2026-11-24T10:30:00.000Z'),
      ).toISOString(),
    ).toBe('2027-11-24T10:30:00.000Z');
  });

  it('preserves hours, minutes, seconds and milliseconds', () => {
    expect(
      calculateMembershipExpiration(
        new Date('2026-06-15T13:45:27.123Z'),
      ).toISOString(),
    ).toBe('2027-06-15T13:45:27.123Z');
  });

  it('clamps February 29 to February 28', () => {
    expect(
      calculateMembershipExpiration(
        new Date('2028-02-29T12:00:00.000Z'),
      ).toISOString(),
    ).toBe('2029-02-28T12:00:00.000Z');
  });

  it('handles a membership spanning a leap year', () => {
    expect(
      calculateMembershipExpiration(
        new Date('2027-03-01T10:00:00.000Z'),
      ).toISOString(),
    ).toBe('2028-03-01T10:00:00.000Z');
  });

  it('does not mutate the original activation date', () => {
    const activatedAt = new Date(
      '2026-11-24T10:00:00.000Z',
    );

    calculateMembershipExpiration(activatedAt);

    expect(activatedAt.toISOString()).toBe(
      '2026-11-24T10:00:00.000Z',
    );
  });

  it('rejects invalid activation dates', () => {
    expect(() =>
      calculateMembershipExpiration(
        new Date('invalid'),
      ),
    ).toThrow(RangeError);
  });
});
});