# Verification evidence

Current stage update (2026-10-20): independent QA passed and closed #1–5 and the observed bugs #24–28, including the [#4](https://github.com/allfocusSS/gearshare/issues/4#issuecomment-6279522336), [#25](https://github.com/allfocusSS/gearshare/issues/25#issuecomment-6279464800), [#27](https://github.com/allfocusSS/gearshare/issues/27#issuecomment-6287900059), [#28](https://github.com/allfocusSS/gearshare/issues/28#issuecomment-6294272406) and [#5](https://github.com/allfocusSS/gearshare/issues/5#issuecomment-6294295984) PASS verdicts; the standalone mock stage gate is satisfied. [#6](https://github.com/allfocusSS/gearshare/issues/6) is an engineer candidate: root `openapi.yml` (OpenAPI 3.1) is derived from the completed `GearShareService`, adds private `Booking.version` with a required `expectedVersion` precondition on the five booking mutations, and is checked by `backend/tests/test_openapi_contract.py` (see `_docs/api.md` and evidence.md). #6 stays open for independent QA. #7 and later stages (backend business APIs, persistence, HTTP adapter) remain gated. Historical entries below retain their recorded point-in-time results.

Current application status: #1–5 and #24–28 are independently verified and closed; the standalone mock frontend gate passed. The #6 `openapi.yml` contract candidate (below) has passing engineer checks and awaits independent QA. No backend business API, persistence, HTTP adapter or final submission PASS is claimed. Historical records below preserve the actual failures and pending states from their original checkpoints.

## Work actually completed

- Read the two assignment articles and combined their specification/issue workflow with the requested implementation sequence.
- Selected GearShare, documented the distinction from StudyTrack and proposed precise MVP rules.
- Prepared product, architecture, design, role/process, draft backlog and test-plan Markdown.
- Initially checked connected GitHub repository access: only `allfocusSS/studytrack` was returned. The user subsequently supplied `allfocusSS/gearshare`, and MVP #1–20 plus post-MVP #21–23 were published before application code.
- Implemented the groomed #1 bootstrap: React/TypeScript startup screen, FastAPI health endpoint, real endpoint test, public dependency locks and verified setup/run/check commands.
- Implemented the groomed #2 shell/auth boundary after #1 QA PASS; recorded the real #24 browser defect, stopped for PM grooming and independent QA reproduction/cases, then corrected its focus lifecycle and ran the scoped regression suite. QA subsequently passed and closed both.
- After those QA gates, implemented #3 public catalogue/filter/detail/anonymous-calendar scope and ran its dedicated tests plus the preserved auth/focus regression.
- Implemented independently verified #4 private requests/history/cancellation and the #25 availability correction. Added #5 mock staff transitions, custody/counts/queues and inventory; observed #27 through real screenshot inspection, waited for PM/QA cases and applied its narrow visually-hidden utility correction. Independent QA later passed #27, #28 and #5.
- Derived the #6 `openapi.yml` and `_docs/api.md` from the QA-passed mock, added Booking `version`/`expectedVersion` optimistic concurrency to the shared types and mock, and added locked backend contract tests (see the #6 section below).

Planning-document checks completed on 2026-10-19: 24 Markdown documents, 20 unique MVP draft IDs, 3 unique post-MVP draft IDs; all relative Markdown links resolve; every MVP draft contains Goal, Description, Acceptance criteria, Out of scope and Constraints. These checks verify documents only; they are not application tests.

## Application checks

