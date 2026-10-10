# ClubHub — Frontend-to-Database Design Review

**Status:** Working requirements inventory, **NOT** an approved database schema.
**Prepared:** 2026-10-11.
**Review gate:** No Prisma models, migrations, containers, or API endpoints should be treated as approved solely on the basis of this document.

## 1. Purpose and sources

Create a traceable database design that supports the **whole platform**, not just the currently implemented student pages. Distinguish *actual source code*, *project requirements*, *proposed normalized storage*, and *open decisions*.

**Reviewed sources:**
- `clubs-platform-sprint-plan.md` — project requirements, roles, sprint order, API contracts and unresolved questions. **Primary requirements source.**
- `clubhub-data-integration-tracker.md` — known unfinished connections and verification tasks for the local React frontend. **Work-in-progress tracker, not proof of implementation.**
- Figma Make exported files available for review in this session: `src/App.tsx`, `src/data.ts`, `src/store.tsx`, `src/ui.tsx`, `src/pages/{Home,Clubs,ClubPage,Events,EventCalendar,Dashboard,Login,Profile,Payment,MembershipCard,Invites}.tsx`, `src/admin/{AdminApp,ClubProfile,EventEditor,Events,Expenses,Inbox,Members,Overview,Payments,ui}.tsx`, `src/staff/{StaffApp,Approvals,Clubs,Notifications,Overview,Supervisors}.tsx`. These are **prototype UI and mock-store sources**. Their mock fields are evidence of UI needs, **not automatically final database fields**.
- **Local code evidence:** The user reported `apps/api/src` contains only the NestJS starter controller/module/service/main/test; `apps/api/package.json` lists no Prisma dependency; no Prisma/migration/environment files were found by their read-only searches. Local frontend changes were described in the walkthrough, **but the current local working tree has not been independently read**. Do not confuse exported Figma files with local `apps/web` files.

**Status key:** `Confirmed plan` = specified in sprint plan; `Figma UI` = field/control is present in prototype; `Proposed` = suggested schema technique requiring approval; `Open` = business decision not yet made.

## 2. Rules to preserve

1. Modular NestJS monolith; `/api/v1` REST; PostgreSQL + Prisma migrations; shared API contract/types; separate, resettable integration-test database (**Confirmed plan**, Sprints 0–1).
2. Every persisted entity has `id`, `createdAt`, `updatedAt`; status fields as enums. Referenced records archived or deletion-blocked, rather than erased indiscriminately (**Confirmed plan**).
3. Public directory includes **active clubs only**. The header is the **total active clubs**, not the number matching search or the first pagination page. Eight clubs of which one is inactive/archived → `7 clubs. One is yours.` (**Confirmed user behavior; Sprint 3 archives clubs**).
4. Public events show **approved, upcoming** events; drafts/pending/rejected events are not exposed publicly (**Confirmed plan**, Sprint 8).
5. Counts and monetary totals that can go stale should be **derived from authoritative records**; if cached, define invalidation. Backend validates role/ownership, deadlines, capacity and eligibility (**Plan + proposed implementation**).
6. Empty ≠ loading ≠ error. Seed/demo values are visibly development-only. Do not put Figma mock credentials or simulated data into production.
7. One data-model change at a time: migration + service/repository + endpoint + test + UI consumer, after relevant business questions are resolved (**Confirmed plan**).

## 3. Screen-to-data inventory

Each row captures a frontend need, its likely backend data, and the principal uncertainty. More granular field-by-field validation remains an explicit review task.

