# ClubHub — Sprint 6 Membership Applications, Payments & Board Onboarding
## Complete technical specification, implementation plan, frontend migration ledger and acceptance contract

**Planning baseline:** 21 November 2026. **Source baseline:** `LanaHawash/ClubHub`, `main` (reviewed revision `f4ab088c6bd2b29faeb77314f11f2a6222033e52`); Figma Make `n1jp7qLNGPogwxWy0lVVg0` source. **Status:** implementation-ready *proposed technical design* incorporating user-approved business decisions; **not yet implemented or test-verified**. **Scope:** Sprints 6.1–6.6 plus the explicitly approved board-nomination dependency. **Ownership:** University Clubs/ClubHub team. **Original plan remains unchanged.**

> **Read this first if you are joining the project.** Figma Make is the **visual/design source of truth**; GitHub is the **actual implementation and API/DB source**. The prototype contains hardcoded mock behavior and superseded business assumptions: copy its *presentation* precisely where relevant, **not** its demo state machine, dollars, shared passwords, fake approvals or card autofill. Migrate *only* Sprint 6 screens/sections now. Extend earlier GitHub components; never overwrite working eligibility, fee versions, registration-window, board-history or individual-login logic with older Figma code. Obtain explicit approval before changing Figma layout; match new nominee UI to the existing design vocabulary. **This document is a handoff and proposed implementation contract, not evidence that work is complete.**

## Contents
1. Authority, source ledger and unchanged foundations
2. Business rules and complete workflows
3. Time, membership coverage, payment grace and financial rules
4. State machines and domain invariants
5. Prisma physical design and migrations
6. Services, transactional algorithms and locking
7. Complete proposed API contract, DTOs and errors
8. Security and role/action matrix
9. Figma-to-GitHub frontend integration ledger
10. Eight-stage implementation work plan 6.A–6.H
11. Comprehensive test fixtures, acceptance matrix and release gates
12. Cross-sprint dependencies and explicit exclusions
13. Narrow technical assumptions, policy-sensitive decisions and sign-off
14. Traceability and source references

---

## 1. Authority and baseline

### 1.1 Priority order
1. User-approved decisions in Sprint 6 discussion (captured with IDs here and in `sprint-6-logic-changes.md`).
2. Existing approved `docs/sprint-5-membership-specifications.md` and its addenda, **except explicitly overridden rules**.
3. `docs/sprint-logic-changes.md` (Sprint 3.5/4 actual deviations) and the merged code on `main`.
4. Original `docs/clubs-platform-sprint-plan.md` (reference scope and later-sprint sequencing, **not** authority over already-superseded logic).
5. Figma Make React source for **pixel-level design, layout, components and navigation only**. Prototype local-state behavior and seed numbers are not authoritative.

Do not change the original plan. Add cross-references in new docs; do not erase prior approved history. The original plan uses a `MembershipPeriod` academic-year model, `ClubFee`, `EligibilityRule`, and shared `CLUB` credentials; all were superseded. The actual implementation uses rolling `Membership`, classification eligibility, per-club `ClubMembershipSettings`/versions/windows, individually authenticated student administrators and board-linked grants.

### 1.2 Confirmed existing implementation (not Sprint 6 work)

| Already in GitHub | Existing contract / actual owner | Sprint 6 action |
|---|---|---|
| Authentication, `STUDENT`, `DEANSHIP`, active/disabled accounts, per-person JWT identities | auth module, `Account` | Reuse; derive actor from session, never request body |
| General/faculty/major club classification | `ClubEligibilityService.evaluateForAccount(accountId, clubId)` | Reuse; **no application approval queue** |
| Public registration availability and price snapshot | `GET /clubs/:id/membership/availability`; `ClubsService.getMembershipAvailability()` | Reuse and transactionally recheck for writes |
| Student eligibility/price quote | `GET /clubs/:id/eligibility/me` returns `{eligible,reason,membership:{canApply,feeType,amount,currency,feeVersionId,...}}` | Extend with actual pending application/CTA state |
| Deanship fee/mode/windows controls and ILS prices | `ClubsService`, `ClubMembershipSettings`, `ClubMembershipFeeVersion`, `ClubRegistrationWindow` | Reuse; do not reimplement window model |
| Window opening fee freeze; active-window extension; early close; closed-window immutability | Sprint 5 controllers/services and DB fee snapshot function/reconciler | Attach application deadlines and pending-online exceptions |
| Confirmed-only membership foundation | `Membership` with `activatedAt`, `expiresAt` | Extend after migration; no fake backfill |
| Real board appointments and history | `BoardAppointment` dated start, **currently optional** end, `endedAt` | End required for new terms, membership coverage predicate, max year and <=14-day future starts |
| Two separate student administrator accounts | `ClubAdminAssignment` slots `PRESIDENT`/`SECOND_ADMIN`; `assertCanManageClub()` | Add membership enforcement as planned for Sprint 7 transition; preserve assignment history |
| Club creation with optional initial board and admin assignments in one transaction | `ClubsService.create()` | New coverage rules must also govern initial creation; do not bypass via nested DTO |
| Existing Figma-adapted GitHub frontend | `apps/web/src/pages/ClubPage.tsx`, `Clubs.tsx`, `Dashboard.tsx`, `staff/ClubAdminDashboard.tsx`, Deanship boards panels | Extend existing version, *not* wholesale overwrite |

**Verified absence in reviewed baseline:** no persisted `MembershipApplication`, general `Payment`/`PaymentAttempt` or `BoardNomination`, no membership-number column, no completed student payment page in the GitHub app, no approved real payment gateway credentials. Sprint 5 *specified* 14-day/windowed expiry of applications, but did **not** execute application expiry (there are no application rows yet). `getMembershipQuoteForAccount()` presently does **not** see pending applications; existing `canApply = academicallyEligible && registrationAvailable && !activeMembership` must be refined after Sprint 6.

### 1.3 Source paths (concrete)
- Backend: `apps/api/prisma/schema.prisma`; `apps/api/src/modules/clubs/{clubs.service.ts,clubs.controller.ts,club-eligibility.service.ts,board-appointments.service.ts,board-appointments.controller.ts,club-admin-assignments.service.ts,membership-window-reconciler.service.ts,clubs.module.ts}`; `apps/api/src/app.module.ts`.
- Current frontend: `apps/web/src/pages/{ClubPage.tsx,Clubs.tsx,Dashboard.tsx}`; `apps/web/src/components/ClubCard.tsx`; `apps/web/src/staff/{ClubAdminDashboard.tsx,BoardAppointmentsPanel.tsx,ClubAdministratorsPanel.tsx,ClubsManagementPage.tsx}`; `apps/web/src/App.tsx`.
- Figma Make (separate prototype): `src/pages/{ClubPage.tsx,Payment.tsx,Dashboard.tsx,Clubs.tsx,MembershipCard.tsx}`; `src/admin/{Members.tsx,Payments.tsx,Overview.tsx,AdminApp.tsx}`; `src/staff/{Clubs.tsx,Overview.tsx,StaffApp.tsx}`; `src/{App.tsx,store.tsx,data.ts}`.
- The controller uses `/clubs` with no global `/api/v1` prefix. Browser uses the existing `/api` proxy. **Do not invent `/api/v1` endpoints in implementation.**

---

## 2. Authoritative business workflows

### 2.1 Ordinary application: no second acceptance/eligibility approval
1. Club page reads current availability/fee and authenticated eligibility using **existing Sprint 5 services**. An academically ineligible student cannot activate the Apply control. Archived clubs and closed windows cannot accept an application. Active members see **Already a Member**; prior confirmed members who have expired see **Renew Membership** when open.
2. If an unexpired pending application exists, the UI exposes its **original quoted price, current deadline, method and payment state** and displays **Continue Payment** or **Awaiting In-Person Payment**, never creates a second pending application. This state takes priority over `canApply` for CTA selection; existing eligibility logic is not replaced.
3. Eligible student presses Apply. The `POST` endpoint **re-evaluates** academic eligibility, registration availability and membership/pending state *inside the write path*. This is a race/security recheck, **not** a Deanship or club-approval stage. No student- or club-admin-supplied eligibility/price is trusted.
4. Store immutable snapshot: club/student, `FIRST_TIME` or `RENEWAL` (any previous *confirmed* membership in that club counts, even long expired), selected authoritative fee version, exact Decimal(10,2) amount, currency `ILS`, mode/window ID, submission time, authoritative payment deadline. Unpaid/expired prior applications do *not* establish renewal status.
5. A successful application alone confers **zero membership privileges**. Payment confirmation (cash or trusted online) creates confirmed membership. A full membership lasts one calendar year from activation, except the approved **board-nominee prepaid renewal** special case.
6. One pending application per student and club; a paid membership prevents further ordinary applications while active. On expiry/cancel, preserve the old record and allow a **new application** only when registration is open and student remains eligible. No deletion or resurrection.
7. Registration can be `ALWAYS_OPEN` or `WINDOWED`. The rules are server-timed, not based on stale browser state. `ALWAYS_OPEN` pending deadline = `submittedAt + 14 days` (14×24 hours). `WINDOWED` pending deadline = the active window's precise exclusive `closesAt`; extension of **that same open window** moves associated eligible pending deadlines; a new window never resurrects old requests.

### 2.2 Cash/in-person ordinary payment
1. Student selects **Pay In Person**. Application is pending cash receipt; student cannot click “I paid” or self-confirm. Display the outstanding amount, deadline, payment instructions, club and payment method.
2. The owning club's individually authenticated `PRESIDENT` or `SECOND_ADMIN` sees its pending cash application in the Figma Members/Payments integration; **only assigned current administrators** may confirm. A supervisor, other club's admin, arbitrary student and Deanship cannot confirm an ordinary club application.
3. Administrator receives the amount physically and presses **Confirm Payment**. Backend retrieves actor account ID from JWT, verifies same-club grant, validates cash method, amount/fee currency, open status and cash deadline, locks payment/application/membership key, records `confirmedByAccountId` and `confirmedAt`, inserts **one** Membership with unique readable membership number, and marks application completed **in the same DB transaction**.
4. A second admin who submits concurrently gets an **already confirmed** (safe/idempotent) response with no duplicate rows; retain first confirmer. Both dashboards update through polling (recommended initial approach) or approved push; no forced full reload.
5. There is **no generic Reject Cash action** and no cash-claim validation. An eligible application can only wait, be paid, or expire/cancel due to lifecycle policy. Cash arriving after deadline is **not accepted**; student reapplies under `ALWAYS_OPEN` or waits for a new window. Student remains academically eligible unless the external academic facts change.

