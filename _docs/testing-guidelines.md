# Testing and verification plan

Current stage update (2026-10-20): independent QA passed and closed [#4](https://github.com/allfocusSS/gearshare/issues/4#issuecomment-6279522336), [#25](https://github.com/allfocusSS/gearshare/issues/25#issuecomment-6279464800) and [#26](https://github.com/allfocusSS/gearshare/issues/26), following #1–3/#24. The #5 coordinator/inventory mock candidate and the [#27](https://github.com/allfocusSS/gearshare/issues/27) visually-hidden-label correction are implemented. Standard engineer checks pass on `f89c963b8b0193d159f74742e126a966a0053bd3`; focused label regression results are recorded in evidence.md. Both issues remain open for complete independent verification. Independent QA and the complete mock-stage gate remain pending. #6/OpenAPI and later stages remain gated. Historical entries below retain their recorded point-in-time results.

Status: #1–4/#24–26 have independent QA PASS/closure. The #5 mock staff candidate and #27 label correction await full independent verification; current engineer and focused browser results are in evidence.md. API/storage cases remain planned. Do not count this matrix as passing tests or apply mock behavior to server security.

Current scoped frontend commands: `npm test` runs 41 auth/catalogue/booking/staff/inventory/date/privacy tests; `npm run test:browser` runs the actual mock app's auth/shell checks and the seven independently specified #24 regression groups. Browser setup and the executable override are documented in README. The committed browser script covers first-invalid enabled focus, repeated/delayed validation, error association, stable keyboard use, form-level failures, valid recovery, roles, fixtures and both required widths. `npm run test:browser:catalogue` adds filter intersections, inclusive dates/invalid boundaries, anonymous privacy, maintenance, missing/empty/failure/loading states, concrete detail auth return and 390/1440 layouts, using a fixed browser Date. `npm run test:browser:bookings` exercises the #4 request/private history/cancellation/conflict journey on port 5181 with fixed Date. `npm run test:browser:staff` exercises the full student-to-coordinator lifecycle, staff transitions/custody, inventory, permissions, keyboard/focus, async failures/retries/empty states and 390/1440 layouts. API/storage matrix cases remain for later gates.

## Strategy

- Unit tests: date boundaries, normalization, transition rules and overdue calculation.
- Repository contract tests: the same externally observable behavior for the true memory adapter and file-backed SQLite/ORM adapter.
- API integration tests: real request schemas, authentication, roles, privacy, error codes and transaction rollback.
- Contract checks: validate `openapi.yml` and compare implemented request/response behavior to it. Do not discard the versioned assignment deliverable after FastAPI is added.
- Frontend tests: service adapter errors, form validation and state feedback; no direct fetch in components.
- Browser E2E: actual frontend + backend with two independent user contexts.
- Exploratory checks: keyboard/mobile/network/restart flows with real observations.

Tests use a fixed injected club-local date. Seed/demo data uses a relative date so production fixtures do not expire. Browser and API tests must not depend on the real wall clock for boundary assertions.

## Required case matrix

| ID | Case | Expected result |
| --- | --- | --- |
| A01 | Valid student registration | Student role only; no password/hash in response |
| A02 | Duplicate username with changed case/outer whitespace | Documented conflict after agreed normalization |
| A03 | Short/oversize password or invalid username | Validation error; no partial user |
| A04 | Wrong credentials | Rejected; no active session created |
| A05 | Logout then reuse old token | Unauthorized |
| A06 | Expired token | Unauthorized and frontend session cleared |
| A07 | Inject coordinator role/another owner at registration | Rejected or ignored safely; never privilege escalation |
| C01 | Search + category + date filters | Correct intersection and empty-state result |
| C02 | Unknown asset | 404 with usable UI |
| C03 | Availability as anonymous/other student | No borrower/purpose/private booking metadata |
| D01 | Same-day booking | One allocated day |
| D02 | Start today, exactly 14 days, horizon boundary | Accepted when all limits independently hold |
| D03 | Past, reversed, 15-day or beyond 90-day range | Validation error without allocation |
| D04 | UTC date differs from Asia/Almaty local date | Club-local rule applied consistently |
| B01 | Same asset/day twice | Second request returns 409 |
| B02 | Partial overlap / encompassing range | Conflict |
| B03 | Day immediately after prior inclusive end | Allowed |
| B04 | Identical dates on different physical units | Both allowed |
| B05 | Concurrent conflicting clients with separate DB sessions | Exactly one booking, no leaked allocations/events |
| B06 | Cancel then another student rebooks | Released dates available; history preserved |
| B07 | Blank/oversize purpose | Validation error; no booking created |
| P01 | Student B reads/lists/cancels A's booking | Private record inaccessible and unchanged |
| P02 | Anonymous/private and student/staff routes | Correct 401/403 policy with no leaked details |
| S01 | Every valid state transition | Correct state, timestamp, actor, note and allocations |
| S02 | Invalid, repeated or terminal-state action | 409; state/history unchanged |
| S03 | Concurrent incompatible transitions | One succeeds; coherent state and one matching event |
| S04 | Checkout before/after booked range | Rejected |
| S05 | Missing condition/rejection note | Validation error; no mutation |
| S06 | Active overdue loan followed by next approved pickup | Second checkout blocked; overdue return allowed |
| S07 | Concurrent checkout for same physical unit | At most one ActiveLoan |
| I01 | Duplicate inventory code | Useful conflict and no duplicate asset |
| I02 | Maintenance with active/future commitment | Rejected; existing booking remains valid |
| I03 | Maintenance/new-request race | Cannot end with maintenance plus new committed allocation |
| I04 | Booking on maintenance equipment | Rejected |
| DB01 | Failure partway through day-slot insertion | Whole transaction rolls back |
| DB02 | Real server process stopped/restarted | User/session/booking/state/history still persisted |
| DB03 | Clean migration and repeat seed | Schema valid; no duplicate or overwritten real user |
| DB04 | Memory/ORM contract parity | Same documented domain results |
| UI01 | Two-role full lending lifecycle | Server-confirmed state visible across contexts after refresh |
| UI02 | Conflict response after stale available calendar | Error visible, entered data preserved, availability refreshed |
| UI03 | Offline/error/slow request | Retryable feedback and no false success |
| UI04 | Rapid repeated submit | UI prevents accidental duplicates; server still enforces invariants |
| UI05 | Reload/logout/401 | Session behavior follows spec |
| UI06 | Keyboard forms/dialogs/calendar alternative | All required actions reachable with usable focus |
| UI07 | 390 px and 1440 px | No overflow; labels/actions readable |

## Browser/manual sequence

1. Start a clean seeded app and record commands/commit/database mode.
2. Open separate student A, student B and coordinator contexts.
3. A requests an asset; B attempts an overlapping date and sees a preserved-form conflict.
4. Coordinator approves A. A refreshes and sees the new status/history.
5. Coordinator checks it out on an allowed fixture date, then returns it with condition notes.
6. Verify A's history, B's privacy boundary and released availability.
7. Create/cancel/rebook; exercise a maintenance conflict; inspect a controlled overdue scenario.
8. Stop and restart the actual backend with the same SQLite file. Verify records/events remain through the UI.
9. Exercise mobile layout, keyboard navigation and failed network handling.
10. File each actual defect as `user-test-bug`, invoke PM grooming/QA case expansion, fix and independently retest.

Only create observed bug issues. A planned case is not evidence that the app has been run.

## Evidence rules

Record exact command, commit, environment, date and exit/result. Keep concise raw logs where practical and distinguish automated from manual checks. An API test client alone cannot establish that a browser screen works; reopening an ORM engine alone cannot establish a real process-restart test. State infrastructure limits instead of inventing a pass.


For #26, run `npm run build` then `npm run test:browser:resources` (same Chromium executable override as other suites if needed). It starts fresh strict servers at 5173/5196 and preview 5197, checks explore/signin/register at 390/1440 in isolated contexts, validates and decodes the declared local icon, and rejects all console/page/network errors without filtering. Results are written to ignored `frontend/test-results/resources/results.json`.

For #5, run `npm run test:browser:staff` with the same Chromium override. It starts Vite on 5182 (`GEARSHARE_STAFF_PORT` overrides), fixes Date to 2026-10-19T06:00:00Z, retains real timers and saves ignored screenshots/results under `frontend/test-results/staff/`. The real lending journey uses UI sign-in/action forms only; controlled read/write failure/empty responses are injected at the existing service boundary. It starts no backend and rejects console/page/request/API failures. Service tests cover the complete invalid-transition matrix, exact note and inventory bounds, UTC/club-local boundaries, custody/overdue, allocation release, maintenance conflicts, privacy and immutable results. These are mock checks, not backend security/concurrency/persistence evidence.

For #27, `npm run test:browser:labels` runs the QA-authored focused regression from a clean committed implementation. Its default strict port is 5191 (`GEARSHARE_LABELS_QA_PORT` overrides). `BASELINE=1` records failures without requiring a corrected result; normal execution requires all assertions to pass. It covers hidden naming geometry and retained browser-computed accessible names for every queue/inventory action variant, keyboard/focus/overflow, plus My reservations Upcoming/History at 390/1440. Results/screenshots are in ignored `test-results/qa27-before/` or `qa27-after/`. This focused runner complements the full surrounding staff/auth/catalogue/bookings suite; neither substitutes for the other's required criteria.

For #28, the [PM recovery decision](https://github.com/allfocusSS/gearshare/issues/28#issuecomment-6287892873) and [independent pre-fix R01–R08](https://github.com/allfocusSS/gearshare/issues/28#issuecomment-6287925097) require successful-command/failed-read coverage for approve, reject, cancellation from pending and approved, checkout and overdue return. Verify retained committed history/trimmed notes, hidden untrusted queues/counts/derived custody, persistent accessible read recovery after Back, disabled pending/repeated controls, read-only delayed/repeated retries and one coherent restored snapshot. Exercise actual command failures separately, along with both widths, keyboard/focus and the complete surrounding staff/auth/catalogue/bookings/#27 label regressions. Independent QA owns the focused runner and verdict; engineer results alone do not close #28 or satisfy the #5 mock-stage gate.

Run the handed-off independent focused script with `node tests/qa28.browser.mjs` from frontend, using the usual Chromium override. The strict default port is 5194 (`GEARSHARE_QA28_PORT` overrides); it starts Vite and the browser in one process and writes ignored `test-results/qa28-after/` screenshots/results. `BASELINE=1` records the uncorrected behavior in `qa28-before/` without treating expected recovery failures as a corrected PASS. The runner requires committed implementation and verifies that HEAD stays unchanged during execution.
