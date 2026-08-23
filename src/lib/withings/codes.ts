/**
 * The Withings measure type table, the allowlist this product sends, and the
 * decode rule. Everything here comes out of `.forge/research/withings.md`,
 * which was read against the OpenAPI spec on 2026-08-21, and nothing here is
 * inferred from a live response.
 *
 * Dependency free and free of TypeScript that needs more than type stripping,
 * so a script can import it straight from Node the way scripts/route-table.mjs
 * imports src/lib/routes.ts.
 */

/**
 * The eight codes this product asks for, and there is no ninth.
 *
 * They are the seven biomarkers a Body Smart publishes through the API, per the
 * Available Health Data matrix, plus fat ratio, which the scale table does not
 * list as its own row but which the spec and the notification categories both
 * put alongside fat mass for scales. Its absence from a response is tolerated
 * and never treated as an error.
 *
 * The list is sent EXPLICITLY on every call. An unfiltered getmeas returns
 * whatever the account holds, and what that account holds is not this product's
 * decision to make: a blood pressure monitor linked to the same Withings login
 * would put systolic, diastolic and its own heart rate into the answer.
 */
export const ALLOWED_TYPES = [1, 5, 6, 8, 11, 76, 77, 88] as const;

export type AllowedType = (typeof ALLOWED_TYPES)[number];

/** The `meastypes` parameter, exactly as it goes on the wire. */
export const MEASTYPES_PARAM = ALLOWED_TYPES.join(',');

/** Real measures, never user objectives. The default is not documented, so it is sent. */
export const MEASURE_CATEGORY_REAL = '1';

/**
 * Diastolic and systolic blood pressure. Those two, and only those two, in the
 * whole measure type table.
 *
 * This product never stores, requests or displays blood pressure. A group
 * carrying either code came off a blood pressure monitor, so its type 11 is a
 * blood pressure device reading rather than a scale reading, and harvesting it
 * would be storing a fragment of a blood pressure record. The group is dropped
 * whole. The storage layer refuses the same codes again from the other side, in
 * src/db/withings.ts, so bypassing the fetch layer buys nothing.
 */
export const BLOOD_PRESSURE_TYPES = [9, 10] as const;

export function isBloodPressureType(type: number): boolean {
  return (BLOOD_PRESSURE_TYPES as readonly number[]).includes(type);
}

export function isAllowedType(type: number): boolean {
  return (ALLOWED_TYPES as readonly number[]).includes(type);
}

/**
 * What each code becomes in this database. The metric names are Vernier's and
 * the units are the ones the spec publishes.
 *
 * Type 11 is `standing_heart_rate` and deliberately not `resting_heart_rate`.
 * The spec calls it Heart Pulse and the device matrix calls it Standing Heart
 * Rate: it is what the scale read while the owner stood on it after waking,
 * which is a different fact from the resting rate the watch reports overnight.
 * Folding one into the other would put two populations in one series and make
 * the trend describe neither.
 */
export const METRIC_OF_TYPE: Record<number, { metric: string; unit: string }> = {
  1: { metric: 'weight', unit: 'kg' },
  5: { metric: 'fat_free_mass', unit: 'kg' },
  6: { metric: 'fat_ratio', unit: '%' },
  8: { metric: 'fat_mass', unit: 'kg' },
  11: { metric: 'standing_heart_rate', unit: 'bpm' },
  76: { metric: 'muscle_mass', unit: 'kg' },
  77: { metric: 'body_water', unit: 'kg' },
  88: { metric: 'bone_mass', unit: 'kg' },
};

/**
 * The attribution flag on a measure group, and what this product does with it.
 *
 * 0 and 8 are "captured by a device and known to belong to this user", which is
 * the scale doing its job. 2 is a value the owner typed into the Withings app
 * himself, which is still his number and is kept, with a confidence that says
 * so. 1 is ambiguous, 4 is flagged by Withings as possibly inaccurate, and 5 is
 * a blood pressure monitor writing automatically. None of those three is a
 * reading this product will store.
 */
export const ATTRIB_DEVICE = [0, 8] as const;
export const ATTRIB_MANUAL = 2;

export type Attribution = 'device' | 'manual' | 'refused';

export function attributionOf(attrib: number): Attribution {
  if ((ATTRIB_DEVICE as readonly number[]).includes(attrib)) return 'device';
  if (attrib === ATTRIB_MANUAL) return 'manual';
  return 'refused';
}

