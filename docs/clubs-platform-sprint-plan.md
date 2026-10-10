# University Clubs Platform: Build Plan

Build one small, tested slice at a time. No feature moves forward until the previous one passes its tests.

## 1. Working agreements

- **Vertical slices.** Every story delivers database change, backend rules, endpoint, automated test, and a screen where relevant.
- **Definition of done** for every story: code merged by pull request, reviewed by the other developer, automated tests passing in CI, migration included, demo-able.
- **Sprint length:** 2 weeks. Roughly 13 core sprints, about 26 weeks. Starting mid-October 2026 ends around April 2027, leaving buffer before June 2027.
- **Mobile trails web by one sprint.** Both use the same backend and shared API client. Sprint 12 closes any gap.
- **Open questions (marked ❓)** are decided just before the sprint that needs them, never guessed.
- **Suggested split:** Developer A takes accounts, university, clubs. Developer B takes memberships, events, payments. Both pair on Sprint 0 and the payment abstraction.

## 2. Stack assumption (change here if you decide differently)

| Layer | Choice |
|---|---|
| Backend | Node.js, TypeScript, NestJS |
| Database | PostgreSQL with Prisma (schema and migrations) |
| Web | React with Vite |
| Mobile | React Native with Expo (Android first) |
| Shared | `packages/shared` for types and the API client |
| Tests | Jest and Supertest (API, real test database), React Testing Library (web), manual device checks for mobile until stable |
| CI | GitHub Actions runs lint, tests, and build on every pull request |

## 3. Architecture (fixed upfront)

**Style:** modular monolith, layered, REST API at `/api/v1`, one PostgreSQL database.

```
clubs-platform/
├── docs/
├── apps/
│   ├── api/
│   │   ├── src/modules/
│   │   │   ├── auth/            login, tokens, verification, password flows
│   │   │   ├── accounts/        accounts, student and supervisor profiles
│   │   │   ├── university/      faculties, majors
│   │   │   ├── clubs/           clubs, labels, eligibility, board
│   │   │   ├── memberships/     periods, fees, applications, memberships, cards
│   │   │   ├── events/          events, collaboration, approvals, registrations, attendance, certificates
│   │   │   ├── payments/        payments, manual confirmation, provider adapter
│   │   │   ├── notifications/
│   │   │   ├── dashboards/
│   │   │   └── audit/
│   │   ├── src/shared/          guards, error format, pagination, clock, config
│   │   ├── src/jobs/            scheduled tasks
│   │   ├── prisma/              schema, migrations, seed
│   │   └── test/                API tests
│   ├── web/
│   └── mobile/
└── packages/shared/             types, validation schemas, API client
```

**Each module has the same layers:** controller (receives requests) → service (all rules) → repository (database access). Modules call each other only through services, never through each other's tables.

**Cross-cutting rules, built in Sprint 0 and used everywhere:**

| Concern | Decision |
|---|---|
| Authentication | JWT access token plus refresh token. |
| Authorization | Role guard (Visitor, Student, Club, Supervisor, Deanship) plus ownership checks (own club, assigned clubs, own records). |
| Clock | All deadline logic reads time from one injectable clock, so tests can move time forward. |
| Payments | A `PaymentProvider` interface with two implementations: manual (admin confirms) and simulated online. A real gateway can replace the simulated one later. ❓ |
| Email | An `EmailSender` interface: console output in development, real service later. |
| File storage | A `FileStorage` interface: local disk first, cloud later. |
| Scheduled jobs | Run expiry rules, and can also be triggered directly in tests. |
| Errors | One response format: `{ code, message, details }`. |
| Lists | One pagination format for every list endpoint. |
| Auditing | Sensitive actions emit audit events (wired up fully in Sprint 12). |

**Base entity rules:** every table has `id`, `createdAt`, `updatedAt`. Status fields use enums. Deletions of referenced records are blocked or soft (archived). Each sprint adds migrations only for its own tables, so the schema grows in step with the features.

