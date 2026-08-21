#!/usr/bin/env bash
# Brings Vernier up and waits for both services to report healthy.
#
# Idempotent: run it against a stack that is already up and it changes nothing,
# and the container ids are the same before and after. Pass --build to rebuild
# the app image first, which is the deploy step and does replace the container.
set -euo pipefail
# shellcheck source=lib/compose.sh
source "$(cd "$(dirname "$0")" && pwd)/lib/compose.sh"

BUILD=0
for arg in "$@"; do
  case "$arg" in
    --build) BUILD=1 ;;
    *) echo "up.sh: unknown argument $arg. The only flag is --build." >&2; exit 2 ;;
  esac
done

if [ "$BUILD" -eq 1 ]; then
  compose up -d --build
else
  compose up -d
fi

deadline=$(( $(date +%s) + 120 ))
while :; do
  unhealthy=""
  for service in db app; do
    id="$(compose ps -q "$service" 2>/dev/null || true)"
    if [ -z "$id" ]; then unhealthy="$unhealthy $service(absent)"; continue; fi
    state="$(docker inspect --format '{{.State.Health.Status}}' "$id" 2>/dev/null || echo unknown)"
    [ "$state" = "healthy" ] || unhealthy="$unhealthy $service($state)"
  done
  [ -z "$unhealthy" ] && break
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "up.sh: still not healthy after 120 seconds:$unhealthy" >&2
    compose ps
    exit 1
  fi
  sleep 2
done

echo "up.sh: db and app are healthy."
compose ps --format 'table {{.Service}}\t{{.Status}}\t{{.Ports}}'
echo "up.sh: local ${APP_URL_LOCAL}"
