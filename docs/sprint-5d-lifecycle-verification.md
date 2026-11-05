# ClubHub — Sprint 5.D Lifecycle Verification & Decision Register

**Prepared:** 2026-11-01

**Branch:** `feature/sprint-5-memberships`

**Baseline committed:** `b9d3fa1` (Sprint 5.C)

**Current Sprint 5.D:** 5.D.1–5.D.4 passed 21/21 availability unit tests and API/web builds (user-reported). Sprint 5.D.5a–5.D.5d.2 have now passed **14/14 real PostgreSQL lifecycle tests** against `clubhub_test` (user-reported). Current 5.D changes remain local; GitHub verification and review are pending.

**Owner:** ClubHub development team

**Policy:** Every OPEN item remains visible until a specific test and/or code change proves it resolved. Don't equate a passing unit test with a verified database invariant.

> **Reading note (2026-11-04):** The original decision register and 2026-11-01/02 checkpoint below are preserved as historical evidence. Their OPEN/BLOCKING labels, unchecked boxes, and “implementation not started” statements describe the state **at that earlier checkpoint** and are not the latest dispositions. Refer to **Sprint 5.G — Final Lifecycle Verification Addendum** at the end for the updated 23-test evidence. Open items not expressly updated remain unresolved.

## Status meanings

- **VERIFIED:** passing evidence recorded (commit/test name and date).

- **OPEN / BLOCKING:** resolve before accepting student paid membership applications or committing the lifecycle feature as production-ready.

- **OPEN / FOLLOW-UP:** tracked, not yet implemented; must be revisited at indicated sprint.

- **DECISION NEEDED:** product/business policy is not settled; do not invent one implicitly.

## Decision register and verification backlog

| ID | Priority | Current state | Risk or design decision | Required work and acceptance evidence | Target |

|---|---|---|---|---|---|

| D5-01 | P0 | PARTIALLY VERIFIED / BLOCKING | **Activation vs concurrent Deanship fee updates:** both `activateRegistrationWindowFees()` and `updateMembershipFees()` now acquire the membership-settings row lock. Two real DB lock-contention tests passed. Exact fee-update/activation interleaving across opening time is **not yet proven**. | Rework to a single consistent transaction lock order (club/settings/window as needed), recheck conditions while locked, test parallel activation and administrative fee edits at opening boundary. | 5.D.5 |

| D5-02 | P0 | PARTIALLY ADDRESSED / BLOCKING | **Window activates lazily:** a GET request can be first to lock fees. `effectiveAt = opensAt` backdates the fee-version timestamp, which does not prove the price was captured at opening if no request arrived then. A database-side active-window guard and post-update rollback check have been added; before/after-opening scenarios passed in PostgreSQL, but exact commit-time and boundary-crossing transactions remain unproven. | Choose explicit product guarantee: (a) lazy activation + ban changes to pending prices for any opened, unclosed window; ensure locked price is well-defined; OR (b) reliable scheduler/work queue with clock/infrastructure. Record precise effective-price semantics. | 5.D.5 decision |

| D5-03 | P0 | VERIFIED (tested scenarios) | **Concurrent requests:** real PostgreSQL tests confirmed two parallel activation requests link exactly one fee version, reactivation is idempotent, and a deliberately invalid FK linkage rolls back its transaction. Additional race scenarios are not implied by these tests. | Run real `clubhub_test` concurrent activation with independent Prisma transactions, query count of fee versions, assert one window linkage and immutable fees; run rollback test. | 5.D.5 |

| D5-04 | P0 | PARTIALLY VERIFIED / BLOCKING | **Lifecycle read vs write races:** tests confirm correct behavior when close/archive commits **before** the check. Mid-request close/archive/expiry/mode-change races, stale OPEN return, and transient 409 recovery remain unverified. | Add re-read/retry policy and transactional status check for authoritative membership application command; tests for close/archive/expiry/mode change races. | 5.D.5 / student applications |

