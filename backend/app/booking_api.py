"""Frozen private booking HTTP routes; authentication precedes JSON parsing."""

from fastapi import APIRouter, Depends, Request
from starlette.concurrency import run_in_threadpool
from starlette.responses import JSONResponse

from app.api import bearer_token, json_object, service as auth_service
from app.auth import AuthService
from app.bookings import BookingService

router = APIRouter(prefix="/api/v1/bookings")


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


@router.get("/{booking_id:path}")
def get_booking(booking_id: str, token: str = Depends(authenticated), bookings: BookingService = Depends(service)) -> dict:
    return bookings.get_booking(token, booking_id)


@router.post("/{booking_id:path}/cancel")
async def cancel_booking(booking_id: str, request: Request, token: str = Depends(authenticated), bookings: BookingService = Depends(service)) -> JSONResponse:
    body = await json_object(request)
    result = await run_in_threadpool(bookings.cancel_booking, token, booking_id, body)
    return JSONResponse(result)
