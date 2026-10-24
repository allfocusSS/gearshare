"""#12: SQL and SQLite details stay in the storage adapter and its configuration.

AGENTS.md: "SQL dialect details belong only in the storage adapter. Domain logic uses
repository interfaces and ORM operations, not raw SQLite queries." This is a static
check over ``app/`` (AST for imports, text for names), plus a runtime check that the
default memory configuration does not even import SQLAlchemy. The checker is itself
tested against synthetic offenders so that it cannot pass vacuously.
"""

import ast
import re
import subprocess
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
APP = BACKEND / "app"
ADAPTER = {"database.py", "sqlalchemy_store.py"}  # engine/PRAGMA/error-code details live here only
ORM_MODULES = ADAPTER | {"models.py"}  # SQLAlchemy may be imported here only
RAW_SQL = re.compile(r"^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|PRAGMA|BEGIN|COMMIT|ROLLBACK|VACUUM)\b")
DIALECT_NAMES = re.compile(r"sqlite|pragma|sqlite_errorcode|sqlite_errorname|exec_driver_sql|OperationalError", re.IGNORECASE)
ORM_IMPORTS = {"sqlalchemy", "alembic", "sqlite3"}
ADAPTER_MODULES = {"app.sqlalchemy_store", "app.models", "app.database"}
pytestmark = pytest.mark.persistence


def violations(filename: str, source: str) -> list[str]:
    found = []
    tree = ast.parse(source)
    module_level = {id(node) for node in tree.body}
    for node in ast.walk(tree):
        names = []
        if isinstance(node, ast.Import):
            names = [alias.name for alias in node.names]
        elif isinstance(node, ast.ImportFrom):
            names = [node.module or ""]
        for name in names:
            if name.split(".")[0] in ORM_IMPORTS and filename not in ORM_MODULES:
                found.append(f"{filename}:{node.lineno} imports {name}")
            if name in ADAPTER_MODULES or (isinstance(node, ast.ImportFrom) and any(f"{node.module}.{alias.name}" in ADAPTER_MODULES for alias in node.names)):
                if filename not in ORM_MODULES and not (filename == "main.py" and id(node) not in module_level):
                    found.append(f"{filename}:{node.lineno} imports adapter module {name} at module level or outside main.py")
        if isinstance(node, ast.Constant) and isinstance(node.value, str) and RAW_SQL.match(node.value) and filename not in ADAPTER:
            found.append(f"{filename}:{node.lineno} raw SQL string {node.value[:30]!r}")
    if filename not in ADAPTER and filename != "main.py":
        for number, line in enumerate(source.splitlines(), 1):
            if DIALECT_NAMES.search(line):
                found.append(f"{filename}:{number} dialect-specific text {line.strip()[:50]!r}")
    if filename == "main.py":  # the only allowed mention is the documented store switch
        for number, line in enumerate(source.splitlines(), 1):
            if re.search(r"sqlite|pragma", line, re.IGNORECASE):
                found.append(f"{filename}:{number} dialect-specific text {line.strip()[:50]!r}")
    return found


def app_sources():
    return sorted(APP.glob("*.py"))


def test_no_dialect_specific_code_outside_the_storage_adapter_and_its_configuration():
    assert len(app_sources()) >= 20
    offenders = [item for path in app_sources() for item in violations(path.name, path.read_text())]
    assert offenders == [], "\n".join(offenders)


def test_the_adapter_modules_that_must_know_about_sqlite_really_are_the_only_ones_that_do():
    knowing = {path.name for path in app_sources() if re.search("sqlite", path.read_text(), re.IGNORECASE)}
    assert knowing == ADAPTER, knowing
    assert "sqlite" not in (APP / "models.py").read_text().lower(), "the ORM models stay dialect neutral"


@pytest.mark.parametrize("filename, source, expected", [
    ("bookings.py", "import sqlite3\n", "imports sqlite3"),
    ("bookings.py", "from sqlalchemy import select\n", "imports sqlalchemy"),
    ("staff.py", "def f(c):\n    c.execute('SELECT * FROM bookings')\n", "raw SQL string"),
    ("catalogue.py", "x = 'PRAGMA foreign_keys=ON'\n", "raw SQL string"),
    ("auth.py", "# the sqlite file is locked\n", "dialect-specific text"),
    ("api.py", "def f(e):\n    return e.orig.sqlite_errorcode\n", "dialect-specific text"),
    ("api.py", "from app.sqlalchemy_store import SQLAlchemyRepository\n", "imports adapter module"),
    ("main.py", "from app.sqlalchemy_store import SQLAlchemyRepository\n", "imports adapter module"),
    ("main.py", "def f():\n    x = 'sqlite:///x.db'\n", "dialect-specific text"),
    ("models.py", "import sqlite3\n", "dialect-specific text"),
    ("models.py", "x = 'SELECT 1'\n", "raw SQL string"),
])
def test_the_checker_catches_each_kind_of_leak(filename, source, expected):
    assert any(expected in item for item in violations(filename, source)), violations(filename, source)


@pytest.mark.parametrize("filename, source", [
    ("database.py", "from sqlalchemy import create_engine\nx = 'PRAGMA foreign_keys=ON'\n"),
    ("sqlalchemy_store.py", "from sqlalchemy.exc import OperationalError\nfrom app.models import X\nsqlite_errorcode = 1\n"),
    ("models.py", "from sqlalchemy.orm import Mapped\n"),
    ("main.py", "def f():\n    from app.sqlalchemy_store import SQLAlchemyRepository\n"),
    ("bookings.py", "import os\nfrom app.domain import Booking\n"),
])
def test_the_checker_accepts_the_allowed_homes(filename, source):
    assert violations(filename, source) == []


def test_default_memory_configuration_never_imports_sqlalchemy():
    code = ("import sys, os; os.environ.pop('GEARSHARE_STORE', None); import app.main; from fastapi.testclient import TestClient; "
            "c = TestClient(app.main.app); assert c.get('/health').status_code == 200; assert c.get('/api/v1/assets').status_code == 200; "
            "bad = sorted(m for m in sys.modules if m.split('.')[0] in ('sqlalchemy', 'alembic', 'sqlite3') or m in ('app.sqlalchemy_store', 'app.models', 'app.database')); "
            "assert not bad, bad")
    result = subprocess.run([sys.executable, "-c", code], cwd=BACKEND, capture_output=True, text=True, timeout=60)
    assert result.returncode == 0, result.stderr[-2000:]
