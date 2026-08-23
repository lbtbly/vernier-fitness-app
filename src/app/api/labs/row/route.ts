import { once } from '@/db/idempotency';
import { addAnalyte, readAnalyte, readAnalytes, readDocument, saveRow, toReviewDocument, writeExtraction } from '@/db/labs';
import { getConfig } from '@/lib/config';
import { csrfFailure } from '@/lib/csrf';
import { ok, refuse, sessionOrRefusal } from '@/lib/gate';
import { knownUnits, labValueRefusal } from '@/lib/lab-display';
import { isBlocked } from '@/lib/lab-parse';
import { type ReviewRow, isSingleRowShape, rowsInWrite } from '@/lib/lab-review';
import { type Analyte, checkLabValue, keyForAddedAnalyte, parseFrenchNumber } from '@/lib/labs';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';

/**
 * ONE laboratory row, saved or rejected, behind one explicit tap.
 *
 * This is the whole of F59 and it is enforced at the wire rather than in the
 * markup. `rowsInWrite` counts what a body would apply and anything but exactly
 * one is refused with the number it counted. A screen written next year with a
 * Save All control would have to send eighteen separate requests to do it, and
 * each of those is a separate explicit save of a named row, which is the
 * behaviour the line asks for anyway. THE CONTROL THAT COMMITS A PANEL CANNOT
 * EXIST, because there is no request shape that would carry it.
 *
 * The review holding is updated in the same call, so the screen the owner is
 * looking at and the row in `measurement` cannot disagree about what happened.
 * Nothing here writes a second measurement, and there is no batch overload of
 * `saveRow` for one to be written through.
 *
 * A flagged row is refused unless the owner edited it. The edit IS the explicit
 * decision F62 asks for: he chose the unit, or typed the number the sheet's
 * garbled digit stood for, and the row is then stored with `corrected` true so
 * the summary can say he corrected one.
 */

const HEADER = 'idempotency-key';

type Body = {
  documentId?: unknown;
  ordinal?: unknown;
  action?: unknown;
  edit?: {
    printedValue?: unknown;
    printedUnit?: unknown;
    referenceLow?: unknown;
    referenceHigh?: unknown;
    sampleDate?: unknown;
    analyteLabel?: unknown;
  };
};

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** The instant a sample was taken, from the day key the sheet printed. */
function sampleInstant(dayKey: string | null, fallback: Date | null): Date {
  if (dayKey) {
    const at = new Date(`${dayKey}T12:00:00Z`);
    if (!Number.isNaN(at.getTime())) return at;
  }
  return fallback ?? new Date();
}

export async function POST(request: Request) {
  try {
    return await handle(request);
  } catch (error) {
    console.error(`[vernier] /api/labs/row failed: ${(error as Error).message}`);
    return refuse(500, strings.api.labs.failed, strings.api.labs.failedDetail);
  }
}

