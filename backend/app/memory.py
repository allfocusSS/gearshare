"""Real process-local memory storage; no database, ORM or filesystem state."""

from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import date, timedelta
from threading import Lock

from app.domain import Asset, RESERVING_STATES, ScheduledReservation, Session, User
from app.repositories import GearShareTransaction, UsernameTaken


@dataclass
class _State:
    users: dict[str, User] = field(default_factory=dict)
    usernames: dict[str, str] = field(default_factory=dict)
    sessions: dict[str, Session] = field(default_factory=dict)
    assets: dict[str, Asset] = field(default_factory=dict)
    inventory_codes: dict[str, str] = field(default_factory=dict)
    schedules: dict[str, ScheduledReservation] = field(default_factory=dict)
    seeded_on: date | None = None

    def copy(self) -> "_State":
        # Records are immutable, so shallow dictionary copies isolate all mutations.
        return _State(
            self.users.copy(), self.usernames.copy(), self.sessions.copy(),
            self.assets.copy(), self.inventory_codes.copy(), self.schedules.copy(), self.seeded_on,
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
        # One source of scheduled truth in #8. #9 replaces these trusted
        # projections with real booking/slot records behind this same interface.
        days = set()
        for reservation in self.state.schedules.values():
            if reservation.asset_id != asset_id or reservation.state not in RESERVING_STATES:
                continue
            first, last = max(start, reservation.start_date), min(end, reservation.end_date)
            days.update(first + timedelta(days=offset) for offset in range((last - first).days + 1))
        return frozenset(days)

    def add_asset(self, asset: Asset) -> None:
        code = asset.inventory_code.upper()
        if asset.id in self.state.assets or code in self.state.inventory_codes:
            raise ValueError("Duplicate asset identity or inventory code")
        self.state.assets[asset.id] = asset
        self.state.inventory_codes[code] = asset.id

    def add_scheduled_reservation(self, reservation: ScheduledReservation) -> None:
        if reservation.id in self.state.schedules or reservation.asset_id not in self.state.assets:
            raise ValueError("Invalid scheduled reservation reference")
        if reservation.start_date > reservation.end_date:
            raise ValueError("Invalid scheduled reservation dates")
        if reservation.state in RESERVING_STATES and self.occupied_days(
            reservation.asset_id, reservation.start_date, reservation.end_date,
        ):
            raise ValueError("Overlapping scheduled reservation")
        self.state.schedules[reservation.id] = reservation

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
