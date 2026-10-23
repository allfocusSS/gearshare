"""#10: coordinator API, ordered checks, immutable lending and inventory rules."""

import json
from datetime import UTC, datetime, timedelta
from urllib.parse import quote

import httpx
import pytest

from app.fixtures import add_fixture_booking
from test_booking_api import BASE, NOW, TODAY, Harness, body, day, request
from test_catalogue_api import validate

STAFF = "/api/v1/staff"
ACTIONS = ("approve", "reject", "checkout", "return")
STATES = ("pending", "approved", "checked_out", "rejected", "cancelled", "returned")
RULES = {"approve": ("pending", "approved"), "reject": ("pending", "rejected"), "checkout": ("approved", "checked_out"), "return": ("checked_out", "returned")}
NOTE = "Complete kit; tested and working."


@pytest.fixture
def h():
    return Harness()


def asset_input(**changes):
    return {"name": "Studio Camera", "inventoryCode": "new-001", "category": "Cameras", "location": "Club desk", "description": "Fictional club equipment.", **changes}


def action(h, booking_id, verb, version=1, *, note=NOTE, **kwargs):
    return request(h.app, "POST", f"{STAFF}/bookings/{booking_id}/{verb}", session=h.coordinator, json={"expectedVersion": version, "note": note}, **kwargs)


def inventory(h, method="GET", suffix="", payload=None, session="staff"):
    return request(h.app, method, f"{STAFF}/assets{suffix}", session=h.coordinator if session == "staff" else session, **({"json": payload} if payload is not None else {}))


def desk(h):
    return validate(request(h.app, path=f"{STAFF}/bookings", session=h.coordinator), "StaffDesk")


def expect_error(response, status, fields=None, dates=None):
    result = validate(response, "Error", status)
    assert result["code"] == {401: "UNAUTHENTICATED", 403: "FORBIDDEN", 404: "NOT_FOUND", 405: "NOT_FOUND", 409: "CONFLICT", 422: "VALIDATION_ERROR", 500: "SERVICE_UNAVAILABLE"}[status]
    assert set(result) == {"code", "message"} | ({"fields"} if fields is not None else set()) | ({"unavailableDates"} if dates is not None else set())
    if fields is not None:
        assert set(result["fields"]) == set(fields)
    if dates is not None:
        assert result["unavailableDates"] == dates
    if status == 401:
        assert response.headers["WWW-Authenticate"] == "Bearer"
    return result


def fixture(h, state, start=0, end=2, booking_id="staff-history", asset_id="unit-a", owner=None):
    with h.repository.transaction() as transaction:
        return add_fixture_booking(
            transaction, booking_id=booking_id, asset=transaction.asset_by_id(asset_id),
            owner=transaction.user_by_id((h.owner if owner is None else owner)["user"]["id"]),
            coordinator=transaction.user_by_id(h.coordinator["user"]["id"]),
            start=TODAY + timedelta(days=start), end=TODAY + timedelta(days=end), state=state, now=NOW,
        )


ROUTES = [("GET", "/bookings"), ("GET", "/assets"), ("POST", "/assets"), ("PUT", "/assets/missing"), ("PUT", "/assets/missing/state")] + [("POST", f"/bookings/missing/{verb}") for verb in ACTIONS]


@pytest.mark.parametrize("method,path", ROUTES)
def test_p02_every_staff_route_checks_session_role_before_envelope_and_lookup(h, method, path):
    before = h.snapshot()
    for session, status in ((None, 401), (h.owner, 403), (h.other, 403)):
        expect_error(request(h.app, method, STAFF + path, session=session, content="{", headers={"Content-Type": "application/json"}), status)
        assert h.snapshot() == before
    # Role claims in request properties and headers never grant access.
    expect_error(request(h.app, method, STAFF + path, session=h.owner, json={"role": "coordinator", "expectedVersion": 1}, headers={"X-Role": "coordinator", "X-User-Id": h.coordinator["user"]["id"]}), 403)
    assert h.snapshot() == before


@pytest.mark.parametrize("method,path", [pair for pair in ROUTES if pair[0] != "GET"])
@pytest.mark.parametrize("content,content_type", [("{", "application/json"), ("[]", "application/json"), ("null", "application/json"), ('{"expectedVersion":1}', "text/plain")])
def test_envelope_precedes_resource_lookup_for_every_staff_write(h, method, path, content, content_type):
    before = h.snapshot()
    expect_error(request(h.app, method, STAFF + path, session=h.coordinator, content=content, headers={"Content-Type": content_type}), 422)
    assert h.snapshot() == before


