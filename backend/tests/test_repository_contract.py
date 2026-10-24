"""#12 shared repository contract: one suite, two real stores, identical assertions.

Every test below runs against BOTH the true memory adapter and the migrated
FILE-backed SQLAlchemy/SQLite adapter (a temporary file created through the
Alembic migration path, never ``:memory:`` and never ``create_all``). No assertion
is store specific. After every scenario the invariant auditor re-reads the
physical state of that store and must find it coherent.

Legitimate adapter differences (the exception *class* only, never the outcome):

* a duplicate reservation slot / active loan / seed marker raises ``ValueError``
  in memory and the storage-neutral ``TransactionRetry`` signal in SQL (the
  service then rechecks and reports the ordinary 409); both abort the whole
  transaction, which is what these tests assert;
* a foreign-key style reference to a missing row raises ``ValueError`` in memory
  and ``sqlalchemy.exc.IntegrityError`` in SQL; both must abort and persist nothing;
* a malformed (non-UTC) event/session timestamp raises ``ValueError`` in memory
  and ``sqlalchemy.exc.StatementError`` in SQL; both must abort and persist nothing.
"""

import json
import re
from datetime import UTC, date, datetime, timedelta, timezone

import pytest
from sqlalchemy.exc import IntegrityError, StatementError

from app.auth import token_hash
from app.calendar import club_today
from app.domain import ActiveLoan, Asset, Booking, BookingEvent, CANCEL_NOTE, ReservationSlot, Session, User
from app.memory import MemoryRepository
from app.repositories import InventoryCodeTaken, TransactionRetry, UsernameTaken
from invariants import assert_unchanged, audit_store, read_store
from persistence_support import migrated_sqlite
from test_booking_api import BASE, NOW, TODAY, Harness, body, day, error, request
from test_catalogue_api import validate
from test_staff_api import ACTIONS, RULES, STAFF, action, asset_input, desk, expect_error, fixture, inventory

KINDS = ["memory", "sqlite"]
STAMP = datetime(2026, 10, 23, 12, 0, 0, 123456, UTC)


@pytest.fixture(params=KINDS)
def kind(request):
    return request.param


@pytest.fixture
def store(kind, tmp_path):
    if kind == "memory":
        yield MemoryRepository()
    else:
        _, repository = migrated_sqlite(tmp_path, "contract.sqlite3")
        yield repository
        repository.close()


@pytest.fixture
def h(store):
    harness = Harness(store)
    yield harness
    audit_store(store, club_today(harness.clock), "after scenario")


@pytest.fixture
def raw(store):
    """Repository-level tests: no HTTP, but the same final audit."""
    yield store
    audit_store(store, TODAY, "after repository scenario")


def snap(store):
    return read_store(store)


def relogin(h):
    """Sessions expire after 24 hours; sign everyone in again after a long clock jump."""
    for attribute, name, password in (("owner", "owner", "StudentPassword42!"), ("other", "other", "StudentPassword42!"), ("coordinator", "coordinator", "CoordinatorPassword42!")):
        setattr(h, attribute, validate(request(h.app, "POST", "/api/v1/auth/login", json={"username": name, "password": password}), "Session"))


def user(index, role="student"):
    return User(f"user-{index}", f"member{index}", role, f"hash-{index}")


def asset(identifier, code=None, state="active"):
    return Asset(identifier, code or identifier.upper(), f"Unit {identifier}", "Cameras", "Fictional", "Desk", state)


def booking(identifier, asset_id, owner, start, end, state="pending", version=1):
    return Booking(identifier, asset_id, f"Unit {asset_id}", owner, start, end, "Club filming", state, version, STAMP, STAMP)


def create_event(identifier, booking_id, actor):
    return BookingEvent(identifier, booking_id, actor, "create", None, "pending", STAMP, "Club filming")


def world(transaction):
    """Two students, a coordinator and two units, in one transaction."""
    for member in (user(1), user(2), user(3, "coordinator")):
        transaction.add_user(member)
    transaction.add_asset(asset("unit-a"))
    transaction.add_asset(asset("unit-b"))


def add_pending(transaction, identifier, asset_id, owner, start, end):
    """A pending booking with its create event and every day slot."""
    return add_history(transaction, identifier, asset_id, owner, start, end, "pending")


PATHS = {
    "pending": (),
    "approved": (("approve", "pending", "approved"),),
    "checked_out": (("approve", "pending", "approved"), ("checkout", "approved", "checked_out")),
    "rejected": (("reject", "pending", "rejected"),),
    "cancelled": (("cancel", "pending", "cancelled"),),
    "returned": (("approve", "pending", "approved"), ("checkout", "approved", "checked_out"), ("return", "checked_out", "returned")),
}
NOTES = {"approve": "Reservation approved.", "cancel": CANCEL_NOTE}


def cancel_pending(transaction, identifier):
    """Cancel a pending booking exactly as the service does: state, event and slot release."""
    record = transaction.booking_by_id(identifier)
    transaction.replace_booking(Booking(record.id, record.asset_id, record.asset_name, record.user_id, record.start_date, record.end_date, record.purpose, "cancelled", record.version + 1, record.created_at, STAMP))
    transaction.add_booking_event(BookingEvent(f"{identifier}-cancel", identifier, record.user_id, "cancel", "pending", "cancelled", STAMP, CANCEL_NOTE))
    transaction.release_slots(identifier)


