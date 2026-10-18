# Draft backlog

Status: **published to GitHub; historical planning snapshot**. These are 20 proposed MVP stories and 3 post-MVP ideas, not actual issue IDs or QA results. PM must groom each real issue before implementation. GitHub Issues becomes the only active backlog after publication; keep this file as a historical snapshot and add an ID-to-URL mapping, not a competing task board.

Create repository labels `mvp`, `post-mvp` and `user-test-bug` before applying them. Each MVP story becomes an issue labeled `mvp`; the three follow-ups use `post-mvp`. Create `user-test-bug` issues only for actually observed defects. Work in the listed dependency order.

## MVP-01: Bootstrap repository and verification commands

Label: `mvp`

### Goal

Create the smallest runnable frontend/backend skeleton with a passing check.

### Description

Configure the selected Python and TypeScript toolchains, dependency locks, environment example and source folders after GitHub issues exist. Add only a minimal backend health endpoint and frontend startup screen.

### Acceptance criteria

- [ ] A fresh checkout installs dependencies using documented commands.
- [ ] The backend health test passes and the frontend production build succeeds.
- [ ] README and AGENTS list commands that were actually run.
- [ ] No booking, authentication or persistence implementation is included.

### Out of scope

Related later work: MVP-02. Replace draft references with real issue links on publication; do not silently drop work.

### Constraints

No application dependencies; `_docs` decisions apply.

Expected files: frontend/ package setup, backend/ setup, README.md, AGENTS.md, dependency locks.

## MVP-02: Build design shell and mock service boundary

Label: `mvp`

### Goal

Make the frontend navigable using one replaceable async service interface.

### Description

Implement the referenced design shell, responsive navigation, service types, deterministic fixtures and mock adapter. Include student/coordinator login and registration screens connected to mock authentication only.

### Acceptance criteria

- [ ] All UI backend operations use the GearShareService interface.
- [ ] Mock sign-in, sign-out, registration and role navigation work without an API.
- [ ] At 390 px and 1440 px the shell has no page overflow.
- [ ] Loading, empty and failure fixtures can be selected for UI checks.

### Out of scope

Related later work: MVP-07. Replace draft references with real issue links on publication; do not silently drop work.

### Constraints

Depends on MVP-01; design-system.md is mandatory.

Expected files: frontend/src/services, frontend/src/components, auth pages and frontend tests.

## MVP-03: Create catalogue and availability UI with mock data

Label: `mvp`

### Goal

Let a visitor find equipment for a date range.

### Description

Implement search, category/date filters, equipment cards, detail view and an availability calendar against mockService. Anonymous availability contains no borrower information.

### Acceptance criteria

- [ ] Search and combined filters update displayed results correctly.
- [ ] Asset detail displays code, category, location and calendar.
- [ ] Inclusive day ranges show correct available/unavailable states and duration.
- [ ] Invalid range, empty results and service failure have visible usable states.

### Out of scope

Related later work: MVP-08. Replace draft references with real issue links on publication; do not silently drop work.

### Constraints

Depends on MVP-02; dates and privacy follow plan.md.

Expected files: frontend catalogue/detail pages, mock service, frontend tests.

## MVP-04: Build student booking and history flows in mock mode

Label: `mvp`

### Goal

Allow a signed-in student to request equipment and manage own reservations.

### Description

Add the request form, success/details view, event timeline and Upcoming/History views. Support allowed cancellation and a simulated conflict that preserves the form.

### Acceptance criteria

- [ ] Unauthenticated booking offers sign-in and restores the asset route.
- [ ] Valid requests appear as pending in My reservations.
- [ ] Cancellation removes the mock allocation; forbidden transitions do not succeed.
- [ ] Conflict errors retain entered dates/purpose and refresh availability.

### Out of scope

Related later work: MVP-09. Replace draft references with real issue links on publication; do not silently drop work.

### Constraints

Depends on MVP-03; scope is mock UI only.

Expected files: frontend booking/history pages and mock service.

## MVP-05: Build coordinator desk and inventory UI in mock mode

Label: `mvp`

### Goal

Make staff approval, custody and inventory workflows usable before backend code.

### Description

Add pending/pickup/active-loan views, transition forms, overdue badges and inventory add/edit/maintenance controls. Student navigation must not advertise staff screens.

