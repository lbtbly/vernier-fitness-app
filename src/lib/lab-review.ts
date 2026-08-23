/**
 * The review holding, and the one rule that makes screen 05 what it is: A WRITE
 * CARRIES ONE ROW, AND THERE IS NO SHAPE OF REQUEST THAT CARRIES TWO.
 *
 * The panel's table stake was per-item accept, edit and reject on one screen,
 * behind an explicit save, with nothing saving on change. The usual way to
 * build that is a screen with per-row controls and one Save at the bottom, and
 * the usual way is wrong here: a footer that commits eighteen rows is a control
 * that commits eighteen rows however carefully the rows were marked first, and
 * the first time one of the eighteen is wrong the owner gets it anyway.
 *
 * SO THE CONTROL CANNOT EXIST. Not "is not drawn": cannot exist. The wire
 * contract below has no array in it, `rowsInWrite` counts what a body would
 * apply, and `/api/labs/row` refuses anything that is not exactly one. A screen
 * written next year with a Save All button would have to send eighteen requests
 * to do it, and each one would be a separate explicit save of a named row, which
 * is the behaviour the line asks for anyway.
 *
 * WHERE THIS DISAGREES WITH THE SHEET. `.forge/wireframes/05-labs-review.html`
 * frame 1 draws a sticky footer reading "Save 18 rows" and an "Accept all clean"
 * control. DOD F59, PLAN.md's slice 7 and DESIGN.md section 5 all say the
 * opposite, in those words, and three beat one: the footer here counts and never
 * commits, and its one action opens the keep-or-delete question. Recorded in the
 * commit message.
 *
 * Pure, dependency free, shared by the route and by the client component so the
 * two cannot disagree about what a decided row is.
 */

import { type ExtractedRow, isBlocked } from './lab-parse';
import { type AnalyteRule, convertPrinted, parseFrenchNumber } from './labs';

/** What the owner has done with one extracted row. Nothing else is a state. */
export const ROW_DECISIONS = ['waiting', 'saved', 'rejected'] as const;

export type RowDecision = (typeof ROW_DECISIONS)[number];

/**
 * The conversion, worked out BEFORE the row is stored so the review screen can
 * draw it while the owner is deciding.
 *
 * F61 asks for the printed original, the factor and the stored value on one
 * line and for the stored row to keep all three. The stored row keeps them in
 * `raw_value`, `raw_unit`, `conversion_factor`, `value` and `unit`; this is the
 * same three shown to the owner before he commits, because a conversion he only
 * sees afterwards is a conversion he was not asked about.
 *
 * Null when the printed unit already is the stored unit, or names the same
 * quantity: U/L and IU/L are the same number and drawing "x 1" between them
 * would dress a naming choice up as arithmetic.
 */
export type Converted = { value: number; unit: string; factor: number | null };

export function previewConversion(
  analyte: AnalyteRule | null,
  printedValue: string,
  printedUnit: string,
): Converted | null {
  if (!analyte || printedUnit === '') return null;
  const number = parseFrenchNumber(printedValue);
  if (number === null) return null;
  return convertPrinted(analyte, number, printedUnit);
}

/** One row of the review as it is held, decided and rendered. */
export type ReviewRow = ExtractedRow & {
  /** What this row would store, shown while it is still only a candidate. */
  converted: Converted | null;
  decision: RowDecision;
  /** The measurement this row became, once it was saved. Null until then. */
  measurementId: string | null;
  /** When the owner decided, ISO, for the "Saved at 21:01" line. */
  decidedAt: string | null;
  /** True when the owner changed something before saving. Drives the summary count. */
  corrected: boolean;
  /** The unit the owner picked, when he picked one. Empty until he does. */
  chosenUnit: string;
};

export type ReviewDocument = {
  id: string;
  uploadedAt: string;
  fileName: string;
  byteSize: number;
  pageCount: number;
  laboratory: string;
  panelDate: string | null;
  /** `text` when the pdf carried a text layer, `ocr` when a page was recognised. */
  mode: 'text' | 'ocr' | 'manual';
  /** `review`, `validated` or `abandoned`. */
  state: string;
  /** `kept`, `deleted`, or null while the question has not been asked. */
  retention: string | null;
  /** True once the file is off the volume. False for a document that never had one. */
  fileRemoved: boolean;
  hasFile: boolean;
  refusals: number;
  /**
   * The pages those refusals were on, ascending, each page once.
   *
   * The screen used to read this off the census, which is every page in the
   * document, so a one-line refusal on page 2 of three was announced as
   * "Page 1, 2, 3". Empty on a document written before the pages were stored,
   * and the banner has a sentence for that rather than a guess.
   */
  refusalPages: number[];
  census: Array<{ page: number; characters: number; imageOnly: boolean }>;
  rows: ReviewRow[];
};

