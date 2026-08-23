/**
 * The provenance spine, as rules rather than as tables.
 *
 * Every value this product ever stores passes through here: the six sources,
 * the confidences, the deduplication decision and the correction chain. Eleven
 * slices write through it, so it is deliberately pure. No database, no request,
 * no clock of its own, which is what lets the unit suite grade the decision
 * itself rather than a round trip that happens to contain one.
 *
 * Dependency free and free of TypeScript that needs more than type stripping,
 * so a script can import it straight from Node, the same way
 * `scripts/route-table.mjs` imports `src/lib/routes.ts`.
 */

/**
 * The six, and there is no seventh. `estimated` is a confidence and not a
 * source: an estimate comes from a model reply or a photo, and the dashed chip
 * DESIGN.md draws for it is driven by the confidence column. Demo is a source,
 * because a demonstration row's origin really is the seed, and that has to be
 * legible by reading the database rather than by trusting a badge.
 */
export const SOURCES = [
  'withings',
  'apple_health_shortcut',
  'manual',
  'lab_pdf',
  'derived',
  'demo',
] as const;

export type Source = (typeof SOURCES)[number];

export function isSource(value: string): value is Source {
  return (SOURCES as readonly string[]).includes(value);
}

/**
 * How the number came to be, which is a different question from where it came
 * from. A tape measure and a Body Smart are both trustworthy and not equally
 * so; a rating out of five is neither measured nor estimated, it is reported.
 */
export const CONFIDENCES = [
  'measured_device',
  'measured_manual',
  'reported',
  'printed',
  'estimated',
  'derived',
  'demo',
] as const;

export type Confidence = (typeof CONFIDENCES)[number];

/**
 * What deduplication decided about a row that was stored. A row is never
 * written without one, and the decision is readable on the value sheet, because
 * "why is there one reading here when I took two" is a question the owner will
 * ask months later.
 */
export const STORED_DEDUP_DECISIONS = ['unique', 'kept_over_duplicate', 'correction'] as const;

export type StoredDedupDecision = (typeof STORED_DEDUP_DECISIONS)[number];

/**
 * Why a decision went the way it did, as a key into the string catalogue plus
 * the data that fills it. Never a sentence: this module has to stay importable
 * by a plain Node script, and C6 wants every user-facing string to have one
 * home and one key. The caller renders it and stores the rendered line beside
 * the row, frozen at write time, the way an audit reason is.
 */
export type DedupReason = {
  key:
    | 'identical'
    | 'conflictsWithCorrection'
    | 'keptOverOther'
    | 'otherWins'
    | 'firstOfDay'
    /**
     * The two an importer decides, which the quick log never can. A measure
     * that arrives with an identifier of its own is deduplicated on that
     * identifier rather than on the day it was taken, so its reason names the
     * identifier and not the day.
     */
    | 'importedFirst'
    | 'importRevised';
  params: Record<string, string>;
};

/**
 * The two outcomes that never become a row. A duplicate is the same fact
 * arriving twice and there is nothing to store; a disagreement with a stored
 * correction is a question, and a question writes nothing at all.
 */
export type DedupOutcome =
  | { decision: StoredDedupDecision; reason: DedupReason; store: true }
  | { decision: 'dropped_as_duplicate'; reason: DedupReason; store: false; keptId: string }
  | { decision: 'held_for_question'; reason: DedupReason; store: false; conflictsWith: string };

/**
 * The contract version the row was written under. It changes when the shape of
 * what an importer sends changes, so a value stored in August 2026 can always
 * be read back knowing what the writer meant. Stored on every row and on every
 * source record.
 */
export const IMPORT_VERSION = '2026-08-3';

/**
 * The metrics this slice writes. Units are metric and fixed by DESIGN.md:
 * kg, cm, km, kcal, g, and the laboratory's printed unit where there is one.
 * `point` is a rating out of five and `text` is a free note, which has no
 * number and is never stored as a zero.
 */
