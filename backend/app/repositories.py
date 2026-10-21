"""Atomic repository boundary, shared by the memory stage and future ORM adapter."""

from contextlib import AbstractContextManager
from typing import Protocol

from app.domain import Session, User


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
