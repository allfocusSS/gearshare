"""Frozen private booking HTTP routes; authentication precedes JSON parsing."""

from fastapi import APIRouter, Depends, Request
from fastapi.routing import APIRoute
from starlette._utils import get_route_path
from starlette.concurrency import run_in_threadpool
from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse
from starlette.routing import Match
from starlette.types import Receive, Scope, Send

from app.api import bearer_token, json_object, service as auth_service
from app.auth import AuthService
from app.bookings import BookingService

class ExactBookingRoute(APIRoute):
    def matches(self, scope: Scope) -> tuple[Match, Scope]:
        # Python's `$` also matches before a final LF. Require the complete
        # decoded template before the framework dispatches a method or an ID.
        if scope["type"] == "http" and self.path_regex.fullmatch(get_route_path(scope)) is None:
            return Match.NONE, {}
        return super().matches(scope)

    async def handle(self, scope: Scope, receive: Receive, send: Send) -> None:
        if self.methods and scope["method"] not in self.methods:
            # The framework selects the first partial match. Include every
            # operation at that same template in its method-denial response.
            allowed = {method for route in router.routes if isinstance(route, APIRoute) and route.path == self.path
                       for method in route.methods}
            raise HTTPException(status_code=405, headers={"Allow": ", ".join(sorted(allowed))})
        await super().handle(scope, receive, send)


router = APIRouter(prefix="/api/v1/bookings", route_class=ExactBookingRoute)


def service(request: Request) -> BookingService:
    return request.app.state.bookings


def authenticated(token: str = Depends(bearer_token), auth: AuthService = Depends(auth_service)) -> str:
    # Check the real session before reading an envelope; the service checks again
    # inside its transaction so logout/expiry cannot race a privileged mutation.
    auth.current_user(token)
    return token


@router.post("", status_code=201)
async def request_booking(request: Request, token: str = Depends(authenticated), bookings: BookingService = Depends(service)) -> JSONResponse:
    body = await json_object(request)
    result = await run_in_threadpool(bookings.request_booking, token, body)
    return JSONResponse(result, status_code=201)


@router.get("")
def list_bookings(token: str = Depends(authenticated), bookings: BookingService = Depends(service)) -> list[dict]:
    return bookings.list_bookings(token)


@router.get("/{booking_id}")
def get_booking(booking_id: str, token: str = Depends(authenticated), bookings: BookingService = Depends(service)) -> dict:
    return bookings.get_booking(token, booking_id)


@router.post("/{booking_id}/cancel")
async def cancel_booking(booking_id: str, request: Request, token: str = Depends(authenticated), bookings: BookingService = Depends(service)) -> JSONResponse:
    body = await json_object(request)
    result = await run_in_threadpool(bookings.cancel_booking, token, booking_id, body)
    return JSONResponse(result)
