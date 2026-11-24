# ClubHub — Sprint 6 Logic Changes, Clarifications, Exceptions & Future-Sprint Handoff

**Date:** 21 November 2026. **Source baseline:** GitHub `LanaHawash/ClubHub`, reviewed `main` revision `f4ab088c6bd2b29faeb77314f11f2a6222033e52`; original `docs/clubs-platform-sprint-plan.md`; `docs/sprint-logic-changes.md`; `docs/sprint-5-membership-specifications.md`; Figma Make visual prototype. **Status:** approved business decisions captured; technical contract proposed for implementation. **This is an ADDENDUM, not a replacement for the original plan.**

> **Partner handoff:** Do **not** implement Sprint 6 from the original 12-sprint plan alone. Read the companion [full Sprint 6 specification and implementation plan](./sprint-6-membership-applications-payments-specifications.md) first. This register is the ledger of what changed, what stayed the same, why, where to implement and how later sprints must adapt. "Approved" means a business decision agreed in discussion; it does **not** mean deployed. "Technical default" is a selected design to review, **not** a user-approved historical business rule. "Withdrawn" means **do not implement**.

## 1. Status vocabulary and hierarchy

| State | Meaning |
|---|---|
| **APPROVED — BUSINESS** | User explicitly agreed in Sprint 6 planning; implementation pending |
| **RETAINED** | Previously approved and already implemented or specified; do not replace |
| **SUPERSEDED** | Explicit old behavior displaced by the approved new behavior; document its origin |
| **EXTENDED** | Additional requirement connected to an existing feature; no replacement of foundation |
| **WITHDRAWN** | Earlier proposal rejected; never implement without new authorization |
| **TECHNICAL DEFAULT — REVIEW** | Proposed exact DB/API/UX implementation choice for team sign-off |
| **DEFERRED** | Future sprint or external provider account needed |
| **IMPLEMENTED — VERIFIED** | Only mark after actual code diff, tests, review and merge; **none of the new items below currently have this status** |

**Source-of-truth rule:** Figma Make is design/visual truth; GitHub contains implemented source and business logic; original plan is historical; later approved written decision supersedes earlier contradictory wording. Figma mock data is not live behavior. Do not claim that Figma-only pages are missing from a sprint not yet reached, or that demo buttons must be copied. Keep original `docs/clubs-platform-sprint-plan.md` unchanged. Preserve `docs/sprint-5-membership-specifications.md` as historical agreement, with explicit amendments recorded here.

## 2. Master deviation register — original Sprint 6 stories

