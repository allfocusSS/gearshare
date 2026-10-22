"""Issue #8 / C01–C03, D01–D04 against the real anonymous ASGI routes."""

import asyncio
import copy
import os
import subprocess
import sys
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta, timezone
from importlib.resources import files
from pathlib import Path
from urllib.parse import quote
from zoneinfo import ZoneInfo

import httpx
import pytest
import yaml
from jsonschema import Draft202012Validator, FormatChecker

from app.calendar import CLUB_ZONE
from app.domain import Asset
from app.fixtures import add_fixture_booking, catalogue_assets, fixture_users
from app.main import create_app
from app.memory import MemoryRepository

ROOT = Path(__file__).resolve().parents[2]
SPEC = yaml.safe_load((ROOT / "openapi.yml").read_text())
NOW = datetime(2026, 10, 21, 20, tzinfo=UTC)
TODAY = date(2026, 10, 22)  # Already tomorrow in Asia/Almaty.
ASSET_KEYS = {"id", "inventoryCode", "name", "category", "description", "location", "state"}
SEED_IDS = ["camera-01", "camera-02", "camera-03", "audio-01", "audio-02", "presentation-01", "presentation-02", "accessory-01", "accessory-02", "accessory-03"]


@dataclass
class Clock:
    value: datetime = NOW
    calls: int = 0

    def __call__(self):
        self.calls += 1
        return self.value


@pytest.fixture
def clock():
    return Clock()


@pytest.fixture
def repository():
    return MemoryRepository()


@pytest.fixture
def app(repository, clock):
    return create_app(repository=repository, clock=clock)


def request(app, path="/api/v1/assets", *, method="GET", **kwargs):
    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app, raise_app_exceptions=True), base_url="http://test") as client:
            return await client.request(method, path, **kwargs)
    return asyncio.run(run())


def validate(response, schema, status=200):
    assert response.status_code == status, response.text
    Draft202012Validator(
        {"$ref": f"#/components/schemas/{schema}", "components": SPEC["components"]},
        format_checker=FormatChecker(),
    ).validate(response.json())
    return response.json()


def error(response, status, fields=None):
    body = validate(response, "Error", status)
    assert body["code"] == {404: "NOT_FOUND", 405: "NOT_FOUND", 422: "VALIDATION_ERROR", 500: "SERVICE_UNAVAILABLE"}[status]
    assert set(body) == ({"code", "message", "fields"} if fields else {"code", "message"})
    if fields:
        assert set(body["fields"]) == set(fields)
    return body


def ids(body):
    return [item["id"] for item in body["items"]]


def day(offset=0):
    return (TODAY + timedelta(days=offset)).isoformat()


def filtered(app, **params):
    return validate(request(app, params=params), "CatalogueResult")


def calendar(app, asset_id="camera-01", **kwargs):
    return validate(request(app, f"/api/v1/assets/{asset_id}/availability", **kwargs), "AssetAvailability")


def test_c01_seed_physical_units_four_categories_stable_order_and_exact_public_shapes(repository, clock):
    # Preserve this public-read test's original empty-identity precondition.
    # The default app's new private-history fixtures are covered separately.
    with repository.transaction() as transaction:
        for asset in catalogue_assets():
            transaction.add_asset(asset)
    app = create_app(repository=repository, clock=clock, seed=False)
    body = filtered(app)
    assert set(body) == {"items", "range", "today", "horizonEnd"}
    assert body["range"] is None and body["today"] == day() and body["horizonEnd"] == day(90)
    assert ids(body) == SEED_IDS
    assert 8 <= len(body["items"]) <= 12
    assert len({item["id"] for item in body["items"]}) == len(body["items"])
    assert len({item["inventoryCode"].upper() for item in body["items"]}) == len(body["items"])
    assert {item["category"] for item in body["items"]} == {"Cameras", "Audio", "Presentation", "Accessories"}
    for item in body["items"]:
        assert set(item) == ASSET_KEYS
        assert validate(request(app, f"/api/v1/assets/{item['id']}"), "Asset") == item
    assert body["items"][2]["state"] == "maintenance"
    assert not repository._state.users and not repository._state.sessions


