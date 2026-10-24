"""#12: the invariant auditor is itself tested by corrupting scratch databases.

A clean, realistic dataset (every booking state, custody, maintenance, sessions)
must audit clean. Each documented violation class is then injected into a COPY of
that migrated file database (foreign keys/CHECKs disabled, unique keys removed
where SQLite would otherwise forbid the corruption) and the auditor must report
exactly the expected class. A union check proves no violation class is untested.
"""

import shutil
import sqlite3
from dataclasses import replace
from datetime import timedelta

import pytest

import invariants as inv
from app.calendar import club_today
from app.domain import Asset
from app.fixtures import seed_catalogue
from app.main import create_app
from app.memory import MemoryRepository
from invariants import Snapshot, audit, audit_store, read_memory, read_sqlite
from persistence_support import migrated_sqlite, sqlite_url
from test_booking_api import BASE, NOW, TODAY, Harness, body, day
from test_catalogue_api import validate
from test_staff_api import action, inventory

pytestmark = pytest.mark.persistence


def populate(h):
    """One booking in every state, an overdue-free loan, sessions and a maintenance unit."""
    with h.repository.transaction() as transaction:
        for identifier in ("unit-c", "unit-d", "unit-e"):
            transaction.add_asset(Asset(identifier, identifier.upper(), "Spare camera", "Cameras", "Fictional", "Desk"))
    made = {}
    made["pending"] = validate(h.create(body(startDate=day(1), endDate=day(2))), "Booking", 201)
    made["approved"] = validate(h.create(body(assetId="unit-b", startDate=day(3), endDate=day(4)), session=h.other), "Booking", 201)
    validate(action(h, made["approved"]["id"], "approve", 1), "Booking")
    made["checked_out"] = validate(h.create(body(assetId="unit-c", startDate=day(0), endDate=day(1))), "Booking", 201)
    validate(action(h, made["checked_out"]["id"], "approve", 1), "Booking")
    validate(action(h, made["checked_out"]["id"], "checkout", 2, note="Outgoing: complete kit."), "Booking")
    made["returned"] = validate(h.create(body(assetId="unit-d", startDate=day(0), endDate=day(0)), session=h.other), "Booking", 201)
    for verb, version in (("approve", 1), ("checkout", 2), ("return", 3)):
        validate(action(h, made["returned"]["id"], verb, version, note="Complete working kit"), "Booking")
    made["cancelled"] = validate(h.create(body(assetId="unit-d", startDate=day(5), endDate=day(5))), "Booking", 201)
    validate(h.cancel(made["cancelled"]["id"], {"expectedVersion": 1}), "Booking")
    made["rejected"] = validate(h.create(body(assetId="unit-e", startDate=day(6), endDate=day(6)), session=h.other), "Booking", 201)
    validate(action(h, made["rejected"]["id"], "reject", 1, note="Dates are reserved."), "Booking")
    return made


@pytest.fixture(scope="module")
def scratch(tmp_path_factory):
    directory = tmp_path_factory.mktemp("auditor")
    url, repository = migrated_sqlite(directory, "clean.sqlite3")
    try:
        h = Harness(repository)
        made = populate(h)
        context = {"path": directory / "clean.sqlite3", "made": made, "directory": directory,
                   "owner": h.owner["user"]["id"], "other": h.other["user"]["id"]}
    finally:
        repository.close()
    return context


def clean_snapshot(scratch):
    return read_sqlite(sqlite_url(scratch["path"]))


def test_a_realistic_lifecycle_dataset_is_coherent_in_both_stores(scratch, tmp_path):
    state = clean_snapshot(scratch)
    assert audit(state, TODAY) == []
    assert {row["state"] for row in state.bookings} == {"pending", "approved", "checked_out", "returned", "cancelled", "rejected"}
    assert len(state.active_loans) == 1 and any(row["state"] == "maintenance" for row in state.assets)
    memory = MemoryRepository()
    h = Harness(memory)
    populate(h)
    assert audit(read_memory(memory), TODAY) == []
    assert read_memory(memory).counts() == state.counts()


def test_the_seeded_catalogue_and_persisted_restart_state_are_coherent(tmp_path):
    memory = MemoryRepository()
    seed_catalogue(memory, lambda: NOW)
    _, repository = migrated_sqlite(tmp_path, "seeded.sqlite3")
    try:
        seed_catalogue(repository, lambda: NOW)
        seeded = audit_store(repository, TODAY, "seeded file database")
        assert seeded.counts()["bookings"] == 10 and seeded.seeded_on == TODAY
        assert audit_store(memory, TODAY).counts() == seeded.counts()
    finally:
        repository.close()


def rebuild_without_constraints(table, columns):
    return [
        f"CREATE TABLE {table}_loose ({columns})",
        f"INSERT INTO {table}_loose SELECT * FROM {table}",
        f"DROP TABLE {table}",
        f"ALTER TABLE {table}_loose RENAME TO {table}",
    ]


