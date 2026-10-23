"""Coordinator lending and inventory rules, committed through one transaction."""

from collections.abc import Mapping
from dataclasses import replace
from typing import Literal
from uuid import uuid4

from app.auth import AuthService
from app.bookings import _surrogates, check_version, missing_booking
from app.calendar import CLUB_ZONE
from app.catalogue import missing_asset
from app.conventions import Clock, ECMASCRIPT_TRIM, clock_instant, utc_now
from app.domain import ActiveLoan, Asset, BookingEvent, CATEGORIES, User
from app.errors import ApiError
from app.repositories import GearShareRepository, InventoryCodeTaken
from app.text import default_upper

StaffAction = Literal["approve", "reject", "checkout", "return"]
TRANSITIONS = {
    "approve": ("pending", "approved"), "reject": ("pending", "rejected"),
    "checkout": ("approved", "checked_out"), "return": ("checked_out", "returned"),
}


def require_coordinator(actor: User) -> None:
    if actor.role != "coordinator":
        raise ApiError(403, "FORBIDDEN", "Coordinator access is required for this action.")


def condition_note(body: Mapping[str, object]) -> str:
    value = body.get("note")
    note = value.strip(ECMASCRIPT_TRIM) if isinstance(value, str) else ""
    if not 3 <= len(note) <= 500 or _surrogates(note):
        raise ApiError(422, "VALIDATION_ERROR", "Check the highlighted fields.", fields={"note": "Use 3–500 Unicode code points after trimming whitespace."})
    return note


def asset_values(body: Mapping[str, object]) -> dict:
    values, fields = {}, {}
    for wire, internal, minimum, maximum in (
        ("name", "name", 2, 100), ("inventoryCode", "inventory_code", 2, 30),
        ("location", "location", 2, 100), ("description", "description", 0, 2000),
    ):
        submitted = body.get(wire)
        value = submitted.strip(ECMASCRIPT_TRIM) if isinstance(submitted, str) else ""
        if wire == "inventoryCode":
            value = default_upper(value)
        if not isinstance(submitted, str) or not minimum <= len(value) <= maximum or _surrogates(value):
            fields[wire] = f"Use {minimum}–{maximum} Unicode code points after trimming whitespace."
        values[internal] = value
    category = body.get("category")
    if category not in CATEGORIES:
        fields["category"] = "Choose one of the four listed categories."
    values["category"] = category
    if fields:
        raise ApiError(422, "VALIDATION_ERROR", "Check the highlighted equipment fields.", fields=fields)
    return values


def duplicate_code() -> ApiError:
    return ApiError(409, "CONFLICT", "This inventory code is already in use. Choose a unique code for this physical unit.", fields={"inventoryCode": "This code is already in use."})