| D5-05 | P0 | OPEN / BLOCKING | **GET endpoint performs a write:** public GET `/api/clubs/\\:id/membership/availability` lazily inserts fee version, surprising caches, monitoring and clients. | Explicitly document side effect; define cache headers, authorization/abuse/rate limits and idempotence, or separate activation from public GET. | 5.D.5 |

| D5-06 | P0 | OPEN / BLOCKING | **Real enrollment gating:** availability is informational, not permission to apply; registration is not yet enforced server-side for students. | Application transaction must atomically re-evaluate club status, student authentication, eligibility, window, fee version, membership history, and deadlines. Never authorize based solely on GET. | 5.E |

| D5-07 | P1 | OPEN / FOLLOW-UP | **After natural expiry without any GET:** window may be expired but `effectiveFeeVersionId` remains NULL. Trigger forbids editing expired windows so later retroactive fee assignment may be blocked. | Decide whether history must always contain snapshot even without visitor traffic; test or build scheduler before claiming this guarantee. | 5.D.5 |

| D5-08 | P1 | OPEN / FOLLOW-UP | **Mode transitions vs scheduled windows:** switching WINDOWED to ALWAYS_OPEN blocked with active/future windows. Future windows cannot be deleted or early-closed before their opening by DB rules. | Document cancellation/rescheduling policy; decide if future window cancellation needs explicit supported state/migration. Do not silently delete. | Before Deanship mode changes production-ready |

| D5-09 | P1 | PARTIALLY VERIFIED / DECISION NEEDED | **Early closure and fee snapshots:** tests confirmed early closure preserves an existing locked version and closure before activation prevents late activation. Whether every closed window must have a fee version remains a product decision. | Test closure with and without pre-existing fee version; decide whether closing must first lock prices atomically. | 5.D.5 |

| D5-10 | P1 | OPEN / FOLLOW-UP | **Future-fee changes vs active windows:** service currently rejects all fee changes while an active WINDOWED window exists. This protects snapshot semantics but limits updating fees for later windows. | Decide whether future-only pending fee edits are permitted during open registration, and if so store/resolve effective date correctly. | 5.E / administration |

| D5-11 | P1 | OPEN / FOLLOW-UP | **Time and timezone:** frontend uses date-only fields converted from browser local midnight to UTC, and displays dates in local timezone. Closing date is exclusive. | Choose consistent university timezone (Asia/Hebron), date/time UX, DST boundaries, browser timezone independence, injectable clock for tests, inclusive/exclusive labels. | Before student launch |

| D5-12 | P1 | OPEN / FOLLOW-UP | **Immutable history:** DB prohibits updating/deleting fee versions and windows after closure/expiry; window composite foreign key guards cross-club versions. | Keep DB integration tests for trigger, FK, overlap exclusion, no writes after close, and no reassign after price lock. | 5.D.5 |

| D5-13 | P1 | OPEN / FOLLOW-UP | **Fee disclosure consistency:** `ALWAYS_OPEN` picks latest effective fee version by `effectiveAt,createdAt,id`; WINDOWED uses referenced version; unavailable status returns null. | Test correct version choice, missing version handling, stale config and decimal precision; ensure public endpoint no pending fee disclosure. | 5.D.5 / 5.E |

| D5-14 | P1 | OPEN / FOLLOW-UP | **Status precedence and window history:** active > upcoming > most recent; early-closed old windows coexist with upcoming windows. | Test boundary equality (`now===opensAt`, `now===closesAt`), multiple windows, gap between windows, archived override, legacy missing settings. | 5.D.5 |

| D5-15 | P1 | OPEN / FOLLOW-UP | **Error handling:** database exclusion conflicts, trigger violations, SQL serialization/timeout and foreign-key violations may surface as raw 500 errors. | Convert expected conflicts to suitable 409, retry safe transient errors sparingly, test diagnostics and observability. | 5.D.5 |

| D5-16 | P1 | VERIFIED (guard used) / FOLLOW-UP (retention) | **Test isolation:** real DB tests MUST target existing `clubhub_test`, never `clubhub_dev`. Immutable test fixtures cannot be deleted with normal Prisma delete. | Guard URL before connect; use unique fixture names, no destructive cleanup; run integration explicitly under `clubhub_test`; review test data retention policy. | Every integration run |

