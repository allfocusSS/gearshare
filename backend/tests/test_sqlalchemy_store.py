"""#11 targeted ORM/API checks; the full shared-store/restart campaign is #12."""

import asyncio
from contextlib import contextmanager
from dataclasses import replace
from datetime import timedelta
from threading import Barrier, Lock

import httpx
import pytest
from sqlalchemy import column, select, table, update

from app.database import DatabaseSettings
from app.domain import Asset, User
from app.errors import ApiError
from app.fixtures import seed_catalogue
from app.main import create_app
from app.models import AssetModel, Base, BookingModel
from app.repositories import TransactionRetry, retry_transaction
from app.sqlalchemy_store import SQLAlchemyRepository
from test_booking_api import BASE, NOW, TODAY, Harness, body, request
from test_catalogue_api import validate
from test_database_schema import migration_config
from test_staff_api import STAFF, action, asset_input, fixture
from alembic import command


def snapshot(repository):
    engine = getattr(repository, "underlying", repository).engine
    with engine.connect() as connection:
        return {table.name: tuple(tuple(row) for row in connection.execute(select(table).order_by(*table.primary_key)))
                for table in Base.metadata.sorted_tables}


@pytest.fixture
def store(tmp_path):
    settings = DatabaseSettings(f"sqlite:///{tmp_path / 'service.sqlite3'}", .5)
    command.upgrade(migration_config(settings.url), "head")
    repository = SQLAlchemyRepository(settings)
    yield repository
    repository.close()


@pytest.fixture
def h(store):
    return Harness(store)


def test_sql_api_lifecycle_auth_privacy_inventory_and_allocations(h):
    booking = validate(h.create(body(endDate=(TODAY + timedelta(days=2)).isoformat())), "Booking", 201)
    assert booking["version"] == len(booking["events"]) == 1
    assert len(snapshot(h.repository)["reservation_slots"]) == 3
    before = snapshot(h.repository)
    private = request(h.app, path=f"{BASE}/{booking['id']}", session=h.other)
    assert private.status_code == 404 and snapshot(h.repository) == before
    for verb, version, state in (("approve", 1, "approved"), ("checkout", 2, "checked_out"), ("return", 3, "returned")):
        result = validate(action(h, booking["id"], verb, version, note="Complete kit in good condition"), "Booking")
        assert result["version"] == len(result["events"]) == version + 1
        assert result["state"] == state
        current = snapshot(h.repository)
        assert len(current["active_loans"]) == (1 if verb == "checkout" else 0)
        assert len(current["reservation_slots"]) == (0 if verb == "return" else 3)
    rename = request(h.app, "PUT", STAFF + "/assets/unit-a", session=h.coordinator,
                     json=asset_input(inventoryCode=" changed ", name="Changed Camera"))
    assert rename.status_code == 200 and rename.json()["inventoryCode"] == "CHANGED"
    old = validate(request(h.app, path=f"{BASE}/{booking['id']}", session=h.owner), "Booking")
    assert old["assetName"] == booking["assetName"] and old["events"] == result["events"]
    assert request(h.app, "POST", "/api/v1/auth/logout", session=h.owner).status_code == 204
    assert request(h.app, path=f"{BASE}/{booking['id']}", session=h.owner).status_code == 401


def test_sql_api_conflicts_preserve_full_database_and_use_normalized_keys(h):
    booking = validate(h.create(body(endDate=(TODAY + timedelta(days=2)).isoformat())), "Booking", 201)
    before = snapshot(h.repository)
    conflict = h.create(body(startDate=(TODAY + timedelta(days=1)).isoformat(), endDate=(TODAY + timedelta(days=3)).isoformat()), h.other)
    assert conflict.status_code == 409
    assert conflict.json()["unavailableDates"] == [(TODAY + timedelta(days=i)).isoformat() for i in (1, 2)]
    duplicate = request(h.app, "POST", "/api/v1/auth/register", json={"username": " OWNER ", "password": "DifferentPassword42!"})
    assert duplicate.status_code == 409 and duplicate.json()["code"] == "USERNAME_TAKEN"
    duplicate = request(h.app, "POST", STAFF + "/assets", session=h.coordinator, json=asset_input(inventoryCode=" unit-a "))
    assert duplicate.status_code == 409 and set(duplicate.json()["fields"]) == {"inventoryCode"}
    assert snapshot(h.repository) == before
    validate(h.cancel(booking["id"]), "Booking")
    replacement = validate(h.create(session=h.other), "Booking", 201)
    assert replacement["id"] != booking["id"]


