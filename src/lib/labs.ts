/**
 * The analyte catalogue as rules, and the unit arithmetic that goes with it.
 *
 * Everything a laboratory row has to survive before it can be stored is decided
 * here: which analyte a printed label names, which printed units are legal for
 * it, what factor turns a printed number into the stored one, and what band of
 * values is physically possible. Pure, no database, no clock, no request, so
 * the unit suite grades the decision itself.
 *
 * The thirteen built-in analytes are DATA, not code. Their rules are here and
 * their rows are seeded into `lab_analyte` by drizzle/pending/07-blood.sql, then
 * read back at request time, which is what lets a fourteenth be added through
 * the interface with no source file modified. The constant below exists so the
 * seed, the tests and the compliance check all read one list rather than three
 * hand-kept copies, and so a checker can walk it with no stack running.
 *
 * NO LABEL LIVES HERE. Every one of the thirteen names is a string a person
 * reads, so it has a catalogue key in `strings.metrics` like every other word
 * this product authored, and a label the owner types for a fourteenth is his
 * data and comes out of the database. This module holds the mechanical facts
 * and nothing that can be read aloud.
 *
 * Dependency free and free of TypeScript that needs more than type stripping,
 * so `scripts/compliance.mjs` can import it straight from Node the way
 * `scripts/strings.mjs` imports `src/lib/strings.ts`.
 */

/** One printed unit a laboratory may use, and what it takes to reach the stored one. */
export type PrintedUnit = {
  unit: string;
  /**
   * Multiply the printed number by this to reach the stored unit. Exactly 1
   * means the two symbols name the same quantity, which is a choice recorded
   * and not a conversion performed: U/L and IU/L are the same number.
   */
  factor: number;
};

/** The mechanical half of an analyte: everything about it that is not a word. */
export type AnalyteRule = {
  key: string;
  /** The unit every stored row of this analyte carries. */
  unit: string;
  printed: PrintedUnit[];
  /** The physically possible band, in the stored unit. Wider than any reference interval. */
  low: number;
  high: number;
  /** General adult reference range, in the stored unit. Either bound may be absent. */
  referenceLow: number | null;
  referenceHigh: number | null;
  /** A public page a person can open. Cited in every explanation, never paraphrased away. */
  sourceUrl: string;
  /** How a laboratory prints this analyte's name, already normalised. */
  aliases: string[];
};

/** A catalogue row: the rule, plus the words that go with it and where they came from. */
export type Analyte = AnalyteRule & {
  /** From `strings.metrics` for the thirteen, from the database for a fourteenth. */
  label: string;
  /** True on the thirteen this repository seeded. False on anything the owner added. */
  builtIn: boolean;
};

/**
 * MedlinePlus is free, public, has no paywall and no login, names its publisher
 * and holds a page per test. A URL is a shape rather than a word, so it sits
 * here; the publisher's name is copy and sits in the catalogue.
 */
const MEDLINE = 'https://medlineplus.gov/lab-tests/';

/**
 * The thirteen F57 names, in the order the review screen and the trend list
 * draw them: sugar, then the lipid panel, then the liver, then the kidney, then
 * inflammation and iron.
 *
 * `creatinine` holds F57's "creatinine or eGFR" slot. Creatinine is what a
 * French sheet always prints; eGFR is computed from it by the laboratory and
 * arrives as a second line often enough that it is a fair fourteenth analyte to
 * add through the interface, which is what F64 asks for.
 *
 * Reference ranges are general adult ranges from the cited public source. They
 * are context and never a verdict: the interval printed on the owner's own
 * sheet is the one that applies to his result, every explanation says so, and
 * nothing in this product reads a stored number against either bound.
 */