| Check | Result | Command / commit / observation |
| --- | --- | --- |
| Bootstrap health test/build | Independent QA PASS, #1 closed | Published `a8ec9b7469b9d1e2f091bc0fdf0369be7e9ba6ad`; [actual QA evidence](https://github.com/allfocusSS/gearshare/issues/1#issuecomment-6261432589); historical engineer details below |
| Mock frontend browser flows | #1–5 and #24–28 independently verified and closed | Independent QA PASS for the mock stage ([#5](https://github.com/allfocusSS/gearshare/issues/5#issuecomment-6294295984)). The #6 changes (Booking version) were re-run by the engineer on `0486a4e`: all browser suites exit 0 (see the #6 section) |
| OpenAPI validation | Engineer PASS on `0486a4e`; independent QA pending (#6) | `cd backend && uv run --locked pytest` 22 passed including `tests/test_openapi_contract.py` (21); `uv run --locked openapi-spec-validator ../openapi.yml` reports OK; details in the #6 section |
| In-memory API tests | Not run | Backend currently exposes only health; domain/memory stage follows mock/contract gates |
| ORM/SQLite tests | Not run | Storage implementation does not exist |
| Concurrent requests/rollback | Not run | Deferred to actual database stage |
| Process-restart persistence | Not run | Requires actual runnable backend |
| Two-role browser integration | Not run | Requires implemented frontend/backend |
| Exploratory user testing | Mock auth/catalogue/student/staff screens exercised | Real #24–#28 defects were each filed before correction and independently verified and closed. Final integrated exploration remains outstanding |
| Final CI / clean checkout | Not run | Bootstrap locks were installed into a clean source copy; independent committed-checkout QA and final CI remain separate checks |

## Iteration 0 — engineer verification for #1

- Date: 2026-10-18 UTC (2026-10-19 Asia/Almaty).
- Role: software engineer, not independent QA. Baseline: `ce3adc901205ae9c91fd17c361d833c2c0c7e85a`.
- Candidate: the commit carrying this record, with its exact SHA in the engineer handoff on #1. The orchestrator publishes the identical tree before independent QA.
- Environment: Linux x86_64, Python 3.12.14, uv 0.12.23, Node 24.19.0, npm 11.9.0. No storage, accounts or fixture date are used.
- Clean installation used a separate copy of `backend/` and `frontend/` without `.venv`, `node_modules`, `dist` or Python caches. It shared package download caches, but no globally installed application packages. Lock sources were checked: public PyPI/Pythonhosted and npm tarballs only, with no absolute runtime paths.

| Working directory | Exact command | Actual result |
| --- | --- | --- |
| `backend/` | `uv sync --locked` | Exit 0; fresh local virtual environment; 22 locked dependencies installed |
| `backend/` | `uv run --locked pytest` | Exit 0; `tests/test_health.py::test_health_returns_ok`, 1 passed in 0.20s; actual ASGI endpoint returned 200 and exactly `{"status":"ok"}` |
| `frontend/` | `npm ci` | Exit 0; 25 packages installed from the lock |
| `frontend/` | `npm run typecheck` | Exit 0 |
| `frontend/` | `npm run build` | Exit 0; Vite 8.3.4 produced HTML/CSS/JS; 15 modules transformed |
| `backend/` | `uv run --locked uvicorn app.main:app --reload` | Development server started at `127.0.0.1:8000`; readiness and live health response checked |
| Repository root | `curl --fail http://127.0.0.1:8000/health` | Exit 0; live HTTP 200 with `{"status":"ok"}` |
| `frontend/` | `npm run dev` | Development server started at `127.0.0.1:5173`; HTML title and Vite-transformed startup module returned HTTP 200 |
| `frontend/` | `npm run dev -- --port 5174` | Port override started at `127.0.0.1:5174`; HTTP 200 |

The initial typecheck detected a missing CSS import declaration; adding `vite/client` types corrected it before the final successful check. The endpoint test uses HTTPX's ASGI transport directly to avoid Starlette's deprecated HTTPX TestClient integration. npm emitted a host-environment `http-proxy` configuration warning; installation and checks exited 0.

Tool command sessions have isolated loopback namespaces, so startup HTTP checks launched servers and their probes together in one process namespace; the checked server commands are exactly those shown above. The smoke-check processes were stopped after verification. No visual browser pass was claimed by this bootstrap engineer record. No product/browser exploration was performed at that stage, so no `user-test-bug` was invented. Independent QA subsequently passed #1 and closed it; its actual evidence is linked above.

## Iteration 1 — #2 shell/auth and #24 focus correction

Date: 2026-10-19 UTC. Role: software engineer. Environment: Linux x86_64, Node 24.19.0, npm 11.9.0, Chromium 153.0.8010.0, locked Playwright 1.62.1. No backend process, API, persistent storage or real credentials were used. The demo's date label was derived from current `Asia/Almaty` time; date-boundary tests injected fixed UTC instants.

### Real failure, issue and authorized correction

The first running-browser check used the local #2 checkpoint `70c601820cabf4c86fc73ba22eb251eaf934246e`, published as `b23325c27166776d44c26b063187f745459e8b98`; both have tree `bcf76dc6d121c22b60ee09596d049409e3a306c8`. At 1440×1000 in the Normal fixture, `#/signin?returnTo=reservations`, Username → Tab → Password → Tab → Sign in → Enter with empty fields showed both validation errors. After pending ended, Username was enabled but `document.activeElement === document.getElementById('username')` was false. The component tried to focus a still-disabled input. Prior desktop shell/no-overflow and keyboard Tab-order checks had passed; no console/page/request/API errors were observed before this failure.

Created [#24](https://github.com/allfocusSS/gearshare/issues/24) with `mvp` and `user-test-bug` before correction and stopped implementation. PM groomed it in [the READY handoff](https://github.com/allfocusSS/gearshare/issues/24#issuecomment-6261606500). Independent QA [reproduced the published failure, posted FAIL and seven regression cases](https://github.com/allfocusSS/gearshare/issues/24#issuecomment-6261602193): active element was BODY after empty sign-in and after password-only registration failure. Only after these gates did engineering resume.

The correction in `AuthPage.tsx` moves first-invalid-field focus to an effect keyed to the new error result and pending state. It runs after React commits enabled controls, checks that the target is enabled, gives Username priority, and leaves form-level failures alone. Ordinary typing/unrelated renders do not rerun it. The corrected candidate is the commit containing this record; exact local SHA/tree and published identical-tree mapping are recorded in the engineer/orchestrator handoffs on #2/#24. Independent corrected-candidate QA remains pending.

### Commands actually executed after correction

All commands below ran from `frontend/` and exited 0. The test browser was an already provisioned `/tmp/chromium`; `npx playwright install chromium` is documented for clean machines but was not run by this engineer.

| Command | Actual result |
| --- | --- |
| `npm install --save-dev --save-exact playwright@1.62.1` | Added the locked browser-test dependency from public npm URLs |
| `npm test` | 11 passed, 0 failed; async mock auth roles/public fields, normalization/duplicates, exact username/password bounds, invalid credentials/no mutation, memory isolation/reset, empty/error/loading fixtures, stale-request reset and injected club-local date boundaries |
| `npm run typecheck` | Exit 0 |
| `npm run build` | Exit 0; Vite 8.3.4, 23 modules transformed, production HTML/CSS/JS generated |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/tmp/chromium npm run test:browser` | Final run exit 0; all 26 scoped browser checks passed; test starts Vite on 127.0.0.1:5178, exercises the actual app, then stops server/browser in the same process namespace |

The final browser run covers the original reproduction at both 1440 px and 390 px, immediate typing, visible 2 px focus outline, Tab/Shift+Tab/Enter, all six sign-in/registration username-only/password-only/both-invalid combinations, repeated invalid submission after editing, valid 3/30-character usernames and 10/128-character passwords, changed-case/whitespace duplicate registration, stable focus after typing/Tab, and successful return navigation. It also covers student/coordinator fixtures, logout/reload, direct staff-route gating, all four demo modes, retryable errors, preserved values, no false success, delayed invalid/valid submissions, and disabled repeated Enter/click attempts. Measured `document.documentElement.scrollWidth <= innerWidth` at both required widths on shell/auth/staff-preview/error screens. No page/console/request errors or API requests occurred.

| QA pre-fix regression group | Engineer corrected-browser observation |
| --- | --- |
| 1. Original empty sign-in at both widths | Enabled Username focused; both error IDs associated; immediate typing worked |
| 2. Sign-in password-only and both-invalid | Enabled Password focused for password-only; Username first when both invalid; entered values retained |
| 3. Registration field failures and valid boundaries | Password-only focuses Password; Username first when invalid; 3/30 and 10/128 valid cases created students and returned to My reservations |
| 4. Normalized duplicate | Visible username conflict; enabled Username focused; input values retained; no success/session creation |
| 5. Loading/repeated submission | Inputs/submit stayed disabled; repeated Enter/click ignored; enabled invalid field focused afterward; valid retry completed |
| 6. Form-level errors and focus stability | Wrong credentials/service errors re-enabled the form without false invalid fields or forced input focus; keyboard retry worked; typing/Tab was not pulled back |
| 7. Labels/focus/roles/mobile | Named labels and associated errors present; focus outline visible; roles/nav correct; no page overflow at 390/1440 |

Screenshots of desktop Explore/sign-in, mobile sign-in/coordinator and both validation widths were generated and visually inspected. Reproducible test source is committed at `frontend/tests/auth.browser.mjs`; generated browser records/screenshots remain ignored. Intermediate harness assertions were corrected for the CSS-capitalized role display and to wait for logout to finish before its final screenshot; these were test timing/expectation fixes, not additional product defects. Earlier implementation TypeScript navigation-literal errors and an npm command initially run from the wrong directory were corrected before the passing commands above. npm emitted the host's `http-proxy` warning without failing.

Limits: these are engineer checks of mock shell/auth only. No independent PASS/closure, equipment/booking behavior, actual API security, storage, restart or integrated lending check is claimed. #2 and #24 stay open for independent QA; no #3+ implementation is authorized by this record.

## Iteration 1 — #3 public catalogue, detail and anonymous availability

Prerequisite gate: independent QA passed and closed [#24](https://github.com/allfocusSS/gearshare/issues/24#issuecomment-6261813373) and [#2](https://github.com/allfocusSS/gearshare/issues/2#issuecomment-6261825132) at published `13721cf559812c6337cee8c43bb6890d236139ba`, tree `2facd11b590f45c698dc58f2f08cb40c6e6a78ba`. This supersedes the historical pending notes above without erasing the actual failure trail.

Engineer date/environment: 2026-10-19 UTC, Linux x86_64, Node 24.19.0, npm 11.9.0, Chromium 153.0.8010.0 / locked Playwright 1.62.1. Baseline: that published prerequisite commit. Candidate: the commit containing this record; exact local/published SHA/tree mapping is recorded in the #3 engineer/orchestrator handoff. All commands below ran from `frontend/` and exited 0; no dependency reinstallation or backend process was needed.

| Command | Actual result |
| --- | --- |
| `npm test` | 22 passed, 0 failed: 11 new catalogue/date/filter/privacy tests plus 11 preserved auth/date tests |
| `npm run typecheck` | Exit 0 |
| `npm run build` | Exit 0; Vite 8.3.4 built 30 modules |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/tmp/chromium npm run test:browser:catalogue` | Exit 0; 28 dedicated running-browser checks passed, including 390 px/1440 px layouts |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/tmp/chromium npm run test:browser` | Exit 0; all 26 preserved auth/focus/role/fixture checks passed; its empty-view assertion now targets the actual empty catalogue |

The new service suite verifies ten unique physical-unit IDs/codes across all four categories; intersecting search/category/paired dates; inclusive occupied endpoints and next-day adjacency; today/exact 14 days/T+90 acceptance; partial/malformed/past/reversed/15-day/out-of-horizon rejection without result data; maintenance exclusion; missing/empty/error/recovery; immutable public copies; relative date fixtures at a UTC/club-local date boundary; and exact public output fields. Anonymous and coordinator public responses match. Availability contains only asset identity, timezone/window and date/state pairs, with no borrower, purpose, private notes or booking IDs.

The catalogue browser fixes Date to `2026-10-19T06:00:00Z` (club date 2026-10-19) while real async timers continue. Actual observations: ten public units with no availability claim before both dates; combined filters selecting only CAM-001 for 2026-10-20; occupied inclusive 2026-10-21..23 yielding no matching camera; each invalid-range case showing field errors and hiding stale results; T+90 on 2027-01-17 accepted; same-day duration one; calendar selection/duration, occupied/selected hatch+× states and 2026-10-24 adjacency correct; month navigation bounded at January and 2027-01-18 disabled. Maintenance cannot appear requestable. Missing equipment returns to Explore. Empty/error/loading modes and catalogue/detail retry/recovery work. Existing sign-in returns to the concrete equipment detail.

Measured root `scrollWidth <= innerWidth` on catalogue/detail/invalid/error screens at 390 px and 1440 px; grid has three columns at 1440 and one at 390. Inspected desktop catalogue/detail and mobile detail screenshots, including readable date fields, range summary and occupied/selected states. A targeted DOM/screenshot probe confirmed the unfocused skip link remains above the viewport (`top=-100`, `bottom=-53`) while the end-date input is active; mobile full-page capture was normalized to the page top. No UI change or product bug was needed for that capture artifact.

No console/page/request errors, cross-origin/API requests or newly observed product defect occurred in these checks. Test servers (5178/5179; targeted screenshot probe 5180) and browser ran within each command's process namespace and were stopped afterward. Committed reproducible tests are `catalogue.test.mjs` and `catalogue.browser.mjs`; generated results/screenshots are ignored. npm's host `http-proxy` warning did not affect exit status.

Limits: engineer mock-only verification, not independent QA or real API security. No request creation/cancellation/history, staff mutation, OpenAPI/backend, persistence/restart, CI or integrated lending PASS is claimed. #3 remains open for independent QA; the full mock-stage gate remains after #5.

## Per-check record template

Date/time:

Tester role/session:

Repository and tested commit:

Environment, storage mode and fixture date:

Command or exact manual steps:

Observed result and exit code:

Relevant acceptance criteria / test IDs:

Bug issue, correction commit and retest, when applicable:

## GitHub completion audit

Remote: https://github.com/allfocusSS/gearshare.

MVP issues #1–20 are published and PM-groomed. #1–5 and observed bugs #24–28 were checked with `gh api repos/allfocusSS/gearshare/issues?state=all` on 2026-10-20 and are closed after independent QA PASS; #6–20 are open, and #6 is an engineer candidate awaiting QA. Post-MVP #21–23 show as closed on GitHub although they are deferred scope; they were not touched or re-verified here. No final completion count is claimed; full product/integration verification remains outstanding.

Do not report “0 open issues” as completion before the backlog exists. On final submission, record the actual issue counts and links for queries `is:issue is:open label:mvp` and `is:issue is:open label:user-test-bug` in the correct repository.

## Iteration 1 — #4 engineer candidate

2026-10-19 UTC; Linux x86_64, Node 24.19.0, npm 11.9.0, Playwright 1.62.1 with Chromium 153.0.8010.0 at `/tmp/chromium`. PM handoff: https://github.com/allfocusSS/gearshare/issues/4#issuecomment-6267394270. Candidate: the commit containing this record, with exact published SHA in the engineer handoff.

Executed from frontend/: `npm test` passed 27 tests; `npm run typecheck` and `npm run build` passed. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/tmp/chromium npm run test:browser:bookings` passed the real-app signed-out asset return, required purpose/dates, failed request/retry with disabled pending controls, one request under double-click, private list/details/events, cancellation/history, cancellation/rebook, deterministic conflict with retained purpose/dates and refreshed calendar, overdue visibility, forbidden cancellation absence, separate account privacy, and 390/1440 layout checks. `test:browser:catalogue` passed all 28 checks after updating its public-metadata assertion to exclude the signed-in user's own new request form. Browser scripts use fixed Date with real timers. `test:browser` passed all 26 preserved auth/focus/fixture/role checks.

Service tests cover anonymous access, cross-user read/cancel hiding, ignored injected ownership/state, immutable result copies, UTC create/cancel events, inclusive overlap/adjacency/other units, seeded states/coordinator cancellation, invalid/maintenance/missing requests with no partial effects, legal duration/horizon boundaries, cancellation release/history and repeat/terminal failures. Checks establish only browser mock behavior, not backend security, persistence, transactions or independent QA. #4 remains open.

### Resumed engineering verification and observed failures

The preserved #4 candidate was resumed in a fresh engineer session on 2026-10-19 UTC without discarding changes. `npm test` passed 27/27, `npm run typecheck` exited 0, `npm run build` exited 0 (31 modules), `test:browser:bookings` passed its scoped journey, and `test:browser` passed all 26 checks. The same Chromium executable override was used.

The catalogue browser rerun exited 1 at `tests/catalogue.browser.mjs:143`, timing out after 30 seconds while waiting for the mobile second-visit text `3 selected days are unavailable.` All earlier desktop/date checks passed. An isolated repeat was started to distinguish the test from a product issue; this supersedes any blanket claim that the current rerun passed every suite.

A targeted running-browser check found a separate real request defect: sign in as maya_student, visit accessory-03, request 2026-10-19..2026-10-19 with purpose `Club capture project`. After the pending-approval success message, the panel still said `Available for selected dates` and the day button still had accessible name `2026-10-19: Available, selected`. The booking exists, but the detail view's availability snapshot is stale after a successful request. Desktop/mobile screenshots were generated under ignored `frontend/test-results/bookings/`. No correction was applied; this needs the user-test-bug → PM → QA regression → engineer loop before independent #4 acceptance.


### #26 engineer resource correction (2026-10-19; independent QA pending)
- Added original local `frontend/public/favicon.svg` (cobalt G/slash mark, no third-party asset) and explicit SVG icon declaration in `frontend/index.html`. The declared `/favicon.svg` replaces the implicit missing `/favicon.ico`; no console suppression or business/API/route changes. Existing auth, catalogue and booking browser scripts unchanged.
- Added `npm run test:browser:resources`: 18 fresh Chromium contexts across Vite dev 5173 and strict 5196, production preview 5197, widths 390/1440, and explore/signin/register hash routes. Each observed successful browser icon delivery via CDP, explicitly checked response 200 / `image/svg+xml` / 371 bytes, decoded the image, and required empty console/page errors, failed requests and HTTP >=400 responses. All 18 passed. JSON details: ignored local `frontend/test-results/resources/results.json` (ephemeral, not a published attachment).
- Actually run in frontend: `npm test` 27/27; `npm run typecheck` exit 0; `npm run build` exit 0. With `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/bin/chromium`: `npm run test:browser` 26 checks passed (default suite port 5178); `npm run test:browser:catalogue` 28 checks passed (5179); `npm run test:browser:bookings` passed (5181); `npm run test:browser:resources` passed. Every browser command exited 0; servers stopped by harnesses.
- Original fresh strict-port reproduction is covered at 5196, plus default Vite 5173 and built production preview. Auth recovery/navigation and catalogue interactions passed the unchanged suites; production code diff is icon declaration/resource only. No backend test run (no backend changes).
- Environment limitation: Node 22.22.0/npm 10.9.4, not repository-required Node 24/npm 11; system Chromium override used. These are engineer results, not independent QA approval; #26 remains open.

### #26/#25/#4 catalogue readiness correction (2026-10-19; engineer verification)

Independent QA of `3613944f2d76ce2234ff2d0efa11e53fbe472f73` failed the unchanged catalogue suite on strict ports 5173 and 5196 after 19 checks, at the mobile second detail visit (`tests/catalogue.browser.mjs:143`). The exact wait for `3 selected days are unavailable.` timed out; recorded console/page/request/API-error arrays were empty. The prior engineer success does not supersede this failure. The original local report remains `/tmp/qa26-report.md`.

The equipment-title wait also matched the departing catalogue card heading, allowing the first date fill to target the catalogue input before detail navigation completed. Added the same unique `Check availability` heading wait already used on the first detail visit, before the mobile date range fill. All functional and diagnostic assertions and all application source remain unchanged; this is a test synchronization repair.

From `frontend/`, with Node 24.19.0/npm 11.9.0 and `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/workspace/scratch/5919f41ce139/studytrack-browser-tools/extracted/chromium` (Chromium 153.0.8010.0), actually ran `GEARSHARE_TEST_PORT=5173 npm run test:browser:catalogue` and `GEARSHARE_TEST_PORT=5196 npm run test:browser:catalogue`. Both exited 0 with all 28 checks passed and empty console/page/request/API-error arrays. Local raw logs and JSON snapshots are `/tmp/engineer26-catalogue-{5173,5196}.log` and `/tmp/engineer26-catalogue-{5173,5196}-results.json`. Unaffected suites were not repeated because the independent run already passed them against the same application source. This commit is the local correction candidate, awaiting fresh independent QA; no issue was closed or external publication performed.

## Iteration 1 — #5 functional checkpoint and observed #27 (2026-10-20 UTC)

Role: software engineer. Prerequisite #4 was independently [passed and closed](https://github.com/allfocusSS/gearshare/issues/4#issuecomment-6279522336) after #25/#26. #5 scope is the [actual groomed issue](https://github.com/allfocusSS/gearshare/issues/5#issuecomment-6267473702), with no contract/API/storage work. Start `ef8fc476b5821e5405c32136e55ddf9902eb0d25`. The implementation checkpoint local `428883de50dc2c14a72fd70b8e906f09fedcb52c` was published as `ddb1841a4164f86ab6877b3b03fa911d8b7c6840`, identical tree `6a27f9fa48070b7e9f44b012baf7cdd445a06cb6`. The commit containing this record adds runnable tests and handoff documents; it does not claim independent QA.

Environment: Linux x86_64, Node 24.19.0, npm 11.9.0, locked Playwright 1.62.1 and Chromium 153.0.8010.0. Following a scratch-environment reset, dependencies were restored with `npm ci`. The restored browser override is `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/workspace/scratch/e3fbdcf9622e/browser-tools/extracted/chromium`. Every browser script starts Vite and Chromium within the same Node process namespace and stops both. There was no backend process or API/storage usage. Browser Date is fixed to `2026-10-19T06:00:00Z`; async timers run normally.

Actually executed from repository root with `--prefix frontend`, or equivalently from `frontend/` without that option:

| Command | Observed result |
| --- | --- |
| `npm ci` | Exit 0; 27 locked packages installed |
| `npm test` | 41 passed, 0 failed; all 31 predecessor tests retained plus 10 staff/inventory groups |
| `npm run typecheck` | Exit 0 |
| `npm run build` | Exit 0; 33 modules, production bundle generated |
| `npm run test:browser` with Chromium override | Exit 0; all 26 auth/focus/role/fixture/mobile checks passed |
| `npm run test:browser:catalogue` with override | Exit 0; all 28 catalogue/date/privacy/detail/mobile checks passed |
| `npm run test:browser:bookings` with override | Exit 0; full existing student request/private history/cancel/conflict/availability checks passed |
| `npm run test:browser:staff` with override | Exit 0; all 8 functional groups (four at each of 1440/390 px) passed |

The staff service groups exercise every invalid/repeated/terminal transition and unchanged snapshots; every permitted transition; trimmed 0/2/3/500/501 notes; canonical actor/action/prior/new/note/UTC events; booking-ID audit linkage; returned/rejected/cancelled allocation release; inclusive club-local checkout dates including UTC/local year rollover, expired approval and checkout; derived overdue and permitted late return; second physical checkout blocked until return; competing mock operations; every staff-method visitor/student denial; unique normalized inventory codes; exact field/category bounds; injected ownership/state/actor/audit rejection by explicit copying; preserved Booking snapshots/history after inventory edits; maintenance with active/today/future commitments and resolved/past commitments; new-request/maintenance interleavings; immutable result copies and reset-during-pending failures. These JavaScript mock interleavings are not database race or transaction proof.

The new staff browser source uses actual UI sign-in and forms for browse→student request→coordinator approve→checkout with condition→return with condition→student history at both widths. It verifies actual queue/count updates, no duplicate request/event, first-invalid enabled focus, keyboard approval, return focus, terminal history, staff gating and direct mock 401/403 results. It also runs future-date checkout failure, overdue pickup custody conflict, late return, subsequent pickup and return, coordinator cancellation, inventory create/edit/duplicate errors with preserved fields, search empty state, maintenance conflict then rejection/resolution and state recovery. Controlled service-boundary read/write results additionally verify loading, explicit retry, real zero counts/empty responses, disabled pending controls, failed saves without false success, retained entries and successful retry. Root scroll width stays within 390/1440 throughout the tested queue/detail/form/error/empty screens. Console/page errors, failed requests and API requests were all empty.

Two initial new-harness failures were setup/selector errors: an exact success-text locator also contained the nested View my reservations link, and a controlled read test attempted to remount an already-current hash route. The selector now targets the containing success text and the read test first leaves the page. No application source or behavioral assertions were changed for either repair. Preserved ignored diagnostics are `frontend/test-results/staff/harness-text-match-failure.json` and `harness-remount-failure.json`; the final successful functional record is `results.json`.

### Actual visual defect: #27, open before correction

Inspecting the actual desktop screenshots found that `.sr-only` is used by row-action suffixes/table captions but has no CSS definition. Accessibility-only asset/code text and redundant captions were visibly rendered, crowding and wrapping staff actions. Parent filed [#27](https://github.com/allfocusSS/gearshare/issues/27) before correction against published `ddb1841a4164f86ab6877b3b03fa911d8b7c6840`; PM grooming and independent QA regression cases are pending. No correction or visual PASS is claimed in this checkpoint. Functional browser results above do not supersede that defect.

Pre-fix screenshots were generated under ignored `frontend/test-results/staff/`: `desk-1440-prefix.png`, `inventory-1440-prefix.png`, `desk-390.png` and `inventory-390.png`. These local images are transient diagnostics, not published attachments. The durable deliverables are committed test source and the precise reproduction/command evidence here and on #27. The planned correction must preserve accessible action names, table captions, focus and existing student regressions.

Limits: memory-only frontend candidate, not independent QA, server authorization, backend transactions, OpenAPI, persistent storage/restart, final integration or project completion. #5 and #27 remain open; #6 cannot start before the full independent mock-stage PASS.

## #27 corrected implementation and final engineer handoff (2026-10-20 UTC)

The actual defect above remains preserved. Correction began after the [PM handoff](https://github.com/allfocusSS/gearshare/issues/27#issuecomment-6283355421), [independent pre-fix regression cases](https://github.com/allfocusSS/gearshare/issues/27#issuecomment-6283360947) and [adjacent-case addendum](https://github.com/allfocusSS/gearshare/issues/27#issuecomment-6283379577). The #5 functional/docs checkpoint local `b6f9f1dcaf4b3f71dadbff45617abdea00165854` was published as `d60e3225e19ff7539226d60f0266b6c6610dd3eb`, identical tree `63e06f4920f75fbdbe70ccb4ddfc1b5fac3ee3b5`, before the correction.

The application change is one shared `.sr-only` CSS utility: absolute positioning, a one-pixel box, clipping/overflow containment and no normal layout contribution. Existing naming markup, visible actions, service methods and business behavior are unchanged. Captions and asset/code suffixes remain available to the accessibility tree. The QA-authored `staff-labels.qa.browser.mjs` was included unmodified after its final handoff; `staff.browser.mjs` also checks the student's hidden asset suffix geometry while retaining its descriptive accessible button name.

Corrected implementation local `2bd9b263ec5dc718f0611d6636244c0ff54b4428` was published as `f89c963b8b0193d159f74742e126a966a0053bd3`, identical tree `87b7f39c81c9814d21dd5b4dc3ba66f98618cb53`. The final handoff commit containing this record changes Markdown only, so it retains the exact corrected application/test source. No issue was closed by engineering.

### Checks actually rerun by the engineer on f89c963

Environment: Node 24.19.0/npm 11.9.0. From repository root:

| Command | Actual result |
| --- | --- |
| `npm test --prefix frontend` | Exit 0; 41 passed, 0 failed |
| `npm run typecheck --prefix frontend` | Exit 0 |
| `npm run build --prefix frontend` | Exit 0; Vite 8.3.4, 33 modules |

The same pre-fix application source had also passed `node tests/qa4.browser.mjs` (four private-history/async cancellation groups) and `node tests/qa25.browser.mjs` (four controlled availability/race groups) with the Chromium override. Those runs, like the pre-fix auth/catalogue/bookings/staff runs above, do not establish a post-fix full-suite result.

### Recorded focused browser result and visual inspection

Reviewed the preserved focused runner output `frontend/test-results/qa27-after/results.json`: tested commit `f89c963b8b0193d159f74742e126a966a0053bd3`, timestamp `2026-10-20T04:28:52.078Z`, Chromium 153.0.8010.0, Node 24.19.0; 448 of 448 assertions successful, zero failures, console/page errors or failed requests. This is the focused execution already performed by the QA role, not a claim that the engineer repeated it or that either issue has an overall independent PASS verdict. Reproduce it from frontend with the Chromium override and `npm run test:browser:labels`; port 5191 can be changed using `GEARSHARE_LABELS_QA_PORT`.

The preserved pre-fix focused record `frontend/test-results/qa27-before/results.json` tested `b6f9f1dcaf4b3f71dadbff45617abdea00165854`, whose application source matched the original reproduction: 276 of 346 assertions successful and 70 expected clipping/layout failures. The final expanded runner adds the My reservations/Space/keyboard adjacent cases. Naming/focus/overflow checks on the baseline passed; the missing clipping utility was the observed failure.

Engineer visually inspected the corrected `qa27-after/desk-pending-requests-{1440,390}.png` and `inventory-{1440,390}.png` screenshots. The duplicated captions and suffixes no longer paint or crowd actions; desktop rows and mobile cards retain visible identity/status and concise labels. The focused result also records all four queue variants, inventory active/maintenance action names, computed clipping/geometry, browser accessibility snapshots, Tab/Shift+Tab/Enter/Space, visible focus/return focus and the student's Upcoming/History details at both widths. Screenshots/results remain ignored local diagnostics; committed runner source and this exact record provide reproducibility.

Remaining verification is explicit: the engineer did not rerun the full staff/auth/catalogue/bookings browser suites after the CSS correction. Fresh independent QA must run the required surrounding suites and verify all #5/#27 criteria on the final published candidate before posting a full verdict and closing either issue. The complete mock-stage gate remains blocked until that succeeds; #6/OpenAPI and later stages are not started.

## #28 coordinator recovery working checkpoint (2026-10-20 UTC)

Independent QA subsequently [passed and closed #27](https://github.com/allfocusSS/gearshare/issues/27#issuecomment-6287900059), but [failed #5](https://github.com/allfocusSS/gearshare/issues/5#issuecomment-6287911470) on a genuine successful-approval/follow-up-read failure. The actual [#28](https://github.com/allfocusSS/gearshare/issues/28) reproduction, failing published `e4b4593f5d3235bf0f87a9ff8158fe77097d3a33` / tree `5715a2e7b1d36613562bb7713599858dc4a79419`, PM grooming and independent pre-fix cases were read before correction. The original failure remains in the issue; it is not reclassified as a test problem.

This working checkpoint changes CoordinatorPage only: a command result confirms the selected Booking, while the complete desk snapshot is withheld until a fresh read succeeds. Separate command/read error state preserves “action saved; desk could not refresh” across Back and retries, suppresses unverified counts/custody/overdue and dependent actions, and restores a single staff snapshot on success. Guarded refresh calls reads only and recovers meaningful focus. No service/backend/contract/storage behavior changed.

Engineer environment: Node 24.19.0, npm 11.9.0. Actually executed from `frontend/`: `npm run typecheck`, `npm test` (41 passed, 0 failed) and `npm run build` (33 modules); all exited 0. This record is the source checkpoint, before focused/surrounding browser verification. Browser results and the exact tested SHA will be recorded in the final handoff. #28 and #5 remain open; #6 remains gated.

The combined source/test checkpoint is local `e7cab7c10c436e39983535588b6a63d5c00fe519`, published as `2947e1232e1d619005ebcc6c0838c8ac8a0bb549`, identical tree `1bd5406797ccb816dada68fd0e15148426fbeda5`. It includes the independently handed-off `frontend/tests/qa28.browser.mjs` unchanged (SHA-256 `af02b7f4b0702af98d988852f1933ea15b5db83e5aa5f2f5c4e98f9b926ddd9a`). QA's [isolated old-candidate baseline](https://github.com/allfocusSS/gearshare/issues/28#issuecomment-6288011243) exercised all six commands at both widths: 635 assertions, 505 successful and 130 expected recovery failures, with no console/page/request/API errors. This baseline belongs to QA and predates correction verification; the engineer has not claimed it as a corrected result.

## #28 completed engineer checks and independent-QA handoff (2026-10-20 UTC)

All commands below actually ran against clean canonical `2947e1232e1d619005ebcc6c0838c8ac8a0bb549`, tree `1bd5406797ccb816dada68fd0e15148426fbeda5`. HEAD and tracked source remained unchanged throughout every check. The final handoff commit changes only this evidence and the iteration log, preserving that exact tested application and regression source.

Environment: Linux x86_64, Node 24.19.0, npm 11.9.0, locked Playwright 1.62.1, Chromium 153.0.8010.0. Commands ran from `frontend/`. Every browser command used `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/workspace/scratch/e3fbdcf9622e/browser-tools/extracted/chromium`; fixed browser Date was `2026-10-19T06:00:00Z` with real async timers. Each runner started/stopped its own Vite/browser in one process; no more than two distinct-port browser suites ran concurrently. No backend ran.

| Command | Actual result |
| --- | --- |
| `npm test` | Exit 0; 41 passed, 0 failed |
| `npm run typecheck` | Exit 0 |
| `npm run build` | Exit 0; 33 modules |
| `node tests/qa28.browser.mjs` | Exit 0; 635/635 assertions, 0 failures; port 5194 |
| `npm run test:browser:staff` | Exit 0; all 8 full staff/inventory groups; port 5182 |
| `npm run test:browser` | Exit 0; all 26 auth/focus/role checks; port 5178 |
| `npm run test:browser:catalogue` | Exit 0; all 28 catalogue/date/privacy checks; port 5179 |
| `npm run test:browser:bookings` | Exit 0; request/history/cancellation/conflict/privacy and 390/1440 checks; port 5181 |
| `npm run test:browser:labels` | Exit 0; 448/448 naming/clipping/keyboard assertions, 0 failures; port 5191 |

The focused #28 run exercises approve, reject, pending cancellation, approved cancellation, same-day checkout and overdue return at both 1440 and 390 px. Each scenario first rejects the command without committing, retains entered notes and unchanged history, then explicitly resubmits once. After the real successful command, held/failed desk reads keep truthful pending/saved feedback, withhold untrusted queues/counts/custody and prevent another command. Keyboard Back preserves the unresolved alert and focuses the surviving Refresh control. Rapid delayed read-only retry, repeated failure and final successful read preserve the exact committed Booking/events/trimmed note and restore all queue rows, counts and related bookings' custody/overdue indicators from one snapshot. Full staff checks retain the normal lending/inventory/maintenance/permissions flows and condition-field validation/focus.

Focused #28 `test-results/qa28-after/results.json` records the tested canonical SHA and timestamp `2026-10-20T15:06:46.264Z`; staff and #27 label result files record the same SHA. Their console/page errors and failed-request arrays are empty, and the #28/staff/auth/catalogue checks report no backend/API calls. No source or harness edits were required, and no additional actual runtime defect was observed. Raw stdout logs are in ignored `test-results/engineer28/`; generated screenshots/results remain transient diagnostics rather than published attachments.

Engineer visually inspected `qa28-after/approve-{1440,390}-unavailable.png` and `staff/desk-{1440,390}.png`. The saved-action/read-failure explanation and focused Refresh button remain readable at both widths; unavailable data is withheld and the trusted queue views retain concise action labels. All six #28 transition variants have generated both-width unavailable-state screenshots; automated checks also verify overflow and meaningful focus.

These are engineer checks of the memory-only frontend, not an independent QA verdict, backend security/concurrency/persistence proof or mock-stage PASS. Request fresh independent QA of #28 and the still-open #5 on the published handoff. Only QA may close them after all criteria pass. #27 is already independently closed; #6/OpenAPI and later stages remain gated.

## Iteration 2 — #6 engineer candidate: openapi.yml and Booking version (2026-10-20 UTC)

Candidate commits on `main` (local until the orchestrator pushes; started from `f4d2440`): `e9ceec1` Booking `version` and `expectedVersion` in types, mock, UI call sites and tests; `42e4d99` `openapi.yml` and `_docs/api.md`; `0486a4e` locked backend validator dependencies, `backend/tests/test_openapi_contract.py` and documentation/status corrections. The checks below ran against clean `0486a4e90c8731eae61e42e21933f52e08ee272a` (tree `6b6d8882c73ee2296d84ea63c82a47ddb61e91f7`, `git status` empty). The commit that records this section changes only evidence.md and iterations.md.

### Environment and limits

Linux x86_64. **Node v22.22.0 and npm 10.9.4, not the pinned Node 24.x/npm 11.x.** The backend virtualenv used Python 3.12.3 (system `python3` is 3.13.16) with **uv 0.11.32, not the pinned 0.12.23**; `uv.lock` was preserved at `revision = 5` and `uv lock --check` passes. Playwright 1.62.1 with the supplied Chromium 153.0.8010.0 through `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/tmp/chromium`; browser suites ran one at a time with real async timers and a fixed browser Date, and no server was left running afterwards. No backend process, database or network API was used. These versions differ from the documented prerequisites and from earlier QA runs on Node 24.19.0/npm 11.9.0, so independent QA should repeat the checks on the pinned toolchain.

### Commands actually executed on 0486a4e

| Command (directory) | Actual result |
| --- | --- |
| `uv run --locked pytest` (`backend/`) | Exit 0; 22 passed (1 health, 21 in `test_openapi_contract.py`) |
| `uv run --locked openapi-spec-validator ../openapi.yml` (`backend/`) | `../openapi.yml: OK` |
| `uv lock --check` (`backend/`) | Exit 0; 39 packages resolved; `head -3 uv.lock` shows `revision = 5` |
| `npm test` (`frontend/`) | Exit 0; 74 passed, 0 failed (41 earlier tests, 28 in `versioning.test.mjs`, 5 in `contract.test.mjs`) |
| `npm run typecheck` | Exit 0 |
| `npm run build` | Exit 0; 33 modules transformed |
| `npm run test:browser` | Exit 0; "All 26 scoped browser checks passed." |
| `npm run test:browser:catalogue` | Exit 0; "All 28 catalogue browser checks passed." |
| `npm run test:browser:bookings` | Exit 0; #4 request/history/cancellation/conflict/privacy at 390/1440 PASS |
| `npm run test:browser:staff` | Exit 0; "All 8 staff browser groups passed; no backend/API requests." |
| `npm run test:browser:labels` | Exit 0; 448 checks, 448 passed, 0 failed |
| `npm run test:browser:resources` | Exit 0; 18 PASS lines (dev and preview, both widths) |
| `node tests/qa28.browser.mjs` | Exit 0; 635 checks, 635 passed, 0 failed; result file records commit `0486a4e` |
| `node tests/qa4.browser.mjs` | Exit 0; 4 groups, no console/page errors |
| `node tests/qa25.browser.mjs` | Exit 0; 4 controlled groups, no console/page errors |

The browser suites do not call the contract; they confirm that the UI call sites sending `expectedVersion` still complete the student and coordinator journeys. The `qa28` runner requires a clean committed tree and passed. Raw logs are under the session scratchpad and `frontend/test-results/` (ignored, not committed).

### What the contract tests check

`tests/test_openapi_contract.py` loads `openapi.yml` with PyYAML and validates it with the real `openapi-spec-validator`. It parses `GearShareService` from `frontend/src/services/types.ts` and requires each of the 20 methods to appear exactly once as `x-service-method` (and `operationId`); every operation has `x-service-method`, security and role metadata; 401/403/404/409/422 are present where the rules apply (404 for private bookings, 403 only on staff routes); DTO interfaces match schemas field for field (required, nullable, enums); `Session` is distinct from `User`; no schema in the document has `password` (outside the write-only credential bodies), `passwordHash` or `tokenHash`; and the limits, date pattern, transition table and version rules are frozen. It also validates the 82 mock-generated samples in `frontend/tests/fixtures/contract-samples.json` against their operation schemas, including 422/409/404 error shapes. `npm test` (`tests/contract.test.mjs`) regenerates the samples from the mock and fails if the committed file differs.

`tests/versioning.test.mjs` verifies, with fixed clocks: version 1 on creation and +1 per successful approve/reject/cancel/checkout/return (equal to event count); missing, non-integer, zero, negative and oversize `expectedVersion` as 422 with `fields.expectedVersion`; stale versions as 409 for all five mutations with record, events, allocations and custody unchanged; the precedence order (403/404 before 422 before stale 409 before state 409 before note 422); and **both orderings of the approve-versus-cancel race** (approve first makes the student's cancel with version 1 a 409; cancel first makes the coordinator's approve a 409).

Mutation check (engineer harness kept in the session scratchpad, not committed; it edits temporary copies only): 23 deliberate defects such as a dropped `x-service-method`, a `passwordHash` or `token` property on `User`, `version` made optional, a weakened username pattern, `password` max 64, a PUT turned POST, a missing 403, an extra service method in `types.ts` and a leaked `passwordHash` in a sample were each caught by at least one failing contract test (23 caught, 0 missed; the unmutated baseline passes).

### Decisions recorded for QA

* Evaluation order, non-owner 404, `Session` versus `User`, token handling and the mock-versus-wire differences are in `_docs/api.md`.
* The mock applies the state check (409) before the note check (422) because the QA-passed mock did; the contract documents that order.
* `currentUser`, `logout`, `login` and `register` differ between mock and wire as documented in `api.md`; the future adapter absorbs them (#13/#14).
* No backend business API, repository, ORM, HTTP adapter or database was added. `GET /health` is still the only served route.

### Limits of this evidence

These are engineer checks on a non-pinned toolchain. They show the contract is internally valid, consistent with `types.ts` and with the behavior of the memory mock; they do not show that any server implements it, nor database concurrency, persistence, real authentication security or an independent-QA PASS. #6 remains open for fresh independent QA, which alone may close it. #7 and later stages remain gated.
