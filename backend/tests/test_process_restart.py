"""#12: the REAL backend process is stopped and restarted on the same SQLite file.

Nothing here reopens an ORM engine to "simulate" a restart. A child process runs
``python -m uvicorn app.main:app`` with ``GEARSHARE_STORE=sqlalchemy`` and a migrated
temporary database; a client talks to it over real HTTP on a port in 6400-6499; the
process is stopped (SIGTERM, then SIGKILL while idle, and SIGKILL under a write
burst) and started again with the same file. Pids, ports, signals and exit codes are
printed (``-s``) and kept in ``server_support.LIFECYCLE`` for the evidence notes.

The only non-HTTP step is the documented trusted coordinator setup (README: "real
account setup remains a trusted operation"): a repository inserts one coordinator
with a real Argon2id hash before the first start. No public route grants a role.
"""

import json
import multiprocessing
import re
import signal
import threading
import time
from datetime import timedelta
from pathlib import Path

import pytest

import invariants as inv
from app.auth import Argon2Passwords
from app.database import DatabaseSettings
from app.domain import User
from app.sqlalchemy_store import SQLAlchemyRepository
from persistence_support import ITERATIONS, REPORTER
from server_support import LIFECYCLE, ServerProcess, bearer, club_today, flush_lifecycle, live_children, migrate_with_cli, race_worker

pytestmark = [pytest.mark.persistence, pytest.mark.subprocess]
COORDINATOR_PASSWORD = "CoordinatorPassword42!"
STUDENT_PASSWORD = "StudentPassword42!"
OWNERS = {"B1": "alice", "B2": "alice", "B3": "alice", "B4": "bob"}


@pytest.fixture(scope="module", autouse=True)
def flush_reports():
    yield
    flush_lifecycle()
    REPORTER.flush()


def trusted_coordinator(path: Path) -> None:
    repository = SQLAlchemyRepository(DatabaseSettings(f"sqlite:///{path}"))
    try:
        with repository.transaction() as transaction:
            transaction.add_user(User("trusted-coordinator", "coordinator", "coordinator", Argon2Passwords().hash(COORDINATOR_PASSWORD)))
    finally:
        repository.close()


@pytest.fixture
def workspace(tmp_path):
    path = tmp_path / "gearshare.sqlite3"
    migrate_with_cli(path)
    trusted_coordinator(path)
    servers: list[ServerProcess] = []
    yield path, tmp_path, servers
    for server in servers:
        server.kill_if_running()


def call(client, method, path, *, token=None, status=None, **kwargs):
    response = client.request(method, path, headers=bearer({"token": token}) if token else {}, **kwargs)
    if status is not None:
        assert response.status_code == status, (method, path, response.status_code, response.text)
    return response


def register(client, name):
    return call(client, "POST", "/api/v1/auth/register", status=201, json={"username": name, "password": STUDENT_PASSWORD}).json()


def login(client, name, password=STUDENT_PASSWORD, status=200):
    return call(client, "POST", "/api/v1/auth/login", status=status, json={"username": name, "password": password}).json()


def date_text(offset):
    return (club_today() + timedelta(days=offset)).isoformat()


def journal_state(path: Path) -> str:
    """Rollback-journal file next to the database: absent, empty, or present with/without a valid header."""
    journal = Path(f"{path}-journal")
    if not journal.exists():
        return "absent"
    data = journal.read_bytes()
    if not data:
        return "empty"
    return "present, valid header (hot)" if data.startswith(bytes.fromhex("d9d505f920a163d7")) else f"present, {len(data)} bytes, header not valid (not hot)"


def booking_payload(asset, start, end, purpose):
    return {"assetId": asset, "startDate": date_text(start), "endDate": date_text(end), "purpose": purpose}


def step(client, token, booking_id, verb, version, note="Complete working kit, tested."):
    payload = {"expectedVersion": version} if verb in {"approve", "cancel"} else {"expectedVersion": version, "note": note}
    path = f"/api/v1/bookings/{booking_id}/cancel" if verb == "cancel" else f"/api/v1/staff/bookings/{booking_id}/{verb}"
    return call(client, "POST", path, token=token, json=payload)


