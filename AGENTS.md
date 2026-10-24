# Agent entry point

## Purpose and status

Current stage: see the [current gate record](_docs/iterations.md#current-stage). Historical entries below retain their point-in-time results.

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

The frontend uses the async `GearShareService`. Its default adapter is HTTP (`/api/v1`, Vite `/api` proxy to `GEARSHARE_API_PROXY_TARGET`, default `http://127.0.0.1:8000`), so run the backend first (README "Run the full stack"); `VITE_GEARSHARE_SERVICE=mock` selects the memory-only mock explicitly, and the older browser suites set it themselves. There is no silent fallback from HTTP to mock. The backend serves health, auth, public catalogue, private create/list/detail/cancel and the #10 staff/inventory scope. Independent QA passed/closed #10/#30; the #30 correction preserves exact booking/staff `Allow` headers. Independent QA passed/closed #11 (the configurable SQLAlchemy repository and Alembic migrations, `GEARSHARE_STORE=sqlalchemy`) and #12 (the shared-store verification campaign: `make backend-test-persistence` or `uv run --locked pytest -m persistence`). Preserve every original routing assertion and the published failing-checkpoint history. `uv run --locked pytest` runs real ASGI auth/catalogue/booking/staff, rollback/concurrency/date/privacy cases plus the preserved OpenAPI/schema/sample and authoring checks. The complete true-memory API gate is accepted. The frontend HTTP integration (#13/#14) holds conditional independent QA verdicts on its branch and closes only after independent QA of the merged `main`. Private bookings carry `version`; five booking mutations require `expectedVersion`. The scoped frontend browser commands are `npm run test:browser` and `npm run test:browser:catalogue`, `:bookings`, `:staff`, `:labels`, `:resources` (see README for full commands/browser setup). The real-stack suites (real Vite + real backend + temp SQLite, no mocks) are `npm run test:browser:http` (#13) and `npm run test:browser:http:staff` (#14); they need `uv` and a Chromium (`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`). Exact engineer results are in `_docs/evidence.md`; engineer checks do not establish an independent-QA PASS.