## 4. Sprint overview

| Sprint | Goal |
|---|---|
| 0 | Foundation: repo, skeleton, database, tests, CI |
| 1 | Login, roles, faculties and majors |
| 2 | Student registration, profiles, supervisors |
| 3 | Clubs core, shared admin account, labels |
| 4 | Eligibility rules and board |
| 5 | Membership periods, fees, price check |
| 6 | Applications and membership payments |
| 7 | Memberships, cards, member lists, photos |
| 8 | Events and approvals |
| 9 | Event registrations and capacity |
| 10 | Attendance, certificates, activity history |
| 11 | Notifications and dashboards |
| 12 | Audit logs, hardening, mobile parity, release |
| 13 | Optional: AI features |

---

## Sprint 0: Foundation

**Goal:** an empty but fully tested system that both of you can run in minutes.
**Demo:** a health endpoint returns OK from the database, and CI is green.

**0.1 Repository and workflow**
As a developer, I want a shared repository with a clear branch and review process, so that we never overwrite each other's work.
- Done when: the structure above exists; `main` is protected; every change goes through a pull request reviewed by the other person; README explains how to run everything.
- Test: a pull request cannot merge without a review and passing checks.

**0.2 Backend skeleton and health check**
As a developer, I want a running API with one health endpoint, so that we know the foundation works.
- Done when: `GET /api/v1/health` returns status and database connectivity.
- Test: API test checks the response and a failed-database case.

**0.3 Database, migrations, seed, test database**
As a developer, I want repeatable migrations and a separate test database, so that tests never touch real data.
- Done when: one command creates the database, applies migrations, and loads sample data; tests reset the database between runs.
- Test: running the migration twice causes no errors; tests start from a clean state.

**0.4 Shared conventions**
As a developer, I want a standard error format, request validation, pagination, and an injectable clock, so that every later feature behaves consistently.
- Done when: invalid input returns a 400 in the standard format; list endpoints share one pagination helper; the clock can be set in tests.
- Test: validation, error, pagination, and clock unit tests.

**0.5 CI and app shells**
As a developer, I want automatic checks and empty web and mobile apps that call the health endpoint, so that the full path is proven early.
- Done when: CI runs lint, tests, and build; the web page and Android app each show "API OK".

---

## Sprint 1: Login, roles, faculties and majors

**Goal:** a user can sign in, the system knows their role, and the university structure exists.
**Decisions needed:** none.
**Demo:** the Deanship signs in and manages faculties and majors.

**1.1 Account entity and login**
As the Deanship, I want to sign in with email and password, so that I can use the admin features.
- Done when: `Account` table (email, password hash, role, active flag); a seeded Deanship account; `POST /auth/login` returns tokens; wrong credentials return a generic error; `POST /auth/refresh-token` and `POST /auth/logout` work.
- Test: success, wrong password, inactive account, expired token.

**1.2 Current user and permission guards**
As a developer, I want guards that check role and ownership on every endpoint, so that permissions are enforced in one place.
- Done when: `GET /auth/me`; role guard and ownership-check helper; endpoints without a token return 401 and wrong role returns 403.
- Test: a test endpoint per role proves each allowed and denied combination.

**1.3 Manage faculties and majors**
As the Deanship, I want to add, rename, and remove faculties and majors, so that students and eligibility rules use accurate data.
- Done when: `Faculty` and `Major` tables (each major belongs to one faculty); endpoints under `/faculties` and `/majors`; deleting a faculty or major in use is blocked.
- Test: create, update, delete, blocked delete, non-Deanship forbidden.

**1.4 Public faculty and major lists**
As a visitor, I want to see the faculties and majors, so that I can fill in the sign-up form.
- Done when: `GET /faculties`, `GET /faculties/:id/majors`, and `GET /majors` need no login.
- Test: anonymous access succeeds, and write endpoints still reject anonymous users.

