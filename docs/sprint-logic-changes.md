# ClubHub — Sprint Logic Changes and Implementation Decisions

**Companion to:** `clubs-platform-sprint-plan.md`  
**Scope:** Sprint 3.5 and Sprint 4, including student-page leadership and club-image enhancements  
**Source baseline:** `LanaHawash/ClubHub`, GitHub `main`, reviewed 28 October 2026; original sprint plan provided with the project.  
**Status:** Historical decisions and implemented code are documented separately from unfinished work.

> **Document policy:** This file **does not replace or edit** the original sprint plan. It records intentional departures, refined business rules, actual API/data contracts, and follow-up integration requirements. If a future implementation changes a decision, add a dated amendment here rather than silently rewriting history.

## 1. Executive summary

The initial Sprint 3.5 plan proposed **one shared `CLUB`-role login per club**, used by the president and second administrator. The implemented system instead grants **two independent, revocable administrator assignments to existing active `STUDENT` accounts**. These privileges are linked to named board appointments and checked on protected requests. There is no shared password or shared Club account for this workflow.

Sprint 4 likewise diverged deliberately. Instead of an open-ended `EligibilityRule` table, clubs have a **single classification** (`GENERAL`, `FACULTY_BASED`, `MAJOR_BASED`) and classification-specific faculty/major relationships. The board is represented by dated appointment records, with an optional scheduled end date and a separate exact-time manual-termination timestamp (`endedAt`). Club creation can create the club, initial board, and administrator links in one database transaction.

**Sprint 4 extension completed in local development:** The public club page now reads current leadership from a narrowly scoped public endpoint and displays the supervisor, profile photos and club-tone initials. Club images support external URLs and Deanship-authorized computer uploads in both Create Club and Edit Club; display colors and image overlays are consistent with the card/header design. Final closure remains conditional on local build and end-to-end verification and pushing the implementation to GitHub.

## 2. Sprint 3.5 — shared account replaced by individual administrators

### 2.1 Original plan

Original story **3.5 Shared club admin account**: `POST /clubs/:id/admin-account` would create a `CLUB`-role account associated with one club, with the president and second administrator sharing its credentials. The original plan left credential handover and password resets unresolved.

### 2.2 Revised and implemented decision

- **No shared club login:** administrator access is granted to a student's own authenticated ClubHub account (`AccountRole.STUDENT`). The `CLUB` enum value may still exist in the Prisma schema for legacy/planned use; **its existence does not mean a shared club account was implemented**.
- **Two named permission slots per club:** `PRESIDENT` and `SECOND_ADMIN` in the `ClubAdminPosition` enum. These are **system permissions**; they are distinct from a board member's free-text position, such as President, Vice President, Secretary, or Treasurer.
- **Linked to leadership:** new administrator grants identify a **current `BoardAppointment`**, not an arbitrary `accountId`. A person need not have the literal board position “President” to be selected for the administrator permission slot `PRESIDENT`.
- **Only eligible identities:** the underlying student must have an active ClubHub `STUDENT` account and a qualifying, active appointment in the target club.
- **Access scope:** student administrators may access only club administration resources for clubs where their effective assignment permits it. Deanship issues and revokes grants; administrators cannot grant themselves access.
- **Auditability:** assignments are retained and revoked using `revokedAt` and `revokedById`, not deleted. Board appointment identifiers are kept as foreign keys for new assignments. The `boardAppointmentId` field remains nullable in the current schema for compatibility with historical records; avoid treating null legacy links as newly valid privileges.
- **At most two effective administrator assignments per club** and one per permission slot. The implementation checks whether an account already administers an active club when granting access.

### 2.3 Actual database representation

`ClubAdminAssignment` includes `clubId`, `accountId`, optional `boardAppointmentId`, `position` (`PRESIDENT` / `SECOND_ADMIN`), `assignedAt`, `assignedById`, `revokedAt`, `revokedById`, and audit timestamps. `Account` has the corresponding granted/revoked/recipient relations. The `BoardAppointment` relation makes administrator permission contingent on board membership.

