"""#11 targeted actual-Uvicorn FILE-SQLite smoke, not #12 restart evidence.

Server, socket and clients share one owner process. Database is temporary.
Run from backend: PYTHONPATH=. uv run --locked python scripts/check_sql_store.py --output PATH
"""

import argparse
import asyncio
import json
import os
import socket
import subprocess
import tempfile
from datetime import UTC, datetime
from pathlib import Path

import httpx
import uvicorn
from alembic import command
from alembic.config import Config
from sqlalchemy import select

from app.auth import Argon2Passwords
from app.database import DatabaseSettings
from app.domain import User
from app.main import create_app
from app.models import Base
from app.sqlalchemy_store import SQLAlchemyRepository

ROOT = Path(__file__).resolve().parents[2]
NOW = datetime(2026, 10, 23, 20, 0, 0, 123456, UTC)
BASE = "/api/v1/bookings"
STAFF = "/api/v1/staff"


def snapshot(store):
    with store.engine.connect() as connection:
        return {table.name: [tuple(row) for row in connection.execute(select(table).order_by(*table.primary_key))]
                for table in Base.metadata.sorted_tables}


async def probe(url):
    config = Config(str(ROOT / "backend/alembic.ini"))
    config.set_main_option("sqlalchemy.url", url)
    command.upgrade(config, "head")
    setup = SQLAlchemyRepository(DatabaseSettings(url))
    passwords = Argon2Passwords()
    with setup.transaction() as transaction:
        transaction.add_user(User("trusted-staff", "coordinator", "coordinator", passwords.hash("CoordinatorPassword42!")))
    setup.close()
    os.environ["GEARSHARE_STORE"] = "sqlalchemy"
    os.environ["GEARSHARE_DATABASE_URL"] = url
    app = create_app(clock=lambda: NOW)
    store = app.state.auth.repository
    assert isinstance(store, SQLAlchemyRepository)
    checks = []
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    server = uvicorn.Server(uvicorn.Config(app, log_level="error", access_log=False))
    task = asyncio.create_task(server.serve(sockets=[sock]))
    try:
        async with asyncio.timeout(10):
            while not server.started:
                if task.done():
                    task.result()
                await asyncio.sleep(.01)
        async with httpx.AsyncClient(base_url=f"http://127.0.0.1:{sock.getsockname()[1]}", trust_env=False) as client:
            async def call(method, path, status=200, token=None, **kwargs):
                response = await client.request(method, path, headers={"Authorization": f"Bearer {token}"} if token else {}, **kwargs)
                assert response.status_code == status, (method, path, response.status_code, response.text)
                return response
            assert (await call("GET", "/health")).json() == {"status": "ok"}
            checks.append("health/configured-ORM")
            async def account(name):
                return (await call("POST", "/api/v1/auth/register", 201, json={"username": name, "password": "StudentPassword42!"})).json()
            owner, other = await account("real_owner"), await account("other_student")
            coordinator = (await call("POST", "/api/v1/auth/login", json={"username": "coordinator", "password": "CoordinatorPassword42!"})).json()
            assert owner["user"]["role"] == "student"
            checks.append("real-Argon2/register/login")
            before = snapshot(store)
            duplicate = await call("POST", "/api/v1/auth/register", 409, json={"username": " REAL_OWNER ", "password": "AnotherPassword42!"})
            assert duplicate.json()["code"] == "USERNAME_TAKEN" and snapshot(store) == before
            checks.append("normalized-username-conflict/rollback")
            catalogue = (await call("GET", "/api/v1/assets")).json()
            assert len(catalogue["items"]) == 10
            availability = (await call("GET", "/api/v1/assets/accessory-01/availability")).json()
            assert len(availability["days"]) == 91 and all(set(day) == {"date", "state"} for day in availability["days"])
            checks.append("seeded-public-catalogue/anonymous-privacy")
            payload = {"assetId": "accessory-01", "startDate": "2026-10-24", "endDate": "2026-10-24", "purpose": "Student club filming"}
            booking = (await call("POST", BASE, 201, token=owner["token"], json=payload)).json()
            assert booking["version"] == len(booking["events"]) == 1
            checks.append("booking/event/inclusive-slot-atomic-create")
            before = snapshot(store)
            conflict = await call("POST", BASE, 409, token=other["token"], json=payload)
            assert conflict.json()["unavailableDates"] == ["2026-10-24"] and snapshot(store) == before
            checks.append("overlap-conflict/no-partial-writes")
            private = await call("GET", BASE + "/" + booking["id"], 404, token=other["token"])
            missing = await call("GET", BASE + "/missing", 404, token=other["token"])
            assert private.content == missing.content and snapshot(store) == before
            await call("GET", STAFF + "/bookings", 403, token=owner["token"])
            assert snapshot(store) == before
            checks.append("private404/staff403/no-mutation")
            for path, methods in ((BASE + "/missing/cancel", {"POST"}), (STAFF + "/assets", {"GET", "POST"})):
                response = await call("DELETE", path, 405)
                assert set(response.headers["Allow"].split(", ")) == methods
            assert snapshot(store) == before
            checks.append("preserved-exact405-Allow/no-mutation")
            for action, version in (("approve", 1), ("checkout", 2), ("return", 3)):
                result = (await call("POST", STAFF + f"/bookings/{booking['id']}/{action}", token=coordinator["token"], json={"expectedVersion": version, "note": "Complete working kit"})).json()
                assert result["version"] == len(result["events"]) == version + 1
                assert all(event["timestamp"].endswith("Z") for event in result["events"])
                current = snapshot(store)
                assert len(current["active_loans"]) == (2 if action == "checkout" else 1)  # Seeded overdue fixture remains.
                checks.append(action + "/version/event/custody")
                before = snapshot(store)
                stale = await call("POST", BASE + f"/{booking['id']}/cancel", 409, token=owner["token"], json={"expectedVersion": 1})
                assert set(stale.json()["fields"]) == {"expectedVersion"} and snapshot(store) == before
            assert len([row for row in snapshot(store)["reservation_slots"] if row[-1] == booking["id"]]) == 0
            checks.append("stale-expectedVersion/released-slots")
            replacement = (await call("POST", BASE, 201, token=other["token"], json=payload)).json()
            await call("POST", BASE + f"/{replacement['id']}/cancel", token=other["token"], json={"expectedVersion": 1})
            checks.append("rebook/cancel/release")
            asset = (await call("PUT", STAFF + "/assets/accessory-01/state", token=coordinator["token"], json={"state": "maintenance"})).json()
            assert asset["state"] == "maintenance"
            before = snapshot(store)
            maintenance = await call("POST", BASE, 409, token=owner["token"], json=payload)
            assert maintenance.json()["unavailableDates"] == [] and snapshot(store) == before
            checks.append("maintenance/request-refusal/no-mutation")
            await call("POST", "/api/v1/auth/logout", 204, token=owner["token"])
            await call("GET", "/api/v1/auth/me", 401, token=owner["token"])
            checks.append("logout/revocation")
            with store.transaction() as transaction:
                restored = transaction.booking_by_id(booking["id"])
                assert restored.created_at == restored.updated_at == NOW
                assert restored.created_at.tzinfo is UTC and restored.start_date.isoformat() == "2026-10-24"
                assert transaction.user_by_id("trusted-staff").password_hash.startswith("$argon2id$")
            checks.append("UTC/date/preserved-real-account")
    finally:
        server.should_exit = True
        await asyncio.wait_for(task, 10)
        sock.close()
    return checks


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="gearshare11-sql-") as directory:
        checks = asyncio.run(probe(f"sqlite:///{Path(directory) / 'live.sqlite3'}"))
    result = {
        "commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
        "tree": subprocess.check_output(["git", "rev-parse", "HEAD^{tree}"], cwd=ROOT, text=True).strip(),
        "dirty_paths": subprocess.check_output(["git", "status", "--short"], cwd=ROOT, text=True).splitlines(),
        "transport": "actual same-owner Uvicorn", "store": "migrated FILE SQLite/SQLAlchemy", "clock": NOW.isoformat(),
        "passed": len(checks), "failed": 0, "checks": checks,
        "limits": "Targeted #11 smoke only; no process-restart or full #12 parity claim.",
    }
    Path(args.output).write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
