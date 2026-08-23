import { formatNumber } from '@/lib/format';
import type { MeasurementView } from '@/lib/measurement-view';
import { strings } from '@/lib/strings';

/**
 * A stored value, ready to render. The number and its unit come back apart so a
 * card can set them in different type, which is what DESIGN.md draws: the
 * number at 34 px and the unit at 15 px beside it.
 *
 * No component composes "98.5 cm" by hand. The unit comes from the catalogue
 * and the precision from the unit, so the same measurement reads the same on
 * Today, on the value sheet and on the source screen.
 */
export type ValueLabel = { number: string; unit: string };

const UNITS = strings.units as Record<string, string>;

export function valueLabel(view: {
  value: number | null;
  rawValue: string;
  unit: string;
}): ValueLabel {
  if (view.unit === 'text') return { number: view.rawValue, unit: '' };
  if (view.value === null) return { number: view.rawValue, unit: UNITS[view.unit] ?? view.unit };
  return {
    number: formatNumber(view.value, view.unit),
    unit: UNITS[view.unit] ?? view.unit,
  };
}

/** "98.5 cm", "4 of 5", or the note itself. One string, for a row that has no room for two. */
export function valueLine(view: { value: number | null; rawValue: string; unit: string }): string {
  const label = valueLabel(view);
  return label.unit === '' ? label.number : `${label.number} ${label.unit}`;
}

const UNIT_NAMES = strings.unitNames as Record<string, string>;

/**
 * The unit as prose names it. `strings.units` holds the suffix a value prints
 * beside a number, and the two are not the same word: a rating prints "of 5"
 * and is asked for in points. Interpolating the suffix put "The number it
 * should be, in of 5" under every rating on the value sheet.
 */
export function unitName(unit: string): string {
  return UNIT_NAMES[unit] ?? UNITS[unit] ?? unit;
}

const METRIC_LABELS = strings.metrics as Record<string, string>;

export function metricLabel(metric: string): string {
  return METRIC_LABELS[metric] ?? metric;
}

const SOURCE_LABELS = strings.provenance.sources as Record<string, string>;

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

const CONFIDENCE_LABELS = strings.provenance.confidences as Record<string, string>;

export function confidenceLabel(confidence: string): string {
  return CONFIDENCE_LABELS[confidence] ?? confidence;
}

const DEDUP_LABELS = strings.provenance.dedupDecisions as Record<string, string>;

export function dedupLabel(decision: string): string {
  return DEDUP_LABELS[decision] ?? decision;
}

const INTEGRATION_STATE_LABELS = strings.settings.integrationStates as Record<string, string>;

/**
 * The words for an integration's state. `src/db/integrations.ts` returns one of
 * three tokens and this is the only place they become English, the same way a
 * source, a confidence and a deduplication decision do above.
 */
export function integrationStateLabel(state: string): string {
  return INTEGRATION_STATE_LABELS[state] ?? state;
}

const SESSION_METHOD_LABELS = strings.settings.sessionMethods as Record<string, string>;

/** How the live session was opened, in words rather than in the column's token. */
export function sessionMethodLabel(method: string): string {
  return SESSION_METHOD_LABELS[method] ?? method;
}

const DEVICE_TYPE_LABELS = strings.settings.passkeyDeviceTypes as Record<string, string>;

/** What the authenticator reported, in words rather than in its own camel case. */
export function deviceTypeLabel(deviceType: string): string {
  return DEVICE_TYPE_LABELS[deviceType] ?? deviceType;
}

const KIND_LABELS = strings.provenance.sourceKinds as Record<string, string>;

export function sourceKindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}

const FIELD_LABELS = strings.provenance.fields as Record<string, string>;

export function sourceFieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

/**
 * The laboratory line: printed original, factor, stored value, on one line and
 * in that order. A converted value never appears alone, which is the rule that
 * stops a mmol/L number being read as if the sheet had printed it.
 */
export function conversionLine(view: MeasurementView): string | null {
  if (view.conversionFactor === null) return null;
  return strings.provenance.conversionLine(
    `${view.rawValue} ${UNITS[view.rawUnit] ?? view.rawUnit}`,
    String(view.conversionFactor),
    valueLine(view),
  );
}

/**
 * Minutes asleep, as hours and minutes. "7 h 04".
 *
 * Sleep is stored in minutes and rendered here, in one place, so the stored row
 * can be summed and averaged without anybody parsing a duration back out of a
 * string. A night the watch did not record has no row at all and never reaches
 * this function, because zero minutes is a claim about a night rather than the
 * absence of one.
 */