### 2.4 Actual API contract (implemented)

| Method and path | Meaning | Access |
|---|---|---|
| `POST /clubs/:id/admin-assignments` | Grant an administrator permission using `{ boardAppointmentId, position }` | Deanship |
| `GET /clubs/:id/admin-assignments` | Current effective administrators for a club | Deanship |
| `PATCH /clubs/:id/admin-assignments/:assignmentId/revoke` | Revoke a grant without deleting the history | Deanship |
| `GET /clubs/my-admin-assignments` | Clubs the signed-in student can currently administer | Student |
| `GET /clubs/:id/admin/overview` | Protected club-administration overview | Assigned Student |

*Routing note:* NestJS controllers declare paths without `/api` in the backend; the web app calls them via Vite's `/api` proxy. Do not assume the original plan's `/api/v1` prefix is presently active.

### 2.5 What changed in the user interface

The Deanship Club Management Detail page contains a dedicated **Club administration** panel. Administrators are selected from current board appointments, displayed as real student identities, and may be revoked. This is separate from the **Club board** panel; the two-panel layout is an accepted design deviation from Figma's combined editor. The obsolete heading “Board and club administration” was corrected to “Club administration.”

### 2.6 Consequences and checks for later sprints

- Sprint 6 payment confirmation and Sprint 7 member management must call **the existing assignment/ownership authorization** rather than trusting an old `CLUB` role or a shared-account email.
- Sprint 8 event management must use the same club-scoped authorization.
- A manually ended, expired, not-yet-started, or revoked assignment must not confer effective access. The service's `getMyAdminAssignments` and `assertCanManageClub` query the related current board appointment.
- The original 3.5 password-handover question is **superseded**, not left open: individuals authenticate with their own student accounts.

## 3. Sprint 4.1 — classification-based eligibility replaces generic rule list

### 3.1 Original plan

The original 4.1 proposed an `EligibilityRule` table and `GET/POST/DELETE /clubs/:id/eligibility-rules`, with a possible mixed list of faculty and major rules and an unresolved policy when no rules exist.

### 3.2 Implemented decision

Each club has exactly one `ClubClassification`:

| Classification | Persisted configuration | Eligible students |
|---|---|---|
| `GENERAL` | No restricted faculty or majors | Every otherwise valid registered student |
| `FACULTY_BASED` | One `facultyId` | Students whose current major belongs to that faculty |
| `MAJOR_BASED` | One or more linked majors via `ClubEligibleMajor` | Students whose major is in the selected list |

**Invalid combinations are rejected**: general clubs cannot carry faculty/major restrictions; faculty clubs require one faculty and zero individual major selections; major clubs require at least one major and no faculty restriction. The initial “no rules means no one qualifies” question is replaced by the explicit `GENERAL` classification and never inferred from empty rules.

### 3.3 Actual persistence and API

- Prisma: `Club.classification`, optional `Club.facultyId`, join table `ClubEligibleMajor`; existing `Faculty`/`Major` university data is reused. There is **no separate `EligibilityRule` model** in the reviewed schema.
- Deanship creates/updates the classification and selections through `POST /clubs` and `PUT /clubs/:id` (rather than `/eligibility-rules`).
- `GET /clubs/:id/eligibility/me`: authenticated student eligibility result with `eligible` and reason (`ELIGIBLE`, `FACULTY_NOT_ALLOWED`, `MAJOR_NOT_ALLOWED`, `INVALID_CLUB_CONFIGURATION`, `CLUB_ARCHIVED`).
- `ClubEligibilityService.evaluateForAccount` is reused for determining whether an existing student can be appointed to a board. The service fetches student major/faculty and club configuration from the database.

### 3.4 Relationship to Sprint 5

Sprint 5.3 extends this **existing eligibility result** with membership period and pricing information. Do not create a second, competing eligibility engine. First-time/renewal price depends on past membership history, which is not yet implemented.

