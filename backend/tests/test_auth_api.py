"""Issue #7 / A01–A07 against the real ASGI API and real memory transactions."""

import asyncio
import copy
import hashlib
import json
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path

import httpx
import pytest
import yaml
from argon2 import PasswordHasher
from fastapi import Body
from jsonschema import Draft202012Validator, FormatChecker

from app.auth import Argon2Passwords
from app.domain import User
from app.main import create_app
from app.memory import MemoryAuthRepository

ROOT = Path(__file__).resolve().parents[2]
SPEC = yaml.safe_load((ROOT / "openapi.yml").read_text())
PASSWORD = "PrivatePassword42!"
NOW = datetime(2026, 10, 21, 23, 59, 59, 123456, tzinfo=UTC)


@dataclass
class Clock:
    value: datetime = NOW

    def __call__(self):
        return self.value


@pytest.fixture
def clock():
    return Clock()


@pytest.fixture
def repository():
    return MemoryAuthRepository()


@pytest.fixture
def app(repository, clock):
    return create_app(repository=repository, clock=clock, seed=False)


def request(app, method, path, **kwargs):
    async def run():
        # Unexpected exceptions must be consumed before the server can log them.
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=True)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.request(method, path, **kwargs)
    return asyncio.run(run())


def send(app, operation, payload, **kwargs):
    # Escaped JSON also lets the API, rather than HTTPX's encoder, validate a lone
    # surrogate. Supplementary characters decode to the same Unicode code points.
    return request(app, "POST", f"/api/v1/auth/{operation}", content=json.dumps(payload), headers={"Content-Type": "application/json", **kwargs})


def register(app, username="New_Member9", password=PASSWORD, **extra):
    return send(app, "register", {"username": username, "password": password, **extra})


def login(app, username="New_Member9", password=PASSWORD):
    return send(app, "login", {"username": username, "password": password})


def authorization(session):
    return {"Authorization": f"Bearer {session['token']}"}


def validate(response, schema):
    validator = Draft202012Validator(
        {"$ref": f"#/components/schemas/{schema}", "components": SPEC["components"]},
        format_checker=FormatChecker(),
    )
    validator.validate(response.json())


def error(response, status, code, fields=None):
    assert response.status_code == status
    validate(response, "Error")
    body = response.json()
    assert body["code"] == code
    assert isinstance(body["message"], str) and body["message"]
    assert set(body) == ({"code", "message", "fields"} if fields else {"code", "message"})
    if fields:
        assert set(body["fields"]) == set(fields)
    if status == 401:
        assert response.headers["WWW-Authenticate"] == "Bearer"
    return body


def state(repository):
    # Inspect actual stored records to prove no plaintext or partial mutations.
    return copy.deepcopy(repository._state)


def test_a01_register_wire_session_public_user_and_hash_only_storage(app, repository, clock):
    response = register(app, " \ufeff\u00a0New_Member9\u3000 ")
    assert response.status_code == 201
    validate(response, "Session")
    session = response.json()
    assert set(session) == {"token", "expiresAt", "user"}
    assert set(session["user"]) == {"id", "username", "role"}
    assert session["user"]["username"] == "new_member9"
    assert session["user"]["role"] == "student"
    assert datetime.fromisoformat(session["expiresAt"].replace("Z", "+00:00")) == clock.value + timedelta(hours=24)
    assert session["expiresAt"].endswith("Z")
    assert len(session["token"]) >= 32
    digest = hashlib.sha256(session["token"].encode()).hexdigest()
    stored = state(repository)
    assert len(stored.users) == len(stored.sessions) == 1
    account = next(iter(stored.users.values()))
    assert account.password_hash.startswith("$argon2id$")
    assert PasswordHasher().verify(account.password_hash, PASSWORD)
    record = stored.sessions[digest]
    assert record.token_hash == digest and record.user_id == account.id
    assert record.expires_at.tzinfo is UTC
    assert record.expires_at == clock.value + timedelta(hours=24)
    assert PASSWORD not in response.text and account.password_hash not in response.text and digest not in response.text
    assert not hasattr(account, "password") and not hasattr(record, "token")
    me = request(app, "GET", "/api/v1/auth/me?userId=someone_else&role=coordinator", headers=authorization(session))
    validate(me, "User")
    assert me.status_code == 200 and me.json() == session["user"]