export const BUILT_IN_ANALYTES: AnalyteRule[] = [
  {
    key: 'fasting_glucose',
    unit: 'mmol/L',
    printed: [
      { unit: 'mmol/L', factor: 1 },
      { unit: 'g/L', factor: 5.551 },
      { unit: 'mg/dL', factor: 0.05551 },
    ],
    low: 1,
    high: 40,
    referenceLow: 3.9,
    referenceHigh: 5.5,
    sourceUrl: MEDLINE,
    aliases: ['glycemie a jeun', 'glycemie', 'glucose a jeun', 'glucose', 'fasting glucose'],
  },
  {
    key: 'hba1c',
    unit: '%',
    printed: [{ unit: '%', factor: 1 }],
    low: 2,
    high: 20,
    referenceLow: 4,
    referenceHigh: 5.6,
    sourceUrl: MEDLINE,
    aliases: ['hemoglobine glyquee hba1c', 'hemoglobine glyquee', 'hemoglobine a1c', 'hba1c', 'a1c'],
  },
  {
    key: 'total_cholesterol',
    unit: 'mmol/L',
    printed: [
      { unit: 'mmol/L', factor: 1 },
      { unit: 'g/L', factor: 2.586 },
      { unit: 'mg/dL', factor: 0.02586 },
    ],
    low: 0.5,
    high: 20,
    referenceLow: null,
    referenceHigh: 5,
    sourceUrl: MEDLINE,
    aliases: ['cholesterol total', 'cholesterol totaux', 'total cholesterol', 'chol total'],
  },
  {
    key: 'hdl_cholesterol',
    unit: 'mmol/L',
    printed: [
      { unit: 'mmol/L', factor: 1 },
      { unit: 'g/L', factor: 2.586 },
      { unit: 'mg/dL', factor: 0.02586 },
    ],
    low: 0.1,
    high: 6,
    referenceLow: 1,
    referenceHigh: null,
    sourceUrl: MEDLINE,
    aliases: ['cholesterol hdl', 'hdl cholesterol', 'hdl'],
  },
  {
    key: 'ldl_cholesterol',
    unit: 'mmol/L',
    printed: [
      { unit: 'mmol/L', factor: 1 },
      { unit: 'g/L', factor: 2.586 },
      { unit: 'mg/dL', factor: 0.02586 },
    ],
    low: 0,
    high: 30,
    referenceLow: null,
    referenceHigh: 3,
    sourceUrl: MEDLINE,
    aliases: ['cholesterol ldl calcule', 'cholesterol ldl', 'ldl cholesterol', 'ldl'],
  },
  {
    key: 'non_hdl_cholesterol',
    unit: 'mmol/L',
    printed: [
      { unit: 'mmol/L', factor: 1 },
      { unit: 'g/L', factor: 2.586 },
      { unit: 'mg/dL', factor: 0.02586 },
    ],
    low: 0,
    high: 20,
    referenceLow: null,
    referenceHigh: 3.8,
    sourceUrl: MEDLINE,
    aliases: ['cholesterol non hdl', 'non hdl cholesterol', 'non hdl'],
  },
  {
    key: 'triglycerides',
    unit: 'mmol/L',
    printed: [
      { unit: 'mmol/L', factor: 1 },
      { unit: 'g/L', factor: 1.129 },
      { unit: 'mg/dL', factor: 0.01129 },
    ],
    low: 0.1,
    high: 40,
    referenceLow: null,
    referenceHigh: 1.7,
    sourceUrl: MEDLINE,
    aliases: ['triglycerides', 'triglyceride'],
  },
  {
    key: 'alt',
    unit: 'U/L',
    printed: [
      { unit: 'U/L', factor: 1 },
      { unit: 'IU/L', factor: 1 },
      { unit: 'UI/L', factor: 1 },
      { unit: 'µkat/L', factor: 60 },
    ],
    low: 1,
    high: 5000,
    referenceLow: 10,
    referenceHigh: 40,
    sourceUrl: MEDLINE,
    aliases: ['transaminases alat tgp', 'alat tgp', 'alat', 'alt sgpt', 'sgpt', 'alt', 'tgp'],
  },
  {
    key: 'ast',
    unit: 'U/L',
    printed: [
      { unit: 'U/L', factor: 1 },
      { unit: 'IU/L', factor: 1 },
      { unit: 'UI/L', factor: 1 },
      { unit: 'µkat/L', factor: 60 },
    ],
    low: 1,
    high: 5000,
    referenceLow: 10,
    referenceHigh: 40,
    sourceUrl: MEDLINE,
    aliases: ['transaminases asat tgo', 'asat tgo', 'asat', 'ast sgot', 'sgot', 'ast', 'tgo'],
  },
  {
    key: 'ggt',
    unit: 'U/L',
    printed: [
      { unit: 'U/L', factor: 1 },
      { unit: 'IU/L', factor: 1 },
      { unit: 'UI/L', factor: 1 },
      { unit: 'µkat/L', factor: 60 },
    ],
    low: 1,
    high: 5000,
    referenceLow: 12,
    referenceHigh: 64,
    sourceUrl: MEDLINE,
    aliases: ['gamma glutamyl transferase', 'gamma gt', 'g g t', 'ggt'],
  },
  {
    key: 'creatinine',
    unit: 'µmol/L',
    printed: [
      { unit: 'µmol/L', factor: 1 },
      { unit: 'mg/L', factor: 8.84 },
      { unit: 'mg/dL', factor: 88.4 },
    ],
    low: 10,
    high: 2000,
    referenceLow: 62,
    referenceHigh: 106,
    sourceUrl: MEDLINE,
    aliases: ['creatininemie', 'creatinine serique', 'creatinine'],
  },
  {
    key: 'crp',
    unit: 'mg/L',
    printed: [
      { unit: 'mg/L', factor: 1 },
      { unit: 'mg/dL', factor: 10 },
    ],
    low: 0,
    high: 500,
    referenceLow: null,
    referenceHigh: 5,
    sourceUrl: MEDLINE,
    aliases: ['proteine c reactive crp', 'proteine c reactive', 'c reactive protein', 'crp'],
  },
  {
    key: 'ferritin',
    unit: 'µg/L',
    printed: [
      { unit: 'µg/L', factor: 1 },
      { unit: 'ng/mL', factor: 1 },
      { unit: 'µg/dL', factor: 10 },
    ],
    low: 1,
    high: 20000,
    referenceLow: 30,
    referenceHigh: 400,
    sourceUrl: MEDLINE,
    aliases: ['ferritinemie', 'ferritine', 'ferritin'],
  },
];

