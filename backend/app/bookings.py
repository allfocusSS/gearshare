"""Private booking rules through one storage-independent transaction boundary."""

from collections.abc import Mapping
from dataclasses import replace
from datetime import date, timedelta
from uuid import uuid4

from app.auth import AuthService
from app.calendar import CLUB_ZONE, date_range
from app.catalogue import missing_asset
from app.conventions import Clock, ECMASCRIPT_TRIM, clock_instant, utc_now
from app.domain import Booking, BookingEvent, CANCEL_NOTE, ReservationSlot, User
from app.errors import ApiError
from app.repositories import BookingTransaction, GearShareRepository


def missing_booking() -> ApiError:
    return ApiError(404, "NOT_FOUND", "This reservation could not be found.")


def booking_input(body: Mapping[str, object], today: date) -> tuple[str, date, date, str]:
    """Aggregate every submitted field problem before any asset lookup."""
    fields = {}
    asset_id = body.get("assetId")
    if not isinstance(asset_id, str) or not 1 <= len(asset_id) <= 100 or _surrogates(asset_id):
        fields["assetId"] = "Choose a physical unit with a valid identifier."
    start, end = body.get("startDate"), body.get("endDate")
    # Catalogue's optional empty pair differs from a required booking date pair.
    if not isinstance(start, str) or not start:
        fields["startDate"] = "Choose a valid start date."
    if not isinstance(end, str) or not end:
        fields["endDate"] = "Choose a valid end date."
    try:
        selected = date_range(start if isinstance(start, str) else None, end if isinstance(end, str) else None, today)
    except ApiError as error:
        fields.update(error.fields or {})
        selected = None
    purpose = body.get("purpose")
    trimmed = purpose.strip(ECMASCRIPT_TRIM) if isinstance(purpose, str) else ""
    if not 5 <= len(trimmed) <= 500 or _surrogates(trimmed):
        fields["purpose"] = "Use 5–500 Unicode code points for the purpose."
    if fields:
        raise ApiError(422, "VALIDATION_ERROR", "Check the highlighted fields.", fields=fields)
    assert selected is not None
    return asset_id, *selected, trimmed


def _surrogates(value: str) -> bool:
    return any(0xD800 <= ord(character) <= 0xDFFF for character in value)


def _visible(transaction: BookingTransaction, booking_id: str, actor: User) -> Booking:
    booking = transaction.booking_by_id(booking_id)
    if booking is None or (booking.user_id != actor.id and actor.role != "coordinator"):
        raise missing_booking()
    return booking


def check_version(body: Mapping[str, object], booking: Booking) -> None:
    version = body.get("expectedVersion")
    # json.loads preserves a fraction/exponent as float, including 2.0/2e0.
    if type(version) is not int or not 1 <= version <= 2147483647:
        raise ApiError(422, "VALIDATION_ERROR", "Check the highlighted fields.", fields={"expectedVersion": "Send the positive integer version of the reservation snapshot you acted on."})
    if version != booking.version:
        raise ApiError(409, "CONFLICT", "This reservation changed. Re-read it before continuing.", fields={"expectedVersion": "Use the version of a fresh reservation snapshot."})


class BookingService:
    def __init__(self, repository: GearShareRepository, auth: AuthService, clock: Clock = utc_now) -> None:
        self.repository = repository
        self.auth = auth
        self.clock = clock

    def request_booking(self, token: str, body: Mapping[str, object]) -> dict:
        with self.repository.transaction() as transaction:
            actor = self.auth.identity(transaction, token)
            instant = clock_instant(self.clock)
            asset_id, start, end, purpose = booking_input(body, instant.astimezone(CLUB_ZONE).date())
            asset = transaction.asset_by_id(asset_id)
            if asset is None:
                raise missing_asset()
            if asset.state == "maintenance":
                raise ApiError(409, "CONFLICT", "This equipment is in maintenance.", unavailable_dates=[])
            occupied = transaction.occupied_days(asset_id, start, end)
            if occupied:
                raise ApiError(
                    409, "CONFLICT", "Some requested dates are unavailable. Refresh availability and choose other dates.",
                    unavailable_dates=[day.isoformat() for day in sorted(occupied)],
                )
            booking = Booking(str(uuid4()), asset_id, asset.name, actor.id, start, end, purpose, "pending", 1, instant, instant)
            transaction.add_booking(booking)
            transaction.add_booking_event(BookingEvent(str(uuid4()), booking.id, actor.id, "create", None, "pending", instant, purpose))
            for offset in range((end - start).days + 1):
                transaction.add_slot(ReservationSlot(asset_id, start + timedelta(days=offset), booking.id))
            return booking.private(transaction.booking_events(booking.id))

    def list_bookings(self, token: str) -> list[dict]:
        with self.repository.transaction() as transaction:
            actor = self.auth.identity(transaction, token)
            return [booking.private(transaction.booking_events(booking.id)) for booking in transaction.bookings() if booking.user_id == actor.id]

    def get_booking(self, token: str, booking_id: str) -> dict:
        with self.repository.transaction() as transaction:
            actor = self.auth.identity(transaction, token)
            booking = _visible(transaction, booking_id, actor)
            return booking.private(transaction.booking_events(booking.id))

    def cancel_booking(self, token: str, booking_id: str, body: Mapping[str, object]) -> dict:
        with self.repository.transaction() as transaction:
            actor = self.auth.identity(transaction, token)
            booking = _visible(transaction, booking_id, actor)
            check_version(body, booking)
            if booking.state not in {"pending", "approved"}:
                raise ApiError(409, "CONFLICT", "This reservation cannot be cancelled in its current state.")
            instant = clock_instant(self.clock)
            cancelled = replace(booking, state="cancelled", version=booking.version + 1, updated_at=instant)
            transaction.replace_booking(cancelled)
            transaction.add_booking_event(BookingEvent(str(uuid4()), booking.id, actor.id, "cancel", booking.state, "cancelled", instant, CANCEL_NOTE))
            transaction.release_slots(booking.id)
            return cancelled.private(transaction.booking_events(booking.id))
