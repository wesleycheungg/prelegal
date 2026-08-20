"""
The application: the API under `/api`, and the built frontend under everything
else.

One process serving both means one origin, so the browser needs no CORS
preflight and the session cookie is a first-party cookie. It also means the
order of registration in `create_app` is load-bearing.
"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import Settings, get_settings
from app.db import reset_database
from app.routers import auth, chat, documents, health, templates

logger = logging.getLogger(__name__)


class ExportedSite(StaticFiles):
    """
    Serves a Next.js static export.

    `next build` writes the `/sign-in` route as `sign-in.html`, and separately a
    `sign-in/` directory holding the payloads the client router fetches. Given
    `/sign-in`, Starlette finds that directory, looks inside it for an
    `index.html` that the export does not write, and answers 404 — so every
    route but `/` would be unreachable by URL.

    Falling back to `<path>.html` is what a static host does with an export like
    this, and what the export is built expecting.
    """

    async def get_response(self, path: str, scope: Any) -> Response:
        response = await self._try(path, scope)
        if response.status_code != 404 or path.endswith(".html"):
            return response

        exported = await self._try(f"{path}.html", scope)
        return exported if exported.status_code == 200 else response

    async def _try(self, path: str, scope: Any) -> Response:
        """
        A miss as a 404 response rather than an exception.

        Starlette does one or the other depending on whether the directory
        happens to contain a `404.html` — which this one does, since the export
        writes one — so both have to be treated the same to look for the
        fallback at all.
        """
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as missing:
            if missing.status_code != 404:
                raise
            return Response(status_code=404)


def create_app(settings: Settings | None = None) -> FastAPI:
    """
    Build the application.

    Takes settings so that tests can point the database and the frontend build
    somewhere temporary without touching the environment.
    """
    resolved = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        # Before the first request is accepted, so a reply from /api/health
        # already means the schema is in place.
        reset_database(resolved.database_path)
        logger.info("Rebuilt the database at %s", resolved.database_path)
        yield

    # Docs live on the API sub-application at /api/docs; there is nothing to
    # document out here, and /docs would only compete with the frontend.
    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

    if settings is not None:
        app.dependency_overrides[get_settings] = lambda: resolved

    app.mount("/api", _create_api(resolved))
    _mount_frontend(app, resolved)

    return app


def _create_api(settings: Settings) -> FastAPI:
    """
    The JSON API, as a sub-application rather than a router.

    Mounting it keeps its error handling its own: a missing template returns a
    JSON 404 from in here, and never the frontend's HTML 404 page that the
    handler below would otherwise supply.
    """
    api = FastAPI(
        title="Prelegal API",
        description="Draft legal agreements from Common Paper templates.",
    )

    api.include_router(health.router)
    api.include_router(templates.router)
    api.include_router(auth.router)
    api.include_router(documents.router)
    api.include_router(chat.router)

    # Sub-applications do not inherit the parent's overrides, so tests reach
    # this one through the same object the parent was built with.
    api.dependency_overrides[get_settings] = lambda: settings

    return api


def _mount_frontend(app: FastAPI, settings: Settings) -> None:
    """
    Serve the frontend's static export, if it has been built.

    Conditional so the API can be run and tested on its own — `uv run pytest`
    and `uvicorn --reload` should not depend on `npm run build` having happened.
    Mounted at `/`, which matches every path, so this must come last.
    """
    if not settings.static_dir.is_dir():
        logger.warning(
            "No frontend build at %s; serving the API only. Run `npm run build` "
            "in frontend/ to serve the app as well.",
            settings.static_dir,
        )
        return

    not_found_page = settings.static_dir / "404.html"

    if not_found_page.is_file():

        @app.exception_handler(404)
        async def not_found(request: Request, exc: Exception) -> FileResponse:
            """Answer an unknown path with the frontend's own 404 page."""
            return FileResponse(not_found_page, status_code=404)

    app.mount(
        "/", ExportedSite(directory=settings.static_dir, html=True), name="frontend"
    )


app = create_app()
