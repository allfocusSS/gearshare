# Verification evidence

Current stage update (2026-10-20): independent QA passed and closed [#4](https://github.com/allfocusSS/gearshare/issues/4#issuecomment-6279522336), [#25](https://github.com/allfocusSS/gearshare/issues/25#issuecomment-6279464800) and [#26](https://github.com/allfocusSS/gearshare/issues/26), following #1–3/#24. The #5 coordinator/inventory mock candidate and the [#27](https://github.com/allfocusSS/gearshare/issues/27) visually-hidden-label correction are implemented. Standard engineer checks pass on `f89c963b8b0193d159f74742e126a966a0053bd3`; focused label regression results are recorded in evidence.md. Both issues remain open for complete independent verification. Independent QA and the complete mock-stage gate remain pending. #6/OpenAPI and later stages remain gated. Historical entries below retain their recorded point-in-time results.

Current application status: #1–4/#24–26 are independently verified and closed. The complete mock frontend now includes student and coordinator lending plus inventory. #5 and the #27 label correction await their full independent verdicts; no mock-stage gate, API/storage implementation or final submission PASS is claimed. Historical records below preserve the actual failures and pending states from their original checkpoints.

## Work actually completed

- Read the two assignment articles and combined their specification/issue workflow with the requested implementation sequence.
- Selected GearShare, documented the distinction from StudyTrack and proposed precise MVP rules.
- Prepared product, architecture, design, role/process, draft backlog and test-plan Markdown.
- Initially checked connected GitHub repository access: only `allfocusSS/studytrack` was returned. The user subsequently supplied `allfocusSS/gearshare`, and MVP #1–20 plus post-MVP #21–23 were published before application code.
- Implemented the groomed #1 bootstrap: React/TypeScript startup screen, FastAPI health endpoint, real endpoint test, public dependency locks and verified setup/run/check commands.
- Implemented the groomed #2 shell/auth boundary after #1 QA PASS; recorded the real #24 browser defect, stopped for PM grooming and independent QA reproduction/cases, then corrected its focus lifecycle and ran the scoped regression suite. QA subsequently passed and closed both.
- After those QA gates, implemented #3 public catalogue/filter/detail/anonymous-calendar scope and ran its dedicated tests plus the preserved auth/focus regression.
- Implemented independently verified #4 private requests/history/cancellation and the #25 availability correction. Added #5 mock staff transitions, custody/counts/queues and inventory; observed #27 through real screenshot inspection, waited for PM/QA cases and applied its narrow visually-hidden utility correction.

Planning-document checks completed on 2026-10-19: 24 Markdown documents, 20 unique MVP draft IDs, 3 unique post-MVP draft IDs; all relative Markdown links resolve; every MVP draft contains Goal, Description, Acceptance criteria, Out of scope and Constraints. These checks verify documents only; they are not application tests.

## Application checks

| Check | Result | Command / commit / observation |
| --- | --- | --- |
| Bootstrap health test/build | Independent QA PASS, #1 closed | Published `a8ec9b7469b9d1e2f091bc0fdf0369be7e9ba6ad`; [actual QA evidence](https://github.com/allfocusSS/gearshare/issues/1#issuecomment-6261432589); historical engineer details below |
| Mock frontend browser flows | #1–4/#24–26 independently verified; #5/#27 open | Pre-fix #5 app: auth 26, catalogue 28, student booking and staff 8 functional browser groups passed. Corrected f89c963: 41 unit tests/typecheck/build passed; saved focused label result has 448/448 successful assertions. Full surrounding post-fix browser verification remains for the fresh independent QA handoff |
| OpenAPI validation | Not run | Contract must be derived in iteration 2 |
| In-memory API tests | Not run | Backend currently exposes only health; domain/memory stage follows mock/contract gates |
| ORM/SQLite tests | Not run | Storage implementation does not exist |
| Concurrent requests/rollback | Not run | Deferred to actual database stage |
| Process-restart persistence | Not run | Requires actual runnable backend |
| Two-role browser integration | Not run | Requires implemented frontend/backend |
| Exploratory user testing | Mock auth/catalogue/student/staff screens exercised | Real #24/#25/#26 defects were independently verified and closed. Actual #27 screenshot defect was filed before correction; its full independent verdict and final integrated exploration remain outstanding |
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

MVP issues #1–20 are published and PM-groomed. #1–4 and observed bugs #24–26 are independently verified and closed. #5 and the implemented #27 correction remain open pending their full independent verdicts. Post-MVP #21–23 remain deferred. No final completion count is claimed; full product/integration verification remains outstanding.

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