### 2.3 Online payment: functional simulation and production-ready adapter boundary
1. Student starts online payment **on an existing valid application** before its deadline. The attempt is recorded with provider-independent ID, reference and initiation time, and a frozen processing cutoff.
2. Sprint 6 provides a **working simulated provider** with success, failure, delayed result and duplicate callback tests. Provider interfaces are defined for a future real gateway; **do not claim a real gateway is integrated or build a fake production adapter**. Live credentials/provider contract are deferred.
3. Provider-reported success is verified server-side. Never trust browser request claiming a payment succeeded; never handle raw card PAN/CVC in ClubHub APIs/logs/database. Figma card-entry visuals must be adapted to a safe simulator and future tokenized/provider-hosted checkout.
4. On accepted success, store the payment, create membership and complete application atomically in PostgreSQL (plus nominee qualification when applicable). Duplicate callbacks are harmless. On definitive failure, attempt is `FAILED`; student may **retry on the same pending application** with a distinct `PaymentAttempt` while a valid deadline remains.
5. On timeout/unknown provider outcome, mark `PROCESSING`/`UNKNOWN`, **do not assume bank fault** and do not allow simultaneous replacement attempts that could double-charge. Check provider transaction state first; show neutral "Could not confirm payment status; please check before retrying." Grace cutoff is still enforced.
6. If the provider charges after the accepted cutoff, **do not grant membership**. Record `LATE_SUCCESS_REQUIRES_REFUND` (or equivalent) and provider reference; initiate a refund only through a provider-supported verified process. If auto-refund unavailable, queue an explicit reconciliation case with staff action/evidence; never silently erase charge or falsely tell student a refund was completed.
7. Successful online activation cannot be revoked retroactively merely because a callback is delivered late if a verified provider event establishes that the **actual captured/confirmed event time** met the cutoff. Conversely, a fabricated/backdated timestamp is not trusted. Record provider event time, callback received time and validation decision. **Technical default:** accept only verified events whose effective success time is within the window; record callback receipt separately. If provider lacks a trustworthy event timestamp, use receipt time and reconcile ambiguous cases. This is a conservative operational contract, not a claim about gateway behavior.

### 2.4 Grace: exactly what survives ordinary deadlines and early closure
- Ordinary payment deadline `D` = `submittedAt+14 days` (`ALWAYS_OPEN`) or window `closesAt` (`WINDOWED`), subject to earlier approved window lifecycle action.
- At or after `D`, **no new ordinary application and no new payment attempt** can start. A provider attempt that was validly **initiated before** the applicable cutoff receives up to 30 minutes of processing grace: `graceEndsAt = D+30min`.
- If Deanship **closes early at C**, all cash/uninitiated applications are canceled immediately, **but online attempts already processing before C** remain eligible through `C+30min`, capped by an **earlier individual application deadline/grace where applicable**. The window itself stays closed; no new applicants. This is an **explicit amendment** to Sprint 5 BR-13–15, not an assertion that existing Sprint 5 code already implements it.
- A Deanship mode switch to closed or club archive triggers the same **no new attempts** rule; preserving online payment grace on those other actions was **not explicitly agreed**, so **default do not extend this special exception to policy switch/archive**; record any charged funds for reconciliation. Do not broaden exceptions silently.
- Deadline job must **not cancel a pending application with a qualifying active attempt** until its grace expires or the attempt definitively fails. The UI labels it `Payment Processing` while ordinary registration is closed; a cash applicant cannot use online grace retroactively.
- After grace ends, a late charge cannot activate membership; refund/reconcile as above. An unpaid application then becomes `EXPIRED` for natural 14-day deadline, `CANCELED_WINDOW_CLOSED` for closed window, or `CANCELED_EARLY_CLOSE` for early closure, preserving cause.
- For a window extension, pending *uninitiated* applications inherit the extended `closesAt`; attempts must not lose eligibility. Recalculate relevant processing deadlines deterministically only under an explicit window extension transition; persist audit of old/new deadlines. Never revive a previously terminal application.
- Online grace for the **three-day nominee deadline** was suggested but not explicitly confirmed in the final user decision. **Proposed default:** reuse the 30-minute already-processing rule for nominees; flag in the sign-off checklist before implementation. Do not misstate as approved.

### 2.5 Board appointments: Route A versus Route B
**Route A — direct appointment.** Deanship selects an academically eligible student with an active ClubHub account and already confirmed membership coverage spanning the full proposed board term. Create `BoardAppointment` directly using existing services, no nomination, no extra payment, no three-day countdown. This restores the normal Sprint 4 experience.

**Route B — provisional nomination.** Deanship selects an academically eligible student with **no membership** or **insufficient coverage** through proposed term. Store `BoardNomination` (`PENDING_PAYMENT`) with `nominatedAt`, `deadlineAt = nominatedAt+72h`, proposed role, proposed dates and Deanship nominator. This **is not an official appointment**, must not appear in public leadership, and cannot grant admin access. The nominee sees a new **Board Nomination** panel on their student dashboard: club, proposed position/term, why coverage is insufficient, original/new membership intervals, authoritative required price, method choice, live three-day countdown, and online/cash status. Deanship sees nominee queue/status and may confirm cash **only** for a linked special onboarding application. Student can pay online through own student account; provider confirmation qualifies automatically—no second Deanship approval. Paid and covered: create official appointment, mark nomination `QUALIFIED`, preserve all history. Deadline unpaid: `EXPIRED`, no appointment or privileges. Deanship may withdraw before qualification.

**Board term constraints:** `startDate` today or maximum **14 calendar days** ahead (Palestine-local today); **mandatory `endDate` for new appointments**, inclusive date; `endDate >= startDate`; length **at most one calendar year**; no fixed academic-year alignment. Membership effective intervals must cover all days of appointment, including final calendar day. Current historical nullable end dates must not be silently rewritten.

**Board membership exception:** Ordinary active members cannot renew early. A **Deanship-authorized, nomination-linked** special application can pay the normal renewal fee ahead of current expiration to cover a proposed term. For an existing member, prepaid renewal interval starts **exactly at current membership's exclusive `expiresAt`** and ends one calendar year later; never overlap or truncate old coverage. Historical existing period remains untouched. Price comes from current authoritative per-club fee configuration, even if ordinary registration is closed. Normal quote remains first-time/renewal, with an immutable fee snapshot. The special exception applies **only to Deanship-nominated candidates**, not general board members self-requesting it and not arbitrary students.

**No-current-membership future coverage:** User expressly rejected a complex generic delayed-first-membership scheduling engine. Therefore if immediate first-time payment would not cover an upcoming term in full (e.g., full-year appointment starts in 14 days), do **not** falsely qualify nominee. Return `COVERAGE_INSUFFICIENT_FOR_PROPOSED_DATES`; Deanship must shorten/adjust dates or wait to nominate closer to commencement, **unless a later separately approved exception**. A nomination near start is not magically sufficient: **14-day notice alone does not guarantee a full one-year future term can be covered by a membership paid today.** This deterministic validation is mandatory to avoid violating the core coverage rule.

**Coverage calculation:** represent paid memberships as half-open `[activatedAt, expiresAt)` intervals; a board calendar date range `[startDate, endDate inclusive]` becomes `[local-midnight startDate, local-midnight day-after-endDate)` in `Asia/Hebron`. Sort confirmed coverage intervals for that student+club; ensure their union has **no gap** throughout the board term (prepaid rows included when paid and effective by their stored dates). Do not count unpaid applications or future promises. An official future-dated appointment is only **effective** when its calendar term starts and the membership is active then. Keep board free-text `position` separate from `ClubAdminPosition` enum slots.

**Deanship cash authority is narrow:** can confirm only the linked nomination's special cash payment; cannot open/confirm/reject ordinary club payment queues. Preserve `confirmedByAccountId`, action timestamp and nomination association. Any approved nominee payment that does not produce valid coverage must **not** be captured/confirmed as qualifying; for external money collected, use reconciliation, not fabricated coverage.

**Administrator continuity:** Earlier proposed extra three-day president administrative grace **withdrawn**. Three days apply to **nomination payment only**. Extend effective membership checks into `assertCanManageClub()` and admin listing during **planned Sprint 7 cutover**, after verified migration/transition of Sprint 4 historical board appointments. Do not revoke or delete grants on natural membership lapse; retain manual-end revocation behavior. When an appointment ends, assignment is revoked or becomes ineffective per existing rules. If no active qualified admin exists, Deanship assigns a qualified one through the normal governance workflow, not through unrestricted payment privileges.

### 2.6 Club creation and already existing board records
The current `POST /clubs` can atomically create a club, initial board and admin assignments. New rules must not allow that compound route to bypass paid coverage. **Recommended staged compatibility design:** keep legacy valid club-creation fields, but with enforcement enabled: qualifying initial board+admins allowed only with coverage; unpaid proposed initial leaders are recorded as nominations and **not** inserted as effective `BoardAppointment`/`ClubAdminAssignment`. Frontend explains difference and Deanship finishes onboarding before assigning active administrator slots. If nested club creation cannot support this safely during 6.G, split initial club creation from nominations in a backwards-compatible two-step flow; **do not block ordinary club creation or grant provisional admin access**. Write explicit tests for both. Historical board/admin rows must be audited before Sprint 7 cutover; never fabricate paid history, force-end all records, or mass revoke accounts.

---

## 3. Time, money, prices and read models

### 3.1 Time contract
- DB timestamps: `timestamptz(6)`, UTC instants. UI: `Asia/Hebron` dates and local countdown, respecting actual DST rules; no hardcoded `UTC+2` assumption.
- Board `@db.Date` values are **date-only** and end date inclusive; convert final day to the **exclusive next local midnight**. Avoid mixing `toISOString().slice(0,10)` UTC date in the board service with Palestine-local date checks without explicit tests; do not silently rewrite historic board dates.
- Member valid while `activatedAt <= serverNow < expiresAt`. At equality with expiry, next prepaid membership starts without gap. Calendar-year addition (not 365 days); cover February 29 and non-leap rollover with one documented consistent policy (recommended anniversary clamp to February 28 in a non-leap year). `endDate` max last calendar day before first anniversary of `startDate`.
- Nomination deadline is 72 absolute hours after creation, not "end of third local day". Display remaining time from `deadlineAt` plus periodic server-time offset correction; server always authoritatively enforces.
- Application validity reads must not be security boundaries: payment writes and callbacks compare timestamps in their transactions. Freeze and record exact effective deadline/cutoff per attempt.

### 3.2 Fee/version selection
- Ordinary windowed application: effective fee version frozen for its active window. Ordinary always-open application: current effective fee version. Quote frozen on application and not changed when Deanship edits fees.
- **Exceptional nominee application** uses Deanship's current authoritative club fee configuration even when windowed registration is closed. For a windowed club this means the **latest pending configured amounts** in `ClubMembershipSettings` (not an expired window's old locked fee). Create/reuse a historical `ClubMembershipFeeVersion` snapshot *for this exceptional quote* so application provenance remains immutable; **do not** activate an existing closed window, mutate its fee version, or change pending values. This reconciles the user's fee choice with Sprint 5 historical rules.
- Fee values strictly positive in ILS, Decimal(10,2), never floating-point math or client-provided price; first-time vs renewal from previous confirmed membership, including expired/prepaid history. For a prepaid renewal the existing confirmed membership means `RENEWAL`. No arbitrary discount/waiver, price override or free special onboarding.
- Payment amount/currency must match application quote. Store exact fee-version and application reference on both payment and issued membership for later auditing.