@pytest.mark.parametrize("verb,initial", [("approve", "pending"), ("reject", "pending"), ("checkout", "approved"), ("return", "checked_out"), ("cancel", "approved")])
def test_sql_stale_versions_and_invalid_notes_are_atomic_with_private_precedence(h, verb, initial):
    booking = fixture(h, initial)
    before = snapshot(h.repository)
    if verb == "cancel":
        response = h.cancel(booking.id, {"expectedVersion": 99}, h.owner)
    else:
        response = action(h, booking.id, verb, 99, note="")
    assert response.status_code == 409 and set(response.json()["fields"]) == {"expectedVersion"}
    private = h.cancel(booking.id, {"expectedVersion": 99}, h.other)
    assert private.status_code == 404
    assert snapshot(h.repository) == before


class FaultStore:
    def __init__(self, underlying):
        self.underlying = underlying
        self.fail_after = None

    @contextmanager
    def transaction(self):
        with self.underlying.transaction() as transaction:
            parent = self
            class Proxy:
                def __getattr__(self, name):
                    method = getattr(transaction, name)
                    def call(*args, **kwargs):
                        result = method(*args, **kwargs)
                        if parent.fail_after == name:
                            raise RuntimeError("Injected private SQL failure with no public details")
                        return result
                    return call
            yield Proxy()


@pytest.mark.parametrize("operation,method", [
    ("create", "add_booking"), ("create", "add_booking_event"), ("create", "add_slot"),
    ("approve", "replace_booking"), ("approve", "add_booking_event"),
    ("cancel", "release_slots"), ("checkout", "add_active_loan"),
    ("return", "remove_active_loan"), ("return", "release_slots"),
    ("add-asset", "add_asset"), ("edit-asset", "replace_asset"), ("maintenance", "replace_asset"),
])
def test_sql_api_failure_after_each_record_type_rolls_back_every_table(store, operation, method, caplog):
    fault = FaultStore(store)
    h = Harness(fault)
    booking = None
    if operation in {"approve", "cancel", "checkout", "return"}:
        booking = fixture(h, {"approve": "pending", "cancel": "pending", "checkout": "approved", "return": "checked_out"}[operation])
    before = snapshot(store)
    fault.fail_after = method
    if operation == "create":
        response = h.create(body(endDate=(TODAY + timedelta(days=2)).isoformat()))
    elif operation == "cancel":
        response = h.cancel(booking.id)
    elif operation == "add-asset":
        response = request(h.app, "POST", STAFF + "/assets", session=h.coordinator, json=asset_input())
    elif operation == "edit-asset":
        response = request(h.app, "PUT", STAFF + "/assets/unit-a", session=h.coordinator, json=asset_input())
    elif operation == "maintenance":
        response = request(h.app, "PUT", STAFF + "/assets/unit-a/state", session=h.coordinator, json={"state": "maintenance"})
    else:
        response = action(h, booking.id, operation, booking.version, note="Complete working kit")
    assert response.status_code == 500 and response.json()["code"] == "SERVICE_UNAVAILABLE"
    assert snapshot(store) == before
    assert "Injected" not in caplog.text and "Traceback" not in caplog.text


