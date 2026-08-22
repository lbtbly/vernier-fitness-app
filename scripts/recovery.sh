#!/usr/bin/env bash
# Local recovery. The way back in when the passkey is gone and the password is
# forgotten, run on the Mac mini itself.
#
#   scripts/recovery.sh status              what exists: owner, passkeys, lockout
#   scripts/recovery.sh password            set a new backup password, typed here
#   scripts/recovery.sh link [minutes]      mint a one-time sign-in link
#   scripts/recovery.sh passkeys            list the registered passkeys
#   scripts/recovery.sh forget-passkey ID   remove one passkey
#   scripts/recovery.sh unlock              clear the sign-in lockout window
#
# There is no security question, nothing is emailed, and nothing here can be
# done from the network. The only credential this procedure needs is shell
# access to this machine, which already outranks any password stored on it.
#
# The new password is read from the terminal or from a pipe, never from an
# argument, because arguments are visible in the process table.
#
# RECOVERY_CONTAINER names another container to run in, and the destructive end
# of the test suite is what it is for: those specs run against the scratch
# instance now, and a spec that signs in has to mint its link on the instance it
# is signing in to. The default is the owner's app and nothing about it moves.
#
# RECOVERY_ROLE names a Postgres role to run as, and the test suite is what that
# is for too. This script drives a read-write connection into the owner's
# database, and the suite used it to UPDATE the owner row and DELETE a
# credential. Now every connection below is opened in one place, and when the
# suite sets RECOVERY_ROLE=vernier_suite every statement runs with that role's
# grants: SELECT, an INSERT on the sign-in grants and on the append-only auth
# log, and nothing else. `password` and `forget-passkey` are refused by Postgres
# on that role, by name, which is the point. The owner sets nothing and gets the
# full connection, as always.
set -euo pipefail

cd "${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"

TARGET="${RECOVERY_CONTAINER:-}"

if [ -n "$TARGET" ]; then
  if ! docker inspect -f '{{.State.Running}}' "$TARGET" 2>/dev/null | grep -qx true; then
    echo "recovery: the container $TARGET is not running." >&2
    exit 1
  fi
elif ! docker compose ps --status running --services 2>/dev/null | grep -qx app; then
  echo "recovery: the app container is not running. Start the stack with scripts/up.sh first." >&2
  exit 1
fi

# The role travels with the script, or nothing does. One place, so a command
# added later cannot forget it.
ROLE_ARGS=()
if [ -n "${RECOVERY_ROLE:-}" ]; then
  ROLE_ARGS=(-e "RECOVERY_ROLE=${RECOVERY_ROLE}")
fi

run_in_app() {
  # The app container already holds DATABASE_URL and the master key. Nothing is
  # printed here that the container does not print itself.
  if [ -n "$TARGET" ]; then
    docker exec -i ${ROLE_ARGS[@]+"${ROLE_ARGS[@]}"} "$TARGET" node --input-type=module --eval "${CONNECT_SCRIPT}$1"
  else
    docker compose exec -T ${ROLE_ARGS[@]+"${ROLE_ARGS[@]}"} app node --input-type=module --eval "${CONNECT_SCRIPT}$1"
  fi
}

run_in_app_with() {
  # One environment variable, then the script. Same target rule.
  local assignment=$1
  shift
  if [ -n "$TARGET" ]; then
    docker exec -i -e "$assignment" ${ROLE_ARGS[@]+"${ROLE_ARGS[@]}"} "$TARGET" node --input-type=module --eval "${CONNECT_SCRIPT}$1"
  else
    docker compose exec -T -e "$assignment" ${ROLE_ARGS[@]+"${ROLE_ARGS[@]}"} app node --input-type=module --eval "${CONNECT_SCRIPT}$1"
  fi
}

# One connection, opened in one place. Every script below starts from here and
# none of them builds a client of its own, so a command added later inherits
# whatever RECOVERY_ROLE is set rather than escaping it.
CONNECT_SCRIPT='
const pg = await import("pg");
const settings = { connectionString: process.env.DATABASE_URL };
// A role switch in the startup packet, which Postgres applies before the first
// statement and which nothing in these scripts undoes.
if (process.env.RECOVERY_ROLE) settings.options = "-c role=" + process.env.RECOVERY_ROLE;
const client = new pg.default.Client(settings);
await client.connect();
'

