"""Engineer #30 transport probe; a check, never independent QA acceptance.

Run from backend: PYTHONPATH=. uv run --locked python scripts/check_exact_routes.py --output PATH
The Uvicorn socket, server and HTTP client belong to this one process.
"""

import argparse
import asyncio
import copy
import json
import socket
import subprocess
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import uvicorn
import yaml
from jsonschema import Draft202012Validator, FormatChecker

from app.auth import Argon2Passwords
from app.calendar import CLUB_ZONE
from app.domain import Asset, CANCEL_NOTE, User
from app.fixtures import add_fixture_booking
from app.main import create_app
from app.memory import MemoryRepository

ROOT = Path(__file__).resolve().parents[2]
SPEC = yaml.safe_load((ROOT / "openapi.yml").read_text())
NOW = datetime(2026, 10, 22, 20, 0, 0, 123456, tzinfo=UTC)
TODAY = NOW.astimezone(CLUB_ZONE).date()
BASE = "/api/v1/bookings"
STAFF = "/api/v1/staff"
GENERIC = {"code": "NOT_FOUND", "message": "The request could not be completed."}
PRIVATE = {"code": "NOT_FOUND", "message": "This reservation could not be found."}
UNAUTH = {"code": "UNAUTHENTICATED", "message": "Sign in to continue."}
ENVELOPE = {"code": "VALIDATION_ERROR", "message": "Send a JSON object with application/json."}
# Fixed PM oracle; never calculate expected methods from application routes.
TEMPLATES = [
    (BASE, {"GET", "POST"}), (BASE + "/missing", {"GET"}),
    (BASE + "/missing/cancel", {"POST"}), (STAFF + "/bookings", {"GET"}),
    *[(STAFF + f"/bookings/missing/{verb}", {"POST"}) for verb in ("approve", "reject", "checkout", "return")],
    (STAFF + "/assets", {"GET", "POST"}), (STAFF + "/assets/missing", {"PUT"}),
    (STAFF + "/assets/missing/state", {"PUT"}),
]


def validate(response, schema, status=200):
    assert response.status_code == status, (response.status_code, response.text)
    value = response.json()
    shape = {"type": "array", "items": {"$ref": "#/components/schemas/Asset"}} if schema == "Asset[]" else {"$ref": f"#/components/schemas/{schema}"}
    Draft202012Validator({**shape, "components": SPEC["components"]},
                        format_checker=FormatChecker()).validate(value)
    return value


def snapshot(store):
    with store._lock:
        return copy.deepcopy(store._state)