def test_a01_same_password_has_distinct_random_salts_and_sessions(app, repository):
    first = register(app, "member_one").json()
    second = register(app, "member_two").json()
    assert first["token"] != second["token"]
    assert first["user"]["id"] != second["user"]["id"]
    hashes = [user.password_hash for user in state(repository).users.values()]
    assert len(set(hashes)) == 2
    assert all(PasswordHasher().verify(value, PASSWORD) for value in hashes)


def test_a02_duplicate_case_and_outer_whitespace_leave_all_records_unchanged(app, repository):
    register(app)
    before = state(repository)
    for username in ["new_member9", "NEW_MEMBER9", "  nEw_Member9  ", "\ufeffNew_Member9\ufeff"]:
        error(register(app, username, "DifferentPassword42!"), 409, "USERNAME_TAKEN", {"username"})
        assert state(repository) == before


def test_a02_concurrent_normalized_registration_has_one_complete_winner(app, repository):
    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            return await asyncio.gather(*[
                client.post("/api/v1/auth/register", json={"username": username, "password": PASSWORD})
                for username in ["Race_User", "race_user", " RACE_USER ", "\ufeffrace_user\u3000"] * 2
            ])
    responses = asyncio.run(run())
    assert [response.status_code for response in responses].count(201) == 1
    for response in responses:
        if response.status_code != 201:
            error(response, 409, "USERNAME_TAKEN", {"username"})
    stored = state(repository)
    assert len(stored.users) == len(stored.sessions) == len(stored.usernames) == 1
    winner = next(response.json() for response in responses if response.status_code == 201)
    assert request(app, "GET", "/api/v1/auth/me", headers=authorization(winner)).json() == winner["user"]


@pytest.mark.parametrize("username", ["", "  ", "ab", "x" * 31, "a b", "abc-def", "élève", "имя", "a😀b", "abc\ud800", None, True, 123, [], {}])
def test_a03_strict_username_pattern_and_types_no_partial_account(app, repository, username):
    before = state(repository)
    error(register(app, username), 422, "VALIDATION_ERROR", {"username"})
    assert state(repository) == before


@pytest.mark.parametrize("username", ["abc", "A" * 30, "abc_123"])
def test_a03_username_exact_valid_bounds(app, username):
    response = register(app, username)
    assert response.status_code == 201
    assert response.json()["user"]["username"] == username.lower()


@pytest.mark.parametrize("password", ["", "a" * 9, "a" * 129, None, False, 1234567890, [], {}, "\ud800" + "a" * 10, "a" * 10 + "\udfff"])
def test_a03_strict_password_types_bounds_and_surrogates(app, repository, password):
    before = state(repository)
    error(register(app, password=password), 422, "VALIDATION_ERROR", {"password"})
    assert state(repository) == before


def test_a03_missing_credentials_reports_both_fields(app, repository):
    error(send(app, "register", {}), 422, "VALIDATION_ERROR", {"username", "password"})
    error(send(app, "login", {"username": False, "password": []}), 422, "VALIDATION_ERROR", {"username", "password"})
    assert not state(repository).users and not state(repository).sessions