@pytest.mark.parametrize("verb", ACTIONS)
@pytest.mark.parametrize("identifier", ["missing", "id\n", "x" * 101])
def test_unknown_malformed_staff_booking_is_private_404_before_version_or_note(h, verb, identifier):
    before = h.snapshot()
    response = action(h, quote(identifier, safe=""), verb, False, note=None)
    expect_error(response, 404)
    unknown_private = request(h.app, path=BASE + "/missing", session=h.coordinator)
    assert response.content == unknown_private.content
    assert h.snapshot() == before


@pytest.mark.parametrize("verb", ACTIONS)
@pytest.mark.parametrize("literal", [None, "null", "false", '"1"', "0", "-1", "2147483648", "1.0", "1e0", "[]", "{}"])
def test_s09_every_staff_action_requires_strict_positive_integer_literal(h, verb, literal):
    booking = fixture(h, RULES[verb][0])
    before = h.snapshot()
    raw = "{}" if literal is None else '{"expectedVersion":' + literal + ',"note":"bad"}'
    response = request(h.app, "POST", f"{STAFF}/bookings/{booking.id}/{verb}", session=h.coordinator, content=raw, headers={"Content-Type": "application/json"})
    expect_error(response, 422, {"expectedVersion"})
    assert h.snapshot() == before


@pytest.mark.parametrize("verb", ACTIONS)
def test_s08_stale_version_precedes_state_and_bad_note_and_accepts_max_integer_shape(h, verb):
    booking = fixture(h, "returned")
    before = h.snapshot()
    for version in (1, 2147483647):
        expect_error(action(h, booking.id, verb, version, note=None), 409, {"expectedVersion"})
    expect_error(action(h, booking.id, verb, booking.version, note=None), 409)
    assert h.snapshot() == before


@pytest.mark.parametrize("verb,state", [(verb, state) for verb in ACTIONS for state in STATES if state != RULES[verb][0]])
def test_s02_complete_invalid_and_terminal_transition_matrix_no_mutation(h, verb, state):
    booking = fixture(h, state)
    before = h.snapshot()
    expect_error(action(h, booking.id, verb, booking.version, note=None), 409)
    assert h.snapshot() == before


@pytest.mark.parametrize("verb", ACTIONS)
def test_s01_valid_transitions_increment_once_and_preserve_history_actor_timestamps_and_allocations(h, verb):
    booking = fixture(h, RULES[verb][0])
    before = h.snapshot()
    result = validate(action(h, booking.id, verb, booking.version, note=" \ufeff\u00a0" + NOTE + "\u3000 "), "Booking")
    assert result["state"] == RULES[verb][1]
    assert result["version"] == len(result["events"]) == booking.version + 1
    assert result["events"][:-1] == [event.private() for event in before.events.values()]
    event = result["events"][-1]
    assert event == {"id": event["id"], "bookingId": booking.id, "actorId": h.coordinator["user"]["id"], "action": verb, "priorState": booking.state, "newState": RULES[verb][1], "timestamp": NOW.isoformat().replace("+00:00", "Z"), "note": "Reservation approved." if verb == "approve" else NOTE}
    after = h.snapshot()
    assert after.bookings[booking.id].created_at == booking.created_at
    assert after.bookings[booking.id].updated_at == NOW
    assert after.slots == before.slots if verb in {"approve", "checkout"} else not after.slots
    assert ("unit-a" in after.active_loans) == (verb == "checkout")
    if verb == "checkout":
        assert after.active_loans["unit-a"].booking_id == booking.id
    # Returned dictionaries cannot rewrite the stored immutable history.
    result["events"][0]["note"] = "Client edit"
    assert h.snapshot() == after
    for sent_version, fields in ((booking.version, {"expectedVersion"}), (booking.version + 1, None)):
        expect_error(action(h, booking.id, verb, sent_version), 409, fields)
        assert h.snapshot() == after