/**
 * The exact shape of a per-row write. One ordinal, one verb, no array, no
 * "rows", no "all". Written as a type AND checked at runtime, because a type is
 * erased and this is the rule the whole screen rests on.
 */
export type RowWrite = {
  documentId: string;
  ordinal: number;
  action: 'save' | 'reject';
  /** Present only when the owner edited the row before saving it. */
  edit?: {
    printedValue: string;
    printedUnit: string;
    referenceLow: string;
    referenceHigh: string;
    sampleDate: string;
    /** Set when the owner is naming an analyte the catalogue does not hold yet. */
    analyteLabel?: string;
  };
};

/**
 * How many measurements a request body would apply. Anything but 1 is refused.
 *
 * It counts rather than validates, so the refusal can say what it counted. A
 * body carrying `ordinals: [1, 2, 3]` counts three and is refused with the
 * number in it; a body carrying no ordinal at all counts zero and is refused
 * the same way. The route never has to guess what a caller meant.
 */
export function rowsInWrite(body: unknown): number {
  if (typeof body !== 'object' || body === null) return 0;
  const record = body as Record<string, unknown>;
  let counted = typeof record.ordinal === 'number' && Number.isInteger(record.ordinal) ? 1 : 0;
  // Any plural field is counted at its own length and ADDED, never ignored. A
  // field that is ignored is a field somebody adds a loop for later, and the
  // loop writes rows nobody reviewed.
  for (const plural of PLURAL_FIELDS) {
    const value = record[plural];
    if (Array.isArray(value)) counted += value.length;
    else if (value !== undefined) counted += 2;
  }
  if (record.all === true || record.acceptAll === true) counted += 2;
  return counted;
}

/** The field names a batch would arrive under. Named once, checked twice. */
const PLURAL_FIELDS = ['rows', 'ordinals', 'entries', 'values'] as const;

/**
 * Is this body the single-row shape at all, whatever it counts to.
 *
 * The count above answers "how many" and this answers "what kind", and the
 * route asks both. A body carrying `rows: [3]` counts to one and is still a
 * batch request with one element in it: this route does not serve batches, so a
 * batch of one is refused like a batch of twenty-two rather than accepted
 * because it happened to be short. That is the case a Save All control would
 * degrade to the first time somebody tested it with one row selected.
 */
export function isSingleRowShape(body: unknown): boolean {
  if (typeof body !== 'object' || body === null) return false;
  const record = body as Record<string, unknown>;
  if (PLURAL_FIELDS.some((plural) => record[plural] !== undefined)) return false;
  if (record.all !== undefined || record.acceptAll !== undefined) return false;
  return typeof record.ordinal === 'number' && Number.isInteger(record.ordinal);
}

/** Can this row be saved as it stands, or does it need a decision first. */
export function canSave(row: ReviewRow): boolean {
  if (row.decision !== 'waiting') return false;
  if (row.printedUnit === '' && row.chosenUnit === '') return false;
  return !isBlocked(row.flags);
}

/** The counts the review footer and the summary screen both read. One source. */
export type ReviewTally = {
  total: number;
  saved: number;
  rejected: number;
  waiting: number;
  blocked: number;
  corrected: number;
  refused: number;
};

export function tally(document: ReviewDocument): ReviewTally {
  const rows = document.rows;
  return {
    total: rows.length,
    saved: rows.filter((row) => row.decision === 'saved').length,
    rejected: rows.filter((row) => row.decision === 'rejected').length,
    waiting: rows.filter((row) => row.decision === 'waiting').length,
    blocked: rows.filter((row) => row.decision === 'waiting' && isBlocked(row.flags)).length,
    corrected: rows.filter((row) => row.decision === 'saved' && row.corrected).length,
    refused: document.refusals,
  };
}

/**
 * The order screen 05 draws rows in: what needs the owner's eyes first, then
 * what read cleanly, then what he has already decided.
 *
 * Attention is the scarce thing on this screen. Twenty-two rows arrive and
 * three of them are the reason he opened it, so the three sit at the top under
 * their own count and the nineteen sit below under theirs.
 */
export function reviewSections(document: ReviewDocument): {
  needsEyes: ReviewRow[];
  readCleanly: ReviewRow[];
  decided: ReviewRow[];
} {
  const needsEyes: ReviewRow[] = [];
  const readCleanly: ReviewRow[] = [];
  const decided: ReviewRow[] = [];
  for (const row of document.rows) {
    if (row.decision !== 'waiting') decided.push(row);
    else if (isBlocked(row.flags) || row.flags.includes('new_analyte')) needsEyes.push(row);
    else readCleanly.push(row);
  }
  return { needsEyes, readCleanly, decided };
}
