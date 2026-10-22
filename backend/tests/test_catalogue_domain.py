"""Catalogue domain/repository contracts without HTTP or adapter internals."""

from contextlib import contextmanager
from dataclasses import FrozenInstanceError, replace
from datetime import timedelta

import pytest

from app.catalogue import CatalogueService
from app.domain import Asset, User
from app.fixtures import add_fixture_booking, seed_catalogue
from app.main import create_app
from app.memory import MemoryRepository
from app.text import default_lower
from test_catalogue_api import Clock, NOW, TODAY, filtered, ids


def test_domain_reads_use_repository_protocol_and_explicit_public_projection():
    asset = Asset("unit", "OR-01", "Original Unit", "Accessories", "Fictional equipment", "Club shelf")
    class ReadRepository:
        calls = []
        @contextmanager
        def transaction(self):
            self.calls.append("transaction")
            owner = self
            class ReadTransaction:
                def assets(self):
                    owner.calls.append("assets")
                    return (asset,)
                def asset_by_id(self, asset_id):
                    owner.calls.append(("asset", asset_id))
                    return asset
                def occupied_days(self, asset_id, start, end):
                    owner.calls.append(("occupied", asset_id, start, end))
                    return frozenset({TODAY})
            yield ReadTransaction()
    repository = ReadRepository()
    service = CatalogueService(repository, Clock())
    assert service.list_assets({})["items"] == [asset.public()]
    assert service.get_asset("unit") == asset.public()
    result = service.get_asset_availability("unit")
    assert result["days"][0]["state"] == "occupied" and result["days"][1]["state"] == "available"
    assert repository.calls.count("transaction") == 3
    assert ("occupied", "unit", TODAY, TODAY + timedelta(days=90)) in repository.calls
    assert service.list_assets({"startDate": TODAY.isoformat(), "endDate": TODAY.isoformat()})["items"] == []


def test_memory_order_unique_identity_and_case_insensitive_inventory_codes():
    repository = MemoryRepository()
    first = Asset("z-created-first", "CODE-1", "First Unit", "Audio", "Fictional equipment", "Club shelf")
    second = replace(first, id="a-created-second", inventory_code="CODE-2")
    with repository.transaction() as transaction:
        transaction.add_asset(first)
        transaction.add_asset(second)
    for duplicate in (replace(first, inventory_code="OTHER"), replace(first, id="third", inventory_code="code-1")):
        with pytest.raises(ValueError), repository.transaction() as transaction:
            transaction.add_asset(duplicate)
    with repository.transaction() as transaction:
        assert transaction.assets() == (first, second)
        assert transaction.asset_by_id("missing") is None
        with pytest.raises(FrozenInstanceError):
            transaction.assets()[0].name = "Changed"
    response = CatalogueService(repository, Clock()).list_assets({"search": "Unit"})
    assert ids(response) == [first.id, second.id]
    response["items"][0]["name"] = "Changed DTO"
    assert CatalogueService(repository, Clock()).get_asset(first.id)["name"] == first.name


def test_one_memory_transaction_rolls_back_auth_inventory_schedule_and_seed_marker_together():
    repository = MemoryRepository()
    asset = Asset("unit", "UN-01", "Original Unit", "Accessories", "Fictional equipment", "Club shelf")
    user = User("user", "student", "student", "trusted-test-hash")
    with pytest.raises(RuntimeError), repository.transaction() as transaction:
        transaction.add_user(user)
        transaction.add_asset(asset)
        add_fixture_booking(transaction, booking_id="schedule", asset=asset, owner=user, coordinator=user, start=TODAY, end=TODAY, state="pending", now=NOW)
        transaction.mark_catalogue_seeded(TODAY)
        raise RuntimeError("Controlled setup failure")
    with repository.transaction() as transaction:
        assert not transaction.assets() and transaction.user_by_id(user.id) is None
        assert not transaction.occupied_days(asset.id, TODAY, TODAY)
        assert transaction.catalogue_seeded_on() is None
    seed_catalogue(repository, Clock())
    with repository.transaction() as transaction:
        assert len(transaction.assets()) == 10 and transaction.catalogue_seeded_on() == TODAY


