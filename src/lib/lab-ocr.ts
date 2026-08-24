import { access } from 'node:fs/promises';
import { join } from 'node:path';
import type { PageItems, TextItem } from '@/lib/lab-parse';
import { storageRoot } from '@/lib/lab-storage';

/**
 * The scanned-page branch, and the only part of this product that is allowed to
 * be absent at runtime.
 *
 * PLAN.md line 30 names `tesseract.js` and `@napi-rs/canvas` as dependencies
 * "behind the scanned-PDF branch only", and they are the only two on that line
 * carrying a WebAssembly blob and a native binary. Every other import in this
 * repository is unconditional and top level. These two are reached through
 * `import()` inside the branch that needs them, so a document with a text layer,
 * which is every document this owner has actually received, costs nothing to
 * open and loads no WASM.
 *
 * WHAT HAPPENS WHEN THEY ARE NOT INSTALLED. This function says so, by name, and
 * the route renders screen 00's error card with the cause in words and one
 * action. It does not fall back to reading the empty text layer and it does not
 * store a row: a scanned page read as if it were text produces zero rows and a
 * green screen, which is the exact shape of every check-that-passes-by-not-
 * checking this run has found. An honest refusal is the only other answer.
 *
 * `fra.traineddata` is read from the storage volume and never fetched. Tesseract
 * downloads language data from a CDN by default, and a health product that
 * quietly reaches the internet while reading a medical document is not what the
 * brief describes. `langPath` points inside the volume, caching is off, and a
 * missing file is reported rather than downloaded.
 *
 * THE TYPES ARE STRUCTURAL ON PURPOSE. Naming `@napi-rs/canvas` in a `typeof
 * import()` would make `tsc` require a package the branch exists to make
 * optional, so the two shapes this file uses are written out below. They are
 * four lines and they cannot make the build depend on an absent module.
 */

export const OCR_LANGUAGE = 'fra';

/** Where the language data has to be, inside the volume compose.yaml mounts. */
export function tessdataDirectory(): string {
  return join(storageRoot(), 'tessdata');
}

export type OcrOutcome =
  | { available: true; pages: PageItems[] }
  | {
      available: false;
      /** A key, never a sentence. The route turns it into catalogued copy. */
      reason: 'recogniser_absent' | 'language_data_absent' | 'recognition_failed';
      /** The operator-facing detail, for the container log. Never rendered raw. */
      detail: string;
    };

export type RecognisedWord = {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  confidence: number;
};

/**
 * What tesseract.js 7 actually hands back, which is not what this file assumed.
 *
 * It assumed `data.words`. Measured against tesseract.js 7.0.0 on this Mac with
 * the French model on the volume: `recognize()` answered and `data.words` was
 * undefined, so the recognition path threw "Cannot read properties of undefined
 * (reading 'filter')" and every scanned upload came back as
 * `recognition_failed`. Version 7 nests words under blocks, paragraphs and
 * lines, and returns `blocks: null` unless the call asks for them.
 *
 * Both shapes are read below. The flattening is one function so a unit test can
 * hand it either and watch the words come out.
 */
type RecognisedLine = { words?: RecognisedWord[] };
type RecognisedParagraph = { lines?: RecognisedLine[] };
type RecognisedBlock = { paragraphs?: RecognisedParagraph[] };
export type RecognisedPage = {
  blocks?: RecognisedBlock[] | null;
  words?: RecognisedWord[];
};

/**
 * Every word on a recognised page, whichever shape the library returned, and
 * `null` when it returned no layout at all.
 *
 * The distinction is the whole point. An empty array is a page that was really
 * read and carries no words, which a blank back side of a scan genuinely is.
 * `null` is a library that answered with neither `words` nor `blocks`, which is
 * a recognition that did not happen wearing the clothes of one that found
 * nothing. The first is a fact about the paper and the second is a defect, and
 * they must not read the same way to the caller.
 */
/** Why a recognised page carried no readable words. Operator detail, not screen copy. */
const OCR_NO_WORDS = 'the recogniser returned a page with no readable words';