## 4. Sprint 4.2 — dated board appointments and administrator linkage

### 4.1 Original plan

The original board-appointment story contained club, student, position, start, and end dates, with add/edit/end/current/history APIs and a requirement to reject nonexistent students.

### 4.2 Additional implemented requirements

1. **Identity:** a board member must reference an existing `UniversityStudent` with an active ClubHub `STUDENT` account; names/IDs are found via authenticated Deanship candidate search and the stored value is the student UUID, not free-form name text.
2. **Eligibility:** a board candidate must qualify under the club's classification rules. This is enforced on the backend, not just in the dropdown.
3. **Position:** free-form text; it is separate from the `ClubAdminPosition` permission enum.
4. **Scheduled start:** `startDate` is a calendar day. A future-start appointment is scheduled, not yet current.
5. **Optional scheduled end:** `endDate = null` is open-ended. A specified date is **inclusive**: an appointment ending 27 October remains scheduled-current through 27 October and expires on 28 October (subject to manual termination).
6. **Immediate manual end:** `endedAt` is a nullable timestamp (`timestamptz`). Clicking the end/trash action records the exact termination instant and removes the appointment from the current board immediately, without altering its originally scheduled `endDate`.
7. **Linked permissions:** manually ending an appointment revokes its linked administrator assignments in the **same PostgreSQL transaction**. Even if a scheduled appointment expires without a separate revocation write, protected club-admin queries must reject access when the appointment is no longer current.
8. **History preservation:** the appointment remains in PostgreSQL and can be shown with its planned dates and actual `endedAt`; it is not physically deleted.
9. **Overlap checks:** conflicting appointments for the same student and overlapping President terms are rejected. A manually terminated appointment does not prevent a new same-day appointment starting after termination, as accommodated by the revised service logic.
10. **Student photos:** the appointment projection reads the linked account's `profilePhotoUrl`; the UI falls back to name initials when absent.

### 4.3 Actual schema and migrations

`BoardAppointment` has `clubId`, `studentId`, free-form `position`, `startDate @db.Date`, nullable `endDate @db.Date`, nullable `endedAt @db.Timestamptz(6)`, relations and timestamps. The `ClubAdminAssignment.boardAppointmentId` foreign key links privileges to appointment records. The repo includes board appointment and termination timestamp migrations (e.g. `20261027131628_add_board_appointments` and `20261027203616_add_board_termination_timestamp`).

### 4.4 Actual API contract

| Method and path | Meaning | Current access in code |
|---|---|---|
| `GET /students/board-candidates?search=` | Search active registered student candidates by name/university ID | Deanship |
| `GET /clubs/:id/board` | Current appointments (filters start, scheduled end, `endedAt`) | **Deanship-only** |
| `GET /clubs/:id/board/history` | All appointments (includes future and ended) | Deanship-only |
| `POST /clubs/:id/board` | Create appointment | Deanship |
| `PUT /board-appointments/:id` | Update appointment | Deanship |
| `PATCH /board-appointments/:id/end` | End **now** and revoke linked admin access | Deanship |

**Important API nuance:** the current `history` endpoint returns **all appointments**, not strictly ended appointments. A scheduled future appointment may appear in that data, even though it is not historical. UI status must distinguish *scheduled*, *current*, *expired*, and *manually ended*, or a future improvement should expose status-specific queries. The current `end` DTO still accepts a date for compatibility, but the service intentionally ignores that date and stores the server's `new Date()` as `endedAt`.

### 4.5 Deanship screen changes

- **Club board** panel: active entries, candidate search, free-text roles, start/end dates, edit, immediate removal, history, photo/initials fallback.
- **Club administration** panel: choose permissions only from eligible current board appointment records; revoke assignments.
- **Create Club** popup: two initial board rows (with add/remove), candidate search by name or university registration ID, no phone-number input, optional board term end dates, and administrator dropdowns populated from the **unsaved board rows**.
- Deliberately keep the two separate Deanship detail panels rather than redesigning them into a single panel.