| D5-17 | P1 | OPEN / FOLLOW-UP | **Original plan Definition of Done:** PR review, CI tests, demo, and docs required. Current local branch push is not a merged, reviewed PR. | Confirm CI and peer review before marking story merged/done; record any deliberate deviation in sprint logistics docs. | Sprint completion |

| D5-18 | P2 | OPEN / FOLLOW-UP | **Audit/actor provenance:** automatic price versions have `createdById = null`; admin-created versions can have actor ID. | Clarify automation attribution and audit trail for fee/version/mode/closure actions. | Auditing sprint |

## Verified work and current checkpoint (2026-11-02)

| Area | Evidence | Result | Limits |

|---|---|---|---|

| 5.D.1–5.D.4 | `clubs.availability.spec.ts` | 21/21 passed; API/web builds passed | Mocked Prisma, not proof of all DB races |

| 5.C membership management | `clubs.membership.spec.ts` | 19/19 passed | Unit tests; does not prove concurrent transactions |

| 5.D.5a–5.D.5d.2 | `clubs-membership-lifecycle.integration.spec.ts` | **14/14 passed** on `clubhub_test` | Real DB tests, but do not establish strict commit-time opening guarantee |

| 5.D.5d.1 lock contention | `waits for the membership settings lock before checking fee updates`; `waits for the settings lock before activating registration` | Both passed | Tests hold settings lock and verify waiting; not a controlled fee-update-vs-activation opening-boundary interleaving |

| 5.D.5d.2 opening protection | `rejects fee updates when a scheduled registration window has opened`; `locks updated pending fees when the change completes before opening` | Both passed on `clubhub_test` (2026-11-02) | No controlled transaction crossing the exact opening instant; no strict commit-time guarantee |

| Final local check | `npm run build -w api`; `git diff --check` | Passed/clean, user-reported | No commit, CI, or PR review verified |

### Outstanding blockers before Sprint 5.D sign-off

1\. **D5-01** — Add controlled competing fee-update-versus-activation interleaving across the opening boundary. The independent lock-wait tests alone are not sufficient.

2\. **D5-02** — Decide and guarantee opening-time fee semantics. `effectiveAt = opensAt` is not evidence of creation at `opensAt`; late activation and boundary-crossing transactions still need a policy and tests. The new SQL guard and post-update check reduce risk but are not an atomic commit-time assertion.

3\. **D5-04** — Handle close/archive/expiry/mode changes **during** availability resolution; avoid stale `OPEN` and misleading transient errors. Student enrollment must separately recheck state atomically.

4\. **D5-05** — Decide/document the public GET endpoint's write side effect, no-store/cache policy, and abuse protections.

5\. **D5-07 and D5-09** — Decide whether windows with zero traffic, or closed before activation, require a historical fee snapshot; current tests demonstrate they may remain unlocked.

### Next implementation package

**5.D.5d.3 — mid-request lifecycle race protection**, while retaining a dedicated unresolved D5-02 strict opening/commit-time guarantee and D5-01 competing-operation interleaving. Do not close D5-01/D5-02/D5-04 solely from the 14 passing tests.

### PostgreSQL driver warning — D5-19 (new tracked issue)

| ID | Priority | State | Evidence and next action | Target |

|---|---|---|---|---|

| D5-19 | P1 | OPEN / FOLLOW-UP | Integration run emits: `DeprecationWarning: Calling client.query() when the client is already executing a query ... removed in pg@9.0`. Determine source (Prisma adapter/pg usage/overlapping queries), reproduce with warning traces, and verify a safe change before pg 9 upgrade. Warning did **not** fail the current tests. | Dependency review / before pg 9 upgrade |

## Evidence log

| Date | Source | Result | Scope |

|---|---|---|---|

| 2026-11-01 | User-reported test console | 21/21 availability unit tests; API and web builds passed | Effective fees and availability under mocked Prisma |

| 2026-11-01 | User-reported test console | 19/19 membership-management unit tests passed | Settings and window behavior under mocks |

