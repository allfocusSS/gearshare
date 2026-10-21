"""Contract tests for the versioned ``openapi.yml`` (issue #6).

They validate the document with the real ``openapi-spec-validator`` and cross-check it against the artifacts it
was derived from: the ``GearShareService`` interface and DTO types in ``frontend/src/services/types.ts`` and the
wire-shaped samples generated from the mock service (``frontend/tests/fixtures/contract-samples.json``, kept
in sync by ``frontend/tests/contract.test.mjs``). Auth now has real ASGI tests in ``test_auth_api.py``;
these checks preserve the whole agreement that the remaining stages must honour.
"""

from __future__ import annotations

import copy
import json
import re
from collections import Counter
from pathlib import Path
from typing import Any

import pytest
import yaml
from jsonschema import Draft202012Validator
from openapi_spec_validator import validate
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

ROOT = Path(__file__).resolve().parents[2]
SPEC_PATH = ROOT / "openapi.yml"
TYPES_PATH = ROOT / "frontend" / "src" / "services" / "types.ts"
SAMPLES_PATH = ROOT / "frontend" / "tests" / "fixtures" / "contract-samples.json"

HTTP_METHODS = {"get", "put", "post", "delete", "options", "head", "patch", "trace"}
ACCESS_VALUES = {"public", "authenticated", "owner-or-coordinator", "coordinator"}
BASE = "urn:gearshare:openapi"
MUTATIONS = ["approveBooking", "rejectBooking", "cancelBooking", "checkoutBooking", "returnBooking"]
EXPECTED_METHODS = {
    "currentUser", "login", "register", "logout", "listAssets", "getAsset", "getAssetAvailability",
    "requestBooking", "listBookings", "getBooking", "cancelBooking", "listStaffBookings", "approveBooking",
    "rejectBooking", "checkoutBooking", "returnBooking", "listInventory", "addAsset", "editAsset", "setAssetState",
}
# 405 (unsupported method) is NOT_FOUND and 500 (unhandled exception) is SERVICE_UNAVAILABLE: the code set is unchanged.
STATUS_BY_CODE = {
    "VALIDATION_ERROR": {"422"}, "INVALID_CREDENTIALS": {"401"}, "USERNAME_TAKEN": {"409"},
    "SERVICE_UNAVAILABLE": {"503", "500"}, "NOT_FOUND": {"404", "405"}, "UNAUTHENTICATED": {"401"}, "FORBIDDEN": {"403"},
    "CONFLICT": {"409"},
}
# The `default` response covers statuses that are not individually documented; each of its examples names one.
DEFAULT_EXAMPLE_STATUS = {"unknownRoute": "404", "malformedBody": "422", "unexpected": "500"}
# Non-2xx wiring of every operation: a shared `components.responses` name, or `inline:<example refs>` for a response
# written in place. This is what stops one shared response being swapped for another (e.g. a 422 `VersionInvalid`
# replaced by the generic `ValidationFailed`).
ERROR_WIRING = {
    "register": {"409": "inline:UsernameTaken", "422": "ValidationFailed"},
    "login": {"401": "inline:InvalidCredentials", "422": "ValidationFailed"},
    "logout": {"401": "Unauthenticated"},
    "currentUser": {"401": "Unauthenticated"},
    "listAssets": {"422": "ValidationFailed"},
    "getAsset": {"404": "AssetNotFound"},
    "getAssetAvailability": {"404": "AssetNotFound"},
    "requestBooking": {"401": "Unauthenticated", "404": "AssetNotFound", "409": "inline:DatesUnavailable", "422": "BookingRequestInvalid"},
    "listBookings": {"401": "Unauthenticated"},
    "getBooking": {"401": "Unauthenticated", "404": "BookingNotFound"},
    "cancelBooking": {"401": "Unauthenticated", "404": "BookingNotFound", "409": "TransitionConflict", "422": "VersionInvalid"},
    "listStaffBookings": {"401": "Unauthenticated", "403": "Forbidden"},
    "approveBooking": {"401": "Unauthenticated", "403": "Forbidden", "404": "BookingNotFound", "409": "TransitionConflict", "422": "VersionInvalid"},
    "rejectBooking": {"401": "Unauthenticated", "403": "Forbidden", "404": "BookingNotFound", "409": "TransitionConflict", "422": "NoteOrVersionInvalid"},
    "checkoutBooking": {"401": "Unauthenticated", "403": "Forbidden", "404": "BookingNotFound", "409": "TransitionConflict", "422": "NoteOrVersionInvalid"},
    "returnBooking": {"401": "Unauthenticated", "403": "Forbidden", "404": "BookingNotFound", "409": "TransitionConflict", "422": "NoteOrVersionInvalid"},
    "listInventory": {"401": "Unauthenticated", "403": "Forbidden"},
    "addAsset": {"401": "Unauthenticated", "403": "Forbidden", "409": "DuplicateInventoryCode", "422": "ValidationFailed"},
    "editAsset": {"401": "Unauthenticated", "403": "Forbidden", "404": "AssetNotFound", "409": "DuplicateInventoryCode", "422": "ValidationFailed"},
    "setAssetState": {"401": "Unauthenticated", "403": "Forbidden", "404": "AssetNotFound", "409": "inline:MaintenanceBlocked", "422": "ValidationFailed"},
}
SUCCESS_STATUS = {
    "register": "201", "login": "200", "logout": "204", "currentUser": "200", "listAssets": "200", "getAsset": "200",
    "getAssetAvailability": "200", "requestBooking": "201", "listBookings": "200", "getBooking": "200",
    "cancelBooking": "200", "listStaffBookings": "200", "approveBooking": "200", "rejectBooking": "200",
    "checkoutBooking": "200", "returnBooking": "200", "listInventory": "200", "addAsset": "201", "editAsset": "200",
    "setAssetState": "200",
}


# --------------------------------------------------------------------------- loading helpers


@pytest.fixture(scope="module")
def spec() -> dict[str, Any]:
    return yaml.safe_load(SPEC_PATH.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def ts() -> str:
    raw = TYPES_PATH.read_text(encoding="utf-8")
    raw = re.sub(r"/\*.*?\*/", "", raw, flags=re.S)
    return re.sub(r"(?m)//.*$", "", raw)


@pytest.fixture(scope="module")
def samples() -> list[dict[str, Any]]:
    return json.loads(SAMPLES_PATH.read_text(encoding="utf-8"))["samples"]


def operations(spec: dict[str, Any]) -> list[tuple[str, str, dict[str, Any]]]:
    return [
        (path, method, op)
        for path, item in spec["paths"].items()
        for method, op in item.items()
        if method in HTTP_METHODS
    ]


def by_service_method(spec: dict[str, Any]) -> dict[str, tuple[str, str, dict[str, Any]]]:
    return {op["x-service-method"]: (path, method, op) for path, method, op in operations(spec) if "x-service-method" in op}


def resolve(spec: dict[str, Any], node: Any) -> Any:
    """Follow ``$ref`` chains inside the document."""
    while isinstance(node, dict) and "$ref" in node:
        target: Any = spec
        for part in node["$ref"].removeprefix("#/").split("/"):
            target = target[part]
        node = target
    return node


def schema_name(node: Any) -> str | None:
    if isinstance(node, dict) and "$ref" in node:
        return node["$ref"].rsplit("/", 1)[-1]
    return None


def absolutize(node: Any) -> Any:
    """Point every local ``$ref`` at the registered document so fragments can be validated on their own."""
    node = copy.deepcopy(node)

    def walk(value: Any) -> None:
        if isinstance(value, dict):
            ref = value.get("$ref")
            if isinstance(ref, str) and ref.startswith("#/"):
                value["$ref"] = f"{BASE}{ref}"
            for child in value.values():
                walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)

    walk(node)
    return node


