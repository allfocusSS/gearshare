# Architecture and iteration decisions

Current stage update (2026-10-20): independent QA passed and closed [#4](https://github.com/allfocusSS/gearshare/issues/4#issuecomment-6279522336), [#25](https://github.com/allfocusSS/gearshare/issues/25#issuecomment-6279464800) and [#26](https://github.com/allfocusSS/gearshare/issues/26), following #1–3/#24. The #5 coordinator/inventory mock candidate and the [#27](https://github.com/allfocusSS/gearshare/issues/27) visually-hidden-label correction are implemented. Standard engineer checks pass on `f89c963b8b0193d159f74742e126a966a0053bd3`; focused label regression results are recorded in evidence.md. Both issues remain open for complete independent verification. Independent QA and the complete mock-stage gate remain pending. #6/OpenAPI and later stages remain gated. Historical entries below retain their recorded point-in-time results.

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

The frontend now contains components/pages and `services/types.ts`, `mockService.ts`, `dates.ts` and `index.ts`; the async interface covers current user, login, registration, logout, listAssets(filters), getAsset(id), getAssetAvailability(id), requestBooking, listBookings, getBooking and cancelBooking. The #5 mock extends this same boundary with staff desk, transition and inventory operations. Public asset types contain identity/specification/state fields only; anonymous availability contains asset ID, club-local window/timezone and date/state pairs, with no private booking records. The backend contains the API entry point and health test. `httpService.ts`, repository/domain modules, migrations, a Makefile and versioned OpenAPI file do not exist yet.

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

All pages depend on a single `GearShareService` async interface. UI components never call `fetch` directly. The mock implements the same data shapes, validation and error codes as the eventual HTTP adapter. Mock data lives only in memory and is clearly marked as demo mode. An environment selector will switch adapters when the HTTP adapter exists; HTTP becomes the default in iteration 5. Current Demo controls select deterministic Normal/Loading/Empty/Error memory fixtures only.

Operations needed before OpenAPI authoring: register, login, logout, current user, list/get assets, get asset availability, create/list/get booking and events, cancel booking, staff list bookings, staff transition booking, staff create/update asset and staff inventory-state update. The final route names and schemas are fixed in iteration 2 after inspecting the actual mock service; this document intentionally does not pretend an API was already derived from nonexistent code.

### Current public catalogue service shape (#3)

- `listAssets({search?, category?, startDate?, endDate?})` intersects search, category and optional paired dates; paired dates enforce the product range rules and omit occupied/maintenance units. Without dates, `range` is null and the UI makes no range availability claim.
- `getAsset(id)` returns one fictional physical unit or typed NOT_FOUND.
- `getAssetAvailability(id)` returns the 91 calendar days from club-local today through today+90 inclusive, with only available/occupied/maintenance states. This window is independent of the maximum 14-day selectable request range, so a full month can be displayed.
- Runtime fixtures are relative to club-local today; the mock factory accepts an injected clock, and browser tests fix Date without freezing async timers. These are frontend service names, not prematurely authored HTTP routes/OpenAPI.

## Authentication

The real backend stage must use salted password hashes with a maintained password-hashing library. Successful backend login creates an opaque random bearer token; persist only its hash, user reference and expiry. Sessions expire after 24 hours and logout revokes the stored session. The future HTTP adapter holds the token in sessionStorage and clears it on 401/logout. Do not expose token hashes or passwords in logs/API responses. Do not use client role flags for authorization. Production account recovery, external SSO and distributed rate limiting are post-MVP and must be documented as deployment limitations.

The #2 mock is deliberately different infrastructure: public fictional fixture credentials and registered demo values stay only in JavaScript memory, as does the current user. It issues no real token and uses no localStorage/sessionStorage/cookies/API. It returns public user fields only; registration fixes the role to student and ignores extra role/ID input. The demo banner/README state that this browser adapter provides no real authentication security. Do not reuse its credential handling for #7 real authentication.

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

## #4 mock boundary additions

`requestBooking`, `listBookings`, `getBooking` and `cancelBooking` extend the same async `GearShareService`. Booking results are copied; owners see only their own list, while detail/cancellation allow the owner or coordinator. Active states reserve each inclusive date; terminal states release them. A deterministic next-request conflict adds an anonymous competing allocation and returns only unavailable dates. A next-request failure provides a retryable no-mutation path. This browser memory model is not server authorization or database concurrency evidence.

## #5 mock staff boundary additions

`listStaffBookings()` is coordinator-only and returns actual booking records with borrower, physical code/location, current custody, derived overdue and pending/returns-due-today/overdue counts. `approveBooking`, `rejectBooking`, `checkoutBooking` and `returnBooking` implement the product transition table; existing `cancelBooking` permits owners and coordinators. Notes are trimmed to 3–500 characters; approval rejects expired dates and checkout uses inclusive Asia/Almaty dates plus unique physical custody. Every event includes booking/actor IDs, canonical action, prior/new state, note and UTC timestamp. Returned/rejected/cancelled records retain history and release scheduled dates.

`listInventory`, `addAsset`, `editAsset` and `setAssetState` require a coordinator. Create/edit explicitly copy editable identity/specification fields; new units start active. Codes are trimmed, uppercased and compared case-insensitively for uniqueness. Inventory edits never rewrite Booking snapshots or event histories. Maintenance checks active custody and pending/approved commitments ending today or later before mutation.

All seeded occupied dates now derive from coherent real booking/event chains, including another fictional student's reservations; the owner's six-state fixture and public schedule patterns are preserved. The simulated conflict creates a real competing pending record only when its day is free. Mock validation and commit run synchronously after async readiness. This demonstrates frontend semantics, not server locks, database uniqueness, persistence or a transaction guarantee. No Booking version, HTTP adapter, OpenAPI, backend business route or storage implementation is added in #5.
