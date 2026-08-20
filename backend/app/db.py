"""
The database, which is a scratch space rather than a store of record.

`reset_database` deletes the file and reapplies `schema.sql` on every start, so
nothing a user creates survives a restart. That is the intended behaviour for
the foundation, and it is the reason there are no migrations here: there is
never an older schema to upgrade from.

Queries are written out in SQL against the standard library's `sqlite3`. With a
single table that is clearer than a mapping layer would be; this module is the
seam to replace if saved documents and chat history later make one worthwhile.
"""

import sqlite3
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

SCHEMA_PATH = Path(__file__).parent / "schema.sql"


def reset_database(database_path: Path) -> None:
    """
    Discard any existing database and build an empty one.

    Deleting the file rather than dropping the tables means the result does not
    depend on what the previous schema happened to be.
    """
    database_path.parent.mkdir(parents=True, exist_ok=True)
    database_path.unlink(missing_ok=True)

    with connect(database_path) as connection:
        connection.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))


def connect(database_path: Path) -> sqlite3.Connection:
    """
    Open a connection whose rows can be read by column name.

    `check_same_thread` is off because FastAPI runs synchronous endpoints in a
    thread pool that hands out whichever worker is free, so the thread that
    opens a connection is usually not the one that queries it or commits it.
    Leaving the check on means most requests fail with "SQLite objects created
    in a thread can only be used in that same thread" the moment two arrive at
    once. Turning it off is safe here only because `session` gives every request
    a connection of its own — no connection is ever shared.
    """
    connection = sqlite3.connect(database_path, check_same_thread=False)
    connection.row_factory = sqlite3.Row
    # Off by default in SQLite, and the users table has no foreign keys yet, but
    # a connection that ignores them is a trap for the tables that follow.
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def session(database_path: Path) -> Iterator[sqlite3.Connection]:
    """
    A connection for the lifetime of one request, committed if it returns.

    A connection per request rather than one shared across the process: SQLite
    connections are not safe to use from several threads, and FastAPI runs
    synchronous endpoints in a thread pool.
    """
    connection = connect(database_path)
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def create_user(
    connection: sqlite3.Connection, email: str, password_hash: str
) -> dict[str, Any]:
    """
    Register a user.

    Raises `sqlite3.IntegrityError` if the email is already taken; the caller
    turns that into a 409 rather than checking first, so that two simultaneous
    signups cannot both pass the check and then collide.
    """
    cursor = connection.execute(
        "INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)",
        (normalize_email(email), password_hash, datetime.now(UTC).isoformat()),
    )
    created = find_user_by_id(connection, int(cursor.lastrowid or 0))

    # Only reachable if the row vanished between the insert and the read, which
    # a single connection makes impossible.
    assert created is not None
    return created


def find_user_by_email(
    connection: sqlite3.Connection, email: str
) -> dict[str, Any] | None:
    row = connection.execute(
        "SELECT * FROM users WHERE email = ?", (normalize_email(email),)
    ).fetchone()
    return dict(row) if row else None


def find_user_by_id(
    connection: sqlite3.Connection, user_id: int
) -> dict[str, Any] | None:
    row = connection.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return dict(row) if row else None


def normalize_email(email: str) -> str:
    """Fold an address to the form it is stored in, so lookups match signups."""
    return email.strip().lower()


def create_document(
    connection: sqlite3.Connection,
    user_id: int,
    slug: str,
    name: str,
    values_json: str,
) -> dict[str, Any]:
    now = datetime.now(UTC).isoformat()
    cursor = connection.execute(
        "INSERT INTO documents (user_id, slug, name, values_json, created_at, "
        "updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        (user_id, slug, name, values_json, now, now),
    )
    created = find_document(connection, user_id, int(cursor.lastrowid or 0))

    # Only reachable if the row vanished between the insert and the read, which
    # a single connection makes impossible.
    assert created is not None
    return created


def list_documents(
    connection: sqlite3.Connection, user_id: int
) -> list[dict[str, Any]]:
    """A user's saved agreements, most recently changed first."""
    rows = connection.execute(
        "SELECT * FROM documents WHERE user_id = ? ORDER BY updated_at DESC, id DESC",
        (user_id,),
    ).fetchall()
    return [dict(row) for row in rows]


def find_document(
    connection: sqlite3.Connection, user_id: int, document_id: int
) -> dict[str, Any] | None:
    """
    One document, but only if it belongs to this user.

    Ownership is part of the lookup rather than a check afterwards, so there is
    no path that reads somebody else's row and then decides what to do about it.
    """
    row = connection.execute(
        "SELECT * FROM documents WHERE id = ? AND user_id = ?",
        (document_id, user_id),
    ).fetchone()
    return dict(row) if row else None


def update_document(
    connection: sqlite3.Connection,
    user_id: int,
    document_id: int,
    name: str,
    values_json: str,
) -> dict[str, Any] | None:
    """Rewrite a document's name and values. `None` if it is not this user's."""
    connection.execute(
        "UPDATE documents SET name = ?, values_json = ?, updated_at = ? "
        "WHERE id = ? AND user_id = ?",
        (name, values_json, datetime.now(UTC).isoformat(), document_id, user_id),
    )
    return find_document(connection, user_id, document_id)


def delete_document(
    connection: sqlite3.Connection, user_id: int, document_id: int
) -> bool:
    """True if a document was deleted, false if there was nothing to delete."""
    cursor = connection.execute(
        "DELETE FROM documents WHERE id = ? AND user_id = ?", (document_id, user_id)
    )
    return cursor.rowcount > 0
