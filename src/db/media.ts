import { asc, eq } from 'drizzle-orm';
import { getDb } from './client';
import { mediaAllowlist, movementMedia } from './schema';
import type { AllowedHost } from '@/lib/media-allowlist';

/**
 * Media records and the allowlist, read and written in one place.
 *
 * F67's whole line is a shape: source URL, author or source name, verification
 * date, licence or embedding mode, and its movement, with a null author
 * rejected at write. The shape is the column list in `movement_media`; this
 * file is the only door to it, and the door refuses a blank author before
 * Postgres has to.
 *
 * That double refusal is deliberate. The constraint is what makes it true of
 * every path including a psql prompt; this check is what makes the refusal
 * legible on the editorial screen, with the reason in words, instead of a
 * constraint name arriving as a 500.
 */

export type MediaView = {
  id: string;
  movementId: string;
  url: string;
  author: string;
  licence: string;
  licenceUrl: string;
  attributionUrl: string;
  embeddingMode: string;
  kind: string;
  localPath: string;
  verifiedAt: Date;
  bytes: number;
};

export async function readMedia(): Promise<MediaView[]> {
  const db = getDb();
  const rows = await db.select().from(movementMedia).orderBy(asc(movementMedia.movementId));
  return rows.map((row) => ({
    id: row.id,
    movementId: row.movementId,
    url: row.url,
    author: row.author,
    licence: row.licence,
    licenceUrl: row.licenceUrl,
    attributionUrl: row.attributionUrl,
    embeddingMode: row.embeddingMode,
    kind: row.kind,
    localPath: row.localPath,
    verifiedAt: row.verifiedAt,
    bytes: row.bytes,
  }));
}

export async function readMediaFor(movementId: string): Promise<MediaView[]> {
  const rows = await readMedia();
  return rows.filter((row) => row.movementId === movementId);
}

export async function readAllowlist(): Promise<AllowedHost[]> {
  const db = getDb();
  const rows = await db.select().from(mediaAllowlist).orderBy(asc(mediaAllowlist.host));
  return rows.map((row) => ({
    host: row.host,
    embeddingMode: row.embeddingMode as AllowedHost['embeddingMode'],
    reasonKey: row.reasonKey,
  }));
}

export type EmbedWrite = {
  movementId: string;
  /** The watch URL, which is what the record's source is. The player writes its own frame URL. */
  url: string;
  author: string;
  licence: string;
  licenceUrl: string;
  attributionUrl: string;
  verifiedAt: Date;
};

export type MediaWriteResult =
  | { ok: true; record: MediaView }
  | { ok: false; problem: 'noAuthor' };

/**
 * One embed record. No file is fetched, nothing is copied to this machine, and
 * `local_path` stays empty, which the database enforces for this mode.
 */
export async function addEmbed(write: EmbedWrite): Promise<MediaWriteResult> {
  if (write.author.trim() === '') return { ok: false, problem: 'noAuthor' };
  const db = getDb();
  const id = `embed_${write.movementId}_${Buffer.from(write.url).toString('base64url').slice(0, 16)}`;
  await db
    .insert(movementMedia)
    .values({
      id,
      movementId: write.movementId,
      url: write.url,
      author: write.author.trim(),
      licence: write.licence,
      licenceUrl: write.licenceUrl,
      attributionUrl: write.attributionUrl,
      embeddingMode: 'youtube_nocookie',
      kind: 'video',
      localPath: '',
      verifiedAt: write.verifiedAt,
      bytes: 0,
      checksum: '',
    })
    .onConflictDoNothing({ target: movementMedia.id });
  const [row] = await db.select().from(movementMedia).where(eq(movementMedia.id, id));
  return row
    ? {
        ok: true,
        record: {
          id: row.id,
          movementId: row.movementId,
          url: row.url,
          author: row.author,
          licence: row.licence,
          licenceUrl: row.licenceUrl,
          attributionUrl: row.attributionUrl,
          embeddingMode: row.embeddingMode,
          kind: row.kind,
          localPath: row.localPath,
          verifiedAt: row.verifiedAt,
          bytes: row.bytes,
        },
      }
    : { ok: false, problem: 'noAuthor' };
}