def booking_id(scratch, state):
    return scratch["made"][state]["id"]


# (name, expected violation codes, function(scratch) -> SQL statements)
CASES = [
    ("duplicate-slot", {inv.DUPLICATE_SLOT}, lambda s: rebuild_without_constraints("reservation_slots", "asset_id VARCHAR NOT NULL, day DATE NOT NULL, booking_id VARCHAR NOT NULL") + ["INSERT INTO reservation_slots SELECT * FROM reservation_slots LIMIT 1"]),
    ("slot-without-booking", {inv.ORPHAN_SLOT}, lambda s: ["INSERT INTO reservation_slots VALUES ('unit-a', '2026-12-01', 'ghost')"]),
    ("slot-asset-mismatch", {inv.SLOT_ASSET_MISMATCH}, lambda s: [f"UPDATE reservation_slots SET asset_id = 'unit-e' WHERE booking_id = '{booking_id(s, 'pending')}' AND day = '{day(1)}'"]),
    ("slot-outside-range", {inv.SLOT_OUTSIDE_RANGE}, lambda s: [f"INSERT INTO reservation_slots VALUES ('unit-a', '2026-12-31', '{booking_id(s, 'pending')}')"]),
    ("reserving-booking-missing-slot", {inv.MISSING_SLOT}, lambda s: [f"DELETE FROM reservation_slots WHERE booking_id = '{booking_id(s, 'approved')}' AND day = '{day(4)}'"]),
    ("terminal-booking-holds-slot", {inv.TERMINAL_SLOT}, lambda s: [f"INSERT INTO reservation_slots VALUES ('unit-d', '{day(0)}', '{booking_id(s, 'returned')}')"]),
    ("terminal-cancelled-holds-slot", {inv.TERMINAL_SLOT}, lambda s: [f"INSERT INTO reservation_slots VALUES ('unit-d', '{day(5)}', '{booking_id(s, 'cancelled')}')"]),
    ("booking-without-any-event", {inv.MISSING_CREATE}, lambda s: [f"DELETE FROM booking_events WHERE booking_id = '{booking_id(s, 'pending')}'"]),
    ("create-event-missing-from-chain", {inv.CREATE_NOT_FIRST, inv.VERSION_MISMATCH}, lambda s: [f"DELETE FROM booking_events WHERE booking_id = '{booking_id(s, 'approved')}' AND action = 'create'"]),
    ("duplicated-create-event", {inv.CREATE_NOT_FIRST}, lambda s: [f"INSERT INTO booking_events (id, booking_id, actor_id, action, prior_state, new_state, timestamp, note) SELECT 'dup-create', booking_id, actor_id, action, prior_state, new_state, timestamp, note FROM booking_events WHERE booking_id = '{booking_id(s, 'pending')}'"]),
    ("event-chain-broken", {inv.CHAIN_BROKEN}, lambda s: [f"UPDATE booking_events SET prior_state = 'returned' WHERE booking_id = '{booking_id(s, 'approved')}' AND action = 'approve'"]),
    ("illegal-transition-recorded", {inv.CHAIN_BROKEN}, lambda s: [f"UPDATE booking_events SET action = 'checkout' WHERE booking_id = '{booking_id(s, 'approved')}' AND action = 'approve'"]),
    ("state-differs-from-last-event", {inv.EVENT_STATE_MISMATCH}, lambda s: [f"UPDATE bookings SET state = 'rejected' WHERE id = '{booking_id(s, 'returned')}'"]),
    ("version-differs-from-event-count", {inv.VERSION_MISMATCH}, lambda s: [f"UPDATE bookings SET version = version + 1 WHERE id = '{booking_id(s, 'approved')}'"]),
    ("event-without-booking", {inv.ORPHAN_EVENT}, lambda s: ["INSERT INTO booking_events (id, booking_id, actor_id, action, prior_state, new_state, timestamp, note) VALUES ('ghost-event', 'ghost', '" + s['owner'] + "', 'create', NULL, 'pending', '2026-10-21 20:00:00', 'x')"]),
    ("approve-note-tampered", {inv.EVENT_CONTENT}, lambda s: [f"UPDATE booking_events SET note = 'tampered' WHERE booking_id = '{booking_id(s, 'approved')}' AND action = 'approve'"]),
    ("approval-by-a-student", {inv.EVENT_CONTENT}, lambda s: [f"UPDATE booking_events SET actor_id = '{s['owner']}' WHERE booking_id = '{booking_id(s, 'approved')}' AND action = 'approve'"]),
    ("create-by-a-stranger", {inv.EVENT_CONTENT}, lambda s: [f"UPDATE booking_events SET actor_id = '{s['other']}' WHERE booking_id = '{booking_id(s, 'pending')}' AND action = 'create'"]),
    ("cancelled-by-a-stranger", {inv.EVENT_CONTENT}, lambda s: [f"UPDATE booking_events SET actor_id = '{s['other']}' WHERE booking_id = '{booking_id(s, 'cancelled')}' AND action = 'cancel'"]),
    ("event-times-reordered", {inv.EVENT_TIME}, lambda s: [f"UPDATE booking_events SET timestamp = '2030-01-01 00:00:00' WHERE booking_id = '{booking_id(s, 'approved')}' AND action = 'create'"]),
    ("updated-at-differs-from-last-event", {inv.EVENT_TIME}, lambda s: [f"UPDATE bookings SET updated_at = '2031-01-01 00:00:00' WHERE id = '{booking_id(s, 'pending')}'"]),
    ("two-loans-for-one-unit", {inv.LOAN_DUPLICATE}, lambda s: rebuild_without_constraints("active_loans", "asset_id VARCHAR NOT NULL, booking_id VARCHAR NOT NULL") + ["INSERT INTO active_loans SELECT * FROM active_loans LIMIT 1"]),
    ("loan-without-booking", {inv.LOAN_ORPHAN}, lambda s: ["INSERT INTO active_loans VALUES ('unit-e', 'ghost')"]),
    ("loan-for-a-booking-that-is-not-checked-out", {inv.LOAN_STATE}, lambda s: [f"INSERT INTO active_loans VALUES ('unit-b', '{booking_id(s, 'approved')}')"]),
    ("loan-names-another-unit", {inv.LOAN_ASSET, inv.MISSING_LOAN}, lambda s: ["UPDATE active_loans SET asset_id = 'unit-e'"]),
    ("checked-out-without-loan", {inv.MISSING_LOAN}, lambda s: ["DELETE FROM active_loans"]),
    ("several-checked-out-bookings-for-one-unit", {inv.LOAN_DUPLICATE, inv.MISSING_LOAN, inv.EVENT_STATE_MISMATCH}, lambda s: [f"UPDATE bookings SET state = 'checked_out', asset_id = 'unit-c' WHERE id = '{booking_id(s, 'approved')}'"]),
    ("maintenance-with-pending-commitment", {inv.MAINTENANCE_COMMITMENT}, lambda s: ["UPDATE assets SET state = 'maintenance' WHERE id = 'unit-a'"]),
    ("maintenance-with-approved-commitment", {inv.MAINTENANCE_COMMITMENT}, lambda s: ["UPDATE assets SET state = 'maintenance' WHERE id = 'unit-b'"]),
    ("maintenance-with-checked-out-loan", {inv.MAINTENANCE_COMMITMENT}, lambda s: ["UPDATE assets SET state = 'maintenance' WHERE id = 'unit-c'"]),
    ("booking-owner-deleted", {inv.BOOKING_REFERENCE, inv.EVENT_REFERENCE, inv.SESSION_REFERENCE}, lambda s: [f"DELETE FROM users WHERE id = '{s['owner']}'"]),
    ("booking-asset-deleted", {inv.BOOKING_REFERENCE}, lambda s: ["DELETE FROM assets WHERE id = 'unit-e'"]),
    ("session-of-unknown-user", {inv.SESSION_REFERENCE}, lambda s: ["INSERT INTO sessions VALUES ('orphan-hash', 'ghost-user', '2026-10-23 00:00:00')"]),
    ("username-not-normalized", {inv.DUPLICATE_USERNAME}, lambda s: ["UPDATE users SET username = 'OWNER' WHERE username = 'owner'"]),
    ("duplicate-username", {inv.DUPLICATE_USERNAME}, lambda s: rebuild_without_constraints("users", "id VARCHAR NOT NULL, username VARCHAR NOT NULL, password_hash VARCHAR NOT NULL, role VARCHAR NOT NULL") + ["INSERT INTO users SELECT 'twin', username, password_hash, role FROM users WHERE username = 'owner'"]),
    ("duplicate-inventory-code", {inv.DUPLICATE_CODE}, lambda s: ["UPDATE assets SET inventory_code = 'unit-a' WHERE id = 'unit-b'"]),
    ("booking-dates-reversed", {inv.BOOKING_DATES, inv.SLOT_OUTSIDE_RANGE}, lambda s: [f"UPDATE bookings SET end_date = '2020-01-01' WHERE id = '{booking_id(s, 'pending')}'"]),
    ("booking-version-zero", {inv.BOOKING_DATES, inv.VERSION_MISMATCH}, lambda s: [f"UPDATE bookings SET version = 0 WHERE id = '{booking_id(s, 'pending')}'"]),
]


