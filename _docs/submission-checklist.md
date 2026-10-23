# Submission requirement matrix

Current stage: see the [current gate record](iterations.md#current-stage). Historical entries below retain their point-in-time results.

The [central gate record](iterations.md#current-stage) lists independent PASS/closures through #9/#29 and the open **failing #10 engineer checkpoint**. All memory service operations are present, but a retained 405 `Allow` regression blocks the complete-memory gate. Storage and integration are outstanding. **Not ready for submission**.

| Assignment requirement | Planned evidence | Current status |
| --- | --- | --- |
| Different nontrivial project from Part I | plan.md; working resource allocation/lending demo | Idea/spec prepared; mock identity/catalogue/calendar implemented; mock student requests/allocation implemented; staff lending implemented and independently verified in #5 |
| Follow specifications/agent workflow article | AGENTS.md, process, team roles and actual issue handoffs | #1–9/#24–29 independent PASS/closure; #10 is paused at an observed 405 header regression for the bug/PM/QA/correction loop |
| Follow full-stack article | Staged commits and runnable iteration gates | Bootstrap, mock, contract and memory-auth/catalogue/booking stories independently passed; #10 staff checkpoint retains a failing routing regression; complete memory, persistence and integration gates remain outstanding |
| Use GitHub Issues | Canonical groomed issues with acceptance/QA evidence | MVP #1–20 and post-MVP #21–23 published |
| Distinct design agent or good references | design-system.md, exact references, resulting screens | References translated into responsive shell/auth and #3 equipment/calendar screens; mock student requests/history added; staff desk/inventory added and independently verified in #5 |
| Close MVP issues | QA PASS and QA closure for each mvp issue | #1–9 and #24–29 closed by independent QA after PASS; #10–20 pending |
| Persistent SQLite | ORM models, migration and restart evidence | Planned |
| DBMS-agnostic ORM | SQLAlchemy repository/domain separation and standard constraints | Planned; no alternate DBMS testing claimed |
| Mock frontend first | mockService and a runnable stage commit | Identity, public catalogue/calendar and student reservations implemented without backend; #4 and #5 independently verified; complete mock lending flow passes the standalone mock gate |
| openapi.yml second | Valid contract derived from mock service | #6 independent PASS on `1f4b115`; prior FAIL/correction history retained |
| In-memory backend third | True Python memory adapter and tests | #7 auth/#8 catalogue/#9 private bookings independently passed; #10 implements staff/inventory but retains 51 failing 405 header regressions (814 tests pass); complete stage gate has not passed |
| SQLite backend fourth | File-backed ORM adapter, migration and tests | Not implemented |
| Final frontend/backend integration | HTTP adapter + actual two-role browser checks | Not implemented |
| All Markdown in GitHub and improved during work | Committed docs and subsequent revision history | Planning baseline, bootstrap and #2/#24/#3 behavior/status/evidence committed and #4 candidate updates included |
| Brainstorming chat before app creation | brainstorming.md with actual text/provenance | Included; user review still pending |
| Actually run and thoroughly test | evidence.md with real commands, logs, commit and browser steps | Independent bootstrap/mock/contract/auth/catalogue/bookings PASS; failing #10 actual ASGI/Uvicorn staff lifecycle/custody/maintenance/header checks and unchanged-frontend regressions recorded; persistence/integration outstanding |
| Real bugs labeled user-test-bug | Observed reproduction, PM grooming, QA regression and retest | Actual defects #24–#29 followed the bug loop and independently passed; new #10 405 header defect is retained pending publication/actual issue/PM/pre-fix QA |
| All required issue tags | mvp / post-mvp / user-test-bug labels and meaningful issue use | Published backlog uses mvp/post-mvp; real #24–#29 also have user-test-bug |
| QA closes all required issues | QA comments and final issue queries/counts | #1–9 and #24–29 closed after QA PASS; #10–20 open; final #20 zero/zero closure postcondition documented |
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
