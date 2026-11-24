export const MEMBERSHIP_TIME_ZONE = 'Asia/Hebron';

export const MINUTE_MS = 60 * 1000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

export const ORDINARY_APPLICATION_DURATION_MS = 14 * DAY_MS;

export const BOARD_NOMINATION_DURATION_MS = 72 * HOUR_MS;

export const ONLINE_PAYMENT_GRACE_MS = 30 * MINUTE_MS;

export const MAX_BOARD_START_DAYS_AHEAD = 14;

/**
 * Calculates the deadline for an ordinary application
 * submitted under ALWAYS_OPEN registration.
 */
export function calculateAlwaysOpenDeadline(
  submittedAt: Date,
): Date {
  return new Date(
    submittedAt.getTime() + ORDINARY_APPLICATION_DURATION_MS,
  );
}

/**
 * Calculates the payment deadline for a board nomination.
 */
export function calculateNominationDeadline(
  nominatedAt: Date,
): Date {
  return new Date(
    nominatedAt.getTime() + BOARD_NOMINATION_DURATION_MS,
  );
}

/**
 * Calculates the processing cutoff for an online attempt
 * initiated before its applicable payment deadline.
 */
export function calculateOnlineGraceDeadline(
  paymentDeadlineAt: Date,
): Date {
  return new Date(
    paymentDeadlineAt.getTime() + ONLINE_PAYMENT_GRACE_MS,
  );
}

/**
 * An already-processing online payment may receive grace
 * following early registration-window closure.
 *
 * Early closure must never extend an existing earlier cutoff.
 */
export function calculateEarlyClosureGraceDeadline(
  closedAt: Date,
  existingGraceDeadlineAt: Date,
): Date {
  const closureGraceDeadline =
    closedAt.getTime() + ONLINE_PAYMENT_GRACE_MS;

  return new Date(
    Math.min(
      closureGraceDeadline,
      existingGraceDeadlineAt.getTime(),
    ),
  );
}

/**
 * Payment initiation and cash confirmation are permitted
 * strictly before the applicable deadline.
 */
export function isBeforeDeadline(
  now: Date,
  deadlineAt: Date,
): boolean {
  return now.getTime() < deadlineAt.getTime();
}

/**
 * A membership interval is half-open:
 * [activatedAt, expiresAt).
 *
 * Activation is inclusive.
 * Expiration is exclusive.
 */
export function isMembershipActive(
  activatedAt: Date,
  expiresAt: Date,
  now: Date,
): boolean {
  return (
    activatedAt.getTime() <= now.getTime() &&
    now.getTime() < expiresAt.getTime()
  );
}