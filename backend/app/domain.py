"""Immutable storage-independent records and explicit public projections."""

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Literal

Role = Literal["student", "coordinator"]
Category = Literal["Cameras", "Audio", "Presentation", "Accessories"]
CATEGORIES = ("Cameras", "Audio", "Presentation", "Accessories")
BookingState = Literal["pending", "approved", "checked_out", "rejected", "cancelled", "returned"]
BookingAction = Literal["create", "approve", "reject", "cancel", "checkout", "return"]
RESERVING_STATES = frozenset({"pending", "approved", "checked_out"})
CANCEL_NOTE = "Reservation cancelled; reserved dates released."


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
class Booking:
    id: str
    asset_id: str
    asset_name: str
    user_id: str
    start_date: date
    end_date: date
    purpose: str
    state: BookingState
    version: int
    created_at: datetime
    updated_at: datetime

    def private(self, events: tuple["BookingEvent", ...]) -> dict:
        return {
            "id": self.id, "assetId": self.asset_id, "assetName": self.asset_name,
            "userId": self.user_id, "startDate": self.start_date.isoformat(),
            "endDate": self.end_date.isoformat(), "purpose": self.purpose,
            "state": self.state, "version": self.version,
            "events": [event.private() for event in events],
        }


@dataclass(frozen=True, slots=True)
class BookingEvent:
    id: str
    booking_id: str
    actor_id: str
    action: BookingAction
    prior_state: BookingState | None
    new_state: BookingState
    timestamp: datetime
    note: str

    def private(self) -> dict:
        return {
            "id": self.id, "bookingId": self.booking_id, "actorId": self.actor_id,
            "action": self.action, "priorState": self.prior_state,
            "newState": self.new_state, "timestamp": self.timestamp.isoformat().replace("+00:00", "Z"),
            "note": self.note,
        }


@dataclass(frozen=True, slots=True)
class ReservationSlot:
    asset_id: str
    day: date
    booking_id: str


@dataclass(frozen=True, slots=True)
class ActiveLoan:
    """Unique physical custody, independent of scheduled reservation days."""

    asset_id: str
    booking_id: str
