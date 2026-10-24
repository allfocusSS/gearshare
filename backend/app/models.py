"""ORM schema only; public records remain in app.domain.

UTCDateTime stores naive UTC in the database and restores aware UTC on reads.
Internal integer ordering preserves insertion order even when clocks are equal.
"""

from datetime import UTC, date, datetime, timedelta

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, ForeignKeyConstraint, Integer, String, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.types import TypeDecorator


class UTCDateTime(TypeDecorator[datetime]):
    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is not None:
            if value.utcoffset() != timedelta(0):
                raise ValueError("Timestamp must be timezone-aware UTC")
            return value.astimezone(UTC).replace(tzinfo=None)
        return None

    def process_result_value(self, value, dialect):
        return value.replace(tzinfo=UTC) if value is not None else None


class Base(DeclarativeBase):
    pass


class UserModel(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    username: Mapped[str] = mapped_column(String, unique=True)
    password_hash: Mapped[str] = mapped_column(String)
    role: Mapped[str] = mapped_column(String)
    __table_args__ = (CheckConstraint("role IN ('student', 'coordinator')", name="user_role"),)


class SessionModel(Base):
    __tablename__ = "sessions"
    token_hash: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime())


class AssetModel(Base):
    __tablename__ = "assets"
    storage_order: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id: Mapped[str] = mapped_column(String, unique=True)
    inventory_code: Mapped[str] = mapped_column(String)
    inventory_code_key: Mapped[str] = mapped_column(String, unique=True)
    name: Mapped[str] = mapped_column(String)
    category: Mapped[str] = mapped_column(String)
    description: Mapped[str] = mapped_column(String)
    location: Mapped[str] = mapped_column(String)
    state: Mapped[str] = mapped_column(String)
    availability_version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    __table_args__ = (
        CheckConstraint("state IN ('active', 'maintenance')", name="asset_state"),
        CheckConstraint("category IN ('Cameras', 'Audio', 'Presentation', 'Accessories')", name="asset_category"),
        CheckConstraint("availability_version >= 1", name="asset_availability_version"),
    )


class BookingModel(Base):
    __tablename__ = "bookings"
    storage_order: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id: Mapped[str] = mapped_column(String, unique=True)
    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id"), index=True)
    asset_name: Mapped[str] = mapped_column(String)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    purpose: Mapped[str] = mapped_column(String)
    state: Mapped[str] = mapped_column(String)
    version: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime())
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime())
    __table_args__ = (
        CheckConstraint("end_date >= start_date", name="booking_dates"),
        CheckConstraint("version >= 1", name="booking_version"),
        CheckConstraint("state IN ('pending', 'approved', 'checked_out', 'rejected', 'cancelled', 'returned')", name="booking_state"),
        UniqueConstraint("asset_id", "id", name="booking_asset_reference"),
    )


class ReservationSlotModel(Base):
    __tablename__ = "reservation_slots"
    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id"), primary_key=True)
    day: Mapped[date] = mapped_column(Date, primary_key=True)
    booking_id: Mapped[str] = mapped_column(String, index=True)
    __table_args__ = (ForeignKeyConstraint(["asset_id", "booking_id"], ["bookings.asset_id", "bookings.id"]),)


class ActiveLoanModel(Base):
    __tablename__ = "active_loans"
    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id"), primary_key=True)
    booking_id: Mapped[str] = mapped_column(String, unique=True)
    __table_args__ = (ForeignKeyConstraint(["asset_id", "booking_id"], ["bookings.asset_id", "bookings.id"]),)


class BookingEventModel(Base):
    __tablename__ = "booking_events"
    storage_order: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id: Mapped[str] = mapped_column(String, unique=True)
    booking_id: Mapped[str] = mapped_column(ForeignKey("bookings.id"), index=True)
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String)
    prior_state: Mapped[str | None] = mapped_column(String, nullable=True)
    new_state: Mapped[str] = mapped_column(String)
    timestamp: Mapped[datetime] = mapped_column(UTCDateTime())
    note: Mapped[str] = mapped_column(String)
    __table_args__ = (
        CheckConstraint("action IN ('create', 'approve', 'reject', 'cancel', 'checkout', 'return')", name="event_action"),
        CheckConstraint("prior_state IS NULL OR prior_state IN ('pending', 'approved', 'checked_out', 'rejected', 'cancelled', 'returned')", name="event_prior_state"),
        CheckConstraint("new_state IN ('pending', 'approved', 'checked_out', 'rejected', 'cancelled', 'returned')", name="event_new_state"),
    )


class SeedMarkerModel(Base):
    __tablename__ = "seed_marker"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    seeded_on: Mapped[date] = mapped_column(Date)
    __table_args__ = (CheckConstraint("id = 1", name="singleton_seed_marker"),)
