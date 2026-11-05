/**
 * Membership registration dates use the university's timezone,
 * not the browser's local timezone.
 *
 * The API stores exact UTC instants.
 * The Deanship works with inclusive calendar dates in Asia/Hebron.
 */

export const MEMBERSHIP_TIME_ZONE = "Asia/Hebron";

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: MEMBERSHIP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: MEMBERSHIP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function parseCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    throw new Error("Invalid calendar date. Expected YYYY-MM-DD.");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const check = new Date(Date.UTC(year, month - 1, day));

  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new Error("Invalid calendar date.");
  }

  return { year, month, day };
}

function addCalendarDays(date: string, days: number): string {
  const { year, month, day } = parseCalendarDate(date);

  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + days);

  return [
    utc.getUTCFullYear(),
    String(utc.getUTCMonth() + 1).padStart(2, "0"),
    String(utc.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function getZonedParts(date: Date) {
  const parts = dateTimeFormatter.formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/**
 * Convert a date-only value into the exact instant of midnight
 * in Asia/Hebron.
 *
 * This resolves the timezone offset for the target date,
 * including daylight-saving changes.
 */
export function membershipDateToUtc(date: string): Date {
  const { year, month, day } = parseCalendarDate(date);

  const wallClockMidnight = Date.UTC(year, month - 1, day);

  // Start close to the expected local midnight.
  let candidate = wallClockMidnight - 2 * 60 * 60 * 1000;

  for (let attempt = 0; attempt < 5; attempt++) {
    const parts = getZonedParts(new Date(candidate));

    const observedWallClock = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );

    const difference = wallClockMidnight - observedWallClock;

    if (difference === 0) {
      return new Date(candidate);
    }

    candidate += difference;
  }

  throw new Error(
    `Unable to resolve ${date} at midnight in ${MEMBERSHIP_TIME_ZONE}.`,
  );
}

/**
 * Convert an inclusive closing date into the exclusive
 * midnight boundary of the following calendar day.
 */
export function membershipClosingDateToUtc(date: string): Date {
  return membershipDateToUtc(addCalendarDays(date, 1));
}

/**
 * Return the YYYY-MM-DD calendar date in Asia/Hebron
 * for a stored UTC timestamp.
 */
export function membershipUtcToDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;

  if (!Number.isFinite(date.getTime())) {
    throw new Error("Invalid membership timestamp.");
  }

  const parts = dateFormatter.formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Convert an exclusive closing timestamp into the
 * inclusive date shown by the Deanship.
 *
 * Subtracting one millisecond is safe here because
 * we are finding the preceding calendar date,
 * not assuming a calendar day lasts 24 hours.
 */
export function membershipUtcToInclusiveClosingDate(
  value: string | Date,
): string {
  const instant = typeof value === "string" ? new Date(value) : value;

  if (!Number.isFinite(instant.getTime())) {
    throw new Error("Invalid membership closing timestamp.");
  }

  return membershipUtcToDate(new Date(instant.getTime() - 1));
}

/**
 * Display a stored timestamp in Palestine local time.
 */
export function formatMembershipDateTime(value: string | Date): string {
  const instant = typeof value === "string" ? new Date(value) : value;

  if (!Number.isFinite(instant.getTime())) {
    throw new Error("Invalid membership timestamp.");
  }

  return dateTimeFormatter.format(instant);
}
