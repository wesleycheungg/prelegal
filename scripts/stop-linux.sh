#!/usr/bin/env bash
#
# Stop the server started by scripts/start-linux.sh.
#
# Stops the process recorded in .run/backend.pid rather than whatever holds
# port 8000, so this can never kill an unrelated program listening there.

set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/serve.sh"

stop_server
