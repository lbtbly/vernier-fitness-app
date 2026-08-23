import { extractTextItems } from 'unpdf';
import { createDocument, readAnalytes } from '@/db/labs';
import { getConfig } from '@/lib/config';
import { csrfFailure } from '@/lib/csrf';
import { ok, refuse, sessionOrRefusal } from '@/lib/gate';
import { knownUnits } from '@/lib/lab-display';
import { type PageItems, census, extractPanel } from '@/lib/lab-parse';
import { recognisePages } from '@/lib/lab-ocr';
import { type ReviewRow, previewConversion } from '@/lib/lab-review';
import { newDocumentId, removeDocument, writeDocument } from '@/lib/lab-storage';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';
// Extraction is CPU work on a file, and a scanned page adds a rasterise and a
// recognition pass. Next's default would cut a three-page scan off mid-read.
export const maxDuration = 120;

/**
 * One laboratory PDF, read on this machine, into a review that stores nothing.
 *
 * The order is the design. Take the bytes, put them on the volume, read the
 * text layer, count the non-whitespace characters PER PAGE, route the pages that
 * carry fewer than a hundred to optical recognition, extract candidate rows, and
 * write ONE row into `lab_document` holding all of them. Not one row reaches
 * `measurement` here, and there is no argument to this route that would make one
 * do so: the only writer of a laboratory measurement is /api/labs/row, one
 * ordinal at a time.
 *
 * A file that produces nothing usable does not stay on the volume. An upload
 * that could not be parsed, or that held no result row at all, is refused with
 * the cause in words and the bytes are removed, because a medical document kept
 * on a machine for no reason is the opposite of what F63 is about.
 *
 * NOTHING LEAVES THIS MACHINE. `unpdf` is a local parse, the recogniser reads
 * its language data off the volume rather than a CDN, and Claude is not called.
 * The review screen says so in those words and this is the code that makes it
 * true.
 */

const MAX_MEGABYTES = 25;
const MAX_BYTES = MAX_MEGABYTES * 1024 * 1024;

