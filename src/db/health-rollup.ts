import { readExistingRollupIds } from './ingest';
import { storeMeasurement } from './measurements';
import { plainNumber } from '@/lib/format';
import { type DayRollup, rollupId } from '@/lib/health-ingest';
import { metricLabel } from '@/lib/display';
import { strings } from '@/lib/strings';
import { validateValue } from '@/lib/value-refusal';

/**
 * A complete day of samples, stored as one reading, through the same door every
 * other value in this app goes through.
 *
 * The samples themselves are already in `health_sample`, raw and append only.
 * That is evidence, not a trend: nothing draws a chart out of 288 heart-rate
 * rows, and the five signals Health renders are daily numbers. So one reading
 * per metric per completed day lands in `measurement`, with its source record,
 * its provenance chip, its confidence and its deduplication decision, exactly
 * like a Withings reading or a typed one.
 *
 * THE ID IS DERIVED AND THAT IS WHAT MAKES A RE-RUN FREE. `ah_steps_2026-08-21`
 * is the id of the steps reading for that day, forever. The shortcut runs three
 * times a day over an overlapping 48-hour window, so the same day arrives about
 * six times; the second arrival finds its own id in the table and stores
 * nothing. Without that, `decideDedup` would see a different total from the
 * same source on the same day, call it the first of its kind, and append a
 * second row per run.
 *
 * And only completed days, which `rollupDays` enforces. Today's step count
 * changes every hour, and `measurement` refuses UPDATE by design, so a partial
 * day could only be stored by appending a row per run or by rewriting history.
 * It is absent until it is finished, which is the same absence rule the charts
 * already draw.
 */

export type RollupResult = {
  stored: number;
  /** Days already on file, which is the normal case after the first run of a day. */
  alreadyStored: number;
  /** Days the value rules refused, each with the reason the owner would be given. */
  refused: Array<{ metric: string; detail: string }>;
};

export async function storeRollups(input: {
  batchId: string;
  device: string;
  days: DayRollup[];
  timeZone: string;
  windowLabel: string;
  receivedAt: Date;
}): Promise<RollupResult> {
  const result: RollupResult = { stored: 0, alreadyStored: 0, refused: [] };
  if (input.days.length === 0) return result;

  const ids = input.days.map((day) => rollupId(day.metric, day.on));
  const known = await readExistingRollupIds(ids);

  const sourceRecordInput = {
    id: `src_ingest_${input.batchId}`,
    source: 'apple_health_shortcut' as const,
    kind: 'shortcut_payload' as const,
    reference: input.batchId,
    occurredAt: input.receivedAt,
    detail: [
      { key: 'source.field.shortcut', value: input.device },
      { key: 'source.field.endpoint', value: strings.ingest.endpointPath },
      { key: 'source.field.window', value: input.windowLabel },
      { key: 'source.field.rowsReceived', value: String(input.days.length) },
    ],
  };

  for (const day of input.days) {
    const id = rollupId(day.metric, day.on);
    if (known.has(id)) {
      result.alreadyStored += 1;
      continue;
    }
    // The number at the precision its unit deserves, and WITHOUT a thousands
    // separator. `raw_value` is read back with Number() by every validator this
    // app has, and Number('4,995') is NaN: a day of hourly steps summing past a
    // thousand was refused as "not a number" and dropped, with a reason that
    // named the wrong cause. Grouping is for a screen; this is for a column.
    const rawValue = plainNumber(day.value, day.unit);
    const checked = validateValue({ metric: day.metric, rawValue });
    if (!checked.ok) {
      result.refused.push({ metric: metricLabel(day.metric), detail: checked.detail });
      continue;
    }

    const stored = await storeMeasurement({
      id,
      metric: day.metric,
      rawValue,
      // What the phone called the unit, kept beside what this app stores it in.
      // `Value` comes back in the action's displayed Health unit and never in
      // the HealthKit one, so the arriving unit is a fact worth keeping.
      rawUnit: day.rawUnit === '' ? day.unit : day.rawUnit,
      value: checked.value,
      unit: day.unit,
      timeZone: input.timeZone,
      source: 'apple_health_shortcut',
      measuredAt: day.measuredAt,
      // A watch and a phone measured it. Nobody typed it and nothing estimated
      // it, which is what `measured_device` means everywhere else in this app.
      confidence: 'measured_device',
      sourceRecord: sourceRecordInput,
    });
    if (stored.stored) result.stored += 1;
    else result.alreadyStored += 1;
  }

  return result;
}
