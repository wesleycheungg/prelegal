"""
Saved documents.

The tests that matter most here are the ones about other people's documents:
everything under `/api/documents` is scoped to the signed-in user, and the
failure that would matter is one account being able to see or change another's.
"""

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

VALUES: dict[str, Any] = {
    "fields": {"purpose": "Evaluating a partnership.", "governing_law": "Delaware"},
    "choices": {"mnda_term": {"index": 0, "number": "2"}},
    "party1": {"company": "Acme Inc.", "name": "", "title": "", "noticeAddress": ""},
    "party2": {"company": "Globex Ltd.", "name": "", "title": "", "noticeAddress": ""},
}


def _save(client: TestClient, **overrides: Any):
    return client.post(
        "/api/documents",
        json={
            "slug": "mutual-nda",
            "name": "Acme and Globex",
            "values": VALUES,
            **overrides,
        },
    )


@pytest.fixture
def other_user(client: TestClient, settings: Settings) -> TestClient:
    """A second signed-in user, with their own cookie jar."""
    second = TestClient(create_app(settings))
    response = second.post(
        "/api/auth/signup",
        json={"email": "alan@example.com", "password": "correct-horse-battery"},
    )
    assert response.status_code == 201
    return second


class TestSaving:
    def test_it_saves_an_agreement(self, signed_in: TestClient) -> None:
        response = _save(signed_in)

        assert response.status_code == 201
        body = response.json()
        assert body["slug"] == "mutual-nda"
        assert body["name"] == "Acme and Globex"
        assert body["values"] == VALUES
        assert body["created_at"] and body["updated_at"]

    def test_the_values_come_back_exactly_as_they_went_in(
        self, signed_in: TestClient
    ) -> None:
        # They are replayed into a live document, so anything lost here is a
        # field the user filled in and would not get back.
        document_id = _save(signed_in).json()["id"]

        reopened = signed_in.get(f"/api/documents/{document_id}").json()

        assert reopened["values"] == VALUES

    def test_an_unknown_document_type_is_refused(self, signed_in: TestClient) -> None:
        # Storing it would mean a row nothing can render.
        response = _save(signed_in, slug="employment-contract")

        assert response.status_code == 422
        assert response.json()["detail"] == "No document 'employment-contract'"

    def test_an_oversized_document_is_refused(self, signed_in: TestClient) -> None:
        response = _save(signed_in, values={"fields": {"purpose": "x" * 300_000}})

        assert response.status_code == 413

    def test_a_nameless_document_is_refused(self, signed_in: TestClient) -> None:
        assert _save(signed_in, name="").status_code == 422


class TestListing:
    def test_it_lists_what_this_user_saved(self, signed_in: TestClient) -> None:
        _save(signed_in, name="First")
        _save(signed_in, name="Second")

        listed = signed_in.get("/api/documents").json()

        assert [item["name"] for item in listed] == ["Second", "First"]

    def test_it_leaves_the_values_out(self, signed_in: TestClient) -> None:
        # A list of twenty agreements should not carry twenty documents' worth
        # of field values with it.
        _save(signed_in)

        assert "values" not in signed_in.get("/api/documents").json()[0]

    def test_a_new_user_has_nothing(self, signed_in: TestClient) -> None:
        assert signed_in.get("/api/documents").json() == []


class TestChanging:
    def test_it_replaces_the_name_and_the_values(self, signed_in: TestClient) -> None:
        document_id = _save(signed_in).json()["id"]

        response = signed_in.put(
            f"/api/documents/{document_id}",
            json={
                "slug": "mutual-nda",
                "name": "Renamed",
                "values": {"fields": {"purpose": "Something else."}},
            },
        )

        assert response.status_code == 200
        assert response.json()["name"] == "Renamed"
        assert response.json()["values"] == {"fields": {"purpose": "Something else."}}

    def test_it_deletes(self, signed_in: TestClient) -> None:
        document_id = _save(signed_in).json()["id"]

        assert signed_in.delete(f"/api/documents/{document_id}").status_code == 204
        assert signed_in.get(f"/api/documents/{document_id}").status_code == 404

    def test_deleting_something_that_is_not_there_is_a_404(
        self, signed_in: TestClient
    ) -> None:
        assert signed_in.delete("/api/documents/999").status_code == 404


class TestOtherPeoplesDocuments:
    """The whole point of scoping every query to the signed-in user."""

    def test_they_are_not_listed(
        self, signed_in: TestClient, other_user: TestClient
    ) -> None:
        _save(signed_in, name="Mine")

        assert other_user.get("/api/documents").json() == []

    def test_they_cannot_be_read(
        self, signed_in: TestClient, other_user: TestClient
    ) -> None:
        document_id = _save(signed_in).json()["id"]

        response = other_user.get(f"/api/documents/{document_id}")

        # 404 rather than 403: a 403 would confirm the document exists, which
        # is a fact about somebody else's account.
        assert response.status_code == 404
        assert response.json()["detail"] == f"No document '{document_id}'"

    def test_they_cannot_be_changed(
        self, signed_in: TestClient, other_user: TestClient
    ) -> None:
        document_id = _save(signed_in).json()["id"]

        response = other_user.put(
            f"/api/documents/{document_id}",
            json={"slug": "mutual-nda", "name": "Theirs now", "values": {}},
        )

        assert response.status_code == 404
        # And the original is untouched.
        assert signed_in.get(f"/api/documents/{document_id}").json()["name"] == (
            "Acme and Globex"
        )

    def test_they_cannot_be_deleted(
        self, signed_in: TestClient, other_user: TestClient
    ) -> None:
        document_id = _save(signed_in).json()["id"]

        assert other_user.delete(f"/api/documents/{document_id}").status_code == 404
        assert signed_in.get(f"/api/documents/{document_id}").status_code == 200


class TestSignedOut:
    @pytest.mark.parametrize(
        ("method", "path"),
        [
            ("post", "/api/documents"),
            ("get", "/api/documents"),
            ("get", "/api/documents/1"),
            ("put", "/api/documents/1"),
            ("delete", "/api/documents/1"),
        ],
    )
    def test_every_route_needs_a_session(
        self, client: TestClient, method: str, path: str
    ) -> None:
        # A body on every request, so a 401 is the session being missing rather
        # than the body failing validation first.
        response = client.request(
            method,
            path,
            json={"slug": "mutual-nda", "name": "x", "values": {}},
        )

        assert response.status_code == 401
        assert response.json()["detail"] == "Not signed in"


def test_saved_documents_do_not_survive_a_restart(settings: Settings) -> None:
    """The database is scratch space, which the ticket asks for explicitly."""
    with TestClient(create_app(settings)) as client:
        client.post(
            "/api/auth/signup",
            json={"email": "ada@example.com", "password": "correct-horse-battery"},
        )
        assert _save(client).status_code == 201

    with TestClient(create_app(settings)) as client:
        # The account is gone too, so there is nothing to be signed in as.
        assert client.get("/api/documents").status_code == 401