@pytest.mark.parametrize("name,expected,statements", CASES, ids=[case[0] for case in CASES])
def test_each_violation_class_is_detected_in_a_corrupted_scratch_database(scratch, tmp_path, name, expected, statements):
    path = tmp_path / "corrupt.sqlite3"
    shutil.copyfile(scratch["path"], path)
    connection = sqlite3.connect(path, isolation_level=None)
    try:
        connection.execute("PRAGMA foreign_keys = OFF")
        connection.execute("PRAGMA ignore_check_constraints = ON")
        for statement in statements(scratch):
            connection.execute(statement)
    finally:
        connection.close()
    assert audit(read_sqlite(sqlite_url(scratch["path"])), TODAY) == []  # the template stays clean
    found = {violation.code for violation in audit(read_sqlite(sqlite_url(path)), TODAY)}
    assert expected <= found, (name, found)
    assert found <= inv.ALL_CODES and found, name


def test_every_violation_class_is_covered_by_at_least_one_corruption_case():
    assert {code for case in CASES for code in case[1]} == inv.ALL_CODES


def test_a_corrupted_database_fails_the_assertion_helper_with_every_violation_listed(scratch, tmp_path):
    path = tmp_path / "bad.sqlite3"
    shutil.copyfile(scratch["path"], path)
    connection = sqlite3.connect(path, isolation_level=None)
    connection.execute("PRAGMA foreign_keys = OFF")
    connection.execute("DELETE FROM reservation_slots")
    connection.close()
    with pytest.raises(AssertionError, match="reserving-booking-missing-slot"):
        inv.assert_coherent(read_sqlite(sqlite_url(path)), TODAY, "corrupted")


