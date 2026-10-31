# ClubHub — Sprint 5 Membership Specifications & Implementation Guidelines

**Decision baseline:** 28–30 October 2026  
**Status:** Business rules agreed (including final fee-window continuity decisions); detailed Prisma/API design remains **proposed until final contract approval**; implementation **not started**.  
**Target repository location (when approved):** `docs/sprint-5-membership-specifications.md`  
**Reference documents:** `docs/clubs-platform-sprint-plan.md`, `docs/sprint-logic-changes.md`, `docs/data-integration-tracker.md`  
**Design authority:** Existing Figma Make ClubHub interface. Do not redesign or invent screens, fields, outputs, or behaviors without approval.

> **Read this before each Sprint 5 implementation stage.** This document consolidates the decisions made in the Sprint 5 planning discussions. It intentionally overrides conflicting *membership* assumptions in the original sprint plan, while retaining the Sprint 3–4 architecture. Proposed technical names/contracts are marked **PROPOSED** and must not be confused with confirmed behavior.

## 1. Scope, authority, and non-goals

- **Sprint 5 scope:** Membership configuration, registration availability, club fees, historical pricing design, membership data foundation, eligibility + quoted price checks, and integration of the corresponding existing Figma controls and student-facing membership panel.
- **Sprint 6 scope:** Persist applications, payment records, in-person/online confirmation, cancellation/expiration processing, and transactional membership activation. Sprint 5 must plan for these without simulating or prematurely exposing a working payment flow.
- **Sprint 7 scope:** Membership cards, member lists, and enforcement/migration of the rule that board members and club administrators require active paid membership.
- **Out of scope until explicitly agreed:** Real payment gateway choice, event payment unification, financial dashboards/expenses, early renewal, a new UI layout, new privileges for club administrators.
- **Who decides:** Deanship configures membership fees and registration availability. Club administrators **cannot** change either. Student or visitor reads are scoped appropriately. API authorization must enforce this, not just the UI.
- **Delivery gate:** Do not edit Prisma, backend, frontend, or GitHub until the user explicitly authorizes implementation. A local planning document is not approval to implement.

## 2. Decisions — authoritative business rules

| ID | Topic | Confirmed rule |
|---|---|---|
| BR-01 | Membership activation | An application does **not** grant membership; membership begins only when payment is confirmed. |
| BR-02 | Membership duration | Every confirmed membership is valid for **one year from its activation/payment-confirmation moment**, irrespective of academic calendar or registration-window dates. |
| BR-03 | Fee types | Each club has a **first-time** membership fee and a **renewal** fee. |
| BR-04 | Renewal identity | A student who **ever** held a confirmed membership in the **same club**, even years ago, receives its renewal price; otherwise first-time price. Mere previous applications do not qualify. |
| BR-05 | Early renewal | **Not allowed** while the student has an active membership; reconsider only through a new approved change. |
| BR-06 | Mandatory prices | Club creation must require configured first-time and renewal fees, both **greater than zero**. No zero-fee memberships. |
| BR-07 | Fee ownership | **Deanship only** creates or changes fees, in the existing Create Club and Club Management Detail interfaces. |
| BR-08 | Fee continuity | Fees persist as the club's configuration across years; there are **no new per-academic-year fee settings** by default. |
| BR-09 | Windowed fee change | If a window is currently open, changing the club's prices does **not** change prices for that window; new fees take effect in the **next registration window**. Changes made before a future window opens apply to that upcoming window. |
| BR-10 | Always-open fee change | When applications are allowed year-round, a price update affects **new applications immediately**. |
| BR-11 | Application price | Every application retains the price quoted at application time. Later fee edits never reprice already submitted applications. |
| BR-12 | Registration policies | Each club is either **always open** or has a **Deanship-configured registration window**. The Deanship can schedule new windows, extend an **active** window, or close it; **a closed window cannot be reopened**. |
| BR-13 | Window closure | Students cannot submit applications after a window closes; unpaid pending applications are canceled, not left pending. |
| BR-14 | Window-based payment deadline | Payment must be confirmed before the window closes. An extension of the *same* window extends existing pending applications' payment deadlines. |
| BR-15 | Early closure | Closing a window early cancels unpaid pending applications immediately. |
| BR-16 | Always-open payment deadline | Pending applications expire **14 days after submission** if payment is not confirmed. |
| BR-17 | Policy switch | Switching an always-open club to a window that is **already closed** immediately cancels all unpaid pending applications. |
| BR-18 | Reapplication | Once an application is canceled/expired, a student may apply again if still eligible and registration is open; a **new** application is created. |
| BR-19 | Historical records | Canceled applications and past memberships remain in storage; cancellation means no longer pending, **not hard deletion**. |
| BR-20 | Board member requirement | Board members and club administrators should hold active, confirmed paid membership in their own club. |
| BR-21 | Board suspension | If the student has no active membership, keep their board appointment and administrator assignment records, but **suspend effective board/administrator privileges**. Restore them automatically when membership becomes active again, provided the appointment/assignment is otherwise current and valid. |
| BR-22 | Existing board records | Do **not** abruptly invalidate current Sprint 4 appointments before membership functionality exists; first build membership/payment lifecycle, then introduce enforcement with a deliberate existing-data transition. |
| BR-23 | No academic period | **Do not** implement a university-wide `MembershipPeriod` as the membership validity clock. Membership is rolling per student and club, one year from activation. |
| BR-24 | Visual fidelity | Connect existing Figma controls and screens to real data; remove demo behavior and hardcoded records without changing the approved layout. A proposed small rearrangement is deferred to sprint end and requires separate approval. |

