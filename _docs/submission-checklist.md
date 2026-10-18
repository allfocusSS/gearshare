# Submission requirement matrix

Current state: iteration-0 bootstrap checked by the engineer; independent QA pending on #1. **Not ready for submission**.

| Assignment requirement | Planned evidence | Current status |
| --- | --- | --- |
| Different nontrivial project from Part I | plan.md; working resource allocation/lending demo | Idea/spec prepared; not implemented |
| Follow specifications/agent workflow article | AGENTS.md, process, team roles and actual issue handoffs | PM/engineer handoff for #1; independent QA pending |
| Follow full-stack article | Staged commits and runnable iteration gates | Iteration-0 skeleton candidate; later stages remain planned |
| Use GitHub Issues | Canonical groomed issues with acceptance/QA evidence | MVP #1–20 and post-MVP #21–23 published |
| Distinct design agent or good references | design-system.md, exact references, resulting screens | References/brief prepared; minimal startup only, product shell in #2 |
| Close MVP issues | QA PASS and QA closure for each mvp issue | #1 open for QA; no closure claimed |
| Persistent SQLite | ORM models, migration and restart evidence | Planned |
| DBMS-agnostic ORM | SQLAlchemy repository/domain separation and standard constraints | Planned; no alternate DBMS testing claimed |
| Mock frontend first | mockService and a runnable stage commit | Not implemented |
| openapi.yml second | Valid contract derived from mock service | Not authored; deliberate stage dependency |
| In-memory backend third | True Python memory adapter and tests | Not implemented |
| SQLite backend fourth | File-backed ORM adapter, migration and tests | Not implemented |
| Final frontend/backend integration | HTTP adapter + actual two-role browser checks | Not implemented |
| All Markdown in GitHub and improved during work | Committed docs and subsequent revision history | Planning baseline committed; bootstrap status/evidence updated with #1 |
| Brainstorming chat before app creation | brainstorming.md with actual text/provenance | Included; user review still pending |
| Actually run and thoroughly test | evidence.md with real commands, logs, commit and browser steps | Bootstrap install/health/typecheck/build/dev HTTP checks only; full product checks outstanding |
| Real bugs labeled user-test-bug | Observed reproduction, PM grooming, QA regression and retest | No real product/browser defect observed during bootstrap; no bugs fabricated |
| All required issue tags | mvp / post-mvp / user-test-bug labels and meaningful issue use | Published backlog uses mvp/post-mvp; user-test-bug reserved for observed defects |
| QA closes all required issues | QA comments and final issue queries/counts | Not done |
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
