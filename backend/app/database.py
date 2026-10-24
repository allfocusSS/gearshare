"""Database infrastructure; SQLite settings do not escape this adapter boundary."""

import os
from dataclasses import dataclass

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.engine import make_url


@dataclass(frozen=True)
class DatabaseSettings:
    url: str = "sqlite:///./gearshare.sqlite3"
    busy_timeout_seconds: float = 5.0

    @classmethod
    def from_environment(cls):
        return cls(
            os.environ.get("GEARSHARE_DATABASE_URL", cls.url),
            float(os.environ.get("GEARSHARE_SQLITE_BUSY_TIMEOUT", "5")),
        )


def make_engine(settings: DatabaseSettings) -> Engine:
    if not 0 < settings.busy_timeout_seconds <= 30:
        raise ValueError("SQLite busy timeout must be greater than 0 and at most 30 seconds")
    sqlite = make_url(settings.url).get_backend_name() == "sqlite"
    options = {"connect_args": {"timeout": settings.busy_timeout_seconds, "check_same_thread": False}} if sqlite else {}
    engine = create_engine(settings.url, hide_parameters=True, **options)
    if sqlite:
        @event.listens_for(engine, "connect")
        def configure_sqlite(connection, _record):
            # Python 3.12 legacy transaction mode otherwise does not begin on
            # SELECT/DDL. Let SQLAlchemy begin all snapshots explicitly.
            connection.isolation_level = None
            cursor = connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

        @event.listens_for(engine, "begin")
        def begin_sqlite(connection):
            connection.exec_driver_sql("BEGIN")
    return engine
