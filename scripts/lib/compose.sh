#!/usr/bin/env bash
# Shared by up.sh, down.sh and status.sh. Sourced, never run.
#
# Compose reads the environment file out of the project directory on its own.
# No script here passes an env-file flag, and no script here prints a value
# from it.
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose is not available. Start Docker Desktop and try again." >&2
  exit 1
fi

compose() { docker compose "$@"; }

APP_PORT=3000
APP_URL_LOCAL="http://127.0.0.1:${APP_PORT}"
