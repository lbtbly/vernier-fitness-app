import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { formatNumber, plainNumber } from '@/lib/format';
import { checkValue } from '@/lib/provenance';
import {
  CAPS,
  SCHEMA_VERSION,
  canonicalString,
  dedupKeyOf,
  digestMatches,
  expandBatch,
  isForbiddenType,
  parseBatch,
  readSampleTimestamp,
  readTimestamp,
  rollupDays,
  rollupId,
  skewSeconds,
  twoPassDigest,
} from '@/lib/health-ingest';

/**
 * The ingest contract, graded as arithmetic rather than as a round trip.
 *
 * Everything here runs with no database, no browser and no container, which is
 * the point: what decides whether a batch is accepted is about two hundred
 * lines of rules, and those rules are worth grading directly instead of through
 * a request that happens to contain them.
 */

const WINDOW = {
  start: '2026-08-19T00:00:00+02:00',
  end: '2026-08-21T18:00:00+02:00',
};

function series(over: Partial<Record<string, unknown>> = {}) {
  return {
    metric: 'steps',
    grouping: 'hour',
    type: ['Steps'],
    value: ['412'],
    unit: ['count'],
    start: ['2026-08-20T08:00:00+02:00'],
    end: ['2026-08-20T08:59:59+02:00'],
    source: ['iPhone'],
    ...over,
  };
}

function batch(over: Partial<Record<string, unknown>> = {}) {
  return {
    schema: SCHEMA_VERSION,
    source: 'ios-shortcut',
    key_id: 'k1',
    device: 'iphone181',
    window_start: WINDOW.start,
    window_end: WINDOW.end,
    generated_at: '2026-08-21T18:04:11+02:00',
    nonce: '2026-08-21T18:04:11+02:00-482913756-119043882',
    series: [series()],
    ...over,
  };
}

describe('timestamps, which are the silent two-hour bug', () => {
  it('reads a numeric offset with and without its colon', () => {
    // Format Date's yyyy-MM-dd'T'HH:mm:ssZ under Unicode TR35 emits +0200 with
    // no colon, and the ECMAScript Date Time String Format does not require an
    // engine to accept that. This would go red the day the parsing is handed
    // back to Date.parse, which is exactly how a batch from a real phone would
    // start being read as an hour in a different year.
    const withColon = readTimestamp('2026-08-20T08:00:00+02:00');
    const without = readTimestamp('2026-08-20T08:00:00+0200');
    expect(withColon?.at.toISOString()).toBe('2026-08-20T06:00:00.000Z');
    expect(without?.at.toISOString()).toBe('2026-08-20T06:00:00.000Z');
    expect(withColon?.offsetMinutes).toBe(120);
    expect(without?.offsetMinutes).toBe(120);
  });

  it('refuses a timestamp carrying no offset at all', () => {
    expect(readTimestamp('2026-08-20T08:00:00')).toBeNull();
    expect(readTimestamp('2026-08-20 08:00:00')).toBeNull();
    expect(readTimestamp('20 Aug 2026')).toBeNull();
  });

  it('takes a bare Z only when the batch itself is at zero', () => {
    // A phone in Paris labelling local time Z is the whole reason this rule
    // exists. The batch declares its offset on X-Ingest-Timestamp, and a sample
    // that says Z inside a +02:00 batch is a mis-wired Format Date rather than
    // a phone in Iceland.
    expect(readSampleTimestamp('2026-08-20T06:00:00Z', 0)?.at.toISOString()).toBe(
      '2026-08-20T06:00:00.000Z',
    );
    expect(readSampleTimestamp('2026-08-20T06:00:00Z', 120)).toBeNull();
    expect(readSampleTimestamp('2026-08-20T08:00:00+02:00', 120)?.offsetMinutes).toBe(120);
    // And a negative offset is read as a negative offset, not as its absolute.
    expect(readTimestamp('2026-08-20T08:00:00-05:00')?.at.toISOString()).toBe(
      '2026-08-20T13:00:00.000Z',
    );
  });

  it('measures skew in whole seconds, in either direction', () => {
    const now = new Date('2026-08-21T18:04:11Z');
    expect(skewSeconds(new Date('2026-08-21T18:04:11Z'), now)).toBe(0);
    expect(skewSeconds(new Date('2026-08-21T17:59:11Z'), now)).toBe(300);
    expect(skewSeconds(new Date('2026-08-21T18:09:11Z'), now)).toBe(300);
  });
});