async def probe(mode, originals_only):
    store, passwords = MemoryRepository(), Argon2Passwords()
    with store.transaction() as tx:
        for identifier, state in (("unit-a", "active"), ("unit-b", "active"), ("future-unit", "active")):
            tx.add_asset(Asset(identifier, identifier.upper(), "Film Camera", "Cameras", "Fictional equipment", "Club desk", state))
        tx.add_user(User("trusted-coordinator", "coordinator", "coordinator", passwords.hash("CoordinatorPassword42!")))
    app = create_app(repository=store, clock=lambda: NOW, passwords=passwords, seed=False)
    server, task, sock = None, None, None
    try:
        if mode == "uvicorn":
            sock = socket.socket()
            sock.bind(("127.0.0.1", 0))
            server = uvicorn.Server(uvicorn.Config(app, log_level="error", access_log=False))
            task = asyncio.create_task(server.serve(sockets=[sock]))
            async with asyncio.timeout(10):
                while not server.started:
                    if task.done():
                        task.result()
                    await asyncio.sleep(.01)
            client = httpx.AsyncClient(base_url=f"http://127.0.0.1:{sock.getsockname()[1]}", trust_env=False)
        else:
            client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", trust_env=False)
        async with client:
            owner = validate(await client.post("/api/v1/auth/register", json={"username": "owner", "password": "StudentPassword42!"}), "Session", 201)
            other = validate(await client.post("/api/v1/auth/register", json={"username": "other", "password": "StudentPassword42!"}), "Session", 201)
            coordinator = validate(await client.post("/api/v1/auth/login", json={"username": "coordinator", "password": "CoordinatorPassword42!"}), "Session")
            auth = {None: {}, "invalid": {"Authorization": "Bearer unknown"},
                    "owner": {"Authorization": "Bearer " + owner["token"]},
                    "other": {"Authorization": "Bearer " + other["token"]},
                    "coordinator": {"Authorization": "Bearer " + coordinator["token"]}}
            with store.transaction() as tx:
                for identifier, asset, state, start, end in (
                    ("routing-owned", "unit-a", "pending", 0, 2),
                    ("routing-custody", "unit-b", "checked_out", -2, -1),
                    ("future-approved", "future-unit", "approved", 1, 2),
                ):
                    add_fixture_booking(tx, booking_id=identifier, asset=tx.asset_by_id(asset),
                                        owner=tx.user_by_id(owner["user"]["id"]), coordinator=tx.user_by_id(coordinator["user"]["id"]),
                                        start=TODAY + timedelta(days=start), end=TODAY + timedelta(days=end), state=state, now=NOW)
            records = []

            async def rejection(case, method, path, status, expected=None, allow=None, actor=None, raw=b"{", fields=None):
                before = snapshot(store)
                headers = {**auth[actor], **({"Content-Type": "application/json"} if raw is not None else {})}
                response = await client.request(method, path, headers=headers, content=raw)
                unchanged = snapshot(store) == before
                failures = []
                def check(condition, label):
                    if not condition:
                        failures.append(label)
                check(unchanged, "full store changed")
                check(response.status_code == status, "status")
                check(response.headers.get("content-type") == "application/json", "content type")
                check("location" not in response.headers, "Location")
                check(response.headers.get("www-authenticate") == ("Bearer" if status == 401 else None), "WWW-Authenticate")
                check(("allow" not in response.headers) if allow is None else set(response.headers.get("allow", "").split(", ")) == allow, "Allow")
                if method == "HEAD":
                    check(response.content == b"", "HEAD body")
                else:
                    try:
                        value = validate(response, "Error", status)
                        check(value["code"] == {401: "UNAUTHENTICATED", 403: "FORBIDDEN", 404: "NOT_FOUND", 405: "NOT_FOUND", 409: "CONFLICT", 422: "VALIDATION_ERROR"}[status], "Error code")
                        if expected is not None:
                            check(response.content == json.dumps(expected, separators=(",", ":")).encode(), "exact Error bytes")
                        if fields is not None:
                            check(set(value) == {"code", "message"} | ({"fields"} if fields else set()), "Error keys")
                            check(set(value.get("fields", {})) == fields, "field priority")
                    except (AssertionError, ValueError) as exc:
                        failures.append(type(exc).__name__)
                records.append({"case": case, "method": method, "path": path, "status": response.status_code,
                                "headers": dict(response.headers), "bytes_hex": response.content.hex(),
                                "state_unchanged": unchanged, "failures": failures})

            await rejection("C01", "GET", BASE + "/ordinary-missing/cancel", 405, GENERIC, {"POST"}, raw=None)
            await rejection("C02", "DELETE", STAFF + "/assets", 405, GENERIC, {"GET", "POST"}, raw=None)
            if not originals_only:
                for path, allow in TEMPLATES:
                    for method in ("DELETE", "HEAD"):
                        for actor in (None, "invalid", "owner", "coordinator"):
                            await rejection("C03", method, path, 405, GENERIC, allow, actor)
                for path, allow in TEMPLATES:
                    if "/missing" in path:
                        await rejection("C04", "OPTIONS", path.replace("/missing", "/routing-owned%0A"), 405, GENERIC, allow)
                for path in (
                    BASE + "/", BASE + "//cancel", BASE + "/routing-owned/cancel%0A", BASE + "/routing-owned/cancel/extra",
                    STAFF + "/bookings/", STAFF + "/bookings//approve", STAFF + "/bookings/routing-owned/approve%0A",
                    STAFF + "/bookings/routing-owned/reject/extra", STAFF + "/assets/", STAFF + "/assets//state",
                    STAFF + "/assets/unit-a/state%0A", "/api/v1/unrelated/route",
                ):
                    await rejection("C05", "POST", path, 404, GENERIC, actor="coordinator")
                await rejection("C06", "GET", BASE + "/missing%2Fcancel", 405, GENERIC, {"POST"})
                for actor in (None, "invalid"):
                    for path in (BASE + "/routing-owned%0A/cancel", STAFF + "/bookings/routing-owned%0A/approve"):
                        await rejection("C07", "POST", path, 401, UNAUTH, actor=actor)
                await rejection("C08", "POST", STAFF + "/bookings/missing/approve", 403,
                                {"code": "FORBIDDEN", "message": "Coordinator access is required for this action."}, actor="owner")
                await rejection("C09", "POST", STAFF + "/bookings/missing/approve", 422, ENVELOPE, actor="coordinator")
                for method, path in (("GET", BASE + "/routing-owned%0A"), ("POST", BASE + "/routing-owned%0A/cancel"), ("POST", BASE + "/unknown%0A/cancel")):
                    await rejection("C10", method, path, 404, PRIVATE, actor="owner", raw=b'{"expectedVersion":false}')
                for verb, identifier, raw, status, fields in (
                    ("approve", "routing-owned", b'{"expectedVersion":1.0}', 422, {"expectedVersion"}),
                    ("return", "routing-custody", b'{"expectedVersion":1,"note":null}', 409, {"expectedVersion"}),
                    ("reject", "routing-custody", b'{"expectedVersion":3,"note":null}', 409, set()),
                    ("checkout", "future-approved", b'{"expectedVersion":2,"note":null}', 422, {"note"}),
                    ("checkout", "future-approved", b'{"expectedVersion":2,"note":"Complete kit"}', 409, set()),
                ):
                    await rejection("C11", "POST", STAFF + f"/bookings/{identifier}/{verb}", status, actor="coordinator", raw=raw, fields=fields)

                async def get(path, schema, actor="coordinator"):
                    before = snapshot(store)
                    value = validate(await client.get(path, headers=auth[actor]), schema)
                    assert snapshot(store) == before
                    return value

                private = await get(BASE + "/routing-owned", "Booking", "owner")
                rows = (await get(STAFF + "/bookings", "StaffDesk"))["bookings"]
                loan = next(row for row in rows if row["id"] == "routing-custody")
                assert loan["borrower"] == owner["user"]["username"] and loan["currentlyOnLoan"]
                assert len(await get(STAFF + "/assets", "Asset[]")) == 3
                records.append({"case": "C12", "failures": []})
                before = snapshot(store)
                cancelled = validate(await client.post(BASE + "/routing-owned/cancel", headers=auth["owner"], json={"expectedVersion": 1}), "Booking")
                assert cancelled["version"] == len(cancelled["events"]) == 2
                assert cancelled["events"][:-1] == private["events"] and cancelled["events"][-1]["note"] == CANCEL_NOTE
                after = snapshot(store)
                assert not any(slot.booking_id == "routing-owned" for slot in after.slots.values())
                assert after.active_loans == before.active_loans and after.bookings["routing-custody"] == before.bookings["routing-custody"]
                records.append({"case": "C13", "failures": []})

                async def command(method, path, payload, schema="Booking", status=200, actor="coordinator"):
                    return validate(await client.request(method, path, headers=auth[actor], json=payload), schema, status)

                payload = {"assetId": "unit-a", "startDate": TODAY.isoformat(), "endDate": TODAY.isoformat(), "purpose": "Club film session"}
                booking = await command("POST", BASE, payload, status=201, actor="owner")
                edited = {"name": "Renamed unit", "inventoryCode": " edited-001 ", "category": "Cameras", "description": "Fictional unit", "location": "Updated desk"}
                await command("PUT", STAFF + "/assets/unit-a", edited, "Asset")
                current = next(row for row in (await get(STAFF + "/bookings", "StaffDesk"))["bookings"] if row["id"] == booking["id"])
                assert current["assetName"] == booking["assetName"] and current["inventoryCode"] == "EDITED-001" and current["location"] == "Updated desk"
                await rejection("C14-maintenance-pending", "PUT", STAFF + "/assets/unit-a/state", 409, actor="coordinator", raw=b'{"state":"maintenance"}', fields=set())
                existing_loan = snapshot(store).active_loans.copy()
                for verb, state in (("approve", "approved"), ("checkout", "checked_out"), ("return", "returned")):
                    prior = booking
                    booking = await command("POST", STAFF + f"/bookings/{booking['id']}/{verb}", {"expectedVersion": booking["version"], "note": "  Complete kit checked  "})
                    assert booking["state"] == state and booking["version"] == prior["version"] + 1 == len(booking["events"])
                    assert booking["events"][:-1] == prior["events"]
                    event = booking["events"][-1]
                    assert event["actorId"] == coordinator["user"]["id"] and event["timestamp"] == NOW.isoformat().replace("+00:00", "Z")
                    assert event["note"] == ("Reservation approved." if verb == "approve" else "Complete kit checked")
                after = snapshot(store)
                assert after.active_loans == existing_loan and not any(slot.asset_id == "unit-a" for slot in after.slots.values())
                records.append({"case": "C14-lifecycle-current-joins", "failures": []})

                await command("PUT", STAFF + "/assets/unit-a/state", {"state": "maintenance"}, "Asset")
                await rejection("C15-maintenance-refuses-request", "POST", BASE, 409, actor="owner", raw=json.dumps(payload).encode(), fields=None)
                assert (await get("/api/v1/assets/unit-a/availability", "AssetAvailability", None))["days"][0]["state"] == "maintenance"
                await command("PUT", STAFF + "/assets/unit-a/state", {"state": "active"}, "Asset")
                booking = await command("POST", BASE, payload, status=201, actor="owner")
                rejected = await command("POST", STAFF + f"/bookings/{booking['id']}/reject", {"expectedVersion": 1, "note": "  Not required today  "})
                assert rejected["state"] == "rejected" and rejected["version"] == len(rejected["events"]) == 2
                assert rejected["events"][-1]["note"] == "Not required today" and not any(slot.asset_id == "unit-a" for slot in snapshot(store).slots.values())
                records.append({"case": "C15-maintenance-reactivation-rejection", "failures": []})

                next_booking = await command("POST", BASE, {**payload, "assetId": "unit-b"}, status=201, actor="owner")
                next_booking = await command("POST", STAFF + f"/bookings/{next_booking['id']}/approve", {"expectedVersion": 1})
                await rejection("C16-overdue-blocks-checkout", "POST", STAFF + f"/bookings/{next_booking['id']}/checkout", 409,
                                actor="coordinator", raw=b'{"expectedVersion":2,"note":"Complete kit"}', fields=set())
                returned = await command("POST", STAFF + "/bookings/routing-custody/return", {"expectedVersion": 3, "note": "Returned after due date"})
                assert returned["version"] == len(returned["events"]) == 4 and returned["state"] == "returned"
                next_booking = await command("POST", STAFF + f"/bookings/{next_booking['id']}/checkout", {"expectedVersion": 2, "note": "Complete kit"})
                assert snapshot(store).active_loans["unit-b"].booking_id == next_booking["id"]
                records.append({"case": "C16-overdue-return-next-checkout", "failures": []})

            return {"mode": mode, "passed": sum(not r["failures"] for r in records),
                    "failed": sum(bool(r["failures"]) for r in records), "records": records}
    finally:
        if server is not None:
            server.should_exit = True
            if task is not None:
                await asyncio.wait_for(task, 10)
        if sock is not None:
            sock.close()


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--originals-only", action="store_true")
    args = parser.parse_args()
    head = subprocess.check_output(["git", "-C", str(ROOT), "rev-parse", "HEAD"], text=True).strip()
    tree = subprocess.check_output(["git", "-C", str(ROOT), "rev-parse", "HEAD^{tree}"], text=True).strip()
    dirty = subprocess.check_output(["git", "-C", str(ROOT), "status", "--porcelain"], text=True).splitlines()
    results = [await probe(mode, args.originals_only) for mode in ("asgi", "uvicorn")]
    assert subprocess.check_output(["git", "-C", str(ROOT), "rev-parse", "HEAD"], text=True).strip() == head
    args.output.write_text(json.dumps({"role": "engineer", "head": head, "head_tree": tree, "dirty_paths": dirty,
                                     "clock": NOW.isoformat(), "results": results}, indent=2) + "\n")
    for result in results:
        print(f"{result['mode']}: {result['passed']} PASS / {result['failed']} FAIL; rejected stores unchanged: "
              f"{all(r.get('state_unchanged', True) for r in result['records'])}")
    raise SystemExit(int(any(result["failed"] for result in results)))


if __name__ == "__main__":
    asyncio.run(main())
