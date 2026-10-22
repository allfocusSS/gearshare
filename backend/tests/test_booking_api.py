"""#9: real ASGI create/read/cancel, privacy, races and transactional failures."""

import asyncio
import copy
import json
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from threading import Barrier
from urllib.parse import quote

import httpx
import pytest

from app.auth import token_hash
from app.domain import Asset, CANCEL_NOTE, User
from app.fixtures import add_fixture_booking
from app.main import create_app
from app.memory import MemoryRepository
from test_catalogue_api import validate

NOW = datetime(2026, 10, 21, 20, 0, 0, 123456, tzinfo=UTC)
TODAY = date(2026, 10, 22)
BASE = "/api/v1/bookings"


@dataclass
class Clock:
    value: datetime = NOW

    def __call__(self):
        return self.value


class FastPasswords:
    """Only booking setup; the unchanged #7 suite verifies real Argon2id."""

    def hash(self, value):
        return f"trusted-test-hash:{value}"

    def verify(self, hashed, value):
        return hashed == self.hash(value)


def request(app, method="GET", path=BASE, *, session=None, **kwargs):
    headers = dict(kwargs.pop("headers", {}))
    if session is not None:
        headers["Authorization"] = f"Bearer {session['token']}"
    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app, raise_app_exceptions=True), base_url="http://test") as client:
            return await client.request(method, path, headers=headers, **kwargs)
    return asyncio.run(run())


def day(offset=0):
    return (TODAY + timedelta(days=offset)).isoformat()


def body(**overrides):
    return {"assetId": "unit-a", "startDate": day(), "endDate": day(), "purpose": "Student film session", **overrides}


def error(response, status, *, fields=None, dates=None):
    result = validate(response, "Error", status)
    assert result["code"] == {401: "UNAUTHENTICATED", 404: "NOT_FOUND", 409: "CONFLICT", 422: "VALIDATION_ERROR", 500: "SERVICE_UNAVAILABLE"}[status]
    keys = {"code", "message"}
    if fields is not None:
        keys.add("fields")
        assert set(result["fields"]) == set(fields)
    if dates is not None:
        keys.add("unavailableDates")
        assert result["unavailableDates"] == dates
    assert set(result) == keys
    if status == 401:
        assert response.headers["WWW-Authenticate"] == "Bearer"
    return result


class Harness:
    def __init__(self, repository=None, instant=NOW):
        self.repository = repository if repository is not None else MemoryRepository()
        self.clock = Clock(instant)
        passwords = FastPasswords()
        with self.repository.transaction() as transaction:
            for asset_id, code, state in (("unit-a", "UNIT-A", "active"), ("unit-b", "UNIT-B", "active"), ("care-unit", "CARE", "maintenance")):
                transaction.add_asset(Asset(asset_id, code, "Film 🎥 Camera", "Cameras", "Fictional equipment", "Club desk", state))
            transaction.add_user(User("trusted-coordinator", "coordinator", "coordinator", passwords.hash("CoordinatorPassword42!")))
        self.app = create_app(repository=self.repository, clock=self.clock, passwords=passwords, seed=False)
        self.owner = self.account("owner")
        self.other = self.account("other")
        self.coordinator = validate(request(self.app, "POST", "/api/v1/auth/login", json={"username": "coordinator", "password": "CoordinatorPassword42!"}), "Session")

    def account(self, username):
        return validate(request(self.app, "POST", "/api/v1/auth/register", json={"username": username, "password": "StudentPassword42!"}), "Session", 201)

    def create(self, payload=None, session=None):
        return request(self.app, "POST", session=self.owner if session is None else session, json=body() if payload is None else payload)

    def cancel(self, booking_id, payload=None, session=None):
        return request(self.app, "POST", f"{BASE}/{booking_id}/cancel", session=self.owner if session is None else session, json={"expectedVersion": 1} if payload is None else payload)

    def snapshot(self):
        underlying = getattr(self.repository, "underlying", self.repository)
        return copy.deepcopy(underlying._state)

    def history(self, state, *, booking_id="trusted-history", asset_id="unit-a"):
        with self.repository.transaction() as transaction:
            return add_fixture_booking(
                transaction, booking_id=booking_id, asset=transaction.asset_by_id(asset_id),
                owner=transaction.user_by_id(self.owner["user"]["id"]),
                coordinator=transaction.user_by_id(self.coordinator["user"]["id"]),
                start=TODAY, end=TODAY + timedelta(days=2), state=state, now=NOW,
            )