def add_history(transaction, identifier, asset_id, owner, start, end, state, loan=True):
    """A coherent booking: events matching its state, version, slots and custody."""
    steps = PATHS[state]
    record = booking(identifier, asset_id, owner, start, end, state, len(steps) + 1)
    transaction.add_booking(record)
    transaction.add_booking_event(create_event(f"{identifier}-create", identifier, owner))
    for verb, prior, new in steps:
        actor = owner if verb == "cancel" else "user-3"
        transaction.add_booking_event(BookingEvent(f"{identifier}-{verb}", identifier, actor, verb, prior, new, STAMP, NOTES.get(verb, "Complete working kit")))
    if state in ("pending", "approved", "checked_out"):
        for offset in range((end - start).days + 1):
            transaction.add_slot(ReservationSlot(asset_id, start + timedelta(days=offset), identifier))
    if state == "checked_out" and loan:
        transaction.add_active_loan(ActiveLoan(asset_id, identifier))
    return record


# ---------------------------------------------------------------- repository layer

def test_identity_and_session_records_round_trip_and_uniqueness_aborts_the_whole_transaction(raw):
    first, expires = user(1), STAMP + timedelta(hours=24)
    with raw.transaction() as transaction:
        transaction.add_user(first)
        transaction.add_session(Session("hash-a", first.id, expires))
    with raw.transaction() as transaction:
        assert transaction.user_by_username("member1") == first and transaction.user_by_id("user-1") == first
        assert transaction.user_by_username("MEMBER1") is None and transaction.user_by_id("missing") is None
        stored = transaction.session_by_hash("hash-a")
        assert stored == Session("hash-a", "user-1", expires)
        assert stored.expires_at.utcoffset() == timedelta(0) and stored.expires_at.microsecond == 123456
        assert transaction.session_by_hash("unknown") is None
    before = snap(raw)
    with pytest.raises(UsernameTaken), raw.transaction() as transaction:
        transaction.add_user(user(8))  # discarded together with the failing duplicate
        transaction.add_user(User("user-9", "member1", "student", "hash-9"))
    assert_unchanged(before, snap(raw), "duplicate username")
    with pytest.raises((ValueError, IntegrityError)), raw.transaction() as transaction:
        transaction.add_session(Session("hash-b", "missing-user", expires))
    assert_unchanged(before, snap(raw), "session of unknown user")
    with raw.transaction() as transaction:
        transaction.delete_session("hash-a")
    with raw.transaction() as transaction:
        assert transaction.session_by_hash("hash-a") is None and transaction.user_by_id("user-1") == first


def test_a_transaction_is_all_or_nothing_across_every_record_type(raw):
    with raw.transaction() as transaction:
        world(transaction)
    before = snap(raw)

    class Boom(Exception):
        pass

    with pytest.raises(Boom), raw.transaction() as transaction:
        add_pending(transaction, "b1", "unit-a", "user-1", TODAY, TODAY + timedelta(days=2))
        transaction.add_asset(asset("unit-c"))
        transaction.add_session(Session("hash-c", "user-1", STAMP))
        raise Boom()
    assert_unchanged(before, snap(raw), "failure after every kind of write")
    with raw.transaction() as transaction:
        add_pending(transaction, "b1", "unit-a", "user-1", TODAY, TODAY + timedelta(days=2))
    after = snap(raw)
    assert (len(after.bookings), len(after.events), len(after.slots)) == (1, 1, 3)


def test_slot_uniqueness_is_enforced_by_the_store_and_release_is_per_booking(raw):
    with raw.transaction() as transaction:
        world(transaction)
        add_pending(transaction, "b1", "unit-a", "user-1", TODAY, TODAY + timedelta(days=2))
    before = snap(raw)
    # Overlapping on the last day only: the whole second booking is discarded.
    with pytest.raises((ValueError, TransactionRetry)), raw.transaction() as transaction:
        add_pending(transaction, "b2", "unit-a", "user-2", TODAY + timedelta(days=2), TODAY + timedelta(days=4))
    assert_unchanged(before, snap(raw), "overlapping allocation")
    # Adjacent days and another unit with identical dates are independent.
    with raw.transaction() as transaction:
        add_pending(transaction, "b3", "unit-a", "user-2", TODAY + timedelta(days=3), TODAY + timedelta(days=4))
        add_pending(transaction, "b4", "unit-b", "user-2", TODAY, TODAY + timedelta(days=2))
    with raw.transaction() as transaction:
        assert transaction.occupied_days("unit-a", TODAY, TODAY + timedelta(days=10)) == {TODAY + timedelta(days=i) for i in range(5)}
        assert transaction.occupied_days("unit-a", TODAY + timedelta(days=2), TODAY + timedelta(days=3)) == {TODAY + timedelta(days=2), TODAY + timedelta(days=3)}
        assert transaction.occupied_days("unit-a", TODAY + timedelta(days=5), TODAY + timedelta(days=9)) == frozenset()
        assert transaction.occupied_days("unit-a", TODAY - timedelta(days=3), TODAY - timedelta(days=1)) == frozenset()
        assert transaction.occupied_days("unit-b", TODAY, TODAY) == {TODAY}
        assert transaction.occupied_days("nobody", TODAY, TODAY) == frozenset()
    with raw.transaction() as transaction:
        cancel_pending(transaction, "b1")
        transaction.release_slots("no-such-booking")  # releasing nothing is not an error
    with raw.transaction() as transaction:
        assert transaction.occupied_days("unit-a", TODAY, TODAY + timedelta(days=10)) == {TODAY + timedelta(days=3), TODAY + timedelta(days=4)}
        assert transaction.occupied_days("unit-b", TODAY, TODAY + timedelta(days=2)) == {TODAY + timedelta(days=i) for i in range(3)}
    # A released day can be allocated again.
    with raw.transaction() as transaction:
        add_pending(transaction, "b5", "unit-a", "user-1", TODAY, TODAY)


