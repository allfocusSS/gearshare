# GearShare design direction and references

Current stage: see the [current gate record](iterations.md#current-stage). Historical entries below retain their point-in-time results.

## Reference board

Public reference pages were opened on 2026-10-19. These are references, not licensed asset packs; do not copy their logos, screenshots or proprietary imagery into the shipped product.

| Reference | Specific direction for GearShare |
| --- | --- |
| [Linear product/features](https://linear.app/features) | Use a restrained navigation rail, dense but legible staff rows, subtle separators and an inspector-style booking detail. Reference product UI rather than reproducing its marketing page. |
| [Cal.com scheduling](https://cal.com/) | Use an explicit month calendar, clear selected/unavailable states, date context next to the booking form and a visible timezone label. Adapt to whole-day equipment reservations. |

These references are deliberately translated into the exact component specifications below, so the engineer can implement a coherent UI without guessing what “modern” means.

## Visual direction

An editorial equipment desk: warm white canvas, dark ink text, cobalt actions, fine grey borders and compact object illustrations. Equipment and calendar availability are the focus. Desktop uses a 224 px rail and a content canvas with a maximum reading width of 1,200 px. Use a self-contained system sans-serif stack; no runtime font/CDN dependency.

| Token | Value |
| --- | --- |
| Canvas | `#F6F5F2` |
| Surface | `#FFFFFF` |
| Ink | `#17202A` |
| Secondary text | `#52606D` |
| Divider | `#DCE0E3` |
| Accent | `#2446D8` |
| Positive text / background | `#14633C` / `#E8F5ED` |
| Pending text / background | `#805016` / `#FFF3D6` |
| Destructive text / background | `#A12A2A` / `#FDECEC` |

Spacing: 4, 8, 12, 16, 24, 32 and 48 px. Cards radius 12 px; inputs 8 px. Body text 15–16 px, line height at least 1.45; headings 28–36 px. Primary action height at least 44 px. Focus ring 2 px cobalt with a visible offset. Verify contrast in the actual implementation; proposed tokens alone are not evidence of an accessibility pass.

## Screens

### Explore equipment

Rail: brand mark `G/`, Explore, My reservations and, for coordinators only, Coordinator desk / Inventory. Top bar: page title and signed-in account menu. Main area: a short introduction (“Good equipment. Shared fairly.”), search/category/date filter row, result count and card grid. No large decorative hero that pushes equipment below the fold.

Three columns at 1,100 px+, two at 720–1,099 px and one below 720 px. A card has a category-tinted illustration area, small inventory-code label, name, category, pickup location and text availability badge. The entire card has a clearly named link; primary booking action belongs on its detail page.

### Asset detail / request

At desktop width, show identity/specifications on the left and a bordered booking panel on the right. Include a month calendar and labeled start/end fields. Unavailable dates use a hatch or icon plus accessible text; selected dates use a cobalt outline and range fill. Show the exact inclusive duration and `Asia/Almaty` before submission.

On mobile, use a normal single-column flow. Booking errors appear next to the fields and in an accessible alert. On a race/conflict, preserve purpose and dates and update availability. A request confirmation shows the true server status, which begins as “Pending approval.”

The independently verified #3 scope implements asset identity/specifications, anonymous month calendar, labeled date alternatives, selected inclusive duration and scheduled-availability feedback. The independently verified #4/#25 behavior adds request/purpose controls, retained-form conflict/error feedback and private reservations/history/cancellation. Occupied days use a hatch plus × and accessible date/status text; maintenance is explicitly unavailable.

### My reservations

Tabs: Upcoming / History. Each row shows equipment, date range, status and the permitted action. Selecting the row opens detail and its ordered event timeline. Empty state has a real link back to Explore. Status text is always present; do not rely on colour.

### Coordinator desk

At the top, compact counts for pending, due today and overdue, computed from actual records. Below: Pending requests, Pickups and Active loans views. Staff actions use explicit labels: Approve, Reject, Check out, Record return. Destructive actions ask for a reason where specified; condition forms show the current booking and equipment identity. Do not hide actions behind hover-only UI.

### Inventory

Searchable table on desktop and labeled cards on mobile. Show code, asset, category, location and inventory state. Add/edit uses an accessible dialog or dedicated page. Maintenance conflicts show which staff action is required without exposing private data to students.

## Interaction and accessibility acceptance

The current auth form shows labels, requirement hints, associated field errors and a live form alert. During submission controls are disabled. After an async field failure settles, focus moves once to the first invalid enabled control; typing and ordinary rerenders must not steal it again. Form-level errors do not mark an arbitrary field invalid. This behavior was refined through the real #24 browser defect/QA regression loop; see evidence.md for FAIL and retest records.

- At 390 px and 1,440 px, no horizontal page overflow and all primary actions remain reachable.
- Form controls have visible labels; inline errors are associated with their controls.
- Dialogs have a name, initial focus, focus trap, Escape close and focus restoration.
- Keyboard users can reach every action. Calendars have a usable labeled date-input alternative.
- Async content has loading, empty, retryable error and success states. Respect reduced-motion settings.
- Member/private information is not rendered in public cards or availability responses.
- Use original CSS/SVG line illustrations or a clearly documented permissively licensed local icon set; do not hotlink arbitrary equipment photographs.

## Integrated hardening rules (#15)

PM decisions from the #15 integrated audit (defects #31–#38 and the related issues listed on #15). They derive from the #24 rule, the #5/#28 desk behavior and the wrapping already used on several screens. They are PM design decisions, not owner approvals; if the owner changes a threshold, the criteria of the open issues change with it.

### Focus after in-place actions

A browser drops focus when the focused control is disabled (a pending form) or removed. After any async action started from a control settles, `document.activeElement` is a deliberate, enabled, mounted control or heading of the current view, never `body`:

1. Field failure (a response with `fields`): the first invalid enabled control in DOM order, in every form including booking (Start date, End date, then purpose). This is the #24 rule, generalised.
2. Any other failure while the form or row stays on screen (409, network, server error, form-level auth error): the control that started the action, once re-enabled. A form-level auth failure therefore focuses the submit button and never a field, consistent with #24 (no field is marked invalid or force-focused).
3. Success: the initiating control keeps focus when it survives (a unit's maintenance toggle, "Request equipment"). When it is removed or its content changes, focus moves to the heading of the resulting panel or view: the reservation details heading, "Manage reservation", or the page `h1#main-content` when the route does not change (Sign out or Clear all filters on Explore).
4. Opening a panel, editor or action form in place moves focus to its heading (`tabIndex=-1`), as the coordinator desk and inventory editor already do.
5. A 401 removes the form: focus goes to "Sign in again" in the session-ended alert, or to `h1#main-content` if the alert has no such link.

Focus is restored once per settled action. It is not reclaimed on later renders or typing, nor when the user has already moved to another enabled control or navigated to another route. Messages keep `role="status"` or `role="alert"`; focus never replaces them.

### User-entered text wrapping

Names, descriptions, locations, purposes, notes, usernames, inventory codes and borrower names are typed by people and can be one long unbroken string. They wrap at any character inside their container (`overflow-wrap: anywhere`; flex and grid children also need `min-width: 0`) on every screen. Never truncate with an ellipsis, clip, shrink the text or let the page or a card scroll sideways. This extends what the staff tables, account name, specs and reservation details already do. Worst case to hold at 390 px and 1,440 px: the plan.md maximums made of wide unbroken characters (a 100 × `W` name, a 100-character location, a 2,000-character description without spaces).

### Minimum size for informational text

The type scale above fixes body text at 15–16 px but states no floor for secondary text, and the shipped stylesheet sets validation hints, status notices, badges, legends and identity lines at 8–11 px. Floor: text a user needs to complete a task, understand a state or identify a record computes to at least 12 px at 390 px and 1,440 px. 12 px is already the size of the labels, alerts and notices that passed QA. The floor covers field labels, hints and errors, form alerts and notices, pending and status text, status badges and pills, queue counts and their labels, date, time-zone and duration text, calendar legend and instructions, event times, and account, borrower, code and location text. Decorative or brand micro-copy may stay smaller: `aria-hidden` art text, `.brand small`, the sidebar note and foot, `.topbar-context`, `.page-footer`, `.catalogue-stamp`, and kicker `.eyebrow` lines that hold no data value (an eyebrow that shows a code, category or borrower is informational). The mock-only demo controls are exempt. The body and heading scale is unchanged, and the floor never justifies overflow: wrap, do not shrink.

### Calendar view after an availability refresh

Refreshing availability after a request, conflict or retry keeps the calendar on the month it was showing and shows the new data in place; it does not return to the current month. A different asset or a new page visit starts on the current month.

## Implementation brief for the UI agent

Read `plan.md` and this document. Build all student and coordinator flows using `GearShareService` and `mockService` only. Keep request/response shapes centralized and async. Show the real booking state machine and the specified calendar rules. Include mock error paths so failures can be exercised before a backend exists. Preserve this visual system when swapping the service adapter; changing storage must not redesign the UI.

## #5 implementation

Coordinator desk and inventory use warm canvas, cobalt actions and white bordered surfaces. Queue counts derive from records; Pending requests, Pickups, Active loans and History have explicit row actions. Desktop tables become labeled stacked cards below 720 px. Dedicated reservation/action and equipment form views provide named headings, associated errors, enabled-field focus after validation, disabled pending controls and return focus. There is no modal or focus-trap interaction. Status labels remain text; physical-custody and maintenance conflicts describe the required staff resolution.

Engineer browser verification and the independent QA handoff are recorded in evidence.md. The observed accessibility-text rendering defect #27 was corrected through its separate bug/PM/QA case loop. The shared visually-hidden utility preserves naming nodes while clipping their paint and normal layout contribution; it also applies to My reservations. Corrected focused screenshots/results are recorded; #27 and the full #5 mock gate have since passed independent QA and are closed.

## #28 coordinator desk recovery

After a staff command succeeds, retain its confirmed reservation state and event notes. The old desk snapshot becomes unavailable until a fresh staff read succeeds: hide queue rows, queue badges, summary counts and derived custody/overdue indicators, and withhold further staff actions. Do not replace unavailable information with zero counts or an empty queue.

A failed follow-up read shows an accessible “Action saved. The coordinator desk could not refresh.” alert with an explicit Refresh desk button. This unresolved read state survives Back and repeated/delayed retry failures. Refresh performs only a guarded desk read; one successful response replaces the complete snapshot and restores staff actions. Back returns focus to the original row when it survives, otherwise the queue controls or the surviving recovery control/desk heading. Actual command failures keep their separate error and entered-note recovery.
