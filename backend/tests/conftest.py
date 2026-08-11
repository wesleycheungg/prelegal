"""
Fixtures for the API tests.

Every test gets its own database file in a temporary directory, built by the
same `reset_database` the server runs at startup rather than by a fixture that
reimplements the schema — a fixture that drifted from `schema.sql` would prove
nothing.

The templates and catalog are the real ones from the repository, for the same
reason the frontend's tests read the real markdown: the point of the endpoints
is to cope with those files.
"""

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import REPO_ROOT, Settings
from app.main import create_app

PASSWORD = "correct-horse-battery"


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        database_path=tmp_path / "test.db",
        # Nothing is built during a test run, so this deliberately does not
        # exist: the API must serve itself without a frontend.
        static_dir=tmp_path / "no-frontend-build",
        templates_dir=REPO_ROOT / "templates",
        catalog_path=REPO_ROOT / "catalog.json",
        # Long enough that PyJWT does not warn about the HMAC key length.
        secret_key="test-secret-key-long-enough-for-sha256",
    )


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    """A client whose lifespan has run, so the database exists."""
    with TestClient(create_app(settings)) as client:
        yield client


@pytest.fixture
def signed_in(client: TestClient) -> TestClient:
    """A client holding the session cookie of a freshly registered user."""
    response = client.post(
        "/api/auth/signup", json={"email": "ada@example.com", "password": PASSWORD}
    )
    assert response.status_code == 201
    return client
