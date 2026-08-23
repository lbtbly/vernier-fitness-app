import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, stat, statfs, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Where an archive lands, and what to say when it cannot land where it should.
 *
 * THE CONFIGURED DESTINATION IS A PATH ON THE MAC, NOT A PATH IN THE CONTAINER.
 * `BACKUP_DIR` is the owner's iCloud Drive folder, compose bind-mounts it at
 * `BACKUP_MOUNT`, and this module writes to the mount and NAMES the host path.
 * Those two being different is the whole reason this file exists: an alert
 * reading "cannot write to /app/backups" tells the owner nothing he can act on,
 * and F127 asks for the path AND the cause.
 *
 * AVAILABILITY IS PROVEN BY WRITING, NEVER BY ASKING. `existsSync` on a bind
 * mount whose host directory has gone answers true, because the mount point is
 * still there; the same is true of an iCloud folder the file provider has
 * stopped serving. So the probe writes a file, reads it back, compares it and
 * removes it. A destination that cannot take a byte is not available, whatever
 * the directory entry says.
 */

/** Where compose mounts the configured destination inside the container. */
export const DEFAULT_BACKUP_MOUNT = '/app/backups';

/** Where archives go when the configured destination is not usable. */
export const FALLBACK_DIRECTORY = 'backups';

export type DestinationCause =
  | ''
  | 'not_configured'
  | 'missing'
  | 'not_a_directory'
  | 'not_writable'
  | 'probe_mismatch';

export type Destination = {
  kind: 'configured' | 'fallback';
  /**
   * Whether the directory named by `path` can actually take the archive.
   *
   * False only when BOTH destinations refused, which is a failed run and not a
   * fallback: reporting "written to the fallback" about a file that does not
   * exist is the shape of lie this whole slice is against. It is a field rather
   * than something the caller infers from the cause, because the cause of a
   * WORKING fallback is the configured destination's failure and the two read
   * identically from outside.
   */
  usable: boolean;
  /** The directory the bytes are written to, as this process sees it. */
  path: string;
  /** The directory as the OWNER knows it. The host path when there is one. */
  displayPath: string;
  cause: DestinationCause;
  /** The errno and the two paths, for the alert that names them. */
  detail: Record<string, string>;
};

export type ProbeResult = { ok: boolean; cause: DestinationCause; detail: Record<string, string> };

/**
 * Can this directory take a file right now.
 *
 * Creates it if it is absent, which is deliberate: a fallback directory that
 * does not exist yet is not a failure, it is the first run. A CONFIGURED
 * destination that does not exist is a different matter and the caller decides,
 * because a bind mount whose host side is gone must not be silently created.
 */
export async function probeDirectory(path: string, create: boolean): Promise<ProbeResult> {
  try {
    const entry = await stat(path).catch(async (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT' && create) {
        await mkdir(path, { recursive: true });
        return stat(path);
      }
      throw error;
    });
    if (!entry.isDirectory()) {
      return { ok: false, cause: 'not_a_directory', detail: { path } };
    }
  } catch (error) {
    const errno = (error as NodeJS.ErrnoException).code ?? 'unknown';
    return {
      ok: false,
      cause: errno === 'ENOENT' ? 'missing' : 'not_writable',
      detail: { path, errno },
    };
  }

  const probe = join(path, `.vernier-probe-${randomBytes(6).toString('hex')}`);
  const written = randomBytes(16).toString('hex');
  try {
    await writeFile(probe, written, 'utf8');
    const read = await readFile(probe, 'utf8');
    if (read !== written) {
      return { ok: false, cause: 'probe_mismatch', detail: { path } };
    }
  } catch (error) {
    return {
      ok: false,
      cause: 'not_writable',
      detail: { path, errno: (error as NodeJS.ErrnoException).code ?? 'unknown' },
    };
  } finally {
    await rm(probe, { force: true }).catch(() => undefined);
  }
  return { ok: true, cause: '', detail: {} };
}

/**
 * The destination for this run, and the cause when it is not the configured one.
 *
 * Three ways to end up on the fallback, and they are told apart because the
 * owner's next action is different for each: nothing configured means set
 * `BACKUP_DIR`, missing means the folder or the mount has gone, not writable
 * means permissions or a full disk. One sentence per cause, in the catalogue.
 */
export async function resolveDestination(input: {
  mount: string;
  hostPath: string;
  fallback: string;
}): Promise<Destination> {
  const configuredHost = input.hostPath.trim();
  if (configuredHost === '') {
    return fallBackTo(input.fallback, 'not_configured', {});
  }

  // Never created. A bind mount whose host side has gone leaves an empty
  // directory here that mkdir would happily "succeed" on, and the archive would
  // land inside the container's writable layer where nothing backs it up and
  // the next deploy throws it away.
  const probe = await probeDirectory(input.mount, false);
  if (probe.ok) {
    return {
      kind: 'configured',
      usable: true,
      path: input.mount,
      displayPath: configuredHost,
      cause: '',
      detail: {},
    };
  }
  return fallBackTo(input.fallback, probe.cause, {
    ...probe.detail,
    configured: configuredHost,
    mount: input.mount,
  });
}

async function fallBackTo(
  path: string,
  cause: DestinationCause,
  detail: Record<string, string>,
): Promise<Destination> {
  const probe = await probeDirectory(path, true);
  if (!probe.ok) {
    // Both destinations refused. The run fails and says which two paths it
    // tried, rather than throwing an ENOENT out of a stream two functions later.
    return {
      kind: 'fallback',
      usable: false,
      path,
      displayPath: path,
      cause: probe.cause,
      detail: { ...detail, ...probe.detail, fallback: path },
    };
  }
  return {
    kind: 'fallback',
    usable: true,
    path,
    displayPath: path,
    cause,
    detail: { ...detail, fallback: path },
  };
}

/** Free bytes on the filesystem holding a path, or null when it cannot be read. */
export async function freeBytes(path: string): Promise<number | null> {
  try {
    const stats = await statfs(path);
    return Number(stats.bavail) * Number(stats.bsize);
  } catch {
    return null;
  }
}

/** Total bytes of the filesystem holding a path, for the headroom percentage. */
export async function totalBytes(path: string): Promise<number | null> {
  try {
    const stats = await statfs(path);
    return Number(stats.blocks) * Number(stats.bsize);
  } catch {
    return null;
  }
}