def occupied(client, asset_id):
    days = call(client, "GET", f"/api/v1/assets/{asset_id}/availability", status=200).json()["days"]
    assert len(days) == 91
    return sorted(row["date"] for row in days if row["state"] == "occupied")


def observe(client, tokens, ids):
    """Everything a client can read back about the saved state, as plain JSON."""
    desk = call(client, "GET", "/api/v1/staff/bookings", token=tokens["coordinator"], status=200).json()
    desk.pop("today")
    return {
        "details": {name: call(client, "GET", f"/api/v1/bookings/{booking_id}", token=tokens[OWNERS[name]], status=200).json() for name, booking_id in ids.items()},
        "alice_list": call(client, "GET", "/api/v1/bookings", token=tokens["alice"], status=200).json(),
        "bob_list": call(client, "GET", "/api/v1/bookings", token=tokens["bob"], status=200).json(),
        "desk": desk,
        "occupied": {asset: occupied(client, asset) for asset in ("presentation-02", "accessory-03")},
        "assets": call(client, "GET", "/api/v1/assets", status=200).json()["items"],
    }


def test_identity_booking_state_events_and_allocations_survive_sigterm_and_sigkill_restarts(workspace):
    path, directory, servers = workspace
    url = f"sqlite:///{path}"
    server = ServerProcess(path, directory / "server.log")
    servers.append(server)
    tokens, ids = {}, {}

    # ------------------------------------------------------------ process 1: build state over HTTP
    server.start()
    first_pid = server.pid
    server_pids = {first_pid}
    with server.client() as client:
        assert call(client, "GET", "/health", status=200).json() == {"status": "ok"}
        assert len(call(client, "GET", "/api/v1/assets", status=200).json()["items"]) == 10
        alice, bob = register(client, "alice"), register(client, "bob")
        assert alice["user"]["role"] == bob["user"]["role"] == "student"
        coordinator = login(client, "coordinator", COORDINATOR_PASSWORD)
        tokens.update(alice=alice["token"], bob=bob["token"], coordinator=coordinator["token"])
        bob_revoked = bob["token"]
        ids["B1"] = call(client, "POST", "/api/v1/bookings", token=tokens["alice"], status=201, json=booking_payload("presentation-02", 0, 2, "Restart check: lecture capture")).json()["id"]
        conflict = call(client, "POST", "/api/v1/bookings", token=tokens["bob"], status=409, json=booking_payload("presentation-02", 2, 3, "Overlapping request by bob"))
        assert conflict.json()["unavailableDates"] == [date_text(2)] and "alice" not in conflict.text
        for verb, version in (("approve", 1), ("checkout", 2), ("return", 3)):
            assert step(client, tokens["coordinator"], ids["B1"], verb, version).status_code == 200
        ids["B2"] = call(client, "POST", "/api/v1/bookings", token=tokens["alice"], status=201, json=booking_payload("presentation-02", 5, 7, "Restart check: screening")).json()["id"]
        assert step(client, tokens["coordinator"], ids["B2"], "approve", 1).json()["version"] == 2
        ids["B3"] = call(client, "POST", "/api/v1/bookings", token=tokens["alice"], status=201, json=booking_payload("accessory-03", 3, 3, "Restart check: cancelled")).json()["id"]
        assert step(client, tokens["alice"], ids["B3"], "cancel", 1).json()["state"] == "cancelled"
        ids["B4"] = call(client, "POST", "/api/v1/bookings", token=tokens["bob"], status=201, json=booking_payload("accessory-03", 3, 4, "Restart check: pending")).json()["id"]
        call(client, "POST", "/api/v1/auth/logout", token=bob_revoked, status=204)
        tokens["bob"] = login(client, "bob")["token"]
        before = observe(client, tokens, ids)
    assert before["details"]["B1"]["state"] == "returned" and before["details"]["B1"]["version"] == len(before["details"]["B1"]["events"]) == 4
    assert [(b["state"], b["version"]) for b in (before["details"][k] for k in ("B2", "B3", "B4"))] == [("approved", 2), ("cancelled", 2), ("pending", 1)]
    assert before["occupied"] == {"presentation-02": [date_text(i) for i in (5, 6, 7)], "accessory-03": [date_text(3), date_text(4)]}
    pre_stop = inv.audit(inv.read_sqlite(url), club_today())
    assert pre_stop == [], pre_stop
    counts_before = inv.read_sqlite(url).counts()
    assert counts_before["users"] == 5  # two fixture identities, the trusted coordinator, alice and bob

    # ------------------------------------------------------------ SIGTERM, then restart on the same file
    assert server.stop(signal.SIGTERM) in (0, -signal.SIGTERM)
    assert "Application shutdown complete" in server.log_text(since_start=True), "SIGTERM must shut uvicorn down gracefully"
    server.start()
    assert server.pid != first_pid
    server_pids.add(server.pid)
    with server.client() as client:
        after = observe(client, tokens, ids)
        assert after == before, "booking details, events, version, desk and availability must be byte-identical after SIGTERM restart"
        # identity: the password verifies, persisted sessions are still valid, revocation persisted
        assert login(client, "alice")["user"]["id"] == alice["user"]["id"]
        login(client, "alice", "WrongPassword42!", status=401)
        assert call(client, "GET", "/api/v1/auth/me", token=tokens["alice"], status=200).json()["username"] == "alice"
        call(client, "GET", "/api/v1/auth/me", token=bob_revoked, status=401)
        assert call(client, "GET", "/api/v1/auth/me", token=tokens["bob"], status=200).json()["username"] == "bob"
        assert call(client, "POST", "/api/v1/auth/register", status=409, json={"username": " ALICE ", "password": STUDENT_PASSWORD}).json()["code"] == "USERNAME_TAKEN"
        # allocations survived: the same overlap is refused with the same dates
        again = call(client, "POST", "/api/v1/bookings", token=tokens["bob"], status=409, json=booking_payload("presentation-02", 6, 8, "Overlap after restart"))
        assert again.json()["unavailableDates"] == [date_text(6), date_text(7)]
        # seeding did not repeat and nothing was reset
        assert inv.read_sqlite(url).counts()["users"] == 5 and inv.read_sqlite(url).counts()["bookings"] == counts_before["bookings"]
        # state keeps working across the restart: stale version, then a correct cancel, rebook and approve
        stale = step(client, tokens["alice"], ids["B2"], "cancel", 1)
        assert stale.status_code == 409 and set(stale.json()["fields"]) == {"expectedVersion"}
        cancelled = step(client, tokens["alice"], ids["B2"], "cancel", 2)
        assert cancelled.status_code == 200 and cancelled.json()["version"] == 3 == len(cancelled.json()["events"])
        assert [e["action"] for e in cancelled.json()["events"]] == ["create", "approve", "cancel"]
        assert cancelled.json()["events"][:2] == before["details"]["B2"]["events"]
        ids["B5"] = call(client, "POST", "/api/v1/bookings", token=tokens["bob"], status=201, json=booking_payload("presentation-02", 5, 7, "Rebooked after restart")).json()["id"]
        assert step(client, tokens["coordinator"], ids["B4"], "approve", 1).json()["version"] == 2
        carol = register(client, "carol")
        tokens["carol"] = carol["token"]
        mid = {
            "B2": call(client, "GET", f"/api/v1/bookings/{ids['B2']}", token=tokens["alice"], status=200).json(),
            "B4": call(client, "GET", f"/api/v1/bookings/{ids['B4']}", token=tokens["bob"], status=200).json(),
            "B5": call(client, "GET", f"/api/v1/bookings/{ids['B5']}", token=tokens["bob"], status=200).json(),
            "desk": call(client, "GET", "/api/v1/staff/bookings", token=tokens["coordinator"], status=200).json(),
            "occupied": {asset: occupied(client, asset) for asset in ("presentation-02", "accessory-03")},
        }
    second_pid = server.pid
    counts_mid = inv.read_sqlite(url).counts()
    assert inv.audit(inv.read_sqlite(url), club_today()) == []

    # ------------------------------------------------------------ SIGKILL while idle, then restart again
    assert server.stop(signal.SIGKILL) == -signal.SIGKILL
    assert "Application shutdown complete" not in server.log_text(since_start=True), "SIGKILL gives the process no chance to shut down"
    server.start()
    assert server.pid not in (first_pid, second_pid)
    server_pids.add(server.pid)
    with server.client() as client:
        assert call(client, "GET", f"/api/v1/bookings/{ids['B2']}", token=tokens["alice"], status=200).json() == mid["B2"]
        assert call(client, "GET", f"/api/v1/bookings/{ids['B4']}", token=tokens["bob"], status=200).json() == mid["B4"]
        assert call(client, "GET", f"/api/v1/bookings/{ids['B5']}", token=tokens["bob"], status=200).json() == mid["B5"]
        desk = call(client, "GET", "/api/v1/staff/bookings", token=tokens["coordinator"], status=200).json()
        assert desk["bookings"] == mid["desk"]["bookings"] and desk["counts"] == mid["desk"]["counts"]
        assert {asset: occupied(client, asset) for asset in ("presentation-02", "accessory-03")} == mid["occupied"]
        assert call(client, "GET", "/api/v1/auth/me", token=tokens["carol"], status=200).json()["username"] == "carol"
        assert login(client, "carol")["user"]["id"] == carol["user"]["id"]
        # And the restarted-after-kill process still accepts a full transition.
        assert step(client, tokens["coordinator"], ids["B5"], "approve", 1).json()["version"] == 2
    assert inv.read_sqlite(url).counts()["bookings"] == counts_mid["bookings"]
    final_stop = server.stop(signal.SIGTERM)
    assert final_stop in (0, -signal.SIGTERM)
    inv.assert_coherent(inv.read_sqlite(url), club_today(), "after three process lifetimes")
    events = [(entry["event"], entry.get("signal")) for entry in LIFECYCLE if entry.get("pid") in server_pids]
    assert events == [("start", None), ("stop", "SIGTERM"), ("start", None), ("stop", "SIGKILL"), ("start", None), ("stop", "SIGTERM")], events
    # Logs are free of tracebacks and of credential material.
    log = server.log_text()
    assert "Traceback" not in log
    for secret in (STUDENT_PASSWORD, COORDINATOR_PASSWORD, *tokens.values(), bob_revoked):
        assert secret not in log


