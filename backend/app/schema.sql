-- The whole database. Applied to an empty file on every start, so this is a
-- schema definition rather than a migration; there is never anything to migrate
-- from. That changes the moment saved documents have to outlive a restart.

CREATE TABLE users (
    id            INTEGER PRIMARY KEY,
    -- Case-folded before it is stored, so `Ada@Example.com` and
    -- `ada@example.com` cannot both be registered.
    email         TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    created_at    TEXT    NOT NULL
);

-- An agreement someone saved, so they can come back to it.
--
-- One table for all eleven document types rather than one each: `values_json`
-- holds a `DocumentValues` exactly as the frontend keeps it, which is a plain
-- map of field names to values and says nothing about which agreement it
-- belongs to. `slug` says that, and is checked against the catalog on the way
-- in, so a row can never name a document we have no cover page to render.
--
-- The rendered wording is deliberately not stored. It comes from the template,
-- which is the single source of truth, and a copy here would be a second one
-- that could go stale the moment a template changed.
CREATE TABLE documents (
    id          INTEGER PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slug        TEXT    NOT NULL,
    name        TEXT    NOT NULL,
    values_json TEXT    NOT NULL,
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
);

-- Every read is "this user's documents", newest first.
CREATE INDEX documents_by_user ON documents (user_id, updated_at DESC);
