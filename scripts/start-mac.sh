#!/usr/bin/env bash
#
# Build the frontend, install the backend, and serve both from
# http://localhost:8000. Safe to run twice.

set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/serve.sh"

start_server
echo "  Stop with  scripts/stop-mac.sh"