---

## Sprint 2: Student accounts and supervisors

**Goal:** real students and supervisors can exist in the system.
**Decisions needed:** which email domain counts as a university email ❓; can the Deanship correct student records ❓.
**Demo:** a student signs up, confirms their email, and logs in; the Deanship creates a supervisor.

**2.1 Student registration**
As a student, I want to sign up with my university email, major, and university ID, so that I can use the platform.
- Done when: `StudentProfile` table (university ID unique, name, major); `POST /auth/register`; non-university emails rejected; duplicate email or ID rejected; account stays inactive until verified.
- Test: valid sign-up, wrong domain, duplicates, unknown major.

**2.2 Email verification**
As a student, I want to confirm my email, so that my account is activated.
- Done when: `POST /auth/verify-email` with a single-use, expiring token; the email goes through the `EmailSender` interface.
- Test: valid token, reused token, expired token, login blocked before verification.

**2.3 Password flows**
As any user, I want to reset or change my password, so that I can recover and secure my account.
- Done when: `POST /auth/forgot-password`, `/reset-password`, `/change-password`; reset tokens are single-use and expire; responses never reveal whether an email exists.
- Test: each path, plus the old password stops working.

**2.4 Student profile, read-only**
As a student, I want to see my profile, so that I can check my details; and I cannot edit them.
- Done when: `GET /students/me`; no edit endpoint for students; Deanship can `GET /students` and `GET /students/:id`; Deanship correction endpoint only if decided ❓.
- Test: own profile visible, other students' profiles forbidden, edit attempt rejected.

**2.5 Supervisor accounts**
As the Deanship, I want to create and deactivate supervisors, so that clubs can be assigned a supervisor.
- Done when: `SupervisorProfile` table (name, faculty); `POST /supervisors`, `GET /supervisors`, `PUT /supervisors/:id`, `PATCH /supervisors/:id/status`; a deactivated supervisor cannot log in.
- Test: create, login as supervisor, deactivate, forbidden for non-Deanship.

---

## Sprint 3: Clubs core

**Goal:** the Deanship can set up clubs and visitors can browse them.
**Decisions needed:** who resets the shared club account's password when the board changes ❓; can club admins edit their own club profile ❓.
**Demo:** the Deanship creates a club with a supervisor and admin account; a visitor browses and filters.

**3.1 Create and edit clubs**
As the Deanship, I want to create and edit clubs, so that the platform lists real clubs.
- Done when: `Club` table (name, description, logo reference, status); `POST /clubs`, `PUT /clubs/:id`.
- Test: create, edit, validation errors, forbidden for others.

**3.2 Browse clubs**
As a visitor, I want to browse active clubs and read their profiles, so that I can decide which to join.
- Done when: `GET /clubs` (paginated, active only) and `GET /clubs/:id` need no login.
- Test: archived clubs hidden from public, visible to the Deanship.

**3.3 Archive and activate**
As the Deanship, I want to archive and reactivate a club, so that inactive clubs disappear without losing history.
- Done when: `PATCH /clubs/:id/archive` and `/activate`; archived clubs accept no new applications or events (enforced in later sprints).
- Test: status changes and visibility.

**3.4 Assign a supervisor**
As the Deanship, I want to assign one supervisor per club, so that events have a reviewer.
- Done when: `PATCH /clubs/:id/supervisor`; each club has exactly one supervisor.
- Test: assign, reassign, inactive supervisor rejected.

**3.5 Shared club admin account**
As the Deanship, I want to create one shared admin account per club, so that the president and second administrator can manage it.
- Done when: `POST /clubs/:id/admin-account` creates a Club-role account linked to that club; a second one for the same club is rejected; the club admin can log in and only reach their own club (ownership check proven); credential handover per decision ❓.
- Test: login, access to own club, denied for another club.