def test_sigkill_during_a_burst_of_writes_keeps_every_acknowledged_booking_and_no_partial_state(workspace):
    path, directory, servers = workspace
    url = f"sqlite:///{path}"
    server = ServerProcess(path, directory / "burst.log")
    servers.append(server)
    server.start()
    with server.client() as client:
        students = [register(client, f"burst{n}") for n in range(4)]
    seeded_bookings = len(inv.read_sqlite(url).bookings)
    units = ("presentation-02", "accessory-03", "audio-02", "camera-02")
    attempts_per_writer = 12
    guard = threading.Lock()
    acknowledged: dict[str, dict] = {}
    rounds = []
    for round_number in range(3):
        killed = threading.Event()
        sent = threading.Barrier(len(students) + 1)
        unclear = []
        failures = []
        acknowledged_before_round = len(acknowledged)

        def wait_after_body_sent(event, info):
            # All four final HTTP bodies have reached the socket before the kill.
            # Hold only the clients' response reads, never the application/SQLite.
            if event == "http11.send_request_body.complete":
                sent.wait(timeout=30)
                assert killed.wait(30), "controller did not stop the server"

        def writer(index, student):
            import httpx
            try:
                with httpx.Client(base_url=server.base_url, timeout=5, trust_env=False) as client:
                    for attempt in range(attempts_per_writer):
                        # Disjoint, bounded dates for each round; probes own separate dates.
                        unit, offset = units[index], 20 + round_number * attempts_per_writer + attempt
                        payload = booking_payload(unit, offset, offset, f"Burst write {unit} {offset}")
                        extensions = {"trace": wait_after_body_sent} if attempt == attempts_per_writer - 1 else {}
                        try:
                            response = client.post("/api/v1/bookings", json=payload, headers=bearer(student), extensions=extensions)
                        except httpx.HTTPError:
                            unclear.append(payload)
                            return
                        if response.status_code == 201:
                            with guard:
                                acknowledged[response.json()["id"]] = {"token": student["token"], "version": 1}
                        else:
                            unclear.append((payload, response.status_code))
            except Exception as error:
                failures.append(repr(error))
                sent.abort()

        threads = [threading.Thread(target=writer, args=(index, student), daemon=True) for index, student in enumerate(students)]
        for thread in threads:
            thread.start()
        all_sent = False
        try:
            sent.wait(timeout=30)
            all_sent = True
            killed_after = len(acknowledged)
            code = server.stop(signal.SIGKILL)
        finally:
            server.kill_if_running()
            killed.set()
            if not all_sent:
                sent.abort()
            for thread in threads:
                thread.join(30)
        assert not any(thread.is_alive() for thread in threads), "burst writer did not finish"
        assert not failures, failures
        assert code == -signal.SIGKILL and killed_after > acknowledged_before_round
        journal_left_by_kill = journal_state(path)
        server.start()
        with server.client() as client:
            for booking_id, owner in list(acknowledged.items()):
                response = call(client, "GET", f"/api/v1/bookings/{booking_id}", token=owner["token"], status=200)
                assert response.json()["version"] == len(response.json()["events"]) == 1, "an acknowledged booking lost its event"
        state = inv.assert_coherent(inv.read_sqlite(url), club_today(), f"after SIGKILL round {round_number}")
        persisted = {row["id"] for row in state.bookings}
        committed_but_unacknowledged = len(state.bookings) - seeded_bookings - len(acknowledged)
        assert committed_but_unacknowledged >= 0
        assert set(acknowledged) <= persisted
        # A hot journal (valid header) is rolled back by the first reader; a journal whose header was
        # never completed is not hot and is only removed by the next write transaction.
        journal_after_reads = journal_state(path)
        assert not journal_after_reads.startswith("present, valid"), journal_after_reads
        with server.client() as client:
            unit, offset = units[0], 80 + round_number
            probe = call(client, "POST", "/api/v1/bookings", token=students[0]["token"], status=201, json=booking_payload(unit, offset, offset, "Probe write after crash recovery"))
            acknowledged[probe.json()["id"]] = {"token": students[0]["token"], "version": 1}
        assert journal_state(path) == "absent", "the next committed write leaves no journal behind"
        rounds.append({
            "round": round_number, "acknowledged_before_kill": killed_after,
            "bounded_write_attempts": len(students) * attempts_per_writer,
            "request_bodies_sent_with_responses_outstanding_at_kill": len(students),
            "persisted_bookings_beyond_seed": len(state.bookings) - seeded_bookings,
            "committed_but_unacknowledged": committed_but_unacknowledged,
            "journal_right_after_kill": journal_left_by_kill, "journal_after_recovery_reads": journal_after_reads,
            "in_flight_or_refused_requests": len(unclear),
        })
        print("[burst]", rounds[-1])
    server.stop(signal.SIGTERM)
    assert "Traceback" not in server.log_text(since_start=True)


