#!/usr/bin/env bash
#
# Starting and stopping the server, shared by the macOS and Linux scripts.
#
# The two platforms need the same steps, and the only difference worth handling
# is that macOS always has `lsof` while a minimal Linux image often has only
# `ss`. Keeping one implementation means a fix to either script is a fix to
# both; `start-mac.sh` and `start-linux.sh` exist because the spec names them.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PORT="${PORT:-8000}"
RUN_DIR="$REPO_ROOT/.run"
PID_FILE="$RUN_DIR/backend.pid"
LOG_FILE="$RUN_DIR/backend.log"

# Whatever is listening on $PORT, or nothing. Printed to the user when we
# refuse to start, so they can see what to close.
listeners_on_port() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true
  elif command -v ss >/dev/null 2>&1; then
    ss -ltnp "sport = :$PORT" 2>/dev/null | tail -n +2 || true
  fi
}

running_pid() {
  [ -f "$PID_FILE" ] || return 1
  local pid
  pid="$(cat "$PID_FILE")"
  kill -0 "$pid" 2>/dev/null || return 1
  echo "$pid"
}

start_server() {
  cd "$REPO_ROOT"
  mkdir -p "$RUN_DIR"

  local existing
  if existing="$(running_pid)"; then
    echo "Already running (pid $existing) at http://localhost:$PORT"
    return 0
  fi

  # A pid file naming a process that has gone is just litter.
  rm -f "$PID_FILE"

  # Refuse rather than fight something we did not start, which on this port is
  # most likely a `next dev` or a second copy of this server.
  if [ -n "$(listeners_on_port)" ]; then
    echo "Port $PORT is already in use by another process:" >&2
    listeners_on_port >&2
    return 1
  fi

  echo "Building the frontend..."
  (cd frontend && npm install --no-audit --no-fund --silent && npm run build)

  echo "Installing the backend..."
  (cd backend && uv sync --quiet)

  echo "Starting the server..."
  (
    cd backend
    # `uv run` execs uvicorn, so the recorded pid is the server itself and
    # stopping it leaves no orphan. No --reload for the same reason: it forks a
    # watcher, and the pid would then name the wrong process.
    nohup uv run uvicorn app.main:app --host 0.0.0.0 --port "$PORT" \
      >"$LOG_FILE" 2>&1 &
    echo $! >"$PID_FILE"
  )

  local pid
  pid="$(cat "$PID_FILE")"

  for _ in $(seq 1 60); do
    if curl -sf "http://localhost:$PORT/api/health" >/dev/null 2>&1; then
      echo
      echo "Prelegal is running at http://localhost:$PORT"
      echo "  API docs   http://localhost:$PORT/api/docs"
      echo "  Logs       $LOG_FILE"
      return 0
    fi
    # Give up early if it died, rather than waiting out the whole timeout.
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.5
  done

  echo "The server did not come up. Last 20 lines of $LOG_FILE:" >&2
  tail -n 20 "$LOG_FILE" >&2
  rm -f "$PID_FILE"
  return 1
}

stop_server() {
  if [ ! -f "$PID_FILE" ]; then
    echo "Not running."
    return 0
  fi

  local pid
  pid="$(cat "$PID_FILE")"

  if ! kill -0 "$pid" 2>/dev/null; then
    echo "Not running (stale pid file removed)."
    rm -f "$PID_FILE"
    return 0
  fi

  echo "Stopping the server (pid $pid)..."
  kill "$pid"

  for _ in $(seq 1 20); do
    if ! kill -0 "$pid" 2>/dev/null; then
      rm -f "$PID_FILE"
      echo "Stopped."
      return 0
    fi
    sleep 0.5
  done

  # Ten seconds is long enough for a graceful shutdown; past that it is stuck.
  echo "Did not shut down in time — forcing." >&2
  kill -9 "$pid" 2>/dev/null || true
  rm -f "$PID_FILE"
  echo "Stopped."
}
