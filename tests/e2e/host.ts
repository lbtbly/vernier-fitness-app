import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

/**
 * The host shell, which is where recovery lives.
 *
 * These tests never invent a back door to get a session. They use the same
 * procedure `docs/security.md` documents for the owner: mint a one-time link on
 * the machine itself. That keeps the suite repeatable, keeps it from changing a
 * password the owner may have set, and exercises F18 on every run.
 *
 * AND THE OWNER'S DATABASE REFUSES THIS SUITE BY PRIVILEGE. This file used to
 * hold a helper that truncated the owner's live tables between tests, guarded by
 * a count of rows that predated the run. The guard had a hole with the shape of
 * the product in it: a waist reading logged through the shipped quick log AFTER
 * the run's stamp is not older than the run, the count stays at 0, and the
 * TRUNCATE takes it. That was watched happening, once, with a real row. Slice 5
 * imports the owner's Withings history next, and an import landing mid-suite is
 * exactly that row.
 *
 * The guard became a read-only connection, and that was still one path among
 * several: `scripts/recovery.sh` drove a second connection into the same
 * database with writes on, and two specs used it to UPDATE the owner row and
 * DELETE a credential. So the refusal is a grant now. `scripts/suite-role.sh`
 * creates `vernier_suite`, which holds SELECT, an INSERT on the one-time sign-in
 * grants, an INSERT on the append-only auth log, and nothing else, and every
 * path in this file runs as it: the psql helper connects as it, and
 * `scripts/recovery.sh` is handed it in RECOVERY_ROLE. A path nobody modelled
 * inherits the refusal rather than escaping it. A spec that needs to write goes
 * to the scratch instance, which holds nothing anybody would miss.
 */

export const projectRoot = fileURLToPath(new URL('../..', import.meta.url));

/**
 * The role every path in this suite reaches the owner's database through.
 *
 * Not a convention: `scripts/suite-role.sh` writes the grants and
 * tests/e2e/suite-privilege.spec.ts reads back, off the running database, what
 * this role is refused. The name is here once so a new helper cannot connect as
 * anything else by accident.
 */
export const SUITE_ROLE = 'vernier_suite';

/** The grants, refreshed before the first spec. Idempotent, and it prints them. */
export function ensureSuiteRole(): string {
  return execFileSync('bash', ['scripts/suite-role.sh'], {
    cwd: projectRoot,
    encoding: 'utf8',
  }).trim();
}

export function baseUrl(): string {
  return (process.env.APP_URL ?? 'https://lamberts-mac-mini.tailda76d6.ts.net').replace(/\/+$/, '');
}

/**
 * A read of the owner's database, and only a read.
 *
 * Two refusals, and the second is the one that holds. `default_transaction_read_only`
 * is set through PGOPTIONS, so every statement runs in a read-only transaction.
 * And the connection is opened as `vernier_suite`, which has no INSERT, UPDATE,
 * DELETE or TRUNCATE grant on any table this reads, so a statement that got past
 * the transaction setting still meets "permission denied for table measurement".
 * Not a naming convention, not a review rule, not a count of rows: the database
 * says no, and it says no to a helper written next year the same way it says no
 * to this one. A test that needs to write has the scratch instance for it.
 */
export function query(statement: string): string {
  // One line, always. A statement written across several lines in a test would
  // reach psql with the newlines escaped, and psql would refuse it.
  const oneLine = statement.replace(/\s+/g, ' ').trim();
  return execFileSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'db',
      'sh',
      '-c',
      `PGOPTIONS='-c default_transaction_read_only=on' psql -U ${SUITE_ROLE} -d "$POSTGRES_DB" -At -c ${JSON.stringify(oneLine)}`,
    ],
    { cwd: projectRoot, encoding: 'utf8' },
  ).trim();
}

/**
 * The owner's own recovery script, run against the owner's install with the
 * suite's grants and no others.
 *
 * RECOVERY_ROLE is what makes this safe to call at all. Without it the script
 * connects as the database owner, which is how `password` came to overwrite the
 * owner's backup password on every run and how `forget-passkey` had DELETE on
 * the table holding his real credential. With it, `status`, `passkeys`, `link`
 * and `unlock` work and the two destructive commands are refused by Postgres
 * with "permission denied for table owner" and "for table webauthn_credential".
 * The specs that need those two run against the scratch instance.
 */
