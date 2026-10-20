# GearShare product specification

Current stage update (2026-10-20): independent QA passed and closed [#4](https://github.com/allfocusSS/gearshare/issues/4#issuecomment-6279522336), [#25](https://github.com/allfocusSS/gearshare/issues/25#issuecomment-6279464800) and [#26](https://github.com/allfocusSS/gearshare/issues/26), following #1–3/#24. The #5 coordinator/inventory mock candidate has passing engineer functional checks; the observed visual defect [#27](https://github.com/allfocusSS/gearshare/issues/27) is open before correction. Independent QA and the complete mock-stage gate remain pending. #6/OpenAPI and later stages remain gated. Historical entries below retain their recorded point-in-time results.

## Problem and target users

A student media club shares equipment through messages and spreadsheets. Students cannot reliably see which physical unit is free, two people can request the same item for the same day, and coordinators lose track of approvals, returns and condition notes.

GearShare is a single-club equipment lending web application. Students find an available physical asset and request it for a bounded date range. A coordinator approves it, hands it over and records its return. No payments, external university systems or paid AI APIs are required for the core workflow.

## Why this differs from Part I

Part I was StudyTrack, a private student assignment/deadline application. GearShare handles shared physical inventory, competing requests, staff authorization, transactional allocation, custody and returns. Its primary operation is reserving a scarce resource, not creating or completing tasks.

## Roles

| Role | Can do |
| --- | --- |
| Visitor | Browse public catalogue and anonymous occupied dates; register or sign in |
| Student | Visitor actions, request an asset, see only own booking details, cancel own pending/approved booking |
| Coordinator | Manage assets, view all bookings, approve/reject, check out/return, record condition and view audit history |

Registration always creates a student. Coordinator privileges cannot be selected through registration or the UI. A development seed command creates an initial coordinator with a password supplied through local configuration.

## Screens and primary journeys

1. **Explore:** category chips, search, date filters and equipment cards. A card shows the asset name, category, identifying code, pickup location and availability for selected dates.
2. **Asset detail:** specs, notes, availability calendar and a booking form. The form previews both inclusive dates and duration before submission.
3. **Sign in / register:** accessible forms with validation and an explicit return to the requested asset after authentication.
4. **My reservations:** upcoming/history filters, status, dates, visible cancellation and a detail view with event history.
5. **Coordinator desk:** pending queue, active loans, overdue items and upcoming approved pickups. Actions are attached to the relevant booking.
6. **Inventory:** add/edit equipment and switch active/maintenance state with dependency checks.

Primary demo: browse → select available dates → sign in → request → coordinator approves → checkout with condition → return with condition → history remains after server restart.

## MVP business rules

### Inventory and dates

- Each record represents exactly one physical unit, with a unique inventory code. Two cameras of the same model have distinct asset IDs.
- Categories: Cameras, Audio, Presentation and Accessories. Seed 8–12 fictional inventory records with original/local placeholder illustrations; do not imply university ownership.
- Booking dates are inclusive calendar dates interpreted in `Asia/Almaty`. Event timestamps are timezone-aware UTC.
- Let T be today's club-local date. Require `T <= start_date <= end_date <= T + 90 days` and an inclusive duration of 1–14 days.
- A booking for the same start/end day is valid. Another request for that same asset on that day conflicts. A booking starting on the following day does not conflict.
- Availability responses never reveal borrower names, booking purposes, private comments or booking IDs to visitors/other students.
- Maintenance assets cannot receive new requests. Switching an asset to maintenance is rejected while it has an active loan or any pending/approved booking ending today or later; staff must resolve those bookings first.

### Reservation allocation

- Pending, approved and checked-out bookings reserve their booked days.
- Allocate one unique `(asset_id, date)` slot for every day in the request in the same transaction as the booking and its initial event.
- Two simultaneous conflicting requests must produce exactly one successful booking and one useful conflict response. Validation in Python alone is insufficient.
- A conflict returns HTTP 409 and identifies unavailable dates without exposing another student's identity. Refresh the calendar and retain the submitted form values.
- Rejected and cancelled bookings release all allocated slots. Returned bookings release their slots; event history remains.
- Slot allocation failure rolls back the complete booking and event transaction. No partial booking or stranded slots may remain.

### Booking state machine

| Current state | Action | Actor | New state / conditions |
| --- | --- | --- | --- |
| pending | approve | Coordinator | approved; end date has not passed |
| pending | reject | Coordinator | rejected; require reason; release slots |
| pending / approved | cancel | Owner or coordinator | cancelled; release slots |
| approved | check out | Coordinator | checked_out; today is within booked range; require outgoing condition; atomically create a unique active loan per asset |
| checked_out | return | Coordinator | returned; require incoming condition; remove active loan and release slots |

All other transitions fail with 409 and leave the record unchanged. A student cannot alter another student's reservation and cannot perform staff actions. Terminal states have no outgoing transitions. Request bodies cannot overwrite state, ownership or audit fields.

An overdue indicator is derived when a booking is checked out and its end date is before the current local date. It is not an extra persisted booking state. Return remains allowed when overdue. An overdue active loan prevents a second physical checkout even when the originally reserved dates no longer overlap. Future availability is scheduled availability, not a guarantee against late returns; staff see that an item is currently on loan.

### Data quality and feedback

- Username: trim outer whitespace; require 3–30 ASCII letters, digits or underscore (`^[A-Za-z0-9_]{3,30}$`), then normalize to lowercase for storage/display and case-insensitive uniqueness. This #2 PM refinement must be used in the mock, eventual OpenAPI and HTTP/backend adapters.
- Password: 10–128 characters, stored only as a salted password hash. No password or hash in user API responses.
- Booking purpose: trim whitespace, require 5–500 characters.
- Condition/rejection notes: trim whitespace, require 3–500 characters.
- Asset name 2–100 characters; inventory code 2–30; location 2–100; description at most 2,000. The mock trims these values, stores codes in uppercase and checks code uniqueness case-insensitively.
- Loading, empty, error and success states exist for every async screen. Prevent accidental repeated form submission while a request is pending; server constraints still protect against races.
- On HTTP 401 the frontend clears the session and offers sign-in while preserving navigation context. A failed request must not display a success notification.

### Audit and access

Every create/transition action writes an immutable event containing booking ID, actor ID, action, prior/new state, timestamp and relevant note. Booking detail/events are visible only to the owner and coordinators. Staff inventory updates must not silently change existing bookings.

## Exclusions and post-MVP candidates

Payment/deposits, email/SMS reminders, QR scanning, file uploads, multi-club tenancy, waitlists, recommendations, external SSO and native mobile apps are not MVP. Publish explicit `post-mvp` issues for waitlists, reminders and QR handover so the boundary remains visible.

## Success criteria

- A new student completes the full request journey without instructions.
- A coordinator approves, checks out and returns that request using the UI.
- Conflicts, unauthorized access, invalid dates and invalid transitions produce correct visible errors.
- A submitted booking, its state and history survive a real backend process restart.
- All actual `mvp` and `user-test-bug` issues have independent QA PASS comments before QA closes them.
- The repository contains working source, locked dependencies, OpenAPI, process/design/role documents, real pre-code chat history, tests and reproducible verification evidence.
