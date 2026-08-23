import { describe, expect, it } from 'vitest';
import { extractTextItems } from 'unpdf';
import { IMAGE_ONLY_THRESHOLD, census, extractPanel, type PageItems } from '@/lib/lab-parse';
import { BUILT_IN_ANALYTES } from '@/lib/labs';
import { panelPdf, scannedPanelPdf } from './lab-pdf';

/**
 * The parser against `unpdf` itself, on a real PDF, with no browser, no
 * container and no database.
 *
 * WHAT THIS EXISTS TO CATCH. Every other test in this slice hands the parser an
 * item list built by hand, which grades the rules and says nothing about whether
 * the library produces items in the shape those rules assume. If `unpdf`
 * reported x and y in a different space, or merged a line into one item, or
 * dropped the leaders, every one of those tests would still be green and the
 * product would read an empty panel off a real sheet. This is the test that goes
 * red for that, and it is the cheapest place to find it.
 *
 * It also proves the one claim the plan makes about the library: that it gives
 * full x, y and transform layout with no canvas dependency. If that were not so,
 * the unit-column assertion below could not pass.
 */

const UNITS = ['mmol/L', 'g/L', 'mg/L', 'µg/L', 'U/L', 'UI/L', '%'];

async function pagesOf(bytes: Uint8Array): Promise<PageItems[]> {
  const extracted = await extractTextItems(bytes);
  return extracted.items.map((items, index) => ({ page: index + 1, items }));
}

describe('a real PDF, read by the shipped library', () => {
  it('comes back as positioned items, not as a wall of text', async () => {
    const pages = await pagesOf(panelPdf());
    console.log(
      `lab-pdf: ${pages.length} page(s), items per page ${pages.map((page) => page.items.length).join(', ')}`,
    );
    expect(pages).toHaveLength(2);
    for (const page of pages) {
      expect(page.items.length).toBeGreaterThan(10);
      // The claim the plan rests on: x and y per item. A library that returned
      // text only would fail here and the whole layout approach would be wrong.
      for (const item of page.items) {
        expect(Number.isFinite(item.x), item.str).toBe(true);
        expect(Number.isFinite(item.y), item.str).toBe(true);
      }
    }
  });

  it('parses into the same panel the hand-built fixture produces', async () => {
    const panel = extractPanel({
      pages: await pagesOf(panelPdf()),
      catalogue: BUILT_IN_ANALYTES,
      knownUnits: UNITS,
    });
    console.log(
      `lab-pdf: ${panel.rows.length} rows, ${panel.refusals.length} refusal(s), panel date ${panel.panelDate}`,
    );
    console.log(`lab-pdf: rows ${panel.rows.map((row) => `${row.printedLabel}=${row.printedValue}`).join(', ')}`);
    expect(panel.rows).toHaveLength(13);
    expect(panel.panelDate).toBe('2026-08-12');
    expect(panel.laboratory).toContain('Cerballiance');

    const ldl = panel.rows.find((row) => row.analyte === 'ldl_cholesterol')!;
    expect(ldl.printedValue).toBe('1,44');
    expect(ldl.printedUnit).toBe('g/L');
    expect(ldl.reference?.high).toBe(1.6);
  });

  it('sees the empty unit column on the GGT line of a real file', async () => {
    // The one fact the whole library choice was made for. It cannot be read off
    // extracted text and it can be read off extracted layout.
    const panel = extractPanel({
      pages: await pagesOf(panelPdf()),
      catalogue: BUILT_IN_ANALYTES,
      knownUnits: UNITS,
    });
    const ggt = panel.rows.find((row) => row.analyte === 'ggt')!;
    expect(ggt.printedValue).toBe('62');
    expect(ggt.printedUnit).toBe('');
    expect(ggt.unitColumnBlank).toBe(true);
    expect(ggt.flags).toContain('unit_missing');
  });

  it('never returns the blood-pressure line from a real file either', async () => {
    const panel = extractPanel({
      pages: await pagesOf(panelPdf()),
      catalogue: BUILT_IN_ANALYTES,
      knownUnits: UNITS,
    });
    expect(panel.refusals).toEqual([{ page: 2, reason: 'blood_pressure' }]);
    const serialised = JSON.stringify(panel);
    expect(serialised).not.toContain('128');
    expect(serialised.toLowerCase()).not.toContain('mmhg');
  });

  it('detects a page with no text layer as image only, from a real file', async () => {
    const pages = await pagesOf(scannedPanelPdf());
    const counted = census(pages);
    console.log(
      `lab-pdf: characters per page ${counted
        .map((page) => `${page.page}=${page.characters}${page.imageOnly ? ' image-only' : ''}`)
        .join(' ')}, threshold ${IMAGE_ONLY_THRESHOLD}`,
    );
    expect(counted).toHaveLength(3);
    expect(counted[0].imageOnly).toBe(false);
    expect(counted[1].imageOnly).toBe(false);
    expect(counted[2].imageOnly).toBe(true);
    expect(counted[2].characters).toBeLessThan(IMAGE_ONLY_THRESHOLD);
  });
});
