"""Real operating-system server processes for the #12 restart and contention tests.

``ServerProcess`` starts the actual ASGI application exactly as the README documents
(``python -m uvicorn app.main:app`` with ``GEARSHARE_STORE=sqlalchemy`` and
``GEARSHARE_DATABASE_URL`` pointing at a migrated SQLite file) as a child process on
a port in 6400-6499, waits for ``/health`` and records every start and stop (pid,
port, signal, exit code) in ``LIFECYCLE`` for the evidence notes.
"""

import json
import os
import random
import signal
import socket
import subprocess
import sys
import time
from datetime import UTC, date, datetime
from pathlib import Path

import httpx

BACKEND = Path(__file__).resolve().parents[1]
PORTS = range(6400, 6500)
LIFECYCLE: list[dict] = []
REPORT_PATH = os.environ.get("GEARSHARE_PERSISTENCE_REPORT")


def record(entry: dict) -> None:
    entry = {"at": datetime.now(UTC).isoformat(timespec="milliseconds"), **entry}
    LIFECYCLE.append(entry)
    print("[process]", json.dumps(entry, sort_keys=True))


_FLUSHED = 0


def flush_lifecycle() -> None:
    """Append lifecycle entries not yet written (several test modules share this process-wide list)."""
    global _FLUSHED
    pending = LIFECYCLE[_FLUSHED:]
    _FLUSHED = len(LIFECYCLE)
    if REPORT_PATH and pending:
        path = Path(REPORT_PATH)
        existing = json.loads(path.read_text()) if path.exists() else {}
        existing["process_lifecycle"] = existing.get("process_lifecycle", []) + pending
        path.write_text(json.dumps(existing, indent=2, sort_keys=True) + "\n")


def server_environment(database_path: Path, busy_timeout: str = "5") -> dict:
    environment = {key: value for key, value in os.environ.items() if not key.startswith("GEARSHARE_")}
    environment.update({
        "GEARSHARE_STORE": "sqlalchemy", "GEARSHARE_DATABASE_URL": f"sqlite:///{database_path}",
        "GEARSHARE_SQLITE_BUSY_TIMEOUT": busy_timeout, "PYTHONUNBUFFERED": "1",
    })
    return environment


def migrate_with_cli(database_path: Path) -> subprocess.CompletedProcess:
    """The documented explicit migration step: ``alembic upgrade head`` with the shared URL."""
    result = subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=BACKEND,
                            env=server_environment(database_path), capture_output=True, text=True, timeout=120)
    assert result.returncode == 0, result.stderr
    record({"event": "alembic upgrade head", "exit_code": result.returncode, "database": database_path.name})
    return result


def free_port() -> int:
    candidates = list(PORTS)
    random.shuffle(candidates)
    for port in candidates:
        with socket.socket() as probe:
            try:
                probe.bind(("127.0.0.1", port))
            except OSError:
                continue
            return port
    raise RuntimeError("no free port in 6400-6499")


def live_children(pid: int) -> list[int]:
    """Live direct children, returning PIDs in the caller's Linux PID namespace.

    A host-mounted /proc reports host Pid/PPid even when Popen returns a container
    PID. Resolve the parent using NSpid plus its namespace identity before comparing
    PPid; matching a namespace-local number to a host PPid can silently count zero
    children (or children of an unrelated process).
    """
    namespace = Path("/proc/self/ns/pid").readlink()
    identities = []
    parent = None
    for entry in Path("/proc").iterdir():
        if not entry.name.isdigit():
            continue
        try:
            status = dict(line.split(":", 1) for line in (entry / "status").read_text().splitlines())
            namespace_pids = [int(value) for value in status.get("NSpid", status["Pid"]).split()]
            local_pid = namespace_pids[-1]
            if local_pid == pid and (entry / "ns/pid").readlink() == namespace:
                parent = int(status["Pid"])
            identities.append((local_pid, int(status["PPid"]), status["State"].split()[0], entry))
        except (OSError, KeyError, ValueError):
            continue  # A process can exit while /proc is being read.
    if parent is None:
        return []
    children = []
    for local_pid, parent_pid, state, entry in identities:
        if parent_pid == parent and state not in {"Z", "X"}:
            try:
                if (entry / "ns/pid").readlink() == namespace:
                    children.append(local_pid)
            except OSError:
                continue
    return sorted(children)


