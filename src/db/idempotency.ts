import { eq, sql } from 'drizzle-orm';
import { getDb } from './client';
import { idempotencyKey, writeRequest } from './schema';

/**
 * Exactly once, on a network that guarantees at least once.
 *
 * The phone's outbox retries. A request that reached the Mac mini, wrote its
 * row and then lost its response on the way home comes back looking identical,
 * and without this it would log the same waist measurement twice. iOS gives no
 * Background Sync, so the replay is client driven and the retry loop is not
 * optional; neither is this.
 *
 * The key is claimed before the work runs, not after. Two arrivals of the same
 * key can therefore never both do the work, and the second one gets the first
 * one's answer back verbatim.
 *
 * The store is an argument so the rule can be graded on its own. What decides
 * whether a write happens twice is six lines of ordering, and those six lines
 * are worth a test that does not need Postgres to run.
 */

export type Handled = { status: number; body: Record<string, unknown> };

export type Outcome = 'applied' | 'replayed' | 'deduplicated' | 'held_for_question' | 'refused';

export type IdempotencyStore = {
  /** True when this call took the key. False when somebody already had it. */
  claim(key: string, route: string): Promise<boolean>;
  read(key: string): Promise<{ status: number; body: string } | undefined>;
  finish(key: string, status: number, body: string): Promise<void>;
  countReplay(key: string): Promise<void>;
  append(key: string, route: string, outcome: Outcome): Promise<void>;
};

export function postgresStore(): IdempotencyStore {
  return {
    async claim(key, route) {
      const db = getDb();
      const claimed = await db
        .insert(idempotencyKey)
        .values({ key, route, status: 0, body: '' })
        .onConflictDoNothing({ target: idempotencyKey.key })
        .returning();
      return claimed.length > 0;
    },
    async read(key) {
      const db = getDb();
      const [row] = await db.select().from(idempotencyKey).where(eq(idempotencyKey.key, key));
      return row ? { status: row.status, body: row.body } : undefined;
    },
    async finish(key, status, body) {
      const db = getDb();
      await db
        .update(idempotencyKey)
        .set({ status, body, lastSeenAt: new Date() })
        .where(eq(idempotencyKey.key, key));
    },
    async countReplay(key) {
      const db = getDb();
      await db
        .update(idempotencyKey)
        .set({ replays: sql`${idempotencyKey.replays} + 1`, lastSeenAt: new Date() })
        .where(eq(idempotencyKey.key, key));
    },
    async append(key, route, outcome) {
      const db = getDb();
      await db.insert(writeRequest).values({ id: crypto.randomUUID(), key, route, outcome });
    },
  };
}

/**
 * Runs the write once per key, ever. On a repeat it returns the stored response
 * and appends one `replayed` row to the request log, so F24 can count one
 * measurement row against however many arrivals there were.
 */
export async function once(
  key: string,
  route: string,
  run: () => Promise<{ handled: Handled; outcome: Outcome }>,
  store: IdempotencyStore = postgresStore(),
): Promise<{ handled: Handled; replayed: boolean }> {
  const claimed = await store.claim(key, route);

  if (!claimed) {
    const existing = await store.read(key);
    await store.countReplay(key);
    await store.append(key, route, 'replayed');

    if (!existing || existing.status === 0) {
      // The first arrival is still in flight. 409 is what the flusher already
      // treats as applied, so the queue drains rather than spinning.
      return {
        handled: {
          status: 409,
          body: {
            applied: true,
            detail: 'This write is already being applied under the same idempotency key.',
          },
        },
        replayed: true,
      };
    }
    return {
      handled: { status: existing.status, body: JSON.parse(existing.body) as Record<string, unknown> },
      replayed: true,
    };
  }

  const { handled, outcome } = await run();
  await store.finish(key, handled.status, JSON.stringify(handled.body));
  await store.append(key, route, outcome);
  return { handled, replayed: false };
}

/** An in-memory store, for the test that grades the ordering rather than Postgres. */
export function memoryStore(): IdempotencyStore & {
  log: Array<{ key: string; route: string; outcome: Outcome }>;
  replays: Map<string, number>;
} {
  const keys = new Map<string, { status: number; body: string; route: string }>();
  const log: Array<{ key: string; route: string; outcome: Outcome }> = [];
  const replays = new Map<string, number>();
  return {
    log,
    replays,
    async claim(key, route) {
      if (keys.has(key)) return false;
      keys.set(key, { status: 0, body: '', route });
      return true;
    },
    async read(key) {
      const row = keys.get(key);
      return row ? { status: row.status, body: row.body } : undefined;
    },
    async finish(key, status, body) {
      const row = keys.get(key)!;
      keys.set(key, { ...row, status, body });
    },
    async countReplay(key) {
      replays.set(key, (replays.get(key) ?? 0) + 1);
    },
    async append(key, route, outcome) {
      log.push({ key, route, outcome });
    },
  };
}

/** What the request log holds for one key. F24 reads this back. */
export async function readRequestLog(key: string) {
  const db = getDb();
  return db.select().from(writeRequest).where(eq(writeRequest.key, key)).orderBy(writeRequest.at);
}
