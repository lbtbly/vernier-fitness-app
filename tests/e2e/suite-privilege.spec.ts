import { expect, test } from './fixtures';
import { SUITE_ROLE, query, suiteAttempt } from './host';

/**
 * The suite cannot write the owner's database, asked of the database.
 *
 * There is a static check beside this one, tests/unit/suite-safety.test.ts, and
 * it reads the suite's source. This one reads Postgres. That is the difference
 * that matters: the static check is a grep, and a grep only knows the paths
 * somebody thought of. A spec that opened `docker compose exec db psql` and
 * handed it a TRUNCATE passed every assertion the old static check made, because
 * the write scan skipped any statement with no `query(` in front of it.
 *
 * So the line is held here, by a missing grant. Every statement below is run as
 * `vernier_suite`, which is the role every path in tests/e2e/host.ts and every
 * run of scripts/recovery.sh from this suite connects as, and Postgres answers
 * each one "permission denied for table". A helper written next year inherits
 * that refusal without knowing this file exists.
 *
 * The two INSERTs the role does hold are asserted from the other side: it may
 * append a one-time sign-in grant and an audit row, and it may not edit or
 * remove either. Nothing else on any table, in any direction.
 */

const REFUSED = [
  ['truncate measurement, source_record cascade', 'measurement'],
  ['delete from measurement', 'measurement'],
  ['insert into measurement (id) values (1)', 'measurement'],
  ['update measurement set raw_value = 1', 'measurement'],
  ['truncate source_record cascade', 'source_record'],
  ['delete from source_record', 'source_record'],
  ['update owner set display_name = 1', 'owner'],
  ['delete from owner', 'owner'],
  ['delete from webauthn_credential', 'webauthn_credential'],
  ['update webauthn_credential set counter = 0', 'webauthn_credential'],
  ['delete from device_observation', 'device_observation'],
  ['delete from integration_credential', 'integration_credential'],
  ['truncate session', 'session'],
  // The two it may append to, from the side it may not.
  ['update auth_attempt set outcome = 1', 'auth_attempt'],
  ['delete from auth_attempt', 'auth_attempt'],
  ['truncate auth_attempt', 'auth_attempt'],
  ['update recovery_grant set expires_at = now()', 'recovery_grant'],
  ['delete from recovery_grant', 'recovery_grant'],
  ['truncate recovery_grant', 'recovery_grant'],
] as const;

test.describe('the grants the suite reaches the owner\'s database through', () => {
  test('is not a superuser and cannot become one', () => {
    const role = query(
      `select 'superuser=' || rolsuper || ' createdb=' || rolcreatedb || ' createrole=' || rolcreaterole ||
              ' bypassrls=' || rolbypassrls || ' replication=' || rolreplication
         from pg_roles where rolname = '${SUITE_ROLE}'`,
    );
    console.log(`${SUITE_ROLE}: ${role}`);
    expect(role).toBe('superuser=false createdb=false createrole=false bypassrls=false replication=false');
    expect(query('select current_user')).toBe(SUITE_ROLE);
  });

  test('is refused every write on every table, by Postgres, by name', () => {
    const allowed: string[] = [];
    for (const [statement, table] of REFUSED) {
      const answer = suiteAttempt(statement);
      console.log(`  ${statement}  ->  ${answer.split('\n')[0]}`);
      if (!answer.includes(`permission denied for table ${table}`)) allowed.push(`${statement}  ->  ${answer}`);
    }
    expect(allowed, 'a write the suite\'s role was allowed to make on the owner\'s database').toEqual([]);
  });

  test('holds exactly two INSERTs and one function, and nothing else', () => {
    const grants = query(
      `select table_name || ' ' || string_agg(privilege_type, ',' order by privilege_type)
         from information_schema.table_privileges
        where grantee = '${SUITE_ROLE}' and table_schema = 'public'
          and privilege_type <> 'SELECT'
        group by table_name order by table_name`,
    );
    console.log(`writes granted: ${grants.split('\n').join(' | ')}`);
    expect(grants.split('\n').filter((line) => line !== '')).toEqual([
      'auth_attempt INSERT',
      'recovery_grant INSERT',
    ]);

    const functions = query(
      `select p.proname
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and has_function_privilege('${SUITE_ROLE}', p.oid, 'execute')
          and p.proname like 'suite_%'
        order by 1`,
    );
    expect(functions).toBe('suite_forget_passkey');
  });

  test('may forget only a credential the suite itself minted', () => {
    // The owner's own passkey, or anything shaped like it, by the same call the
    // passkey round trip makes. The function refuses before it reads the table.
    const refused = suiteAttempt("select suite_forget_passkey('AAAAnotoneofours')");
    console.log(refused);
    expect(refused).toContain('only a credential the suite minted');

    // And an identifier that carries the marker but matches no row is a
    // no-op rather than an error, which is what makes the cleanup safe to call
    // when a ceremony did not get that far.
    const marked = suiteAttempt("select suite_forget_passkey('vernierSuiteAAAAAAAAAAAAAAAAAAAAAAAAAAAA')");
    console.log(marked);
    expect(marked).toContain('forgot 0 credential(s)');
  });
});