| ID | Original story/requirement | New approved scope or clarification | State | Affected system and tests |
|---|---|---|---|---|
| D6-01 | 6.1 `POST /clubs/:id/applications` checks eligible/open period/active membership | Reuse existing classification eligibility and window availability; *no manual application approval stage*. Backend rechecks during POST for correctness. | RETAINED + CLARIFIED | `ClubEligibilityService`, `ClubsService`, new ApplicationsService; T01–T05 |
| D6-02 | 6.1 pending membership application | One live app/student/club; student seeing existing pending app gets **Continue Payment/Awaiting Cash**, never Apply Again or new pending duplicate. Extend `GET /clubs/:id/eligibility/me` projection. | EXTENDED — APPROVED | Partial unique index, APIs, ClubPage/Dashboard, T05 |
| D6-03 | 6.1 open membership period (academic) | Sprint 5 already superseded academic periods with `ALWAYS_OPEN`/`WINDOWED` and rolling coverage; 14 days from submission for ALWAYS_OPEN, window closing for WINDOWED. Sprint 6 **implements** pending app persistence/job, not the window foundation again. | SUPERSEDED by Sprint 5 — RETAINED | Fee/window services, ApplicationDeadlineService, T09–T12 |
| D6-04 | 6.1 price calculation | First-time vs renewal decided by **any prior confirmed membership same club**, not expired application; immutable fee amount/currency/fee-version snapshot. | RETAINED Sprint 5 BR-03/04/11 | Application quote and FK, T04/T06 |
| D6-05 | 6.2 one payment model and provider interface | Shared logical payment + distinct online attempts; simulation works now, real provider adapter interface only; true provider needs later integration/account. Future event payment target retained. | APPROVED + TECHNICAL DEFAULT | Payment/PaymentAttempt, interfaces, T13–T17/T36 |
| D6-06 | 6.3 cash confirm/reject club admin | **Confirm only**; normal cash rejection and student "I paid" declaration **removed**. Only club's current two named administrators confirm ordinary cash; no Deanship oversight/approval of ordinary collections. | SUPERSEDED — APPROVED | Remove `/payments/:id/reject`; scoped `PATCH /payments/:id/confirm`; T07 |
| D6-07 | 6.3 confirm creates membership number | Generate **unique readable membership number**, confirmed payment creates exactly one membership via transaction; record who confirmed from authenticated session; second admin repeat harmless; both screens refresh without full-page reload. | EXTENDED — APPROVED | `Membership`, cash API, audit/provenance, two-admin polling, T08/T33/T34 |
| D6-08 | 6.4 simulated online callback | Secure simulation supports success, failure, retry, delayed success, repeated callbacks. Do not store raw bank card data; no UI-only activation. | EXTENDED — APPROVED | Provider interface, web Payment, T13–T17 |
| D6-09 | 6.4 online immediately activates membership | Qualifying verified payments initiated before normal/early close may complete within **30 minutes after applicable cutoff**. No new apps/attempts after cutoff. Cash receives **no grace**. | SUPERSEDED/EXTENDED — APPROVED | Payment processing deadline, callback, window close hook; T16–T20 |
| D6-10 | 6.5 expire unpaid app at original deadline | Window closing normally cancels cash/uninitiated unpaid apps; **already-processing pre-close online attempts** remain through 30-minute grace, including **early Deanship closure**. Preserve exact terminal cause and payment history; late charged funds require refund/reconciliation, no membership. | SUPERSEDED/EXTENDED — APPROVED | application/job/early window close; T18–T21 |
| D6-11 | 6.5 Deanship user story authorizes expiration | Automatic server/job expiration, not manual Deanship rejection/approval of ordinary payments. Student eligibility unaffected after app expires; may reapply if open. | CLARIFIED — APPROVED | deadline service/read CTA, T09–T12 |
| D6-12 | 6.6 students see applications/payments | Real own-application history, pending state, payment method, processing/failed/retry, safe payment history, accurate deadlines and errors. | EXTENDED — APPROVED | `/students/me/*`, Dashboard/ClubPage, T05/T14 |
| D6-13 | No named nominee onboarding story in original 6.1–6.6 | **New Route A/B**. Deanship direct-appoints only with full coverage; otherwise 72-hour provisional nomination and nominee-only cash/online payment. Student dashboard countdown; automatic paid qualification. | NEW — APPROVED | BoardNomination + API + Deanship/Student UI; T22–T29 |
| D6-14 | 6.3 generic club-admin cash | **Exception:** active Deanship may physically collect/confirm **only its approved board-nominee exceptional cash payments**. Never ordinary cash or other club expenses. | NEW — APPROVED | nominee-linked cash endpoint, actor auditing, T25 |
| D6-15 | No special renewal in original 6 | **Prepaid nominee renewal:** permitted only when existing paid coverage falls short of proposed board term; new membership starts exactly at old `expiresAt`, lasts one calendar year; old membership unchanged; never overlap. | NEW — APPROVED | membership coverage + DB exclusion, T26 |
| D6-16 | 6.1 no active member can apply | Ordinary student stays blocked while active, but special application for Deanship-nominated board member is narrow exception; cannot be reached from ordinary ClubPage CTA. | SUPERSEDED BY EXCEPTION — APPROVED | application kind + nomination FK+scoped authorization, T03/T26 |
| D6-17 | Student UI absent board nomination in Figma | New Figma-style nominee dashboard panel: club, position/dates, reason, 72h countdown, payment amount, cash/online, processing/qualified/expired. Direct-qualified Route A shows **no** nomination/pay screen. | NEW — APPROVED | student Dashboard, GET own nominations, T22/T23/T27 |
| D6-18 | Broad Figma pages exist before implementation | Sprint-specific migration only; keep design as-is, real API rather than Figma local state; never mass-port entire app or drop future screens. | CLARIFIED — APPROVED | UI ledger, T35 |
| D6-19 | Figma fee/period/cash copy from old prototype | Use real ILS, existing per-club fees and deadlines, no `$`, shared club login, demo card autofill, test payment receipt or obsolete 3-day ordinary cash. | SUPERSEDED MOCK BEHAVIOR | UI ledger, T35 |
| D6-20 | Original 6.2 payment link to app OR event | Real Sprint 9 event-payment reuse must be supported with payment-target exclusivity; no event flow built in Sprint 6. | RETAINED + TECHNICAL DEFAULT | nullable XOR target FK, T36 |

