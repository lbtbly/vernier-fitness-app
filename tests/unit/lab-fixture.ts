import type { PageItems, TextItem } from '@/lib/lab-parse';

/**
 * A French laboratory report, built the way `unpdf` hands one over: one text
 * item per run of characters, each with its own x and y in PDF space.
 *
 * IT IS BUILT FROM LAYOUT AND NOT FROM TEXT. Every line names the column each
 * cell sits in, so the fixture can express the fact the whole parser exists for:
 * the G.G.T. line has a value and a reference interval and NOTHING IN THE UNIT
 * COLUMN, while the two lines above it print UI/L there. A fixture written as
 * strings could not tell that from a sheet with no unit column at all, which is
 * exactly the distinction screen 05's flagged row rests on.
 *
 * The numbers are the ones the approved wireframe draws, so the fixture and the
 * sheet the designer signed off describe the same panel: LDL printed 1,44 g/L
 * and stored 3,72 mmol/L, glucose printed 0,97 g/L, GGT printed 62 with no unit,
 * ferritin 186 µg/L, and one blood-pressure line that must never come back.
 */

/** Where each column starts, in PDF points. A real Cerballiance sheet, measured. */
export const COLUMNS = { label: 40, value: 220, unit: 282, reference: 344 };

const FONT_SIZE = 9;
/** About 5 points per character at this size. Close enough for a cell width. */
const CHARACTER_WIDTH = 4.8;

function item(text: string, x: number, y: number): TextItem {
  return {
    str: text,
    x,
    y,
    width: text.length * CHARACTER_WIDTH,
    height: FONT_SIZE,
    fontSize: FONT_SIZE,
  };
}

export type FixtureLine = {
  label?: string;
  value?: string;
  unit?: string;
  reference?: string;
  /** A line that is not a table row: a heading, a header field, a footer. */
  plain?: string;
};

/**
 * Lay the lines out down the page from the top, 16 points apart, which is the
 * leading of a 9 point sheet. Reading order is y descending, so the first line
 * in the list gets the highest y.
 */
export function pageOf(page: number, lines: FixtureLine[], top = 760): PageItems {
  const items: TextItem[] = [];
  lines.forEach((line, index) => {
    const y = top - index * 16;
    if (line.plain !== undefined) {
      items.push(item(line.plain, COLUMNS.label, y));
      return;
    }
    if (line.label !== undefined) {
      items.push(item(line.label, COLUMNS.label, y));
      // Dot leaders, as their own items, the way a sheet actually emits them.
      // They collapse into the label cell because the gap is under the cell
      // threshold, which is why the parser strips them after the join.
      items.push(item(' .........', COLUMNS.label + line.label.length * CHARACTER_WIDTH, y));
    }
    if (line.value !== undefined) {
      // A censored value arrives as two items, the sign and the number, close
      // enough together to be one cell. "< 3" is what a sheet prints for a CRP
      // under the detection limit and it is not a number.
      if (line.value.startsWith('<') || line.value.startsWith('>')) {
        items.push(item(line.value[0], COLUMNS.value, y));
        items.push(item(line.value.slice(1).trim(), COLUMNS.value + 6, y));
      } else {
        items.push(item(line.value, COLUMNS.value, y));
      }
    }
    if (line.unit !== undefined) items.push(item(line.unit, COLUMNS.unit, y));
    if (line.reference !== undefined) items.push(item(line.reference, COLUMNS.reference, y));
  });
  return { page, items };
}

/** The twelve-row panel plus its header, one refused line, and one new analyte. */
export const PANEL_PAGE_ONE: FixtureLine[] = [
  { plain: 'Laboratoire Cerballiance Paris 11' },
  { plain: 'Prelevement du 12/08/2026 a 08:15' },
  { plain: 'BILAN LIPIDIQUE' },
  { label: 'Cholesterol total', value: '2,17', unit: 'g/L', reference: '< 2,00' },
  { label: 'Cholesterol HDL', value: '0,48', unit: 'g/L', reference: '> 0,40' },
  { label: 'Cholesterol LDL calcule', value: '1,44', unit: 'g/L', reference: '< 1,60' },
  { label: 'Triglycerides', value: '1,05', unit: 'g/L', reference: '< 1,50' },
  { label: 'Apolipoproteine B', value: '0,94', unit: 'g/L', reference: '0,55 - 1,30' },
  { plain: 'GLYCEMIE' },
  { label: 'Glycemie a jeun', value: '0,97', unit: 'g/L', reference: '0,70 - 1,10' },
  { label: 'Hemoglobine glyquee HbA1c', value: '5,4', unit: '%', reference: '4,0 - 5,6' },
];

/** Page two: the liver panel, the refused line, and the censored one. */
export const PANEL_PAGE_TWO: FixtureLine[] = [
  { plain: 'BILAN HEPATIQUE' },
  { label: 'ASAT (TGO)', value: '29', unit: 'UI/L', reference: '10 - 40' },
  { label: 'ALAT (TGP)', value: '41', unit: 'UI/L', reference: '10 - 40' },
  // The row screen 05 draws as needing the owner's eyes. A value, an interval,
  // and nothing at all in the unit column that the two lines above filled.
  { label: 'G.G.T.', value: '62', reference: '12 - 64' },
  { label: 'Ferritine', value: '186', unit: 'µg/L', reference: '30 - 400' },
  // The line that must never come back. It sits BETWEEN two rows on purpose, so
  // the excerpt built around either neighbour would quote it if the excerpt
  // builder did not refuse to.
  { label: 'Tension arterielle', value: '128/82', unit: 'mmHg' },
  { label: 'CRP', value: '< 3', unit: 'mg/L', reference: '< 5' },
  { label: 'Creatinine', value: '9,2', unit: 'mg/L', reference: '7,0 - 12,0' },
];

export function panelPages(): PageItems[] {
  return [pageOf(1, PANEL_PAGE_ONE), pageOf(2, PANEL_PAGE_TWO)];
}

/**
 * A scanned page: an image with a stamp on it and nothing else in the text
 * layer. Eight non-whitespace characters, which is what a photocopied page
 * actually looks like to a text extractor, and well under F65's hundred.
 */
export function scannedPage(page: number): PageItems {
  return { page, items: [item('12082026', 40, 700)] };
}
