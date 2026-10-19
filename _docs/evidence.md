# Verification evidence

Current stage update (2026-10-19): independent QA passed and closed [#3](https://github.com/allfocusSS/gearshare/issues/3#issuecomment-6262112857) at `bdf1e149e87d460e8045c40b2c02be9977de3bb0`. The #4 request/private history/cancellation candidate is implemented and awaits independent QA. Staff workflows (#5) and later stages remain gated. Historical entries below describe their recorded point in time.

Current application status: **independent QA passed and closed [#1](https://github.com/allfocusSS/gearshare/issues/1), [#2](https://github.com/allfocusSS/gearshare/issues/2) and [#24](https://github.com/allfocusSS/gearshare/issues/24). The [#3](https://github.com/allfocusSS/gearshare/issues/3) public mock catalogue/detail/calendar candidate awaits independent QA.** Request/staff lending and later stages remain unimplemented. Historical engineer records below retain the actual FAIL and pending states at the time; current QA gates are linked explicitly.

## Work actually completed

- Read the two assignment articles and combined their specification/issue workflow with the requested implementation sequence.
- Selected GearShare, documented the distinction from StudyTrack and proposed precise MVP rules.
- Prepared product, architecture, design, role/process, draft backlog and test-plan Markdown.
- Initially checked connected GitHub repository access: only `allfocusSS/studytrack` was returned. The user subsequently supplied `allfocusSS/gearshare`, and MVP #1–20 plus post-MVP #21–23 were published before application code.
- Implemented the groomed #1 bootstrap: React/TypeScript startup screen, FastAPI health endpoint, real endpoint test, public dependency locks and verified setup/run/check commands.
- Implemented the groomed #2 shell/auth boundary after #1 QA PASS; recorded the real #24 browser defect, stopped for PM grooming and independent QA reproduction/cases, then corrected its focus lifecycle and ran the scoped regression suite. QA subsequently passed and closed both.
- After those QA gates, implemented #3 public catalogue/filter/detail/anonymous-calendar scope and ran its dedicated tests plus the preserved auth/focus regression.

Planning-document checks completed on 2026-10-19: 24 Markdown documents, 20 unique MVP draft IDs, 3 unique post-MVP draft IDs; all relative Markdown links resolve; every MVP draft contains Goal, Description, Acceptance criteria, Out of scope and Constraints. These checks verify documents only; they are not application tests.

## Application checks

| Check | Result | Command / commit / observation |
| --- | --- | --- |
| Bootstrap health test/build | Independent QA PASS, #1 closed | Published `a8ec9b7469b9d1e2f091bc0fdf0369be7e9ba6ad`; [actual QA evidence](https://github.com/allfocusSS/gearshare/issues/1#issuecomment-6261432589); historical engineer details below |
| Mock frontend browser flows | #2/#24 independent QA PASS; #3 engineer checks passed, independent QA pending | Current 22 service tests, typecheck/build, 28 catalogue browser checks and 26 preserved auth/focus checks pass. Request/staff lending journeys remain unimplemented |
| OpenAPI validation | Not run | Contract must be derived in iteration 2 |
| In-memory API tests | Not run | Backend currently exposes only health; domain/memory stage follows mock/contract gates |
| ORM/SQLite tests | Not run | Storage implementation does not exist |
| Concurrent requests/rollback | Not run | Deferred to actual database stage |
| Process-restart persistence | Not run | Requires actual runnable backend |
| Two-role browser integration | Not run | Requires implemented frontend/backend |
| Exploratory user testing | Scoped auth testing performed | Actual validation-focus bug filed as #24 before correction; broader lending exploration remains outstanding |
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

MVP issues: #1–20 published and PM-groomed; #1, #2, #3 and the observed focus bug #24 are closed after independent QA PASS. #4 remains open for independent QA. Post-MVP: #21–23 published. No final completion count is claimed; full product exploration remains outstanding.

Do not report “0 open issues” as completion before the backlog exists. On final submission, record the actual issue counts and links for queries `is:issue is:open label:mvp` and `is:issue is:open label:user-test-bug` in the correct repository.

## Iteration 1 — #4 engineer candidate

2026-10-19 UTC; Linux x86_64, Node 24.19.0, npm 11.9.0, Playwright 1.62.1 with Chromium 153.0.8010.0 at `/tmp/chromium`. PM handoff: https://github.com/allfocusSS/gearshare/issues/4#issuecomment-6267394270. Candidate: the commit containing this record, with exact published SHA in the engineer handoff.

Executed from frontend/: `npm test` passed 27 tests; `npm run typecheck` and `npm run build` passed. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/tmp/chromium npm run test:browser:bookings` passed the real-app signed-out asset return, required purpose/dates, failed request/retry with disabled pending controls, one request under double-click, private list/details/events, cancellation/history, cancellation/rebook, deterministic conflict with retained purpose/dates and refreshed calendar, overdue visibility, forbidden cancellation absence, separate account privacy, and 390/1440 layout checks. `test:browser:catalogue` passed all 28 checks after updating its public-metadata assertion to exclude the signed-in user's own new request form. Browser scripts use fixed Date with real timers. `test:browser` passed all 26 preserved auth/focus/fixture/role checks.

Service tests cover anonymous access, cross-user read/cancel hiding, ignored injected ownership/state, immutable result copies, UTC create/cancel events, inclusive overlap/adjacency/other units, seeded states/coordinator cancellation, invalid/maintenance/missing requests with no partial effects, legal duration/horizon boundaries, cancellation release/history and repeat/terminal failures. Checks establish only browser mock behavior, not backend security, persistence, transactions or independent QA. #4 remains open.

### Resumed engineering verification and observed failures

The preserved #4 candidate was resumed in a fresh engineer session on 2026-10-19 UTC without discarding changes. `npm test` passed 27/27, `npm run typecheck` exited 0, `npm run build` exited 0 (31 modules), `test:browser:bookings` passed its scoped journey, and `test:browser` passed all 26 checks. The same Chromium executable override was used.

The catalogue browser rerun exited 1 at `tests/catalogue.browser.mjs:143`, timing out after 30 seconds while waiting for the mobile second-visit text `3 selected days are unavailable.` All earlier desktop/date checks passed. An isolated repeat was started to distinguish the test from a product issue; this supersedes any blanket claim that the current rerun passed every suite.

A targeted running-browser check found a separate real request defect: sign in as maya_student, visit accessory-03, request 2026-10-19..2026-10-19 with purpose `Club capture project`. After the pending-approval success message, the panel still said `Available for selected dates` and the day button still had accessible name `2026-10-19: Available, selected`. The booking exists, but the detail view's availability snapshot is stale after a successful request. Desktop/mobile screenshots were generated under ignored `frontend/test-results/bookings/`. No correction was applied; this needs the user-test-bug → PM → QA regression → engineer loop before independent #4 acceptance.

## #25 engineer candidate — 2026-10-19

Success and conflict now invalidate the displayed calendar, refresh through GearShareService, and offer availability-only retry on error; no stale available claim is displayed while unknown. Form/confirmation survive refresh. Synchronous submission guard prevents repeated writes; asset-generation and refresh-version guards reject late responses after navigation. No backend or persistence changes.

Actual frontend commands: `npm test` PASS 28/28; `npm run typecheck` PASS; `npm run build` PASS (31 modules). `npm run test:browser:bookings` PASS with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/nix/store/f0zwc9si9bjhs4vipbbfw0i7my9ck3in-chromium-146.0.7680.80/bin/chromium`. Added original same-day Capture Adapter Kit regression at 1440/390, retained fields, single booking/event, controlled refresh delay/failure/retry without resubmission and out-of-order asset refresh. Added service coverage for multi-day/cross-month/14-day inclusive occupancy, isolation and anonymous public shape; existing invalid/conflict/cancellation/ownership tests retained. Initial browser assertion ran before list loading completed (0 rows); explicit row wait corrected test synchronization, rerun passed.

`npm run test:browser:catalogue` and `npm run test:browser` both exited 1: all listed functional checks completed, but final console assertions each reported one resource 404. Not claimed as passing; source URL was not captured. Node 22.22.0 instead of required Node 24 remains an environment limitation. Chromium 146 executable override used for every browser run.

Coverage limitations for independent QA: not every R06/R08 permutation is automated (same-asset range out-of-order snapshots, late pending-submit navigation, conflict-refresh failure); no claim of full independent acceptance. #25 and #4 remain open; later stages gated.