@pytest.mark.parametrize("search,expected", [
    ("  FIELD CAMERA  ", ["camera-01", "camera-02"]),
    ("cam-001 cameras", ["camera-01"]),  # Cross inventory-code/category boundary.
    ("padded case. media room", ["camera-01"]),  # Description/location boundary.
    ("Sound cabinet", ["audio-01", "audio-02"]),
    ("Accessories", ["accessory-01", "accessory-02", "accessory-03"]),
    ("NO SUCH FICTIONAL UNIT", []),
    ("CAM-001  Cameras", []),  # Internal spacing is literal.
    ("\ufeff\u00a0\u2028", SEED_IDS),
    ("\u0085", []),  # Not ECMAScript trim whitespace.
    ("\u001c", []),
    ("x" * 10000, []),  # No invented search-length cap.
])
def test_c01_literal_joined_search_and_order(app, search, expected):
    assert ids(filtered(app, search=search)) == expected


def test_c01_all_filters_intersect_maintenance_is_excluded_only_with_dates(app):
    assert ids(filtered(app, search="field", category="Cameras", startDate=day(1), endDate=day(1))) == ["camera-01"]
    assert ids(filtered(app, search="field", category="Audio", startDate=day(1), endDate=day(1))) == []
    assert ids(filtered(app, category="Cameras", startDate=day(2), endDate=day(3))) == []
    assert ids(filtered(app, category="Cameras")) == SEED_IDS[:3]
    assert ids(filtered(app, category="Cameras", startDate=day(5), endDate=day(5))) == SEED_IDS[:2]
    assert len(filtered(app, startDate=day(30), endDate=day(30))["items"]) == 9


@pytest.mark.parametrize("category", ["", "cameras", " Cameras", "Cameras ", "Video", "Cameras,Audio"])
def test_c01_category_is_the_exact_frozen_enum(app, category):
    error(request(app, params={"category": category}), 422, {"category"})


def test_c01_dates_are_validated_before_category(app):
    error(request(app, params={"category": "invalid", "startDate": "bad", "endDate": day()}), 422, {"startDate"})


@pytest.mark.parametrize("params,expected", [
    ([("search", "missing"), ("search", "CAM-002")], ["camera-02"]),
    ([("search", "CAM-002"), ("search", "")], SEED_IDS),
    ([("category", "invalid"), ("category", "Audio")], ["audio-01", "audio-02"]),
    ([("startDate", "bad"), ("startDate", day(30)), ("endDate", "bad"), ("endDate", day(30))], [value for value in SEED_IDS if value != "camera-03"]),
    ([("startDate", day()), ("startDate", ""), ("endDate", day()), ("endDate", "")], SEED_IDS),
])
def test_c01_repeated_known_scalars_use_last_value_before_validation(app, params, expected):
    assert ids(validate(request(app, params=params), "CatalogueResult")) == expected


@pytest.mark.parametrize("params,fields", [
    ([("category", "Audio"), ("category", "")], {"category"}),
    ([("startDate", day()), ("startDate", ""), ("endDate", day())], {"startDate"}),
    ([("startDate", day()), ("endDate", day()), ("endDate", "")], {"endDate"}),
    ([("startDate", day()), ("startDate", " "), ("endDate", day())], {"startDate"}),
])
def test_c01_last_effective_scalar_can_be_invalid_or_absent(app, params, fields):
    error(request(app, params=params), 422, fields)


@pytest.mark.parametrize("params", [{}, {"startDate": ""}, {"endDate": ""}, {"startDate": "", "endDate": ""}])
def test_dates_missing_or_exactly_empty_mean_no_range(app, params):
    body = filtered(app, **params)
    assert body["range"] is None and ids(body) == SEED_IDS


