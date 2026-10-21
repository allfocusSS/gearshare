"""HTTP envelope, authentication dependency and credential-safe error boundary."""

import json
import logging
import re

from fastapi import APIRouter, Depends, FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from starlette.concurrency import run_in_threadpool
from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.auth import AuthService
from app.errors import ApiError, invalid_envelope, unauthenticated

logger = logging.getLogger("gearshare.api")
BEARER = re.compile(r"(?i:Bearer) ([A-Za-z0-9._~+/-]+=*)")
FIELD_NAMES = frozenset({
    "assetId", "username", "password", "startDate", "endDate", "category", "purpose", "note",
    "name", "inventoryCode", "location", "description", "state", "expectedVersion",
})


def service(request: Request) -> AuthService:
    return request.app.state.auth


def bearer_token(request: Request) -> str:
    values = request.headers.getlist("authorization")
    if len(values) != 1 or (match := BEARER.fullmatch(values[0])) is None:
        raise unauthenticated()
    return match[1]


async def json_object(request: Request) -> dict:
    media_types = request.headers.getlist("content-type")
    if len(media_types) != 1 or media_types[0].split(";", 1)[0].strip().lower() != "application/json":
        raise invalid_envelope()
    try:
        # Decode explicitly: json.loads(bytes) would also accept UTF-16/32.
        body = json.loads((await request.body()).decode("utf-8"), parse_constant=_invalid_json_constant)
    except (ValueError, UnicodeError):
        raise invalid_envelope() from None
    if not isinstance(body, dict):
        raise invalid_envelope()
    return body


def _invalid_json_constant(value: str) -> None:
    # NaN/Infinity are not JSON, despite the Python decoder's permissive default.
    raise ValueError("Invalid JSON constant")


router = APIRouter(prefix="/api/v1/auth")


@router.post("/register", status_code=201)
async def register(request: Request, auth: AuthService = Depends(service)) -> JSONResponse:
    body = await json_object(request)
    result = await run_in_threadpool(auth.register, body)
    return JSONResponse(result, status_code=201)


@router.post("/login")
async def login(request: Request, auth: AuthService = Depends(service)) -> JSONResponse:
    body = await json_object(request)
    result = await run_in_threadpool(auth.login, body)
    return JSONResponse(result)


@router.get("/me")
def current_user(token: str = Depends(bearer_token), auth: AuthService = Depends(service)) -> dict[str, str]:
    return auth.current_user(token)


@router.post("/logout", status_code=204)
def logout(token: str = Depends(bearer_token), auth: AuthService = Depends(service)) -> Response:
    auth.logout(token)
    return Response(status_code=204)


def unexpected_response() -> JSONResponse:
    # Never use exc_info, str(exception), request bodies/URLs or credential headers.
    logger.error("Unexpected API failure; operation aborted.")
    return JSONResponse({"code": "SERVICE_UNAVAILABLE", "message": "The service is temporarily unavailable. Try again."}, status_code=500)


class SafeFailureMiddleware:
    """Consume unexpected failures before Uvicorn can log secret-bearing tracebacks.

    Starlette's Exception handler alone sends a response but then re-raises the
    exception to the server. All current endpoints send a single buffered body.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        started = False

        async def track_send(message: Message) -> None:
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, receive, track_send)
        except Exception:
            response = unexpected_response()
            if not started:
                await response(scope, receive, send)


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def api_error(request: Request, error: ApiError) -> JSONResponse:
        return JSONResponse(error.body(), status_code=error.status, headers=error.headers)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, error: RequestValidationError) -> JSONResponse:
        fields = {}
        for problem in error.errors():
            location = problem.get("loc", ())
            if len(location) > 1 and location[0] in {"body", "query"} and location[1] in FIELD_NAMES:
                fields[location[1]] = "Check this field."
        safe = ApiError(422, "VALIDATION_ERROR", "Check the submitted request.", fields=fields)
        return JSONResponse(safe.body(), status_code=422)

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, error: HTTPException) -> JSONResponse:
        codes = {401: "UNAUTHENTICATED", 403: "FORBIDDEN", 404: "NOT_FOUND", 405: "NOT_FOUND", 409: "CONFLICT", 422: "VALIDATION_ERROR"}
        safe = ApiError(error.status_code, codes.get(error.status_code, "SERVICE_UNAVAILABLE"), "The request could not be completed.")
        return JSONResponse(safe.body(), status_code=error.status_code, headers=error.headers)

    @app.exception_handler(Exception)
    async def unexpected_error(request: Request, error: Exception) -> JSONResponse:
        return unexpected_response()

    app.add_middleware(SafeFailureMiddleware)
