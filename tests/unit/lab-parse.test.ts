import { describe, expect, it } from 'vitest';
import {
  CONFIDENCE_THRESHOLD,
  IMAGE_ONLY_THRESHOLD,
  census,
  excerptAround,
  extractPanel,
  findDate,
  isBloodPressureLine,
  isBlocked,
  linesOf,
  nonWhitespaceCount,
  parseReference,
} from '@/lib/lab-parse';
import { BUILT_IN_ANALYTES } from '@/lib/labs';
import { PANEL_PAGE_TWO, panelPages, pageOf, scannedPage } from './lab-fixture';

/**
 * The parser, against a French laboratory sheet built from layout rather than
 * from text.
 *
 * Every claim here is about a row somebody could get wrong, and each one names
 * what would make it go red.
 */

const UNITS = ['mmol/L', 'g/L', 'mg/L', 'mg/dL', 'µg/L', 'U/L', 'IU/L', 'UI/L', '%', 'µmol/L'];

function panel(optical = false) {
  return extractPanel({
    pages: panelPages(),
    catalogue: BUILT_IN_ANALYTES,
    knownUnits: UNITS,
    optical,
  });
}

describe('reading a French laboratory sheet', () => {
  it('reads every result row and prints what it walked', () => {
    const read = panel();
    // A zero is evidence only beside the population it covered, so the
    // population is printed whatever the assertions do.
    console.log(
      `lab-parse: ${read.rows.length} rows read from ${read.census.length} pages: ` +
        read.rows.map((row) => `${row.printedLabel}=${row.printedValue}`).join(', '),
    );
    // Fourteen table lines in the fixture, one of them blood pressure, which is
    // refused rather than read. It would go red if a row were dropped by the
    // cell clustering, if a heading were read as a row, or if the refused line
    // came back as one.
    expect(read.rows).toHaveLength(13);
    expect(read.refusals).toHaveLength(1);
  });

  it('files each label under the right analyte, longest alias first', () => {
    const read = panel();
    const byLabel = new Map(read.rows.map((row) => [row.printedLabel, row.analyte]));
    // "cholesterol" is a prefix of "cholesterol total" and "hdl" is inside
    // "non hdl cholesterol". A shortest-first or contains-anywhere rule files a
    // total cholesterol under HDL, and this is the assertion that goes red.
    expect(byLabel.get('Cholesterol total')).toBe('total_cholesterol');
    expect(byLabel.get('Cholesterol HDL')).toBe('hdl_cholesterol');
    expect(byLabel.get('Cholesterol LDL calcule')).toBe('ldl_cholesterol');
    expect(byLabel.get('ASAT (TGO)')).toBe('ast');
    expect(byLabel.get('ALAT (TGP)')).toBe('alt');
    // Dot leaders are not part of a name, and the trailing full stop goes with
    // them: "G.G.T. ........." arrives as one cell and comes back as "G.G.T".
    // What the screen draws is the catalogue label anyway, because the analyte
    // matched.
    expect(byLabel.get('G.G.T')).toBe('ggt');
    expect(byLabel.get('Hemoglobine glyquee HbA1c')).toBe('hba1c');
  });

  it('reads the panel date off the header and gives it to every row', () => {
    const read = panel();
    expect(read.panelDate).toBe('2026-08-12');
    expect(read.laboratory).toContain('Cerballiance');
    expect(read.rows.every((row) => row.sampleDate === '2026-08-12')).toBe(true);
    // It would go red if a reference interval like "10 - 40" were read as a
    // date, or if a date on page 1 failed to reach the rows on page 2.
  });

  it('flags the row whose unit column the sheet left empty, and says the column exists', () => {
    const ggt = panel().rows.find((row) => row.analyte === 'ggt')!;
    expect(ggt.printedValue).toBe('62');
    expect(ggt.printedUnit).toBe('');
    expect(ggt.flags).toContain('unit_missing');
    expect(isBlocked(ggt.flags)).toBe(true);
    // The layout claim, and the only thing x positions buy that plain text does
    // not: this page HAS a unit column, filled on the two lines above, and this
    // line left it blank. It goes red if the parser stops reading x.
    expect(ggt.unitColumnBlank).toBe(true);
  });

  it('refuses a censored value rather than storing a limit as a number', () => {
    const crp = panel().rows.find((row) => row.analyte === 'crp')!;
    expect(crp.printedValue).toBe('<3');
    expect(crp.flags).toContain('value_censored');
    expect(isBlocked(crp.flags)).toBe(true);
  });

  it('reads a clean row at full confidence and leaves it unblocked', () => {
    const ldl = panel().rows.find((row) => row.analyte === 'ldl_cholesterol')!;
    expect(ldl.printedValue).toBe('1,44');
    expect(ldl.printedUnit).toBe('g/L');
    expect(ldl.reference).toEqual({ low: null, high: 1.6, text: '< 1,60' });
    expect(ldl.confidence).toBe(1);
    expect(isBlocked(ldl.flags)).toBe(false);
  });

  it('marks an analyte the catalogue does not hold as new, and does not block it', () => {
    const apo = panel().rows.find((row) => row.printedLabel === 'Apolipoproteine B')!;
    expect(apo.analyte).toBeNull();
    expect(apo.flags).toContain('new_analyte');
    // Screen 05 draws this row as "Read cleanly, but new" with its save control
    // live. It would go red if being absent from the catalogue were treated as
    // a doubt about the reading rather than as a fact about the catalogue.
    expect(isBlocked(apo.flags)).toBe(false);
    expect(apo.confidence).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD);
  });
});

