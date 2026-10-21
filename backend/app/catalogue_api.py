"""Three frozen anonymous HTTP catalogue reads; no mutation endpoints."""

from fastapi import APIRouter, Depends, Request

from app.catalogue import CatalogueService

router = APIRouter(prefix="/api/v1/assets")


def service(request: Request) -> CatalogueService:
    return request.app.state.catalogue


@router.get("")
def list_assets(request: Request, catalogue: CatalogueService = Depends(service)) -> dict:
    # Collapse scalar repeats in URL order before validation. Unknown query keys
    # are ignored by the service, including attempted identity/state injection.
    return catalogue.list_assets(dict(request.query_params.multi_items()))


@router.get("/{asset_id}")
def get_asset(asset_id: str, catalogue: CatalogueService = Depends(service)) -> dict:
    # Do not declare path validation: every unknown/malformed id is a safe 404.
    return catalogue.get_asset(asset_id)


@router.get("/{asset_id}/availability")
def get_asset_availability(asset_id: str, catalogue: CatalogueService = Depends(service)) -> dict:
    return catalogue.get_asset_availability(asset_id)
