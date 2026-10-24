"""#12: what the file-backed SQLite store really does when the database is locked.

A raw second connection (``LockHolder``) plays "a long write transaction" while
independent clients (own engine, session, app) try to read and write. Everything is
observed and asserted on the physical file afterwards. No claim is made about any
other database system; the behaviour below belongs to SQLite 3.x in its default
rollback-journal mode as configured in ``app/database.py``.

Settings in effect (read back from a live connection in the first test): rollback
journal (``DELETE``, no WAL), ``synchronous=FULL``, ``foreign_keys=ON``, connect
timeout = busy timeout (default 5 s, env ``GEARSHARE_SQLITE_BUSY_TIMEOUT``, 0 < t <= 30),
one explicit deferred ``BEGIN`` per request transaction, no application-level
single-writer lock: SQLite's own file lock is the single writer.

Observed (asserted below):

* RESERVED lock held by another writer: readers are served (200); every writer fails
  FAST with 503 ``SERVICE_UNAVAILABLE`` after the bounded 4-attempt retry (~0.15 s), because a
  read transaction that must upgrade to a write lock gets SQLITE_BUSY immediately and the
  busy timeout is not consulted. A hold shorter than the busy timeout does not make
  such writers wait for it.
* EXCLUSIVE lock held: readers and writers wait for the busy timeout on each of 4 attempts
  and then answer 503 (about 4 x timeout + backoff); if the lock is released inside the
  timeout, they succeed.
* Never a hang, never a stack trace or the word "locked"/"sqlite" in a response, never a
  partial row; after release everything works again and the auditor is clean.
"""

import sqlite3
import time
from pathlib import Path

import pytest

import invariants as inv
from app.database import DatabaseSettings, make_engine
from app.sqlalchemy_store import SQLAlchemyRepository
from persistence_support import REPORTER, Call, LockHolder, Template, create_call, migrated_sqlite
from server_support import flush_lifecycle
from test_booking_api import TODAY, day

pytestmark = pytest.mark.persistence
UNITS = ("unit-a", "unit-b", "unit-c", "unit-d")
BUSY = 0.3
ATTEMPTS = 4  # app.sqlalchemy_store.retry_transaction


@pytest.fixture(scope="module")
def template(tmp_path_factory):
    return Template(tmp_path_factory.mktemp("lock-template"), students=6,
                    extra_assets=(("unit-c", "UNIT-C", "active"), ("unit-d", "UNIT-D", "active")))


@pytest.fixture(scope="module", autouse=True)
def report():
    yield
    REPORTER.flush()
    flush_lifecycle()


def pragma(connection, name):
    return connection.exec_driver_sql(f"PRAGMA {name}").scalar()


def test_sqlite_settings_actually_in_effect_and_validated(tmp_path):
    url, repository = migrated_sqlite(tmp_path, busy=2.5)
    path = tmp_path / "gearshare.sqlite3"
    try:
        with repository.engine.connect() as connection:
            settings = {name: pragma(connection, name) for name in ("journal_mode", "synchronous", "foreign_keys", "busy_timeout", "locking_mode", "temp_store")}
        assert settings["journal_mode"] == "delete", "WAL is deliberately not enabled"
        assert settings["synchronous"] == 2 and settings["foreign_keys"] == 1 and settings["locking_mode"] == "normal"
        assert settings["busy_timeout"] == 2500
        assert repository.engine.dialect.name == "sqlite"
        assert not (tmp_path / "gearshare.sqlite3-wal").exists() and not (tmp_path / "gearshare.sqlite3-shm").exists()
    finally:
        repository.close()
    for bad in (0, -1, 30.1):
        with pytest.raises(ValueError, match="busy timeout"):
            make_engine(DatabaseSettings(url, bad))
    make_engine(DatabaseSettings(url, 30)).dispose()
    print("[sqlite]", {"sqlite_version": sqlite3.sqlite_version, **settings, "busy_timeout_ms_for_2.5s_setting": settings["busy_timeout"]})
    REPORTER.record("sqlite settings", tuple(f"{key}={value}" for key, value in sorted(settings.items())))
    assert path.is_file()


