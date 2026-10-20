# Issue and agent workflow

Current stage update (2026-10-20): independent QA passed and closed #1–5 and the observed bugs #24–28, including the [#4](https://github.com/allfocusSS/gearshare/issues/4#issuecomment-6279522336), [#25](https://github.com/allfocusSS/gearshare/issues/25#issuecomment-6279464800), [#27](https://github.com/allfocusSS/gearshare/issues/27#issuecomment-6287900059), [#28](https://github.com/allfocusSS/gearshare/issues/28#issuecomment-6294272406) and [#5](https://github.com/allfocusSS/gearshare/issues/5#issuecomment-6294295984) PASS verdicts; the standalone mock stage gate is satisfied. [#6](https://github.com/allfocusSS/gearshare/issues/6) is an engineer candidate that independent QA [failed](https://github.com/allfocusSS/gearshare/issues/6#issuecomment-6295944514) on `39d1bdd` (two `openapi.yml` authoring defects found by Redocly and Spectral); the correction is a new candidate awaiting fresh independent QA: root `openapi.yml` (OpenAPI 3.1) is derived from the completed `GearShareService`, adds private `Booking.version` with a required `expectedVersion` precondition on the five booking mutations, and is checked by `backend/tests/test_openapi_contract.py` and `backend/tests/test_openapi_guards.py` (see `_docs/api.md` and evidence.md). #6 stays open for independent QA. #7 and later stages (backend business APIs, persistence, HTTP adapter) remain gated. Historical entries below retain their recorded point-in-time results.

## Combining the two articles

First define the product and context. Publish small stories as GitHub issues. Apply the PM → engineer → independent QA loop **inside each application iteration**, rather than building the whole app first and inventing issues afterwards. Use the assignment's explicit sequence: frontend/mockService, OpenAPI, memory backend, ORM/SQLite, final integration. Stage gates are in `architecture.md`.

## Backlog and labels

- `mvp`: required for the assessment's first complete version.
- `post-mvp`: visible, intentionally deferred scope; it may remain open at submission.
- `user-test-bug`: an actual defect found while exercising the app. A defect can also carry `mvp` if it blocks MVP acceptance.

Labels alone do not prove implementation or testing. Each closure needs evidence. The number 100 is an allowance, not a minimum issue count.

Before publication `_docs/tasks.md` is the draft. After publication GitHub Issues is authoritative. Record real issue URLs in a mapping at the end of `tasks.md`; do not invent IDs. Create the 3 post-MVP follow-ups too, so excluded work has real links.

## Orchestrator

Once the repo/backlog exists, the main agent coordinates distinct PM, engineer and QA sessions. It provides each role the current issue, authoritative documents, branch/commit and the preceding role's result. One issue is implemented at a time; concurrent agents must not modify the same files. Initial brainstorming and process setup are not implementation claims.

1. Select the next open issue whose dependencies and stage gate are satisfied.
2. Launch PM using `_docs/team/pm.md`. PM reads the issue and writes checkable scope/criteria, preserving Goal and Description.
3. Launch an engineer using `_docs/team/software-engineer.md` on the groomed issue. The engineer changes code, adds relevant tests and commits. The issue remains open.
4. Launch a fresh independent QA session using `_docs/team/qa-engineer.md`, with the issue and committed candidate. QA reads the criteria, runs the app/checks and posts a criterion-by-criterion PASS/FAIL. QA does not fix code.
5. If FAIL: send the concrete failures back to a new engineer session, then repeat independent QA on the correction. Do not weaken criteria to make code pass.
6. If PASS: **QA closes the issue**, as the assignment requires. Record the closure evidence and proceed.
7. At an iteration boundary, verify that stage is actually runnable before beginning the next.

The specifications article has the orchestrator close issues after QA. This project intentionally assigns that final action to QA because the supplied assignment explicitly requires `qa-engineer.md` to close them.

## Bug loop

When running the app reveals a bug:

1. Create a GitHub issue with `user-test-bug` before correction. Record Goal, Description, exact steps, environment/commit, expected result, actual result and evidence.
2. Ask the PM role to groom it using the task template, preserving reproduction and impact.
3. Ask the QA role to add explicit regression cases, including adjacent cases, before the fix.
4. Engineer fixes it, commits and reports the test result without closing the issue.
5. Independent QA reruns the original reproduction, regression case and relevant surrounding checks. QA posts evidence and closes only on PASS.

Do not intentionally inject a defect, fabricate a failed run or create a dummy bug to make the label appear used. If exploratory testing finds no bug, record the executed tests and that outcome honestly.

## Living documents and commits

Update specification, design, API notes, testing rules and evidence when their contents change. Record the reason in `iterations.md`. Commit a working stage before a significant change in direction. Use `Refs #N`; omit automatic closing keywords. Do not rebase away the staged history needed to demonstrate the required order.

## Completion condition

Submission is ready only when the final code is pushed; the app has been run; required automated/browser/manual checks have actual passing results; every `mvp` and `user-test-bug` issue is closed by QA after PASS; and the reproducible demo/requirement matrix matches the final commit. An unavailable browser, missing repo, failing test or unrun restart check is an open limitation, never a PASS. `post-mvp` issues may remain open.

For the final audit issue #20, the zero-open-issues check is a closure postcondition. QA first verifies all substantive acceptance criteria against the final pushed commit and confirms the real open-issue queries return only #20 for `mvp` and zero for `user-test-bug`. QA then closes #20 and immediately reruns both queries. Only after observing zero/zero does QA post the final PASS with the real queries/counts and final pushed commit. If either result is nonzero or cannot be verified, QA reopens #20 and posts FAIL. This ordering does not permit an unverified final completion claim.