## 3. Prior-sprint amendments: exact rule-level crosswalk

| ID | Prior document/rule | What existed or was specified | New approved rule | Where the change must land |
|---|---|---|---|---|
| P6-01 | Original Sprint 3.5 shared `CLUB` account | Older plan and Figma prototype share admin email; actual GitHub replaced with distinct student accounts | Keep two individual `PRESIDENT`/`SECOND_ADMIN` permission grants, each board-linked; authenticated confirmer attribution. **Never recreate shared account.** | Existing `ClubAdminAssignmentsService`, payment auth, Figma port |
| P6-02 | Original Sprint 4 generic `EligibilityRule` | Already superseded by `GENERAL`/`FACULTY_BASED`/`MAJOR_BASED` + eligible majors | Reuse current `ClubEligibilityService`; do not create second eligibility table or approval queue. | Application/nomination validation |
| P6-03 | Sprint 4.2 `BoardAppointment.endDate` optional | GitHub currently accepts omitted end and open-ended current board | **New appointments require end date**; <= one calendar year; start today through +14 local calendar days; no academic-year alignment. Legacy null end rows audited and transitioned deliberately. | `CreateBoardAppointmentDto`, board service, nested club creation DTO, UI, T28/T30 |
| P6-04 | Sprint 4 board = official dated record | Backend/public leadership considers dated non-ended appointment official | Introduce provisional `BoardNomination` **separate** from official BoardAppointment; no public visibility or admin access until covered and qualified. | new model, board service, public leadership, T23/T31 |
| P6-05 | Sprint 4 admin grant linked to current board, not paid membership | Existing `assertCanManageClub()` checks board date and grant but no membership | Enforce paid membership as effective predicate in planned **Sprint 7 transition**; prepare helper in Sprint 6; preserve appointment/grant history, no premature blanket lockout. | `club-admin-assignments.service.ts`, Sprint 7 migration, T30 |
| P6-06 | Sprint 5 BR-01 | Application does not grant membership, payment confirmed activates | **Keep for ordinary**; for prepaid nominee renewal, payment is confirmed now but membership `activatedAt` is future old expiry, so payment ≠ immediate *active* membership privilege. | Membership read/access predicate |
| P6-07 | BR-02 (one year from payment confirmation) | Rolling one year; no period table | **Narrow exception:** prepaid nominee renewal starts when existing active membership ends, then covers one calendar year; don't overlap or silently extend prior period. | Membership creation service, coverage, T26 |
| P6-08 | BR-05 (early renewal forbidden) | Active student cannot ordinary reapply/renew | **Deanship-nominated incoming board candidate** may prepay renewal on special linked application only. Normal students still blocked. | application kind, actor and nomination guard |
| P6-09 | BR-03/04/06–11 fees/version | Per-club, first/renewal, positive ILS, quote frozen, fee changes apply according to mode | Retain; for nominee when registration closed, use *current authoritative pending fee configuration* and freeze an independent historical quote version (never change closed window). | nominee quote/version logic, T38 |
| P6-10 | BR-12 window mode and closed-window immutable | Existing window timing/fee snapshots implemented | Retain; no opening closed window to process nominee payments. Special nominee path bypasses normal window only for authorized candidate. | existing window services + special application check |
| P6-11 | BR-13/14/15 window close | Normal pending unpaid apps canceled immediately; confirmation by close | **Online in-flight exception:** qualifying attempts initiated earlier allowed for 30m after scheduled **or early** closure, cash/unstarted apps cancel; no new app after close. This is a deliberate amendment, **not** already implemented in Sprint 5. | deadline service, callback, early-close path, T16–T20 |
| P6-12 | BR-16 always-open app 14 days | Approved in Sprint 5, no app model existed yet | Keep 14-day standard; online pre-deadline attempt can finish through D+30m; cash cannot. | application scheduler/guard |
| P6-13 | BR-17 policy switch to already-closed window | Unpaid apps canceled immediately | Retain unless future explicit exception; no automatic broadening of early-close grace to mode switch. Reconcile actual external charge separately. | mode-switch hook |
| P6-14 | BR-18/19 reapplication/history | Expired/canceled can reapply if eligible + open; no data deletion | Retain; "lost track of time" only invalidates application, never academic eligibility. Preserve paid/failed history, new app and price when allowed. | app records and UI |
| P6-15 | BR-20 membership prerequisite for board/admin | Planned enforcement after Sprint 6 | **Stronger appointment-time rule:** membership coverage must span **entire proposed board term**; Route A direct if covered; Route B unpaid candidate for 72h, official only once covered. | board service, nomination, coverage |
| P6-16 | BR-21/22 immediate paid-role suspension, transition | Preserve old board/grant records and no premature enforcement | **Do not implement** earlier extra president 3-day admin grace. Prevent mid-term gaps by coverage-at-appointment; still check effective permissions, preserve Sprint 7 migration. | admin auth, nomination, migration |
| P6-17 | BR-23 no university-wide MembershipPeriod | Membership rolling, separate from academic calendar | Retain; new board scheduling is configurable start/end <=1y, no academic year restriction. | DB/date logic |
| P6-18 | BR-24 visual fidelity | Existing Figma layout should remain | Confirm Figma visual source-of-truth; migrate only relevant React components incrementally; add nominee feature in approved style; no wholesale page redesign or demo-state port. | web app + visual review |
| P6-19 | BR-25–30 next-window prices/fee lock/timing | Existing sophisticated window snapshot/close reconciliation implemented | Retain every fee/version/window rule; special nominee fee snapshot does not rewrite a window; application + online-grace hooks must respect window immutable lifecycle. | Sprint 5 services/migrations |
| P6-20 | Sprint 7 card uses academic period in original plan | Current rolling membership differs | Card will use own Membership `activatedAt/expiresAt` and unique number, prepaid versus active clearly distinguished, no period FK. | Sprint 7 |

