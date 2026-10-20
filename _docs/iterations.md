# Iteration log

## 2026-10-19 — Product and process preparation

- Proposed GearShare, an equipment lending application distinct from StudyTrack.
- Fixed day-based inclusive booking rules, roles, state machine, race protection and audit visibility before code.
- Selected React/TypeScript + FastAPI/SQLAlchemy as the proposed stack after comparing options.
- Defined specific Linear/Cal.com references and a visual/component brief; no external design-agent session is claimed.
- Drafted 20 MVP stories, 3 post-MVP follow-ups and a concrete test matrix.
- Defined PM/engineer/independent-QA loop and explicit QA-owned closure.
- Repository dependency: only StudyTrack is currently accessible; need a separate empty project repository before issue publication or application implementation.

## Required future entries

For each implemented iteration: date, real issue URLs, start/end commits, delivered behavior, actual check commands/results, bugs and corrections, changed documents and the verified gate into the next stage. Keep this heading as a template, not evidence that future iterations occurred.

## Repository access and backlog publication

- User supplied https://github.com/allfocusSS/gearshare and added it to the GitHub app's selected repositories after the first 403.
- Published MVP issues #1–20 and post-MVP #21–23 before writing application code.
- GitHub Issues is now authoritative. Stage 0 starts with PM grooming of #1.

## 2026-10-19 — Iteration 0 bootstrap, #1

- Issue: https://github.com/allfocusSS/gearshare/issues/1. PM marked READY; engineer implemented only the minimal startup screen and health endpoint. Independent QA is pending; #1 stays open and the iteration-1 gate has not passed.
- Start commit: `ce3adc901205ae9c91fd17c361d833c2c0c7e85a`. End candidate: the commit containing this entry; exact local/published SHA is recorded in the issue handoff.
- Added public `uv.lock` / `package-lock.json`, Python 3.12 and Node 24 toolchain declarations, `.env.example`, source entry points and one real health test. No booking, auth, repository, ORM, migration or database code was added.
- Clean dependency installation succeeded with `uv sync --locked` and `npm ci`. `uv run --locked pytest` passed 1 test; `npm run typecheck` and `npm run build` exited 0. Both documented dev commands were started and checked over HTTP, including live health JSON. See `evidence.md` for exact commands, environment and limits.
- Initial TypeScript CSS import typing was corrected before the passing build. No real product/browser defect was observed; no bug issue was fabricated.
- Updated README, AGENTS, architecture/testing status, process status, submission matrix and evidence to describe the skeleton accurately while preserving future stage plans. The next story remains #2 after independent QA PASS/closure of #1.

## 2026-10-19 — Iteration 0 independent gate and iteration 1 shell/auth, #2/#24

