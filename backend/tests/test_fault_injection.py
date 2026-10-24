"""#12: controlled failures inside a transaction leave no trace, in BOTH stores.

* ``FaultyStore`` wraps either repository and raises after the k-th call of one
  repository method (for example after 2 of 4 day-slots, after the create event,
  after the loan insert). The same cases run against memory and migrated
  file-SQLite.
* SQLite additionally gets faults injected at the DBAPI statement level (the k-th
  ``INSERT INTO reservation_slots`` raises ``disk I/O error``) and a REAL storage
  failure (``PRAGMA max_page_count`` makes the database file refuse to grow).

For every failure the client must receive the contract ``Error`` envelope (500,
``SERVICE_UNAVAILABLE``, no internals), the complete physical state (every row,
event, slot, loan, version and the SQL availability counter) must equal the
state before the request, the auditor must pass, and the same valid request must
succeed once the fault is removed.
"""

import sqlite3
from collections import Counter
from contextlib import contextmanager
from datetime import timedelta
from pathlib import Path

import pytest
from sqlalchemy import event

from app.calendar import club_today
from app.database import DatabaseSettings
from app.memory import MemoryRepository
from app.sqlalchemy_store import SQLAlchemyRepository
from invariants import assert_unchanged, audit_store, read_store
from persistence_support import Template, create_call, migrated_sqlite
from test_booking_api import BASE, NOW, TODAY, Harness, body, day, request
from test_catalogue_api import validate
from test_staff_api import STAFF, action, asset_input, expect_error, fixture, inventory

pytestmark = pytest.mark.persistence
LEAKS = ("Injected", "disk I/O", "Traceback", "sqlite", "SQLite", "reservation_slots", "INSERT", ".sqlite3", "OperationalError")


class InjectedFailure(RuntimeError):
    pass


class FaultyStore:
    """Wrap any repository; raise after the ``call``-th use of ``method`` in a transaction."""

    def __init__(self, underlying):
        self.underlying = underlying
        self.rule = None
        self.triggered = 0

    def arm(self, method, call):
        self.rule, self.triggered = (method, call), 0

    def disarm(self):
        self.rule = None

    @contextmanager
    def transaction(self):
        with self.underlying.transaction() as inner:
            calls, outer = Counter(), self

            class Proxy:
                def __getattr__(self, name):
                    target = getattr(inner, name)
                    if not callable(target):
                        return target

                    def call(*args, **kwargs):
                        result = target(*args, **kwargs)
                        calls[name] += 1
                        if outer.rule == (name, calls[name]):
                            outer.triggered += 1
                            raise InjectedFailure("Injected private failure with no public details")
                        return result
                    return call

            yield Proxy()


@pytest.fixture(params=["memory", "sqlite"])
def kind(request):
    return request.param


@pytest.fixture
def store(kind, tmp_path):
    if kind == "memory":
        yield MemoryRepository()
    else:
        _, repository = migrated_sqlite(tmp_path, "fault.sqlite3")
        yield repository
        repository.close()


@pytest.fixture
def faulty(store):
    return FaultyStore(store)


@pytest.fixture
def h(faulty):
    harness = Harness(faulty)
    yield harness
    audit_store(faulty, club_today(harness.clock), "after fault scenario")


def assert_safe_500(response, caplog):
    expect_error(response, 500)
    assert response.json() == {"code": "SERVICE_UNAVAILABLE", "message": "The service is temporarily unavailable. Try again."}
    assert not [leak for leak in LEAKS if leak in response.text]
    assert "Traceback" not in caplog.text and "Injected" not in caplog.text and "disk I/O" not in caplog.text


def snap(store):
    return read_store(store)