## 4. Additional refinements and *not* new logic (record to prevent accidental drift)

| Ref | Clarification | Rationale |
|---|---|---|
| C6-01 | Existing UI disables Apply for ineligible students; backend re-check on write is *security*, not approval/rejection workflow. | Keep simple UX and server authority |
| C6-02 | No student cash claim and no admin Reject; cash stays awaiting until actual receipt or deadline. | Align campus process; avoid unnecessary status/permissions |
| C6-03 | Student clicks Apply only once; re-click/refresh same pending app returns current status and original quote. | Avoid duplicate applications/payment amount drift |
| C6-04 | Always-open expired student can immediately reapply if still eligible; windowed student waits for next opportunity. | Expiration ≠ loss of academic eligibility |
| C6-05 | Fee edits never reprice a submitted app, including special nominee. | Preserve payment fairness and accounting history |
| C6-06 | Club's two admins can work concurrently; first effective confirmation wins and is attributed to authenticated account; other sees already-confirmed. | Accountability without adding extra approval |
| C6-07 | Both admin screens should update automatically; polling is initially sufficient. | Avoid overengineering WebSockets |
| C6-08 | Bank error is not automatically bank's fault; use neutral retry/status messaging. | Prevent double charge and misleading UI |
| C6-09 | Simulated provider must be usable and testable. Real provider **architecture** is prepared; actual live integration **deferred** until credentials/provider confirmed. | Graduation demo usable without blocking production readiness |
| C6-10 | Deanship normal fee/window configuration remains entirely separate from ordinary club cash collections. Deanship only exceptional nominee cash. | Role separation, workload reduction |
| C6-11 | Nominee cash collection may be initiated by student in student account; **Deanship** alone confirms the physical receipt, never student. Nominee online success automatically qualifies without extra manual Deanship approval. | Two coherent interfaces; no duplicate action |
| C6-12 | Direct-qualified board member has **no** 72h payment panel; normal immediate appointment remains. | User-approved Route A behavior |
| C6-13 | Nomination countdown is based on stored server deadline and survives refresh. | No Figma-local timeout as source of truth |
| C6-14 | Nomination qualification "atomic" means one internal PostgreSQL commit for payment/member/appointment/status—not external bank rollback. | Explain technical guarantee accurately |
| C6-15 | A prepaid new membership becomes valid exactly at prior expiry instant; not "next day" unless prior expiry instant is already next day's midnight. | Avoid off-by-one and overlapping coverage |
| C6-16 | A membership may extend past board end, never shorter than full board term. | Governance coverage invariant |
| C6-17 | New board term starts max 14 local calendar days in future; 3-day onboarding is distinct from max 14-day scheduling. | Avoid accidental mixed deadline |
| C6-18 | Board appointment start and end are independent of academic-year borders; term <=1 calendar year. | Reflect real university practice |
| C6-19 | Future six-month-ahead first-time nomination is deliberately out of scope; reject/delay incompatible term rather than build generic scheduled activation. | Keep implementation achievable |
| C6-20 | Nominee price when normal window closed uses current per-club authoritative fee; historical quote snapshot still mandatory. | No manual Deanship amount override |
| C6-21 | Membership unique number generated server-side; Figma fake number not used. | Future Sprint 7 cards and accountability |
| C6-22 | Club finance Figma has events, expenses and budgets but Sprint 6 implements **only membership portions**; don't add fake income or silently delete future layout. | Sprint boundaries |
| C6-23 | Deanship may see read-only membership/payment summary only where approved Figma design calls for it; no ordinary cash approval. | Preserve UI and least privilege |
| C6-24 | Board nominee doesn't become member or board by nomination alone; must have verified paid membership and term coverage. | Avoid privilege escalation |
| C6-25 | UI only reflects server states; the browser's clock, old quote and local store do not authorize money movement. | Security invariant |

