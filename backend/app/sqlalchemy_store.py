"""Transactional ORM adapter. SQLite error details/settings stay in infrastructure.

Every operation uses a fresh session and immutable domain projections. Conditional
updates and unique database keys arbitrate races across repository instances;
there is no process-local lock and no copied dictionary standing in for storage.
"""

from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import asdict
from datetime import date, timedelta

from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session as ORMSession

from app.database import DatabaseSettings, make_engine
from app.domain import ActiveLoan, Asset, Booking, BookingEvent, ReservationSlot, Session, User, RESERVING_STATES
from app.models import (ActiveLoanModel, AssetModel, BookingEventModel, BookingModel,
                        ReservationSlotModel, SeedMarkerModel, SessionModel, UserModel)
from app.repositories import GearShareTransaction, InventoryCodeTaken, TransactionRetry, UsernameTaken
from app.text import default_upper


def _unique(error: IntegrityError, *columns: str) -> bool:
    # Narrowly recognize the tested SQLite unique-key failures. FK/CHECK/NOT
    # NULL faults, and unrecognized DB failures, remain unexpected exceptions.
    return (
        getattr(error.orig, "sqlite_errorname", "") in {"SQLITE_CONSTRAINT_UNIQUE", "SQLITE_CONSTRAINT_PRIMARYKEY"}
        and str(error.orig) == "UNIQUE constraint failed: " + ", ".join(columns)
    )


def _busy(error: OperationalError) -> bool:
    return (getattr(error.orig, "sqlite_errorcode", -1) & 255) in {5, 6}


def _record(model, record_type):
    return record_type(**{name: getattr(model, name) for name in record_type.__dataclass_fields__}) if model is not None else None