| Surface | Data displayed or entered in Figma/known local UI | Candidate authoritative data | Source / sprint / notes |
|---|---|---|---|
| Shared header and login | current role/session, sign-in action, route; notifications | Account, session/token, Notification | Figma `App.tsx`/store; Sprints 1, 11. Keep user-chosen **ClubHub/CH** branding. |
| Login / registration / verification / password | email, password, university ID, name, faculty, major, verification/reset status | Account, StudentProfile, Faculty, Major, one-time token records | Figma `Login.tsx`/`store.tsx`; Sprints 1–2. User's local auth pages are teammate-owned and must be separately inspected before integration. |
| Club directory | active total; name, image/logo, description, category, scope, tags/labels, renewal fee, member count, eligibility indicator, membership/pending badge | Club, Label/ClubLabel, EligibilityRule, MembershipFee, Membership, Application | Figma `Clubs.tsx`; Sprints 3–7. Category **vs scope** are distinct in Figma source: do not merge blindly. |
| Club profile | about, founded year, president, supervisor, meeting info, email, board profiles, eligibility, fees, registration window, contact/join actions | Club, SupervisorAssignment, BoardAppointment, JoinWindow/period, eligibility, membership fee/application | `ClubPage.tsx`, `data.ts`; Sprints 3–7. Decide which items are direct attributes and which are relations. |
| Homepage | featured event carousel; upcoming cards; event feed; announcements; club previews | published featured Events, Announcement/Notification, active Clubs | `Home.tsx`, local integration tracker; Sprints 3, 8, 11. Do not retain hardcoded preview records. |
| Events list / calendar / details | type, title, description, image, date/time, location, organizer clubs or university, capacity, fee, registration deadline, approval, online meeting, availability | Event, EventClub, EventApproval, EventRegistration, Payment | `Events.tsx`, `EventCalendar.tsx`, `data.ts`; Sprints 8–10. Full listing must not inherit homepage's 5-item limit. |
| Event registration & invitations | signup/cancel/paid/pending/confirmed, ticket or QR code, meeting link, eligibility restrictions | EventRegistration, Payment, invitation/attendance token where needed | `Events.tsx`, `Invites.tsx`, `store.tsx`; Sprints 9–10. Never trust frontend seat calculation for concurrency. |
| Student profile / dashboard | student identity, active/past memberships, applications, payments, event history, certificates, notices | StudentProfile, Membership, Application, Payment, Registration, Certificate, Notification | `Profile.tsx`, `Dashboard.tsx`, `MembershipCard.tsx`, `Payment.tsx`; Sprints 2, 5–11. |
| Club administration | club details/editing, organizers, member directory, fees, payment reviews, inbox messages, events, event expenses and stats | Club, BoardAppointment, Membership, Payment, Message, Event, Expense, EventApproval | `src/admin/*`; Sprints 3–12. Expenses and inbound messages appear in Figma mock UI: **check whether plan explicitly includes them before freezing schema**. |
| Supervisor workflows | assigned clubs, pending event approvals, decisions, notification feed | SupervisorProfile/assignment, EventApproval, Notification | `src/staff/*`; Sprints 2–3, 8, 11. |
| Deanship workflows | university and club administration, user assignments, payments, oversight, event approval, announcements | accounts/roles, faculties/majors, clubs, approval, payment, audit | `src/staff/*` + sprint plan; Sprints 1–12. Confirm whether every Figma action is in scope. |

## 4. Prototype-field inventory requiring mapping

These are **visible types in exported Figma `src/data.ts` and `src/store.tsx`**, not instructions to copy them verbatim into Prisma.

| Prototype model | Fields found | Proposed classification / caution |
|---|---|---|
| `Club` (`data.ts`) | `id, name, about, category, scope, labels, ownTags, eligible, fees, members, founded, president, supervisor, meets, email, status, tone, mono, image, board, admins, joinWindow` | Store identity/description/status, normalize labels, eligibility rules, assignments, board, fees/windows; derive `members`; visual `tone`, `mono` likely presentation metadata, not mandatory core relational columns. Figma status is `active \| archived` while current local prototype type reportedly says `active \| inactive`: **resolve enum vocabulary**. |
| `ClubEvent` (`data.ts`) | `id, title, blurb, type, clubs, university, date, location, capacity, registered, fee, deadline, image, featured, online, meetingLink, certificate, status, eligibility, reviewNote, approvals` | Normalize participating clubs, approvals, eligibility, registrations/payments; derive `registered`/`seatsLeft`; decide `capacity=0` as unlimited vs nullable model. Keep images/storage references. |
| `Student` (`store.tsx`) | `name, email, universityId, faculty, major` | Unique university identifier and email rules; Faculty/Major relations. |
| `Membership` (`store.tsx`) | `id, clubId, number, since, expires` | Link student, club and membership period; account for lifecycle statuses and card. |
| `Application` (`store.tsx`) | `id, clubId, price, kind, method, status, deadline, createdAt` | Link student, period and payment; validate allowed state changes. |
| `Registration` (`store.tsx`) | `id, eventId, status, note?, method?` | Link student/event; server-confirmed capacity and payment states. |
| `RosterRow` / `Applicant` (`store.tsx`) | identifiers, names, contact/major, statuses and paid/method flags | Mostly projections joining profiles, registrations/applications and payments; avoid redundant mutable copies until needed. |
| `Expense` / `ClubMessage` (`store.tsx`) | expense: `id, eventId, label, amount`; message: `id, clubId, name, email, major, subject, body, at, read` | Figma mock functionality; verify whether an Expense and Message module is approved in project requirements. |
| `Staff` / `ReviewEntry` / `ClubNotice` (`store.tsx`) | reviewer role/ID, event decision, note and timestamp; club notices with read status | Candidate approvals, role/assignment and notifications with audit provenance. |