### Acceptance criteria

- [ ] Coordinator can approve, reject with reason, check out with condition and return with condition.
- [ ] Overdue is a derived badge and a late return remains available.
- [ ] Inventory validates unique codes and shows maintenance conflicts.
- [ ] Student and visitor mock sessions cannot perform coordinator actions.

### Out of scope

Related later work: MVP-10. Replace draft references with real issue links on publication; do not silently drop work.

### Constraints

Depends on MVP-04; complete mock browser checks before contract authoring.

Expected files: frontend coordinator/inventory pages, mock service and frontend tests.

## MVP-06: Derive and validate openapi.yml from the completed service

Label: `mvp`

### Goal

Freeze the frontend/backend agreement before implementing the API.

### Description

Read the actual mock service and types from the completed frontend. Write OpenAPI with every operation, parameter, response, error and auth requirement; include privacy and date semantics.

### Acceptance criteria

- [ ] Every mock service operation maps to a documented HTTP operation.
- [ ] Request/response schemas and 401/403/404/409/422 behavior are explicit.
- [ ] The specification validates with a real OpenAPI validator.
- [ ] Frontend types and the contract agree, including auth and nullable fields.

### Out of scope

Related later work: MVP-07. Replace draft references with real issue links on publication; do not silently drop work.

### Constraints

Depends on MVP-05; do not generate the contract from a nonexistent backend.

Expected files: openapi.yml, _docs/api.md, frontend service types.

## MVP-07: Implement in-memory authentication API

Label: `mvp`

### Goal

Support server-controlled identity and authorization with a real memory store.

### Description

Implement registration, login, logout and current user using the frozen contract, salted password hashing and expiring revocable token sessions. Use a real Python in-memory repository, not SQLite :memory:.

### Acceptance criteria

- [ ] Registration creates only students and rejects normalized duplicate usernames.
- [ ] Correct credentials create a session; wrong credentials receive the documented error.
- [ ] Expired/revoked sessions fail and password/hash fields never leave the server.
- [ ] Client-supplied role or owner fields cannot grant privileges.

### Out of scope

Related later work: MVP-11. Replace draft references with real issue links on publication; do not silently drop work.

### Constraints

Depends on MVP-06; follow the versioned contract and auth architecture.

Expected files: backend auth/router/schema/memory modules and backend tests.

## MVP-08: Implement in-memory catalogue and availability API

Label: `mvp`

### Goal

Return contract-correct inventory and anonymous calendar availability.

### Description

Seed relative-date fictional inventory and expose list/detail/availability operations through the memory repository. Apply date/category/search validation and maintenance filtering.

### Acceptance criteria

- [ ] Known assets can be filtered and retrieved; unknown IDs return 404.
- [ ] Availability includes only allowed public fields and dates.
- [ ] Invalid date ranges are rejected consistently with the frontend.
- [ ] Seed dates remain valid relative to the configured club-local date.

### Out of scope

Related later work: MVP-11. Replace draft references with real issue links on publication; do not silently drop work.

### Constraints

Depends on MVP-07; no ORM or persistence yet.

Expected files: backend asset routers/domain/memory modules and tests.

## MVP-09: Implement atomic in-memory booking and cancellation

Label: `mvp`

### Goal

Enforce resource allocation and private booking access.

### Description

Add create/list/detail/cancel operations with inclusive slot allocation, ownership checks and a lock around complete multi-record mutations. Create the initial booking event atomically.

### Acceptance criteria

- [ ] Identical or partially overlapping requests for one asset cannot both succeed.
- [ ] Different assets and nonoverlapping ranges remain independently bookable.
- [ ] Cancellation releases slots and preserves the booking/event history.
- [ ] A student cannot list, read or cancel another student's private booking.

### Out of scope

Related later work: MVP-11. Replace draft references with real issue links on publication; do not silently drop work.

### Constraints

Depends on MVP-08; no raw SQL or partial multi-record writes.

Expected files: backend booking domain/router/memory repository and tests.

## MVP-10: Implement staff state machine, audit and maintenance in memory

Label: `mvp`

### Goal

Enforce the complete lending workflow on the server.

### Description

Implement the transition table, mandatory notes, immutable events, unique active loan and inventory validation. Reject maintenance when active/future commitments exist.

