"""Shared helpers for the #12 persistence, parity, contention and restart suites.

* ``migrated_sqlite`` creates a real temporary FILE database through the Alembic
  migration path (never ``create_all`` and never ``sqlite://:memory:``).
* ``RaceEnv`` copies a migrated template file for each iteration and gives every
  contender its own engine, ``SQLAlchemyRepository`` and FastAPI app, so each
  request runs on an independent SQLAlchemy session and SQLite connection.
* ``Reporter`` collects outcome counts; set ``GEARSHARE_PERSISTENCE_REPORT`` to a
  JSON file path to keep them as evidence.
"""

import asyncio
import json
import os
import random
import shutil
import threading
import time
from collections import Counter
from dataclasses import dataclass, field
from datetime import timedelta
from pathlib import Path

import httpx
from alembic import command

from app.database import DatabaseSettings
from app.main import create_app
from app.memory import MemoryRepository
from app.sqlalchemy_store import SQLAlchemyRepository
from invariants import audit_store, read_sqlite, assert_coherent
from test_booking_api import BASE, NOW, TODAY, Clock, FastPasswords, Harness, body, day
from test_database_schema import migration_config
from test_staff_api import STAFF

ITERATIONS = int(os.environ.get("GEARSHARE_RACE_ITERATIONS", "30"))
REPORT_PATH = os.environ.get("GEARSHARE_PERSISTENCE_REPORT")
BARRIER_TIMEOUT = 30


def migrate(url: str) -> None:
    command.upgrade(migration_config(url), "head")


def sqlite_url(path: Path) -> str:
    return f"sqlite:///{path}"


def migrated_sqlite(directory: Path, name: str = "gearshare.sqlite3", busy: float = 5.0):
    """Create a new migrated FILE database and return (url, open repository)."""
    path = Path(directory) / name
    assert not path.exists() and ":memory:" not in str(path)
    url = sqlite_url(path)
    migrate(url)
    assert path.is_file() and path.stat().st_size > 0
    return url, SQLAlchemyRepository(DatabaseSettings(url, busy))


@dataclass
class Result:
    label: str
    status: int
    json: object
    text: str
    elapsed: float
    headers: dict = field(default_factory=dict)


@dataclass
class Call:
    label: str
    method: str
    path: str
    session: dict | None
    payload: dict | None = None
    clock: object = None  # per-contender clock; default is the fixed club-local NOW


class Reporter:
    """Outcome counters per scenario, printed and optionally written as JSON."""

    def __init__(self):
        self.scenarios: dict[str, dict] = {}
        self.lock = threading.Lock()

    def record(self, scenario: str, outcome: tuple, elapsed: float = 0.0):
        with self.lock:
            entry = self.scenarios.setdefault(scenario, {"iterations": 0, "outcomes": Counter(), "max_request_seconds": 0.0})
            entry["iterations"] += 1
            entry["outcomes"][" ".join(str(item) for item in outcome)] += 1
            entry["max_request_seconds"] = max(entry["max_request_seconds"], elapsed)

    def render(self) -> dict:
        return {name: {"iterations": entry["iterations"], "outcomes": dict(sorted(entry["outcomes"].items())),
                       "max_request_seconds": round(entry["max_request_seconds"], 3)}
                for name, entry in sorted(self.scenarios.items())}

    def flush(self):
        rendered = self.render()
        if REPORT_PATH and rendered:
            path = Path(REPORT_PATH)
            existing = json.loads(path.read_text()) if path.exists() else {}
            existing.update(rendered)
            path.write_text(json.dumps(existing, indent=2, sort_keys=True) + "\n")
        for name, entry in rendered.items():
            print(f"[race] {name}: {entry['iterations']} iterations; outcomes {entry['outcomes']}; slowest request {entry['max_request_seconds']}s")


REPORTER = Reporter()


class Template:
    """A migrated file database with assets, a coordinator and registered students."""

    def __init__(self, directory: Path, students: int = 8, extra_assets: tuple = ()):
        self.path = Path(directory) / "template.sqlite3"
        self.url = sqlite_url(self.path)
        migrate(self.url)
        repository = SQLAlchemyRepository(DatabaseSettings(self.url, 5))
        try:
            self.harness = Harness(repository)
            from app.domain import Asset
            with repository.transaction() as transaction:
                for asset_id, code, state in extra_assets:
                    transaction.add_asset(Asset(asset_id, code, "Spare 🎥 Camera", "Cameras", "Fictional equipment", "Club desk", state))
            self.coordinator = self.harness.coordinator
            self.students = [self.harness.account(f"racer{index}") for index in range(students)]
            self.owner, self.other = self.harness.owner, self.harness.other
        finally:
            repository.close()

    def fresh(self, directory: Path, index: int) -> "RaceEnv":
        path = Path(directory) / f"iteration-{index}.sqlite3"
        shutil.copyfile(self.path, path)
        return RaceEnv(sqlite_url(path), self)


