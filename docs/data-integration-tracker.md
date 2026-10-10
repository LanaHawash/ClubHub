# ClubHub — Replace demo/static UI with real data

**Purpose:** Living checklist for connecting the existing React screens to the NestJS API and PostgreSQL. Keep the Figma design and user-facing behavior; replace demo data, hardcoded counts, and UI-only actions with real, tested features.

**Status key:** `[ ]` not implemented/needs verification, `[x]` confirmed implemented and tested. Nothing in this document is marked completed by assumption.

**How to maintain:** For each UI feature, record its frontend path, intended data source, filtering/counting rules, empty/loading/error states, permissions, relevant sprint, and tests. Check an item off only when the API, persistence, frontend integration, and tests work end to end. Update this document when a new temporary placeholder is introduced.

## 1. Priority: Clubs directory heading and records

- [ ] **Dynamic active-club count**, `apps/web/src/pages/Clubs.tsx` (currently a static heading, `Clubs. One is yours.`). Replace the static text with `{activeClubs.length} clubs. One is yours.` or a server-provided total of **active** clubs. The Figma behavior to preserve is to count only clubs whose status is `active` (not inactive/pending/archived). For example, eight total clubs with seven active = **7 clubs. One is yours.** For zero active clubs show **0 clubs**, not a blank count. Do not base the number on currently visible search results unless product requirements explicitly change.
- [ ] **Real club records**, `Clubs.tsx` and `apps/web/src/components/ClubCard.tsx`. Replace the empty placeholder with clubs fetched through the API; map actual club names, descriptions, scopes, member counts and images. Do not use illustrative sample records as if they were real.
- [ ] **Club status and visibility rules**, backend clubs module. Define and enforce `active` versus inactive/pending/archived in the API. Ensure public listing and its count agree. Decide whether the count comes from the complete fetched active list or a paginated response's `total` field.
- [ ] **Search and category filtering**, `Clubs.tsx`. Existing input and category controls currently update local state but have no records to filter. Connect them to real records or server-side query parameters and test combined search/category behavior. Confirm which labels map to backend scope/eligibility fields.
- [ ] **Club detail navigation and membership statistics**. Wire ClubCard click to a real club profile/route; derive member counts from actual active memberships according to backend policy, not from static preview numbers.
- [ ] **Home club previews**, `apps/web/src/pages/Home.tsx`. Remove development-only `ClubCard` placeholder once real clubs are available. Reuse the same source/active-status rules as the directory; define what to display when none exist.
- [ ] **Refresh behavior:** add/edit/deactivate/reactivate/delete a club -> active-club count and list change after refetch/cache invalidation without manually editing frontend code. Do not assume real-time push updates are required; refresh behavior should be defined and tested.
- [ ] **Tests:** 0 clubs, 1 active, 7 active + 1 inactive, change active→inactive, inactive→active, search filter does **not** corrupt global active total, paginated response, API failure.

**Suggested sprint alignment:** Sprint 3 (clubs core), Sprint 4 (eligibility/board); membership counts require later membership slices.

## 2. Home: events, feed, announcements

- [ ] **Featured-event carousel**, `apps/web/src/pages/Home.tsx`: replace two local hardcoded featured-event objects with approved featured/upcoming events returned by the API. Keep design and carousel behavior; define what happens with zero, one or many events.
- [ ] **Upcoming-event cards**, `Home.tsx` and `apps/web/src/components/EventCard.tsx`: replace development preview with real scheduled/published event records. Map title, image, date, time and organizer safely. Define time zone and publication/approval visibility.
- [ ] **Event feed**, `Home.tsx` and `apps/web/src/components/EventFeed.tsx`: replace `events={[]}` with API data; preserve Figma's event categories and intended display limit/order. Verify dates, fees, locations, capacities and availability against backend fields.
- [ ] **Announcements**, `Home.tsx`: replace static sample announcements with published notices/announcements from a defined source and authorization policy. Preserve carousel/scroll behavior.
- [ ] **Empty/loading/error states** for each section: empty database is valid, loading is not the same as empty, and API errors should not silently look like zero events.

**Suggested sprint alignment:** Events Sprint 8, registration/capacity Sprint 9, notifications Sprint 11.

## 3. Events listing and actions

