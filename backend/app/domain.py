"""Immutable storage-independent records and explicit public projections."""

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Literal

Role = Literal["student", "coordinator"]
Category = Literal["Cameras", "Audio", "Presentation", "Accessories"]
CATEGORIES = ("Cameras", "Audio", "Presentation", "Accessories")
BookingState = Literal["pending", "approved", "checked_out", "rejected", "cancelled", "returned"]
RESERVING_STATES = frozenset({"pending", "approved", "checked_out"})


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


@dataclass(frozen=True, slots=True)
class Asset:
    id: str
    inventory_code: str
    name: str
    category: Category
    description: str
    location: str
    state: Literal["active", "maintenance"] = "active"

    def public(self) -> dict[str, str]:
        return {
            "id": self.id, "inventoryCode": self.inventory_code, "name": self.name,
            "category": self.category, "description": self.description,
            "location": self.location, "state": self.state,
        }


@dataclass(frozen=True, slots=True)
class ScheduledReservation:
    """Trusted allocation projection for #8, not a private Booking or public DTO.

    #9 will source the same occupied-days read interface from full bookings and
    reservation slots. This stage has no booking lifecycle or custody operations.
    """

    id: str
    asset_id: str
    start_date: date
    end_date: date
    state: BookingState