export function recovery(...args: string[]): string {
  return execFileSync('bash', ['scripts/recovery.sh', ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: { ...process.env, RECOVERY_ROLE: SUITE_ROLE },
  }).trim();
}

/**
 * The same script against the scratch instance, with its full connection.
 *
 * The scratch database holds an owner this suite created and rows nobody would
 * miss, so the commands that write are run there rather than aimed at the
 * owner's install with a bigger grant.
 */
export function scratchRecovery(args: string[], input?: string): string {
  return execFileSync('bash', ['scripts/recovery.sh', ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    input,
    env: { ...process.env, RECOVERY_CONTAINER: SCRATCH_CONTAINER },
  }).trim();
}

/**
 * The one write this suite has on the owner's credential table, and it is not a
 * grant on the table.
 *
 * `suite_forget_passkey` runs as its owner and refuses any identifier that does
 * not carry the prefix the suite's software authenticator mints, so the passkey
 * round trip can remove the credential it registered and cannot touch the
 * owner's. The function is created by scripts/suite-role.sh beside the grants,
 * where the rest of this role's reach is written down.
 */
export function forgetSuitePasskey(credentialId: string): string {
  return execFileSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'db',
      'sh',
      '-c',
      `psql -U ${SUITE_ROLE} -d "$POSTGRES_DB" -At -c ${JSON.stringify(
        `select suite_forget_passkey('${credentialId.replace(/'/g, "''")}')`,
      )} 2>&1`,
    ],
    { cwd: projectRoot, encoding: 'utf8' },
  ).trim();
}

/**
 * A statement run as the suite's role with its refusal kept rather than thrown.
 *
 * tests/e2e/suite-privilege.spec.ts hands this the writes the suite must not be
 * able to make and reads back what Postgres said. Both streams are merged and
 * the exit code swallowed, because the refusal is the result.
 */
export function suiteAttempt(statement: string): string {
  const oneLine = statement.replace(/\s+/g, ' ').trim();
  return execFileSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'db',
      'sh',
      '-c',
      `psql -U ${SUITE_ROLE} -d "$POSTGRES_DB" -At -c ${JSON.stringify(oneLine)} 2>&1 || true`,
    ],
    { cwd: projectRoot, encoding: 'utf8' },
  ).trim();
}

/**
 * What the app container has written to its log, for the specs that grade what
 * a refusal did NOT print.
 *
 * It lives here rather than in the spec that wants it for the same reason every
 * other command does: one file in this suite reaches for docker, and a spec
 * that spawns its own is a failing unit test before anyone reads the arguments.
 */
export function appLogs(lines = 400): string {
  return execFileSync('docker', ['compose', 'logs', 'app', '--tail', String(lines)], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
}

/** One use, ten minutes, minted on this machine. */
export function mintSignInLink(): string {
  return recovery('link', '10').split('\n').at(-1)!.trim();
}

/** The scratch instance: the same image, its own database, on 127.0.0.1:3101. */
export const scratchUrl = process.env.SCRATCH_URL ?? 'http://127.0.0.1:3101';

/** The container the scratch instance runs in, which scripts/test-stack.sh starts. */
export const SCRATCH_CONTAINER = 'vernier-scratch';

/**
 * The same one-time link, minted on the scratch instance.
 *
 * Same script, same procedure, same table. RECOVERY_CONTAINER points it at the
 * scratch container, which holds its own DATABASE_URL and its own APP_URL, so
 * the link that comes back is for the origin the spec is driving.
 */
export function scratchSignInLink(): string {
  return scratchRecovery(['link', '10']).split('\n').at(-1)!.trim();
}

export function testStack(...args: string[]): string {
  return execFileSync('bash', ['scripts/test-stack.sh', ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
  }).trim();
}

/**
 * The same scratch instance with demonstration mode set on purpose, which is
 * the whole of F25's question: off writes nothing at all, on writes six rows
 * and marks every one of them.
 */
export function testStackWithDemoMode(demoMode: '0' | '1', ...args: string[]): string {
  return execFileSync('bash', ['scripts/test-stack.sh', ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: { ...process.env, DEMO_MODE: demoMode },
  }).trim();
}

export function scratchQuery(statement: string): string {
  const oneLine = statement.replace(/\s+/g, ' ').trim();
  return execFileSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'db',
      'sh',
      '-c',
      `psql -U "$POSTGRES_USER" -d vernier_scratch -At -c ${JSON.stringify(oneLine)}`,
    ],
    { cwd: projectRoot, encoding: 'utf8' },
  ).trim();
}

/** A port that was just republished answers when it answers, so ask until it does. */
export async function waitForScratch(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${scratchUrl}/healthz`);
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`the scratch instance never answered on ${scratchUrl}`);
}

