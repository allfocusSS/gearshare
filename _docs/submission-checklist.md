# Submission requirement matrix

Current stage update (2026-10-20): independent QA passed and closed #1–5 and the observed bugs #24–28, including the [#4](https://github.com/allfocusSS/gearshare/issues/4#issuecomment-6279522336), [#25](https://github.com/allfocusSS/gearshare/issues/25#issuecomment-6279464800), [#27](https://github.com/allfocusSS/gearshare/issues/27#issuecomment-6287900059), [#28](https://github.com/allfocusSS/gearshare/issues/28#issuecomment-6294272406) and [#5](https://github.com/allfocusSS/gearshare/issues/5#issuecomment-6294295984) PASS verdicts; the standalone mock stage gate is satisfied. [#6](https://github.com/allfocusSS/gearshare/issues/6) is an engineer candidate: root `openapi.yml` (OpenAPI 3.1) is derived from the completed `GearShareService`, adds private `Booking.version` with a required `expectedVersion` precondition on the five booking mutations, and is checked by `backend/tests/test_openapi_contract.py` (see `_docs/api.md` and evidence.md). #6 stays open for independent QA. #7 and later stages (backend business APIs, persistence, HTTP adapter) remain gated. Historical entries below retain their recorded point-in-time results.

Current state: #1–5 and #24–28 are independently verified and closed (the standalone mock stage gate passed). The #6 `openapi.yml` contract candidate has passing engineer checks and awaits independent QA; #7–20 remain open. **Not ready for submission**.

| Assignment requirement | Planned evidence | Current status |
| --- | --- | --- |
| Different nontrivial project from Part I | plan.md; working resource allocation/lending demo | Idea/spec prepared; mock identity/catalogue/calendar implemented; mock student requests/allocation implemented; staff lending implemented and independently verified in #5 |
| Follow specifications/agent workflow article | AGENTS.md, process, team roles and actual issue handoffs | #1/#2/#3/#24 QA PASS/closed; real #24 PM/QA-failure/correction loop recorded; #4/#25/#26/#27/#28 independently passed; #5 passed after its separate #27/#28 correction loops; #6 candidate awaits independent QA |
| Follow full-stack article | Staged commits and runnable iteration gates | Iteration-0 verified; iteration-1 complete mock gate independently passed (#5); iteration-2 `openapi.yml` candidate (#6) awaits independent QA; later gates remain planned |
| Use GitHub Issues | Canonical groomed issues with acceptance/QA evidence | MVP #1–20 and post-MVP #21–23 published |
| Distinct design agent or good references | design-system.md, exact references, resulting screens | References translated into responsive shell/auth and #3 equipment/calendar screens; mock student requests/history added; staff desk/inventory added and independently verified in #5 |
| Close MVP issues | QA PASS and QA closure for each mvp issue | #1–#5 and #24–#28 closed by independent QA after PASS; #6 candidate awaits QA; #7–20 pending |
| Persistent SQLite | ORM models, migration and restart evidence | Planned |
| DBMS-agnostic ORM | SQLAlchemy repository/domain separation and standard constraints | Planned; no alternate DBMS testing claimed |
| Mock frontend first | mockService and a runnable stage commit | Identity, public catalogue/calendar and student reservations implemented without backend; #4 and #5 independently verified; complete mock lending flow passes the standalone mock gate |
| openapi.yml second | Valid contract derived from mock service | #6 candidate: root `openapi.yml` (OpenAPI 3.1, 20 operations) and `_docs/api.md` derived from the QA-passed mock, validated by backend contract tests; awaits independent QA |
| In-memory backend third | True Python memory adapter and tests | Not implemented |
| SQLite backend fourth | File-backed ORM adapter, migration and tests | Not implemented |
| Final frontend/backend integration | HTTP adapter + actual two-role browser checks | Not implemented |
| All Markdown in GitHub and improved during work | Committed docs and subsequent revision history | Planning baseline, bootstrap and #2/#24/#3 behavior/status/evidence committed and #4 candidate updates included |
| Brainstorming chat before app creation | brainstorming.md with actual text/provenance | Included; user review still pending |
| Actually run and thoroughly test | evidence.md with real commands, logs, commit and browser steps | Bootstrap/auth independent PASS; independent QA PASS for the mock stage (#5: 41 service tests, 635/635 recovery assertions, 448/448 labels, 8 staff groups); #6 engineer run adds 74 frontend tests and 22 backend tests including the OpenAPI validator (evidence.md); backend business APIs, persistence and integration outstanding |
| Real bugs labeled user-test-bug | Observed reproduction, PM grooming, QA regression and retest | Actual defects #24–#28 filed before their fixes; PM groomed, QA reproduced/expanded cases, QA independently passed each correction and closed it |
| All required issue tags | mvp / post-mvp / user-test-bug labels and meaningful issue use | Published backlog uses mvp/post-mvp; real #24–#28 also have user-test-bug |
| QA closes all required issues | QA comments and final issue queries/counts | #1–#5 and #24–#28 closed after QA PASS; #6–#20 open; final #20 zero/zero closure postcondition documented |
| Final submission | Correct GitHub URL, source, run guide and complete evidence | Repository and bootstrap guide exist; remaining implementation and QA outstanding |

## Final demo script after implementation

1. Explain the shared-equipment problem and why this differs from StudyTrack.
2. Show the mock/contract/memory/SQLite/integration commits in order.
3. As a student, find equipment and request available days.
4. As another student, demonstrate a real overlap error and private-record protection.
5. As coordinator, approve, check out with condition and record return.
6. Show the student's event history after refresh and after a backend restart.
7. Show one genuinely observed bug's PM/engineering/QA trail, if one was found.
8. Show final test/CI results and no open mvp or user-test-bug issues; show deliberate post-mvp scope.

Do not narrate this script as completed until the running app and issue history actually support it. The deadline was not provided in the supplied assignment; confirm it before committing to a calendar schedule.