# (operation, repository method, k): fail after the k-th call of that method
CREATE = [("create", "add_booking", 1), ("create", "add_booking_event", 1)] + [("create", "add_slot", k) for k in (1, 2, 3, 4)]
TRANSITIONS = [
    ("approve", "replace_booking", 1), ("approve", "add_booking_event", 1),
    ("reject", "replace_booking", 1), ("reject", "add_booking_event", 1), ("reject", "release_slots", 1),
    ("cancel-approved", "replace_booking", 1), ("cancel-approved", "add_booking_event", 1), ("cancel-approved", "release_slots", 1),
    ("checkout", "replace_booking", 1), ("checkout", "add_booking_event", 1), ("checkout", "add_active_loan", 1),
    ("return", "replace_booking", 1), ("return", "add_booking_event", 1), ("return", "remove_active_loan", 1), ("return", "release_slots", 1),
]
OTHERS = [
    ("maintenance", "replace_asset", 1), ("add-asset", "add_asset", 1), ("edit-asset", "replace_asset", 1),
    ("register", "add_user", 1), ("register", "add_session", 1), ("login", "add_session", 1), ("logout", "delete_session", 1),
]


def prepare(h, operation):
    """Return (callable producing the response, expected success status)."""
    states = {"approve": "pending", "reject": "pending", "cancel-approved": "approved", "checkout": "approved", "return": "checked_out"}
    if operation == "create":
        return (lambda: h.create(body(startDate=day(0), endDate=day(3)))), 201
    if operation in states:
        record = fixture(h, states[operation])
        verbs = {"approve": "approve", "reject": "reject", "checkout": "checkout", "return": "return"}
        if operation == "cancel-approved":
            return (lambda: h.cancel(record.id, {"expectedVersion": record.version})), 200
        return (lambda: action(h, record.id, verbs[operation], record.version, note="Complete working kit")), 200
    if operation == "maintenance":
        return (lambda: inventory(h, "PUT", "/unit-a/state", {"state": "maintenance"})), 200
    if operation == "add-asset":
        return (lambda: inventory(h, "POST", payload=asset_input())), 201
    if operation == "edit-asset":
        return (lambda: inventory(h, "PUT", "/unit-a", asset_input(inventoryCode="fresh-code"))), 200
    if operation == "register":
        return (lambda: request(h.app, "POST", "/api/v1/auth/register", json={"username": "newcomer", "password": "StudentPassword42!"})), 201
    if operation == "login":
        return (lambda: request(h.app, "POST", "/api/v1/auth/login", json={"username": "owner", "password": "StudentPassword42!"})), 200
    if operation == "logout":
        return (lambda: request(h.app, "POST", "/api/v1/auth/logout", session=h.other)), 204
    raise AssertionError(operation)


@pytest.mark.parametrize("operation,method,call", CREATE + TRANSITIONS + OTHERS, ids=lambda value: str(value))
def test_failure_after_part_of_an_operation_rolls_back_everything_and_a_retry_succeeds(h, faulty, caplog, operation, method, call):
    perform, success = prepare(h, operation)
    before = snap(faulty)
    faulty.arm(method, call)
    response = perform()
    assert faulty.triggered == 1, "the injected fault must actually fire"
    assert_safe_500(response, caplog)
    assert_unchanged(before, snap(faulty), f"{operation} failed after {method} #{call}")
    audit_store(faulty, club_today(h.clock), "after rolled back failure")
    faulty.disarm()
    retry = perform()
    assert retry.status_code == success, retry.text
    after = snap(faulty)
    if operation == "create":
        created = validate(retry, "Booking", 201)
        assert created["version"] == len(created["events"]) == 1
        assert (len(after.bookings), len(after.events), len(after.slots)) == (1, 1, 4)
    elif operation in {"approve", "reject", "cancel-approved", "checkout", "return"}:
        row = next(item for item in after.bookings if item["id"] == "staff-history")
        assert row["version"] == len(after.events_of("staff-history")) == next(item for item in before.bookings if item["id"] == "staff-history")["version"] + 1


