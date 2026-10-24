"""Original fictional units and coherent private fixtures, trusted setup only."""

import secrets
from datetime import UTC, date, datetime, time, timedelta
from functools import lru_cache
from uuid import uuid4

from app.auth import Argon2Passwords
from app.calendar import CLUB_ZONE
from app.conventions import Clock, clock_instant
from app.domain import ActiveLoan, Asset, Booking, BookingEvent, BookingState, CANCEL_NOTE, RESERVING_STATES, ReservationSlot, User
from app.repositories import retry_transaction, GearShareRepository, GearShareTransaction


@lru_cache(maxsize=2)
def _inaccessible_fixture_hash(role: str) -> str:
    # Discard the random credential; neither the API nor documentation grants a
    # login to these identities. A real valid hash keeps login failure ordinary.
    return Argon2Passwords().hash(secrets.token_urlsafe(48))


def fixture_users(transaction: GearShareTransaction) -> tuple[User, User]:
    owner = User(str(uuid4()), f"fixture_{secrets.token_hex(8)}", "student", _inaccessible_fixture_hash("student"))
    coordinator = User(str(uuid4()), f"fixture_{secrets.token_hex(8)}", "coordinator", _inaccessible_fixture_hash("coordinator"))
    transaction.add_user(owner)
    transaction.add_user(coordinator)
    return owner, coordinator


def add_fixture_booking(
    transaction: GearShareTransaction, *, booking_id: str, asset: Asset,
    owner: User, coordinator: User, start: date, end: date, state: BookingState, now: datetime,
) -> Booking:
    """Construct a trusted history snapshot, never execute a staff command.

    This keeps catalogue and terminal/custody test setup internally consistent
    while staff authorization, transitions and mutation endpoints remain #10.
    """
    purpose = "Fictional club equipment session"
    created = min(datetime.combine(start - timedelta(days=2), time(8), CLUB_ZONE).astimezone(UTC), now - timedelta(days=2))
    approved = created + timedelta(hours=1)
    if state in {"checked_out", "returned"} and start > now.astimezone(CLUB_ZONE).date():
        raise ValueError("A custody fixture cannot check out before its booked local day")
    checkout = min(datetime.combine(start, time(8), CLUB_ZONE).astimezone(UTC), now)
    returned = min(datetime.combine(end, time(9), CLUB_ZONE).astimezone(UTC), now)
    paths = {
        "pending": (),
        "approved": (("approve", "pending", "approved", approved, "Reservation approved."),),
        "checked_out": (("approve", "pending", "approved", approved, "Reservation approved."), ("checkout", "approved", "checked_out", checkout, "Complete fictional kit; good condition.")),
        "rejected": (("reject", "pending", "rejected", approved, "Fictional scheduling request declined."),),
        "cancelled": (("cancel", "pending", "cancelled", approved, CANCEL_NOTE),),
        "returned": (("approve", "pending", "approved", approved, "Reservation approved."), ("checkout", "approved", "checked_out", checkout, "Complete fictional kit; good condition."), ("return", "checked_out", "returned", returned, "Complete fictional kit returned in good condition.")),
    }
    events = [BookingEvent(str(uuid4()), booking_id, owner.id, "create", None, "pending", created, purpose)]
    for action, prior, new, instant, note in paths[state]:
        actor = owner if action == "cancel" else coordinator
        events.append(BookingEvent(str(uuid4()), booking_id, actor.id, action, prior, new, instant, note))
    booking = Booking(booking_id, asset.id, asset.name, owner.id, start, end, purpose, state, len(events), created, events[-1].timestamp)
    transaction.add_booking(booking)
    for event in events:
        transaction.add_booking_event(event)
    if state in RESERVING_STATES:
        for offset in range((end - start).days + 1):
            transaction.add_slot(ReservationSlot(asset.id, start + timedelta(days=offset), booking.id))
    if state == "checked_out":
        transaction.add_active_loan(ActiveLoan(asset.id, booking.id))
    return booking


def catalogue_assets() -> tuple[Asset, ...]:
    return (
        Asset("camera-01", "CAM-001", "Field Camera · Unit 01", "Cameras", "A fictional mirrorless camera kit for interviews, club films and everyday storytelling. Includes a standard lens and a padded case.", "Media room · North desk"),
        Asset("camera-02", "CAM-002", "Field Camera · Unit 02", "Cameras", "A second independent physical unit of the field camera kit. Its calendar is separate from Unit 01.", "Media room · North desk"),
        Asset("camera-03", "CAM-003", "Pocket Video Camera", "Cameras", "A compact fictional video camera for small productions. Temporarily undergoing a lens and battery inspection.", "Media room · Care shelf", "maintenance"),
        Asset("audio-01", "AUD-001", "Directional Microphone", "Audio", "A fictional directional microphone with a wind shield, cable and carry pouch for clear location sound.", "Sound cabinet · Shelf A"),
        Asset("audio-02", "AUD-002", "Portable Sound Recorder", "Audio", "A handheld fictional recorder for interviews, atmosphere and live club sessions. Includes a protective case.", "Sound cabinet · Shelf B"),
        Asset("presentation-01", "PRE-001", "Compact Projector", "Presentation", "A fictional portable projector for screenings and small-room presentations. Includes power and display cables.", "Club office · Equipment desk"),
        Asset("presentation-02", "PRE-002", "Folding Projection Screen", "Presentation", "A fictional freestanding screen for presentations. Folds into one carry case; please allow space for setup.", "Club office · Tall storage"),
        Asset("accessory-01", "ACC-001", "Travel Tripod", "Accessories", "A fictional lightweight tripod with a quick-release plate for stable interviews and static shots.", "Media room · Stand rack"),
        Asset("accessory-02", "ACC-002", "Soft LED Light", "Accessories", "A fictional dimmable light panel with stand and soft diffuser for small sets and interviews.", "Media room · Light shelf"),
        Asset("accessory-03", "ACC-003", "Capture Adapter Kit", "Accessories", "A fictional video capture adapter with labeled cables for club livestream and presentation setups.", "Club office · Cable drawer"),
    )


@retry_transaction
def seed_catalogue(repository: GearShareRepository, clock: Clock) -> None:
    """Seed once per store in one transaction, never as a read side effect."""
    with repository.transaction() as transaction:
        if transaction.catalogue_seeded_on() is not None:
            return
        now = clock_instant(clock)
        today = now.astimezone(CLUB_ZONE).date()
        assets = catalogue_assets()
        for asset in assets:
            transaction.add_asset(asset)
        owner, coordinator = fixture_users(transaction)
        # Preserve the catalogue's scheduled pattern using full private history,
        # including an overdue loan and a later approved scheduled pickup.
        for name, state, index, start, end in (
            ("pending", "pending", 0, 2, 4),
            ("approved", "approved", 1, 1, 3),
            ("checked_out", "checked_out", 3, -3, -2),
            ("rejected", "rejected", 2, -13, -12),
            ("cancelled", "cancelled", 4, -14, -13),
            ("returned", "returned", 5, -15, -14),
            ("next-pickup", "approved", 3, 0, 1),
            ("audio-request", "pending", 4, 7, 8),
            ("screening-request", "pending", 5, 10, 12),
            ("light-pickup", "approved", 8, 5, 5),
        ):
            add_fixture_booking(
                transaction, booking_id=f"fixture-{name}", asset=assets[index],
                owner=owner, coordinator=coordinator, start=today + timedelta(days=start),
                end=today + timedelta(days=end), state=state, now=now,
            )
        transaction.mark_catalogue_seeded(today)