**3.6 Labels**
As a visitor, I want to filter clubs by label, so that I find clubs matching my interests.
- Done when: `Label` and `ClubLabel` tables; label CRUD for the Deanship; `POST/DELETE /clubs/:id/labels`; `GET /clubs?label=`.
- Test: assign, remove, filter.

---

## Sprint 4: Eligibility and board

**Goal:** clubs say who may join and who leads them.
**Decisions needed:** none new.
**Demo:** a club restricted to Engineering shows eligibility correctly; the board history is recorded.

**4.1 Eligibility rules**
As the Deanship, I want to define which faculties or majors may join a club, so that only eligible students can apply.
- Done when: `EligibilityRule` table (club, faculty or major, never both); `GET/POST/DELETE /clubs/:id/eligibility-rules`; a shared `isEligible(student, club)` service function (a student qualifies if any rule matches; no rules means no one qualifies until the Deanship decides otherwise ❓).
- Test: faculty rule, major rule, mixed rules, no-match student.

**4.2 Board appointments**
As the Deanship, I want to record each club's board from existing students, so that leadership is documented year by year.
- Done when: `BoardAppointment` table (club, student, position, start, end); `POST /clubs/:id/board`, `PUT /board-appointments/:id`, `PATCH /board-appointments/:id/end`, `GET /clubs/:id/board`, `GET /clubs/:id/board/history`; a non-existent student is rejected.
- Test: add, end, history ordering, unknown student.

---

## Sprint 5: Membership periods, fees, price check

**Goal:** the platform knows what a student would pay for each club.
**Decisions needed:** payment deadline for membership applications, per period or per club ❓; early renewal ❓.
**Demo:** a student sees "eligible, first-time fee X" and a returning student sees "renewal fee Y".

**5.1 Membership periods**
As the Deanship, I want to define each academic year's start and expiration dates, so that memberships follow fixed dates.
- Done when: `MembershipPeriod` table; `POST/PUT /membership-periods`, `GET /membership-periods`, `GET /membership-periods/current`; overlapping periods rejected; end date after start date.
- Test: create, overlap rejection, "current" uses the injectable clock.

**5.2 Club fees**
As the Deanship, I want to set each club's first-time and renewal fee per period, so that students are charged correctly.
- Done when: `ClubFee` table (club, period, first-time fee, renewal fee); `PUT /clubs/:id/fees/:periodId`, `GET /clubs/:id/fees` and `/fees/current`; fees differ per club.
- Test: set, update, missing fee handled.

**5.3 Eligibility and price check**
As a student, I want to see whether I can join a club and what I would pay, so that I know before applying.
- Done when: `GET /clubs/:id/eligibility/me` returns eligible or not (with reason), and first-time or renewal price; renewal applies if the student has any past membership in that club, however old (the `Membership` table is created now, filled in Sprint 6).
- Test: seeded memberships prove first-time versus renewal; ineligible major; archived club.

---

## Sprint 6: Membership applications and payments

**Goal:** the first complete money flow, from application to active membership.
**Decisions needed:** online provider, real or simulated ❓ (default: simulated).
**Demo:** a student applies and pays in person, a club admin confirms, and the membership activates; another applicant's unpaid application expires.

**6.1 Apply for membership**
As a student, I want to apply to a club, so that I can start paying for membership.
- Done when: `MembershipApplication` table; `POST /clubs/:id/applications` checks eligibility, an open period, no existing active membership; creates a pending application with a payment deadline and the calculated price.
- Test: success, ineligible, duplicate, no open period, archived club.

**6.2 Payment record and provider abstraction**
As a developer, I want one payment model and a provider interface, so that manual and online payments share the same rules.
- Done when: `Payment` table (amount, method, status, confirmed by, date); status flow pending, awaiting confirmation, confirmed, failed, expired; each payment links to exactly one application or registration.
- Test: allowed and forbidden status transitions.

