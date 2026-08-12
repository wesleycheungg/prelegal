"""
One real conversation with the real model.

Everything else about the chat is tested against a stub, which can prove the
code is right but never that the wiring is. Only this can catch the model being
retired, the provider being renamed, the key expiring, or OpenRouter rejecting
the exact schema we send — and those are the failures that take the feature down
without a line of our code changing.

Excluded from the default run because it costs money and needs the network:

    uv run pytest -m live
"""

import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import create_app
from app.routers.chat import ChatFields

pytestmark = pytest.mark.live


@pytest.fixture
def live_client(settings: Settings) -> TestClient:
    key = get_settings().openrouter_api_key
    if not key:
        pytest.skip("No OPENROUTER_API_KEY configured")

    settings.openrouter_api_key = key
    with TestClient(create_app(settings)) as client:
        return client


def test_holds_a_real_conversation_and_extracts_the_fields(
    live_client: TestClient,
) -> None:
    response = live_client.post(
        "/api/chat",
        json={
            "messages": [
                {
                    "role": "user",
                    "content": (
                        "We're Acme Inc. and Globex Ltd. We want an NDA to evaluate a "
                        "partnership. Delaware law, courts in New Castle, DE. Run it "
                        "for two years."
                    ),
                }
            ],
            "values": ChatFields().model_dump(),
        },
    )

    assert response.status_code == 200
    body = response.json()

    assert body["reply"].strip()

    fields = body["fields"]
    assert fields["party1_company"] == "Acme Inc."
    assert fields["party2_company"] == "Globex Ltd."
    assert "Delaware" in (fields["governing_law"] or "")
    assert fields["mnda_term_kind"] == "fixed"
    assert fields["mnda_term_years"] == "2"


def test_declines_to_draft_a_clause_it_has_no_field_for(
    live_client: TestClient,
) -> None:
    # The prompt forbids inventing contract language. This is the check that the
    # model actually respects it, which no stub can tell us.
    response = live_client.post(
        "/api/chat",
        json={
            "messages": [
                {
                    "role": "user",
                    "content": (
                        "Add a clause capping liability at $1m and "
                        "requiring arbitration."
                    ),
                }
            ],
            "values": ChatFields().model_dump(),
        },
    )

    assert response.status_code == 200
    body = response.json()

    # Nothing about a liability cap can end up in the agreement: the only free
    # text that renders is purpose and modifications.
    assert not body["fields"]["modifications"]
    assert not body["fields"]["purpose"]
