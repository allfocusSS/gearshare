# Iteration log

## Current stage

As of 2026-10-23, independent QA passed and closed #1–9 and the observed bugs #24–29. In particular, QA [passed/closed #29](https://github.com/allfocusSS/gearshare/issues/29#issuecomment-6347711615) at 2026-10-22T18:04:00Z and [#9](https://github.com/allfocusSS/gearshare/issues/9#issuecomment-6347723715) at 18:04:36Z, accepting canonical `79a77013b1090366dfa6e2349f9d4402658dabeb` (tree `76631343b634513312f56e81ffcc480f9a34b51a`). The earlier #6/#9/#29 FAIL/correction history remains below and in evidence.md.

Only after those prerequisite closures did a new engineer implement [#10](https://github.com/allfocusSS/gearshare/issues/10) under its [PM handoff](https://github.com/allfocusSS/gearshare/issues/10#issuecomment-6254623738) and [trusted-snapshot clarification](https://github.com/allfocusSS/gearshare/issues/10#issuecomment-6309268749). Coordinator desk/inventory and approve/reject/checkout/return use the same memory lock and immutable records. The frontend, frozen contract, dependency locks and true-memory storage boundary remain unchanged.

The published #10 checkpoint `cba839e8046e19973b7ce18f2bf6dd2ab44d2d1a` (tree `ab959257805f5d49a53a385d0e71499b7463627b`) failed on empty exact-route `Allow` headers: **814 backend PASS / 51 preserved FAIL**, with the same two original failures through actual Uvicorn. That history remains in [evidence.md](evidence.md#iteration-3--10-memory-staff-failing-engineer-checkpoint). The actual bug became [#30](https://github.com/allfocusSS/gearshare/issues/30), followed by [PM grooming](https://github.com/allfocusSS/gearshare/issues/30#issuecomment-6360070589) and [fresh independent pre-fix QA](https://github.com/allfocusSS/gearshare/issues/30#issuecomment-6360130194), which recorded 28 PASS / 99 FAIL per transport before correction.

The current `Refs #30` engineer candidate changes only shared method-header traversal, adds 56 fixed-oracle test variants and a reusable focused transport probe, and preserves every original assertion. Actual new results: **921 backend PASS**, **133 PASS per ASGI/Uvicorn transport**, frontend84/typecheck/build, lock44 and frozen OpenAPI validation PASS. Full-store equality holds for all 128 rejected transport requests per transport. Exact commands and recovery limits are in [the correction evidence](evidence.md#iteration-3--30-shared-route-method-header-correction). Independent QA subsequently [passed/closed #30](https://github.com/allfocusSS/gearshare/issues/30#issuecomment-6369839983) at 2026-10-23T16:37:46Z and [#10](https://github.com/allfocusSS/gearshare/issues/10#issuecomment-6369858278) at 16:38:45Z on published `166ca49536137be7790855c092e288297e7200e6` (tree `748b20123c42a26c8e40517b5e659e6e3f8d8f69`). The complete true-memory gate is accepted. #11 now has a complete engineer candidate under its existing PM handoff and awaits independent QA; #12 and subsequent dependent issues remain gated. Unsupported issue-closure flags do not establish a stage gate.

As of 2026-10-25, independent QA passed and closed #1–14 and the observed bugs #24–30. #12 was accepted on `7c73fcdb2eb591ab5e5248e261eacf2a094fe37d` after one FAIL for two harness-portability defects (recorded below). The HTTP adapter branch was merged into `main`, and a fresh independent QA session verified every criterion of [#13](https://github.com/allfocusSS/gearshare/issues/13#issuecomment-6389663981) and [#14](https://github.com/allfocusSS/gearshare/issues/14#issuecomment-6389677086) on the merged commit `a13c77b943ebeacdf6359285b08c0a3a78e33370` (PASS, then QA closed both). Next, in strict order: #15 UI hardening, #16 adversarial matrix, #17 two-role browser automation, #18 exploratory testing and defect loop, #19 reproducible setup/CI, #20 final audit. The earlier pending-status paragraphs describe their historical checkpoints, superseded by this current record.

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

## 2026-10-20 — #6 openapi.yml and Booking version (engineer candidate)

- Independent QA had passed and closed #5 and #28 (and #27), so the standalone mock gate was open for iteration 2. Read the groomed #6 issue and the PM concurrency comment, then derived the contract from the completed `GearShareService`, `types.ts` and mock rather than writing an API first.
- `e9ceec1`: private `Booking.version` (1 on creation, +1 per successful approve, reject, cancel, checkout or return) and a required `expectedVersion` on those five mutations, with 422 for missing/invalid and 409 for stale; shared types, mock, coordinator and reservation call sites and tests aligned; both orderings of the approve-versus-cancel race covered. Public availability and assets stay version-free.
- `42e4d99`: root `openapi.yml` (OpenAPI 3.1, 20 operations with `x-service-method`, `/api/v1`, bearer-token auth, shared `Error` schema, wire-only `Session`, frozen limits, transition table, non-owner 404 policy) and `_docs/api.md` (method-to-HTTP table, evaluation order, auth/session handling for #13, date semantics, concurrency, privacy).
- `0486a4e`: locked backend dev dependencies and `backend/tests/test_openapi_contract.py` (real validator, one-operation-per-method, error coverage, schema versus `types.ts`, no secret fields, mock-generated samples), plus README, AGENTS, architecture, plan and testing-guidelines updates and corrected stale pending-QA status lines.
- Engineer checks on `0486a4e` (Node 22.22.0/npm 10.9.4/uv 0.11.32, not the pinned toolchain): 22 backend tests, 74 frontend tests, typecheck, build and every browser suite exit 0; 23 deliberate contract mutations were all caught. Exact commands and limits are in evidence.md.
- Decisions flagged for QA: note validation runs after the state check as in the QA-passed mock; the mock and wire differ for `currentUser`, `logout`, `login` and `register`, absorbed by the future HTTP adapter. No backend business route, repository, ORM, HTTP adapter or database was added. #6 stays open for independent QA; #7 and later stages remain gated.


## 2026-10-20 — #6 independent-QA FAIL and engineer correction

- Independent QA ran `39d1bdd` and posted `QA: FAIL` on #6 ([comment](https://github.com/allfocusSS/gearshare/issues/6#issuecomment-6295944514)): `Error.message` in `openapi.yml` had an unquoted comma in a flow mapping (the description was cut at "Human-readable" and a junk null key `safe to show to the user.` was created), and the `/auth/register` request example (`'  New_Member9  '`) violated its own schema pattern. Redocly and Spectral reported both; the engineer's validator, schema comparison and 23-mutant check did not. QA also listed 14 surviving mutation probes and a set of ambiguities that #7-#10 would otherwise settle by accident. The earlier "engineer PASS" claim was accurate for what it ran but too weak to support a contract gate; the FAIL history in this file and in evidence.md is retained.
- Reproduced both defects with `@redocly/cli@1.34.5` and `@stoplight/spectral-cli@6.14.3` (run through `npx`, not added to the repository) before changing anything. `f0cbb02` quotes the description, writes the register example as `New_Member9` (trimming is documented in prose, not in the example) and adds `backend/tests/test_openapi_guards.py`, which finds duplicate keys, empty implicit-null values, truncated descriptions, unknown schema keywords and every example that does not validate against its own schema, without any linter. Five of its six tests fail on the `39d1bdd` file and all six pass on the fixed one.
- `a292232` records the contract decisions QA asked for, without changing a product rule: authentication, authorization/ownership (404 for a non-owner), `expectedVersion` shape (422), version/state conflict (409), then note validation (422), with declarative Pydantic note limits not allowed to pre-empt 409; every non-2xx body, including FastAPI-generated ones (malformed JSON, 405, framework 422, unexpected 500), is the `Error` shape via a `default` response and three documented exception handlers; unknown path ids are 404 and malformed body ids are 422 with `fields` (so `assetId` joined the `fields` key set in `types.ts`, and the mock now returns `fields.assetId` for a missing or over-long `assetId`); the exact `note` text and event shape of create/approve/reject/cancel/checkout/return as the QA-passed mock produces them; `StaffDesk.counts` as the mock computes them; server-side trimming before validation; strict JSON integers for `expectedVersion`; CORS/dev proxy and tzdata>=2024a as #13 prerequisites.
- `cd2ff51` strengthens the contract tests so each of QA's 14 surviving probes is caught (listAssets query parameters, `Session.expiresAt` format, shared 409/422 `$ref` wiring on the five mutations, and the rest); my own 54-mutant harness catches all 54 on the final tree.
- Engineer checks, the Redocly/Spectral before-and-after output, the mutation results, the one recorded auth-suite timing failure and the Node 22/npm 10 toolchain limit are in evidence.md. Fresh independent QA of the new candidate is required; #6 stays open and only QA may close it. #7 and later stages remain gated, and nothing here adds a backend business route, repository, ORM, HTTP adapter or database.

## 2026-10-21 — #6 independent PASS and #7 memory-auth candidate

- Independent QA [passed and closed #6](https://github.com/allfocusSS/gearshare/issues/6#issuecomment-6297151459) on canonical `1f4b115bfd340a36d129bc3ed3c756a94807f580`; the earlier actual FAIL and correction trail remain above. The orchestrator rechecked that exact baseline with the pinned toolchain before the [new #7 PM handoff](https://github.com/allfocusSS/gearshare/issues/7#issuecomment-6309139333) authorized this story.
- Implemented only register/login/logout/me through domain records, repository transaction protocols and a real process-local locked Python memory adapter. Copy-on-write transactions roll back complete account/session mutations. Passwords use maintained salted Argon2id; tokens are unpredictable, hash-only in storage, absolutely valid for 24 hours in aware UTC and independently revocable.
- Pinned Unicode code-point length, unchanged numeric bounds, exact ECMAScript trim, untrimmed/unnormalized passwords and surrogate rejection before hashing. The PM-authorized shared mock text helper aligns existing checks and adds boundary tests without UI changes. JSON envelope/header handling and safe framework 404/405/422/500 behavior follow the frozen Error shape; slash redirects are disabled.
- Engineer checks: 137 backend tests (35 preserved plus 102 auth), real OpenAPI validator and lock check; 84 frontend tests (78 preserved plus 6 text groups), typecheck/build; scoped mock auth browser 26/26 at 390/1440 without console/page/request/API errors. Exact commands, fault-injection evidence, environment and limits are in evidence.md. No actual runtime defect was observed.
- Updated current-stage links instead of retaining copied stale #6-pending headers, preserved historical FAIL records, and recorded downstream catalogue/date/staff notes from QA and PM in api.md without implementing those later stories. Candidate is the single `Refs #7` commit containing this entry. #7 stays open for fresh independent QA; #8–10, ORM/SQLite and frontend HTTP wiring keep their gates.

## 2026-10-21 — #7 independent PASS and #8 memory catalogue candidate

- Began only after [#7 independent PASS/closure](https://github.com/allfocusSS/gearshare/issues/7#issuecomment-6322307972) on canonical `e8ec7b6620a84884a79999ea3885313e7c6ced25`, tree `f3dac460aa566e3bdec00de89aff2cbe461521dc`. Read the real #8 issue and [focused PM clarification](https://github.com/allfocusSS/gearshare/issues/8#issuecomment-6309201239); scope remains the three frozen public catalogue reads.
- Composed auth/catalogue protocols over the existing lock/copy-on-success memory store. Added immutable physical units, one source of trusted scheduled-reservation fixtures, one-time relative seeding, exact public projections and scheduled occupied-day reads. Full private booking/event/slot construction and mutation remain #9; staff custody remains #10.
- Implemented stable-order literal joined-field search, last scalar query values, exact date absence/ASCII parsing and inclusive date policy. A small Unicode 17 compatibility helper matches the pinned Node runtime, including final sigma beside new Cased/Case_Ignorable characters. Loaded locked tzdata explicitly to avoid stale host Almaty rules.
- Actual final checks: 278 backend tests (all 137 preserved plus 141 new), real OpenAPI validator and lock check; unchanged frontend 84 tests/typecheck/build; all 1,112,064 Unicode scalars compared against Node; real Uvicorn health plus 11 schema-validated HTTP reads/errors. Exact commands, the intermediate description-guard failure and two harness setup mistakes are retained in evidence.md. No product/browser defect was observed and no bug was fabricated.
- Updated the central stage record and linked current-status pointers, API/architecture/testing descriptions and evidence without changing frontend source or contract schemas. Candidate is the single `Refs #8` commit containing this record; its local/published SHA mapping belongs in the issue handoff. #8 stays open for fresh independent QA; no #9 work or later-stage PASS is claimed.

## 2026-10-22 — Iteration 3 private bookings, #9 failing checkpoint

- Began after [fresh independent #8 PASS/closure](https://github.com/allfocusSS/gearshare/issues/8#issuecomment-6336784597), from canonical `154129d8f0f6c21a37b6ee050bd955f67c48ad94`, tree `c34376a98c437731d5b1a524db1edb35a39794bd`. Read #9 and both comments, the frozen contract and #10's trusted-fixture clarification; no staff scope was pulled forward.
- Added storage-independent create/list/detail/cancel service and manual HTTP envelopes after server authentication. Extended the existing composite transaction with immutable bookings/events, unique inclusive slots and trusted fixture custody; public occupied days now read the actual slot map. Cancellation checks visibility, strict version, staleness and state before atomic version/event/slot changes.
- Preserved the 278 baseline checks and added 174 booking cases. Final backend result: 451 passed, one failed in 17.03 s. The retained case requires byte-identical foreign/unknown private 404 responses; encoded newline before `/cancel` bypasses the route and returns the generic 404 message. No content or actual-booking-existence disclosure was observed. The defect was reported to the orchestrator before any correction; the matching code/messages remain untouched.
- Actual Uvicorn + HTTP contender harness, in one process/network namespace, completed 42 assertions and recorded the same cancellation mismatch, exiting 1. Frontend source/default adapter remain unchanged; all 84 service tests, typecheck/build, lock check and frozen OpenAPI validation passed. Historical failures and the intermediate stale #8 scope assertion remain explained in evidence.
- This single `Refs #9` commit is a meaningful failing checkpoint, with exact SHA/tree supplied in the engineer handoff. Publication and the observed-bug PM/QA/new-engineer loop precede correction. #9 stays open and no independent QA verdict, full memory gate, staff mutation, persistence or HTTP integration is claimed.

## 2026-10-22 — #29 focused booking routing correction

- The published #9 failure became actual [#29](https://github.com/allfocusSS/gearshare/issues/29), with [PM grooming](https://github.com/allfocusSS/gearshare/issues/29#issuecomment-6347336915) and [independent pre-fix regression preparation](https://github.com/allfocusSS/gearshare/issues/29#issuecomment-6347497727) before this new engineer session. QA recorded 65 PASS/116 FAIL per transport, including the actual `/cancel%0A` mutation and owned-ID LF alias. Original evidence is retained.
- Added and ran 153 durable regressions before changing runtime: 127 failures/26 passes. Corrected only the booking router to match complete decoded templates, retain malformed single-component IDs unmodified and produce complete same-template Allow headers. Kept the original LF byte-equality case; split `../unknown` into explicit generic-404 extra-component cases and separate decoded exact-action tests under PM's topology decision.
- Final runtime/test source passes 604 backend cases, 181 focused ASGI cases and 181 actual same-owner Uvicorn cases with no rejected-request mutation, plus frontend 84/typecheck/build, OpenAPI validation and lock check. See evidence.md for exact commands, metadata distinction and limits. The focused harness is repeated on the exact complete commit for handoff.
- Updated only affected API/testing/current-gate/evidence documents. This single `Refs #29` candidate requires publication and fresh independent QA for both #29 and #9; neither issue is closed here. Staff APIs, persistence and frontend HTTP integration remain gated.

## 2026-10-24 — Iteration 4, #11 phase 1 schema checkpoint

After the independent #10/#30 gate, the new #11 engineer added locked
SQLAlchemy/Alembic dependencies, ORM models, explicit database infrastructure,
a reversible initial migration, a safe configuration example and 20 file-backed
schema tests. Runtime still uses the unchanged memory adapter; the next phase
implements the ORM repository and API configuration. This is a working schema
checkpoint, not a complete #11 candidate or independent QA verdict. See the
corresponding evidence entry for actual checks. No frontend HTTP switch,
shared-contract/restart campaign or subsequent issue implementation is claimed.

## 2026-10-24 — Iteration 4, #11 complete engineer candidate

- Phase 1 was published as `05945d2d70548ea18d0b0a0a4e4c5e3f0cefbe7e`
  (tree `b55c510c2749cb046e0cd327d014382bcdfed30e`). The same engineer then
  implemented only the remainder of groomed #11.
- Added fresh ORM sessions/transactions, immutable domain projections, database
  expected version/state CAS, shared asset availability-version CAS and bounded
  whole-operation rechecks after contention. Slot/custody/username/code keys
  remain enforced by the database. Ordinary domain conflicts are useful/private
  409s; exhausted infrastructure contention is documented 503, unexpected faults
  retain safe 500. No SQL dialect details enter domain/service rules.
- Explicit `GEARSHARE_STORE=sqlalchemy` selects the migrated configurable URL;
  memory remains the default and uses its existing true Python adapter. Fixtures
  and marker commit together once and never overwrite existing accounts.
- Targeted ORM/API tests and actual same-owner Uvicorn smoke were executed;
  exact outcomes are in evidence.md. The final `Refs #11` candidate is the commit
  containing this entry; its SHA/tree are supplied in the issue handoff.
- This is engineer evidence, not independent QA acceptance. #11 stays open.
  #12 full parity/concurrency/restart verification and frontend HTTP integration
  remain gated; no later issue or unchanged browser campaign was pulled forward.

## 2026-10-24 — Iteration 4, #12 persistence, contention and storage parity

- Provenance, stated plainly: this #12 work was taken over by a new engineer session after the earlier session assigned to it showed no activity. The branch is `feat/persistence-12` in its own worktree, based on the accepted #11 commit `966fef5`. A separate branch (`feat/http-adapter-13-14`) is developed in parallel for #13/#14; it was not merged, rebased onto or relied on (only its file list was checked for a `Makefile`), and the two may conflict only in the new root `Makefile` and the status lines of README/AGENTS.md. #13/#14 stay gated behind independent QA of #12.
- Added only tests, support code, a mutation script and documentation; application behaviour is unchanged. No real defect was found by the campaign (see evidence.md for the one start-up observation, recorded as a limitation).
- One shared repository contract suite runs identical assertions against the true memory adapter and a migrated file-backed SQLAlchemy/SQLite adapter (Alembic path, never `create_all` or `:memory:`); legitimate adapter differences (exception types for duplicate keys, foreign keys and bad timestamps) are named and the common invariant is asserted.
- A reusable invariant auditor (26 violation classes) reads the physical store with an independent connection and runs after every race, fault and restart scenario; each class is proved by corrupting a scratch database or memory state.
- Concurrency (threads with separate engines/sessions plus separate client processes through the real server), fault injection after k of n writes in both adapters, real SIGTERM/SIGKILL restarts of a uvicorn child on the same file, lock-contention scenarios, a static dialect-confinement test and a mutation sanity script were added. Exact commands, iteration counts, outcomes and limits are in evidence.md.
- This is engineer evidence, not independent QA acceptance; #12 stays open. The commits are local until the orchestrator pushes.

## 2026-10-24 — #12 process harness portability correction

- Fresh independent QA [failed published `b5edd58`](https://github.com/allfocusSS/gearshare/issues/12#issuecomment-6388998999): 1260 passed, two harness failures and four warnings in 185.08s. A new engineer reproduced both focused failures in 43.69s. The original checkpoint and all nine external commits remain intact.
- Corrected only finite burst-case exhaustion and host `/proc` versus namespace-local PID observation. Four bounded writers synchronize after their final HTTP bodies are transmitted, then the actual server is SIGKILLed with responses outstanding; recovery probes own separate dates. Live worker counts require namespace-resolved direct-child identity and an actual ASGI worker startup PID, excluding the resource tracker.
- Every acknowledged-booking/event/version, full physical-auditor, journal/recovery-write, three-worker, 60-read and seed-once check is retained; each round must add acknowledgements. No product logic, domain/API/model/SQL-adapter assertion or dependency changes.
- Focused corrected checks: two passed, three deselected, no warnings in 17.83s under exact uv 0.12.23 / Python 3.12.14 / SQLite 3.53.1. The complete backend suite passed all 1262 cases without warnings in 142.78s; lock and frozen OpenAPI checks passed. Full-gate commands and lifecycle evidence are recorded in evidence.md.
- The candidate is the single `Refs #12` commit carrying this entry, parent `b5edd58`; exact SHA/tree belong in the handoff. The engineer does not push or close. Fresh independent QA is required; main remains accepted #11 and #13/#14 stay gated.

## 2026-10-24 — Iteration 5, #13 HTTP adapter for identity and catalogue (engineer candidate)

- A software-engineer session implemented groomed [#13](https://github.com/allfocusSS/gearshare/issues/13) while a separate session works on #12; the two sessions share the repository, so this one changed no backend source or `backend/tests/*`, made no backend behaviour change and checks `origin/main` for movement before handoff (see the handoff comment for the result).
- `httpService.ts` implements all 20 operations of `openapi.yml` over a shared `httpClient.ts` and defensive `wire.ts` parsers; HTTP is now the default, `VITE_GEARSHARE_SERVICE=mock` the explicit alternative, and there is no silent fallback. Token in `sessionStorage` (memory fallback), a 401 anywhere ends the session with a sign-in notice and return navigation, logout is honest when the server cannot be reached. Same-origin `/api` through the Vite dev/preview proxy replaced a CORS change, so the backend is untouched.
- Evidence: 130 new node tests (34 adapter, 96 openapi.yml conformance over all 93 mock samples and every documented error status), all pre-existing suites unchanged and passing in mock mode, 969 backend tests, and the new real-stack `npm run test:browser:http` (19 checks at 1440/390 against a real backend and temp SQLite database). Exact results and the Node 22/npm 10/uv 0.11 deviation from the pinned toolchain are in [evidence.md](evidence.md#iteration-5--13-http-adapter-engineer-candidate-identity-and-catalogue).
- Engineer evidence only. **#13 closure is gated on independent QA PASS of #12**; QA owns the verdict and closure. The booking/staff/inventory half of the adapter and its UI evidence belong to #14 below.

## 2026-10-24 — Iteration 5, #14 booking, staff and inventory workflows (engineer candidate)

- The same engineer session verified groomed [#14](https://github.com/allfocusSS/gearshare/issues/14) on top of the #13 adapter: every booking, staff and inventory operation already goes through `httpService.ts`, so the only #14 commit adds the real-stack suite `npm run test:browser:http:staff` (student and coordinator browser contexts, real Vite + FastAPI + temp-file SQLite, 1440 and 390 px). No application code changed.
- The suite covers the full request -> approve -> checkout -> return lifecycle with `expectedVersion` 1/2/3 and the student's persisted history, 409 conflicts with `unavailableDates`, stale versions from both sides, note validation, forbidden and foreign-booking privacy, seeded overdue custody, inventory add/edit/maintenance (with rename not rewriting bookings), lost responses, a saved-but-unrefreshed desk, 401 on the desk and a real backend restart. Results: 21 checks pass; all pre-existing suites, 214 node tests and 969 backend tests also pass on the candidate commit. Details: [evidence.md](evidence.md#iteration-5--14-booking-staff-and-inventory-workflows-engineer-candidate).
- Engineer evidence only; the parallel session still owns #12. **#14 closure is gated on independent QA PASS of #12 and the closure of #13.** No defect was found, so no `user-test-bug` issue exists for this stage.


## 2026-10-25 — #15 PM design decisions and #31 engineer candidate

- The PM clarified the integrated design rules in `5d74835361ebdf1640b007920af133fe0dcf3aea`, `b92332417b7bb1b71d2648aed07414668dc6a215` and `c975d5bbeef974cc6056cab710d2bfb4889d2e64`: associated booking field errors, deliberate settled-action focus, unbroken user-text wrapping, informational text at least 12 px with an explicit decorative allow-list, and retaining the calendar month on availability refresh. These are PM decisions recorded in design-system.md. The focus, wrapping, calendar and type-floor work follows its separately groomed issues.
- This distinct engineer session implements only [#31](https://github.com/allfocusSS/gearshare/issues/31), directly on clean `c975d5b`, after the [PM merge ruling](https://github.com/allfocusSS/gearshare/issues/31#issuecomment-6390514860) and independent pre-fix QA [cases](https://github.com/allfocusSS/gearshare/issues/31#issuecomment-6390448765)/[update](https://github.com/allfocusSS/gearshare/issues/31#issuecomment-6390585904). The engineer reproduced the both-empty-date failures through real HTTP and mock browsers before changing runtime.
- AssetDetailPage now combines retained submission fields with current client date fields, with client messages winning per key. The existing DateRangeFields renders one associated inline error per date. Submission still clears response errors; editing retains them. The runtime change is confined to this page; no API, backend, interface or style change was made.
- Added issue-filterable real-stack/mock browser regression blocks and shared support, preserving every existing test/assertion. Exact executed red/green checks, screenshots and limitations are recorded in evidence.md. The commit carrying this entry is the single `Refs #31` candidate; its SHA/tree are provided in the handoff. #31 remains open for publication and fresh independent QA; this is engineer evidence, not a QA verdict or #15 completion claim.