**6.3 In-person payment**
As a student, I want to choose to pay in person, and as a club admin I want to confirm it, so that cash payments count.
- Done when: `POST /applications/:id/payments` with method in person; `GET /clubs/:id/payments` lists pending; `PATCH /payments/:id/confirm` and `/reject` by that club's admin only; confirmation activates the membership with a unique membership number.
- Test: full flow, another club's admin forbidden, confirm after deadline rejected.

**6.4 Online payment (simulated)**
As a student, I want to pay online, so that my membership activates immediately.
- Done when: online method uses the simulated provider; `POST /payments/provider-callback` confirms the payment and activates the membership; callback is verified and repeat calls are harmless.
- Test: success, failure, duplicate callback.

**6.5 Expire unpaid applications**
As the Deanship, I want unpaid applications to expire automatically, so that stale applications do not linger.
- Done when: a scheduled job expires pending applications past their deadline; expired applications cannot be paid.
- Test: move the clock past the deadline, run the job, verify status and that payment is refused.

**6.6 My applications and payments**
As a student, I want to see my applications and payments, so that I know what is pending.
- Done when: `GET /students/me/applications`, `GET /students/me/payments`, `GET /applications/:id`, `GET /payments/:id`.
- Test: students see only their own.

---

## Sprint 7: Memberships, cards, member lists, photos

**Goal:** members can see and download their proof of membership.
**Decisions needed:** can an expired card still be viewed ❓; early removal of a member ❓.
**Demo:** a member downloads a card; a supervisor sees only their clubs' member lists.

**7.1 Student photo upload**
As a student, I want to upload my photo, so that it appears on my card.
- Done when: `POST /uploads/student-photo` through the `FileStorage` interface; size and type limits; photo can be edited ❓.
- Test: valid image, wrong type, too large.

**7.2 My memberships**
As a student, I want to see all my memberships and their status, so that I know which are active.
- Done when: `GET /students/me/memberships`; status is active or expired, derived from the period's end date using the clock.
- Test: active, expired after the clock moves, several clubs at once.

**7.3 Membership card**
As a member, I want a card for each club showing my photo, name, club, membership number, and expiration date, so that I can prove my membership.
- Done when: `GET /memberships/:id/card` and `/card/download` generate it from existing records; one card per membership; others cannot access it.
- Test: content correctness, ownership, no photo case.

**7.4 Member lists**
As a club admin, I want to see my club's members, as a supervisor my assigned clubs', and as the Deanship all, so that each role can oversee membership.
- Done when: `GET /clubs/:id/members` applies the scope per role; Deanship also has `GET /students/:id/memberships`.
- Test: allowed and forbidden combinations for each role.

---

## Sprint 8: Events and approvals

**Goal:** clubs can propose events and have them approved.
**Decisions needed:** approval order ❓; mandatory event fields and online events ❓; who manages joint events and whether collaborators must accept ❓; whether edits to approved events restart approval ❓.
**Demo:** a club drafts a joint event, both supervisors and the Deanship approve it, and it appears publicly.

**8.1 Draft an event**
As a club admin, I want to create an event draft, so that I can prepare it before submitting.
- Done when: `Event` table (title, description, type, date and time, location, capacity, registration deadline, fee, status draft); `POST /events`, `PUT /events/:id` (draft only), `DELETE /events/:id` (draft only); a fee of zero means free.
- Test: validation (deadline before event date, capacity positive), only the owning club.

**8.2 Joint events**
As a club admin, I want to add collaborating clubs, so that clubs can organize together.
- Done when: `EventClub` table (event, club, role organizer or collaborator); `POST/DELETE /events/:id/clubs`, `GET /events/:id/clubs`.
- Test: add, remove, cannot remove the organizer.

**8.3 Submit for approval**
As a club admin, I want to submit a finished draft, so that reviewers can decide.
- Done when: `PATCH /events/:id/submit` locks the draft, sets pending approval, and creates one required approval per participating club's supervisor plus the Deanship.
- Test: incomplete draft rejected, locked after submit.

