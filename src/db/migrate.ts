import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { getDb, getPool } from './client';

const MIGRATIONS_FOLDER = process.env.MIGRATIONS_FOLDER ?? './drizzle';
const LEDGER = 'drizzle.__drizzle_migrations';

/**
 * How many rows the migrator's own ledger holds right now. Before the first
 * run the table does not exist, which is zero, not an error.
 */
async function ledgerCount(db: ReturnType<typeof getDb>): Promise<number> {
  try {
    const result = await db.execute(sql.raw(`select count(*)::int as n from ${LEDGER}`));
    return Number((result.rows[0] as { n: number } | undefined)?.n ?? 0);
  } catch {
    return 0;
  }
}

async function waitForDatabase(attempts = 30, waitMs = 1000): Promise<void> {
  const pool = getPool();
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await pool.query('select 1');
      return;
    } catch (error) {
      if (attempt === attempts) {
        throw new Error(
          `Postgres did not answer after ${attempts} attempts: ${(error as Error).message}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

/**
 * Applies every generated migration that has not been applied yet, then prints
 * the count. F6 reads two boot logs: the first applies N, the second applies 0,
 * and both numbers are on the line.
 */
export async function runMigrations(): Promise<void> {
  const started = Date.now();
  await waitForDatabase();

  const db = getDb();
  const before = await ledgerCount(db);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  const after = await ledgerCount(db);

  await db.execute(
    sql`insert into app_meta (key, value) values ('schema_installed_at', now()::text) on conflict (key) do nothing`,
  );
  await db.execute(
    sql`insert into app_meta (key, value) values ('last_boot_at', now()::text)
        on conflict (key) do update set value = excluded.value, updated_at = now()`,
  );

  console.log(
    `[vernier] migrations: ${after - before} applied, ${after} total, in ${Date.now() - started} ms`,
  );
}