@pytest.mark.parametrize("verb", ["reject", "checkout", "return"])
@pytest.mark.parametrize("note", [None, False, 42, [], {}, "", " \ufeff\u3000 ", "ab", "x" * 501, "a\ud800b", "a\udfffb"])
def test_s05_notes_are_required_trimmed_codepoints_and_scalar_safe(h, verb, note):
    booking = fixture(h, RULES[verb][0])
    before = h.snapshot()
    raw = json.dumps({"expectedVersion": booking.version, "note": note})
    response = request(h.app, "POST", f"{STAFF}/bookings/{booking.id}/{verb}", session=h.coordinator, content=raw, headers={"Content-Type": "application/json"})
    expect_error(response, 422, {"note"})
    assert h.snapshot() == before


@pytest.mark.parametrize("verb", ["reject", "checkout", "return"])
@pytest.mark.parametrize("note", ["a🎥b", "🎥" * 500, "e\u0301x", "\u0085ab", "\u001cab"])
def test_notes_accept_codepoint_boundaries_and_keep_ecmascript_nonwhitespace(h, verb, note):
    booking = fixture(h, RULES[verb][0])
    result = validate(action(h, booking.id, verb, booking.version, note="\ufeff " + note + "\u3000"), "Booking")
    assert result["events"][-1]["note"] == note


@pytest.mark.parametrize("state,start,end,verb,status", [("pending", -2, -1, "approve", 409), ("pending", -1, 0, "approve", 200), ("pending", 1, 2, "approve", 200), ("approved", 1, 2, "checkout", 409), ("approved", -2, -1, "checkout", 409), ("approved", 0, 0, "checkout", 200), ("approved", -1, 0, "checkout", 200), ("checked_out", -2, -1, "return", 200)])
def test_s04_and_s06_inclusive_club_dates_and_overdue_return(h, state, start, end, verb, status):
    booking = fixture(h, state, start, end)
    before = h.snapshot()
    response = action(h, booking.id, verb, booking.version)
    if status == 409:
        expect_error(response, 409)
        assert h.snapshot() == before
    else:
        validate(response, "Booking")
        assert response.json()["events"][-1]["timestamp"].startswith("2026-10-21T20:")


def test_full_lifecycle_custody_release_owner_history_and_maintenance_controls(h):
    booking = validate(h.create(), "Booking", 201)
    approved = validate(action(h, booking["id"], "approve"), "Booking")
    checked_out = validate(action(h, booking["id"], "checkout", approved["version"]), "Booking")
    assert desk(h)["counts"] == {"pending": 0, "dueToday": 1, "overdue": 0}
    assert desk(h)["bookings"][0]["currentlyOnLoan"] is True
    before = h.snapshot()
    expect_error(inventory(h, "PUT", "/unit-a/state", {"state": "maintenance"}), 409)
    assert h.snapshot() == before
    returned = validate(action(h, booking["id"], "return", checked_out["version"]), "Booking")
    assert returned["state"] == "returned" and returned["version"] == 4
    assert desk(h)["counts"] == {"pending": 0, "dueToday": 0, "overdue": 0}
    assert desk(h)["bookings"][0]["currentlyOnLoan"] is False
    assert validate(request(h.app, path=BASE + "/" + booking["id"], session=h.owner), "Booking") == returned
    assert not h.snapshot().slots and not h.snapshot().active_loans
    replacement = validate(h.create(session=h.other), "Booking", 201)
    assert replacement["id"] != booking["id"]
    expect_error(request(h.app, path=BASE + "/" + booking["id"], session=h.other), 404)


def test_desk_counts_borrower_join_order_snapshot_name_and_asset_wide_custody(h):
    overdue = fixture(h, "checked_out", -3, -2, booking_id="loan")
    later = fixture(h, "approved", 0, 1, booking_id="later", owner=h.other)
    fixture(h, "pending", -3, -2, booking_id="expired", asset_id="unit-b")
    fixture(h, "pending", 2, 3, booking_id="future", asset_id="unit-b", owner=h.other)
    fixture(h, "returned", -5, -4, booking_id="old", asset_id="unit-b")
    before = h.snapshot()
    projection = desk(h)
    assert h.snapshot() == before
    assert projection["today"] == day() and projection["timeZone"] == "Asia/Almaty"
    assert projection["counts"] == {"pending": 2, "dueToday": 0, "overdue": 1}
    assert [row["id"] for row in projection["bookings"]] == ["loan", "later", "expired", "future", "old"]
    rows = {row["id"]: row for row in projection["bookings"]}
    assert rows["loan"]["overdue"] and not any(row["overdue"] for key, row in rows.items() if key != "loan")
    assert rows["loan"]["currentlyOnLoan"] and rows["later"]["currentlyOnLoan"]
    assert rows["later"]["borrower"] == h.other["user"]["username"]
    assert rows["loan"]["borrower"] == h.owner["user"]["username"]
    expect_error(action(h, later.id, "checkout", later.version), 409)
    assert h.snapshot() == before
    # The public calendar still promises scheduled availability only.
    available = validate(request(h.app, path="/api/v1/assets/unit-a/availability"), "AssetAvailability")
    assert next(item for item in available["days"] if item["date"] == day(2))["state"] == "available"
    validate(action(h, overdue.id, "return", overdue.version), "Booking")
    assert not any(row["currentlyOnLoan"] or row["overdue"] for row in desk(h)["bookings"])
    validate(action(h, later.id, "checkout", later.version), "Booking")
    assert all(row["currentlyOnLoan"] for row in desk(h)["bookings"] if row["assetId"] == "unit-a")