def writers(template, offset=1):
    return [create_call(f"write-{unit}", template.students[index], assetId=unit, startDate=day(offset + index), endDate=day(offset + index))
            for index, unit in enumerate(UNITS)]


def readers():
    return [Call("read-list", "GET", "/api/v1/assets", None), Call("read-availability", "GET", "/api/v1/assets/unit-a/availability", None)]


def assert_safe_unavailable(result):
    assert result.status == 503 and set(result.json) == {"code", "message"} and result.json["code"] == "SERVICE_UNAVAILABLE", result.text
    lowered = result.text.lower()
    assert "locked" not in lowered and "sqlite" not in lowered and "traceback" not in lowered and "operationalerror" not in lowered


def tally(results):
    counts = {}
    for result in results:
        key = f"{result.label.split('-')[0]}:{result.status}"
        counts[key] = counts.get(key, 0) + 1
    return tuple(f"{key}x{number}" for key, number in sorted(counts.items()))


def run_contention(template, tmp_path, scenario, mode, hold, busy, rounds, check):
    for index in range(rounds):
        env = template.fresh(tmp_path, index)
        path = env.url.removeprefix("sqlite:///")
        try:
            before = env.snapshot()
            holder = LockHolder(path, mode, hold)
            started = time.perf_counter()
            try:
                results = env.race(writers(template) + readers(), seed=index, busy=busy)
            finally:
                wall = time.perf_counter() - started
                holder.__exit__()
            check(results, wall)
            state = env.audit(TODAY, f"{scenario} #{index}")
            created = [r for r in results if r.label.startswith("write") and r.status == 201]
            assert len(state.bookings) - len(before.bookings) == len(created) == len(state.events) - len(before.events) == len(state.slots) - len(before.slots)
            if not created:
                inv.assert_unchanged(before, state, f"{scenario} #{index}")
            # The same requests succeed once the lock is gone: nothing was left half-done or stuck.
            if not created:
                retry = [env.race([call], seed=100 + index)[0] for call in writers(template)]  # one at a time
                assert [r.status for r in retry] == [201] * len(UNITS), [(r.status, r.text) for r in retry]
                env.audit(TODAY, f"{scenario} #{index} after release")
            assert not Path(path + "-wal").exists()
            REPORTER.record(scenario, tally(results), max(r.elapsed for r in results))
        finally:
            env.close()


def test_reserved_lock_held_by_another_writer_readers_served_writers_fail_fast_with_503(template, tmp_path):
    def check(results, wall):
        for result in results:
            if result.label.startswith("write"):
                assert_safe_unavailable(result)
                assert result.elapsed < ATTEMPTS * BUSY + 2, "bounded, not a hang"
            else:
                assert result.status == 200
        assert wall < ATTEMPTS * BUSY + 3

    run_contention(template, tmp_path, "RESERVED lock held through the race, busy timeout 0.3 s", "IMMEDIATE", None, BUSY, 8, check)


def test_exclusive_lock_blocks_readers_and_writers_for_the_busy_timeout_then_503(template, tmp_path):
    def check(results, wall):
        for result in results:
            assert_safe_unavailable(result)
            assert result.elapsed >= BUSY, "the busy timeout was honoured before giving up"
            assert result.elapsed < ATTEMPTS * (BUSY + 0.25) + 2, "bounded, not a hang"

    run_contention(template, tmp_path, "EXCLUSIVE lock held through the race, busy timeout 0.3 s", "EXCLUSIVE", None, BUSY, 4, check)


def test_exclusive_lock_released_inside_the_busy_timeout_lets_requests_through(template, tmp_path):
    def check(results, wall):
        for result in results:
            if result.label.startswith("write"):
                assert result.status in (201, 503), result.text
                if result.status == 503:
                    assert_safe_unavailable(result)
            else:
                assert result.status == 200, result.text
        assert wall < 6

    run_contention(template, tmp_path, "EXCLUSIVE lock released after 0.25 s, busy timeout 2 s", "EXCLUSIVE", 0.25, 2.0, 8, check)