def test_failure_after_k_of_n_slots_never_leaves_a_partial_allocation_and_other_dates_stay_bookable(h, faulty, caplog):
    before = snap(faulty)
    for k in (1, 2, 3, 4, 5, 6, 7):
        faulty.arm("add_slot", k)
        assert_safe_500(h.create(body(startDate=day(0), endDate=day(7))), caplog)
        state = snap(faulty)
        assert_unchanged(before, state, f"{k} of 8 slots")
        assert not state.slots and not state.bookings and not state.events
        public = validate(request(h.app, path="/api/v1/assets/unit-a/availability"), "AssetAvailability")
        assert all(row["state"] == "available" for row in public["days"][:8])
    faulty.disarm()
    # Another student can take any of those dates, then the original dates conflict only on theirs.
    validate(h.create(body(startDate=day(3), endDate=day(3)), session=h.other), "Booking", 201)
    expect = h.create(body(startDate=day(0), endDate=day(7)))
    assert expect.status_code == 409 and expect.json()["unavailableDates"] == [day(3)]


def test_a_failed_request_never_changes_the_version_or_history_of_an_existing_booking(h, faulty, caplog):
    first = validate(h.create(), "Booking", 201)
    for verb, method, call in (("approve", "replace_booking", 1), ("approve", "add_booking_event", 1)):
        before = snap(faulty)
        faulty.arm(method, call)
        assert_safe_500(action(h, first["id"], verb, 1), caplog)
        after = snap(faulty)
        assert_unchanged(before, after)
        assert after.booking(first["id"])["version"] == 1 and len(after.events_of(first["id"])) == 1
        assert request(h.app, path=f"{BASE}/{first['id']}", session=h.owner).json() == first
    faulty.disarm()
    approved = validate(action(h, first["id"], "approve", 1), "Booking")
    assert approved["version"] == len(approved["events"]) == 2


def test_failed_maintenance_keeps_the_unit_active_with_its_commitments_and_history(h, faulty, caplog):
    booking = fixture(h, "returned", -3, -2)
    before = snap(faulty)
    faulty.arm("replace_asset", 1)
    assert_safe_500(inventory(h, "PUT", "/unit-a/state", {"state": "maintenance"}), caplog)
    assert_unchanged(before, snap(faulty))
    faulty.disarm()
    validate(h.create(), "Booking", 201)  # still active and bookable
    assert snap(faulty).booking(booking.id)["state"] == "returned"


# ------------------------------------------------------------ SQLite statement level and real storage faults

@pytest.fixture
def sql_h(tmp_path):
    _, repository = migrated_sqlite(tmp_path, "statement-fault.sqlite3")
    harness = Harness(repository)
    yield harness
    audit_store(repository, club_today(harness.clock), "after statement fault scenario")
    repository.close()


class StatementFault:
    """Raise a DBAPI ``disk I/O error`` on the n-th statement starting with ``prefix``."""

    def __init__(self, engine, prefix, nth):
        self.prefix, self.nth, self.seen, self.fired, self.active = prefix, nth, 0, 0, True
        event.listen(engine, "do_execute", self.hook)
        self.engine = engine

    def hook(self, cursor, statement, parameters, context):
        if self.active and statement.lstrip().upper().startswith(self.prefix):
            self.seen += 1
            if self.seen == self.nth:
                self.fired += 1
                raise sqlite3.OperationalError("disk I/O error")

    def remove(self):
        self.active = False
        event.remove(self.engine, "do_execute", self.hook)


STATEMENTS = (
    [("create", "INSERT INTO BOOKINGS", 1), ("create", "INSERT INTO BOOKING_EVENTS", 1), ("create", "UPDATE ASSETS", 1)]
    + [("create", "INSERT INTO RESERVATION_SLOTS", n) for n in (1, 2, 3, 4)]
    + [("approve", "UPDATE BOOKINGS", 1), ("approve", "INSERT INTO BOOKING_EVENTS", 1), ("approve", "UPDATE ASSETS", 1),
       ("reject", "DELETE FROM RESERVATION_SLOTS", 1), ("checkout", "INSERT INTO ACTIVE_LOANS", 1),
       ("return", "DELETE FROM ACTIVE_LOANS", 1), ("return", "DELETE FROM RESERVATION_SLOTS", 1)]
)


