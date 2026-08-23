import { createDocument, readAnalytes } from '@/db/labs';
import { csrfFailure } from '@/lib/csrf';
import { ok, refuse, sessionOrRefusal } from '@/lib/gate';
import { knownUnits } from '@/lib/lab-display';
import { CONFIDENCE_THRESHOLD, type RowFlag, findDate } from '@/lib/lab-parse';
import { type ReviewRow, previewConversion } from '@/lib/lab-review';
import { newDocumentId } from '@/lib/lab-storage';
import { isCensored, parseFrenchNumber } from '@/lib/labs';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';

/**
 * The manual panel, which lands on the same review screen as a PDF does.
 *
 * F57 asks for a structured manual form covering thirteen analytes, and the
 * obvious build is a form with thirteen rows and one Save. That build is the
 * batch commit F59 forbids wearing a different hat, so this route does not
 * store: it BUILDS A REVIEW. The typed values become the same candidate rows a
 * parsed PDF produces, on the same screen, and each one is still saved on its
 * own control through /api/labs/row.
 *
 * The answer says `stored: 0` out loud for the same reason the upload route
 * does. A test can read the number rather than infer it from a row count taken
 * afterwards, and a future change that started writing here would have to change
 * that number and would fail the test that reads it.
 *
 * Confidence is 1 and the source is `manual`: the owner read the sheet with his
 * own eyes and typed what it said. That is the highest confidence this product
 * has for a laboratory value and it is still not stored until he accepts the
 * row, because typing a number into a form is not the same act as deciding it
 * belongs in a table that refuses DELETE.
 */

type Entry = {
  analyte?: unknown;
  printedValue?: unknown;
  printedUnit?: unknown;
  referenceLow?: unknown;
  referenceHigh?: unknown;
};

type Body = {
  sampleDate?: unknown;
  laboratory?: unknown;
  entries?: unknown;
};

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export async function POST(request: Request) {
  try {
    return await handle(request);
  } catch (error) {
    console.error(`[vernier] /api/labs/manual failed: ${(error as Error).message}`);
    return refuse(500, strings.api.labs.failed, strings.api.labs.failedDetail);
  }
}

async function handle(request: Request) {
  const csrf = await csrfFailure(request);
  if (csrf) return csrf.response;
  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return refuse(400, strings.api.jsonBody, strings.api.labs.failedDetail);
  }

  const catalogue = await readAnalytes();
  const units = knownUnits();
  const entries = Array.isArray(body.entries) ? (body.entries as Entry[]) : [];

  const dayKey = findDate(text(body.sampleDate)) ?? text(body.sampleDate).slice(0, 10);
  const sampleDate = /^\d{4}-\d{2}-\d{2}$/.test(dayKey) ? dayKey : null;

  const rows: ReviewRow[] = [];
  for (const entry of entries) {
    const printedValue = text(entry.printedValue);
    if (printedValue === '') continue;
    const analyteKey = text(entry.analyte);
    const analyte = catalogue.find((candidate) => candidate.key === analyteKey) ?? null;
    const printedUnit = text(entry.printedUnit) || (analyte ? analyte.unit : '');
    const low = parseFrenchNumber(text(entry.referenceLow));
    const high = parseFrenchNumber(text(entry.referenceHigh));

    const flags: RowFlag[] = [];
    if (!analyte) flags.push('new_analyte');
    if (isCensored(printedValue)) flags.push('value_censored');
    else if (parseFrenchNumber(printedValue) === null) flags.push('value_ambiguous');
    if (printedUnit === '') flags.push('unit_missing');
    else if (
      analyte
        ? !analyte.printed.some((printed) => printed.unit === printedUnit)
        : !units.includes(printedUnit)
    ) {
      flags.push('unit_unknown');
    }
    if (low === null && high === null) flags.push('reference_missing');
    if (sampleDate === null) flags.push('date_missing');
    // A typed row that carries a flag is still blocked, and the same edit screen
    // is where it is unblocked. One rule for a typed panel and a parsed one.
    const confidence = flags.length === 0 ? 1 : 0.5;
    if (confidence < CONFIDENCE_THRESHOLD && !flags.includes('low_confidence')) {
      flags.push('low_confidence');
    }

    rows.push({
      ordinal: rows.length + 1,
      page: 1,
      analyte: analyte ? analyte.key : null,
      printedLabel: analyte ? analyte.label : text(entry.analyte),
      printedValue,
      printedUnit,
      reference:
        low === null && high === null
          ? null
          : { low, high, text: `${text(entry.referenceLow)} ${text(entry.referenceHigh)}`.trim() },
      unitColumnBlank: false,
      sampleDate,
      confidence,
      flags,
      converted: previewConversion(analyte, printedValue, printedUnit),
      // A typed panel has no printed page to quote, and inventing one would be
      // the app writing an excerpt and attributing it to a laboratory.
      excerpt: [],
      decision: 'waiting',
      measurementId: null,
      decidedAt: null,
      corrected: false,
      chosenUnit: '',
    });
  }

  if (rows.length === 0) {
    return refuse(422, strings.labs.manualNothing, strings.api.labs.blank);
  }

  const id = newDocumentId();
  await createDocument({
    id,
    fileName: '',
    byteSize: 0,
    pageCount: 1,
    mode: 'manual',
    panelDate: sampleDate ? new Date(`${sampleDate}T12:00:00Z`) : null,
    laboratory: text(body.laboratory),
    storedPath: null,
    checksum: null,
    refusals: 0,
    // A typed panel has no page to refuse anything on. Zero refusals, no pages.
    refusalPages: [],
    census: [{ page: 1, characters: 0, imageOnly: false }],
    rows,
  });

  return ok({ id, rows: rows.length, stored: 0 }, 201);
}