def test_slots_must_reference_a_reserving_booking_of_the_same_unit_inside_its_dates(raw):
    with raw.transaction() as transaction:
        world(transaction)
        add_history(transaction, "live", "unit-a", "user-1", TODAY, TODAY + timedelta(days=1), "pending")
        add_history(transaction, "done", "unit-a", "user-1", TODAY + timedelta(days=5), TODAY + timedelta(days=6), "cancelled")
    before = snap(raw)
    for slot in (
        ReservationSlot("unit-b", TODAY, "live"),                          # another unit
        ReservationSlot("unit-a", TODAY + timedelta(days=2), "live"),      # outside the booked dates
        ReservationSlot("unit-a", TODAY - timedelta(days=1), "live"),
        ReservationSlot("unit-a", TODAY + timedelta(days=5), "done"),      # terminal bookings hold nothing
        ReservationSlot("unit-a", TODAY, "unknown"),
    ):
        with pytest.raises(ValueError), raw.transaction() as transaction:
            transaction.add_slot(slot)
        assert_unchanged(before, snap(raw), f"invalid slot {slot}")


def test_active_loan_is_unique_per_unit_and_must_reference_a_checked_out_booking_of_that_unit(raw):
    second = TODAY + timedelta(days=3)
    with raw.transaction() as transaction:
        world(transaction)
        add_history(transaction, "held", "unit-a", "user-1", TODAY, TODAY, "checked_out")
        add_history(transaction, "idle", "unit-a", "user-2", second + timedelta(days=2), second + timedelta(days=2), "approved")
    before = snap(raw)
    assert audit_store(raw, TODAY).active_loans == [{"asset_id": "unit-a", "booking_id": "held"}]
    with raw.transaction() as transaction:
        assert transaction.active_loan_by_asset("unit-a") == ActiveLoan("unit-a", "held")
        assert transaction.active_loan_by_asset("unit-b") is None
    # One physical unit, one custody record: a second loan aborts the whole transaction.
    with pytest.raises((ValueError, TransactionRetry)), raw.transaction() as transaction:
        add_history(transaction, "next", "unit-a", "user-2", second, second, "checked_out", loan=False)
        transaction.add_active_loan(ActiveLoan("unit-a", "next"))
    assert_unchanged(before, snap(raw), "second loan on one unit")
    # A loan must reference a checked_out booking of the same unit.
    for loan in (ActiveLoan("unit-b", "held"), ActiveLoan("unit-a", "idle"), ActiveLoan("unit-a", "unknown")):
        with pytest.raises(ValueError), raw.transaction() as transaction:
            transaction.add_active_loan(loan)
        assert_unchanged(before, snap(raw), f"loan {loan}")
    for asset_id, booking_id in (("unit-a", "idle"), ("unit-b", "held"), ("unit-a", "unknown")):
        with pytest.raises(ValueError), raw.transaction() as transaction:
            transaction.remove_active_loan(asset_id, booking_id)
        assert_unchanged(before, snap(raw), f"release {asset_id}/{booking_id}")
    # Return: the state change, event, slot release and loan removal commit together.
    with raw.transaction() as transaction:
        held = transaction.booking_by_id("held")
        transaction.replace_booking(Booking(held.id, held.asset_id, held.asset_name, held.user_id, held.start_date, held.end_date, held.purpose, "returned", 4, held.created_at, STAMP))
        transaction.add_booking_event(BookingEvent("held-return", "held", "user-3", "return", "checked_out", "returned", STAMP, "Complete working kit"))
        transaction.release_slots("held")
        transaction.remove_active_loan("unit-a", "held")
    with raw.transaction() as transaction:
        assert transaction.active_loan_by_asset("unit-a") is None and transaction.occupied_days("unit-a", TODAY, TODAY) == frozenset()
    audit_store(raw, TODAY, "after return")


def test_listings_use_insertion_order_even_when_ids_and_timestamps_say_otherwise(raw):
    ids = ["z-first", "a-second", "m-third"]
    with raw.transaction() as transaction:
        world(transaction)
        for identifier in ids:
            transaction.add_asset(asset(identifier))
        # One cancelled history whose three events share a timestamp and unordered ids.
        transaction.add_booking(booking("z-first", "unit-a", "user-1", TODAY, TODAY, "cancelled", 3))
        transaction.add_booking_event(create_event("e-2", "z-first", "user-1"))
        transaction.add_booking_event(BookingEvent("e-1", "z-first", "user-3", "approve", "pending", "approved", STAMP, "Reservation approved."))
        transaction.add_booking_event(BookingEvent("e-3", "z-first", "user-1", "cancel", "approved", "cancelled", STAMP, CANCEL_NOTE))
        add_history(transaction, "a-second", "unit-a", "user-1", TODAY + timedelta(days=2), TODAY + timedelta(days=2), "pending")
        add_history(transaction, "m-third", "unit-a", "user-1", TODAY + timedelta(days=4), TODAY + timedelta(days=4), "pending")
    for _ in range(2):
        with raw.transaction() as transaction:
            assert [row.id for row in transaction.assets()] == ["unit-a", "unit-b", *ids]
            assert [row.id for row in transaction.bookings()] == ids
            assert [row.id for row in transaction.booking_events("z-first")] == ["e-2", "e-1", "e-3"]
            assert transaction.booking_events("unknown") == ()