describe('blood pressure, refused at extraction', () => {
  it('never returns it as a row, and returns a page and a reason with no value', () => {
    const read = panel();
    expect(read.refusals).toEqual([{ page: 2, reason: 'blood_pressure' }]);
    const serialised = JSON.stringify(read);
    // The number itself, and both halves of it, absent from everything the
    // parser hands back. This is the assertion F60 rests on.
    expect(serialised).not.toContain('128/82');
    expect(serialised).not.toContain('128');
    expect(serialised).not.toContain('mmHg');
    expect(serialised.toLowerCase()).not.toContain('tension');
  });

  it('keeps a refused line out of the excerpt built around its neighbours', () => {
    const read = panel();
    // Ferritin sits directly above the refused line and CRP directly below, so
    // an excerpt of two lines either side would quote it if the builder did not
    // drop it. That is the whole reason this test names those two rows.
    for (const key of ['ferritin', 'crp']) {
      const row = read.rows.find((entry) => entry.analyte === key)!;
      expect(row.excerpt.join('\n')).not.toContain('128');
      expect(row.excerpt.join('\n').toLowerCase()).not.toContain('tension');
    }
  });

  it('recognises a pressure by its unit even when the label is one nobody predicted', () => {
    // A laboratory that prints "TA couchee" defeats any label list. mmHg does
    // not: a line whose unit is a pressure is a pressure whatever it is called.
    expect(isBloodPressureLine({ text: 'TA couchee 132 / 84 mmHg' })).toBe(true);
    expect(isBloodPressureLine({ text: 'Ferritine 186 µg/L' })).toBe(false);
  });
});

