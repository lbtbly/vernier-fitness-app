#!/usr/bin/env bash
# The Postgres role the test suite reaches the owner's database through, and
# the only one it may use.
#
#   scripts/suite-role.sh            create or refresh the role, print what it may do
#   scripts/suite-role.sh --check    print what it may do, change nothing
#
# WHY A ROLE AND NOT A CONNECTION STRING. The suite used to reach the live
# database through one helper that set `default_transaction_read_only`, and a
# static test greped the suite for write statements handed to that helper.
# Postgres really did refuse everything that helper carried. It was still one
# path among several: `scripts/recovery.sh` drives a second connection into the
# same database through the app container, with `transaction_read_only` off, and
# two specs used it to UPDATE the owner row and DELETE credentials. A spec that
# opened its own psql was refused by nothing at all, because the grep only knew
# about statements with `query(` in front of them.
#
# A missing grant holds where a naming convention cannot. Every path the suite
# has to the owner's install now runs as `vernier_suite`, which holds SELECT and
# almost nothing else, so a path nobody modelled inherits the refusal instead of
# escaping it. From slice 5 those tables hold the owner's real Withings history
# and `measurement` refuses DELETE outright, so a row lost is lost for good.
#
# WHAT IT MAY WRITE, and why each one is here rather than absent:
#
#   recovery_grant  INSERT. A spec signs in the way docs/security.md tells the
#                   owner to: mint a one-time link on this machine. The row is a
#                   sha256 of a token, it expires, it is spent once, and it
#                   carries no health data. Without it the suite cannot reach a
#                   signed-in screen on the live origin at all.
#   auth_attempt    INSERT. The append-only sign-in log. The rate-limit spec
#                   clears the 60-second lockout it created with the same host
#                   command the owner has, and clearing is an INSERT: nothing in
#                   that table is ever edited or removed.
#
# Both are append-only by grant: no UPDATE, no DELETE, no TRUNCATE on either,
# and nothing at all on `measurement`, `source_record`, `owner`,
# `webauthn_credential` or any other table. tests/e2e/suite-privilege.spec.ts
# proves that against the running database rather than against this file.
#
# AND ONE BOUNDED FUNCTION. The passkey round trip has to remove the credential
# it registered, or it leaves the owner's account trusting an authenticator that
# lives for the length of a test. It cannot be given DELETE on
# `webauthn_credential`: that is the table holding the owner's real passkey. So
# it gets EXECUTE on one security-definer function that refuses any credential
# whose identifier the suite's own software authenticator did not mint, which it
# marks with a twelve-character prefix no random 32-byte identifier will carry.
#
# WHAT THIS CANNOT DO. Anyone who can run `docker compose exec db` is root in
# that container and can open psql as the bootstrap superuser, which bypasses
# every grant here. That is true of the owner too and no privilege can change
# it. What closes it for the suite is tests/unit/suite-safety.test.ts, which
# fails on any spec that reaches for docker, psql or recovery.sh outside
# tests/e2e/host.ts.
set -euo pipefail

cd "${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"

ROLE=vernier_suite
CREDENTIAL_MARKER=vernierSuite

if ! docker compose ps --status running --services 2>/dev/null | grep -qx db; then
  echo "suite-role: the database container is not running. Start the stack with scripts/up.sh first." >&2
  exit 1
fi

run_sql() {
  docker compose exec -T db sh -c "psql -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -At -f -"
}

REPORT="
select 'role ' || rolname || ': superuser ' || rolsuper || ', createdb ' || rolcreatedb
       || ', createrole ' || rolcreaterole || ', bypassrls ' || rolbypassrls
  from pg_roles where rolname = '${ROLE}';
select 'grant ' || table_name || ' ' || string_agg(privilege_type, ',' order by privilege_type)
  from information_schema.table_privileges
 where grantee = '${ROLE}' and table_schema = 'public'
 group by table_name order by table_name;
select 'execute ' || p.proname || '(' || pg_get_function_arguments(p.oid) || ')'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and has_function_privilege('${ROLE}', p.oid, 'execute')
   and p.proname like 'suite_%';
"

if [ "${1:-}" = "--check" ]; then
  printf '%s' "$REPORT" | run_sql
  exit 0
fi

printf '%s' "
do \$grant\$
begin
  if not exists (select 1 from pg_roles where rolname = '${ROLE}') then
    execute 'create role ${ROLE} login';
  end if;
end
\$grant\$;

-- No password, ever. pg_hba trusts the local socket inside this container and
-- demands scram over TCP, so a role with no password can be used from a psql
-- run inside the database container and from a SET ROLE on a connection that
-- already authenticated, and cannot open a connection over the network at all.
alter role ${ROLE} nosuperuser nocreatedb nocreaterole nobypassrls noreplication;
alter role ${ROLE} with password null;

do \$connect\$
begin
  execute format('grant connect on database %I to ${ROLE}', current_database());
end
\$connect\$;

revoke all on schema public from ${ROLE};
grant usage on schema public to ${ROLE};

revoke all on all tables in schema public from ${ROLE};
revoke all on all sequences in schema public from ${ROLE};
revoke all on all functions in schema public from ${ROLE};

grant select on all tables in schema public to ${ROLE};
grant insert on recovery_grant to ${ROLE};
grant insert on auth_attempt to ${ROLE};

-- A table added by a later migration is readable without another visit here,
-- and still writable by nobody.
alter default privileges in schema public grant select on tables to ${ROLE};

-- The one write the suite has on a credential table, and it is not a grant on
-- the table. The function runs as its owner and refuses anything that is not a
-- credential the suite's own authenticator minted, so the owner's iPhone passkey
-- is outside its reach by the same rule that lets the test clean up after itself.
create or replace function suite_forget_passkey(credential text)
returns text
language plpgsql
security definer
set search_path = public
as \$forget\$
declare
  removed integer;
  remaining integer;
begin
  if credential is null or credential not like '${CREDENTIAL_MARKER}%' then
    raise exception 'suite_forget_passkey refuses %: only a credential the suite minted, marked ${CREDENTIAL_MARKER}, may be forgotten here', coalesce(credential, 'null');
  end if;
  delete from webauthn_credential where id = credential;
  get diagnostics removed = row_count;
  select count(*) into remaining from webauthn_credential;
  -- The signal says a passkey has been registered on this installation, and
  -- with the last one gone it would be saying that about nothing. It goes with
  -- the last credential and only ever with a credential: a call that removed
  -- nothing changes nothing, so probing this function cannot cost the owner a
  -- diagnostics row.
  if removed > 0 and remaining = 0 then
    delete from device_observation where signal = 'passkey_registered';
  end if;
  return 'forgot ' || removed || ' credential(s), ' || remaining || ' left, signal ' ||
         case when remaining = 0 then 'cleared' else 'kept' end;
end
\$forget\$;

revoke all on function suite_forget_passkey(text) from public;
grant execute on function suite_forget_passkey(text) to ${ROLE};
" | run_sql >/dev/null

echo "suite-role: ${ROLE} is current on the owner's database."
printf '%s' "$REPORT" | run_sql | sed 's/^/  /'
