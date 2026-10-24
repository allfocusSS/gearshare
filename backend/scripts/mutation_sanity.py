"""#12 mutation sanity check: do the new suites and the auditor notice deliberate breakages?

Copies the repository to a scratch directory (the working tree is never modified),
applies ONE deliberate defect at a time (each replacement must match exactly once),
and runs the test groups in order of cost until one fails. A mutation that no group
catches is reported as a SURVIVOR, then the whole suite is run once more so the
report says whether any pre-existing test catches it. Exit status is 0 even with
survivors: they are findings to read, not a gate.

Run from backend:  uv run --locked python scripts/mutation_sanity.py [--only ID ...] [--list] [--report PATH]
Race suites use GEARSHARE_RACE_ITERATIONS=6 here to keep a run affordable.
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
GROUPS = [
    ("storage-confinement", ["tests/test_storage_confinement.py"]),
    ("invariant-auditor", ["tests/test_invariant_auditor.py"]),
    ("repository-contract", ["tests/test_repository_contract.py"]),
    ("fault-injection", ["tests/test_fault_injection.py"]),
    ("sqlite-contention", ["tests/test_sqlite_contention.py"]),
    ("concurrency", ["tests/test_concurrency_sqlite.py"]),
    ("process-restart", ["tests/test_process_restart.py"]),
    ("pre-existing", ["tests", "--ignore=tests/test_storage_confinement.py", "--ignore=tests/test_invariant_auditor.py",
                      "--ignore=tests/test_repository_contract.py", "--ignore=tests/test_fault_injection.py",
                      "--ignore=tests/test_sqlite_contention.py", "--ignore=tests/test_concurrency_sqlite.py",
                      "--ignore=tests/test_process_restart.py"]),
]


@dataclass(frozen=True)
class Mutation:
    id: str
    what: str
    file: str
    old: str
    new: str


MUTATIONS = [
    Mutation("memory-duplicate-slot", "memory adapter accepts a second slot for the same (asset, day)", "backend/app/memory.py",
             '        if key in self.state.slots:\n            raise ValueError("Duplicate reserved day")\n',
             '        if False:\n            raise ValueError("Duplicate reserved day")\n'),
    Mutation("memory-active-loan-duplicates", "memory adapter accepts a second active loan for one unit", "backend/app/memory.py",
             "        if loan.asset_id in self.state.active_loans or any(",
             "        if False and any("),
    Mutation("memory-publish-on-error", "memory transaction publishes its copy even when the operation failed", "backend/app/memory.py",
             "            yield transaction\n            # Copy again so a retained transaction cannot mutate published storage.\n            self._state = transaction.state.copy()\n",
             "            try:\n                yield transaction\n            finally:\n                self._state = transaction.state.copy()\n"),
    Mutation("sql-commit-on-error", "SQL transaction commits what it wrote before a failure instead of rolling back", "backend/app/sqlalchemy_store.py",
             "            with ORMSession(self.engine, expire_on_commit=False, close_resets_only=False) as session, session.begin():\n                yield _Transaction(session)\n",
             "            with ORMSession(self.engine, expire_on_commit=False, close_resets_only=False) as session:\n                try:\n                    yield _Transaction(session)\n                finally:\n                    session.commit()\n"),
    Mutation("sql-no-booking-cas", "booking replacement no longer checks the version/state it read (compare-and-set removed)", "backend/app/sqlalchemy_store.py",
             "            BookingModel.id == booking.id, BookingModel.version == previous.version, BookingModel.state == previous.state,\n",
             "            BookingModel.id == booking.id,\n"),
    Mutation("sql-no-availability-claim", "creating a booking no longer claims the per-asset availability version", "backend/app/sqlalchemy_store.py",
             "        self._check_booking(booking)\n        self._claim_asset(booking.asset_id)\n        self.session.add(BookingModel(",
             "        self._check_booking(booking)\n        self.session.add(BookingModel("),
    Mutation("sql-busy-not-recognised", "a locked database is no longer recognised as contention (becomes an unexpected failure)", "backend/app/sqlalchemy_store.py",
             '    return (getattr(error.orig, "sqlite_errorcode", -1) & 255) in {5, 6}\n',
             "    return False\n"),
    Mutation("sql-logout-keeps-session", "logout stops deleting the stored session", "backend/app/sqlalchemy_store.py",
             "        self.session.execute(delete(SessionModel).where(SessionModel.token_hash == token_hash))\n",
             "        pass\n"),
    Mutation("migration-no-slot-primary-key", "the Alembic migration forgets the (asset_id, day) primary key on reservation_slots", "backend/migrations/versions/0001_initial_gearshare_schema.py",
             "    sa.PrimaryKeyConstraint('asset_id', 'day')\n    )\n    op.create_index(op.f('ix_reservation_slots_booking_id')",
             "    )\n    op.create_index(op.f('ix_reservation_slots_booking_id')"),
    Mutation("service-no-create-event", "a new booking is stored without its create event", "backend/app/bookings.py",
             '            transaction.add_booking_event(BookingEvent(str(uuid4()), booking.id, actor.id, "create", None, "pending", instant, purpose))\n',
             ""),
    Mutation("service-cancel-keeps-slots", "cancelling a booking leaves its day slots occupied", "backend/app/bookings.py",
             "            transaction.release_slots(booking.id)\n            return cancelled.private",
             "            return cancelled.private"),
    Mutation("service-stale-version-accepted", "a stale expectedVersion is accepted", "backend/app/bookings.py",
             "    if version != booking.version:\n", "    if False:\n"),
    Mutation("service-visibility-leak", "any student can read any other student's booking", "backend/app/bookings.py",
             '    if booking is None or (booking.user_id != actor.id and actor.role != "coordinator"):',
             "    if booking is None:"),
    Mutation("service-checkout-ignores-active-loan", "checkout no longer refuses a unit that is still on loan", "backend/app/staff.py",
             "                if transaction.active_loan_by_asset(booking.asset_id) is not None:\n",
             "                if False:\n"),
    Mutation("service-maintenance-ignores-reservations", "maintenance is allowed with pending/approved reservations", "backend/app/staff.py",
             '                        booking.state == "checked_out" or booking.state in {"pending", "approved"} and booking.end_date >= today\n',
             '                        booking.state == "checked_out"\n'),
    Mutation("seed-marker-ignored", "start-up seeds the catalogue again on every start", "backend/app/fixtures.py",
             "        if transaction.catalogue_seeded_on() is not None:\n            return\n",
             "        if False:\n            return\n"),
    Mutation("auditor-ignores-duplicate-slots", "the invariant auditor stops flagging duplicate (asset, day) slots", "backend/tests/invariants.py",
             "        if key in slot_keys:\n            flag(DUPLICATE_SLOT",
             "        if False and key in slot_keys:\n            flag(DUPLICATE_SLOT"),
    Mutation("auditor-ignores-missing-create-event", "the invariant auditor stops requiring a create event", "backend/tests/invariants.py",
             "flag(MISSING_CREATE,", "(lambda *_: None)(MISSING_CREATE,"),
]


def copy_tree(destination: Path) -> None:
    ignore = shutil.ignore_patterns(".git", "node_modules", ".venv", "__pycache__", "*.sqlite3", "*.sqlite3-journal", "dist", ".pytest_cache", ".mypy_cache")
    shutil.copytree(REPO, destination, ignore=ignore)


def apply(root: Path, mutation: Mutation) -> None:
    path = root / mutation.file
    text = path.read_text()
    count = text.count(mutation.old)
    assert count == 1, f"{mutation.id}: pattern matches {count} times in {mutation.file}; refusing to guess"
    path.write_text(text.replace(mutation.old, mutation.new))


def run_group(root: Path, name: str, args: list[str], timeout: int) -> dict:
    environment = {key: value for key, value in os.environ.items() if not key.startswith("GEARSHARE_")}
    environment["GEARSHARE_RACE_ITERATIONS"] = "6"
    environment["PYTHONDONTWRITEBYTECODE"] = "1"
    started = time.monotonic()
    try:
        result = subprocess.run([sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider", "--maxfail=3", "-rf", "--no-header", *args],
                                cwd=root / "backend", env=environment, capture_output=True, text=True, timeout=timeout)
        output, code = result.stdout + result.stderr, result.returncode
    except subprocess.TimeoutExpired as error:
        output, code = "TIMEOUT after %ss\n%s" % (timeout, (error.stdout or b"").decode(errors="replace")[-1500:] if isinstance(error.stdout, bytes) else (error.stdout or "")[-1500:]), 124
    failures = re.findall(r"^FAILED (\S+)", output, re.MULTILINE)
    summary = (output.strip().splitlines() or [""])[-1]
    return {"group": name, "exit": code, "failed": failures, "summary": summary, "seconds": round(time.monotonic() - started, 1)}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", nargs="*", default=[])
    parser.add_argument("--list", action="store_true")
    parser.add_argument("--report")
    parser.add_argument("--timeout", type=int, default=900)
    options = parser.parse_args()
    chosen = [m for m in MUTATIONS if not options.only or m.id in options.only]
    if options.list:
        bad = 0
        for mutation in MUTATIONS:
            matches = (REPO / mutation.file).read_text().count(mutation.old)
            bad += matches != 1
            print(f"{mutation.id:45} matches={matches}  {mutation.what}")
        return 1 if bad else 0
    results = []
    scratch = Path(tempfile.mkdtemp(prefix="gearshare-mutation-"))
    print(f"scratch directory: {scratch}")
    try:
        baseline_root = scratch / "baseline"
        copy_tree(baseline_root)
        print("baseline (unmutated copy):")
        for name, args in GROUPS:
            outcome = run_group(baseline_root, name, args, options.timeout)
            print(f"  {name:22} exit {outcome['exit']}  {outcome['summary']}  ({outcome['seconds']}s)")
            if outcome["exit"] != 0:
                print("the unmutated copy must pass every group; aborting")
                return 2
        shutil.rmtree(baseline_root)
        for mutation in chosen:
            root = scratch / mutation.id
            copy_tree(root)
            apply(root, mutation)
            entry = {"id": mutation.id, "what": mutation.what, "file": mutation.file, "runs": [], "killed_by": None}
            for name, args in GROUPS:
                outcome = run_group(root, name, args, options.timeout)
                entry["runs"].append(outcome)
                if outcome["exit"] != 0:
                    entry["killed_by"] = name
                    entry["first_failures"] = outcome["failed"][:3]
                    break
            shutil.rmtree(root)
            results.append(entry)
            verdict = f"KILLED by {entry['killed_by']}: {entry['first_failures'][:2]}" if entry["killed_by"] else "SURVIVED every group (including the pre-existing suite)"
            print(f"{mutation.id:45} {verdict}", flush=True)
    finally:
        shutil.rmtree(scratch, ignore_errors=True)
    killed = [r for r in results if r["killed_by"]]
    survivors = [r["id"] for r in results if not r["killed_by"]]
    print(f"\n{len(killed)}/{len(results)} mutations killed; survivors: {survivors or 'none'}")
    by_group = {}
    for entry in killed:
        by_group.setdefault(entry["killed_by"], []).append(entry["id"])
    print("killed first by:", json.dumps(by_group, indent=1))
    if options.report:
        Path(options.report).write_text(json.dumps({"results": results, "survivors": survivors}, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