| BR-25 | Pending fee edits | A windowed club has **one logical editable next-window fee configuration**. Repeated Deanship edits before activation **replace** the previous pending amounts (latest edit wins); they do **not** queue several future fee changes. |
| BR-26 | Fee lock boundary | For windowed clubs, the **latest pending** first-time and renewal fees are captured **when a new window first becomes active**, not when a future window is merely scheduled. Those effective prices never change during that window. |
| BR-27 | Active extension only | Extending a window is permitted **only while it is actively open and not early-closed**. It updates the same window record and the payment deadlines of its still-pending applications; it keeps the window's locked fee version. |
| BR-28 | Closed window is immutable history | A window closed by time or Deanship action **must not be reactivated, reopened, or extended**. Any later opportunity is a **new window with a new ID**, and it locks the latest pending fee configuration on opening. |
| BR-29 | No application resurrection | A new window does not restore canceled or expired applications from previous windows. Students must reapply under the new window and receive its effective fee. |
| BR-30 | Timing is server-authoritative | Whether a window is active, closed, or merely scheduled is determined from server-side time and persisted closure state; UI claims and stale forms cannot override this. |

### Clarifications on terminology

- **Registration window** = when applications and, for windowed clubs, payment confirmation are permitted.
- **Application** = request awaiting or recording a payment outcome; it is **not** membership.
- **Membership** = official historical/active record created upon confirmed payment.
- **Membership expiration** is unrelated to the registration window and starts from activation, not application submission.
- **Cancel** unpaid application ≠ delete it from the database.
- **Suspend** administrator privileges ≠ revoke their assignment; **end** board appointment ≠ expire membership.

## 3. Core lifecycle rules and examples

### 3.1 Membership price decision

1. Confirm authenticated `STUDENT`, active account, target club active, and current eligibility using the **existing** `ClubEligibilityService`.
2. If already an active member of the club: no new application and no early renewal.
3. If there is already a pending application for that student/club: expose its state and payment deadline instead of silently creating a duplicate.
4. Check whether the club's registration policy currently accepts applications.
5. Determine renewal when **any previous confirmed membership for that student and club** exists, even expired several years ago.
6. Quote the corresponding effective club/window fee and preserve that exact amount on the eventual application.
7. Never classify previous **unpaid/canceled** applications as prior membership.

### 3.2 Application deadline

| Policy at application | Deadline | On expiry or closure |
|---|---|---|
| Always open | Application submission time + 14 days | Cancel unpaid application; can reapply while open |
| Window open | Current registration-window closing instant | Cancel unpaid at close |
| Window extended | Existing pending applications' deadlines become the extended closing instant | Remain payable during extension |
| Window closed early | Immediate | Cancel unpaid immediately |
| Always-open switched to already-closed window | Immediate | Cancel unpaid immediately |

**Examples (illustrative, not fixture data):**
- Always-open: apply 5 November; payment due 19 November. If confirmed 10 November, membership expires **one year after 10 November's confirmation instant**.
- Window 1–30 November: apply 5 November; Deanship extends closing to 15 December on 25 November; existing pending application's deadline extends to 15 December.
- Window opening 1 November: price changed 28 October applies to that upcoming window; price changed 5 November does not alter that window or its submitted applications.

**Security / race-condition requirement:** Backend payment confirmation must re-check non-canceled application state, applicable deadline, club/window availability, confirmed amount, and authorization inside a concurrency-safe transaction. A payment arriving after the deadline or simultaneous with closure must not activate membership incorrectly. Record the real transaction outcome, not frontend optimism.

### 3.3 Board / administrator suspension

**Existing Sprint 4 design:** `BoardAppointment` stores scheduled start/end plus optional `endedAt`; `ClubAdminAssignment` stores grant/revocation and links to a board appointment. Administrator identities are real `STUDENT` accounts, not shared `CLUB` logins.

**Future effective-access predicate:** valid student account + still-current board appointment + unrevoked linked admin assignment + **active confirmed membership in same club**. Suspension is computed from this predicate, **not** by setting `endedAt`, `endDate`, or `revokedAt` when membership lapses.

| Board/membership state | Appointment stored | Effective board role | Administrator access |
|---|---|---|---|
| Current appointment + active membership | Yes | Active | Allowed if valid grant |
| Current appointment + no membership | Yes | Suspended | Denied |
| Current appointment + expired membership | Yes | Suspended | Denied |
| Renewed membership + still-current appointment/grant | Yes | Restored | Restored |
| Scheduled-future or expired appointment | Yes | Not current | Denied |
| Manually ended appointment | Yes, history preserved | Ended | Grant revoked under existing Sprint 4 rules |

**Phased delivery:** Do not enforce the new membership predicate against preexisting board members until Sprint 6 activation and the Sprint 7 transition plan; do not fabricate payments or backfill paid membership without a decision.

## 4. Reuse existing platform architecture — do not regress

| Concern | Existing source / constraint | Sprint 5 implication |
|---|---|---|
| Identity | `UniversityStudent` and `Account` | Choose FK to canonical student identity deliberately; don't create duplicate people |
| Eligibility | `Club.classification`, `Club.facultyId`, `ClubEligibleMajor`, `ClubEligibilityService`; `GET /clubs/:id/eligibility/me` | Extend, do not replace eligibility engine |
| Board | `BoardAppointment`, `ClubAdminAssignment` | Preserve dated roles, manual ends, and assignment history |
| Administrator authentication | Individual `STUDENT` accounts with board-linked assignments | Never assume shared `CLUB` account; Deanship-only fee/window writes |
| Club life cycle | `Club.status` active/archived | Archived clubs reject new applications |
| Existing events | `Event`, `EventRegistration`, existing event-related payment status fields | Do not inadvertently mix event registration prices with membership fees |
| API paths | Existing web calls use `/api/...` via Vite proxy | Verify actual Nest routes before specifying exact final API paths; don't blindly force original `/api/v1` |
| Data conventions | Prisma/PostgreSQL, UUID relations, timestamps, existing migration history | Additive, testable migrations; no destructive reset |

## 5. Proposed data model — pending technical approval

The following are **candidates**, not authorized Prisma migrations or final table names:

