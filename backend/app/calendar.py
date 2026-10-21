"""Inclusive club calendar policy, backed by the locked timezone database."""

import re
from datetime import date, timedelta
from importlib.resources import files
from zoneinfo import ZoneInfo

from app.conventions import Clock, clock_instant
from app.errors import ApiError

TIME_ZONE = "Asia/Almaty"
# ZoneInfo(key) prefers the host database, which may predate Almaty's 2024 move.
# Load our locked tzdata package explicitly, including on slim/stale hosts.
with files("tzdata.zoneinfo").joinpath(TIME_ZONE).open("rb") as zone_file:
    CLUB_ZONE = ZoneInfo.from_file(zone_file, key=TIME_ZONE)

CALENDAR_DATE = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")
HORIZON_DAYS = 90
MAX_RANGE_DAYS = 14


def club_today(clock: Clock) -> date:
    return clock_instant(clock).astimezone(CLUB_ZONE).date()


def parse_date(value: str | None) -> date | None:
    if value is None or CALENDAR_DATE.fullmatch(value) is None:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def date_range(start: str | None, end: str | None, today: date) -> tuple[date, date] | None:
    # Only an omitted or exactly empty value is absent; dates are never trimmed.
    if start in (None, "") and end in (None, ""):
        return None
    start_date, end_date = parse_date(start), parse_date(end)
    fields = {}
    if start_date is None:
        fields["startDate"] = "Choose a valid start date."
    if end_date is None:
        fields["endDate"] = "Choose a valid end date."
    if not fields:
        if start_date < today:
            fields["startDate"] = "Start on or after the club date today."
        if end_date < start_date:
            fields["endDate"] = "End on or after the start date."
        elif (end_date - start_date).days + 1 > MAX_RANGE_DAYS:
            fields["endDate"] = "Choose at most 14 inclusive days."
        horizon = today + timedelta(days=HORIZON_DAYS)
        if start_date > horizon:
            fields["startDate"] = "Choose a date within the next 90 days."
        if end_date > horizon:
            fields["endDate"] = "Choose a date within the next 90 days."
    if fields:
        raise ApiError(422, "VALIDATION_ERROR", "Check the date range before viewing availability.", fields=fields)
    return start_date, end_date
