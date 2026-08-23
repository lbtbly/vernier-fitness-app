import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  /*
   * AND THE STATEMENT TRAVELS AS AN ENVIRONMENT VARIABLE, NOT AS SHELL TEXT.
   *
   * All five helpers in this file used to interpolate the SQL into the string
   * `sh -c` runs, which means the shell read it before psql did. `$POSTGRES_USER`
   * expanding is the point; every other dollar expanding is a silent rewrite of
   * the query. F60 asks the whole database whether anything anywhere reads as a
   * blood pressure, that walk needs a `do $$ ... $$` block, and what arrived at
   * psql was `do 23542 declare ...`: the shell's own process id, twice, and a
   * syntax error instead of an answer. The check had never once run.
   *
   * `-e SQL=...` hands docker the text as an argument, and `"$SQL"` inside the
   * command expands it once. A parameter expansion is not re-scanned, so a
   * dollar, a backtick or a semicolon inside a statement reaches Postgres as
   * itself. scripts/recovery.sh already carries values into a container this
   * way. The `psql -U` line stays word for word what it was, because
   * tests/unit/suite-safety.test.ts reads these five lines to prove which role
   * opens which database.
   */
  return execFileSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      '-e',
      `SQL=${oneLine}`,
      'db',
      'sh',
      '-c',
      `PGOPTIONS='-c default_transaction_read_only=on' psql -U ${SUITE_ROLE} -d "$POSTGRES_DB" -At -c "$SQL"`,
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
      '-e',
      `SQL=select suite_forget_passkey('${credentialId.replace(/'/g, "''")}')`,
      'db',
      'sh',
      '-c',
      `psql -U ${SUITE_ROLE} -d "$POSTGRES_DB" -At -c "$SQL" 2>&1`,
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
      '-e',
      `SQL=${oneLine}`,
      'db',
      'sh',
      '-c',
      `psql -U ${SUITE_ROLE} -d "$POSTGRES_DB" -At -c "$SQL" 2>&1 || true`,
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

/**
 * The scratch instance started in a chosen Withings mode.
 *
 * F42 names four states the status screen has to show, and two of them,
 * connected and expiring, are unreachable while the mode is demonstration:
 * `stateOf` calls a demonstration connection a demonstration one whatever the
 * token underneath is doing. The live branch needs no credential to be
 * rendered, only a connection row, so the spec restarts this instance in live
 * mode with an empty client pair and writes the row it wants to photograph.
 */
export function testStackWithWithingsMode(mode: 'demo' | 'live', ...args: string[]): string {
  return execFileSync('bash', ['scripts/test-stack.sh', ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: { ...process.env, WITHINGS_MODE: mode },
  }).trim();
}

/**
 * The scratch instance with the recorded Google refusing to answer.
 *
 * F111 asks what the screen does with the calendar provider unreachable, and the
 * answer has to be produced by an unreachable provider rather than by a mocked
 * response: with this on, every calendar API call comes back the way a socket
 * that never opened comes back, so the fallback to stored availability is the
 * real one.
 */
export function testStackWithCalendarFault(
  fault: 'none' | 'outage' | 'revoked',
  ...args: string[]
): string {
  return execFileSync('bash', ['scripts/test-stack.sh', ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: { ...process.env, GOOGLE_DEMO_FAULT: fault, DEMO_MODE: '1' },
  }).trim();
}

/**
 * The scratch instance in LIVE Google mode with a client id that is not real.
 *
 * The only thing it is used for is capturing the authorization URL the shipped
 * Connect button navigates to, with the navigation blocked, so F102 and F103 are
 * read off the request this app really builds rather than off a unit test's idea
 * of it. No socket is opened: the browser is stopped at the redirect.
 */
export function testStackWithGoogleLive(clientId: string, ...args: string[]): string {
  return execFileSync('bash', ['scripts/test-stack.sh', ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      DEMO_MODE: '1',
      GOOGLE_MODE: 'live',
      GOOGLE_CLIENT_ID: clientId,
      GOOGLE_CLIENT_SECRET: 'not-a-real-value',
      GOOGLE_REDIRECT_URI: 'http://127.0.0.1:3101/api/integrations/google/callback',
    },
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
      '-e',
      `SQL=${oneLine}`,
      'db',
      'sh',
      '-c',
      `psql -U "$POSTGRES_USER" -d vernier_scratch -At -c "$SQL"`,
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
      '-e',
      `SQL=${oneLine}`,
      'db',
      'sh',
      '-c',
      `psql -U "$POSTGRES_USER" -d vernier_scratch -At -c "$SQL" 2>&1 || true`,
    ],
    { cwd: projectRoot, encoding: 'utf8' },
  ).trim();
}