### Acceptance criteria

- [ ] Only coordinators can use staff routes and every valid transition records actor and state change.
- [ ] Invalid, stale and terminal-state actions return 409 without mutation.
- [ ] Checkout requires the local booked day and a unique active loan; overdue return works.
- [ ] Maintenance/new requests cannot both succeed through an availability race.

### Out of scope

Related later work: MVP-11. Replace draft references with real issue links on publication; do not silently drop work.

### Constraints

Depends on MVP-09; pass the complete in-memory suite before persistence.

Expected files: backend staff/domain/memory modules and tests.

## MVP-11: Add SQLAlchemy models, migrations and SQLite repository

Label: `mvp`

### Goal

Persist domain records through a replaceable ORM adapter.

### Description

Create initial Alembic migration and ORM models for users/sessions/assets/bookings/slots/loans/events. Implement the repository interface and database URL configuration while retaining memory mode.

### Acceptance criteria

- [ ] The initial migration creates the schema on a clean SQLite file.
- [ ] Repository operations use ORM sessions and atomic transactions.
- [ ] Slot/code/username/active-loan uniqueness is enforced by database constraints.
- [ ] The memory adapter remains runnable and no domain module imports sqlite3.

### Out of scope

Related later work: MVP-12. Replace draft references with real issue links on publication; do not silently drop work.

### Constraints

Depends on MVP-10; no final UI switch yet.

Expected files: backend models/database/repositories/migrations, environment example and dependency locks.

## MVP-12: Verify persistence, contention and storage parity

Label: `mvp`

### Goal

Show that changing stores preserves behavior and survives process restart.

### Description

Run one repository contract suite against both adapters. Add real file-backed SQLite concurrent-client and subprocess-restart checks, including rollback and stale state transitions.

### Acceptance criteria

- [ ] Saved booking/state/events are returned after stopping and restarting the actual server process.
- [ ] Concurrent conflicting reservations create exactly one booking and one coherent conflict response.
- [ ] Stale transitions, active-loan races and maintenance races cannot violate invariants.
- [ ] A failed allocation leaves no partial booking, event or stranded slots.

### Out of scope

Related later work: MVP-13. Replace draft references with real issue links on publication; do not silently drop work.

### Constraints

Depends on MVP-11; record commands and results; do not claim another DBMS was tested.

Expected files: backend integration/storage tests, _docs/evidence.md, _docs/architecture.md.

## MVP-13: Connect frontend identity and catalogue to the persisted API

Label: `mvp`

### Goal

Replace mock auth/catalogue calls with an HTTP adapter.

### Description

Implement the shared HTTP client, token/session handling, error decoding and backend origin configuration. Connect registration, login, logout, current user, catalogue and availability.

### Acceptance criteria

- [ ] The default adapter calls the real backend with correct request shapes.
- [ ] Login survives a page reload in the same browser session and logout revokes the token.
- [ ] 401 clears stale credentials and offers sign-in with return navigation.
- [ ] Network failure shows a retryable error rather than mock data or success.

### Out of scope

Related later work: MVP-14. Replace draft references with real issue links on publication; do not silently drop work.

### Constraints

Depends on MVP-12; HTTP and mock adapters share one interface.

Expected files: frontend HTTP/service selector, auth/catalogue pages and integration tests.

## MVP-14: Connect booking, staff and inventory workflows

Label: `mvp`

### Goal

Complete all primary UI journeys against SQLite-backed APIs.

### Description

Wire student requests/details/cancellation and every coordinator/inventory action through the HTTP service. Replace optimistic mock-only behavior with confirmed server results.

### Acceptance criteria

- [ ] A student's request is visible to the coordinator in a separate browser context.
- [ ] Approval, checkout and return persist and update the student's history after refresh.
- [ ] Conflicts and forbidden transitions show documented errors without success UI.
- [ ] Inventory edits and maintenance rules work through real endpoints.

### Out of scope

Related later work: MVP-15. Replace draft references with real issue links on publication; do not silently drop work.

### Constraints

Depends on MVP-13; do not duplicate domain rules as the authority in the browser.

Expected files: frontend booking/coordinator/inventory pages, HTTP adapter and integration tests.