@pytest.fixture
def h():
    return Harness()


def test_d01_create_exact_private_snapshot_server_identity_version_event_and_one_slot(h):
    sent = body(purpose=" \ufeff\u00a0Student 🎥 film\u3000 ", role="coordinator", id="injected", userId=h.other["user"]["id"], ownerId="injected", actorId="injected", state="returned", version=999, events=[{"id": "injected"}], createdAt="2999-01-01T00:00:00Z", note="injected")
    booking = validate(h.create(sent), "Booking", 201)
    assert set(booking) == {"id", "assetId", "assetName", "userId", "purpose", "startDate", "endDate", "state", "version", "events"}
    assert booking["id"] != "injected" and booking["userId"] == h.owner["user"]["id"]
    assert booking["assetName"] == "Film 🎥 Camera" and booking["purpose"] == "Student 🎥 film"
    assert booking["state"] == "pending" and booking["version"] == len(booking["events"]) == 1
    event = booking["events"][0]
    assert set(event) == {"id", "bookingId", "actorId", "action", "priorState", "newState", "timestamp", "note"}
    assert event == {"id": event["id"], "bookingId": booking["id"], "actorId": h.owner["user"]["id"], "action": "create", "priorState": None, "newState": "pending", "timestamp": NOW.isoformat().replace("+00:00", "Z"), "note": booking["purpose"]}
    snapshot = h.snapshot()
    assert len(snapshot.bookings) == len(snapshot.events) == len(snapshot.slots) == 1
    assert snapshot.bookings[booking["id"]].created_at == snapshot.bookings[booking["id"]].updated_at == NOW
    assert snapshot.bookings[booking["id"]].created_at.tzinfo is UTC
    assert snapshot.slots[("unit-a", TODAY)].booking_id == booking["id"]
    assert validate(request(h.app, path=f"{BASE}/{booking['id']}", session=h.owner), "Booking") == booking


@pytest.mark.parametrize("start,end", [(0, 0), (0, 13), (77, 90), (90, 90)])
def test_d02_inclusive_today_fourteen_day_and_horizon_bounds(h, start, end):
    booking = validate(h.create(body(startDate=day(start), endDate=day(end))), "Booking", 201)
    assert len(h.snapshot().slots) == end - start + 1
    assert {slot.day.isoformat() for slot in h.snapshot().slots.values()} == {day(offset) for offset in range(start, end + 1)}
    assert booking["startDate"] == day(start) and booking["endDate"] == day(end)


@pytest.mark.parametrize("payload,fields", [
    ({}, {"assetId", "startDate", "endDate", "purpose"}),
    (body(assetId=None, startDate=None, endDate=None, purpose=None), {"assetId", "startDate", "endDate", "purpose"}),
    (body(assetId=False, startDate=[], endDate={}, purpose=42), {"assetId", "startDate", "endDate", "purpose"}),
    (body(assetId="", startDate="", endDate="", purpose=""), {"assetId", "startDate", "endDate", "purpose"}),
    (body(assetId="x" * 101, purpose="bad"), {"assetId", "purpose"}),
    (body(assetId="missing", startDate=day(-1), purpose="bad"), {"startDate", "purpose"}),
    (body(assetId="care-unit", endDate=day(14), purpose="bad"), {"endDate", "purpose"}),
    (body(startDate=day(-1)), {"startDate"}),
    (body(startDate=day(1), endDate=day()), {"endDate"}),
    (body(endDate=day(14)), {"endDate"}),
    (body(startDate=day(91), endDate=day(91)), {"startDate", "endDate"}),
    (body(startDate=day(90), endDate=day(91)), {"endDate"}),
])
def test_create_aggregate_validation_precedes_resource_lookup_and_never_mutates(h, payload, fields):
    before = h.snapshot()
    error(h.create(payload), 422, fields=fields)
    assert h.snapshot() == before


