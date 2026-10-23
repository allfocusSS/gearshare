"""Exact decoded route templates and complete method-denial headers."""

from fastapi.routing import APIRoute, iter_route_contexts
from starlette._utils import get_route_path
from starlette.exceptions import HTTPException
from starlette.routing import Match
from starlette.types import Receive, Scope, Send


class ExactRoute(APIRoute):
    def matches(self, scope: Scope) -> tuple[Match, Scope]:
        # Python's `$` also matches before a final LF. Require the entire path;
        # ordinary string components retain LF inside IDs and forbid slashes.
        if scope["type"] == "http" and self.path_regex.fullmatch(get_route_path(scope)) is None:
            return Match.NONE, {}
        return super().matches(scope)

    async def handle(self, scope: Scope, receive: Receive, send: Send) -> None:
        if self.methods and scope["method"] not in self.methods:
            # Included routers are wrappers. Traverse their concrete contexts so
            # every operation at this exact template contributes its methods.
            allowed = {method for route in iter_route_contexts(scope["app"].router.routes)
                       if isinstance(route.original_route, APIRoute) and route.path == self.path
                       for method in route.methods or ()}
            raise HTTPException(status_code=405, headers={"Allow": ", ".join(sorted(allowed))})
        await super().handle(scope, receive, send)