## MVP-15: Harden interaction, responsive layout and accessibility

Label: `mvp`

### Goal

Keep the complete UI usable under keyboard, mobile and failure conditions.

### Description

Review actual forms, focus flow, calendars, dialogs, double submission, empty views and error recovery in integrated mode. Fix only observed defects and record real user-test bugs separately.

### Acceptance criteria

- [ ] 390 px and 1440 px views have no page overflow or inaccessible primary action.
- [ ] Keyboard-only registration, booking and staff transitions are possible.
- [ ] Validation identifies relevant controls and dialogs restore focus.
- [ ] Failed/delayed requests retain useful input, and pending forms prevent accidental duplicate clicks.

### Out of scope

Related later work: POST-01. Replace draft references with real issue links on publication; do not silently drop work.

### Constraints

Depends on MVP-14; actual discovered bugs get separate user-test-bug issues.

Expected files: frontend styles/components/forms, _docs/design-system.md and browser tests.

## MVP-16: Verify adversarial access and boundary cases

Label: `mvp`

### Goal

Test privacy, validation and race boundaries independently of happy paths.

### Description

Execute the documented negative matrix with anonymous users, two students and a coordinator. Add missing regression cases to cover API and repository behavior.

### Acceptance criteria

- [ ] Every private endpoint rejects an unrelated student and unauthenticated request appropriately.
- [ ] Client role/owner/status manipulation fails without side effects.
- [ ] Past/reversed/too-long/too-far dates and blank/oversize notes fail correctly.
- [ ] All race and transaction cases in testing-guidelines.md have actual results.

### Out of scope

Related later work: POST-02. Replace draft references with real issue links on publication; do not silently drop work.

### Constraints

Depends on MVP-14; QA must inspect real behavior, not trust implementation claims.

Expected files: backend tests, selected frontend tests, _docs/evidence.md.

## MVP-17: Automate two-role end-to-end browser journeys

Label: `mvp`

### Goal

Prove the real browser frontend and persisted backend work together.

### Description

Add reproducible browser tests for student and coordinator contexts, including registration, booking lifecycle, conflict, privacy, cancellation and local responsive checks.

### Acceptance criteria

- [ ] The complete request → approve → checkout → return journey passes against a live server.
- [ ] A second student receives the conflict UI and cannot view private booking details.
- [ ] The cancellation/rebooking and maintenance conflict paths pass.
- [ ] Screenshots/test artifacts and actual command results identify the tested commit.

### Out of scope

Related later work: POST-03. Replace draft references with real issue links on publication; do not silently drop work.

### Constraints

Depends on MVP-15 and MVP-16; use an available supported browser; report infrastructure limits honestly.

Expected files: frontend/e2e or tests/e2e, test configuration and _docs/evidence.md.

## MVP-18: Run exploratory user testing and triage real defects

Label: `mvp`

### Goal

Exercise the app as actual users and fix discovered defects through the issue loop.

### Description

Use separate student/coordinator browser sessions for the manual matrix, refresh/restart checks, failed-network recovery and overdue scenarios. File actual bugs before fixing, route them to PM and QA, and retest corrections.

### Acceptance criteria

- [ ] Manual steps and observed results are recorded, with date and commit.
- [ ] Each discovered defect has Goal, Description, reproduction and user-test-bug label.
- [ ] PM grooms each defect and QA adds regression cases before engineer correction.
- [ ] Every discovered blocking defect has a verified fix; if none are found, state that honestly.

### Out of scope

Related later work: POST-02. Replace draft references with real issue links on publication; do not silently drop work.

### Constraints

Depends on MVP-17; do not manufacture bugs just to populate a label.

Expected files: GitHub user-test-bug issues, _docs/evidence.md and regression tests.

## MVP-19: Make setup, demo seeding and CI reproducible

Label: `mvp`

### Goal

Allow a reviewer to run and check the application from a clean checkout.

### Description

Document tested installation/migration/seed/run/test commands, add a CI workflow for unit/API/contract/build checks and document local-only demo credentials. Ensure seeds do not overwrite real records.

### Acceptance criteria

- [ ] A clean environment follows README commands successfully.
- [ ] Demo fixtures work with today's configured local date and seeding is idempotent.
- [ ] CI runs appropriate tests, validates OpenAPI and builds the frontend.
- [ ] Git excludes runtime databases, secrets and unrelated personal files.