class ServerProcess:
    def __init__(self, database_path: Path, log_path: Path, *, workers: int = 1, busy_timeout: str = "5"):
        self.database_path, self.log_path, self.workers, self.busy_timeout = Path(database_path), Path(log_path), workers, busy_timeout
        self.process: subprocess.Popen | None = None
        self.port: int | None = None
        self.starts = 0
        self.log_offset = 0

    @property
    def base_url(self) -> str:
        return f"http://127.0.0.1:{self.port}"

    @property
    def pid(self) -> int:
        return self.process.pid

    def start(self, timeout: float = 60.0) -> "ServerProcess":
        assert self.process is None or self.process.poll() is not None, "server is already running"
        for _ in range(5):
            self.port = free_port()
            command = [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(self.port), "--log-level", "info"]
            if self.workers > 1:
                command += ["--workers", str(self.workers)]
            self.log_offset = self.log_path.stat().st_size if self.log_path.exists() else 0
            log = open(self.log_path, "ab")
            self.process = subprocess.Popen(command, cwd=BACKEND, env=server_environment(self.database_path, self.busy_timeout), stdout=log, stderr=subprocess.STDOUT)
            log.close()
            deadline = time.monotonic() + timeout
            while time.monotonic() < deadline:
                if self.process.poll() is not None:
                    break
                try:
                    if httpx.get(self.base_url + "/health", timeout=0.5, trust_env=False).status_code == 200:
                        self.starts += 1
                        record({"event": "start", "pid": self.process.pid, "port": self.port, "workers": self.workers, "restart_number": self.starts - 1, "database": self.database_path.name})
                        return self
                except httpx.HTTPError:
                    time.sleep(0.1)
            if self.process.poll() is None:
                self.process.kill()
                self.process.wait()
            if "address already in use" not in self.log_text().lower():
                raise RuntimeError("server did not become healthy:\n" + self.log_text()[-3000:])
        raise RuntimeError("could not bind a port in 6400-6499")

    def stop(self, sig: int = signal.SIGTERM, timeout: float = 30.0) -> int:
        pid = self.process.pid
        self.process.send_signal(sig)
        try:
            code = self.process.wait(timeout)
        except subprocess.TimeoutExpired:
            self.process.kill()
            code = self.process.wait()
            record({"event": "stop-timeout-killed", "pid": pid})
        graceful = "Application shutdown complete" in self.log_text(since_start=True)
        record({"event": "stop", "pid": pid, "signal": signal.Signals(sig).name, "exit_code": code, "graceful_shutdown_logged": graceful})
        return code

    def log_text(self, since_start: bool = False) -> str:
        """The server log; ``since_start`` limits it to the current process lifetime."""
        if not self.log_path.exists():
            return ""
        data = self.log_path.read_bytes()
        return (data[self.log_offset:] if since_start else data).decode(errors="replace")

    def kill_if_running(self) -> None:
        if self.process is not None and self.process.poll() is None:
            self.process.kill()
            self.process.wait()

    def client(self, **kwargs) -> httpx.Client:
        return httpx.Client(base_url=self.base_url, timeout=kwargs.pop("timeout", 30), trust_env=False, **kwargs)


def club_today() -> date:
    from app.calendar import CLUB_ZONE
    return datetime.now(UTC).astimezone(CLUB_ZONE).date()


def bearer(session: dict) -> dict:
    return {"Authorization": "Bearer " + session["token"]}


def race_worker(index, base_url, tokens, rounds, barrier, results, jitter_seed):
    """Client process: wait on the shared barrier, then fire one request per round."""
    import random as _random
    import time as _time
    import httpx as _httpx

    rng = _random.Random(jitter_seed * 1000 + index)
    with _httpx.Client(base_url=base_url, timeout=60, trust_env=False) as client:
        client.get("/health")  # connection and import warm-up before the first round
        for number, (method, path, payload) in enumerate(rounds):
            barrier.wait(timeout=120)
            _time.sleep(rng.uniform(0, 0.004))
            started = _time.perf_counter()
            try:
                response = client.request(method, path, json=payload[index] if isinstance(payload, list) else payload,
                                          headers={"Authorization": "Bearer " + tokens[index]})
                results.put((number, index, response.status_code, response.text, _time.perf_counter() - started))
            except Exception as error:  # reported to the parent, never swallowed
                results.put((number, index, -1, repr(error), _time.perf_counter() - started))
