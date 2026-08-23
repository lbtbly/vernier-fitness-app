import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * The Apple Health ingest contract, as rules rather than as a request.
 *
 * Every decision the endpoint makes lives here: what a well-formed batch looks
 * like, which timestamps are legible, which metric types are refused outright,
 * how the two-pass keyed digest is built, and how a row that carries no sample
 * identifier is given one. Deliberately pure. No database, no clock of its own,
 * no Next, no strings: it returns error CODES and the route renders them from
 * the catalogue, the same way `src/lib/provenance.ts` returns a dedup reason as
 * a key plus its data.
 *
 * That split is what lets the unit suite grade the rules themselves rather than
 * a round trip that happens to contain one, and it is why a phone that is not
 * in the room is not needed to prove any of this.
 *
 * The wire format is `.forge/research/apple-health-shortcut.md` §7.1, and it is
 * columnar because Shortcuts cannot loop over two days of heart rate without
 * crashing: six parallel arrays per series, every value a string, one POST per
 * run. Nothing here invents a field the Shortcuts action list cannot produce.
 */

/** The version gate. Anything else is refused rather than guessed at. */
export const SCHEMA_VERSION = 'health.ingest.v1';

/** The canonical string's own version, first line of the six. */
export const CANONICAL_VERSION = 'v1';

/**
 * How far a batch's clock may sit from this machine's, in seconds.
 *
 * It is also the whole of the check that a bare `Z` on the request timestamp is
 * genuinely UTC. A phone in Europe/Paris that labels local time `Z` is off by
 * 3600 or 7200 seconds, which is outside this window, so it is refused as stale
 * rather than accepted two hours in the past. See `parseTimestamp` below.
 */
export const SKEW_SECONDS = 300;

/** How long a spent nonce is remembered. */
export const NONCE_TTL_HOURS = 24;

/**
 * The envelope, and the reason each number is what it is.
 *
 * `bodyBytes` is the ceiling a single POST may weigh. Shortcuts has no
 * compression action and a body it cannot send dies silently rather than
 * failing, so the server states its limit and the guide sizes the window under
 * it. The row caps come from the research's measured envelope: a 48-hour window
 * with the high-frequency metrics grouped by hour is a few hundred rows, and
 * 8,429 rows is the largest run anybody has recorded through this pattern.
 */
export const CAPS = {
  bodyBytes: 8 * 1024 * 1024,
  series: 32,
  rowsPerSeries: 5_000,
  rows: 20_000,
} as const;

/**
 * Every way a batch can be refused, as a code. The route turns each one into a
 * plain-English `message`, because `Get Contents of URL` gives the Shortcut no
 * status code and the message is the only channel the owner has.
 */
export type IngestErrorCode =
  | 'bad_schema'
  | 'bad_token'
  | 'bad_digest'
  | 'stale_timestamp'
  | 'replayed_nonce'
  | 'forbidden_type'
  | 'length_mismatch'
  | 'too_large'
  | 'bad_timestamp_format';

export type IngestError = { code: IngestErrorCode; params: Record<string, string> };

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: IngestError };

function fail(code: IngestErrorCode, params: Record<string, string> = {}): { ok: false; error: IngestError } {
  return { ok: false, error: { code, params } };
}

// ---------------------------------------------------------------------------
// Timestamps.

/**
 * ISO 8601 with a numeric offset, which is the one shape `Format Date` can be
 * made to produce with `yyyy-MM-dd'T'HH:mm:ssZ` under Unicode TR35.
 *
 * The offset group accepts `+0200` and `+02:00` alike, because TR35's `Z`
 * symbol emits the first and a hand-written fixture tends to carry the second.
 * A trailing `Z` is matched here and judged below; a string with no offset at
 * all matches nothing and is refused, because that is the silent two-hour bug
 * this whole contract exists to make impossible.
 */
const TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,6}))?(Z|[+-]\d{2}:?\d{2})$/;