### 3.3 Financial status versus membership status
- `Payment.CONFIRMED` means real/simulated verified collection; `Membership` record may be **prepaid for future activation** (no access until `activatedAt`). Do not show future prepaid membership as currently active in club/member counts or current administrator permissions.
- Preserve provider references, confirmation account, confirmation timestamp, fee snapshots and failed attempts. Do not add a Deanship general payment dashboard. Optional read-only aggregate if Figma requires it must not expose confirm endpoints.
- The eventual real provider requires provider-specific signature/secret verification, idempotent events, tokenized/hosted checkout, reconciled refunds and test credentials. **An interface is not a working integration.** Refunds are not guaranteed possible merely because we recorded a case.

---

## 4. State machines (proposed exact enum contract)

### 4.1 Enums
```prisma
// Proposed Prisma enum names; final implementation must keep API casing consistent.
enum MembershipApplicationKind { ORDINARY BOARD_ONBOARDING }
enum MembershipFeeType { FIRST_TIME RENEWAL }
enum MembershipApplicationStatus { PENDING_PAYMENT PAYMENT_PROCESSING PAID EXPIRED CANCELED }
enum PaymentMethod { IN_PERSON ONLINE }
enum PaymentStatus { AWAITING_CASH PROCESSING CONFIRMED FAILED EXPIRED REFUND_REQUIRED REFUNDED }
enum PaymentProvider { MANUAL SIMULATED REAL_GATEWAY }
enum PaymentAttemptStatus { INITIATED PROCESSING SUCCEEDED FAILED EXPIRED UNKNOWN LATE_SUCCESS_REFUND_REQUIRED REFUNDED }
enum BoardNominationStatus { PENDING_PAYMENT PAYMENT_PROCESSING QUALIFIED EXPIRED WITHDRAWN }
enum ApplicationEndReason { TIMEOUT WINDOW_CLOSED EARLY_WINDOW_CLOSE POLICY_SWITCH CLUB_ARCHIVED NOMINATION_TIMEOUT WITHDRAWN PAYMENT_FAILED }
```
**State responsibility:** application captures entitlement/application eligibility; payment captures a logical charge and collection; attempt captures each online interaction; membership is a confirmed coverage interval; nomination is pending governance authorization. Avoid redundant editable status copies without transactionally enforcing consistency.

### 4.2 Allowed transitions

| Entity | From → To | Trigger | Notes |
|---|---|---|---|
| Application | `PENDING_PAYMENT` → `PAYMENT_PROCESSING` | Verified start of online attempt | Must be before applicable deadline |
| Application | `PENDING_PAYMENT` → `PAID` | Authorized cash confirmation | Single atomic DB transaction |
| Application | `PAYMENT_PROCESSING` → `PAID` | Verified online success within allowed cutoff | Even after nominal close if qualifying grace |
| Application | `PAYMENT_PROCESSING` → `PENDING_PAYMENT` | Definitive online failure and application still payable | Retry allowed; no duplicate application |
| Application | `PENDING_PAYMENT` → `EXPIRED` / `CANCELED` | Deadline/window lifecycle | End reason stored; preserve record |
| Application | `PAYMENT_PROCESSING` → `EXPIRED` / `CANCELED` | Grace ended/failed/forced non-grace cutoff | Late charge goes reconciliation |
| Payment | `AWAITING_CASH` → `CONFIRMED` | Club-admin or nominee-only Deanship cash confirm | No `REJECT` UI/route |
| Payment | `PROCESSING` → `CONFIRMED` | Verified acceptable online provider success | One membership only |
| Payment | `PROCESSING` → `FAILED` / `EXPIRED` | Provider failure or deadline resolution | May retry via another attempt |
| Payment | `EXPIRED` → `REFUND_REQUIRED` → `REFUNDED` | Late externally captured amount | Finance reconciliation; no membership |
| Nomination | `PENDING_PAYMENT` → `PAYMENT_PROCESSING` | Started online onboarding charge | Countdown remains visible |
| Nomination | `PENDING_PAYMENT`/`PAYMENT_PROCESSING` → `QUALIFIED` | Paid coverage + appointment persisted | **No manual bypass** |
| Nomination | Pending/processing → `EXPIRED` / `WITHDRAWN` | Deadline or Deanship withdrawal | Retain history, no public leadership |

**Explicit invalid transitions:** `PAID`→`PENDING`; `QUALIFIED`→`PENDING`; expired app revived by new window; `REFUND_REQUIRED`→`CONFIRMED` membership; second confirmed payment to second membership; ordinary application with active membership; cash confirmation after cutoff; new online attempt after cutoff; manual qualification without paid coverage.

**Retries:** separate payment attempts under one logical online Payment; only one unresolved online attempt per logical payment at a time. A definitive failed attempt is retained; subsequent initiation allocates a new attempt. If the platform chooses one Payment per attempt instead, preserve same idempotent *logical charge* guarantee; prefer proposed `Payment` parent + `PaymentAttempt` children.

---

## 5. Prisma design and migration contract

### 5.1 Design principles
Use current Prisma 7 datasource/config and generated-client path. Add **new** tables; extend `Membership`; add back-relations to existing Club, UniversityStudent, Account, fee version, registration window, BoardAppointment; preserve UUID FKs and `onDelete: Restrict` financial history. Preserve `Decimal(10,2)`, `Timestamptz(6)`, `Date`. Use Prisma migrations for ordinary constraints and **SQL migration** for partial uniqueness/check/exclusion constraints Prisma does not express. **Do not run `db push` in place of reviewed migrations.** Back up development DB first and test migration on a cloned DB. Migration commands from `apps/api` with project-specific Prisma config; validate with `npx prisma validate`, `npx prisma migrate dev` (development), `npx prisma generate`; `migrate deploy` for deployment; verify generated client.

### 5.2 Proposed physical fields

**`MembershipApplication` — new**
```
id UUID PK; clubId UUID FK Club; studentId UUID FK UniversityStudent;
kind MembershipApplicationKind; boardNominationId UUID? FK BoardNomination;
status MembershipApplicationStatus; feeType MembershipFeeType;
quotedAmount Decimal(10,2); currency VarChar(3)="ILS";
feeVersionId UUID FK ClubMembershipFeeVersion; registrationWindowId UUID? FK ClubRegistrationWindow;
registrationModeAtSubmission MembershipRegistrationMode?;
submittedAt timestamptz; paymentDeadlineAt timestamptz;
processingGraceEndsAt timestamptz?; originalDeadlineAt timestamptz?;
paidAt timestamptz?; canceledAt timestamptz?; endReason ApplicationEndReason?;
createdAt timestamptz; updatedAt timestamptz;
relations payments Payment[] and membership Membership?;
indexes (studentId, clubId, status), (clubId, status, paymentDeadlineAt),
(registrationWindowId,status), (boardNominationId);
```
Apply **partial unique** `(clubId,studentId) WHERE status IN ('PENDING_PAYMENT','PAYMENT_PROCESSING')` across ordinary+nominee applications, OR explicitly constrain ordinary and nominee overlap with a transactionally checked membership key. **Preferred:** at most one live application of either kind per student+club; if creating a nomination when an ordinary pending app exists, disallow and instruct closure/resolution of ordinary app rather than charging twice. `BOARD_ONBOARDING` requires nomination FK; `ORDINARY` requires it to be null; use `CHECK` constraint. Foreign key consistency must prevent student/club mismatches (composite related unique or explicit locked transactional checks plus tests).

**`Payment` — new logical charge**
```
id UUID PK; membershipApplicationId UUID? FK MembershipApplication;
eventRegistrationId UUID? FK EventRegistration (for Sprint 9, nullable now);
method PaymentMethod; provider PaymentProvider; status PaymentStatus;
amount Decimal(10,2); currency VarChar(3); referenceKey UUID/string unique idempotency;
confirmedAt timestamptz?; confirmedByAccountId UUID? FK Account;
providerPaymentId String? unique scoped to provider; refundStatus? (or status);
createdAt timestamptz; updatedAt timestamptz; attempts PaymentAttempt[];
indexes (membershipApplicationId,status), (eventRegistrationId,status), (status,createdAt);
```
SQL `CHECK (num_nonnulls(membershipApplicationId,eventRegistrationId)=1)`; do not create actual event payment flows in Sprint 6. For cash, `confirmedByAccountId` mandatory at confirmation and provider `MANUAL`; for online, no human confirmer (provider verification recorded instead). Add **partial unique** one `CONFIRMED` payment per membership application (and one confirmed membership via unique FK). Do not double count failed attempts.

**`PaymentAttempt` — new**
```
id UUID PK; paymentId UUID FK Payment; status PaymentAttemptStatus;
provider PaymentProvider; providerAttemptRef String?; idempotencyKey String unique;
initiatedAt timestamptz; nominalDeadlineAt timestamptz;
processingGraceEndsAt timestamptz; providerEventAt timestamptz?;
receivedAt timestamptz?; failureCode String?; failureMessageSafe String?;
providerPayloadDigest String?; refundReference String?;
resolvedAt timestamptz?; createdAt timestamptz; updatedAt timestamptz;
indexes (paymentId,status), (status,processingGraceEndsAt);
unique (provider,providerAttemptRef) where ref not null; partial unique one
unresolved attempt per payment (INITIATED/PROCESSING/UNKNOWN) if desired.
```
Never store PAN, CVC, tokens that are actual credentials, unrestricted webhook payloads or raw banking PII. Keep technical safe error codes and event verification metadata. For later gateway reconciliation, `REFUND_REQUIRED` state and `refundReference` are the minimum; a separate `PaymentRefund` model is **deferred** until a real provider contract requires partial/multiple refunds. Never mark refunded without provider confirmation.

**`BoardNomination` — new provisional governance**
```
id UUID PK; clubId UUID FK Club; studentId UUID FK UniversityStudent;
position VarChar(100); proposedStartDate Date; proposedEndDate Date;
nominatedById UUID FK Account; nominatedAt timestamptz;
deadlineAt timestamptz; status BoardNominationStatus;
reason enum/string: NO_MEMBERSHIP / INSUFFICIENT_COVERAGE;
qualifiedAt timestamptz?; expiredAt timestamptz?; withdrawnAt timestamptz?;
boardAppointmentId UUID? UNIQUE FK BoardAppointment;
createdAt timestamptz; updatedAt timestamptz;
application MembershipApplication? (unique nomination FK);
indexes (clubId,status,deadlineAt), (studentId,status,deadlineAt);
```
Prevent more than one active provisional nomination for a given student+club; preserve old historical nominations. Initial board/administrator slot selection should not treat a nomination as an assignment. On `QUALIFIED`, exactly one official appointment is linked. Route A directly creates BoardAppointment with no nomination.