@pytest.mark.parametrize("bad", [datetime(2026, 10, 23, 12, 0, 0), datetime(2026, 10, 23, 12, 0, 0, tzinfo=timezone(timedelta(hours=5)))])
def test_timestamps_are_aware_utc_with_microseconds_and_other_offsets_are_rejected(raw, bad):
    with raw.transaction() as transaction:
        world(transaction)
        add_history(transaction, "b1", "unit-a", "user-1", TODAY, TODAY, "pending")
    with raw.transaction() as transaction:
        stored = transaction.booking_by_id("b1")
        assert stored.created_at == stored.updated_at == STAMP and stored.created_at.utcoffset() == timedelta(0)
        assert transaction.booking_events("b1")[0].timestamp == STAMP and transaction.booking_events("b1")[0].timestamp.microsecond == 123456
    before = snap(raw)
    for write in (
        lambda t: t.add_booking(Booking("b2", "unit-a", "Unit", "user-1", TODAY, TODAY, "Club filming", "pending", 1, bad, STAMP)),
        lambda t: t.replace_booking(Booking("b1", "unit-a", "Unit", "user-1", TODAY, TODAY, "Club filming", "pending", 2, STAMP, bad)),
    ):
        with pytest.raises(ValueError), raw.transaction() as transaction:
            write(transaction)
        assert_unchanged(before, snap(raw), "bad booking timestamp")
    with pytest.raises((ValueError, StatementError)), raw.transaction() as transaction:
        transaction.add_booking_event(BookingEvent("e2", "b1", "user-1", "approve", "pending", "approved", bad, "Reservation approved."))
    assert_unchanged(before, snap(raw), "bad event timestamp")
    with pytest.raises((ValueError, StatementError)), raw.transaction() as transaction:
        transaction.add_session(Session("hash-x", "user-1", bad))
    assert_unchanged(before, snap(raw), "bad session expiry")


def test_inventory_codes_are_unique_case_insensitively_and_renames_free_the_old_code(raw):
    with raw.transaction() as transaction:
        world(transaction)
        add_history(transaction, "b1", "unit-a", "user-1", TODAY - timedelta(days=3), TODAY - timedelta(days=3), "returned")
    before = snap(raw)
    for duplicate in ("unit-a", "UNIT-A"):
        with pytest.raises(InventoryCodeTaken), raw.transaction() as transaction:
            transaction.add_asset(Asset("dup", duplicate, "Dup", "Audio", "", "Desk"))
        assert_unchanged(before, snap(raw), f"duplicate {duplicate}")
    with pytest.raises(InventoryCodeTaken), raw.transaction() as transaction:
        transaction.add_asset(Asset("sharp-s", "straße", "A", "Audio", "", "Desk"))
        transaction.add_asset(Asset("double-s", "STRASSE", "B", "Audio", "", "Desk"))
    assert_unchanged(before, snap(raw), "case folding expansion")
    with pytest.raises(InventoryCodeTaken), raw.transaction() as transaction:
        transaction.replace_asset(Asset("unit-b", "UNIT-A", "Unit unit-b", "Cameras", "Fictional", "Desk"))
    assert_unchanged(before, snap(raw), "rename onto another unit's code")
    with pytest.raises(ValueError), raw.transaction() as transaction:
        transaction.replace_asset(asset("never-existed"))
    assert_unchanged(before, snap(raw), "replace unknown unit")
    with raw.transaction() as transaction:
        transaction.replace_asset(Asset("unit-a", "UNIT-A2", "Renamed", "Audio", "New", "Shelf", "maintenance"))
    with raw.transaction() as transaction:
        transaction.add_asset(Asset("reuse", "UNIT-A", "Reuses old code", "Audio", "", "Desk"))
        assert transaction.asset_by_id("unit-a").name == "Renamed" and transaction.asset_by_id("unit-a").state == "maintenance"
        assert transaction.booking_by_id("b1").asset_name == "Unit unit-a"  # booking snapshots keep their name


def test_catalogue_seed_marker_is_set_once_and_persists(raw):
    with raw.transaction() as transaction:
        assert transaction.catalogue_seeded_on() is None
        transaction.mark_catalogue_seeded(TODAY)
    with raw.transaction() as transaction:
        assert transaction.catalogue_seeded_on() == TODAY
    with pytest.raises((ValueError, TransactionRetry)), raw.transaction() as transaction:
        transaction.mark_catalogue_seeded(TODAY + timedelta(days=1))
    with raw.transaction() as transaction:
        assert transaction.catalogue_seeded_on() == TODAY


def test_a_retained_transaction_cannot_change_committed_state(raw):
    with raw.transaction() as transaction:
        world(transaction)
        add_pending(transaction, "b1", "unit-a", "user-1", TODAY, TODAY)
        retained = transaction
    before = snap(raw)
    for write in (
        lambda t: t.release_slots("b1"), lambda t: t.add_asset(asset("late")), lambda t: t.add_user(user(77)),
        lambda t: t.replace_asset(Asset("unit-a", "CHANGED", "Changed", "Audio", "", "Desk")),
        lambda t: t.add_session(Session("late-hash", "user-1", STAMP)),
    ):
        try:
            write(retained)  # either a harmless private copy (memory) or an error (closed SQL session)
        except Exception:
            pass
        assert_unchanged(before, snap(raw), "retained transaction")


# ---------------------------------------------------------------- service / API layer

