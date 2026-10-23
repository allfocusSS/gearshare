"""Complete FastAPI memory API; persistence and frontend HTTP retain their gates."""

from fastapi import FastAPI

from app.api import install_error_handlers, router
from app.auth import AuthService, Passwords
from app.booking_api import router as booking_router
from app.bookings import BookingService
from app.catalogue import CatalogueService
from app.catalogue_api import router as catalogue_router
from app.conventions import Clock, utc_now
from app.fixtures import seed_catalogue
from app.memory import MemoryRepository
from app.repositories import GearShareRepository
from app.staff import StaffService
from app.staff_api import router as staff_router


def create_app(
    *, repository: GearShareRepository | None = None, clock: Clock = utc_now,
    passwords: Passwords | None = None, seed: bool = True,
) -> FastAPI:
    store = repository if repository is not None else MemoryRepository()
    if seed:
        seed_catalogue(store, clock)
    application = FastAPI(title="GearShare", redirect_slashes=False)
    application.state.auth = AuthService(store, clock, passwords)
    application.state.catalogue = CatalogueService(store, clock)
    application.state.bookings = BookingService(store, application.state.auth, clock)
    application.state.staff = StaffService(store, application.state.auth, clock)
    install_error_handlers(application)
    application.include_router(router)
    application.include_router(catalogue_router)
    application.include_router(booking_router)
    application.include_router(staff_router)

    @application.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return application


app = create_app()
