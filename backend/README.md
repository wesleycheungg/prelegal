# backend

The Prelegal API, and the server for the built frontend. FastAPI, run with uv.

Everything is served from one origin on port 8000: the API under `/api`, and the
frontend's static export under everything else. That keeps the session cookie a
first-party cookie and means the browser never makes a cross-origin request.

## Getting started

From the repository root, `scripts/start-mac.sh` builds the frontend and starts
this server together. To work on the API alone:

```bash
uv sync
uv run uvicorn app.main:app --reload
```

Then open http://localhost:8000/api/docs.

The frontend is only served if it has been built (`npm run build` in
`frontend/`, which writes `frontend/out`). Without it the API still runs and
every other path returns 404 — running the backend should not require building
the frontend first.

## Testing

```bash
uv run pytest
uv run ruff check
uv run ruff format
```

Tests build the database with the same `reset_database` the server runs at
startup, rather than a fixture that restates the schema — a fixture that drifted
from `schema.sql` would test nothing. They read the real `templates/` and
`catalog.json` for the same reason the frontend's tests do.

## How it works

| File | Role |
| --- | --- |
| `app/main.py` | Builds the app. Mounts the API, then the frontend. |
| `app/config.py` | Settings, and the paths to everything outside `backend/`. |
| `app/db.py` | Connections, queries, and rebuilding the database. |
| `app/schema.sql` | The whole schema. One table. |
| `app/security.py` | Password hashing and session tokens. |
| `app/deps.py` | Settings, a connection, and the signed-in user. |
| `app/routers/health.py` | `GET /api/health`, polled by the start scripts. |
| `app/routers/templates.py` | The agreement templates and the catalog. |
| `app/routers/auth.py` | Sign up, sign in, sign out, who am I. |

### The database is temporary

`reset_database` deletes the file and reapplies `schema.sql` on every start, so
nothing anyone creates survives a restart. That is deliberate for now, and it is
why there are no migrations: there is never an older schema to upgrade from.

Two things follow. The server must run as a single process — two workers would
race to rebuild the same file, which is why neither the scripts nor the
Dockerfile pass `--workers`. And a session cookie outlives the user it names, so
`GET /api/auth/me` treats a token for a user who no longer exists as no token at
all; that is the ordinary case here, not an edge case.

### Paths

`app/config.py` resolves `templates/`, `catalog.json` and `frontend/out` from
its own location on disk, not from the working directory, so the server behaves
the same started from the repository root, from `backend/`, or from `/app` in
the container. The frontend resolves `templates/` from `process.cwd()` instead
and so must be run from `frontend/`.

### The API is a sub-application

`app/main.py` mounts the API at `/api` and the frontend at `/`. The order
matters — a mount at `/` matches every path, so reversing the two would make
`/api/health` return the index page.

The API is mounted as its own FastAPI application rather than included as a
router so that it keeps its own error handling. A missing template returns a
JSON 404 from inside the API; an unknown path outside it returns the frontend's
own 404 page.

## Scope

The foundation for V1, not a feature. Nothing in the product calls any of this
yet: the frontend still reads the templates directly when it is built, and there
is no interface for signing in.

The templates and auth endpoints exist because they are what the AI chat and
saved documents will need, and because they make the database something the
tests actually exercise rather than merely create.
