/**
 * Which secret an archive is encrypted with, decided in exactly one place.
 *
 * `BACKUP_PASSPHRASE` when the owner has set one, and `MASTER_KEY` otherwise.
 *
 * WHY THE FALLBACK, AND WHY IT IS NOT A COMPROMISE. `MASTER_KEY` is already 32
 * random bytes in the environment file, already outside the repository, already
 * required for the app to boot at all, and already backed up wherever the owner
 * keeps that file. Requiring a second secret before the first archive can be
 * written would mean the machine sat unarchived until he generated one, and the
 * whole point of this slice is that the standing risk ends the day it lands. A
 * separate passphrase is available for the owner who wants the archive readable
 * with a secret the running app does not hold, and the header records which was
 * used so a restore knows what to ask for.
 *
 * THE ARCHIVE KEY IS NOT THE SECRET. scrypt over a per-archive salt stands
 * between them, so two archives written under one secret share no key, and the
 * `MASTER_KEY` that opens a stored credential does not directly open a file.
 *
 * Dependency free, because both the app and `scripts/restore.mjs` decide this
 * the same way or an archive is written with one secret and opened with another.
 */

/** Just enough of an environment to read two names out of. */
export type Env = Record<string, string | undefined>;

export type SecretChoice = {
  secret: string;
  /** Which environment variable it came from, for the header and for a message. */
  source: 'passphrase' | 'master_key';
};

export class SecretMissingError extends Error {
  readonly code = 'archive_secret_missing';

  constructor() {
    super('archive_secret_missing');
    this.name = 'SecretMissingError';
  }
}

export function archiveSecret(env: Env = process.env): SecretChoice {
  const passphrase = (env.BACKUP_PASSPHRASE ?? '').trim();
  if (passphrase !== '') return { secret: passphrase, source: 'passphrase' };
  const masterKey = (env.MASTER_KEY ?? '').trim();
  if (masterKey !== '') return { secret: masterKey, source: 'master_key' };
  throw new SecretMissingError();
}