| 2026-11-01 | User-reported test console | First 6/6, then 8/8, then 10/10 PostgreSQL lifecycle integration tests passed | Parallel activation, idempotency, FK rollback, closure, archive, active-fee rejection |

| 2026-11-01 | User-reported test console | **12/12 PostgreSQL lifecycle integration tests passed**, including both `FOR UPDATE` lock-contention tests | Real `clubhub_test` DB; waiting on shared settings-row lock verified; opening-boundary interleaving NOT tested |

| 2026-11-01 | User-reported console | `npm run build -w api` passed; `git diff --check` clean | Local compile and whitespace only |

| 2026-11-01 | GitHub branch read | Sprint 5.C committed baseline `b9d3fa1` | Does not verify unpushed Sprint 5.D changes |

| 2026-11-02 | User-reported test console | **14/14 PostgreSQL lifecycle integration tests passed** after fixing SQL alias `window` → `rw` | New tests covered fee-update rejection after opening and changed pending fees saved before opening; strict commit-time guarantee untested |

| 2026-11-02 | User-reported test console | **19/19 membership unit tests passed**; `npm run build -w api` passed; `git diff --check` produced no reported issues | Local regression and compile verification; no CI/PR confirmation |

| 2026-11-02 | Integration test stderr | `pg` deprecation warning repeated | D5-19 remains open; no root cause confirmed |

| 2026-11-01 | Integration test stderr | `pg` deprecation warning about overlapping `client.query()` | Tracked as D5-19, cause not established |

## Maintenance rule

When closing an issue, replace OPEN/BLOCKING with VERIFIED and append the exact test name, commit SHA when available, and date. User-reported local passing tests are recorded as such, **not** as merged or CI-verified. Revisit all P0 issues before enabling student paid membership applications. **2026-11-02 update:** D5-02 remains BLOCKING despite the 14 passing tests; a SQL statement-time guard and post-update check do not prove a commit-time guarantee.

### D5-20 — Global Club Archiving Consistency

**Priority:** P0

**Status:** OPEN — Cross-sprint regression verification required

**Applies to:** Club discovery, club details, events, memberships,

club administration, Deanship management, and student dashboards.

#### Established business rules

When a club is archived:

- Hide its card from public club discovery.

- Prevent public access to its club details page.

- Hide its upcoming and ongoing events from public discovery.

- Preserve visibility of past events as historical records.

- Disable new club membership applications and renewals.

- Preserve existing memberships, applications, and fee history.

- Disable club administration and management actions.

- Prevent board members from accessing archived-club management features.

- Keep the club accessible to the Deanship for administrative review

  and possible reactivation.

- Preserve database history; archiving must not delete related records.

#### Required verification

- [ ] Public club listings exclude archived clubs.

- [ ] Public club details reject archived clubs.

- [ ] Upcoming events belonging to archived clubs are hidden.

- [ ] Past events belonging to archived clubs remain visible.

- [ ] Student membership actions reject archived clubs.

- [ ] Club administrators cannot access archived-club management endpoints.

- [ ] Board members cannot perform archived-club management actions.

- [ ] Deanship can access archived-club records.

- [ ] Reactivating a club restores only the appropriate access and

      visibility, according to current event and membership status.

#### Implementation principle

Archiving is a reversible lifecycle state, not deletion.

Frontend visibility checks are not sufficient for authorization.

All restricted operations must enforce archived-club status in the API.

### Sprint 5.D.5d.3 — Part 4 Verification

**Date:** 2026-11-02

**Status:** PASSED — Unit verification complete

#### Evidence

- [x] Availability unit tests: 24/24 passed.

- [x] NestJS API build passed.

- [x] Git whitespace check completed without reported errors.

- [x] Closure during availability resolution returns `CLOSED_EARLY`.

- [x] Archiving during availability resolution returns `CLUB_ARCHIVED`.

- [x] Stale, price-locked registration windows are revalidated.

#### Remaining work

- [ ] Add final lifecycle validation for `ALWAYS_OPEN` clubs.

- [ ] Verify simultaneous lifecycle operations using PostgreSQL integration tests.