def test_persistent_fixture_marker_is_once_relative_and_preserves_existing_accounts(store):
    with store.transaction() as transaction:
        transaction.add_user(User("real", "real_owner", "student", "real-credential-must-survive"))
    seed_catalogue(store, lambda: NOW)
    before = snapshot(store)
    assert len(before["assets"]) == 10 and len(before["bookings"]) == 10
    # New repository/engine uses the same persisted marker; no account/password reset.
    reopened = SQLAlchemyRepository(DatabaseSettings(str(store.engine.url)))
    try:
        seed_catalogue(reopened, lambda: NOW + timedelta(days=20))
        assert snapshot(reopened) == before
        with reopened.transaction() as transaction:
            assert transaction.user_by_id("real").password_hash == "real-credential-must-survive"
            assert transaction.catalogue_seeded_on() == TODAY
            assert transaction.bookings()[0].start_date == TODAY + timedelta(days=2)
    finally:
        reopened.close()


def test_runtime_configuration_selects_only_explicit_store_modes(store, monkeypatch):
    monkeypatch.setenv("GEARSHARE_DATABASE_URL", str(store.engine.url))
    monkeypatch.setenv("GEARSHARE_STORE", "sqlalchemy")
    app = create_app(seed=False)
    assert isinstance(app.state.auth.repository, SQLAlchemyRepository)
    app.state.auth.repository.close()
    monkeypatch.setenv("GEARSHARE_STORE", "memory")
    app = create_app(seed=False)
    from app.memory import MemoryRepository
    assert isinstance(app.state.auth.repository, MemoryRepository)
    monkeypatch.setenv("GEARSHARE_STORE", "typo")
    with pytest.raises(ValueError, match="GEARSHARE_STORE"):
        create_app(seed=False)