@pytest.mark.parametrize("start,end", [(0, 0), (0, 13), (77, 90), (90, 90)])
def test_d01_d02_same_day_fourteen_days_and_horizon_are_accepted(app, start, end):
    body = filtered(app, startDate=day(start), endDate=day(end))
    assert body["range"] == {"startDate": day(start), "endDate": day(end)}
    assert body["today"] == day() and body["horizonEnd"] == day(90)


@pytest.mark.parametrize("params,fields", [
    ({"startDate": day()}, {"endDate"}),
    ({"endDate": day()}, {"startDate"}),
    ({"startDate": "", "endDate": day()}, {"startDate"}),
    ({"startDate": day(), "endDate": ""}, {"endDate"}),
    ({"startDate": " ", "endDate": " "}, {"startDate", "endDate"}),
    ({"startDate": day(-1), "endDate": day()}, {"startDate"}),
    ({"startDate": day(2), "endDate": day(1)}, {"endDate"}),
    ({"startDate": day(), "endDate": day(14)}, {"endDate"}),
    ({"startDate": day(90), "endDate": day(91)}, {"endDate"}),
    ({"startDate": day(91), "endDate": day(91)}, {"startDate", "endDate"}),
])
def test_d03_invalid_partial_past_reversed_fifteen_day_and_horizon_inputs(app, repository, params, fields):
    before = copy.deepcopy(repository._state)
    error(request(app, params=params), 422, fields)
    assert repository._state == before


@pytest.mark.parametrize("malformed", [
    "2026-2-03", "2026-02-30", "2025-02-29", "2026-13-01", "0000-01-01",
    "２０２６-１０-２２", "٢٠٢٦-١٠-٢٢", "2026-10-22\n", "2026-10-22\r\n",
    "2026-10-22T00:00:00Z", " 2026-10-22", "2026-10-22 ", "\t", "null",
])
@pytest.mark.parametrize("field", ["startDate", "endDate"])
def test_dates_require_full_ascii_shape_and_real_calendar_without_parser_errors(app, malformed, field):
    params = {"startDate": day(), "endDate": day(), field: malformed}
    error(request(app, params=params), 422, {field})


@pytest.mark.parametrize("asset_id", ["missing", "x" * 101, " ", "camera-01\n", "../unknown", "camera-01/extra", "None"])
@pytest.mark.parametrize("suffix", ["", "/availability"])
def test_c02_unknown_and_malformed_path_ids_are_404_not_422(app, asset_id, suffix):
    error(request(app, f"/api/v1/assets/{quote(asset_id, safe='')}{suffix}"), 404)


def test_c03_anonymous_and_other_students_receive_identical_public_data(app, repository):
    responses = {path: request(app, path).json() for path in ["/api/v1/assets", "/api/v1/assets/audio-01", "/api/v1/assets/audio-01/availability"]}
    sessions = []
    for username in ["student_one", "student_two"]:
        response = request(app, "/api/v1/auth/register", method="POST", json={"username": username, "password": "PrivatePassword42!"})
        sessions.append(validate(response, "Session", 201))
    for authorization in [None, "Bearer invalid", "malformed", *[f"Bearer {session['token']}" for session in sessions]]:
        headers = {"Authorization": authorization} if authorization else {}
        for path, anonymous in responses.items():
            response = request(app, path, headers=headers, params={"include": "borrower,bookings,version,custody", "userId": sessions[0]["user"]["id"]})
            assert response.status_code == 200 and response.json() == anonymous
            for private in [*repository._state.bookings, *repository._state.events, *repository._state.users, *repository._state.sessions, "student_one", "student_two", "PrivatePassword42!"]:
                assert private not in response.text
    result = calendar(app, "audio-01")
    assert set(result) == {"assetId", "today", "horizonEnd", "timeZone", "days"}
    assert all(set(row) == {"date", "state"} for row in result["days"])
    assert all(set(item) == ASSET_KEYS for item in responses["/api/v1/assets"]["items"])


