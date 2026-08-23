#!/usr/bin/env bash
# A scratch instance of the app, for the tests that must not touch the owner's
# installation: first run, a wrong master key, a missing one.
#
#   scripts/test-stack.sh up            start it on 127.0.0.1:3101, empty database
#
# It always runs Withings and Google Calendar in demonstration mode with an
# empty client pair, so a spec that drives connect, import, sync, a confirmed
# diff and an undo writes to this database and opens no socket. WITHINGS_MODE
# can be set to live for a spec that needs the other branch, and there is no id
# or secret here for it to use. GOOGLE_DEMO_FAULT=outage restarts it with the
# recorded Google unreachable and GOOGLE_DEMO_FAULT=revoked with the grant
# refused, which is how those two paths are proven without a real account.
#   scripts/test-stack.sh reset         drop and recreate the scratch database
#   scripts/test-stack.sh rekey         restart it under a different master key
#   scripts/test-stack.sh no-key        try to boot it with no master key, print the log
#   scripts/test-stack.sh down          stop and remove it
#   scripts/test-stack.sh url           print its origin
#
# SCRATCH_BACKUP_DIR mounts a host directory at /app/backups and tells the app a
# destination is configured, which is how the archive's CONFIGURED destination is
# proven on an instance whose rows nobody would miss. Left unset there is no
# mount and no configured directory, so the same instance proves the FALLBACK and
# the alert that names it. F127 needs both, and neither may be produced by taking
# the owner's own iCloud folder away.
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

drop_named_database() {
  docker compose exec -T db sh -c \
    "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -c \"drop database if exists $1 with (force)\"" >/dev/null
}

drop_database() {
  docker compose exec -T db sh -c \
    "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -c \"drop database if exists ${SCRATCH_DB} with (force)\"" >/dev/null
}

remove_container() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}

#
# The scratch instance runs Anthropic in DEMONSTRATION MODE WITH A REAL RATE
# TABLE, which is a deliberate combination and the only one that makes the
# monthly ceiling testable with no key and no money.
#
# No key, so nothing leaves this machine and nothing is charged. Rates, so a
# demonstration call is priced the way a real one would be and the ledger
# accumulates. A small ceiling, so the refusal arrives on the third call rather
# than after two thousand. The published rates are not what matters here; what
# is being graded is the arithmetic and the refusal.
ANTHROPIC_DEMO_INPUT_RATE=${ANTHROPIC_INPUT_USD_PER_MTOK:-3}
ANTHROPIC_DEMO_OUTPUT_RATE=${ANTHROPIC_OUTPUT_USD_PER_MTOK:-15}
ANTHROPIC_DEMO_CAP=${ANTHROPIC_MONTHLY_CAP_USD:-0.03}

#
# THE LANGUAGE MODEL, READ ONLY, AND NOTHING ELSE OFF THE OWNER'S VOLUME.
#
# F65 asks for a page with no text layer to be routed to optical recognition and
# for every recognised row to arrive flagged. The scratch instance ran with no
# storage volume at all, so `/app/storage/tessdata/fra.traineddata` was never
# there, the route refused every scanned page by name, and the end-to-end test
# took its honest branch: detection proven, routing proven, the flags on
# recognised rows not proven and F65 not closed. Six verifications could have
# read that and none of them would have seen recognition run.
#
# The host directory `scripts/fetch-tessdata.sh` fills is mounted at that path,
# read only. NOT the owner's `vernier_storage` volume: that holds his own
# laboratory documents, and `scratchLabFiles()` lists `/app/storage/labs` to
# prove an abandoned upload took its bytes with it. A scratch instance writing
# into the owner's volume would put a test's PDFs beside his and make that count
# a count of both.
#
# `/app/storage/labs` therefore stays in the container's own writable layer and
# goes when the container goes, which is what every other test here assumes.
#
# Absent model, absent mount, and the suite says so in its own words rather than
# starting a container that half works.
# Set to the host directory when the model is really there, empty when it is
# not, and used with the same `${VAR:+...}` idiom SCRATCH_BACKUP_DIR uses two
# lines below it, so an absent model is an absent flag rather than an empty
# argument docker has to parse.
TESSDATA_DIR="$PWD/var/tessdata"
if [ -f "${TESSDATA_DIR}/fra.traineddata" ]; then
  SCRATCH_TESSDATA="$TESSDATA_DIR"
