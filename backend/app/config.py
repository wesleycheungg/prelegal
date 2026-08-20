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
    # `catalog.json` names its files relative to the repository root, so that
    # root is a setting too rather than something recomputed from the others.
    repo_root: Path = REPO_ROOT
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

    # The AI chat. Without a key the chat endpoint reports itself unconfigured
    # rather than failing at the point of use; everything else still runs.
    openrouter_api_key: str = ""

    # Every turn resends the whole conversation, so the cost of a request grows
    # with its length. These bound what one request can spend: a long
    # conversation is refused rather than quietly becoming expensive, and a
    # runaway client cannot run up a bill one enormous request at a time.
    # A saved agreement is a map of field values. Generous next to any real
    # document, and small enough that a client cannot fill the disk with one.
    document_max_bytes: int = 256 * 1024

    chat_max_messages: int = 40
    chat_max_message_chars: int = 4000
    chat_max_tokens: int = 800
    chat_timeout_seconds: int = 30


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