class StaffService:
    def __init__(self, repository: GearShareRepository, auth: AuthService, clock: Clock = utc_now) -> None:
        self.repository = repository
        self.auth = auth
        self.clock = clock

    def list_bookings(self, token: str) -> dict:
        with self.repository.transaction() as transaction:
            require_coordinator(self.auth.identity(transaction, token))
            today = clock_instant(self.clock).astimezone(CLUB_ZONE).date()
            bookings = transaction.bookings()
            on_loan = {booking.asset_id for booking in bookings if booking.state == "checked_out"}
            rows = []
            for booking in bookings:
                owner = transaction.user_by_id(booking.user_id)
                asset = transaction.asset_by_id(booking.asset_id)
                # References belong to the repository invariant. Never fabricate
                # a borrower or substitute request data for a missing identity.
                if owner is None or asset is None:
                    raise ValueError("Invalid staff booking reference")
                rows.append({
                    **booking.private(transaction.booking_events(booking.id)),
                    "borrower": owner.username, "inventoryCode": asset.inventory_code,
                    "location": asset.location, "currentlyOnLoan": booking.asset_id in on_loan,
                    "overdue": booking.state == "checked_out" and booking.end_date < today,
                })
            return {
                "today": today.isoformat(), "timeZone": "Asia/Almaty", "bookings": rows,
                "counts": {
                    "pending": sum(booking.state == "pending" for booking in bookings),
                    "dueToday": sum(booking.state == "checked_out" and booking.end_date == today for booking in bookings),
                    "overdue": sum(row["overdue"] for row in rows),
                },
            }

    def transition(self, token: str, booking_id: str, action: StaffAction, body: Mapping[str, object]) -> dict:
        with self.repository.transaction() as transaction:
            actor = self.auth.identity(transaction, token)
            require_coordinator(actor)
            booking = transaction.booking_by_id(booking_id)
            if booking is None:
                raise missing_booking()
            check_version(body, booking)
            required, next_state = TRANSITIONS[action]
            if booking.state != required:
                raise ApiError(409, "CONFLICT", "This action is not allowed in the reservation's current state.")
            note = "Reservation approved." if action == "approve" else condition_note(body)
            instant = clock_instant(self.clock)
            today = instant.astimezone(CLUB_ZONE).date()
            if action == "approve" and booking.end_date < today:
                raise ApiError(409, "CONFLICT", "The booked end date has passed. Reject or cancel this request instead.")
            if action == "checkout":
                if not booking.start_date <= today <= booking.end_date:
                    raise ApiError(409, "CONFLICT", "Check out only within the inclusive booked dates in Asia/Almaty.")
                if transaction.active_loan_by_asset(booking.asset_id) is not None:
                    raise ApiError(409, "CONFLICT", "This physical unit is still on loan. Record its return before checking it out again.")
            updated = replace(booking, state=next_state, version=booking.version + 1, updated_at=instant)
            transaction.replace_booking(updated)
            transaction.add_booking_event(BookingEvent(str(uuid4()), booking.id, actor.id, action, booking.state, next_state, instant, note))
            if action == "checkout":
                transaction.add_active_loan(ActiveLoan(booking.asset_id, booking.id))
            if action == "return":
                transaction.remove_active_loan(booking.asset_id, booking.id)
            if action in {"reject", "return"}:
                transaction.release_slots(booking.id)
            return updated.private(transaction.booking_events(booking.id))

    def list_inventory(self, token: str) -> list[dict]:
        with self.repository.transaction() as transaction:
            require_coordinator(self.auth.identity(transaction, token))
            return [asset.public() for asset in transaction.assets()]

    def add_asset(self, token: str, body: Mapping[str, object]) -> dict:
        try:
            with self.repository.transaction() as transaction:
                require_coordinator(self.auth.identity(transaction, token))
                asset = Asset(id=str(uuid4()), **asset_values(body))
                transaction.add_asset(asset)
                return asset.public()
        except InventoryCodeTaken:
            raise duplicate_code() from None

    def edit_asset(self, token: str, asset_id: str, body: Mapping[str, object]) -> dict:
        try:
            with self.repository.transaction() as transaction:
                require_coordinator(self.auth.identity(transaction, token))
                asset = transaction.asset_by_id(asset_id)
                if asset is None:
                    raise missing_asset()
                updated = replace(asset, **asset_values(body))
                transaction.replace_asset(updated)
                return updated.public()
        except InventoryCodeTaken:
            raise duplicate_code() from None

    def set_asset_state(self, token: str, asset_id: str, body: Mapping[str, object]) -> dict:
        with self.repository.transaction() as transaction:
            require_coordinator(self.auth.identity(transaction, token))
            asset = transaction.asset_by_id(asset_id)
            if asset is None:
                raise missing_asset()
            state = body.get("state")
            if state not in ("active", "maintenance"):
                raise ApiError(422, "VALIDATION_ERROR", "Choose active or maintenance.", fields={"state": "Choose active or maintenance."})
            if asset.state == state:
                raise ApiError(409, "CONFLICT", "This unit already has the requested state.")
            if state == "maintenance":
                today = clock_instant(self.clock).astimezone(CLUB_ZONE).date()
                if transaction.active_loan_by_asset(asset_id) is not None or any(
                    booking.asset_id == asset_id and (
                        booking.state == "checked_out" or booking.state in {"pending", "approved"} and booking.end_date >= today
                    ) for booking in transaction.bookings()
                ):
                    raise ApiError(409, "CONFLICT", "Maintenance is blocked by an active loan or pending/approved reservation ending today or later. Record returns and resolve reservations first.")
            updated = replace(asset, state=state)
            transaction.replace_asset(updated)
            return updated.public()
