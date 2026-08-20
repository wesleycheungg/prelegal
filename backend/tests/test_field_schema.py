"""
The other half of the contract with the frontend.

`field-schemas.json` is generated from the TypeScript derivation (see
`frontend/test/field-schemas.test.ts`) and asserted here against the Python
one. If these two ever disagree about a field's name or kind, the assistant
fills in a value that never reaches the document — so they are not allowed to
disagree quietly.
"""

import json

import pytest

from app.config import REPO_ROOT
from app.documents import load_documents
from app.field_schema import parse_document_schema

FIXTURE = REPO_ROOT / "field-schemas.json"


@pytest.fixture(scope="module")
def expected() -> dict:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def documents() -> dict:
    """The real templates, for the same reason the other tests use them."""
    return load_documents(REPO_ROOT / "catalog.json", REPO_ROOT / "templates")


def _describe(schema) -> dict:
    return {
        "title": schema.title,
        "party_roles": list(schema.party_roles),
        "fields": [
            {
                "key": spec.key,
                "kind": spec.kind,
                "label": spec.label,
                "required": spec.required,
                "wire_keys": spec.wire_keys(),
                **(
                    {"units": [option.unit for option in spec.options]}
                    if spec.kind == "choice"
                    else {}
                ),
            }
            for spec in schema.fields
        ],
    }


def test_every_document_is_covered(documents: dict, expected: dict) -> None:
    assert set(documents) == set(expected)
    assert len(documents) == 11


def test_derivation_matches_the_frontend(documents: dict, expected: dict) -> None:
    for slug, document in documents.items():
        assert _describe(document.schema) == expected[slug], slug


def test_the_mutual_nda_keeps_the_fields_it_shipped_with(documents: dict) -> None:
    """KAN-3 and KAN-5 shipped these names; a rename would break saved work."""
    keys = [
        key
        for spec in documents["mutual-nda"].schema.fields
        for key in spec.wire_keys()
    ]

    assert keys == [
        "purpose",
        "effective_date",
        "mnda_term_option",
        "mnda_term_number",
        "term_of_confidentiality_option",
        "term_of_confidentiality_number",
        "governing_law",
        "jurisdiction",
        "mnda_modifications",
    ]


def test_optional_marker_is_read(documents: dict) -> None:
    fields = {spec.key: spec for spec in documents["mutual-nda"].schema.fields}

    assert fields["mnda_modifications"].required is False
    assert fields["purpose"].required is True


def test_party_roles_come_from_the_signature_table(documents: dict) -> None:
    roles = {slug: doc.schema.party_roles for slug, doc in documents.items()}

    assert roles["mutual-nda"] == ("PARTY 1", "PARTY 2")
    assert roles["design-partner-agreement"] == ("PROVIDER", "PARTNER")
    assert roles["business-associate-agreement"] == ("COMPANY", "PROVIDER")


def test_a_date_placeholder_is_not_matched_inside_another_word() -> None:
    """`updates` contains `date`; an unanchored match would make it a date field."""
    schema = parse_document_schema(
        "# Test\n\n### Release Notes\n[Fill in which updates are included]\n"
    )

    assert schema.fields[0].kind == "text"


def test_colliding_field_names_fail_loudly() -> None:
    from app.field_schema import SchemaError

    with pytest.raises(SchemaError):
        parse_document_schema("# Test\n\n### Fees\n[a]\n\n### FEES\n[b]\n")


def test_a_repeated_heading_fails_loudly() -> None:
    """Sections are keyed by heading; the second would overwrite the first."""
    from app.field_schema import SchemaError

    with pytest.raises(SchemaError, match="Two sections both headed"):
        parse_document_schema("# Test\n\n### Fees\n[a]\n\n### Fees\n[b]\n")


def test_a_heading_with_no_usable_name_fails_loudly() -> None:
    """The key becomes an attribute name on the generated model."""
    from app.field_schema import SchemaError

    with pytest.raises(SchemaError, match="nothing to name a field"):
        parse_document_schema("# Test\n\n### ???\n[None]\n")


def test_a_lone_alternative_fails_loudly() -> None:
    """Choice lines leave the body, so a single one would vanish entirely."""
    from app.field_schema import SchemaError

    with pytest.raises(SchemaError, match="one alternative"):
        parse_document_schema("# Test\n\n### Term\n- [x] The only option.\n")