export function sleepLabel(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  return strings.signals.sleepDuration(Math.floor(whole / 60), String(whole % 60).padStart(2, '0'));
}

const WITHINGS_STATE_LABELS = strings.withings.states as Record<string, string>;

/**
 * The Withings state, in words. Five settings on a column and one place they
 * become English, exactly as a source, a confidence and an integration state
 * do above. A chip printing the column value is the defect C6 was rewritten
 * over, and this is the door that keeps it shut.
 */
export function withingsStateLabel(state: string): string {
  return WITHINGS_STATE_LABELS[state] ?? state;
}

const WITHINGS_CAUSES = strings.withings.causes as Record<string, string>;

/**
 * Why the connection is not working, in the owner's language, chosen from the
 * token the connection row stores.
 *
 * A cause names what stopped and what to do about it. A status code alone names
 * neither, and the panel's first finding was that silence is the failure mode:
 * the operator found a dead token by noticing a flat gap four days later, which
 * is the worst possible signal because he was not looking for it.
 */
export function withingsCauseLine(cause: string | null): string | null {
  if (!cause) return null;
  return WITHINGS_CAUSES[cause] ?? null;
}

const MOVEMENT_COPY = strings.movement as Record<string, { name: string; cue: string }>;

/**
 * A movement's name and its cue text, from the catalogue.
 *
 * `src/lib/catalogue.ts` and the `movement` table both hold `nameKey` and
 * `cueKey` rather than words, so this is the one place either becomes English.
 * Same shape as `metricLabel` and `sourceLabel` above, for the same reason: a
 * column value must never reach a screen as a column value.
 */
export function movementName(id: string): string {
  return MOVEMENT_COPY[id]?.name ?? id;
}

export function movementCue(id: string): string {
  return MOVEMENT_COPY[id]?.cue ?? '';
}

const MUSCLE_LABELS = strings.muscles as Record<string, string>;

export function muscleLabel(muscle: string): string {
  return MUSCLE_LABELS[muscle] ?? muscle;
}

const EQUIPMENT_LABELS = strings.equipment as Record<string, string>;

export function equipmentLabel(item: string): string {
  return EQUIPMENT_LABELS[item] ?? item;
}

/**
 * What one set of a movement asks for, in its own unit: reps, a hold in
 * seconds, or minutes of work. One function, so the catalogue screen, the week
 * card and the open set all read the same words.
 */
export function targetLabel(unit: string, target: number): string {
  if (unit === 'second') return strings.player.seconds(target);
  if (unit === 'minute') return strings.player.minutes(target);
  return strings.player.reps(target);
}

const CALENDAR_STATE_LABELS = strings.calendar.states as Record<string, string>;

/**
 * The Google Calendar state, in words. Same door as `withingsStateLabel` above
 * and for the same reason: five settings on a column, one place they become
 * English, and no chip anywhere printing the token the database stores.
 */
export function calendarStateLabel(state: string): string {
  return CALENDAR_STATE_LABELS[state] ?? state;
}

const CALENDAR_CAUSES = strings.calendar.causes as Record<string, string>;

/**
 * Why the calendar connection is not working, chosen from the token on the
 * connection row.
 *
 * `invalid_grant`, `deleted_client` and `invalid_client` are three different
 * sentences here rather than one, because the owner acts differently on each:
 * the first is a reconnect, the second needs the Cloud console, and the third
 * needs the environment file. A single "authentication failed" would send him to
 * the wrong one two times in three.
 */
export function calendarCauseLine(cause: string | null): string | null {
  if (!cause) return null;
  return CALENDAR_CAUSES[cause] ?? null;
}

const CALENDAR_OUTCOMES = strings.calendar.outcomes as Record<string, string>;

/** What one confirmed row ended as: written, not written, held back or undone. */
export function calendarOutcomeLabel(outcome: string): string {
  return CALENDAR_OUTCOMES[outcome] ?? outcome;
}

const CALENDAR_VERBS: Record<string, string> = {
  added: strings.calendar.groupAdded,
  moved: strings.calendar.groupMoved,
  removed: strings.calendar.groupRemoved,
  undo: strings.calendar.undone,
};

/** The verb of a diff row or a log line, in words rather than as the stored token. */
export function calendarVerbLabel(verb: string): string {
  return CALENDAR_VERBS[verb] ?? verb;
}