export function wordsFromResult(data: RecognisedPage): RecognisedWord[] | null {
  if (Array.isArray(data.words)) return data.words;
  if (!Array.isArray(data.blocks)) return null;
  const words: RecognisedWord[] = [];
  for (const block of data.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        for (const word of line.words ?? []) words.push(word);
      }
    }
  }
  return words;
}

type Worker = {
  recognize: (
    image: Buffer,
    options?: Record<string, unknown>,
    output?: Record<string, boolean>,
  ) => Promise<{ data: RecognisedPage }>;
  terminate: () => Promise<void>;
};

type CreateWorker = (
  language: string,
  oem?: number,
  options?: Record<string, unknown>,
) => Promise<Worker>;

/**
 * A PNG's pixel dimensions, read out of its own header.
 *
 * The renderer hands back PNG bytes and the y flip below needs the height. The
 * alternative was to decode the image with the canvas package to ask it, which
 * is a second decode of every page to learn a number that is sitting at byte 16
 * of the file. IHDR is the first chunk of every PNG by specification: an 8-byte
 * signature, a 4-byte length, the tag, then width and height as big-endian
 * 32-bit integers. Node's DataView reads them, and nothing is installed for it.
 */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  for (const [index, byte] of signature.entries()) if (bytes[index] !== byte) return null;
  if (String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]) !== 'IHDR') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/**
 * One recognised page, turned back into the item shape `unpdf` produces so
 * `extractPanel` reads a scanned page and a text page through one code path.
 *
 * Tesseract reports a bounding box per word in image pixels with the origin at
 * the top left. PDF space has the origin at the bottom left, so y is flipped
 * here rather than in the parser: the parser's job is to read a layout, and it
 * should not have to know which of two producers made it.
 */
export function itemsFromWords(words: RecognisedWord[], height: number, scale: number): TextItem[] {
  return words
    .filter((word) => word.text.trim() !== '')
    .map((word) => ({
      str: word.text,
      x: word.bbox.x0 / scale,
      y: (height - word.bbox.y1) / scale,
      width: (word.bbox.x1 - word.bbox.x0) / scale,
      height: (word.bbox.y1 - word.bbox.y0) / scale,
      fontSize: Math.max(4, (word.bbox.y1 - word.bbox.y0) / scale),
    }));
}

/**
 * Recognise the pages the text-layer census called image only.
 *
 * `pages` is the census's own answer and never the whole document: a three-page
 * sheet with one photocopied page rasterises one page and reads the other two
 * off their text layer.
 *
 * Scale 2 because a 300 dpi scan rendered at 1.0 is about 150 dpi of pixels, and
 * digits start dropping below 200. It is the smallest scale that read the
 * fixture cleanly and it costs about a second a page on this machine.
 */
export const OCR_SCALE = 2;

/**
 * The pages, rasterised, WITH A FRESH COPY OF THE DOCUMENT FOR EACH ONE.
 *
 * pdf.js transfers the buffer it is handed. Measured on this Mac against the
 * three-page fixture: the source `Uint8Array` goes from 4599 bytes to 0 during
 * the first `renderPageAsImage`, and the second call throws "Cannot transfer
 * object of unsupported type". The research note recorded the same gotcha on
 * 2026-08-21 and the loop this replaces handed the same array in three times,
 * so a two-page scan could never have produced a second page.
 *
 * It is its own exported function so the unit suite can drive it with no
 * tesseract, no language data and no container: the copy rule is the whole of
 * the defect and it is provable with a renderer and a three-page PDF.
 */
export async function renderPages(
  bytes: Uint8Array,
  pages: number[],
  canvasImport: () => Promise<unknown>,
  scale: number = OCR_SCALE,
): Promise<Array<{ page: number; image: Uint8Array; size: { width: number; height: number } | null }>> {
  const { renderPageAsImage } = await import('unpdf');
  const rendered = [];
  for (const page of pages) {
    // The copy is per call and not per run. One copy reused would be detached
    // by the first page exactly as the original is.
    const own = new Uint8Array(bytes);
    const image = new Uint8Array(await renderPageAsImage(own, page, { canvasImport: canvasImport as never, scale }));
    rendered.push({ page, image, size: pngSize(image) });
  }
  return rendered;
}