**`Membership` — extend existing**
```
KEEP id, clubId, studentId, activatedAt, expiresAt, createdAt;
ADD membershipNumber String @unique (human readable; server generated);
ADD sourceApplicationId UUID? @unique FK MembershipApplication;
ADD sourcePaymentId UUID? @unique FK Payment;
ADD confirmedPaymentAt timestamptz? (if needed for prepaid case);
ADD updatedAt timestamptz;
INDEX (clubId, studentId, activatedAt, expiresAt).
```
For newly issued memberships source FKs are required by business rule; **nullable only for existing historical rows during migration**, with separate `origin`/legacy reporting if needed. Do not invent confirmed payments for Sprint 5 demo/backfilled memberships. Membership card Sprint 7 uses `membershipNumber` and actual `expiresAt`.

### 5.3 Constraints beyond Prisma annotations
- **No overlapping membership intervals:** PostgreSQL `btree_gist` extension and `EXCLUDE USING gist (clubId WITH =, studentId WITH =, tstzrange(activatedAt,expiresAt,'[)') WITH &&)` after migration audit. Test provider/host PostgreSQL extension support; if unsupported implement serialized per student+club advisory/row lock **plus** a DB guard/trigger, and document guarantee. `CHECK expiresAt > activatedAt`.
- Fee and amounts `>0`; restrict currency to `ILS` for this stage; quoted and paid amounts exact (do not trust client).
- Nomination application uniqueness and linkage; `CHECK` nomination end >= start and <= calendar-year bound at service level, plus DB date consistency. Local date business validation belongs in service.
- Prevent partial/duplicate qualifications with FK `UNIQUE` and per-student-club lock. Store all references before committing; no user-controlled membership dates or membership numbers.
- Real concurrency constraint for live applications: partial uniqueness SQL must exist and be verified on actual PostgreSQL, not solely mocked Prisma queries.
- Membership number format **proposed**: `CH-<year>-<zero-padded DB sequence>` (e.g. `CH-2026-000001`); allocate from DB sequence (safe under concurrency, gaps allowed), unique index; format is a technical default and not a user-approved public branding choice. Prefer stable lifetime number per membership *record* (not per student; renewals issue new membership records).
- **Index + backrelations audit:** Prisma `Club`, `UniversityStudent`, `Account`, `ClubMembershipFeeVersion`, `ClubRegistrationWindow`, `BoardAppointment` and `EventRegistration` all need declared reciprocal relations and named relations where ambiguous. Validate PostgreSQL FK composite same-club provenance.

### 5.4 Migration staging and existing-data policy
1. Create/add nullable columns and tables before enforcing NOT NULL rules on preexisting records.
2. Inspect existing `Membership` rows, board appointments with `endDate = null`, future board appointments, unrevoked admin grants, and orphan/invalid related rows. Produce an **audit report**, not guessed backfills.
3. Backfill membership numbers for real historical confirmed memberships safely with sequence; **no invented money movements**. Legacy `sourcePaymentId` stays null with explicit provenance.
4. Implement DB constraints and verify with concurrent PostgreSQL integration tests. Check migrations against current Sprint 5 fee snapshot SQL function and table/index names.
5. Gate membership-based board authorization behind an explicit **Sprint 7 transition feature flag/process** until historical board entries are reconciled; do not suddenly lock out all current administrators when deploying new payments.
6. Test rollback plan: use DB backup + restored clone for destructive rollback; Prisma migrations are forward-only in deployed DB, so don't advertise blind down-migration.

---

## 6. Backend architecture and transactional algorithms

### 6.1 New service boundaries

| Module/service | Owns | Reuse / dependencies |
|---|---|---|
| `MembershipApplicationsModule` / `MembershipApplicationsService` | ordinary + nominee applications; quote snapshot; list; lifecycle | Existing `ClubEligibilityService`, `ClubsService` read contracts; use central transaction helper |
| `PaymentsModule` / `PaymentsService` | logical charges, cash confirmation, attempt creation, statuses, idempotent confirmation | `ClubAdminAssignmentsService`, nomination policy; shared payment confirmation transaction |
| `PaymentProviders` interface and `SimulatedPaymentProvider` | simulate verified provider events; real adapter interface only | Future Sprint 9 reuses provider abstraction |
| `ApplicationDeadlineService` + scheduler/reconciler | sync guards; 14-day/window/nominee expiry; grace; mode/close/extend effects | Existing Sprint 5 `MembershipWindowReconcilerService` handles **fee window snapshots**, not application money |
| `BoardNominationsService` | Route A/B decision; 72h; coverage; qualify; withdraw; Deanship authority | Existing `BoardAppointmentsService`, membership service; consistent local-date utility |
| `MembershipCoverageService` (small shared helper) | full-term interval union/overlap checks | Used by appointment create/update, nomination finalization, later access |
| Existing `ClubsService` | fees, windows and public availability | Keep as owner; call lifecycle hooks transactionally; avoid 2 competing clocks |
| Existing `ClubAdminAssignmentsService` | effective club auth | Add Sprint 7 membership qualification predicate behind migration gate |

Avoid gigantic additions to 2,500+ line `ClubsService`. Reuse injected `PrismaService` and existing DI. Register new modules in `AppModule`; import/export dependencies without circular references. Use Prisma 7 generated client types. Implement a shared transactional confirmation function so cash and online cannot diverge.

### 6.2 Application creation (transactional pseudocode)
```
assert signed-in active STUDENT; resolve studentId from JWT-linked Account
BEGIN
  lock Club row and club/student key in consistent order (or advisory lock)
  recheck ACTIVE club, eligibility and appropriate registration policy/instant
  reject if active membership or any live conflicting pending application
  select fee from existing effective version (or nomination exception snapshot)
  INSERT MembershipApplication (immutable quote and authoritative deadline)
COMMIT
return 201 application with CTA status, amount, deadline
```
**Note:** Application creation must not authorize a person who was academically ineligible just because client UI enabled the button previously. For nominee-only exception, require a valid nomination and verify ownership or Deanship creation permission. Reuse club classification exactly.

### 6.3 Cash confirmation (one DB transaction)
```
authenticated club admin for ORDINARY OR active DEANSHIP for nomination-only payment
BEGIN (lock consistent club/student then application/payment/nomination rows)
  read authoritative DB time; verify role, ownership, method, amount/currency,
  status, no previously confirmed membership/payment, cash deadline and club lifecycle
  create/transition cash Payment to CONFIRMED, store actor+time
  INSERT Membership with approved [activatedAt,expiresAt), unique number/source refs
  if BOARD_ONBOARDING: recompute coverage; if now sufficient:
     insert BoardAppointment, mark nomination QUALIFIED and link appointment
  mark application PAID
COMMIT
return current confirmed state; repeat confirms return unchanged result
```
**Preconfirmation coverage preview is mandatory** for nominee cash: do not accept funds and then discover the resulting membership cannot cover proposed board period. Recheck under lock at finalization. Online external success cannot be rolled back by DB; see next section for reprocessing/reconciliation.

### 6.4 Online provider, callbacks and external atomicity
- Interface: `createCheckout`, `verifyEvent`, `getAttemptStatus`, `requestRefund` (real adapter only when provider supports), stable provider reference and idempotency key. Use different environment configs for `SIMULATED` and future live provider; simulated callbacks authenticated via server-side secret/HMAC or internal test-only driver, never publicly accept `{success:true}` as truth.
- Create attempt under lock and before deadline, refuse parallel unresolved attempts. Pass **only opaque IDs, money and provider fields** to adapter. Simulated frontend needs an API-controlled success/failure demonstration—do **not** use Figma `setTimeout()` to create membership locally.
- Callback: verify authentic provider signature/event uniqueness, resolve logical payment and attempt, record provider event id/time, enforce success cutoff, lock same student/club key, recheck amount/currency/ownership. In transaction change payment/application/member/nomination together; after commit send user state update/notification or queue notification record. HTTP 2xx after durable idempotent success. A repeated callback returns same decision.
- **External bank transaction is not part of PostgreSQL transaction.** If money was captured but DB commit fails, do not lie that payment failed; persist/retry verified event with an inbox/outbox or equivalent durable event ledger; keep reconciliation queue. On unavailable DB, return retriable provider webhook status per gateway contract. An online payment for nominee whose appointment dates cannot be covered is **not activated**; reconcile/refund externally; prefer checking coverage **before checkout** so this is preventable.
- Explicit note: a bank may return delayed outcomes beyond 30 minutes; do not assume the provider can void/refund automatically. Never tell a student "your bank caused the problem" without evidence.

### 6.5 Registration-window lifecycle hooks
Extend existing **window closing, extension, mode switching, archiving** paths rather than creating separate window truth. Do not mutate immutable window historical data.
- Scheduled close: registration availability becomes false at `closesAt` automatically; application guard cancels cash/uninitiated apps; qualifying attempts may process through their frozen `closesAt +30m` grace.
- Early close: existing `closeRegistrationWindow()` sets `closedAt`. Within a *coordinated transaction* or a deterministic reconciliation immediately after, cancel cash/uninitiated apps and preserve qualifying attempts through `closedAt+30m` (respect earlier deadline). Ensure success callback and early close use compatible lock order and one authoritative cutoff. No new applications/attempts once closed.
- Extend active window: update pending app deadlines for that **same** window, preserving exact locked fee version, and revise/grant attempt deadline only where allowed. Existing closed/expired application cannot be resurrected.
- Switch to closed window: existing BR-17 immediately cancels unpaid ordinary apps; **no agreed online exception**, so hold any paid-but-late amounts for reconciliation. Archive likewise denies future joins; preserve history. These are explicit defaults pending only a future change request—not loopholes.
- Reconciliation job handles expiry/reason, nominee 72h, attempts grace, payment pending and safe notification trigger; also perform synchronous checks on every GET/POST that needs a current state. A scheduler is eventual cleanup, never a permit to confirm stale cash.

### 6.6 Board Route A/B and initial-club flow
- Reuse existing eligibility, active-account, club status, overlapping appointment/president checks, distinct board position strings, and Deanship-only modification guard.
- `checkCoverage(studentId,clubId,startDate,endDate)` returns `{eligible,existingIntervals,fullyCovered,missingIntervals,action:'DIRECT'|'NOMINATION'|'INVALID_DATES',feeType,quote,reason}`. Read-only coverage preview does **not** reserve candidate or price.
- `POST /clubs/:id/board` **Route A** only when fully covered, direct official appointment. For insufficient coverage return an actionable 409 with required nomination path; do not quietly create unpaid official appointment.
- `POST /clubs/:id/board-nominations` creates Route B if eligible, dates valid and insufficient coverage; deadline 72h; reserve only proposed nomination, not admin grant. Nominee details visible to owner and Deanship; not to ordinary students.
- `POST` nominee-specific application snapshots fee and quote and does not consume normal registration window; DEANSHIP-created nomination is sufficient exception proof. Online payment by nominee goes through their student account. Cash payment via Deanship. On success and sufficient coverage, create appointment within transaction and set `qualifiedAt`; never separate manual “qualify” approval.
- Date edit of *existing qualified* appointment must revalidate coverage and overlaps. Manual end still records `endedAt` and revokes linked active admin assignments in existing transaction. Public leadership excludes pending nominations automatically because they have **no** BoardAppointment; later Sprint 7 should ensure effective coverage predicate.
- Initial club creation with nominated but unpaid board: see §2.6. **Do not create initial active admin slots for provisional board nominees**.

