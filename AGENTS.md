# Agent entry point

## Purpose and status

Current stage update (2026-10-20): independent QA passed and closed #1–5 and the observed bugs #24–28, including the [#4](https://github.com/allfocusSS/gearshare/issues/4#issuecomment-6279522336), [#25](https://github.com/allfocusSS/gearshare/issues/25#issuecomment-6279464800), [#27](https://github.com/allfocusSS/gearshare/issues/27#issuecomment-6287900059), [#28](https://github.com/allfocusSS/gearshare/issues/28#issuecomment-6294272406) and [#5](https://github.com/allfocusSS/gearshare/issues/5#issuecomment-6294295984) PASS verdicts; the standalone mock stage gate is satisfied. [#6](https://github.com/allfocusSS/gearshare/issues/6) is an engineer candidate that independent QA [failed](https://github.com/allfocusSS/gearshare/issues/6#issuecomment-6295944514) on `39d1bdd` (two `openapi.yml` authoring defects found by Redocly and Spectral); the correction is a new candidate awaiting fresh independent QA: root `openapi.yml` (OpenAPI 3.1) is derived from the completed `GearShareService`, adds private `Booking.version` with a required `expectedVersion` precondition on the five booking mutations, and is checked by `backend/tests/test_openapi_contract.py` and `backend/tests/test_openapi_guards.py` (see `_docs/api.md` and evidence.md). #6 stays open for independent QA. #7 and later stages (backend business APIs, persistence, HTTP adapter) remain gated. Historical entries below retain their recorded point-in-time results.

## Read before working

- All work: `_docs/process.md`, the current GitHub issue and linked acceptance criteria.
- Product rules: `_docs/plan.md`.
- Architecture/service boundary: `_docs/architecture.md`.
- UI work: `_docs/design-system.md`.
- API work: the versioned root `openapi.yml` (OpenAPI 3.1, derived from the mock service) and `_docs/api.md` (method-to-HTTP map, error, auth, date, concurrency and privacy policy). Change both together with `GearShareService`; the contract tests fail on drift.
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

Prerequisites: Python 3.12.x, uv 0.12.23, Node 24.x and npm 11.x. See README for server URLs and optional configuration. Run each group from the repository root in separate terminals:

```sh
cd backend
uv sync --locked
uv run --locked pytest
uv run --locked uvicorn app.main:app --reload
```

```sh
cd frontend
npm ci
npm test
npm run typecheck
npm run build
npm run dev
```

The frontend uses the async `GearShareService` and memory-only identity/catalogue/booking/staff adapter; it makes no API calls. The backend still implements only `GET /health`; `uv run --locked pytest` also runs `backend/tests/test_openapi_contract.py`, which validates `openapi.yml` with a real OpenAPI validator and checks it against `frontend/src/services/types.ts` and committed mock-generated samples, and `backend/tests/test_openapi_guards.py`, which catches YAML-authoring defects (comma-split flow mappings, null keys, truncated descriptions, examples that violate their own schema) without Redocly or Spectral. Private bookings carry a `version` and the five booking mutations require `expectedVersion`. After an independent-QA FAIL the corrected #6 contract candidate needs fresh independent QA; business APIs, the HTTP adapter and persistence follow their separate stage gates. The scoped running-browser checks are `cd frontend` then `npm run test:browser` and `npm run test:browser:catalogue`, `npm run test:browser:bookings`, `npm run test:browser:staff`, `npm run test:browser:labels` and `npm run test:browser:resources`; install its browser using the README instructions first. Exact engineer results are in `_docs/evidence.md`; engineer checks do not establish an independent-QA PASS.