def test_inventory_edit_uses_current_code_location_but_never_rewrites_booking_name_or_history(h):
    booking = validate(h.create(), "Booking", 201)
    stored = h.snapshot()
    updated = validate(inventory(h, "PUT", "/unit-a", asset_input(name="Renamed unit", inventoryCode=" Renamed-code ", location=" New desk ", state="maintenance", id="injected", events=[])), "Asset")
    assert updated["id"] == "unit-a" and updated["state"] == "active"
    assert updated["inventoryCode"] == "RENAMED-CODE" and updated["location"] == "New desk"
    assert validate(request(h.app, path="/api/v1/assets/unit-a"), "Asset") == updated
    assert validate(request(h.app, path=BASE + "/" + booking["id"], session=h.owner), "Booking") == booking
    after = h.snapshot()
    assert after.bookings == stored.bookings and after.events == stored.events and after.slots == stored.slots
    row = desk(h)["bookings"][0]
    assert row["assetName"] == booking["assetName"] and row["inventoryCode"] == "RENAMED-CODE" and row["location"] == "New desk"
    # Edits replace the index atomically, freeing the previous inventory code.
    validate(inventory(h, "POST", payload=asset_input(inventoryCode="unit-a")), "Asset", 201)


def test_inventory_creation_normalizes_only_editable_fields_and_lists_stable_immutable_results(h):
    before = h.snapshot()
    added = validate(inventory(h, "POST", payload=asset_input(name="\ufeff Studio 🎥 \u3000", inventoryCode=" \u00a0new-ß\u3000", location=" Desk 🎥 ", description="  \ufeffDescription\u3000 ", id="forged", state="maintenance", role="coordinator", ownerId="forged")), "Asset", 201)
    assert added == {"id": added["id"], "name": "Studio 🎥", "inventoryCode": "NEW-SS", "category": "Cameras", "location": "Desk 🎥", "description": "Description", "state": "active"}
    assert added["id"] != "forged"
    listed = inventory(h).json()
    assert [asset["id"] for asset in listed] == [*before.assets, added["id"]]
    for item in listed:
        validate(httpx.Response(200, json=item), "Asset")
    added["name"] = "Client edit"
    assert h.snapshot().assets[listed[-1]["id"]].name == "Studio 🎥"


@pytest.mark.parametrize("field,values", [("name", ["x", "x" * 101]), ("inventoryCode", ["x", "x" * 31, "ß" * 16]), ("location", ["x", "x" * 101]), ("description", ["x" * 2001]), ("category", ["cameras", "Other", [], {}])])
def test_inventory_each_bound_category_and_normalized_code_expansion(h, field, values):
    before = h.snapshot()
    for value in values:
        expect_error(inventory(h, "POST", payload=asset_input(**{field: value})), 422, {field})
        expect_error(inventory(h, "PUT", "/unit-a", asset_input(**{field: value})), 422, {field})
        assert h.snapshot() == before


@pytest.mark.parametrize("field", ["name", "inventoryCode", "location", "description"])
@pytest.mark.parametrize("value", [None, False, 42, [], {}, "a\ud800b"])
def test_inventory_text_requires_scalar_strings_and_rejects_surrogates_before_commit(h, field, value):
    before = h.snapshot()
    raw = json.dumps(asset_input(**{field: value}))
    for method, suffix in (("POST", ""), ("PUT", "/unit-a")):
        response = request(h.app, method, STAFF + "/assets" + suffix, session=h.coordinator, content=raw, headers={"Content-Type": "application/json"})
        expect_error(response, 422, {field})
        assert h.snapshot() == before


