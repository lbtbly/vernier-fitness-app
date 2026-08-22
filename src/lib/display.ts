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
