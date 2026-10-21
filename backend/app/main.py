"""FastAPI memory-auth stage. Catalogue/booking/storage follow their own gates."""

from fastapi import FastAPI

from app.api import install_error_handlers, router
from app.auth import AuthService, Clock, Passwords, utc_now
from app.memory import MemoryAuthRepository
from app.repositories import AuthRepository


def create_app(
    *, repository: AuthRepository | None = None, clock: Clock = utc_now, passwords: Passwords | None = None,
) -> FastAPI:
    application = FastAPI(title="GearShare", redirect_slashes=False)
    application.state.auth = AuthService(repository if repository is not None else MemoryAuthRepository(), clock, passwords)
    install_error_handlers(application)
    application.include_router(router)

    @application.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return application


app = create_app()