export type Instant = {
  /** The moment itself. */
  at: Date;
  /** Minutes east of UTC, as the string declared them. Paris in August is 120. */
  offsetMinutes: number;
  /** True when the string said `Z` rather than a signed offset. */
  bareZ: boolean;
};

/**
 * A timestamp, or nothing.
 *
 * The instant is computed from the parts rather than handed to `Date.parse`,
 * on purpose: `2026-08-21T18:04:11+0200` has no colon in its offset and the
 * ECMAScript Date Time String Format does not require an engine to accept it.
 * The Shortcut emits exactly that shape, so the arithmetic is done here where
 * it cannot depend on which engine is running.
 */
export function readTimestamp(text: unknown): Instant | null {
  if (typeof text !== 'string') return null;
  const match = TIMESTAMP.exec(text.trim());
  if (!match) return null;
  const [, year, month, day, hour, minute, second, fraction, zone] = match;
  const bareZ = zone === 'Z';
  let offsetMinutes = 0;
  if (!bareZ) {
    const sign = zone.startsWith('-') ? -1 : 1;
    const digits = zone.slice(1).replace(':', '');
    offsetMinutes = sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4)));
  }
  const milliseconds = fraction ? Number(fraction.padEnd(3, '0').slice(0, 3)) : 0;
  const utc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second ?? '0'),
    milliseconds,
  );
  const at = new Date(utc - offsetMinutes * 60_000);
  if (Number.isNaN(at.getTime())) return null;
  return { at, offsetMinutes, bareZ };
}

/**
 * A timestamp read against the offset the batch itself declared.
 *
 * A bare `Z` is accepted only when the batch's own offset is genuinely zero.
 * The batch's offset is the one on `X-Ingest-Timestamp`, and that header has
 * already been held to 300 seconds of this machine's clock, so a phone in Paris
 * that labelled local time `Z` never gets this far: it is two hours out and is
 * refused as stale. A batch that really is at UTC passes both, and its samples
 * may then say `Z` too. A batch declaring `+02:00` whose samples say `Z` is
 * mixed, which is the mis-wired `Format Date` this rule exists to catch.
 */
export function readSampleTimestamp(text: unknown, batchOffsetMinutes: number): Instant | null {
  const instant = readTimestamp(text);
  if (!instant) return null;
  if (instant.bareZ && batchOffsetMinutes !== 0) return null;
  return instant;
}

/** Whole seconds between two instants, unsigned. */
export function skewSeconds(left: Date, right: Date): number {
  return Math.abs(Math.round((left.getTime() - right.getTime()) / 1000));
}

// ---------------------------------------------------------------------------
// Blood pressure, refused by name.

/**
 * Lower case, and every run of spacing, underscores and hyphens flattened to
 * one space. `Blood_Pressure`, `blood-pressure` and `Blood  Pressure` are the
 * same three words and are treated as such.
 */
function normaliseType(text: string): string {
  return text.toLowerCase().replace(/[\s_-]+/g, ' ').trim();
}

/**
 * Is this a metric type this app refuses to hold.
 *
 * Blood pressure is refused by name, case-insensitively, in two shapes: the
 * words with spacing in them, and the run-together HealthKit symbol. The second
 * clause is what catches `HKQuantityTypeIdentifierBloodPressureSystolic` and
 * `...Diastolic` without listing them, and it catches anything Apple renames
 * them to that still contains the two words.
 *
 * The refusal is the whole batch and it is never a silent drop. Believing a
 * reading was stored when it was discarded is the same defect as the gap, and
 * the schema has no column for it either way.
 */
export function isForbiddenType(text: string): boolean {
  const spaced = normaliseType(text);
  if (spaced.includes('blood pressure')) return true;
  return spaced.replace(/ /g, '').includes('bloodpressure');
}

// ---------------------------------------------------------------------------
// The two-pass keyed digest.

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * The six fields the digest covers, newline joined, no trailing newline.
 *
 * The server builds this from the parsed body and the request headers. It never
 * accepts a canonical string from the client, because a digest computed over a
 * string the caller wrote proves the caller can write a string.
 */
