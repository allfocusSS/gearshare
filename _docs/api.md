# HTTP API notes

Companion to the versioned contract [`openapi.yml`](../openapi.yml) (OpenAPI 3.1.0, `info.version` 1.0.0), the Iteration 2 deliverable of [#6](https://github.com/allfocusSS/gearshare/issues/6). The contract was derived from the completed, independently QA-passed standalone mock (#2-#5, #24-#28): the `GearShareService` interface and DTOs in `frontend/src/services/types.ts` and the behavior of `mockService.ts`. **No backend implements it yet.** Only `GET /health` is served today; the memory API (#7-#10), SQLite persistence (#11-#12) and the frontend HTTP adapter (#13-#14) are later stages that must conform to this document and to `openapi.yml`. If they find a defect in the contract, correct `openapi.yml`, this file, `types.ts`, the mock and the samples together (see [Verification and change control](#verification-and-change-control)).

## Service method to HTTP operation

All business routes live under `/api/v1`. Every operation in `openapi.yml` carries `x-service-method` (the exact `GearShareService` method, also its `operationId`) and `x-access`. `GET /health` is infrastructure and has no service method. Success statuses are in the fourth column; every operation can also answer `503` and carries a `default` response for framework-generated and unexpected failures (404 unknown route, 405, a body that is not JSON, 500), all in the `Error` shape.

| Service method | HTTP operation | Access | Success | Error statuses |
| --- | --- | --- | --- | --- |
| `register` | `POST /api/v1/auth/register` | public | 201 `Session` | 409 `USERNAME_TAKEN`, 422 |
| `login` | `POST /api/v1/auth/login` | public | 200 `Session` | 401 `INVALID_CREDENTIALS`, 422 |
| `logout` | `POST /api/v1/auth/logout` | authenticated | 204 | 401 |
| `currentUser` | `GET /api/v1/auth/me` | authenticated | 200 `User` | 401 |
| `listAssets` | `GET /api/v1/assets` | public | 200 `CatalogueResult` | 422 |
| `getAsset` | `GET /api/v1/assets/{assetId}` | public | 200 `Asset` | 404 |
| `getAssetAvailability` | `GET /api/v1/assets/{assetId}/availability` | public | 200 `AssetAvailability` | 404 |
| `requestBooking` | `POST /api/v1/bookings` | authenticated | 201 `Booking` | 401, 404, 409 (+`unavailableDates`), 422 |
| `listBookings` | `GET /api/v1/bookings` | authenticated (own bookings only) | 200 `Booking[]` | 401 |
| `getBooking` | `GET /api/v1/bookings/{bookingId}` | owner or coordinator | 200 `Booking` (with events) | 401, 404 |
| `cancelBooking` | `POST /api/v1/bookings/{bookingId}/cancel` | owner or coordinator | 200 `Booking` | 401, 404, 409, 422 |
| `listStaffBookings` | `GET /api/v1/staff/bookings` | coordinator | 200 `StaffDesk` | 401, 403 |
| `approveBooking` | `POST /api/v1/staff/bookings/{bookingId}/approve` | coordinator | 200 `Booking` | 401, 403, 404, 409, 422 |
| `rejectBooking` | `POST /api/v1/staff/bookings/{bookingId}/reject` | coordinator | 200 `Booking` | 401, 403, 404, 409, 422 |
| `checkoutBooking` | `POST /api/v1/staff/bookings/{bookingId}/checkout` | coordinator | 200 `Booking` | 401, 403, 404, 409, 422 |
| `returnBooking` | `POST /api/v1/staff/bookings/{bookingId}/return` | coordinator | 200 `Booking` | 401, 403, 404, 409, 422 |
| `listInventory` | `GET /api/v1/staff/assets` | coordinator | 200 `Asset[]` | 401, 403 |
| `addAsset` | `POST /api/v1/staff/assets` | coordinator | 201 `Asset` | 401, 403, 409 (duplicate code), 422 |
| `editAsset` | `PUT /api/v1/staff/assets/{assetId}` | coordinator | 200 `Asset` | 401, 403, 404, 409, 422 |
| `setAssetState` | `PUT /api/v1/staff/assets/{assetId}/state` | coordinator | 200 `Asset` | 401, 403, 404, 409, 422 |

Request and response schemas are the `components.schemas` entries named in the table; `BookingPrecondition` (`{expectedVersion}`) is the body of approve and cancel, `BookingTransitionInput` (`{expectedVersion, note}`) of reject, checkout and return, `AssetInput` of add and edit, and `AssetStateInput` (`{state}`) of the state switch. `listAssets` takes the query parameters `search`, `category`, `startDate` and `endDate`. The student's "My reservations" list and detail are `listBookings`/`getBooking`; coordinators cancel through the same `cancelBooking` route as owners. The demo-only mock controls (`simulateConflict`, `simulateFailure`, `setScenario`) are not API.

## Conventions

* JSON bodies (`application/json`). Identifiers are opaque server-generated strings. **Unknown request properties are ignored, never trusted:** a `role`, `id`, `userId`, `ownerId`, `actorId`, `state`, `version`, `events` or timestamp in any body cannot set identity, ownership, status, version or audit data. Registration therefore always creates a student, and a created booking is always `pending`, version 1, owned by the caller.
* **Text trimming (`x-trimmed: true`).** The server strips leading and trailing whitespace **first** and only then applies the pattern and length limits; the trimmed value is what is stored and returned. So `"  New_Member9  "` is a valid username and registers `new_member9`. JSON Schema cannot express "trim, then check", therefore the schemas and every `example` in `openapi.yml` describe the **trimmed** value and are valid exactly as written (a linter, mock server or schema-validating client must never see an example that its own schema rejects); a schema validator run against a raw request must trim the `x-trimmed` fields first. `password` is never trimmed. "Whitespace" is the set removed by ECMAScript `String.prototype.trim`, which is what the mock uses: tab, line feed, vertical tab, form feed, carriage return, space, U+00A0, U+FEFF, U+2028, U+2029 and every Unicode space separator (category `Zs`). Python's `str.strip()` differs in exactly two ways (it also strips U+001C-U+001F and U+0085 and does not strip U+FEFF), so a Python backend uses an explicit character set instead of `strip()` with no arguments.
* **Ids.** Identifiers are opaque server-generated strings of 1-100 characters (`Id`). A **path** id the server does not know - including one longer than 100 characters or otherwise malformed - is **404 `NOT_FOUND`**, never 422; the length limits describe ids the server issues and are not enforced as a validation rule on path parameters. For a booking id the 404 is byte-identical to the one a student gets for somebody else's booking. A **body** `assetId` (`requestBooking`) that is missing, not a string, empty or longer than 100 characters is **422 `VALIDATION_ERROR` with `fields.assetId`**, reported together with the other offending fields; a well-formed `assetId` that matches no unit is 404, checked after field validation. `userId`, `ownerId` and similar keys in a body are ignored, never validated.
* **`expectedVersion` is a strict integer.** It must be a JSON integer literal from 1 to 2147483647. Missing, `null`, booleans, strings (even `"2"`), arrays, objects, fractions (`2.5`) and numbers written with a fraction or exponent (`2.0`, `2e0`) are 422 `fields.expectedVersion`; the server must not coerce them (a default lax integer field accepts `true` and `"2"`, so use a strict integer type). The mock cannot see the `2.0` case because `JSON.parse` erases it, and the SPA's `JSON.stringify` never produces it.
* **Order of results.** `listBookings`, `listStaffBookings.bookings` and `listInventory` use stable creation order, oldest first; clients group and sort for display. `Booking.events` is chronological.

### Frozen validation limits

| Field | Rule |
| --- | --- |
| `username` | trim, then `^[A-Za-z0-9_]{3,30}$`; stored and returned lowercase; unique case-insensitively (`Alice`, `ALICE`, ` alice ` are one account) |
| `password` | 10-128 characters, not trimmed, stored only as a salted hash, never returned or logged |
| `purpose` | trimmed 5-500 characters |
| `note` (rejection reason, outgoing/incoming condition) | trimmed 3-500 characters |
| asset `name` / `location` | trimmed 2-100 characters |
| asset `inventoryCode` | trimmed 2-30 characters, **stored uppercase**, unique case-insensitively |
| asset `description` | trimmed, at most 2,000 characters (may be empty) |
| asset `category` | one of `Cameras`, `Audio`, `Presentation`, `Accessories` |
| asset `state` | `active` or `maintenance` |
| `expectedVersion` | integer from 1 to 2147483647 |

### Dates and times

* A booking date is an **inclusive calendar date in `Asia/Almaty`** (`YYYY-MM-DD`, no time or offset). Let `T` be the current `Asia/Almaty` date. A request needs `T <= startDate <= endDate <= T + 90 days` and an inclusive length of 1-14 days. `startDate == endDate` is a valid one-day booking, a second request for that same unit and day conflicts, and a booking starting the day after another's inclusive end does not.
* The same rules apply to the optional paired filter of `listAssets`; supplying only one of the two dates is a 422.
* Event timestamps and `Session.expiresAt` are timezone-aware **UTC** instants ending in `Z`. They are never converted to or confused with calendar dates: a UTC instant near midnight can belong to the previous or next `Asia/Almaty` day, and the server always derives today's club date from the clock in `Asia/Almaty`.
* `AssetAvailability` covers 91 consecutive days, `today` through `horizonEnd = today + 90`, independent of the 14-day request limit.

## Authentication and sessions

* `register` and `login` return a wire-only `Session` DTO: `{ token, expiresAt, user }`. It is deliberately distinct from the public `User` (`{ id, username, role }`) that `GearShareService.register/login/currentUser` return. In `frontend/src/services/types.ts` it is the `Session` interface, which the future HTTP adapter uses and the memory-only mock never produces.
* `token` is an opaque, unpredictable bearer token (`Authorization: Bearer <token>`). The server persists only a hash of it with the user reference and a UTC `expiresAt` **exactly 24 hours after issue** (absolute, no sliding renewal). `logout` revokes the presented session immediately; other sessions of the user are unaffected.
* Absent, malformed, unknown, expired or revoked tokens are **401 `UNAUTHENTICATED`** on every secured operation. A valid token with the wrong role is **403**. Roles come from the server-side user, never from the request.
* **Adapter behavior (#13/#14).** The HTTP adapter keeps the token in `sessionStorage` (not `localStorage`, cookies or a URL), sends it on every request, and returns only `session.user` from `login`/`register`. It clears the token and the in-memory user on any 401 with code `UNAUTHENTICATED` and on `logout`, then offers sign-in preserving navigation context. A 401 `INVALID_CREDENTIALS` from `login` is a wrong password, not an expired session, so it clears nothing. `currentUser` returns `null` without calling the API when no token is held, and maps a 401 to `null` after clearing the token. `logout` clears the token even when the server answers 401.
* Passwords, password hashes, token hashes and any other credential material appear in **no response schema** (the only schema with a `password` property is the write-only login/registration body). Logs must not contain them either.
* The mock keeps fictional demo credentials and the signed-in user in JavaScript memory, issues no token and claims no real security. It also differs in three deliberate ways the adapter absorbs: `currentUser` resolves `null` instead of failing, `logout` always succeeds, and `login`/`register` return a `User` rather than a `Session`.

## Errors

Every non-2xx response uses the shared `Error` schema: `{ code, message, unavailableDates?, fields? }`. That includes the responses the web framework would otherwise write itself (see [Framework-generated and unexpected errors](#framework-generated-and-unexpected-errors)); each operation documents them with a `default` response. `code` is exactly the frontend `ServiceErrorCode` union; the HTTP status is carried by the status line, and the adapter copies it into `ServiceError.status`. `message` is safe to show. Errors never contain another user's name, purpose, booking id, stack trace or other private or internal data.

| HTTP status | `code` | Meaning |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | No valid session (also the response of `currentUser`/`logout` without one) |
| 401 | `INVALID_CREDENTIALS` | Wrong username or password at `login` |
| 403 | `FORBIDDEN` | Valid session, role is not a coordinator |
| 404 | `NOT_FOUND` | Unknown asset, or an unknown/not-visible booking (any unknown path id, however malformed); also an unknown route |
| 405 | `NOT_FOUND` | Known route, unsupported method (with an `Allow` header) |
| 409 | `CONFLICT` | Date conflict, stale `expectedVersion`, transition not allowed, time/custody rule, duplicate inventory code, maintenance blocked |
| 409 | `USERNAME_TAKEN` | Normalized duplicate username at `register` |
| 422 | `VALIDATION_ERROR` | A documented field rule failed; `fields` names each field |
| 500 | `SERVICE_UNAVAILABLE` | Unhandled exception: generic message, no internals, transaction rolled back |
| 503 | `SERVICE_UNAVAILABLE` | The service cannot answer (also used by the frontend for network failures) |

* `fields` keys are the offending query parameter or body property names: `username`, `password`, `assetId`, `startDate`, `endDate`, `category`, `purpose`, `note`, `name`, `inventoryCode`, `location`, `description`, `state`, `expectedVersion` (the same set as `ServiceError.fields` in `types.ts`; `assetId` was added in the #6 correction). A 422 caused by the request envelope (below) has no `fields`.
* `unavailableDates` appears only on the `requestBooking` 409: the requested days already held by a pending, approved or checked-out booking of that unit, ascending, with no identities. It is an empty array when the conflict is that the unit is in maintenance.
* A **stale-version** 409 carries `fields.expectedVersion`; an ordinary invalid-transition or business-rule 409 carries no `fields`, so clients can tell "someone changed this" from "this action is not possible".
* A failed request changes nothing: no state, version, timestamp, event, reserved day, active loan, inventory record or session.

### Framework-generated and unexpected errors

The web framework (FastAPI/Starlette) answers some failures itself with a `{"detail": ...}` body, which would break the `Error` contract and the frontend's error handling. The backend (#7 onward) therefore **installs exception handlers** for the framework's request-validation error, its HTTP errors and any unhandled exception, so that these are the only possible non-2xx bodies:

| Situation | Status | `code` | `fields` |
| --- | --- | --- | --- |
| Body is not parseable JSON, is not a JSON object, or is not sent as `application/json` | 422 | `VALIDATION_ERROR` | omitted |
| A query parameter or body property rejected by the framework | 422 | `VALIDATION_ERROR` | keyed by the contract property name (never a framework path such as `body.note`); locations with no contract name are omitted |
| Unknown route | 404 | `NOT_FOUND` | omitted |
| Known route, unsupported method | 405 + `Allow` header | `NOT_FOUND` | omitted |
| Unhandled exception | 500 | `SERVICE_UNAVAILABLE` | omitted |

The 500 message is generic (never a stack trace, SQL, file path or exception text), every write is in one transaction that is rolled back, and the failure is logged server-side without credentials. The code set is deliberately unchanged: adding `METHOD_NOT_ALLOWED` or `INTERNAL_ERROR` codes would change the frontend `ServiceErrorCode` union, which this correction does not touch; 405 and 500 never occur through the SPA's adapter.

### Evaluation order

When more than one rule applies, the first match decides the response. This makes behavior deterministic and testable.

| Step | Mutations `approve`, `reject`, `cancel`, `checkout`, `return` |
| --- | --- |
| 1 | 401 no valid session |
| 2 | 403 wrong role (staff routes), even for an unknown id |
| 2b | 422 request envelope: the body is not parseable JSON, not a JSON object, or not `application/json` (no `fields`) |
| 3 | 404 unknown booking (any unknown or malformed id), or a booking a student does not own |
| 4 | 422 `expectedVersion` missing or not a strict integer from 1 to 2147483647 |
| 5 | 409 `expectedVersion` differs from the stored version (stale) |
| 6 | 409 the current state does not allow the action (invalid, repeated, terminal) |
| 7 | 422 `note` invalid (reject, checkout, return): missing, not a string, or not 3-500 characters after trimming |
| 8 | 409 time or custody rule (approve after the end date, checkout outside the booked days, unit still on loan) |

Authentication and authorization come first even for a malformed body. **A declarative limit on `note` in the request model must not pre-empt steps 5 and 6**: a stale or impossible request with an invalid note is 409 (the QA-passed mock checks the state before the note), so `note` is validated by hand at step 7, and the body model accepts any value for it. The same goes for `expectedVersion`: the model must not reject it before steps 2 (403) and 3 (404) have run. The version, state and rule checks (steps 5-8) and the commit are one atomic unit (see [Concurrency](#concurrency-and-atomic-outcomes)).

Other operations (the request-envelope 422 of step 2b comes right after 401/403 in all of them): `requestBooking` is 401, then 422 (`assetId`, dates, purpose, all reported together), then 404 (a well-formed unknown `assetId`), then 409 (maintenance, then day conflicts). `addAsset` is 401, 403, 422, 409. `editAsset` and `setAssetState` are 401, 403, 404, then 422, then 409. `login` is 422 before credentials are checked.

## Roles, ownership and privacy

| Actor | May |
| --- | --- |
| Visitor (no token) | `listAssets`, `getAsset`, `getAssetAvailability`, `register`, `login` |
| Student | the above plus `currentUser`, `logout`, `requestBooking`, `listBookings` and `getBooking`/`cancelBooking` for **own** bookings |
| Coordinator | everything a student can, plus `getBooking`/`cancelBooking` for any booking and all `/api/v1/staff/*` operations |

* **Non-owner policy: 404.** A student reading or cancelling another student's booking receives exactly the same 404 `NOT_FOUND` (status, code and message) as for an id that does not exist, so existence is never disclosed. 403 is not used for private records. Anonymous callers get 401 first. Staff routes are 403 for students regardless of whether the id exists.
* `listBookings` returns only the caller's own bookings, even for a coordinator; the desk is `listStaffBookings`. `Booking`/`events` are visible only to the owner and coordinators. The borrower's username (`StaffBooking.borrower`) is exposed only on staff routes.
* **Anonymous availability** contains only `assetId`, `today`, `horizonEnd`, `timeZone` and 91 `{date, state}` pairs (`available`, `occupied`, `maintenance`). It has no borrower, purpose, note, booking id, version or count. Public `Asset` data has no version either, and no client asset-version precondition exists.
* Inventory edits and state switches never rewrite existing bookings, their `assetName` snapshots or events.

## Booking state machine

| Action | From | To | Actor | Extra rules |
| --- | --- | --- | --- | --- |
| `approve` | `pending` | `approved` | coordinator | end date has not passed; reserved days stay reserved |
| `reject` | `pending` | `rejected` | coordinator | trimmed 3-500 character reason; releases reserved days |
| `cancel` | `pending`, `approved` | `cancelled` | owner or coordinator | releases reserved days |
| `checkout` | `approved` | `checked_out` | coordinator | trimmed 3-500 character outgoing condition; today within the inclusive booked range; no active loan on the asset |
| `return` | `checked_out` | `returned` | coordinator | trimmed 3-500 character incoming condition; allowed when overdue; removes the active loan and releases days |

Every other pair is a 409 and leaves the record unchanged; `rejected`, `cancelled` and `returned` are terminal. `overdue` is derived (`checked_out` and `endDate` before today in `Asia/Almaty`), never stored. An existing overdue active loan blocks checkout of a later approved booking of the same unit even when the scheduled days do not overlap. The same table is machine-readable as `x-transitions` on the `BookingState` schema.

Each `create` and every successful transition writes exactly one immutable `BookingEvent` (`id`, `bookingId`, `actorId`, `action`, `priorState` (`null` only for `create`), `newState`, UTC `timestamp`, `note`) in the same transaction as the state change. The actor is always the authenticated caller; the event `id` is opaque and unique (the mock's `<bookingId>-<action>` format is not contractual); `timestamp` is the server's UTC commit time. The exact per-action shape is pinned here and machine-readably as `x-events` on the `BookingEvent` schema:

| `action` | `actorId` | `priorState` -> `newState` | `note` |
| --- | --- | --- | --- |
| `create` | the owner | `null` -> `pending` | the trimmed `purpose` |
| `approve` | a coordinator | `pending` -> `approved` | exactly `Reservation approved.` |
| `reject` | a coordinator | `pending` -> `rejected` | the trimmed rejection reason |
| `cancel` | the owner or a coordinator | `pending` or `approved` (the state before) -> `cancelled` | exactly `Reservation cancelled; reserved dates released.` |
| `checkout` | a coordinator | `approved` -> `checked_out` | the trimmed outgoing condition |
| `return` | a coordinator | `checked_out` -> `returned` | the trimmed incoming condition |

The two system sentences are contractual text (clients show them in the timeline), not free wording.

### Staff desk counts

`StaffDesk.counts` and `StaffBooking.overdue` are computed from the same snapshot as `bookings`, with `today` the `Asia/Almaty` date reported in the same response:

| Field | Definition |
| --- | --- |
| `counts.pending` | number of bookings in state `pending`, from every user and **regardless of their dates**; a pending request whose end date has passed still counts until it is rejected or cancelled (it can no longer be approved) |
| `counts.dueToday` | number of `checked_out` bookings whose `endDate == today` |
| `counts.overdue` | number of `checked_out` bookings whose `endDate < today`; always equal to the number of rows with `overdue: true` |
| `StaffBooking.overdue` | `state == checked_out` and `endDate < today` (derived, never stored); other states are never overdue |
| `StaffBooking.currentlyOnLoan` | some booking of the same asset is `checked_out`, regardless of dates |

## Concurrency and atomic outcomes

* **Version.** Every private `Booking` snapshot (owner list and detail, and `StaffBooking` results) has a required positive integer `version`: 1 when created and exactly +1 for each successful approve, reject, cancel, checkout and return. Because each of those also writes one event, `version == events.length`.
* **Precondition.** The five mutations require `expectedVersion`, the `version` of the exact snapshot the user acted on. Missing or invalid is 422 `VALIDATION_ERROR` (`fields.expectedVersion`); a valid integer that differs from the stored version is 409 `CONFLICT`. After authorization and privacy checks, the version and the allowed state are compared **atomically with the mutation**. The server never substitutes the current version, and the client never retries a stale request or silently fetches a fresh version: the UI shows the conflict and the user re-reads before acting again.
* **Race example.** Two actors observe a pending booking at version 1. If the coordinator approves first (approved, version 2), the owner's cancellation sent with version 1 is 409 and nothing changes; cancelling from the freshly observed approved version 2 is allowed and yields cancelled, version 3. If the owner cancels first (cancelled, version 2), the coordinator's approval sent with version 1 is 409 and the booking stays cancelled. Both orderings are verified against the mock in `frontend/tests/versioning.test.mjs`.
* **`requestBooking` is atomic:** the booking (version 1), its `create` event and one reservation slot per requested day are written in one transaction. If any day is taken, the whole request fails with 409 and `unavailableDates`, leaving no booking, event or stranded slot. Two simultaneous overlapping requests for one unit produce exactly one 201 and one 409; different units and non-overlapping ranges are independent. Pending, approved and checked-out bookings reserve their days; rejected, cancelled and returned bookings release them.
* **Transitions are atomic:** the state change, version increment, event and slot/active-loan changes commit together or not at all. `cancel` and `reject` release every day, `return` removes the active loan, `checkout` creates it.
* **Active loan.** At most one active loan exists per asset. Simultaneous checkouts of one unit create at most one; a second checkout is 409 while the unit is on loan, including an overdue loan.
* **Maintenance.** Switching to `maintenance` is 409 (nothing changes) while the unit has a checked-out booking or any pending/approved booking with `endDate >= today`; staff first reject, cancel or return those. The maintenance switch and `requestBooking` serialize on the same asset availability state: when they race exactly one commits and the other rechecks, so a unit can never be left in maintenance with a newly committed booking. Maintenance units refuse new requests and show every day as `maintenance` publicly.
* The memory-adapter lock (#9/#10) and database uniqueness/transactions (#11/#12) are the implementations; this contract states only the observable result. The browser mock demonstrates deterministic semantics, not server locking.

## Notes for the backend stories (#7-#10) and the HTTP wiring (#13)

These are consequences of the contract that a framework's defaults would get wrong; each is verified by an experiment or by the contract tests, not assumed.

1. **Order versus FastAPI body validation.** A typed request-body parameter makes FastAPI validate (and decode) the body itself. Experiments with FastAPI 0.146 showed that an unauthenticated request with a body that merely has the wrong shape still gets 401 (dependencies run first), but an unauthenticated request whose body is not parseable JSON gets 422, because the JSON is decoded before dependencies run; and a declarative `note: constr(min_length=3)` turns "stale version + bad note" into 422 where the contract requires 409. So the five booking mutations (and `requestBooking`, `addAsset`, `editAsset`, `setAssetState`) take the `Request`, authenticate and authorize through dependencies, then parse the body by hand and apply the documented order. Body models, if used at all, are lenient (every field optional, `Any`) and the real checks run in the order of the [evaluation order](#evaluation-order) table.
2. **Exception handlers.** Register handlers for `RequestValidationError`, Starlette's `HTTPException` (404, 405 and the like) and `Exception`; their bodies are `Error`, never `{"detail": ...}`. See [Framework-generated and unexpected errors](#framework-generated-and-unexpected-errors).
3. **Trimming.** Strip `x-trimmed` fields first (see the character set above), validate the trimmed value, store and return the trimmed value, lowercase usernames, uppercase inventory codes, and never trim `password`. A model generated from the schema (`constr(pattern=...)`) drops the trimming, so do not rely on a generated model for these fields.
4. **Strict integers.** Use a strict integer check for `expectedVersion` (`true` and `"2"` must be 422).
5. **Ids.** Unknown path ids, however malformed, are 404 (do not declare `max_length` on path parameters); a malformed body `assetId` is 422 `fields.assetId`.

### Prerequisites for the HTTP wiring (#13), outside the wire contract

* **CORS or a development proxy.** The contract server is `http://127.0.0.1:8000` and the SPA's development server is `http://127.0.0.1:5173`, which are different origins, and the `Authorization` header makes every call non-simple. #13 must either allow exactly the SPA origin (methods `GET, POST, PUT, OPTIONS`, headers `Authorization, Content-Type`, no wildcard with credentials) or use a Vite development proxy so the SPA calls a same-origin `/api`. Neither exists today; the mock makes no network calls.
* **Time-zone database.** `Asia/Almaty` is UTC+5 only with tzdata 2024a or newer (the zone moved from UTC+6 on 2024-03-01). Every rule about "today" depends on it, so the first backend story that computes the club date (#8) must add `tzdata>=2024a` to the locked backend dependencies (a slim container image has no system database) and test that `zoneinfo.ZoneInfo('Asia/Almaty')` is UTC+5 for a 2026 date; #13 re-checks it in the deployed environment.

## Frontend types and the contract

`frontend/src/services/types.ts` is the single source of the DTO shapes. `openapi.yml` mirrors them field for field (names, required, nullable, enums, error codes), plus the wire-only `Session`. Differences that are intentional:

* `ServiceError.status` is not in the JSON body (the status line carries it).
* `Session` exists only on the wire; services return `User`.
* `ServiceResult<T>` (`{ok, data}` / `{ok:false, error}`) is a client-side wrapper; HTTP uses status codes.
* `currentUser(): User | null` maps from 401/no-token as described above; nullable `Booking` events field `priorState` and `CatalogueResult.range` are `null` in JSON.

## Not in this contract

Pagination, rate limiting, deployment hardening (#22), account recovery and SSO, password change, email/SMS, file uploads, waitlists (#21), QR handover (#23) and any public asset version. They are post-MVP or deployment concerns, not omissions to be guessed by implementers. CORS and the time-zone database are *not* post-MVP: they are prerequisites listed next.

## Verification and change control

* `cd backend && uv run --locked pytest` runs `tests/test_openapi_contract.py`: the real `openapi-spec-validator` (locked dev dependency), the operation/service-method mapping, the status and shared-response wiring of every operation, schema-versus-TypeScript field comparisons, validated examples, absence of password/hash fields, and validation of every mock-generated sample. `tests/test_openapi_guards.py` adds YAML-authoring guards that need no external linter: no duplicate keys, no empty (implicit-null) values, no unknown schema keywords, complete descriptions, and **every** `example`/`examples` value (media types, parameters, headers, schemas) validated against its own schema exactly as written, with no implicit trimming.
* The contract is additionally linted by hand with tools that are **not** repository dependencies: `npx --yes @redocly/cli@1.34.5 lint openapi.yml` and `npx --yes @stoplight/spectral-cli@6.14.3 lint openapi.yml --ruleset <file extending spectral:oas>`. Both must report 0 errors; the exact remaining warnings and results are in `evidence.md`.
* `cd frontend && npm test` runs `tests/contract.test.mjs`, `tests/versioning.test.mjs` and `tests/contract-decisions.test.mjs` (ids, event shape and system notes, desk counts), including a check that `tests/fixtures/contract-samples.json` equals what the mock produces now.
* To change the contract: edit `openapi.yml`, this file, `types.ts` and the mock together, regenerate samples with `cd frontend && node tests/contract-samples.mjs --write`, review the diff, and run both suites. Do not weaken a rule in one place only.