@pytest.mark.parametrize("workers", [1, 3])
def test_simultaneous_conflicting_reservations_from_separate_client_processes_through_the_real_server(workspace, workers):
    path, directory, servers = workspace
    url = f"sqlite:///{path}"
    clients = 8
    rounds = ITERATIONS
    server = ServerProcess(path, directory / "race.log")
    servers.append(server)
    server.start()  # single process first: seeds the catalogue exactly once
    with server.client() as client:
        tokens = [register(client, f"proc{n}")["token"] for n in range(clients)]
    if workers > 1:
        server.stop(signal.SIGTERM)
        server = ServerProcess(path, directory / "race-multi.log", workers=workers)
        servers.append(server)
        server.start()  # sessions persisted in the file authenticate the client processes
    seeded = inv.read_sqlite(url)
    plan = []
    for number in range(rounds):
        offset = 20 + number
        plan.append(("POST", "/api/v1/bookings", [booking_payload("presentation-02", offset, offset, f"Purpose of proc {n} round {number}") for n in range(clients)]))
    context = multiprocessing.get_context("spawn")
    barrier, results = context.Barrier(clients), context.Queue()
    processes = [context.Process(target=race_worker, args=(n, server.base_url, tokens, plan, barrier, results, workers)) for n in range(clients)]
    for process in processes:
        process.start()
    collected = [results.get(timeout=300) for _ in range(clients * rounds)]
    for process in processes:
        process.join(60)
        assert process.exitcode == 0
    last_pid = server.pid
    by_round = {}
    for number, index, status, text, elapsed in collected:
        by_round.setdefault(number, []).append((index, status, text, elapsed))
    outcomes = []
    for number in range(rounds):
        entries = by_round[number]
        winners = [entry for entry in entries if entry[1] == 201]
        losers = [entry for entry in entries if entry[1] == 409]
        assert (len(winners), len(losers)) == (1, clients - 1), [entry[1] for entry in entries]
        offset_day = date_text(20 + number)
        for _, _, text, _ in losers:
            body = json.loads(text)
            assert set(body) == {"code", "message", "unavailableDates"} and body["unavailableDates"] == [offset_day]
            assert "proc" not in text and json.loads(winners[0][2])["id"] not in text  # no borrower username, purpose or booking id
        outcomes.append("201x1 409x%d" % len(losers))
        REPORTER.record(f"real server, {clients} client processes, {workers} server worker(s), same unit and day", ("201x1", f"409x{clients - 1}"), max(entry[3] for entry in entries))
    state = inv.assert_coherent(inv.read_sqlite(url), club_today(), "after multi-process race")
    created = len(state.bookings) - len(seeded.bookings)
    assert created == len(state.events) - len(seeded.events) == len(state.slots) - len(seeded.slots) == rounds
    server.stop(signal.SIGTERM)
    assert "Traceback" not in server.log_text(), "no worker failed while serving the race"
    print(f"[race] real server pid {last_pid}, workers={workers}: {rounds} rounds x {clients} processes, outcomes {set(outcomes)}")