def test_public_calendar_exactly_91_consecutive_inclusive_dates_and_maintenance(app):
    result = calendar(app)
    assert result["today"] == day() and result["horizonEnd"] == day(90) and result["timeZone"] == "Asia/Almaty"
    assert [row["date"] for row in result["days"]] == [day(i) for i in range(91)]
    assert [row["date"] for row in result["days"] if row["state"] == "occupied"] == [day(i) for i in (2, 3, 4)]
    assert {row["state"] for row in calendar(app, "camera-03")["days"]} == {"maintenance"}


@pytest.mark.parametrize("state,reserves", [("pending", True), ("approved", True), ("checked_out", True), ("rejected", False), ("cancelled", False), ("returned", False)])
def test_each_reserving_or_terminal_state_same_day_adjacent_day_and_independent_unit(state, reserves, repository, clock):
    with repository.transaction() as transaction:
        for asset_id in ("first-unit", "second-unit"):
            transaction.add_asset(Asset(asset_id, asset_id.upper(), "Fictional Unit", "Cameras", "Original test equipment", "Test shelf"))
        owner, coordinator = fixture_users(transaction)
        add_fixture_booking(transaction, booking_id="private-booking-id", asset=transaction.asset_by_id("first-unit"), owner=owner, coordinator=coordinator, start=TODAY, end=TODAY, state=state, now=NOW)
    app = create_app(repository=repository, clock=clock, seed=False)
    result = calendar(app, "first-unit")
    assert result["days"][0] == {"date": day(), "state": "occupied" if reserves else "available"}
    assert result["days"][1] == {"date": day(1), "state": "available"}
    assert ids(filtered(app, startDate=day(), endDate=day())) == (["second-unit"] if reserves else ["first-unit", "second-unit"])
    assert ids(filtered(app, startDate=day(1), endDate=day(1))) == ["first-unit", "second-unit"]
    assert "private-booking-id" not in request(app, "/api/v1/assets/first-unit/availability").text


def test_overdue_does_not_extend_occupancy_or_hide_later_scheduled_availability(app):
    rows = calendar(app, "audio-01")["days"]
    assert [row["date"] for row in rows if row["state"] == "occupied"] == [day(), day(1)]
    assert "audio-01" in ids(filtered(app, startDate=day(2), endDate=day(2)))
    # Physical second-checkout enforcement requires the later staff story.
    assert all(set(row) == {"date", "state"} for row in rows)


def test_d04_packaged_and_zoneinfo_almaty_are_utc_plus_five_for_2026():
    instant = datetime(2026, 7, 1, 20, tzinfo=UTC)
    assert instant.astimezone(CLUB_ZONE).utcoffset() == timedelta(hours=5)
    assert instant.astimezone(ZoneInfo("Asia/Almaty")).utcoffset() == timedelta(hours=5)
    assert instant.astimezone(CLUB_ZONE).date() == date(2026, 7, 2)