async function handle(request: Request) {
  const csrf = await csrfFailure(request);
  if (csrf) return csrf.response;
  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;

  const key = text(request.headers.get(HEADER));
  if (key === '') return refuse(400, strings.api.log.noKey, strings.api.log.noKeyDetail);

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return refuse(400, strings.api.jsonBody, strings.api.labs.failedDetail);
  }

  // The rule, before anything is read and before anything is written. Two
  // questions: how many rows would this body apply, and is it the single-row
  // shape at all. A body carrying `rows: [3]` counts to one and is still a batch
  // request with one element in it, which is what a Save All control degrades to
  // the first time somebody tests it with one row selected.
  const wouldWrite = rowsInWrite(body);
  if (wouldWrite !== 1 || !isSingleRowShape(body)) {
    return refuse(
      422,
      strings.api.labs.oneRowPerWrite(wouldWrite),
      strings.api.labs.oneRowPerWriteDetail,
    );
  }

  const documentId = text(body.documentId);
  const ordinal = body.ordinal as number;
  const action = body.action === 'reject' ? 'reject' : 'save';

  const document = await readDocument(documentId);
  if (!document || document.state !== 'review') {
    return refuse(404, strings.api.labs.noSuchDocument, strings.api.labs.noSuchDocumentDetail);
  }

  const rows = document.extraction as ReviewRow[];
  const index = rows.findIndex((row) => row.ordinal === ordinal);
  if (index === -1) {
    return refuse(404, strings.api.labs.noSuchRow(ordinal), strings.api.labs.noSuchRowDetail);
  }
  const row = rows[index];
  if (row.decision !== 'waiting') {
    return refuse(409, strings.api.labs.alreadyDecided, strings.api.labs.alreadyDecidedDetail);
  }

  if (action === 'reject') {
    const decided: ReviewRow[] = rows.map((entry, at) =>
      at === index
        ? { ...entry, decision: 'rejected', decidedAt: new Date().toISOString(), measurementId: null }
        : entry,
    );
    await writeExtraction(documentId, decided);
    // A rejection writes nothing to `measurement` and says so in the answer.
    return ok({ stored: 0, review: toReviewDocument({ ...document, extraction: decided }) }, 200);
  }

  const edit = body.edit ?? {};
  const edited =
    text(edit.printedValue) !== '' ||
    text(edit.printedUnit) !== '' ||
    text(edit.referenceLow) !== '' ||
    text(edit.referenceHigh) !== '' ||
    text(edit.sampleDate) !== '' ||
    text(edit.analyteLabel) !== '';

  // A flagged row cannot be saved as it stands. The edit is the explicit
  // decision; without one, this is where F62 stops the write.
  if (!edited && isBlocked(row.flags)) {
    return refuse(422, strings.api.labs.blocked, strings.api.labs.blockedDetail);
  }

  const printedValue = text(edit.printedValue) || row.printedValue;
  const printedUnit = text(edit.printedUnit) || row.printedUnit;
  const label = text(edit.analyteLabel) || row.printedLabel;

  let analyte: Analyte | null = row.analyte ? await readAnalyte(row.analyte) : null;

  // The fourteenth analyte, added through the interface, with no source file
  // touched. F64 turns on this branch and on the fact that the catalogue is a
  // table rather than a constant.
  if (!analyte) {
    if (label === '') {
      return refuse(422, strings.api.labs.analyteNeedsName, strings.api.labs.analyteNeedsNameDetail);
    }
    if (printedUnit === '' || !knownUnits().includes(printedUnit)) {
      return refuse(
        422,
        strings.api.labs.unknownUnit(printedUnit),
        strings.api.labs.analyteNeedsNameDetail,
      );
    }
    const number = parseFrenchNumber(printedValue);
    if (number === null) {
      return refuse(422, strings.api.labs.notANumber(printedValue), strings.api.labs.blockedDetail);
    }
    const existing = await readAnalytes();
    const key = keyForAddedAnalyte(label);
    analyte =
      existing.find((entry) => entry.key === key) ??
      (await addAnalyte({
        key,
        label,
        unit: printedUnit,
        printed: [{ unit: printedUnit, factor: 1 }],
        // A band for an analyte nobody planned for cannot be tighter than the
        // owner's own number, so it is derived from it rather than guessed:
        // wide enough to hold a decade of his panels, narrow enough to catch a
        // unit mistake by an order of magnitude.
        low: 0,
        high: Math.max(number * 100, 100),
        // No published general range on this screen, and the explanation says
        // exactly that. The laboratory's own interval is stored on the row.
        referenceLow: null,
        referenceHigh: null,
        sourceUrl: 'https://medlineplus.gov/lab-tests/',
        aliases: [],
      }));
  }

  const checked = checkLabValue(analyte, printedValue, printedUnit);
  if (!checked.ok) {
    return refuse(
      422,
      strings.api.labs.valueRefused,
      labValueRefusal(checked.problem, {
        label: printedValue,
        unit: analyte.unit,
        printedUnit,
        low: analyte.low,
        high: analyte.high,
      }),
    );
  }

  const referenceLow =
    text(edit.referenceLow) !== ''
      ? parseFrenchNumber(text(edit.referenceLow))
      : (row.reference?.low ?? null);
  const referenceHigh =
    text(edit.referenceHigh) !== ''
      ? parseFrenchNumber(text(edit.referenceHigh))
      : (row.reference?.high ?? null);
  const referenceText =
    text(edit.referenceLow) !== '' || text(edit.referenceHigh) !== ''
      ? `${text(edit.referenceLow)} ${text(edit.referenceHigh)}`.trim()
      : (row.reference?.text ?? null);

  const { timeZone } = getConfig();
  const measuredAt = sampleInstant(
    text(edit.sampleDate) || row.sampleDate,
    document.panelDate ?? null,
  );

  const { handled } = await once(key, '/api/labs/row', async () => {
    const result = await saveRow({
      id: key,
      document,
      row,
      analyte,
      value: checked.value,
      printedValue,
      printedUnit,
      conversionFactor: checked.factor,
      referenceLow,
      referenceHigh,
      referenceText,
      measuredAt,
      timeZone,
    });

    const decided: ReviewRow[] = rows.map((entry, at) =>
      at === index
        ? {
            ...entry,
            decision: 'saved',
            measurementId: result.stored ? result.id : null,
            decidedAt: new Date().toISOString(),
            corrected: edited,
            chosenUnit: printedUnit,
            analyte: analyte.key,
            // The row on the review now says what was actually stored, not what
            // the parser had guessed. A screen that keeps showing the pre-edit
            // number after the edit was saved is the screen disagreeing with
            // the table.
            printedValue,
            printedUnit,
            converted: { value: checked.value, unit: analyte.unit, factor: checked.factor },
          }
        : entry,
    );
    await writeExtraction(documentId, decided);

    return {
      outcome: result.stored
        ? ('applied' as const)
        : result.outcome.decision === 'held_for_question'
          ? ('held_for_question' as const)
          : ('deduplicated' as const),
      handled: {
        status: result.stored ? 201 : 200,
        body: {
          // One. Always one. The number is in the answer so a test can read it
          // rather than infer it from a row count taken afterwards.
          stored: result.stored ? 1 : 0,
          measurementId: result.stored ? result.id : null,
          decision: result.outcome.decision,
          review: toReviewDocument({ ...document, extraction: decided }),
        } as Record<string, unknown>,
      },
    };
  });

  return ok(handled.body, handled.status);
}
