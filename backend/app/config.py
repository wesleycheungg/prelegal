"""
Settings, and the paths to everything outside `backend/`.

Paths are resolved from this file's own location rather than the working
directory, so the server behaves the same whether it is started from the
repository root, from `backend/`, or from `/app` inside the container. The
frontend resolves `templates/` from `process.cwd()` instead and so must be run
from `frontend/`; that is a constraint worth not repeating here.
"""

import secrets
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

#  backend/app/config.py -> backend/app -> backend -> the repository root.
REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """
    Configuration, read from the environment and the repository root `.env`.

    One `.env` for the whole project rather than one per package, so a key set
    once is visible to the backend and to any tooling beside it.
    """

    model_config = SettingsConfigDict(
        env_file=REPO_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Where the agreement markdown and its index live. The templates are the
    # single source of truth for wording, so the API reads them in place.
    templates_dir: Path = REPO_ROOT / "templates"
    catalog_path: Path = REPO_ROOT / "catalog.json"

    # The frontend's static export. Absent until `npm run build` has run, which
    # is why mounting it is conditional — see `app.main`.
    static_dir: Path = REPO_ROOT / "frontend" / "out"

    # Deleted and recreated on every start: this database is a scratch space,
    # not a store of record. See `app.db.reset_database`.
    database_path: Path = REPO_ROOT / "backend" / "data" / "prelegal.db"

    # Signs session cookies. Generated per process when unset, which is safe
    # only because the users it authenticates are themselves discarded on every
    # restart. A deployment that keeps its data must set this.
    secret_key: str = ""

    session_cookie_name: str = "prelegal_session"
    session_max_age_seconds: int = 24 * 60 * 60

    # Marks the cookie `Secure`. Off by default because the foundation runs on
    # plain-HTTP localhost, where a Secure cookie would simply be dropped.
    session_cookie_secure: bool = False

    # Unused until the AI chat lands, and read now only so that a missing key is
    # discovered by configuration rather than by a failing request later.
    openrouter_api_key: str = ""


@lru_cache
def get_settings() -> Settings:
    """
    The process's settings, read once.

    Cached because `Settings()` re-reads `.env` on every call, and because tests
    override this through FastAPI's dependency graph rather than by reaching for
    a module-level global.
    """
    settings = Settings()

    if not settings.secret_key:
        settings.secret_key = secrets.token_urlsafe(32)

    return settings
