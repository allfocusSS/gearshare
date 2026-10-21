"""Original fictional units and trusted relative schedules; no demo identities."""

from datetime import timedelta

from app.calendar import club_today
from app.conventions import Clock
from app.domain import Asset, ScheduledReservation
from app.repositories import CatalogueRepository


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


def seed_catalogue(repository: CatalogueRepository, clock: Clock) -> None:
    """Seed once per store in one transaction, never as a read side effect."""
    with repository.transaction() as transaction:
        if transaction.catalogue_seeded_on() is not None:
            return
        today = club_today(clock)
        assets = catalogue_assets()
        for asset in assets:
            transaction.add_asset(asset)
        # Match the standalone mock's scheduled pattern, including an overdue
        # checked-out projection and a following approved scheduled pickup.
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
            transaction.add_scheduled_reservation(ScheduledReservation(
                f"fixture-{name}", assets[index].id,
                today + timedelta(days=start), today + timedelta(days=end), state,
            ))
        transaction.mark_catalogue_seeded(today)