## 5. Withdrawn / canceled ideas — do not resurrect

| Ref | Discarded idea | Replaced by |
|---|---|---|
| W6-01 | Shared `CLUB` account for president and second admin | Two individually authenticated `STUDENT` accounts with linked assignments (already implemented in 3.5) |
| W6-02 | Generic administrator cash Reject button or student's "I paid" declaration | Receipt-based confirmation and system expiry only |
| W6-03 | Deanship approves/rejects normal club member payments | Deanship **only** nominee exceptional cash confirmation |
| W6-04 | Ordinary academic-year membership validity or global `MembershipPeriod` | One-year rolling paid membership; board term dates separate |
| W6-05 | New general-purpose eligibility-rule / applicant approval engine | Existing classification eligibility with pre-display + secure POST recheck |
| W6-06 | President temporarily retains expired-membership admin privileges for three days | **No admin-continuity grace**; coverage checked across entire term and existing assignments retained |
| W6-07 | General scheduled membership activation for first-time students many months ahead | Validate term and collect payment near enough to cover full term; prepaid renewal remains narrow exception |
| W6-08 | Open a closed registration window to admit board nominees | Special Deanship-linked nomination application with its own fee quote |
| W6-09 | Immediately copy entire Figma Make project into GitHub | Incremental sprint-by-sprint migration of presentation/interaction only |
| W6-10 | Port Figma local `setTimeout()` success, demo card autofill, local confirm/expire UI, dollar fee symbols | Trusted backend simulation, real API and ILS |
| W6-11 | Use a bank delay as reason to automatically accept payment indefinitely | Strict initiated-before-deadline 30-minute grace and refund/reconcile afterward |
| W6-12 | Hard-delete canceled applications or revoke appointments on natural membership expiration | Retain history, compute effective status, preserve manual-ended behavior |
| W6-13 | Automatically qualify a nominee on Deanship nomination without money | Route A only with actual full coverage; Route B must pay and then qualify |
| W6-14 | Make all future events, financial dashboard and notification UI part of Sprint 6 | Implement only membership backend/sections; preserve planned future sprints |

## 6. Source-level implementation impact ledger