class _Transaction:
    def __init__(self, session: ORMSession) -> None:
        self.session = session
        self._assets: dict[str, tuple[Asset, int]] = {}
        self._bookings: dict[str, Booking] = {}

    def user_by_username(self, username: str) -> User | None:
        return _record(self.session.scalar(select(UserModel).where(UserModel.username == username)), User)

    def user_by_id(self, user_id: str) -> User | None:
        return _record(self.session.get(UserModel, user_id), User)

    def add_user(self, user: User) -> None:
        self.session.add(UserModel(**asdict(user)))
        try:
            self.session.flush()
        except IntegrityError as error:
            if _unique(error, "users.username"):
                raise UsernameTaken() from None
            raise

    def session_by_hash(self, token_hash: str) -> Session | None:
        return _record(self.session.get(SessionModel, token_hash), Session)

    def add_session(self, session: Session) -> None:
        self.session.add(SessionModel(**asdict(session)))
        self.session.flush()

    def delete_session(self, token_hash: str) -> None:
        self.session.execute(delete(SessionModel).where(SessionModel.token_hash == token_hash))

    def assets(self) -> tuple[Asset, ...]:
        models = self.session.scalars(select(AssetModel).order_by(AssetModel.storage_order)).all()
        for model in models:
            self._assets[model.id] = (_record(model, Asset), model.availability_version)
        return tuple(self._assets[model.id][0] for model in models)

    def asset_by_id(self, asset_id: str) -> Asset | None:
        if asset_id not in self._assets:
            model = self.session.scalar(select(AssetModel).where(AssetModel.id == asset_id))
            if model is None:
                return None
            self._assets[asset_id] = (_record(model, Asset), model.availability_version)
        return self._assets[asset_id][0]

    def occupied_days(self, asset_id: str, start: date, end: date) -> frozenset[date]:
        return frozenset(self.session.scalars(select(ReservationSlotModel.day).where(
            ReservationSlotModel.asset_id == asset_id, ReservationSlotModel.day >= start, ReservationSlotModel.day <= end,
        )))

    def add_asset(self, asset: Asset) -> None:
        self.session.add(AssetModel(**asdict(asset), inventory_code_key=default_upper(asset.inventory_code)))
        try:
            self.session.flush()
        except IntegrityError as error:
            if _unique(error, "assets.inventory_code_key"):
                raise InventoryCodeTaken() from None
            raise
        self._assets[asset.id] = (asset, 1)

    def _claim_asset(self, asset_id: str, replacement: Asset | None = None) -> None:
        previous = self.asset_by_id(asset_id)
        if previous is None:
            raise ValueError("Unknown asset identifier")
        _, version = self._assets[asset_id]
        values = asdict(replacement) if replacement is not None else {}
        if replacement is not None:
            values["inventory_code_key"] = default_upper(replacement.inventory_code)
        values["availability_version"] = version + 1
        try:
            result = self.session.execute(update(AssetModel).where(
                AssetModel.id == asset_id, AssetModel.availability_version == version, AssetModel.state == previous.state,
            ).values(**values).execution_options(synchronize_session=False))
        except IntegrityError as error:
            if _unique(error, "assets.inventory_code_key"):
                raise InventoryCodeTaken() from None
            raise
        if result.rowcount != 1:
            raise TransactionRetry()
        self._assets[asset_id] = (replacement or previous, version + 1)

    def replace_asset(self, asset: Asset) -> None:
        self._claim_asset(asset.id, asset)

    def bookings(self) -> tuple[Booking, ...]:
        records = tuple(_record(model, Booking) for model in self.session.scalars(select(BookingModel).order_by(BookingModel.storage_order)))
        self._bookings.update({record.id: record for record in records})
        return records

    def booking_by_id(self, booking_id: str) -> Booking | None:
        if booking_id not in self._bookings:
            record = _record(self.session.scalar(select(BookingModel).where(BookingModel.id == booking_id)), Booking)
            if record is None:
                return None
            self._bookings[booking_id] = record
        return self._bookings[booking_id]

    def _check_booking(self, booking: Booking) -> None:
        if booking.start_date > booking.end_date or booking.version < 1:
            raise ValueError("Invalid booking dates or version")
        if any(value.utcoffset() != timedelta(0) for value in (booking.created_at, booking.updated_at)):
            raise ValueError("Booking timestamps must be timezone-aware UTC")

    def add_booking(self, booking: Booking) -> None:
        self._check_booking(booking)
        self._claim_asset(booking.asset_id)
        self.session.add(BookingModel(**asdict(booking)))
        self.session.flush()
        self._bookings[booking.id] = booking

    def replace_booking(self, booking: Booking) -> None:
        self._check_booking(booking)
        previous = self.booking_by_id(booking.id)
        if previous is None or booking.version != previous.version + 1:
            raise ValueError("Invalid booking replacement")
        result = self.session.execute(update(BookingModel).where(
            BookingModel.id == booking.id, BookingModel.version == previous.version, BookingModel.state == previous.state,
        ).values(**asdict(booking)).execution_options(synchronize_session=False))
        if result.rowcount != 1:
            raise TransactionRetry()
        self._claim_asset(booking.asset_id)
        self._bookings[booking.id] = booking

    def booking_events(self, booking_id: str) -> tuple[BookingEvent, ...]:
        return tuple(_record(model, BookingEvent) for model in self.session.scalars(
            select(BookingEventModel).where(BookingEventModel.booking_id == booking_id).order_by(BookingEventModel.storage_order)
        ))

    def add_booking_event(self, event: BookingEvent) -> None:
        self.session.add(BookingEventModel(**asdict(event)))
        self.session.flush()

    def add_slot(self, slot: ReservationSlot) -> None:
        booking = self.booking_by_id(slot.booking_id)
        if (booking is None or booking.asset_id != slot.asset_id or booking.state not in RESERVING_STATES
                or not booking.start_date <= slot.day <= booking.end_date):
            raise ValueError("Invalid reservation slot reference")
        self.session.add(ReservationSlotModel(**asdict(slot)))
        try:
            self.session.flush()
        except IntegrityError as error:
            if _unique(error, "reservation_slots.asset_id", "reservation_slots.day"):
                # A fresh operation computes only anonymous unavailable dates.
                raise TransactionRetry() from None
            raise

    def release_slots(self, booking_id: str) -> None:
        self.session.execute(delete(ReservationSlotModel).where(ReservationSlotModel.booking_id == booking_id))

    def active_loan_by_asset(self, asset_id: str) -> ActiveLoan | None:
        return _record(self.session.get(ActiveLoanModel, asset_id), ActiveLoan)

    def add_active_loan(self, loan: ActiveLoan) -> None:
        booking = self.booking_by_id(loan.booking_id)
        if booking is None or booking.asset_id != loan.asset_id or booking.state != "checked_out":
            raise ValueError("Invalid active loan reference")
        self.session.add(ActiveLoanModel(**asdict(loan)))
        try:
            self.session.flush()
        except IntegrityError as error:
            if _unique(error, "active_loans.asset_id") or _unique(error, "active_loans.booking_id"):
                raise TransactionRetry() from None
            raise

    def remove_active_loan(self, asset_id: str, booking_id: str) -> None:
        result = self.session.execute(delete(ActiveLoanModel).where(
            ActiveLoanModel.asset_id == asset_id, ActiveLoanModel.booking_id == booking_id,
        ))
        if result.rowcount != 1:
            raise ValueError("Invalid active loan release")

    def catalogue_seeded_on(self) -> date | None:
        model = self.session.get(SeedMarkerModel, 1)
        return model.seeded_on if model is not None else None

    def mark_catalogue_seeded(self, today: date) -> None:
        self.session.add(SeedMarkerModel(id=1, seeded_on=today))
        try:
            self.session.flush()
        except IntegrityError as error:
            if _unique(error, "seed_marker.id"):
                raise TransactionRetry() from None
            raise


class SQLAlchemyRepository:
    def __init__(self, settings: DatabaseSettings | None = None) -> None:
        self.engine = make_engine(settings or DatabaseSettings.from_environment())

    @contextmanager
    def transaction(self) -> Iterator[GearShareTransaction]:
        try:
            with ORMSession(self.engine, expire_on_commit=False, close_resets_only=False) as session, session.begin():
                yield _Transaction(session)
        except OperationalError as error:
            if _busy(error):
                raise TransactionRetry() from None
            raise

    def close(self) -> None:
        self.engine.dispose()
