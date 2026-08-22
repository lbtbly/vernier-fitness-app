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
 * AND THE OWNER'S DATABASE IS READ-ONLY FROM HERE. This file used to hold a
 * helper that truncated the owner's live tables between tests, guarded by a
 * count of rows that predated the run. The guard had a hole with the shape of
 * the product in it: a waist reading logged through the shipped quick log AFTER
 * the run's stamp is not older than the run, the count stays at 0, and the
 * TRUNCATE takes it. That was watched happening, once, with a real row. Slice 5
 * imports the owner's Withings history next, and an import landing mid-suite is
 * exactly that row.
 *
 * So there is no guard any more, because there is nothing left to guard: the
 * destructive helper truncates the SCRATCH database and restarts the SCRATCH
 * container, `query` runs every statement it is given inside a read-only
 * transaction on the live install, and Postgres refuses the rest. A spec that
 * needs the owner's installation reads it. A spec that needs to write goes to
 * the scratch instance, which holds nothing anybody would miss.
 */

export const projectRoot = fileURLToPath(new URL('../..', import.meta.url));

export function baseUrl(): string {
  return (process.env.APP_URL ?? 'https://lamberts-mac-mini.tailda76d6.ts.net').replace(/\/+$/, '');
}

/**
 * A read of the owner's database, and only a read.
 *
 * `default_transaction_read_only` is set on the session before the statement
 * runs, so every statement this function carries runs in a read-only
 * transaction and Postgres itself refuses a TRUNCATE, a DELETE, an UPDATE or an
 * INSERT with "cannot execute ... in a read-only transaction". Not a naming
 * convention, not a review rule, not a count of rows: the database says no. A
 * test that needs to write has the scratch instance for it.
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
      `psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "set default_transaction_read_only = on" -c ${JSON.stringify(oneLine)}`,
    ],
    { cwd: projectRoot, encoding: 'utf8' },
  ).trim();
}

export function recovery(...args: string[]): string {
  return execFileSync('bash', ['scripts/recovery.sh', ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
  }).trim();
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
  return execFileSync('bash', ['scripts/recovery.sh', 'link', '10'], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: { ...process.env, RECOVERY_CONTAINER: SCRATCH_CONTAINER },
  })
    .trim()
    .split('\n')
    .at(-1)!
    .trim();
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
