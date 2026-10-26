# GearShare

**Campus equipment lending, without double bookings.**

GearShare lets students reserve cameras, microphones, projectors and other shared equipment. A coordinator approves requests, checks equipment out and records its return. A calendar, booking state machine, transactional conflict protection and private audit history make this more than a CRUD catalogue.

Author: Zhaksylyk Turadil. Independent student project; no university integration is claimed.

## Current status

See the [current gate record](_docs/iterations.md#current-stage). Independent QA passed and closed #1–14, including the [#11 ORM verdict](https://github.com/allfocusSS/gearshare/issues/11#issuecomment-6381631441) and the #12 shared-store verification campaign (see [Persistence verification](#persistence-verification-12-independent-qa-pass)), and the observed bugs #24–30. The backend serves health, authentication, the public catalogue, private bookings and the coordinator desk/inventory either from real Python process memory (the default) or, with explicit configuration, from the migrated SQLite store. **Iteration 5:** the default frontend service is now the HTTP adapter, which talks to the persisted FastAPI/SQLite backend through the Vite `/api` proxy ([#13](https://github.com/allfocusSS/gearshare/issues/13) identity/catalogue and [#14](https://github.com/allfocusSS/gearshare/issues/14) bookings/staff/inventory); the explicit mock stays available with `VITE_GEARSHARE_SERVICE=mock`. Fresh independent QA verified both on the merged `main` (`a13c77b`) and closed them. [Actual checks and limitations](_docs/evidence.md) are recorded separately from any QA verdict.

Repository: https://github.com/allfocusSS/gearshare. MVP issues #1–20 and post-MVP #21–23 are published. StudyTrack remains the separate Part I project.

## Run locally

Prerequisites: **Python 3.12.x**, **uv 0.12.23**, **Node.js 24.x** and **npm 11.x**. The verified environment uses Python 3.12.14, Node 24.19.0 and npm 11.9.0. Application dependencies are locked in `backend/uv.lock` and `frontend/package-lock.json`; no globally installed FastAPI, pytest, TypeScript or Vite is needed. Package installation needs access to public PyPI and npm registries.

From a fresh checkout, open a terminal at the repository root:

```sh
cd backend
uv sync --locked
uv run --locked pytest
uv run --locked uvicorn app.main:app --reload
```

The API listens at http://127.0.0.1:8000. In a second terminal, this returns HTTP 200 with `{"status":"ok"}`:

```sh
curl --fail http://127.0.0.1:8000/health
```

`uv run --locked pytest` runs real ASGI authentication/catalogue/booking tests, domain/repository/date/privacy/race/rollback tests and the existing contract/authoring tests. They validate [`openapi.yml`](openapi.yml) with `openapi-spec-validator`, check that every `GearShareService` method maps to exactly one operation, and compare schemas with `frontend/src/services/types.ts` and committed mock samples. To validate the contract alone: `cd backend && uv run --locked openapi-spec-validator ../openapi.yml`.

The backend serves `GET /health`, `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `GET /api/v1/auth/me` and `POST /api/v1/auth/logout`. Register/login require a UTF-8 JSON object with `username` and `password`, returning `{token, expiresAt, user}`; use `Authorization: Bearer <token>` for me/logout. Registration always creates a student. Passwords use salted Argon2id; only password and token hashes are stored. Tokens expire absolutely after 24 hours, and logout revokes only that session. The fictional browser credentials below belong to the mock. Private backend fixtures reference trusted identities with discarded random credentials; there is no public coordinator login or role-grant route. Every process restart or development reload discards backend state. See [auth implementation notes](_docs/api.md#memory-auth-implementation-7).

Public reads are `GET /api/v1/assets`, `GET /api/v1/assets/{assetId}` and `GET /api/v1/assets/{assetId}/availability`. The list accepts intersecting `search`, `category` and optional paired `startDate`/`endDate` query filters. Ten fictional units are seeded once per store; occupied-date fixtures are relative to the startup club-local date. Calendars contain exactly 91 scheduled dates/states with no private booking data. The app reads its locked timezone package, so `Asia/Almaty` uses UTC+5 even on a stale host. For a live example, `curl --fail 'http://127.0.0.1:8000/api/v1/assets?search=CAM-001'`. [Catalogue semantics](_docs/api.md#memory-catalogue-implementation-8) describe date/query boundaries and the distinction between schedules and physical custody.

Private routes are `POST /api/v1/bookings`, `GET /api/v1/bookings`, `GET /api/v1/bookings/{bookingId}` and `POST /api/v1/bookings/{bookingId}/cancel`, all requiring the bearer token. Creation accepts `{assetId, startDate, endDate, purpose}`, allocates every inclusive day atomically and returns a pending booking with immutable events. The list contains only the caller's records; detail/cancel allow the owner or coordinator. Cancellation requires `{expectedVersion}` from the observed snapshot, releases every reserved day and retains history. [Booking semantics](_docs/api.md#memory-private-bookings-9) describe validation, privacy, conflicts and process-memory limits.

In another terminal at the repository root:

```sh
cd frontend
npm ci
npm test
npm run typecheck
npm run build
npm run dev
```

Open http://127.0.0.1:5173. The frontend's **default** service is the HTTP adapter, so start the backend first (see [Run the full stack](#run-the-full-stack-http-adapter-on-sqlite)); the Vite development server proxies `/api` to the backend, so the browser sees a single origin and no CORS configuration is needed. To explore the memory-only mock without any backend, run `VITE_GEARSHARE_SERVICE=mock npm run dev`; only then do the demo banner, Demo controls and fictional credentials below appear. `npm test` runs the auth/catalogue/booking/date/privacy/staff/version service tests and the contract-file checks using Node's built-in test runner. After an intentional mock change, `node tests/contract-samples.mjs --write` regenerates the committed contract samples; the backend tests then re-validate them. `npm run build` checks TypeScript and writes the production bundle to `frontend/dist/`. Stop either development server with Ctrl+C.

No environment file is required for the default memory mode. [`.env.example`](.env.example) documents optional store/database settings and the `UVICORN_HOST`/`UVICORN_PORT` shell variables, whose defaults are `127.0.0.1` and `8000`. The app does not automatically load a root `.env`; export an override before starting Uvicorn if needed. The frontend development command uses `127.0.0.1:5173` and fails clearly when that port is occupied; choose another port with `npm run dev -- --port 5174`. The running application still defaults to the true memory repository. Frontend variables (all optional, read by Vite at start-up from the shell or an ignored `frontend/.env.local`): `VITE_GEARSHARE_SERVICE` (`http`, the default, or `mock`; any other value stops the app with a clear error and there is never a silent fallback from HTTP to the mock), `VITE_API_BASE_URL` (empty = same origin, so requests go to `/api/v1` through the proxy; a cross-origin URL needs CORS, which the MVP backend deliberately does not enable) and `GEARSHARE_API_PROXY_TARGET` (Node-side proxy target for `npm run dev`/`vite preview`, default `http://127.0.0.1:8000`). The ORM store (independently accepted in #11) is selected explicitly; see the SQLite section below.

### Run the full stack (HTTP adapter on SQLite)

Two terminals, both from the repository root. The backend must use the migrated SQLite store; the in-memory backend also works but loses every account on restart.

```sh
# terminal 1: persisted API on http://127.0.0.1:8000
cd backend
uv sync --locked
export GEARSHARE_STORE=sqlalchemy
export GEARSHARE_DATABASE_URL=sqlite:///./gearshare.sqlite3
uv run --locked alembic upgrade head
uv run --locked uvicorn app.main:app --host 127.0.0.1 --port 8000
```

```sh
# terminal 2: SPA on http://127.0.0.1:5173, proxying /api to the API above
cd frontend
npm ci
npm run dev
```

Register a student in the browser. A coordinator cannot be created through the app (registration always creates a student and no route grants a role); until the seed command of #19 exists, the browser test suites create one through the repository with the test-only helper `frontend/tests/support/seed_coordinator.py`. The bearer token lives in `sessionStorage` of the tab: a reload keeps you signed in, closing the tab does not, and sign-out revokes the session on the server. A rejected token (expired after 24 hours or revoked elsewhere) shows "Your session has ended" with a link that returns you to the page you were on. If the API is stopped the app shows retryable "server is unavailable" errors; it never substitutes demonstration data.

## Mock demo and browser checks

The mock is selected only with `VITE_GEARSHARE_SERVICE=mock` (the existing browser suites below set it themselves). These credentials are fictional, public test fixtures:

| Role | Username | Password |
| --- | --- | --- |
| Student | `maya_student` | `StudentDemo42!` |
| Coordinator | `alex_coordinator` | `CoordinatorDemo42!` |

The sign-in screen can fill either fixture for you. Registration trims and lowercases a username of 3–30 ASCII letters, digits or underscores (`^[A-Za-z0-9_]{3,30}$` before lowercase normalization), requires an untrimmed password of 10–128 Unicode code points and always creates a student. Account/session data exists only in this tab's JavaScript memory: reload resets it, logout clears the current session and changing a fixture resets all demo state. Browser storage and a backend are not used. This public client-side mock provides no real authentication security; use fictional details only.

Open **Demo controls** to select Normal, Loading (1.6-second async responses), Empty (no seeded accounts or equipment, registration available) or Error (typed failures for all service calls). Error feedback includes session retry; selecting Normal recovers. The current club date is computed in `Asia/Almaty`; tests inject fixed timestamps. Explore now has ten fictional physical units across Cameras, Audio, Presentation and Accessories. Search/category filters intersect; optional paired dates show only units available for every selected inclusive day. With no dates, no availability is claimed. Detail calendars distinguish occupied, selected and maintenance dates; they reveal no borrower/purpose/booking metadata. Student reservations are independently verified. Coordinators can now review queues, approve/reject/cancel, check out and return with condition notes, and manage inventory in the #5 candidate.

From `frontend/`, install the test browser once and run the scoped auth/shell regression suite:

```sh
npx playwright install chromium
npm run test:browser
npm run test:browser:catalogue
npm run test:browser:bookings
npm run test:browser:staff
npm run test:browser:labels
npm run test:browser:resources
```

The auth test starts its own Vite server on `127.0.0.1:5178` and exercises sign-in/registration/focus/roles/fixtures at 390 px and 1440 px. The bookings test uses port 5181. The staff test uses 5182 (`GEARSHARE_STAFF_PORT` overrides) and exercises the full two-role mock lifecycle, custody, inventory and async failures at both widths; screenshots/results are in `frontend/test-results/staff/`. The focused labels regression uses port 5191 (`GEARSHARE_LABELS_QA_PORT` overrides), checks accessible names/clipping/keyboard at both widths and saves results/screenshots under `frontend/test-results/qa27-after/`. The catalogue test uses port 5179 and a fixed browser date of 2026-10-19 to exercise filter/date boundaries, anonymous calendars, maintenance, empty/missing/error states and both layouts. Ignored results/screenshots are saved under `frontend/test-results/mock-auth/` and `frontend/test-results/catalogue/`; each test stops its server/browser. It never starts a backend and always runs the mock (each spawns Vite with `VITE_GEARSHARE_SERVICE=mock`; `resources` builds its own mock bundle). `GEARSHARE_TEST_PORT` overrides the test port. If Chromium is already provisioned, `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/path/to/chromium npm run test:browser` uses that executable. The engineer used the provisioned Chromium 153 binary for the recorded run; browser installation is a separate network/environment prerequisite.

Two further suites exercise the **real** stack: the default HTTP adapter in the real Vite app against the real FastAPI backend on a temporary file SQLite database (migrated with Alembic, with a test-only coordinator inserted through the repository). Nothing is mocked; failures are provoked by stopping the backend or blocking the browser's own requests. They need `uv` and Python for the backend, use ports 6201 (API) and 6202 (Vite) by default (`GEARSHARE_HTTP_BACKEND_PORT`, `GEARSHARE_HTTP_VITE_PORT`), use the real Asia/Almaty club date, and write screenshots/results to ignored `frontend/test-results/http/` and `frontend/test-results/http-staff/`. Each starts a fresh database per viewport width (1440 and 390 px) and removes it afterwards.

```sh
npm run test:browser:http         # #13: identity, session/401, catalogue, failures and retry
npm run test:browser:http:staff   # #14: student request -> approve -> checkout -> return, conflicts, stale versions, inventory, outages
```

The #15 usability regressions (#31 onwards) have one issue-filterable block per bug in two suites that share `frontend/tests/support/ux.mjs`: `npm run test:browser:http:ux` (real stack, ports 6241/6242, evidence in ignored `frontend/test-results/http-ux/`) and `npm run test:browser:ux` (explicit mock adapter, port 6243, `frontend/test-results/mock-ux/`). Narrow a run with `UX_ISSUES=32,36` (issue numbers) and `UX_CASES=32.1,32.4` (exact QA case numbers); the cheap helper and stylesheet checks run in `npm test` (`tests/ux.test.mjs`). `UX_HTTP_BACKEND_PORT`, `UX_HTTP_VITE_PORT` and `UX_MOCK_PORT` move the three ports when another run (a second checkout, QA) holds them. Both need the usual Chromium (`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`); the real-stack one also needs `uv`.

```sh
UX_ISSUES=32 npm run test:browser:http:ux   # example: only the #32 focus cases on the real stack
UX_ISSUES=32 npm run test:browser:ux        # the same issue on the mock adapter
```


## Start here

1. Read [`_docs/brainstorming.md`](_docs/brainstorming.md) and [`_docs/plan.md`](_docs/plan.md).
2. Read [`_docs/architecture.md`](_docs/architecture.md) and [`_docs/design-system.md`](_docs/design-system.md).
3. Read the real [GitHub backlog](https://github.com/allfocusSS/gearshare/issues). `_docs/tasks.md` is now a historical mapping; GitHub Issues is the only active backlog.
4. Follow [`_docs/process.md`](_docs/process.md): PM → engineer → independent QA → correction loop → QA closes the issue.
5. Build in the assignment's exact order: mock frontend → `openapi.yml` → in-memory API → SQLite through ORM → integrated frontend.
6. Record actual commands, results, commits and bugs in [`_docs/evidence.md`](_docs/evidence.md). Do not replace planned checks with claims of passing tests.

## Planned MVP

- Student registration and sign-in; coordinator role controlled by the server.
- Searchable equipment catalogue with date/category filters and per-item availability.
- Booking requests with transactional protection against overlapping days.
- Student reservation history and cancellation.
- Coordinator approval/rejection, checkout, return and maintenance controls.
- Condition notes, overdue indicators and a booking event history.
- SQLite persistence through SQLAlchemy, an explicit OpenAPI contract and automated/browser verification.

## Repository documents

| File | Purpose |
| --- | --- |
| `AGENTS.md` | Entry point and agent instructions |
| `openapi.yml` | Frozen OpenAPI 3.1 contract; all memory operations implemented; #30 routing correction awaits independent complete-memory QA |
| `_docs/api.md` | Method-to-HTTP map, error, authentication, date, concurrency and privacy policy behind the contract |
| `_docs/plan.md` | Product scope and business rules |
| `_docs/brainstorming.md` | Actual pre-code conversation and decision record |
| `_docs/architecture.md` | Options, decisions, entities and stages |
| `_docs/design-system.md` | Specific visual references and component rules |
| `_docs/tasks.md` | Draft backlog; superseded by GitHub issues on publication |
| `_docs/process.md` | Issue lifecycle and agent handoffs |
| `_docs/team/*.md` | PM, software engineer and independent QA roles |
| `_docs/testing-guidelines.md` | Verification strategy and regression cases |
| `_docs/submission-checklist.md` | Requirement-to-evidence mapping |

Persistence, CI and final integrated demo evidence remain future deliverables. The backend implements the auth part of `openapi.yml`; the current frontend checks still establish mock behavior. Independent QA owns each issue's acceptance and closure.

### Mock student reservations (#4 verified)

Sign in as the fictional student, open equipment, select inclusive dates and enter a 5–500 character purpose. Request equipment creates pending approval. My reservations provides Upcoming (including active/overdue loans), History, private details/events and cancellation for pending/approved records. The six student fixture records show all states. Cancellation releases reserved dates. The request panel offers deterministic next-request conflict and failure controls; errors preserve entered values, and a conflict refreshes the anonymous calendar. All state remains memory-only and resets on reload or fixture reset.

Run `npm run test:browser:bookings` from `frontend/` for the scoped student browser journey; use the same Playwright browser setup/executable override as the other browser checks. The coordinator desk below provides the staff mutation UI.

### Mock coordinator desk and inventory (#5 verified)

Without reloading, sign out the student and sign in as the coordinator to retain the same memory-only records. Coordinator desk shows Pending requests, Pickups, Active loans and History, with counts for pending, returns due today and overdue. Review a request, approve it, check it out within its inclusive booked dates with outgoing condition, then record its return with incoming condition. Sign back in as the student to inspect the retained history. An overdue microphone fixture demonstrates why its next pickup stays blocked until the previous return is recorded.

Inventory supports search, add/edit and active/maintenance state. Codes are trimmed and stored uppercase; every physical unit needs a unique code. Maintenance errors explain that active returns and unresolved pending/approved commitments must be resolved at the desk first. Existing reservation snapshots and histories stay intact after equipment edits. Each private reservation carries a version (1 when created, +1 per successful approve, reject, cancel, checkout or return); the desk and My reservations send the version they last read, and a stale version is rejected with a conflict and no change (see [`_docs/api.md`](_docs/api.md)). Reload or changing a demo fixture resets every record. The mock provides no real server authorization or persistence.

### SQLite ORM mode (#11, independently accepted)

From `backend/`, export `GEARSHARE_DATABASE_URL=sqlite:///./gearshare.sqlite3`, then run
`uv run --locked alembic upgrade head`. The URL is configurable; SQLite files,
WAL/SHM files and `.env` are ignored by Git. `uv run --locked alembic current`
shows the revision; `uv run --locked alembic downgrade base` removes all application
tables and their data, and is intended only for disposable databases.
`uv run --locked pytest tests/test_database_schema.py -q` verifies migrations,
constraints, rollback and UTC/date round trips on temporary file-backed databases.

After migration, start the same services with the ORM repository:

```sh
cd backend
export GEARSHARE_STORE=sqlalchemy
export GEARSHARE_DATABASE_URL=sqlite:///./gearshare.sqlite3
uv run --locked alembic upgrade head
uv run --locked uvicorn app.main:app --reload
```

Keep `GEARSHARE_STORE=memory` (the default) for the true process-memory mode.
The application never creates or migrates tables automatically. On startup,
fictional assets and coherent private fixtures seed once in one transaction;
a persistent marker prevents repeat seeding and existing accounts/passwords
are never overwritten. The random fixture credentials are inaccessible and
provide no public staff login. Real account setup remains a trusted operation.

The schema includes the seven domain entities and a persistent seed marker.
Booking timestamps, event timestamps and session expiry round-trip as aware UTC;
reservation dates remain local calendar dates. SQLite busy handling defaults to
five seconds per attempt (`GEARSHARE_SQLITE_BUSY_TIMEOUT`, greater than 0 through
30). At most four whole-operation attempts recheck a fresh database snapshot,
with 10/20/40 ms backoff; persistent infrastructure contention returns safe 503.
A rechecked username/code/availability/version/custody conflict returns its
ordinary documented 409; unexpected database faults remain safe 500.
SQLite permits one writer at a time and is intended for a local MVP deployment;
no other database engine has been verified. The frontend remains mocked.

From `backend/`, `uv run --locked pytest tests/test_sqlalchemy_store.py -q` runs
targeted ORM API, rollback, CAS, maintenance and contention tests. For a real HTTP
smoke in one owner process, run `PYTHONPATH=. uv run --locked python scripts/check_sql_store.py --output /tmp/gearshare-sql-smoke.json`.
That probe uses a disposable migrated SQLite file, real Argon2 and actual Uvicorn;
it is not a process-restart check.

### Persistence verification (#12, independent QA PASS)

The #12 suites check that the memory and SQLite stores behave identically behind the repository boundary and that the SQLite file survives real process restarts, simultaneous clients, injected faults and database locks. Run them from `backend/` (the default `uv run --locked pytest` includes them; the extra campaign alone is about two to three minutes):

```sh
cd backend
uv run --locked pytest -m persistence          # the seven #12 modules: contract, auditor, confinement, races, faults, locks, restarts
GEARSHARE_RACE_ITERATIONS=50 GEARSHARE_PERSISTENCE_REPORT=/tmp/gearshare-persistence.json uv run --locked pytest -m persistence -s
```

`make backend-test-persistence` runs the same campaign. Tests start real `uvicorn` child processes on a free port in 6400-6499 against temporary migrated SQLite files and delete them afterwards. SQLite is used in its default rollback-journal mode (no WAL), `synchronous=FULL`, foreign keys on, with a per-attempt busy timeout (default 5 s) and at most four whole-operation attempts; a lock held longer than that yields a safe 503, never a hang. Starting several uvicorn workers on a brand-new unseeded database makes some workers fail once during start-up and be restarted by uvicorn, so seed with one process first. Only SQLite was verified; no claim is made about any other database. [Evidence and limits](_docs/evidence.md#iteration-4--12-persistence-contention-and-storage-parity-engineer-candidate) are exact commands and results.