## 5. Club creation — one atomic operation (refined Sprint 3.1 + 3.5 + 4.2)

An additional cross-sprint change: `POST /clubs` accepts optional nested `boardMembers` and `administrators` alongside the original club fields. `CreateClubDto` validates nested entries.

1. The popup holds selected student IDs, positions, appointment dates, and administrator choices in **React state**. Nothing is prematurely saved as a placeholder BoardAppointment.
2. Each initial administrator selection refers to a **`boardIndex`** in submitted `boardMembers` and a permission `position` (`PRESIDENT`/`SECOND_ADMIN`). The frontend does not need a database appointment ID before club creation.
3. The server validates classification, faculty/majors, supervisor and labels, each board member's account and eligibility, unique student entries, valid date ranges, and administrator slots/membership relationships.
4. In one Prisma transaction, the server creates the club and labels/eligibility relationships, creates the initial board appointments, and creates the linked administrator assignments using the newly generated appointment IDs.
5. Any validation or database failure rolls back the entire transaction; the UI reports the error instead of leaving a partially created club.
6. The administrator assignment references the authenticated Deanship actor (`assignedById`).

**Scheduled administrator nuance:** the initial creation service can store a linked administrator assignment for a board term whose `startDate` is in the future. Current authorization still checks dates, so effective access does **not** begin early. This is not the same as immediately granting access to a non-current member on an existing club.

**Not part of this delivery:** membership fees and registration-window fields in the popup are still visual/future-sprint inputs, not persisted membership rules. Their backend work begins in Sprint 5.

## 6. Implemented extension: student-facing club leadership (28 October 2026)

**Why extended:** The student-facing club detail page originally displayed board and supervisor placeholders even after Deanship had recorded real assignments. This contradicted the approved Figma presentation.

**Implementation:** The public `GET /clubs/:id/leadership` endpoint reads an `ACTIVE` club's current appointments and supervisor, returning only `{ board: [{ id, name, role, photo }], supervisor }`. The existing `GET /clubs/:id/board` remains Deanship-protected. Student and public viewers see active current board members, profile photos if available, otherwise initials; future, expired and manually ended appointments are excluded. The assigned supervisor's name is displayed without leaking student IDs, private emails or appointment history.

**Frontend:** `apps/web/src/pages/ClubPage.tsx` matches the Figma leadership cards (responsive three-column layout, portrait/initials, name and role) and retains all other club-page sections. Board-avatar initials use the **club's background/foreground color pair**, not a neutral or unrelated palette. This was visually approved in local testing.

**Source files:** `apps/api/src/modules/clubs/public-club-leadership.controller.ts` and `clubs.module.ts`; `apps/web/src/pages/ClubPage.tsx`.

**Verification:** User confirmed leadership, supervisor and Figma appearance render correctly on their local development app. Build status after the final media edits must be verified separately.

## 7. Implementation matrix

| Capability | Current evidence in `main` | Status |
|---|---|---|
| Club create/edit, supervisor association | Club service and controller | Implemented |
| Independent student-based club administrator grants | `ClubAdminAssignment`, service/controller | Implemented; replaces original 3.5 |
| Board-linked administrator authorization | `boardAppointmentId`, active-board filter | Implemented |
| Club classification and eligibility evaluator | `Club.classification`, `ClubEligibleMajor`, `ClubEligibilityService` | Implemented; replaces original 4.1 |
| Board dates, instant end, and history storage | Board service, `endedAt`, migrations | Implemented |
| Search for eligible board candidates | Student candidate-search endpoint + Deanship input | Implemented |
| Atomic initial club/board/admin creation | Nested create DTO and `ClubsService.create()` transaction | Implemented |
| Deanship board & admin panels | React components under `apps/web/src/staff` | Implemented |
| **Public board leadership section** | Public leadership API + `ClubPage.tsx` integration | Implemented and visually verified locally |
| **Public supervisor section** | Public leadership API + `ClubPage.tsx` integration | Implemented and visually verified locally |
| Shared club color pair and image overlay | `ClubCover`, `clubTone`, `ClubPage` | Implemented and visually verified locally |
| URL image editing in Deanship | `ClubManagementDetailPage.tsx` | Implemented and manually verified locally |
| PC image uploads in Create/Edit Club | `ClubImageUpload.tsx`, `ClubImagesController` | Implemented; user reports UI works; full create/upload persistence test to confirm |
| Membership periods and fee persistence | No membership models yet | Planned Sprint 5 |
| Membership application and payment | No membership application/payment workflow yet | Planned Sprint 6 |