### 6.7 Request-scoped auditing and UI update strategy
- Record actor IDs for nomination creation/withdrawal, exceptional Deanship cash confirm, regular club cash confirm, member creation; include `confirmedAt`, payment ID, application ID, club ID. Audit events later integrate Sprint 12 general `AuditLog`; preserve provenance now so actor identity cannot be reconstructed incorrectly.
- Club admin two-session synchronization: initial **poll every 5–15 seconds** on queue and refresh immediately after mutations / tab focus; server returns ETag or `updatedAt`/revision if helpful; a later WebSocket is optional, not a Sprint 6 prerequisite. Ensure second admin sees confirm state, and stale button gets safe already-confirmed response. No huge real-time infrastructure required.
- Notifications: Sprint 11 owns full notifications inbox. Sprint 6 must return immediate status/UI alerts and event hooks for future durable notifications; *if* a minimal nomination alert is needed now, implement one scoped persisted in-app alert or visible dashboard task without representing Sprint 11 as complete. Three-day countdown in dashboard cannot depend solely on future notifications.

---

## 7. Proposed API contracts, DTOs, responses, errors

### 7.1 Response conventions
All IDs UUID, API time ISO-8601 UTC with `Z`, board days `YYYY-MM-DD`, money decimal strings (`"25.00"`), currency `ILS`. Use existing Nest controllers with paths **without** a global prefix (`/api` added by frontend proxy). Request bodies never contain `studentId` for student-owned application, `confirmedById`, membership number, server timestamps, price override, or paid status. Authenticated actor from JWT. Paginate list endpoints; filter by club and status server-side. Return consistent JSON errors with machine-readable `code`, `message`, and relevant `details` (`currentApplicationId`, `coverage`, `deadlineAt`). Map `401` login, `403` role/scope, `404` not found/opaque unauthorized read, `409` business conflict, `422` invalid state/coverage, `400` format, `429` throttling.

### 7.2 Existing routes to extend but preserve
| Method/path | Existing | Sprint 6 extension |
|---|---|---|
| `GET /clubs/:id/eligibility/me` | Yes | `membership.pendingApplication` summary and `ctaState`, payment method, deadline, quote; `canApply=false` when pending, but return `continuePayment` independently |
| `GET /clubs/:id/membership/availability` | Yes | Keep public response; don't leak student payments |
| `POST /clubs`, `POST /clubs/:id/board`, `PUT /board-appointments/:id` | Yes | Coverage and required end/start restrictions; Route B actionable errors; initial club creation safe flow |
| `GET /clubs/:id/board`, `/history`, `/clubs/:id/leadership` | Yes | Continue to return **official** BoardAppointment only; no nominees |
| `GET /clubs/my-admin-assignments`, `GET /clubs/:id/admin/overview` | Yes | Existing behavior preserved until Sprint 7 cutover; then effective membership predicate |
| Existing Deanship fee/mode/window routes | Yes | Extend reconciliation side effects as in §6.5; don't break DTO/URL |

**Example augmented quote (illustrative contract):**
```json
{
  "eligible": true, "reason": "ELIGIBLE",
  "membership": {
    "registrationAvailable": true, "availabilityStatus": "ALWAYS_OPEN",
    "alreadyActiveMember": false, "hasPreviousMembership": false,
    "canApply": false, "feeType": "FIRST_TIME", "amount": "25.00", "currency": "ILS",
    "feeVersionId": "uuid", "ctaState": "CONTINUE_PAYMENT",
    "pendingApplication": { "id": "uuid", "status": "PENDING_PAYMENT", "method": "ONLINE", "paymentDeadlineAt": "2026-12-01T12:00:00.000Z", "quotedAmount": "25.00", "currency": "ILS" }
  }
}
```
If an existing application is pending, `feeType/amount` should reflect the **application snapshot**, not current updated quote; separate `nextApplicationQuote` only if truly necessary. Never mislabel a stale windowed price.

### 7.3 New student/application routes
| Method | Route | Auth | Request DTO → response |
|---|---|---|---|
| `POST` | `/clubs/:id/applications` | active STUDENT | body `{}`; returns `201 {application}` including frozen `quotedAmount`, `feeType`,`status`,`paymentDeadlineAt`, `windowId`; `409 APPLICATION_ALREADY_PENDING`, `409 ALREADY_ACTIVE_MEMBER`, `409 REGISTRATION_CLOSED`, `403 INELIGIBLE` |
| `GET` | `/students/me/applications?status=&page=&limit=` | STUDENT | paginated own applications, newest first; includes pending/deadline/payment/method summary |
| `GET` | `/applications/:id` | student owner / scoped club admin (own club) / Deanship **nomination-only** as appropriate | full authorized detail, never arbitrary cross-student disclosure |
| `GET` | `/students/me/payments?page=&limit=` | STUDENT | own payment summaries and safe attempt status; no raw provider secrets |
| `GET` | `/payments/:id` | owner, owning club admin for ordinary, nomination-owning Deanship for exceptional | status, amount, confirmer display for authorized auditors, relevant deadlines |
| `GET` | `/clubs/:id/applications?status=&page=&limit=` | club admin | own-club ordinary app queue, necessary student identity/fee snapshot only; **exclude special Deanship nomination cash queue** |

### 7.4 New payment routes
| Method | Route | Actor | DTO and behavior |
|---|---|---|---|
| `POST` | `/applications/:id/payments` | student owner | `{method:'IN_PERSON'|'ONLINE', idempotencyKey}`; return pending cash instructions or `{paymentId,attemptId,checkout}`; if previously chosen method, return existing current state; **method switching** allowed only before any successful/unknown charge and while pending, under lock |
| `POST` | `/payments/:id/attempts` | owner STUDENT | `{idempotencyKey}`; new attempt only after verified failure and before deadline; returns attempt/checkout; no parallel unresolved attempts |
| `GET` | `/payments/:id/attempts/:attemptId` | owner | safe attempt status; UI can poll while processing |
| `PATCH` | `/payments/:id/confirm` | club admin, own club, **ORDINARY+IN_PERSON only** | empty `{}`; return confirmed Membership/payment; repeat safe; Deanship forbidden here |
| `GET` | `/clubs/:id/payments?status=&method=&page=&limit=` | authorized club admin | own club's ordinary memberships, cash queue, confirmed history/actor; do not expose other clubs |
| `POST` | `/payments/provider-callback` | **provider signature**, not user-JWT | raw signed provider-specific body, unique event ID, verified event fields; return 2xx on idempotent accepted event; reject unverifiable callbacks |
| `GET` | `/payments/:id/reconciliation` | narrowly authorized future finance handler | **defer external staff operational UX until real gateway**; preserve internal status and technical logs now |

**Original `PATCH /payments/:id/reject` is expressly removed from Sprint 6 scope**; no normal cash claim/rejection flow. For simulation, offer developer/test-only secure trigger endpoints or internal adapter hooks, never expose a real-user `confirmOnlinePayment` trust bypass.

### 7.5 New nomination endpoints (Deanship unless noted)
| Method | Route | DTO/contract |
|---|---|---|
| `POST` | `/clubs/:id/board/coverage-check` | Deanship `{studentId,startDate,endDate,position}` → coverage intervals, eligible, `DIRECT`/`NOMINATION`/`INVALID`, price and explanation; read-only calculation (POST for complex DTO) |
| `POST` | `/clubs/:id/board-nominations` | Deanship `{studentId,position,proposedStartDate,proposedEndDate}` → `201 nomination`, 72h deadline, coverage gap, quote/proposed action |
| `GET` | `/clubs/:id/board-nominations?status=&page=&limit=` | Deanship queue/history for that club |
| `GET` | `/board-nominations/:id` | Deanship or nominee owner; different field projections |
| `GET` | `/students/me/board-nominations?status=&page=&limit=` | STUDENT own nominations, required for dashboard card |
| `GET` | `/board-nominations/:id/membership-requirements` | Deanship or nominee owner; current+prepaid intervals, fee quote and validation reason |
| `POST` | `/board-nominations/:id/applications` | STUDENT nominee or authorized Deanship initiation | `{}` → immutable special application, linked to nomination, deadline `nominatedAt+72h`; cannot create arbitrary nomination/application |
| `PATCH` | `/board-nominations/:id/payments/:paymentId/confirm` | active DEANSHIP only | empty `{}` → confirmed payment, membership, qualified appointment; **cannot confirm ordinary cash** |
| `PATCH` | `/board-nominations/:id/withdraw` | Deanship | `{reason?}`; no qualification; if external in-flight payment exists, stop new attempts, reconcile provider success appropriately |

**Route A:** existing `POST /clubs/:id/board` remains for fully covered nominees and returns official appointment. **Route B:** only provisional nomination route creates pending status. The UI calls coverage-check before choosing which action. **No route to manually mark `QUALIFIED`.**

### 7.6 DTO validation matrix
- UUID route IDs via `ParseUUIDPipe`; student-owned endpoints derive profile from session.
- Board dates strict ISO date-only `YYYY-MM-DD`, `startDate` >= Palestine-local today and <= today+14 calendar days; inclusive `endDate`; <= one calendar year; position 1–100 chars; prevent duplicate overlapping same student and president role as current board service.
- Student payment body only `method` enum and mandatory idempotency key; no amounts/currency accepted. For method switching allow only when no charge has completed/unknown outcome; preserve failed attempts.
- Pagination positive bounded ints; method/status filters validated; no leaking other club's application or student financial data.
- Cash confirmation empty body; no client-provided confirmer, `confirmedAt` or membership expiration.
- Provider webhook verified signature/HMAC and content type; retry-safe; trusted event time and amount/currency proof; mapped status. Production gateway endpoint specifics are adapter-specific and **not yet known**.
- Server computes all deadlines and membership intervals and prevents mutable quote edits after application submission.

