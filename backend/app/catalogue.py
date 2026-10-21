"""Public catalogue reads through a repository, with one local date per read."""

from collections.abc import Mapping
from datetime import timedelta

from app.calendar import HORIZON_DAYS, TIME_ZONE, club_today, date_range
from app.conventions import Clock, ECMASCRIPT_TRIM, utc_now
from app.domain import CATEGORIES
from app.errors import ApiError
from app.repositories import CatalogueRepository
from app.text import default_lower


def missing_asset() -> ApiError:
    return ApiError(404, "NOT_FOUND", "This equipment could not be found. Return to Explore to choose another physical unit.")


class CatalogueService:
    def __init__(self, repository: CatalogueRepository, clock: Clock = utc_now) -> None:
        self.repository = repository
        self.clock = clock

    def list_assets(self, filters: Mapping[str, str]) -> dict:
        today = club_today(self.clock)
        selected = date_range(filters.get("startDate"), filters.get("endDate"), today)
        category = filters.get("category")
        # Match the mock's date-validation-before-category order. Unlike an
        # omitted category, a supplied empty string is not a frozen enum value.
        if category is not None and category not in CATEGORIES:
            raise ApiError(422, "VALIDATION_ERROR", "Choose a listed category.", fields={"category": "Choose a listed category."})
        search = default_lower(filters.get("search", "").strip(ECMASCRIPT_TRIM))
        items = []
        with self.repository.transaction() as transaction:
            for asset in transaction.assets():
                if category is not None and asset.category != category:
                    continue
                haystack = default_lower(" ".join((asset.name, asset.inventory_code, asset.category, asset.description, asset.location)))
                if search and search not in haystack:
                    continue
                if selected and (asset.state == "maintenance" or transaction.occupied_days(asset.id, *selected)):
                    continue
                items.append(asset.public())
        return {
            "items": items,
            "range": {"startDate": selected[0].isoformat(), "endDate": selected[1].isoformat()} if selected else None,
            "today": today.isoformat(), "horizonEnd": (today + timedelta(days=HORIZON_DAYS)).isoformat(),
        }

    def get_asset(self, asset_id: str) -> dict[str, str]:
        with self.repository.transaction() as transaction:
            asset = transaction.asset_by_id(asset_id)
            if asset is None:
                raise missing_asset()
            return asset.public()

    def get_asset_availability(self, asset_id: str) -> dict:
        today = club_today(self.clock)
        horizon = today + timedelta(days=HORIZON_DAYS)
        with self.repository.transaction() as transaction:
            asset = transaction.asset_by_id(asset_id)
            if asset is None:
                raise missing_asset()
            occupied = transaction.occupied_days(asset_id, today, horizon)
            return {
                "assetId": asset.id, "today": today.isoformat(), "horizonEnd": horizon.isoformat(), "timeZone": TIME_ZONE,
                "days": [
                    {"date": day.isoformat(), "state": "maintenance" if asset.state == "maintenance" else "occupied" if day in occupied else "available"}
                    for offset in range(HORIZON_DAYS + 1) for day in (today + timedelta(days=offset),)
                ],
            }
