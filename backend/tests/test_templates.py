"""
The template endpoints, checked against the real `templates/` and `catalog.json`.

Nothing in the product calls these yet. They are tested to the same standard
anyway, because the first thing that does call them will be the AI chat, and a
template served wrong there becomes wrong wording in a signed agreement.
"""

import json

from fastapi.testclient import TestClient

from app.config import REPO_ROOT


def test_lists_every_template_in_the_catalog(client: TestClient) -> None:
    catalog = json.loads((REPO_ROOT / "catalog.json").read_text(encoding="utf-8"))

    response = client.get("/api/templates")

    assert response.status_code == 200
    assert len(response.json()) == len(catalog["templates"])


def test_derives_the_slug_from_the_filename(client: TestClient) -> None:
    slugs = [item["slug"] for item in client.get("/api/templates").json()]

    assert "mutual-nda" in slugs
    assert "mutual-nda-cover-page" in slugs


def test_omits_the_agreement_text_from_the_list(client: TestClient) -> None:
    # The catalog is an index. Serving twelve full agreements to describe them
    # would make the list useless for the one thing it is for.
    assert "content" not in client.get("/api/templates").json()[0]


def test_serves_the_markdown_a_template_points_at(client: TestClient) -> None:
    response = client.get("/api/templates/mutual-nda")

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Mutual NDA Standard Terms"
    assert body["filename"] == "templates/mutual-nda.md"
    assert body["content"] == (REPO_ROOT / "templates" / "mutual-nda.md").read_text(
        encoding="utf-8"
    )


def test_rejects_an_unknown_slug(client: TestClient) -> None:
    response = client.get("/api/templates/not-a-template")

    assert response.status_code == 404
    # JSON, not the frontend's HTML error page — the API is mounted as its own
    # application precisely so this stays true.
    assert response.json()["detail"] == "No template 'not-a-template'"


def test_refuses_to_walk_out_of_the_templates_directory(client: TestClient) -> None:
    # The slug only ever selects a catalog entry; it is never joined onto a
    # path, so a traversal attempt is just a slug that matches nothing.
    response = client.get("/api/templates/..%2F..%2Fcatalog")

    assert response.status_code == 404