def parallel(apps, calls):
    async def run():
        clients = [httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") for app in apps]
        try:
            return await asyncio.gather(*[client.request(method, path, headers={"Authorization": "Bearer " + session["token"]}, json=payload)
                for client, (method, path, session, payload) in zip(clients, calls)])
        finally:
            for client in clients:
                await client.aclose()
    return asyncio.run(run())


def synchronize_first_snapshot(monkeypatch, method):
    """Only first attempts wait. Retries must read a fresh DB snapshot freely."""
    from app.sqlalchemy_store import _Transaction
    original = getattr(_Transaction, method)
    barrier, guard, arrivals = Barrier(2), Lock(), []
    def read(self, *args, **kwargs):
        result = original(self, *args, **kwargs)
        with guard:
            wait = len(arrivals) < 2
            if wait:
                arrivals.append(id(self))
        if wait:
            barrier.wait(timeout=10)
        return result
    monkeypatch.setattr(_Transaction, method, read)


def second_app(h):
    repository = SQLAlchemyRepository(DatabaseSettings(str(h.repository.engine.url), .5))
    return repository, create_app(repository=repository, seed=False, clock=h.clock, passwords=h.app.state.auth.passwords)


def test_sql_shared_availability_version_rechecks_maintenance_booking_race(h, monkeypatch):
    repository2, app2 = second_app(h)
    try:
        synchronize_first_snapshot(monkeypatch, "asset_by_id")
        responses = parallel([h.app, app2], [
            ("PUT", STAFF + "/assets/unit-a/state", h.coordinator, {"state": "maintenance"}),
            ("POST", BASE, h.owner, body()),
        ])
        assert sorted(r.status_code for r in responses) in ([200, 409], [201, 409])
        current = snapshot(h.repository)
        with h.repository.transaction() as transaction:
            asset = transaction.asset_by_id("unit-a")
            bookings = transaction.bookings()
        assert (asset.state == "maintenance" and not bookings) or (asset.state == "active" and len(bookings) == 1)
        assert len(current["booking_events"]) == len(current["reservation_slots"]) == len(bookings)
        loser = next(r for r in responses if r.status_code == 409)
        if responses[0].status_code == 200:
            assert loser.json()["unavailableDates"] == []
        else:
            assert "Maintenance is blocked" in loser.json()["message"]
    finally:
        repository2.close()


def test_sql_expected_version_state_cas_with_two_repositories(h, monkeypatch):
    booking = validate(h.create(), "Booking", 201)
    repository2, app2 = second_app(h)
    try:
        synchronize_first_snapshot(monkeypatch, "booking_by_id")
        responses = parallel([h.app, app2], [
            ("POST", STAFF + f"/bookings/{booking['id']}/approve", h.coordinator, {"expectedVersion": 1}),
            ("POST", BASE + f"/{booking['id']}/cancel", h.owner, {"expectedVersion": 1}),
        ])
        assert sorted(r.status_code for r in responses) == [200, 409]
        loser = next(r for r in responses if r.status_code == 409)
        assert set(loser.json()["fields"]) == {"expectedVersion"}
        result = validate(request(h.app, path=BASE + "/" + booking["id"], session=h.owner), "Booking")
        assert result["version"] == len(result["events"]) == 2
        assert len(snapshot(h.repository)["reservation_slots"]) == (result["state"] == "approved")
    finally:
        repository2.close()


@pytest.mark.parametrize("drift", [{"version": 2}, {"state": "cancelled"}])
def test_cas_predicate_rejects_changed_version_or_state_inside_adapter(store, drift):
    h = Harness(store)
    booking = validate(h.create(), "Booking", 201)
    before = snapshot(store)
    with pytest.raises(TransactionRetry), store.transaction() as transaction:
        previous = transaction.booking_by_id(booking["id"])
        # A controlled DB-side change after the adapter read exercises the actual
        # conditional UPDATE result; the enclosing failure rolls this probe back.
        transaction.session.execute(update(BookingModel).where(BookingModel.id == previous.id).values(**drift))
        transaction.replace_booking(replace(previous, state="approved", version=2))
    assert snapshot(store) == before


def test_unexpected_db_error_is_safe_500_not_conflict_and_busy_retry_is_bounded(h, monkeypatch, caplog):
    from app.sqlalchemy_store import _Transaction
    original = _Transaction.add_booking
    def broken(self, booking):
        missing = table("private_missing_table_SECRET", column("private_value"))
        self.session.execute(select(missing.c.private_value))
    monkeypatch.setattr(_Transaction, "add_booking", broken)
    before = snapshot(h.repository)
    response = h.create()
    assert response.status_code == 500 and response.json()["code"] == "SERVICE_UNAVAILABLE"
    assert snapshot(h.repository) == before and "SECRET" not in caplog.text
    monkeypatch.setattr(_Transaction, "add_booking", original)
    attempts = []
    @retry_transaction
    def always_contended():
        attempts.append(1)
        raise TransactionRetry()
    with pytest.raises(ApiError) as caught:
        always_contended()
    assert caught.value.status == 503 and len(attempts) == 4


def test_sql_overlapping_new_requests_retry_then_report_only_unavailable_dates(h, monkeypatch):
    repository2, app2 = second_app(h)
    try:
        synchronize_first_snapshot(monkeypatch, "asset_by_id")
        responses = parallel([h.app, app2], [
            ("POST", BASE, h.owner, body()), ("POST", BASE, h.other, body()),
        ])
        assert sorted(r.status_code for r in responses) == [201, 409]
        loser = next(r for r in responses if r.status_code == 409)
        assert loser.json()["unavailableDates"] == [TODAY.isoformat()]
        assert set(loser.json()) == {"code", "message", "unavailableDates"}
        current = snapshot(h.repository)
        assert len(current["bookings"]) == len(current["booking_events"]) == len(current["reservation_slots"]) == 1
    finally:
        repository2.close()


def test_sql_busy_writer_is_bounded_safe_service_unavailable_not_unknown_database_failure(h):
    before = snapshot(h.repository)
    with h.repository.engine.begin() as connection:
        connection.execute(update(AssetModel).values(name=AssetModel.name))
        response = h.create()
        assert response.status_code == 503 and response.json()["code"] == "SERVICE_UNAVAILABLE"
        assert set(response.json()) == {"code", "message"}
        assert "sqlite" not in response.text.lower() and "locked" not in response.text.lower()
    assert snapshot(h.repository) == before
