"""Reusable, store-independent invariant auditor (#12).

The auditor is deliberately an independent oracle: it imports no application
service, repository or constant. It reads the *physical* state of either store
into one plain ``Snapshot`` (all rows, in storage order) and reports every
violation of the documented domain invariants:

* no duplicate (asset, day) slot, and slots exist exactly for the days of
  pending/approved/checked_out bookings (nothing for terminal bookings);
* every booking has exactly one leading ``create`` event and an event chain that
  matches its state and version (``version == number of events``);
* at most one active loan per asset, each matching a ``checked_out`` booking of
  that asset, and every ``checked_out`` booking holds its loan;
* no maintenance asset keeps a pending/approved commitment ending today or later
  or any checked_out booking;
* references (bookings -> users/assets, events -> bookings/actors, sessions ->
  users) resolve and user names/inventory codes are unique.

``read_sqlite`` opens its own connection, so it can run after any race, fault or
restart without sharing state with the repository under test.
"""

from dataclasses import dataclass, field
from datetime import date, timedelta

from sqlalchemy import create_engine, select
from sqlalchemy.pool import NullPool

RESERVING = frozenset({"pending", "approved", "checked_out"})
# action -> (allowed prior states, resulting state). Independent of app code.
TRANSITIONS = {
    "approve": (frozenset({"pending"}), "approved"),
    "reject": (frozenset({"pending"}), "rejected"),
    "cancel": (frozenset({"pending", "approved"}), "cancelled"),
    "checkout": (frozenset({"approved"}), "checked_out"),
    "return": (frozenset({"checked_out"}), "returned"),
}
STAFF_ACTIONS = frozenset({"approve", "reject", "checkout", "return"})
APPROVE_NOTE = "Reservation approved."
CANCEL_NOTE = "Reservation cancelled; reserved dates released."

DUPLICATE_SLOT = "duplicate-slot"
ORPHAN_SLOT = "slot-without-booking"
SLOT_ASSET_MISMATCH = "slot-asset-mismatch"
SLOT_OUTSIDE_RANGE = "slot-outside-booking-dates"
MISSING_SLOT = "reserving-booking-missing-slot"
TERMINAL_SLOT = "terminal-booking-holds-slot"
MISSING_CREATE = "booking-without-create-event"
CREATE_NOT_FIRST = "create-event-not-first-or-duplicated"
CHAIN_BROKEN = "event-chain-broken"
EVENT_STATE_MISMATCH = "last-event-state-differs-from-booking-state"
VERSION_MISMATCH = "version-differs-from-event-count"
ORPHAN_EVENT = "event-without-booking"
EVENT_CONTENT = "event-actor-or-contract-note-invalid"
EVENT_TIME = "event-time-order-or-booking-time-mismatch"
LOAN_DUPLICATE = "multiple-active-loans-for-asset"
LOAN_ORPHAN = "active-loan-without-booking"
LOAN_STATE = "active-loan-booking-not-checked-out"
LOAN_ASSET = "active-loan-asset-mismatch"
MISSING_LOAN = "checked-out-booking-without-active-loan"
MAINTENANCE_COMMITMENT = "maintenance-asset-with-live-commitment"
BOOKING_REFERENCE = "booking-reference-missing"
EVENT_REFERENCE = "event-actor-missing"
SESSION_REFERENCE = "session-user-missing"
DUPLICATE_USERNAME = "duplicate-username"
DUPLICATE_CODE = "duplicate-inventory-code"
BOOKING_DATES = "booking-dates-or-version-invalid"

ALL_CODES = frozenset({
    DUPLICATE_SLOT, ORPHAN_SLOT, SLOT_ASSET_MISMATCH, SLOT_OUTSIDE_RANGE, MISSING_SLOT, TERMINAL_SLOT,
    MISSING_CREATE, CREATE_NOT_FIRST, CHAIN_BROKEN, EVENT_STATE_MISMATCH, VERSION_MISMATCH, ORPHAN_EVENT,
    EVENT_CONTENT, EVENT_TIME, LOAN_DUPLICATE, LOAN_ORPHAN, LOAN_STATE, LOAN_ASSET, MISSING_LOAN,
    MAINTENANCE_COMMITMENT, BOOKING_REFERENCE, EVENT_REFERENCE, SESSION_REFERENCE, DUPLICATE_USERNAME,
    DUPLICATE_CODE, BOOKING_DATES,
})