- [ ] **Events page**, `apps/web/src/pages/Events.tsx`: replace `EventFeed events={[]}` with fetched events. Ensure it shows the full intended public listing, not an accidental homepage-only five-item limit (current reusable `EventFeed` applies `.slice(0, 5)`). Add pagination or more-results behavior as specified.
- [ ] **Event category filters**, `EventFeed.tsx`: make them work on real events and decide whether filtering is server-side. Keep type values consistent with the domain model.
- [ ] **Event click / detail**, `EventFeed` `onEventClick` and `EventCard` `onClick`: connect to an actual event-details page rather than inert controls.
- [ ] **Registration, capacity and remaining seats**, event backend: calculate from confirmed registrations; respect capacity and concurrency, prevent overbooking. Do not treat hardcoded `seatsLeft` as truth.
- [ ] **Fees/payment state** for events: show real pricing and registration/payment state, and require backend authorization for actions.
- [ ] **Calendar route/visual behavior**: verify whether the Figma “Full calendar” action targets event listing or separate calendar UI; reconcile once against exported Figma source and provide appropriate accessible navigation.

**Suggested sprint alignment:** Sprint 8 (events/approvals), Sprint 9 (registration/capacity), Sprint 10 (attendance).

## 4. Accounts and user-specific UI

- [ ] **Sign in**, `apps/web/src/pages/SignIn.tsx`: replace any UI-only or simulated success with authenticated NestJS calls and safe token/session handling; preserve the existing auth UI.
- [ ] **Sign up**, `SignUp.tsx`: load faculties/majors from API if applicable; submit real account/student data with backend validation and duplicate checks.
- [ ] **Email verification**, `VerifyEmail.tsx`: connect expiring, single-use token verification; do not simulate verification.
- [ ] **Create password**, `CreatePassword.tsx`: connect the approved backend registration/password completion flow; never store plaintext passwords.
- [ ] **Forgot password**, `ForgotPassword.tsx`: connect request/reset flows without exposing whether an email exists.
- [ ] **Navbar authentication state**, `apps/web/src/components/Navbar.tsx`: show Sign in or appropriate authenticated actions according to real session/role; preserve active navigation and responsive behavior.
- [ ] **Role-based features**, backend and future pages: enforce Student / Club / Supervisor / Deanship permissions on the server, not only by hiding UI controls.

**Suggested sprint alignment:** Sprints 1–2, with role-specific features in later sprints.

## 5. Membership and club management (future pages)

- [ ] Join/request membership from club profile with real eligibility checks (major/faculty/general rules).
- [ ] Membership application, status, periods, fees, payments and expiration from backend.
- [ ] Club member count, member directory and digital membership card from real memberships; clarify whether pending/expired memberships count.
- [ ] Club administration, approvals and ownership checks, supervisor/deanship flows and notices, matching sprint-plan requirements.

**Suggested sprint alignment:** Sprints 3–7, 11–12.

## 6. Integration standards — apply to *every* item above

- [ ] Define NestJS endpoint/service/repository + Prisma migration for any new data; reuse the project's `/api/v1` conventions and shared types/API client (`packages/shared`) per sprint plan.
- [ ] Make backend authoritative for security, statuses, eligibility, counts that affect decisions, transactions and capacity.
- [ ] Handle `loading`, `empty`, `error`, and success as distinct UI states; provide retry where useful.
- [ ] Preserve Figma styling and animations when swapping the data source; avoid redesigning pages to accommodate temporary arrays.
- [ ] Support refetch/cache invalidation after writes and clearly define freshness expectations; "automatic" means the screen updates from data without source-code edits, **not** necessarily instantly across all browsers.
- [ ] Implement tests: backend service/API (incl. access control), frontend rendering and interactions, and an end-to-end scenario for each vertical slice.
- [ ] No fabricated production records. Use explicit development fixtures/seed data only where labeled.

## 7. Verification notes / open decisions

- [ ] Confirm exact Figma source implementation of club count and nav visuals from the exported source; quoted behavior in this tracker follows the requirement discussed with the user and should be verified against exports as they become available.
- [ ] Decide whether inactive clubs remain visible to administrators but hidden in public pages (recommended separation, **decision pending**).
- [ ] Decide whether counts should animate on change or simply update (Figma visual behavior to be checked).
- [ ] Decide API pagination, server-side filters, and canonical time zone before event integration.
- [ ] Audit every newly ported Figma component for literals (`[]`, preview objects, placeholders, static counters, hardcoded mock statuses) and add any missing items here.

## 8. Change log

- **2026-10-10:** Tracker created based on the existing local-UI walkthrough and university clubs sprint plan. Checklist records known gaps and anticipated integration work; it is **not** a claim that the entire local codebase has been exhaustively audited.
