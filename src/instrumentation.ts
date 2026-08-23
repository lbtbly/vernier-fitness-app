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

  /*
   * The model identifier, validated once, here, against the Models API. F98.
   *
   * It sits beside the master key rather than beside the seeds because it is
   * the same kind of fact: something that has to be true before this app serves
   * a screen. A retired snapshot found at 02:00 by a scheduled job is a silent
   * outage. Found here it is a container that will not start, with the
   * identifier it read printed in the log.
   *
   * In demonstration mode nothing is called and the log says so. Claiming to
   * have validated a model against an API this installation never reaches would
   * be the failure class this run keeps finding.
   */
  try {
    const { readAiSettings } = await import('./lib/ai/mode');
    const { validateModel } = await import('./lib/ai/model-check');
    const settings = readAiSettings();
    const transport =
      settings.mode === 'demo'
        ? (await import('./lib/ai/demo')).demoAiTransport()
        : (await import('./lib/ai/transport')).networkAiTransport(settings.apiKey);
    const verdict = await validateModel(settings, transport);
    if (!verdict.ok) {
      console.error(`[vernier] refusing to start: ${verdict.message}`);
      host.exit?.(1);
      return;
    }
    console.log(
      verdict.checked
        ? `[vernier] anthropic: live, model ${verdict.model} confirmed by the Models API`
        : '[vernier] anthropic: demonstration, no key, no call, model not checked',
    );
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

  // The food table and the recipe catalogue, which are reference data and not a
  // demonstration of anything: the product cannot plan a meal without them, so
  // they load on every boot and are not gated on DEMO_MODE.
  //
  // Both are idempotent by conflict, so the second boot writes nothing and no
  // timestamp moves. Neither touches the network: drizzle/seed/foods.csv is
  // committed and copied into the image beside the migrations, which is the
  // whole reason a composition table is bundled rather than called.
  //
  // The snapshot refresh at the end never overwrites a stored figure. It
  // compares each snapshot's source hash against the rows behind it and OPENS A
  // QUESTION when they differ, which is F87's last clause and the quiet half of
  // the unapproved-write risk: a recipe silently serving last month's macros is
  // a wrong number nobody knows to look for.
  try {
    const { seedFoodTable } = await import('./db/foods');
    const foods = await seedFoodTable();
    console.log(
      `[vernier] food table: ${foods.written} new row(s) from ${foods.read} read, ${foods.total} total`,
    );

    const { seedRecipeCatalogue, ensureAllSnapshots, refreshSnapshots } = await import('./db/recipes');
    const catalogue = await seedRecipeCatalogue();
    const snapshots = await ensureAllSnapshots();
    const refreshed = await refreshSnapshots();
    console.log(
      `[vernier] recipes: ${catalogue.written} new of ${catalogue.recipes}, ` +
        `${snapshots.written} snapshot(s) computed, ` +
        `${refreshed.walked} walked and ${refreshed.questions} question(s) raised`,
    );

    const { seedDietaryRules } = await import('./db/nutrition');
    const rules = await seedDietaryRules();
    console.log(`[vernier] dietary rules: ${rules} new`);
  } catch (error) {
    console.error(`[vernier] nutrition seed did not run: ${(error as Error).message}`);
  }

  // The movement catalogue, which is product data and not sample data. It runs
  // on every boot whatever DEMO_MODE says, because F66 wants at least 30
  // movements with cue text and a bundled demonstration on a REAL install, and
  // a catalogue that exists only in demonstration mode is a catalogue the owner
  // does not have. Idempotent: an upsert keyed on each movement's own id.
  try {
    const { ensureCatalogue } = await import('./db/catalogue');
    const seeded = await ensureCatalogue();
    console.log(
      `[vernier] catalogue: ${seeded.movements} movement(s), ${seeded.media} media record(s), ${seeded.hosts} allowed host(s)`,
    );
  } catch (error) {
    console.error(`[vernier] catalogue not seeded: ${(error as Error).message}`);
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

  // The two schedules, and the two things a boot owes before either can tick.
  //
  // ORDER MATTERS AND IT IS INSIDE startScheduler. A run still marked running
  // from a process that no longer exists is cleared first and awaited, because
  // it would otherwise hold its period against every tick that followed it,
  // silently, forever. The catch-up runs behind the schedules rather than in
  // front of them: it reads six tables and may hand a message to a mail relay,
  // and this function runs before the first request is served. It logs its own
  // outcome where it finishes, so the line below states what it waited for and
  // nothing more.
  //
  // The claim is what makes this safe to call from every process that boots.
  // Nothing here asks whether it is the only one; it takes the period or it
  // does not, and Postgres arbitrates.
  try {
    const { startScheduler } = await import('./lib/scheduler');
    const started = await startScheduler();
    console.log(
      `[vernier] scheduler: ${started.schedules} schedule(s), ` +
        `${started.stale} stale run(s) cleared, catch-up running`,
    );
  } catch (error) {
    console.error(`[vernier] scheduler did not start: ${(error as Error).message}`);
  }

  // The training half of the demonstration, which needs the catalogue above it
  // and the measurement series beside it: it proposes a week through the
  // shipped proposer, so every cause on screen 06 names an input that is really
  // in this database. Same rule as every other seed: DEMO_MODE=1 or nothing.
  try {
    const { seedTrainingDemo } = await import('./db/demo-training');
    const { getConfig } = await import('./lib/config');
    const result = await seedTrainingDemo(getConfig().timeZone);
    if (result.ran) {
      console.log(
        `[vernier] training demo: ran, ${result.runs} run(s), ${result.sets} set(s), ${result.proposals} proposal(s)`,
      );
    } else {
      console.log(`[vernier] training demo: refused, ${result.reason}`);
    }
  } catch (error) {
    console.error(`[vernier] training demo did not run: ${(error as Error).message}`);
  }
}
