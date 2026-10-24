"""File-backed migrated-schema checks, independent of future service wiring."""

from datetime import UTC, date, datetime, timedelta, timezone
from pathlib import Path

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import inspect, select
from sqlalchemy.exc import IntegrityError, StatementError
from sqlalchemy.orm import Session

from app.database import DatabaseSettings, make_engine
from app.models import (ActiveLoanModel, AssetModel, Base, BookingEventModel, BookingModel,
                        ReservationSlotModel, SeedMarkerModel, SessionModel, UserModel)

NOW = datetime(2026, 10, 23, 22, 30, 12, 345678, UTC)
DAY = date(2026, 10, 24)


def migration_config(url):
    config = Config(str(Path(__file__).parents[1] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", url)
    return config


@pytest.fixture
def database(tmp_path):
    url = f"sqlite:///{tmp_path / 'schema.sqlite3'}"
    config = migration_config(url)
    command.upgrade(config, "head")
    engine = make_engine(DatabaseSettings(url))
    yield engine, config
    engine.dispose()


def asset(identifier="a", code="CAM-001"):
    return AssetModel(id=identifier, inventory_code=code, inventory_code_key=code.upper(),
                      name="Camera", category="Cameras", description="Fictional kit", location="Desk", state="active")


def booking(identifier="b", asset_id="a", **changes):
    values = dict(id=identifier, asset_id=asset_id, asset_name="Camera", user_id="u", start_date=DAY,
                  end_date=DAY, purpose="Club filming", state="checked_out", version=3, created_at=NOW, updated_at=NOW)
    values.update(changes)
    return BookingModel(**values)


def seed(engine):
    with Session(engine) as session, session.begin():
        session.add(UserModel(id="u", username="student", role="student", password_hash="trusted-test-hash"))
        session.add_all([asset(), asset("a2", "CAM-002")])
        session.flush()
        session.add_all([booking(), booking("b2"), booking("b3", "a2")])
        session.flush()
        session.add(SessionModel(token_hash="opaque-hash", user_id="u", expires_at=NOW))
        session.add(ReservationSlotModel(asset_id="a", day=DAY, booking_id="b"))
        session.add(ActiveLoanModel(asset_id="a", booking_id="b"))
        session.add(BookingEventModel(id="event", booking_id="b", actor_id="u", action="checkout",
                                     prior_state="approved", new_state="checked_out", timestamp=NOW, note="Complete kit"))
        session.add(SeedMarkerModel(id=1, seeded_on=DAY))


def test_migration_clean_downgrade_reupgrade_and_no_model_drift(database):
    engine, config = database
    assert set(inspect(engine).get_table_names()) == set(Base.metadata.tables) | {"alembic_version"}
    with engine.connect() as connection:
        assert compare_metadata(MigrationContext.configure(connection), Base.metadata) == []
    seed(engine)
    command.downgrade(config, "base")
    assert inspect(engine).get_table_names() == ["alembic_version"]
    command.upgrade(config, "head")
    seed(engine)
    with Session(engine) as session:
        assert session.scalar(select(UserModel)).username == "student"


def test_utc_and_local_date_roundtrip_after_engine_reopen(database):
    engine, _ = database
    seed(engine)
    url = str(engine.url)
    engine.dispose()
    reopened = make_engine(DatabaseSettings(url))
    try:
        with Session(reopened) as session:
            stored = session.scalar(select(BookingModel).where(BookingModel.id == "b"))
            assert stored.created_at == stored.updated_at == NOW
            assert stored.created_at.tzinfo is UTC
            assert stored.start_date == stored.end_date == DAY
            assert type(stored.start_date) is date
            assert session.get(SessionModel, "opaque-hash").expires_at == NOW
            assert session.scalar(select(BookingEventModel)).timestamp == NOW
            assert session.get(SeedMarkerModel, 1).seeded_on == DAY
    finally:
        reopened.dispose()


@pytest.mark.parametrize("duplicate", [
    lambda: UserModel(id="other", username="student", role="student", password_hash="another-hash"),
    lambda: SessionModel(token_hash="opaque-hash", user_id="u", expires_at=NOW),
    lambda: asset("other", "CAM-001"),
    lambda: ReservationSlotModel(asset_id="a", day=DAY, booking_id="b2"),
    lambda: ActiveLoanModel(asset_id="a", booking_id="b2"),
    lambda: ActiveLoanModel(asset_id="a2", booking_id="b"),
    lambda: BookingEventModel(id="event", booking_id="b", actor_id="u", action="checkout", prior_state="approved",
                              new_state="checked_out", timestamp=NOW, note="Complete kit"),
    lambda: SeedMarkerModel(id=1, seeded_on=DAY),
], ids=["username", "token-hash", "inventory-code", "asset-day", "custody-asset", "custody-booking", "event-id", "seed-once"])
def test_database_uniqueness_cannot_be_bypassed(database, duplicate):
    engine, _ = database
    seed(engine)
    with pytest.raises(IntegrityError), Session(engine) as session, session.begin():
        session.add(duplicate())
        session.flush()
    with Session(engine) as session:
        assert len(session.scalars(select(BookingModel)).all()) == 3
        assert len(session.scalars(select(ActiveLoanModel)).all()) == 1
        assert session.get(UserModel, "u").password_hash == "trusted-test-hash"


@pytest.mark.parametrize("invalid", [
    lambda: booking("invalid", version=0),
    lambda: booking("invalid", state="unknown"),
    lambda: booking("invalid", start_date=DAY + timedelta(days=1)),
    lambda: ReservationSlotModel(asset_id="a2", day=DAY, booking_id="b"),
    lambda: SessionModel(token_hash="unknown-owner", user_id="missing", expires_at=NOW),
    lambda: SeedMarkerModel(id=2, seeded_on=DAY),
], ids=["positive-version", "state-enum", "date-order", "slot-asset-reference", "session-owner-reference", "singleton-marker"])
def test_schema_rejects_invalid_state_and_references(database, invalid):
    engine, _ = database
    seed(engine)
    with pytest.raises(IntegrityError), Session(engine) as session, session.begin():
        session.add(invalid())
        session.flush()


@pytest.mark.parametrize("instant", [NOW.replace(tzinfo=None), NOW.astimezone(timezone(timedelta(hours=5)))])
def test_timestamp_rejects_naive_and_non_utc(database, instant):
    engine, _ = database
    seed(engine)
    with pytest.raises(StatementError, match="timezone-aware UTC"), Session(engine) as session, session.begin():
        session.add(SessionModel(token_hash="invalid-timestamp", user_id="u", expires_at=instant))
        session.flush()


def test_schema_rolls_back_all_partial_orm_writes(database):
    engine, _ = database
    seed(engine)
    with pytest.raises(IntegrityError), Session(engine) as session, session.begin():
        session.add(booking("rollback"))
        session.flush()
        session.add(ReservationSlotModel(asset_id="a", day=DAY + timedelta(days=1), booking_id="rollback"))
        session.flush()
        session.add(ReservationSlotModel(asset_id="a", day=DAY, booking_id="rollback"))
        session.flush()
    with Session(engine) as session:
        assert session.scalar(select(BookingModel).where(BookingModel.id == "rollback")) is None
        assert session.get(ReservationSlotModel, ("a", DAY + timedelta(days=1))) is None


def test_database_configuration_is_explicit_and_bounded(monkeypatch):
    monkeypatch.setenv("GEARSHARE_DATABASE_URL", "sqlite:///example.sqlite3")
    monkeypatch.setenv("GEARSHARE_SQLITE_BUSY_TIMEOUT", "2.5")
    assert DatabaseSettings.from_environment() == DatabaseSettings("sqlite:///example.sqlite3", 2.5)
    for timeout in (0, -1, 31, float("inf"), float("nan")):
        with pytest.raises(ValueError):
            make_engine(DatabaseSettings(busy_timeout_seconds=timeout))