@pytest.mark.parametrize("operation,prefix,nth", STATEMENTS, ids=lambda value: str(value).replace(" ", "-"))
def test_sqlite_statement_failure_mid_transaction_rolls_back_every_table(sql_h, caplog, operation, prefix, nth):
    h = sql_h
    states = {"approve": "pending", "reject": "pending", "checkout": "approved", "return": "checked_out"}
    if operation == "create":
        def perform():
            return h.create(body(startDate=day(0), endDate=day(3)))
    else:
        record = fixture(h, states[operation])
        verb = operation

        def perform():
            return action(h, record.id, verb, record.version, note="Complete working kit")
    before = read_store(h.repository)
    fault = StatementFault(h.repository.engine, prefix, nth)
    try:
        response = perform()
        assert fault.fired == 1, f"{prefix} #{nth} never ran"
    finally:
        fault.remove()
    assert_safe_500(response, caplog)
    assert_unchanged(before, read_store(h.repository), f"{operation}: {prefix} #{nth} failed")
    retry = perform()
    assert retry.status_code in (200, 201), retry.text


def test_a_real_full_database_file_fails_a_write_cleanly_and_recovers_when_space_returns(tmp_path, caplog, monkeypatch):
    """No mock: PRAGMA max_page_count stops the file growing, so SQLite itself reports SQLITE_FULL."""
    import app.api as api

    causes = []
    original = api.unexpected_response

    def spy():  # test-only observation of the private cause; the client still gets the safe envelope
        import sys
        causes.append(str(sys.exc_info()[1]))
        return original()
    monkeypatch.setattr(api, "unexpected_response", spy)
    template = Template(tmp_path, students=3, extra_assets=tuple((f"unit-{letter}", f"UNIT-{letter.upper()}", "active") for letter in "cdefgh"))
    env = template.fresh(tmp_path, 0)
    path = env.url.removeprefix("sqlite:///")
    pages = sqlite3.connect(path).execute("PRAGMA page_count").fetchone()[0]
    limited, app = env.stack()

    @event.listens_for(limited.engine, "connect")
    def cap(connection, _record):
        connection.execute(f"PRAGMA max_page_count = {pages}")

    units = ["unit-a", "unit-b"] + [f"unit-{letter}" for letter in "cdefgh"]
    acknowledged, failure = [], None
    try:
        for offset in range(80):
            for unit in units:
                before = read_store(limited)
                response = request(app, "POST", BASE, session=template.students[offset % 3], json=body(assetId=unit, startDate=day(offset), endDate=day(offset)))
                if response.status_code == 201:
                    acknowledged.append(response.json()["id"])
                    continue
                failure = (response, before)
                break
            if failure:
                break
        assert failure is not None, "the capped database never filled; enlarge the loop"
        response, before = failure
        assert_safe_500(response, caplog)
        assert "full" not in response.text.lower()
        assert len(causes) == 1 and "database or disk is full" in causes[0], causes
        after = read_store(limited)
        assert_unchanged(before, after, "write refused by a full database file")
        audit_store(limited, TODAY, "after SQLITE_FULL")
        assert {row["id"] for row in after.bookings} == set(acknowledged)
        assert request(app, path="/api/v1/assets").status_code == 200  # reads keep working
    finally:
        env.close()
    # Space returns (a repository without the cap): the same request now succeeds.
    recovered, recovered_app = SQLAlchemyRepository(DatabaseSettings(env.url)), None
    try:
        from app.main import create_app
        from test_booking_api import FastPasswords, Clock
        recovered_app = create_app(repository=recovered, seed=False, clock=Clock(NOW), passwords=FastPasswords())
        retry = request(recovered_app, "POST", BASE, session=template.students[0], json=body(assetId="unit-h", startDate=day(85), endDate=day(85)))
        assert retry.status_code == 201, retry.text
        state = audit_store(recovered, TODAY, "after recovery")
        assert len(state.bookings) == len(acknowledged) + 1
    finally:
        recovered.close()