| Candidate model | Proposed purpose | Essential data / constraints to design |
|---|---|---|
| `ClubMembershipSettings` | One club's registration policy | Club FK unique; `ALWAYS_OPEN` vs `WINDOWED`; Deanship-controlled |
| `ClubMembershipFeeVersion` (with one editable pending configuration) | Persist positive first-time/renewal prices, effective changes, historical prices | Club FK; positive `Decimal`; version/effective-from; prevent mutation of historic quoted amounts |
| `ClubRegistrationWindow` | Retain successive date windows and prices applicable to each | Club FK; start/end instants; no accidental overlap; price snapshot or fee-version FK; closure metadata |
| `MembershipApplication` (Sprint 6) | Pending/confirmed/canceled applications | Student FK; club FK; optional window FK; fee type; quoted amount + currency; submission/deadline/status; historical cancellations; duplicate-pending guard |
| `Membership` (model may be prepared Sprint 5; activated Sprint 6) | Confirmed membership history and renewal basis | Student FK; club FK; application/payment provenance; activatedAt, expiresAt; no overlapping active memberships per student/club |
| `Payment` (Sprint 6) | Manual/online payment verification | Exact application FK, amount, status, confirmer, timestamps, idempotency; online-provider trust and callback verification |

**Not the original plan:** Do **not** build `MembershipPeriod` to define a common academic expiration date or `ClubFee` per university-wide membership period. Rolling expirations and historical fee versions/windows replace those assumptions.

**Technical constraints to finalize before migration:** canonical student FK (`UniversityStudent` vs `Account`); exact duration/calendar arithmetic (leap-day anniversary), timezone and inclusive/exclusive closing instants; status enum naming; database-safe single-active-membership and single-pending-application rules; positive-decimal validation; price-version effective-date rules; concurrent updates; historical reporting/audit strategy.

### Conceptual relationships (not executable schema)

```text
Club ──1:1── ClubMembershipSettings
  │
  ├──1:N── ClubMembershipFeeVersion
  ├──1:N── ClubRegistrationWindow ──1:N── MembershipApplication
  ├──1:N── MembershipApplication ──N:1── UniversityStudent
  └──1:N── Membership ──N:1── UniversityStudent
                           │
MembershipApplication ─────┴──> Membership (on confirmed payment only)
MembershipApplication ──> Payment(s) [Sprint 6, cardinality to be decided]
BoardAppointment ──> effective membership check by club + student [Sprint 7]
```

## 6. Proposed API surface — mapping, NOT accepted route contract

Validate actual NestJS controller prefixes and existing implementation before approving these names. Preserve the already working `GET /clubs/:id/eligibility/me` route.

| Proposed responsibility | Caller | Required protection / behavior |
|---|---|---|
| Read current club membership configuration/prices | Public or authenticated, depending on personal data | Only publish nonprivate pricing/window dates; do not reveal students |
| Create club with required fees and registration controls | Deanship | Atomic create; reject missing/nonpositive fees; don't persist UI-only placeholders |
| Update club fee configuration | Deanship | Window-aware activation and immutable historical quotes |
| Open, close, extend, or replace registration window | Deanship | Expire/cancel pending requests or extend deadlines as agreed; audit effects |
| Check my eligibility and price (`GET /clubs/:id/eligibility/me`) | Student | Existing eligibility result + personalized membership/application/fee state; no duplicate checker |
| Submit application (Sprint 6) | Student | Atomic validation of eligibility, window, membership, duplicate pending application, snapshotted price |
| Confirm payment (Sprint 6) | Authorized club admin / trusted online provider | Confirm only within deadline; atomic membership activation; idempotent; scoped access |
| Expire unpaid applications (Sprint 6) | Scheduled job + synchronous request guards | Cancel on deadline, early closure, policy switch; never rely on the job alone for security |
| My applications, memberships, payments (Sprints 6–7) | Student | Own records only; canceled history remains visible as history, not as pending |

**Open technical choice:** A payment confirmation performed by a currently suspended club admin may be forbidden once the new membership-based authorization rule is enforced. Design the transition so that someone authorized can still confirm in-person payments; do not grant privileges to bypass suspension without explicit product approval.

## 7. Figma-to-application integration checklist

**Design rule:** The Figma Make source is the authority for layout, content hierarchy, interactive affordances, and states. The **backend is the authority for data and business behavior**. Demo objects, simulated store functions, and dummy counts must not appear as live production information. Do not rearrange layouts during Sprint 5; the user's optional cosmetic rearrangement is deferred until sprint-end review.

| Surface | Repo path / Figma area | Checklist | Sprint boundary |
|---|---|---|---|
| Deanship Create Club | `apps/web/src/staff/ClubsManagementPage.tsx`; Figma Create Club popup | Existing `firstFee`, `renewalFee`, `windowEnabled`, `windowStart`, `windowEnd` states **must be persisted and validated**; preserve other atomic create club/board/admin behavior | 5 |
| Deanship Club Management Detail | `apps/web/src/staff/ClubManagementDetailPage.tsx` | Load real current fees/policy, edit Deanship-only, show saved result and errors; retain exact placement until approved rearrangement | 5 |
| Student club page | `apps/web/src/pages/ClubPage.tsx`; Figma `src/pages/ClubPage.tsx` | Purple membership panel: visitor sign-in; ineligible; eligible first-time/renewal price; pending; active member; closed window; canceled application history where designed; render real server state | Pricing/states 5; apply/payment 6 |
| Club cards/directory | `apps/web/src/components/ClubCard.tsx`, `pages/Clubs.tsx` | Visitor has no private badges; eligible has no badge; member/pending/ineligible show correct conditional badges only if authenticated | 5–7 |
| Student dashboard | `apps/web/src/pages/Dashboard.tsx` | No invented active membership/pending payment numbers; later connect to membership/application APIs | 6–7, 11 |
| Figma payment and membership card | `src/pages/Payment.tsx`, `src/pages/MembershipCard.tsx` | Retain design reference; do not wire fake payment success or issue fake active cards | 6–7 |
| Club admin members/payments | `apps/web/src/staff/ClubAdminDashboard.tsx`; Figma `src/admin/Members.tsx`, `Payments.tsx` | Existing GitHub dashboard is mostly placeholder; future real scoped list and confirmation; administrators cannot change fees/windows | 6–7+ |
| Deanship/board management | `BoardAppointmentsPanel.tsx`, `ClubAdministratorsPanel.tsx`, board services | Preserve current boards and grants; later show suspended vs ended without unapproved design alteration | 7 / authorized follow-up |

