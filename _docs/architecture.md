# Architecture and iteration decisions

Current stage: see the [current gate record](iterations.md#current-stage). Historical entries below retain their point-in-time results.

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

The frontend contains components/pages and the complete async `GearShareService` with its explicit memory-only mock. Public asset types contain identity/specification/state fields only; anonymous availability has no private booking records. The backend has `domain.py`, `repositories.py` (transaction protocols), `memory.py` (locked dictionary adapter), auth/catalogue/booking/staff services and their HTTP boundaries, plus shared clock/text/calendar/routing conventions. `fixtures.py` seeds original physical units and trusted coherent private booking/event/slot fixtures once at app creation. All memory operations of the QA-passed `openapi.yml` are present. The #30 correction traverses included-route contexts for exact 405 method headers; its engineer checks pass, while #10/#30 still require fresh independent acceptance of the complete memory stage. `httpService.ts`, ORM models and migrations remain gated.

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

Operations needed before OpenAPI authoring: register, login, logout, current user, list/get assets, get asset availability, create/list/get booking and events, cancel booking, staff list bookings, staff transition booking, staff create/update asset and staff inventory-state update. The route names and schemas were fixed in iteration 2 (#6) by inspecting the completed mock service and are recorded in `openapi.yml` and [`api.md`](api.md); see "#6 contract decisions" below.

### Current public catalogue service shape (#3)

- `listAssets({search?, category?, startDate?, endDate?})` intersects search, category and optional paired dates; paired dates enforce the product range rules and omit occupied/maintenance units. Without dates, `range` is null and the UI makes no range availability claim.
- `getAsset(id)` returns one fictional physical unit or typed NOT_FOUND.
- `getAssetAvailability(id)` returns the 91 calendar days from club-local today through today+90 inclusive, with only available/occupied/maintenance states. This window is independent of the maximum 14-day selectable request range, so a full month can be displayed.
- Runtime fixtures are relative to club-local today; the mock factory accepts an injected clock, and browser tests fix Date without freezing async timers. These were frontend service names when #3 was written; their HTTP mapping is now in `openapi.yml`.

## Authentication

The #7 backend uses locked `argon2-cffi` and its salted Argon2id defaults. Successful register/login creates an opaque random bearer token; the repository stores only its SHA-256 hash, user reference and timezone-aware UTC expiry. Sessions expire absolutely after 24 hours, with an injected clock; logout removes only the presented session. Identity/role is resolved from the stored user. Registration always creates a student; trusted process/test setup alone may create a coordinator and no demo HTTP route grants roles. Passwords remain untrimmed/unnormalized; text limits count Unicode code points and credential strings reject lone surrogates before encoding. The future HTTP adapter holds the token in sessionStorage and clears it on 401/logout. Production account recovery, external SSO and distributed rate limiting remain deployment limitations.

Auth, catalogue, bookings and staff compose one `GearShareRepository`/transaction boundary. `MemoryRepository` (also available under the compatible #7 `MemoryAuthRepository` name) takes one process-local lock over a complete operation, copies every user/name/session/asset/code/booking/event/slot/custody map and the seed marker, and publishes them together only on success. Immutable records and copies on publication prevent mutable references from escaping the lock; exceptions discard the entire working copy. `occupied_days` reads the same unique day slots allocated by booking creation and released by cancellation, rejection or return. Checkout creates unique physical custody, and return removes it in the same transaction as the version/event update. Inventory edits update the code index without rewriting history; maintenance checks serialize with new bookings under that same lock. Desk joins/counts/custody/overdue use one repository snapshot and one club-local date: original booking name, current code/location and the real owner's normalized username. Trusted fixture chains reference existing owners/actors and include matching slots/custody. There is no second store, occupancy cache or public setup endpoint. Memory records disappear on restart/reload and the lock coordinates one process only. No SQLite, ORM or filesystem storage is used in this stage.

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

All seeded occupied dates now derive from coherent real booking/event chains, including another fictional student's reservations; the owner's six-state fixture and public schedule patterns are preserved. The simulated conflict creates a real competing pending record only when its day is free. Mock validation and commit run synchronously after async readiness. This demonstrates frontend semantics, not server locks, database uniqueness, persistence or a transaction guarantee. No Booking version, HTTP adapter, OpenAPI, backend business route or storage implementation was added in #5 (#6 later added the Booking version and the contract; the HTTP adapter, backend routes and storage remain future work).

## #6 contract decisions

`openapi.yml` (OpenAPI 3.1.0) is derived from `GearShareService`, `types.ts` and the QA-passed mock, not invented separately. It has one operation per service method (20), named by `operationId` and `x-service-method`, under `/api/v1` plus the existing `GET /health`. [`api.md`](api.md) holds the method-to-HTTP table, error and evaluation-order policy, authentication/session handling, date semantics, the state machine, concurrency and privacy; the contract tests keep both in step with `types.ts` and the mock.

- **Wire versus service shapes.** Authentication returns a wire-only `Session { token, expiresAt, user }`; the service interface keeps returning the public `User`, and the future HTTP adapter unwraps it. Secrets (passwords, password hashes, token hashes) are in no response schema. Tokens are opaque, stored only as a hash, valid 24 hours absolutely and revoked by `logout`; the adapter keeps the token in `sessionStorage` and clears it on 401 `UNAUTHENTICATED` and on logout.
- **Private records.** A student asking for another student's booking gets the same 404 as for a missing id; 403 is used only for role denial on staff routes. Anonymous availability stays `date` plus `state` only.
- **Optimistic concurrency.** Private `Booking` snapshots carry a required positive integer `version` (1 on creation, +1 per successful approve, reject, cancel, checkout or return, so it equals the event count). Those five mutations take a required `expectedVersion`: missing or invalid is 422, stale is 409, and nothing changes on failure. The server compares version and state atomically with the mutation; the client never retries with a refreshed version on its own. This is the contract-level form of the compare-and-swap rule in the data-model section and is what #9 and #10 implement in memory and #11/#12 in the database. `Asset` has no version; maintenance versus booking races are serialized server-side as stated in `api.md`.
- **Decisions added after the first QA FAIL** (details in `api.md`): every non-2xx body, including framework-generated ones, is the `Error` shape (the backend installs exception handlers); validation order is authentication, authorization/ownership (404 for non-owners), `expectedVersion` shape (422), version/state conflict (409), then `note` (422), so `note` limits are checked by hand rather than declaratively; unknown path ids are 404 and a malformed body `assetId` is 422 `fields.assetId`; `x-trimmed` means trim first, then validate (examples are written already trimmed); `expectedVersion` is a strict integer; the approve/cancel event notes and `StaffDesk.counts` are pinned. CORS and `tzdata>=2024a` are prerequisites for #13, not wire rules.
- **Deliberate mock-versus-wire differences** (`currentUser` resolving `null` for 401, `logout` always succeeding, `login`/`register` returning `User`) are absorbed by the HTTP adapter, so the UI-facing service shape does not change.
- **Change control.** The mock and `types.ts` remain the executable reference until a backend exists. A contract defect found later is corrected in `openapi.yml`, `api.md`, `types.ts`, the mock and the committed samples together.