**Additional notes:** Figma prototype uses a fixed `NOW`, hardcoded demo directory, mock `ADMIN_PASSWORD`, and mock registration/seat arithmetic. These are **not safe production implementations**. Account secrets and real payments require dedicated backend flows. Store timestamps as UTC instants where appropriate and decide university time zone for display/deadlines.

## 5. Candidate entity groups (proposals, not finalized tables)

| Group / sprint | Entities or relations to review | Key constraints / derived information |
|---|---|---|
| Foundation (0) | Migration history, seed policy, health; shared API conventions | Development/test isolation; no application domain models prematurely. |
| Identity/university (1–2) | Account, StudentProfile, SupervisorProfile, Faculty, Major, EmailVerification, PasswordReset/refresh-session records | Unique email + student ID; role and ownership checks; secure token hashes; faculty→major consistency. |
| Clubs (3–4) | Club, Label, ClubLabel, SupervisorAssignment, ClubAdminAssignment, EligibilityRule, BoardAppointment | One supervisor per club; one shared club admin account per club per plan; public active visibility; eligibility rule never both faculty and major. |
| Memberships (5–7) | MembershipPeriod, MembershipFee, MembershipApplication, Membership, MembershipCard/number, Payment | Period-specific pricing; prevent overlapping/duplicate active memberships as approved rules require; derive member counts from membership status. |
| Events (8–10) | Event, EventClub, EventApproval, EventRegistration, Attendance, Certificate, EventEligibility | Organizer cannot be removed; every required reviewer decision; reserved seats transactionally; pending payment expiry. |
| Operations (11–12) | Notification, Announcement (if approved), AuditLog; possibly Message and Expense after scope decision | Per-user/read state, permissions, traceability, no loss of audit history. |

## 6. Contracts and computed-value definitions to agree

- **Active-club headline:** `totalActiveClubs` from the same authoritative public visibility rule used by `GET /api/v1/clubs`; when paginated, use server `total`, not `items.length` on a single page. Search filters do not change the global headline unless explicitly desired.
- **Club membership count:** count qualifying active memberships (define whether expired/unpaid/cancelled count; proposed **no**). Avoid duplicating a writable counter without a clear invariant.
- **Event availability:** calculate from valid registrations and capacity in a single transactional backend operation; `capacity = 0` in Figma means unlimited but sprint plan says positive capacity—**requires decision**, not silent reconciliation.
- **Event status visibility:** approved + upcoming only in public feed; define cancellation handling, approval cycle, featured selection and sorting.
- **Money:** fixed currency and integer minor units/decimal strategy must be selected; avoid JS floating-point arithmetic as the financial source of truth.
- **Refresh:** after club activation, payment confirmation, registration, or administration edits, refetch/invalidate frontend data; cross-device real-time push is **not** assumed.

## 7. Explicit open decisions / contradictions