export function canonicalString(parts: {
  keyId: string;
  timestamp: string;
  nonce: string;
  windowStart: string;
  windowEnd: string;
}): string {
  return [
    CANONICAL_VERSION,
    parts.keyId,
    parts.timestamp,
    parts.nonce,
    parts.windowStart,
    parts.windowEnd,
  ].join('\n');
}

/**
 * Two SHA-256 passes over the secret and the canonical string, lower-case hex.
 *
 * Two, not one. `SHA256(secret ‖ message)` is open to length extension; the
 * second pass runs over a fixed-length input, the secret plus 64 hex
 * characters, which closes it. This is NOT HMAC and nothing in this repository
 * calls it HMAC: Shortcuts has no XOR, no byte handling and no way to build a
 * real one without an undocumented `data:text/html` trick that Apple owes
 * nothing to. The threat model is the same and there are a tenth of the moving
 * parts. The trade-off is written out in docs/security.md.
 *
 * What it covers: the request's identity, its key, its time, its nonce and its
 * declared window. What it does not cover: the body bytes, because the Shortcut
 * never sees the bytes its own JSON serialiser produces. Body integrity comes
 * from TLS, which is Tailscale Serve and is not optional here.
 */
export function twoPassDigest(secret: string, canonical: string): string {
  const inner = sha256Hex(`${secret}|${canonical}`);
  return sha256Hex(`${secret}|${inner}`);
}

/**
 * Constant time, and length safe. `timingSafeEqual` throws on a length
 * mismatch and an exception is itself a signal, so the lengths are compared
 * first and a mismatch simply returns false. Same shape as
 * `tokensMatch` in src/lib/tokens.ts, which is the precedent this follows.
 */