@dataclass
class Snapshot:
    """Every row of both stores in storage order; lists, so duplicates are representable."""

    users: list[dict] = field(default_factory=list)
    sessions: list[dict] = field(default_factory=list)
    assets: list[dict] = field(default_factory=list)
    bookings: list[dict] = field(default_factory=list)
    events: list[dict] = field(default_factory=list)
    slots: list[dict] = field(default_factory=list)
    active_loans: list[dict] = field(default_factory=list)
    seeded_on: date | None = None
    # SQL only (memory has no such column): asset id -> availability_version.
    availability_versions: dict | None = None

    def booking(self, booking_id):
        return next(row for row in self.bookings if row["id"] == booking_id)

    def events_of(self, booking_id):
        return [row for row in self.events if row["booking_id"] == booking_id]

    def counts(self):
        return {name: len(getattr(self, name)) for name in ("users", "sessions", "assets", "bookings", "events", "slots", "active_loans")}


@dataclass(frozen=True)
class Violation:
    code: str
    detail: str

    def __str__(self):
        return f"{self.code}: {self.detail}"


def _plain(record):
    return {name: getattr(record, name) for name in record.__dataclass_fields__}


def read_memory(repository) -> Snapshot:
    """Physical state of the true memory adapter (unwraps test proxies)."""
    state = getattr(repository, "underlying", repository)._state
    return Snapshot(
        users=[_plain(row) for row in state.users.values()],
        sessions=[_plain(row) for row in state.sessions.values()],
        assets=[_plain(row) for row in state.assets.values()],
        bookings=[_plain(row) for row in state.bookings.values()],
        events=[_plain(row) for row in state.events.values()],
        slots=[_plain(row) for row in state.slots.values()],
        active_loans=[_plain(row) for row in state.active_loans.values()],
        seeded_on=state.seeded_on,
    )


def read_sqlite(url: str) -> Snapshot:
    """Read the database file through a fresh, independent engine/connection."""
    from app.models import (ActiveLoanModel, AssetModel, BookingEventModel, BookingModel,
                            ReservationSlotModel, SeedMarkerModel, SessionModel, UserModel)

    engine = create_engine(url, poolclass=NullPool, connect_args={"timeout": 30})
    try:
        with engine.connect() as connection:
            def rows(model, *order):
                table = model.__table__
                keep = [column for column in table.columns if column.name not in {"storage_order", "inventory_code_key", "availability_version"}]
                query = select(*keep).order_by(*(order or table.primary_key.columns))
                return [dict(row._mapping) for row in connection.execute(query)]

            assets = rows(AssetModel, AssetModel.storage_order)
            versions = {row.id: row.availability_version for row in connection.execute(select(AssetModel.id, AssetModel.availability_version))}
            marker = connection.execute(select(SeedMarkerModel.seeded_on)).scalar()
            return Snapshot(
                users=rows(UserModel, UserModel.id), sessions=rows(SessionModel, SessionModel.token_hash), assets=assets,
                bookings=rows(BookingModel, BookingModel.storage_order), events=rows(BookingEventModel, BookingEventModel.storage_order),
                # Table order, not a sort, so rebuilt scratch tables stay readable.
                slots=rows(ReservationSlotModel, ReservationSlotModel.asset_id, ReservationSlotModel.day, ReservationSlotModel.booking_id),
                active_loans=rows(ActiveLoanModel, ActiveLoanModel.asset_id, ActiveLoanModel.booking_id),
                seeded_on=marker, availability_versions=versions,
            )
    finally:
        engine.dispose()


def read_store(store) -> Snapshot:
    """Snapshot of a repository: the file for SQL, the maps for memory."""
    inner = getattr(store, "underlying", store)
    engine = getattr(inner, "engine", None)
    if engine is not None:
        return read_sqlite(engine.url.render_as_string(hide_password=False))
    return read_memory(inner)


