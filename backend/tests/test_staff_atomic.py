"""#10: complete transaction failures and simultaneous service/API contenders."""

import asyncio
import copy
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from threading import Barrier, Event

import httpx
import pytest

from app.auth import token_hash
from app.domain import Asset
from app.main import create_app
from app.memory import MemoryRepository
from test_booking_api import BASE, NOW, Harness, FailingRepository, body, request
from test_catalogue_api import validate
from test_staff_api import STAFF, ACTIONS, RULES, action, asset_input, desk, expect_error, fixture, inventory


@pytest.mark.parametrize("verb,method", [(verb, method) for verb in ACTIONS for method in ("replace_booking", "add_booking_event")] + [("reject", "release_slots"), ("checkout", "add_active_loan"), ("return", "remove_active_loan"), ("return", "release_slots")])
def test_failure_after_every_transition_write_restores_every_shared_map_and_all_timestamps(verb, method, caplog):
    repository = FailingRepository()
    h = Harness(repository)
    booking = fixture(h, RULES[verb][0])
    before = h.snapshot()
    repository.fail_after = method
    expect_error(action(h, booking.id, verb, booking.version), 500)
    assert repository.calls == 1 and h.snapshot() == before
    assert "Injected" not in caplog.text and "Traceback" not in caplog.text
    repository.fail_after = None
    updated = validate(action(h, booking.id, verb, booking.version), "Booking")
    assert updated["version"] == booking.version + 1


@pytest.mark.parametrize("operation,method", [("add", "add_asset"), ("edit", "replace_asset"), ("state", "replace_asset")])
def test_inventory_failure_after_write_rolls_back_asset_index_and_history(operation, method):
    repository = FailingRepository()
    h = Harness(repository)
    fixture(h, "returned", -2, -1)
    before = h.snapshot()
    repository.fail_after = method
    def command():
        if operation == "add":
            return inventory(h, "POST", payload=asset_input())
        if operation == "edit":
            return inventory(h, "PUT", "/unit-a", asset_input(inventoryCode="fresh-code"))
        return inventory(h, "PUT", "/unit-a/state", {"state": "maintenance"})
    expect_error(command(), 500)
    assert h.snapshot() == before and repository.calls == 1
    repository.fail_after = None
    validate(command(), "Asset", 201 if operation == "add" else 200)
    after = h.snapshot()
    assert after.bookings == before.bookings and after.events == before.events and after.slots == before.slots


def simultaneous(h, monkeypatch, targets, calls, *, first=None):
    """Synchronize before adapter-lock entry; optionally force both legal orders."""
    barrier = Barrier(len(calls))
    committed = Event()
    for index, (service, method) in enumerate(targets):
        original = getattr(service, method)
        def contender(*args, _original=original, _index=index, **kwargs):
            barrier.wait(timeout=10)
            if first is not None and _index != first:
                assert committed.wait(timeout=10)
            try:
                return _original(*args, **kwargs)
            finally:
                if first is not None and _index == first:
                    committed.set()
        monkeypatch.setattr(service, method, contender)
    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=h.app), base_url="http://test") as client:
            return await asyncio.gather(*[client.request(method, path, headers={"Authorization": f"Bearer {session['token']}"}, json=payload) for method, path, session, payload in calls])
    return asyncio.run(run())


@pytest.mark.parametrize("first", [None, 0, 1])
def test_s03_simultaneous_approve_and_owner_cancel_one_event_with_both_serial_orders(monkeypatch, first):
    h = Harness()
    booking = validate(h.create(), "Booking", 201)
    payload = {"expectedVersion": 1}
    calls = [("POST", f"{STAFF}/bookings/{booking['id']}/approve", h.coordinator, payload), ("POST", f"{BASE}/{booking['id']}/cancel", h.owner, payload)]
    responses = simultaneous(h, monkeypatch, [(h.app.state.staff, "transition"), (h.app.state.bookings, "cancel_booking")], calls, first=first)
    assert sorted(response.status_code for response in responses) == [200, 409]
    if first is not None:
        assert responses[first].status_code == 200
    winner = validate(next(response for response in responses if response.status_code == 200), "Booking")
    expect_error(next(response for response in responses if response.status_code == 409), 409, {"expectedVersion"})
    assert winner["version"] == len(winner["events"]) == 2
    snapshot = h.snapshot()
    assert len(snapshot.events) == 2 and len(snapshot.bookings) == 1
    assert snapshot.bookings[booking["id"]].state == winner["state"]
    assert bool(snapshot.slots) == (winner["state"] == "approved")
    assert winner["events"][-1]["actorId"] == (h.coordinator if winner["state"] == "approved" else h.owner)["user"]["id"]


def test_s07_simultaneous_checkout_same_physical_unit_one_custody_record_one_event(monkeypatch):
    h = Harness()
    booking = fixture(h, "approved")
    # A single method handles two real concurrent HTTP clients.
    barrier = Barrier(2)
    original = h.app.state.staff.transition
    def contender(*args, **kwargs):
        barrier.wait(timeout=10)
        return original(*args, **kwargs)
    monkeypatch.setattr(h.app.state.staff, "transition", contender)
    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=h.app), base_url="http://test") as client:
            return await asyncio.gather(*[client.post(f"{STAFF}/bookings/{booking.id}/checkout", headers={"Authorization": f"Bearer {h.coordinator['token']}"}, json={"expectedVersion": booking.version, "note": "Complete working kit"}) for _ in range(2)])
    responses = asyncio.run(run())
    assert sorted(response.status_code for response in responses) == [200, 409]
    expect_error(next(response for response in responses if response.status_code == 409), 409, {"expectedVersion"})
    result = validate(next(response for response in responses if response.status_code == 200), "Booking")
    assert result["state"] == "checked_out" and result["version"] == len(result["events"]) == 3
    snapshot = h.snapshot()
    assert len(snapshot.active_loans) == 1 and snapshot.active_loans["unit-a"].booking_id == booking.id
    assert len(snapshot.events) == 3 and len(snapshot.slots) == 3