def test_identity_sessions_and_expiry_behave_identically(h):
    assert h.owner["user"]["role"] == "student" and h.coordinator["user"]["role"] == "coordinator"
    forged = validate(request(h.app, "POST", "/api/v1/auth/register", json={"username": "forger", "password": "StudentPassword42!", "role": "coordinator", "id": "forged"}), "Session", 201)
    assert forged["user"]["role"] == "student" and forged["user"]["id"] != "forged"
    expect = request(h.app, "POST", "/api/v1/auth/register", json={"username": " OWNER ", "password": "OtherPassword42!"})
    assert expect.status_code == 409 and expect.json()["code"] == "USERNAME_TAKEN"
    wrong = request(h.app, "POST", "/api/v1/auth/login", json={"username": "owner", "password": "WrongPassword42!"})
    assert wrong.status_code == 401 and wrong.json()["code"] == "INVALID_CREDENTIALS"
    relogin = validate(request(h.app, "POST", "/api/v1/auth/login", json={"username": "OWNER", "password": "StudentPassword42!"}), "Session")
    assert relogin["token"] != h.owner["token"]
    # Only the hash of a bearer token is stored, with an absolute 24 hour expiry.
    state = snap(h.repository)
    assert h.owner["token"] not in json.dumps(state.sessions, default=str) and h.owner["token"] not in json.dumps(state.users, default=str)
    row = next(item for item in state.sessions if item["token_hash"] == token_hash(h.owner["token"]))
    assert row["expires_at"] == NOW + timedelta(hours=24) and h.owner["expiresAt"] == "2026-10-22T20:00:00.123456Z"
    # Logout revokes only the presented token.
    assert request(h.app, "POST", "/api/v1/auth/logout", session=h.owner).status_code == 204
    assert request(h.app, path="/api/v1/auth/me", session=h.owner).status_code == 401
    assert request(h.app, path="/api/v1/auth/me", session=relogin).json()["username"] == "owner"
    # Absolute expiry: valid until the last microsecond, expired from the instant.
    h.clock.value = NOW + timedelta(hours=24) - timedelta(microseconds=1)
    assert request(h.app, path="/api/v1/auth/me", session=relogin).status_code == 200
    h.clock.value = NOW + timedelta(hours=24)
    assert request(h.app, path="/api/v1/auth/me", session=relogin).status_code == 401
    assert request(h.app, path="/api/v1/auth/me", session=h.coordinator).status_code == 401


def test_visibility_and_privacy_boundaries_are_identical(h):
    mine = validate(h.create(), "Booking", 201)
    before = snap(h.repository)
    hidden = request(h.app, path=f"{BASE}/{mine['id']}", session=h.other)
    missing = request(h.app, path=f"{BASE}/missing", session=h.other)
    error(hidden, 404)
    assert hidden.content == missing.content
    foreign_cancel = h.cancel(mine["id"], {"expectedVersion": 1}, h.other)
    assert foreign_cancel.content == request(h.app, "POST", f"{BASE}/missing/cancel", session=h.other, json={"expectedVersion": 1}).content
    assert request(h.app, path=BASE, session=h.other).json() == []
    assert request(h.app, path=f"{BASE}/{mine['id']}", session=h.coordinator).json() == mine
    assert request(h.app, path=BASE, session=h.coordinator).json() == []  # the list is always own-only
    expect_error(request(h.app, path=f"{STAFF}/bookings", session=h.owner), 403)
    expect_error(request(h.app, path=f"{BASE}/{mine['id']}"), 401)
    assert_unchanged(before, snap(h.repository), "reads and denials")
    public = validate(request(h.app, path="/api/v1/assets/unit-a/availability"), "AssetAvailability")
    assert {key for row in public["days"] for key in row} == {"date", "state"}
    assert next(row for row in public["days"] if row["date"] == day())["state"] == "occupied"
    text = request(h.app, path="/api/v1/assets/unit-a/availability").text
    for private in (mine["id"], mine["userId"], mine["purpose"], "owner"):
        assert private not in text
    conflict = h.create(session=h.other)
    error(conflict, 409, dates=[day()])
    for private in (mine["id"], mine["userId"], mine["purpose"], "owner"):
        assert private not in conflict.text


SHAPES = [
    ("same-day", ("unit-a", 2, 2), ("unit-a", 2, 2), [2]),
    ("identical-range", ("unit-a", 2, 4), ("unit-a", 2, 4), [2, 3, 4]),
    ("partial-overlap-before", ("unit-a", 2, 4), ("unit-a", 1, 2), [2]),
    ("partial-overlap-after", ("unit-a", 2, 4), ("unit-a", 4, 5), [4]),
    ("enclosing-second", ("unit-a", 2, 4), ("unit-a", 1, 5), [2, 3, 4]),
    ("enclosed-second", ("unit-a", 1, 5), ("unit-a", 2, 4), [2, 3, 4]),
    ("adjacent-after-inclusive-end", ("unit-a", 2, 4), ("unit-a", 5, 6), None),
    ("adjacent-before-start", ("unit-a", 2, 4), ("unit-a", 0, 1), None),
    ("different-unit-same-dates", ("unit-a", 2, 4), ("unit-b", 2, 4), None),
]


@pytest.mark.parametrize("name,first,second,overlap", SHAPES, ids=[shape[0] for shape in SHAPES])
def test_allocation_shapes_conflict_or_coexist_identically(h, name, first, second, overlap):
    one = validate(h.create(body(assetId=first[0], startDate=day(first[1]), endDate=day(first[2]))), "Booking", 201)
    before = snap(h.repository)
    response = h.create(body(assetId=second[0], startDate=day(second[1]), endDate=day(second[2])), session=h.other)
    if overlap is not None:
        error(response, 409, dates=[day(offset) for offset in overlap])
        for private in (one["id"], one["userId"], one["purpose"], "owner"):
            assert private not in response.text
        assert_unchanged(before, snap(h.repository), name)
        assert {(row["asset_id"], row["day"]) for row in snap(h.repository).slots} == {("unit-a", TODAY + timedelta(days=i)) for i in range(first[1], first[2] + 1)}
    else:
        two = validate(response, "Booking", 201)
        state = snap(h.repository)
        assert len(state.bookings) == len(state.events) == 2 and two["id"] != one["id"]
        assert len(state.slots) == (first[2] - first[1] + 1) + (second[2] - second[1] + 1)


