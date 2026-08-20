"""
The agreements a user has saved, so they can come back to them.

Everything here belongs to the signed-in user and nobody else. Ownership is part
of every query rather than a check afterwards, and a document belonging to
someone else answers 404 rather than 403: a 403 would confirm the row exists,
which is a fact about another person's account.

What is stored is the values, not the wording. The template renders the
agreement, and a rendered copy kept here would be a second source of truth that
went stale the moment a template changed.
"""

import json
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app import db
from app.deps import ConnectionDep, CurrentUserDep, SettingsDep
from app.documents import load_documents

router = APIRouter(prefix="/documents", tags=["documents"])


class DocumentInput(BaseModel):
    """A document as the client sends it."""

    slug: str
    # Long enough for two company names and then some; a title is a label, not
    # a place to put the agreement.
    name: str = Field(min_length=1, max_length=200)
    values: dict[str, Any]


class DocumentSummary(BaseModel):
    """A saved document without its values, for listing."""

    id: int
    slug: str
    name: str
    created_at: str
    updated_at: str


class Document(DocumentSummary):
    values: dict[str, Any]


def _public(row: dict[str, Any]) -> dict[str, Any]:
    return {**row, "values": json.loads(row["values_json"])}


def _checked(document: DocumentInput, settings: SettingsDep) -> str:
    """
    The values as JSON, once they are something we could actually render.

    An unknown slug and an oversized blob are both rejected here rather than
    stored and discovered later, when the only place left to fail is in front of
    somebody trying to reopen their own agreement.
    """
    known = load_documents(settings.catalog_path, settings.templates_dir)
    if document.slug not in known:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"No document '{document.slug}'",
        )

    values_json = json.dumps(document.values)
    if len(values_json.encode()) > settings.document_max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="That document is too large to save.",
        )

    return values_json


def _found(row: dict[str, Any] | None, document_id: int) -> dict[str, Any]:
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No document '{document_id}'",
        )
    return row


@router.post("", response_model=Document, status_code=status.HTTP_201_CREATED)
def create(
    document: DocumentInput,
    user: CurrentUserDep,
    connection: ConnectionDep,
    settings: SettingsDep,
) -> dict[str, Any]:
    row = db.create_document(
        connection,
        user["id"],
        document.slug,
        document.name,
        _checked(document, settings),
    )
    return _public(row)


@router.get("", response_model=list[DocumentSummary])
def index(user: CurrentUserDep, connection: ConnectionDep) -> list[dict[str, Any]]:
    return db.list_documents(connection, user["id"])


@router.get("/{document_id}", response_model=Document)
def show(
    document_id: int, user: CurrentUserDep, connection: ConnectionDep
) -> dict[str, Any]:
    row = db.find_document(connection, user["id"], document_id)
    return _public(_found(row, document_id))


@router.put("/{document_id}", response_model=Document)
def replace(
    document_id: int,
    document: DocumentInput,
    user: CurrentUserDep,
    connection: ConnectionDep,
    settings: SettingsDep,
) -> dict[str, Any]:
    values_json = _checked(document, settings)
    row = db.update_document(
        connection, user["id"], document_id, document.name, values_json
    )
    return _public(_found(row, document_id))


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def destroy(document_id: int, user: CurrentUserDep, connection: ConnectionDep) -> None:
    if not db.delete_document(connection, user["id"], document_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No document '{document_id}'",
        )