**8.4 Approve or reject**
As a supervisor or the Deanship, I want to approve or reject events with a note, so that only suitable events are published.
- Done when: `EventApproval` table; `GET /approvals/pending`, `GET /events/:id/approvals`, `PATCH /events/:id/approve` and `/reject` (note required); the event becomes approved only when every required approval is in; order follows the decision ❓.
- Test: partial approvals, rejection path, wrong supervisor forbidden.

**8.5 Resubmit after rejection**
As a club admin, I want to fix a rejected event and resubmit it, so that I can try again.
- Done when: a rejected event returns to draft with the note visible; resubmitting creates a fresh approval round.
- Test: reject, edit, resubmit, approve.

**8.6 Browse events**
As a visitor, I want to browse approved events, so that I can see what is coming.
- Done when: `GET /events` (approved, upcoming, filters by club, type, date) and `GET /events/:id` need no login; `GET /clubs/:id/events`.
- Test: drafts and pending events hidden.

---

## Sprint 9: Event registrations and capacity

**Goal:** students can register for events, and capacity is protected.
**Decisions needed:** can non-members register and who sets restrictions ❓; what happens to registrations and payments when an event changes or is cancelled ❓; can students cancel and are refunds needed ❓.
**Demo:** two students race for the last seat, and only one gets it.

**9.1 Free event registration**
As a student, I want to register for a free event, so that my seat is secured immediately.
- Done when: `EventRegistration` table; `POST /events/:id/registrations` confirms instantly when the fee is zero and seats remain; `GET /events/:id/availability`.
- Test: success, deadline passed, already registered, full.

**9.2 Paid event registration**
As a student, I want to register and pay for an event, so that my seat is confirmed once payment arrives.
- Done when: a paid registration starts pending; payment reuses the Sprint 6 payments module (in person or online); confirmed payment confirms the seat.
- Test: both payment methods end in a confirmed registration.

**9.3 Capacity rule**
As a club, I want capacity to be filled only by confirmed paid registrations, so that no event is overbooked.
- Done when: pending registrations hold no seat; if capacity is full when payment arrives, the registration is cancelled and payment is refused; first confirmed wins.
- Test: concurrent confirmations for the last seat; capacity never exceeded.

**9.4 Registration expiry**
As a club, I want unpaid registrations to expire at their deadline, so that nothing stays pending forever.
- Done when: the scheduled job from Sprint 6 also expires registrations.
- Test: clock moved past the deadline.

**9.5 Organizer registration list**
As a club admin, I want to see who registered, so that I can prepare the event.
- Done when: `GET /events/:id/registrations` for organizing clubs, their supervisors, and the Deanship; `GET /students/me/registrations`.
- Test: scope per role.

**9.6 Changing or cancelling an approved event**
As a club admin, I want to change or cancel an approved event, so that I can respond to real-world changes.
- Done when: behavior follows the decisions made before this sprint ❓ (re-approval, notifying registrants, payment handling).
- Test: each decided rule has a test.

---

## Sprint 10: Attendance, certificates, activity history

**Goal:** the event lifecycle closes properly.
**Decisions needed:** are certificates automatic for all attendees or chosen by the club ❓.
**Demo:** a club marks attendance, issues certificates, and a student downloads theirs.

**10.1 Attendance**
As a club admin, I want to mark who attended, so that attendance is recorded accurately.
- Done when: `Attendance` table; `GET/PUT /events/:id/attendance`, `PATCH /registrations/:id/attendance`; only confirmed registrations, only after the event starts.
- Test: marking before the event rejected, unconfirmed registrations excluded.

**10.2 Issue certificates**
As a club admin, I want to issue certificates to attendees, so that students get recognition.
- Done when: `Certificate` table; `POST /events/:id/certificates`; only for attendees, no duplicates.
- Test: attendee gets one, non-attendee gets none, re-issue is harmless.

