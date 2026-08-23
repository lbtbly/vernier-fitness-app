import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extractTextItems } from 'unpdf';
import { describe, expect, it } from 'vitest';
import {
  OCR_LANGUAGE,
  OCR_SCALE,
  itemsFromWords,
  pngSize,
  recognisePages,
  renderPages,
  wordsFromResult,
} from '@/lib/lab-ocr';
import { census, extractPanel, isBlocked } from '@/lib/lab-parse';
import { BUILT_IN_ANALYTES } from '@/lib/labs';
import { imageOnlyPdf, scannedPanelPdf } from './lab-pdf';

/**
 * F65's rasteriser, and the second reason recognition could not happen.
 *
 * The first was that the image carried neither tesseract.js nor @napi-rs/canvas.
 * With those installed the branch still could not work, because pdf.js
 * TRANSFERS the buffer it is handed. `extractTextItems` runs first in the
 * upload route and leaves `bytes.byteLength` at 0, and the recognition loop
 * then handed that same empty array to `renderPageAsImage` once per page. The
 * research note recorded the gotcha on 2026-08-21; nothing in the suite held
 * it, so it shipped.
 *
 * These tests need no tesseract, no language data, no container and no
 * database. The renderer is `@napi-rs/canvas`, which is a dependency, and the
 * document is the three-page fixture the rest of the slice already uses.
 */

const canvasImport = () => import('@napi-rs/canvas');

describe('the buffer pdf.js takes away', () => {
  it('is detached by the text extraction, which is why the route keeps a copy', async () => {
    // THE MEASUREMENT, IN THE SUITE. Without it, somebody reads the copy in
    // src/app/api/labs/upload/route.ts as belt and braces and deletes it, and
    // every scanned upload goes back to rasterising an empty document. If unpdf
    // ever stops transferring, this goes red and the copy can go with it.
    const bytes = scannedPanelPdf();
    expect(bytes.byteLength).toBeGreaterThan(0);
    const extracted = await extractTextItems(bytes);
    console.log(
      `lab-ocr: ${extracted.items.length} pages read, source buffer ${bytes.byteLength} bytes afterwards`,
    );
    expect(extracted.items).toHaveLength(3);
    expect(bytes.byteLength).toBe(0);
  });

  it('refuses by name when the document arrives detached, rather than reading nothing', async () => {
    // A scanned page read as if it were empty produces no rows and a green
    // screen, which is the exact shape of every check that passes by not
    // checking. This is the tripwire under that.
    const bytes = scannedPanelPdf();
    await extractTextItems(bytes);
    const outcome = await recognisePages(bytes, [3]);
    console.log(`lab-ocr: a detached document answered ${JSON.stringify(outcome)}`);
    expect(outcome.available).toBe(false);
    if (!outcome.available) {
      expect(outcome.reason).toBe('recognition_failed');
      expect(outcome.detail).toBe('detached-buffer');
    }
  });
});