export async function recognisePages(bytes: Uint8Array, pages: number[]): Promise<OcrOutcome> {
  if (pages.length === 0) return { available: true, pages: [] };

  // A document that has already been through `extractTextItems` is a document
  // whose buffer pdf.js has transferred away, and rasterising nothing produces
  // no rows and a green screen, which is the shape of every check that passes
  // by not checking. The upload route keeps an untouched copy for this reason;
  // if that copy is ever lost, this says so by name instead of failing quietly.
  if (bytes.byteLength === 0) {
    return { available: false, reason: 'recognition_failed', detail: 'detached-buffer' };
  }

  // The specifiers are built at runtime so the bundler does not try to resolve
  // a package the branch exists to make optional.
  const canvasModule = '@napi-rs/canvas';
  const tesseractModule = 'tesseract.js';
  let canvasImport: () => Promise<unknown>;
  let createWorker: CreateWorker;
  try {
    canvasImport = () => import(/* webpackIgnore: true */ canvasModule);
    await canvasImport();
    const tesseract = (await import(/* webpackIgnore: true */ tesseractModule)) as {
      createWorker: CreateWorker;
    };
    createWorker = tesseract.createWorker;
  } catch (error) {
    return { available: false, reason: 'recogniser_absent', detail: (error as Error).message };
  }

  const languageFile = join(tessdataDirectory(), `${OCR_LANGUAGE}.traineddata`);
  try {
    await access(languageFile);
  } catch {
    return { available: false, reason: 'language_data_absent', detail: languageFile };
  }

  const scale = OCR_SCALE;
  let worker: Worker;
  try {
    worker = await createWorker(OCR_LANGUAGE, undefined, {
      langPath: tessdataDirectory(),
      cacheMethod: 'none',
      gzip: false,
    });
  } catch (error) {
    return { available: false, reason: 'recognition_failed', detail: (error as Error).message };
  }

  try {
    const recognised: PageItems[] = [];
    for (const { page, image, size } of await renderPages(bytes, pages, canvasImport, scale)) {
      if (!size) {
        return { available: false, reason: 'recognition_failed', detail: String(page) };
      }
      // `blocks: true` is what makes version 7 return the word boxes at all.
      // Without it `data.blocks` is null, `data.words` does not exist, and the
      // page comes back as one string with no layout, which this parser cannot
      // read a column out of.
      const result = await worker.recognize(Buffer.from(image), undefined, { blocks: true });
      const words = wordsFromResult(result.data);
      if (words === null) {
        // No layout at all, which is a recognition that did not happen wearing
        // the clothes of one that found nothing. A page of zero words IS kept:
        // the blank back side of a scan is a real page and the route's own
        // "no result rows" refusal is what answers a document made only of
        // those.
        return { available: false, reason: 'recognition_failed', detail: `no-layout-on-page-${page}` };
      }
      recognised.push({ page, items: itemsFromWords(words, size.height, scale) });
    }
    return { available: true, pages: recognised };
  } catch (error) {
    return { available: false, reason: 'recognition_failed', detail: (error as Error).message };
  } finally {
    await worker.terminate();
  }
}

/**
 * The same local recogniser, pointed at one image instead of at a rasterised
 * PDF page.
 *
 * Slice 10's recipe-card import needs it: F91 says a recipe imports from a
 * photograph "parsed locally", and local means this worker with its language
 * data on the volume, not a model and not a network call. The whole of the
 * scanned-PDF branch's caution applies unchanged, which is why it lives beside
 * it rather than in a second module: absent packages are named, absent language
 * data is named, and nothing is ever downloaded.
 *
 * It returns lines rather than positioned items, because a recipe card is read
 * as text and not as a layout. Words are grouped into lines by their vertical
 * midpoint, which is what tesseract's own reading order already gives.
 */
export type OcrTextOutcome =
  | { available: true; lines: string[] }
  | { available: false; reason: 'recogniser_absent' | 'language_data_absent' | 'recognition_failed'; detail: string };