**Required visual/state coverage:** visitor, eligible first-timer, eligible returning nonmember, pending application, active member, ineligible student, closed window, no configured data (should not occur for newly created clubs), canceled application; responsive layout, loading, error, and empty states. No personalized eligibility shown to visitors.

## 8. Implementation plan (feature-sized, not baby steps)

| Stage | Purpose | Exit criteria |
|---|---|---|
| **5.A — Technical contract** | Approve Prisma relations and constraints, effective fee versioning/windows, clock/timezone rules, DTOs, roles, transitions | User approves technical architecture; no guesses |
| **5.B — Membership configuration** | Add club fee + registration settings persistence, create-club atomic integration | Mandatory fees, policy validated, migration & tests pass |
| **5.C — Deanship management** | Connect existing create/detail Figma controls to live API | Changes persist, refresh correctly, exact layout retained |
| **5.D — Fee/window history** | Price effective rules, historical windows, extensions/closure interfaces | Mid-window edits do not reprice, next window uses new fees, always-open fees change immediately |
| **5.E — Read-only membership foundation** | Historical membership representation and personalized price/eligibility endpoint | Renewal based on confirmed history, no application or payment simulation |
| **5.F — Student/UI integration** | Real club panel, directory statuses, any current-sprint supported surfaces | UI/API consistent for visitor and student states, no fake memberships |
| **5.G — Verification & architecture closeout** | API/frontend tests, migration verification, full model inventory and diagram | Tests and Figma checks pass; complete ERD with PK/FK and relations; approved PR evidence |

**Post-Sprint 5 dependencies:** Sprint 6 builds the application/payment/membership activation path; Sprint 7 enforces active membership for board/admin and reconciles pre-existing board records.

## 9. Test matrix and invariants

### Membership and price

- First-time student with no confirmed membership sees first-time price.
- Student with expired confirmed membership from years ago sees renewal price.
- Canceled/never-paid application does **not** qualify for renewal price.
- Active member cannot apply/renew early.
- Ineligible, archived-club, disabled-account, visitor, and no-registration states are enforced in the backend.
- New club cannot save with absent, zero, negative, or malformed fees.
- Only Deanship can create/edit fee or window settings.
- Historical submitted applications keep quoted amount and currency after any later price edit.

### Fee version/window

- Changing fees during an open window preserves the active window's fees and applies new values to the next window.
- Changing fees before a future window opens applies to that upcoming window.
- Always-open price edits apply to new applications immediately, not existing requests.
- Window extension updates all still-pending payment deadlines for that window.
- Window closes at its defined instant: pending applications become canceled; payment is refused.
- Early close/policy switch to already-closed window cancels unpaid requests immediately.
- Always-open pending applications expire after 14 days; canceled students can reapply with a new application ID.
- Duplicate requests, simultaneous confirmation/closure, repeated payment callbacks and repeated expiry jobs do not create duplicate memberships or contradictory states (Sprint 6).

### Membership + board

- Membership expiry computed from actual confirmed activation + one year, not registration date/year.
- When membership expires, board appointment/assignment records remain unchanged and effective access becomes suspended (Sprint 7).
- When membership activates again, effective access resumes only if board term is current and assignment is unrevoked.
- Manual board end still ends the appointment and revokes linked grants under existing Sprint 4 behavior.
- Existing board appointments are not silently destroyed or assigned fabricated payments during transition.

### Web verification

- Compare relevant screens with exact Figma Make source/layout; no speculative redesign.
- Test all authorized student states, visitor states, and responsive modes.
- Confirm frontend values derive from backend; no demo state or fabricated totals.
- Verify loading/error/empty and navigation behavior; ensure API failure is not displayed as absence of a membership.

## 10. Outstanding **technical** decisions (do not guess)

Business rules above are confirmed, but these implementation details need explicit resolution before relevant code is written:

1. **Calendar/time convention:** official university timezone, exact close-of-window boundary, activation anniversary timestamp, leap-day birthdays/anniversaries, and daylight-saving handling.
2. **Effective-price implementation:** business behavior is settled (BR-25–29); finalize physical storage/constraints for one pending configuration, frozen window prices, and published vs scheduled versions. Scheduled windows must not lock price prematurely.
3. **Registration window modifications:** how to handle a shortened-but-still-open window's pending deadlines (consistent with the rule that pending payments are bounded by closing time, but clarify if necessary).
4. **Access transition:** how existing board members get legitimate paid membership history before enforcing suspension and how the Deanship will see temporarily suspended board entries without an unauthorized Figma redesign.
5. **Payment provider/security:** Sprint 6 implementation choice; which trusted actor can confirm in-person payments when administrators are suspended; handling a verified online payment after a cutoff (reconciliation/refund policy), not automatic membership grant.
6. **Membership photos/cards:** Sprint 7 rules not yet decided; do not fold into Sprint 5.
7. **Precise endpoints/DTOs/enum names** remain proposed until inspection against actual controllers and approved API design.

## 11. How to use and update this file

- At the start of every implementation stage, review **§2 decisions**, **§4 existing architecture**, **§7 affected UI**, **§9 tests**, and **§10 unresolved technical details**.
- Every pull request should state which `BR-XX` rules it implements; link relevant tests/migrations and any deliberate design differences.
- Do not silently change business decisions. Append a dated change record, mark **Proposed → Approved → Implemented → Verified**, and keep original decision history.
- Keep the original 12-sprint plan unchanged; treat this document as the **Sprint 5-specific companion specification** and reference it from the sprint logic change log once approved.
- At Sprint 5 closeout, generate a full database ERD **from the actual migrated Prisma schema**, showing every model/table, PK, FK, cardinality, junction table, unique index, and newly added membership structures. Never present a speculative ERD as implemented.

### Change log