- [ ] Confirm availability behavior under real transaction interleavings.

**D5-04 status:** PARTIALLY VERIFIED — Remains open.

### Sprint 5.D.5d.3 — Part 5A: ALWAYS_OPEN Lifecycle Protection

**Date:** 2026-11-02

**Status:** IMPLEMENTED — Verification pending

#### Implementation

- Added a final club-status check for `ALWAYS_OPEN` registration.

- Added a final registration-mode check before returning availability.

- Preserved immutable effective fee versions.

- Reused the bounded retry mechanism introduced in Sprint 5.D.5d.3.

#### Verification

- [ ] Availability unit tests: 26/26 passed.

- [ ] NestJS API build passed.

- [ ] Git whitespace check passed.

- [ ] Mid-request archiving returns `CLUB_ARCHIVED`.

- [ ] Mid-request registration-mode change returns the newly resolved status.

#### Remaining limitations

- Final-state validation cannot prevent lifecycle changes committed

  immediately after the final database read.

- Availability remains informational until registration is revalidated

  inside the future membership-application transaction.

- Controlled PostgreSQL concurrency tests remain pending.

**D5-04:** Partially verified; not yet resolved.

### Sprint 5.D.5d.3 — Part 5B: PostgreSQL Lifecycle Concurrency

**Date:** 2026-11-02

**Issue:** D5-04 — Lifecycle read/write races

**Status:** IMPLEMENTED — Verification pending

#### Scope

Added controlled PostgreSQL integration coverage for lifecycle

changes committed while membership availability is being resolved.

Tests use real PostgreSQL records and production service operations.

A test-only synchronization point pauses availability after fee

resolution but before final lifecycle validation.

#### Verification

- [ ] PostgreSQL lifecycle integration tests: 17/17 passed.

- [ ] API build passed.

- [ ] Git whitespace check passed.

- [ ] Concurrent early closure returns `CLOSED_EARLY`.

- [ ] Concurrent windowed-club archiving returns `CLUB_ARCHIVED`.

- [ ] Concurrent always-open-club archiving returns `CLUB_ARCHIVED`.

- [ ] Registration closure preserves the effective fee version.

- [ ] Club archiving preserves membership fee history.

#### Remaining limitations

- Availability is an informational snapshot, not an authorization

  guarantee for future membership applications.

- Changes committed after the final validation query may not be

  reflected in that response.

- Student membership applications must revalidate lifecycle state

  atomically before creating an application.

- Global club-archiving consistency remains tracked under D5-20.

- PostgreSQL driver deprecation warning remains tracked under D5-19.

**D5-04:** Partially verified until the remaining transaction-boundary

risks and application-time enforcement are reviewed.

### Sprint 5.D.6 — Architecture Decision: Historical Pricing for Every Window

**Date:** 2026-11-02

**Decision:** APPROVED — Option A

**Implementation status:** NOT STARTED

**Related issues:** D5-02, D5-07, D5-09, D5-10

#### Approved business rule

Every scheduled registration window must have one immutable effective

membership fee version associated with its scheduled opening time.

This requirement applies even when no student visits the website,

requests availability, or submits a membership application.

#### Required behavior

- A scheduled window receives a fee snapshot when it opens.

- The snapshot records the prices applicable at the scheduled opening.

- Snapshot creation must not depend on public availability requests.

- Fee updates during an active window affect future windows only.

- Multiple pending fee updates are permitted.

- Existing effective fee versions remain immutable.

- Early closure preserves the original fee snapshot.

- Natural expiry preserves the original fee snapshot.

- Archiving preserves membership registration and pricing history.

- Delayed activation must reconstruct the correct opening-time prices.

- A missed activation must be recoverable after application restart.

- Concurrent activation attempts must not create duplicate snapshots.

#### Architectural requirements

- Preserve historical pending-fee configurations.

- Implement reliable automatic activation and recovery.

- Use PostgreSQL concurrency controls to prevent duplicate activation.

- Preserve the scheduled `opensAt` timestamp as the fee version's

  `effectiveAt`.