@pytest.mark.parametrize("value", [None, False, 42, [], {}, "", "2026-2-03", "2026-02-30", "2025-02-29", "0000-01-01", "２０２６-１０-２２", "٢٠٢٦-١٠-٢٢", "2026-10-22\n", "2026-10-22\r\n", "2026-10-22T00:00:00Z", " 2026-10-22", "2026-10-22 "])
@pytest.mark.parametrize("field", ["startDate", "endDate"])
def test_create_dates_are_required_full_ascii_real_and_never_coerced(h, value, field):
    before = h.snapshot()
    error(h.create(body(**{field: value})), 422, fields={field})
    assert h.snapshot() == before


@pytest.mark.parametrize("value,valid,stored", [
    ("x" * 4, False, None), ("x" * 5, True, "x" * 5), ("x" * 500, True, "x" * 500), ("x" * 501, False, None),
    ("🎥" * 5, True, "🎥" * 5), ("🎥" * 500, True, "🎥" * 500), ("🎥" * 501, False, None),
    ("e\u0301e\u0301e", True, "e\u0301e\u0301e"),
    (" \ufeff\u00a0\u2028\u3000 ", False, None), (" \ufeff abcde \u3000", True, "abcde"),
    ("\u0085abcd", True, "\u0085abcd"), ("\u001cabcd", True, "\u001cabcd"),
    (True, False, None), (5, False, None), ([], False, None), ({}, False, None),
])
def test_b07_trimmed_purpose_bounds_count_unicode_points_without_normalization(h, value, valid, stored):
    before = h.snapshot()
    response = h.create(body(purpose=value))
    if valid:
        booking = validate(response, "Booking", 201)
        assert booking["purpose"] == booking["events"][0]["note"] == stored
    else:
        error(response, 422, fields={"purpose"})
        assert h.snapshot() == before


@pytest.mark.parametrize("field,value", [("purpose", "good\ud800text"), ("purpose", "good\udffftext"), ("assetId", "unit\ud800")])
def test_unpaired_surrogates_are_field_errors_before_commit_or_serialization(h, field, value):
    before = h.snapshot()
    response = request(h.app, "POST", session=h.owner, content=json.dumps(body(**{field: value})), headers={"Content-Type": "application/json"})
    error(response, 422, fields={field})
    assert h.snapshot() == before


@pytest.mark.parametrize("asset_id,status", [("unknown", 404), ("x" * 100, 404), ("🎥" * 100, 404), (" ", 404), ("care-unit", 409)])
def test_unknown_asset_after_validation_and_maintenance_no_partial_record(h, asset_id, status):
    before = h.snapshot()
    error(h.create(body(assetId=asset_id)), status, dates=[] if status == 409 else None)
    assert h.snapshot() == before


@pytest.mark.parametrize("first,second,dates", [
    ((2, 2), (2, 2), [2]), ((2, 4), (1, 2), [2]), ((2, 4), (4, 5), [4]),
    ((2, 4), (1, 5), [2, 3, 4]), ((1, 5), (2, 4), [2, 3, 4]),
])
def test_b01_b02_inclusive_identical_partial_and_enclosing_conflicts_expose_only_intersection(h, first, second, dates):
    created = validate(h.create(body(startDate=day(first[0]), endDate=day(first[1]))), "Booking", 201)
    before = h.snapshot()
    response = h.create(body(startDate=day(second[0]), endDate=day(second[1])), session=h.other)
    error(response, 409, dates=[day(offset) for offset in dates])
    assert h.snapshot() == before
    for private in [created["id"], created["userId"], created["purpose"], *before.events, "owner"]:
        assert private not in response.text


@pytest.mark.parametrize("asset_id,start,end", [("unit-a", 5, 6), ("unit-a", 0, 1), ("unit-b", 2, 4)])
def test_b03_b04_adjacent_ranges_and_different_physical_assets_are_independent(h, asset_id, start, end):
    validate(h.create(body(startDate=day(2), endDate=day(4))), "Booking", 201)
    validate(h.create(body(assetId=asset_id, startDate=day(start), endDate=day(end)), session=h.other), "Booking", 201)
    assert len(h.snapshot().bookings) == len(h.snapshot().events) == 2
    assert len(h.snapshot().slots) == 3 + end - start + 1


