# Agent entry point

## Purpose and status

Build GearShare as specified in `_docs/plan.md`. This is Part II; Part I was StudyTrack. Initial scope/design documentation is prepared; application development begins only after the separate GitHub repository and issues exist.

## Read before working

- All work: `_docs/process.md`, the current GitHub issue and linked acceptance criteria.
- Product rules: `_docs/plan.md`.
- Architecture/service boundary: `_docs/architecture.md`.
- UI work: `_docs/design-system.md`.
- API work: the versioned `openapi.yml`, once created from the mock service in iteration 2.
- Tests: `_docs/testing-guidelines.md`.
- Evidence/status: `_docs/evidence.md` and `_docs/iterations.md`.

## Workflow

- After issue publication, GitHub Issues is the only active backlog. `_docs/tasks.md` is a historical planning snapshot.
- Work one issue at a time in dependency order. Use separate PM, engineer and QA agent sessions as defined in `_docs/team/`.
- The main session orchestrates those role sessions after backlog publication. PM grooms, engineer implements, independent QA verifies and closes only on PASS. The engineer never closes issues.
- When a real user/browser check finds a defect, create a `user-test-bug` issue before fixing it. Include Goal, Description, reproduction, expected/actual results and the failing commit. Ask PM to groom it and QA to expand regression cases.
- Follow the required iteration order. Do not build persistence before the in-memory stage is verified.
- Commit after meaningful decisions and working stages. Include `Refs #N`; do not use automatic issue-closing commit keywords because QA owns closure.
- Update affected Markdown whenever behavior or decisions change. Record actual evidence rather than anticipated results.

## Implementation constraints

- Frontend: React, TypeScript and a single async service interface with mock and HTTP adapters.
- Backend: Python, FastAPI, SQLAlchemy ORM and Alembic migrations. SQLite is the final MVP store; database URL is configurable.
- SQL dialect details belong only in the storage adapter. Domain logic uses repository interfaces and ORM operations, not raw SQLite queries.
- Preserve the frontend service shape when swapping adapters. No direct fetch/database access in UI components.
- Each asset is a physical unit. All booking dates are inclusive local calendar dates in `Asia/Almaty`; event timestamps are UTC.
- Never trust client-supplied roles, user IDs, ownership, availability or status transitions.
- Do not include private chat history unrelated to this assignment, credentials or local database files in Git.

## Commands

No application commands are available yet. MVP-01 must add and verify the real setup/test commands here and in README. Do not report an unimplemented command as a working one.
