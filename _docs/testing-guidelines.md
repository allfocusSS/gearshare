# Testing and verification plan

Status: most product cases below remain planned. Iteration-0 independent QA passed; #2 mock identity/shell engineer checks and #24 FAIL→correction evidence are recorded in `evidence.md`, with independent corrected-candidate QA pending. Do not report the number of rows below as a count of passing tests or apply mock-auth results to real API security.

Current scoped frontend commands: `npm test` runs 11 service/date tests; `npm run test:browser` runs the actual mock app's auth/shell checks and the seven independently specified #24 regression groups. Browser setup and the executable override are documented in README. The committed browser script covers first-invalid enabled focus, repeated/delayed validation, error association, stable keyboard use, form-level failures, valid recovery, roles, fixtures and both required widths. Equipment/lending/API/storage matrix cases remain for their stage gates.

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