def test_inclusive_length_and_horizon_boundaries_allocate_exactly_the_requested_days(h):
    longest = validate(h.create(body(startDate=day(0), endDate=day(13))), "Booking", 201)
    assert len(snap(h.repository).slots) == 14 and longest["version"] == 1
    far = validate(h.create(body(assetId="unit-b", startDate=day(90), endDate=day(90))), "Booking", 201)
    assert far["startDate"] == day(90)
    before = snap(h.repository)
    for payload, fields in (
        (body(assetId="unit-b", startDate=day(-1)), {"startDate"}),                          # yesterday
        (body(assetId="unit-b", startDate=day(5), endDate=day(19)), {"endDate"}),            # 15 days
        (body(assetId="unit-b", startDate=day(91), endDate=day(91)), {"startDate", "endDate"}),  # beyond the horizon
    ):
        error(h.create(payload), 422, fields=fields)
    assert_unchanged(before, snap(h.repository), "invalid date ranges")


def test_lifecycle_events_versions_actors_and_contract_notes_are_identical(h):
    created = validate(h.create(body(startDate=day(0), endDate=day(2))), "Booking", 201)
    steps = []
    for verb, version, note in (("approve", 1, None), ("checkout", 2, "Outgoing: complete kit, tested."), ("return", 3, "Incoming: complete kit, no damage.")):
        h.clock.value += timedelta(minutes=5)
        result = validate(action(h, created["id"], verb, version, note=note or "unused"), "Booking")
        steps.append((verb, h.clock.value, result))
        assert result["version"] == len(result["events"]) == version + 1
        state = snap(h.repository)
        assert len(state.slots) == (0 if verb == "return" else 3)
        assert [row["booking_id"] for row in state.active_loans] == ([created["id"]] if verb == "checkout" else [])
    final = steps[-1][2]
    assert [(e["action"], e["priorState"], e["newState"]) for e in final["events"]] == [
        ("create", None, "pending"), ("approve", "pending", "approved"), ("checkout", "approved", "checked_out"), ("return", "checked_out", "returned")]
    assert [e["actorId"] for e in final["events"]] == [h.owner["user"]["id"]] + [h.coordinator["user"]["id"]] * 3
    assert [e["note"] for e in final["events"]] == [created["purpose"], "Reservation approved.", "Outgoing: complete kit, tested.", "Incoming: complete kit, no damage."]
    assert [e["timestamp"] for e in final["events"]] == [NOW.isoformat().replace("+00:00", "Z")] + [(NOW + timedelta(minutes=5 * n)).isoformat().replace("+00:00", "Z") for n in (1, 2, 3)]
    assert validate(request(h.app, path=f"{BASE}/{created['id']}", session=h.owner), "Booking") == final
    # A terminal record accepts nothing further and stays byte-identical.
    before = snap(h.repository)
    for verb in ACTIONS:
        expect_error(action(h, created["id"], verb, final["version"]), 409)
    error(h.cancel(created["id"], {"expectedVersion": final["version"]}), 409)
    assert_unchanged(before, snap(h.repository), "terminal booking")
    assert validate(request(h.app, path=f"{BASE}/{created['id']}", session=h.owner), "Booking") == final


@pytest.mark.parametrize("terminal", ["reject", "cancel-pending-owner", "cancel-approved-coordinator", "return"])
def test_slots_are_released_on_reject_cancel_and_return_and_the_dates_can_be_rebooked(h, terminal):
    first = validate(h.create(body(startDate=day(0), endDate=day(2))), "Booking", 201)
    assert len(snap(h.repository).slots) == 3
    version = 1
    if terminal in ("cancel-approved-coordinator", "return"):
        version = validate(action(h, first["id"], "approve", 1), "Booking")["version"]
    if terminal == "return":
        version = validate(action(h, first["id"], "checkout", version), "Booking")["version"]
    h.clock.value += timedelta(minutes=1)
    if terminal == "reject":
        done = validate(action(h, first["id"], "reject", version, note="Dates are reserved for a screening."), "Booking")
    elif terminal == "cancel-pending-owner":
        done = validate(h.cancel(first["id"], {"expectedVersion": version}), "Booking")
    elif terminal == "cancel-approved-coordinator":
        done = validate(h.cancel(first["id"], {"expectedVersion": version}, h.coordinator), "Booking")
    else:
        done = validate(action(h, first["id"], "return", version, note="Returned complete and working."), "Booking")
    state = snap(h.repository)
    assert not state.slots and not state.active_loans
    assert done["version"] == len(done["events"]) == len(state.events_of(first["id"]))  # history retained
    assert request(h.app, path=f"{BASE}/{first['id']}", session=h.owner).json() == done
    public = validate(request(h.app, path="/api/v1/assets/unit-a/availability"), "AssetAvailability")
    assert all(row["state"] == "available" for row in public["days"][:3])
    again = validate(h.create(body(startDate=day(0), endDate=day(2)), session=h.other), "Booking", 201)
    assert again["id"] != first["id"] and len(snap(h.repository).slots) == 3