export const METRICS = {
  weight: { unit: 'kg', kind: 'number', low: 20, high: 400 },
  waist: { unit: 'cm', kind: 'number', low: 30, high: 250 },
  energy: { unit: 'point', kind: 'rating', low: 1, high: 5 },
  fatigue: { unit: 'point', kind: 'rating', low: 1, high: 5 },
  hunger: { unit: 'point', kind: 'rating', low: 1, high: 5 },
  satiety: { unit: 'point', kind: 'rating', low: 1, high: 5 },
  note: { unit: 'text', kind: 'text', low: 0, high: 0 },
  steps: { unit: 'step', kind: 'number', low: 0, high: 200_000 },
  weight_average_7d: { unit: 'kg', kind: 'number', low: 20, high: 400 },
  /**
   * The four body signals that arrive from a watch rather than from a scale.
   * Sleep is stored in minutes, never in a formatted duration, so the same row
   * can be summed, averaged and re-rendered in any wording. The bands are wide
   * enough for a real body and narrow enough to catch a unit mistake: minutes
   * arriving as hours, or a heart rate arriving as a percentage.
   */
  sleep_minutes: { unit: 'min', kind: 'number', low: 45, high: 1200 },
  resting_heart_rate: { unit: 'bpm', kind: 'number', low: 25, high: 220 },
  hrv: { unit: 'ms', kind: 'number', low: 1, high: 400 },
  vo2_max: { unit: 'mL/kg/min', kind: 'number', low: 5, high: 90 },
  /**
   * The seven body-composition readings a Body Smart publishes through the
   * Withings API, and nothing beyond them.
   *
   * Visceral fat and basal metabolic rate are absent on purpose: Withings' own
   * device matrix has both unchecked for this model and puts them on the Body
   * Comp, the Body Pro 2 and the Body Scan. The Withings app computing a number
   * is not the API returning one. If either ever appears in a real response it
   * gets a metric then, on evidence.
   *
   * `standing_heart_rate` is deliberately not `resting_heart_rate`. The scale
   * reads a pulse while the owner stands on it after waking; the watch reports
   * a resting rate over a night. Two populations in one series would describe
   * neither.
   */
  fat_mass: { unit: 'kg', kind: 'number', low: 1, high: 200 },
  fat_free_mass: { unit: 'kg', kind: 'number', low: 10, high: 300 },
  fat_ratio: { unit: '%', kind: 'number', low: 1, high: 70 },
  muscle_mass: { unit: 'kg', kind: 'number', low: 5, high: 200 },
  bone_mass: { unit: 'kg', kind: 'number', low: 0.5, high: 10 },
  body_water: { unit: 'kg', kind: 'number', low: 5, high: 150 },
  standing_heart_rate: { unit: 'bpm', kind: 'number', low: 25, high: 220 },
  /** The laboratory's own unit, kept as printed. A converted value never appears alone. */
  ldl_cholesterol: { unit: 'mmol/L', kind: 'number', low: 0, high: 30 },
} as const;

/**
 * What the scale sends beside the weight, in the order the status card lists
 * them. Weight is not on this list: it has its own chart, its own headline
 * rules and its own goal, and it is not one of a set of seven.
 */
export const BODY_COMPOSITION_METRICS = [
  'fat_ratio',
  'fat_mass',
  'fat_free_mass',
  'muscle_mass',
  'bone_mass',
  'body_water',
  'standing_heart_rate',
] as const;

export type Metric = keyof typeof METRICS;

export function isMetric(value: string): value is Metric {
  return Object.hasOwn(METRICS, value);
}

/**
 * The metrics a laboratory prints, which are the ones the panel card lists.
 * Slice 7 owns the review screen and the rest of the analytes; this is what a
 * trend screen needs to know to tell a blood value from a body one.
 */
export const LAB_METRICS = ['ldl_cholesterol'] as const;

/** The six the quick-log sheet commits, in the order the sheet draws them. */
export const QUICK_LOG_METRICS = [
  'waist',
  'energy',
  'fatigue',
  'hunger',
  'satiety',
  'note',
] as const;

export const RATING_MIN = 1;
export const RATING_MAX = 5;

/** What was wrong with a value, as a case a caller renders. Never a sentence here. */
export type ValueProblem = 'unknownMetric' | 'blank' | 'notANumber' | 'rating' | 'range';