/**
 * A statement whose refusal is the point.
 *
 * Postgres writes a constraint violation to stderr and psql exits non-zero, so
 * both streams are merged and the exit code is swallowed: what is being read
 * back here is whether the database said no, and which constraint said it.
 */
export function scratchAttempt(statement: string): string {
  const oneLine = statement.replace(/\s+/g, ' ').trim();
  return execFileSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'db',
      'sh',
      '-c',
      `psql -U "$POSTGRES_USER" -d vernier_scratch -At -c ${JSON.stringify(oneLine)} 2>&1 || true`,
    ],
    { cwd: projectRoot, encoding: 'utf8' },
  ).trim();
}

export function ownerExists(): boolean {
  return Number(query('select count(*) from owner')) > 0;
}

/**
 * An owner on the scratch instance, created the way the owner's own was.
 *
 * Through the shipped bootstrap route, with a password that lives for the
 * length of this process and is never written down. The destructive specs sign
 * in on this instance, and a sign-in needs an account to sign in to.
 */
export async function ensureScratchOwner(): Promise<void> {
  if (Number(scratchQuery('select count(*) from owner')) > 0) return;
  const password = `Scratch-${randomUUID()}-Q9!`;
  const first = await fetch(`${scratchUrl}/sign-in`, { redirect: 'manual' });
  const csrf =
    first.headers
      .getSetCookie()
      .map((line) => line.split(';')[0])
      .find((pair) => pair.startsWith('vernier_csrf=')) ?? '';
  const created = await fetch(`${scratchUrl}/api/auth/bootstrap`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'content-type': 'application/json',
      cookie: csrf,
      'x-vernier-csrf': csrf.slice('vernier_csrf='.length),
    },
    body: JSON.stringify({ password, repeat: password }),
  });
  if (created.status !== 201) {
    throw new Error(`the scratch instance would not create an owner: ${created.status} ${await created.text()}`);
  }
}

/**
 * A clean provenance spine plus the demonstration seed, on the scratch
 * instance, which is the state the quick-log suite starts every destructive
 * test from.
 *
 * TRUNCATE rather than DELETE, because the measurement table carries a trigger
 * that refuses DELETE outright and that refusal is the point of F20: a
 * row-level delete has to be impossible from every code path including this
 * one. TRUNCATE is a table-level operation the owner can run at a psql prompt
 * and the app cannot reach at all.
 *
 * The restart is what re-seeds, through the same boot path the container uses
 * in anger, so nothing here writes a demonstration row by hand.
 *
 * AND IT NAMES THE DATABASE IT TAKES. `scratchQuery` connects to
 * vernier_scratch by name, not to whatever POSTGRES_DB happens to be, so there
 * is no timing, no ordering and no environment in which this statement reaches
 * the owner's install. The version of this helper that pointed at the live
 * database is gone rather than better guarded: it counted rows that predated
 * the run, and a row written through the shipped quick log a second later
 * counted as the run's own and was taken. The owner watched one die.
 */
export function resetScratchProvenance(): void {
  scratchQuery('truncate measurement, source_record, import_question, idempotency_key, write_request');
  execFileSync('docker', ['restart', SCRATCH_CONTAINER], { cwd: projectRoot, encoding: 'utf8' });
  execFileSync(
    'bash',
    [
      '-c',
      `for i in $(seq 1 60); do curl -fsS ${scratchUrl}/healthz >/dev/null 2>&1 && exit 0; sleep 1; done; exit 1`,
    ],
    { cwd: projectRoot, encoding: 'utf8' },
  );
}

