"""Frozen staff routes; session and role precede manual JSON-object parsing."""

from fastapi import APIRouter, Depends, Request
from starlette.concurrency import run_in_threadpool
from starlette.responses import JSONResponse

from app.api import bearer_token, json_object, service as auth_service
from app.auth import AuthService
from app.errors import ApiError
from app.routing import ExactRoute
from app.staff import StaffService

router = APIRouter(prefix="/api/v1/staff", route_class=ExactRoute)


def service(request: Request) -> StaffService:
    return request.app.state.staff


def coordinator(token: str = Depends(bearer_token), auth: AuthService = Depends(auth_service)) -> str:
    # Rechecked inside the command transaction after the envelope is parsed.
    user = auth.current_user(token)
    if user["role"] != "coordinator":
        raise ApiError(403, "FORBIDDEN", "Coordinator access is required for this action.")
    return token


@router.get("/bookings")
def list_bookings(token: str = Depends(coordinator), staff: StaffService = Depends(service)) -> dict:
    return staff.list_bookings(token)


@router.post("/bookings/{booking_id}/approve")
async def approve(booking_id: str, request: Request, token: str = Depends(coordinator), staff: StaffService = Depends(service)) -> JSONResponse:
    return JSONResponse(await run_in_threadpool(staff.transition, token, booking_id, "approve", await json_object(request)))


@router.post("/bookings/{booking_id}/reject")
async def reject(booking_id: str, request: Request, token: str = Depends(coordinator), staff: StaffService = Depends(service)) -> JSONResponse:
    return JSONResponse(await run_in_threadpool(staff.transition, token, booking_id, "reject", await json_object(request)))


@router.post("/bookings/{booking_id}/checkout")
async def checkout(booking_id: str, request: Request, token: str = Depends(coordinator), staff: StaffService = Depends(service)) -> JSONResponse:
    return JSONResponse(await run_in_threadpool(staff.transition, token, booking_id, "checkout", await json_object(request)))


@router.post("/bookings/{booking_id}/return")
async def record_return(booking_id: str, request: Request, token: str = Depends(coordinator), staff: StaffService = Depends(service)) -> JSONResponse:
    return JSONResponse(await run_in_threadpool(staff.transition, token, booking_id, "return", await json_object(request)))


@router.get("/assets")
def inventory(token: str = Depends(coordinator), staff: StaffService = Depends(service)) -> list[dict]:
    return staff.list_inventory(token)


@router.post("/assets", status_code=201)
async def add_asset(request: Request, token: str = Depends(coordinator), staff: StaffService = Depends(service)) -> JSONResponse:
    return JSONResponse(await run_in_threadpool(staff.add_asset, token, await json_object(request)), status_code=201)


@router.put("/assets/{asset_id}")
async def edit_asset(asset_id: str, request: Request, token: str = Depends(coordinator), staff: StaffService = Depends(service)) -> JSONResponse:
    return JSONResponse(await run_in_threadpool(staff.edit_asset, token, asset_id, await json_object(request)))


@router.put("/assets/{asset_id}/state")
async def set_state(asset_id: str, request: Request, token: str = Depends(coordinator), staff: StaffService = Depends(service)) -> JSONResponse:
    return JSONResponse(await run_in_threadpool(staff.set_asset_state, token, asset_id, await json_object(request)))