export type CheckedValue =
  | { ok: true; value: number | null }
  | { ok: false; problem: ValueProblem; low: number; high: number };

/**
 * Is this a value Vernier will store, and what is the number if so.
 *
 * Every writer runs this and there is no second copy of the rule: the quick
 * log, a correction, and the importers eleven slices from now all ask the same
 * question of the same table above. The band per metric lives beside the unit
 * because that is where a reader looks for it, and because a rating out of five
 * that accepts 99 is not a validation gap in a form, it is a permanent row in a
 * table that refuses DELETE.
 *
 * A free note has no number and is stored with none. A blank field is refused
 * rather than stored as a zero, which is the same absence rule the charts draw.
 */
export function checkValue(metric: string, rawValue: string): CheckedValue {
  if (!isMetric(metric)) return { ok: false, problem: 'unknownMetric', low: 0, high: 0 };
  const rule = METRICS[metric];
  const raw = rawValue.trim();
  if (raw === '') return { ok: false, problem: 'blank', low: rule.low, high: rule.high };
  if (rule.kind === 'text') return { ok: true, value: null };

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return { ok: false, problem: 'notANumber', low: rule.low, high: rule.high };
  }
  if (rule.kind === 'rating') {
    const whole = Number.isInteger(value);
    if (!whole || value < rule.low || value > rule.high) {
      return { ok: false, problem: 'rating', low: rule.low, high: rule.high };
    }
    return { ok: true, value };
  }
  if (value < rule.low || value > rule.high) {
    return { ok: false, problem: 'range', low: rule.low, high: rule.high };
  }
  return { ok: true, value };
}

/**
 * What deduplication needs to know about a value already in the table. Kept to
 * the fields that decide, so a test can build one by hand.
 */
export type StoredCandidate = {
  id: string;
  metric: string;
  source: string;
  rawValue: string;
  measuredAt: Date;
  /** The chain this row belongs to. Every row of one value shares it. */
  rootId: string;
  /** 0 on the original, 1 on the first correction, and so on. The highest one stands. */
  correctionIndex: number;
};

export type IncomingValue = {
  metric: string;
  source: Source;
  rawValue: string;
  measuredAt: Date;
  timeZone: string;
};

/** The calendar day an instant fell on, as 'YYYY-MM-DD', read in one zone. */
function dayIn(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).format(date);
}

/** Two instants on the same calendar day, read in the zone the value was taken in. */
export function sameDay(left: Date, right: Date, timeZone: string): boolean {
  return dayIn(left, timeZone) === dayIn(right, timeZone);
}

/**
 * WHICH ROW STANDS, in one comparator, for every caller there will ever be.
 *
 * `.forge/AMENDMENTS.md` A7 and `.forge/RULING-DEMO-COLLISION.md`. Five places
 * in this product answered "which row stands for this metric on this day", and
 * four of them answered it differently from the one that wrote the answer down:
 * the write layer resolved by rank, every read layer resolved by clock. Where
 * they disagree the read layer can draw the fabricated reading and hide the
 * measured one, because the demonstration seed writes weight at a fixed 06:52
 * and a real weigh-in at 06:30 loses a race it should never have been in, and
 * takes the seven-day average, the headline, the week change, the pace and the
 * goal delta with it.
 *
 * So the rule lives here, once, and every site that resolves a day or a metric
 * calls it. A second copy of this rule is how the first two came to disagree.
 *
 * THE RULE, IN ORDER.
 *
 * 1. The later calendar day, read in the app's zone. Two rows on different days
 *    are not competing for a column, and on one day this clause is a no-op,
 *    which is what makes the three below A7's three clauses exactly. It is here
 *    rather than in each caller because "the last weight on file" spans days:
 *    without it a real reading imported from June would beat a seeded one from
 *    last week, which is the same defect pointed the other way.
 * 2. A measured row beats a seeded one. `measurement.seed` is generated by
 *    Postgres from the source and no writer can set it, which is why the rule
 *    rests on it rather than on an id prefix or on a convention.
 * 3. Then the later `measured_at`.
 * 4. Then the greater id, so two rows on the same instant resolve the same way
 *    on every read. The comparison this replaces was a strict `>` on the clock
 *    alone, so equal instants were decided by whichever row the database
 *    happened to return first.
 *
 * Negative when `left` stands, so sorting by it puts the row that stands first.
 */