def test_custody_is_unique_per_unit_and_an_overdue_loan_blocks_the_next_checkout_until_returned(h):
    a = validate(h.create(body(startDate=day(0), endDate=day(1))), "Booking", 201)
    validate(action(h, a["id"], "approve", 1), "Booking")
    validate(action(h, a["id"], "checkout", 2), "Booking")
    assert [row["booking_id"] for row in snap(h.repository).active_loans] == [a["id"]]
    # The same unit cannot be reserved again on the loaned days or checked out twice.
    error(h.create(body(startDate=day(0), endDate=day(0)), session=h.other), 409, dates=[day(0)])
    # Three days later the loan is overdue; a later, non-overlapping pickup is approved.
    h.clock.value = NOW + timedelta(days=3)
    relogin(h)
    b = validate(h.create(body(startDate=day(3), endDate=day(4)), session=h.other), "Booking", 201)
    validate(action(h, b["id"], "approve", 1), "Booking")
    overdue = desk(h)
    assert overdue["counts"] == {"pending": 0, "dueToday": 0, "overdue": 1}
    assert next(row for row in overdue["bookings"] if row["id"] == a["id"])["overdue"] is True
    before = snap(h.repository)
    blocked = expect_error(action(h, b["id"], "checkout", 2), 409)
    assert "on loan" in blocked["message"]
    assert_unchanged(before, snap(h.repository), "checkout blocked by an overdue loan")
    # An overdue return is allowed; only then can the next pickup proceed.
    validate(action(h, a["id"], "return", 3, note="Returned late but complete."), "Booking")
    assert not snap(h.repository).active_loans
    validate(action(h, b["id"], "checkout", 2), "Booking")
    assert [row["booking_id"] for row in snap(h.repository).active_loans] == [b["id"]]


def test_maintenance_outcomes_respect_commitments_and_block_new_requests(h):
    pending = validate(h.create(body(startDate=day(1), endDate=day(2))), "Booking", 201)
    before = snap(h.repository)
    expect_error(inventory(h, "PUT", "/unit-a/state", {"state": "maintenance"}), 409)  # pending commitment
    assert_unchanged(before, snap(h.repository), "maintenance vs pending")
    validate(action(h, pending["id"], "approve", 1), "Booking")
    before = snap(h.repository)
    expect_error(inventory(h, "PUT", "/unit-a/state", {"state": "maintenance"}), 409)  # approved commitment
    expect_error(inventory(h, "PUT", "/unit-a/state", {"state": "active"}), 409)       # already active
    assert_unchanged(before, snap(h.repository), "maintenance vs approved")
    validate(h.cancel(pending["id"], {"expectedVersion": 2}), "Booking")
    # A checked-out unit (even overdue) is blocked; a stale expired pending request is not.
    loan = fixture(h, "checked_out", -3, -2, booking_id="overdue-loan")
    stale = fixture(h, "pending", -3, -2, booking_id="expired-request", asset_id="unit-b")
    before = snap(h.repository)
    expect_error(inventory(h, "PUT", "/unit-a/state", {"state": "maintenance"}), 409)
    assert_unchanged(before, snap(h.repository), "maintenance vs overdue loan")
    done = validate(inventory(h, "PUT", "/unit-b/state", {"state": "maintenance"}), "Asset")
    assert done["state"] == "maintenance"
    assert next(row for row in snap(h.repository).bookings if row["id"] == stale.id)["state"] == "pending"  # history untouched
    # New requests on maintenance equipment are refused with no unavailable dates.
    before = snap(h.repository)
    error(h.create(body(assetId="unit-b", startDate=day(10), endDate=day(10))), 409, dates=[])
    assert_unchanged(before, snap(h.repository), "request on maintenance equipment")
    calendar = validate(request(h.app, path="/api/v1/assets/unit-b/availability"), "AssetAvailability")
    assert all(row["state"] == "maintenance" for row in calendar["days"])
    # Returning the loan unblocks maintenance; reactivation reopens bookings.
    validate(action(h, loan.id, "return", loan.version, note="Returned complete and working."), "Booking")
    assert validate(inventory(h, "PUT", "/unit-a/state", {"state": "maintenance"}), "Asset")["state"] == "maintenance"
    assert validate(inventory(h, "PUT", "/unit-b/state", {"state": "active"}), "Asset")["state"] == "active"
    validate(h.create(body(assetId="unit-b", startDate=day(10), endDate=day(10))), "Booking", 201)


@pytest.mark.parametrize("verb", ["approve", "reject", "checkout", "return", "cancel"])
def test_stale_versions_never_change_a_row_or_the_audit_history(h, verb):
    states = {"approve": "pending", "reject": "pending", "checkout": "approved", "return": "checked_out", "cancel": "approved"}
    record = fixture(h, states[verb])
    before = snap(h.repository)
    for version in (record.version - 1, record.version + 1, 2147483647):
        if version < 1:
            continue
        response = h.cancel(record.id, {"expectedVersion": version}, h.owner) if verb == "cancel" else action(h, record.id, verb, version, note="Complete working kit")
        expect_error(response, 409, {"expectedVersion"})
        assert_unchanged(before, snap(h.repository), f"stale {verb} {version}")
    current = h.cancel(record.id, {"expectedVersion": record.version}, h.owner) if verb == "cancel" else action(h, record.id, verb, record.version, note="Complete working kit")
    assert current.status_code == 200 and current.json()["version"] == record.version + 1


@pytest.mark.parametrize("verb,state", [(verb, state) for verb in ACTIONS for state in ("pending", "approved", "checked_out", "rejected", "cancelled", "returned") if state != RULES[verb][0]])
def test_invalid_and_terminal_transitions_preserve_every_row(h, verb, state):
    record = fixture(h, state)
    before = snap(h.repository)
    expect_error(action(h, record.id, verb, record.version, note="Complete working kit"), 409)
    assert_unchanged(before, snap(h.repository), f"{verb} on {state}")


