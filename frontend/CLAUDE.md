# Prelegal Project

## Overview

This is a SaaS product to allow users to draft legal agreements based on templates in the templates directory.
The user can carry out AI chat in order to establish what document they want and how to fill in the fields.
The available documents are covered in the catalog.json file in the project root, included here:

@catalog.json

Only the Mutual NDA is built so far. See "Implementation status" at the end of this file for what actually exists.

## Development process

When instructed to build a feature:
1. Use your Atlassian tools to read the feature instructions from Jira
2. Develop the feature - do not skip any step from the feature-dev 7 step process
3. Thoroughly test the feature with unit tests and integration tests and fix any issues
4. Submit a PR using your github tools

## AI design

When writing code to make calls to LLMs, use LiteLLM via OpenRouter to the `openrouter/openai/gpt-oss-120b` model with Cerebras as the inference provider. You should use Structured Outputs so that you can interpret the results and populate fields in the legal document.

There is an OPENROUTER_API_KEY in the .env file in the project root.

Note that `openrouter/` is LiteLLM's provider prefix. Calling the OpenRouter API
directly, the model is `openai/gpt-oss-120b`.

The Cerebras skill uses `{"provider": {"order": ["cerebras"]}}`, which prefers
Cerebras but lets OpenRouter fall back if it is unavailable. `"only"` would
forbid the fallback. `"order"` is what the code uses; a fallback provider that
handles Structured Outputs differently would fail to parse and return a 502,
which is handled, rather than producing a document that is quietly wrong.

## Technical design

The entire project should be packaged into a Docker container.  
The backend should be in backend/ and be a uv project, using FastAPI.  
The frontend should be in frontend/  
The database should use SQLLite and be created from scratch each time the Docker container is brought up, allowing for a users table with sign up and sign in.  
Statically building the frontend and serving it via FastAPI does work, and is what happens: `output: "export"` writes `frontend/out`, which the backend mounts.  
There should be scripts in scripts/ for:  
```bash
# Mac
scripts/start-mac.sh    # Start
scripts/stop-mac.sh     # Stop

# Linux
scripts/start-linux.sh
scripts/stop-linux.sh

# Windows
scripts/start-windows.ps1
scripts/stop-windows.ps1
```
Backend available at http://localhost:8000

## Color Scheme

- Accent Yellow: `#ecad0a`
- Blue Primary: `#209dd7`
- Purple Secondary: `#753991` (submit buttons)
- Dark Navy: `#032147` (headings)
- Gray Text: `#888888`

Not applied yet — the UI is still Tailwind's default neutrals. Anything that
styles new UI should start using these.

## Implementation status

Tickets are `KAN-n` in the Prelegal Jira project. Only what is listed here
exists; if something is not listed, it has not been built.

### Done

- **KAN-2** — the `templates/` dataset: 12 Common Paper agreement templates in
  markdown, indexed by `catalog.json`. The templates are the single source of
  truth for wording, and the app reads them rather than restating them.
- **KAN-3** — the Mutual NDA creator: a form beside a live document preview, and
  a PDF download built in the browser with `@react-pdf/renderer`. Cover page and
  full Standard Terms, so the download is a complete agreement.
- **KAN-4** — the V1 foundation: FastAPI backend in `backend/` (a uv project),
  SQLite rebuilt from scratch on every start, start/stop scripts for Mac, Linux
  and Windows, and Docker packaging. The frontend became a static export that
  the backend serves, so everything is one origin on port 8000.
- **KAN-5** — the AI chat, Mutual NDA only. `POST /api/chat` holds the
  conversation and returns both a reply and whatever that turn settled about the
  fields; the chat pane is what opens, with the form kept behind a toggle for
  correcting it. LiteLLM via OpenRouter to Cerebras, with Structured Outputs.
  The model populates values and never wording — it picks between the
  template's own term sentences rather than writing one — and what it returns
  is validated before it can reach a document anyone might sign.

### Not built yet

The other ten document types, saved documents, and any sign-in interface. The
auth endpoints below exist but nothing in the product calls them.

### API endpoints

- `GET /api/health` — liveness, polled by the start scripts
- `GET /api/templates` — the catalog, without the agreement text
- `GET /api/templates/{slug}` — one template and its markdown
- `POST /api/auth/signup` — register, and sign in as the new user
- `POST /api/auth/signin` — sign in, setting an HttpOnly session cookie
- `POST /api/auth/signout` — clear the cookie
- `GET /api/auth/me` — the signed-in user, or 401
- `POST /api/chat` — one turn of the conversation, with the fields it settled

Interactive docs are at http://localhost:8000/api/docs.

### Where things live

| Path | Contents |
| --- | --- |
| `frontend/lib/` | Pure logic: template parsing, the agreement model, wording. |
| `frontend/components/` | React. `mnda-creator.tsx` owns the state. |
| `backend/app/routers/` | `health`, `templates`, `auth`, `chat`. |
| `backend/app/db.py` | Connections, queries, and rebuilding the database. |
| `scripts/lib/serve.sh` | Start and stop, shared by Mac and Linux. |

Each of `frontend/` and `backend/` has a README with more detail.
