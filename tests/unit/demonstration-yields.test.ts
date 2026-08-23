import { describe, expect, it } from 'vitest';
import { DEMO_ROWS, rowsForDay, seriesRows, withoutMeasuredMetrics } from '@/db/demo';
import {
  PRECEDENCE,
  SOURCES,
  compareStanding,
  decideDedup,
  isSeeded,
  outranks,
  whatStands,
} from '@/lib/provenance';
import {
  type Goal,
  type Reading,
  dailySeries,
  freshnessOfSource,
  windowDays,
} from '@/lib/trend';
import { weightSummary } from '@/lib/weight-summary';

/**
 * THE DEMONSTRATION FILLS ABSENCE AND YIELDS TO MEASUREMENT.
 *
 * `.forge/AMENDMENTS.md` A7 and `.forge/RULING-DEMO-COLLISION.md`, which is one
 * rule at three layers: the seed writes a metric only while that metric has no
 * measured row, a day resolves to the measured reading through one comparator,
 * and a seeded sample does not vouch for a real source's freshness.
 *
 * WHY THIS FILE EXISTS AT ALL, which is the same reason the defect survived
 * eleven verifications: `dailySeries` has been correct on every day this suite
 * has ever run, because the suite has only ever had ONE SOURCE PER DAY. A check
 * that passes by not checking is the failure class this run keeps finding, and
 * a collision day is the population it was never given. Every test below builds
 * one on purpose.
 *
 * Each test names what would turn it red.
 */

const ZONE = 'Europe/Paris';
/** August in Paris is +02:00, so every instant below reads as written. */
const OFFSET = '+02:00';
const ANCHOR = new Date(`2026-08-23T10:00:00${OFFSET}`);
const KEYS = windowDays(ANCHOR, 30, ZONE);
const TODAY = KEYS.at(-1)!;

function at(day: string, hour: number, minute: number): Date {
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return new Date(`${day}T${hh}:${mm}:00${OFFSET}`);
}

/**
 * A seeded weight, exactly as `src/db/demo.ts` writes one: source `demo`, so
 * Postgres computes `seed`, and a source record standing in for a Withings sync
 * batch, so `origin` reads `withings` on a row no scale produced. 06:52 is the
 * hour the seed fixes.
 */
function seeded(day: string, value: number): Reading {
  return { id: `demo_weight_on_${day}`, value, measuredAt: at(day, 6, 52), origin: 'withings', seed: true };
}

/** A real weigh-in, at whatever time the owner actually stepped on the scale. */
function measured(day: string, value: number, hour: number, minute: number): Reading {
  return {
    // The value is in the id so two readings of one morning are two rows, which
    // is what the comparator's last clause has to separate.
    id: `4f2a-weight-${day}-${value}`,
    value,
    measuredAt: at(day, hour, minute),
    origin: 'withings',
    seed: false,
  };
}

/** Six weeks of demonstration weight, one fabricated reading every morning. */
function seededSeries(): Reading[] {
  return KEYS.map((day, index) => seeded(day, Number((88.6 - index * 0.09).toFixed(2))));
}

const GOAL: Goal = {
  startValue: 89,
  startAt: new Date(`2026-07-01T07:00:00${OFFSET}`),
  targetValue: 76,
  targetAt: new Date(`2027-04-01T07:00:00${OFFSET}`),
  unit: 'kg',
};

/** The six figures the weight card says out loud, all off the resolved series. */
function figures(readings: Reading[]) {
  const days = dailySeries(readings, KEYS, ZONE);
  const summary = weightSummary(days, GOAL, ANCHOR);
  return {
    column: days.at(-1)!.reading,
    headline: summary.latest?.value ?? null,
    average: summary.average?.mean ?? null,
    weekChange: summary.weekChange,
    pace: summary.pace,
    goalDelta: summary.goalDelta,
  };
}