def test_club_zone_uses_locked_package_even_when_host_database_is_wrong(tmp_path):
    # A fresh process sees an intentionally wrong host Almaty (the UTC tzfile).
    # The application must still use the locked package's actual +05 policy.
    host_file = tmp_path / "Asia" / "Almaty"
    host_file.parent.mkdir()
    host_file.write_bytes(files("tzdata.zoneinfo").joinpath("UTC").read_bytes())
    script = """
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo
from app.calendar import CLUB_ZONE, club_today
instant = datetime(2026, 10, 21, 20, tzinfo=UTC)
assert instant.astimezone(ZoneInfo('Asia/Almaty')).utcoffset() == timedelta(0)
assert instant.astimezone(CLUB_ZONE).utcoffset() == timedelta(hours=5)
assert club_today(lambda: instant).isoformat() == '2026-10-22'
"""
    result = subprocess.run([sys.executable, "-c", script], env={**os.environ, "PYTHONTZPATH": str(tmp_path)}, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr


def test_d04_utc_and_equivalent_offset_clocks_produce_same_local_policy(repository):
    utc_app = create_app(repository=repository, clock=Clock(NOW))
    offset_app = create_app(repository=repository, clock=Clock(NOW.astimezone(timezone(timedelta(hours=-7)))))
    assert filtered(utc_app) == filtered(offset_app)
    assert calendar(utc_app) == calendar(offset_app)
    error(request(utc_app, params={"startDate": NOW.date().isoformat(), "endDate": day()}), 422, {"startDate"})


@pytest.mark.parametrize("operation", ["list", "calendar"])
def test_one_captured_club_date_per_operation_even_when_clock_crosses_midnight(repository, operation):
    create_app(repository=repository, clock=Clock(NOW))
    class MidnightClock:
        calls = 0
        def __call__(self):
            self.calls += 1
            return datetime(2026, 10, 21, 18, 59, 59, tzinfo=UTC) if self.calls == 1 else datetime(2026, 10, 21, 19, 0, tzinfo=UTC)
    clock = MidnightClock()
    app = create_app(repository=repository, clock=clock)
    assert clock.calls == 0  # Existing stores are not reseeded or moved.
    if operation == "list":
        body = filtered(app, startDate="2026-10-21", endDate="2026-10-21")
        assert body["range"] == {"startDate": "2026-10-21", "endDate": "2026-10-21"}
    else:
        body = calendar(app)
        assert body["days"][0]["date"] == "2026-10-21" and body["days"][-1]["date"] == "2027-01-19"
    assert body["today"] == "2026-10-21" and body["horizonEnd"] == "2027-01-19"
    assert clock.calls == 1


def test_seeds_capture_local_day_once_and_reads_never_move_or_reset_them(app, repository, clock):
    assert clock.calls == 1 and repository._state.seeded_on == TODAY
    before = copy.deepcopy(repository._state)
    for _ in range(2):
        filtered(app)
        calendar(app)
        request(app, "/api/v1/assets/camera-01")
    assert repository._state == before
    clock.value += timedelta(days=200)
    later = calendar(app)
    assert later["today"] == (TODAY + timedelta(days=200)).isoformat()
    assert {row["state"] for row in later["days"]} == {"available"}
    assert ids(filtered(app)) == SEED_IDS and repository._state == before
    create_app(repository=repository, clock=clock)
    assert repository._state == before


@pytest.mark.parametrize("instant", [datetime(2027, 2, 28, 20, tzinfo=UTC), datetime(2032, 2, 28, 20, tzinfo=UTC)])
def test_fresh_seed_schedules_remain_relative_for_future_and_leap_dates(instant):
    app = create_app(clock=Clock(instant))
    result = calendar(app)
    today = instant.astimezone(CLUB_ZONE).date()
    assert result["today"] == today.isoformat()
    assert [row["date"] for row in result["days"] if row["state"] == "occupied"] == [(today + timedelta(days=i)).isoformat() for i in (2, 3, 4)]


def test_naive_read_clock_fails_safely_without_moving_seed(app, clock, repository, caplog):
    before = copy.deepcopy(repository._state)
    clock.value = NOW.replace(tzinfo=None)
    error(request(app), 500)
    assert repository._state == before
    assert "Clock must" not in caplog.text


def test_catalogue_remains_read_only_staff_routes_gated_and_frontend_stays_mock(app):
    for path in ["/api/v1/assets", "/api/v1/assets/camera-01", "/api/v1/assets/camera-01/availability"]:
        response = request(app, path, method="POST", json={"state": "active"})
        error(response, 405)
        assert "GET" in response.headers["Allow"]
    for path in ["/api/v1/staff/assets", "/api/v1/staff/bookings"]:
        error(request(app, path), 404)
    # #9 now provides private bookings; this public caller still cannot read them.
    assert request(app, "/api/v1/bookings").status_code == 401
    assert "createMockService" in (ROOT / "frontend/src/services/index.ts").read_text()


def test_trusted_empty_repository_returns_an_empty_catalogue_and_404_without_seeding(clock):
    app = create_app(repository=MemoryRepository(), clock=clock, seed=False)
    assert filtered(app) == {"items": [], "range": None, "today": day(), "horizonEnd": day(90)}
    error(request(app, "/api/v1/assets/camera-01"), 404)