### Out of scope

Related later work: POST-02. Replace draft references with real issue links on publication; do not silently drop work.

### Constraints

Depends on MVP-18; no public deployment is implied by the assignment.

Expected files: README.md, AGENTS.md, Makefile, seed command, .github/workflows and environment example.

## MVP-20: Audit submission and close the verified MVP backlog

Label: `mvp`

### Goal

Make the repository an honest, complete, reviewable submission.

### Description

Refresh all affected Markdown, map acceptance criteria to evidence, verify the final commit and check all required labels. QA closes this last issue only after the final acceptance and required closure checks.

### Acceptance criteria

- [ ] All source, role/process/design documents, actual brainstorming chat and openapi.yml are pushed.
- [ ] Final recorded checks pass and the demo script matches current behavior.
- [ ] Every other mvp/user-test-bug issue has an independent QA PASS and is closed by QA.
- [ ] After QA closes this issue, open mvp and user-test-bug counts are both zero; post-mvp issues remain explicit.

### Out of scope

Related later work: POST-01, POST-02, POST-03. Replace draft references with real issue links on publication; do not silently drop work.

### Constraints

Depends on MVP-19 and every real bug fix; a failing acceptance criterion blocks closure.

Expected files: GitHub issue state, _docs/submission-checklist.md, _docs/evidence.md, _docs/iterations.md and README.md.

# Post-MVP follow-ups

## POST-01: Equipment waitlists

Label: `post-mvp`

Goal: Notify a student when requested dates become available.

Description: Add explicit waitlist opt-in and promotion policy after the reservation workflow is stable.

These are deliberately outside MVP. PM must define acceptance criteria and scope before future implementation.

## POST-02: Reminders and deployment hardening

Label: `post-mvp`

Goal: Improve operating the app beyond the local assessment.

Description: Evaluate email reminders, recovery flows, rate limiting, deployment and a tested PostgreSQL target in separately groomed issues.

These are deliberately outside MVP. PM must define acceptance criteria and scope before future implementation.

## POST-03: QR-assisted handover

Label: `post-mvp`

Goal: Speed up verified checkout and return.

Description: Add QR identifiers for physical assets while retaining server-controlled authorization and condition recording.

These are deliberately outside MVP. PM must define acceptance criteria and scope before future implementation.



## Published issue mapping

- MVP-01: https://github.com/allfocusSS/gearshare/issues/1
- MVP-02: https://github.com/allfocusSS/gearshare/issues/2
- MVP-03: https://github.com/allfocusSS/gearshare/issues/3
- MVP-04: https://github.com/allfocusSS/gearshare/issues/4
- MVP-05: https://github.com/allfocusSS/gearshare/issues/5
- MVP-06: https://github.com/allfocusSS/gearshare/issues/6
- MVP-07: https://github.com/allfocusSS/gearshare/issues/7
- MVP-08: https://github.com/allfocusSS/gearshare/issues/8
- MVP-09: https://github.com/allfocusSS/gearshare/issues/9
- MVP-10: https://github.com/allfocusSS/gearshare/issues/10
- MVP-11: https://github.com/allfocusSS/gearshare/issues/11
- MVP-12: https://github.com/allfocusSS/gearshare/issues/12
- MVP-13: https://github.com/allfocusSS/gearshare/issues/13
- MVP-14: https://github.com/allfocusSS/gearshare/issues/14
- MVP-15: https://github.com/allfocusSS/gearshare/issues/15
- MVP-16: https://github.com/allfocusSS/gearshare/issues/16
- MVP-17: https://github.com/allfocusSS/gearshare/issues/17
- MVP-18: https://github.com/allfocusSS/gearshare/issues/18
- MVP-19: https://github.com/allfocusSS/gearshare/issues/19
- MVP-20: https://github.com/allfocusSS/gearshare/issues/20
- POST-01: https://github.com/allfocusSS/gearshare/issues/21
- POST-02: https://github.com/allfocusSS/gearshare/issues/22
- POST-03: https://github.com/allfocusSS/gearshare/issues/23

GitHub Issues is now the only active backlog. Initial acceptance text above is historical; read each current issue before working.