describe('a day that holds both a fabrication and a measurement', () => {
  it('resolves to the measured reading in all six figures, not to the 06:52 seed', () => {
    // RED IF: `dailySeries` compares `measuredAt` instead of calling
    // `compareStanding`. The seeded row is 22 minutes later and would win.
    const seededOnly = seededSeries();
    const real = measured(TODAY, 84.1, 6, 30);
    const both = [...seededOnly, real];

    const resolved = figures(both);
    const fabricated = figures(seededOnly);

    console.log(
      `the day holds two rows: ${seededOnly.at(-1)!.value} kg seeded at 06:52 ` +
        `and ${real.value} kg measured at 06:30`,
    );
    for (const [name, value] of Object.entries(resolved)) {
      const was = fabricated[name as keyof typeof fabricated];
      const show = (held: unknown) =>
        held && typeof held === 'object' && 'value' in held ? `${(held as Reading).value} kg (${(held as Reading).id})` : String(held);
      console.log(`${name}: resolves to ${show(value)}, the fabrication would have said ${show(was)}`);
    }

    // The column itself, and the two taps behind it: the dot links to the row.
    expect(resolved.column?.id).toBe(real.id);
    expect(resolved.column?.seed).toBe(false);
    expect(resolved.column?.value).toBe(84.1);

    // And every figure computed off the column, each one different from what
    // the fabricated column produces. Not one of the six is a coincidence.
    expect(resolved.headline).toBe(84.1);
    expect(resolved.headline).not.toBe(fabricated.headline);
    expect(resolved.average).not.toBe(fabricated.average);
    expect(resolved.weekChange).not.toBe(fabricated.weekChange);
    expect(resolved.pace).not.toBe(fabricated.pace);
    expect(resolved.goalDelta).not.toBe(fabricated.goalDelta);

    // The measured value is inside the seven-day mean, arithmetically, rather
    // than merely different from the other one.
    const window = [...seededOnly.slice(-7).map((reading) => reading.value)];
    window[window.length - 1] = real.value;
    expect(resolved.average).toBeCloseTo(window.reduce((sum, one) => sum + one, 0) / 7, 10);
  });

  it('resolves the same way when both rows carry the same instant, whatever order they arrive in', () => {
    // RED IF: the tiebreak is a strict `>` on the clock. Equal instants then
    // fall to whichever row the database returned first, which is not a rule.
    const seededRow = seeded(TODAY, 85.9);
    const real = measured(TODAY, 84.1, 6, 52);
    expect(real.measuredAt.getTime()).toBe(seededRow.measuredAt.getTime());

    const forwards = dailySeries([seededRow, real], KEYS, ZONE).at(-1)!.reading;
    const backwards = dailySeries([real, seededRow], KEYS, ZONE).at(-1)!.reading;
    console.log(`equal instants resolve to ${forwards?.id} in either order: ${forwards?.id === backwards?.id}`);

    expect(forwards?.id).toBe(real.id);
    expect(backwards?.id).toBe(real.id);
  });

  it('does not let a measured reading from June beat a seeded one from last week', () => {
    // RED IF: the comparator drops its calendar-day clause. "The last weight on
    // file" would then answer with a historical import over this morning, which
    // is the same defect pointed the other way.
    const june = measured('2026-06-04', 91.4, 6, 30);
    const lastWeek = seeded(KEYS.at(-7)!, 86.2);
    const stands = whatStands([june, lastWeek], ZONE)!;
    console.log(`across days the later day stands: ${stands.id}`);
    expect(stands.id).toBe(lastWeek.id);
  });

  it('reads the marker off the source when the caller had no seed column, and off the column when it had', () => {
    // RED IF: `isSeeded` reads `origin`. A seeded weight's source record says
    // `withings`, so every seeded row would read as measured.
    expect(isSeeded({ id: 'a', measuredAt: ANCHOR, source: 'demo' })).toBe(true);
    expect(isSeeded({ id: 'b', measuredAt: ANCHOR, source: 'withings' })).toBe(false);
    expect(isSeeded(seeded(TODAY, 85.9))).toBe(true);
    expect(isSeeded(measured(TODAY, 84.1, 6, 30))).toBe(false);
  });

  it('never lets rank and the seed clause disagree about the same pair', () => {
    // RED IF: a second seeded source is added, or `demo` stops being the lowest
    // rank. The write layer resolves by rank and the read layer by the seed
    // column, and they are only one rule while these two facts hold.
    const seededSources = SOURCES.filter((source) => isSeeded({ id: 'x', measuredAt: ANCHOR, source }));
    expect(seededSources).toEqual(['demo']);
    for (const source of SOURCES) {
      if (source === 'demo') continue;
      expect(PRECEDENCE[source], source).toBeGreaterThan(PRECEDENCE.demo);
      expect(outranks(source, 'demo'), source).toBe(true);
      expect(outranks('demo', source), source).toBe(false);
    }
  });
});

