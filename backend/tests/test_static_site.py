"""
Serving the frontend's static export.

Every test elsewhere runs without a build, which is deliberate — the API should
not need `npm run build` to have happened. That leaves how the built site is
served untested, and it is not obvious: `next build` writes a route as
`sign-in.html` *and* as a `sign-in/` directory of client-router payloads, so the
directory is what a plain static mount finds and there is no `index.html` in it.
Every route but `/` answered 404 until this was handled.

The export is stubbed rather than built, so these stay fast and need no Node.
"""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import REPO_ROOT, Settings
from app.main import create_app


@pytest.fixture
def site(tmp_path: Path) -> Path:
    """A directory shaped the way `next build` shapes one."""
    out = tmp_path / "out"
    (out / "sign-in").mkdir(parents=True)
    (out / "index.html").write_text("<title>Draft an agreement</title>")
    (out / "sign-in.html").write_text("<title>Sign in</title>")
    # What actually lives in the route's directory: payloads, no index.html.
    (out / "sign-in" / "__next._tree.txt").write_text("payload")
    (out / "404.html").write_text("<title>Not found</title>")
    return out


@pytest.fixture
def served(site: Path, tmp_path: Path) -> TestClient:
    settings = Settings(
        database_path=tmp_path / "test.db",
        static_dir=site,
        templates_dir=REPO_ROOT / "templates",
        catalog_path=REPO_ROOT / "catalog.json",
        secret_key="test-secret-key-long-enough-for-sha256",
    )
    with TestClient(create_app(settings)) as client:
        yield client


def test_the_home_page_is_served(served: TestClient) -> None:
    response = served.get("/")

    assert response.status_code == 200
    assert "Draft an agreement" in response.text


def test_a_route_is_served_from_its_html_file(served: TestClient) -> None:
    """The case that was broken: a directory of the same name shadows it."""
    response = served.get("/sign-in")

    assert response.status_code == 200
    assert "Sign in" in response.text


def test_the_payloads_inside_a_route_directory_are_still_reachable(
    served: TestClient,
) -> None:
    # The client router fetches these when navigating.
    response = served.get("/sign-in/__next._tree.txt")

    assert response.status_code == 200
    assert response.text == "payload"


def test_an_unknown_path_gets_the_apps_own_404(served: TestClient) -> None:
    response = served.get("/nope")

    assert response.status_code == 404
    assert "Not found" in response.text


def test_the_api_is_not_shadowed_by_the_site(served: TestClient) -> None:
    """`/` matches everything, so the API has to be found first."""
    assert served.get("/api/health").status_code == 200


def test_an_unknown_api_path_stays_json(served: TestClient) -> None:
    # A 404 from inside the API should not answer with the frontend's page.
    response = served.get("/api/nope")

    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/json")