### 7.7 Error and UI mapping
| Code | Situation | Expected user-facing response |
|---|---|---|
| `INELIGIBLE` | academic criteria fail | Membership unavailable, reason; no application |
| `ALREADY_ACTIVE_MEMBER` | normal duplicate active membership | Already a Member |
| `APPLICATION_ALREADY_PENDING` | duplicate live app | Continue Payment / Awaiting Cash with existing ID |
| `REGISTRATION_CLOSED` | new app after close | Registration Closed |
| `CASH_DEADLINE_PASSED` | cash confirmation late | Application expired/canceled; do not collect; reapply if allowed |
| `PAYMENT_IN_PROGRESS` | attempted second unresolved online charge | Processing; check status, no immediate duplicate charge |
| `PAYMENT_ALREADY_CONFIRMED` | second admin or callback | Idempotent confirmed result; no extra membership |
| `PAYMENT_FAILED_RETRYABLE` | verified failure before deadline | Retry on same application |
| `PAYMENT_LATE_REFUND_REQUIRED` | charged outside accepted cutoff | No membership; payment reconciliation notice |
| `NOMINATION_EXPIRED` | three-day deadline missed | Nomination expired, contact Deanship |
| `BOARD_COVERAGE_INSUFFICIENT` | term exceeds paid coverage | Deanship adjust dates / nomination/renewal as appropriate |
| `BOARD_START_TOO_FAR` | start >14 local days away | Choose earlier nomination date or return closer to start |
| `BOARD_TERM_TOO_LONG` | > one year | Adjust end date |
| `CROSS_CLUB_FORBIDDEN` | attempted other-club admin | 403; no data mutation |
| `FEE_VERSION_UNAVAILABLE` | missing authoritative configuration | Fail safely and log for Deanship; no invented price |

---

## 8. Permissions (enforce on API, never only UI)

| Action | Student | Club admin (own club) | Deanship | Supervisor | Public |
|---|---|---|---|---|---|
| Read public club/availability | Yes | Yes | Yes | Yes | Yes |
| Read personal eligibility/quote | Own | Own (as student) | No impersonation | No | No |
| Create ordinary application | Own, eligible | Own (as student) | No | No | No |
| Read ordinary application | Own | Own club limited queue | **No general payment-approval access**; optional Figma-aligned read-only summary | No | No |
| Initiate own online/cash payment | Own | Own student profile | No ordinary payment | No | No |
| Confirm ordinary cash | No | Yes, current own-club permission | **No** | No | No |
| Retry failed own online attempt | Own | Own student profile | No | No | No |
| Read own financial history | Own | Own club, scope-limited | Read-only permitted summary if approved UI | No | No |
| Configure club fees/windows | No | No | Yes | No | No |
| Direct qualified board appointment | No | No | Yes | No | No |
| Create/withdraw provisional nomination | No | No | Yes | No | No |
| Read special nomination | Own | No special financial authority | Yes | No | No |
| Start nominee payment | Own nomination | No special financial authority | Nomination initiation only | No | No |
| Confirm nominee cash | No | **No** | **Yes, only nomination-linked cash** | No | No |
| Appoint/revoke club admins | No | No | Yes (existing workflow) | No | No |
| Confirm provider event | No | No | No | No | Signed trusted provider only |

Account status disabled or club archived always blocks new actions. Current membership qualification for **effective board/admin access** is the Sprint 7 transition, not license to revoke current grants during Sprint 6 migration. Deanship's exceptional cash confirmation is a narrow and recorded deviation from earlier general prohibition; *not* general club payment control.

---

## 9. Figma source-to-GitHub implementation ledger

### 9.1 Design migration law
- Figma Make contains the **full-platform prototype**, including future Sprint 7–11 sections. **Presence in Figma but absence in GitHub is expected**, not a defect. Migrate Sprint 6 parts only.
- Preserve Figma visual layout, component hierarchy/spacing, typography, colors, headings, modals, animations and responsive behavior. If an earlier-sprint GitHub component already migrated and improved the design, preserve the working GitHub component and adapt *only* Sprint 6 portions. New Deanship/nominee controls are a required feature addition and need visual approval against Figma style.
- Replace mock `useStore`, seed `CLUBS`, `NOW`, local confirmations, demo counters, fake membership numbers, `$` amounts and card-autofill with real API data, ILS, authenticated scope and server time. Preserve future event/expense/menu layout but leave functionality deferred. Do not port Figma's old shared admin account/password, obsolete three-day normal cash deadline, or generic Reject button.
- Use existing `apps/web` routing, auth state, fetch helpers, tokens, style conventions; do not paste Figma's independent router/store wholesale. No production UI can self-confirm payment or expire an application. No hardcoded fake financial results.

### 9.2 Detailed screen mapping

| Figma file/section/control | Existing GitHub target | Action, API and behavior | Stage |
|---|---|---|---|
| `src/pages/ClubPage.tsx` membership price card | `apps/web/src/pages/ClubPage.tsx` existing membership section | Keep existing availability+eligibility API; display authoritative ILS quote/fees and registration state | 6.H |
| `ClubPage` Apply/Renew CTA | same | `GET /clubs/:id/eligibility/me` includes `ctaState`; open Figma modal if eligible/no pending; active=Already Member; pending=Continue/Awaiting | 6.H |
| `ClubPage` application modal (online/in-person cards) | same | Preserve Figma modal appearance; `POST /clubs/:id/applications` then `POST /applications/:id/payments`; don't create twice | 6.H |
| `ClubPage` "club admin confirms" demo button | same | **REMOVE student-facing demo control**; confirmation only admin endpoint | 6.H |
| `ClubPage` "fast-forward deadline" demo button | same | **REMOVE**; show real deadline/status returned by backend | 6.H |
| `ClubPage` cash help text "within 3 days" | same | Replace with **14 days**/actual window deadline displayed from application; 3 days only nominee | 6.H |
| `src/pages/Payment.tsx` card checkout layout | new `apps/web/src/pages/Payment.tsx` or route-consistent component | Migrate visual screen, form state, payment review, processing/success; connect `POST payments`/`POST attempts`, `GET status` and callback-driven result; safe simulation | 6.H |
| `Payment.tsx` demo card autofill | new payment UI | **REMOVE in production**; use test-only adapter environment, no fake local successful membership | 6.H |
| `Payment.tsx` future event checkout | preserve visual for Sprint 9 | Do **not** implement event charge this sprint; payment model supports later route | 9 |
| `src/pages/Dashboard.tsx` Applications & Payments | `apps/web/src/pages/Dashboard.tsx` existing placeholders | `GET /students/me/applications`, `/payments`; status, deadline, method, retry/Continue, no local confirm/expire | 6.H |
| `Dashboard.tsx` active memberships card/list | existing dashboard | Current membership summary from real data where Sprint 6 needs confirmation; full card export/photo Sprint 7 | 6.H/7 |
| `src/pages/Clubs.tsx` club badges | existing `Clubs.tsx` and `components/ClubCard.tsx` | Keep existing Sprint 5 eligibility/availability; optionally show pending badge from per-student app projection; avoid N+1 if many clubs | 6.H |
| `src/admin/Members.tsx` pending applicants | `apps/web/src/staff/ClubAdminDashboard.tsx` Members section | Own-club `GET /clubs/:id/applications`; quoted amount, student identity, deadline, method; Confirm Payment for cash only | 6.H |
| `Members.tsx` Reject | admin Members | **REMOVE** generic Reject; expiry automatic; no eligibility approval | 6.H |
| `Members.tsx` member roster/search | admin Members | Real confirmed/active count; full member lists and export Sprint 7; no synthesized `memberPreview` rows | 6.H/7 |
| `src/admin/Payments.tsx` Money / Membership income | admin Payments section | Real sum of confirmed payments and pending cash, filter, confirmation attribution; avoid `club.members * price` fake income | 6.H |
| `Payments.tsx` Events/Expenses/Budget panels | existing shells, later modules | Retain visual layout; show clearly deferred/empty accurate states, do not invent event revenue or cash expenses | 8–11 |
| `src/admin/Overview.tsx` awaiting payment summary | club-admin overview | Real ordinary pending cash count, amounts; links to Members; no event-mock aggregates | 6.H |
| `src/admin/AdminApp.tsx` navigation | existing `ClubAdminDashboard` navigation | Preserve current authorization and page structure; integrate Members/Payments sections instead of copying entire Figma admin app | 6.H |
| `src/staff/Clubs.tsx` Deanship board/fee editor | `ClubsManagementPage.tsx`, `BoardAppointmentsPanel.tsx`, `ClubAdministratorsPanel.tsx` | Preserve improved GitHub classification, student lookup, board dates, 2 individual grants, real ILS/window fee editor; **do not restore** shared account/free-text candidate seed | 6.H |
| Deanship board coverage preview **missing in Figma** | extend `BoardAppointmentsPanel.tsx` | New coverage badge, term bounds, existing/prepaid coverage, Route A vs B action; Figma-style visual addition needs approval | 6.H |
| Deanship nominee queue/cash confirmation **missing in Figma** | extend Deanship board panel | New pending/qualified/expired row, 72h deadline, ILS quote, confirm special cash only, responsible account; no generic finance dashboard | 6.H |
| Nominee countdown **missing in Figma** | new matching panel inside student Dashboard | Own nominations, reason, dates, 72h remaining, method links, wait/processing/qualified/expired; API authoritative | 6.H |
| `src/pages/MembershipCard.tsx` | future card page | Membership number/source dates prepared now; full cards, photos/download Sprint 7 | 7 |
| `src/store.tsx`, `src/data.ts` | **not ported** | Read only to identify prototype states/actions. Replace all financial/state mutation functions with backend calls | 6.H |
| `src/App.tsx`, `src/staff/StaffApp.tsx` | current GitHub routing | Integrate payment and nominee subflows without replacing auth/protected routes | 6.H |
| `src/staff/Overview.tsx` | existing Deanship dashboard | Read-only actual membership aggregates only where approved and visually relevant; no payment approval interface | 6.H/11 |

### 9.3 Component state/interaction checklist
- Loading/skeleton, logged-out, ineligible, archived, registration upcoming/open/closed, missing fee config, no active membership, first-time/renewal, pending cash, pending online, processing, failed retryable, confirmed, past-expired, canceled, grace processing, late-refund-required.
- Student: wrong-club deep link, stale tab, duplicate click, exact quoted amount before payment, mobile responsive confirmation flow, accurate countdown after refresh, checkout return after callback not yet arrived, browser reload during processing, second device session.
- Club admins: no pending applicants, filters cash/confirmed/history, no reject, Confirm disabled while request in flight, already-confirmed response, actor/time history, two-device polling visibility, errors without losing queue state.
- Deanship: Route A direct creates appointment, Route B eligible but insufficient coverage, nominee search/dates, 14-day start/max-year, 72h countdown, exceptional fee, prepaid interval visualization, cash confirmation, online auto-qualify, expired/withdrawn, unavailable coverage with actionable date correction.
- Visual approval: compare Figma source and screenshots to rendered GitHub pages; note deliberate additions, no redesign without approval. Add bilingual/RTL only if actual approved design requires; don't invent.

---

## 10. Detailed stage-by-stage implementation plan

> **Implementation order:** each stage is a separate reviewable PR or atomic feature batch; run automated tests after **every feature**, not only sprint end. Source changes only after this document and deviation register are reviewed. Preserve both contributors' branch work; compare branch tips before merging and run migrations on each collaborator's database. Use migrations, never pretend a local dump changes the teammate's database.

### 6.A — Baseline, rule contracts, fixtures and migration safety
**Inputs:** original Sprint 6.1–6.6, Sprint 5 BR-01–30 and addenda, Sprint 3.5/4 deviation docs, current main code/schema, Figma Make components, user decisions and `sprint-6-logic-changes.md`.

