"""Real process-local memory storage; no database, ORM or filesystem state."""

from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import date, timedelta
from threading import Lock

from app.domain import ActiveLoan, Asset, Booking, BookingEvent, RESERVING_STATES, ReservationSlot, Session, User
from app.repositories import GearShareTransaction, UsernameTaken


@dataclass
class _State:
    users: dict[str, User] = field(default_factory=dict)
    usernames: dict[str, str] = field(default_factory=dict)
    sessions: dict[str, Session] = field(default_factory=dict)
    assets: dict[str, Asset] = field(default_factory=dict)
    inventory_codes: dict[str, str] = field(default_factory=dict)
    bookings: dict[str, Booking] = field(default_factory=dict)
    events: dict[str, BookingEvent] = field(default_factory=dict)
    slots: dict[tuple[str, date], ReservationSlot] = field(default_factory=dict)
    active_loans: dict[str, ActiveLoan] = field(default_factory=dict)
    seeded_on: date | None = None

    def copy(self) -> "_State":
        # Records are immutable, so shallow dictionary copies isolate all mutations.
        return _State(
            self.users.copy(), self.usernames.copy(), self.sessions.copy(),
            self.assets.copy(), self.inventory_codes.copy(), self.bookings.copy(),
            self.events.copy(), self.slots.copy(), self.active_loans.copy(), self.seeded_on,
        )


class _Transaction:
    def __init__(self, state: _State) -> None:
        self.state = state

    def user_by_username(self, username: str) -> User | None:
        user_id = self.state.usernames.get(username)
        return self.state.users.get(user_id) if user_id is not None else None

    def user_by_id(self, user_id: str) -> User | None:
        return self.state.users.get(user_id)

    def add_user(self, user: User) -> None:
        if user.username in self.state.usernames:
            raise UsernameTaken()
        if user.id in self.state.users:
            raise ValueError("Duplicate user identifier")
        self.state.users[user.id] = user
        self.state.usernames[user.username] = user.id

    def session_by_hash(self, token_hash: str) -> Session | None:
        return self.state.sessions.get(token_hash)

    def add_session(self, session: Session) -> None:
        if session.token_hash in self.state.sessions or session.user_id not in self.state.users:
            raise ValueError("Invalid session reference")
        if session.expires_at.utcoffset() != timedelta(0):
            raise ValueError("Session expiry must be timezone-aware UTC")
        self.state.sessions[session.token_hash] = session

    def delete_session(self, token_hash: str) -> None:
        del self.state.sessions[token_hash]

    def assets(self) -> tuple[Asset, ...]:
        # Dictionary insertion order is the stable creation/seed order.
        return tuple(self.state.assets.values())

    def asset_by_id(self, asset_id: str) -> Asset | None:
        return self.state.assets.get(asset_id)

    def occupied_days(self, asset_id: str, start: date, end: date) -> frozenset[date]:
        # The same actual day slots arbitrate booking allocation and public reads.
        return frozenset(day for unit, day in self.state.slots if unit == asset_id and start <= day <= end)

    def add_asset(self, asset: Asset) -> None:
        code = asset.inventory_code.upper()
        if asset.id in self.state.assets or code in self.state.inventory_codes:
            raise ValueError("Duplicate asset identity or inventory code")
        self.state.assets[asset.id] = asset
        self.state.inventory_codes[code] = asset.id

    def bookings(self) -> tuple[Booking, ...]:
        return tuple(self.state.bookings.values())

    def booking_by_id(self, booking_id: str) -> Booking | None:
        return self.state.bookings.get(booking_id)

    def _check_booking(self, booking: Booking) -> None:
        if booking.asset_id not in self.state.assets or booking.user_id not in self.state.users:
            raise ValueError("Invalid booking reference")
        if booking.start_date > booking.end_date or booking.version < 1:
            raise ValueError("Invalid booking dates or version")
        if any(value.utcoffset() != timedelta(0) for value in (booking.created_at, booking.updated_at)):
            raise ValueError("Booking timestamps must be timezone-aware UTC")

    def add_booking(self, booking: Booking) -> None:
        self._check_booking(booking)
        if booking.id in self.state.bookings:
            raise ValueError("Duplicate booking identifier")
        self.state.bookings[booking.id] = booking

    def replace_booking(self, booking: Booking) -> None:
        self._check_booking(booking)
        if booking.id not in self.state.bookings:
            raise ValueError("Unknown booking identifier")
        self.state.bookings[booking.id] = booking

    def booking_events(self, booking_id: str) -> tuple[BookingEvent, ...]:
        return tuple(event for event in self.state.events.values() if event.booking_id == booking_id)

    def add_booking_event(self, event: BookingEvent) -> None:
        if event.id in self.state.events or event.booking_id not in self.state.bookings or event.actor_id not in self.state.users:
            raise ValueError("Invalid booking event reference")
        if event.timestamp.utcoffset() != timedelta(0):
            raise ValueError("Event timestamp must be timezone-aware UTC")
        self.state.events[event.id] = event

    def add_slot(self, slot: ReservationSlot) -> None:
        booking = self.booking_by_id(slot.booking_id)
        if booking is None or booking.asset_id != slot.asset_id or booking.state not in RESERVING_STATES:
            raise ValueError("Invalid reservation slot reference")
        if not booking.start_date <= slot.day <= booking.end_date:
            raise ValueError("Reservation slot outside booked dates")
        key = slot.asset_id, slot.day
        if key in self.state.slots:
            raise ValueError("Duplicate reserved day")
        self.state.slots[key] = slot

    def release_slots(self, booking_id: str) -> None:
        self.state.slots = {key: slot for key, slot in self.state.slots.items() if slot.booking_id != booking_id}

    def add_active_loan(self, loan: ActiveLoan) -> None:
        booking = self.booking_by_id(loan.booking_id)
        if booking is None or booking.asset_id != loan.asset_id or booking.state != "checked_out":
            raise ValueError("Invalid active loan reference")
        if loan.asset_id in self.state.active_loans or any(existing.booking_id == loan.booking_id for existing in self.state.active_loans.values()):
            raise ValueError("Duplicate active loan")
        self.state.active_loans[loan.asset_id] = loan

    def catalogue_seeded_on(self) -> date | None:
        return self.state.seeded_on

    def mark_catalogue_seeded(self, today: date) -> None:
        if self.state.seeded_on is not None:
            raise ValueError("Catalogue already seeded")
        self.state.seeded_on = today


class MemoryRepository:
    def __init__(self) -> None:
        self._lock = Lock()
        self._state = _State()

    @contextmanager
    def transaction(self) -> Iterator[GearShareTransaction]:
        # The lock covers every read/check/write in a complete service operation.
        # Publish once on success; an exception leaves the original state untouched.
        with self._lock:
            transaction = _Transaction(self._state.copy())
            yield transaction
            # Copy again so a retained transaction cannot mutate published storage.
            self._state = transaction.state.copy()


# Keep #7's import/setup boundary compatible; this is the same store and lock.
MemoryAuthRepository = MemoryRepository