def test_retained_setup_transaction_and_public_dto_cannot_mutate_published_store():
    repository = MemoryRepository()
    asset = Asset("unit", "UN-01", "Original Unit", "Accessories", "Fictional equipment", "Club shelf")
    with repository.transaction() as transaction:
        transaction.add_asset(asset)
    transaction.add_asset(replace(asset, id="later", inventory_code="UN-02"))
    with repository.transaction() as current:
        assert current.assets() == (asset,)


def test_failed_seed_rolls_back_all_units_and_can_be_retried():
    underlying = MemoryRepository()
    class FaultySeed:
        @contextmanager
        def transaction(self):
            with underlying.transaction() as real:
                class Fault:
                    def __getattr__(self, name):
                        if name != "add_slot":
                            return getattr(real, name)
                        def fail(slot):
                            real.add_slot(slot)
                            raise RuntimeError("Controlled failure after slot insertion")
                        return fail
                yield Fault()
    with pytest.raises(RuntimeError):
        seed_catalogue(FaultySeed(), Clock())
    with underlying.transaction() as transaction:
        assert transaction.assets() == () and transaction.catalogue_seeded_on() is None
        assert not transaction.occupied_days("camera-01", TODAY, TODAY + timedelta(days=90))
        assert not transaction.bookings()
    seed_catalogue(underlying, Clock())
    assert len(CatalogueService(underlying, Clock()).list_assets({})["items"]) == 10


@pytest.mark.parametrize("name,query,match", [
    ("Straße", "STRASSE", False),  # No casefold expansion.
    ("Straße", "straße", True),
    ("Café", "Cafe\u0301", False),  # No Unicode normalization or accent folding.
    ("Café", "CAFÉ", True),
    ("İstanbul", "i\u0307stanbul", True),  # Default, locale-independent expansion.
    ("İstanbul", "istanbul", False),
    ("ΟΣ", "ος", True),  # Context-sensitive final sigma.
    ("ΟΣ", "οσ", False),
    ("Field  Camera", "field camera", False),
    ("Camera", "\ufeff CAMERA \u00a0", True),
    ("Camera", "\u0085camera", False),
    ("\u1c89 Unit", "\u1c8a unit", True),  # New Cyrillic lowercase (Unicode16).
    ("\U00010d50 Unit", "\U00010d70 unit", True),  # Garay (16).
    ("\U00016ea0 Unit", "\U00016ebb unit", True),  # Beria Erfe (17).
    ("\U00016ea0Σ", "\U00016ebbς", True),  # New Cased before sigma.
    ("AΣ\U00016ea0", "aσ\U00016ebb", True),  # New Cased after sigma.
    ("AΣ\U0001e6e3B", "aσ\U0001e6e3b", True),  # New Case_Ignorable.
    ("AΣ\U0001171eB", "aς\U0001171eb", True),  # Ceased Case_Ignorable.
    ("\u0295Σ", "\u0295σ", True),  # Ceased Cased.
])
def test_search_default_unicode_lowercase_and_literal_boundaries_through_api(name, query, match):
    repository = MemoryRepository()
    with repository.transaction() as transaction:
        transaction.add_asset(Asset("unit", "UN-01", name, "Cameras", "Fictional equipment", "Club shelf"))
    app = create_app(repository=repository, clock=Clock(), seed=False)
    assert ids(filtered(app, search=query)) == (["unit"] if match else [])


@pytest.mark.parametrize("value,expected", [
    ("AΣ'", "aς'"), ("AΣ'B", "aσ'b"), ("\u1c89Σ", "\u1c8aς"),
    ("AΣ\u1c89", "aσ\u1c8a"), ("AΣ\u0295", "aς\u0295"),
    ("AΣ\ua7f1B", "aσ\ua7f1b"), ("Σ", "σ"), ("AΣΣ", "aσς"),
])
def test_default_lower_context_includes_ignorable_and_changed_unicode_properties(value, expected):
    assert default_lower(value) == expected