1. Fetch latest `main`, `Lana`, `Zina`; record SHAs, uncommitted status and open PRs. Do not assume previous snapshot is current. Create `feature/sprint-6-*` branch from approved integration base; never implement directly on an ambiguous branch.
2. Extract source contracts into decision register, mark every deviation as approved, explicitly superseded or proposed technical default; version documents. Confirm real gateway unintegrated and fake-data Figma-only.
3. Lock: eligibility/current member/no duplicate, quote/fee-type, deadlines, 30-min online grace including early close, cash roles, special nominee exception, prepaid interval logic, 72h countdown, 14-day start, <=1-year term, no continuity grace, notification/audit handoff.
4. Draw simple ER relationships and transition table; request review on proposed enum/API/SQL designs. Clearly mark policy-sensitive defaults (online nominee grace, clock edge, future first-time impossibility) rather than quietly changing rules.
5. Inventory Prisma existing records/constraints/migrations, DB named indexes and PostgreSQL extension support. Create backup and clean test DB; capture schema diff; record current builds and test baseline (not reported from old docs as freshly passed).
6. Identify all React GitHub targets and Figma source paths in §9. Create UX deviations approval checklist for brand-new nominee controls and outdated Figma copy; keep future-sprint screens out.
**Test/exit:** design review signs state/permission matrix; migration backup restore demonstrated; existing API/web builds baseline captured; no code changes before authorization.

### 6.B — Database migration and repository service skeleton
1. Define Prisma enums/models/relations in §5 with exact names; add reverse relations, source FKs and safe nullable legacy fields. Review migration SQL manually.
2. Create database sequences for membership numbers; SQL partial uniqueness (live app, pending nomination, single confirmed payment, single live attempt); `CHECK` XOR payment target and kind-vs-nomination FK; membership overlap exclusion if extension supported.
3. Create ordered migrations with forward-safe data handling; assess legacy memberships and null-end-date board terms. **Do not mass assign historical paid membership or delete board rows.**
4. Run `prisma validate`, create migration in dev, generate Prisma 7 client; build API; `migrate deploy` in clean/cloned environment; inspect indexes/constraints via catalog queries.
5. Register application/payment/nomination providers and DTO placeholders in Nest module DI; avoid controller implementation until constraints validated. Introduce central Palestine-date, calendar-year, clock and money helpers.
6. DB tests: FK restrictions, optional payment target XOR, invalid/negative amounts, duplicate live app under concurrent transactions, duplicate membership number, overlapping interval reject, adjacent half-open intervals accept, legacy row preserved, rollback restore.
**Exit:** migration deploys from pre-Sprint-6 schema and clean schema; no breaking existing Sprint 5 pricing/window/board queries; raw PostgreSQL tests pass.

### 6.C — Membership applications and read state
1. Build application service with same student/club locking discipline; re-evaluate academic eligibility, active membership and registration availability at commit time using existing services. Derive student from JWT.
2. Quote first-time vs renewal using any confirmed membership; resolve correct frozen fee version; create application with 14-day/window deadline. Verify no duplicate live app and no early ordinary renewal.
3. Add `POST /clubs/:id/applications`, `GET /students/me/applications`, `GET /applications/:id`, club-admin scoped queue; pagination and authorization. Extend `GET /clubs/:id/eligibility/me` with `pendingApplication` and `ctaState` without breaking existing consumers.
4. Add safe synchronous deadline checks, deterministic `registrationModeAtSubmission`, `windowId`, quote snapshots; `GET` includes end reasons. Return same pending record on duplicate action as actionable 409; do not silently create a second app.
5. Test each route against: general/faculty/major eligible/ineligible; archived; active; pending; never-member; prior-confirmed-expired; 14-day; precise window; fee update; one-second-before/at deadline; student A cannot read B; concurrently double Apply.
**Exit:** stable persisted application lifecycle and accurate pending-CTA response; no payment yet and no invented membership.

### 6.D — Cash payments and membership activation
1. Create logical `Payment` and cash-selection controller; valid application can select cash; cash awaiting receipt. No student `confirmPaid`/claim endpoint.
2. Implement `PATCH /payments/:id/confirm` restricted to current club admin; use JWT account ID; verify exact club/method/amount/deadline/eligibility as required; transactional confirmation and membership insert, number generation and linkage.
3. Add confirmed-only membership reads needed by student and admin UI; historical confirmation actor/time. Keep Sprint 7 card generation out of scope.
4. Implement idempotent repeat confirm; lock competing two-admin requests; durable payment ref and app status. Confirm after expiry rejected; no generic Reject route.
5. Test: success, first/renewal, activation rolling 1yr, ILS decimals, unprivileged/wrong-club denial, second admin concurrent, double-click, late cash, archived club, duplicate membership, DB failure atomic rollback.
**Exit:** first complete real-DB money flow is functional, with safe concurrency and no fake Figma demo controls.

### 6.E — Simulated online provider, attempts, grace and retry
1. Define provider interface and simulated adapter with verifiable events; configure test-only simulation outcomes. Do not log raw card details; production gateway remains an empty adapter boundary/config template.
2. Build `POST /applications/:id/payments`, `POST /payments/:id/attempts`, `GET .../attempts/:attemptId`, verified callback path; bind amount/currency/provider/payment reference and expiration transactionally.
3. Implement attempt state machine: create before deadline, one unresolved attempt, success, failure, retry after definitive failure, unknown/outcome polling, idempotent callbacks, out-of-order events.
4. Implement +30m grace for already-processing online at 14-day/window cutoff; add early-close override `C+30m`, never accept new application or attempt after C. Respect earlier actual per-app cutoff; no cash grace.
5. Successful provider event updates Payment/Application/Membership and possible nomination in safe DB transaction. Late charge gets refund/reconciliation status; no membership; simulated refund can demonstrate logic but **must be labeled simulation**.
6. Test: success, failed then retry, two concurrent attempts blocked, duplicate callback, forged callback, amount mismatch, callback at D−1ms/D/D+29m59s/D+30m+, early close in-flight, inactive club, server restarts, callback after DB failure, simulated delayed settlement and reconciliation.
**Exit:** working simulated online path, trusted callbacks, retries and complete grace lifecycle; no real-gateway claim.

### 6.F — Deadline reconciliation and Sprint 5 lifecycle integration
1. Implement expiration service/background task for ordinary 14-day and windowed apps, nomination 72h, delayed attempts and grace. Keep Sprint 5 fee snapshot reconciler intact; use consistent DB time and locks.
2. Extend existing window `close`, `extend`, `mode` and archive mutation handlers to perform or trigger deterministic app updates. No reopening a closed window; no resurrection of past requests; freeze pending quoted price.
3. Handle early closure by canceling cash/unstarted apps, preserving already-processing online through 30m; list state correct immediately even before scheduler. Extension moves valid pending deadlines but not completed/expired records.
4. Reconcile late-provider success and refund-required without automatic membership; store reason and safe user notification. Archive and mode-switch policies must not accidentally grant unapproved grace.
5. Test: always-open+14d; open window close; extension; early-close race; canceled window; switch to already closed; simultaneous payment/cancel; 30-min exact boundary; no job dependency for authorization; expired reapplication and price change; history preserved.
**Exit:** consistent lifecycle independent of cron timing and earlier Sprint 5 functionality preserved.

### 6.G — Board qualification and Deanship nominee payments
1. Extend board DTO validation: mandatory new `endDate`; local start within 14 days; <= one calendar year; eligibility; existing overlap/president logic. Add read-only coverage preview and reusable interval-union helper.
2. Route A: direct board creation for full coverage; no nomination, no countdown. Existing history/public endpoint remains authoritative.
3. Route B: add nominee table/service, 72h deadline, Deanship creator, no permissions before qualified; allow student own nomination read and special application. Create nomination-linked historical fee snapshot from current authoritative configuration even if registration closed.
4. Implement nominee cash selection, Deanship restricted confirm and online payment; prepaid renewal starts at previous `expiresAt`, one calendar year later; overlap exclusion, coverage validation. If first-time payment cannot cover dates, return actionable date-adjustment outcome **before collecting money**.
5. Qualification internal DB operation verifies payment/coverage and creates official `BoardAppointment` exactly once. Existing assignments require official current board, not nominee. Modify appointment date edit service to recheck coverage; initial club+board creation must use same rules and not leak provisional admin access.
6. Nomination expiry and withdrawal; auto-qualify after verified online success; maintain actor attribution and source application. Prepare future Sprint 7 membership-dependent admin predicate with **migration gate**; do not activate unreviewed lockouts.
7. Test: direct qualified; never-member; prior-expired; partial current; prepaid adjacency; window closed special fee; no duplicate charges; nomination deadline; cash vs online confirmer; qualified idempotency; wrong Deanship scope; invalid dates, max 14d, max year; initial club creation; public leadership excludes pending; first-time future coverage rejection; historic admin preservation.
**Exit:** Route A and B work with safe paid coverage and no premature admin privileges; earlier board/club flows regressions pass.

### 6.H — Figma migration, browser integration and release closeout
1. For each §9 ledger row, compare source Figma prototype to existing GitHub page, list user-visible controls and data dependencies. Port related visuals precisely; do not replace already integrated Sprint 4/5 components. Record visual exceptions and seek approval for new nominee controls.
2. ClubPage: application modal and method selection; real pending/active/expired states; actual ILS/deadlines; Continue Payment; remove demo cash confirmation/expiry and three-day ordinary cash copy.
3. Student Payment: migrate Figma screen; safe simulator, async pending/status/failure/retry/success; 30m grace explanation, late refund-required status; no demo card autofill, no raw PAN/CVC to API.
4. Student Dashboard: applications/payments list, real active membership summaries, pending application CTA and new personal nomination card/countdown/methods; automatic refresh and empty states.
5. Club-admin Members/Payments/Overview: migrate only membership-related Figma sections; actual cash queue/confirmation; actor audit; both admins see updates without full reload; remove Reject; no fake event/expenses totals.
6. Deanship board panel: show coverage preview, Route A/B choice, provisional nominees, 72h deadline, exceptional cash confirm and prepaid interval visualization; preserve existing modern individual-account assignments and class eligibility, no Figma shared-account restoration.
7. Full browser run (desktop/mobile viewports): flows and accessibility keyboard/focus/loading/error, auth sessions, genuine network backend, two admin sessions; screenshot compare to Figma. Future membership card remains Sprint 7, event charges Sprint 9, full notifications Sprint 11.
8. Run API unit/integration and PostgreSQL concurrency suites, web build, browser E2E, migrations from scratch and existing snapshot; inspect no secrets/dummy data. Update docs and handoff, PR review, merge only when gating evidence exists. Provide instructions to partner for checkout, `.env` example (no secrets), `docker compose`, migrations, client generation and test runs.
**Exit:** user-approved appearance and actual end-to-end money flow, reviewed deviations, no unapproved future-sprint scope, migration/handoff complete.