**10.3 View and download certificates**
As a student, I want to see and download my certificates, so that I can keep them.
- Done when: `GET /students/me/certificates`, `GET /certificates/:id`, `/download`.
- Test: ownership and file content.

**10.4 Activity history**
As a student, I want one timeline of my registrations, attendance, and certificates, so that I can see my involvement.
- Done when: `GET /students/me/activity` assembled from existing records.
- Test: ordering and completeness.

---

## Sprint 11: Notifications and dashboards

**Goal:** the platform tells users what needs attention.
**Decisions needed:** push notifications on Android or in-app only ❓; Deanship announcements ❓.
**Demo:** a payment confirmation appears as a notification, and each role has a useful home screen.

**11.1 Generate notifications**
As a user, I want to be told when something affects me, so that I do not miss deadlines or decisions.
- Done when: `Notification` table; events from earlier sprints create notifications (payment confirmed or expired, application expired, event approved or rejected, registration cancelled for capacity, membership expiring).
- Test: each trigger creates exactly one notification for the right person.

**11.2 Read and manage notifications**
As a user, I want to list, read, and delete my notifications, so that my inbox stays tidy.
- Done when: `GET /notifications`, `/unread`, `PATCH /notifications/:id/read`, `/read-all`, `DELETE /notifications/:id`.
- Test: users only reach their own.

**11.3 Dashboards**
As each role, I want a summary home screen, so that I see what matters first.
- Done when: `GET /dashboard/student/overview`, `/club/overview`, `/supervisor/overview` and `/pending-approvals`, `/deanship/overview`, `/pending-approvals`, `/statistics`.
- Test: numbers match seeded data; each role sees only its scope.

---

## Sprint 12: Audit logs, hardening, mobile parity, release

**Goal:** a reliable, complete system ready to demonstrate.
**Decisions needed:** are shared-account audit records acceptable without identifying the person ❓.
**Demo:** a full walkthrough of every role on web and Android.

**12.1 Audit logs**
As the Deanship, I want a record of sensitive actions, so that I can investigate problems.
- Done when: `AuditLog` table; approvals, payment confirmations, fee changes, board changes, and club account actions are recorded; `GET /audit-logs`, `/audit-logs/:id`, `/audit-logs/account/:accountId`, `/audit-logs/entity/:entityName/:entityId`.
- Test: each audited action writes one record; non-Deanship forbidden.

**12.2 Permission matrix test**
As a developer, I want an automated test of the whole role-by-action table, so that no permission regression slips in.
- Done when: one table-driven test covers every endpoint against every role.

**12.3 Mobile parity**
As a user, I want every web feature available on Android, so that I can use either.
- Done when: a checklist of all screens passes on a device.

**12.4 Release preparation**
As the team, I want deployment steps, demo data, and a user guide, so that we can present the project.
- Done when: a deployed instance (hosting decision here ❓), realistic seed data, and a short demo script.

---

## Sprint 13 (optional): AI features

**Decisions needed:** which AI features to build ❓ (suggested: club and event recommendations, platform assistant, event description helper).
**Rules:** AI only reads what the signed-in user may already see, and it never makes eligibility, approval, or payment decisions. A new `ai` module sits inside the monolith and calls an external AI service. Stories are written once the features are chosen.

---

## Open questions by sprint

| Sprint | Question |
|---|---|
| 2 | University email domain; Deanship corrections to student records |
| 3 | Shared club account credential handover; can club admins edit their club profile |
| 4 | Behavior of a club with no eligibility rules |
| 5 | Membership payment deadline per period or per club; early renewal |
| 6 | Real or simulated online payment provider |
| 7 | Expired cards; early removal of members; editable student photo |
| 8 | Approval order; mandatory event fields and online events; joint-event management; re-approval after edits |
| 9 | Non-member registration; cancellation, refunds, and event changes |
| 10 | Automatic or chosen certificates |
| 11 | Push notifications; Deanship announcements |
| 12 | Audit records for the shared account; hosting |