- Ensure fee changes committed after opening cannot alter the

  opening-time snapshot.

- Preserve existing fee-version immutability guarantees.

#### Verification requirements

- [ ] Window opens without a public request and receives a fee version.

- [ ] Pending fees can be updated during an active window.

- [ ] Current-window fees remain unchanged after pending updates.

- [ ] The next window receives the latest applicable pending prices.

- [ ] Delayed activation uses the correct opening-time prices.

- [ ] Recovery processes windows missed during application downtime.

- [ ] Concurrent activation creates exactly one fee version.

- [ ] Early closure preserves the effective fee version.

- [ ] Natural expiry preserves the effective fee version.

- [ ] Archiving preserves historical pricing.

- [ ] PostgreSQL integration tests pass.

- [ ] API build passes.

#### Sign-off

Business rule approved.

D5-02, D5-07, D5-09, and D5-10 remain open until the revised

implementation passes its verification requirements.

## Sprint 5.G — Final Lifecycle Verification Addendum

**Date:** 2026-11-04

**Branch:** `feature/sprint-5-memberships`

**Scope:** Historical membership pricing, automatic recovery, club archiving, and board-management protection.

### 1. Verification Summary

Sprint 5 lifecycle verification has progressed from the initial 14 PostgreSQL integration tests to **23 passing PostgreSQL integration tests**.

The latest verification covered membership fee activation, automatic recovery, opening-time transaction protection, archived-club event visibility, board-management restrictions, and preservation of historical records.

**Reported verification results:**

| Verification | Result |

|---|---|

| PostgreSQL lifecycle integration suite | PASS — 23/23 |

| NestJS API build | PASS |

| Git whitespace validation | PASS |

| Prisma schema validation | PASS |

| Prisma migration status | PASS — 20 migrations applied |

| Database used for integration tests | `clubhub_test` |

These results are based on local development verification. They do not constitute confirmation of CI execution, peer review, or merging into `main`.

### 2. D5-02 — Historical Membership Pricing

**Updated status: VERIFIED — Tested scenarios**

The following behavior was verified using real PostgreSQL integration tests:

- Concurrent fee activation creates exactly one effective fee version.

- Repeated activation does not create duplicate versions.

- A missed registration opening can be recovered without student traffic.

- Recovery preserves the configured fees and original scheduled opening timestamp.

- A fee transaction crossing the registration opening boundary is rejected.

- Rejected fee changes preserve the previous settings.

- The actual background reconciler initiates recovery when its service starts.

- Early closure preserves locked membership fees.

- Archived clubs do not expose membership registration availability.

**Remaining operational qualification:**

The reconciler test exercises service startup, not termination and restart of the complete application process. Production deployment, database connectivity, and scheduler availability must be monitored operationally.

Membership applications introduced in Sprint 6 must revalidate authoritative registration state and pricing during their own database transactions.

### 3. D5-20 — Global Club Archiving Consistency

**Updated status: VERIFIED — Tested scenarios; additional cross-sprint coverage remains**

The following behavior has been reviewed or verified:

| Requirement | Evidence | Result |

|---|---|---|

| Archived clubs excluded from public club listings | Existing query filtering reviewed | Implemented |

| Archived club details inaccessible publicly | Existing query filtering reviewed | Implemented |

| Upcoming archived-club events hidden | PostgreSQL integration test | PASS |

| Ongoing archived-club events hidden | PostgreSQL integration test | PASS |

| Completed historical events preserved | PostgreSQL integration test | PASS |

| Direct access to hidden events rejected | PostgreSQL integration test | PASS |

| Event visibility restored after reactivation | PostgreSQL integration test | PASS |

| Archived clubs excluded from student admin assignments | Existing authorization query reviewed | Implemented |

| Archived-club board creation rejected | PostgreSQL integration test | PASS |

| Archived-club board updates rejected | PostgreSQL integration test | PASS |

| Archived-club board termination rejected | PostgreSQL integration test | PASS |

| Archiving between initial validation and transaction | Controlled PostgreSQL integration test | PASS |

| Existing board history preserved | PostgreSQL integration test | PASS |