/**
 * One reading from one source, landed on the scratch instance at a chosen age.
 *
 * Two specs need a state the demonstration seed cannot produce: a source that
 * stopped sending exactly thirty-five hours ago, and both syncing sources
 * sending inside the last thirty-six, which is the "nothing raised" state F27
 * names and which the seed never reaches because its phone is permanently four
 * days silent.
 *
 * The rows go in by SQL because the shortcut ingest is slice 6 and the Withings
 * sync is slice 5, so there is no shipped route that delivers one yet, and that
 * is stated here rather than left for somebody to notice. The `seed` column is
 * generated from the source, so nothing landed this way can pretend to be
 * demonstration data or the reverse: the composite foreign key refuses both.
 *
 * Scratch only, by name, like every other write in this file.
 */
export function landScratchSample(
  slug: string,
  source: 'apple_health_shortcut' | 'withings',
  metric: string,
  value: number,
  unit: string,
  hoursAgo: number,
): void {
  const kind = source === 'withings' ? 'device_sync_batch' : 'shortcut_payload';
  scratchQuery(`
    insert into source_record (id, source, kind, reference, occurred_at, import_version, detail, seed)
    values ('${slug}-src', '${source}', '${kind}', '${slug}',
            now() - interval '${Number(hoursAgo)} hours', '2026-08-3', '[]'::jsonb, false)
    on conflict (id) do nothing
  `);
  scratchQuery(`
    insert into measurement (
      id, metric, raw_value, raw_unit, value, unit, time_zone, source, measured_at,
      confidence, import_version, dedup_decision, dedup_reason, source_record_id, root_id
    ) values (
      '${slug}', '${metric}', '${value}', '${unit}', ${Number(value)}, '${unit}', 'Europe/Paris',
      '${source}', now() - interval '${Number(hoursAgo)} hours', 'measured_device',
      '2026-08-3', 'unique', 'The first reading of this metric on this day.', '${slug}-src', '${slug}'
    ) on conflict (id) do nothing
  `);
}

/**
 * The signals C2 reads back as proof the owner opened Vernier from his iPhone
 * Home Screen, in one line, for the run to compare against.
 *
 * On 2026-08-22 two of them went true on the owner's install at 16:13:55,
 * written by a headless browser on this Mac, and two owner-blocked rubric lines
 * read as met by a row the suite had authored. This is the census that would
 * have caught it while the run that did it was still running.
 */
export function liveDeviceObservations(): string {
  return query(`
    select coalesce(
      string_agg(
        signal || '=' || observed || '@' || coalesce(first_observed_at::text, 'never')
          || '/' || last_reported_at::text || '/' || coalesce(reported_from, 'unattributed'),
        ', ' order by signal
      ), 'none')
    from device_observation
  `);
}

/**
 * The demonstration seed, re-anchored a chosen number of days back, on the
 * scratch instance and nowhere else.
 *
 * F27 measures Today's fold against the states the live install actually
 * reaches, and the two that matter cannot be waited for: the scale goes quiet
 * four days in every twenty-one, so two sources are silent at once on about one
 * day in six, and there is no shipped path that makes that happen today. The
 * seed is a pure function of `demo.anchor_day`, so moving the anchor moves the
 * whole six weeks and the continuation fills forward to today from there. Anchor
 * 198, 199 and 200 days back are the three consecutive days the verifier
 * measured the defect at, and 196 is the neighbouring day with one source quiet.
 *
 * TRUNCATE and a restart, exactly as `resetScratchProvenance` does and for the
 * same reasons: `measurement` refuses DELETE, and the restart is what re-seeds
 * through the boot path the container uses in anger. The database is named
 * `vernier_scratch` in the statement, so no ordering or environment puts this
 * anywhere near the owner's install.
 */