describe('rasterising the pages that carry no text', () => {
  it('renders every page asked for, not only the first', async () => {
    // WHAT WOULD MAKE THIS RED: handing `renderPageAsImage` the same array
    // twice. Measured before the fix: page 1 rendered 23,877 bytes and pages 2
    // and 3 threw "Cannot transfer object of unsupported type", so a two-page
    // scan could never have produced a second page.
    const rendered = await renderPages(scannedPanelPdf(), [1, 2, 3], canvasImport, 1);
    console.log(
      `lab-ocr: rendered ${rendered
        .map((page) => `${page.page}=${page.image.byteLength}b ${page.size?.width}x${page.size?.height}`)
        .join(', ')}`,
    );
    expect(rendered).toHaveLength(3);
    for (const page of rendered) {
      expect(page.image.byteLength, `page ${page.page}`).toBeGreaterThan(0);
      expect(page.size, `page ${page.page}`).not.toBeNull();
      expect(page.size!.width, `page ${page.page}`).toBeGreaterThan(0);
    }
  });

  it('reads a photocopied page end to end when the language data is on this machine', async () => {
    // THE WHOLE PATH, WITH NO CONTAINER: an inked page with no text layer,
    // rasterised, recognised, parsed, and every row it produced flagged and
    // blocked. That last clause is F65's second half and nothing else in the
    // suite covers it.
    //
    // The language model is 1.13 MB and gitignored, so this cannot demand it.
    // WHAT IT NEVER DOES IS PASS QUIETLY. With the model present it asserts the
    // whole path; without it, it asserts the REFUSAL, by name, and prints which
    // branch ran. A skip that says nothing is how this run's twelve
    // check-that-passes-by-not-checking defects all read.
    const root = fileURLToPath(new URL('../..', import.meta.url));
    const previous = process.env.VERNIER_STORAGE_DIR;
    process.env.VERNIER_STORAGE_DIR = `${root}var`;
    const model = `${root}var/tessdata/${OCR_LANGUAGE}.traineddata`;
    const installed = existsSync(model);
    console.log(`lab-ocr: ${OCR_LANGUAGE} model ${installed ? 'present at' : 'absent from'} ${model}`);
    try {
      const bytes = await imageOnlyPdf();
      const forOcr = new Uint8Array(bytes);
      const extracted = await extractTextItems(bytes);
      const pages = extracted.items.map((items, index) => ({ page: index + 1, items }));
      const counted = census(pages);
      console.log(`lab-ocr: census ${counted.map((page) => `${page.page}=${page.characters}`).join(' ')}`);
      // The routing decision, on a page that carries ink and no text layer.
      expect(counted).toHaveLength(1);
      expect(counted[0].characters).toBe(0);
      expect(counted[0].imageOnly).toBe(true);

      const outcome = await recognisePages(forOcr, [1]);
      if (!installed) {
        expect(outcome.available).toBe(false);
        if (!outcome.available) {
          console.log(`lab-ocr: RECOGNITION DID NOT RUN, ${outcome.reason}. Install the model with scripts/fetch-tessdata.sh`);
          expect(outcome.reason).toBe('language_data_absent');
        }
        return;
      }

      expect(outcome.available, JSON.stringify(outcome)).toBe(true);
      if (!outcome.available) return;
      const words = outcome.pages[0].items.map((item) => item.str);
      console.log(`lab-ocr: ${words.length} words recognised: ${words.join(' ')}`);
      expect(words.length).toBeGreaterThan(10);

      const read = extractPanel({
        pages: outcome.pages,
        catalogue: BUILT_IN_ANALYTES,
        knownUnits: ['%', 'g/L', 'µg/L'],
        optical: true,
      });
      for (const row of read.rows) {
        console.log(
          `lab-ocr:   ${row.printedLabel} = ${row.printedValue} ${row.printedUnit}, ` +
            `confidence ${row.confidence}, flags ${row.flags.join('+')}`,
        );
      }
      // The population, then the claim over it. EVERY recognised row is flagged
      // for confirmation and blocked from saving, whatever it happened to read.
      expect(read.rows.length).toBeGreaterThan(0);
      for (const row of read.rows) {
        expect(row.flags, row.printedLabel).toContain('optical_recognition');
        expect(row.flags, row.printedLabel).toContain('low_confidence');
        expect(isBlocked(row.flags), row.printedLabel).toBe(true);
      }
    } finally {
      if (previous === undefined) delete process.env.VERNIER_STORAGE_DIR;
      else process.env.VERNIER_STORAGE_DIR = previous;
    }
  }, 180_000);

  it('reads the pixel size out of the PNG header rather than decoding it again', () => {
    // pngSize is what flips tesseract's top-left boxes into pdf space. A wrong
    // height puts every recognised row on the wrong line of the page.
    const notAPng = new Uint8Array(24);
    expect(pngSize(notAPng)).toBeNull();
    expect(pngSize(new Uint8Array(4))).toBeNull();
  });

  it('tells a page that was read and holds nothing from a library that read nothing', () => {
    // WHAT WOULD MAKE THIS RED: reading `data.words` and calling it a day.
    // tesseract.js 7 nests words under blocks, paragraphs and lines and returns
    // `blocks: null` unless the call asks for them, so the shipped code threw
    // "Cannot read properties of undefined (reading 'filter')" on every scanned
    // page. Measured against tesseract.js 7.0.0 with the French model on the
    // volume, which is why this returns three answers and not two.
    const word = { text: 'HbA1c', bbox: { x0: 1, y0: 2, x1: 3, y1: 4 }, confidence: 78 };
    expect(wordsFromResult({ words: [word] })).toEqual([word]);
    expect(
      wordsFromResult({ blocks: [{ paragraphs: [{ lines: [{ words: [word] }] }] }] }),
    ).toEqual([word]);
    // A page that really was read and carries nothing: the blank back side of a
    // scan. Kept, not refused.
    expect(wordsFromResult({ blocks: [] })).toEqual([]);
    // And a library that answered with no layout at all, which is a defect.
    expect(wordsFromResult({})).toBeNull();
    expect(wordsFromResult({ blocks: null })).toBeNull();
  });

  it('flips a recognised word into pdf space, origin at the bottom left', () => {
    const items = itemsFromWords(
      [{ text: 'HbA1c', bbox: { x0: 100, y0: 40, x1: 200, y1: 60 }, confidence: 78 }],
      1000,
      OCR_SCALE,
    );
    expect(items).toHaveLength(1);
    expect(items[0].str).toBe('HbA1c');
    // x is halved by the scale, and y is the height minus the bottom edge.
    expect(items[0].x).toBe(50);
    expect(items[0].y).toBe((1000 - 60) / OCR_SCALE);
    expect(items[0].width).toBe(50);
  });
});
