"""#30: PM's fixed method oracle across the shared exact booking/staff routes."""

import json

import pytest

from test_booking_api import Harness, request
from test_booking_routing import GENERIC
from test_catalogue_api import validate


# Deliberately independent of runtime route introspection. Both operations at
# either collection belong in Allow; HEAD and OPTIONS are never declared here.
TEMPLATES = [
    ("/api/v1/bookings", {"GET", "POST"}),
    ("/api/v1/bookings/missing", {"GET"}),
    ("/api/v1/bookings/missing/cancel", {"POST"}),
    ("/api/v1/staff/bookings", {"GET"}),
    *[(f"/api/v1/staff/bookings/missing/{verb}", {"POST"})
      for verb in ("approve", "reject", "checkout", "return")],
    ("/api/v1/staff/assets", {"GET", "POST"}),
    ("/api/v1/staff/assets/missing", {"PUT"}),
    ("/api/v1/staff/assets/missing/state", {"PUT"}),
]


@pytest.fixture
def h():
    harness = Harness()
    harness.history("pending", booking_id="routing-owned")
    harness.history("checked_out", booking_id="routing-custody", asset_id="unit-b")
    return harness


def reject(h, method, path, status=405, allow=None, actor=None, raw=b"{"):
    before = h.snapshot()
    headers = {"Content-Type": "application/json"} if raw is not None else {}
    if actor == "invalid":
        headers["Authorization"] = "Bearer unknown"
    response = request(h.app, method, path, session=getattr(h, actor) if actor in {"owner", "coordinator"} else None,
                       headers=headers, content=raw)
    assert h.snapshot() == before
    assert response.status_code == status
    assert response.headers["content-type"] == "application/json"
    assert "location" not in response.headers
    assert "www-authenticate" not in response.headers
    if allow is None:
        assert "allow" not in response.headers
    else:
        assert set(response.headers["allow"].split(", ")) == allow
    if method == "HEAD":
        assert response.content == b""
    else:
        validate(response, "Error", status)
        assert response.content == json.dumps(GENERIC, separators=(",", ":")).encode()


@pytest.mark.parametrize("method,path,allow", [
    ("GET", "/api/v1/bookings/ordinary-missing/cancel", {"POST"}),
    ("DELETE", "/api/v1/staff/assets", {"GET", "POST"}),
])
def test_original_method_header_reproductions(h, method, path, allow):
    reject(h, method, path, allow=allow, raw=None)


@pytest.mark.parametrize("path,allow", TEMPLATES)
@pytest.mark.parametrize("actor", [None, "invalid", "owner", "coordinator"])
def test_every_template_declares_complete_methods_before_authentication_or_body(h, path, allow, actor):
    for method in ("DELETE", "HEAD"):
        reject(h, method, path, allow=allow, actor=actor)


@pytest.mark.parametrize("path,allow", [
    ("/api/v1/bookings/routing-owned%0A", {"GET"}),
    ("/api/v1/bookings/routing-owned%0A/cancel", {"POST"}),
    *[(f"/api/v1/staff/bookings/routing-owned%0A/{verb}", {"POST"})
      for verb in ("approve", "reject", "checkout", "return")],
    ("/api/v1/staff/assets/unit-a%0A", {"PUT"}),
    ("/api/v1/staff/assets/unit-a%0A/state", {"PUT"}),
])
def test_lf_inside_id_is_data_for_method_dispatch_and_never_aliases_owned_records(h, path, allow):
    reject(h, "OPTIONS", path, allow=allow)


def test_unknown_complete_topology_has_no_allow_redirect_or_mutation(h):
    for path in (
        "/api/v1/bookings/", "/api/v1/bookings//cancel",
        "/api/v1/bookings/routing-owned/cancel%0A", "/api/v1/bookings/routing-owned/cancel/extra",
        "/api/v1/staff/bookings/", "/api/v1/staff/bookings//approve",
        "/api/v1/staff/bookings/routing-owned/approve%0A", "/api/v1/staff/bookings/routing-owned/reject/extra",
        "/api/v1/staff/assets/", "/api/v1/staff/assets//state",
        "/api/v1/staff/assets/unit-a/state%0A", "/api/v1/unrelated/route",
    ):
        reject(h, "POST", path, status=404, actor="coordinator")


def test_decoded_action_separator_has_action_methods_and_detail_word_has_detail_methods(h):
    reject(h, "GET", "/api/v1/bookings/missing%2Fcancel", allow={"POST"})
    reject(h, "POST", "/api/v1/bookings/cancel", allow={"GET"})
