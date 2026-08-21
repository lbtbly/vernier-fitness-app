#!/usr/bin/env bash
# Reads the stack and changes nothing. Safe to run any number of times.
set -euo pipefail
# shellcheck source=lib/compose.sh
source "$(cd "$(dirname "$0")" && pwd)/lib/compose.sh"

echo "== services =="
compose ps --all --format 'table {{.Service}}\t{{.Status}}\t{{.Ports}}'

echo
echo "== images =="
for service in db app; do
  id="$(compose ps -q "$service" 2>/dev/null || true)"
  [ -z "$id" ] && { echo "$service: not created"; continue; }
  image="$(docker inspect --format '{{.Config.Image}}' "$id")"
  printf '%s: %s %s\n' "$service" "$image" \
    "$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$image")"
done

echo
echo "== host listener on ${APP_PORT} =="
lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | grep ":${APP_PORT} " || echo "nothing listening on ${APP_PORT}"

echo
echo "== liveness =="
if curl -fsS --max-time 3 "${APP_URL_LOCAL}/healthz"; then
  echo
else
  echo "no answer from ${APP_URL_LOCAL}/healthz"
fi

echo
echo "== tailscale serve =="
TS="$(command -v tailscale || true)"
[ -z "$TS" ] && [ -x /Applications/Tailscale.app/Contents/MacOS/Tailscale ] \
  && TS=/Applications/Tailscale.app/Contents/MacOS/Tailscale
if [ -n "$TS" ]; then
  "$TS" serve status 2>&1 || true
else
  echo "the tailscale binary is not on PATH and not in /Applications/Tailscale.app"
fi