/**
 * `value * 10 ** unit`, done on the digits rather than on a binary float.
 *
 * The spec's rule is exact decimal arithmetic and JavaScript's `**` is not:
 * 8145 * 10 ** -2 is 81.45000000000001 in IEEE 754, and that number stored as a
 * raw value is a weight this product would print, compare and never be able to
 * match against the same reading arriving again. The exponent is per measure
 * and is not stable across devices or time, so there is no per-type scale
 * factor to hard code and this runs on every measure.
 *
 * Returns both halves on purpose: `text` is what lands in `raw_value`, which is
 * "what actually arrived", and `number` is the canonical value the charts read.
 */
export function decodeMeasure(value: number, unit: number): { text: string; number: number } {
  const sign = value < 0 ? '-' : '';
  const digits = String(Math.abs(Math.trunc(value)));

  let text: string;
  if (unit === 0) {
    text = `${sign}${digits}`;
  } else if (unit > 0) {
    text = `${sign}${digits}${'0'.repeat(unit)}`;
  } else {
    const point = digits.length + unit;
    text =
      point > 0
        ? `${sign}${digits.slice(0, point)}.${digits.slice(point)}`
        : `${sign}0.${'0'.repeat(-point)}${digits}`;
  }
  return { text, number: Number(text) };
}

/** One measure inside a group, as the spec documents it. */
export type WithingsMeasure = {
  value: number;
  type: number;
  unit: number;
};

/** One measure group, as the spec documents it. Only the fields this product reads. */
export type WithingsMeasureGroup = {
  grpid: number;
  attrib: number;
  /** When the measures were taken. */
  date: number;
  /** When they were stored. */
  created: number;
  /** When they were last updated. This is the clock the cursor follows. */
  modified: number;
  category: number;
  deviceid?: string;
  model?: string;
  model_id?: number;
  measures: WithingsMeasure[];
};

/** The external key a stored row carries, so the same measure cannot land twice. */
export function externalKeyOf(grpid: number, type: number): string {
  return `${grpid}:${type}`;
}

/** Why a group or a measure was not harvested. A case, never a sentence. */
export type DropReason = 'blood_pressure' | 'not_attributable' | 'objective' | 'type_not_asked_for';

export type HarvestedRow = {
  grpid: number;
  type: number;
  externalKey: string;
  metric: string;
  unit: string;
  rawText: string;
  value: number;
  measuredAt: Date;
  modified: number;
  attribution: Exclude<Attribution, 'refused'>;
};

export type HarvestedGroup = {
  grpid: number;
  dropped: DropReason;
  types: number[];
};

export type Harvest = {
  rows: HarvestedRow[];
  droppedGroups: HarvestedGroup[];
  /** Every measure the answer carried, dropped or not. A zero is only evidence beside this. */
  measuresSeen: number;
  groupsSeen: number;
};

/**
 * Turn measure groups into rows this database can hold, and say what was left
 * behind and why.
 *
 * The blood pressure rule is the first one applied and it drops the WHOLE
 * group. That ordering is the rule: a group holding systolic and diastolic also
 * holds the monitor's own heart rate, and filtering measure by measure would
 * keep exactly the fragment that must not be kept.
 */
export function harvest(groups: WithingsMeasureGroup[]): Harvest {
  const rows: HarvestedRow[] = [];
  const droppedGroups: HarvestedGroup[] = [];
  let measuresSeen = 0;

  for (const group of groups) {
    const types = group.measures.map((measure) => measure.type);
    measuresSeen += group.measures.length;

    if (types.some(isBloodPressureType)) {
      droppedGroups.push({ grpid: group.grpid, dropped: 'blood_pressure', types });
      continue;
    }
    if (group.category !== 1) {
      droppedGroups.push({ grpid: group.grpid, dropped: 'objective', types });
      continue;
    }
    const attribution = attributionOf(group.attrib);
    if (attribution === 'refused') {
      droppedGroups.push({ grpid: group.grpid, dropped: 'not_attributable', types });
      continue;
    }

    for (const measure of group.measures) {
      if (!isAllowedType(measure.type)) continue;
      const mapping = METRIC_OF_TYPE[measure.type];
      const decoded = decodeMeasure(measure.value, measure.unit);
      rows.push({
        grpid: group.grpid,
        type: measure.type,
        externalKey: externalKeyOf(group.grpid, measure.type),
        metric: mapping.metric,
        unit: mapping.unit,
        rawText: decoded.text,
        value: decoded.number,
        measuredAt: new Date(group.date * 1000),
        modified: group.modified,
        attribution,
      });
    }
  }

  return { rows, droppedGroups, measuresSeen, groupsSeen: groups.length };
}