@pytest.mark.parametrize("state,reserving", [("pending", True), ("approved", True), ("checked_out", True), ("rejected", False), ("cancelled", False), ("returned", False)])
def test_create_uses_real_slots_for_every_reserving_and_terminal_state(h, state, reserving):
    h.history(state)
    before = h.snapshot()
    response = h.create(session=h.other)
    if reserving:
        error(response, 409, dates=[day()])
        assert h.snapshot() == before
    else:
        validate(response, "Booking", 201)
        assert len(h.snapshot().slots) == 1


@pytest.mark.parametrize("operation", ["create", "list", "detail", "cancel"])
@pytest.mark.parametrize("authorization", [None, "Bearer unknown", "bad", "Bearer invalid token"])
def test_p02_authentication_precedes_even_invalid_json_and_media_type(h, operation, authorization):
    before = h.snapshot()
    method, path = {"create": ("POST", BASE), "list": ("GET", BASE), "detail": ("GET", f"{BASE}/unknown"), "cancel": ("POST", f"{BASE}/unknown/cancel")}[operation]
    headers = {"Content-Type": "text/plain"}
    if authorization is not None:
        headers["Authorization"] = authorization
    error(request(h.app, method, path, content="{broken", headers=headers), 401)
    assert h.snapshot() == before


@pytest.mark.parametrize("content,media", [("{", "application/json"), ("[]", "application/json"), ("null", "application/json"), ("true", "application/json"), ('{"expectedVersion":NaN}', "application/json"), ('{"expectedVersion":1}', "text/plain"), ('{"expectedVersion":1}', None), (b"\xff", "application/json"), ('{"expectedVersion":1}'.encode("utf-16"), "application/json")])
@pytest.mark.parametrize("operation", ["create", "cancel"])
def test_authenticated_envelope_errors_precede_lookup_and_field_validation(h, content, media, operation):
    before = h.snapshot()
    headers = {"Content-Type": media} if media else {}
    path = BASE if operation == "create" else f"{BASE}/unknown/cancel"
    error(request(h.app, "POST", path, session=h.owner, content=content, headers=headers), 422)
    assert h.snapshot() == before


def test_application_json_case_parameters_and_unknown_surrogate_fields_are_ignored(h):
    payload = body(userId="\ud800", role="coordinator", version=123, events="\ud800")
    response = request(h.app, "POST", session=h.owner, content=json.dumps(payload), headers={"Content-Type": "Application/JSON; charset=utf-8"})
    booking = validate(response, "Booking", 201)
    assert booking["userId"] == h.owner["user"]["id"] and booking["version"] == 1


def test_p01_lists_are_own_only_even_for_coordinator_with_stable_creation_order(h):
    first = validate(h.create(), "Booking", 201)
    second = validate(h.create(body(assetId="unit-b")), "Booking", 201)
    other = validate(h.create(body(startDate=day(1), endDate=day(1)), session=h.other), "Booking", 201)
    staff = validate(h.create(body(startDate=day(2), endDate=day(2)), session=h.coordinator), "Booking", 201)
    for session, expected in ((h.owner, [first, second]), (h.other, [other]), (h.coordinator, [staff])):
        response = request(h.app, session=session, params={"userId": h.owner["user"]["id"], "role": "coordinator", "include": "all"})
        assert response.status_code == 200 and response.json() == expected
        for record in response.json():
            assert record["userId"] == session["user"]["id"]
    assert validate(request(h.app, path=f"{BASE}/{first['id']}", session=h.coordinator), "Booking") == first


