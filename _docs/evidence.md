# Verification evidence

Current stage: see the [current gate record](iterations.md#current-stage). Historical entries below retain their point-in-time results.

Current application status and independent verdicts are maintained in the [gate record](iterations.md#current-stage). The historical results below retain their original commit and limits; #30 correction evidence follows the preserved #10 failing checkpoint at the end.

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
| Mock frontend browser flows | #1–5 and #24–28 independently verified and closed | Independent QA PASS for the mock stage ([#5](https://github.com/allfocusSS/gearshare/issues/5#issuecomment-6294295984)). The #6 changes (Booking version) were re-run by the engineer on `0486a4e`, and again on `cd2ff51` after the #6 QA-FAIL correction touched `types.ts` and the mock (`assetId` validation): every browser suite exits 0 (see the #6 sections, including one recorded auth-suite timing failure) |
| OpenAPI validation | Independent QA PASS/closure on `1f4b115` after the recorded `39d1bdd` FAIL | [Actual QA evidence](https://github.com/allfocusSS/gearshare/issues/6#issuecomment-6297151459); #7 retains all 35 baseline health/contract/authoring tests; real validator remains OK |
| In-memory API tests | #7–9/#29 independent PASS; #10/#30 fresh independent QA pending | Current engineer correction: 921 backend PASS and 133 PASS per focused ASGI/Uvicorn transport; prior 814 PASS/51 FAIL checkpoint remains below |
| ORM/SQLite tests | Not run | Storage implementation does not exist |
| Concurrent requests/rollback | Auth and booking memory checks pass; database allocation remains unimplemented | Real conflicting create/cancel races and partial allocation/cancellation rollback; no database concurrency claim |
| Process-restart persistence | Not run | Current backend is process memory; requires the later storage stage |
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

## Iteration 2 — #6 independent-QA FAIL and engineer correction (2026-10-20 UTC)

### The QA FAIL being corrected

Independent QA ran `39d1bdd79d79ff194d002e6852ec221bc6501db7` and posted `QA: FAIL` on #6 ([comment 6295944514](https://github.com/allfocusSS/gearshare/issues/6#issuecomment-6295944514)). The engineer section above remains as the point-in-time record of what the engineer ran on `0486a4e`; it was accurate for those checks but they could not see these two defects:

1. `components.schemas.Error.properties.message` was written as a flow mapping with an unquoted comma (`{type: string, description: Human-readable, safe to show to the user.}`). YAML parsed it as `description: Human-readable` plus a second key `safe to show to the user.` with a null value. `openapi-spec-validator`, the schema-versus-`types.ts` comparison and the 23-mutant check all accepted it.
2. The `/auth/register` request example used `username: '  New_Member9  '`, which does not match the schema pattern `^[A-Za-z0-9_]{3,30}$`. The old test trimmed the example before validating it, which hid the defect.

QA also reported 14 surviving mutation probes and a list of ambiguities that #7-#10 would settle by accident.

### Reproduction before any change (on `39d1bdd`)

Run from a scratch copy of the file with `npx --yes @redocly/cli@1.34.5 lint openapi.yml` and `npx --yes @stoplight/spectral-cli@6.14.3 lint openapi.yml --ruleset <scratch ruleset containing only extends: ["spectral:oas"]>`. Neither tool is a repository dependency and neither was added.

| Tool | Result before | Result after (`cd2ff51`) |
| --- | --- | --- |
| Redocly 1.34.5 | exit 1; 1 error, 3 warnings. Error `struct` at `openapi.yml:1183:62`, "Property `safe to show to the user.` is not expected here"; warning `no-invalid-media-type-examples` at `99:46`, "`username` property must match pattern"; warnings `info-license` and `operation-4xx-response` for `/health` | exit 0; "Your API description is valid"; 0 errors, 2 warnings (`info-license`, `/health` `operation-4xx-response`, both present before) |
| Spectral 6.14.3 | exit 1; 1 error, 1 warning. Error `oas3-valid-media-example` at `99:46` (same username pattern); warning `info-contact` | exit 0; 0 errors, 1 warning (`info-contact`, present before) |

So the two defects were confirmed before the fix and no error remains after it. The remaining three warnings are about missing `license`, `contact` and a `/health` 4xx response; they are unrelated to this QA finding and were left alone (adding a licence or contact would invent project facts).

A whole-file scan for the same class of defect (flow mappings or sequences with an unquoted comma or colon, accidental null-valued keys, duplicate keys) found exactly one such key, the `Error.message` one, and no duplicate keys. Every `example`/`examples` entry was then validated against its own schema (see the guard below); only the register example failed.

### Correction commits (local until the orchestrator pushes)

| Commit | Subject |
| --- | --- |
| `f0cbb02` | Fix openapi.yml mis-quoted Error.message and self-invalid register example; add linter-free authoring guards |
| `a292232` | Pin the #7-#10 contract decisions QA listed: validation order, Error envelope, ids, events, counts, trimming |
| `cd2ff51` | Strengthen the contract tests against the surviving mutation probes |

All three messages carry `Refs #6` and no closing keyword. The commit that records this section changes only Markdown, so code and tests on the final commit are byte-identical to `cd2ff516e2204d8ef945cd01c86aced3f91311ff` (tree `c2dbef55bf7ca4f12177fe2975173274c112d85f`). Changed files: `openapi.yml`, `_docs/api.md`, `backend/tests/test_openapi_contract.py`, new `backend/tests/test_openapi_guards.py`, `frontend/src/services/types.ts` (`'assetId'` added to the `ServiceError.fields` keys), `frontend/src/services/mockService.ts` (`requestBooking` now returns `fields.assetId` for a missing, non-string, empty or over-100-character `assetId`), `frontend/tests/contract-samples.mjs`, regenerated `frontend/tests/fixtures/contract-samples.json` (93 samples, was 82) and new `frontend/tests/contract-decisions.test.mjs`. No lock file changed: `uv lock --check` passes and `uv.lock` still starts `version = 1`, `revision = 5`.

### Fix summary per QA finding

| QA finding | Correction |
| --- | --- |
| `Error.message` truncated and a null junk key | Description quoted: `'Human-readable, safe to show to the user.'`; a test asserts `Error.message` equals exactly `{type: string, description: ...}` |
| Register example violates the pattern | Example is `New_Member9`; trimming (`x-trimmed`) is documented in prose; request examples must be valid as written |
| Linters find what the tests missed | `test_openapi_guards.py` (6 tests): duplicate keys and empty implicit-null values found from the YAML node tree, null values in structural positions, whitespace keys, truncated descriptions, unknown schema keywords, and every `example` and `examples[*].value` (media-type, parameter and header examples, including shared components) validated against its resolved schema with `jsonschema` Draft 2020-12 and the format checker |
| 14 surviving mutation probes | New wiring tables in `test_openapi_contract.py` for every operation's success status, request schema, response schema and shared 401/403/404/409/422 `$ref`; `listAssets` query parameters compared with `AssetFilters`; frozen limits and formats repeated on shared schemas (`Session.expiresAt` date-time, token length, `events` minItems, `counts` required, asset code length, timestamp formats) |
| Ambiguities for #7-#10 | Decided and written into `openapi.yml` and `_docs/api.md` (list below); contract tests pin both texts so they cannot drift apart |

### Guard proof (without Redocly or Spectral)

The `39d1bdd` file was copied out with `git show 39d1bdd:openapi.yml` (no stash). The six guard tests run against that copy: 5 failed and 1 passed (the one that passed, `test_format_checking_is_live_so_example_formats_are_really_enforced`, is a self-check that `date-time` format checking is active and does not depend on the file). Failures: duplicate keys/empty values (reports line 1183 `safe to show to the user.` has an empty value), structure (description "looks truncated ... 'Human-readable'", key not a plain token, null in a structural position), unknown schema keyword, known flow-mapping descriptions, and examples valid exactly as written (reports the padded username and that request examples must already be trimmed). On the fixed file the same helpers report 0 problems and all six tests pass. Output is in the session scratchpad (`prove-guards-output.txt`, `pytest-guards-on-old.txt`).

### Mutation check of the new test net

Edits were made only to scratch copies of `openapi.yml`, `api.md`, `types.ts` and the sample fixture; the real tree was never mutated.

* The engineer harness (54 mutants, run on the final tree): the two original defects re-injected as raw text, other authoring-defect classes (a second comma split, a duplicate key, a null description, an unknown keyword, an invalid example), wiring swaps on the five mutations and others, dropped responses and parameters, weakened formats and limits, and documentation drift in `api.md` and `types.ts`. First run: 48 caught, 6 survived. Each survivor was then given a test, and the 6 were re-run and caught; the final full run reports `caught 54 of 54`, `survivors: []`, unmutated baseline passing (34 tests in the two openapi files).
* QA's 36-mutant harness, which produced the 14 survivors (plus a no-op control) on the original baseline: 35 of the 36 mutants are caught on the final tree, including all of `session_expires_plain`, `session_token_short`, `listassets_param_required`, `listassets_param_removed`, `listassets_cat_string`, `counts_optional`, `asset_code_maxlen`, `events_minitems_removed`, `ts_nodatetime`, `transitionconflict_desc`, `approve_422_ref_wrong`, `reject_422_wrongref` and `cancel_409_to_validation`. The 14th, `maintenance_desc`, still shows SURVIVED, because the probe is `description.replace('atomic', '')` and the `setAssetState` description says "Atomic" with a capital A, so the mutated file is identical to the original (an equivalent mutant that no test can distinguish). The same mutation made case-insensitively is in the engineer harness and is caught by `test_booking_mutations_require_expected_version_and_document_the_precedence`. The unmutated control also reports SURVIVED, as a control should.

### Decisions recorded (no business rule in plan.md or the PM clarification changed)

These make the existing mock-and-QA-passed behavior explicit for the backend stories.

* Evaluation order for the five booking mutations: authentication, then authorization/ownership (404 for a non-owner), then `expectedVersion` shape (422), then version/state conflict (409), then note validation (422). Declarative Pydantic note limits must not pre-empt 409 (verified by experiment: a `constr` note would return 422 before the stale-version 409, so notes are validated by hand after the state checks).
* Every non-2xx response is the `Error` shape. Each operation has a `default` response; `ErrorCode` maps 405 to `NOT_FOUND` and an unexpected 500 to `SERVICE_UNAVAILABLE`; `_docs/api.md` documents the `RequestValidationError`, `HTTPException` and `Exception` handlers, including malformed JSON and the framework 405 (with an `Allow` header example). Verified by experiment that FastAPI's own defaults are `{"detail": ...}` and need the handlers.
* Unknown path ids are 404 (never 422); malformed body ids are 422 with `fields`, and `assetId` is now a documented `fields` key (types.ts synchronised, mock returns it).
* The exact `note` text and event shape for create, approve, reject, cancel, checkout and return are pinned as the mock produces them (`x-events` on `BookingEvent`; for example approve is `Reservation approved.` and cancel is `Reservation cancelled; reserved dates released.`).
* `StaffDesk.counts.pending` counts pending bookings regardless of dates; `dueToday` counts checked-out bookings whose `endDate` equals today in `Asia/Almaty`; `overdue` counts checked-out bookings whose `endDate` is before today.
* `x-trimmed` means the server trims before validating; `expectedVersion` is a strict JSON integer (`true`, `"2"`, `2.0` and `null` are 422; FastAPI's lax `int` would accept `true` and `"2"`, so the backend needs strict typing).
* #13 prerequisites in `api.md`: browser CORS (or a Vite dev proxy) and `tzdata>=2024a` so `Asia/Almaty` resolves to UTC+5.

Product decisions to confirm, chosen as the most conservative reading consistent with the QA-passed mock: the note-after-state order stays as in the mock rather than "validate notes first"; a request for an unknown `assetId` is 404 but a missing or over-long body `assetId` is 422 (the mock previously answered 404 for any value, so it changed by one `fields` key); `pending` is counted regardless of dates (an expired pending request is still counted pending; approving it is 409, as in the mock).

### Commands actually executed on `cd2ff51` (code/tests identical to the final commit)

| Command (directory) | Actual result |
| --- | --- |
| `uv lock --check` (`backend/`) | Exit 0; "Resolved 39 packages"; `uv.lock` header `version = 1`, `revision = 5` |
| `uv run --locked pytest -q` | Exit 0; 35 passed (1 health, 28 in `test_openapi_contract.py`, 6 in `test_openapi_guards.py`) |
| `uv run --locked openapi-spec-validator ../openapi.yml` | `../openapi.yml: OK` |
| `npx --yes @redocly/cli@1.34.5 lint openapi.yml` (repo root) | Exit 0; valid, 2 warnings (above) |
| `npx --yes @stoplight/spectral-cli@6.14.3 lint openapi.yml --ruleset <scratch>` | Exit 0; 0 errors, 1 warning (`info-contact`) |
| `npm test` (`frontend/`) | Exit 0; 78 passed, 0 failed (was 74; `contract-decisions.test.mjs` adds 4) |
| `npm run typecheck` | Exit 0 |
| `npm run build` | Exit 0 |
| `npm run test:browser` (auth) | 26 checks. **First run failed:** exit 1 with a 30 s Playwright `TimeoutError` at `tests/auth.browser.mjs:59` (`selectOption` on "Response fixture" waiting for the select to be visible and enabled) called from line 223 (`switchFixture('loading')`). It was not reproduced afterwards: 9 further runs passed all 26 checks (1 immediate re-run, 2 on the clean committed `cd2ff51`, 6 in a back-to-back loop). No root cause was established; the mock path changed by this correction (`requestBooking`) is not exercised by this suite, so it is recorded as an unreproduced timing failure, not as a fix or a pass |
| `npm run test:browser:catalogue` | Exit 0; "All 28 catalogue browser checks passed." |
| `npm run test:browser:bookings` | Exit 0; #4 request/history/cancellation/conflict/privacy at 390/1440 PASS |
| `npm run test:browser:staff` | Exit 0; "All 8 staff browser groups passed; no backend/API requests." |
| `npm run test:browser:labels` | Exit 0; 448 checks, 448 passed, 0 failed; result file records commit `cd2ff516...`. An earlier attempt on the uncommitted working tree exited 1 because the runner refuses to run with a dirty `src` ("QA must run against committed implementation"); it passed after the code was committed |
| `npm run test:browser:resources` | Exit 0; 18 PASS lines (dev and preview, both widths) |
| `node tests/qa28.browser.mjs` | Exit 0; 635 checks, 635 passed, 0 failed |
| `node tests/qa4.browser.mjs` | Exit 0; "independent #4 focused browser: 4 groups, no console/page errors" |
| `node tests/qa25.browser.mjs` | Exit 0; "independent #25 focused browser: 4 controlled groups, no console/page errors" |

The browser suites were run with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/tmp/chromium`, one at a time. They were run because the correction touched `types.ts` and the mock. They do not exercise the contract.

### Environment and limits

Linux x86_64. **Node v22.22.0 and npm 10.9.4, not the pinned Node 24.x/npm 11.x; Python 3.12.3 (the pinned 3.12.x line) with uv 0.11.32, not the pinned 0.12.23.** Playwright with the supplied Chromium. Independent QA should repeat the checks on the pinned toolchain. Redocly and Spectral were run through `npx` from the public registry with the versions named above; they remain QA tools, not repository dependencies, and `test_openapi_guards.py` is the repository's own linter-free defence against the same class of defect. Their three warnings (licence, contact, `/health` 4xx) are not addressed. The authoring guards check the cases listed above; they are not a general YAML linter. Nothing in this section shows that a server implements the contract, nor database concurrency, persistence or real authentication security, nor an independent-QA PASS.

#6 stays open. The correction needs fresh independent QA of the new candidate; only QA may close it. #7 and later stages remain gated. The commits are local until the orchestrator pushes.

## Iteration 3 — #7 memory auth engineer candidate

Date: 2026-10-21 UTC. Role: software engineer, not independent QA. Baseline: canonical `1f4b115bfd340a36d129bc3ed3c756a94807f580`, which [independent QA passed and closed for #6](https://github.com/allfocusSS/gearshare/issues/6#issuecomment-6297151459). The [new PM handoff](https://github.com/allfocusSS/gearshare/issues/7#issuecomment-6309139333) was read before implementation. The orchestrator had verified that baseline on the pinned toolchain (78 frontend / 35 backend, typecheck, build and real validator); this candidate does not redo #6 or its optional mutation hardening. Candidate: the single `Refs #7` commit containing this record; its local/published SHA and identical-tree mapping belong in the issue handoff. #7 stays open for independent QA.

Environment actually used: Linux x86_64, Python 3.12.14, uv 0.12.23, Node 24.19.0, npm 11.9.0, locked Playwright 1.62.1 and provisioned Chromium 153.0.8010.0. The browser executable was supplied through the documented `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` override; its environment-specific path/results are in the engineer handoff. No database, ORM, migration, frontend HTTP adapter or real credentials were used.

### Delivered behavior and boundaries

* Register/login/logout/me use the frozen `/api/v1/auth/*` routes and direct Session/User/Error DTOs. Registration normalizes the exact ECMAScript-trimmed ASCII username to lowercase and always creates a server-generated student. Unknown role/identity/ownership/audit properties are ignored. A trusted Python fixture alone creates a coordinator; there is no demo role-grant endpoint.
* `AuthRepository` / `AuthTransaction` protocols separate the domain service from the real Python dictionary adapter. A process lock covers complete operations; copy-on-write transactions publish users/name indexes/sessions together and discard every change on failure. The stored records are immutable. No SQLite substitution exists.
* Locked `argon2-cffi==25.1.0` provides random-salted Argon2id (default parameters); only password hashes are stored. Opaque tokens use 32 random bytes, with only SHA-256 hashes, user references and aware UTC expiry in the repository. Absolute expiry is exactly 24 hours, including the equality boundary. Logout revokes only the presented session.
* Credential fields are strictly typed, passwords remain untrimmed/unnormalized, and Unicode code points determine length. Valid 128-point supplementary passwords are verified whole; lone surrogates are 422 field errors before hashing. A minimal shared mock text helper aligns existing text checks without changing any numeric limit, UI layout or default adapter. All original 78 semantic frontend tests and 35 backend contract/health checks remain present.
* Register/login manually check UTF-8 JSON-object envelopes and application/json media type (case-insensitive, ordinary parameters allowed). Me/logout require no body; unauthorized requests still return 401 when a supplied body is malformed. Framework 404/405/422 and generic 500 bodies use Error; 405 retains Allow, 401 retains WWW-Authenticate and unregistered slash variants are 404 with no redirect. A safe ASGI boundary consumes unexpected failures before Uvicorn can log their exception text.

### Commands actually executed

| Directory | Command | Actual result |
| --- | --- | --- |
| `backend/` | `uv add 'argon2-cffi>=25.1.0'` | Exit 0; 43 packages resolved, 4 installed; uv.lock includes Argon2 and its locked bindings/CFFI dependencies |
| `backend/` | `uv run --locked pytest -q` | Exit 0; 137 passed in 5.95 s: 102 auth/API cases plus all 35 baseline tests |
| `backend/` | `uv lock --check` | Exit 0; resolved 43 packages |
| `backend/` | `uv run --locked openapi-spec-validator ../openapi.yml` | Exit 0; `../openapi.yml: OK` |
| `frontend/` | `npm test` | Exit 0; 84 passed, 0 failed: original 78 plus 6 Unicode/shared-text groups; committed contract samples remain unchanged and match the mock |
| `frontend/` | `npm run typecheck` | Exit 0 |
| `frontend/` | `npm run build` | Exit 0; Vite 8.3.4 built 34 modules |
| `frontend/` | `npm run test:browser` with the provisioned Chromium override above | Exit 0; all 26 preserved auth/shell/focus/roles/fixtures checks at 390/1440 passed; 0 console/page/request errors and 0 API calls |

The ASGI cases validate real responses against the versioned schemas, inspect actual stored hashes/UTC expiry, race eight normalized duplicate registrations (one complete winner, seven 409s), race logout (one 204, one 401), verify multiple independent sessions and exact expiry, and exercise BMP/astral/mixed/combining 9/10/128/129 boundaries, exact trim-set differences, strict types, media types, malformed JSON, headers and ignored server-owned input. Wrong credentials leave repository state unchanged. Four controlled adapter faults are raised after real user insertion, session insertion (register/login) or session deletion: each returns generic 500, restores the complete pre-request state and logs one constant message with no password, bearer token, password/token hash, raw body, traceback or secret-bearing exception detail. The ASGI transport enables exception propagation, so these checks also verify that the safe boundary consumes the exception instead of letting the server log it.

No failing application/browser check or new observed product defect occurred, so no user-test-bug was fabricated. npm printed the existing host `http-proxy` configuration warning without failing. The browser was found through the existing evidence after an initial tooling inventory looked for the old `/tmp/chromium` path; no browser test failure occurred. Final contract/doc verification after the descriptive clarifications is recorded in the engineer handoff.

Limits: these are engineer checks of auth in one process, with no independent PASS claimed. Recreating the application proves memory-instance isolation, not persistent process-restart behavior. Accounts/sessions disappear on actual process restart/reload by design. Catalogue/booking/staff APIs, database contention/persistence, HTTP UI session handling, CORS and deployment hardening follow their gates. The frontend remains the explicit mock. Production recovery/SSO and distributed rate limiting remain deferred. Historical FAIL/pending records above are retained; the current gate record supersedes their old status.

## Iteration 3 — #8 memory catalogue engineer candidate

Date: 2026-10-21 UTC. Role: software engineer. Baseline: canonical `e8ec7b6620a84884a79999ea3885313e7c6ced25`, tree `f3dac460aa566e3bdec00de89aff2cbe461521dc`, independently [passed/closed for #7](https://github.com/allfocusSS/gearshare/issues/7#issuecomment-6322307972). Read the actual #8 issue and [PM clarification](https://github.com/allfocusSS/gearshare/issues/8#issuecomment-6309201239). Candidate: the single `Refs #8` commit containing this entry; local/published SHA and tree mapping belong in the handoff. #8 remains open for independent QA.

Environment: Linux x86_64, Python 3.12.14, uv 0.12.23, Node 24.19.0, npm 11.9.0. Frontend source and the mock default are unchanged, so no browser suite was rerun. Existing browser results above remain historical evidence, not #8 HTTP integration results.

Delivered: `GET /api/v1/assets`, `/api/v1/assets/{assetId}` and `/api/v1/assets/{assetId}/availability`; ten original fictional physical units across four categories; explicit public DTOs; stable seed/creation order; literal joined-field search; last-value scalar query parsing; strict date absence/ASCII/calendar/range policy; inclusive pending/approved/checked-out occupancy, terminal release and maintenance calendars. List/calendar operations reuse one captured club date. Fixtures are seeded once relative to a captured startup date and never move on reads. Auth/catalogue use the same locked transaction and immutable records; trusted setup projections are the only current scheduled source. No private Booking lifecycle, staff custody API, ORM, database or frontend HTTP wiring is claimed.

| Directory | Command actually executed | Actual result |
| --- | --- | --- |
| `backend/` | `uv add 'tzdata>=2024.1'` | Exit 0; 44 packages resolved; locked/installed tzdata 2026.5 |
| `backend/` | `uv lock --check` | Exit 0; 44 packages, lock current |
| `backend/` | `uv run --locked pytest -q` (final) | Exit 0; 278 passed in 8.05 s: all 137 preserved tests plus 141 catalogue/API/domain/repository cases |
| `backend/` | `uv run --locked openapi-spec-validator ../openapi.yml` | Exit 0; `../openapi.yml: OK`; schemas/operations/DTO limits unchanged, only catalogue descriptions clarified |
| `frontend/` | `npm test` | Exit 0; 84 passed, 0 failed; contract samples still equal the unchanged mock; repeated after OpenAPI description edits |
| `frontend/` | `npm run typecheck` and `npm run build` | Both exit 0; Vite 8.3.4 built 34 modules |
| `backend/` | `PYTHONPATH=. uv run --locked python ../../gearshare-8-unicode-parity.py` | Exit 0; all 1,112,064 Unicode scalars match Node 24.19.0 / Unicode 17.0 for default lowercase, Cased and Case_Ignorable |
| `backend/` | `uv run --locked python ../../gearshare-8-live-smoke.py` | Exit 0; actual Uvicorn health + 11 schema-validated HTTP reads/errors, 10 units/4 categories, 91-day calendar, relative club today 2026-10-21; clean shutdown and no server tracebacks |
| Repository | `git diff --check` | Exit 0 |

C01–C03/D01–D04 tests exercise filter intersection/empty results, every search field and cross-field phrases, no casefold/normalization/internal-space folding/cap, exact trim differences, new Unicode casing and contextual sigma, repeated keys before validation, empty/partial/whitespace dates, impossible/leap/non-ASCII/trailing-newline dates, today/same-day/14-day/90-day acceptance and past/reversed/15-day/horizon refusal. Known assets and malformed/overlong/unknown path IDs validate against the frozen Asset/Error shapes. Anonymous and two distinct students receive identical exact public list/detail/calendar fields, with no fixture/user/session IDs or credentials. Every reserving/terminal state, inclusive endpoint, following-day adjacency, independent unit, maintenance and overdue scheduled-only behavior is checked. Clock tests cross local midnight within an operation, compare equivalent UTC/offset instants, advance existing stores 200 days without reseeding and seed future/leap dates. The timezone suite requires 2026 UTC+5 and starts a fresh process with an intentionally wrong host Almaty zone; packaged policy remains correct. Repository tests cover stable non-lexical creation order, unique IDs/codes, immutable public/stored results, retained transaction isolation, shared auth/inventory/schedule/seed-marker rollback and recovery after a controlled seed failure.

Intermediate results are retained: the first full suite passed 276/276, and adding empty/stale-host tests produced 278/278. A subsequent description-only edit replaced the word `together` with `paired`, so the preserved contract authoring assertion failed (277 passed, 1 failed); restoring the explicit paired-date wording corrected the description without weakening that test. Final suite/validator results are above. One one-off parity invocation used an incorrect relative script path; the corrected command passed. The first live-smoke attempt inherited the host SOCKS proxy and failed in the HTTPX harness before requests; setting `trust_env=False` for the loopback-only client corrected that harness, after which the actual server checks passed. Neither was an application defect. npm printed its existing host `http-proxy` warning without failing. The parity/smoke scripts and Uvicorn log remain scratch evidence outside Git; normal regression tests are committed.

Limits: this is engineer verification of the public catalogue in one process, with independent QA pending. In-memory state is lost on restart; no persistence, booking allocation race, full private fixture chain, staff custody enforcement, CORS or browser-to-API integration is established by these results. Scheduled availability does not promise a future physical handover when another loan is overdue. No running-application/browser defect was observed, and no user-test-bug issue was fabricated. Historical FAIL evidence above remains unchanged.

## Iteration 3 — #9 memory booking failing engineer checkpoint

Date: 2026-10-22 UTC. Role: software engineer, not independent QA. Baseline: canonical `154129d8f0f6c21a37b6ee050bd955f67c48ad94`, tree `c34376a98c437731d5b1a524db1edb35a39794bd`, freshly [passed/closed for #8](https://github.com/allfocusSS/gearshare/issues/8#issuecomment-6336784597). Read the actual #9 issue and both comments, its [PM handoff](https://github.com/allfocusSS/gearshare/issues/9#issuecomment-6254622264), required repository documents, the frozen root contract and [#10's trusted-fixture clarification](https://github.com/allfocusSS/gearshare/issues/10#issuecomment-6309268749). This single `Refs #9` commit is a **failing checkpoint**; its exact local/published SHA and tree belong in the handoff. It is not a QA-ready or passing candidate.

Environment actually verified: Linux x86_64, Python 3.12.14, uv 0.12.23, Node 24.19.0 and npm 11.9.0. Existing locked dependencies were already installed. No frontend source/default adapter, dependency lock, ORM, SQLite, migration or staff mutation API was changed.

### Implemented scope

- `POST /api/v1/bookings`, `GET /api/v1/bookings`, `GET /api/v1/bookings/{bookingId}` and `POST /api/v1/bookings/{bookingId}/cancel` use server-authenticated stored identity. Manual JSON-object parsing follows authentication. Creation aggregates strict asset ID, required full-ASCII real dates, inclusive club limits and ECMAScript-trimmed 5–500-code-point purpose before asset lookup; unpaired purpose/ID surrogates are field errors before commit/encoding. Client ownership, role, state, version and audit properties are ignored.
- The existing composite repository/lock now copies and publishes booking/event/slot/custody maps together with auth/inventory. Full private bookings and immutable events replace the old schedule projections; `occupied_days` reads the actual unique inclusive day slots. Creation atomically writes pending/version1/create event/all slots. Cancellation checks visibility, strict JSON integer literal, stale version and legal state before atomic cancellation/version increment/exact-note event/all-slot release. History and the asset-name snapshot remain.
- Trusted default fixtures reference existing real owners/actors, chronological valid event chains, event-count versions, matching inclusive slots and checked-out custody. Random fixture credentials are discarded and distinct roles have separately salted hashes; no public privilege/login setup was added. Original auth empty-account preconditions use `seed=False`; the catalogue shape test explicitly loads only original units. Baseline assertions remain, with only the obsolete #8 booking-route-absence guard updated for the now-authorized private routes; staff/ORM/HTTP-adapter boundaries remain.

### Commands and actual results

| Directory | Command actually executed | Actual result |
| --- | --- | --- |
| `backend/` | `uv run --locked pytest -q` (first full run) | Exit 1; 441 passed, 2 failed in 18.89 s. One newly observed newline-ID 404 mismatch; one obsolete #8 assertion that bookings must not exist. The scope guard was updated for #9 without removing its catalogue read-only/staff/frontend assertions. |
| `backend/` | `uv run --locked pytest -q tests/test_booking_domain.py` | Exit 0; 6 passed in 0.90 s. |
| `backend/` | `uv run --locked pytest -q` (final complete source) | **Exit 1; 451 passed, 1 failed in 17.03 s.** All 278 baseline cases and 173 of 174 new booking cases pass; the uniform-private-404 case remains red. |
| `backend/` | `uv lock --check` | Exit 0; 44 packages, lock current. |
| `backend/` | `uv run --locked openapi-spec-validator ../openapi.yml` | Exit 0; `../openapi.yml: OK`. Wire shapes/limits/operation mapping are frozen; the only OpenAPI edit clarifies existing create validation/encoding behavior. |
| `frontend/` | `npm test` | Exit 0; 84 passed, 0 failed; unchanged mock samples still match the contract. |
| `frontend/` | `npm run typecheck` and `npm run build` | Both exit 0; Vite 8.3.4 built 34 modules. |
| `backend/` | `uv run --locked python ../../gearshare-9-live-smoke.py` | **Exit 1** with 42 successful harness assertions and the same one retained cancellation-404 mismatch. Actual Uvicorn, HTTP contenders and probes ran in one owner process/network namespace; clean shutdown, no server traceback. |
| Repository | `git diff --check` | Exit 0. |

The new passing API/domain/memory checks cover B01–B07/P01–P02 and applicable date/transaction boundaries: same-day one-slot creation, partial/enclosing inclusive conflicts, sorted requested intersections without identities, following-day adjacency and different-unit independence; today/exact14/T+90/leap-day/UTC-versus-club and midnight-crossing policy; aggregate field errors before unknown/maintenance lookup; Unicode supplementary/combining/trim/surrogate boundaries; authenticated envelopes and foreign/unknown visibility before version checks; strict literal versions including booleans/strings/`1.0`/`1e0`, stale-before-state, legal owner/coordinator pending/approved cancellation, repeat/terminal refusal, retained immutable history and rebooking. Concurrent ASGI service contenders cross a barrier before the adapter lock: three conflicting-create shapes yield exactly one201/one409; owner/coordinator cancellation yields one200/one stale409 with one matching new event. Injected failures after booking insertion, event insertion, the **second** slot insertion, each cancellation write and complete slot release restore the entire pre-operation state. No assertion was weakened to hide the remaining failure.

### Observed defect retained before correction

With students A/B registered and A's known booking, student B receives HTTP404 and the exact bytes `{"code":"NOT_FOUND","message":"This reservation could not be found."}` for an ordinary unknown booking and for A's private booking. `GET /api/v1/bookings/id%0A` also returns those private-404 bytes. However, `POST /api/v1/bookings/id%0A/cancel` with B's bearer token, `Content-Type: application/json` and `{"expectedVersion":false}` returns HTTP404 with `{"code":"NOT_FOUND","message":"The request could not be completed."}`. The newline before `/cancel` fails route matching and uses the framework error body instead of the private missing-booking body.

Expected: unknown/malformed booking IDs and an inaccessible private booking have byte-identical 404 bodies. Actual: cancellation with this encoded newline has a different message. This is a uniform private-404 contract violation; no disclosure of booking contents or the existence of a real booking was observed. The failing regression is `backend/tests/test_booking_api.py::test_p01_foreign_read_and_cancel_are_byte_identical_to_unknown_before_version_checks[id\n]`, assertion at line294. The loop's GET comparison succeeds; its POST-cancel comparison fails. The real HTTP reproduction used foreign path `/api/v1/bookings/2dfce40f-b04e-4fe2-a95d-e34a1e5f149b/cancel` versus `/api/v1/bookings/id%0A/cancel`.

Raw engineer scratch evidence (outside Git): `/workspace/scratch/e3fbdcf9622e/gearshare-9-engineer-pytest.log`, `/workspace/scratch/e3fbdcf9622e/gearshare-9-live-smoke.py`, `/workspace/scratch/e3fbdcf9622e/gearshare-9-live-smoke.log` and `/workspace/scratch/e3fbdcf9622e/gearshare-9-uvicorn.log`. The committed pytest test is the reproducible regression. The live smoke additionally validates actual schema responses, concurrent one201/one409, owner/other lists/detail, auth-before-JSON, fractional/stale version refusal, successful cancellation, exact system note, released public availability, repeated-state refusal, another student's rebooking and retained history.

The first live harness stopped because it incorrectly assumed GET and cancellation would both mismatch. Correcting only that observation logic allowed both methods and the rest of the smoke to complete; GET matches and cancellation fails as described. An earlier description patch failed to match a long Markdown paragraph and made no file change; the corrected patch was then applied. npm emitted the existing host `http-proxy` warning without failing. These harness/authoring events were not additional application defects.

The actual runtime mismatch was reported to the orchestrator before any correction. Per the required bug loop, source behavior/messages remain unchanged, the failing case is retained, and this checkpoint pauses for publication, an actual `user-test-bug` issue, PM grooming, fresh independent QA reproduction/adjacent cases and a new engineer session. No issue number is fabricated before publication. #9 remains open. There is no independent QA PASS, complete-memory gate, staff lifecycle/inventory mutation, database concurrency/restart persistence, CORS or browser-to-API integration claim. Frontend source is unchanged, so no broad browser campaign was run; its existing browser results remain historical mock evidence.

## Iteration 3 — #29 booking routing correction

Date: 2026-10-22 UTC. Role: new software engineer, not independent QA. Start: clean canonical `3e8bba2686479af21153d130870ef59db83f7e43`, tree `ae64509dc2215a69c59b5b0f8215fa36284ff4f3`. The [fresh #8 independent PASS/closure](https://github.com/allfocusSS/gearshare/issues/8#issuecomment-6336784597) remains the completed prerequisite. Read actual #9/#29, the [#29 PM decision](https://github.com/allfocusSS/gearshare/issues/29#issuecomment-6347336915), [independent QA red baseline](https://github.com/allfocusSS/gearshare/issues/29#issuecomment-6347497727) and frozen API/testing/stage rules before correction. The candidate is the complete `Refs #29` commit containing this record; exact local/published SHA and tree are supplied in the handoff.

Independent pre-fix evidence: 181 variants in each transport, **65 PASS / 116 FAIL** for ASGI and actual Uvicorn. Besides the original private-404 mismatch, QA observed owner cancellation at `/cancel%0A` returning 200 and actually mutating history/version/timestamp/slots, and owned detail plus trailing LF aliasing the real ID. The original QA harness/results/log remain unchanged under scratch `qa29/`; the original #9 failure history above is retained.

### Focused implementation and oracle correction

Only `backend/app/booking_api.py` changes runtime behavior. Booking IDs now occupy one nonempty decoded component. An `APIRoute` subclass requires a complete template match before normal method dispatch, avoiding Python's `$` final-LF allowance; default string components preserve LF inside IDs. The action therefore cannot collide with detail or accept LF after `/cancel`, empty IDs, trailing slashes or extra decoded segments. Method rejection gathers all operations at the same declared template, so collection Allow includes GET and POST. Existing dependencies, manual JSON parsing, service/domain/repository logic and error handlers retain authentication → envelope → private lookup → strict version → stale/state order. There is no prefix-wide 404 rewrite or ID canonicalization.

Added 153 durable `test_booking_routing.py` variants **before** runtime correction: **127 failed / 26 passed**, exit 1. They verify exact bytes/headers and complete before/after store equality with real pending history plus checked-out custody. The original `id\n` P01 foreign/missing byte comparison remains. The former P01 `../unknown` value is explicitly reclassified under PM's decoded topology: its encoded slash produces extra components, so GET and cancellation now have eight stricter generic-404/header/full-state variants across authenticated/anonymous requests. Separate encoded-slash cases verify that `missing%2Fcancel` forms the exact action template, with private 404 for POST and 405/Allow POST for unsupported methods. This is a documented oracle correction, not removal of the LF regression or weaker equality checks. Baseline 452 minus that one reclassified parameter plus 153 new variants equals 604 backend cases.

### Commands and actual results

Linux x86_64, Python 3.12.14, uv 0.12.23, Node 24.19.0, npm 11.9.0; installed locked dependencies, process-memory store, fixed fixture clock `2026-10-21T20:00:00.123456Z` / club date 2026-10-22. Commands below used the final runtime/test source before the documentation commit; no further runtime/test changes followed. The focused ASGI/Uvicorn harness is repeated on the exact complete commit for handoff.

| Directory | Command actually executed | Actual result |
| --- | --- | --- |
| `backend/` | `uv run --locked pytest -q tests/test_booking_routing.py` (before runtime correction) | Exit 1; 127 failed, 26 passed in 2.83 s. |
| `backend/` | `uv run --locked pytest -q tests/test_booking_routing.py tests/test_booking_api.py` | Exit 0; 320 passed in 4.67 s. |
| `backend/` | `uv run --locked pytest -q` | Exit 0; 604 passed in 11.90 s, including preserved auth/catalogue/domain/repository/contract/authoring cases. |
| Repository | `PYTHONPATH="$PWD/backend" backend/.venv/bin/python /workspace/scratch/e3fbdcf9622e/qa29/regression.py --mode both --output /workspace/scratch/e3fbdcf9622e/engineer29-results-after.json` | Exit 0; 181 PASS/0 FAIL through ASGI and 181 PASS/0 FAIL through actual Uvicorn; no rejected-request store mutation. Server/socket/clients share the harness owner process. |
| `backend/` | `uv lock --check` | Exit 0; 44 packages resolved; locks unchanged. |
| `backend/` | `uv run --locked openapi-spec-validator ../openapi.yml` | Exit 0; `../openapi.yml: OK`; frozen wire shapes/limits/operations unchanged. |
| `frontend/` | `npm test` | Exit 0; 84 passed/0 failed; committed mock samples retain contract equality. |
| `frontend/` | `npm run typecheck` and `npm run build` | Both exit 0; Vite 8.3.4 built 34 modules. Existing host `http-proxy` warning only. |
| Repository | `git diff --check` | Exit 0. |

QA's reusable script hardcodes the failing checkpoint in its JSON metadata. The initial engineer `engineer29-results-after.json` therefore retains that script header and is identified here as an uncommitted-source run; the exact-commit handoff rerun sets SHA/tree only in a separate scratch import wrapper and writes a separate result. Neither the original baseline script nor its red evidence is edited. New logs are scratch `engineer29-routing-before.log`, `engineer29-booking-after.log`, `engineer29-backend.log`, `engineer29-frontend-test.log` and `engineer29-focused-after.log`.

These are engineer observations only. No issue was closed or QA acceptance claimed. Fresh independent QA must verify the published correction for #29 and all parent #9 acceptance criteria; #10 remains gated. No frontend/browser campaign was rerun for this backend-only patch; frontend source, staff APIs, ORM/SQLite, persistence/restart and HTTP integration are unchanged and unclaimed.

## Iteration 3 — #10 memory staff failing engineer checkpoint

Date: 2026-10-23 UTC. Role: new software engineer, not independent QA. Start: clean canonical `79a77013b1090366dfa6e2349f9d4402658dabeb`, tree `76631343b634513312f56e81ffcc480f9a34b51a`. Independent QA [passed/closed #29](https://github.com/allfocusSS/gearshare/issues/29#issuecomment-6347711615) on 2026-10-22 at 18:04:00Z and [#9](https://github.com/allfocusSS/gearshare/issues/9#issuecomment-6347723715) at 18:04:36Z before this work began. Read the actual [#10 issue](https://github.com/allfocusSS/gearshare/issues/10), [PM handoff](https://github.com/allfocusSS/gearshare/issues/10#issuecomment-6254623738), [snapshot clarification](https://github.com/allfocusSS/gearshare/issues/10#issuecomment-6309268749), process/engineer/product/architecture/API/testing rules, frozen OpenAPI and passed mock/types.

**This is a failing checkpoint, not a QA-ready candidate or complete-memory PASS.** The checkpoint is the single `Refs #10` commit containing this record; its exact SHA/tree are provided in the handoff. The observed method-header regression remains uncorrected, along with all existing red assertions. No issue has been closed or new bug number invented before publication. The orchestrator requires publication → actual `user-test-bug` → PM → fresh pre-fix QA → new engineer → fresh independent QA before acceptance.

### Implemented memory scope

- Added `staff.py`/`staff_api.py` for coordinator desk, inventory list/add/edit/state and approve/reject/checkout/return. Authentication/role precede manual UTF-8 JSON-object parsing; transactional identity/role are checked again. Lookup precedes strict integer-literal version validation, then stale/state, note and time/custody rules. Cancel retains its owner/coordinator route and shared unchanged version/error semantics.
- Every staff transition atomically changes state/version/update time and appends one server-actor UTC event. Approve retains slots and uses the exact system note; reject releases slots; checkout creates unique physical custody; return removes custody and slots, including overdue returns. Repeated/terminal/stale/invalid-note failures leave the entire snapshot unchanged.
- Inventory reads only editable fields, trims ECMAScript whitespace, normalizes uppercase before code-point limits, rejects surrogates before commit/encoding and enforces normalized code uniqueness under the same lock. Code-index replacements preserve insertion order and existing booking/event history. Maintenance rechecks active custody and pending/approved `endDate >= today` in the same transaction as state change and new-booking allocation.
- Desk counts, overdue and asset-wide custody use one snapshot and one Almaty date. Borrower is the real owner's normalized stored username; original `assetName` remains immutable while code/location join current inventory. Trusted fixture users/chains/versions/slots/custody remain unchanged. No public coordinator grant, fallback borrower or client-owned identity/audit/state field was added.
- Extended the repository protocol/memory adapter for inventory replacement and custody lookup/removal, retaining copy-on-success rollback of every shared map. Extracted exact booking routing into `routing.py` for staff reuse; this extraction introduced the actual 405 header defect below. The existing scope guard now expects anonymous 401 on authorized staff routes; public catalogue remains read-only and frontend remains mock. No ORM/SQLite/migration, HTTP adapter, frontend source, dependency lock or frozen OpenAPI change is included.

### Commands and actual outcomes

Provisioned toolchain: Python 3.12.14, uv 0.12.23, Node 24.19.0 and npm 11.9.0; existing locked dependencies. ASGI cases use UTC `2026-10-21T20:00:00.123456Z` / Almaty date 2026-10-22. The actual Uvicorn harness uses UTC `2026-10-22T20:00:00.123456Z` / Almaty date 2026-10-23. Commands ran the runtime/test source committed in this checkpoint; only factual documentation changed afterward.

| Directory | Command actually executed | Actual result |
| --- | --- | --- |
| `backend/` | `uv run --locked pytest -q tests/test_staff_api.py tests/test_staff_atomic.py tests/test_booking_routing.py` | **51 failed, 363 passed in 7.42 s**. All 261 new staff cases pass; 51 preserved routing cases fail on empty `Allow`. |
| `backend/` | `uv run --locked pytest -q` | **51 failed, 814 passed in 16.75 s**. The complete 865-case memory/contract/authoring suite is red; all failures are retained method-header assertions. |
| `backend/` | `uv lock --check` | Exit 0; 44 packages, lock current. |
| `backend/` | `uv run --locked openapi-spec-validator ../openapi.yml` | Exit 0; `../openapi.yml: OK`; frozen contract unchanged. |
| `frontend/` | `npm test` | Exit 0; 84 passed, 0 failed; mock samples still match the unchanged contract. |
| `frontend/` | `npm run typecheck` and `npm run build` | Both exit 0; Vite 8.3.4 built 34 modules. Existing host `http-proxy` warning only. |
| `backend/` | `uv run --locked python -` (bounded casing probe) | Exit 0; 119 targeted uppercase probes match Node 24.19, including every new casing pair in the existing Unicode delta and selected expansions/supplementary/combining text. No all-scalar campaign was repeated. |
| `backend/` | `PYTHONPATH=. uv run --locked python /workspace/scratch/e3fbdcf9622e/engineer10-live.py` | **Exit 1; 10 staff groups pass, 2 exact 405-header reproductions fail** through actual Uvicorn, with server/socket/clients in one owner process and clean shutdown. |
| Repository | `git diff --check` | Exit 0. |

The added ASGI tests cover full valid/invalid/terminal transitions, UTC actor/event/version preservation, strict literal preconditions and validation priority, surrogate/code-point/trim bounds, inclusive checkout/expired-approval/overdue-return rules, private access, inventory uniqueness and current joins, maintenance blockers/activation and immutable responses. Fault injection after **every staff write** restores state, version, timestamps, events, slots, custody and code index. Barrier-synchronized HTTP contenders exercise simultaneous checkout and duplicate-code creation, plus approve-versus-owner-cancel and maintenance-versus-new-request with uncontrolled concurrency and both forced serial orders. One-snapshot/one-business-date tests cross local midnight and check all affected desk rows. These are engineer checks, not independent acceptance.

Actual Uvicorn exercised real Argon2 setup/login/registration and schema-validated HTTP responses: auth/role before malformed envelopes; normalized unique inventory; preserved booking snapshots with current code/location/real borrower; maintenance blocked by pending/checked-out commitments; approve, strict/stale versions, checkout and due-today custody; return/history/privacy/released calendar; reject/maintenance/refused new request/reactivation; a coherent overdue-loan/later-pickup fixture, blocked pickup, overdue return and successful next checkout; and two barrier-synchronized HTTP maintenance/request contenders yielding one coherent winner.

### Actual runtime regression retained before correction

Source: `backend/app/routing.py::ExactRoute.handle`, extracted from the accepted booking-only route. It scans `scope['app'].router.routes` and filters for `APIRoute` at the same path. Installed FastAPI exposes included routers there as `fastapi.routing._IncludedRouter` wrappers without a `path`; only `/health` is a direct `APIRoute`. The computed allowed-method set is therefore empty. The former accepted implementation scanned its own concrete booking router routes. Route-template full matching, private-404 behavior and forbidden decoded aliases still pass; method headers regress.

Reproduction 1, no authentication or body required: `GET /api/v1/bookings/ordinary-missing/cancel`. Expected HTTP405, `Allow: POST`, body `{"code":"NOT_FOUND","message":"The request could not be completed."}`. Actual HTTP405 and those same Error bytes, but `Allow` is present with an empty value. Reproduction 2: `DELETE /api/v1/staff/assets`. Expected HTTP405 with both `GET` and `POST` in `Allow`; actual header is empty. Both are reproduced through ASGI and real Uvicorn. Every rejected request leaves the complete store unchanged, including identity/session/inventory/code maps, timestamps, history, slots and active custody. No disclosure or unintended mutation was observed.

The 51 red assertions are preserved unchanged in `test_booking_routing.py`; the original `id\n` uniform-private-404 assertion also remains. This defect was reported to the orchestrator with exact source/reproduction/log before any correction. The orchestrator explicitly directed this failing checkpoint and a fresh bug workflow; no route correction is included. An initial live-harness invocation omitted `PYTHONPATH=.` and failed on importing `app` before any application request. The corrected invocation above completed; this harness setup error is not an additional application bug.

Raw scratch evidence outside Git: `engineer10-focused.log`, `engineer10-backend.log`, `engineer10-frontend-test.log`, `engineer10-live.py`, `engineer10-live.log`, `engineer10-live-results.json` and `engineer10-live-setup.log` under `/workspace/scratch/e3fbdcf9622e/`. The regression and new memory tests are committed. No unchanged frontend browser campaign was repeated. Memory state still disappears on restart, the lock is process-local, and no persistence/shared-database concurrency/CORS/HTTP-frontend integration or final submission readiness is claimed. #10 stays open and #11 remains blocked until the corrected complete memory stage independently passes.

## Iteration 3 — #30 shared route method-header correction

Date: 2026-10-23 UTC. Role: new software engineer, not independent QA. Resumed from clean canonical `cba839e8046e19973b7ce18f2bf6dd2ab44d2d1a`, tree `ab959257805f5d49a53a385d0e71499b7463627b`, after reading the actual [#30](https://github.com/allfocusSS/gearshare/issues/30), [PM grooming](https://github.com/allfocusSS/gearshare/issues/30#issuecomment-6360070589), [independent pre-fix QA](https://github.com/allfocusSS/gearshare/issues/30#issuecomment-6360130194), [parent #10 handoff](https://github.com/allfocusSS/gearshare/issues/10#issuecomment-6360048667), its PM decisions and frozen API/testing/process documents. Published QA preparation remains authoritative: 28 PASS/99 FAIL per transport, solely empty Allow, with 125 rejected requests preserving the whole store. The accepted #9/#29 parent and original #10 814 PASS/51 FAIL history above remain intact.

The recovery snapshot did not retain earlier uncommitted correction work or the referenced scratch QA/live harnesses. No lost file, hash or earlier uncommitted result is presented as current evidence. The tests, reusable `backend/scripts/check_exact_routes.py` and results below were newly constructed/executed from the published criteria. The candidate is the single `Refs #30` commit containing this record; its exact SHA/tree and post-commit probe are supplied in the engineer handoff.

Only `backend/app/routing.py` changes application behavior: FastAPI's public `iter_route_contexts` traverses included-router wrappers, and methods are collected only from APIRoute contexts at the exact same template. This restores both collection operations and every declared private/staff method set without adding HEAD/OPTIONS. Complete decoded matching, error handlers, dependencies, domain/services/repository, frontend, frozen OpenAPI and locks are unchanged.

Added 56 durable fixed-oracle variants before runtime correction. The combined new/header and existing booking-routing baseline was **106 failed/103 passed**: 55 new failures/one pass plus all 51 preserved old failures/102 passes. The new tests cover all 11 PM templates with absent/invalid/student/coordinator auth and malformed JSON, DELETE/HEAD, eight LF-ID OPTIONS paths, both original requests, twelve genuine unknown topologies and decoded action/detail precedence. Every rejection checks the complete store, exact safe bytes and headers; HEAD is bodyless. None of the original 865 tests was edited.

Python 3.12.14, uv 0.12.23, Node 24.19.0, npm 11.9.0; installed locked FastAPI 0.146.0 and process-memory storage. The probe uses fixed UTC `2026-10-22T20:00:00.123456Z` / Almaty date 2026-10-23, real Argon2 account setup through HTTP and coherent trusted histories/slots/custody. Socket, Uvicorn server and HTTP clients share one owner process and shut down cleanly. Commands below ran the final runtime/test source; subsequent changes were documentation only.

| Directory | Command actually executed | Actual result |
| --- | --- | --- |
| `backend/` | `uv run --locked pytest -q tests/test_exact_route_headers.py tests/test_booking_routing.py` against unchanged checkpoint app code | Exit 1; 106 failed, 103 passed in 4.36 s with the final no-body original oracle. |
| `backend/` | `PYTHONPATH=. uv run --locked python scripts/check_exact_routes.py --originals-only --output /workspace/scratch/e3fbdcf9622e/engineer30-recovery-originals-before-no-body.json` against checkpoint app code | Exit 1; ASGI 0 PASS/2 FAIL and Uvicorn 0 PASS/2 FAIL. Literally no authentication/body; exact 405 bytes, empty Allow and full-store equality reproduced. |
| `backend/` | `uv run --locked pytest -q tests/test_exact_route_headers.py tests/test_booking_routing.py tests/test_staff_api.py tests/test_staff_atomic.py` | Exit 0; 470 passed in 8.25 s. |
| `backend/` | `uv run --locked pytest -q` | Exit 0; **921 passed in 18.23 s**, including every original assertion. |
| `backend/` | `PYTHONPATH=. uv run --locked python scripts/check_exact_routes.py --output /workspace/scratch/e3fbdcf9622e/engineer30-recovery-transport-final.json` | Exit 0; **133 PASS/0 FAIL per ASGI and Uvicorn transport**, all 128 rejected requests per transport preserve the complete store. |
| `backend/` | `uv lock --check` | Exit 0; 44 packages, lock unchanged. |
| `backend/` | `uv run --locked openapi-spec-validator ../openapi.yml` | Exit 0; `../openapi.yml: OK`. |
| `frontend/` | `npm test` | Exit 0; 84 passed/0 failed, including unchanged mock/contract samples. |
| `frontend/` | `npm run typecheck` and `npm run build` | Both exit 0; Vite 8.3.4 built 34 modules. Existing host `http-proxy` warning only. |

The transport matrix reconstructs the published C01–C13 requirements, then adds representative valid staff/current-inventory joins, approve/checkout/return history/version/custody, maintenance refusal/reactivation/rejection and overdue-return/next-checkout controls. Its 128 rejection comparisons include users/usernames/sessions, assets/code index, booking versions/timestamps/events, day slots, active loans and the seed marker. Supported reads also preserve the entire snapshot. Exact 405 Error bytes, complete fixed Allow sets, no Location/WWW-Authenticate, no LF aliasing, true-unknown404, supported auth/role/envelope/private404 and strict-version→stale→state→note→date ordering all pass.

The initial engineer helper sent malformed JSON on the two original requests; it was corrected to literally no body, then both red originals and the corrected full matrix were rerun into separate files. The temporary baseline replay restored only the unchanged checkpoint routing file and was immediately followed by the same minimal correction; it created no alternate commit or issue. This was a harness correction, not another application defect. Final full backend and transport results above use that corrected oracle. Logs/results are scratch `/workspace/scratch/e3fbdcf9622e/engineer30-recovery-{before-final-oracle,originals-before-no-body,focused,backend-final,transport-final,frontend-test}.log` and the two JSON paths in the table. The probe records actual HEAD/tree/dirty paths rather than borrowing lost baseline metadata; an exact complete-commit output is reported separately in the handoff.

`git diff --check` passed. A targeted diff also confirms every original routing/private/staff test, domain/service/repository source, frontend, lock and frozen contract is unchanged. No new unrelated runtime defect was observed. These are engineer checks only; #30/#10 remain open pending fresh independent QA of every #30 checkbox and every parent #10 criterion. This engineer did not push commits or comment on/close issues. No unchanged frontend browser campaign or large Unicode/security campaign was repeated. ORM/SQLite, process-restart persistence, shared-database concurrency, frontend HTTP integration and final submission remain gated and unclaimed.

## Iteration 4 — #11 phase 1 schema checkpoint

2026-10-24, new engineer after the independently accepted #10/#30 memory gate.
This checkpoint adds ORM schema/migration infrastructure, not a complete #11
repository candidate. The running API, service/domain protocols, memory adapter,
original 921 assertions, frontend and frozen OpenAPI are unchanged. The next
phase remains ORM transactions/repository/runtime selection and targeted API,
CAS and maintenance checks; independent QA will assess the complete #11 candidate.

Python 3.12.14. The host `uv` is 0.13.4; dependency resolution installed locked
SQLAlchemy 2.0.55 and Alembic 1.20.1 (plus greenlet 3.5.6, Mako 1.4.3 and
MarkupSafe 3.0.4). To verify the declared toolchain rather than merely assume
lock compatibility, an isolated **uv 0.12.23** was installed and used for all
final checks below. Existing locked package versions were retained.

| Directory | Command actually executed | Actual result |
| --- | --- | --- |
| `backend/` | `uv tool run --from uv==0.12.23 uv --version` | Exit 0; uv 0.12.23. |
| `backend/` | `uv tool run --from uv==0.12.23 uv lock --check` | Exit 0; resolved 49 packages. |
| `backend/` | `uv tool run --from uv==0.12.23 uv sync --locked` | Exit 0; resolved 49, checked 47 installed packages. |
| `backend/` | `uv run --locked pytest tests/test_database_schema.py -q` | Exit 0; 20 passed in 0.68 s, no warnings on final schema/config. |
| `backend/` | `uv tool run --from uv==0.12.23 uv run --locked pytest -q` | Exit 0; **941 passed in 17.43 s**, including all 921 unchanged memory/contract assertions and the 20 new file-backed schema checks. |
| Repository root | `git diff --check` | Exit 0. |

The schema tests create a fresh temporary SQLite file using Alembic, compare the
migrated schema with ORM metadata, populate it, downgrade to base and re-upgrade.
They verify unique username/token/code/asset-day/custody/event/seed constraints,
foreign-key consistency, positive versions, date/state validity, complete rollback
on a late slot conflict, and exact UTC microseconds/local dates after reopening
the engine. That engine-reopen check is deliberately not a real process-restart
claim. No unrelated real API defect was observed. No browser, full shared-store
parity, #12 concurrency/restart or frontend HTTP-default check is claimed.
No database, session token, password, WAL/SHM file or environment secret is committed.

## Iteration 4 — #11 complete ORM engineer candidate

2026-10-24, continuation by the same engineer after publication of phase 1 as
`05945d2d70548ea18d0b0a0a4e4c5e3f0cefbe7e` (tree
`b55c510c2749cb046e0cd327d014382bcdfed30e`). This commit completes the groomed
#11 implementation; independent QA has not yet accepted it and #11 stays open.

The adapter uses fresh permanently closed ORM sessions and real transactions,
immutable projections and stable insertion order. SQL conditional updates compare
booking version/state and shared asset availability version. Recognized contention
rolls back and re-executes the whole service operation, preserving original inputs
and expectedVersion while rechecking permissions/availability. Known domain
conflicts retain their useful/private 409. Four attempts, bounded SQLite busy
wait and 10/20/40 ms backoff limit infrastructure contention; if it persists the
already documented generic 503 is returned. Unexpected database errors retain the
unchanged safe 500 boundary. Unique/FK/CHECK constraints remain authoritative;
no Python process lock or raw SQLite query enters service/domain logic.

`GEARSHARE_STORE=sqlalchemy` selects the same database URL as Alembic; memory is
still the explicit default and real Python adapter. Migrations are a separate
command. Startup seed rows/history/allocations/marker commit once together and
never overwrite existing accounts or credentials. Owned engines close with app
lifespan. The frontend/mock, root OpenAPI, domain records, MemoryRepository,
original API/routing tests and dependency lock are unchanged from phase 1.

Python 3.12.14; the following backend commands used isolated **uv 0.12.23**,
locked SQLAlchemy 2.0.55/Alembic 1.20.1. Frontend check used actual Node 24.22.1/npm 11.9.0 (within declared Node 24.x).
The first new test run had 10 harness TypeErrors because the existing helper's
keyword-only `note` was passed positionally (16 tests already passed); only the
new harness calls were corrected. An injected unexpected DB fault was made into
a real missing-table SQLAlchemy query, removing an irrelevant cartesian-product
warning. Neither was an observed application defect; no bug was fabricated.

| Directory | Command actually executed | Actual result |
| --- | --- | --- |
| `backend/` | `uv tool run --from uv==0.12.23 uv run --locked pytest tests/test_sqlalchemy_store.py -q` | Exit 0; 28 passed in 2.56 s before the final contract-aligned exhaustion status adjustment. |
| `backend/` | `uv tool run --from uv==0.12.23 uv run --locked pytest tests/test_sqlalchemy_store.py tests/test_database_schema.py -q` | Exit 0; **48 passed in 3.07 s** on final adapter/retry behavior. |
| `backend/` | `uv tool run --from uv==0.12.23 uv run --locked pytest -q` | Exit 0; **969 passed in 18.55 s**, retaining every original 921 memory/contract assertion plus phase 1's 20 schema checks and 28 ORM cases. |
| `backend/` | `PYTHONPATH=. uv tool run --from uv==0.12.23 uv run --locked python scripts/check_sql_store.py --output /workspace/scratch/e3fbdcf9622e/engineer11-sql-live.json` | Exit 0; **16 PASS/0 FAIL**, actual same-owner Uvicorn with migrated temporary FILE-SQLite and real Argon2. Initial source run; final committed-source replay is reported in the handoff. |
| `backend/` | `uv tool run --from uv==0.12.23 uv lock --check` | Exit 0; 49 packages, lock unchanged. |
| `backend/` | `uv tool run --from uv==0.12.23 uv run --locked openapi-spec-validator ../openapi.yml` | Exit 0; `../openapi.yml: OK`. |
| `frontend/` | `npm test` | Exit 0; **84 passed/0 failed**, existing host `http-proxy` warning only. |
| Repository root | `git diff --check` and targeted unchanged-path comparison against phase 1 | Exit 0; no original frontend/OpenAPI/domain/memory/test/lock changes. |

The 28 ORM cases cover the real lending lifecycle, private404/role ordering,
normalized username/code conflicts, immutable booking name/history after inventory
edits, all five stale-version mutations, twelve late-write rollback points across
record types, seed marker/account preservation after reopening an engine, explicit
store selection, actual version/state CAS rejection and three targeted two-engine
races (maintenance/request, approve/cancel, overlapping requests). A held real
SQLite writer proves bounded safe 503; an injected unexpected missing-table fault
proves distinct safe 500 without SQL/secret logging. Race rechecks produce stale
expectedVersion fields, anonymous unavailable dates or the ordinary maintenance
rule message rather than exposing competing identities. The complete table snapshot
is compared on rollback/failure cases.

The live smoke checks configured ORM startup/seeding, real auth/normalized duplicate
rollback, anonymous schedule privacy, create/event/slot, overlap rollback, private404
and staff403, exact 405 Allow on both original route classes, approve/checkout/return
with history/version/custody, stale conflicts, rebook/cancel/release, maintenance
refusal, logout revocation and UTC/local-date restoration. Socket, server and HTTP
clients share one owner process; all are stopped cleanly. Its JSON reports real
HEAD/tree/dirty paths and no token/password. These are targeted #11 engineer checks,
not independent QA, a full #12 shared-contract/concurrency campaign, real process
restart or frontend HTTP integration. No new unrelated API defect was observed.
The engineer did not push, post comments or close an issue. No SQLite file,
WAL/SHM, local environment or secret is committed.

## Iteration 4 — #12 persistence, contention and storage parity engineer candidate

2026-10-24 (container clock), branch `feat/persistence-12` in its own worktree on top of the
independently accepted #11 commit `966fef5fce651975118d05636b71a0d8fb30f5dc`
([QA PASS](https://github.com/allfocusSS/gearshare/issues/11#issuecomment-6381631441)). `origin/main`
did not move during the work (no rebase needed). This is **engineer evidence, not a QA verdict**; #12
stays open. The work was taken over by this session after no activity from the session first assigned to
it. Application code is unchanged: the work adds tests, support modules, `backend/scripts/mutation_sanity.py`,
a root `Makefile` and documentation. The code and tests below were run at `fd016da9752d3563982cda2a4e94a72bfc8cc28a`
(tree `3a74bd1e876e0cf25a88d017d625ac4f9e2a9a03`); later commits only change Markdown. A parallel branch for
#13/#14 exists and was neither merged nor used.

### Environment and clock

Linux 6.18 (x86_64, 2 CPUs); Python **3.12.3** in the locked uv environment (`uv 0.11.32`); SQLite **3.45.1**,
SQLAlchemy 2.0.55, Alembic 1.20.1, FastAPI 0.146.0, Starlette 1.9.0, Pydantic 2.14.1, uvicorn 0.54.0, httpx 0.28.1.
**Deviation from the documented prerequisites:** the container has Node 22.22.0 and uv 0.11.32, not Node 24.x / uv 0.12.23;
the frontend is untouched, so no `npm` command was run, and `uv.lock` is unchanged and passes `uv lock --check`. Every
in-process scenario uses a fixed injected clock (`NOW` = 2026-10-21T20:00:00.123456Z = 2026-10-22 01:00 in Asia/Almaty,
club day 2026-10-22; midnight scenarios add 23 h). Real-server scenarios use the real clock and the club-local date.
Databases are fresh temporary files created through `alembic upgrade head` (never `create_all` or `:memory:`) and deleted afterwards.

### Commands actually executed (from `backend/`)

| Command | Result |
| --- | --- |
| `git fetch origin && git status -sb` | Branch ahead of unchanged `origin/main` (no rebase). |
| `uv lock --check` | Exit 0; 49 packages, lock unchanged. |
| `uv run --locked pytest -q` (everything) | Exit 0; **1262 passed, 7 warnings in 196.30 s** (969 existing + 293 new). The 7 warnings are Pydantic `UnsupportedFieldAttributeWarning` (path-parameter `alias`) emitted the first time threads build certain route models; not failures. |
| `uv run --locked pytest -m persistence -q -s` run 1 / 2 / 3, consecutive | **293 passed each**; 170.65 s / 168.13 s / 166.28 s. Every `[race]`/`[process]` line identical in invariant outcome; only winners and 503 counts in liveness scenarios vary (below). |
| `GEARSHARE_RACE_ITERATIONS=50 uv run --locked pytest -m persistence -q -s` | **293 passed in 229.01 s**; every race scenario 50 iterations. |
| `uv run --locked openapi-spec-validator ../openapi.yml` | `../openapi.yml: OK`. |
| `uv run --locked python scripts/mutation_sanity.py` | Baseline of every group green, then **18/18 mutations killed** (table below). |
| `uv run --locked python scripts/mutation_sanity.py --matrix --only sql-no-booking-cas sql-no-availability-claim service-no-create-event` | Kill matrix for the three most informative mutations (below). |

The 293 new tests are: shared repository contract 113 (56 scenarios x memory and file SQLite, plus a 23-step
differential transcript), invariant auditor 52 (37 corruption classes, memory corruptions, union coverage), dialect
confinement 19, concurrency 21, fault injection 77, lock contention 6, real process restart 5. Suites needing slow
processes are marked `persistence` (all seven modules are), `subprocess` for those spawning uvicorn; the default
`pytest` still runs all of them (3 min 16 s here).

### Races (file SQLite, separate engine/session/app per contender, barrier + seeded jitter, fresh migrated copy per iteration)

The auditor re-read the physical database after every iteration. Counts below are per run of 30 (the 50-iteration
run had the same shape). Every conflict-shape row had **exactly** the stated outcome in all of the 30 x 3 + 50 iterations.

| Scenario | Outcome observed |
| --- | --- |
| 8 clients, same unit and day (also 16 in the exploratory run) | always one 201 and seven 409 with only `unavailableDates` and no borrower identity; one booking, one create event, one allocation set |
| same-day, identical range, partial overlap, enclosing, enclosed (2 clients each) | always 201 + 409 |
| adjacent days; different units | always 201 + 201 |
| 6 clients, one unit, different days (liveness) | 201x6 in 10-16 runs of 30, 201x5 + one 503 in 11-16, 201x4 + 503x2 in 3-6 (50-run: also one 201x3 + 503x3); acknowledged == persisted every time |
| approve vs cancel | winner approve 9-16, cancel 14-21 of 30; one event, version +1 once |
| approve x2, cancel, reject; cancel x2 vs checkout; 2 approves + stale/future versions | exactly one winner / one 200 + three 409 each time; winners varied |
| 5 approvals of different bookings, one unit (liveness) | 200x5 in 19-21 of 30, otherwise 200x4 + one 503 |
| 3 checkouts of one booking | always one 200 + two 409, one active loan |
| two bookings, one unit, across midnight | one winner each time (day one 8-18, day two 12-22 of 30), at most one loan |
| overdue loan blocks next checkout; return vs pickup | serial check always 409; race: pickup 409 in 29/30, 30/30, 29/30, 50/50 (the rest returned first, then pickup 200) |
| maintenance vs new booking (same unit) | maintenance won 10-17 of 30 (booking 409), booking won 13-20 (maintenance 409); never both |
| maintenance vs checkout; vs cancel of last commitment; vs booking of another unit | checkout always wins (maintenance 409); cancel wins and maintenance succeeds only afterwards (1-4 of 30); other unit always 200 + 201 |
| 8 separate client **processes** with a `multiprocessing.Barrier` against a real uvicorn server, one worker and three workers | 30/30 rounds each: one 201 and seven 409, losers carry no username/purpose/booking id; slowest request 0.09 s / 0.12 s; one booking, event and allocation per round |

Non-conflicting bursts can therefore produce the documented bounded 503 (four attempts, 10/20/40 ms backoff) when several
writers hit the same unit at the same instant; no partial row was ever found.

### Real process restarts (actual `python -m uvicorn app.main:app`, `GEARSHARE_STORE=sqlalchemy`, temp file, ports 6400-6499)

In the main restart test (run 1): `alembic upgrade head` exit 0; process A pid 12862 port 6406 created users
(registered students; a coordinator inserted by trusted setup with a real Argon2id hash), sessions, a booking lifecycle
(create, approve, checkout, return), further pending/approved/cancelled bookings and a revoked token, then **SIGTERM -> exit -15,
graceful shutdown logged**; process B pid 13152 port 6402 (restart 1) returned byte-identical booking details, events, versions,
desk and 91-day availability, accepted the persisted unexpired tokens, still rejected the revoked token, verified passwords,
refused a duplicate normalised username and the same overlapping dates, then took stale-version 409 and valid transitions;
**SIGKILL while idle -> exit -9, no graceful shutdown logged**; process C pid 13298 port 6461 (restart 2) returned everything
B had saved, authenticated the token created under B, accepted a further transition, **SIGTERM -> -15**. Logs contain no traceback
and none of the passwords or tokens. By design tokens survive restarts until their absolute 24 h expiry (only the hash is stored)
and a revoked token stays revoked; the memory adapter loses everything. Whole-run lifecycle (identical in all four persistence runs): 6 migrated databases, 12 server starts, stops SIGTERM -15 x6,
SIGKILL -9 x4 and SIGTERM 0 x2 (the three-worker supervisor exits 0).

**SIGKILL during a write burst** (four HTTP writers, three rounds): every acknowledged booking existed after restart with one event and
version 1; rounds persisted 57, 122, 185 bookings (cumulative) against 57, 121, 184 acknowledged, i.e. 0-1 booking per round was
committed but unacknowledged (kill after commit, before the response), which is correct. Over the four runs (12 kill rounds) the kill left a rollback-journal file in 9 rounds: 8 with an invalid, never-completed header
(SQLite does not treat it as hot; the next committed write removed it) and 1 hot journal (valid header) that the first reader after
the restart rolled back and deleted; 3 rounds left none. No half-written booking, orphan slot or missing event was ever found
(auditor clean after every restart).

### Fault injection (both adapters) and SQLite faults

77 cases inject an exception after the k-th call of each repository method for booking creation (booking, create event, slot 1-4;
1-7 of 8 slots), all four transitions, maintenance, add/edit asset, register, login and logout, in memory and SQLite, plus 14
DBAPI statement faults (`disk I/O error` on the n-th statement of a prefix) and a real `SQLITE_FULL` via `PRAGMA max_page_count`
(19 bookings acknowledged, the next ones returned the safe 500 and the full table snapshot was unchanged; recovery succeeded after the
cap was lifted). Each case asserts that the fault fired, the response is the contract `Error` envelope (500 `SERVICE_UNAVAILABLE`,
generic message, no stack trace or SQL), the complete table snapshot is unchanged (no partial booking, create event, orphan slot
or version change; prior history intact), the auditor is clean and the same valid request then succeeds.

### SQLite settings and lock behaviour (SQLite 3.45.1 only; no claim about any other database)

Read back from a live connection: `journal_mode=delete` (no WAL), `synchronous=2` (FULL), `foreign_keys=1`, `locking_mode=normal`,
busy timeout = the configured value (2500 ms in the test, default 5000), `isolation_level=None` with an explicit deferred `BEGIN`; the
timeout setting rejects 0, negatives and values above 30 s. Another connection held the lock while independent clients ran:

| Lock held by another connection | Writers | Readers |
| --- | --- | --- |
| RESERVED (`BEGIN IMMEDIATE`) through the race, busy timeout 0.3 s (8 iterations) | 503 in about 0.15 s (busy timeout not used: a read-to-write upgrade fails at once; four attempts + backoff) | 200 |
| same, released after 0.25 s with 2 s timeout (8 iterations, 4 runs) | still 503 in 28 of 32 iterations over four runs; in the other 4 the writers arrived after the release and got 201 | 200 |
| EXCLUSIVE through the race, 0.3 s timeout (4 iterations) | 503 after 1.3-1.6 s (4 x timeout + backoff) | 503 after the same time |
| EXCLUSIVE released after 0.25 s, 2 s timeout (8 iterations) | all four 201 | 200 |
| real uvicorn process, RESERVED then EXCLUSIVE, timeout 0.3 s | write 503 in 0.09 s, login 503; after EXCLUSIVE write 503 in 1.29 s | RESERVED 200, EXCLUSIVE 503 in 1.29 s; `/health` 200 in both; the process survived and the next request succeeded |

Never a hang, a stack trace or the words "locked"/"sqlite" in a response; the table snapshot was unchanged and the same requests succeeded
after release. The static test shows SQLite/PRAGMA/raw SQL and OperationalError handling only in `app/database.py` and
`app/sqlalchemy_store.py`, no SQLAlchemy import outside `database.py`, `sqlalchemy_store.py` and `models.py`, and that the default memory
configuration never imports SQLAlchemy (the checker is itself tested on eleven synthetic offenders and five allowed homes).

### Invariant auditor

26 violation classes (duplicate (asset, day) slot, orphan/outside-range/missing/terminal slots, missing or misplaced create event,
broken chain, state or version mismatch, orphan event, duplicate/orphan/wrong-state loan, missing loan, maintenance unit with live
commitment, dangling references, duplicate username or code, invalid dates), proven by 37 SQL corruptions of a scratch file database
(foreign keys and checks switched off, constraints dropped where the class needs them), memory-state corruptions, a union-coverage
test over all codes, and by the mutation script. Rule used for maintenance: a unit in maintenance may not keep a checked-out booking
or a pending/approved booking ending today or later (the application rule); an old approved booking whose end date has passed is
not a violation.

### Mutation sanity (scratch copy; each replacement must match exactly once; races at 6 iterations)

| Mutation | Killed first by |
| --- | --- |
| memory adapter accepts a duplicate (asset, day) slot | contract (memory) |
| memory adapter accepts a second active loan per unit | contract (memory) |
| memory transaction publishes on error | contract (memory) |
| SQL transaction commits on error | contract (SQLite) |
| logout no longer deletes the session | contract (SQLite) |
| migration without the slot primary key | contract (SQLite, via Alembic) |
| stale `expectedVersion` accepted | contract (both) |
| any student reads any booking | contract (both) |
| checkout ignores an active loan | contract (both) |
| maintenance ignores pending/approved bookings | contract (both) |
| no create event written | auditor tests; also contract, fault, contention, concurrency and restart tests and at least 3 pre-existing tests (matrix run, stopped at the 3-failure limit) |
| cancel keeps its slots | auditor tests |
| locked database no longer recognised as contention | lock-contention suite |
| seed marker ignored | process-restart suite (server crashes at start on the seeded file) |
| auditor stops flagging duplicate slots; auditor stops requiring a create event | auditor self-tests |
| **booking compare-and-set removed** | **only the #11 adapter test `test_cas_predicate_rejects_changed_version_or_state_inside_adapter`; every new #12 suite, including 30-iteration races and restarts, stayed green** |
| **availability-version claim removed on create** | **only one #12 statement-sequence fault case (`create-UPDATE-ASSETS-1`); races, restarts, contract and contention stayed green** |

No mutation survived the whole suite, but the last two survive every *behavioural* #12 test, which is the honest limit of this
verification: in SQLite's rollback-journal mode the file lock serializes read-then-write transactions, so these predicates cannot be
distinguished from it by outcome. They are defence in depth that only adapter-level tests observe. Mutations were also run on the
test side (the two auditor mutations).

### Observations, defects and limits

* **No application defect was exposed**, so no `user-test-bug` issue was filed and no application code changed.
* **Cold multi-worker start (limitation, not filed):** `uvicorn --workers 3` on a freshly migrated, still unseeded file makes one or two
  workers lose the first-seed write race. `seed_catalogue` raises the documented 503 "service is busy" during import, the worker dies
  and uvicorn's supervisor restarts it (second attempt succeeds). Observed in 13 of 14 exploratory cold starts and in the three pinned test runs (1, 2 and 2 failed imports); 3 workers always ended alive and
  served every request with 200 (60/60 in the test); the catalogue was seeded exactly once; the only traceback type was that 503). A single process or an
  already seeded file never showed it (the 3-worker race test runs on a seeded file with no traceback). `test_cold_start_of_three_workers...`
  pins this as a safety property, not as a guarantee of a quiet start. The documented deployment is one process; if multi-worker start-up
  is wanted later, seed once before starting workers.
* Writers that hit one unit simultaneously can receive the documented 503 (see races); clients must retry. A lock held by another writer
  gives a fast 503 even when it is shorter than the busy timeout (above).
* Only SQLite 3.45.1 on one Linux host was exercised: no WAL mode, network file system, other database, other Python/SQLite version or
  sustained load. Docs name Node 24/uv 0.12.23; this container has Node 22/uv 0.11.32, so frontend commands were not run.
* The kill tests prove behaviour of this machine's file system and SQLite build; power-loss durability is not tested.
* Shared-contract differences that are documented rather than hidden: duplicate slot/loan/seed marker raise `ValueError` in memory and
  `TransactionRetry` in SQL; dangling foreign keys `ValueError` versus `IntegrityError`; naive timestamps `ValueError` versus
  `StatementError`. The service results are identical.
* The engineer did not push, post a QA verdict or close an issue. No database file, journal, token, password or environment secret is committed.