| Area | Existing code verified | Must add/change | Must preserve |
|---|---|---|---|
| `prisma/schema.prisma` | Membership, settings, versions, windows, BoardAppointment, ClubAdminAssignment, EventRegistration | `MembershipApplication`, `Payment`, `PaymentAttempt`, `BoardNomination`; unique membership number, source FKs; partial indexes/exclusion constraints | Existing IDs, rolling dates, window snapshots, account/board FKs |
| `clubs.service.ts` | Price/availability/close/extend/create | Lifecycle coordination hooks; quote pending projection; safe composite club creation policy | Authoritative fees, window locking, no reopening, archive and historical fee semantics |
| `club-eligibility.service.ts` | Classification evaluator | Reuse from application and board services, no new rule table | General/faculty/major checks |
| `board-appointments.service.ts` | Current/history/create/update/end, account/eligibility/overlap | Term end required for new, <=year, <=14 future, coverage check, Route A safe, coverage recheck on edit | `endedAt` and same-tx assignment revocation, position history |
| `club-admin-assignments.service.ts` | Current two board-linked student grants and `assertCanManageClub` | Later membership-effective predicate, migration gate; payments call existing scope auth | Separate session identities, revocation history, current board checks |
| `clubs.controller.ts` | Existing /clubs/eligibility/me, windows, admin assignments | Extend read response; new modules/controllers for apps, payments, nominations | Existing endpoint paths/roles; no `/api/v1` invention |
| `membership-window-reconciler.service.ts` | Scheduled fee-window snapshot jobs | Coordinate with separate application expiry/grace worker (not duplicate fee reconciling) | SQL fee-version snapshots, active window rules |
| `app.module.ts` | Clubs/Auth/Students/Events etc | Import registered application/payment/nomination modules | Existing providers and global throttling/auth |
| `ClubPage.tsx` GitHub | Real availability and eligibility, disabled join | Figma modal, application/price/payment status, Continue Payment | Existing Sprint 5 visual and services |
| `Dashboard.tsx` GitHub | Placeholder memberships/payments | Real app/payment lists and nominee card/countdown | Approved Figma visual design, future activities |
| `ClubAdminDashboard.tsx` GitHub | Existing club overview/admin sections | Members pending cash queue, Money membership totals, actor/time, polling | Auth, club scope, future event/expense tabs |
| Deanship `BoardAppointmentsPanel.tsx` | Existing student lookup/date/board CRUD | Coverage preview, direct-vs-nominee, nominee queue and cash button | Current Figma-adapted layout, board history |
| Deanship `ClubAdministratorsPanel.tsx` | Two slots from current board | Qualifying board check and no provisional selector | Two individual student admins, revocation |
| Figma `src/pages/Payment.tsx` | Designed card checkout & mock success | Port visual, connect trusted simulated provider/callback & safe status | Layout, processing/success design, no raw PAN/CVC production |
| Figma `src/admin/Members.tsx`, `Payments.tsx` | Designed applicant/finance panels, mock counts and Reject | Port relevant design, replace all mock data/Reject, show real fee/confirmation | Visual look; future events/expenses deferred |
| Figma `src/staff/Clubs.tsx` | Designed board and fee UI but older shared-email mock | Use as design reference only, extend *current* GitHub boards panels for new UX | Existing modern GitHub real board/classification implementation |

The companion specification's §5–11 defines concrete field types, FK constraints, every endpoint/DTO, state transitions, locks, migration sequence, Figma ledger and 6.A–6.H stage-by-stage test gates. This register intentionally references that detailed contract rather than suggesting the one-line row is sufficient implementation guidance.

## 7. Future-sprint amendments and warnings

### Sprint 7 — Memberships/cards/boards
- Card uses actual one-year `Membership.activatedAt/expiresAt`, unique `membershipNumber`, no academic-period FK. A prepaid confirmed renewal is **not active** until `activatedAt`; old membership remains active before then.
- Member list must show only currently active members; historical and future prepaid records are different projections.
- Authorization must verify effective paid membership in same club plus valid current appointment, unrevoked grant, active account and active club. Full coverage was checked during appointment creation, but runtime access still validates current status. **Do not turn on Sprint 7 member-dependent access without historical data transition and tests.** No blanket historical revocation or fabricated payments.
- Public leadership displays only actual official board appointments, **not provisional nominees**. Profile/card/photo download stay in Sprint 7.

### Sprint 8 — Club events
- Club draft, submission, collaboration, approvals must use existing individually authenticated admin assignment and the future paid-membership-effective predicate. Provisional nominees must never create/approve events. No Sprint 6 implementation of events.