STATUS_SCRIPT='
const owner = await client.query("select id, display_name, created_at, password_algorithm, password_memory, password_passes, password_parallelism, password_tag_length, password_updated_at from owner");
const passkeys = await client.query("select id, label, device_type, backed_up, counter, last_used_at from webauthn_credential order by created_at");
// The same rule the limiter applies: failures inside the window, and only
// those since the last unlock row, so this line and the app agree.
const failures = await client.query("select count(*)::int as n from auth_attempt where outcome = $1 and at > now() - interval \x2760 seconds\x27 and at > coalesce((select max(a.at) from auth_attempt a where a.outcome = \x27unlocked\x27), to_timestamp(0))", ["failure"]);
const attempts = await client.query("select at, method, outcome, reason from auth_attempt order by at desc limit 5");
console.log("owner rows:", owner.rowCount);
for (const row of owner.rows) {
  console.log("  id:", row.id, "name:", row.display_name, "created:", row.created_at.toISOString());
  console.log("  password:", row.password_algorithm, "m=" + row.password_memory, "t=" + row.password_passes, "p=" + row.password_parallelism, "tag=" + row.password_tag_length, "set:", row.password_updated_at.toISOString());
}
console.log("passkeys:", passkeys.rowCount);
for (const row of passkeys.rows) {
  console.log("  " + row.id, "|", row.label, "|", row.device_type, "| backed up:", row.backed_up, "| counter:", row.counter, "| last used:", row.last_used_at ? row.last_used_at.toISOString() : "never");
}
console.log("failed attempts inside the 60 second window:", failures.rows[0].n, "of 5 allowed");
console.log("last five attempts:");
for (const row of attempts.rows) console.log("  " + row.at.toISOString(), row.method, row.outcome, "|", row.reason);
await client.end();
'

PASSWORD_SCRIPT='
const crypto = await import("node:crypto");
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const password = Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
if (password.length < 12) {
  console.error("recovery: the new password must be at least 12 characters.");
  process.exit(2);
}
// The parameters below are the ones src/lib/password.ts writes: OWASP minimum,
// m=19456, t=2, p=1, 16-byte nonce. They are stored on the row alongside the
// tag, and verification reads them from there, so a row written here verifies
// under exactly the cost it was written with.
const nonce = crypto.randomBytes(16);
const tag = crypto.argon2Sync("argon2id", {
  message: Buffer.from(password, "utf8"),
  nonce,
  parallelism: 1,
  tagLength: 32,
  memory: 19456,
  passes: 2,
});
const owner = await client.query("select id from owner");
if (owner.rowCount === 0) {
  console.error("recovery: no owner account exists yet, so there is nothing to recover.");
  await client.end();
  process.exit(3);
}
await client.query(
  "update owner set password_tag = $1, password_nonce = $2, password_algorithm = $3, password_memory = $4, password_passes = $5, password_parallelism = $6, password_tag_length = $7, password_updated_at = now() where id = $8",
  [tag.toString("base64"), nonce.toString("base64"), "argon2id", 19456, 2, 1, 32, owner.rows[0].id],
);
await client.query(
  "insert into auth_attempt (id, method, outcome, reason, peer) values ($1, $2, $3, $4, $5)",
  [crypto.randomUUID(), "recovery", "success", "the backup password was reset from the host shell", "host-shell"],
);
console.log("recovery: the backup password is set. Argon2id m=19456 t=2 p=1, 16-byte nonce, stored on the owner row.");
await client.end();
'