export function anchorScratchDemo(daysAgo: number): string {
  if (!Number.isInteger(daysAgo) || daysAgo < 1 || daysAgo > 3650) {
    throw new Error(`an anchor of ${daysAgo} days is not a day count`);
  }
  scratchQuery('truncate measurement, source_record, import_question, idempotency_key, write_request');
  scratchQuery("delete from app_meta where key in ('demo.anchor_day', 'demo.filled_through')");
  scratchQuery(
    `insert into app_meta (key, value) values ('demo.anchor_day', to_char(current_date - ${daysAgo}, 'YYYY-MM-DD'))`,
  );
  execFileSync('docker', ['restart', SCRATCH_CONTAINER], { cwd: projectRoot, encoding: 'utf8' });
  execFileSync(
    'bash',
    [
      '-c',
      `for i in $(seq 1 60); do curl -fsS ${scratchUrl}/healthz >/dev/null 2>&1 && exit 0; sleep 1; done; exit 1`,
    ],
    { cwd: projectRoot, encoding: 'utf8' },
  );
  return scratchQuery("select value from app_meta where key = 'demo.anchor_day'");
}

/** How many syncing sources are past the staleness threshold, asked of the database. */
export function scratchQuietSources(hours = 36): number {
  return Number(
    scratchQuery(`
      select count(*) from (
        select sr.source, max(m.measured_at) last
        from measurement m join source_record sr on sr.id = m.source_record_id
        where sr.source in ('withings', 'apple_health_shortcut')
        group by sr.source
      ) s where s.last < now() - interval '${Number(hours)} hours'
    `),
  );
}

/**
 * What the owner's install holds, in one line, for the run to compare against.
 *
 * Read at the start and read again at the end. Nothing in this suite may lower
 * either number, and the teardown fails the run if one falls: no test writes
 * the live provenance tables and no test can delete from them, so a drop means
 * something happened that nobody wrote down.
 */
export function liveProvenanceCensus(): string {
  return query(
    `select (select count(*) from measurement) || ' measurement, '
         || (select count(*) from source_record) || ' source_record, '
         || (select count(*) from measurement where not seed) || ' measurement not seeded'`,
  );
}

/**
 * The laboratory files on the SCRATCH instance's storage volume, names only.
 *
 * F63 asks for a directory listing before and after a delete, and the listing
 * has to come off the filesystem rather than out of the database: those two
 * disagreeing is the interesting case and a helper that read the row would hide
 * it. It runs inside the scratch container by name, like every other write in
 * this file, and the owner's volume is never read or touched by the suite.
 *
 * It lives here rather than in the spec that wants it for the same reason every
 * other command does: one file in this suite reaches for a container, and a spec
 * that spawns its own is a failing unit test before anyone reads its arguments.
 */
export function scratchLabFiles(): string[] {
  const listed = execFileSync(
    'docker',
    ['exec', SCRATCH_CONTAINER, 'sh', '-c', 'ls -1 /app/storage/labs 2>/dev/null || true'],
    { cwd: projectRoot, encoding: 'utf8' },
  ).trim();
  return listed === '' ? [] : listed.split('\n').map((name) => name.trim()).filter(Boolean);
}

/**
 * The whole of the scratch database asked one question: does any table, any
 * column, anywhere, hold something that reads as a blood-pressure value.
 *
 * F60 asks for "a query across every table", and a query naming the three tables
 * somebody remembered is not that. This walks `information_schema` for every
 * text and json column in the public schema and searches all of them, so a
 * column added next year is covered without anybody editing this helper. It
 * returns the matches, and the only passing answer is none.
 */
export function scratchBloodPressureSearch(): string {
  return scratchQuery(`
    do $$
    declare
      column_row record;
      found bigint;
    begin
      create temporary table if not exists bp_matches (place text, sample text) on commit preserve rows;
      delete from bp_matches;
      for column_row in
        select table_name, column_name
        from information_schema.columns
        where table_schema = 'public'
          and data_type in ('text','character varying','json','jsonb')
      loop
        execute format(
          'insert into bp_matches select %L, left(%I::text, 120) from %I where %I::text ~* %L',
          column_row.table_name || '.' || column_row.column_name,
          column_row.column_name,
          column_row.table_name,
          column_row.column_name,
          '(mmhg|tension arterielle|pression arterielle|blood pressure|systolic|diastolic|128/82)'
        );
      end loop;
      select count(*) into found from bp_matches;
      raise notice 'blood pressure matches: %', found;
    end
    $$;
    select coalesce(string_agg(place || ' = ' || sample, ' | '), 'none') from bp_matches
  `);
}