@pytest.mark.parametrize("unknown", ["unknown", "x" * 101, " ", "id\n"])
def test_p01_foreign_read_and_cancel_are_byte_identical_to_unknown_before_version_checks(h, unknown):
    booking = validate(h.create(), "Booking", 201)
    before = h.snapshot()
    for method, suffix, kwargs in (("GET", "", {}), ("POST", "/cancel", {"json": {"expectedVersion": False}})):
        hidden = request(h.app, method, f"{BASE}/{booking['id']}{suffix}", session=h.other, **kwargs)
        missing = request(h.app, method, f"{BASE}/{quote(unknown, safe='')}{suffix}", session=h.other, **kwargs)
        error(hidden, 404)
        assert hidden.status_code == missing.status_code == 404 and hidden.content == missing.content
    assert h.snapshot() == before


@pytest.mark.parametrize("state", ["pending", "approved"])
@pytest.mark.parametrize("actor", ["owner", "coordinator"])
def test_b06_cancel_atomically_releases_every_slot_retains_history_and_allows_rebook(h, state, actor):
    original = h.history(state)
    before = h.snapshot()
    h.clock.value += timedelta(seconds=7)
    session = getattr(h, actor)
    sent = {"expectedVersion": original.version, "userId": h.other["user"]["id"], "state": "returned", "version": 999, "events": [], "actorId": "injected", "note": "injected"}
    cancelled = validate(h.cancel(original.id, sent, session), "Booking")
    assert cancelled["state"] == "cancelled" and cancelled["version"] == len(cancelled["events"]) == original.version + 1
    assert cancelled["events"][:-1] == [event.private() for event in before.events.values()]
    assert cancelled["events"][-1] == {"id": cancelled["events"][-1]["id"], "bookingId": original.id, "actorId": session["user"]["id"], "action": "cancel", "priorState": state, "newState": "cancelled", "timestamp": h.clock.value.isoformat().replace("+00:00", "Z"), "note": CANCEL_NOTE}
    after = h.snapshot()
    assert after.slots == {} and after.bookings[original.id].created_at == original.created_at
    assert after.bookings[original.id].updated_at == h.clock.value and after.bookings[original.id].asset_name == original.asset_name
    public = validate(request(h.app, path="/api/v1/assets/unit-a/availability"), "AssetAvailability")
    assert all(row["state"] == "available" for row in public["days"][:3])
    replacement = validate(h.create(body(startDate=day(), endDate=day(2)), session=h.other), "Booking", 201)
    assert replacement["id"] != original.id and len(h.snapshot().bookings) == 2
    assert validate(request(h.app, path=f"{BASE}/{original.id}", session=h.owner), "Booking") == cancelled


@pytest.mark.parametrize("literal", ["null", "true", "false", '"1"', "[]", "{}", "0", "-1", "2147483648", "1.5", "1.0", "1e0", "1E+0"])
def test_cancel_requires_json_integer_literal_without_coercion_and_never_mutates(h, literal):
    booking = validate(h.create(), "Booking", 201)
    before = h.snapshot()
    response = request(h.app, "POST", f"{BASE}/{booking['id']}/cancel", session=h.owner, content='{"expectedVersion":' + literal + '}', headers={"Content-Type": "application/json"})
    error(response, 422, fields={"expectedVersion"})
    assert h.snapshot() == before


def test_cancel_missing_version_invalid_before_state_and_stale_before_state(h):
    original = h.history("returned")
    before = h.snapshot()
    error(h.cancel(original.id, {}), 422, fields={"expectedVersion"})
    error(h.cancel(original.id, {"expectedVersion": False}), 422, fields={"expectedVersion"})
    error(h.cancel(original.id, {"expectedVersion": 1}), 409, fields={"expectedVersion"})
    error(h.cancel(original.id, {"expectedVersion": original.version}), 409)
    error(h.cancel(original.id, {"expectedVersion": 2147483647}), 409, fields={"expectedVersion"})
    assert h.snapshot() == before


def test_stale_cancel_of_approved_booking_cannot_silently_use_current_version(h):
    original = h.history("approved")
    before = h.snapshot()
    error(h.cancel(original.id, {"expectedVersion": 1}), 409, fields={"expectedVersion"})
    assert h.snapshot() == before
    cancelled = validate(h.cancel(original.id, {"expectedVersion": original.version}), "Booking")
    assert cancelled["version"] == 3 and cancelled["events"][-1]["priorState"] == "approved"