## 8. API and security consistency rules for future sprints

1. **Do not resurrect shared Club login assumptions** in new endpoints, interfaces, tests, or documentation. Existing `AccountRole.CLUB` in the enum is not the accepted admin workflow.
2. **Keep roles separate:** board `position` is a human-readable club role; club-admin `position` is an authorization slot.
3. **One source of truth:** the database holds identity, eligibility configuration, appointments, and assignments. Frontend displays server state; a visually listed person does not by itself confer privileges.
4. **Temporal semantics:** scheduled end is inclusive by calendar day; manual end is immediate by timestamp. Reuse equivalent predicates across board reads, selection UI, and permission checks. Be conscious of local university calendar-day timezone versus UTC implementation: **time-zone definition remains a consistency concern to explicitly test before production**.
5. **No hard delete for historical leadership:** manually terminated appointments and revoked administrator grants remain available for appropriate privileged historical queries.
6. **Public/private boundary:** public leadership displays only approved public profile fields; Deanship board history, registration IDs and management data remain private.
7. **Atomicity:** creating a club plus initial board and administrators is one transaction; ending a board appointment plus revoking linked grants is one transaction.
8. **Authorization at use time:** a stored assignment is not sufficient; verify account, club, board appointment term, and revocation on each protected call.
9. **Earlier sprint UI placeholders do not imply completed later-sprint data:** fees, registration windows, membership count, and join applications must be driven by real models when their sprints are implemented.
10. **Maintain backward-compatible migrations and review tests** when altering role logic; do not silently overwrite the original plan.

## 9. Source and traceability index

**Original specification**
- `clubs-platform-sprint-plan.md`: stories 3.1, 3.4, 3.5, 4.1, 4.2, 5.1–5.3, and working agreements.

**GitHub baseline:** `https://github.com/LanaHawash/ClubHub` — `main` as reviewed 2026-10-28.
- `apps/api/prisma/schema.prisma`
- `apps/api/src/modules/clubs/clubs.controller.ts`
- `apps/api/src/modules/clubs/clubs.service.ts`
- `apps/api/src/modules/clubs/dto/create-club.dto.ts`
- `apps/api/src/modules/clubs/club-eligibility.service.ts`
- `apps/api/src/modules/clubs/board-appointments.controller.ts`
- `apps/api/src/modules/clubs/board-appointments.service.ts`
- `apps/api/src/modules/clubs/club-admin-assignments.service.ts`
- `apps/api/src/modules/students/students.controller.ts`
- `apps/web/src/staff/ClubsManagementPage.tsx`
- `apps/web/src/staff/StudentBoardPicker.tsx`
- `apps/web/src/staff/BoardAppointmentsPanel.tsx`
- `apps/web/src/staff/ClubAdministratorsPanel.tsx`
- `apps/web/src/staff/ClubManagementDetailPage.tsx`
- `apps/web/src/pages/ClubPage.tsx`

**Review discipline:** implementation status above means present in reviewed source, not a claim of an end-to-end production audit. For future updates, record the PR number, commit SHA, date, decision, and tests alongside each amendment.

## 10. Change-log template for future decisions

