# Submission requirement matrix

Current stage update (2026-10-19): independent QA passed and closed [#3](https://github.com/allfocusSS/gearshare/issues/3#issuecomment-6262112857) at `bdf1e149e87d460e8045c40b2c02be9977de3bb0`. The #4 request/private history/cancellation candidate is implemented and awaits independent QA. Staff workflows (#5) and later stages remain gated. Historical entries below describe their recorded point in time.

Current state: independent QA passed and closed #1, #2, #3 and #24. #4 student requests/private history/cancellation has passing engineer checks and awaits independent QA. **Not ready for submission**.

| Assignment requirement | Planned evidence | Current status |
| --- | --- | --- |
| Different nontrivial project from Part I | plan.md; working resource allocation/lending demo | Idea/spec prepared; mock identity/catalogue/calendar implemented; mock student requests/allocation implemented; staff lending remains unimplemented |
| Follow specifications/agent workflow article | AGENTS.md, process, team roles and actual issue handoffs | #1/#2/#3/#24 QA PASS/closed; real #24 PM/QA-failure/correction loop recorded; #4 handoff pending QA |
| Follow full-stack article | Staged commits and runnable iteration gates | Iteration-0 verified; iteration-1 mock student-booking candidate; later gates remain planned |
| Use GitHub Issues | Canonical groomed issues with acceptance/QA evidence | MVP #1–20 and post-MVP #21–23 published |
| Distinct design agent or good references | design-system.md, exact references, resulting screens | References translated into responsive shell/auth and #3 equipment/calendar screens; mock student requests/history added; staff UI remains pending |
| Close MVP issues | QA PASS and QA closure for each mvp issue | #1/#2/#3/#24 closed by independent QA; #4 open; remaining MVP work pending |
| Persistent SQLite | ORM models, migration and restart evidence | Planned |
| DBMS-agnostic ORM | SQLAlchemy repository/domain separation and standard constraints | Planned; no alternate DBMS testing claimed |
| Mock frontend first | mockService and a runnable stage commit | Identity, public catalogue/calendar and student reservations implemented without backend; #4 QA pending, full mock lending stage incomplete |
| openapi.yml second | Valid contract derived from mock service | Not authored; deliberate stage dependency |
| In-memory backend third | True Python memory adapter and tests | Not implemented |
| SQLite backend fourth | File-backed ORM adapter, migration and tests | Not implemented |
| Final frontend/backend integration | HTTP adapter + actual two-role browser checks | Not implemented |
| All Markdown in GitHub and improved during work | Committed docs and subsequent revision history | Planning baseline, bootstrap and #2/#24/#3 behavior/status/evidence committed and #4 candidate updates included |
| Brainstorming chat before app creation | brainstorming.md with actual text/provenance | Included; user review still pending |
| Actually run and thoroughly test | evidence.md with real commands, logs, commit and browser steps | Bootstrap/auth independent PASS; current engineer 27 service tests/typecheck/build, 28 catalogue, 26 auth and the student-booking browser journey passed; staff lending/integration outstanding |
| Real bugs labeled user-test-bug | Observed reproduction, PM grooming, QA regression and retest | Actual #24 focus defect filed before fix; PM groomed, QA reproduced FAIL/cases, QA independently passed correction and closed #24 |
| All required issue tags | mvp / post-mvp / user-test-bug labels and meaningful issue use | Published backlog uses mvp/post-mvp; real #24 also has user-test-bug |
| QA closes all required issues | QA comments and final issue queries/counts | #1/#2/#3/#24 closed after PASS; #4 open; final #20 zero/zero closure postcondition documented |
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