export async function recogniseImageLines(bytes: Uint8Array): Promise<OcrTextOutcome> {
  const tesseractModule = 'tesseract.js';
  let createWorker: CreateWorker;
  try {
    const tesseract = (await import(/* webpackIgnore: true */ tesseractModule)) as {
      createWorker: CreateWorker;
    };
    createWorker = tesseract.createWorker;
  } catch (error) {
    return { available: false, reason: 'recogniser_absent', detail: (error as Error).message };
  }

  const languageFile = join(tessdataDirectory(), `${OCR_LANGUAGE}.traineddata`);
  try {
    await access(languageFile);
  } catch {
    return { available: false, reason: 'language_data_absent', detail: languageFile };
  }

  let worker: Worker;
  try {
    worker = await createWorker(OCR_LANGUAGE, undefined, {
      langPath: tessdataDirectory(),
      cacheMethod: 'none',
      gzip: false,
    });
  } catch (error) {
    return { available: false, reason: 'recognition_failed', detail: (error as Error).message };
  }

  try {
    // `{ blocks: true }`, the same third argument the PDF path passes seventy
    // lines above, with the same reason: it is what makes version 7 return the
    // word boxes at all. Without it `data.blocks` is null and `data.words` does
    // not exist, so `wordsFromResult` returns null and every photographed
    // recipe card was refused with "the recogniser returned a page with no
    // readable words". A verifier proved it on the same bytes outside the app:
    // 0 words without the flag, 18 words and the full card with it.
    //
    // One call site in this file knew this and its neighbour did not, and the
    // comment that used to sit here guessed at "flat or nested depending on the
    // build" rather than reading the one seventy lines up.
    const result = await worker.recognize(Buffer.from(bytes), undefined, { blocks: true });
    // And read through wordsFromResult, not straight off `.words`: the real
    // types make the flat form optional, and while the package was absent this
    // file typechecked against a structural stand-in that did not.
    //
    // A `?? []` here would have typechecked and read as zero recognised lines,
    // which is the shape of every check that passes by not checking. A page
    // whose words cannot be read is a recognition failure and says so.
    const words = wordsFromResult(result.data);
    if (!words) {
      return { available: false, reason: 'recognition_failed', detail: OCR_NO_WORDS };
    }
    return { available: true, lines: linesFromWords(words) };
  } catch (error) {
    return { available: false, reason: 'recognition_failed', detail: (error as Error).message };
  } finally {
    await worker.terminate();
  }
}

/**
 * Words to lines, by vertical position.
 *
 * Two words belong to the same line when their boxes overlap vertically by more
 * than half the shorter box. That is a tolerance rather than an equality
 * because a photograph of a card is never square to the camera, and a rule of
 * "same y" would break every line on a card held at five degrees.
 */
export function linesFromWords(
  words: { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }[],
): string[] {
  const kept = words.filter((word) => word.text.trim() !== '');
  const lines: { top: number; bottom: number; words: { x: number; text: string }[] }[] = [];
  for (const word of kept) {
    const height = word.bbox.y1 - word.bbox.y0;
    const line = lines.find((candidate) => {
      const overlap =
        Math.min(candidate.bottom, word.bbox.y1) - Math.max(candidate.top, word.bbox.y0);
      return overlap > Math.min(height, candidate.bottom - candidate.top) / 2;
    });
    if (line) {
      line.top = Math.min(line.top, word.bbox.y0);
      line.bottom = Math.max(line.bottom, word.bbox.y1);
      line.words.push({ x: word.bbox.x0, text: word.text });
    } else {
      lines.push({
        top: word.bbox.y0,
        bottom: word.bbox.y1,
        words: [{ x: word.bbox.x0, text: word.text }],
      });
    }
  }
  return lines
    .sort((left, right) => left.top - right.top)
    .map((line) =>
      line.words
        .sort((left, right) => left.x - right.x)
        .map((word) => word.text)
        .join(' ')
        .trim(),
    )
    .filter((line) => line !== '');
}