### Sprint 9 — Paid event registration/capacity
- Reuse shared payment/provider/attempt machinery, but a payment links to **exactly one** membership application **or** event registration (XOR); business states and deadlines for event seats remain specific to events. A paid event is not a club membership; event capacity confirmation is separate and must avoid confirmed-charge-without-seat where possible, with compensation when needed.
- Apply idempotency, payment provenance, concurrency, safe retry and late reconciliation to events only after Sprint 9 rules (seat, refunds, cancellations) are agreed. Do **not** automatically reuse the membership 14-day/30-minute business deadline for an event unless approved.

### Sprint 10 — Attendance/certificates
- No direct schema change. Attendance starts only from confirmed event registrations, not membership payments or board nominations.

### Sprint 11 — Notifications/dashboards
- Add persisted notifications for nomination, approaching 72h cutoff, paid confirmation, expiry, refund-required, membership expiring and possible administrator coverage risks; avoid duplicate delivery. Sprint 6 nominee dashboard countdown/visible task exists already and must not depend on a complete future Notification module.
- Student/Deanship/club dashboards use **real paid/pending data**, not Figma `members*firstFee` or mocked balances. Read-only Deanship visibility is **not** payment control.

### Sprint 12 — Audit/security/mobile
- Audit records must preserve real confirmer (`confirmedByAccountId`) for club admin and Deanship nominee payments, timestamp, paid amount/currency, payment reference, application/nomination ID. Board nomination creation/withdrawal, fee edits and board changes are attributable to real accounts.
- Original shared-admin-account auditing question is **obsolete**; there is no shared login. Add complete role×endpoint matrix, signature validation tests, migration and backup/release instructions, mobile parity, timezone/provider callback hardening.

## 8. Data integrity and technical defaults (NOT silently approved user policy)

| Key | Concrete choice proposed in companion design | Why flag it |
|---|---|---|
| TA-01 | Half-open membership interval `[activatedAt,expiresAt)`; board term end inclusive to next Palestine-local midnight | Technical precision; user examples sometimes speak in dates |
| TA-02 | `nominatedAt+72h` for three days, server-generated | Countdown not browser timer |
| TA-03 | **30-minute grace at nominee 72h expiry** for already-processing online attempts | User approved ordinary/scheduled/early-window grace; nominee-specific deadline grace **not separately confirmed** |
| TA-04 | First-time nominee whose payment now cannot cover term must shorten/adjust dates or nominate later; **do not create generic future-start first-time membership** | Critical mathematical consequence even when start ≤14 days ahead |
| TA-05 | One live application across ordinary and nominee kinds per student+club | Concurrency-safe simplification; may require UX conflict resolution |
| TA-06 | Closed-window exceptional nominee fee from latest `ClubMembershipSettings` pending values; snapshot separate `ClubMembershipFeeVersion` | User chose current authoritative configuration; retain immutable provenance |
| TA-07 | Payment parent + PaymentAttempt child; one unresolved attempt | Safe retry and future provider use |
| TA-08 | Separate provisional BoardNomination table | Avoid public/authorization leakage through existing BoardAppointment consumers |
| TA-09 | DB `btree_gist` overlap exclusion plus partial unique indexes | Actual no-overlap and duplicate constraints under concurrency |
| TA-10 | Admin queue auto-update via short polling | Real-time-enough without WebSockets |
| TA-11 | Membership number example `CH-2026-000001` from DB sequence | Unique readable, exact branding unspecified |
| TA-12 | One-year date addition with documented Feb 29 handling, Palestine timezone for calendar board days | Prevent off-by-one and DST bugs |
| TA-13 | Outside bank not rolled back by DB, durable reconciliation case on commit failure | Critical for financial safety, no false atomicity claim |
| TA-14 | No automatic creation of two admin grants on nomination qualification | Deanship continues its independent existing admin assignment flow |
| TA-15 | Payment-method switch disallowed during unresolved/confirmed online charge | Avoid double charges |
| TA-16 | Existing unbounded board appointment history audited, not automatically shortened | Preserve legacy data and avoid cutting off admins |

**Implementation status caution:** These are selected technical defaults, not already shipped. The two areas especially worth explicit acceptance during document sign-off are `TA-03` and `TA-04`; they are documented rather than masked as past approval. There is no need to create a much larger subsystem to handle them.