| Date | Status | Note |
|---|---|---|
| 2026-10-28 | Business rules confirmed; technical proposal pending | Consolidated rolling one-year memberships, window-based/always-open registration, fee effective rules, cancellation/reapplication, and suspend-not-revoke board/member requirements from planning discussions. No implementation changes. |


---

## 12. Approved addendum — price staging, effective windows, and historical integrity (30 October 2026)

**Authority:** BR-25–30 above are confirmed behavior and supersede any earlier wording suggesting a closed window may be *reopened* or a future window must lock fees upon scheduling. The **implementation representation** below remains a technical proposal to be approved before migrations.

### 12.1 Window state semantics

| State | Source-of-truth rule | Legal change | Fee treatment | Unpaid applications |
|---|---|---|---|---|
| `SCHEDULED` | Opening instant in future, not canceled/closed | Reschedule/cancel under Deanship policy; never treat as already open | Read *latest pending* configuration at opening, not at creation | Cannot apply yet |
| `OPEN` | `opensAt <= now < closesAt` and no early closure | Extend `closesAt` into future; close early | Fees **frozen on first opening** | Eligible to submit/pay before deadline |
| `CLOSED` | End instant reached OR early `closedAt` recorded | Read historical record only; cannot extend/reactivate | Immutable historical window prices | Pending unpaid applications canceled |

**Explicit continuity examples** (dates/ILS are explanatory, not seed records):

1. Window `W1` opens November 1–30 with fees **30 / 20**. On November 5, 10 and 18 Deanship changes next-window fees to **40 / 25**, **50 / 35**, then **45 / 30**. `W1` remains **30 / 20**; only the **latest** unapplied pair **45 / 30** remains pending.
2. On November 15, Deanship extends still-open `W1` through December 15: **same `W1` ID**, same **30 / 20** price, extend **still-pending** applicants' deadlines. Edits to pending pricing continue to target the *next* new window.
3. If `W1` instead closes November 30 and on December 10 Deanship schedules/starts availability, it is **`W2` with a fresh ID**. On first opening it captures the then-current pending pair; `W1` and its canceled applications stay historical.
4. If pending amounts are revised four times *after* `W1` closes but *before* `W2` opens, the **fourth/current pending values** are locked for `W2`. There is no chain of queued future prices.
5. A scheduled `W2` must **not** freeze prices at scheduling time. Changing the pending settings before its opening affects the fees `W2` will lock. After it opens, subsequent changes target `W3`.
6. For `ALWAYS_OPEN` clubs, there is no deferred next-window price: a Deanship fee change applies immediately to **new** applications, retaining historical effective versions and the quoted amount on old applications.

**No revival:** An early-closed window stays closed even if its original `closesAt` lies in the future; an attempt to extend after closure must result in creating a new window, not changing its ID or `closedAt`. Reopening registration does not reactivate canceled payment records or old pending applications.

### 12.2 Price persistence and the one-pending-slot invariant

The approved *business* requirement is **one editable next-window price slot per club**, not one new waiting version per button click. A practical candidate design is:

- `ClubMembershipSettings` (1:1 with `Club`): `registrationMode`, `pendingFirstTimeFee`, `pendingRenewalFee` **or** a reference to a single mutable draft configuration. Only Deanship can edit it. **Alternative**: one `ClubMembershipFeeVersion` record marked `PENDING`, updated in place; use a partial unique index so there is at most one `PENDING` record per club. **Choose one physical design before migration; do not implement both accidentally.**
- `ClubMembershipFeeVersion` (1:N from `Club`): immutable **effective** price snapshots for windows and always-open changes; `id`, `clubId`, positive `firstTimeFee`, positive `renewalFee`, `currency`, `effectiveAt`, `createdAt`, `createdById`. The effective records are append-only (do not update historical prices). If using a mutable `PENDING` row, keep it unreferenced by locked windows and convert/copy it atomically on activation.
- `ClubRegistrationWindow` (1:N from `Club`): `id`, `clubId`, `opensAt`, `closesAt`, `closedAt?`, `effectiveFeeVersionId?`, timestamps. A `SCHEDULED` window has no locked fee version; one must be locked at first transition to `OPEN`. A `CLOSED` window retains its locked fee version and chronology. Reject overlaps and attempts to resurrect closed windows.
- `MembershipApplication` (Sprint 6): `quotedAmount` and currency are immutable after application submission. It also records `feeVersionId` and optional `registrationWindowId`. Do **not** calculate the payment amount from today's fee configuration during confirmation.

**Critical design nuance:** If `ClubMembershipFeeVersion` itself holds the pending row, repeated edits should update that **single unreferenced pending row**; changing it is safe only while it is *not* applied to a window or application. Once it is effective, preserve it and create/retain the next editable pending slot separately. This avoids contaminating history. The physical uniqueness and immutable effective-row protections must be enforced with database constraints and transactional writes, not UI state alone.

**Atomic first-open behavior:** Window opening may be recognized lazily on the first request or by a job; either way the operation must transactionally (a) verify window state, (b) select the latest pending fee values, (c) persist one immutable effective version, and (d) attach it to the opening window. Two concurrent requests must not lock two different fee versions for the same window. Use a row lock/serializable transaction or an equivalent concurrency-safe strategy. A cron job is a convenience, **not** the only correctness gate.

**Mandatory creation rule:** The Create Club API must commit a club with strictly positive first-time and renewal prices and its initial registration mode/configuration **atomically** with the existing Sprint 3 club/board/admin transaction. Existing clubs created before these rules need an explicit data-migration/backfill plan; do not fabricate historical prices.

### 12.3 Window edit API semantics (proposed, not route approval)