class RaceEnv:
    """One disposable database plus any number of independent contender stacks."""

    def __init__(self, url: str, template: Template):
        self.url = url
        self.template = template
        self.repositories: list[SQLAlchemyRepository] = []

    def stack(self, clock=None, busy: float = 5.0):
        repository = SQLAlchemyRepository(DatabaseSettings(self.url, busy))
        self.repositories.append(repository)
        app = create_app(repository=repository, seed=False, clock=clock or Clock(NOW), passwords=FastPasswords())
        return repository, app

    def setup(self):
        """A repository and app for single-threaded preparation of this database."""
        return self.stack()

    def snapshot(self):
        return read_sqlite(self.url)

    def audit(self, today=TODAY, context=""):
        return assert_coherent(read_sqlite(self.url), today, context)

    def race(self, calls: list[Call], seed: int, jitter: float = 0.004, busy: float = 5.0) -> list[Result]:
        """Fire all calls at once from separate threads, each with its own engine and app."""
        barrier = threading.Barrier(len(calls), timeout=BARRIER_TIMEOUT)
        rng = random.Random(seed)
        delays = [rng.uniform(0, jitter) for _ in calls]
        stacks = [self.stack(call.clock, busy) for call in calls]
        results: list[Result | BaseException | None] = [None] * len(calls)

        def run(index: int):
            call, (_, app), delay = calls[index], stacks[index], delays[index]
            headers = {"Authorization": "Bearer " + call.session["token"]} if call.session else {}

            async def fire():
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app, raise_app_exceptions=True), base_url="http://test") as client:
                    barrier.wait()
                    await asyncio.sleep(delay)
                    started = time.perf_counter()
                    response = await client.request(call.method, call.path, headers=headers, **({"json": call.payload} if call.payload is not None else {}))
                    return response, time.perf_counter() - started

            try:
                response, elapsed = asyncio.run(fire())
                try:
                    parsed = response.json()
                except ValueError:
                    parsed = None
                results[index] = Result(call.label, response.status_code, parsed, response.text, elapsed, dict(response.headers))
            except BaseException as error:  # surfaced by the caller, never swallowed
                results[index] = error

        threads = [threading.Thread(target=run, args=(index,), daemon=True) for index in range(len(calls))]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(BARRIER_TIMEOUT * 2)
        for outcome in results:
            if isinstance(outcome, BaseException):
                raise outcome
        assert all(isinstance(outcome, Result) for outcome in results), "a contender did not finish"
        return results

    def close(self):
        for repository in self.repositories:
            repository.close()
        self.repositories.clear()


def create_call(label, session, **overrides):
    return Call(label, "POST", BASE, session, body(**overrides))


def staff_call(label, template, booking_id, action, version, note="Complete working kit", clock=None):
    payload = {"expectedVersion": version} if action == "approve" else {"expectedVersion": version, "note": note}
    return Call(label, "POST", f"{STAFF}/bookings/{booking_id}/{action}", template.coordinator, payload, clock)


def cancel_call(label, session, booking_id, version, clock=None):
    return Call(label, "POST", f"{BASE}/{booking_id}/cancel", session, {"expectedVersion": version}, clock)


def maintenance_call(label, template, asset_id, state="maintenance", clock=None):
    return Call(label, "PUT", f"{STAFF}/assets/{asset_id}/state", template.coordinator, {"state": state}, clock)


class LockHolder:
    """An independent raw connection that holds a SQLite write lock, like a long write transaction.

    ``mode`` is ``IMMEDIATE`` (RESERVED lock: other connections may still read) or ``EXCLUSIVE``
    (nobody may read or write). It performs a real no-op write so the lock is genuine, never commits
    a change (it rolls back), and releases itself after ``seconds`` when given.
    """

    def __init__(self, path, mode="IMMEDIATE", seconds=None):
        import sqlite3
        self.connection = sqlite3.connect(path, isolation_level=None, timeout=1, check_same_thread=False)
        self.connection.execute(f"BEGIN {mode}")
        self.connection.execute("UPDATE assets SET name = name WHERE id = (SELECT min(id) FROM assets)")
        self._lock, self.released = threading.Lock(), False
        self.timer = None
        if seconds is not None:
            self.timer = threading.Timer(seconds, self.release)
            self.timer.start()

    def release(self):
        with self._lock:
            if not self.released:
                self.released = True
                self.connection.execute("ROLLBACK")
                self.connection.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        if self.timer is not None:
            self.timer.cancel()
        self.release()
