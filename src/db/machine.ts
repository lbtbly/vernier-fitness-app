import { getPool } from './client';
import { readLastBackupRun, readLastGoodBackupRun, readLastRestoreCheck } from './backup';
import { describeIntegrations } from './integrations';
import { ARCHIVE_STALE_HOURS, DISK_WARN_BYTES } from '@/lib/backup/alerts';
import { backupMount, configuredDirectory } from '@/lib/backup/run';
import { FALLBACK_DIRECTORY, freeBytes, totalBytes } from '@/lib/backup/destination';
import { listArchives, retentionSetting } from '@/lib/backup/retention';
import { getConfig } from '@/lib/config';
import { hoursBetween } from '@/lib/format';
import { storageRoot } from '@/lib/lab-storage';
import { STALE_HOURS } from '@/lib/trend';
import { join } from 'node:path';

/**
 * What the operator checks at 23:00, read from the two containers themselves.
 *
 * WHERE THE CONTAINER STATE COMES FROM, AND WHY IT IS NOT THE DOCKER DAEMON.
 * This process runs inside the app container and has no socket to the daemon,
 * which is deliberate: an application that can talk to Docker can restart its
 * own host. So each container reports itself. The app's state is this process,
 * its uptime and the version it is running; the database's is a round trip to
 * Postgres that returns its version and the instant its postmaster started.
 * Both are facts about the thing they describe, both are read at request time,
 * and neither can go stale the way a snapshot written by a host script would.
 *
 * NO CREDENTIAL, ANYWHERE IN THIS SHAPE. Not a token, not a length, not a
 * fingerprint. F132 is explicit, `12-settings-integrations.html` frame 1 draws a
 * card that says so out loud, and the e2e spec searches the rendered markup for
 * the seeded values. What is here is state, and state is a different permission
 * level from the credential behind it.
 */

export type ContainerState = {
  name: 'app' | 'database';
  running: boolean;
  /** ISO, or null when the thing cannot say. */
  since: string | null;
  version: string;
  detail: string;
};

export type DiskState = {
  label: 'storage' | 'archives';
  path: string;
  free: number | null;
  total: number | null;
  warn: boolean;
};

export type MachineStatus = {
  containers: ContainerState[];
  disks: DiskState[];
  archive: {
    lastAt: string | null;
    lastGoodAt: string | null;
    hoursSinceGood: number | null;
    outcome: string;
    destination: string;
    directory: string;
    fileName: string;
    bytes: number;
    integrity: string;
    cause: string;
    kept: number;
    retention: number;
    onDisk: Array<{ name: string; bytes: number; at: string }>;
    warn: boolean;
  };
  restore: { lastAt: string | null; outcome: string; archiveName: string; warn: boolean };
  integrations: Array<{
    provider: string;
    name: string;
    state: string;
    lastSuccessfulSyncAt: string | null;
    hours: number | null;
    warn: boolean;
  }>;
  thresholds: { diskBytes: number; archiveHours: number; syncHours: number };
  origin: { appUrl: string; rpId: string; listener: string };
};

/** What the app publishes on the host, which is loopback and nothing else. */
const HOST_LISTENER = '127.0.0.1:3000';

export async function readMachineStatus(now: Date = new Date()): Promise<MachineStatus> {
  const config = getConfig();
  const pool = getPool();

  let database: ContainerState = {
    name: 'database',
    running: false,
    since: null,
    version: '',
    detail: 'unreachable',
  };
  try {
    const { rows } = await pool.query(
      "select current_setting('server_version') as version, pg_postmaster_start_time() as started",
    );
    database = {
      name: 'database',
      running: true,
      since: rows[0]?.started ? new Date(rows[0].started as string).toISOString() : null,
      version: String(rows[0]?.version ?? ''),
      detail: '',
    };
  } catch (error) {
    database = {
      name: 'database',
      running: false,
      since: null,
      version: '',
      detail: (error as NodeJS.ErrnoException).code ?? 'unreachable',
    };
  }

  const app: ContainerState = {
    name: 'app',
    running: true,
    since: new Date(now.getTime() - process.uptime() * 1000).toISOString(),
    version: process.version,
    detail: '',
  };

  const storage = storageRoot();
  const archiveDirectory = configuredDirectory() === '' ? join(storage, FALLBACK_DIRECTORY) : backupMount();
  const [storageFree, storageTotal, archiveFree, archiveTotal] = await Promise.all([
    freeBytes(storage),
    totalBytes(storage),
    freeBytes(archiveDirectory),
    totalBytes(archiveDirectory),
  ]);

  const [last, lastGood, restore, integrations] = await Promise.all([
    readLastBackupRun(),
    readLastGoodBackupRun(),
    readLastRestoreCheck(),
    describeIntegrations(),
  ]);

  const hoursSinceGood = lastGood?.finishedAt
    ? hoursBetween(new Date(lastGood.finishedAt), now)
    : null;

  const onDisk = await listArchives(
    last?.writtenTo && last.writtenTo !== '' ? last.writtenTo : archiveDirectory,
  );

  return {
    containers: [app, database],
    disks: [
      {
        label: 'storage',
        path: storage,
        free: storageFree,
        total: storageTotal,
        warn: storageFree !== null && storageFree < DISK_WARN_BYTES,
      },
      {
        label: 'archives',
        path: last?.directory && last.directory !== '' ? last.directory : archiveDirectory,
        free: archiveFree,
        total: archiveTotal,
        warn: archiveFree !== null && archiveFree < DISK_WARN_BYTES,
      },
    ],
    archive: {
      lastAt: last?.finishedAt ?? last?.startedAt ?? null,
      lastGoodAt: lastGood?.finishedAt ?? null,
      hoursSinceGood,
      outcome: last?.outcome ?? '',
      destination: last?.destination ?? '',
      directory: last?.directory ?? '',
      fileName: lastGood?.fileName ?? '',
      bytes: lastGood?.bytes ?? 0,
      integrity: lastGood?.integrity ?? last?.integrity ?? 'unchecked',
      cause: last?.cause ?? '',
      kept: last?.kept ?? onDisk.length,
      retention: retentionSetting(),
      onDisk: onDisk.map((entry) => ({
        name: entry.name,
        bytes: entry.bytes,
        at: entry.at.toISOString(),
      })),
      warn: hoursSinceGood === null || hoursSinceGood >= ARCHIVE_STALE_HOURS,
    },
    restore: {
      lastAt: restore?.checkedAt ?? null,
      outcome: restore?.outcome ?? '',
      archiveName: restore?.archiveName ?? '',
      // An archive nobody has ever restored is a hypothesis, and so is one whose
      // last restore did not match. Both read warn; only the words differ.
      warn: !restore || restore.outcome !== 'matched',
    },
    integrations: integrations.map((integration) => {
      const hours = integration.lastSuccessfulSyncAt
        ? hoursBetween(new Date(integration.lastSuccessfulSyncAt), now)
        : null;
      return {
        provider: integration.provider,
        name: integration.name,
        state: integration.state,
        lastSuccessfulSyncAt: integration.lastSuccessfulSyncAt,
        hours,
        warn: integration.state === 'error' || (hours !== null && hours >= STALE_HOURS),
      };
    }),
    thresholds: {
      diskBytes: DISK_WARN_BYTES,
      archiveHours: ARCHIVE_STALE_HOURS,
      syncHours: STALE_HOURS,
    },
    origin: { appUrl: config.appUrl, rpId: config.rpId, listener: HOST_LISTENER },
  };
}