describe('two demonstration rows on one day', () => {
  const seededRow = {
    id: 'demo_weight_on_2026-08-23',
    metric: 'weight',
    source: 'demo',
    rawValue: '85.900',
    measuredAt: at(TODAY, 6, 52),
    rootId: 'demo_weight_on_2026-08-23',
    correctionIndex: 0,
  };

  it('is never two rows each claiming to be the only reading of the day', () => {
    // RED IF: step 3 goes back to `row.source !== incoming.source`. Both rows
    // then fall through to `unique`, both are stored, and both carry "Nothing
    // else described this metric on this day". F36.
    const outcome = decideDedup(
      {
        metric: 'weight',
        source: 'demo',
        rawValue: '85.100',
        measuredAt: at(TODAY, 6, 30),
        timeZone: ZONE,
      },
      [seededRow],
    );
    console.log(`a second demonstration row on a taken day decides: ${outcome.decision}`);
    expect(outcome.decision).not.toBe('unique');
    expect(outcome.store).toBe(false);
    if (outcome.decision === 'dropped_as_duplicate') expect(outcome.keptId).toBe(seededRow.id);
  });

  it('leaves the committed row where it is even when the second one is later', () => {
    // RED IF: equal rank starts storing the incoming row. An append-only store
    // cannot take the loser back out, so a tie goes to what is committed.
    const outcome = decideDedup(
      {
        metric: 'weight',
        source: 'demo',
        rawValue: '85.100',
        measuredAt: at(TODAY, 20, 15),
        timeZone: ZONE,
      },
      [seededRow],
    );
    expect(outcome.decision).toBe('dropped_as_duplicate');
  });

  it('still stores the real reading over the seeded one, and names what it beat', () => {
    // RED IF: the day rule swallows rank. A measured Withings row must reach
    // the table on a day the seed already owns, with the loser in its reason.
    const outcome = decideDedup(
      {
        metric: 'weight',
        source: 'withings',
        rawValue: '84.100',
        measuredAt: at(TODAY, 6, 30),
        timeZone: ZONE,
      },
      [seededRow],
    );
    expect(outcome.decision).toBe('kept_over_duplicate');
    expect(outcome.store).toBe(true);
    expect(outcome.reason.params.value).toBe('85.900');
  });

  it('measures the incoming row against what stands, not against the first row returned', () => {
    // RED IF: the incumbent goes back to `find(...)`. On a day holding a
    // measured row and a seeded one, an arriving manual entry would be ranked
    // against whichever of the two the query happened to return first.
    const measuredRow = {
      ...seededRow,
      id: '4f2a-weight',
      source: 'withings',
      rawValue: '84.100',
      rootId: '4f2a-weight',
      measuredAt: at(TODAY, 6, 30),
    };
    const outcome = decideDedup(
      {
        metric: 'weight',
        source: 'manual',
        rawValue: '84.500',
        measuredAt: at(TODAY, 21, 0),
        timeZone: ZONE,
      },
      // The seeded row first, which is what "the first row returned" would take.
      [seededRow, measuredRow],
    );
    console.log(`a hand-typed weight on a day the scale owns decides: ${outcome.decision}`);
    expect(outcome.decision).toBe('dropped_as_duplicate');
    if (outcome.decision === 'dropped_as_duplicate') expect(outcome.keptId).toBe(measuredRow.id);
  });
});