else
  SCRATCH_TESSDATA=""
fi

start() {
  local key=$1
  remove_container
  docker run -d --name "$CONTAINER" --network "$NETWORK" \
    -e ANTHROPIC_MODE=demo \
    -e ANTHROPIC_MODEL=demonstration \
    -e ANTHROPIC_INPUT_USD_PER_MTOK="$ANTHROPIC_DEMO_INPUT_RATE" \
    -e ANTHROPIC_OUTPUT_USD_PER_MTOK="$ANTHROPIC_DEMO_OUTPUT_RATE" \
    -e ANTHROPIC_MONTHLY_CAP_USD="$ANTHROPIC_DEMO_CAP" \
    -e APP_URL="$ORIGIN" \
    -e APP_NAME=Vernier \
    -e WEBAUTHN_RP_ID=localhost \
    -e WEBAUTHN_RP_NAME=Vernier \
    -e TZ="$(app_env TZ)" \
    -e DEMO_MODE="${DEMO_MODE:-0}" \
    -e WITHINGS_MODE="${WITHINGS_MODE:-demo}" \
    -e WITHINGS_CLIENT_ID="" \
    -e WITHINGS_CLIENT_SECRET="" \
    -e GOOGLE_MODE="${GOOGLE_MODE:-demo}" \
    -e GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-}" \
    -e GOOGLE_CLIENT_SECRET="${GOOGLE_CLIENT_SECRET:-}" \
    -e GOOGLE_REDIRECT_URI="${GOOGLE_REDIRECT_URI:-}" \
    -e GOOGLE_DEMO_FAULT="${GOOGLE_DEMO_FAULT:-none}" \
    -e DATABASE_URL="$(scratch_url)" \
    -e MASTER_KEY="$key" \
    -e BACKUP_DIR="${SCRATCH_BACKUP_DIR:+/app/backups}" \
    -e BACKUP_RETENTION_DAYS="${SCRATCH_BACKUP_RETENTION:-30}" \
    ${SCRATCH_BACKUP_DIR:+-v "${SCRATCH_BACKUP_DIR}:/app/backups"} \
    ${SCRATCH_TESSDATA:+-v "${SCRATCH_TESSDATA}:/app/storage/tessdata:ro"} \
    -p "127.0.0.1:${PORT}:3000" \
    "$IMAGE" >/dev/null
}

say_tessdata() {
  if [ -n "$SCRATCH_TESSDATA" ]; then
    echo "test-stack: fra.traineddata mounted read only from ${SCRATCH_TESSDATA}"
  else
    echo "test-stack: no fra.traineddata at ${TESSDATA_DIR}. The scratch instance will refuse every scanned page by name, and F65's recognition half cannot run. Fetch it with scripts/fetch-tessdata.sh --download" >&2
  fi
}

wait_for_ready() {
  for _ in $(seq 1 60); do
    if curl -fsS "${ORIGIN}/healthz" >/dev/null 2>&1; then
      echo "test-stack: ready at ${ORIGIN}"
      say_tessdata
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
  drop-named)
    # One database this suite created, by name, dropped. The connection to the
    # owner's database is a superuser one because CREATE and DROP DATABASE need
    # one, and it lives HERE rather than in tests/e2e/host.ts: that file may
    # only ever reach the owner's install as vernier_suite, and
    # tests/unit/suite-safety.test.ts fails it by shape if it does otherwise.
    #
    # The name is bounded to this suite's own prefix, so nothing anyone passes
    # can name the owner's database.
    need_stack
    case "${2:-}" in
      vernier_*) drop_named_database "$2" ;;
      *)
        echo "test-stack: drop-named takes a vernier_ database, never ${2:-nothing}" >&2
        exit 1
        ;;
    esac
    echo "test-stack: dropped ${2}"
    ;;
  url)
    echo "$ORIGIN"
    ;;
  *)
    sed -n '2,18p' "$0"
    exit 1
    ;;
esac