export type Standing = { id: string; measuredAt: Date } & (
  | { seed: boolean }
  /**
   * `measurement.source`, never `source_record.source`. A seeded weight's
   * record says `withings`, which is what it stands in for and not what wrote
   * it.
   */
  | { source: string }
);

/**
 * Seeded or measured, off the generated column where the caller read it and off
 * the source where it did not. Postgres computes one from the other, so they
 * are the same fact: `seed` is `generated always as ("source" = 'demo')`.
 */
export function isSeeded(row: Standing): boolean {
  return 'seed' in row ? row.seed : row.source === 'demo';
}

export function compareStanding(left: Standing, right: Standing, timeZone: string): number {
  const leftDay = dayIn(left.measuredAt, timeZone);
  const rightDay = dayIn(right.measuredAt, timeZone);
  if (leftDay !== rightDay) return leftDay > rightDay ? -1 : 1;

  const leftSeed = isSeeded(left);
  const rightSeed = isSeeded(right);
  if (leftSeed !== rightSeed) return leftSeed ? 1 : -1;

  const byInstant = right.measuredAt.getTime() - left.measuredAt.getTime();
  if (byInstant !== 0) return byInstant;

  if (left.id === right.id) return 0;
  return left.id > right.id ? -1 : 1;
}

/** The one row that stands, out of rows describing the same metric. */
export function whatStands<T extends Standing>(rows: T[], timeZone: string): T | undefined {
  let held: T | undefined;
  for (const row of rows) {
    if (!held || compareStanding(row, held, timeZone) < 0) held = row;
  }
  return held;
}

/**
 * A device reading outranks a hand-typed one for the same metric on the same
 * day, and both outrank a demonstration row. Nothing here silently discards a
 * disagreement: precedence only decides which of two rows describing the same
 * event is the one the charts read, and the loser is named in the reason.
 *
 * Rank can never contradict the comparator above, and that is not a
 * coincidence to be maintained by hand: `demo` is the only source Postgres
 * computes `seed` from, and it is the only rank below every other. So "a
 * measured row beats a seeded one" and "a higher rank beats a lower one" agree
 * on every pair either of them can see. `tests/unit/demonstration-yields.test.ts`
 * asserts it rather than trusting the reading.
 */
export const PRECEDENCE: Record<Source, number> = {
  withings: 4,
  apple_health_shortcut: 3,
  lab_pdf: 4,
  manual: 2,
  derived: 1,
  demo: 0,
};

/**
 * Does an incoming row outrank the row that already stands for its day?
 *
 * Strictly, and the strictness is the rule: EQUAL RANK MEANS THE COMMITTED ROW
 * STAYS. An append-only store cannot take the loser back out, so a tie is
 * broken in favour of what is already there rather than by writing a second row
 * that nothing would ever draw. It is what the importer decided for itself at
 * `src/lib/withings/import.ts`, and it lives here so there is one copy of it:
 * the importer and `decideDedup` both ask this function.
 */
export function outranks(incoming: Source, standing: string): boolean {
  return PRECEDENCE[incoming] > (isSource(standing) ? PRECEDENCE[standing] : 0);
}

/**
 * The deduplication decision, in one place, for every writer there will ever
 * be. Four questions in a fixed order, and the order is the rule:
 *
 * 1. Does the table already hold this exact fact? Then there is nothing to
 *    store and the row that is already there keeps its id.
 * 2. Does it disagree with a stored correction? Then it is a question and it
 *    writes nothing. This is the quiet half of the unapproved-write risk: an
 *    import that overwrites a correction produces a wrong number nobody knows
 *    to go looking for.
 * 3. Does anything already stand for this metric on this day, from any source
 *    including this one? Then rank decides, equal rank leaves the committed row
 *    where it is, and the reason names what lost.
 * 4. Otherwise it is the first of its kind.
 */