describe('the seed against a metric that already has a real row', () => {
  const measuredAlready = new Set(['weight']);

  it('writes nothing for that metric in the six anchor rows, and everything else unchanged', () => {
    // RED IF: `seedDemoData` loops over `DEMO_ROWS` directly again.
    const kept = withoutMeasuredMetrics(DEMO_ROWS, measuredAlready);
    console.log(
      `anchor rows: ${DEMO_ROWS.length} before, ${kept.length} after, ` +
        `dropped ${DEMO_ROWS.filter((row) => !kept.includes(row)).map((row) => row.metric).join(', ')}`,
    );
    expect(kept.filter((row) => row.metric === 'weight')).toHaveLength(0);
    expect(kept).toHaveLength(DEMO_ROWS.length - 1);
    // Every other metric still seeds, including the derived seven-day average,
    // which is its own metric and not weight.
    expect(kept.map((row) => row.metric).sort()).toEqual(
      ['energy', 'ldl_cholesterol', 'steps', 'waist', 'weight_average_7d'],
    );
  });

  it('writes nothing for that metric in the six-week series, and every other day of it', () => {
    // RED IF: `seedSeries` stops filtering. Six weeks of fabricated weight land
    // on days a historical import has already filled.
    const all = seriesRows();
    const kept = withoutMeasuredMetrics(all, measuredAlready);
    const droppedMetrics = new Set(all.filter((row) => !kept.includes(row)).map((row) => row.metric));
    console.log(`series rows: ${all.length} before, ${kept.length} after, dropped ${[...droppedMetrics]}`);
    expect(all.filter((row) => row.metric === 'weight').length).toBeGreaterThan(0);
    expect(kept.filter((row) => row.metric === 'weight')).toHaveLength(0);
    expect(droppedMetrics).toEqual(new Set(['weight']));
    for (const metric of ['waist', 'steps', 'sleep_minutes', 'hrv', 'vo2_max', 'resting_heart_rate']) {
      expect(kept.filter((row) => row.metric === metric).length, metric).toBe(
        all.filter((row) => row.metric === metric).length,
      );
    }
  });

  it('writes nothing for that metric in the daily continuation, and no Withings-shaped record with it', () => {
    // RED IF: `continueDemoSeries` stops filtering, or derives its source
    // records from the rows before the filter. The record is the half F43 pays
    // for: one Withings-shaped source record a morning is a scale that is not
    // there reading fresh for ever.
    const day = 5;
    const on = '2026-08-05';
    const all = rowsForDay(day, on, 30);
    const kept = withoutMeasuredMetrics(all, measuredAlready);
    console.log(
      `${on}: ${all.map((row) => row.metric).join(', ')} before, ` +
        `${kept.map((row) => row.metric).join(', ')} after`,
    );

    expect(all.some((row) => row.metric === 'weight')).toBe(true);
    expect(kept.some((row) => row.metric === 'weight')).toBe(false);
    expect(kept).toHaveLength(all.length - 1);

    // The source records the writer derives from the surviving rows.
    const records = new Set(kept.map((row) => row.recordId));
    console.log(`source records still written for ${on}: ${[...records].join(', ')}`);
    expect([...records].some((id) => id.includes('weight'))).toBe(false);
    expect(kept.every((row) => row.standsInFor !== 'withings')).toBe(true);
  });

  it('changes nothing at all on a database with no real rows in it', () => {
    // RED IF: the filter ever inverts. F25's evidence and the C6 floor are both
    // taken on an empty database, where the measured set is empty.
    const none = new Set<string>();
    expect(withoutMeasuredMetrics(DEMO_ROWS, none)).toHaveLength(DEMO_ROWS.length);
    expect(withoutMeasuredMetrics(seriesRows(), none)).toHaveLength(seriesRows().length);
    expect(withoutMeasuredMetrics(rowsForDay(5, '2026-08-05', 30), none)).toHaveLength(
      rowsForDay(5, '2026-08-05', 30).length,
    );
  });
});

