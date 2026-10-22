"""Immutable records, repository boundary and coherent trusted fixture history."""

from contextlib import contextmanager
from dataclasses import FrozenInstanceError, replace
from datetime import UTC, datetime, timedelta

import pytest

from app.auth import AuthService, token_hash
from app.bookings import BookingService
from app.calendar import CLUB_ZONE
from app.domain import CANCEL_NOTE, RESERVING_STATES, Session
from app.main import create_app
from app.memory import MemoryRepository
from test_booking_api import Clock, Harness, NOW, TODAY, body, request
from test_catalogue_api import validate


def test_private_dto_and_retained_transaction_cannot_mutate_booking_or_event_history():
    h = Harness()
    original = validate(h.create(body(endDate=(TODAY + timedelta(days=2)).isoformat())), "Booking", 201)
    before = h.snapshot()
    with h.repository.transaction() as retained:
        booking = retained.booking_by_id(original["id"])
        event = retained.booking_events(original["id"])[0]
        with pytest.raises(FrozenInstanceError):
            booking.state = "returned"
        with pytest.raises(FrozenInstanceError):
            event.note = "Changed"
        with pytest.raises(FrozenInstanceError):
            retained.state.slots[("unit-a", TODAY)].booking_id = "Changed"
    retained.replace_booking(replace(booking, purpose="Retained transaction change"))
    retained.release_slots(booking.id)
    original["events"][0]["note"] = "Changed DTO"
    original["events"].clear()
    original["assetName"] = "Changed DTO"
    assert h.snapshot() == before
    fresh = validate(request(h.app, path=f"/api/v1/bookings/{booking.id}", session=h.owner), "Booking")
    assert fresh["events"][0]["note"] == "Student film session" and fresh["assetName"] == "Film 🎥 Camera"


def test_booking_snapshot_name_survives_trusted_inventory_change_without_rewriting_history():
    h = Harness()
    booking = validate(h.create(), "Booking", 201)
    stored = h.snapshot().bookings[booking["id"]]
    # Trusted adapter setup, not a staff mutation/API implemented ahead of #10.
    with h.repository.transaction() as transaction:
        transaction.state.assets["unit-a"] = replace(transaction.asset_by_id("unit-a"), name="Renamed Camera")
    assert request(h.app, path="/api/v1/assets/unit-a").json()["name"] == "Renamed Camera"
    assert validate(request(h.app, path=f"/api/v1/bookings/{booking['id']}", session=h.owner), "Booking") == booking
    assert h.snapshot().bookings[booking["id"]] == stored


@pytest.mark.parametrize("instant", [NOW, datetime(2026, 10, 21, 19, tzinfo=UTC), datetime(2028, 2, 28, 19, tzinfo=UTC)])
def test_default_trusted_fixtures_have_real_identities_valid_chains_versions_slots_and_custody(instant):
    repository = MemoryRepository()
    create_app(repository=repository, clock=Clock(instant))
    snapshot = repository._state
    assert len(snapshot.users) == 2 and len(snapshot.bookings) == 10 and not snapshot.sessions
    assert len({user.password_hash for user in snapshot.users.values()}) == 2
    assert all(user.password_hash.startswith("$argon2id$") for user in snapshot.users.values())
    rules = {"approve": ("pending", "approved"), "reject": ("pending", "rejected"), "checkout": ("approved", "checked_out"), "return": ("checked_out", "returned")}
    for booking in snapshot.bookings.values():
        assert booking.user_id in snapshot.users and booking.asset_id in snapshot.assets
        events = tuple(event for event in snapshot.events.values() if event.booking_id == booking.id)
        assert booking.version == len(events)
        assert events[0].action == "create" and events[0].prior_state is None and events[0].new_state == "pending"
        assert events[0].actor_id == booking.user_id and events[0].note == booking.purpose
        assert events[-1].new_state == booking.state
        assert booking.created_at == events[0].timestamp and booking.updated_at == events[-1].timestamp
        assert [event.timestamp for event in events] == sorted(event.timestamp for event in events)
        for index, event in enumerate(events):
            assert event.timestamp.tzinfo is UTC and event.timestamp <= instant
            assert event.actor_id in snapshot.users
            if index:
                assert event.prior_state == events[index - 1].new_state
                if event.action == "cancel":
                    assert event.prior_state in {"pending", "approved"} and event.new_state == "cancelled"
                    assert event.note == CANCEL_NOTE
                    assert event.actor_id == booking.user_id or snapshot.users[event.actor_id].role == "coordinator"
                else:
                    assert (event.prior_state, event.new_state) == rules[event.action]
                    assert snapshot.users[event.actor_id].role == "coordinator"
                if event.action == "approve":
                    assert event.note == "Reservation approved." and event.timestamp.astimezone(CLUB_ZONE).date() <= booking.end_date
                if event.action == "checkout":
                    assert booking.start_date <= event.timestamp.astimezone(CLUB_ZONE).date() <= booking.end_date
        slots = [slot for slot in snapshot.slots.values() if slot.booking_id == booking.id]
        expected = {booking.start_date + timedelta(days=i) for i in range((booking.end_date - booking.start_date).days + 1)}
        assert {slot.day for slot in slots} == (expected if booking.state in RESERVING_STATES else set())
        assert all(slot.asset_id == booking.asset_id for slot in slots)
        assert (booking.asset_id in snapshot.active_loans and snapshot.active_loans[booking.asset_id].booking_id == booking.id) == (booking.state == "checked_out")
    assert len(snapshot.active_loans) == 1


def test_booking_domain_reads_through_protocol_without_http_or_memory_adapter():
    h = Harness()
    booking = validate(h.create(), "Booking", 201)
    snapshot = h.snapshot()
    owner = snapshot.users[h.owner["user"]["id"]]
    events = tuple(snapshot.events.values())
    record = snapshot.bookings[booking["id"]]
    calls = []
    class Repository:
        @contextmanager
        def transaction(self):
            calls.append("transaction")
            class Transaction:
                def session_by_hash(self, digest):
                    assert digest == token_hash("trusted-token")
                    return Session(digest, owner.id, NOW + timedelta(hours=24))
                def user_by_id(self, user_id):
                    assert user_id == owner.id
                    return owner
                def bookings(self):
                    calls.append("bookings")
                    return (record,)
                def booking_by_id(self, booking_id):
                    calls.append(("booking", booking_id))
                    return record
                def booking_events(self, booking_id):
                    calls.append(("events", booking_id))
                    return events
            yield Transaction()
    repository = Repository()
    service = BookingService(repository, AuthService(repository, Clock()), Clock())
    assert service.list_bookings("trusted-token") == [booking]
    assert service.get_booking("trusted-token", booking["id"]) == booking
    assert calls.count("transaction") == 2 and calls.count(("events", booking["id"])) == 2