- Independent QA [passed and closed #1](https://github.com/allfocusSS/gearshare/issues/1#issuecomment-6261432589) at published `a8ec9b7469b9d1e2f091bc0fdf0369be7e9ba6ad`. Only then did engineering begin groomed [#2](https://github.com/allfocusSS/gearshare/issues/2).
- Implemented the single async `GearShareService` identity boundary with typed errors, memory-only mock accounts/session, responsive role navigation, accessible sign-in/registration and deterministic Normal/Loading/Empty/Error controls. Catalogue, reservations and staff/inventory behavior remain previews; no OpenAPI/API/persistence work was pulled forward.
- Applied PM's username refinement to product and implementation: trim; `^[A-Za-z0-9_]{3,30}$`; lowercase normalization/uniqueness; passwords 10–128 characters; registration fixes student role. Corrected the factual brainstorming access transcript to its single real `done` after the 403/install-settings instructions, preserving the supplied repository URL section.
- First browser testing found the real async validation-focus defect. Local failing checkpoint `70c601820cabf4c86fc73ba22eb251eaf934246e` was published as `b23325c27166776d44c26b063187f745459e8b98`, identical tree `bcf76dc6d121c22b60ee09596d049409e3a306c8`. Created [#24](https://github.com/allfocusSS/gearshare/issues/24) before correction; paused for PM grooming and independent QA's published-candidate FAIL plus seven regression cases. Preserved actual failure evidence in `evidence.md`.
- After those gates, moved first-invalid-field focus until after pending controls are enabled; it runs once per result and preserves typing, form-level errors, repeated-submit protection and successful navigation. Final engineer commands: `npm test` (11 passed), `npm run typecheck`, `npm run build` (exit 0), and `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/tmp/chromium npm run test:browser` (26 browser checks passed in Chromium 153). Inspected desktop/mobile screenshots. Exact corrected local/published SHA/tree mapping is in the issue handoffs; this entry travels with that candidate.
- Updated README/AGENTS, product/architecture/design/testing/evidence/submission status and process/QA instructions. Clarified #20's final-audit closure postcondition: verify substantive criteria with only #20 open MVP/zero bugs, close it, immediately query zero/zero, post final PASS; reopen FAIL if nonzero/unverifiable. Post-MVP may remain open.
- PM rechecked #16 and groomed #17–20 with original criteria preserved; all MVP backlog grooming is now complete. Ahead-of-time grooming does not authorize implementation beyond each issue's QA gate.
- #2 and #24 remain open awaiting independent QA on the corrected published candidate. The mock iteration is not complete and #3 remains gated; no later stage PASS is claimed.

## 2026-10-19 — Iteration 1 public catalogue and calendar, #3

- Independent QA passed and closed [#24](https://github.com/allfocusSS/gearshare/issues/24#issuecomment-6261813373) and [#2](https://github.com/allfocusSS/gearshare/issues/2#issuecomment-6261825132) at published `13721cf559812c6337cee8c43bb6890d236139ba`, tree `2facd11b590f45c698dc58f2f08cb40c6e6a78ba`. Only then did engineering begin groomed [#3](https://github.com/allfocusSS/gearshare/issues/3).
- Extended the same async service with `listAssets`, `getAsset` and `getAssetAvailability`; seeded ten fictional physical units across the four categories. Relative occupied-date fixtures contain no borrowers/private booking records. Availability projects only dates/states over club-local today through today+90 inclusive.
- Replaced the Explore preview with intersecting search/category/paired-date filters and cards. Added public detail, original local SVG category artwork, month navigation, explicit occupied/maintenance/selected states, labeled date alternatives, exact inclusive duration and timezone, plus empty/missing/loading/retryable-error feedback. Invalid/partial dates hide stale results and availability claims. Auth can return to the concrete equipment detail.
- Service tests use an injected clock; browser catalogue tests fix Date to `2026-10-19T06:00:00Z` while async timers run normally. Engineer checks: `npm test` (22 passed: 11 catalogue/date/privacy plus 11 existing auth), typecheck/build (exit 0; 30 modules), catalogue browser (28 checks) and preserved auth/focus browser (26 checks), all exit 0. Desktop/mobile screenshots inspected; no page/console/request/API errors or new observed product defect.
- Updated living product/design/architecture/process/testing/README/evidence/submission status. Catalogue/privacy and inclusive-date shape now reflect actual source; no HTTP routes/OpenAPI were invented. Requests/history/cancellation and staff mutation remain for #4/#5; no backend/persistence work was added.
- Start: `13721cf559812c6337cee8c43bb6890d236139ba`. Candidate: the commit containing this entry, with exact local/published SHA/tree in the #3 handoffs. #3 stays open for independent QA; the complete mock-stage gate remains after #5.

## 2026-10-19 — Iteration 1 student requests/history, #4

- PM authorized #4 after independently closed #3: [handoff](https://github.com/allfocusSS/gearshare/issues/4#issuecomment-6267394270).
- Implemented mock-only requests, private list/detail/event timeline, inclusive allocation/conflict/date/purpose checks, cancellation/rebooking and active/overdue/terminal views. Added deterministic conflict and failed-request controls. No staff mutation or later-stage implementation.
- Engineer verification is recorded in evidence.md. Candidate is the commit containing this entry; exact published SHA belongs in the handoff. #4 stays open for independent QA.


### #26 — local icon resource / clean-browser correction (2026-10-19)
Implemented PM-groomed missing-favicon correction with an original local SVG and HTML declaration only; no auth/catalogue/booking/service changes or diagnostic filtering. Added dedicated dev/default+strict-port and production-preview resource regression checks for both widths and all three public entry routes. Unit 27/27, typecheck/build, unchanged auth 26/catalogue 28/bookings suites and 18 resource cases all passed. See evidence.md for actual commands, responses and Node 22 limitation. Candidate awaits independent QA; issue left open and later stages remain gated.

The fresh independent check at `3613944f2d76ce2234ff2d0efa11e53fbe472f73` subsequently failed catalogue after 19 checks on both 5173/5196. Added one detail-readiness wait before the mobile date fill, preserving every assertion and application source. Engineer reruns on both ports passed all 28 checks with Node 24/npm 11; the failure and corrected results are recorded in evidence.md. This local candidate still requires independent QA and publication authorization.

## 2026-10-20 — Iteration 1 staff desk/inventory, #5 functional checkpoint

- Began only after independently closed #4/#25/#26. #5 is groomed and remains mock-only; #6/OpenAPI and later stages remain gated.
- Extended the async service with coordinator desk, complete staff transition table/UTC audit chains, derived overdue/current physical custody and inventory create/edit/state checks. Seeded anonymous occupied patterns now project real coherent booking chains; owner privacy/history is preserved.
- Added dedicated accessible staff/action/equipment form views, real counts/queues/history, desktop tables/mobile labeled cards and visible required resolution for maintenance/custody conflicts. No API, backend business logic, persistence or Booking version work.
- Implementation local 428883d was published as ddb1841, identical tree 6a27f9fa48070b7e9f44b012baf7cdd445a06cb6. This checkpoint adds durable tests/docs. Actual engineer results: 41 unit groups, typecheck/build, preserved auth 26/catalogue 28/bookings browser suites and 8 new staff browser groups passed. Exact commands, environment, limitations and repaired harness-only errors are in evidence.md.
- Actual screenshot inspection found visible accessibility-only text because `.sr-only` was undefined. Filed real user-test-bug #27 before correction; PM/independent QA pre-fix workflow is pending. Functional passes do not establish visual or independent QA PASS. #5/#27 remain open.
- Updated current-status headers and README/product/architecture/design/testing/evidence/submission documents to record independently closed prerequisites and the actual staff candidate while retaining historical failures.

## 2026-10-20 — #27 correction and #5 final engineer handoff

- Published the #5 functional/docs checkpoint as d60e322, then corrected only the missing global visually-hidden utility after the actual #27 PM/QA cases and adjacent addendum. Naming markup and service behavior are retained. Included QA's final focused runner and the student's adjacent hidden-name assertion.
- Corrected implementation local 2bd9b26 was published as f89c963b8b0193d159f74742e126a966a0053bd3, tree87b7f39c81c9814d21dd5b4dc3ba66f98618cb53. Standard engineer checks on that exact commit passed: npm test41/41, typecheck0, build0.
- Preserved focused results show baseline346 assertions with70 clipping failures; corrected expanded runner448/448 successful assertions and no console/page/request failures. Engineer inspected corrected desk/inventory screenshots390/1440. This is scoped evidence, not an overall independent verdict.
- Final handoff changes documentation only and explicitly distinguishes pre-fix full functional browser passes from corrected focused results. Fresh independent QA still must run the complete surrounding browser set and verify #5/#27 before closure; the mock-to-contract gate remains blocked.

## 2026-10-20 — #28 staff command/read recovery checkpoint

- Independent QA passed/closed #27, then found the actual #28 async recovery defect and failed #5 on published `e4b4593f5d3235bf0f87a9ff8158fe77097d3a33`. Read the actual issue, PM chosen unavailable-until-read recovery and pre-fix R01–R08 before implementing the correction.
- Retained command-confirmed Booking/history separately from the untrusted staff desk, withheld queues/counts/derived custody-overdue and dependent actions, and kept a persistent accessible saved-command/read-failure alert with guarded read-only retry and meaningful Back/refresh focus.
- Standard engineer checks pass (41 tests, typecheck, build). Focused and surrounding browser checks remain pending at this checkpoint; see evidence.md for actual outcomes and limits. Source scope is CoordinatorPage only. #28/#5 stay open for independent QA; no #6/OpenAPI, backend, persistence or version work started.

## 2026-10-20 — #28 completed engineer verification

- The combined source/test checkpoint local `e7cab7c10c436e39983535588b6a63d5c00fe519` was published as canonical `2947e1232e1d619005ebcc6c0838c8ac8a0bb549`, identical tree `1bd5406797ccb816dada68fd0e15148426fbeda5`, before final verification. QA's handed-off focused runner is included unchanged.
- On that unchanged canonical commit, engineer checks completed: 41 unit tests, typecheck/build, #28 focused 635/635, full staff 8/8, auth 26/26, catalogue 28/28, bookings suite and #27 labels 448/448, all exit 0. Both-width recovery/desk screenshots were inspected. Exact commands, environment, result paths and limits are in evidence.md.
- No additional source/harness correction or new runtime defect was needed. This handoff changes evidence/iterations only. #28 and #5 remain open for fresh independent QA; #27 is already independently closed, and #6/OpenAPI plus all backend/storage/version stages remain gated.
