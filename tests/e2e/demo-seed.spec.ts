import { expect, test } from '@playwright/test';
import { scratchAttempt, scratchQuery, testStack, testStackWithDemoMode } from './host';

/**
 * F25. The demonstration seed loads only under `DEMO_MODE=1`, and every row it
 * writes, in both tables, carries the marker.
 *
 * This runs against the scratch instance rather than the owner's installation,
 * because the only honest way to grade "with it off the tables stay at zero" is
 * an empty database that has never had the seed in it.
 *
 * The marker is a column and not a convention. It used to be neither: six
 * `source_record` rows went in carrying `withings`, `apple_health_shortcut`,
 * `manual`, `lab_pdf` and `derived`, with the same import version a real writer
 * stamps and nothing at all saying they were seeded, so from the first real
 * Withings sync onward a query could not tell `demo_src_weight` from a real
 * batch. The id prefix was the only difference and an id prefix is a habit.
 *
 * What the seed must keep, and does: six distinct shapes with six distinct
 * kinds, so F22's six destinations are all still walkable through the one
 * screen. The shape is what the record stands in for. `seed` is what it is.
 */
test.describe('the demonstration seed', () => {
  test.describe.configure({ mode: 'serial' });

  test('writes nothing at all with demonstration mode off', async () => {
    console.log(testStackWithDemoMode('0', 'reset'));

    expect(scratchQuery('select count(*) from measurement')).toBe('0');
    expect(scratchQuery('select count(*) from source_record')).toBe('0');
    expect(scratchQuery('select count(*) from measurement where seed')).toBe('0');
    expect(scratchQuery('select count(*) from source_record where seed')).toBe('0');
  });

  test('marks every row it writes, in both tables, and keeps the six shapes', async () => {
    console.log(testStackWithDemoMode('1', 'reset'));

    expect(scratchQuery('select count(*) from measurement')).toBe('6');
    expect(scratchQuery('select count(*) from source_record')).toBe('6');
    expect(scratchQuery('select count(*) from measurement where seed')).toBe('6');
    expect(scratchQuery('select count(*) from source_record where seed')).toBe('6');

    // The one row the defect named, read back the way a slice-5 query would.
    const withings = scratchQuery(
      `select source || ' | ' || kind || ' | ' || reference || ' | seed=' || seed
       from source_record where id = 'demo_src_weight'`,
    );
    console.log(`demo_src_weight reads: ${withings}`);
    expect(withings).toBe('withings | sync_batch | 1184 | seed=true');

    // F22 is not paid for with this. Six shapes, six kinds, still all there.
    const shapes = scratchQuery(
      "select source || ' | ' || kind || ' | seed=' || seed from source_record order by source",
    );
    console.log(`the six shapes the seed stands in for:\n${shapes}`);
    expect(shapes.split('\n')).toHaveLength(6);
    expect(new Set(shapes.split('\n').map((row) => row.split(' | ')[1])).size).toBe(6);
    expect(shapes.split('\n').every((row) => row.endsWith('| seed=true'))).toBe(true);

    // And the marker is not something a query has to infer from an id.
    const byPrefix = scratchQuery("select count(*) from source_record where id like 'demo\\_%'");
    const byColumn = scratchQuery('select count(*) from source_record where seed');
    console.log(`rows found by the id prefix: ${byPrefix}, rows found by the column: ${byColumn}`);
    expect(byColumn).toBe(byPrefix);
  });

  test('refuses, in the database, a real row wearing a seeded record or the reverse', async () => {
    // A measurement cannot claim to be seeded or claim not to be: the column is
    // computed from the source, so there is no value a writer could put there.
    const generated = scratchQuery(
      "select is_generated from information_schema.columns where table_name = 'measurement' and column_name = 'seed'",
    );
    console.log(`measurement.seed is_generated: ${generated}`);
    expect(generated).toBe('ALWAYS');

    // A real reading attached to a seeded record is refused by the foreign key
    // over (source_record_id, seed), which is the constraint doing the work
    // rather than a convention a later importer could forget.
    const attached = scratchAttempt(`
      insert into measurement (
        id, metric, raw_value, raw_unit, value, unit, time_zone, source, measured_at,
        confidence, import_version, dedup_decision, dedup_reason, source_record_id, root_id
      ) values (
        'not-a-demo-row', 'weight', '85.9', 'kg', 85.9, 'kg', 'Europe/Paris', 'withings', now(),
        'measured_device', '2026-08-3', 'unique', 'a test', 'demo_src_weight', 'not-a-demo-row'
      )
    `);
    console.log(`a withings reading pointed at a seeded record:\n${attached}`);
    expect(attached).toContain('measurement_seed_matches_source_record');
    expect(scratchQuery("select count(*) from measurement where id = 'not-a-demo-row'")).toBe('0');

    // And a demonstration reading cannot be attached to a real record either.
    scratchAttempt(`
      insert into source_record (id, source, kind, reference, occurred_at, import_version, detail, seed)
      values ('real-batch', 'withings', 'sync_batch', '9999', now(), '2026-08-3', '[]'::jsonb, false)
    `);
    const orphan = scratchAttempt(`
      insert into measurement (
        id, metric, raw_value, raw_unit, value, unit, time_zone, source, measured_at,
        confidence, import_version, dedup_decision, dedup_reason, source_record_id, root_id
      ) values (
        'fake-demo-row', 'weight', '85.9', 'kg', 85.9, 'kg', 'Europe/Paris', 'demo', now(),
        'demo', '2026-08-3', 'unique', 'a test', 'real-batch', 'fake-demo-row'
      )
    `);
    console.log(`a demonstration reading pointed at a real record:\n${orphan}`);
    expect(orphan).toContain('measurement_seed_matches_source_record');
    expect(scratchQuery("select count(*) from measurement where id = 'fake-demo-row'")).toBe('0');
  });

  test.afterAll(() => {
    // Put the scratch instance back the way the rest of the suite expects it.
    testStack('reset');
  });
});
