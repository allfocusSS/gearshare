"""Authentication domain service. No HTTP framework or storage adapter imports."""

import hashlib
import re
import secrets
from collections.abc import Callable, Mapping
from datetime import UTC, datetime, timedelta
from typing import Protocol
from uuid import uuid4

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from app.domain import Session, User
from app.errors import ApiError, unauthenticated
from app.repositories import AuthRepository, AuthTransaction, UsernameTaken

# String.prototype.trim's exact WhiteSpace + LineTerminator set. Python's default
# strip() additionally removes U+001C..U+001F/U+0085 and misses U+FEFF.
ECMASCRIPT_TRIM = "\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"
USERNAME = re.compile(r"[A-Za-z0-9_]{3,30}")
Clock = Callable[[], datetime]


def utc_now() -> datetime:
    return datetime.now(UTC)


class Passwords(Protocol):
    def hash(self, password: str) -> str: ...

    def verify(self, password_hash: str, password: str) -> bool: ...


class Argon2Passwords:
    """Maintained salted Argon2id, with no truncating byte-length password limit."""

    def __init__(self) -> None:
        self._hasher = PasswordHasher()

    def hash(self, password: str) -> str:
        return self._hasher.hash(password)

    def verify(self, password_hash: str, password: str) -> bool:
        try:
            return self._hasher.verify(password_hash, password)
        except VerifyMismatchError:
            return False


def credentials(body: Mapping[str, object]) -> tuple[str, str]:
    username = body.get("username")
    password = body.get("password")
    fields = {}
    if not isinstance(username, str) or USERNAME.fullmatch(username.strip(ECMASCRIPT_TRIM)) is None:
        fields["username"] = "Use 3–30 ASCII letters, digits or underscores."
    # Python len is Unicode code points. Reject unpaired UTF-16 surrogates before
    # UTF-8 encoding/hashing; valid supplementary characters are ordinary points.
    if not isinstance(password, str) or not 10 <= len(password) <= 128 or any(
        0xD800 <= ord(character) <= 0xDFFF for character in password
    ):
        fields["password"] = "Use a password with 10–128 Unicode code points."
    if fields:
        raise ApiError(422, "VALIDATION_ERROR", "Check the highlighted fields.", fields=fields)
    return username.strip(ECMASCRIPT_TRIM).lower(), password


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("ascii")).hexdigest()


class AuthService:
    def __init__(self, repository: AuthRepository, clock: Clock = utc_now, passwords: Passwords | None = None) -> None:
        self.repository = repository
        self.clock = clock
        self.passwords = passwords if passwords is not None else Argon2Passwords()

    def _now(self) -> datetime:
        value = self.clock()
        if value.utcoffset() is None:
            raise ValueError("Clock must return a timezone-aware instant")
        return value.astimezone(UTC)

    def _issue(self, transaction: AuthTransaction, user: User) -> dict:
        token = secrets.token_urlsafe(32)
        expiry = self._now() + timedelta(hours=24)
        result = {"token": token, "expiresAt": expiry.isoformat().replace("+00:00", "Z"), "user": user.public()}
        transaction.add_session(Session(token_hash(token), user.id, expiry))
        return result

    def register(self, body: Mapping[str, object]) -> dict:
        username, password = credentials(body)
        try:
            with self.repository.transaction() as transaction:
                if transaction.user_by_username(username) is not None:
                    raise UsernameTaken()
                user = User(str(uuid4()), username, "student", self.passwords.hash(password))
                transaction.add_user(user)
                return self._issue(transaction, user)
        except UsernameTaken:
            raise ApiError(
                409, "USERNAME_TAKEN", "That username is already in use.",
                fields={"username": "Choose a different username."},
            ) from None

    def login(self, body: Mapping[str, object]) -> dict:
        username, password = credentials(body)
        with self.repository.transaction() as transaction:
            user = transaction.user_by_username(username)
            if user is None or not self.passwords.verify(user.password_hash, password):
                raise ApiError(
                    401, "INVALID_CREDENTIALS", "Username or password is incorrect.",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            return self._issue(transaction, user)

    def _identity(self, transaction: AuthTransaction, token: str) -> User:
        session = transaction.session_by_hash(token_hash(token))
        if session is None or self._now() >= session.expires_at:
            raise unauthenticated()
        user = transaction.user_by_id(session.user_id)
        if user is None:
            raise unauthenticated()
        return user

    def current_user(self, token: str) -> dict[str, str]:
        with self.repository.transaction() as transaction:
            return self._identity(transaction, token).public()

    def logout(self, token: str) -> None:
        with self.repository.transaction() as transaction:
            self._identity(transaction, token)
            transaction.delete_session(token_hash(token))