---

## 11. Acceptance test matrix and evidence requirements

### 11.1 Must-pass scenarios
| ID | Test | Expected |
|---|---|---|
| T01 | Eligible `GENERAL`, `FACULTY_BASED`, `MAJOR_BASED` | Only matching active students can apply; existing service unchanged |
| T02 | Ineligible, archived, closed, scheduled window | No new application, clear CTA state |
| T03 | Already active member | `Already a Member`, ordinary POST blocked |
| T04 | Prior paid expired vs prior unpaid expired | Renewal fee for former only |
| T05 | Pending app exists | `Continue Payment` or `Awaiting Cash`, no duplicate POST |
| T06 | Fee changes after app | Exact old quote/currency/feeVersion preserved |
| T07 | Cash correct club / wrong club / Deanship ordinary | Only correct current club admin confirms |
| T08 | Two admins concurrently confirm | One payment, one membership number, first actor retained |
| T09 | 14 days elapsed cash | Expired; reapply when always open |
| T10 | Window closes cash | Canceled; no cash payment accepted |
| T11 | Window extended | Same pending app deadline extended; price unchanged |
| T12 | Old closed window/new window | No resurrection; new application required |
| T13 | Online successful within nominal deadline | Membership activated exactly once |
| T14 | Online failed then retry | Same app, distinct attempts, no duplicate charge |
| T15 | Forged/duplicate/out-of-order callback | Reject forged, idempotent repeat, no extra member |
| T16 | Processing at nominal cutoff, success +29m | Accepted |
| T17 | Success after +30m | No membership; refund/reconcile status |
| T18 | Early close while processing, success +20m | Accepted for pre-closure attempt |
| T19 | Early close while no attempt/cash | Canceled immediately |
| T20 | Start payment after early close | Rejected |
| T21 | Unknown bank response | No false failure/retry until safe status resolution |
| T22 | Direct board appointment sufficient coverage | Official appointment, no 72h nomination |
| T23 | Missing/insufficient coverage | Provisional nomination and 72h; no board/admin privilege |
| T24 | Nominee pays online | Provider success qualifies once, no second Deanship approval |
| T25 | Nominee cash | Only Deanship linked nominee confirmation; ordinary club unaffected |
| T26 | Prepaid renewal adjacent to existing expiry | No overlap, full board coverage, future not falsely active |
| T27 | Nomination expires unpaid | No board record; preserved history; dashboard expiry |
| T28 | Board start >14d; end missing; >1y | Validation rejected, no bypass via club creation |
| T29 | Inadequate future first-time coverage | No payment collection/qualification; edit dates |
| T30 | Existing board/admin historical data | No fabricated paid rows, no premature Sprint 7 lockout |
| T31 | Public leadership | Excludes nominees, includes qualified appointments in term |
| T32 | Real-money callback after DB failure | Verifiable event retried/reconciled, no double membership |
| T33 | Membership numbers | Unique under concurrency; card-ready |
| T34 | Two admin browser sessions | Queue syncs; stale confirm harmless and attributed |
| T35 | Visual Figma migration | Layout preserved, only necessary new controls, no demo buttons/data |
| T36 | Sprint 9 future payment link | Payment target XOR permits event FK but no event charge now |
| T37 | Leap-year, DST, midnight | Server cutoff, membership and board inclusive/exclusive math correct |
| T38 | Nominee fee with closed window | Current authoritative pending fee snapshotted; expired window price/history unchanged |
| T39 | Manual ending board | Existing `endedAt`/admin revocation preserved |
| T40 | Privilege matrix | Every protected endpoint rejects unauthorized roles/cross-club access |

### 11.2 Required test infrastructure and evidence
- Use **real PostgreSQL** (Docker test DB) for partial indexes, row locks, exclusion constraints, concurrency, extension fees and status. ORM mocks alone cannot prove transaction safety.
- Deterministic controllable clock/date tests; no sleep-based expiry tests. Include timezone fixtures for Palestinian DST, midnight boundaries, next-day closing and leap day.
- API JWT fixtures for student owner, another student, admin A/B same club, wrong-club admin, Deanship, supervisor and disabled account.
- Verify Figma migration via actual rendered browser, mobile/desktop screenshot comparisons and accessible controls; avoid relying on mock storefront alone.
- PR includes migration SQL, tests, API/response diffs, UI screenshots, demo path and observed CI status. **Historic Sprint 5 test claims are not current Sprint 6 evidence.**
- Exit gate: `prisma validate`, migrations deploy, client generate, API build/tests, web build/tests, critical E2E flows, security/permission matrix, review of outstanding `TODO`s in this document and team sign-off. No sprint "done" label until evidence is attached.

---

## 12. Future sprints and excluded features

| Sprint | Dependency/impact |
|---|---|
| 3–4 (existing) | Preserve atomic club creation, classification, board history and individual admin assignment. Extend validators; no shared login. |
| 5 (existing) | Fees, window snapshots, server timing and rolling one-year membership unchanged except explicitly approved nominee advance renewal and processing grace. |
| **6 (this work)** | Full application/cash/online simulation/expiry, new nominee membership exception and preparatory coverage checks. |
| 7 | Member lists/cards/photos/download, full paid-board/admin privilege enforcement **after existing-record transition**, show future prepaid versus active coverage; supervisor/Deanship member read scopes. |
| 8 | Effective club-admin permissions applied to event draft/submission; do not grant provisional nominees events management. |
| 9 | Payment module reused for paid event registrations; separate event deadlines, capacity and no seat for unconfirmed payments, refunds for cancellation as subsequently approved. |
| 10 | Attendance/certificates consume confirmed event registration; no direct Sprint 6 implementation. |
| 11 | Persistent notification engine/inbox for membership activation, expiry, nomination, payment, Deanship actions; replace minimal Sprint 6 status surfaces. Real dashboard statistics. |
| 12 | General audit log, detailed payment/actor accountability and hardening; current Sprint 6 fields retain provenance now. Android parity and deployment. |

**Not in scope:** whole Figma app migration; events approvals/registrations; attendance/certificates; full membership card issuance/download; general accounting, expenses/budget, refunds unrelated to late provider charge, a live bank integration without provider account, external notification service, WebSockets unless polling is inadequate, shared admin account, extra administrator grace after membership expires, generic future first-time scheduled activation engine, Deanship general cash-confirmation queue, manual eligibility approvals, normal cash rejection.

---

## 13. Explicit technical assumptions, tradeoffs and handoff sign-off

These are **implementation choices** needed for a concrete plan. They are not independent previously approved user policy; get team agreement while reviewing PRs. None justify silently contradicting approved rules.

| ID | Chosen technical default | Reason / gate |
|---|---|---|
| TA-01 | Use half-open memberships `[activatedAt,expiresAt)` and inclusive board dates converted to next-day boundary | Prevent overlap and midnight bug; test DST |
| TA-02 | 72h absolute nomination payment deadline | User specified three days; avoids ambiguous calendar interpretation; display accurately |
| TA-03 | 30m online grace for nominee deadline as with ordinary applications | **Not explicitly user-confirmed**; approve or disable before 6.E/6.G |
| TA-04 | Reject immediate first-time nominee payment when it cannot cover full term; adjust board dates or nominate closer to start | No general future-start membership engine requested; 14-day rule alone not enough |
| TA-05 | One live application per student/club across kinds | Simplifies duplicate-payment prevention; verify with nominee UX |
| TA-06 | Current pending `ClubMembershipSettings` fees are nominee authority in a closed window; snapshot into historical version | User approved current authoritative configuration, immutable fee provenance |
| TA-07 | Separate `PaymentAttempt` child, one unresolved attempt | Supports retry and delayed provider outcomes safely |
| TA-08 | Separate `BoardNomination` from `BoardAppointment` | Existing public board/admin queries assume appointments are official |
| TA-09 | Postgres exclusion constraint via `btree_gist` or equivalent lock/guard | Strict no-overlap at DB level |
| TA-10 | Poll membership queues every 5–15s + immediately on mutation/focus | Satisfies shared-view updates without unneeded socket infra |
| TA-11 | Unique membership number `CH-YYYY-NNNNNN` with DB sequence | Human readable and concurrency safe; public format may be changed by branding review |
| TA-12 | One calendar-year anniversary clamp on leap day | Avoid raw 365-day drift; fixture tests |
| TA-13 | Qualify board in transaction; payment-provider external outcome requires durable retry/reconciliation | Distinguishes DB atomicity from external banking |
| TA-14 | No auto-created admin grants upon qualification | Deanship already has separate two-slot administrator assignment workflow |
| TA-15 | Payment method change only prior to unknown/successful provider charge | Avoid duplicate money; requires safe UI messaging |
| TA-16 | Nominee’s three-day UI appears only for insufficient coverage; Route A direct | User explicitly approved |

**Explicit policy caution:** User asked that everything be finalized, yet *one actual semantic tension* cannot be eliminated by schema design: **an immediate one-year membership cannot cover a full one-year board appointment starting days in the future**. This document takes the smallest safe default (**reject/adjust, no special delayed first-time membership**) instead of pretending it can. Similarly, `TA-03` nominee-online grace is a labeled default, not a finalized user statement. These are recorded to avoid hidden implementation assumptions.

**Document sign-off checklist:** [ ] owner approves documented TA defaults and new Deanship nominee visuals; [ ] partner reviews full deviation register; [ ] Prisma/API code reviewed; [ ] baseline and all Sprint 6 tests actually run; [ ] migration on both contributors' dev DBs; [ ] GitHub PR merged; [ ] Figma fidelity signed off. Until then use **PLANNED**, not IMPLEMENTED.

---

## 14. Source and decision traceability
- Original 12-sprint plan: `docs/clubs-platform-sprint-plan.md`, Sprint 6.1–6.6; Sprint 7, 9, 11, 12 follow-ons.
- Approved prior behavior: `docs/sprint-5-membership-specifications.md` BR-01–30, §§3, 9–12; `docs/sprint-5-architecture-closeout.md`; `docs/sprint-logic-changes.md`.
- Current Prisma and code: paths listed §1.3. `ClubAdminAssignmentsService.assertCanManageClub()`, `BoardAppointmentsService.create/update/end()`, `ClubsService.getMembershipQuoteForAccount()` and window close/extend are primary extension points.
- Figma Make visual source: `https://www.figma.com/make/n1jp7qLNGPogwxWy0lVVg0/University-Club-Hub-Interface` and file list in §9. Prototype's `src/store.tsx` is **not** live backend.
- Companion authoritative deviations and withdrawn designs: [`sprint-6-logic-changes.md`](./sprint-6-logic-changes.md). Every supersession of original plan/Sprint 5 is recorded there.

**Final rule:** build incrementally on established ClubHub architecture, inspect and test every feature before merging, never equate a payment simulation with live banking, never equate a provisional nomination with official board membership, and never rewrite the original 12-sprint plan.
