# Architecture and iteration decisions

Status: architecture decisions retained; iteration 0 implements only the React/TypeScript startup screen and FastAPI health endpoint. Independent QA is pending on #1.

## Stack options considered before code

| Option | Benefit | Tradeoff |
| --- | --- | --- |
| Django + Django REST Framework + React | Familiar Python ecosystem, built-in user/admin features | More framework conventions; the required independent mock/contract stages still need explicit discipline |
| FastAPI + SQLAlchemy + React | Explicit service contract, Pydantic validation and clean in-memory-to-ORM repository transition | Authentication and staff workflows must be implemented deliberately |
| TypeScript full stack + an ORM | One language across app; strong UI ecosystem | Less reuse of the user's Python experience; distinct runtime/tooling choices |

Select **FastAPI + SQLAlchemy + React/TypeScript** for an explicit API and demonstrable store replacement. This is an assistant proposal. Lock actual compatible dependency versions during bootstrap; no unverified version numbers are mandated here.

## Intended layout

```text
frontend/
  src/components/
  src/pages/
  src/services/types.ts
  src/services/mockService.ts
  src/services/httpService.ts
  src/services/index.ts
  tests/
backend/
  app/main.py
  app/auth.py
  app/schemas.py
  app/domain/
  app/routers/
  app/repositories/memory.py
  app/repositories/sqlalchemy.py
  app/models.py
  app/database.py
  tests/
  migrations/
_docs/
openapi.yml
AGENTS.md
Makefile
```

The application folders now contain the iteration-0 startup screen, API entry point and health test, with dependency locks. All product/service/repository paths shown above remain the target. A Makefile and versioned OpenAPI file do not exist yet.

## Required stages and concrete verification gates

| Iteration | Deliverable | Gate |
| --- | --- | --- |
| 0 | Specification, role/process files, GitHub backlog, empty app skeleton | One real passing bootstrap test; README commands verified |
| 1 | Fully interactive frontend backed only by `mockService` | Browser journeys for student and coordinator, without a backend |
| 2 | `openapi.yml` extracted from the completed frontend service shape | Valid request/response/error/auth schemas for every used operation |
| 3 | FastAPI with an actual Python in-memory repository | Contract, state-machine, access and allocation tests pass; no SQLite masquerading as this stage |
| 4 | SQLAlchemy SQLite repository and Alembic migration | Shared repository contract tests pass for both stores; process-restart persistence and concurrent request verification |
| 5 | Default HTTP adapter connects frontend and persisted backend | Two-browser-role workflows, failures, mobile and restart checks pass |

This combines the issue/agent workflow from the specifications article with the staged application construction from the full-stack article. Where the second article connects the frontend before persistence, follow the assignment's explicit ordering: SQLite stage precedes final frontend/backend integration. Integration checks against the memory API can be done through its test client without switching the UI default prematurely.

## Frontend boundary

All pages depend on a single `GearShareService` async interface. UI components never call `fetch` directly. The mock implements the same data shapes, validation and error codes as the eventual HTTP adapter. Mock data lives only in memory and is clearly marked as demo mode. A documented environment selector switches adapters; HTTP becomes the default in iteration 5.

Operations needed before OpenAPI authoring: register, login, logout, current user, list/get assets, get asset availability, create/list/get booking and events, cancel booking, staff list bookings, staff transition booking, staff create/update asset and staff inventory-state update. The final route names and schemas are fixed in iteration 2 after inspecting the actual mock service; this document intentionally does not pretend an API was already derived from nonexistent code.

## Authentication

Use salted password hashes with a maintained password-hashing library. Successful login creates an opaque random bearer token; persist only its hash, user reference and expiry. Sessions expire after 24 hours and logout revokes the stored session. The HTTP adapter holds the token in sessionStorage and clears it on 401/logout. Do not expose token hashes or passwords in logs/API responses. Do not use client role flags for authorization. Production account recovery, external SSO and distributed rate limiting are post-MVP and must be documented as deployment limitations.

## Domain and persistence

| Entity | Key fields / invariants |
| --- | --- |
| User | ID, normalized unique username, password hash, server-controlled role |
| Session | Unique token hash, user ID, expires_at UTC |
| Asset | ID, unique inventory code, name, category, description, location, active/maintenance |
| Booking | ID, asset ID, user ID, inclusive dates, purpose, state, version, created_at/updated_at UTC |
| ReservationSlot | Asset ID, day, booking ID; unique `(asset_id, day)` |
| ActiveLoan | Unique asset ID, unique booking ID; enforces physical custody |
| BookingEvent | ID, booking ID, actor ID, action, prior/new state, note, timestamp UTC |

The service layer calls a repository interface; memory and SQLAlchemy adapters provide atomic operations. The memory adapter uses a process-local lock around complete multi-record mutations. SQLite adapter uses ORM sessions and transactions. A URL selects the database; domain code does not import SQLite APIs or issue dialect-specific SQL.

Use database uniqueness to arbitrate day-slot and active-loan races. For transitions use compare-and-swap against the expected booking version/state; insert event, delete/create allocation and update state in one transaction. Convert expected contention into a controlled 409; unexpected database errors must not be disguised as validation failures. Document SQLite's single-writer deployment limit and bounded busy handling in infrastructure code, without pretending PostgreSQL was verified.

Staff maintenance changes and new bookings must serialize against the same asset availability version. A stale version must retry/recheck before mutation so maintenance cannot race with a successful booking. Verify this with a database test; a UI disabled button is not sufficient.

Store availability as discrete dates because the product intentionally books whole days. This makes the central overlap constraint portable using standard unique constraints. If hourly reservations are introduced later, revisit the allocation model in an explicit architecture decision.

## Reproducibility

Add dependency locks, `.env.example` without real secrets, documented seed/migrate/run/test commands and CI in their issues. Seed dates relative to the configured club-local date so the demo does not become unusable after a hardcoded week passes. Demo seeding must be idempotent and must not overwrite a real account or reset its password. Never commit databases, session tokens, local environment files, browser profiles or unrelated chat history.
