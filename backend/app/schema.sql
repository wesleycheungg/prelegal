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