| Requested operation | Preconditions | Atomic effects | Failure / history rule |
|---|---|---|---|
| Schedule a future window | Deanship, club windowed, valid future dates, no conflicting window | Insert `SCHEDULED` row without locked fee | Do not steal current window's fees |
| Begin scheduled window | Server time reached opening; not closed | Lock latest pending fees exactly once, mark effective | Two simultaneous opens must produce one locked version |
| Extend current window | Already `OPEN`; new end later than existing end and after now | Update **same** `closesAt`; update **still-pending** application deadlines to new end | Never rewrite `opensAt`, fee version, or canceled applications |
| Close early | Already `OPEN` | Set `closedAt` and cancel all unpaid pending applications in one transaction | Keep history and quoted fees |
| Window reaches natural close | `now >= closesAt` | Treat as `CLOSED`; expire unpaid pending applications idempotently | Deny payment even if expiry job hasn't run |
| Request a window after closure | No active window / prior `CLOSED` | **Create new window**, fresh ID; use latest pending prices at first open | Do **not** alter last window's ID, closing data, or payment state |
| Change fee while window `OPEN` | Deanship | Replace one pending pair, latest value wins | Current `effectiveFeeVersionId` untouched |
| Change fee between windows | Deanship | Replace pending pair | Future scheduled window takes latest pending fees only on opening |
| Change fee when `ALWAYS_OPEN` | Deanship | Publish new effective version immediately | Old application quotes and versions stay untouched |
| Change always-open to already-closed window policy | Deanship, explicit policy change | Cancel outstanding unpaid applications immediately | No retroactive paid membership cancellation |

**Unresolved technical edge cases, deliberately not invented:** behavior for shortening an already-open window, changing from windowed to always-open while applicants are pending, scheduled-window deletion, and payment-provider settlement arriving after an early close. Present these for approval before writing mutation endpoints if required.

### 12.4 API/DTO contract sketch (all routes are PROPOSED)

Use the existing NestJS `/api`-proxied path convention, existing JWT guards, DTO validation and ownership logic. Confirm real prefixes/controller registration before accepting routes.

| Method | Candidate route | Role | Payload / response obligation |
|---|---|---|---|
| `GET` | `/clubs/:id/membership-settings` | Public read subset; Deanship full settings | `registrationMode`, current/scheduled availability, published first/renewal amounts; never expose pending Deanship-only edits publicly |
| `PUT` | `/clubs/:id/membership-settings` | DEANSHIP | Update registration policy with explicit transition intent; version checks to prevent stale writes |
| `PUT` | `/clubs/:id/membership-fees` | DEANSHIP | Positive decimal `firstTimeFee`, `renewalFee`; staging behavior based on current mode/window |
| `GET` | `/clubs/:id/membership-fees/history` | DEANSHIP | Historical effective versions with window associations; pending shown separately |
| `POST` | `/clubs/:id/registration-windows` | DEANSHIP | Schedule/create new window with `opensAt`, `closesAt`; no reopening historical ID |
| `PATCH` | `/clubs/:id/registration-windows/:windowId/extend` | DEANSHIP | Active-only extension; return updated end and number of pending deadlines adjusted |
| `PATCH` | `/clubs/:id/registration-windows/:windowId/close` | DEANSHIP | Active-only closure; return window status and canceled count |
| `GET` | `/clubs/:id/registration-windows` | DEANSHIP | Scheduled, active, historical windows; actual effective fee info where locked |
| `GET` | `/clubs/:id/eligibility/me` | STUDENT | Preserve existing eligibility reason and extend with effective price, `FIRST_TIME`/`RENEWAL`, application/membership availability state; don't leak other students |
| `POST` | `/clubs/:id/applications` | STUDENT / Sprint 6 | Check eligibility, fee, window, active membership, duplicate pending; snapshot quote and deadline |
| `GET` | `/students/me/applications` | STUDENT / Sprint 6 | Pending vs canceled/confirmed history, no canceled application presented as pending |
| `POST/PATCH` | Payment endpoints to approve in Sprint 6 | Verified actor/provider | Idempotent confirmation, deadline check, transactionally create membership; no UI-only success |

**Personalized read response proposal** (shape illustrative only): `eligible`, `reason`, `registrationState`, `membershipState`, `applicationState`, `feeType`, `amount`, `currency`, `paymentDeadline`. Do not let frontend independently compute fee eligibility or assume absent fields mean free membership. Distinguish `loading`, `error`, `notConfigured`, `closed`, `ineligible`, `pending`, `active`, `renewalAvailable`, `firstTimeAvailable` explicitly; preserve original reason-code semantics from Sprint 4.

### 12.5 Concrete Prisma constraint checklist (review during 5.A)

| Model | PK | FK and uniqueness | Important checks / indexes |
|---|---|---|---|
| `ClubMembershipSettings` | `id` UUID | `clubId → Club.id`, unique (one settings record per club) | Valid registration mode; mandatory positive fees at club creation (in service/transaction plus DB constraint on fee storage) |
| `ClubMembershipFeeVersion` | `id` UUID | `clubId → Club.id`; optional `createdById → Account.id` | Positive decimal fees; unique pending slot if modeled as row; effective versions immutable; index `(clubId, effectiveAt)` |
| `ClubRegistrationWindow` | `id` UUID | `clubId → Club.id`; `effectiveFeeVersionId → ClubMembershipFeeVersion.id` nullable until first open | `closesAt > opensAt`, no conflicting window for same club; indexes `(clubId, opensAt)`, `(clubId, closesAt)`; ensure fee version belongs to same club |
| `MembershipApplication` (Sprint 6) | `id` UUID | `studentId → UniversityStudent.id`, `clubId → Club.id`, nullable `windowId → ClubRegistrationWindow.id`, `feeVersionId → ClubMembershipFeeVersion.id` | Unique **pending** application per `(studentId, clubId)` via partial unique index or safe transaction, immutable price snapshot, deadline index, historical row retention |
| `Membership` | `id` UUID | `studentId → UniversityStudent.id`, `clubId → Club.id`, unique `applicationId → MembershipApplication.id` once implemented | `expiresAt > activatedAt`, unique membership number when added, reject overlapping active intervals, indexes `(studentId, clubId, expiresAt)` |
| `Payment` (Sprint 6) | `id` UUID | Application FK plus authenticated confirmation actor | Constrained status transitions, exact amount/currency, callback idempotency key uniqueness, no double activation |

