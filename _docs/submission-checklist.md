# Submission requirement matrix

Current state: planning prepared; **not ready for submission**.

| Assignment requirement | Planned evidence | Current status |
| --- | --- | --- |
| Different nontrivial project from Part I | plan.md; working resource allocation/lending demo | Idea/spec prepared; not implemented |
| Follow specifications/agent workflow article | AGENTS.md, process, team roles and actual issue handoffs | Documents prepared; workflow not executed |
| Follow full-stack article | Staged commits and runnable iteration gates | Sequence planned; no application commits |
| Use GitHub Issues | Canonical groomed issues with acceptance/QA evidence | Draft backlog only; new repo required |
| Distinct design agent or good references | design-system.md, exact references, resulting screens | References/brief prepared; no screen yet |
| Close MVP issues | QA PASS and QA closure for each mvp issue | Not created |
| Persistent SQLite | ORM models, migration and restart evidence | Planned |
| DBMS-agnostic ORM | SQLAlchemy repository/domain separation and standard constraints | Planned; no alternate DBMS testing claimed |
| Mock frontend first | mockService and a runnable stage commit | Not implemented |
| openapi.yml second | Valid contract derived from mock service | Not authored; deliberate stage dependency |
| In-memory backend third | True Python memory adapter and tests | Not implemented |
| SQLite backend fourth | File-backed ORM adapter, migration and tests | Not implemented |
| Final frontend/backend integration | HTTP adapter + actual two-role browser checks | Not implemented |
| All Markdown in GitHub and improved during work | Committed docs and subsequent revision history | Local planning documents prepared only |
| Brainstorming chat before app creation | brainstorming.md with actual text/provenance | Included; user review still pending |
| Actually run and thoroughly test | evidence.md with real commands, logs, commit and browser steps | Not run |
| Real bugs labeled user-test-bug | Observed reproduction, PM grooming, QA regression and retest | No app tests yet; no bugs fabricated |
| All required issue tags | mvp / post-mvp / user-test-bug labels and meaningful issue use | Planned, not created |
| QA closes all required issues | QA comments and final issue queries/counts | Not done |
| Final submission | Correct GitHub URL, source, run guide and complete evidence | Blocked on repository then implementation |

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
