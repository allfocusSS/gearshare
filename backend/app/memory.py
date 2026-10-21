"""Real process-local memory storage; no database, ORM or filesystem state."""

from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import timedelta
from threading import Lock

from app.domain import Session, User
from app.repositories import AuthTransaction, UsernameTaken


@dataclass
class _State:
    users: dict[str, User] = field(default_factory=dict)
    usernames: dict[str, str] = field(default_factory=dict)
    sessions: dict[str, Session] = field(default_factory=dict)

    def copy(self) -> "_State":
        # Records are immutable, so shallow dictionary copies isolate all mutations.
        return _State(self.users.copy(), self.usernames.copy(), self.sessions.copy())


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


class MemoryAuthRepository:
    def __init__(self) -> None:
        self._lock = Lock()
        self._state = _State()

    @contextmanager
    def transaction(self) -> Iterator[AuthTransaction]:
        # The lock covers every read/check/write in a complete service operation.
        # Publish once on success; an exception leaves the original state untouched.
        with self._lock:
            transaction = _Transaction(self._state.copy())
            yield transaction
            # Copy again so a retained transaction cannot mutate published storage.
            self._state = transaction.state.copy()