@pytest.fixture(scope="module")
def registry(spec: dict[str, Any]) -> Registry:
    return Registry().with_resource(BASE, Resource.from_contents(spec, default_specification=DRAFT202012))


def schema_errors(registry: Registry, schema: Any, value: Any) -> list[str]:
    validator = Draft202012Validator(absolutize(schema), registry=registry, format_checker=Draft202012Validator.FORMAT_CHECKER)
    return [f"{'/'.join(map(str, e.absolute_path)) or '<root>'}: {e.message}" for e in validator.iter_errors(value)]


def trimmed(spec: dict[str, Any], schema: Any, value: Any) -> Any:
    """Apply the documented outer-whitespace trim (``x-trimmed``) to a request body before schema validation."""
    schema = resolve(spec, schema)
    if isinstance(value, dict) and isinstance(schema, dict) and "properties" in schema:
        out = dict(value)
        for key, child in schema["properties"].items():
            if key in out:
                out[key] = trimmed(spec, child, out[key])
        return out
    if isinstance(value, str) and isinstance(schema, dict) and schema.get("x-trimmed"):
        return value.strip()
    return value


def assert_exact(spec: dict[str, Any], value: Any, schema: Any, where: str = "$") -> None:
    """Schema validation allows unknown properties; a response must not carry any the contract does not declare."""
    schema = resolve(spec, schema)
    if "oneOf" in schema:
        branches = [resolve(spec, branch) for branch in schema["oneOf"]]
        if value is None:
            assert any(b.get("type") == "null" for b in branches), f"{where}: null is not allowed"
            return
        schema = next(b for b in branches if b.get("type") != "null")
    if isinstance(value, dict):
        declared = schema.get("properties", {})
        extra = set(value) - set(declared)
        assert not extra, f"{where}: undeclared properties {sorted(extra)}"
        for key, child in value.items():
            assert_exact(spec, child, declared[key], f"{where}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            assert_exact(spec, child, schema["items"], f"{where}[{index}]")


# --------------------------------------------------------------------------- TypeScript parsing helpers


def matching_brace(text: str, open_index: int) -> int:
    depth = 0
    for index in range(open_index, len(text)):
        depth += {"{": 1, "}": -1}.get(text[index], 0)
        if depth == 0:
            return index
    raise AssertionError("unbalanced braces in types.ts")


def split_top_level(body: str) -> list[str]:
    parts, depth, current = [], 0, ""
    for char in body:
        depth += 1 if char in "{[(<" else -1 if char in "}])>" else 0
        if char in ";\n" and depth == 0:
            parts.append(current)
            current = ""
        else:
            current += char
    parts.append(current)
    return [part.strip() for part in parts if part.strip()]


def ts_interfaces(ts: str) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for match in re.finditer(r"export interface (\w+)(?:\s+extends\s+([\w\s,]+?))?\s*\{", ts):
        end = matching_brace(ts, match.end() - 1)
        members: dict[str, tuple[bool, str]] = {}
        for member in split_top_level(ts[match.end():end]):
            parsed = re.match(r"(\w+)(\?)?\s*:\s*(.+)$", member, flags=re.S)
            if parsed:
                members[parsed.group(1)] = (bool(parsed.group(2)), parsed.group(3).strip())
        parents = [p.strip() for p in (match.group(2) or "").split(",") if p.strip()]
        result[match.group(1)] = {"extends": parents, "members": members, "raw": ts[match.end():end]}
    return result


def ts_members(interfaces: dict[str, dict[str, Any]], name: str) -> dict[str, tuple[bool, str]]:
    merged: dict[str, tuple[bool, str]] = {}
    for parent in interfaces[name]["extends"]:
        merged.update(ts_members(interfaces, parent))
    merged.update(interfaces[name]["members"])
    return merged


def ts_union(ts: str, name: str) -> set[str]:
    match = re.search(rf"export type {name}\s*=\s*([^\n]+)", ts)
    assert match, f"type {name} not found in types.ts"
    return set(re.findall(r"'([^']+)'", match.group(1)))


def ts_categories(ts: str) -> set[str]:
    match = re.search(r"export const CATEGORIES = \[([^\]]+)\] as const", ts)
    assert match
    return set(re.findall(r"'([^']+)'", match.group(1)))


def ts_service_methods(ts: str) -> list[str]:
    start = ts.index("export interface GearShareService")
    end = matching_brace(ts, ts.index("{", start))
    return [m.group(1) for line in split_top_level(ts[ts.index("{", start) + 1:end]) if (m := re.match(r"(\w+)\(", line))]


def admits_null(spec: dict[str, Any], schema: Any) -> bool:
    schema = resolve(spec, schema)
    if schema.get("type") == "null" or (isinstance(schema.get("type"), list) and "null" in schema["type"]):
        return True
    return any(admits_null(spec, branch) for key in ("oneOf", "anyOf") for branch in schema.get(key, []))


def non_null(spec: dict[str, Any], schema: Any) -> dict[str, Any]:
    schema = resolve(spec, schema)
    for key in ("oneOf", "anyOf"):
        for branch in schema.get(key, []):
            if resolve(spec, branch).get("type") != "null":
                return non_null(spec, branch)
    return schema


# =========================================================================== (a) real validator


def test_spec_validates_with_the_real_openapi_validator(spec: dict[str, Any]) -> None:
    validate(spec)
    assert spec["openapi"] == "3.1.0"
    assert re.fullmatch(r"\d+\.\d+\.\d+", spec["info"]["version"])
    assert spec["servers"][0]["url"].startswith("http://127.0.0.1:8000")


# =========================================================================== (b)/(c) service-method mapping


def test_every_api_operation_is_machine_mapped_to_a_service_method(spec: dict[str, Any]) -> None:
    seen_ids: set[str] = set()
    for path, method, op in operations(spec):
        assert op["operationId"] not in seen_ids, f"duplicate operationId {op['operationId']}"
        seen_ids.add(op["operationId"])
        if (path, method) == ("/health", "get"):
            assert "x-service-method" not in op  # infrastructure probe, not a GearShareService method
            continue
        assert path.startswith("/api/v1/"), path
        assert op.get("x-service-method"), f"{method.upper()} {path} lacks x-service-method"
        assert op["operationId"] == op["x-service-method"]
        assert op.get("x-access") in ACCESS_VALUES, f"{method.upper()} {path} lacks a valid x-access"
        assert op.get("responses"), path


def test_every_gearshare_service_method_has_exactly_one_operation(spec: dict[str, Any], ts: str) -> None:
    declared = ts_service_methods(ts)
    assert len(declared) == len(set(declared)), "duplicate method in GearShareService"
    assert set(declared) == EXPECTED_METHODS, "the frontend service surface changed; update the contract"
    mapped = Counter(op["x-service-method"] for _, _, op in operations(spec) if "x-service-method" in op)
    for name in declared:
        assert mapped[name] == 1, f"{name} maps to {mapped[name]} operations"
    assert set(mapped) == set(declared), f"contract has operations without a service method: {set(mapped) - set(declared)}"


def test_paths_and_methods_follow_the_documented_table(spec: dict[str, Any]) -> None:
    table = {
        "register": ("post", "/api/v1/auth/register"), "login": ("post", "/api/v1/auth/login"),
        "logout": ("post", "/api/v1/auth/logout"), "currentUser": ("get", "/api/v1/auth/me"),
        "listAssets": ("get", "/api/v1/assets"), "getAsset": ("get", "/api/v1/assets/{assetId}"),
        "getAssetAvailability": ("get", "/api/v1/assets/{assetId}/availability"),
        "requestBooking": ("post", "/api/v1/bookings"), "listBookings": ("get", "/api/v1/bookings"),
        "getBooking": ("get", "/api/v1/bookings/{bookingId}"), "cancelBooking": ("post", "/api/v1/bookings/{bookingId}/cancel"),
        "listStaffBookings": ("get", "/api/v1/staff/bookings"),
        "approveBooking": ("post", "/api/v1/staff/bookings/{bookingId}/approve"),
        "rejectBooking": ("post", "/api/v1/staff/bookings/{bookingId}/reject"),
        "checkoutBooking": ("post", "/api/v1/staff/bookings/{bookingId}/checkout"),
        "returnBooking": ("post", "/api/v1/staff/bookings/{bookingId}/return"),
        "listInventory": ("get", "/api/v1/staff/assets"), "addAsset": ("post", "/api/v1/staff/assets"),
        "editAsset": ("put", "/api/v1/staff/assets/{assetId}"), "setAssetState": ("put", "/api/v1/staff/assets/{assetId}/state"),
    }
    actual = {name: (method, path) for name, (path, method, _) in by_service_method(spec).items()}
    assert actual == table
    # The same table is published for humans in _docs/api.md.
    doc = (ROOT / "_docs" / "api.md").read_text(encoding="utf-8")
    for name, (method, path) in table.items():
        assert f"`{name}`" in doc and f"`{method.upper()} {path}`" in doc, f"_docs/api.md is missing {name}"


# =========================================================================== (d) documented responses


def test_auth_and_access_declarations_are_consistent(spec: dict[str, Any]) -> None:
    scheme = spec["components"]["securitySchemes"]["bearerAuth"]
    assert (scheme["type"], scheme["scheme"]) == ("http", "bearer")
    for path, method, op in operations(spec):
        if "x-service-method" not in op:
            continue
        secured = bool(op.get("security"))
        assert secured == (op["x-access"] != "public"), f"{op['x-service-method']}: security vs x-access"
        if secured:
            assert op["security"] == [{"bearerAuth": []}]


def test_error_statuses_are_documented_where_applicable(spec: dict[str, Any]) -> None:
    required = {
        "register": {"201", "409", "422"}, "login": {"200", "401", "422"}, "logout": {"204", "401"}, "currentUser": {"200", "401"},
        "listAssets": {"200", "422"}, "getAsset": {"200", "404"}, "getAssetAvailability": {"200", "404"},
        "requestBooking": {"201", "401", "404", "409", "422"}, "listBookings": {"200", "401"}, "getBooking": {"200", "401", "404"},
        "cancelBooking": {"200", "401", "404", "409", "422"}, "listStaffBookings": {"200", "401", "403"},
        "approveBooking": {"200", "401", "403", "404", "409", "422"}, "rejectBooking": {"200", "401", "403", "404", "409", "422"},
        "checkoutBooking": {"200", "401", "403", "404", "409", "422"}, "returnBooking": {"200", "401", "403", "404", "409", "422"},
        "listInventory": {"200", "401", "403"}, "addAsset": {"201", "401", "403", "409", "422"},
        "editAsset": {"200", "401", "403", "404", "409", "422"}, "setAssetState": {"200", "401", "403", "404", "409", "422"},
    }
    assert set(required) == EXPECTED_METHODS
    for name, (path, method, op) in by_service_method(spec).items():
        statuses = set(op["responses"])
        assert required[name] <= statuses, f"{name}: missing {sorted(required[name] - statuses)}"
        assert "503" in statuses, f"{name}: service-unavailable is not documented"
        assert "default" in statuses, f"{name}: framework-generated and unexpected errors are not documented"
        # Derived rules, so a new operation cannot silently skip them.
        if op.get("security"):
            assert "401" in statuses
        if op["x-access"] == "coordinator":
            assert "403" in statuses
        if "{" in path:
            assert "404" in statuses
        for status, response in op["responses"].items():
            response = resolve(spec, response)
            assert response.get("description"), f"{name} {status}: no description"
            if status.startswith(("4", "5")) or status == "default":
                body = response["content"]["application/json"]["schema"]
                assert schema_name(body) == "Error", f"{name} {status}: error bodies use the shared Error schema"
            assert status in {"200", "201", "204", "401", "403", "404", "409", "422", "503", "default"}


def test_private_booking_policy_is_404_not_403_and_staff_routes_are_403(spec: dict[str, Any]) -> None:
    methods = by_service_method(spec)
    for name in ("getBooking", "cancelBooking"):
        _, _, op = methods[name]
        assert op["x-access"] == "owner-or-coordinator"
        assert "403" not in op["responses"], f"{name}: a non-owner must see 404, never 403"
        assert "same 404" in op["description"] or "indistinguishable" in json.dumps(resolve(spec, op["responses"]["404"]))
    hidden = resolve(spec, methods["getBooking"][2]["responses"]["404"])
    assert "indistinguishable" in hidden["description"]
    for name, (_, _, op) in methods.items():
        if op["x-access"] == "coordinator":
            assert "403" in op["responses"]


SUCCESS_SCHEMA = {
    "register": "Session", "login": "Session", "logout": None, "currentUser": "User", "listAssets": "CatalogueResult",
    "getAsset": "Asset", "getAssetAvailability": "AssetAvailability", "requestBooking": "Booking", "listBookings": ["Booking"],
    "getBooking": "Booking", "cancelBooking": "Booking", "listStaffBookings": "StaffDesk", "approveBooking": "Booking",
    "rejectBooking": "Booking", "checkoutBooking": "Booking", "returnBooking": "Booking", "listInventory": ["Asset"],
    "addAsset": "Asset", "editAsset": "Asset", "setAssetState": "Asset",
}
REQUEST_SCHEMA = {
    "register": "Credentials", "login": "Credentials", "requestBooking": "BookingRequest", "cancelBooking": "BookingPrecondition",
    "approveBooking": "BookingPrecondition", "rejectBooking": "BookingTransitionInput", "checkoutBooking": "BookingTransitionInput",
    "returnBooking": "BookingTransitionInput", "addAsset": "AssetInput", "editAsset": "AssetInput", "setAssetState": "AssetStateInput",
}


def response_wiring(response: Any) -> str:
    """``components.responses`` name for a shared response, else ``inline:`` plus the reusable examples it points at."""
    if isinstance(response, dict) and "$ref" in response:
        return str(schema_name(response))
    examples = response.get("content", {}).get("application/json", {}).get("examples", {})
    return "inline:" + ",".join(sorted(name for name in map(schema_name, examples.values()) if name))


def test_every_operation_wires_exactly_the_documented_schemas_and_shared_responses(spec: dict[str, Any]) -> None:
    methods = by_service_method(spec)
    assert set(ERROR_WIRING) == set(SUCCESS_STATUS) == set(SUCCESS_SCHEMA) == EXPECTED_METHODS
    for name, (path, method, op) in methods.items():
        responses = op["responses"]
        assert set(responses) == {SUCCESS_STATUS[name], "503", "default"} | set(ERROR_WIRING[name]), f"{name}: documented statuses"
        assert responses["503"] == {"$ref": "#/components/responses/ServiceUnavailable"}, name
        assert responses["default"] == {"$ref": "#/components/responses/UnexpectedError"}, name
        for status, expected in ERROR_WIRING[name].items():
            assert response_wiring(responses[status]) == expected, f"{name} {status}: wrong shared response"
        success = responses[SUCCESS_STATUS[name]]
        expected_schema = SUCCESS_SCHEMA[name]
        if expected_schema is None:
            assert "content" not in success, f"{name}: {SUCCESS_STATUS[name]} has no body"
        else:
            body = success["content"]["application/json"]["schema"]
            if isinstance(expected_schema, list):
                assert body["type"] == "array" and schema_name(body["items"]) == expected_schema[0], name
            else:
                assert schema_name(body) == expected_schema, f"{name}: success schema"
        if name in REQUEST_SCHEMA:
            assert op["requestBody"]["required"] is True
            assert schema_name(op["requestBody"]["content"]["application/json"]["schema"]) == REQUEST_SCHEMA[name], name
        else:
            assert "requestBody" not in op, f"{name}: takes no body"
        # Path templates and declared path parameters agree, and each is a required shared id parameter.
        templated = set(re.findall(r"\{(\w+)\}", path))
        declared = {resolve(spec, p)["name"]: p for p in op.get("parameters", []) if resolve(spec, p)["in"] == "path"}
        assert set(declared) == templated, f"{name}: path parameters"
        for param_name, param in declared.items():
            assert schema_name(param) == {"assetId": "AssetId", "bookingId": "BookingId"}[param_name]
            assert resolve(spec, param)["required"] is True
            assert schema_name(resolve(spec, param)["schema"]) == "Id"


def test_list_assets_query_parameters_match_asset_filters(spec: dict[str, Any], ts: str) -> None:
    _, _, op = by_service_method(spec)["listAssets"]
    params = {resolve(spec, p)["name"]: resolve(spec, p) for p in op["parameters"]}
    filters = ts_members(ts_interfaces(ts), "AssetFilters")
    assert set(params) == set(filters) == {"search", "category", "startDate", "endDate"}
    assert all(optional for optional, _ in filters.values()), "every AssetFilters member is optional"
    for name, param in params.items():
        assert param["in"] == "query", name
        assert param.get("required", False) is False, f"{name} must stay optional"
    assert params["search"]["schema"]["type"] == "string"
    assert schema_name(params["category"]["schema"]) == "Category"
    assert schema_name(params["startDate"]["schema"]) == schema_name(params["endDate"]["schema"]) == "CalendarDate"
    assert "requestBody" not in op
    assert "together" in params["startDate"]["description"] and "together" in params["endDate"]["description"]


def test_decided_ambiguities_are_written_into_the_contract(spec: dict[str, Any]) -> None:
    """Decisions taken for the backend stories (#7-#10) must stay in the contract text, not only in a review."""
    def flat(text: str) -> str:  # YAML block scalars keep their line breaks; compare the wording, not the wrapping
        return " ".join(text.split())

    info = flat(spec["info"]["description"])
    responses, schemas, params = spec["components"]["responses"], spec["components"]["schemas"], spec["components"]["parameters"]
    # Evaluation order, in this exact sequence, with the declarative-note warning.
    sequence = ["401 unauthenticated", "403 wrong role", "404 unknown or not-visible", "422 `expectedVersion`", "409 stale `expectedVersion`",
                "409 transition not allowed", "422 invalid `note`", "409 time/custody rule"]
    positions = [info.index(phrase) for phrase in sequence]
    assert positions == sorted(positions), "evaluation order changed in info.description"
    assert "must not run before the 409 checks" in info and "validated by hand after the state check" in info
    assert "authentication and authorization always come first" in info.lower()
    # Error envelope for framework-generated failures.
    assert '`{"detail": ...}`' in info and "exception handlers" in info
    unexpected = responses["UnexpectedError"]
    assert schema_name(unexpected["content"]["application/json"]["schema"]) == "Error" and "Allow" in unexpected["headers"]
    for phrase in ("exception handlers", "405", "500", "422", "404", "without `fields`", "rolled-back"):
        assert phrase in flat(unexpected["description"]), phrase
    # Ids: unknown path ids are 404, a malformed body assetId is 422 fields.assetId.
    for name in ("AssetId", "BookingId"):
        assert "404" in params[name]["description"] and "never 422" in params[name]["description"]
    assert "assetId" in schemas["FieldErrors"]["properties"]
    asset_id = schemas["BookingRequest"]["properties"]["assetId"]
    assert schema_name(asset_id) == "Id" and "422 `fields.assetId`" in asset_id["description"] and "404" in asset_id["description"]
    assert "fields.assetId" in responses["BookingRequestInvalid"]["description"]
    assert "422 `fields.assetId`" in flat(responses["AssetNotFound"]["description"])
    # Trimming and strict integers.
    assert "valid exactly as written" in info and "never trimmed" in info and "ECMAScript" in info
    version = flat(schemas["BookingPrecondition"]["properties"]["expectedVersion"]["description"])
    assert "strict JSON integer" in version and "`true`" in version and '`"2"`' in version and "`2.0`" in version
    assert "strict" in responses["VersionInvalid"]["description"]
    mapping = flat(schemas["ErrorCode"]["description"])
    assert "405" in mapping and "500" in mapping and "unsupported method" in mapping and "unhandled exception" in mapping
    # What each shared response promises, in words (the wiring test fixes which operation uses which).
    promises = {
        "TransitionConflict": ("stale", "`fields.expectedVersion`", "unchanged"),
        "Forbidden": ("coordinator", "before any resource lookup"),
        "Unauthenticated": ("token", "`UNAUTHENTICATED`"),
        "ValidationFailed": ("`fields`", "without `fields`"),
        "DuplicateInventoryCode": ("`fields.inventoryCode`", "case-insensitive"),
        "ServiceUnavailable": ("`SERVICE_UNAVAILABLE`", "retry"),
        "VersionInvalid": ("`fields.expectedVersion`", "Nothing changed"),
        "NoteOrVersionInvalid": ("`fields.note`", "checked first"),
    }
    for name, phrases in promises.items():
        for phrase in phrases:
            assert phrase in flat(responses[name]["description"]), f"{name}: {phrase}"
    note = schemas["BookingTransitionInput"]
    assert "must not be enforced declaratively" in flat(note["description"]) and "by hand" in flat(note["description"])
    assert "409" in note["properties"]["note"]["description"]


def test_api_notes_agree_with_the_contract_on_field_keys_and_evaluation_order(spec: dict[str, Any]) -> None:
    doc = (ROOT / "_docs" / "api.md").read_text(encoding="utf-8")
    line = next(line for line in doc.splitlines() if line.startswith("* `fields` keys are"))
    listed = set(re.findall(r"`(\w+)`", line.split(":", 1)[1].split("(")[0]))
    assert listed == set(spec["components"]["schemas"]["FieldErrors"]["properties"]), "api.md lists the FieldErrors keys"
    section = doc.split("### Evaluation order", 1)[1].split("\n## ", 1)[0]
    rows = re.findall(r"^\| (\d+b?) \| (.+?) \|$", section, flags=re.M)
    assert [label for label, _ in rows] == ["1", "2", "2b", "3", "4", "5", "6", "7", "8"]
    expected = ["401 no valid session", "403 wrong role", "422 request envelope", "404 unknown booking", "422 `expectedVersion`",
                "409 `expectedVersion` differs", "409 the current state", "422 `note` invalid", "409 time or custody rule"]
    for (label, text), prefix in zip(rows, expected):
        assert text.startswith(prefix), f"api.md evaluation order row {label}"
    assert "must not pre-empt steps 5 and 6" in section and "validated by hand at step 7" in section


def test_booking_mutations_require_expected_version_and_document_the_precedence(spec: dict[str, Any]) -> None:
    methods = by_service_method(spec)
    for name in MUTATIONS:
        _, _, op = methods[name]
        body = resolve(spec, op["requestBody"]["content"]["application/json"]["schema"])
        assert op["requestBody"]["required"] is True
        assert "expectedVersion" in body["required"], name
        version = resolve(spec, body["properties"]["expectedVersion"])
        assert (version["type"], version["minimum"], version["maximum"]) == ("integer", 1, 2147483647)
        text = op["description"]
        assert "expectedVersion" in text and "409" in text and "422" in text and "version" in text.lower()
    assert "note" in resolve(spec, methods["rejectBooking"][2]["requestBody"]["content"]["application/json"]["schema"])["required"]
    assert "evaluation order" in spec["info"]["description"].lower()
    for name in ("requestBooking", "setAssetState", "addAsset", "checkoutBooking"):
        assert "atomic" in methods[name][2]["description"].lower(), name


# =========================================================================== (e) secrets and session exposure


def collect_property_names(spec: dict[str, Any], schema: Any, seen: set[str] | None = None) -> set[str]:
    """Property names reachable from a schema. ``FieldErrors`` (validation messages keyed by request field) is skipped."""
    seen = set() if seen is None else seen
    name = schema_name(schema)
    if name:
        if name in seen or name == "FieldErrors":
            return set()
        seen.add(name)
    schema = resolve(spec, schema)
    names = set(schema.get("properties", {}))
    for child in schema.get("properties", {}).values():
        names |= collect_property_names(spec, child, seen)
    for key in ("items", "additionalProperties"):
        if isinstance(schema.get(key), dict):
            names |= collect_property_names(spec, schema[key], seen)
    for key in ("oneOf", "anyOf", "allOf"):
        for branch in schema.get(key, []):
            names |= collect_property_names(spec, branch, seen)
    return names


def test_no_schema_exposes_password_hash_or_token_hash_material(spec: dict[str, Any]) -> None:
    secret = re.compile(r"password|passwd|hash|salt|secret|tokenhash", re.I)
    all_names = {prop for name, schema in spec["components"]["schemas"].items() if name != "FieldErrors" for prop in collect_property_names(spec, schema)}
    assert not {n for n in all_names if secret.search(n) and n != "password"}, "hash/salt/secret-like property in the contract"
    for forbidden in ("passwordHash", "password_hash", "tokenHash", "token_hash", "hashedPassword"):
        assert forbidden not in all_names
    # The only schema carrying `password` is the write-only request body of login/register.
    holders = [n for n, s in spec["components"]["schemas"].items() if "password" in s.get("properties", {}) and n != "FieldErrors"]
    assert holders == ["Credentials"]  # FieldErrors.password is only a validation message, never a value
    assert spec["components"]["schemas"]["Credentials"]["properties"]["password"]["writeOnly"] is True
    for path, method, op in operations(spec):
        for status, response in op["responses"].items():
            content = resolve(spec, response).get("content", {})
            for media in content.values():
                names = collect_property_names(spec, media["schema"])
                assert not {n for n in names if secret.search(n)}, f"{method.upper()} {path} {status} exposes secret-like fields"
                assert "token" not in names or op["x-service-method"] in {"login", "register"}, f"{op['operationId']} leaks a token"


def test_session_dto_is_distinct_from_public_user_and_only_returned_by_login_and_register(spec: dict[str, Any]) -> None:
    schemas = spec["components"]["schemas"]
    assert set(schemas["Session"]["properties"]) == {"token", "expiresAt", "user"}
    assert schema_name(schemas["Session"]["properties"]["user"]) == "User"
    assert set(schemas["User"]["properties"]) == {"id", "username", "role"}
    assert set(schemas["Session"]["required"]) == {"token", "expiresAt", "user"}
    returned_by = sorted(
        op["x-service-method"]
        for _, _, op in operations(spec)
        if "x-service-method" in op
        for status, response in op["responses"].items()
        if schema_name(resolve(spec, response).get("content", {}).get("application/json", {}).get("schema")) == "Session"
    )
    assert returned_by == ["login", "register"]
    methods = by_service_method(spec)
    me = resolve(spec, methods["currentUser"][2]["responses"]["200"])["content"]["application/json"]["schema"]
    assert schema_name(me) == "User"
    assert spec["components"]["schemas"]["UtcTimestamp"]["pattern"].endswith("Z$")
    description = spec["components"]["securitySchemes"]["bearerAuth"]["description"]
    assert "24 hours" in description and "revoked" in description and "hash" in description and "sessionStorage" in description


# =========================================================================== frozen validation limits


def test_frozen_field_limits_patterns_and_date_semantics(spec: dict[str, Any]) -> None:
    s = spec["components"]["schemas"]
    username = s["Credentials"]["properties"]["username"]
    assert username["pattern"] == "^[A-Za-z0-9_]{3,30}$" and username["x-trimmed"] is True
    assert re.fullmatch(username["pattern"], "Valid_Name9") and not re.fullmatch(username["pattern"], "bad name")
    password = s["Credentials"]["properties"]["password"]
    assert (password["minLength"], password["maxLength"]) == (10, 128)
    assert (s["BookingRequest"]["properties"]["purpose"]["minLength"], s["BookingRequest"]["properties"]["purpose"]["maxLength"]) == (5, 500)
    assert s["BookingRequest"]["properties"]["purpose"]["x-trimmed"] is True
    note = s["BookingTransitionInput"]["properties"]["note"]
    assert (note["minLength"], note["maxLength"], note["x-trimmed"]) == (3, 500, True)
    asset = s["AssetInput"]["properties"]
    assert (asset["name"]["minLength"], asset["name"]["maxLength"]) == (2, 100)
    assert (asset["inventoryCode"]["minLength"], asset["inventoryCode"]["maxLength"]) == (2, 30)
    assert "uppercase" in asset["inventoryCode"]["x-normalization"] and "case-insensitively" in asset["inventoryCode"]["x-normalization"]
    assert (asset["location"]["minLength"], asset["location"]["maxLength"]) == (2, 100)
    assert asset["description"]["maxLength"] == 2000 and "minLength" not in asset["description"]
    assert set(asset) == {"name", "inventoryCode", "category", "location", "description"}
    assert s["Category"]["enum"] == ["Cameras", "Audio", "Presentation", "Accessories"]
    # Inclusive Asia/Almaty dates and UTC instants.
    assert s["CalendarDate"]["format"] == "date" and s["CalendarDate"]["pattern"] == r"^\d{4}-\d{2}-\d{2}$"
    assert s["AssetAvailability"]["properties"]["timeZone"]["const"] == "Asia/Almaty"
    assert s["StaffDesk"]["properties"]["timeZone"]["const"] == "Asia/Almaty"
    days = s["AssetAvailability"]["properties"]["days"]
    assert (days["minItems"], days["maxItems"]) == (91, 91)
    assert s["BookingEvent"]["properties"]["timestamp"]["$ref"].endswith("/UtcTimestamp")
    info = spec["info"]["description"]
    for phrase in ("Asia/Almaty", "T + 90", "1-14 days", "inclusive", "UTC"):
        assert phrase in info, phrase
    assert "`T <= startDate <= endDate <= T + 90 days`" in info
    # Anonymous availability exposes exactly date + state.
    assert set(s["AvailabilityDay"]["properties"]) == {"date", "state"} and set(s["AvailabilityDay"]["required"]) == {"date", "state"}
    assert set(s["AssetAvailability"]["properties"]) == {"assetId", "today", "horizonEnd", "timeZone", "days"}
    assert s["AvailabilityState"]["enum"] == ["available", "occupied", "maintenance"]


def test_shared_schemas_repeat_the_frozen_limits_and_formats(spec: dict[str, Any], samples: list[dict[str, Any]]) -> None:
    s = spec["components"]["schemas"]
    for schema in ("Asset", "AssetInput"):
        props = s[schema]["properties"]
        assert (props["inventoryCode"]["minLength"], props["inventoryCode"]["maxLength"]) == (2, 30), schema
        assert (props["name"]["minLength"], props["name"]["maxLength"]) == (2, 100), schema
        assert (props["location"]["minLength"], props["location"]["maxLength"]) == (2, 100), schema
        assert props["description"]["maxLength"] == 2000 and "minLength" not in props["description"], schema
    staff = s["StaffBooking"]["properties"]
    assert (staff["inventoryCode"]["minLength"], staff["inventoryCode"]["maxLength"]) == (2, 30)
    assert (staff["location"]["minLength"], staff["location"]["maxLength"]) == (2, 100)
    for schema in ("Booking", "StaffBooking"):
        props = s[schema]["properties"]
        assert (props["purpose"]["minLength"], props["purpose"]["maxLength"]) == (5, 500), schema
        assert props["events"]["minItems"] == 1 and schema_name(props["events"]["items"]) == "BookingEvent", schema
        assert (props["version"]["minimum"], props["version"]["maximum"]) == (1, 2147483647), schema
    event_note = s["BookingEvent"]["properties"]["note"]
    assert (event_note["minLength"], event_note["maxLength"]) == (3, 500)
    # Wire instants and dates: the session expiry is a UTC instant and the token is long and opaque.
    session = s["Session"]["properties"]
    assert schema_name(session["expiresAt"]) == "UtcTimestamp"
    assert session["token"]["type"] == "string" and session["token"]["minLength"] == 32
    instant = s["UtcTimestamp"]
    assert (instant["type"], instant["format"]) == ("string", "date-time") and instant["pattern"].endswith("Z$")
    assert re.fullmatch(instant["pattern"], "2026-10-19T06:00:00.000Z") and not re.fullmatch(instant["pattern"], "2026-10-19T06:00:00+05:00")
    assert re.fullmatch(instant["pattern"], "2026-10-19T06:00:00Z") and not re.fullmatch(instant["pattern"], "2026-10-19 06:00:00Z")
    assert (s["CalendarDate"]["type"], s["CalendarDate"]["format"]) == ("string", "date")
    # The `format` keywords really bite: the patterns alone accept impossible values, so only a live format checker rejects them.
    assert {"date", "date-time"} <= set(Draft202012Validator.FORMAT_CHECKER.checkers), "format checking needs rfc3339-validator"
    registry = Registry().with_resource(BASE, Resource.from_contents(spec, default_specification=DRAFT202012))
    assert schema_errors(registry, {"$ref": "#/components/schemas/UtcTimestamp"}, "2026-13-45T25:61:61Z")
    assert schema_errors(registry, {"$ref": "#/components/schemas/CalendarDate"}, "2026-02-30")
    assert not schema_errors(registry, {"$ref": "#/components/schemas/UtcTimestamp"}, "2026-10-19T06:00:00.000Z")
    # Desk counts are required integers with a precise meaning, and the mock's desks obey it.
    counts = s["StaffDesk"]["properties"]["counts"]
    assert set(counts["required"]) == set(counts["properties"]) == {"pending", "dueToday", "overdue"}
    for prop in counts["properties"].values():
        assert (prop["type"], prop["minimum"]) == ("integer", 0)
    described = {key: value["description"] for key, value in counts["properties"].items()}
    assert "regardless of their dates" in described["pending"] and "`pending`" in described["pending"]
    assert "`checked_out`" in described["dueToday"] and "equals today" in described["dueToday"]
    assert "`checked_out`" in described["overdue"] and "before today" in described["overdue"]
    desks = [sample for sample in samples if sample["method"] == "listStaffBookings" and sample["status"] == 200]
    assert desks
    for sample in desks:
        desk, today = sample["body"], sample["body"]["today"]
        rows = desk["bookings"]
        assert desk["counts"] == {
            "pending": sum(row["state"] == "pending" for row in rows),
            "dueToday": sum(row["state"] == "checked_out" and row["endDate"] == today for row in rows),
            "overdue": sum(row["state"] == "checked_out" and row["endDate"] < today for row in rows),
        }, "counts follow the documented definitions"
        assert all(row["overdue"] == (row["state"] == "checked_out" and row["endDate"] < today) for row in rows)
        assert desk["counts"]["overdue"] == sum(row["overdue"] for row in rows)


def sample_bookings(samples: list[dict[str, Any]]) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []
    for sample in samples:
        body = sample.get("body")
        if sample["method"] == "listStaffBookings" and sample["status"] == 200:
            found += body["bookings"]
        elif sample["status"] < 300 and isinstance(body, list) and body and "events" in body[0]:
            found += body
        elif sample["status"] < 300 and isinstance(body, dict) and "events" in body:
            found.append(body)
    return found


def test_event_shape_and_system_notes_are_pinned(spec: dict[str, Any], samples: list[dict[str, Any]]) -> None:
    event = spec["components"]["schemas"]["BookingEvent"]
    pinned = {entry["action"]: entry for entry in event["x-events"]}
    transitions = {t["action"]: t for t in spec["components"]["schemas"]["BookingState"]["x-transitions"]}
    assert set(pinned) == set(spec["components"]["schemas"]["BookingAction"]["enum"]) == {"create", *transitions}
    assert pinned["create"] == {"action": "create", "actor": "owner", "priorState": None, "newState": "pending", "note": "the trimmed purpose"}
    for action, transition in transitions.items():
        assert pinned[action]["newState"] == transition["to"] and pinned[action]["actor"] == transition["actor"], action
        if len(transition["from"]) == 1:
            assert pinned[action]["priorState"] == transition["from"][0], action
    assert pinned["approve"]["note"] == "Reservation approved."
    assert pinned["cancel"]["note"] == "Reservation cancelled; reserved dates released."
    description = event["properties"]["note"]["description"]
    assert "`Reservation approved.`" in description and "`Reservation cancelled; reserved dates released.`" in description
    doc = (ROOT / "_docs" / "api.md").read_text(encoding="utf-8")
    assert "exactly `Reservation approved.`" in doc and "exactly `Reservation cancelled; reserved dates released.`" in doc
    bookings = sample_bookings(samples)
    assert len(bookings) >= 30
    seen = set()
    for booking in bookings:
        events = booking["events"]
        assert len({e["id"] for e in events}) == len(events), "event ids are unique within a booking"
        for index, e in enumerate(events):
            rule = pinned[e["action"]]
            seen.add(e["action"])
            assert e["newState"] == rule["newState"], f"{booking['id']} {e['action']}"
            assert e["bookingId"] == booking["id"] and e["priorState"] == (None if index == 0 else events[index - 1]["newState"])
            if e["action"] == "create":
                assert index == 0 and e["actorId"] == booking["userId"] and e["note"] == booking["purpose"]
            elif e["action"] == "cancel":
                assert e["priorState"] in {"pending", "approved"} and e["note"] == rule["note"]
            elif e["action"] == "approve":
                assert e["actorId"] == "coordinator-demo" and e["note"] == rule["note"]
            else:
                assert e["priorState"] == rule["priorState"] and e["actorId"] == "coordinator-demo"
                assert e["note"] == e["note"].strip() and 3 <= len(e["note"]) <= 500
        assert events[-1]["newState"] == booking["state"]
    assert seen == set(pinned), "the samples exercise every event action"


def test_decided_ids_and_strict_integers_are_exercised_by_the_mock_samples(samples: list[dict[str, Any]]) -> None:
    def find(method: str, status: int, label: str) -> list[dict[str, Any]]:
        return [s for s in samples if s["method"] == method and s["status"] == status and label in s.get("label", "")]

    for label in ("missing assetId", "empty assetId", "over-long assetId", "non-string assetId"):
        (sample,) = find("requestBooking", 422, label)
        assert set(sample["body"]["fields"]) == {"assetId"} and sample.get("schemaInvalid"), label
    assert find("requestBooking", 404, "unknown asset")
    for method in ("getAsset", "getAssetAvailability", "getBooking"):
        (sample,) = find(method, 404, "over-long id")
        assert sample["body"]["code"] == "NOT_FOUND" and "fields" not in sample["body"]
    for label in ("missing", "boolean", "numeric string", "fractional", "null"):
        (sample,) = find("approveBooking", 422, f"{label} expectedVersion")
        assert set(sample["body"]["fields"]) == {"expectedVersion"} and sample.get("schemaInvalid"), label


def test_transition_table_matches_the_product_rules(spec: dict[str, Any]) -> None:
    table = spec["components"]["schemas"]["BookingState"]["x-transitions"]
    assert {t["action"]: (tuple(t["from"]), t["to"], t["actor"]) for t in table} == {
        "approve": (("pending",), "approved", "coordinator"),
        "reject": (("pending",), "rejected", "coordinator"),
        "cancel": (("pending", "approved"), "cancelled", "owner-or-coordinator"),
        "checkout": (("approved",), "checked_out", "coordinator"),
        "return": (("checked_out",), "returned", "coordinator"),
    }
    sources = {state for transition in table for state in transition["from"]}
    assert not sources & {"rejected", "cancelled", "returned"}, "terminal states have no outgoing transitions"
    assert {t["to"] for t in table} | {"pending"} == set(spec["components"]["schemas"]["BookingState"]["enum"])
    needs_note = {t["action"] for t in table if t["note"].startswith("required")}
    assert needs_note == {"reject", "checkout", "return"}


def test_booking_snapshots_carry_a_required_positive_integer_version(spec: dict[str, Any]) -> None:
    s = spec["components"]["schemas"]
    for name in ("Booking", "StaffBooking"):
        assert "version" in s[name]["required"]
        version = s[name]["properties"]["version"]
        assert (version["type"], version["minimum"]) == ("integer", 1)
    # Public data stays free of any version or private metadata.
    for name in ("Asset", "AssetAvailability", "AvailabilityDay", "CatalogueResult"):
        assert "version" not in collect_property_names(spec, s[name])
        assert not {"userId", "borrower", "purpose", "events"} & collect_property_names(spec, s[name])
    assert s["Booking"]["description"].count("exactly 1") >= 1


# =========================================================================== frontend types agree with the contract


def literal_set(ts: str, type_text: str) -> set[str] | None:
    type_text = type_text.strip()
    if re.fullmatch(r"('[^']+'\s*\|\s*)*'[^']+'", type_text):
        return set(re.findall(r"'([^']+)'", type_text))
    if type_text == "typeof CATEGORIES[number]":
        return ts_categories(ts)
    alias = re.search(rf"export type {type_text}\s*=\s*([^\n]+)", ts) if re.fullmatch(r"[A-Z]\w+", type_text) else None
    if alias:
        return literal_set(ts, alias.group(1))
    return None


def check_member(spec: dict[str, Any], ts: str, interfaces: dict[str, Any], where: str, ts_type: str, schema: Any) -> None:
    nullable = bool(re.search(r"\|\s*null\s*$", ts_type))
    assert admits_null(spec, schema) == nullable, f"{where}: nullability differs (TS: {ts_type})"
    base = re.sub(r"\s*\|\s*null\s*$", "", ts_type).strip()
    target = non_null(spec, schema)
    literals = literal_set(ts, base)
    if literals is not None:
        if len(literals) == 1 and "const" in target:
            assert target["const"] in literals, where
        else:
            assert set(target["enum"]) == literals, f"{where}: enum differs"
    elif base.endswith("[]"):
        assert target["type"] == "array", where
    elif base in interfaces:
        assert target["type"] == "object", where
        assert_interface_matches(spec, ts, interfaces, base, target, where)
    elif base.startswith("{"):
        assert target["type"] == "object", where
    elif base == "string":
        assert target["type"] == "string", where
    elif base == "number":
        assert target["type"] in {"integer", "number"}, where
    elif base == "boolean":
        assert target["type"] == "boolean", where
    else:
        raise AssertionError(f"{where}: unhandled TS type {ts_type!r}")


def assert_interface_matches(spec: dict[str, Any], ts: str, interfaces: dict[str, Any], ts_name: str, schema: Any, where: str) -> None:
    schema = resolve(spec, schema)
    members = ts_members(interfaces, ts_name)
    assert set(schema["properties"]) == set(members), f"{where}: property names differ: {set(schema['properties']) ^ set(members)}"
    assert set(schema.get("required", [])) == {k for k, (optional, _) in members.items() if not optional}, f"{where}: required set differs"
    for key, (_, ts_type) in members.items():
        check_member(spec, ts, interfaces, f"{where}.{key}", ts_type, schema["properties"][key])


def test_dto_interfaces_match_openapi_schemas_field_for_field(spec: dict[str, Any], ts: str) -> None:
    interfaces = ts_interfaces(ts)
    pairs = [
        "User", "Credentials", "Asset", "DateRange", "CatalogueResult", "AssetAvailability", "BookingEvent", "Booking",
        "BookingRequest", "BookingPrecondition", "BookingTransitionInput", "StaffBooking", "StaffDesk", "Session",
    ]
    for name in pairs:
        assert_interface_matches(spec, ts, interfaces, name, {"$ref": f"#/components/schemas/{name}"}, name)
    # Inline structures nested in the TS interfaces.
    day = re.search(r"days:\s*\{\s*date:\s*string;\s*state:\s*([^}]+?)\s*\}\[\]", ts)
    assert day and set(re.findall(r"'([^']+)'", day.group(1))) == set(spec["components"]["schemas"]["AvailabilityState"]["enum"])
    counts = re.search(r"counts:\s*\{([^}]+)\}", ts)
    assert counts and set(re.findall(r"(\w+):\s*number", counts.group(1))) == set(spec["components"]["schemas"]["StaffDesk"]["properties"]["counts"]["properties"])
    # AssetInput is Pick<Asset, ...>.
    pick = re.search(r"export type AssetInput = Pick<Asset,\s*([^>]+)>", ts)
    assert pick and set(re.findall(r"'([^']+)'", pick.group(1))) == set(spec["components"]["schemas"]["AssetInput"]["properties"])
    assert set(spec["components"]["schemas"]["AssetInput"]["required"]) == set(re.findall(r"'([^']+)'", pick.group(1)))
    # BookingNote is the `note` half of BookingTransitionInput; BookingPrecondition is the `expectedVersion` half.
    assert set(ts_members(interfaces, "BookingNote")) == {"note"}
    assert set(ts_members(interfaces, "BookingTransitionInput")) == {"note", "expectedVersion"}


def test_enumerations_and_error_codes_match_the_frontend_types(spec: dict[str, Any], ts: str) -> None:
    s = spec["components"]["schemas"]
    assert set(s["Role"]["enum"]) == ts_union(ts, "Role")
    assert set(s["Category"]["enum"]) == ts_categories(ts)
    assert set(s["BookingState"]["enum"]) == ts_union(ts, "BookingState")
    assert set(s["BookingAction"]["enum"]) == ts_union(ts, "BookingAction")
    assert set(s["ErrorCode"]["enum"]) == ts_union(ts, "ServiceErrorCode")
    assert set(STATUS_BY_CODE) == ts_union(ts, "ServiceErrorCode")
    interfaces = ts_interfaces(ts)
    asset_state = re.search(r"state:\s*((?:'[^']+'\s*\|\s*)*'[^']+')", interfaces["Asset"]["raw"])
    assert asset_state and set(re.findall(r"'([^']+)'", asset_state.group(1))) == set(s["AssetState"]["enum"])


def test_error_schema_matches_service_error(spec: dict[str, Any], ts: str) -> None:
    interfaces = ts_interfaces(ts)
    members = ts_members(interfaces, "ServiceError")
    error = spec["components"]["schemas"]["Error"]
    # `status` is the HTTP status line, copied into ServiceError by the adapter; it is not part of the JSON body.
    assert members.keys() - {"status"} == set(error["properties"])
    assert members["status"][0] is True
    assert set(error["required"]) == {"code", "message"}
    assert error["properties"]["unavailableDates"]["items"]["$ref"].endswith("/CalendarDate")
    # Field-error keys are exactly the `fields` keys the service can set.
    fields_type = members["fields"][1]
    keys = set(re.findall(r"'([^']+)'", fields_type))
    if "keyof Credentials" in fields_type:
        keys |= set(ts_members(interfaces, "Credentials"))
    declared = spec["components"]["schemas"]["FieldErrors"]
    assert set(declared["properties"]) == keys
    assert declared["additionalProperties"] is False
    assert {"expectedVersion", "assetId"} <= keys


def test_service_signatures_carry_the_version_precondition(ts: str) -> None:
    for name in MUTATIONS:
        match = re.search(rf"{name}\(id: string, input: (\w+)\)", ts)
        assert match, f"{name} must take the precondition input"
        assert match.group(1) in {"BookingPrecondition", "BookingTransitionInput"}
    assert re.search(r"export interface Booking extends DateRange \{[^}]*\bversion: number;", ts)


# =========================================================================== documented examples and mock payloads


def media_examples(spec: dict[str, Any]) -> list[dict[str, Any]]:
    """Every media-type example of every request/response (``$ref`` examples resolved), with where it is used."""
    found = []
    for path, method, op in operations(spec):
        containers = []
        if "requestBody" in op:
            containers.append(("request", op["requestBody"]))
        for status, response in op["responses"].items():
            containers.append((status, resolve(spec, response)))
        for label, container in containers:
            for media in container.get("content", {}).values():
                for example_name, example in media.get("examples", {}).items():
                    found.append({
                        "where": f"{method.upper()} {path} {label} {example_name}", "kind": label, "schema": media["schema"],
                        "value": resolve(spec, example)["value"], "ref": schema_name(example),
                    })
    return found


def test_every_documented_example_validates_against_its_schema(spec: dict[str, Any], registry: Registry) -> None:
    examples = media_examples(spec)
    assert len(examples) >= 40
    for example in examples:
        # Examples are literal wire values: valid exactly as written, with no implicit `x-trimmed` normalisation.
        errors = schema_errors(registry, example["schema"], example["value"])
        assert not errors, f"{example['where']}: {errors}"
        assert_exact(spec, example["value"], example["schema"], example["where"])
    # No orphaned reusable example: each one is used by some operation.
    used = {e["ref"] for e in examples if e["ref"]}
    assert used == set(spec["components"]["examples"]), set(spec["components"]["examples"]) ^ used


def test_error_examples_use_the_documented_status_code_mapping(spec: dict[str, Any]) -> None:
    for path, method, op in operations(spec):
        for status, response in op["responses"].items():
            response = resolve(spec, response)
            for media in response.get("content", {}).values():
                for name, example in media.get("examples", {}).items():
                    value = resolve(spec, example)["value"]
                    if isinstance(value, dict) and "code" in value:
                        if status == "default":  # not one status: each example names the status it stands for
                            status_of_example = DEFAULT_EXAMPLE_STATUS[name]
                            assert status_of_example in STATUS_BY_CODE[value["code"]], f"{method.upper()} {path} default example {name} uses {value['code']}"
                            continue
                        assert status in STATUS_BY_CODE[value["code"]], f"{method.upper()} {path} {status} example {name} uses {value['code']}"


def test_mock_service_samples_conform_to_the_contract(spec: dict[str, Any], registry: Registry, samples: list[dict[str, Any]]) -> None:
    methods = by_service_method(spec)
    assert len(samples) >= 60
    covered_success = set()
    for sample in samples:
        name, status = sample["method"], str(sample["status"])
        where = f"{name} {status} [{sample.get('label', '')}]"
        path, http_method, op = methods[name]
        assert status in op["responses"], f"{where}: status is not documented for {http_method.upper()} {path}"
        request = sample.get("request", {})
        if status == "422" and sample.get("schemaInvalid"):
            # Inputs the mock rejects on field shape/limits must also violate the documented request schema.
            schema = op["requestBody"]["content"]["application/json"]["schema"]
            assert schema_errors(registry, schema, trimmed(spec, schema, request["body"])), f"{where}: schema accepts what the mock rejects"
        if status != "422":
            # Valid inputs must be accepted by the documented request schema (outer whitespace is trimmed first).
            if "body" in request:
                schema = op["requestBody"]["content"]["application/json"]["schema"]
                assert not schema_errors(registry, schema, trimmed(spec, schema, request["body"])), f"{where}: request body"
            for param in op.get("parameters", []):
                param = resolve(spec, param)
                if param["in"] == "query" and param["name"] in request.get("query", {}):
                    assert not schema_errors(registry, param["schema"], request["query"][param["name"]]), f"{where}: query {param['name']}"
        response = resolve(spec, op["responses"][status])
        if status == "204":
            assert "content" not in response and "body" not in sample
            covered_success.add(name)
            continue
        schema = response["content"]["application/json"]["schema"]
        if sample.get("mapsTo") == "Session.user":
            schema = spec["components"]["schemas"]["Session"]["properties"]["user"]
        errors = schema_errors(registry, schema, sample["body"])
        assert not errors, f"{where}: {errors}"
        assert_exact(spec, sample["body"], schema, where)
        if status[0] == "2":
            covered_success.add(name)
        else:
            assert status in STATUS_BY_CODE[sample["body"]["code"]], f"{where}: code {sample['body']['code']} on status {status}"
            assert "status" not in sample["body"], "the HTTP status is not repeated in the error body"
    assert covered_success == EXPECTED_METHODS, f"no successful sample for {sorted(EXPECTED_METHODS - covered_success)}"


def test_mock_samples_demonstrate_version_rules_error_shapes_and_privacy(samples: list[dict[str, Any]]) -> None:
    def find(method: str, status: int, label: str = "") -> list[dict[str, Any]]:
        return [s for s in samples if s["method"] == method and s["status"] == status and label in s.get("label", "")]

    for sample in samples:
        body = sample.get("body")
        candidates = body if isinstance(body, list) else [body]
        if sample["method"] == "listStaffBookings" and sample["status"] == 200:
            candidates = body["bookings"]
        for booking in candidates:
            if isinstance(booking, dict) and {"version", "events"} <= set(booking):
                assert booking["version"] == len(booking["events"]), f"{sample['method']}: version tracks the event chain"
                assert booking["events"][0]["priorState"] is None and booking["events"][0]["action"] == "create"
                assert all(e["priorState"] is not None for e in booking["events"][1:])
    assert find("approveBooking", 422)[0]["body"]["fields"].keys() == {"expectedVersion"}
    assert find("cancelBooking", 422)[0]["body"]["fields"].keys() == {"expectedVersion"}
    stale = find("cancelBooking", 409, "stale")[0]["body"]
    assert stale["code"] == "CONFLICT" and "expectedVersion" in stale["fields"]
    terminal = find("cancelBooking", 409, "terminal")[0]["body"]
    assert "fields" not in terminal
    taken = find("requestBooking", 409, "same unit")[0]["body"]
    assert taken["unavailableDates"] and set(taken) == {"code", "message", "unavailableDates"}
    assert find("requestBooking", 409, "maintenance")[0]["body"]["unavailableDates"] == []
    # Foreign private records look exactly like missing ones.
    foreign = find("getBooking", 404, "foreign")[0]["body"]
    assert foreign == find("cancelBooking", 404, "foreign")[0]["body"]
    anonymous = find("getAssetAvailability", 200)[0]["body"]
    assert set(anonymous) == {"assetId", "today", "horizonEnd", "timeZone", "days"} and len(anonymous["days"]) == 91
    assert all(set(day) == {"date", "state"} for day in anonymous["days"])
    registered = find("register", 201)[0]
    assert registered["body"]["role"] == "student" and registered["body"]["username"] == "new_member9"
    def keys(value: Any) -> set[str]:
        if isinstance(value, dict):  # `fields` maps request-field names to validation messages, not data
            return set(value) | {k for key, child in value.items() if key != "fields" for k in keys(child)}
        if isinstance(value, list):
            return {k for child in value for k in keys(child)}
        return set()

    for sample in samples:
        text = json.dumps(sample.get("body", {}))
        assert not {k for k in keys(sample.get("body")) if re.search(r"password|hash|salt|token", k, re.I)}, sample["method"]
        assert not any(secret in text for secret in ("StudentDemo42!", "CoordinatorDemo42!", "ExamplePass42!", "WrongPassword42!")), sample["method"]
