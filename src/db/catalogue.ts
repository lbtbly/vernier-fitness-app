import { asc, sql } from 'drizzle-orm';
import { getDb } from './client';
import { mediaAllowlist, movement, movementMedia } from './schema';
import allowlist from '@/data/media-allowlist.json';
import { BUNDLED_MEDIA, MOVEMENTS } from '@/lib/catalogue';

/**
 * The catalogue seed, which is not the demonstration seed.
 *
 * These rows are product data, not sample data: F66 wants at least 30 movements
 * on a REAL install, so this runs on every boot whatever `DEMO_MODE` says. It
 * is an upsert keyed on the movement's own id, so a boot after a catalogue edit
 * moves the row and a boot after nothing changes writes nothing new.
 *
 * The source of truth is `src/lib/catalogue.ts` and the generated media
 * manifest beside it, so the list the proposer reads in memory and the rows the
 * screens read from Postgres cannot drift: there is one list and this copies it
 * in.
 */

export type CatalogueSeed = {
  movements: number;
  media: number;
  hosts: number;
};

export async function ensureCatalogue(): Promise<CatalogueSeed> {
  const db = getDb();

  for (const item of MOVEMENTS) {
    await db
      .insert(movement)
      .values({
        id: item.id,
        nameKey: `movement.${item.id}.name`,
        cueKey: `movement.${item.id}.cue`,
        modality: item.modality,
        pattern: item.pattern,
        muscles: [...item.muscles],
        equipment: [...item.equipment],
        step: item.step,
        unit: item.unit,
        sets: item.sets,
        low: item.low,
        high: item.high,
        restSeconds: item.restSeconds,
        effortScale: item.effortScale,
        loadable: item.loadable,
      })
      .onConflictDoUpdate({
        target: movement.id,
        set: {
          nameKey: sql`excluded.name_key`,
          cueKey: sql`excluded.cue_key`,
          modality: sql`excluded.modality`,
          pattern: sql`excluded.pattern`,
          muscles: sql`excluded.muscles`,
          equipment: sql`excluded.equipment`,
          step: sql`excluded.step`,
          unit: sql`excluded.unit`,
          sets: sql`excluded.sets`,
          low: sql`excluded.low`,
          high: sql`excluded.high`,
          restSeconds: sql`excluded.rest_seconds`,
          effortScale: sql`excluded.effort_scale`,
          loadable: sql`excluded.loadable`,
          updatedAt: sql`now()`,
        },
      });
  }

  for (const record of BUNDLED_MEDIA) {
    // The author is checked here as well as at the column, because a manifest
    // that lost one would otherwise fail at the database with a constraint name
    // instead of failing here with the file that caused it.
    if (record.author.trim() === '') {
      throw new Error(`catalogue: ${record.path} names no author`);
    }
    await db
      .insert(movementMedia)
      .values({
        id: `bundled_${record.movement}`,
        movementId: record.movement,
        url: record.url,
        author: record.author,
        licence: record.licence,
        licenceUrl: record.licenceUrl,
        attributionUrl: record.attributionUrl,
        embeddingMode: 'bundled',
        kind: record.kind,
        localPath: record.path,
        verifiedAt: new Date(`${record.verifiedAt}T12:00:00Z`),
        bytes: record.bytes,
        checksum: record.sha256,
      })
      .onConflictDoUpdate({
        target: movementMedia.id,
        set: {
          url: sql`excluded.url`,
          author: sql`excluded.author`,
          licence: sql`excluded.licence`,
          licenceUrl: sql`excluded.licence_url`,
          attributionUrl: sql`excluded.attribution_url`,
          kind: sql`excluded.kind`,
          localPath: sql`excluded.local_path`,
          verifiedAt: sql`excluded.verified_at`,
          bytes: sql`excluded.bytes`,
          checksum: sql`excluded.checksum`,
        },
      });
  }

  for (const host of allowlist) {
    await db
      .insert(mediaAllowlist)
      .values({
        host: host.host,
        embeddingMode: host.embeddingMode,
        reasonKey: host.reasonKey,
      })
      .onConflictDoUpdate({
        target: mediaAllowlist.host,
        set: { embeddingMode: sql`excluded.embedding_mode`, reasonKey: sql`excluded.reason_key` },
      });
  }

  return { movements: MOVEMENTS.length, media: BUNDLED_MEDIA.length, hosts: allowlist.length };
}

export type CatalogueRow = {
  id: string;
  modality: string;
  pattern: string;
  muscles: string[];
  equipment: string[];
  step: number;
  unit: string;
  sets: number;
  low: number;
  high: number;
  restSeconds: number;
  effortScale: string;
  loadable: boolean;
  media: Array<{
    url: string;
    author: string;
    licence: string;
    embeddingMode: string;
    kind: string;
    localPath: string;
    verifiedAt: Date;
  }>;
};

/**
 * The catalogue as the database holds it, which is what the screen renders.
 *
 * It reads the rows rather than the module they were seeded from, deliberately.
 * F66 counts movements in a real installation, and a screen that rendered the
 * bundled TypeScript list would show 44 movements on an install whose seed had
 * never run. What is on screen is what is in Postgres.
 */
export async function readCatalogueRows(): Promise<CatalogueRow[]> {
  const db = getDb();
  const [movements, media] = await Promise.all([
    db.select().from(movement).orderBy(asc(movement.pattern), asc(movement.step), asc(movement.id)),
    db.select().from(movementMedia).orderBy(asc(movementMedia.movementId)),
  ]);
  return movements.map((row) => ({
    id: row.id,
    modality: row.modality,
    pattern: row.pattern,
    muscles: row.muscles,
    equipment: row.equipment,
    step: row.step,
    unit: row.unit,
    sets: row.sets,
    low: row.low,
    high: row.high,
    restSeconds: row.restSeconds,
    effortScale: row.effortScale,
    loadable: row.loadable,
    media: media
      .filter((entry) => entry.movementId === row.id)
      .map((entry) => ({
        url: entry.url,
        author: entry.author,
        licence: entry.licence,
        embeddingMode: entry.embeddingMode,
        kind: entry.kind,
        localPath: entry.localPath,
        verifiedAt: entry.verifiedAt,
      })),
  }));
}