```text
### YYYY-MM-DD — Sprint X.Y — [short decision title]
Original plan: [quote or succinct reference]
Reason for change: [specific issue]
Accepted new rule: [unambiguous business behavior]
Data/schema: [tables, migration]
API changes: [method and route, role]
UI changes: [page and component]
Consistency/security impact: [time rules, auth, constraints]
Tests/verification: [unit/integration/build/manual outcomes]
Status: Proposed / Implemented / Verified / Deferred
PR or commit: [link or SHA]
```

## 11. 28 October 2026 — Sprint 4 scope extension: unified club imagery and uploads

**Original Sprint 4 scope:** Eligibility and board appointments (stories 4.1 and 4.2). Club cover styling, image-management UX and computer image uploads were not required by those stories. The project team elected to complete them now, without changing the original plan or pulling Sprint 5 fee/membership logic into Sprint 4.

### 11.1 One consistent cover palette

- `apps/web/src/components/ClubCard.tsx` provides `clubTone(club.id)`, a deterministic background/foreground pair. The homepage and club directory use this through the shared `ClubCover`/card display.
- `apps/web/src/pages/ClubPage.tsx` now uses the **same** tone pair for its large header, lettering and the initials fallback for board-member portraits. The prior separate `coverColors[club.name]` mapping on the club page was removed from this path.
- Club images appear below the semi-transparent color treatment with oversized club initials retained. No photo means the card/header retains its color-based design. The user verified that the styling is consistent with Figma.

### 11.2 Existing external-image URL workflow

- The pre-existing `Club.logoUrl` (nullable string) remains the source of truth for both club-card and detail-page imagery; **no schema migration** was introduced.
- Deanship Create Club already accepted a URL. Deanship Edit Club Details now allows entering, replacing and clearing that URL; clearing saves `null`.
- The user successfully tested university-hosted activity photos on existing clubs, observing the expected card and header presentation. External image hosting and reuse permissions remain the responsibility of deployment/content governance.

### 11.3 Optional upload from computer (local-development implementation)

- New guarded endpoint: `POST /clubs/images/upload`, Deanship role required. It accepts a `multipart/form-data` field named `file`, limits upload size to **5 MiB**, checks JPEG/PNG/WebP signatures and MIME types, writes a random UUID filename under `uploads/club-images`, and returns `{ url: '/api/clubs/images/<filename>' }`.
- Public image serving: `GET /clubs/images/:filename` with constrained filename matching, content type and `nosniff` response header. The frontend uses the existing `/api` Vite proxy in development.
- New reusable `apps/web/src/staff/ClubImageUpload.tsx`: a styled **Upload photo from computer** button hides the browser's native `Choose File / No file chosen` UI, while preserving URL editing, upload status, preview, supported-file guidance, and **Remove image**. This component is used in **both** `ClubsManagementPage.tsx` (Create Club modal) and `ClubManagementDetailPage.tsx` (Edit Details).
- Image uploading is a **separate step** from saving a club: after the upload returns a URL, Create Club/Save Changes persists that URL as `logoUrl` through existing club APIs. If the user cancels without saving, the local uploaded file may be orphaned.
- `uploads/` must be ignored by Git. Local filesystem storage is suitable for the development demo but is **not production-persistent**. Before public deployment, add durable object storage, orphan cleanup, safeguards against saving mid-upload, robust image decoding/security checks, and appropriate backup/retention rules.
- No changes to board appointments, administrator permissions, eligibility data, or membership pricing were required.

### 11.4 Verification and closeout

**Verified by user:** existing-club photo URL works; matching card/header colors and club-colored board-avatar initials render correctly; PC upload UI button, preview and Remove image work in Deanship Edit Club; same component was installed in Create Club popup and the user confirmed the final result looked correct.

**Still to verify before marking Sprint 4 closed on GitHub:** successful API/frontend builds and automated tests after latest edits; create-club with a PC-uploaded image actually persisted end to end; previously uploaded image survives backend restart; no accidental tracked upload files. Git commit/PR/merge details must be recorded when available.

**Status:** Implementation reported complete locally; final test/push and Sprint 4 sign-off pending. Original sprint plan unchanged; Sprint 5 membership periods/fees remain next.