| Deanship board-history access preserved | PostgreSQL integration test | PASS |

**Implementation changes:**

- Public event discovery and details now apply archived-club visibility restrictions.

- Completed historical events remain visible.

- Board appointment creation rechecks club status inside its transaction.

- Board appointment updates and termination recheck club status after acquiring the club row lock.

- Historical board records are preserved when restricted operations are rejected.

**Remaining qualification:**

The controlled board-creation race test covers archiving between initial validation and transaction execution. It does not independently prove every possible simultaneous database-lock interleaving.

Future membership application, payment, and administration endpoints must continue enforcing archived-club restrictions.

### 4. Remaining Issues

| Issue | Status | Next action |

|---|---|---|

| D5-02 — Historical fee pricing | VERIFIED for tested scenarios | Monitor scheduler operation in deployment |

| D5-04 — Lifecycle races | PARTIALLY VERIFIED | Enforce authoritative validation in Sprint 6 application transactions |

| D5-06 — Membership application gating | DEFERRED TO SPRINT 6 | Validate eligibility, registration state, fees, and membership history transactionally |

| D5-11 — Timezone consistency | OPEN / FOLLOW-UP | Confirm Asia/Hebron behavior and DST boundaries |

| D5-17 — PR and CI verification | OPEN | Complete pull request, CI, peer review, and merge |

| D5-19 — PostgreSQL driver warning | OPEN / FOLLOW-UP | Investigate overlapping `client.query()` calls before upgrading to pg 9 |

| D5-20 — Global archiving | VERIFIED for tested scenarios | Preserve cross-sprint regression coverage |

Other outstanding decision-register items retain their previous status unless separately supported by verification evidence.

### 5. Sprint 5 Acceptance Statement

The implemented Sprint 5 membership architecture, administrative configuration, historical pricing, registration-window management, membership-history foundation, and student-facing membership information have completed their targeted local verification.

The PostgreSQL lifecycle suite passed all **23 tests**.

Sprint 5 remains pending formal closeout until:

- The latest implementation and test changes are committed.

- This verification addendum is committed.

- Final regression checks pass.

- The Sprint 5 pull request is reviewed.

- The approved changes are merged into `main`.

**Sprint 6 handoff:** Student membership applications, payment confirmation, membership activation, and related transactional authorization remain future implementation work.
## Sprint 5 Post-Merge Corrections — Final Verification Addendum

**Date:** 5 November 2026
**Implementation branch:** `feature/sprint-5-post-merge-fixes`
**Baseline:** Sprint 5 merged into `main` at commit `74f0d86`
**Status:** Implementation and targeted local verification complete; pull request, review, and merge pending.

### 1. Correction Summary

Following the Sprint 5 merge, five implementation gaps were corrected.

| Correction | Implemented behavior | Verification |
|---|---|---|
| Active registration-window extension | Deanship can extend an actively open window without replacing its record or changing its locked fee version. | PostgreSQL integration tests and browser acceptance passed. |
| Membership currency labels | Create Club correctly identifies first-time and renewal fees as ILS. | Frontend build passed. |
| Club-card membership pricing | Club cards retrieve public membership availability and display published prices or applicable registration states. | Frontend build and browser acceptance passed. |
| Individual scheduled-window cancellation | Deanship can cancel a specific future, unlocked registration window without changing other windows or the club's registration mode. | PostgreSQL integration tests and browser acceptance passed. |
| Asia/Hebron timezone consistency | Membership registration dates use Palestine-local calendar boundaries regardless of the browser timezone. | Eight permanent timezone tests and browser date-display verification passed. |

### 2. Active Registration-Window Extension

**Endpoint:**

`PATCH /clubs/:id/membership/windows/:windowId/extend`

**Authorization:** Deanship only.

**Request:**

```json
{
  "closesAt": "2026-11-20T22:00:00.000Z"
}
```

The endpoint updates the closing timestamp of an existing active registration window.

It preserves the window ID, original opening timestamp, and locked membership-fee version.

Extensions are rejected when the window is not eligible, including future, expired, early-closed, archived-club, or overlapping-window scenarios.

