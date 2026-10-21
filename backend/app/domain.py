"""Storage-independent identity records. Credential material is never a public DTO."""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal

Role = Literal["student", "coordinator"]


@dataclass(frozen=True, slots=True)
class User:
    id: str
    username: str
    role: Role
    password_hash: str = field(repr=False)

    def public(self) -> dict[str, str]:
        return {"id": self.id, "username": self.username, "role": self.role}


@dataclass(frozen=True, slots=True)
class Session:
    token_hash: str = field(repr=False)
    user_id: str
    expires_at: datetime
