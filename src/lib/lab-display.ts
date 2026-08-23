import { formatNumber } from '@/lib/format';
import {
  type Analyte,
  type AnalyteRule,
  type Explanation,
  type LabValueProblem,
  renderExplanation,
} from '@/lib/labs';
import { strings } from '@/lib/strings';

/**
 * Where an analyte's words come from, and the one place that decision is made.
 *
 * A seeded analyte's name is copy this repository wrote, so it has a key in
 * `strings.metrics` and it is read from there. An analyte the owner added while
 * reviewing a panel carries the name HE typed, which is his data, and it is read
 * off the row. C6 says text the product did not author is outside the line and
 * that the excuse has to be established by provenance rather than by looking at
 * the words, and `built_in` is that provenance: one boolean, set by the seed and
 * by nothing else, exactly as `seed` works on `measurement`.
 */
const METRIC_LABELS = strings.metrics as Record<string, string>;

export function analyteLabel(analyte: { key: string; label: string }): string {
  return METRIC_LABELS[analyte.key] ?? analyte.label;
}

/** The same answer for a bare metric key, for a screen that has no catalogue row. */
export function analyteLabelOf(key: string, fallback: string): string {
  return METRIC_LABELS[key] ?? fallback;
}

/**
 * The units this analyte accepts, as the picker draws them: the symbol from the
 * catalogue, never the raw column value.
 */
const UNITS = strings.units as Record<string, string>;

export function unitSymbol(unit: string): string {
  return UNITS[unit] ?? unit;
}

/**
 * R2's explanation for one analyte, rendered from the catalogue templates and
 * the analyte's own reference range.
 *
 * Thin on purpose. The renderer is in `src/lib/labs.ts` so it stays importable
 * by a plain Node script, which is what lets `npm run compliance` grade THE
 * SHIPPED FUNCTION rather than a paraphrase of it. A checker that grades its own
 * copy of the code is instance number two of this run's failure class, and it
 * cost five verifications.
 */
export function explanationOf(analyte: Analyte | AnalyteRule, label: string): Explanation {
  return renderExplanation(analyte, label, formatNumber, strings.labs.explanation);
}

/**
 * The reference interval as one line, in the three shapes a sheet prints.
 *
 * A missing bound is drawn as a missing bound. "< 5" never becomes "0 to 5",
 * because a lower bound the laboratory did not print is a number this app would
 * have invented, and inventing one on a screen the owner reads as his own data
 * is the smoothing the panel named as the failure mode.
 */
export function referenceLine(
  low: number | null,
  high: number | null,
  unit: string,
): string | null {
  if (low !== null && high !== null) {
    return strings.labs.referenceRange(formatNumber(low, unit), formatNumber(high, unit));
  }
  if (high !== null) return strings.labs.referenceBelow(formatNumber(high, unit));
  if (low !== null) return strings.labs.referenceAbove(formatNumber(low, unit));
  return null;
}

/** Why a row is waiting, in the owner's language. One sentence per flag, in order. */
const FLAG_SENTENCES = strings.labs.flags as Record<string, string>;

export function flagSentences(flags: string[]): string[] {
  return flags.map((flag) => FLAG_SENTENCES[flag]).filter((sentence): sentence is string => Boolean(sentence));
}

/**
 * Every unit symbol this product can render with a key.
 *
 * It is the whole rule for an analyte the owner adds: he may pick any unit the
 * catalogue already names and no other. Not a restriction for its own sake. C6
 * says every string a person reads has a key, and a unit typed off a sheet into
 * a free field is a word on a screen with no key, which is the line's second
 * clause failing quietly the day he uses it.
 */
export function knownUnits(): string[] {
  return Object.keys(UNITS).filter((unit) => unit !== 'text' && UNITS[unit] !== '');
}

/**
 * Why a laboratory value was refused, in the owner's words, from the one rule
 * that refuses it.
 *
 * The same shape as `src/lib/value-refusal.ts` and for the same reason: the
 * check lives beside the analyte band in `src/lib/labs.ts` and says what went
 * wrong as a case rather than as a sentence, and this is the single place that
 * case becomes English. Two places would be two answers to one question.
 */
export function labValueRefusal(
  problem: LabValueProblem,
  context: { label: string; unit: string; printedUnit: string; low: number; high: number },
): string {
  const line = strings.api.labs;
  switch (problem) {
    case 'unknownAnalyte':
      return line.unknownAnalyte;
    case 'blank':
      return line.blank;
    case 'censored':
      return line.censoredDetail;
    case 'notANumber':
      return line.notANumber(context.label);
    case 'unknownUnit':
      return line.unknownUnit(unitSymbol(context.printedUnit));
    case 'range':
      return line.outOfBand(
        context.label,
        formatNumber(context.low, context.unit),
        formatNumber(context.high, context.unit),
        unitSymbol(context.unit),
      );
  }
}
