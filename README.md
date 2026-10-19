# GearShare

**Campus equipment lending, without double bookings.**

GearShare lets students reserve cameras, microphones, projectors and other shared equipment. A coordinator approves requests, checks equipment out and records its return. A calendar, booking state machine, transactional conflict protection and private audit history make this more than a CRUD catalogue.

Author: Zhaksylyk Turadil. Independent student project; no university integration is claimed.

## Current status

Independent QA passed and closed [#1](https://github.com/allfocusSS/gearshare/issues/1). The [#2](https://github.com/allfocusSS/gearshare/issues/2) candidate adds a responsive React/TypeScript design shell, role navigation and memory-only mock registration/sign-in. The real keyboard-focus defect found during browser testing is recorded in [#24](https://github.com/allfocusSS/gearshare/issues/24), with its correction awaiting independent QA. Both #2 and #24 remain open. Equipment, lending, contract and persistence stages remain ahead; this is not a finished submission. Actual checks are recorded in [`_docs/evidence.md`](_docs/evidence.md).

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

In another terminal at the repository root:

```sh
cd frontend
npm ci
npm test
npm run typecheck
npm run build
npm run dev
```

Open http://127.0.0.1:5173 to try the GearShare mock shell. The frontend starts independently of the backend; no API calls occur. `npm test` runs the auth/date service tests using Node's built-in test runner. `npm run build` checks TypeScript and writes the production bundle to `frontend/dist/`. Stop either development server with Ctrl+C.

No environment file is required. [`.env.example`](.env.example) documents the optional `UVICORN_HOST` and `UVICORN_PORT` shell variables, whose defaults are `127.0.0.1` and `8000`. The app does not automatically load a root `.env`; export an override before starting Uvicorn if needed. The frontend development command uses `127.0.0.1:5173` and fails clearly when that port is occupied; choose another port with `npm run dev -- --port 5174`. There are no secrets, database, seed or migration commands at this stage.

## Mock demo and browser checks

These credentials are fictional, public test fixtures:

| Role | Username | Password |
| --- | --- | --- |
| Student | `maya_student` | `StudentDemo42!` |
| Coordinator | `alex_coordinator` | `CoordinatorDemo42!` |

The sign-in screen can fill either fixture for you. Registration trims and lowercases a username of 3–30 ASCII letters, digits or underscores (`^[A-Za-z0-9_]{3,30}$` before lowercase normalization), requires a 10–128 character password and always creates a student. Account/session data exists only in this tab's JavaScript memory: reload resets it, logout clears the current session and changing a fixture resets all demo state. Browser storage and a backend are not used. This public client-side mock provides no real authentication security; use fictional details only.

Open **Demo controls** to select Normal, Loading (1.6-second async responses), Empty (no seeded accounts, registration available) or Error (typed failures for all service calls). Error feedback includes session retry; selecting Normal recovers. The current club date is computed in `Asia/Almaty`; tests inject fixed timestamps. Explore, reservations and staff destinations are explicitly previews; equipment and lending functionality follow #3–5.

From `frontend/`, install the test browser once and run the scoped auth/shell regression suite:

```sh
npx playwright install chromium
npm run test:browser
```

The test starts its own Vite server on `127.0.0.1:5178`, exercises sign-in/registration/focus/roles/fixtures at 390 px and 1440 px, saves ignored results/screenshots under `frontend/test-results/mock-auth/`, then stops the server/browser. It never starts a backend. `GEARSHARE_TEST_PORT` overrides the test port. If Chromium is already provisioned, `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/path/to/chromium npm run test:browser` uses that executable. The engineer used the provisioned Chromium 153 binary for the recorded run; browser installation is a separate network/environment prerequisite.

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
| `_docs/plan.md` | Product scope and business rules |
| `_docs/brainstorming.md` | Actual pre-code conversation and decision record |
| `_docs/architecture.md` | Options, decisions, entities and stages |
| `_docs/design-system.md` | Specific visual references and component rules |
| `_docs/tasks.md` | Draft backlog; superseded by GitHub issues on publication |
| `_docs/process.md` | Issue lifecycle and agent handoffs |
| `_docs/team/*.md` | PM, software engineer and independent QA roles |
| `_docs/testing-guidelines.md` | Verification strategy and regression cases |
| `_docs/submission-checklist.md` | Requirement-to-evidence mapping |

`openapi.yml`, equipment/lending workflows, persistence, CI and final integrated demo evidence remain future deliverables. The current frontend checks establish only mock shell/auth behavior; independent QA owns each issue's acceptance and closure.
