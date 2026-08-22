#!/usr/bin/env bash
# A scratch instance of the app, for the tests that must not touch the owner's
# installation: first run, a wrong master key, a missing one.
#
#   scripts/test-stack.sh up            start it on 127.0.0.1:3101, empty database
#   scripts/test-stack.sh reset         drop and recreate the scratch database
#   scripts/test-stack.sh rekey         restart it under a different master key
#   scripts/test-stack.sh no-key        try to boot it with no master key, print the log
#   scripts/test-stack.sh down          stop and remove it
#   scripts/test-stack.sh url           print its origin
#
# It runs the same image as the live app, on the same Docker network, against a
# separate database inside the same Postgres. The owner's database, the owner's
# container and the published port on 3000 are never touched.
#
# Nothing here prints a credential. The connection string and the master key are
# read out of the running app container into shell variables and passed on, and
# the only thing that reaches the terminal is what the container itself says.
set -euo pipefail

cd "${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"

CONTAINER=vernier-scratch
IMAGE=vernier-app:local
NETWORK=vernier_default
PORT=3101
SCRATCH_DB=vernier_scratch
ORIGIN="http://127.0.0.1:${PORT}"

need_stack() {
  if ! docker compose ps --status running --services 2>/dev/null | grep -qx app; then
    echo "test-stack: the live stack is not running, and this borrows its network and its Postgres." >&2
    exit 1
  fi
}

app_env() {
  docker compose exec -T app printenv "$1"
}

scratch_url() {
  local live
  live=$(app_env DATABASE_URL)
  printf '%s/%s' "${live%/*}" "$SCRATCH_DB"
}

ensure_database() {
  docker compose exec -T db sh -c \
    "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -tAc \"select 1 from pg_database where datname = '${SCRATCH_DB}'\" | grep -q 1 || psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -c \"create database ${SCRATCH_DB}\"" >/dev/null
}

drop_database() {
  docker compose exec -T db sh -c \
    "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -c \"drop database if exists ${SCRATCH_DB} with (force)\"" >/dev/null
}

remove_container() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}

start() {
  local key=$1
  remove_container
  docker run -d --name "$CONTAINER" --network "$NETWORK" \
    -e APP_URL="$ORIGIN" \
    -e APP_NAME=Vernier \
    -e WEBAUTHN_RP_ID=localhost \
    -e WEBAUTHN_RP_NAME=Vernier \
    -e TZ="$(app_env TZ)" \
    -e DEMO_MODE="${DEMO_MODE:-0}" \
    -e DATABASE_URL="$(scratch_url)" \
    -e MASTER_KEY="$key" \
    -p "127.0.0.1:${PORT}:3000" \
    "$IMAGE" >/dev/null
}

wait_for_ready() {
  for _ in $(seq 1 60); do
    if curl -fsS "${ORIGIN}/healthz" >/dev/null 2>&1; then
      echo "test-stack: ready at ${ORIGIN}"
      return 0
    fi
    sleep 1
  done
  echo "test-stack: the scratch instance never answered on ${ORIGIN}" >&2
  docker logs "$CONTAINER" 2>&1 | tail -20 >&2
  return 1
}

case "${1:-up}" in
  up)
    need_stack
    ensure_database
    start "$(app_env MASTER_KEY)"
    wait_for_ready
    ;;
  reset)
    need_stack
    remove_container
    drop_database
    ensure_database
    start "$(app_env MASTER_KEY)"
    wait_for_ready
    ;;
  rekey)
    need_stack
    # A different 32 bytes, generated here and kept nowhere. The point is that
    # it is not the key the stored ciphertext was written with.
    start "$(head -c 32 /dev/urandom | base64 | tr '+/' '-_' | tr -d '=')"
    wait_for_ready
    echo "test-stack: running under a master key that did not write the stored rows"
    ;;
  no-key)
    need_stack
    remove_container
    echo "test-stack: booting with no master key, in the foreground, so the refusal is visible"
    # It is meant to fail, so the failure is captured rather than fatal here.
    set +e
    output=$(docker run --rm --name "${CONTAINER}-nokey" --network "$NETWORK" \
      -e APP_URL="$ORIGIN" \
      -e APP_NAME=Vernier \
      -e WEBAUTHN_RP_ID=localhost \
      -e WEBAUTHN_RP_NAME=Vernier \
      -e DATABASE_URL="$(scratch_url)" \
      -p "127.0.0.1:3102:3000" \
      "$IMAGE" 2>&1)
    code=$?
    set -e
    printf '%s\n' "$output" | head -30
    echo "test-stack: the container exited with code ${code}"
    ;;
  down)
    remove_container
    echo "test-stack: stopped"
    ;;
  drop)
    need_stack
    remove_container
    drop_database
    echo "test-stack: stopped, scratch database dropped"
    ;;
  url)
    echo "$ORIGIN"
    ;;
  *)
    sed -n '2,18p' "$0"
    exit 1
    ;;
esac
