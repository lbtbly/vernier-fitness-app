import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * The host shell, which is where recovery lives.
 *
 * These tests never invent a back door to get a session. They use the same
 * procedure `docs/security.md` documents for the owner: mint a one-time link on
 * the machine itself. That keeps the suite repeatable, keeps it from changing a
 * password the owner may have set, and exercises F18 on every run.
 */

export const projectRoot = fileURLToPath(new URL('../..', import.meta.url));

export function baseUrl(): string {
  return (process.env.APP_URL ?? 'https://lamberts-mac-mini.tailda76d6.ts.net').replace(/\/+$/, '');
}

/** A read of the database, through the db container, so no credential is passed on a command line. */
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
      `psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c ${JSON.stringify(oneLine)}`,
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

/** The scratch instance: the same image, an empty database, on 127.0.0.1:3101. */
export const scratchUrl = process.env.SCRATCH_URL ?? 'http://127.0.0.1:3101';

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

/** The stamp the global setup writes, so every worker of one run shares one anchor. */
export const RUN_STAMP = 'VERNIER_SUITE_STARTED_AT';

export function suiteStartedAt(): string {
  const stamp = process.env[RUN_STAMP];
  if (!stamp) {
    throw new Error(
      `${RUN_STAMP} is not set, so this run cannot tell its own writes from the owner's. ` +
        'It is set by tests/e2e/global-setup.ts, which playwright.config.ts names. Run the suite through that config.',
    );
  }
  return stamp;
}

/**
 * Rows that are not seed data and were already here when this run started.
 *
 * The suite writes real rows through the product, so "not seed" alone cannot be
 * the question: a quick-log test logs a waist measurement and that row is as
 * un-seeded as a Withings import. What can be answered is when a row arrived.
 * Anything older than this run is somebody else's, and the only somebody else
 * on this machine is the owner.
 */
export function rowsOlderThanThisRun(): number {
  const started = suiteStartedAt();
  return Number(
    query(
      `select (select count(*) from measurement
                where not seed and imported_at < timestamptz '${started}')
            + (select count(*) from source_record
                where not seed and recorded_at < timestamptz '${started}')`,
    ),
  );
}

/**
 * A clean provenance spine plus the demonstration seed, which is the state the
 * quick-log suite starts every destructive test from.
 *
 * TRUNCATE rather than DELETE, because the measurement table carries a trigger
 * that refuses DELETE outright and that refusal is the point of F20: a row-level
 * delete has to be impossible from every code path including this one. TRUNCATE
 * is a table-level operation the owner can run at a psql prompt and the app
 * cannot reach at all.
 *
 * The restart is what re-seeds, through the same boot path the container uses in
 * anger, so nothing here writes a demonstration row by hand.
 *
 * AND IT REFUSES TO TAKE A ROW IT DID NOT WRITE. This helper runs against the
 * owner's live install and the append-only trigger does not save it: TRUNCATE
 * walks straight past a row-level trigger, which is how permanent rows were
 * removed from this database during a verification. Harmless while every row is
 * demonstration data, destructive the moment slice 5 imports a real Withings
 * reading. So it counts first, and what it counts is rows that are not seed data
 * AND predate this run. If there is one it throws, writes nothing at all, and
 * says where to go instead: the suite fails loudly and the owner's history stays
 * where it is. The scratch instance is the target for a database with real
 * readings in it, `bash scripts/test-stack.sh reset`, and nothing there is the
 * owner's.
 *
 * What the run wrote itself is fair game, and the global teardown truncates it
 * at the end, so a run leaves this database as it found it and the next run's
 * count means what it says.
 */
export function resetProvenance(): void {
  const older = rowsOlderThanThisRun();
  if (older > 0) {
    throw new Error(
      `resetProvenance refused: this database holds ${older} row(s) that are not seed data and were here before this run started at ${suiteStartedAt()}. ` +
        'TRUNCATE would take them and the append-only trigger does not stop it. ' +
        'Run the suite against the scratch instance instead: bash scripts/test-stack.sh reset.',
    );
  }
  query('truncate measurement, source_record, import_question, idempotency_key, write_request');
  execFileSync('docker', ['compose', 'restart', 'app'], { cwd: projectRoot, encoding: 'utf8' });
  execFileSync(
    'bash',
    ['-c', `for i in $(seq 1 60); do curl -fsS ${baseUrl()}/healthz >/dev/null 2>&1 && exit 0; sleep 1; done; exit 1`],
    { cwd: projectRoot, encoding: 'utf8' },
  );
}