def audit(snapshot: Snapshot, today: date) -> list[Violation]:
    """Return every violated invariant; an empty list means the state is coherent."""
    found: list[Violation] = []

    def flag(code, detail):
        found.append(Violation(code, detail))

    users = {row["id"]: row for row in snapshot.users}
    assets = {row["id"]: row for row in snapshot.assets}
    bookings = {row["id"]: row for row in snapshot.bookings}

    seen = {}
    for row in snapshot.users:
        if row["username"] in seen or row["username"] != row["username"].strip().lower():
            flag(DUPLICATE_USERNAME, f"username {row['username']!r} is duplicated or not normalized")
        seen[row["username"]] = row["id"]
    codes = {}
    for row in snapshot.assets:
        key = row["inventory_code"].upper()
        if key in codes:
            flag(DUPLICATE_CODE, f"inventory code {key!r} identifies {codes[key]} and {row['id']}")
        codes[key] = row["id"]
    for row in snapshot.sessions:
        if row["user_id"] not in users:
            flag(SESSION_REFERENCE, f"session of unknown user {row['user_id']}")

    # --- bookings: references, dates, versions
    for row in snapshot.bookings:
        if row["user_id"] not in users or row["asset_id"] not in assets:
            flag(BOOKING_REFERENCE, f"booking {row['id']} references a missing user or asset")
        if row["end_date"] < row["start_date"] or row["version"] < 1:
            flag(BOOKING_DATES, f"booking {row['id']} has invalid dates or version {row['version']}")

    # --- slots: uniqueness and exact correspondence with reserving bookings
    slot_keys = {}
    for slot in snapshot.slots:
        key = slot["asset_id"], slot["day"]
        if key in slot_keys:
            flag(DUPLICATE_SLOT, f"{key[0]} {key[1]} appears more than once")
        slot_keys.setdefault(key, []).append(slot["booking_id"])
        owner = bookings.get(slot["booking_id"])
        if owner is None:
            flag(ORPHAN_SLOT, f"slot {key} references unknown booking {slot['booking_id']}")
            continue
        if owner["asset_id"] != slot["asset_id"]:
            flag(SLOT_ASSET_MISMATCH, f"slot {key} belongs to a booking of {owner['asset_id']}")
        if not owner["start_date"] <= slot["day"] <= owner["end_date"]:
            flag(SLOT_OUTSIDE_RANGE, f"slot {key} lies outside {owner['start_date']}..{owner['end_date']}")
        if owner["state"] not in RESERVING:
            flag(TERMINAL_SLOT, f"{owner['state']} booking {owner['id']} still holds slot {key}")
    for row in snapshot.bookings:
        if row["state"] not in RESERVING:
            continue
        days = (row["end_date"] - row["start_date"]).days + 1 if row["end_date"] >= row["start_date"] else 0
        for offset in range(days):
            key = row["asset_id"], row["start_date"] + timedelta(days=offset)
            if row["id"] not in slot_keys.get(key, ()):
                flag(MISSING_SLOT, f"{row['state']} booking {row['id']} lacks slot {key}")

    # --- events: one create first, chain consistent with state and version
    grouped: dict[str, list[dict]] = {}
    for event in snapshot.events:
        if event["booking_id"] not in bookings:
            flag(ORPHAN_EVENT, f"event {event['id']} references unknown booking {event['booking_id']}")
            continue
        grouped.setdefault(event["booking_id"], []).append(event)
        if event["actor_id"] not in users:
            flag(EVENT_REFERENCE, f"event {event['id']} has unknown actor {event['actor_id']}")
    for row in snapshot.bookings:
        chain = grouped.get(row["id"], [])
        if not chain:
            flag(MISSING_CREATE, f"booking {row['id']} has no events")
            continue
        creates = [index for index, event in enumerate(chain) if event["action"] == "create"]
        if creates != [0]:
            flag(CREATE_NOT_FIRST, f"booking {row['id']} create events at positions {creates}")
        first = chain[0]
        if first["action"] == "create" and (first["prior_state"] is not None or first["new_state"] != "pending"
                                             or first["actor_id"] != row["user_id"]):
            flag(EVENT_CONTENT, f"booking {row['id']} create event is not owner null->pending")
        state = "pending" if first["action"] == "create" else None
        for event in chain[1:]:
            rule = TRANSITIONS.get(event["action"])
            if rule is None or event["prior_state"] != state or event["prior_state"] not in rule[0] or event["new_state"] != rule[1]:
                flag(CHAIN_BROKEN, f"booking {row['id']} event {event['action']} {event['prior_state']}->{event['new_state']} after state {state}")
            else:
                actor = users.get(event["actor_id"])
                if event["action"] in STAFF_ACTIONS and (actor is None or actor["role"] != "coordinator"):
                    flag(EVENT_CONTENT, f"booking {row['id']} {event['action']} by a non-coordinator")
                if event["action"] == "approve" and event["note"] != APPROVE_NOTE:
                    flag(EVENT_CONTENT, f"booking {row['id']} approve note differs from the contract text")
                if event["action"] == "cancel":
                    if event["note"] != CANCEL_NOTE:
                        flag(EVENT_CONTENT, f"booking {row['id']} cancel note differs from the contract text")
                    if actor is None or (actor["role"] != "coordinator" and actor["id"] != row["user_id"]):
                        flag(EVENT_CONTENT, f"booking {row['id']} cancelled by a stranger")
            state = event["new_state"]
        if chain[-1]["new_state"] != row["state"]:
            flag(EVENT_STATE_MISMATCH, f"booking {row['id']} is {row['state']} but its last event ends in {chain[-1]['new_state']}")
        if row["version"] != len(chain):
            flag(VERSION_MISMATCH, f"booking {row['id']} version {row['version']} but {len(chain)} events")
        stamps = [event["timestamp"] for event in chain]
        if stamps != sorted(stamps) or stamps[0] != row["created_at"] or stamps[-1] != row["updated_at"]:
            flag(EVENT_TIME, f"booking {row['id']} event timestamps do not match created/updated times")

    # --- custody
    loans = {}
    for loan in snapshot.active_loans:
        if loan["asset_id"] in loans:
            flag(LOAN_DUPLICATE, f"asset {loan['asset_id']} has more than one active loan")
        loans.setdefault(loan["asset_id"], []).append(loan["booking_id"])
        owner = bookings.get(loan["booking_id"])
        if owner is None:
            flag(LOAN_ORPHAN, f"active loan of {loan['asset_id']} references unknown booking {loan['booking_id']}")
            continue
        if owner["asset_id"] != loan["asset_id"]:
            flag(LOAN_ASSET, f"active loan of {loan['asset_id']} references a booking of {owner['asset_id']}")
        if owner["state"] != "checked_out":
            flag(LOAN_STATE, f"active loan of {loan['asset_id']} references a {owner['state']} booking")
    checked_out = [row for row in snapshot.bookings if row["state"] == "checked_out"]
    for row in checked_out:
        if row["id"] not in loans.get(row["asset_id"], ()):
            flag(MISSING_LOAN, f"checked_out booking {row['id']} holds no active loan")
    per_asset = {}
    for row in checked_out:
        per_asset.setdefault(row["asset_id"], []).append(row["id"])
    for asset_id, held in per_asset.items():
        if len(held) > 1:
            flag(LOAN_DUPLICATE, f"asset {asset_id} has several checked_out bookings {held}")

    # --- maintenance
    for row in snapshot.bookings:
        asset = assets.get(row["asset_id"])
        if asset is None or asset["state"] != "maintenance":
            continue
        if row["state"] == "checked_out" or (row["state"] in {"pending", "approved"} and row["end_date"] >= today):
            flag(MAINTENANCE_COMMITMENT, f"maintenance asset {asset['id']} keeps {row['state']} booking {row['id']} ending {row['end_date']}")
    return found