def test_inventory_aggregate_validation_missing_fields_and_boundary_codepoints(h):
    before = h.snapshot()
    expect_error(inventory(h, "POST", payload={}), 422, {"name", "inventoryCode", "location", "description", "category"})
    assert h.snapshot() == before
    good = asset_input(name="🎥" * 100, inventoryCode="ß" * 15, location="e\u0301", description="🎥" * 2000)
    added = validate(inventory(h, "POST", payload=good), "Asset", 201)
    assert added["inventoryCode"] == "SS" * 15
    assert added["name"] == good["name"] and added["description"] == good["description"]
    minimal = validate(inventory(h, "POST", payload=asset_input(name="ab", inventoryCode="\u001cab", location="\u0085ab", description="\ufeff \u3000")), "Asset", 201)
    assert minimal["description"] == "" and minimal["inventoryCode"] == "\u001cAB" and minimal["location"] == "\u0085ab"


def test_i01_normalized_inventory_uniqueness_add_edit_and_self_edit(h):
    before = h.snapshot()
    expect_error(inventory(h, "POST", payload=asset_input(inventoryCode=" \ufeffUnIt-A\u3000")), 409, {"inventoryCode"})
    expect_error(inventory(h, "PUT", "/unit-b", asset_input(inventoryCode="unit-a")), 409, {"inventoryCode"})
    assert h.snapshot() == before
    self_edit = validate(inventory(h, "PUT", "/unit-a", asset_input(inventoryCode="unit-a")), "Asset")
    assert self_edit["inventoryCode"] == "UNIT-A"
    # Input validation wins over a duplicate code.
    expect_error(inventory(h, "POST", payload=asset_input(inventoryCode="unit-a", name="x")), 422, {"name"})


@pytest.mark.parametrize("suffix,payload", [("/missing", {}), ("/missing/state", {"state": None}), ("/id%0A", {}), ("/id%0A/state", {"state": "bad"})])
def test_inventory_lookup_before_field_validation(h, suffix, payload):
    before = h.snapshot()
    expect_error(inventory(h, "PUT", suffix, payload), 404)
    assert h.snapshot() == before


@pytest.mark.parametrize("state,start,end,blocked", [("pending", 0, 0, True), ("pending", 2, 3, True), ("approved", -1, 0, True), ("approved", 2, 3, True), ("checked_out", -3, -2, True), ("pending", -3, -2, False), ("approved", -3, -2, False), ("rejected", 0, 2, False), ("cancelled", 0, 2, False), ("returned", -2, -1, False)])
def test_i02_maintenance_dependency_boundary_and_retained_history(h, state, start, end, blocked):
    fixture(h, state, start, end)
    before = h.snapshot()
    response = inventory(h, "PUT", "/unit-a/state", {"state": "maintenance"})
    if blocked:
        expect_error(response, 409)
        assert h.snapshot() == before
    else:
        assert validate(response, "Asset")["state"] == "maintenance"
        after = h.snapshot()
        assert after.bookings == before.bookings and after.events == before.events and after.slots == before.slots


@pytest.mark.parametrize("state", [None, False, 1, [], {}, "", "Active", "retired"])
def test_asset_state_validation_before_same_state_and_dependency_rules(h, state):
    fixture(h, "pending")
    before = h.snapshot()
    expect_error(inventory(h, "PUT", "/unit-a/state", {"state": state}), 422, {"state"})
    assert h.snapshot() == before


def test_i04_maintenance_calendar_refuses_requests_repeat_switch_and_reactivation(h):
    validate(inventory(h, "PUT", "/unit-a/state", {"state": "maintenance", "id": "forged"}), "Asset")
    before = h.snapshot()
    expect_error(inventory(h, "PUT", "/unit-a/state", {"state": "maintenance"}), 409)
    expect_error(h.create(), 409, dates=[])
    assert h.snapshot() == before
    calendar = validate(request(h.app, path="/api/v1/assets/unit-a/availability"), "AssetAvailability")
    assert len(calendar["days"]) == 91 and all(item["state"] == "maintenance" for item in calendar["days"])
    active = validate(inventory(h, "PUT", "/unit-a/state", {"state": "active"}), "Asset")
    assert active["state"] == "active"
    validate(h.create(), "Booking", 201)
