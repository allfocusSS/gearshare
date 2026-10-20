# HTTP API notes

Companion to the versioned contract [`openapi.yml`](../openapi.yml) (OpenAPI 3.1.0, `info.version` 1.0.0), the Iteration 2 deliverable of [#6](https://github.com/allfocusSS/gearshare/issues/6). The contract was derived from the completed, independently QA-passed standalone mock (#2-#5, #24-#28): the `GearShareService` interface and DTOs in `frontend/src/services/types.ts` and the behavior of `mockService.ts`. **No backend implements it yet.** Only `GET /health` is served today; the memory API (#7-#10), SQLite persistence (#11-#12) and the frontend HTTP adapter (#13-#14) are later stages that must conform to this document and to `openapi.yml`. If they find a defect in the contract, correct `openapi.yml`, this file, `types.ts`, the mock and the samples together (see [Verification and change control](#verification-and-change-control)).

## Service method to HTTP operation

All business routes live under `/api/v1`. Every operation in `openapi.yml` carries `x-service-method` (the exact `GearShareService` method, also its `operationId`) and `x-access`. `GET /health` is infrastructure and has no service method. Success statuses are in the third column; every operation can also answer `503`.

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
* **Text trimming.** Properties marked `x-trimmed: true` are trimmed of outer whitespace by the server first. The pattern and length limits below apply to the trimmed value, and the trimmed value is what is stored and returned. (JSON Schema cannot express "trim then check", so schema validators must trim these fields before validating a request.)
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

Every error uses the shared `Error` schema: `{ code, message, unavailableDates?, fields? }`. `code` is exactly the frontend `ServiceErrorCode` union; the HTTP status is carried by the status line, and the adapter copies it into `ServiceError.status`. `message` is safe to show. Errors never contain another user's name, purpose, booking id or other private data.

| HTTP status | `code` | Meaning |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | No valid session (also the response of `currentUser`/`logout` without one) |
| 401 | `INVALID_CREDENTIALS` | Wrong username or password at `login` |
| 403 | `FORBIDDEN` | Valid session, role is not a coordinator |
| 404 | `NOT_FOUND` | Unknown asset, or an unknown/not-visible booking |
| 409 | `CONFLICT` | Date conflict, stale `expectedVersion`, transition not allowed, time/custody rule, duplicate inventory code, maintenance blocked |
| 409 | `USERNAME_TAKEN` | Normalized duplicate username at `register` |
| 422 | `VALIDATION_ERROR` | A documented field rule failed; `fields` names each field |
| 503 | `SERVICE_UNAVAILABLE` | The service cannot answer (also used by the frontend for network failures) |

* `fields` keys are the offending request properties: `username`, `password`, `startDate`, `endDate`, `category`, `purpose`, `note`, `name`, `inventoryCode`, `location`, `description`, `state`, `expectedVersion`.
* `unavailableDates` appears only on the `requestBooking` 409: the requested days already held by a pending, approved or checked-out booking of that unit, ascending, with no identities. It is an empty array when the conflict is that the unit is in maintenance.
* A **stale-version** 409 carries `fields.expectedVersion`; an ordinary invalid-transition or business-rule 409 carries no `fields`, so clients can tell "someone changed this" from "this action is not possible".
* A failed request changes nothing: no state, version, timestamp, event, reserved day, active loan, inventory record or session.

### Evaluation order

When more than one rule applies, the first match decides the response. This makes behavior deterministic and testable.

| Step | Mutations `approve`, `reject`, `cancel`, `checkout`, `return` |
| --- | --- |
| 1 | 401 no valid session |
| 2 | 403 wrong role (staff routes), even for an unknown id |
| 3 | 404 unknown booking, or a booking a student does not own |
| 4 | 422 `expectedVersion` missing or not an integer from 1 to 2147483647 |
| 5 | 409 `expectedVersion` differs from the stored version (stale) |
| 6 | 409 the current state does not allow the action (invalid, repeated, terminal) |
| 7 | 422 `note` invalid (reject, checkout, return) |
| 8 | 409 time or custody rule (approve after the end date, checkout outside the booked days, unit still on loan) |

Other operations: `requestBooking` is 401, then 422 (dates, purpose), then 404 (unknown asset), then 409 (maintenance, then day conflicts). `addAsset` is 401, 403, 422, 409. `editAsset` and `setAssetState` are 401, 403, 404, then 422, then 409. `login` is 422 before credentials are checked.

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

Each `create` and every successful transition writes exactly one immutable `BookingEvent` (`id`, `bookingId`, `actorId`, `action`, `priorState` (`null` only for `create`), `newState`, UTC `timestamp`, `note`). The actor is always the authenticated caller; `note` is the purpose for `create`, the trimmed note for reject/checkout/return and a fixed system sentence for approve/cancel.

## Concurrency and atomic outcomes

* **Version.** Every private `Booking` snapshot (owner list and detail, and `StaffBooking` results) has a required positive integer `version`: 1 when created and exactly +1 for each successful approve, reject, cancel, checkout and return. Because each of those also writes one event, `version == events.length`.
* **Precondition.** The five mutations require `expectedVersion`, the `version` of the exact snapshot the user acted on. Missing or invalid is 422 `VALIDATION_ERROR` (`fields.expectedVersion`); a valid integer that differs from the stored version is 409 `CONFLICT`. After authorization and privacy checks, the version and the allowed state are compared **atomically with the mutation**. The server never substitutes the current version, and the client never retries a stale request or silently fetches a fresh version: the UI shows the conflict and the user re-reads before acting again.
* **Race example.** Two actors observe a pending booking at version 1. If the coordinator approves first (approved, version 2), the owner's cancellation sent with version 1 is 409 and nothing changes; cancelling from the freshly observed approved version 2 is allowed and yields cancelled, version 3. If the owner cancels first (cancelled, version 2), the coordinator's approval sent with version 1 is 409 and the booking stays cancelled. Both orderings are verified against the mock in `frontend/tests/versioning.test.mjs`.
* **`requestBooking` is atomic:** the booking (version 1), its `create` event and one reservation slot per requested day are written in one transaction. If any day is taken, the whole request fails with 409 and `unavailableDates`, leaving no booking, event or stranded slot. Two simultaneous overlapping requests for one unit produce exactly one 201 and one 409; different units and non-overlapping ranges are independent. Pending, approved and checked-out bookings reserve their days; rejected, cancelled and returned bookings release them.
* **Transitions are atomic:** the state change, version increment, event and slot/active-loan changes commit together or not at all. `cancel` and `reject` release every day, `return` removes the active loan, `checkout` creates it.
* **Active loan.** At most one active loan exists per asset. Simultaneous checkouts of one unit create at most one; a second checkout is 409 while the unit is on loan, including an overdue loan.
* **Maintenance.** Switching to `maintenance` is 409 (nothing changes) while the unit has a checked-out booking or any pending/approved booking with `endDate >= today`; staff first reject, cancel or return those. The maintenance switch and `requestBooking` serialize on the same asset availability state: when they race exactly one commits and the other rechecks, so a unit can never be left in maintenance with a newly committed booking. Maintenance units refuse new requests and show every day as `maintenance` publicly.
* The memory-adapter lock (#9/#10) and database uniqueness/transactions (#11/#12) are the implementations; this contract states only the observable result. The browser mock demonstrates deterministic semantics, not server locking.

## Frontend types and the contract

`frontend/src/services/types.ts` is the single source of the DTO shapes. `openapi.yml` mirrors them field for field (names, required, nullable, enums, error codes), plus the wire-only `Session`. Differences that are intentional:

* `ServiceError.status` is not in the JSON body (the status line carries it).
* `Session` exists only on the wire; services return `User`.
* `ServiceResult<T>` (`{ok, data}` / `{ok:false, error}`) is a client-side wrapper; HTTP uses status codes.
* `currentUser(): User | null` maps from 401/no-token as described above; nullable `Booking` events field `priorState` and `CatalogueResult.range` are `null` in JSON.

## Not in this contract

Pagination, rate limiting, CORS and deployment hardening (#22), account recovery and SSO, password change, email/SMS, file uploads, waitlists (#21), QR handover (#23) and any public asset version. They are post-MVP or deployment concerns, not omissions to be guessed by implementers.

## Verification and change control

* `cd backend && uv run --locked pytest` runs `tests/test_openapi_contract.py`: the real `openapi-spec-validator` (locked dev dependency), the operation/service-method mapping, documented error statuses, schema-versus-TypeScript field comparisons, validated examples, absence of password/hash fields, and validation of every mock-generated sample.
* `cd frontend && npm test` runs `tests/contract.test.mjs` and `tests/versioning.test.mjs`, including a check that `tests/fixtures/contract-samples.json` equals what the mock produces now.
* To change the contract: edit `openapi.yml`, this file, `types.ts` and the mock together, regenerate samples with `cd frontend && node tests/contract-samples.mjs --write`, review the diff, and run both suites. Do not weaken a rule in one place only.