1. **Club status:** Figma `active/archived`; local UI type `active/inactive`; plan archives/activates. Choose canonical enum plus transition and admin/public visibility policy.
2. **Club `category` versus `scope`:** Figma stores both; local draft categorizes `scope` as major/faculty/general. Decide which represents category, degree/faculty affiliation, and eligible audience.
3. **University email domain and whether Deanship may correct student records** (Sprint 2).
4. **Shared club admin password handover and club profile editing rights** (Sprint 3).
5. **No-eligibility-rules meaning, joining window/period behavior, and board permissions** (Sprint 4).
6. **Application payment deadline, renewals, provider choice, refunds and expiry handling** (Sprints 5–7, 9).
7. **Event approval order, joint-event administration, online-event requirements, edit/reapproval, fee visibility, cancellation and non-member registration** (Sprints 8–9).
8. **Unlimited capacity sentinel vs nullable unlimited model** (prototype vs Sprint 8 positive-capacity validation).
9. **Certificates: automatic or selected by organizer; QR and attendance issuance rules** (Sprint 10).
10. **Notifications, announcements and Android push scope; audit attribution to users of a shared club account** (Sprints 11–12).
11. **Figma-only inbox, expenses, invite and other operations:** confirm whether required for delivery; otherwise mark as backlog, not an accidental database obligation.
12. **Current local web source:** inspect all `apps/web/src/pages`, components, and any partner-owned auth files in read-only mode and reconcile with Figma. Until then this inventory is thorough for *reviewed Figma files*, but not a certified complete local-code audit.

## 8. Proposed review order and acceptance gates

- [ ] **Gate A — frontend coverage:** assemble field/action matrix for every Figma page *and* current local React component; classify stored, derived, transient UI state, and presentation-only fields; note permissions.
- [ ] **Gate B — requirements traceability:** link every persistent feature to a sprint-story ID, or mark **out-of-scope / decision pending**.
- [ ] **Gate C — consistency:** reconcile naming/status enums, uniqueness, FK/nullability, delete behavior, money units, timestamps, security and derived counts.
- [ ] **Gate D — schema review:** ERD and proposed Prisma model list reviewed by both developers; no migrations before sign-off on the relevant slice.
- [ ] **Gate E — foundation:** separate ClubHub Docker Compose and named volume; PostgreSQL development **and** test DB; `.env.example` only in Git; health endpoint, resettable migrations, CI tests. Existing CVAT services/volumes remain untouched.
- [ ] **Gate F — vertical slices:** Sprint 1 identity/university → Sprint 2 student flows → Sprint 3 active clubs endpoint + directory → further slices in sprint order, each tested end to end.

**Quality check before each merge:** migration applies to empty DB; tests isolate DB; server enforces permissions; frontend handles loading/empty/error; prototype no longer supplies fake production data; tracker updated; reviewer signs off.

## 9. Environment observations (user-shared evidence)

- `apps/api/src` shows only standard NestJS starter files; `apps/api/package.json` includes NestJS and test/validation packages but not Prisma.
- Read-only directory scans found no `prisma`, `migrations`, `database` or `db` folders, `.env*`, `prisma.config.ts`, or `schema.prisma` in the searched local checkout (excluding `node_modules`, Git and `dist`).
- Docker CLI and engine reported `29.6.1`. `docker ps -a` showed running CVAT services, including a `postgres:15-alpine` container **not published to the host**. A **separate ClubHub Compose project** is required; do not stop, rename, remove or reuse CVAT resources.
- Tentative host port `5433` and development DB `clubhub_dev` were suggested in chat but **not reserved or approved**; check ports and agree on names/credentials during Gate E.

## 10. Maintenance and sign-off

| Revision | Status | Change | Approved by |
|---|---|---|---|
| 2026-10-11 | Initial working draft | Combined sprint plan, integration tracker, reviewed exported Figma source types/screens, and user-shared local backend observations. | **Pending user/team review** |

**Keep documents separate:** this file tracks **schema design and traceability**; `clubhub-data-integration-tracker.md` tracks **implementation work items**; `clubs-platform-sprint-plan.md` remains the **requirements/sequence authority**. Whenever implementation reveals a new field, update both the traceability row here and the corresponding implementation checklist entry; do not silently add a database column.
