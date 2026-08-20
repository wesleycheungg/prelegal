"""
The agreements this app can create, read from the catalog and the templates.

A document is a cover page paired with the Standard Terms of the same name —
`mutual-nda-cover-page.md` with `mutual-nda.md` — which is the convention
Common Paper's own two-part agreements already follow, and the same pairing
`frontend/lib/templates.ts` makes at build time.

Read from disk on first use and cached: the files ship with the repository and
cannot change while the process runs.
"""

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from app.field_schema import DocumentSchema, parse_document_schema

COVER_PAGE_SUFFIX = "-cover-page"


@dataclass(frozen=True)
class Document:
    slug: str
    title: str
    description: str
    schema: DocumentSchema
    """The cover page markdown, quoted into the prompt rather than restated."""
    cover_page: str


@lru_cache
def load_documents(catalog_path: Path, templates_dir: Path) -> dict[str, Document]:
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))["templates"]
    by_slug = {Path(entry["filename"]).stem: entry for entry in catalog}

    documents: dict[str, Document] = {}

    for stem, entry in by_slug.items():
        if not stem.endswith(COVER_PAGE_SUFFIX):
            continue

        slug = stem[: -len(COVER_PAGE_SUFFIX)]
        terms = by_slug.get(slug)
        if terms is None:
            raise ValueError(
                f"{entry['filename']} has no matching {slug}.md in the catalog"
            )

        markdown = (templates_dir / f"{stem}.md").read_text(encoding="utf-8")
        schema = parse_document_schema(markdown)
        documents[slug] = Document(
            slug=slug,
            # The cover page's own title is what the finished document is
            # called; the catalog entry for the terms says what it is for.
            title=schema.title,
            description=terms["description"],
            schema=schema,
            cover_page=markdown,
        )

    return documents