@pytest.mark.parametrize("first", [None, 0, 1])
def test_i03_simultaneous_maintenance_and_new_booking_one_coherent_winner(monkeypatch, first):
    h = Harness()
    calls = [("PUT", STAFF + "/assets/unit-a/state", h.coordinator, {"state": "maintenance"}), ("POST", BASE, h.owner, body())]
    responses = simultaneous(h, monkeypatch, [(h.app.state.staff, "set_asset_state"), (h.app.state.bookings, "request_booking")], calls, first=first)
    assert sorted(response.status_code for response in responses) in ([200, 409], [201, 409])
    if first is not None:
        assert responses[first].status_code in (200, 201)
    snapshot = h.snapshot()
    if responses[0].status_code == 200:
        validate(responses[0], "Asset")
        expect_error(responses[1], 409, dates=[])
        assert snapshot.assets["unit-a"].state == "maintenance"
        assert not snapshot.bookings and not snapshot.events and not snapshot.slots
    else:
        expect_error(responses[0], 409)
        booking = validate(responses[1], "Booking", 201)
        assert snapshot.assets["unit-a"].state == "active"
        assert len(snapshot.bookings) == len(snapshot.events) == len(snapshot.slots) == 1
        assert snapshot.slots[("unit-a", snapshot.bookings[booking["id"]].start_date)].booking_id == booking["id"]


def test_i01_simultaneous_duplicate_normalized_codes_have_one_creation(monkeypatch):
    h = Harness()
    barrier = Barrier(2)
    original = h.app.state.staff.add_asset
    def contender(*args, **kwargs):
        barrier.wait(timeout=10)
        return original(*args, **kwargs)
    monkeypatch.setattr(h.app.state.staff, "add_asset", contender)
    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=h.app), base_url="http://test") as client:
            return await asyncio.gather(*[client.post(STAFF + "/assets", headers={"Authorization": f"Bearer {h.coordinator['token']}"}, json=asset_input(inventoryCode=code)) for code in ("duplicate-ß", " DUPLICATE-ss ")])
    responses = asyncio.run(run())
    assert sorted(response.status_code for response in responses) == [201, 409]
    expect_error(next(response for response in responses if response.status_code == 409), 409, {"inventoryCode"})
    snapshot = h.snapshot()
    assert len(snapshot.assets) == len(snapshot.inventory_codes) == 4
    assert len([asset for asset in snapshot.assets.values() if asset.inventory_code == "DUPLICATE-SS"]) == 1


class CountingRepository:
    def __init__(self):
        self.underlying = MemoryRepository()
        self.calls = 0

    @contextmanager
    def transaction(self):
        self.calls += 1
        with self.underlying.transaction() as transaction:
            yield transaction


def test_desk_reads_one_repository_snapshot_and_one_club_day_across_midnight():
    repository = CountingRepository()
    h = Harness(repository)
    fixture(h, "checked_out", -1, 0, booking_id="loan")
    fixture(h, "pending", 2, 3, booking_id="later")
    class CrossingClock:
        calls = 0
        def __call__(self):
            self.calls += 1
            return datetime(2026, 10, 22, 18, 59, 59, tzinfo=UTC) if self.calls <= 2 else datetime(2026, 10, 22, 19, tzinfo=UTC)
    clock = CrossingClock()
    h.app.state.auth.clock = h.app.state.staff.clock = clock
    repository.calls = 0
    result = desk(h)
    assert repository.calls == 2  # HTTP session check, then complete desk read.
    assert clock.calls == 3  # HTTP session, transactional session, one business date.
    assert result["today"] == "2026-10-23"
    assert result["counts"] == {"pending": 1, "dueToday": 0, "overdue": 1}
    assert all(row["currentlyOnLoan"] for row in result["bookings"])
    assert [row["overdue"] for row in result["bookings"]] == [True, False]


def test_staff_service_rechecks_revocation_and_role_in_transaction_after_http_dependency(monkeypatch):
    h = Harness()
    booking = fixture(h, "pending")
    original = h.app.state.staff.transition
    before = h.snapshot()
    def revoke_then_command(*args, **kwargs):
        with h.repository.transaction() as transaction:
            transaction.delete_session(token_hash(h.coordinator["token"]))
        return original(*args, **kwargs)
    monkeypatch.setattr(h.app.state.staff, "transition", revoke_then_command)
    expect_error(action(h, booking.id, "approve", booking.version), 401)
    after = h.snapshot()
    assert after.bookings == before.bookings and after.events == before.events and after.slots == before.slots
    assert len(after.sessions) == len(before.sessions) - 1


def test_shared_repository_retained_transactions_cannot_mutate_inventory_custody_or_events():
    h = Harness()
    booking = fixture(h, "checked_out")
    with h.repository.transaction() as retained:
        original = retained.asset_by_id("unit-a")
        old_loan = retained.active_loan_by_asset("unit-a")
    before = h.snapshot()
    retained.remove_active_loan("unit-a", booking.id)
    retained.replace_asset(Asset("unit-a", "CHANGED", "New name", "Audio", "", "New desk"))
    retained.release_slots(booking.id)
    assert h.snapshot() == before
    assert old_loan == before.active_loans["unit-a"] and original == before.assets["unit-a"]