def test_reserved_lock_released_inside_the_busy_timeout_still_fails_writers_that_must_upgrade(template, tmp_path):
    """Observational: documents that the busy timeout does not cover the read-to-write upgrade."""
    def check(results, wall):
        for result in results:
            if result.label.startswith("write"):
                assert result.status in (201, 503), result.text
                if result.status == 503:
                    assert_safe_unavailable(result)
            else:
                assert result.status == 200
        assert wall < 6

    run_contention(template, tmp_path, "RESERVED lock released after 0.25 s, busy timeout 2 s", "IMMEDIATE", 0.25, 2.0, 8, check)


@pytest.mark.subprocess
def test_real_server_answers_bounded_503_while_another_connection_holds_the_database_and_recovers(tmp_path):
    """The same lock scenarios over real HTTP against a real uvicorn process (busy timeout 0.3 s)."""
    from server_support import ServerProcess, bearer, club_today, migrate_with_cli
    import signal

    path = tmp_path / "gearshare.sqlite3"
    migrate_with_cli(path)
    server = ServerProcess(path, tmp_path / "locked.log", busy_timeout=str(BUSY))
    try:
        server.start()
        with server.client(timeout=20) as client:
            student = client.post("/api/v1/auth/register", json={"username": "locked", "password": "StudentPassword42!"}).json()
            before = inv.read_sqlite(f"sqlite:///{path}")
            payload = {"assetId": "presentation-02", "startDate": str(club_today()), "endDate": str(club_today()), "purpose": "Created during a lock"}

            def timed(method, route, **kwargs):
                started = time.perf_counter()
                response = client.request(method, route, headers=bearer(student), **kwargs)
                return response, time.perf_counter() - started

            observed = {}
            with LockHolder(str(path), "IMMEDIATE"):
                write, took = timed("POST", "/api/v1/bookings", json=payload)
                assert write.status_code == 503 and write.json()["code"] == "SERVICE_UNAVAILABLE" and took < 3
                login, _ = timed("POST", "/api/v1/auth/login", json={"username": "locked", "password": "StudentPassword42!"})
                assert login.status_code == 503
                read, _ = timed("GET", "/api/v1/assets")
                assert read.status_code == 200
                assert client.get("/health").status_code == 200
                observed["reserved"] = {"write": write.status_code, "login": login.status_code, "read": read.status_code, "write_seconds": round(took, 3)}
            with LockHolder(str(path), "EXCLUSIVE"):
                read, took_read = timed("GET", "/api/v1/assets")
                write, took_write = timed("POST", "/api/v1/bookings", json=payload)
                assert (read.status_code, write.status_code) == (503, 503) and max(took_read, took_write) < ATTEMPTS * (BUSY + 0.25) + 3
                assert client.get("/health").status_code == 200, "liveness does not need the database"
                observed["exclusive"] = {"read": read.status_code, "write": write.status_code, "read_seconds": round(took_read, 3), "write_seconds": round(took_write, 3)}
            for response in (read, write):
                assert response.text.lower().count("locked") == 0 and "sqlite" not in response.text.lower()
            assert inv.read_sqlite(f"sqlite:///{path}").counts() == before.counts(), "nothing was written while locked"
            created, _ = timed("POST", "/api/v1/bookings", json=payload)
            assert created.status_code == 201, created.text
            assert timed("GET", "/api/v1/assets")[0].status_code == 200
        assert server.process.poll() is None, "the server process survived the lock contention"
        server.stop(signal.SIGTERM)
        inv.assert_coherent(inv.read_sqlite(f"sqlite:///{path}"), club_today(), "after real-server lock contention")
        assert "Traceback" not in server.log_text()
        print("[sqlite] real-server lock observations:", observed)
        REPORTER.record("real server, external lock held (RESERVED, then EXCLUSIVE), busy timeout 0.3 s",
                        tuple(f"{lock} {operation}:{status}" for lock, seen in observed.items() for operation, status in seen.items() if not operation.endswith("seconds")))
    finally:
        server.kill_if_running()