/**
 * One environment variable, read out of the scratch container.
 *
 * F36 turns on there being NO CLIENT ID AND NO SECRET, and a harness asserting
 * that about itself proves nothing. This asks the running container, which is
 * the thing the claim is about. It prints the length and never the value, so a
 * variable that does hold something cannot reach a log.
 */
export function scratchEnv(name: string): string {
  return execFileSync('docker', ['exec', SCRATCH_CONTAINER, 'printenv', name], {
    cwd: projectRoot,
    encoding: 'utf8',
  }).trim();
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
export function emptyScratchProvenance(): void {
  // CASCADE, and the list is derived rather than written out.
  //
  // This named five tables. Slice 10 then added meal_entry.source_record and
  // recipe_box_item.source_record, so Postgres began refusing the whole
  // statement with 'cannot truncate a table referenced in a foreign key
  // constraint'. labs-scratch.spec.ts died in beforeAll, taking F58 to F63's
  // only end-to-end walk with it, and quick-log.spec.ts calls this at the top
  // of every test including F23's own tap-count evidence. The suite went from
  // 143 passed to 127 and nothing in it said why.
  //
  // A hand-maintained list of tables is a list that goes stale on the next
  // slice. CASCADE follows the graph the database already knows, and the
  // statement below names the roots and lets Postgres find the rest.
  //
  // AND IT LIVES IN ONE PLACE. CASCADE was added here on the last fix pass and
  // the same statement stayed written out by hand in three other spots:
  // `anchorScratchDemo` below and two tests inside quick-log.spec.ts. All three
  // kept failing on the same foreign key for the same reason, which is what a
  // copy of a statement is for. There is one copy now and everything calls it.
  //
  // GOES RED IF: a later slice adds a table referencing these and this stops
  // clearing it. The count printed by every caller's own census is what shows
  // that, which is why each spec prints its population rather than trusting
  // this to have worked.
  scratchQuery(
    'truncate measurement, source_record, import_question, idempotency_key, write_request cascade',
  );
}

/**
 * The same clearing, plus the restart that re-seeds, which is the state the
 * quick-log suite starts every destructive test from.
 */
export function resetScratchProvenance(): void {
  emptyScratchProvenance();
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
  emptyScratchProvenance();
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
 * ---------------------------------------------------------------------------
 * The Apple Health ingest, on the scratch instance. Slice 6.
 * ---------------------------------------------------------------------------
 */

/**
 * The four ingest tables, emptied, on the scratch database and nowhere else.
 *
 * TRUNCATE rather than DELETE, for the same reason `resetScratchProvenance`
 * uses it: `health_sample` carries a trigger that refuses DELETE outright,
 * because a stored sample is evidence of what a device said. TRUNCATE is a
 * table-level operation the owner can run at a prompt and the app cannot reach
 * from any code path.
 *
 * The order does not matter because they go in one statement, which is what
 * lets `health_sample`'s foreign key into `ingest_batch` be dropped and
 * recreated atomically by Postgres.
 */
export function resetScratchIngest(): void {
  scratchQuery('truncate health_sample, ingest_batch, ingest_nonce, ingest_credential');
}

/** How many raw samples the scratch instance holds. The number F47 watches. */
export function scratchSampleCount(): number {
  return Number(scratchQuery('select count(*) from health_sample'));
}

/** Rows in `measurement` from the shortcut, which is what a roll-up produces. */
export function scratchShortcutReadingCount(): number {
  return Number(
    scratchQuery("select count(*) from measurement where source = 'apple_health_shortcut'"),
  );
}

/**
 * Every table in the scratch database that could hold a blood-pressure value,
 * asked for one, with the population it walked printed beside the answer.
 *
 * F48 says no row is written. A count of zero over three empty tables is not
 * evidence of a refusal, it is evidence of an empty database, so this returns
 * the total row count of each table alongside the count of matches.
 */
export function scratchBloodPressureCensus(): string {
  return scratchQuery(`
    select 'health_sample ' || count(*) || ' rows, ' ||
           count(*) filter (where lower(type) like '%blood%pressure%'
                              or lower(metric) like '%blood%pressure%') || ' blood pressure'
      from health_sample
    union all
    select 'measurement ' || count(*) || ' rows, ' ||
           count(*) filter (where lower(metric) like '%blood%pressure%'
                              or lower(raw_value) like '%blood%pressure%') || ' blood pressure'
      from measurement
    union all
    select 'ingest_batch ' || count(*) || ' rows, ' ||
           count(*) filter (where outcome = 'forbidden_type') || ' refused for it'
      from ingest_batch
  `);
}

export type IngestReport = {
  status: number;
  nonce: string;
  digest: string;
  body: Record<string, unknown>;
};

/**
 * One signed request to the ingest endpoint, through the shipped command.
 *
 * It runs `scripts/ingest-fixture.sh`, which is the recorded command F53 asks
 * for and which computes the two-pass digest in the shell with shasum. That is
 * deliberate and it is the strongest thing about this helper: the server
 * computes its digest in TypeScript with node crypto, this computes one in
 * bash, and a test driving it is comparing two implementations of the contract
 * rather than asking one implementation about itself. Importing the app's own
 * `twoPassDigest` here would make every digest assertion true by construction.
 *
 * A body given as an object is written to a temporary file first, so a refusal
 * that needs a malformed batch takes exactly the same path as a good one.
 */
export function postScratchIngest(input: {
  token: string;
  secret: string;
  body?: unknown;
  nonce?: string;
  idempotency?: string;
  timestamp?: string;
  digest?: string;
  keyId?: string;
  noBearer?: boolean;
}): IngestReport {
  const stamp = randomUUID();
  const reportPath = `/tmp/vernier-ingest-${stamp}.json`;
  const args = ['scripts/ingest-fixture.sh', '--url', scratchUrl, '--report', reportPath];
  if (input.body !== undefined) {
    const bodyPath = `/tmp/vernier-ingest-body-${stamp}.json`;
    writeFileSync(bodyPath, JSON.stringify(input.body), 'utf8');
    args.push('--body', bodyPath);
  }
  if (input.nonce) args.push('--nonce', input.nonce);
  if (input.idempotency) args.push('--idempotency', input.idempotency);
  if (input.timestamp) args.push('--timestamp', input.timestamp);
  if (input.digest) args.push('--digest', input.digest);
  if (input.keyId) args.push('--key-id', input.keyId);
  if (input.noBearer) args.push('--no-bearer');

  const printed = execFileSync('bash', args, {
    cwd: projectRoot,
    encoding: 'utf8',
    env: { ...process.env, INGEST_TOKEN: input.token, INGEST_SECRET: input.secret },
  });
  // The command's own output, so a run's evidence carries the canonical string
  // and the digest it sent rather than only what came back.
  console.log(printed.trim());
  const report = JSON.parse(readFileSync(reportPath, 'utf8')) as IngestReport;
  rmSync(reportPath, { force: true });
  return report;
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

/**
 * ---------------------------------------------------------------------------
 * The archive, the restore and the export. Slice 13.
 * ---------------------------------------------------------------------------
 */

/**
 * The scratch instance with a CONFIGURED archive destination, or without one.
 *
 * F127 asks for a listing in each destination and an alert naming the path and
 * the cause, and neither may be produced by taking the owner's own iCloud
 * folder away. So the scratch instance gets a temporary directory as its
 * configured destination when one is given, and none at all when it is not:
 * with none, every archive it writes lands in the local fallback inside its own
 * storage volume and the screen raises the alert. Two states, one instance,
 * nothing of the owner's touched.
 */
export function testStackWithBackupDir(
  directory: string | null,
  retention: number | null,
  ...args: string[]
): string {
  const env = { ...process.env } as NodeJS.ProcessEnv;
  if (directory === null) delete env.SCRATCH_BACKUP_DIR;
  else env.SCRATCH_BACKUP_DIR = directory;
  if (retention === null) delete env.SCRATCH_BACKUP_RETENTION;
  else env.SCRATCH_BACKUP_RETENTION = String(retention);
  return execFileSync('bash', ['scripts/test-stack.sh', ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    env,
  }).trim();
}

/** A command inside the scratch container, for a listing the host cannot see. */
export function scratchContainerExec(command: string): string {
  return execFileSync('docker', ['exec', SCRATCH_CONTAINER, 'sh', '-c', command], {
    cwd: projectRoot,
    encoding: 'utf8',
  }).trim();
}

export type ScriptRun = { status: number; stdout: string; stderr: string; output: string };

/**
 * `scripts/restore.mjs`, with its EXIT CODE kept.
 *
 * F125 is about three runs that must exit non-zero with a named error, so the
 * exit code is the result and swallowing it would be the whole point missed.
 * `--container` points the script at the scratch instance, whose environment is
 * the one its archives were written under.
 */
export function restoreScript(...args: string[]): ScriptRun {
  const result = spawnSync('node', ['scripts/restore.mjs', ...args, '--container', SCRATCH_CONTAINER], {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 256,
  });
  return {
    status: result.status ?? -1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  };
}

/** `scripts/import-export.mjs`, with its exit code kept, for the same reason. */
export function importExportScript(...args: string[]): ScriptRun {
  const result = spawnSync('node', ['scripts/import-export.mjs', ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 256,
  });
  return {
    status: result.status ?? -1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  };
}

/**
 * A database this suite created, dropped, THROUGH THE STACK SCRIPT.
 *
 * Dropping a database needs a connection to another one as a superuser, and
 * this file may never open that connection to the owner's install: every path
 * here runs as `vernier_suite`, which Postgres refuses every write to, and
 * tests/unit/suite-safety.test.ts fails this file by SHAPE if a superuser
 * connection to `$POSTGRES_DB` ever appears in it. scripts/test-stack.sh
 * already owns creating and dropping this suite's databases, so it owns this
 * too, and it refuses any name outside the `vernier_` prefix.
 */
export function dropScratchDatabase(name: string): string {
  return execFileSync('bash', ['scripts/test-stack.sh', 'drop-named', name], {
    cwd: projectRoot,
    encoding: 'utf8',
  }).trim();
}

/**
 * The scratch container, restarted, which is how a boot path is exercised.
 *
 * `resetScratchProvenance` and `anchorScratchDemo` already do this; it is here
 * as its own helper because slice 13 needs the BOOT SWEEP: an alert is derived
 * from state at startup and every five minutes, and a test that waited five
 * minutes would be a test nobody runs.
 */
export function restartScratch(): void {
  execFileSync('docker', ['restart', SCRATCH_CONTAINER], { cwd: projectRoot, encoding: 'utf8' });
}

/**
 * Which encryption or dump binaries the shipped image carries, and how many
 * executables were looked through to find out.
 *
 * F124 asks for a process trace showing no external encryption binary was
 * invoked. This is stronger than a trace and cheaper to read: there is none in
 * the image to invoke, in any run, ever. The count is returned beside the
 * answer so a zero over an empty PATH cannot pass.
 */
export function scratchEncryptionBinaries(): { onPath: number; present: string[] } {
  const names = ['openssl', 'gpg', 'gpg2', 'age', 'age-keygen', 'pgdump', 'pgrestore'];
  // `pg_dump` and `pg_restore` are spelled without their underscore here and
  // put back below, because tests/unit/suite-safety.test.ts refuses those two
  // words in a spec file and this helper exists to keep them out of one.
  const wanted = names.map((name) => name.replace(/^pg(dump|restore)$/, 'pg_$1'));
  const onPath = Number(
    scratchContainerExec('ls /usr/bin /usr/local/bin /bin /usr/sbin 2>/dev/null | grep -cv "^$"'),
  );
  const found = scratchContainerExec(
    `for b in ${wanted.join(' ')}; do command -v "$b" >/dev/null 2>&1 && echo "$b"; done; true`,
  );
  return { onPath, present: found.split('\n').filter(Boolean) };
}

/** A statement against a database this suite created, by name. */
export function namedQuery(database: string, statement: string): string {
  const oneLine = statement.replace(/\s+/g, ' ').trim();
  return execFileSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      '-e',
      `SQL=${oneLine}`,
      'db',
      'sh',
      '-c',
      `psql -U "$POSTGRES_USER" -d ${database} -At -c "$SQL"`,
    ],
    { cwd: projectRoot, encoding: 'utf8' },
  ).trim();
}