describe('freshness, with the demonstration writing a Withings-shaped record every morning', () => {
  const now = new Date(`2026-08-23T09:00:00${OFFSET}`);
  const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);
  const connected = { lastSuccessfulSyncAt: null, state: 'connected', lastError: 'unreachable' };

  it('lets Withings read stale with the adapter unreachable and a seeded record beside it', () => {
    // RED IF: freshness goes back to one `max(measured_at)` over every row. The
    // seeded weight written this morning would answer for a scale that has sent
    // nothing for two days, and F43's evidence could not be produced at all.
    const freshness = freshnessOfSource(
      'withings',
      { measuredAt: hoursAgo(41), seededAt: hoursAgo(2) },
      connected,
      now,
    );
    console.log(
      `withings: measured 41 hours ago, seeded 2 hours ago, reads ${freshness.hours} hours old, stale=${freshness.stale}`,
    );
    expect(freshness.stale).toBe(true);
    expect(freshness.hours).toBe(41);
    expect(freshness.lastError).toBe('unreachable');
  });

  it('does not call a source fresh on a seeded row once that source has delivered a real one', () => {
    // RED IF: the two maxima are merged with `Math.max`. A seeded row would top
    // up a real source's age for ever.
    const freshness = freshnessOfSource(
      'withings',
      { measuredAt: hoursAgo(37), seededAt: hoursAgo(1) },
      null,
      now,
    );
    expect(freshness.lastAt?.getTime()).toBe(hoursAgo(37).getTime());
    expect(freshness.stale).toBe(true);
  });

  it('keeps the demonstration honest while a source has delivered nothing real', () => {
    // RED IF: seeded samples are dropped outright. The phone that stopped four
    // days ago is what puts the stale chip on a demonstration install, and it
    // would read as a source that never existed instead.
    const quiet = freshnessOfSource(
      'apple_health_shortcut',
      { measuredAt: null, seededAt: hoursAgo(4 * 24) },
      null,
      now,
    );
    console.log(`the demonstration phone: ${quiet.hours} hours old, stale=${quiet.stale}`);
    expect(quiet.stale).toBe(true);
    expect(quiet.hours).toBe(96);

    const seeding = freshnessOfSource('withings', { measuredAt: null, seededAt: hoursAgo(2) }, null, now);
    expect(seeding.stale).toBe(false);
  });

  it('still counts a successful sync that returned nothing new', () => {
    // RED IF: the credential's own last sync stops being read. A sync that
    // brought back no rows is still proof the source is alive.
    const freshness = freshnessOfSource(
      'withings',
      { measuredAt: hoursAgo(40), seededAt: null },
      { lastSuccessfulSyncAt: hoursAgo(1), state: 'connected', lastError: null },
      now,
    );
    expect(freshness.stale).toBe(false);
    expect(freshness.hours).toBe(1);
  });

  it('says nothing at all about a source that has never sent anything', () => {
    // RED IF: a null last sample becomes an epoch date, which reads as 493000
    // hours old and puts a stale chip on a source the owner has not connected.
    const never = freshnessOfSource('withings', { measuredAt: null, seededAt: null }, null, now);
    expect(never.lastAt).toBeNull();
    expect(never.hours).toBeNull();
    expect(never.stale).toBe(false);
  });
});

describe('the comparator itself', () => {
  it('is total, deterministic and its own inverse', () => {
    // RED IF: any clause returns 0 for two rows it cannot separate. A sort over
    // a comparator with an untied pair is not deterministic.
    const rows = [
      seeded(TODAY, 85.9),
      measured(TODAY, 84.1, 6, 30),
      measured(TODAY, 84.4, 6, 30),
      seeded(KEYS.at(-2)!, 86.0),
      measured(KEYS.at(-2)!, 85.2, 22, 10),
    ];
    for (const left of rows) {
      for (const right of rows) {
        const forwards = compareStanding(left, right, ZONE);
        const backwards = compareStanding(right, left, ZONE);
        // `|| 0` because Math.sign hands back a negative zero, which is a
        // fact about IEEE 754 and not about the comparator.
        expect(Math.sign(forwards) || 0, `${left.id} vs ${right.id}`).toBe(-Math.sign(backwards) || 0);
        if (left.id !== right.id) expect(forwards, `${left.id} vs ${right.id}`).not.toBe(0);
      }
    }
    const order = [...rows].sort((left, right) => compareStanding(left, right, ZONE)).map((row) => row.id);
    const shuffled = [...rows].reverse().sort((left, right) => compareStanding(left, right, ZONE)).map((row) => row.id);
    console.log(`the standing order: ${order.join(' > ')}`);
    expect(shuffled).toEqual(order);
  });

  it('reads the day in the zone the app runs in and not in UTC', () => {
    // RED IF: the day clause uses `toISOString`. 23:40 Paris on the 22nd is
    // 21:40 UTC the same day, but 00:40 Paris on the 23rd is 22:40 UTC on the
    // 22nd, and the two rows would collapse onto one column.
    const lateOnTheTwentySecond = measured('2026-08-22', 85.0, 23, 40);
    const earlyOnTheTwentyThird = seeded('2026-08-23', 86.0);
    expect(compareStanding(earlyOnTheTwentyThird, lateOnTheTwentySecond, ZONE)).toBeLessThan(0);
  });
});
