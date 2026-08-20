# Prelegal Project

## Overview

This is a SaaS product to allow users to draft legal agreements based on templates in the templates directory.
The user can carry out AI chat in order to establish what document they want and how to fill in the fields.
The available documents are covered in the catalog.json file in the project root, included here:

@catalog.json

All eleven document types are built. See "Implementation status" at the end of this file for what actually exists.

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

Applied in KAN-7 as `@theme` tokens in `app/globals.css`, named for the job each
does: `navy`, `brand`, `accent`, `submit`, `muted`, plus `surface`, `canvas` and
`line`. Use the token (`bg-submit`, `text-navy`), never the hex.

They stop at the application. The agreement itself stays black serif on white —
it is a legal instrument that gets printed and signed, not user interface.

## Implementation status

Tickets are `KAN-n` in the Prelegal Jira project. Only what is listed here
exists; if something is not listed, it has not been built.

### Done

- **KAN-2** — the `templates/` dataset: 12 Common Paper agreement templates in
  markdown, indexed by `catalog.json`. The templates are the single source of
  truth for wording, and the app reads them rather than restating them. KAN-6
  added 10 cover pages beside them, so `templates/` now holds 22 files and the
  catalog 22 entries: 12 from Common Paper and 10 written here.
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
- **KAN-6** — all eleven document types. Each now has a fill-in cover page in
  `templates/`, written in the dialect the Mutual NDA's already used; the ten
  new ones were prepared for this project from the cover-page references in
  Common Paper's own Standard Terms, and are marked as such in `catalog.json`.
  The chat works out which document is wanted before it fills anything in, and
  offers the closest match when asked for something we cannot generate. Two
  smaller changes came with it: focus returns to the message box after every
  reply, and a reply that would leave the user with nothing to answer gets a
  question about whichever required field is still missing.

- **KAN-7** — accounts and polish. Sign-up and sign-in screens on the endpoints
  KAN-4 built and nothing had called; agreements saved per user and reopened
  from `/documents`, stored as one table because `DocumentValues` is already
  document-agnostic; the brand palette applied through shared primitives in
  `components/ui.tsx`; and a draft notice carried on the `Agreement` model so it
  reaches the preview and the PDF alike.

  Drafting stays open to anyone. An account buys saved documents, not access —
  the form, the preview and the download all still work signed out, and with the
  backend down.

All six are merged to `main` and marked Done in Jira.

### Not built yet

No tickets remain. What a next one would most likely want:

- **Documents that outlive a restart.** `reset_database` wipes everything on
  every start, which the tickets asked for. Changing it means `schema.sql` stops
  being a schema and starts needing migrations — the comment at the top of it
  says as much.
- **The colour scheme on the agreement.** Deliberately not done: a signed
  document should not be branded.
- **A password reset**, and anything else that needs email.

### API endpoints

- `GET /api/health` — liveness, polled by the start scripts
- `GET /api/templates` — the catalog, without the agreement text
- `GET /api/templates/{slug}` — one template and its markdown
- `POST /api/auth/signup` — register, and sign in as the new user
- `POST /api/auth/signin` — sign in, setting an HttpOnly session cookie
- `POST /api/auth/signout` — clear the cookie
- `GET /api/auth/me` — the signed-in user, or 401
- `POST /api/documents` — save an agreement
- `GET /api/documents` — this user's saved agreements, newest first, no values
- `GET /api/documents/{id}` — one saved agreement, with its values
- `PUT /api/documents/{id}` — rewrite its name and values
- `DELETE /api/documents/{id}` — remove it
- `POST /api/chat` — one turn of the conversation. With no `document` it is
  choosing which agreement is wanted and returns the slug once it knows; with
  one it returns the fields that turn settled. 404 for a slug we have no cover
  page for, 413 for an over-long conversation, 502 for any model failure, 503
  when `OPENROUTER_API_KEY` is unset

Everything under `/api/documents` is scoped to the signed-in user. Somebody
else's document answers 404 rather than 403: a 403 confirms the row exists,
which is a fact about another person's account.

Interactive docs are at http://localhost:8000/api/docs.

### Where things live

| Path | Contents |
| --- | --- |
| `frontend/lib/cover-page-template.ts` | Parses a cover page's markdown grammar. Knows nothing about any document. |
| `frontend/lib/field-schema.ts` | Decides what each parsed section *means*: text, date, choice or grouped lines. |
| `frontend/lib/document-values.ts` | The values a user supplies, keyed by field name, and the wording they resolve to. |
| `frontend/lib/agreement.ts` | `buildAgreement`, the one model both the preview and the PDF render. |
| `frontend/components/` | React. `document-creator.tsx` owns the state. |
| `frontend/components/ui.tsx` | Button, Panel, Label, Notice and the focus ring. Use these rather than new class strings. |
| `frontend/components/session.tsx` | Who is signed in, asked once and shared. |
| `frontend/app/` | Four routes: `/`, `/sign-in`, `/sign-up`, `/documents`. |
| `backend/app/field_schema.py` | The same derivation in Python, for the assistant's generated schema. |
| `backend/app/routers/` | `health`, `templates`, `auth`, `chat`. |
| `backend/app/db.py` | Connections, queries, and rebuilding the database. |
| `field-schemas.json` | What the two derivations must agree on. Both suites assert it. |
| `scripts/lib/serve.sh` | Start and stop, shared by Mac and Linux. |

## Adding a document type

Everything is driven by the templates, so a twelfth agreement needs no new code:

1. Put the Standard Terms in `templates/<slug>.md`.
2. Write `templates/<slug>-cover-page.md` — `### headings`, `<label>` hints,
   `<optional/>` on fields the agreement can be signed without, `- [ ]` for
   alternative wordings, `[brackets]` for what a user fills in, and a signature
   table whose header row names the two parties.
3. Add both to `catalog.json`.
4. Run `UPDATE_SCHEMAS=1 npm test -- field-schemas` and read the diff.

A bracket opening with "Fill in" is guidance; anything else is a suggested value
the user can keep. A repeated heading, a heading with no letters or digits in
it, and a section offering only one alternative all fail the build rather than
losing a field quietly.

## Testing

```bash
cd frontend && npm test          # 288 tests
cd backend  && uv run pytest     # 111 tests
cd backend  && uv run pytest -m live   # 6 more; calls the real model, costs money
```

The live tests are excluded by default and skip themselves without an API key.
They are the only thing that can catch the model being retired, the provider
renamed, or OpenRouter rejecting a generated schema — failures that take the
feature down without a line of our code changing.

`frontend/test/mutual-nda-agreement.json` pins the Mutual NDA's rendered output
as it shipped in KAN-3; it must not change. `frontend/docs/manual-testing.md`
covers what no automated test can — PDF layout, cross-browser download, and how
the assistant actually reads.

Each of `frontend/` and `backend/` has a README with more detail.