@pytest.mark.parametrize("kind", ["bmp", "astral", "mixed", "combining"])
@pytest.mark.parametrize("length", [9, 10, 128, 129])
def test_a03_unicode_code_point_password_limits(app, repository, kind, length):
    patterns = {
        "bmp": "é" * length,
        "astral": "😀" * length,
        "mixed": "a😀" * (length // 2) + ("a" if length % 2 else ""),
        "combining": "e\u0301" * (length // 2) + ("e" if length % 2 else ""),
    }
    password = patterns[kind]
    assert len(password) == length
    response = register(app, password=password)
    if length in {9, 129}:
        error(response, 422, "VALIDATION_ERROR", {"password"})
        assert not state(repository).users and not state(repository).sessions
    else:
        assert response.status_code == 201
        assert login(app, password=password).status_code == 200
        # Changing even the last code point must fail; a 512-byte valid password
        # must never be truncated to a hashing library's shorter byte limit.
        error(login(app, password=password[:-1] + "z"), 401, "INVALID_CREDENTIALS")


def test_a03_exact_ecmascript_trim_set_password_is_neither_trimmed_nor_normalized(app, repository):
    whitespace = "\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"
    password = "  e\u0301😀password  "
    response = register(app, whitespace + "Code_Point9" + whitespace, password)
    assert response.status_code == 201 and response.json()["user"]["username"] == "code_point9"
    assert login(app, "CODE_POINT9", password).status_code == 200
    import unicodedata
    for wrong in [password.strip(), unicodedata.normalize("NFC", password)]:
        error(login(app, "code_point9", wrong), 401, "INVALID_CREDENTIALS")
    before = state(repository)
    for character in ["\u001c", "\u001d", "\u001e", "\u001f", "\u0085", "\u180e", "\u200b"]:
        error(register(app, character + "another_user" + character), 422, "VALIDATION_ERROR", {"username"})
    assert state(repository) == before


@pytest.mark.parametrize("password", [" " * 10, "a\x00bcdefghi", "\ufeff" * 10])
def test_a03_valid_password_content_is_not_filtered_or_trimmed(app, password):
    assert register(app, password=password).status_code == 201
    assert login(app, password=password).status_code == 200


def test_a04_login_normalizes_identity_wrong_credentials_create_no_session(app, repository):
    first = register(app).json()
    response = login(app, " \ufeff NEW_MEMBER9 \u00a0")
    assert response.status_code == 200
    validate(response, "Session")
    assert response.json()["user"] == first["user"]
    assert response.json()["token"] != first["token"]
    before = state(repository)
    wrong_password = error(login(app, password="WrongPassword42!"), 401, "INVALID_CREDENTIALS")
    wrong_user = error(login(app, "unknown_member"), 401, "INVALID_CREDENTIALS")
    assert wrong_user == wrong_password
    error(login(app, password="short"), 422, "VALIDATION_ERROR", {"password"})
    assert state(repository) == before
    assert request(app, "GET", "/api/v1/auth/me", headers=authorization(first)).status_code == 200


def test_a05_logout_revokes_only_presented_session_and_is_bodyless(app, repository):
    first = register(app).json()
    second = login(app).json()
    other = register(app, "other_member").json()
    response = request(app, "POST", "/api/v1/auth/logout", headers=authorization(first))
    assert response.status_code == 204 and response.content == b""
    assert "content-type" not in response.headers
    before = state(repository)
    for operation, method in [("me", "GET"), ("logout", "POST")]:
        error(request(app, method, f"/api/v1/auth/{operation}", headers=authorization(first)), 401, "UNAUTHENTICATED")
    assert state(repository) == before
    for session in [second, other]:
        assert request(app, "GET", "/api/v1/auth/me", headers=authorization(session)).json() == session["user"]
    assert len(before.sessions) == 2


def test_a05_concurrent_logout_succeeds_once(app, repository):
    session = register(app).json()
    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            return await asyncio.gather(*[client.post("/api/v1/auth/logout", headers=authorization(session)) for _ in range(2)])
    responses = asyncio.run(run())
    assert sorted(response.status_code for response in responses) == [204, 401]
    assert not state(repository).sessions


def test_a06_absolute_24_hours_boundary_no_sliding_and_other_session_survives(app, repository, clock):
    first = register(app).json()
    clock.value += timedelta(hours=12)
    second = login(app).json()
    clock.value = NOW + timedelta(hours=24) - timedelta(microseconds=1)
    assert request(app, "GET", "/api/v1/auth/me", headers=authorization(first)).status_code == 200
    before = state(repository)
    clock.value += timedelta(microseconds=1)
    for operation, method in [("me", "GET"), ("logout", "POST")]:
        error(request(app, method, f"/api/v1/auth/{operation}", headers=authorization(first)), 401, "UNAUTHENTICATED")
    assert state(repository) == before
    assert request(app, "GET", "/api/v1/auth/me", headers=authorization(second)).status_code == 200
    clock.value += timedelta(days=5)
    error(request(app, "GET", "/api/v1/auth/me", headers=authorization(second)), 401, "UNAUTHENTICATED")


def test_a06_clock_offset_is_converted_to_utc_and_naive_clock_rolls_back(repository):
    clock = Clock(NOW.astimezone(timezone(timedelta(hours=5))))
    app = create_app(repository=repository, clock=clock, seed=False)
    response = register(app)
    assert datetime.fromisoformat(response.json()["expiresAt"].replace("Z", "+00:00")) == NOW + timedelta(hours=24)
    assert next(iter(state(repository).sessions.values())).expires_at.tzinfo is UTC
    before = state(repository)
    clock.value = NOW.replace(tzinfo=None)
    error(register(app, "naive_clock"), 500, "SERVICE_UNAVAILABLE")
    assert state(repository) == before


def test_a07_injected_server_owned_properties_are_ignored_and_roles_resolve_server_side(app, repository):
    session = register(app, role="coordinator", id="coordinator-id", userId="coordinator-id", ownerId="coordinator-id", actorId="coordinator-id", state="active", version=99, events=[{"role": "coordinator"}], token="client-token", expiresAt="2999-01-01T00:00:00Z", passwordHash="client-hash").json()
    assert session["user"]["role"] == "student" and session["user"]["id"] != "coordinator-id"
    assert session["token"] != "client-token" and not session["expiresAt"].startswith("2999")
    assert request(app, "GET", "/api/v1/auth/me", headers={**authorization(session), "X-Role": "coordinator", "X-User-Id": "coordinator-id"}).json() == session["user"]
    # A coordinator is created by trusted process setup alone, never a demo API.
    with repository.transaction() as transaction:
        transaction.add_user(User("trusted-staff", "trusted_staff", "coordinator", Argon2Passwords().hash(PASSWORD)))
    staff = login(app, "trusted_staff").json()
    assert staff["user"]["role"] == "coordinator"
    assert request(app, "GET", "/api/v1/auth/me", headers=authorization(staff)).json() == staff["user"]
    for path in ["/api/v1/auth/demo", "/api/v1/auth/coordinator", "/api/v1/demo/coordinator"]:
        error(request(app, "POST", path), 404, "NOT_FOUND")


@pytest.mark.parametrize("header", [None, "", "Bearer", "Bearer ", "Basic abc", "Bearer unknown", "Bearer a b", "Bearer abc,xyz", " Bearer abc", "Bearer abc\t"])
def test_absent_malformed_unknown_credentials_consistently_401(app, repository, header):
    register(app)
    before = state(repository)
    headers = {"Authorization": header} if header is not None else {}
    for operation, method in [("me", "GET"), ("logout", "POST")]:
        error(request(app, method, f"/api/v1/auth/{operation}", headers=headers, content=b"{malformed"), 401, "UNAUTHENTICATED")
    assert state(repository) == before


def test_authorization_scheme_is_case_insensitive_duplicate_headers_are_invalid(app):
    session = register(app).json()
    assert request(app, "GET", "/api/v1/auth/me", headers={"Authorization": "bEaReR " + session["token"]}).status_code == 200
    headers = [("Authorization", "Bearer " + session["token"]), ("Authorization", "Bearer " + session["token"])]
    error(request(app, "GET", "/api/v1/auth/me", headers=headers), 401, "UNAUTHENTICATED")


@pytest.mark.parametrize("operation", ["register", "login"])
@pytest.mark.parametrize("content,media_type", [
    (b"{}", None), (b"{}", "text/plain"), (b"{}", "application/problem+json"),
    (b"", "application/json"), (b"{", "application/json"), (b"[]", "application/json"),
    (b"null", "application/json"), (b'"text"', "application/json"), (b"42", "application/json"),
    (b'{"password": NaN}', "application/json"), (b'\xff', "application/json"),
    ('{"username":"alice"}'.encode("utf-16"), "application/json"),
])
def test_auth_json_envelope_is_strict_and_has_no_field_errors(app, repository, operation, content, media_type):
    before = state(repository)
    headers = {"Content-Type": media_type} if media_type else {}
    error(request(app, "POST", f"/api/v1/auth/{operation}", content=content, headers=headers), 422, "VALIDATION_ERROR")
    assert state(repository) == before


def test_json_media_type_case_parameters_and_utf8_and_bodyless_protected_routes(app):
    body = json.dumps({"username": "utf8_member", "password": "😀" * 10}, ensure_ascii=False).encode()
    response = request(app, "POST", "/api/v1/auth/register", content=body, headers={"Content-Type": "Application/JSON; charset=utf-8"})
    assert response.status_code == 201
    session = response.json()
    assert request(app, "GET", "/api/v1/auth/me", headers=authorization(session), content=b"{malformed").status_code == 200
    assert request(app, "POST", "/api/v1/auth/logout", headers=authorization(session), content=b"{malformed").status_code == 204


def test_framework_unknown_slash_variants_and_wrong_method_preserve_error_and_allow(app):
    for path in ["/missing", "/health/", "/api/v1/auth/me/", "/api/v1/auth/register/"]:
        response = request(app, "GET", path)
        error(response, 404, "NOT_FOUND")
        assert "location" not in response.headers
    for method, path, allowed in [("GET", "/api/v1/auth/register", "POST"), ("POST", "/api/v1/auth/me", "GET"), ("DELETE", "/health", "GET")]:
        response = request(app, method, path)
        error(response, 405, "NOT_FOUND")
        assert allowed in {item.strip() for item in response.headers["Allow"].split(",")}


def test_framework_validation_handler_maps_only_contract_field_names_and_never_echoes_input(app, caplog):
    @app.get("/__test/query")
    def probe(password: int):
        return {}

    @app.post("/__test/body")
    def probe_body(body: dict = Body()):
        return {}

    error(request(app, "GET", "/__test/query", params={"password": PASSWORD}), 422, "VALIDATION_ERROR", {"password"})
    response = request(app, "POST", "/__test/body", content="{secret-malformed", headers={"Content-Type": "application/json"})
    error(response, 422, "VALIDATION_ERROR")
    assert PASSWORD not in response.text and "secret-malformed" not in response.text
    assert PASSWORD not in caplog.text and "secret-malformed" not in caplog.text


class FailingRepository:
    """Controlled adapter fault after a real write, inside the real transaction."""
    def __init__(self, underlying):
        self.underlying = underlying
        self.fail_after = None
        self.secret_detail = ""

    @contextmanager
    def transaction(self):
        owner = self
        with self.underlying.transaction() as transaction:
            class Fault:
                def __getattr__(self, name):
                    member = getattr(transaction, name)
                    if name != owner.fail_after:
                        return member
                    def fail(*args, **kwargs):
                        member(*args, **kwargs)
                        raise RuntimeError(owner.secret_detail)
                    return fail
            yield Fault()


@pytest.mark.parametrize("operation,fail_after", [("register", "add_user"), ("register", "add_session"), ("login", "add_session"), ("logout", "delete_session")])
def test_unexpected_failures_roll_back_all_writes_and_never_log_credentials(repository, clock, caplog, operation, fail_after):
    faulty = FailingRepository(repository)
    app = create_app(repository=faulty, clock=clock, seed=False)
    session = register(app).json()
    stored = state(repository)
    password_hash = next(iter(stored.users.values())).password_hash
    token_hash = next(iter(stored.sessions))
    raw_body = json.dumps({"username": "failed_member", "password": PASSWORD})
    secrets = [PASSWORD, session["token"], password_hash, token_hash, raw_body, "secret exception detail"]
    faulty.fail_after = fail_after
    faulty.secret_detail = " | ".join(secrets)
    if operation == "register":
        response = register(app, "failed_member")
    elif operation == "login":
        response = login(app)
    else:
        response = request(app, "POST", "/api/v1/auth/logout", headers=authorization(session))
    error(response, 500, "SERVICE_UNAVAILABLE")
    assert state(repository) == stored
    for secret in secrets:
        assert secret not in response.text and secret not in caplog.text
    failures = [record for record in caplog.records if record.name == "gearshare.api"]
    assert len(failures) == 1 and failures[0].exc_info is None
    assert failures[0].getMessage() == "Unexpected API failure; operation aborted."
    faulty.fail_after = None
    assert request(app, "GET", "/api/v1/auth/me", headers=authorization(session)).status_code == 200
    if operation == "register":
        assert register(app, "failed_member").status_code == 201


def test_fresh_memory_process_state_has_no_previous_accounts_or_sessions(app):
    session = register(app).json()
    fresh_app = create_app(clock=Clock(), seed=False)
    error(login(fresh_app), 401, "INVALID_CREDENTIALS")
    error(request(fresh_app, "GET", "/api/v1/auth/me", headers=authorization(session)), 401, "UNAUTHENTICATED")
