/**
 * The version manifest: what this archive is, what is in it, and what wrote it.
 *
 * F124 names three things an archive must hold and this is the third. It exists
 * so that an archive found in eighteen months can be understood without the
 * repository that produced it: which schema version the data is at, which
 * Postgres and which Node wrote it, how many rows of each table are inside, and
 * the SHA-256 of each member so a restore can say the bytes are the bytes.
 *
 * IT IS THE FIRST MEMBER OF THE TAR, ON PURPOSE. `tar -xOf archive.tar
 * manifest.json` reads it without unpacking three hundred megabytes of photos.
 *
 * NO CREDENTIAL, NO HEALTH VALUE, NO PATH OUTSIDE THIS INSTALLATION. Row counts
 * and table names are structure; a value is data and stays in the data section.
 */

export const MANIFEST_MEMBER = 'manifest.json';
export const SCHEMA_MEMBER = 'schema.sql';
export const DATA_MEMBER = 'data.sql';
export const STORAGE_MEMBER = 'storage.tar';

/** Bumped when a reader would need to know the difference. */
export const MANIFEST_VERSION = 1;

export type MemberDigest = { name: string; bytes: number; sha256: string };

export type ManifestTable = { table: string; rows: number; modelled: boolean };

export type Manifest = {
  manifestVersion: number;
  /** The container format version, which is the byte in the archive header. */
  archiveFormat: number;
  createdAt: string;
  timeZone: string;
  app: {
    name: string;
    version: string;
    /** How many migrations the source database had applied. The schema version. */
    migrations: number;
  };
  runtime: { node: string; platform: string; postgres: string };
  database: { name: string; tables: number; rows: number };
  members: MemberDigest[];
  tables: ManifestTable[];
  storage: { root: string; files: number; bytes: number; directories: string[] };
  destination: { kind: 'configured' | 'fallback'; directory: string };
};

export function manifestBytes(manifest: Manifest): Buffer {
  return Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

export type ManifestProblem =
  | { code: 'manifest_unreadable'; member: string }
  | { code: 'manifest_version_unsupported'; member: string }
  | { code: 'member_missing'; member: string }
  | { code: 'member_digest_mismatch'; member: string }
  | { code: 'member_size_mismatch'; member: string };

/**
 * Compares what the manifest says the archive holds against what it holds.
 *
 * A LIST OF PROBLEMS, NOT A THROW. A verification that stopped at the first
 * mismatch would tell the owner one thing was wrong with a file that has three
 * things wrong with it, and he would fix them one restart at a time. Every
 * member is checked and every difference is reported together.
 */
export function reconcileMembers(
  manifest: Manifest,
  found: Array<{ name: string; size: number; sha256: string }>,
): ManifestProblem[] {
  const problems: ManifestProblem[] = [];
  const byName = new Map(found.map((entry) => [entry.name, entry]));
  for (const member of manifest.members) {
    const entry = byName.get(member.name);
    if (!entry) {
      problems.push({ code: 'member_missing', member: member.name });
      continue;
    }
    if (entry.size !== member.bytes) {
      problems.push({ code: 'member_size_mismatch', member: member.name });
    }
    if (entry.sha256 !== member.sha256) {
      problems.push({ code: 'member_digest_mismatch', member: member.name });
    }
  }
  return problems;
}

/** Reads the manifest member, refusing a version this reader does not know. */
export function parseManifest(bytes: Uint8Array): Manifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch {
    throw new Error('manifest_unreadable');
  }
  const manifest = parsed as Manifest;
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.members)) {
    throw new Error('manifest_unreadable');
  }
  if (manifest.manifestVersion !== MANIFEST_VERSION) {
    throw new Error('manifest_version_unsupported');
  }
  return manifest;
}

/** Total rows across every table the manifest names. The number a restore matches. */
export function manifestRowTotal(manifest: Manifest): number {
  return manifest.tables.reduce((total, table) => total + table.rows, 0);
}