@pytest.mark.parametrize("state", ["checked_out", "rejected", "cancelled", "returned"])
def test_cancel_invalid_terminal_or_repeated_state_is_conflict_without_mutation(h, state):
    booking = h.history(state)
    before = h.snapshot()
    error(h.cancel(booking.id, {"expectedVersion": booking.version}), 409)
    assert h.snapshot() == before


def test_repeat_cancel_with_old_version_is_stale_and_with_new_version_is_state_conflict(h):
    booking = validate(h.create(), "Booking", 201)
    cancelled = validate(h.cancel(booking["id"]), "Booking")
    before = h.snapshot()
    error(h.cancel(booking["id"]), 409, fields={"expectedVersion"})
    error(h.cancel(booking["id"], {"expectedVersion": cancelled["version"]}), 409)
    assert h.snapshot() == before


def race(h, monkeypatch, method, calls):
    barrier = Barrier(len(calls))
    service = h.app.state.bookings
    original = getattr(service, method)
    def simultaneous(*args, **kwargs):
        barrier.wait(timeout=10)
        return original(*args, **kwargs)
    monkeypatch.setattr(service, method, simultaneous)
    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=h.app, raise_app_exceptions=True), base_url="http://test") as client:
            return await asyncio.gather(*[client.post(path, headers={"Authorization": f"Bearer {session['token']}"}, json=payload) for path, session, payload in calls])
    return asyncio.run(run())


@pytest.mark.parametrize("ranges", [((0, 0), (0, 0)), ((0, 2), (2, 4)), ((0, 4), (1, 3))])
def test_b05_actual_concurrent_conflicting_api_requests_exactly_one_complete_winner(h, monkeypatch, ranges):
    calls = [(BASE, session, body(startDate=day(start), endDate=day(end))) for session, (start, end) in zip((h.owner, h.other), ranges)]
    responses = race(h, monkeypatch, "request_booking", calls)
    assert sorted(response.status_code for response in responses) == [201, 409]
    winner = validate(next(response for response in responses if response.status_code == 201), "Booking", 201)
    error(next(response for response in responses if response.status_code == 409), 409, dates=[day(i) for i in range(max(r[0] for r in ranges), min(r[1] for r in ranges) + 1)])
    snapshot = h.snapshot()
    assert len(snapshot.bookings) == len(snapshot.events) == 1
    assert set(snapshot.bookings) == {winner["id"]}
    assert len(snapshot.slots) == (date.fromisoformat(winner["endDate"]) - date.fromisoformat(winner["startDate"])).days + 1
    assert {slot.booking_id for slot in snapshot.slots.values()} == {winner["id"]}


def test_concurrent_cancel_owner_and_coordinator_one_success_one_stale_no_duplicate_event(h, monkeypatch):
    booking = validate(h.create(body(endDate=day(2))), "Booking", 201)
    path = f"{BASE}/{booking['id']}/cancel"
    responses = race(h, monkeypatch, "cancel_booking", [(path, h.owner, {"expectedVersion": 1}), (path, h.coordinator, {"expectedVersion": 1})])
    assert sorted(response.status_code for response in responses) == [200, 409]
    cancelled = validate(next(response for response in responses if response.status_code == 200), "Booking")
    error(next(response for response in responses if response.status_code == 409), 409, fields={"expectedVersion"})
    assert cancelled["version"] == len(cancelled["events"]) == 2
    snapshot = h.snapshot()
    assert len(snapshot.bookings) == 1 and len(snapshot.events) == 2 and not snapshot.slots
    assert cancelled["events"][-1]["actorId"] in {h.owner["user"]["id"], h.coordinator["user"]["id"]}


class FailingRepository:
    def __init__(self):
        self.underlying = MemoryRepository()
        self.fail_after = None
        self.after_count = 1
        self.calls = 0

    @contextmanager
    def transaction(self):
        owner = self
        with self.underlying.transaction() as real:
            class Fault:
                def __getattr__(self, name):
                    member = getattr(real, name)
                    if name != owner.fail_after:
                        return member
                    def fail(*args, **kwargs):
                        result = member(*args, **kwargs)
                        owner.calls += 1
                        if owner.calls == owner.after_count:
                            raise RuntimeError("Controlled private transaction failure")
                        return result
                    return fail
            yield Fault()


