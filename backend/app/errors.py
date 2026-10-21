"""Safe domain/API errors; never construct these from submitted input."""


class ApiError(Exception):
    def __init__(
        self,
        status: int,
        code: str,
        message: str,
        *,
        fields: dict[str, str] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.fields = fields
        self.headers = headers

    def body(self) -> dict:
        body = {"code": self.code, "message": self.message}
        if self.fields:
            body["fields"] = self.fields
        return body


def unauthenticated() -> ApiError:
    return ApiError(
        401, "UNAUTHENTICATED", "Sign in to continue.",
        headers={"WWW-Authenticate": "Bearer"},
    )


def invalid_envelope() -> ApiError:
    return ApiError(422, "VALIDATION_ERROR", "Send a JSON object with application/json.")