/** The four bytes every PDF starts with. A rename does not make a JPEG a PDF. */
function looksLikePdf(bytes: Uint8Array): boolean {
  return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

/** The panel date as an instant in the app's own zone, or null. */
function panelInstant(dayKey: string | null, timeZone: string): Date | null {
  if (!dayKey) return null;
  // Midday, so the calendar day survives being read back in any zone. The day
  // key was computed from what the sheet printed and is the fact; an hour is
  // not, and anchoring at midnight would move the date west of Paris.
  const at = new Date(`${dayKey}T12:00:00Z`);
  if (Number.isNaN(at.getTime())) return null;
  void timeZone;
  return at;
}

export async function POST(request: Request) {
  try {
    return await handle(request);
  } catch (error) {
    console.error(`[vernier] /api/labs/upload failed: ${(error as Error).message}`);
    return refuse(500, strings.api.labs.failed, strings.api.labs.failedDetail);
  }
}

async function handle(request: Request) {
  const csrf = await csrfFailure(request);
  if (csrf) return csrf.response;
  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return refuse(400, strings.api.labs.noFile, strings.api.labs.noFileDetail);
  }
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return refuse(422, strings.api.labs.noFile, strings.api.labs.noFileDetail);
  }
  if (file.size > MAX_BYTES) {
    return refuse(413, strings.api.labs.tooLarge(MAX_MEGABYTES), strings.api.labs.tooLargeDetail);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!looksLikePdf(bytes)) {
    return refuse(415, strings.api.labs.notAPdf, strings.api.labs.notAPdfDetail);
  }

  const id = newDocumentId();
  const checksum = await writeDocument(id, bytes);

  let pages: PageItems[];
  try {
    const extracted = await extractTextItems(bytes);
    pages = extracted.items.map((items, index) => ({ page: index + 1, items }));
  } catch (error) {
    await removeDocument(id);
    console.error(`[vernier] lab pdf unreadable: ${(error as Error).message}`);
    return refuse(422, strings.api.labs.unreadable, strings.api.labs.unreadableDetail);
  }

  // F65's detection, per page, printed into the container log as well as stored
  // on the row, because "the detection count per page" is what the line asks to
  // see and a count nobody can read back is an assertion.
  const pageCensus = census(pages);
  const imageOnly = pageCensus.filter((page) => page.imageOnly).map((page) => page.page);
  console.log(
    `[vernier] lab ${id}: characters per page ${pageCensus
      .map((page) => `${page.page}=${page.characters}`)
      .join(' ')}, image-only pages ${imageOnly.length === 0 ? 'none' : imageOnly.join(',')}`,
  );

  let opticalPages: PageItems[] = [];
  if (imageOnly.length > 0) {
    const outcome = await recognisePages(bytes, imageOnly);
    if (!outcome.available) {
      await removeDocument(id);
      console.error(`[vernier] lab ${id}: optical recognition ${outcome.reason}, ${outcome.detail}`);
      const named = {
        recogniser_absent: [
          strings.api.labs.recogniserAbsent,
          strings.api.labs.recogniserAbsentDetail,
        ],
        language_data_absent: [
          strings.api.labs.languageDataAbsent,
          strings.api.labs.languageDataAbsentDetail,
        ],
        recognition_failed: [
          strings.api.labs.recognitionFailed,
          strings.api.labs.recognitionFailedDetail,
        ],
      }[outcome.reason];
      return refuse(503, named[0], named[1]);
    }
    opticalPages = outcome.pages;
  }

  const catalogue = await readAnalytes();
  const textPages = pages.filter((page) => !imageOnly.includes(page.page));
  // The unit symbols the string catalogue can render. A row whose analyte is new
  // has no accepted-unit list of its own, so this is the only rule left: the
  // symbol has to be one this product has a key for, or the row is flagged
  // rather than painting an uncatalogued word on a screen.
  const units = knownUnits();
  const fromText = extractPanel({ pages: textPages, catalogue, knownUnits: units, optical: false });
  const fromOptical = extractPanel({
    pages: opticalPages,
    catalogue,
    knownUnits: units,
    optical: true,
  });

  const merged = [...fromText.rows, ...fromOptical.rows]
    .sort((left, right) => left.page - right.page || left.ordinal - right.ordinal)
    .map((row, index) => ({ ...row, ordinal: index + 1 }));

  if (merged.length === 0) {
    await removeDocument(id);
    return refuse(422, strings.api.labs.nothingFound, strings.api.labs.nothingFoundDetail);
  }

  const rows: ReviewRow[] = merged.map((row) => ({
    ...row,
    // What this row WOULD store, worked out now so the review can draw the
    // printed original, the factor and the stored value on one line while the
    // owner is still deciding. A conversion he only sees afterwards is a
    // conversion he was never asked about.
    converted: previewConversion(
      catalogue.find((analyte) => analyte.key === row.analyte) ?? null,
      row.printedValue,
      row.printedUnit,
    ),
    decision: 'waiting',
    measurementId: null,
    decidedAt: null,
    corrected: false,
    chosenUnit: '',
  }));

  const { timeZone } = getConfig();
  const panelDate = fromText.panelDate ?? fromOptical.panelDate;
  await createDocument({
    id,
    fileName: file.name,
    byteSize: file.size,
    pageCount: pages.length,
    mode: opticalPages.length > 0 ? 'ocr' : 'text',
    panelDate: panelInstant(panelDate, timeZone),
    laboratory: fromText.laboratory || fromOptical.laboratory,
    storedPath: `labs/${id}.pdf`,
    checksum,
    refusals: fromText.refusals.length + fromOptical.refusals.length,
    census: pageCensus,
    rows,
  });

  return ok(
    {
      id,
      rows: rows.length,
      refusals: fromText.refusals.length + fromOptical.refusals.length,
      census: pageCensus,
      // Said out loud in the response as well as on the screen: this route
      // stores no measurement, whatever it read.
      stored: 0,
    },
    201,
  );
}