@pytest.mark.parametrize("method,after_count", [("add_booking", 1), ("add_booking_event", 1), ("add_slot", 2)])
def test_db01_failure_after_booking_event_or_partial_slot_insertion_rolls_back_every_record(method, after_count, caplog):
    repository = FailingRepository()
    h = Harness(repository)
    before = h.snapshot()
    repository.fail_after, repository.after_count = method, after_count
    error(h.create(body(endDate=day(2))), 500)
    assert repository.calls == after_count and h.snapshot() == before
    assert "Controlled private transaction failure" not in caplog.text
    repository.fail_after = None
    validate(h.create(body(endDate=day(2))), "Booking", 201)
    assert len(h.snapshot().bookings) == len(h.snapshot().events) == 1 and len(h.snapshot().slots) == 3


@pytest.mark.parametrize("method", ["replace_booking", "add_booking_event", "release_slots"])
def test_cancel_failure_after_each_write_rolls_back_state_version_history_and_slots(method):
    repository = FailingRepository()
    h = Harness(repository)
    booking = validate(h.create(body(endDate=day(2))), "Booking", 201)
    before = h.snapshot()
    repository.fail_after = method
    error(h.cancel(booking["id"]), 500)
    assert h.snapshot() == before and repository.calls == 1
    repository.fail_after = None
    validate(h.cancel(booking["id"]), "Booking")
    assert len(h.snapshot().events) == 2 and not h.snapshot().slots


def test_d04_booking_uses_club_date_and_aware_utc_timestamps(h):
    # UTC is still Oct 21; Almaty is Oct 22. Session remains valid.
    booking = validate(h.create(), "Booking", 201)
    assert booking["startDate"] == "2026-10-22" and booking["events"][0]["timestamp"].startswith("2026-10-21T20:")
    before = h.snapshot()
    error(h.create(body(startDate="2026-10-21", endDate="2026-10-21")), 422, fields={"startDate"})
    assert h.snapshot() == before


def test_real_leap_day_is_bookable_with_the_same_inclusive_allocation_policy():
    h = Harness(instant=datetime(2028, 2, 28, 19, tzinfo=UTC))
    booking = validate(h.create(body(startDate="2028-02-29", endDate="2028-03-01")), "Booking", 201)
    assert booking["startDate"] == "2028-02-29" and booking["endDate"] == "2028-03-01"
    assert {slot.day.isoformat() for slot in h.snapshot().slots.values()} == {"2028-02-29", "2028-03-01"}


def test_business_date_is_captured_once_after_authentication_across_local_midnight(h):
    class CrossingClock:
        calls = 0
        def __call__(self):
            self.calls += 1
            return datetime(2026, 10, 22, 18, 59, 59, tzinfo=UTC) if self.calls <= 2 else datetime(2026, 10, 22, 19, tzinfo=UTC)
    clock = CrossingClock()
    h.app.state.auth.clock = h.app.state.bookings.clock = clock
    booking = validate(h.create(body(startDate="2026-10-23", endDate="2026-10-23")), "Booking", 201)
    assert clock.calls == 3  # HTTP session, in-transaction session, booking instant.
    assert booking["events"][0]["timestamp"] == "2026-10-22T19:00:00Z"


def test_expired_revoked_and_server_removed_sessions_cannot_mutate(h):
    booking = validate(h.create(), "Booking", 201)
    h.clock.value += timedelta(hours=24)
    before = h.snapshot()
    error(h.cancel(booking["id"]), 401)
    error(h.create(), 401)
    assert h.snapshot() == before
    h.clock.value = NOW
    assert request(h.app, "POST", "/api/v1/auth/logout", session=h.owner).status_code == 204
    before = h.snapshot()
    error(h.cancel(booking["id"]), 401)
    assert h.snapshot() == before
    with h.repository.transaction() as transaction:
        transaction.delete_session(token_hash(h.other["token"]))
    before = h.snapshot()
    error(h.create(session=h.other), 401)
    assert h.snapshot() == before