/** The thirteen keys, in catalogue order. F64 counts trends against this list. */
export const BUILT_IN_ANALYTE_KEYS = BUILT_IN_ANALYTES.map((analyte) => analyte.key);

/**
 * Blood pressure has no analyte, no key and no row here, and that is the point.
 * The only place it is ever named is the labs review, as a refusal, and the
 * refusal never prints the value it refused. DESIGN.md section 4 is explicit,
 * and the brief calls it a hard constraint.
 */
export const REFUSED_AT_EXTRACTION = ['blood_pressure'] as const;

export type RefusalReason = (typeof REFUSED_AT_EXTRACTION)[number];

/**
 * A label as this module compares labels: lower case, unaccented, and every run
 * of anything that is not a letter or a digit collapsed to one space.
 *
 * "G.G.T. ....." becomes "g g t", "GAMMA-GT" becomes "gamma gt", and
 * "Cholesterol total" with its accents becomes "cholesterol total". A
 * laboratory prints a name differently every time it changes its report
 * template, and the alias table has to survive that without being rewritten.
 */
export function normaliseLabel(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Which analyte a printed label names, or null.
 *
 * Longest alias first, and the label has to START with it. Both halves matter:
 * "cholesterol" is a prefix of "cholesterol total" and "hdl" is inside
 * "non hdl cholesterol", so a shortest-first or a contains-anywhere rule files
 * a total cholesterol under HDL and nobody notices until the trend is wrong.
 */
export function analyteOfLabel<T extends { aliases: string[] }>(
  label: string,
  catalogue: T[],
): T | null {
  const normalised = normaliseLabel(label);
  if (normalised === '') return null;
  let best: { analyte: T; length: number } | null = null;
  for (const analyte of catalogue) {
    for (const alias of analyte.aliases) {
      if (normalised !== alias && !normalised.startsWith(`${alias} `)) continue;
      if (!best || alias.length > best.length) best = { analyte, length: alias.length };
    }
  }
  return best ? best.analyte : null;
}

/**
 * A number as a French laboratory prints it. "1,44" is one and forty-four
 * hundredths, not a thousand and forty-four, and the CIQUAL note in
 * .forge/research/nutrition-data.md records the same fact about every French
 * data file this build touches: the decimal separator is a comma.
 *
 * A thousands separator on a French sheet is a space or a narrow no-break
 * space, never a comma, so a comma is always the decimal point here.
 */
export function parseFrenchNumber(text: string): number | null {
  const cleaned = text.replace(/[  \s]/g, '').replace(',', '.').trim();
  if (cleaned === '' || !/^[+-]?\d*\.?\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/**
 * A censored result: "< 0,5", "> 1200", "traces", "inferieur a 1".
 *
 * A laboratory writes one when the assay could not resolve the number, which is
 * common for CRP and for anything near a detection limit. It is NOT a number
 * and it is never stored as one: the CIQUAL note settled the same question for
 * food data and the answer here is stricter, because `measurement` refuses
 * DELETE and a guessed zero would be permanent. It arrives flagged and blocked,
 * and the owner decides.
 */
export function isCensored(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed === '') return false;
  if (/^[<>]/.test(trimmed)) return true;
  const normalised = normaliseLabel(trimmed);
  if (/^(traces?|nd|non detecte|non detectable|indetectable)$/.test(normalised)) return true;
  return /^(inferieur|superieur|moins|plus) a /.test(normalised);
}

/** Every printed unit an analyte accepts, in the order the unit picker draws them. */
export function printedUnitsOf(analyte: AnalyteRule): string[] {
  return analyte.printed.map((printed) => printed.unit);
}

export type Conversion = {
  /** The number that will be stored, in the analyte's own unit. */
  value: number;
  unit: string;
  /** Null when the printed unit already is the stored unit, or names the same quantity. */
  factor: number | null;
};

/**
 * The printed number in the stored unit, with the factor that got it there.
 *
 * A factor of exactly 1 is recorded as null rather than as 1. U/L and IU/L are
 * the same number and the sheet chose a symbol; rendering "62 U/L x 1 62 U/L"
 * would dress a naming choice up as arithmetic, and `src/lib/display.ts`
 * already reads a null factor as "no conversion line". What the owner picked is
 * still stored, in `raw_unit`, permanently.
 */
export function convertPrinted(
  analyte: AnalyteRule,
  value: number,
  printedUnit: string,
): Conversion | null {
  const printed = analyte.printed.find((entry) => entry.unit === printedUnit);
  if (!printed) return null;
  if (printed.factor === 1) return { value, unit: analyte.unit, factor: null };
  // Six significant figures. 0.97 x 5.551 is 5.384470000000001 in binary
  // floating point if it is left alone, and a stored value with a tail of noise
  // on it is a number nobody can check against the sheet by hand.
  const converted = Number((value * printed.factor).toPrecision(6));
  return { value: converted, unit: analyte.unit, factor: printed.factor };
}

/** What was wrong with a laboratory value, as a case a caller renders. Never a sentence. */
export type LabValueProblem =
  | 'unknownAnalyte'
  | 'blank'
  | 'censored'
  | 'notANumber'
  | 'unknownUnit'
  | 'range';

export type CheckedLabValue =
  | { ok: true; value: number; unit: string; factor: number | null }
  | { ok: false; problem: LabValueProblem };

/**
 * Is this a laboratory value Vernier will store, and what is the number if so.
 *
 * The same shape as `checkValue` in src/lib/provenance.ts and for the same
 * reason: `measurement` refuses DELETE, so a value this function lets past is
 * permanent, and a validation gap in an append-only store is not a bug anybody
 * can clean up afterwards. The band comes off the analyte row rather than out
 * of a constant here, which is what lets a fourteenth analyte carry its own.
 */
export function checkLabValue(
  analyte: AnalyteRule | null,
  rawValue: string,
  printedUnit: string,
): CheckedLabValue {
  if (!analyte) return { ok: false, problem: 'unknownAnalyte' };
  const raw = rawValue.trim();
  if (raw === '') return { ok: false, problem: 'blank' };
  if (isCensored(raw)) return { ok: false, problem: 'censored' };
  const number = parseFrenchNumber(raw);
  if (number === null) return { ok: false, problem: 'notANumber' };
  const converted = convertPrinted(analyte, number, printedUnit);
  if (!converted) return { ok: false, problem: 'unknownUnit' };
  if (converted.value < analyte.low || converted.value > analyte.high) {
    return { ok: false, problem: 'range' };
  }
  return { ok: true, value: converted.value, unit: converted.unit, factor: converted.factor };
}

/**
 * A key for an analyte the owner adds by hand, derived from the name he typed.
 *
 * Stable, lower case, and prefixed, so nothing he types can collide with one of
 * the thirteen or with a body metric: "Apolipoprotein B" becomes
 * `added_apolipoprotein_b` and never `weight`.
 */
export function keyForAddedAnalyte(label: string): string {
  const slug = normaliseLabel(label).replace(/ +/g, '_');
  return slug === '' ? '' : `added_${slug}`;
}

/**
 * The copy an explanation is tiled out of, handed in rather than imported.
 *
 * `src/lib/strings.ts` holds these under `labs.explanation` and the app passes
 * that subtree straight in. It is an argument so this module can stay
 * dependency free, which is what lets `scripts/compliance.mjs` import it from
 * plain Node and grade the SHIPPED renderer rather than a copy of it. A checker
 * that grades its own paraphrase of the code is instance number two of this
 * run's failure class.
 */
export type ExplanationCopy = {
  between: (label: string, low: string, high: string, unit: string) => string;
  below: (label: string, high: string, unit: string) => string;
  above: (label: string, low: string, unit: string) => string;
  unstated: (label: string) => string;
  laboratoryWins: string;
  storesNotReads: string;
  professional: string;
  source: (url: string) => string;
};

/**
 * What Vernier says about an analyte, in four parts and never in five.
 *
 * R2 is the reason this function has the shape it has. General reference-range
 * context, the laboratory's own interval named as the one that applies, a
 * statement that this product stores and charts rather than reads, and an
 * invitation to a professional, plus the public source. Nothing here is about
 * the owner's number: no branch reads a stored value, none of the four parts
 * takes a result as an argument, and there is no fifth part for a verdict to
 * live in. MDCG 2025-4 and the June 2025 revision of MDCG 2019-11 make the
 * stated intended purpose the classification test, and this is where the stated
 * intended purpose is enforced by construction rather than by review.
 */
export type Explanation = {
  context: string;
  laboratory: string;
  stores: string;
  invitation: string;
  source: string;
};

export function renderExplanation(
  analyte: AnalyteRule,
  label: string,
  format: (value: number, unit: string) => string,
  copy: ExplanationCopy,
): Explanation {
  const unit = analyte.unit;
  let context: string;
  if (analyte.referenceLow !== null && analyte.referenceHigh !== null) {
    context = copy.between(
      label,
      format(analyte.referenceLow, unit),
      format(analyte.referenceHigh, unit),
      unit,
    );
  } else if (analyte.referenceHigh !== null) {
    context = copy.below(label, format(analyte.referenceHigh, unit), unit);
  } else if (analyte.referenceLow !== null) {
    context = copy.above(label, format(analyte.referenceLow, unit), unit);
  } else {
    context = copy.unstated(label);
  }
  return {
    context,
    laboratory: copy.laboratoryWins,
    stores: copy.storesNotReads,
    invitation: copy.professional,
    source: copy.source(analyte.sourceUrl),
  };
}