## 9. Detailed Sprint 6 delivery/verification map

| Stage | Main responsibility | Evidence/partner handoff |
|---|---|---|
| **6.A** | Source sync/branch/backup, approved rule freeze, state diagrams, Figma integration inventory | Review matrix + baseline test log, no undocumented assumptions |
| **6.B** | New Prisma tables/enums/FKs/partial indexes, membership number, migration/legacy audit, service skeleton | Clean + migrated DB, constraint tests, `prisma validate/generate`, build |
| **6.C** | Ordinary membership application and extended pending quote/CTA, read/auth, 14-day/window snapshots | Per-feature API integration tests, concurrency duplicate test |
| **6.D** | Cash application, own-club admin confirm, actor audit, atomic membership activation | Two-admin race and permission tests, rolling expiry |
| **6.E** | Secure simulated online provider, retry, callback verification, grace, refund-required | Callback/failure/duplicate/unknown/late tests and UI demo |
| **6.F** | Deadline scheduler and close/extend/switch/archive integration, no reactivation | DB race/extension/early-close/clock tests |
| **6.G** | Route A + B board nominations, coverage, nominee-only Deanship cash, prepaid renewal, 72h, migration-safe board changes | Eligibility/coverage/concurrency/nominee/UI data tests; no locked-out old admins |
| **6.H** | Port Figma Sprint 6 visuals into existing GitHub UI, remove demo logic, add Deanship and nominee panels, browser regressions | Desktop/mobile screenshots, E2E, full permission matrix, partner handoff |

**Every stage is further decomposed into numbered tasks, source files, DTOs and completion tests in the companion specification §10.** Do not skip the companion; a stage header is not an adequate implementation plan.

## 10. Mandatory handoff template for each subsequent change

For any deviation discovered during implementation, append:
```
Date / sprint-stage / author / PR or commit:
Original documented rule and exact location:
Existing code behavior:
Approved new rule (or clearly PROPOSED, not approved):
Reason and user-facing behavior:
Affected database models/indexes/migration:
Affected backend service, controller, DTO, authorization and error codes:
Affected Figma file and GitHub React target; design deviations approved by:
Required API request/response and state transitions:
Concurrency / security / money / timezone considerations:
Tests added and actual observed outcomes:
Effects on Sprints 7, 8, 9, 10, 11, 12:
Rollback/transition for historic records:
Status: APPROVED / IMPLEMENTED / VERIFIED / DEFERRED / WITHDRAWN
```

**Do not mark Sprint 6 complete solely because routes compile.** It closes when migrations are proven on real PostgreSQL, cash and simulated online money flows function, pending/expiry/grace works, nominee Route A/B and prepaid coverage are validated, all affected Figma controls are API-backed without hardcoded demo authority, cross-role tests pass, collaborators have migration instructions, and the approved technical defaults have sign-off.

## 11. Sources, non-modification policy, and ownership

- Original plan **preserved unchanged**: `docs/clubs-platform-sprint-plan.md`, Sprint 6 and dependent Sprint 7/9/11/12.
- Earlier deviations **preserved**: `docs/sprint-logic-changes.md` (separate student admins, club classification, board appointments, atomic club create).
- Sprint 5 specification **preserved**: `docs/sprint-5-membership-specifications.md`, BR-01–30 and technical addenda. This document explicitly amends BR-02/05/13–15/20–22 and extends related rules; it does not rewrite earlier historical agreement.
- Existing actual source: `apps/api/prisma/schema.prisma`, `apps/api/src/modules/clubs/*`, `apps/web/src/pages/*` and `apps/web/src/staff/*` as listed in companion.
- Figma visual source: `https://www.figma.com/make/n1jp7qLNGPogwxWy0lVVg0/University-Club-Hub-Interface`; prototype components under `src/pages`, `src/admin`, `src/staff`—**not** yet all migrated to GitHub.
- **Companion implementation contract:** [`sprint-6-membership-applications-payments-specifications.md`](./sprint-6-membership-applications-payments-specifications.md).

**Document created for planning and partner handoff only.** Neither markdown file being present means any GitHub/Prisma/frontend feature has been implemented, migration run, Figma modified, or PR merged. During Sprint 6, change log statuses must be updated with evidence rather than memory.