# ---- the same classes through the memory store (physical maps rather than a file)

def memory_dataset():
    repository = MemoryRepository()
    h = Harness(repository)
    made = populate(h)
    return repository, made, h


def corrupt_memory(repository, made, name):
    state = repository._state
    pending, approved, checked, returned = (made[key]["id"] for key in ("pending", "approved", "checked_out", "returned"))
    if name == "missing-slot":
        del state.slots[("unit-b", TODAY + timedelta(days=4))]
    elif name == "terminal-slot":
        from app.domain import ReservationSlot
        state.slots[("unit-d", TODAY)] = ReservationSlot("unit-d", TODAY, returned)
    elif name == "version":
        state.bookings[approved] = replace(state.bookings[approved], version=9)
    elif name == "missing-loan":
        state.active_loans.clear()
    elif name == "orphan-loan":
        from app.domain import ActiveLoan
        state.active_loans["unit-e"] = ActiveLoan("unit-e", "ghost")
    elif name == "maintenance":
        state.assets["unit-a"] = replace(state.assets["unit-a"], state="maintenance")
    elif name == "chain":
        event = next(item for item in state.events.values() if item.booking_id == approved and item.action == "approve")
        state.events[event.id] = replace(event, prior_state="rejected")
    elif name == "create-removed":
        event = next(item for item in state.events.values() if item.booking_id == pending)
        del state.events[event.id]
    return state


@pytest.mark.parametrize("name,expected", [
    ("missing-slot", inv.MISSING_SLOT), ("terminal-slot", inv.TERMINAL_SLOT), ("version", inv.VERSION_MISMATCH),
    ("missing-loan", inv.MISSING_LOAN), ("orphan-loan", inv.LOAN_ORPHAN), ("maintenance", inv.MAINTENANCE_COMMITMENT),
    ("chain", inv.CHAIN_BROKEN), ("create-removed", inv.MISSING_CREATE),
])
def test_violations_are_detected_in_the_memory_store_too(name, expected):
    repository, made, _ = memory_dataset()
    assert audit(read_memory(repository), TODAY) == []
    corrupt_memory(repository, made, name)
    assert expected in {violation.code for violation in audit(read_memory(repository), TODAY)}


def test_duplicate_rows_are_representable_and_detected_in_a_plain_snapshot():
    repository, _, _ = memory_dataset()
    state = read_memory(repository)
    state.slots.append(dict(state.slots[0]))
    state.active_loans.append(dict(state.active_loans[0]))
    codes = {violation.code for violation in audit(state, TODAY)}
    assert {inv.DUPLICATE_SLOT, inv.LOAN_DUPLICATE} <= codes


def test_diff_helper_reports_added_removed_and_changed_rows(scratch):
    before = clean_snapshot(scratch)
    after = clean_snapshot(scratch)
    assert inv.diff_snapshots(before, after) == {}
    inv.assert_unchanged(before, after)
    after.bookings[0] = {**after.bookings[0], "version": 99}
    after.slots.pop()
    changes = inv.diff_snapshots(before, after)
    assert set(changes) == {"bookings", "slots"} and len(changes["slots"]["removed"]) == 1
    with pytest.raises(AssertionError, match="state changed"):
        inv.assert_unchanged(before, after, "demo")
