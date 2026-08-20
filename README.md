# prelegal
a platform for drafting legal agreements

## Status

This project is currently in progress. Work is expected to be completed by
**7 August 2026**.

## Running it

```bash
scripts/start-mac.sh      # or start-linux.sh, or start-windows.ps1
```

Builds the frontend, installs the backend and serves both from
http://localhost:8000. Stop it with the matching `stop-` script. Running the
start script again when it is already up reports that and changes nothing.

Or in Docker:

```bash
docker compose up --build
docker compose down
```

Either way the database is built from scratch on every start, so no account and
no saved document survives a restart. That is intended — see
[`backend/README.md`](backend/README.md). Drafting and downloading need no
account at all; signing in is what keeps a document to come back to.

To work on the frontend on its own, `npm run dev` in `frontend/` still serves it
at http://localhost:3000 with hot reload, and needs no backend.

## Layout

| Path | Contents |
| --- | --- |
| `frontend/` | The web app: accounts, an AI chat that drafts any of the catalogued agreements, and the documents you have saved — see [`frontend/README.md`](frontend/README.md). |
| `backend/` | The API, and the server for the built frontend — see [`backend/README.md`](backend/README.md). |
| `scripts/` | Start and stop the whole thing, per platform. |
| `templates/` | [Common Paper](https://commonpaper.com) agreement templates in markdown, each with a fill-in cover page. |
| `catalog.json` | Index of the templates, with descriptions and provenance. |
| `field-schemas.json` | The fields each cover page defines. Generated; asserted by both test suites so the frontend and backend cannot disagree. |
| `Dockerfile` | The frontend built and served by the backend, as one image. |

The templates are the source of truth for agreement wording; the app reads them
rather than restating them.