describe('the image-only detection F65 fixes', () => {
  it('counts non-whitespace characters per page and names the threshold', () => {
    const pages = [...panelPages(), scannedPage(3)];
    const counted = census(pages);
    // Printed, because "the detection count per page" is the evidence the line
    // asks for and a count nobody can read back is an assertion.
    console.log(
      `lab-parse: characters per page ${counted
        .map((page) => `${page.page}=${page.characters}${page.imageOnly ? ' image-only' : ''}`)
        .join(' ')}, threshold ${IMAGE_ONLY_THRESHOLD}`,
    );
    expect(counted[0].imageOnly).toBe(false);
    expect(counted[1].imageOnly).toBe(false);
    expect(counted[0].characters).toBeGreaterThan(IMAGE_ONLY_THRESHOLD);
    expect(counted[2]).toEqual({ page: 3, characters: 8, imageOnly: true });
  });

  it('counts characters and not items, so a stamped scan is still a scan', () => {
    // A scanned page is rarely empty: it carries a header stamp or an embedded
    // font sample. A rule counting ITEMS would call this page text.
    const stamped = pageOf(4, [{ plain: 'CERBA' }, { plain: '12/08' }, { plain: 'p1' }]);
    expect(stamped.items).toHaveLength(3);
    expect(nonWhitespaceCount(stamped.items)).toBeLessThan(IMAGE_ONLY_THRESHOLD);
    expect(census([stamped])[0].imageOnly).toBe(true);
  });

  it('flags and blocks every row that came out of optical recognition', () => {
    const read = panel(true);
    expect(read.rows.length).toBeGreaterThan(0);
    console.log(`lab-parse: ${read.rows.length} optical rows, all flagged`);
    for (const row of read.rows) {
      expect(row.flags).toContain('optical_recognition');
      expect(row.flags).toContain('low_confidence');
      expect(row.confidence).toBeLessThanOrEqual(0.5);
      // Every one, including the ones that look perfect. Optical recognition
      // returns 13.Q for 13.0 often enough that a clean-looking row is not
      // evidence of a clean read.
      expect(isBlocked(row.flags)).toBe(true);
    }
  });
});

describe('the small rules', () => {
  it('reads the five reference-interval shapes and refuses a sixth', () => {
    expect(parseReference('12 - 64')).toEqual({ low: 12, high: 64, text: '12 - 64' });
    expect(parseReference('0,70 - 1,10')).toEqual({ low: 0.7, high: 1.1, text: '0,70 - 1,10' });
    expect(parseReference('[12 ; 64]')).toEqual({ low: 12, high: 64, text: '[12 ; 64]' });
    expect(parseReference('< 5')).toEqual({ low: null, high: 5, text: '< 5' });
    expect(parseReference('> 1,00')).toEqual({ low: 1, high: null, text: '> 1,00' });
    // A shape nobody has seen is left unparsed and flagged, never guessed at.
    expect(parseReference('selon methode')).toBeNull();
  });

  it('reads a French date and refuses an impossible one', () => {
    expect(findDate('Prelevement du 12/08/2026 a 08:15')).toBe('2026-08-12');
    expect(findDate('12-08-2026')).toBe('2026-08-12');
    expect(findDate('32/08/2026')).toBeNull();
    expect(findDate('12/13/2026')).toBeNull();
    expect(findDate('page 1 sur 3')).toBeNull();
  });

  it('groups items into lines by y and into cells by the gap between them', () => {
    const page = pageOf(1, PANEL_PAGE_TWO);
    const lines = linesOf(page);
    expect(lines).toHaveLength(PANEL_PAGE_TWO.length);
    const ggt = lines.find((line) => line.text.startsWith('G.G.T.'))!;
    // Label plus its leaders as one cell, then the value, then the interval.
    // Three cells and not four: the sheet put nothing in the unit column.
    expect(ggt.cells).toHaveLength(3);
    const asat = lines.find((line) => line.text.startsWith('ASAT'))!;
    expect(asat.cells).toHaveLength(4);
  });

  it('drops a refused line from an excerpt wherever it sits in the window', () => {
    const lines = linesOf(pageOf(1, PANEL_PAGE_TWO));
    const at = lines.findIndex((line) => line.text.startsWith('Ferritine'));
    const excerpt = excerptAround(lines, at, 2);
    expect(excerpt.some((line) => line.startsWith('Ferritine'))).toBe(true);
    expect(excerpt.join('\n')).not.toContain('128');
  });
});