Prisma schema syntax is **not yet approved**. PostgreSQL exclusion/partial unique indexes and history immutability may require a custom SQL migration beyond Prisma attributes. Add checks to prevent cross-club FK mismatches (window's fee version and application references must refer to the same club). No cascade delete of financial or historical membership records. Store amounts as `Decimal(10,2)` (not JavaScript floats) and store server timestamps with timezone (`timestamptz`).

### 12.6 Figma / React endpoint-by-screen integration ledger

The files below are the known **actual GitHub React locations** and **available Figma Make source references**; they are *integration targets*, not evidence that live data already exists. Verify every control against the latest Figma source immediately before implementing the particular screen. **Do not redesign or invent controls**, and do not rename existing routes merely to match Figma's demo store.

| Existing surface | Actual code / Figma source | Data and action to connect | Display / guard / boundary | Status |
|---|---|---|---|---|
| Deanship Create Club modal | `apps/web/src/staff/ClubsManagementPage.tsx`; Figma Deanship club creation popup | `firstFee`, `renewalFee`, `windowEnabled`, `windowStart`, `windowEnd` → validated, atomic club+membership settings+fee+optional window write | Positive prices, required dates in window mode, preserve nested board/admin creation and existing layout; surface backend errors | UI states present; no fee DB persistence |
| Deanship Club Management Detail | `apps/web/src/staff/ClubManagementDetailPage.tsx`; Figma club management detail | Fetch effective+pending prices and mode; edit fees, schedule new window, extend **active** window, close early, browse retained prior windows if already in design | Pending vs active prices must be clearly distinct in data; do not add visual elements without approval | Requires endpoint mapping and precise Figma placement verification |
| Deanship other club management list | `apps/web/src/staff/ClubsManagementPage.tsx` | Refresh fees/window info after creation or detail edit if displayed; keep archived-club handling | No stale/demo displayed pricing | Review controls and payloads |
| Public Clubs directory / card | `apps/web/src/pages/Clubs.tsx`, `apps/web/src/components/ClubCard.tsx`; Figma `src/pages/Clubs.tsx` | Public club records + authenticated personalized status where appropriate | Visitor: no personal badges; eligible: no badge; member/pending/ineligible: server-backed badges | Membership integration incomplete |
| Public/Student Club detail | `apps/web/src/pages/ClubPage.tsx`; Figma `src/pages/ClubPage.tsx` | Purple membership panel: live current published fee, window availability, personalized eligibility, first-time vs renewal, pending application, active member and no-login states | No payment or application action until Sprint 6; exact Figma cards/spacing/text actions; no fake data | Current GitHub: placeholder and disabled Apply button |
| Student dashboard | `apps/web/src/pages/Dashboard.tsx`; Figma `src/pages/Dashboard.tsx` | Later real membership count, cards, pending application/payment summaries | No invented numbers or membership status; distinguish empty vs API failure | Placeholder |
| Student profile | `apps/web/src/pages/StudentProfile.tsx` and Figma `src/pages/Profile.tsx` | Inspect membership links/status and future card navigation only where design has them | No fake membership cards | Audit during screen integration |
| Student payment | Figma `src/pages/Payment.tsx` | Sprint 6 application/payment method and success/error workflow | Must use verified backend outcome; simulated demo payment not considered real | Future sprint |
| Student membership card | Figma `src/pages/MembershipCard.tsx` | Sprint 7 live membership number, expiry, person, club and optional photo | Only confirmed memberships can generate card | Future sprint |
| Club admin dashboard / Members | `apps/web/src/staff/ClubAdminDashboard.tsx`; Figma `src/admin/AdminApp.tsx`, `src/admin/Members.tsx`, `src/admin/Overview.tsx` | Member/applicant list, pending confirmation queue, totals | Role is existing individual board-linked `STUDENT`; do not grant fee/window mutations | Club dashboard mainly placeholder |
| Club admin Payments / Expenses | `apps/web/src/staff/ClubAdminDashboard.tsx`; Figma `src/admin/Payments.tsx`, `src/admin/Expenses.tsx` | Sprint 6+ membership payment records, event payment distinction, actual confirmed revenue | Never calculate revenue as member count × current fee; no invented finances | Future sprint |
| Club admin profile / events / inbox | Figma `src/admin/ClubProfile.tsx`, `Events.tsx`, `Inbox.tsx` | Review all displayed membership count/fee/window read-only references and future events/messages boundaries | No fee/window edit privileges, preserve Figma design | Cross-sprint audit |
| Deanship board/admin panels | `apps/web/src/staff/BoardAppointmentsPanel.tsx`, `ClubAdministratorsPanel.tsx`, `StudentBoardPicker.tsx` | Sprint 7 effective membership prerequisite and suspension projection | Preserve appointment history and grants; ask before adding suspension UI design | Deferred enforcement |
| Supervisor panels | `apps/web/src/staff/StaffApp.tsx`, related supervisor pages | Check visible member counts/leadership and permissions; avoid assuming a membership management action is available | Respect club scope; future member-list access | Integration review required |
| Home and event surfaces | `apps/web/src/pages/Home.tsx`, `Events.tsx`; Figma corresponding pages | Any displayed club counts, membership prices, member-only event eligibility or event fee indicators | No implicit Sprint 5 event-payment implementation | Audit and defer to correct sprint |

**Each affected screen must have a verification row in the PR** for: exact Figma visual hierarchy, mobile/responsive rendering, real API request, loading, empty, error, role/visitor handling, and test evidence. If any desired state has no corresponding design element, **request user approval before a UI addition/removal**. Never change a layout just because backend payload differs.

### 12.7 Sprint-by-sprint implementation dependencies and practical gates

| Stage | Database/backend deliverable | Frontend deliverable | Automated verification | Do not accidentally implement |
|---|---|---|---|---|
| **5.A: Contract** | Approve single pending fee representation, dates/timezone, relevant FK design, exact controller routes, old-club migration strategy | Inventory Figma component slots + GitHub paths and state matrix | Schema review, risk checklist | No code or UI writes until approved |
| **5.B: Atomic club config** | Settings + strictly positive fees; migrations/backfill; club creation transaction extends current board/admin transaction | Figma Create Club inputs save real values | Missing fee, zero/negative fee, rollback entire create on error, cross-role 403 | No new shared CLUB account |
| **5.C: Deanship edits** | Read/write current and pending settings with DEANSHIP guard; state-aware write contract | Existing detail page reads/edits persisted values and displays validation | Reload, concurrent stale update, unauthorized mutation | No layout redesign |
| **5.D: Windows & effective fees** | Window history, no overlaps, immutability after close, one pending fee slot, atomic window-open price lock | Existing date/mode actions connect; exact current-vs-pending semantics | Multiple pending edits, active extension, postclose new ID, duplicate opens, fee integrity | No reactivation of historical windows |
| **5.E: Read-only membership basis** | Membership interval model (empty/seeded in tests), history lookup, renewal decision, existing eligibility extension | Real price read via purple club panel | First time/renewal/active/closed/ineligible cases | No fake paid applications/cards |
| **5.F: Student integration** | Stable public vs authenticated read contracts | Club card statuses, club detail, dashboard placeholders only where supported | Visitor privacy, role gating, Figma visual diff, error/empty states | No applications/payment without Sprint 6 |
| **5.G: Closure** | Run tests/build/migrations; document models/relations with actual schema | End-to-end displayed price/config confirmation | CI, role matrix, manual visual review | No claims of completed Sprint 6/7 |
| **Sprint 6 later** | Applications, payment states, payment confirmation, 14-day expiry, window cancellation, unique active membership activation | Figma application/payment, admin payment confirmation, student pending states | Concurrency, duplicate callbacks, close-vs-pay races | No payment without verified confirmation |
| **Sprint 7 later** | Membership card/member reads, board suspension predicate + transition for existing appointments | Figma cards/member lists, Deanship suspended state after approval | Preserve history and restoration access | No deletions/revocations on membership expiry |

### 12.8 Detailed acceptance and regression matrix

| Test case | Expected result | Stage |
|---|---|---|
| Create club without either fee | 400 / rejected, no partially created club/board/admin data | 5.B |
| Create club with zero or negative fee | Rejected | 5.B |
| Configure always-open club | No window required; published/current prices readable | 5.B–D |
| Fees edited in active `W1` three times | `W1` price unchanged; one latest pending pair for `W2` | 5.D |
| Pending edited between `W1` and `W2` four times | `W2` locks fourth/latest pair on first opening | 5.D |
| `W2` scheduled before fee changes | `W2` locks latest pending pair at *opening*, not scheduling | 5.D |
| Extend `W1` before close | Same ID and fees; still-pending deadlines extended | 5.D / 6 |
| Extend `W1` once ended | Rejected as extension; new `W2` required | 5.D |
| Early-close `W1` | Persist closure; cancel unpaid applications, history preserved | 5.D / 6 |
| Open new `W2` after closed `W1` | Fresh ID, latest pending fees, canceled `W1` applications not revived | 5.D / 6 |
| Always-open fees edited | New applications immediately use new values; prior applications keep snapshot | 5.D / 6 |
| Two requests trigger first opening simultaneously | Single effective locked fee version per window | 5.D |
| Payment confirmation after window deadline or close | No membership created; record/process payment reconciliation separately | 6 |
| 14-day always-open deadline | Unpaid applications canceled at deadline; reapplication new ID | 6 |
| Previous canceled applications but no paid membership | First-time fee | 5.E / 6 |
| Confirmed membership years ago, currently expired | Renewal fee | 5.E / 6 |
| Active membership | No early renewal or duplicate active membership | 5.E / 6 |
| Existing board member with expired membership after transition | Preserve appointment and grant; effective privileges suspended | 7 |
| Membership subsequently renewed during valid board term | Effective access restored, without new board appointment | 7 |
| Archived/ineligible/visitor and staff read/write attempts | Appropriate backend restrictions and correct UI states | 5–7 |

**Cross-cutting:** use injected/test-controlled server clock wherever feasible; do not rely on a background expiry worker to enforce read/write correctness; verify all planned foreign keys, unique constraints, blocked historical deletes, and date boundaries with a real PostgreSQL test database. Fee writes and window transitions must be concurrency-safe, as must payment confirmation in Sprint 6.

### 12.9 Codebase verification and documentation handoff

Before modifying code, compare `main` and the actual feature branch and inspect: `apps/api/prisma/schema.prisma`, migration directory, `apps/api/src/modules/clubs/` controllers/services/eligibility, create DTO, `apps/api/src/modules/students/`, auth guards, `apps/web/src/staff/ClubsManagementPage.tsx`, `ClubManagementDetailPage.tsx`, `apps/web/src/pages/ClubPage.tsx`, `Clubs.tsx`, `Dashboard.tsx`, `apps/web/src/components/ClubCard.tsx`, `ClubAdminDashboard.tsx`, and referenced Figma Make source. Check whether UI-only `firstFee/renewalFee/window*` values are included in requests (historically they were **not**).

Record approved exact DTOs, real route paths and filenames *after* controller inspection. Implement only additive Prisma migrations with a safe plan for existing clubs, not schema replacement. After implementation run API/web tests and builds plus database migration validation, and make a **complete ERD from the actual migrated schema** including *every* preexisting table and new membership model. Keep design-authority and user-approval boundaries explicit. This addendum is a technical execution guide, **not** evidence of migrated tables, connected UI, or passing tests.

### Change log continuation

| Date | Status | Change |
|---|---|---|
| 2026-10-30 | Approved business rules; proposed technical mapping | Confirmed mutable next-window fee slot (latest edit wins), fee lock only at first opening, active-window extension preserving same ID/pricing while updating pending deadlines, irrevocably historical closed windows, fresh ID and latest pending fees for all later windows, and no revival of canceled applications. Expanded database constraints, proposed APIs, all known Figma/React integration locations, stage gates, and regression tests. No app, Prisma, or GitHub implementation changes. |
