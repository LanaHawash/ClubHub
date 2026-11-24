import {
  evaluateMembershipCoverage,
  MembershipInterval,
} from './membership-coverage';

describe('Sprint 6 - Membership coverage', () => {
  function membership(
    activatedAt: string,
    expiresAt: string,
  ): MembershipInterval {
    return {
      activatedAt: new Date(activatedAt),
      expiresAt: new Date(expiresAt),
    };
  }

  const requiredStart = new Date(
    '2027-01-01T00:00:00.000Z',
  );

  const requiredEnd = new Date(
    '2028-01-01T00:00:00.000Z',
  );

  it('rejects coverage when no membership exists', () => {
    const result = evaluateMembershipCoverage(
      [],
      requiredStart,
      requiredEnd,
    );

    expect(result.fullyCovered).toBe(false);

    expect(result.missingIntervals).toEqual([
      {
        startAt: requiredStart,
        endAt: requiredEnd,
      },
    ]);
  });

  it('accepts a membership covering the entire period', () => {
    const result = evaluateMembershipCoverage(
      [
        membership(
          '2026-12-01T00:00:00.000Z',
          '2028-02-01T00:00:00.000Z',
        ),
      ],
      requiredStart,
      requiredEnd,
    );

    expect(result.fullyCovered).toBe(true);
    expect(result.missingIntervals).toEqual([]);
  });

  it('accepts coverage matching the exact boundaries', () => {
    const result = evaluateMembershipCoverage(
      [
        {
          activatedAt: requiredStart,
          expiresAt: requiredEnd,
        },
      ],
      requiredStart,
      requiredEnd,
    );

    expect(result.fullyCovered).toBe(true);
  });

  it('accepts adjacent prepaid renewal intervals', () => {
    const result = evaluateMembershipCoverage(
      [
        membership(
          '2026-07-01T00:00:00.000Z',
          '2027-07-01T00:00:00.000Z',
        ),
        membership(
          '2027-07-01T00:00:00.000Z',
          '2028-07-01T00:00:00.000Z',
        ),
      ],
      requiredStart,
      requiredEnd,
    );

    expect(result.fullyCovered).toBe(true);
    expect(result.missingIntervals).toEqual([]);
  });

  it('rejects a one-millisecond membership gap', () => {
    const result = evaluateMembershipCoverage(
      [
        membership(
          '2026-07-01T00:00:00.000Z',
          '2027-07-01T00:00:00.000Z',
        ),
        membership(
          '2027-07-01T00:00:00.001Z',
          '2028-07-01T00:00:00.000Z',
        ),
      ],
      requiredStart,
      requiredEnd,
    );

    expect(result.fullyCovered).toBe(false);

    expect(result.missingIntervals).toEqual([
      {
        startAt: new Date(
          '2027-07-01T00:00:00.000Z',
        ),
        endAt: new Date(
          '2027-07-01T00:00:00.001Z',
        ),
      },
    ]);
  });

  it('rejects membership expiring before the required end', () => {
    const result = evaluateMembershipCoverage(
      [
        membership(
          '2026-12-01T00:00:00.000Z',
          '2027-12-01T00:00:00.000Z',
        ),
      ],
      requiredStart,
      requiredEnd,
    );

    expect(result.fullyCovered).toBe(false);
    expect(result.missingIntervals).toEqual([
      {
        startAt: new Date(
          '2027-12-01T00:00:00.000Z',
        ),
        endAt: requiredEnd,
      },
    ]);
  });

  it('rejects coverage beginning after the required start', () => {
    const result = evaluateMembershipCoverage(
      [
        membership(
          '2027-02-01T00:00:00.000Z',
          '2028-02-01T00:00:00.000Z',
        ),
      ],
      requiredStart,
      requiredEnd,
    );

    expect(result.fullyCovered).toBe(false);

    expect(result.missingIntervals).toEqual([
      {
        startAt: requiredStart,
        endAt: new Date(
          '2027-02-01T00:00:00.000Z',
        ),
      },
    ]);
  });

  it('ignores expired membership outside the required period', () => {
    const result = evaluateMembershipCoverage(
      [
        membership(
          '2025-01-01T00:00:00.000Z',
          '2026-01-01T00:00:00.000Z',
        ),
      ],
      requiredStart,
      requiredEnd,
    );

    expect(result.fullyCovered).toBe(false);
  });

  it('correctly sorts unordered membership intervals', () => {
    const result = evaluateMembershipCoverage(
      [
        membership(
          '2027-07-01T00:00:00.000Z',
          '2028-07-01T00:00:00.000Z',
        ),
        membership(
          '2026-07-01T00:00:00.000Z',
          '2027-07-01T00:00:00.000Z',
        ),
      ],
      requiredStart,
      requiredEnd,
    );

    expect(result.fullyCovered).toBe(true);
  });

  it('rejects an invalid required interval', () => {
    expect(() =>
      evaluateMembershipCoverage(
        [],
        requiredEnd,
        requiredStart,
      ),
    ).toThrow(RangeError);
  });
});