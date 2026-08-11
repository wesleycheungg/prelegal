# The whole product as one image: the frontend built to static files, and the
# backend that serves them alongside the API.
#
# The repository's layout is preserved under /app, because the backend resolves
# templates/, catalog.json and frontend/out relative to its own location. Move
# any of these COPY destinations and it will not find them.

FROM node:22-slim AS frontend

WORKDIR /app/frontend

# Dependencies first, so a change to the app does not reinstall them.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
# Read at build time by app/page.tsx, from one level up.
COPY templates/ /app/templates/

RUN npm run build


FROM python:3.13-slim AS runtime

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app/backend

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/backend/.venv \
    PATH="/app/backend/.venv/bin:$PATH"

COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY backend/ ./
COPY templates/ /app/templates/
COPY catalog.json /app/catalog.json
COPY --from=frontend /app/frontend/out /app/frontend/out

# The database is rebuilt on every start, so nothing here is worth a volume —
# see app/db.py. Anything a user creates is gone when the container stops.
EXPOSE 8000

# No --workers: the database is rebuilt by a startup hook in-process, and two
# workers would race to delete and recreate the same file.
CMD ["uv", "run", "--no-dev", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
