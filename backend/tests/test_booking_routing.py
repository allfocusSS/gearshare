"""#29: exact decoded booking topology, dispatch order and complete rejection state."""

import json
from urllib.parse import quote

import pytest

from test_booking_api import BASE, Harness, request
from test_catalogue_api import validate

PRIVATE = {"code": "NOT_FOUND", "message": "This reservation could not be found."}
GENERIC = {"code": "NOT_FOUND", "message": "The request could not be completed."}
UNAUTHENTICATED = {"code": "UNAUTHENTICATED", "message": "Sign in to continue."}
ENVELOPE = {"code": "VALIDATION_ERROR", "message": "Send a JSON object with application/json."}


@pytest.fixture
def h():
    harness = Harness()
    harness.history("pending", booking_id="routing-owned")
    harness.history("checked_out", booking_id="routing-custody", asset_id="unit-b")
    return harness


def rejection(h, method, suffix, status, expected, *, actor="owner", allow=None, **kwargs):
    before = h.snapshot()
    response = request(h.app, method, BASE + suffix, session=getattr(h, actor) if actor else None, **kwargs)
    # The complete store includes timestamps, every event, day slot and active loan.
    assert h.snapshot() == before
    assert response.status_code == status
    assert response.headers["content-type"] == "application/json"
    assert "location" not in response.headers
    assert response.headers.get("www-authenticate") == ("Bearer" if status == 401 else None)
    if allow is None:
        assert "allow" not in response.headers
    else:
        assert set(response.headers["allow"].split(", ")) == allow
    if method == "HEAD":
        assert response.content == b""
    else:
        validate(response, "Error", status)
        assert response.content == json.dumps(expected, separators=(",", ":")).encode()
    return response


@pytest.mark.parametrize("identifier", ["missing", "routing-owned"])
@pytest.mark.parametrize("position", ["leading", "middle", "trailing"])
@pytest.mark.parametrize("method,suffix", [("GET", ""), ("POST", "/cancel")])
def test_lf_inside_one_id_component_is_private_missing_without_alias(h, identifier, position, method, suffix):
    index = {"leading": 0, "middle": 3, "trailing": len(identifier)}[position]
    malformed = identifier[:index] + "\n" + identifier[index:]
    rejection(h, method, "/" + quote(malformed, safe="") + suffix, 404, PRIVATE,
              json={"expectedVersion": False})


@pytest.mark.parametrize("identifier", ["id%0A", "routing-owned%0A"])
@pytest.mark.parametrize("authorization", [None, "Bearer unknown"])
@pytest.mark.parametrize("method,raw", [("GET", b"{"), ("POST", b"{"), ("POST", b'{"expectedVersion":1}')])
def test_matching_lf_id_authentication_precedes_envelope_and_lookup(h, identifier, authorization, method, raw):
    headers = {"Content-Type": "text/plain"}
    if authorization:
        headers["Authorization"] = authorization
    suffix = "/cancel" if method == "POST" else ""
    rejection(h, method, "/" + identifier + suffix, 401, UNAUTHENTICATED,
              actor=None, content=raw, headers=headers)


@pytest.mark.parametrize("identifier", ["ordinary-missing", "id%0A", "routing-owned", "routing-owned%0A"])
@pytest.mark.parametrize("raw,media", [(b"{", "application/json"), (b"[]", "application/json"),
                                        (b"{}", "text/plain"), (b"{}", None)])
def test_matching_cancel_envelope_precedes_foreign_or_malformed_id_lookup(h, identifier, raw, media):
    rejection(h, "POST", "/" + identifier + "/cancel", 422, ENVELOPE, actor="other", content=raw,
              headers={"Content-Type": media} if media else {})


@pytest.mark.parametrize("identifier", ["ordinary-missing", "routing-owned", "id%0A"])
@pytest.mark.parametrize("method", ["GET", "PUT", "DELETE", "OPTIONS", "HEAD"])
@pytest.mark.parametrize("actor", [None, "owner"])
def test_exact_action_unsupported_methods_precede_auth_and_detail_fallback(h, identifier, method, actor):
    rejection(h, method, "/" + identifier + "/cancel", 405, GENERIC, actor=actor, allow={"POST"})


@pytest.mark.parametrize("method", ["POST", "PUT", "DELETE", "OPTIONS", "HEAD"])
@pytest.mark.parametrize("actor", [None, "owner"])
def test_detail_unsupported_methods_have_only_get_allow(h, method, actor):
    rejection(h, method, "/ordinary-missing", 405, GENERIC, actor=actor, allow={"GET"})


@pytest.mark.parametrize("method", ["PUT", "DELETE", "OPTIONS", "HEAD"])
@pytest.mark.parametrize("actor", [None, "owner"])
def test_collection_unsupported_methods_include_both_documented_methods(h, method, actor):
    rejection(h, method, "", 405, GENERIC, actor=actor, allow={"GET", "POST"})


@pytest.mark.parametrize("identifier", ["ordinary-missing", "routing-owned"])
@pytest.mark.parametrize("method", ["GET", "POST"])
@pytest.mark.parametrize("actor", [None, "owner"])
def test_lf_after_literal_action_is_generic_unknown_and_cannot_cancel(h, identifier, method, actor):
    rejection(h, method, "/" + identifier + "/cancel%0A", 404, GENERIC, actor=actor,
              json={"expectedVersion": 1})


@pytest.mark.parametrize("suffix", [
    "/", "//cancel", "/ordinary-missing/", "/ordinary-missing/cancel/",
    "/ordinary-missing/extra", "/ordinary-missing/cancel/extra", "/ordinary-missing/extra/cancel",
    "/ordinary-missing/cancel/cancel", "/ordinary%2Fmissing", "/ordinary%2Fmissing/cancel", "/%2Fcancel",
    "/" + quote("../unknown", safe=""), "/" + quote("../unknown", safe="") + "/cancel",
])
@pytest.mark.parametrize("method", ["GET", "POST"])
@pytest.mark.parametrize("actor", [None, "owner"])
def test_empty_trailing_slash_and_extra_decoded_components_are_generic_unknown(h, suffix, method, actor):
    # The old P01 ../unknown value contains a decoded slash: PM classifies its
    # complete topology as unknown, separately from malformed single-component IDs.
    rejection(h, method, suffix, 404, GENERIC, actor=actor, json={"expectedVersion": False})


@pytest.mark.parametrize("method,status,expected,allow", [
    ("GET", 405, GENERIC, {"POST"}), ("POST", 404, PRIVATE, None), ("PUT", 405, GENERIC, {"POST"}),
])
def test_encoded_separator_can_produce_the_exact_action_template(h, method, status, expected, allow):
    rejection(h, method, "/ordinary-missing%2Fcancel", status, expected, allow=allow,
              json={"expectedVersion": False})


@pytest.mark.parametrize("method,status,expected,allow", [
    ("GET", 404, PRIVATE, None), ("POST", 405, GENERIC, {"GET"}),
])
def test_action_word_alone_is_a_detail_id(h, method, status, expected, allow):
    rejection(h, method, "/cancel", status, expected, allow=allow, json={})
