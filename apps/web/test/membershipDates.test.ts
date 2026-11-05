import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  membershipDateToUtc,
  membershipClosingDateToUtc,
  membershipUtcToDate,
  membershipUtcToInclusiveClosingDate,
  formatMembershipDateTime,
} from "../src/utils/membershipDates.js";

describe("Membership registration dates - Asia/Hebron", () => {
  it("converts winter dates using UTC+2", () => {
    const opening = membershipDateToUtc("2026-01-10");
    const closing = membershipClosingDateToUtc("2026-01-20");

    assert.equal(opening.toISOString(), "2026-01-09T22:00:00.000Z");

    assert.equal(closing.toISOString(), "2026-01-20T22:00:00.000Z");
  });

  it("converts summer dates using UTC+3", () => {
    const opening = membershipDateToUtc("2026-04-01");
    const closing = membershipClosingDateToUtc("2026-04-15");

    assert.equal(opening.toISOString(), "2026-03-31T21:00:00.000Z");

    assert.equal(closing.toISOString(), "2026-04-15T21:00:00.000Z");
  });

  it("handles a window crossing the autumn DST transition", () => {
    const opening = membershipDateToUtc("2026-10-20");
    const closing = membershipClosingDateToUtc("2026-11-05");

    assert.equal(opening.toISOString(), "2026-10-19T21:00:00.000Z");

    assert.equal(closing.toISOString(), "2026-11-05T22:00:00.000Z");

    assert.equal(membershipUtcToDate(opening), "2026-10-20");

    assert.equal(membershipUtcToInclusiveClosingDate(closing), "2026-11-05");
  });

  it("preserves inclusive closing dates", () => {
    const closing = membershipClosingDateToUtc("2026-11-20");

    assert.equal(membershipUtcToInclusiveClosingDate(closing), "2026-11-20");
  });

  it("handles consecutive calendar days without assuming 24 hours", () => {
    const opening = membershipDateToUtc("2026-10-20");
    const closing = membershipClosingDateToUtc("2026-11-05");

    const elapsedHours = (closing.getTime() - opening.getTime()) / 3_600_000;

    // October 20 through November 5 = 17 calendar dates.
    // The autumn clock change adds one elapsed hour.
    assert.equal(elapsedHours, 17 * 24 + 1);
  });

  it("rejects invalid calendar dates", () => {
    assert.throws(() => membershipDateToUtc("2026-02-30"));
    assert.throws(() => membershipDateToUtc("invalid"));
    assert.throws(() => membershipClosingDateToUtc("2026-13-01"));
  });

  it("formats stored timestamps in Palestine time", () => {
    assert.equal(
      formatMembershipDateTime("2026-01-09T22:00:00.000Z"),
      "10/01/2026, 00:00:00",
    );
  });

  it("recovers selected dates across different seasons", () => {
    const dates = ["2026-01-10", "2026-04-01", "2026-10-20", "2026-11-05"];

    for (const date of dates) {
      assert.equal(membershipUtcToDate(membershipDateToUtc(date)), date);

      assert.equal(
        membershipUtcToInclusiveClosingDate(membershipClosingDateToUtc(date)),
        date,
      );
    }
  });
});
