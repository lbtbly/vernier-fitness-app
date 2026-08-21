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
  return execFileSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'db',
      'sh',
      '-c',
      `psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c ${JSON.stringify(statement)}`,
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

export function ownerExists(): boolean {
  return Number(query('select count(*) from owner')) > 0;
}