@pytest.mark.skipif(not Path("/proc/self/stat").exists(), reason="needs Linux /proc to count worker processes")
def test_cold_start_of_three_workers_on_an_unseeded_database_self_heals_and_seeds_exactly_once(workspace):
    """OBSERVED LIMITATION, pinned as a safety property rather than a guarantee of a quiet start.

    ``create_app()`` seeds the catalogue at import. Three workers importing the app at the same instant
    on a freshly migrated, still empty file race for the write lock; the losers hit the bounded retry,
    raise the contract 503 "The service is busy" from ``seed_catalogue`` and die at import, and
    uvicorn's supervisor restarts them (on the second attempt the seed marker exists). The documented
    deployment is one process or a database seeded by a first start; this test asserts what must hold
    either way: only that one, controlled error appears, three workers end up serving, and the seed ran once.
    """
    path, directory, servers = workspace
    url = f"sqlite:///{path}"
    server = ServerProcess(path, directory / "cold.log", workers=3)
    servers.append(server)
    server.start()

    def live_workers():
        # The supervisor also owns a resource tracker: only count actual ASGI workers
        # that logged their own PID and are still its live direct children.
        started = {int(pid) for pid in re.findall(r"Started server process \[(\d+)\]", server.log_text(since_start=True))}
        return sorted(started.intersection(live_children(server.pid)))

    deadline = time.monotonic() + 30
    while len(live_workers()) < 3 and time.monotonic() < deadline:
        time.sleep(0.2)
    time.sleep(1.5)  # allow a restarted worker to finish importing
    with server.client() as client:
        statuses = [call(client, "GET", "/api/v1/assets").status_code for _ in range(60)]
        assert statuses == [200] * 60
        assert len(call(client, "GET", "/api/v1/assets", status=200).json()["items"]) == 10
    worker_pids = live_workers()
    workers_alive = len(worker_pids)
    code = server.stop(signal.SIGTERM)
    log = server.log_text()
    tracebacks, busy = log.count("Traceback"), log.count("app.errors.ApiError: The service is busy. Try again.")
    assert tracebacks == busy, "the only failure allowed during a cold start is the contract 503 'service is busy'"
    assert workers_alive >= 3 and log.count("Application startup complete") >= 3
    state = inv.assert_coherent(inv.read_sqlite(url), club_today(), "after cold multi-worker start")
    assert len(state.assets) == 10 and state.seeded_on is not None
    record_cold = {"event": "cold-start-3-workers", "worker_import_failures_503": busy, "child_processes_alive_after_start": workers_alive, "live_worker_pids": worker_pids, "exit_code": code}
    LIFECYCLE.append(record_cold)
    print("[process]", json.dumps(record_cold, sort_keys=True))
