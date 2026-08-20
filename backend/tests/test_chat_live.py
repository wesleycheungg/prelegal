"""
Real conversations with the real model.

Everything else about the chat is tested against a stub, which can prove the
code is right but never that the wiring is. Only this can catch the model being
retired, the provider being renamed, the key expiring, or OpenRouter rejecting
the schemas we generate — and those are the failures that take the feature down
without a line of our code changing. Generated schemas make that last one worth
more than it was: the shape sent to the provider now differs per document.

Excluded from the default run because it costs money and needs the network:

    uv run pytest -m live
"""

import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import create_app

pytestmark = pytest.mark.live


@pytest.fixture
def live_client(settings: Settings) -> TestClient:
    key = get_settings().openrouter_api_key
    if not key:
        pytest.skip("No OPENROUTER_API_KEY configured")

    settings.openrouter_api_key = key
    with TestClient(create_app(settings)) as client:
        return client


def _say(client: TestClient, content: str, **body) -> dict:
    response = client.post(
        "/api/chat",
        json={"messages": [{"role": "user", "content": content}], **body},
    )
    assert response.status_code == 200
    return response.json()


def test_chooses_a_document_from_a_plain_description(live_client: TestClient) -> None:
    body = _say(
        live_client,
        "We want to let a customer trial our software for a month before they buy.",
    )

    assert body["document"] == "pilot-agreement"
    assert body["reply"].strip()


def test_declines_an_unsupported_document_and_offers_the_closest(
    live_client: TestClient,
) -> None:
    """The behaviour KAN-6 asks for, which only the real model can demonstrate."""
    body = _say(live_client, "I need an employment contract for a new engineer.")

    # Nothing is chosen off the back of a request we cannot serve.
    assert body["document"] is None

    # The model writes "can’t" with a typographic apostrophe, so straighten it
    # before looking for the refusal rather than missing it on punctuation.
    reply = body["reply"].lower().replace("’", "'")
    assert any(word in reply for word in ("cannot", "can't", "unable", "do not have"))
    # It should still point somewhere useful rather than just refusing.
    assert any(
        word in reply
        for word in ("professional services", "design partner", "closest", "instead")
    )
    assert body["reply"].rstrip().endswith("?")


def test_holds_a_real_conversation_and_extracts_the_fields(
    live_client: TestClient,
) -> None:
    body = _say(
        live_client,
        "We're Acme Inc. and Globex Ltd. We want an NDA to evaluate a "
        "partnership. Delaware law, courts in New Castle, DE. Run it for two "
        "years.",
        document="mutual-nda",
        values={},
    )

    assert body["reply"].strip()

    fields = body["fields"]
    assert fields["party1_company"] == "Acme Inc."
    assert fields["party2_company"] == "Globex Ltd."
    assert "Delaware" in (fields["governing_law"] or "")
    assert fields["mnda_term_option"] == 0
    assert fields["mnda_term_number"] == "2"


def test_fills_in_a_document_that_is_not_the_nda(live_client: TestClient) -> None:
    """A generated schema and a generated prompt, end to end."""
    body = _say(
        live_client,
        "Provider is Acme Inc., the partner is Globex Ltd. The program is early "
        "access to our analytics product. Delaware law.",
        document="design-partner-agreement",
        values={},
    )

    fields = body["fields"]
    assert fields["party1_company"] == "Acme Inc."
    assert fields["party2_company"] == "Globex Ltd."
    assert "Delaware" in (fields["governing_law"] or "")


def test_declines_to_draft_a_clause_it_has_no_field_for(
    live_client: TestClient,
) -> None:
    # The prompt forbids inventing contract language. This is the check that the
    # model actually respects it, which no stub can tell us.
    body = _say(
        live_client,
        "Add a clause capping liability at $1m and requiring arbitration.",
        document="mutual-nda",
        values={},
    )

    # Nothing about a liability cap can end up in the agreement: the only free
    # text that renders is purpose and modifications.
    assert not body["fields"]["mnda_modifications"]
    assert not body["fields"]["purpose"]


def test_always_leaves_the_user_something_to_answer(live_client: TestClient) -> None:
    body = _say(
        live_client,
        "Governing law is Delaware.",
        document="mutual-nda",
        values={},
    )

    assert body["reply"].rstrip().endswith("?")