describe('blood pressure, refused by name', () => {
  it('refuses the five string variants and both HealthKit symbols', () => {
    // Five variants plus the two symbols, which is what F48 asks for, and each
    // one is asserted rather than inferred from a rule that "should" cover it.
    const refused = [
      'blood pressure',
      'Blood Pressure',
      'systolic blood pressure',
      'Diastolic Blood Pressure',
      'blood pressure systolic',
      'HKQuantityTypeIdentifierBloodPressureSystolic',
      'HKQuantityTypeIdentifierBloodPressureDiastolic',
      'blood_pressure',
      'BLOOD-PRESSURE',
      '  Blood  Pressure  ',
    ];
    for (const type of refused) expect(isForbiddenType(type)).toBe(true);
    // And the population it walked, printed beside the zero, because a list of
    // things that were all refused is only evidence next to a list of things
    // that were not.
    const allowed = ['Steps', 'Heart Rate', 'Resting Heart Rate', 'Sleep', 'VO2 Max', 'pressure', 'blood'];
    for (const type of allowed) expect(isForbiddenType(type)).toBe(false);
    expect(refused.length + allowed.length).toBe(17);
  });

  it('refuses the whole batch, not the row, and before any expansion', () => {
    const parsed = parseBatch(
      batch({
        series: [series(), series({ metric: 'blood_pressure', type: ['Systolic Blood Pressure'] })],
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const expanded = expandBatch(parsed.value, 120);
    expect(expanded.ok).toBe(false);
    if (expanded.ok) return;
    expect(expanded.error.code).toBe('forbidden_type');
    // Named, so the message can tell the owner which block to delete.
    expect(expanded.error.params.series).toBe('blood_pressure');
  });

  it('refuses a forbidden type hiding in a well-named series', () => {
    // The slug is the owner's and the type is Apple's, so both are checked. A
    // check on the slug alone would pass a series called `heart` carrying
    // systolic readings.
    const parsed = parseBatch(
      batch({ series: [series({ metric: 'heart_rate', type: ['Systolic Blood Pressure'] })] }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const expanded = expandBatch(parsed.value, 120);
    expect(expanded.ok).toBe(false);
  });
});

describe('the envelope', () => {
  it('accepts a well-formed batch', () => {
    const parsed = parseBatch(batch());
    expect(parsed.ok).toBe(true);
  });

  it('refuses a version it does not implement', () => {
    const parsed = parseBatch(batch({ schema: 'health.ingest.v2' }));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.code).toBe('bad_schema');
    expect(parsed.error.params.field).toBe('schema');
  });

  it('refuses an unknown top-level key rather than ignoring it', () => {
    const parsed = parseBatch(batch({ cursor: '2026-08-21' }));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.params.field).toBe('cursor');
  });

  it('refuses a value that is not a string', () => {
    // Shortcuts' JSON serialiser is not worth arguing with about numeric types,
    // so the contract is that everything is a string and the server parses.
    const parsed = parseBatch(batch({ series: [series({ value: [412] })] }));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.code).toBe('bad_schema');
  });

  it('names the series and the column when six arrays are not six equal arrays', () => {
    const parsed = parseBatch(
      batch({ series: [series({ metric: 'heart_rate', value: ['62', '64'] })] }),
    );
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.code).toBe('length_mismatch');
    expect(parsed.error.params.series).toBe('heart_rate');
    expect(parsed.error.params.column).toBe('value');
    expect(parsed.error.params.expected).toBe('1');
    expect(parsed.error.params.found).toBe('2');
  });

  it('refuses more series, more rows per series and more rows than it will hold', () => {
    const many = Array.from({ length: CAPS.series + 1 }, (_, index) =>
      series({ metric: `metric_${index}` }),
    );
    const tooManySeries = parseBatch(batch({ series: many }));
    expect(tooManySeries.ok).toBe(false);
    if (!tooManySeries.ok) expect(tooManySeries.error.code).toBe('too_large');

    const wide = CAPS.rowsPerSeries + 1;
    const fat = series({
      type: Array.from({ length: wide }, () => 'Steps'),
      value: Array.from({ length: wide }, () => '1'),
      unit: Array.from({ length: wide }, () => 'count'),
      start: Array.from({ length: wide }, () => '2026-08-20T08:00:00+02:00'),
      end: Array.from({ length: wide }, () => '2026-08-20T08:59:59+02:00'),
      source: Array.from({ length: wide }, () => ''),
    });
    const tooWide = parseBatch(batch({ series: [fat] }));
    expect(tooWide.ok).toBe(false);
    if (!tooWide.ok) expect(tooWide.error.code).toBe('too_large');
  });

  it('folds the expanded sample array into the same series the phone sends', () => {
    // The research offers `samples: [...]` for anything that is not a Shortcut.
    // It is honoured by conversion rather than by a second parser, so a fixture
    // and a phone take one code path. This goes red the day the two diverge.
    const folded = parseBatch({
      schema: SCHEMA_VERSION,
      source: 'curl',
      key_id: 'k1',
      device: 'mac',
      window_start: WINDOW.start,
      window_end: WINDOW.end,
      generated_at: '2026-08-21T18:04:11+02:00',
      nonce: 'n1',
      samples: [
        {
          metric: 'steps',
          grouping: 'hour',
          type: 'Steps',
          value: '412',
          unit: 'count',
          start: '2026-08-20T08:00:00+02:00',
          end: '2026-08-20T08:59:59+02:00',
          source: 'iPhone',
        },
        {
          metric: 'steps',
          grouping: 'hour',
          type: 'Steps',
          value: '1180',
          unit: 'count',
          start: '2026-08-20T09:00:00+02:00',
          end: '2026-08-20T09:59:59+02:00',
          source: 'iPhone',
        },
      ],
    });
    expect(folded.ok).toBe(true);
    if (!folded.ok) return;
    expect(folded.value.series).toHaveLength(1);
    expect(folded.value.series[0].value).toEqual(['412', '1180']);
  });

  it('refuses a timestamp with no offset before anything is written', () => {
    const parsed = parseBatch(batch({ series: [series({ start: ['2026-08-20T08:00:00'] })] }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const expanded = expandBatch(parsed.value, 120);
    expect(expanded.ok).toBe(false);
    if (expanded.ok) return;
    expect(expanded.error.code).toBe('bad_timestamp_format');
    expect(expanded.error.params.field).toBe('start');
    expect(expanded.error.params.series).toBe('steps');
  });
});

describe('the two-pass keyed digest', () => {
  const canonical = canonicalString({
    keyId: 'k1',
    timestamp: '2026-08-23T11:23:39+0200',
    nonce: '2026-08-23T11:23:39+0200-2811080-480827086',
    windowStart: WINDOW.start,
    windowEnd: WINDOW.end,
  });

  it('joins six lines with newlines and no trailing newline', () => {
    expect(canonical.split('\n')).toHaveLength(6);
    expect(canonical.endsWith('\n')).toBe(false);
    expect(canonical.startsWith('v1\nk1\n')).toBe(true);
  });

  it('agrees byte for byte with the four shell lines the app prints', () => {
    // This exact value was produced by scripts/ingest-fixture.sh with
    // INGEST_SECRET=s, through shasum, on this machine. It is here as a golden
    // vector: if the joining, the separator or the number of passes ever
    // changes, the shortcut in the owner's hand stops matching the server and
    // this goes red first. That is the whole failure this slice is about.
    expect(twoPassDigest('s', canonical)).toBe(
      'a3dcf04d2937e3c5952b1bbb209f08445db704a9e434076244a67a5adf70013a',
    );
  });

  it('is two passes and not one', () => {
    const onePass = createHash('sha256').update(`s|${canonical}`, 'utf8').digest('hex');
    expect(twoPassDigest('s', canonical)).not.toBe(onePass);
    const inner = onePass;
    const twoPass = createHash('sha256').update(`s|${inner}`, 'utf8').digest('hex');
    expect(twoPassDigest('s', canonical)).toBe(twoPass);
  });

  it('changes when any one of the six lines changes', () => {
    const base = twoPassDigest('secret', canonical);
    const fields = ['keyId', 'timestamp', 'nonce', 'windowStart', 'windowEnd'] as const;
    const parts = {
      keyId: 'k1',
      timestamp: '2026-08-23T11:23:39+0200',
      nonce: 'n',
      windowStart: WINDOW.start,
      windowEnd: WINDOW.end,
    };
    for (const field of fields) {
      const moved = twoPassDigest('secret', canonicalString({ ...parts, [field]: 'moved' }));
      expect(moved).not.toBe(base);
    }
    expect(twoPassDigest('other', canonical)).not.toBe(base);
  });

  it('compares in constant time and survives a length mismatch', () => {
    const digest = twoPassDigest('secret', canonical);
    expect(digestMatches(digest, digest)).toBe(true);
    expect(digestMatches(digest, digest.toUpperCase())).toBe(true);
    expect(digestMatches(digest, ` ${digest} `)).toBe(true);
    expect(digestMatches(digest, digest.slice(0, 40))).toBe(false);
    expect(digestMatches(digest, '')).toBe(false);
    expect(digestMatches(digest, null)).toBe(false);
    // One character out at the end, which is the case a short-circuiting
    // comparison would answer more slowly than one out at the front.
    expect(digestMatches(digest, `${digest.slice(0, 63)}0`)).toBe(
      digest.endsWith('0'),
    );
  });
});

describe('the synthesised dedup key', () => {
  const row = {
    metric: 'steps',
    type: 'Steps',
    startAt: new Date('2026-08-20T06:00:00Z'),
    endAt: new Date('2026-08-20T06:59:59Z'),
    valueRaw: '412',
    unit: 'count',
    sampleSource: 'iPhone',
  };

  it('is stable for the same sample sent twice', () => {
    expect(dedupKeyOf(row)).toBe(dedupKeyOf({ ...row }));
  });

  it('is the same key when the same moment arrives from a different offset', () => {
    // Shortcuts exposes no sample UUID, so the key is synthesised, and the
    // instants go into it in UTC. A phone that travelled would otherwise send
    // the same reading twice under two keys and store it twice.
    const parsed = parseBatch(
      batch({
        series: [
          series({ start: ['2026-08-20T08:00:00+02:00'], end: ['2026-08-20T08:59:59+02:00'] }),
        ],
      }),
    );
    const shifted = parseBatch(
      batch({
        series: [
          series({ start: ['2026-08-20T07:00:00+01:00'], end: ['2026-08-20T07:59:59+01:00'] }),
        ],
      }),
    );
    expect(parsed.ok && shifted.ok).toBe(true);
    if (!parsed.ok || !shifted.ok) return;
    const left = expandBatch(parsed.value, 120);
    const right = expandBatch(shifted.value, 60);
    expect(left.ok && right.ok).toBe(true);
    if (!left.ok || !right.ok) return;
    expect(left.value[0].dedupKey).toBe(right.value[0].dedupKey);
  });

  it('changes when any of the seven fields changes', () => {
    const base = dedupKeyOf(row);
    expect(dedupKeyOf({ ...row, metric: 'flights_climbed' })).not.toBe(base);
    expect(dedupKeyOf({ ...row, type: 'Flights Climbed' })).not.toBe(base);
    expect(dedupKeyOf({ ...row, startAt: new Date('2026-08-20T07:00:00Z') })).not.toBe(base);
    expect(dedupKeyOf({ ...row, endAt: new Date('2026-08-20T07:00:00Z') })).not.toBe(base);
    expect(dedupKeyOf({ ...row, valueRaw: '413' })).not.toBe(base);
    expect(dedupKeyOf({ ...row, unit: 'steps' })).not.toBe(base);
    expect(dedupKeyOf({ ...row, sampleSource: 'Apple Watch' })).not.toBe(base);
  });
});

describe('the daily roll-up', () => {
  const zone = 'Europe/Paris';

  function rows(source: unknown) {
    const parsed = parseBatch(batch({ series: source as never }));
    if (!parsed.ok) throw new Error(parsed.error.code);
    const expanded = expandBatch(parsed.value, 120);
    if (!expanded.ok) throw new Error(expanded.error.code);
    return expanded.value;
  }

  it('sums a day of hourly steps and leaves today alone', () => {
    const now = new Date('2026-08-21T12:00:00+02:00');
    const days = rollupDays(
      rows([
        series({
          type: ['Steps', 'Steps', 'Steps'],
          value: ['412', '1180', '900'],
          unit: ['count', 'count', 'count'],
          start: [
            '2026-08-20T08:00:00+02:00',
            '2026-08-20T09:00:00+02:00',
            '2026-08-21T09:00:00+02:00',
          ],
          end: [
            '2026-08-20T08:59:59+02:00',
            '2026-08-20T09:59:59+02:00',
            '2026-08-21T09:59:59+02:00',
          ],
          source: ['', '', ''],
        }),
      ]),
      zone,
      now,
    );
    // Two days arrived and exactly one of them has ended. Today's 900 steps are
    // absent rather than stored as a day's total, because tomorrow's run would
    // then have to either append a second row or rewrite an append-only table.
    expect(days).toHaveLength(1);
    expect(days[0].on).toBe('2026-08-20');
    expect(days[0].value).toBe(1592);
    expect(days[0].samples).toBe(2);
  });

  it('counts sleep from its own stages and attributes the night to the morning', () => {
    const now = new Date('2026-08-21T12:00:00+02:00');
    const days = rollupDays(
      rows([
        series({
          metric: 'sleep',
          grouping: 'none',
          type: ['Sleep', 'Sleep', 'Sleep', 'Sleep'],
          value: ['In Bed', 'Core', 'REM', 'Awake'],
          unit: ['', '', '', ''],
          start: [
            '2026-08-19T23:20:00+02:00',
            '2026-08-19T23:41:00+02:00',
            '2026-08-20T02:12:00+02:00',
            '2026-08-20T02:58:00+02:00',
          ],
          end: [
            '2026-08-19T23:41:00+02:00',
            '2026-08-20T02:12:00+02:00',
            '2026-08-20T02:58:00+02:00',
            '2026-08-20T03:10:00+02:00',
          ],
          source: ['Apple Watch', 'Apple Watch', 'Apple Watch', 'Apple Watch'],
        }),
      ]),
      zone,
      now,
    );
    expect(days).toHaveLength(1);
    // The night that started on the 19th belongs to the morning of the 20th.
    expect(days[0].on).toBe('2026-08-20');
    expect(days[0].metric).toBe('sleep_minutes');
    // 151 minutes of Core plus 46 of REM. In Bed and Awake are not sleep, and
    // counting them would report a man who read for twenty minutes as having
    // slept for twenty minutes.
    expect(days[0].value).toBe(197);
    expect(days[0].samples).toBe(2);
  });

  it('averages a heart rate and takes the last VO2 max', () => {
    const now = new Date('2026-08-21T12:00:00+02:00');
    const days = rollupDays(
      rows([
        series({
          metric: 'resting_heart_rate',
          grouping: 'none',
          type: ['Resting Heart Rate', 'Resting Heart Rate'],
          value: ['54', '56'],
          unit: ['count/min', 'count/min'],
          start: ['2026-08-20T07:02:00+02:00', '2026-08-20T19:02:00+02:00'],
          end: ['2026-08-20T07:02:00+02:00', '2026-08-20T19:02:00+02:00'],
          source: ['Apple Watch', 'Apple Watch'],
        }),
        series({
          metric: 'vo2_max',
          grouping: 'none',
          type: ['VO2 Max', 'VO2 Max'],
          value: ['42.1', '43.2'],
          unit: ['mL/kg·min', 'mL/kg·min'],
          start: ['2026-08-20T07:40:00+02:00', '2026-08-20T19:40:00+02:00'],
          end: ['2026-08-20T07:40:00+02:00', '2026-08-20T19:40:00+02:00'],
          source: ['Apple Watch', 'Apple Watch'],
        }),
      ]),
      zone,
      now,
    );
    const heart = days.find((day) => day.metric === 'resting_heart_rate');
    const vo2 = days.find((day) => day.metric === 'vo2_max');
    expect(heart?.value).toBe(55);
    expect(vo2?.value).toBe(43.2);
    // The unit the phone displayed it in travels with it, because Value comes
    // back in the action's Health unit and never in the HealthKit one.
    expect(vo2?.rawUnit).toBe('mL/kg·min');
  });

  it('rolls up nothing for a metric the app has no reading for', () => {
    const now = new Date('2026-08-21T12:00:00+02:00');
    const source = rows([
      series({
        metric: 'flights_climbed',
        type: ['Flights Climbed'],
        value: ['12'],
        unit: ['count'],
        start: ['2026-08-20T08:00:00+02:00'],
        end: ['2026-08-20T08:59:59+02:00'],
        source: [''],
      }),
    ]);
    // The sample is kept. There is simply no metric in the provenance table for
    // flights, and inventing one here would be this slice writing a column
    // another slice owns. The population is printed beside the zero.
    expect(source).toHaveLength(1);
    expect(rollupDays(source, zone, now)).toHaveLength(0);
  });

  it('produces a number every validator in this app will still read', () => {
    // THE ONE THAT WAS ACTUALLY WRONG. The roll-up wrote its raw value through
    // `formatNumber`, which groups: a day of hourly steps summing to 4,995 was
    // stored as "4,995", `checkValue` read it back with Number(), got NaN, and
    // refused the day as "not a number" with a reason that named the wrong
    // cause. Every rolled-up day now goes through the same gate here, at the
    // precision its unit carries, and this goes red the moment a grouped
    // string reaches a column again.
    const now = new Date('2026-08-22T12:00:00+02:00');
    const hours = Array.from({ length: 12 }, (_, index) => index + 6);
    const days = rollupDays(
      rows([
        series({
          type: hours.map(() => 'Steps'),
          value: hours.map(() => '1200'),
          unit: hours.map(() => 'count'),
          start: hours.map((hour) => `2026-08-21T${String(hour).padStart(2, '0')}:00:00+02:00`),
          end: hours.map((hour) => `2026-08-21T${String(hour).padStart(2, '0')}:59:59+02:00`),
          source: hours.map(() => ''),
        }),
      ]),
      zone,
      now,
    );
    expect(days).toHaveLength(1);
    expect(days[0].value).toBe(14_400);
    const raw = plainNumber(days[0].value, days[0].unit);
    console.log(`a rolled-up day of ${days[0].value} steps stores raw_value ${JSON.stringify(raw)}`);
    expect(raw).toBe('14400');
    expect(Number(raw)).toBe(14_400);
    expect(checkValue(days[0].metric, raw).ok).toBe(true);
    // And the grouped form, which is what a screen draws and what a column
    // must never hold, so the difference is asserted rather than assumed.
    expect(formatNumber(days[0].value, days[0].unit)).toBe('14,400');
    expect(checkValue(days[0].metric, formatNumber(days[0].value, days[0].unit)).ok).toBe(false);
  });

  it('gives every rolled-up metric a value the stored band accepts', () => {
    // Each of the five, at a plausible day's worth, through the same gate the
    // roll-up uses. A band that refused a real day would drop it silently from
    // the trend and leave the chart with a hole nobody caused.
    const cases: Array<[string, string, number]> = [
      ['steps', 'step', 9412],
      ['sleep_minutes', 'min', 419],
      ['resting_heart_rate', 'bpm', 54],
      ['hrv', 'ms', 61],
      ['vo2_max', 'mL/kg/min', 43.2],
    ];
    for (const [metric, unit, value] of cases) {
      const raw = plainNumber(value, unit);
      const checked = checkValue(metric, raw);
      console.log(`${metric}: ${value} stores as ${JSON.stringify(raw)}, accepted ${checked.ok}`);
      expect(checked.ok, `${metric} refused ${raw}`).toBe(true);
    }
    expect(cases).toHaveLength(5);
  });

  it('gives a day the same id however many times it arrives', () => {
    expect(rollupId('steps', '2026-08-20')).toBe('ah_steps_2026-08-20');
    expect(rollupId('steps', '2026-08-20')).toBe(rollupId('steps', '2026-08-20'));
    expect(rollupId('steps', '2026-08-21')).not.toBe(rollupId('steps', '2026-08-20'));
  });

  it('reads the day boundary in the app zone and not in UTC', () => {
    const now = new Date('2026-08-22T12:00:00+02:00');
    // 00:30 Paris on the 21st is 22:30 UTC on the 20th. Rolled up in UTC this
    // lands on the wrong day, which is the same class of bug as the Z on a
    // local timestamp and would put a night's steps on the day before.
    const days = rollupDays(
      rows([
        series({
          start: ['2026-08-21T00:30:00+02:00'],
          end: ['2026-08-21T00:59:59+02:00'],
        }),
      ]),
      zone,
      now,
    );
    expect(days).toHaveLength(1);
    expect(days[0].on).toBe('2026-08-21');
  });
});
