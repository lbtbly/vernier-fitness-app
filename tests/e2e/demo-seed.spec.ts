import { expect, test } from './fixtures';
import {
  DEMO_SESSIONS,
  DEMO_WEIGHT_GAP,
  HRV_BY_DAY,
  RESTING_BY_DAY,
  SLEEP_BY_DAY,
  STEPS_BY_DAY,
  VO2_BY_DAY,
  WAIST_BY_DAY,
  WEIGHT_BY_DAY,
} from '@/lib/demo-series';
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
    // Slice 4 gave the seed two more tables. Off means off in all four.
    expect(scratchQuery('select count(*) from planned_session')).toBe('0');
    expect(scratchQuery('select count(*) from goal')).toBe('0');
  });

  test('marks every row it writes, in both tables, and keeps the six shapes', async () => {
    console.log(testStackWithDemoMode('1', 'reset'));

    /*
     * The count is computed from the same tables the seed writes from rather
     * than typed in, because slice 4 turned six rows into six weeks of them and
     * a literal here would have to be edited every time the series changes.
     * What is being asserted is the rule and not the number: every row in both
     * tables carries the marker, and the number of rows is the number of
     * readings the series holds.
     */
    const seriesRows =
      Object.keys(WEIGHT_BY_DAY).length +
      Object.keys(WAIST_BY_DAY).length +
      Object.keys(STEPS_BY_DAY).length +
      Object.keys(SLEEP_BY_DAY).length +
      Object.keys(RESTING_BY_DAY).length +
      Object.keys(HRV_BY_DAY).length +
      Object.keys(VO2_BY_DAY).length;
    // Six shapes, of which three are already a reading in the series above:
    // the weight of the seed's own day, the waist of three days before it and
    // the steps of four days before it.
    const expected = seriesRows + 3;
    const measurements = scratchQuery('select count(*) from measurement');
    console.log(`the seed wrote ${measurements} measurement(s); the series holds ${expected}`);
    expect(measurements).toBe(String(expected));
    expect(scratchQuery('select count(*) from measurement where seed')).toBe(String(expected));
    expect(scratchQuery('select count(*) from source_record where not seed')).toBe('0');
    expect(Number(scratchQuery('select count(*) from source_record'))).toBeGreaterThan(6);

    // The gap is in the database and not only in the drawing: four calendar
    // days with no weight row on them at all.
    const weightDays = scratchQuery(
      "select count(distinct date_trunc('day', measured_at)) from measurement where metric = 'weight'",
    );
    console.log(`the seed wrote weight on ${weightDays} distinct days, and left ${DEMO_WEIGHT_GAP.length} out`);
    expect(weightDays).toBe(String(Object.keys(WEIGHT_BY_DAY).length));

    // The two tables slice 4 added, both marked, both refusing to write with
    // demonstration mode off.
    expect(scratchQuery('select count(*) from planned_session where seed')).toBe(
      String(DEMO_SESSIONS.length),
    );
    expect(scratchQuery('select count(*) from goal where seed')).toBe('1');

    // The one row the defect named, read back the way a slice-5 query would.
    const withings = scratchQuery(
      `select source || ' | ' || kind || ' | ' || reference || ' | seed=' || seed
       from source_record where id = 'demo_src_weight'`,
    );
    console.log(`demo_src_weight reads: ${withings}`);
    expect(withings).toBe('withings | sync_batch | 1184 | seed=true');

    // F22 is not paid for with this. Six shapes, six kinds, still all there,
    // distinct now because a six-week series writes many records of a few
    // shapes rather than one record of each.
    const shapes = scratchQuery(
      "select distinct source || ' | ' || kind || ' | seed=' || seed from source_record order by 1",
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

  /**
   * The seed is still true on a day that is not the day it ran.
   *
   * Slice 4's seed anchored every date to its first run and skipped every row
   * on a second one, so a week later that installation carried an eight-day
   * trailing hole, the seven-day window held nothing, and Today and Health fell
   * into the empty state. Nine rubric lines rest on those two screens and the
   * final pass proves all of them again on this same machine.
   *
   * The state is built the only honest way there is: reset with demonstration
   * mode off so the migrations run and the seed refuses, write an anchor
   * thirteen days back, then boot with it on. What comes up is exactly what an
   * installation seeded thirteen days ago looks like when it is read today: a
   * trend that reaches this morning, a quiet spell of the scale's inside the
   * window, a phone four days silent and a settled training week.
   */
  test('brings its own series up to the day it is read', async () => {
    console.log(testStackWithDemoMode('0', 'reset'));
    scratchAttempt(
      "insert into app_meta (key, value) values ('demo.anchor_day', to_char(current_date - 13, 'YYYY-MM-DD'))",
    );
    console.log(testStackWithDemoMode('1', 'up'));

    const anchor = scratchQuery("select value from app_meta where key = 'demo.anchor_day'");
    const filled = scratchQuery("select value from app_meta where key = 'demo.filled_through'");
    console.log(`the anchor is ${anchor} and the continuation has filled ${filled} day(s) past it`);
    expect(Number(filled)).toBeGreaterThanOrEqual(12);

    // The trend reaches today. Not "recently": today, at the hour the scale
    // reports, which is what the seven-day average and the fold both rest on.
    const freshWeight = scratchQuery(
      "select to_char(max(measured_at), 'YYYY-MM-DD HH24:MI') || ' | ' || (max(measured_at) > now() - interval '24 hours') from measurement where metric = 'weight'",
    );
    console.log(`the newest weight reading: ${freshWeight}`);
    expect(freshWeight.endsWith('| true')).toBe(true);

    // And it is a real window, not one reading dropped on the end.
    const inTheWindow = Number(
      scratchQuery(
        "select count(distinct (measured_at at time zone 'UTC')::date) from measurement where metric = 'weight' and measured_at > now() - interval '30 days'",
      ),
    );
    console.log(`weight readings on ${inTheWindow} of the last 30 days`);
    expect(inTheWindow).toBeGreaterThan(20);
    // Under thirty, because absence is the other half of what these screens
    // draw: there is always a hole in the window for F30 to hatch.
    expect(inTheWindow).toBeLessThan(30);

    // The phone stopped four days ago, and it is still four days ago.
    const silence = Number(
      scratchQuery(
        "select round(extract(epoch from now() - max(measured_at)) / 86400) from measurement where metric = 'steps'",
      ),
    );
    console.log(`the shortcut last sent a batch ${silence} day(s) ago`);
    expect(silence).toBeGreaterThanOrEqual(3);
    expect(silence).toBeLessThanOrEqual(5);

    // Adherence still has a denominator, and the sessions behind it have been
    // settled rather than left planned for ever.
    const week = scratchQuery(
      "select count(*) || ' planned, ' || count(*) filter (where state = 'completed') || ' completed, ' || count(*) filter (where state = 'missed') || ' missed' from planned_session where planned_for > now() - interval '28 days'",
    );
    console.log(`the last 28 days hold ${week}`);
    expect(Number(week.split(' ')[0])).toBeGreaterThanOrEqual(10);
    const stalePlans = scratchQuery(
      "select count(*) from planned_session where state = 'planned' and planned_for < date_trunc('day', now())",
    );
    console.log(`sessions still planned on a day that has passed: ${stalePlans}`);
    expect(stalePlans).toBe('0');

    // Every row it wrote on the way is still marked, including the new days.
    expect(scratchQuery('select count(*) from measurement where not seed')).toBe('0');
    expect(scratchQuery('select count(*) from source_record where not seed')).toBe('0');

    // And it is idempotent: a second boot on the same day writes nothing.
    const before = scratchQuery('select count(*) from measurement');
    console.log(testStackWithDemoMode('1', 'up'));
    const after = scratchQuery('select count(*) from measurement');
    console.log(`a second boot on the same day: ${before} rows before, ${after} after`);
    expect(after).toBe(before);
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