The Deanship interface provides an Extend action for eligible active windows.

**Manual acceptance:** An active fixture in `clubhub_test` was successfully extended through the Deanship interface. The resulting PostgreSQL record retained its window identity, active status, locked fee-version reference, and membership prices of 40.00 ILS and 25.00 ILS.

### 3. Individual Scheduled-Window Cancellation

**Endpoint:**

`PATCH /clubs/:id/membership/windows/:windowId/cancel`

**Authorization:** Deanship only.

**Request body:** None.

Cancellation is permitted only for future, unlocked registration windows belonging to active clubs using `WINDOWED` registration mode.

Cancellation sets `canceledAt` without deleting the window.

The operation preserves historical records and does not change other registration windows or the club's registration mode.

Canceled windows do not activate membership fees and do not prevent a replacement window from using the same dates.

**Manual acceptance:** The Deanship successfully canceled one scheduled March 2099 test window. Its status changed to Canceled, while a separate January 2099 window remained Scheduled.

### 4. Membership Registration Timezone

**Authoritative timezone:** `Asia/Hebron`

The frontend uses a shared utility:

`apps/web/src/utils/membershipDates.ts`

Registration opening dates are interpreted as midnight at the beginning of the selected date in Palestine.

Registration closing dates are inclusive in the interface but represented by the exclusive midnight boundary at the beginning of the following Palestine-local calendar day.

Stored API timestamps remain ISO 8601 instants.

The conversion does not depend on the browser's local timezone.

The correction covers club creation, registration-window creation and editing, active-window extension, Deanship date displays, and student-facing registration messages.

**Permanent tests:**

`apps/web/test/membershipDates.test.ts`

Eight automated tests passed, covering seasonal offsets, a daylight-saving transition, inclusive closing dates, invalid calendar dates, and date round trips.

Additional timezone-independence checks produced identical conversion results using Asia/Hebron, Europe/Amsterdam, and America/New_York environments.

### 5. Verification Results

| Verification | Result |
|---|---|
| PostgreSQL membership lifecycle integration suite | 36 tests passed |
| Permanent membership timezone suite | 8 tests passed |
| Full API Jest suite | Passed |
| API production build | Passed |
| Frontend production build | Passed |
| TypeScript Node test configuration | Passed |
| `git diff --check` | Passed |
| Club-card pricing browser acceptance | Passed |
| Scheduled-window cancellation browser acceptance | Passed |
| Active-window extension browser acceptance | Passed |
| Deanship registration-date display | Passed |

These results reflect local development and test environments. They do not represent a production deployment audit.

### 6. Decision Register Updates

**D5-11 — Timezone Consistency**

Status: **IMPLEMENTED AND VERIFIED FOR TESTED SCENARIOS**

Registration-window date conversion now uses `Asia/Hebron` consistently in the implemented frontend surfaces.

**D5-17 — Pull Request and CI Verification**

Status: **OPEN**

Local verification is complete. GitHub pull request review, CI verification, and merge remain pending.

**D5-19 — PostgreSQL Driver Warning**

Status: **OPEN — NON-BLOCKING FOR CURRENT TEST RUNS**

The PostgreSQL driver still reports a deprecation warning concerning concurrent `client.query()` usage.

Tests pass, but this warning requires investigation before upgrading to `pg` version 9.

### 7. Remaining Work and Sprint Boundaries

The post-merge corrections require final documentation review, Git diff review, commit, pull request, CI verification, and merge.

The development environment must be restored to `clubhub_dev` after test-database acceptance work.

Legacy clubs created before mandatory membership configuration must receive their actual membership fees through the Deanship interface.

Sprint 6 remains responsible for membership applications, pending-payment lifecycle, payment confirmation, payment deadlines, cancellation of unpaid applications, and confirmed membership activation.

Sprint 7 remains responsible for membership cards and membership-dependent board and administrator privilege enforcement.

**Conclusion:** The five identified Sprint 5 post-merge corrections have completed implementation and targeted local verification. Formal repository closeout remains pending pull request review and merge.