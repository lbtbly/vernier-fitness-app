import type { Config } from 'drizzle-kit';

// Dev-time only. drizzle-kit never enters the runtime image; the container
// applies the generated SQL with the programmatic migrator.
export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://health:health@127.0.0.1:5432/health',
  },
} satisfies Config;
