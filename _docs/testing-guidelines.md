# Testing and verification plan

Current stage: see the [current gate record](iterations.md#current-stage). Historical entries below retain their point-in-time results.

Independent verdicts, the original failing #10 checkpoint and the #30 correction awaiting fresh QA are listed in [iterations.md](iterations.md#current-stage); exact executed commands are in evidence.md. The matrix below remains a case plan and does not establish an independent PASS for staff/storage behavior.

Current scoped frontend commands: `npm test` runs 84 auth/catalogue/booking/staff/inventory/date/privacy/version/contract tests (the original 78 plus six Unicode/code-point cases in `tests/text.test.mjs`); `npm run test:browser` runs the actual mock app's auth/shell checks and the seven independently specified #24 regression groups. Browser setup and the executable override are documented in README. The committed browser script covers first-invalid enabled focus, repeated/delayed validation, error association, stable keyboard use, form-level failures, valid recovery, roles, fixtures and both required widths. `npm run test:browser:catalogue` adds filter intersections, inclusive dates/invalid boundaries, anonymous privacy, maintenance, missing/empty/failure/loading states, concrete detail auth return and 390/1440 layouts, using a fixed browser Date. `npm run test:browser:bookings` exercises the #4 request/private history/cancellation/conflict journey on port 5181 with fixed Date. `npm run test:browser:staff` exercises the full student-to-coordinator lifecycle, staff transitions/custody, inventory, permissions, keyboard/focus, async failures/retries/empty states and 390/1440 layouts. Remaining API/storage cases follow their gates.

`cd backend && uv run --locked pytest` preserves all 137 #7 tests (35 health/contract/authoring and 102 auth/API cases) and adds #8 ASGI/domain/repository coverage. C01–C03/D01–D04 cover stable creation/seed order, exact joined-field search and Unicode lowercase, last scalar query values, date absence/strict full ASCII parsing and every inclusive range boundary, four-category unique seeds, all six reserving/terminal states, maintenance, exact public DTOs with anonymous/other-student privacy, a clock crossing midnight, future/leap-date seeds and fixtures that never move on reads. The application loads locked tzdata explicitly; a fresh-process test supplies an intentionally wrong host Almaty zone and still requires UTC+5 club policy. Repository tests check shared auth/inventory/schedule rollback, seed-failure recovery and immutable results. A small API/domain Unicode suite covers default lower versus casefold/normalization and final sigma beside newer Unicode Cased/Case_Ignorable characters; the separate full-scalar Node comparison is engineer evidence, not a million-case routine suite. Existing auth tests retain real Argon2id, strict fields/envelopes, absolute expiry, concurrency and secret-safe rollback/logging checks. These tests do not establish persistence or frontend HTTP integration.

The #9 suite preserves the 278 auth/catalogue/contract/authoring cases and adds private create/list/detail/cancel API/domain/repository cases. B01–B07/P01–P02 and applicable D01–D04/DB01 cases use a fixed clock, real memory transactions and schema-validated responses. Concurrent API contenders synchronize at the service entry before the adapter lock: conflicting creates must yield one complete 201 and one 409, and owner/coordinator cancellations must yield one complete 200 and one stale 409. Faults after booking/event insertion, the second slot insertion, each cancellation write and slot release must restore the entire prior snapshot. Trusted fixtures have real owner/actor references, chronological valid chains, event-count versions, inclusive slots and matching custody.

The #9 checkpoint's URL-encoded newline cancellation failure became actual bug [#29](https://github.com/allfocusSS/gearshare/issues/29). Its [PM topology decision](https://github.com/allfocusSS/gearshare/issues/29#issuecomment-6347336915) and [independent red baseline/cases](https://github.com/allfocusSS/gearshare/issues/29#issuecomment-6347497727) precede the correction. Preserve `tests/test_booking_api.py::test_p01_foreign_read_and_cancel_are_byte_identical_to_unknown_before_version_checks` and its `id\n` byte-equality assertion. The former `../unknown` parameter decodes into extra components and now has explicit generic-404/no-mutation cases in `test_booking_routing.py`, alongside separate decoded exact-action cases; it is not a malformed single-component private ID.

`uv run --locked pytest -q tests/test_booking_routing.py` runs 153 focused variants for complete decoded routing, LF positions/owned-ID alias denial, authentication/envelope/lookup order, action/detail method dispatch, complete Allow headers and true unknown topology. Every rejected request compares the complete store, including timestamps, events, slots and existing custody, plus exact Error bytes and headers (HEAD is bodyless). Before the #29 correction these cases had 127 failures/26 passes. Independent QA subsequently [passed/closed #29](https://github.com/allfocusSS/gearshare/issues/29#issuecomment-6347711615) and [#9](https://github.com/allfocusSS/gearshare/issues/9#issuecomment-6347723715) on canonical `79a77013b1090366dfa6e2349f9d4402658dabeb`; exact history remains in [evidence.md](evidence.md#iteration-3--29-booking-routing-correction). Preserve every red/passing assertion when changing routing.

The published #10 checkpoint `cba839e` added 261 staff API/atomic cases for S01–S10, I01–I04, role/envelope/lookup order, immutable projections/history, local-day boundaries, strict integer literals, scalar-safe notes/inventory, full invalid-transition combinations, exact rollback after every staff write, simultaneous checkout/duplicate-code creation, approve-versus-cancel and maintenance-versus-request in both legal orders. Its historical complete result was **814 passed / 51 failed**: the extracted shared route helper computed an empty method set from FastAPI's included-router wrappers. Actual same-owner Uvicorn passed ten staff lifecycle/custody/maintenance groups and reproduced empty `Allow` twice with the whole store unchanged. Preserve those original assertions, the LF-ID regression and this failure history.

After [#30 PM grooming](https://github.com/allfocusSS/gearshare/issues/30#issuecomment-6360070589) and [independent pre-fix QA](https://github.com/allfocusSS/gearshare/issues/30#issuecomment-6360130194), `test_exact_route_headers.py` adds 56 fixed-oracle variants for all 11 templates, collection aggregation, four auth categories, malformed envelopes, HEAD, LF IDs, decoded action precedence and true unknown paths. Every rejection compares the complete store and exact Error bytes/headers. The corrected complete suite has **921 passed**, preserving all 865 existing cases. `PYTHONPATH=. uv run --locked python scripts/check_exact_routes.py --output PATH` from `backend/` runs the compact engineer matrix through ASGI and actual same-owner Uvicorn, using real Argon2/HTTP account setup. Per transport: 133 passed, including 128 full-store rejection comparisons and five supported read/cancel/lifecycle/maintenance/overdue groups. This runner is engineer evidence; fresh independent QA still must verify every #30 and #10 criterion before closure. No persistence or integrated-browser PASS is claimed.

## Strategy

- Unit tests: date boundaries, normalization, transition rules and overdue calculation.
- Repository contract tests: the same externally observable behavior for the true memory adapter and file-backed SQLite/ORM adapter.
- API integration tests: real request schemas, authentication, roles, privacy, error codes and transaction rollback.
- Contract checks: validate `openapi.yml` and compare implemented request/response behavior to it. Do not discard the versioned assignment deliverable after FastAPI is added. Since #6, `cd backend && uv run --locked pytest` runs `tests/test_openapi_contract.py`: the real `openapi-spec-validator`; every `GearShareService` method (parsed from `types.ts`) maps to exactly one operation with `x-service-method`; 401/403/404/409/422 are documented where applicable; DTO fields, required lists and enums match `types.ts`; no response schema exposes `password`, `passwordHash` or `tokenHash`; and the mock-generated samples in `frontend/tests/fixtures/contract-samples.json` validate against their schemas (invalid inputs are rejected by the request schemas). `npm test` fails if those samples no longer equal what the mock produces. `tests/test_openapi_guards.py` adds linter-free authoring guards (no duplicate keys or empty values, no null in a structural position, complete descriptions, only known schema keywords, and every `example`/`examples` value valid exactly as written and already trimmed) so a mis-quoted flow mapping or a self-invalid example fails the repository suite. Redocly (`npx --yes @redocly/cli@1.34.5 lint openapi.yml`) and Spectral (`npx --yes @stoplight/spectral-cli@6.14.3 lint openapi.yml` with a ruleset extending `spectral:oas`) are run by hand for evidence and are not repository dependencies. Server-side behavior against the contract is verified in #7 onward; passing the contract tests does not prove a server exists.
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
| S03 | Concurrent incompatible transitions (approve versus cancel, both orders) | One succeeds; the other is a 409 with nothing changed; coherent state and one matching event |
| S08 | Stale `expectedVersion` on approve, reject, cancel, checkout, return | 409 `CONFLICT` with `fields.expectedVersion`; state, version, events and allocations unchanged; no silent refresh or retry |
| S09 | Missing, non-integer, zero, negative or oversize `expectedVersion` | 422 `VALIDATION_ERROR` with `fields.expectedVersion`; nothing changes; a non-owner still gets 404 and a student on a staff route 403 first |
| S10 | Booking `version` | 1 when created, +1 per successful approve, reject, cancel, checkout or return, equal to the event count; absent from anonymous availability and public assets |
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

For the #11 phase 1 schema checkpoint, `uv run --locked pytest tests/test_database_schema.py -q` (from `backend/`) runs 20
checks against fresh file-backed migrated SQLite databases. It exercises initial
upgrade, populated downgrade/reupgrade, model/schema parity, database uniqueness,
foreign keys, positive versions/state/date checks, partial-write rollback and
UTC/microsecond/local-date round trips after engine reopen. This does not yet
verify the ORM repository, shared service parity or real process restart (#12).
