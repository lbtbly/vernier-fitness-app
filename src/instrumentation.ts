/**
 * Runs once per server process, before the first request is handled. Two
 * things have to be true before this app is allowed to serve: the master key
 * must be usable, and the schema must be current.
 *
 * A failure here is fatal on purpose. A container that restarts loudly beats a
 * container that serves a half-migrated database, or writes a credential in
 * the clear, quietly.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const host = globalThis.process as unknown as { exit?: (code: number) => never };

  // The key that every third-party credential in the database is encrypted
  // with. Refuse to serve rather than run with encryption switched off, because
  // a process that boots without it will happily write the next credential in
  // the clear and nothing downstream would notice. F17.
  try {
    const { assertMasterKey } = await import('./lib/master-key');
    const fingerprint = assertMasterKey();
    console.log(`[vernier] master key: present, fingerprint ${fingerprint}`);
  } catch (error) {
    console.error(`[vernier] refusing to start: ${(error as Error).message}`);
    host.exit?.(1);
    return;
  }

  if (process.env.SKIP_MIGRATIONS === '1') {
    console.log('[vernier] migrations: skipped, SKIP_MIGRATIONS=1');
    return;
  }

  const { runMigrations } = await import('./db/migrate');
  try {
    await runMigrations();
  } catch (error) {
    console.error(`[vernier] migrations failed: ${(error as Error).message}`);
    // Reached through globalThis so the Edge bundle Turbopack also builds does
    // not see a Node-only API it would refuse. This branch only ever runs
    // under the Node runtime, which the guard above enforces.
    host.exit?.(1);
    return;
  }

  // The demonstration seed, which loads only under DEMO_MODE=1 and refuses out
  // loud otherwise. It sits here, one line after the migration count, because
  // both facts belong in the same boot log: what the schema did and what the
  // data did. A seed that failed is never fatal; the app has nothing to
  // demonstrate and says so.
  try {
    const { seedDemoData } = await import('./db/demo');
    const { getConfig } = await import('./lib/config');
    const result = await seedDemoData(getConfig().timeZone);
    const marked = `${result.measurements} measurement(s) and ${result.sourceRecords} source record(s) marked seed`;
    if (result.ran) {
      console.log(`[vernier] demo seed: ran, ${result.written} new row(s), ${marked}`);
    } else {
      console.log(`[vernier] demo seed: refused, ${result.reason} ${marked}`);
    }
  } catch (error) {
    console.error(`[vernier] demo seed did not run: ${(error as Error).message}`);
  }
}