LINK_SCRIPT='
const crypto = await import("node:crypto");
const minutes = Number(process.env.RECOVERY_MINUTES || "10");
const token = crypto.randomBytes(32).toString("base64url");
const id = crypto.createHash("sha256").update(token).digest("base64url");
const owner = await client.query("select id from owner");
if (owner.rowCount === 0) {
  console.error("recovery: no owner account exists yet, so there is nothing to sign in to.");
  await client.end();
  process.exit(3);
}
await client.query(
  "insert into recovery_grant (id, expires_at) values ($1, now() + make_interval(mins => $2))",
  [id, minutes],
);
console.log(process.env.APP_URL.replace(/\/+$/, "") + "/sign-in/recover?token=" + token);
console.error("recovery: one use, valid for " + minutes + " minutes. Open it on the device you want signed in.");
await client.end();
'

PASSKEYS_SCRIPT='
const rows = await client.query("select id, label, device_type, backed_up, counter, created_at, last_used_at from webauthn_credential order by created_at");
console.log(rows.rowCount + " passkey(s)");
for (const row of rows.rows) {
  console.log(row.id);
  console.log("  label:", row.label, "| device type:", row.device_type, "| backed up:", row.backed_up, "| counter:", row.counter);
  console.log("  created:", row.created_at.toISOString(), "| last used:", row.last_used_at ? row.last_used_at.toISOString() : "never");
}
await client.end();
'

FORGET_SCRIPT='
const result = await client.query("delete from webauthn_credential where id = $1 returning id", [process.env.PASSKEY_ID]);
console.log(result.rowCount === 1 ? "recovery: removed passkey " + process.env.PASSKEY_ID : "recovery: no passkey has that identifier");
// The diagnostics signal says a passkey has been registered on this
// installation. With the last one removed it would be saying that about
// nothing, and the report the owner reads would be wrong in the one direction
// that matters. So it goes with the last passkey, here, where the removal is.
const left = await client.query("select count(*)::int as n from webauthn_credential");
if (left.rows[0].n === 0) {
  const cleared = await client.query("delete from device_observation where signal = $1", ["passkey_registered"]);
  if (cleared.rowCount > 0) console.log("recovery: no passkey is registered now, so the passkey_registered signal was cleared with it.");
}
await client.end();
process.exit(result.rowCount === 1 ? 0 : 4);
'

UNLOCK_SCRIPT='
// Nothing is edited and nothing is deleted. The limiter ignores failures older
// than the most recent unlock row, so appending one row starts the window
// again, and the log still holds every failure that led here.
const crypto = await import("node:crypto");
const before = await client.query("select count(*)::int as n from auth_attempt where outcome = $1 and at > now() - interval \x2760 seconds\x27", ["failure"]);
await client.query(
  "insert into auth_attempt (id, method, outcome, reason, peer) values ($1, $2, $3, $4, $5)",
  [crypto.randomUUID(), "recovery", "unlocked", "the sign-in lockout was cleared from the host shell", "host-shell"],
);
console.log("recovery: the lockout window is clear. " + before.rows[0].n + " failure(s) inside it are now ignored and still on the record.");
await client.end();
'

command=${1:-status}
case "$command" in
  status)
    run_in_app "$STATUS_SCRIPT"
    ;;
  password)
    if [ -t 0 ]; then
      printf 'New backup password (at least 12 characters): ' >&2
      IFS= read -rs first
      printf '\nRepeat it: ' >&2
      IFS= read -rs second
      printf '\n' >&2
      if [ "$first" != "$second" ]; then
        echo "recovery: the two entries do not match. Nothing was changed." >&2
        exit 2
      fi
      printf '%s' "$first" | run_in_app "$PASSWORD_SCRIPT"
      unset first second
    else
      run_in_app "$PASSWORD_SCRIPT"
    fi
    ;;
  link)
    run_in_app_with "RECOVERY_MINUTES=${2:-10}" "$LINK_SCRIPT"
    ;;
  passkeys)
    run_in_app "$PASSKEYS_SCRIPT"
    ;;
  forget-passkey)
    if [ -z "${2:-}" ]; then
      echo "recovery: name the passkey identifier. scripts/recovery.sh passkeys lists them." >&2
      exit 1
    fi
    run_in_app_with "PASSKEY_ID=$2" "$FORGET_SCRIPT"
    ;;
  unlock)
    run_in_app "$UNLOCK_SCRIPT"
    ;;
  *)
    sed -n '2,17p' "$0"
    exit 1
    ;;
esac