export function digestMatches(expected: string, provided: string | null | undefined): boolean {
  if (!provided) return false;
  const left = Buffer.from(expected.toLowerCase(), 'utf8');
  const right = Buffer.from(provided.trim().toLowerCase(), 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

// ---------------------------------------------------------------------------
// The batch.

export type IncomingSeries = {
  metric: string;
  grouping: string;
  type: string[];
  value: string[];
  unit: string[];
  start: string[];
  end: string[];
  source: string[];
};

export type IncomingBatch = {
  schema: string;
  source: string;
  keyId: string;
  device: string;
  windowStart: string;
  windowEnd: string;
  generatedAt: string;
  nonce: string;
  series: IncomingSeries[];
};

/** Exactly the top-level keys this contract defines. An unknown one is refused. */
const ENVELOPE_KEYS = new Set([
  'schema',
  'source',
  'key_id',
  'device',
  'window_start',
  'window_end',
  'generated_at',
  'nonce',
  'series',
  'samples',
]);

const SERIES_KEYS = new Set([
  'metric',
  'grouping',
  'type',
  'value',
  'unit',
  'start',
  'end',
  'source',
]);

/** The six parallel arrays, in the order the guide builds them. */
const COLUMNS = ['type', 'value', 'unit', 'start', 'end', 'source'] as const;

/** One row of the expanded array form, which is what a fixture or a curl sends. */
const SAMPLE_KEYS = new Set([
  'metric',
  'grouping',
  'type',
  'value',
  'unit',
  'start',
  'end',
  'source',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/**
 * The expanded array form folded back into the columnar one.
 *
 * The research offers `samples: [...]` for anything that is not a Shortcut, and
 * this is how it is honoured without a second parser: the rows are grouped by
 * metric and grouping and become series, and everything after this point is the
 * exact code path a phone takes. One validator, one dedup, one set of caps. The
 * shipped fixture deliberately uses the columnar form anyway, because a fixture
 * that exercises a shape the phone never sends proves the wrong thing.
 */
function foldSamples(rows: unknown): Parsed<IncomingSeries[]> {
  if (!Array.isArray(rows)) return fail('bad_schema', { field: 'samples' });
  const byKey = new Map<string, IncomingSeries>();
  for (const [index, row] of rows.entries()) {
    if (!isPlainObject(row)) return fail('bad_schema', { field: `samples[${index}]` });
    for (const key of Object.keys(row)) {
      if (!SAMPLE_KEYS.has(key)) return fail('bad_schema', { field: `samples[${index}].${key}` });
    }
    const metric = readString(row.metric);
    const grouping = readString(row.grouping) ?? 'none';
    if (metric === null) return fail('bad_schema', { field: `samples[${index}].metric` });
    const at = `${metric}|${grouping}`;
    const series =
      byKey.get(at) ??
      { metric, grouping, type: [], value: [], unit: [], start: [], end: [], source: [] };
    for (const column of COLUMNS) {
      const text = readString(row[column]);
      if (text === null) return fail('bad_schema', { field: `samples[${index}].${column}` });
      series[column].push(text);
    }
    byKey.set(at, series);
  }
  return { ok: true, value: [...byKey.values()] };
}

/**
 * The envelope and its series, checked in full before a single row is written.
 *
 * Strict on purpose, and the strictness is the feature. An unknown top-level
 * key is refused rather than ignored, every value is required to be a string
 * because Shortcuts' JSON serialiser is not worth arguing with about numeric
 * types, and the six arrays of a series must be the same length. That last one
 * is the contract's only real integrity check and it catches a mis-wired
 * Shortcut on the first run instead of on the day somebody reads the chart.
 */
export function parseBatch(raw: unknown): Parsed<IncomingBatch> {
  if (!isPlainObject(raw)) return fail('bad_schema', { field: 'body' });

  for (const key of Object.keys(raw)) {
    if (!ENVELOPE_KEYS.has(key)) return fail('bad_schema', { field: key });
  }

  const schema = readString(raw.schema);
  if (schema !== SCHEMA_VERSION) {
    return fail('bad_schema', { field: 'schema', found: schema ?? '' });
  }

  const envelope: Record<string, string> = {};
  for (const field of ['source', 'key_id', 'device', 'window_start', 'window_end', 'generated_at', 'nonce']) {
    const text = readString(raw[field]);
    if (text === null || text.trim() === '') return fail('bad_schema', { field });
    envelope[field] = text.trim();
  }

  if (raw.series !== undefined && raw.samples !== undefined) {
    return fail('bad_schema', { field: 'series' });
  }

  let series: IncomingSeries[];
  if (raw.samples !== undefined) {
    const folded = foldSamples(raw.samples);
    if (!folded.ok) return folded;
    series = folded.value;
  } else {
    if (!Array.isArray(raw.series)) return fail('bad_schema', { field: 'series' });
    series = [];
    for (const [index, entry] of raw.series.entries()) {
      if (!isPlainObject(entry)) return fail('bad_schema', { field: `series[${index}]` });
      for (const key of Object.keys(entry)) {
        if (!SERIES_KEYS.has(key)) return fail('bad_schema', { field: `series[${index}].${key}` });
      }
      const metric = readString(entry.metric);
      const grouping = readString(entry.grouping);
      if (metric === null || metric.trim() === '') {
        return fail('bad_schema', { field: `series[${index}].metric` });
      }
      if (grouping === null || grouping.trim() === '') {
        return fail('bad_schema', { field: `series[${index}].grouping` });
      }
      const columns: Record<string, string[]> = {};
      for (const column of COLUMNS) {
        const values = entry[column];
        if (!Array.isArray(values)) {
          return fail('bad_schema', { field: `${metric}.${column}` });
        }
        for (const value of values) {
          if (typeof value !== 'string') {
            return fail('bad_schema', { field: `${metric}.${column}` });
          }
        }
        columns[column] = values as string[];
      }
      series.push({
        metric: metric.trim(),
        grouping: grouping.trim(),
        type: columns.type,
        value: columns.value,
        unit: columns.unit,
        start: columns.start,
        end: columns.end,
        source: columns.source,
      });
    }
  }

  if (series.length > CAPS.series) {
    return fail('too_large', { found: String(series.length), limit: String(CAPS.series) });
  }

  let rows = 0;
  for (const entry of series) {
    const lengths = COLUMNS.map((column) => entry[column].length);
    const first = lengths[0];
    if (lengths.some((length) => length !== first)) {
      const at = COLUMNS.findIndex((column) => entry[column].length !== first);
      return fail('length_mismatch', {
        series: entry.metric,
        column: COLUMNS[at],
        expected: String(first),
        found: String(entry[COLUMNS[at]].length),
      });
    }
    if (first > CAPS.rowsPerSeries) {
      return fail('too_large', { found: String(first), limit: String(CAPS.rowsPerSeries) });
    }
    rows += first;
  }
  if (rows > CAPS.rows) {
    return fail('too_large', { found: String(rows), limit: String(CAPS.rows) });
  }

  return {
    ok: true,
    value: {
      schema,
      source: envelope.source,
      keyId: envelope.key_id,
      device: envelope.device,
      windowStart: envelope.window_start,
      windowEnd: envelope.window_end,
      generatedAt: envelope.generated_at,
      nonce: envelope.nonce,
      series,
    },
  };
}

// ---------------------------------------------------------------------------
// Expansion into rows.

export type SampleRow = {
  metric: string;
  grouping: string;
  type: string;
  valueRaw: string;
  /** The number when the value is one. A sleep stage is a word and stays null. */
  value: number | null;
  unit: string;
  startAt: Date;
  endAt: Date;
  /** Minutes east of UTC the sample declared, kept so the original survives. */
  offsetMinutes: number;
  sampleSource: string;
  dedupKey: string;
};

/**
 * The key that stands in for the sample identifier Shortcuts does not expose.
 *
 * `Get Details of Health Sample` offers eight details and none of them is a
 * UUID, so there is nothing stable to dedupe on and the server has to make one.
 * Seven fields, joined, hashed: the same reading arriving in tomorrow's
 * overlapping window produces the same key and the unique index does the rest.
 * Instants are hashed in UTC so the same moment sent from two offsets is one
 * row and not two.
 */
export function dedupKeyOf(row: {
  metric: string;
  type: string;
  startAt: Date;
  endAt: Date;
  valueRaw: string;
  unit: string;
  sampleSource: string;
}): string {
  return sha256Hex(
    [
      row.metric,
      row.type,
      row.startAt.toISOString(),
      row.endAt.toISOString(),
      row.valueRaw,
      row.unit,
      row.sampleSource,
    ].join('|'),
  );
}

/**
 * Every series expanded into rows, with the forbidden types refused for the
 * whole batch and every timestamp read against the batch's own offset.
 *
 * Nothing is written before this returns. The blood-pressure check runs over
 * the series slug and over every type string that arrived, so a batch carrying
 * one is refused entire and the owner is told, rather than having it dropped
 * quietly under a success message.
 */
export function expandBatch(batch: IncomingBatch, batchOffsetMinutes: number): Parsed<SampleRow[]> {
  const rows: SampleRow[] = [];

  for (const series of batch.series) {
    if (isForbiddenType(series.metric)) {
      return fail('forbidden_type', { series: series.metric });
    }
    for (const type of series.type) {
      if (isForbiddenType(type)) return fail('forbidden_type', { series: series.metric });
    }
  }

  for (const series of batch.series) {
    for (let index = 0; index < series.type.length; index += 1) {
      const start = readSampleTimestamp(series.start[index], batchOffsetMinutes);
      if (!start) {
        return fail('bad_timestamp_format', {
          series: series.metric,
          field: 'start',
          found: series.start[index],
        });
      }
      const end = readSampleTimestamp(series.end[index], batchOffsetMinutes);
      if (!end) {
        return fail('bad_timestamp_format', {
          series: series.metric,
          field: 'end',
          found: series.end[index],
        });
      }
      const valueRaw = series.value[index].trim();
      const number = Number(valueRaw.replace(',', '.'));
      const row = {
        metric: series.metric,
        grouping: series.grouping,
        type: series.type[index].trim(),
        valueRaw,
        value: valueRaw !== '' && Number.isFinite(number) ? number : null,
        unit: series.unit[index].trim(),
        startAt: start.at,
        endAt: end.at,
        offsetMinutes: start.offsetMinutes,
        sampleSource: series.source[index].trim(),
      };
      rows.push({ ...row, dedupKey: dedupKeyOf(row) });
    }
  }

  return { ok: true, value: rows };
}

// ---------------------------------------------------------------------------
// The daily roll-up, which is what reaches a chart.

/**
 * The metric slugs the guide tells the owner to use, and what each one becomes.
 *
 * `metric` is the app's own stable slug and never the Shortcuts picker label,
 * because that label is localised and Apple has renamed one of them already
 * (VO2 Max is Cardio Fitness in the Health app). The label still travels, in
 * `type`, as provenance.
 *
 * Five of the ten roll up into a stored measurement, and they are exactly the
 * five body signals Health already draws. The other five are kept as samples:
 * they have no metric in `src/lib/provenance.ts`, and inventing one here would
 * be this slice writing a column another slice owns.
 *
 * A slug outside this list is NOT refused. It is stored as samples and rolls up
 * to nothing, and the diagnostics screen prints accepted rows per series, so a
 * mistyped slug shows as a series with rows and no stored reading. Refusing it
 * instead would put a typo ahead of the blood-pressure check and answer
 * `bad_schema` where F48 requires a named forbidden-type refusal.
 */
export const INGEST_METRICS = [
  'steps',
  'distance_walk_run',
  'flights_climbed',
  'active_calories',
  'exercise_minutes',
  'heart_rate',
  'resting_heart_rate',
  'hrv',
  'vo2_max',
  'sleep',
] as const;

export type IngestMetric = (typeof INGEST_METRICS)[number];

/** How a day's worth of one metric becomes one number. */
export type RollupRule = {
  /** The metric in `src/lib/provenance.ts` this lands on. */
  metric: string;
  unit: string;
  reduce: 'sum' | 'mean' | 'last' | 'asleepMinutes';
};

export const ROLLUPS: Partial<Record<IngestMetric, RollupRule>> = {
  steps: { metric: 'steps', unit: 'step', reduce: 'sum' },
  resting_heart_rate: { metric: 'resting_heart_rate', unit: 'bpm', reduce: 'mean' },
  hrv: { metric: 'hrv', unit: 'ms', reduce: 'mean' },
  vo2_max: { metric: 'vo2_max', unit: 'mL/kg/min', reduce: 'last' },
  sleep: { metric: 'sleep_minutes', unit: 'min', reduce: 'asleepMinutes' },
};

/**
 * The sleep stages that are sleep.
 *
 * `Find Health Samples` returns sleep as a category sample whose value is the
 * stage, and In Bed and Awake are not sleep: summing them would report a man
 * who read for an hour as having slept for one. Matched on the words rather
 * than the exact casing, because the stage arrives as the picker renders it.
 */
const ASLEEP_STAGES = ['core', 'deep', 'rem', 'asleep', 'unspecified'];

function isAsleep(valueRaw: string): boolean {
  const text = normaliseType(valueRaw);
  if (text.includes('in bed') || text.includes('awake') || text.includes('inbed')) return false;
  return ASLEEP_STAGES.some((stage) => text.includes(stage));
}

export type DayRollup = {
  /** The day key in the app's own zone, 'YYYY-MM-DD'. */
  on: string;
  metric: string;
  unit: string;
  value: number;
  /** The latest instant the day's samples reached, which is when it was measured. */
  measuredAt: Date;
  /** How many samples went into the number, so a short day is legible. */
  samples: number;
  /** The unit the samples carried, kept as it arrived. */
  rawUnit: string;
};

/**
 * A day key in a named zone, the same shape `src/lib/trend.ts` indexes by.
 * Local, because this module stays free of app imports so a script can read it.
 */
function dayKeyIn(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).format(date);
}

/**
 * A day's samples reduced to one stored reading, for complete days only.
 *
 * COMPLETE DAYS ONLY, and that is the rule that makes this idempotent. Today's
 * total changes every time the shortcut runs, so writing it would either append
 * a second row per run or overwrite a measurement, and `measurement` refuses
 * UPDATE by design. A day that has ended does not change, so its number is
 * computed once, keyed by day, and every later run recomputes the same value
 * and stores nothing. Today is simply absent until tomorrow, which is the same
 * absence rule the charts draw.
 *
 * A sleep night is attributed to the day it ends on, because sleep starts
 * before midnight and nobody thinks of Thursday night as Wednesday's sleep.
 */
export function rollupDays(
  rows: SampleRow[],
  timeZone: string,
  now: Date,
): DayRollup[] {
  const today = dayKeyIn(now, timeZone);
  const buckets = new Map<string, { rule: RollupRule; rows: SampleRow[]; on: string }>();

  for (const row of rows) {
    const rule = ROLLUPS[row.metric as IngestMetric];
    if (!rule) continue;
    // Sleep lands on the morning it ended; everything else on the day it began.
    const anchor = rule.reduce === 'asleepMinutes' ? row.endAt : row.startAt;
    const on = dayKeyIn(anchor, timeZone);
    if (on >= today) continue;
    const at = `${rule.metric}|${on}`;
    const held = buckets.get(at) ?? { rule, rows: [], on };
    held.rows.push(row);
    buckets.set(at, held);
  }

  const out: DayRollup[] = [];
  for (const bucket of buckets.values()) {
    const { rule, rows: sampled, on } = bucket;
    // reduce(), not Math.max(...spread): a spread of twenty thousand arguments
    // is a stack overflow rather than a maximum, and the caps allow that many.
    const measuredAt = new Date(
      sampled.reduce((latest, row) => Math.max(latest, row.endAt.getTime()), 0),
    );
    const rawUnit = sampled.find((row) => row.unit !== '')?.unit ?? '';
    let value: number | null = null;
    let counted = sampled.length;

    if (rule.reduce === 'asleepMinutes') {
      const asleep = sampled.filter((row) => isAsleep(row.valueRaw));
      counted = asleep.length;
      value = asleep.reduce(
        (total, row) => total + (row.endAt.getTime() - row.startAt.getTime()) / 60_000,
        0,
      );
      value = Math.round(value);
      if (counted === 0) value = null;
    } else {
      const numbers = sampled
        .filter((row) => row.value !== null)
        .sort((left, right) => left.startAt.getTime() - right.startAt.getTime())
        .map((row) => row.value as number);
      counted = numbers.length;
      if (numbers.length === 0) value = null;
      else if (rule.reduce === 'sum') value = numbers.reduce((total, one) => total + one, 0);
      else if (rule.reduce === 'mean') value = numbers.reduce((total, one) => total + one, 0) / numbers.length;
      else value = numbers[numbers.length - 1];
    }

    if (value === null) continue;
    out.push({
      on,
      metric: rule.metric,
      unit: rule.unit,
      value: rule.reduce === 'mean' ? Math.round(value * 10) / 10 : value,
      measuredAt,
      samples: counted,
      rawUnit,
    });
  }

  return out.sort((left, right) => (left.on === right.on ? left.metric.localeCompare(right.metric) : left.on.localeCompare(right.on)));
}

/** The stored measurement's id for a rolled-up day. Deterministic, so a re-run cannot double it. */
export function rollupId(metric: string, on: string): string {
  return `ah_${metric}_${on}`;
}
