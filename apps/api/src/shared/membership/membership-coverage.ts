export interface MembershipInterval {
  activatedAt: Date;
  expiresAt: Date;
}

export interface CoverageInterval {
  startAt: Date;
  endAt: Date;
}

export interface MembershipCoverageResult {
  fullyCovered: boolean;
  missingIntervals: CoverageInterval[];
}

/**
 * Determines whether confirmed membership intervals
 * continuously cover a required period.
 *
 * All intervals are half-open: [start, end).
 *
 * Adjacent intervals provide continuous coverage.
 * Unpaid applications must never be supplied as memberships.
 */
export function evaluateMembershipCoverage(
  memberships: MembershipInterval[],
  requiredStartAt: Date,
  requiredEndAt: Date,
): MembershipCoverageResult {
  const start = requiredStartAt.getTime();
  const end = requiredEndAt.getTime();

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start
  ) {
    throw new RangeError(
      'Required coverage must be a valid positive interval.',
    );
  }

  const intervals = memberships
    .map((membership) => ({
      start: membership.activatedAt.getTime(),
      end: membership.expiresAt.getTime(),
    }))
    .filter(
      (interval) =>
        Number.isFinite(interval.start) &&
        Number.isFinite(interval.end) &&
        interval.end > interval.start,
    )
    .sort((a, b) => a.start - b.start);

  const missingIntervals: CoverageInterval[] = [];

  let coveredUntil = start;

  for (const interval of intervals) {
    if (interval.end <= coveredUntil) {
      continue;
    }

    if (interval.start >= end) {
      break;
    }

    if (interval.start > coveredUntil) {
      missingIntervals.push({
        startAt: new Date(coveredUntil),
        endAt: new Date(Math.min(interval.start, end)),
      });
    }

    coveredUntil = Math.max(
      coveredUntil,
      interval.end,
    );

    if (coveredUntil >= end) {
      break;
    }
  }

  if (coveredUntil < end) {
    missingIntervals.push({
      startAt: new Date(coveredUntil),
      endAt: new Date(end),
    });
  }

  return {
    fullyCovered: missingIntervals.length === 0,
    missingIntervals,
  };
}