def test_rejected_inputs_and_blocked_maintenance_or_inventory_changes_preserve_rows(h):
    pending = fixture(h, "pending")
    approved = fixture(h, "approved", 5, 6, booking_id="second", asset_id="unit-b")
    before = snap(h.repository)
    attempts = [
        (action(h, pending.id, "approve", 5), 409),                                 # stale version
        (action(h, pending.id, "reject", pending.version, note="no"), 422),        # note too short
        (action(h, "missing", "approve", 1), 404),
        (h.cancel(pending.id, {"expectedVersion": pending.version}, h.other), 404),  # not the owner
        (request(h.app, "POST", f"{STAFF}/bookings/{pending.id}/approve", session=h.owner, json={"expectedVersion": pending.version}), 403),
        (inventory(h, "PUT", "/unit-b/state", {"state": "maintenance"}), 409),
        (inventory(h, "PUT", "/unit-a/state", {"state": "retired"}), 422),
        (inventory(h, "POST", payload=asset_input(inventoryCode="unit-a")), 409),
        (inventory(h, "PUT", "/unit-b", asset_input(inventoryCode="UNIT-A")), 409),
        (inventory(h, "PUT", "/unit-a/state", {"state": "active"}), 409),
        (h.create(body(startDate=day(0), endDate=day(0)), session=h.other), 409),
        (h.create(body(purpose="bad"), session=h.other), 422),
        (h.create(body(assetId="no-such-unit"), session=h.other), 404),
    ]
    for response, status in attempts:
        assert response.status_code == status, (response.status_code, response.text)
        assert_unchanged(before, snap(h.repository), f"rejected request answered {status}")
    assert approved.state == "approved"


# ---------------------------------------------------------------- differential parity

UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
TOKEN = re.compile(r"[A-Za-z0-9_-]{43}")


def normalize(value, ids):
    text = json.dumps(value, sort_keys=True, ensure_ascii=False)
    for pattern, prefix in ((UUID, "id"), (TOKEN, "token")):
        for match in sorted(set(pattern.findall(text)), key=text.index):
            ids.setdefault(match, f"<{prefix}{len(ids)}>")
    for raw_value, label in ids.items():
        text = text.replace(raw_value, label)
    return text


def scripted_transcript(harness):
    """One fixed script; every response (status, Allow/WWW-Authenticate, body) is recorded."""
    log = []

    def note(label, response):
        log.append((label, response.status_code, response.headers.get("allow"), response.headers.get("www-authenticate"), response.json() if response.content else None))
        return response.json() if response.content else None

    a = note("create-a", harness.create(body(startDate=day(0), endDate=day(2))))
    note("overlap", harness.create(body(startDate=day(2), endDate=day(3)), session=harness.other))
    elsewhere = note("different-unit", harness.create(body(assetId="unit-b", startDate=day(0), endDate=day(2)), session=harness.other))
    note("adjacent", harness.create(body(startDate=day(3), endDate=day(3)), session=harness.other))
    note("owner-list", request(harness.app, path=BASE, session=harness.owner))
    note("foreign-detail", request(harness.app, path=f"{BASE}/{a['id']}", session=harness.other))
    note("stale-approve", action(harness, a["id"], "approve", 5))
    harness.clock.value += timedelta(minutes=3)
    note("approve", action(harness, a["id"], "approve", 1))
    note("repeat-approve", action(harness, a["id"], "approve", 2))
    note("cancel-stale", harness.cancel(a["id"], {"expectedVersion": 1}))
    note("checkout", action(harness, a["id"], "checkout", 2, note="Outgoing check complete"))
    note("maintenance-blocked", inventory(harness, "PUT", "/unit-a/state", {"state": "maintenance"}))
    note("desk", request(harness.app, path=f"{STAFF}/bookings", session=harness.coordinator))
    note("return", action(harness, a["id"], "return", 3, note="Incoming check complete"))
    note("availability", request(harness.app, path="/api/v1/assets/unit-a/availability"))
    note("maintenance-blocked-by-pending", inventory(harness, "PUT", "/unit-b/state", {"state": "maintenance"}))
    note("cancel-other", harness.cancel(elsewhere["id"], {"expectedVersion": 1}, harness.other))
    note("maintenance", inventory(harness, "PUT", "/unit-b/state", {"state": "maintenance"}))
    note("request-on-maintenance", harness.create(body(assetId="unit-b", startDate=day(5), endDate=day(5)), session=harness.other))
    note("inventory", inventory(harness))
    note("rebook", harness.create(body(startDate=day(0), endDate=day(0)), session=harness.other))
    note("logout", request(harness.app, "POST", "/api/v1/auth/logout", session=harness.owner))
    note("after-logout", request(harness.app, path=BASE, session=harness.owner))
    return log


def test_scripted_transcript_is_identical_for_memory_and_file_sqlite(tmp_path):
    memory = Harness(MemoryRepository())
    _, sql_repository = migrated_sqlite(tmp_path, "parity.sqlite3")
    try:
        sql = Harness(sql_repository)
        memory_log, sql_log = scripted_transcript(memory), scripted_transcript(sql)
        assert [entry[0] for entry in memory_log] == [entry[0] for entry in sql_log] and len(memory_log) == 23
        # Random ids/tokens differ per run; map them by first appearance in the whole script.
        memory_ids, sql_ids = {}, {}
        for left, right in zip(memory_log, sql_log):
            assert normalize(left, memory_ids) == normalize(right, sql_ids), left[0]
        assert any(entry[1] == 409 for entry in memory_log) and any(entry[1] == 404 for entry in memory_log)
        audit_store(memory.repository, club_today(memory.clock))
        audit_store(sql_repository, club_today(sql.clock))
    finally:
        sql_repository.close()