def assert_coherent(snapshot: Snapshot, today: date, context: str = "") -> Snapshot:
    violations = audit(snapshot, today)
    assert not violations, (context + ": " if context else "") + "; ".join(str(v) for v in violations)
    return snapshot


def audit_store(store, today: date, context: str = "") -> Snapshot:
    """Read the physical state of ``store`` and assert every invariant holds."""
    return assert_coherent(read_store(store), today, context)


def diff_snapshots(before: Snapshot, after: Snapshot) -> dict:
    """Row-level before/after comparison helper: table -> {added, removed} rows."""
    changes = {}
    for name in ("users", "sessions", "assets", "bookings", "events", "slots", "active_loans"):
        old, new = getattr(before, name), getattr(after, name)
        added = [row for row in new if row not in old]
        removed = [row for row in old if row not in new]
        if added or removed or old != new:
            changes[name] = {"added": added, "removed": removed}
    if before.seeded_on != after.seeded_on:
        changes["seeded_on"] = (before.seeded_on, after.seeded_on)
    if before.availability_versions != after.availability_versions:
        changes["availability_versions"] = (before.availability_versions, after.availability_versions)
    return changes


def assert_unchanged(before: Snapshot, after: Snapshot, context: str = "") -> None:
    changes = diff_snapshots(before, after)
    assert not changes, (context + ": " if context else "") + f"state changed: {changes}"