export function decideDedup(incoming: IncomingValue, stored: StoredCandidate[]): DedupOutcome {
  const sameMetricSameDay = stored.filter(
    (row) =>
      row.metric === incoming.metric && sameDay(row.measuredAt, incoming.measuredAt, incoming.timeZone),
  );

  const identical = sameMetricSameDay.find(
    (row) => row.source === incoming.source && row.rawValue === incoming.rawValue,
  );
  if (identical) {
    return {
      decision: 'dropped_as_duplicate',
      store: false,
      keptId: identical.id,
      reason: {
        key: 'identical',
        params: { metric: incoming.metric, value: incoming.rawValue, source: incoming.source },
      },
    };
  }

  // The chain head, never the first correction in the list.
  //
  // A value corrected twice holds three rows: 92.2, then 99.2, then whatever
  // stands now. Reading `find(isCorrection)` picked the earliest correction,
  // so the question card told the owner his stored value was 92.2 while the
  // chain stood at 99.2. Nothing was written either way and F26 held, but a
  // card that names the wrong number is the card lying about his own data.
  // The head of each chain is the row with the highest correction index, and
  // it is the only row of that chain that describes what is stored today.
  const heads = new Map<string, StoredCandidate>();
  for (const row of sameMetricSameDay) {
    const held = heads.get(row.rootId);
    if (!held || row.correctionIndex > held.correctionIndex) heads.set(row.rootId, row);
  }

  const correction = [...heads.values()].find((row) => row.correctionIndex > 0);
  if (correction && correction.rawValue !== incoming.rawValue) {
    return {
      decision: 'held_for_question',
      store: false,
      conflictsWith: correction.id,
      reason: {
        key: 'conflictsWithCorrection',
        params: {
          source: incoming.source,
          incoming: incoming.rawValue,
          corrected: correction.rawValue,
        },
      },
    };
  }

  // WHATEVER ALREADY STANDS FOR THIS DAY, and no longer only a row from some
  // other source.
  //
  // The predicate used to be `row.source !== incoming.source`, so two rows of
  // one source on one day matched nothing here and fell through to `unique`
  // below. Both were stored and both claimed to be the only reading of that
  // metric on that day. A1's unique index over (source, external_key) covers a
  // re-import, but demonstration mode has no shared external key, so slice 5's
  // importer running against the seed produced exactly that pair. F36.
  //
  // The incumbent is the row that STANDS rather than the first row the query
  // returned, which is the comparator's job and not a second rule.
  const other = whatStands([...heads.values()], incoming.timeZone);
  if (other) {
    if (outranks(incoming.source, other.source)) {
      return {
        decision: 'kept_over_duplicate',
        store: true,
        reason: { key: 'keptOverOther', params: { source: other.source, value: other.rawValue } },
      };
    }
    return {
      decision: 'dropped_as_duplicate',
      store: false,
      keptId: other.id,
      reason: { key: 'otherWins', params: { source: other.source, value: other.rawValue } },
    };
  }

  return {
    decision: 'unique',
    store: true,
    reason: { key: 'firstOfDay', params: {} },
  };
}

/** One row of a correction chain, as the value sheet reads it. */
export type ChainRow = {
  id: string;
  rootId: string;
  correctsId: string | null;
  correctionIndex: number;
  rawValue: string;
};

/**
 * The chain, oldest first: the original and every correction after it. Nothing
 * is dropped and nothing is collapsed, because the original struck through is
 * exactly what the value sheet renders.
 */
export function orderChain<T extends ChainRow>(rows: T[]): T[] {
  return [...rows].sort((left, right) => left.correctionIndex - right.correctionIndex);
}

/** The value that stands today: the last correction, or the original if there is none. */
export function currentOfChain<T extends ChainRow>(rows: T[]): T | undefined {
  return orderChain(rows).at(-1);
}

/** The original, which survives every edit. */
export function originalOfChain<T extends ChainRow>(rows: T[]): T | undefined {
  return orderChain(rows).at(0);
}
