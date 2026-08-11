"""
The agreement templates, read from `templates/` and indexed by `catalog.json`.

Nothing calls these yet: the frontend still reads the markdown directly when it
is built, and this ticket deliberately leaves that alone. They exist so that the
work which cannot read the filesystem — the AI chat, and any server-side
rendering — has a way to reach the templates that does not involve copying them.

Templates are addressed by slug (`mutual-nda`), taken from the filename rather
than the display name, because a URL containing `Mutual NDA` is a nuisance.
"""

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.deps import SettingsDep

router = APIRouter(prefix="/templates", tags=["templates"])


class TemplateSummary(BaseModel):
    """A catalog entry, without the agreement text."""

    slug: str
    name: str
    description: str
    filename: str


class TemplateDetail(TemplateSummary):
    """A catalog entry and the markdown it points at."""

    content: str


@lru_cache
def _load_catalog(catalog_path: Path) -> list[dict[str, Any]]:
    """
    The catalog, keyed by slug and read once.

    Cached because the file ships with the repository and cannot change while
    the process runs.
    """
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    return [
        {"slug": Path(entry["filename"]).stem, **entry}
        for entry in catalog["templates"]
    ]


@router.get("", response_model=list[TemplateSummary])
def list_templates(settings: SettingsDep) -> list[dict[str, Any]]:
    return _load_catalog(settings.catalog_path)


@router.get("/{slug}", response_model=TemplateDetail)
def get_template(slug: str, settings: SettingsDep) -> dict[str, Any]:
    entry = next(
        (item for item in _load_catalog(settings.catalog_path) if item["slug"] == slug),
        None,
    )
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"No template '{slug}'"
        )

    # Resolved from the catalog's own filename, which is relative to the
    # repository root. A template can only be read if the catalog already lists
    # it, so the slug never reaches the filesystem.
    path = settings.repo_root / entry["filename"]
    return {**entry, "content": path.read_text(encoding="utf-8")}
