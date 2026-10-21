"""Atomic repository boundary, shared by the memory stage and future ORM adapter."""

from contextlib import AbstractContextManager
from datetime import date
from typing import Protocol

from app.domain import Asset, ScheduledReservation, Session, User


class UsernameTaken(Exception):
    """A normalized username already belongs to an account."""


class AuthTransaction(Protocol):
    def user_by_username(self, username: str) -> User | None: ...

    def user_by_id(self, user_id: str) -> User | None: ...

    def add_user(self, user: User) -> None: ...

    def session_by_hash(self, token_hash: str) -> Session | None: ...

    def add_session(self, session: Session) -> None: ...

    def delete_session(self, token_hash: str) -> None: ...


class AuthRepository(Protocol):
    def transaction(self) -> AbstractContextManager[AuthTransaction]: ...


class CatalogueTransaction(Protocol):
    def assets(self) -> tuple[Asset, ...]: ...

    def asset_by_id(self, asset_id: str) -> Asset | None: ...

    def occupied_days(self, asset_id: str, start: date, end: date) -> frozenset[date]: ...

    # Trusted setup only; public reads never seed or mutate inventory/schedules.
    def add_asset(self, asset: Asset) -> None: ...

    def add_scheduled_reservation(self, reservation: ScheduledReservation) -> None: ...

    def catalogue_seeded_on(self) -> date | None: ...

    def mark_catalogue_seeded(self, today: date) -> None: ...


class GearShareTransaction(AuthTransaction, CatalogueTransaction, Protocol):
    """One atomic boundary for identity, inventory and scheduled allocations."""


class CatalogueRepository(Protocol):
    def transaction(self) -> AbstractContextManager[CatalogueTransaction]: ...


class GearShareRepository(Protocol):
    def transaction(self) -> AbstractContextManager[GearShareTransaction]: ...
