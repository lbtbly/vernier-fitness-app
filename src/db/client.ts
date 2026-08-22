import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { strings } from '@/lib/strings';

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(strings.api.storage.noDatabaseUrl);
    }
    pool = new Pool({ connectionString: url, max: 10 });
  }
  return pool;
}

export function getDb() {
  return drizzle(getPool(), { schema });
}
