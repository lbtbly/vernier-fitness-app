/**
 * The laboratory sheet, read off its own layout.
 *
 * `unpdf` hands back every text item on a page with its x, y, width, height and
 * font size, which is why the plan chose it: a French laboratory report is a
 * table drawn with columns and dot leaders, not a paragraph, and the fact that
 * matters most on the GGT line of screen 05 is that the UNIT COLUMN IS EMPTY.
 * A plain text extraction cannot tell an empty column from a missing one; a
 * layout extraction can, and that difference is the whole of one of the three
 * rows the owner has to look at.
 *
 * Pure. No pdf library, no database, no clock, no request: the caller does the
 * reading and hands the items in, so every rule below is graded by the unit
 * suite against a fixture rather than against a round trip that happens to
 * contain one.
 *
 * NOTHING HERE EVER RETURNS A BLOOD-PRESSURE VALUE. A line that carries one is
 * dropped at extraction and comes back as a page number and a reason key, and
 * the excerpt builder refuses to quote a dropped line even as context for the
 * row next to it. F60 says the refusal must not print the value it refused, and
 * the only way to be sure of that is for the value never to leave this file.
 */

import { type AnalyteRule, analyteOfLabel, isCensored, normaliseLabel, parseFrenchNumber } from './labs';

/** One text item as unpdf reports it. The fields this parser reads, and no others. */
export type TextItem = {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
};

export type PageItems = {
  /** One based, as a person counts pages and as the review screen prints them. */
  page: number;
  items: TextItem[];
};

/**
 * The threshold F65 fixes: a page carrying fewer than this many non-whitespace
 * characters holds no text layer worth reading and is an image of a page.
 *
 * It is a count of characters and not a count of items, because a scanned page
 * is not empty: it usually carries a handful of items from a header stamp or an
 * embedded font sample, and a rule counting items would call it text.
 */
export const IMAGE_ONLY_THRESHOLD = 100;

/**
 * The stated confidence threshold F62 turns on. A row at or above this reads
 * cleanly; a row below it is flagged and cannot be saved without an explicit
 * decision.
 *
 * 0.9 rather than something lower because the cost of the two mistakes is not
 * symmetric. A row wrongly flagged costs one tap. A row wrongly stored is
 * permanent: `measurement` refuses DELETE, so the only correction is a second
 * row pointing at the first, forever.
 */
export const CONFIDENCE_THRESHOLD = 0.9;

/** Everything an extracted row can be flagged for. Keys, never sentences. */
export const ROW_FLAGS = [
  'low_confidence',
  'unit_missing',
  'unit_unknown',
  'value_censored',
  'value_ambiguous',
  'reference_missing',
  'date_missing',
  'new_analyte',
  'optical_recognition',
] as const;

export type RowFlag = (typeof ROW_FLAGS)[number];

/**
 * The flags that BLOCK a save until the owner decides something.
 *
 * `new_analyte` and `reference_missing` are not here on purpose. Both are facts
 * about the sheet rather than doubts about the number: screen 05 draws the new
 * analyte as "Read cleanly, but new" with its accept control live, and a panel
 * that prints no interval for an analyte is a normal panel.
 */
export const BLOCKING_FLAGS: RowFlag[] = [
  'low_confidence',
  'unit_missing',
  'unit_unknown',
  'value_censored',
  'value_ambiguous',
  'date_missing',
];

export function isBlocked(flags: string[]): boolean {
  return flags.some((flag) => (BLOCKING_FLAGS as string[]).includes(flag));
}

export type ReferenceInterval = {
  low: number | null;
  high: number | null;
  /** Exactly as the sheet printed it, so the owner can check the parse by eye. */
  text: string;
};

export type ExtractedRow = {
  /** Position in the document, one based. The review screen prints "row 9 of 22". */
  ordinal: number;
  page: number;
  /** The catalogue key, or null when the sheet names something not in the catalogue. */
  analyte: string | null;
  /** The label exactly as the sheet printed it, leaders stripped. */
  printedLabel: string;
  /** The number exactly as the sheet printed it, comma and all. */
  printedValue: string;
  /** The unit exactly as the sheet printed it, or the empty string when the column was empty. */
  printedUnit: string;
  reference: ReferenceInterval | null;
  /**
   * True when this page HAS a unit column and this line left it blank, which is
   * a different fact from a sheet that prints no unit column at all. Screen 05's
   * GGT row says so in words, and only the layout knows it.
   */
  unitColumnBlank: boolean;
  /** The sample date as a day key, "2026-08-12", or null. */
  sampleDate: string | null;
  confidence: number;
  flags: RowFlag[];
  /** The row's own line and its neighbours, with every refused line removed. */
  excerpt: string[];
};

export type Refusal = {
  page: number;
  /** A key, never a sentence, and never the value or the label that was refused. */
  reason: 'blood_pressure';
};

export type PageCensus = {
  page: number;
  characters: number;
  imageOnly: boolean;
};

export type Panel = {
  rows: ExtractedRow[];
  refusals: Refusal[];
  /** The panel date as a day key, read from the header, or null. */
  panelDate: string | null;
  /** The laboratory as the sheet names itself, or the empty string. */
  laboratory: string;
  census: PageCensus[];
};

/** Every non-whitespace character on a page, which is F65's detection count. */
export function nonWhitespaceCount(items: TextItem[]): number {
  let total = 0;
  for (const item of items) total += item.str.replace(/\s/g, '').length;
  return total;
}

/**
 * The per-page count and the verdict, printed on every import.
 *
 * A list rather than a boolean, because F65's evidence is "the detection count
 * per page" and a single verdict over a mixed document tells nobody which page
 * was scanned. A three-page sheet whose middle page was photocopied is a real
 * document and it routes one page to recognition and two to the text layer.
 */
export function census(pages: PageItems[]): PageCensus[] {
  return pages.map((page) => {
    const characters = nonWhitespaceCount(page.items);
    return { page: page.page, characters, imageOnly: characters < IMAGE_ONLY_THRESHOLD };
  });
}

export type Cell = { text: string; x: number; endX: number };
export type Line = { page: number; y: number; cells: Cell[]; text: string };

/** Dot leaders and the punctuation a sheet pads a column with. Never part of a name. */
function stripLeaders(text: string): string {
  return text.replace(/[.…_\-\s]+$/u, '').replace(/^[.…_\-\s]+/u, '').trim();
}

/**
 * Items grouped into lines by y, then into cells by the gap between them.
 *
 * PDF space puts the origin at the bottom left, so reading order is y
 * descending. The line tolerance is half the font size: two items on one
 * printed line differ by a fraction of a point because of rounding in the
 * transform, and two printed lines are a whole leading apart.
 *
 * The cell gap is 0.55 of the font size, which is about two spaces at any size.
 * Below it two items are one word split by the font encoding; above it they are
 * two columns. Dot leaders arrive as their own items and collapse into the
 * label cell, which is why `stripLeaders` runs after the join and not before.
 */
export function linesOf(page: PageItems): Line[] {
  const items = page.items.filter((item) => item.str.trim() !== '');
  const rows: TextItem[][] = [];
  for (const item of [...items].sort((left, right) => right.y - left.y || left.x - right.x)) {
    const tolerance = Math.max(1.5, (item.fontSize || 10) * 0.5);
    const row = rows.find((candidate) => Math.abs(candidate[0].y - item.y) <= tolerance);
    if (row) row.push(item);
    else rows.push([item]);
  }

  return rows.map((row) => {
    const ordered = [...row].sort((left, right) => left.x - right.x);
    const cells: Cell[] = [];
    for (const item of ordered) {
      const gap = (item.fontSize || 10) * 0.55;
      const last = cells[cells.length - 1];
      if (last && item.x - last.endX <= gap) {
        last.text += item.str;
        last.endX = Math.max(last.endX, item.x + item.width);
        continue;
      }
      cells.push({ text: item.str, x: item.x, endX: item.x + item.width });
    }
    const trimmed = cells
      .map((cell) => ({ ...cell, text: cell.text.replace(/\s+/g, ' ').trim() }))
      .filter((cell) => cell.text !== '');
    return {
      page: page.page,
      y: ordered[0].y,
      cells: trimmed,
      text: trimmed.map((cell) => cell.text).join(' ').replace(/\s+/g, ' ').trim(),
    };
  });
}

/**
 * Is this line a blood-pressure reading, whatever it calls itself.
 *
 * Two witnesses and either is enough. The label, in any of the shapes a French
 * or English sheet prints it. And the UNIT, because a line whose unit is mmHg
 * is a pressure whatever the label says, and a laboratory that prints
 * "TA couchee" is not going to be caught by a label list. The unit test that
 * covers this hands it a label nobody predicted with mmHg beside it.
 */
const BLOOD_PRESSURE_LABELS = [
  'tension arterielle',
  'pression arterielle',
  'blood pressure',
  'systolique',
  'diastolique',
  'systolic',
  'diastolic',
];

export function isBloodPressureLine(line: { text: string }): boolean {
  const normalised = normaliseLabel(line.text);
  if (normalised === '') return false;
  if (/(^| )mmhg( |$)/.test(normalised)) return true;
  return BLOOD_PRESSURE_LABELS.some((label) => normalised.includes(label));
}

/** Units a sheet may print, as shapes rather than as a list per analyte. */
const UNIT_SHAPE = /^(%|[A-Za-zµμ]{1,6}(\/[A-Za-zµμ0-9.]{1,8}){0,2})$/;

/**
 * Anything that is not a unit but sits in the unit column of some sheets. A
 * French report prints the method or a footnote marker there, and reading one
 * as a unit is how a stored row ends up saying "62 methode".
 */
const NOT_A_UNIT = new Set(['a', 'de', 'du', 'et', 'ref', 'norme', 'normes', 'valeurs', 'resultat']);

function looksLikeUnit(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed === '' || !UNIT_SHAPE.test(trimmed)) return false;
  if (parseFrenchNumber(trimmed) !== null) return false;
  return !NOT_A_UNIT.has(normaliseLabel(trimmed));
}

/**
 * A reference interval as a sheet prints it. Five shapes and no sixth, because
 * a shape nobody has seen is better left unparsed and flagged than guessed at.
 *
 *   12 - 64      12 a 64      [12 ; 64]      < 5      > 1,00
 */
export function parseReference(text: string): ReferenceInterval | null {
  const raw = text.trim();
  if (raw === '') return null;
  const cleaned = raw.replace(/[[\]()]/g, ' ').replace(/\s+/g, ' ').trim();

  const between = cleaned.match(
    /^(-?[\d ,.  ]+?)\s*(?:-|–|;|a|à|to)\s*(-?[\d ,.  ]+)$/iu,
  );
  if (between) {
    const low = parseFrenchNumber(between[1]);
    const high = parseFrenchNumber(between[2]);
    if (low !== null && high !== null) return { low, high, text: raw };
  }

  const below = cleaned.match(/^(?:<|inferieur a|inférieur à)\s*(-?[\d ,.  ]+)$/iu);
  if (below) {
    const high = parseFrenchNumber(below[1]);
    if (high !== null) return { low: null, high, text: raw };
  }

  const above = cleaned.match(/^(?:>|superieur a|supérieur à)\s*(-?[\d ,.  ]+)$/iu);
  if (above) {
    const low = parseFrenchNumber(above[1]);
    if (low !== null) return { low, high: null, text: raw };
  }

  return null;
}

/** A French date, dd/mm/yyyy or dd-mm-yyyy, as a day key. Null when there is none. */
export function findDate(text: string): string | null {
  const match = text.match(/(\d{2})[/.-](\d{2})[/.-](\d{4})/);
  if (!match) return null;
  const [, day, month, year] = match;
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  if (monthNumber < 1 || monthNumber > 12 || dayNumber < 1 || dayNumber > 31) return null;
  return `${year}-${month}-${day}`;
}

/**
 * How long a printed value can be before it is something other than a value.
 *
 * A laboratory prints "1,44" or "128" or "0,975". Twelve characters is room for
 * a number with a thousands space and two garbled characters, and it is short
 * enough to exclude a sentence, a method name and a footer.
 */
const GARBLED_MAX_LENGTH = 12;

/**
 * Two letters, because optical recognition mistakes ONE character at a time.
 *
 * "5.4Q" for "5.40" carries one letter, "1O,2" carries one. A cell with three
 * or more letters in it is a word with a number in it, which is a heading, a
 * method or a footer, and reading one as a result is how a review fills with
 * rows nobody printed.
 */
const GARBLED_MAX_LETTERS = 2;

/**
 * A cell that was MEANT to be a number and came out as something else. F62.
 *
 * THIS IS THE ROW THAT USED TO VANISH. The value scan looked for a cell that
 * parsed as a number or read as a censored limit, and a line with neither was
 * skipped whole: a sheet printing HbA1c as "5,4Q" produced no row at all, so
 * there was no flag, no blocked save and nothing on the screen. A row that
 * vanishes is worse than a row that is wrong, because the owner cannot correct
 * what he cannot see, and F62 says a value that is ambiguous is FLAGGED and
 * BLOCKED rather than dropped.
 *
 * So the shape is named rather than guessed at. It carries a digit, it is short,
 * it holds at most two letters, and it is none of the four things that are not
 * results: a clean number, a censored limit, a date, or a reference interval.
 * The slash is excluded outright because every cell that carries one is a date,
 * a page marker or a ratio.
 *
 * WHAT THIS DOES NOT DO. It never overrides a clean number on the same line:
 * `extractPanel` looks for one of those first and only falls back to this when
 * the line has none. A row that reads cleanly today reads exactly the same way
 * afterwards.
 */
export function looksLikeGarbledValue(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed === '' || trimmed.length > GARBLED_MAX_LENGTH) return false;
  if (!/\d/.test(trimmed)) return false;
  if (/[/:]/.test(trimmed)) return false;
  if (parseFrenchNumber(trimmed) !== null) return false;
  if (isCensored(trimmed)) return false;
  if (findDate(trimmed) !== null) return false;
  if (parseReference(trimmed) !== null) return false;
  const letters = trimmed.replace(/[^A-Za-zµμ]/g, '');
  return letters.length <= GARBLED_MAX_LETTERS;
}

/**
 * The excerpt frame 2 draws under "As printed", and the one place a refused
 * line could have leaked.
 *
 * Two lines either side of the row, so the owner can see the column the sheet
 * put the unit in on the rows around his. Every one of them goes through the
 * blood-pressure test again and is DROPPED rather than redacted, because a
 * redaction that prints "TA ... [removed]" still names a line the app promised
 * not to display, and a partial number is still the value.
 */
export function excerptAround(lines: Line[], index: number, radius = 2): string[] {
  const from = Math.max(0, index - radius);
  const to = Math.min(lines.length - 1, index + radius);
  const excerpt: string[] = [];
  for (let at = from; at <= to; at += 1) {
    if (isBloodPressureLine(lines[at])) continue;
    excerpt.push(lines[at].text);
  }
  return excerpt;
}

/**
 * Which x positions are columns on this page.
 *
 * Cell starts cluster hard on a laboratory report because the whole thing is a
 * table. Anything within four points is the same column. The result is what
 * lets an EMPTY unit column be told from a missing one: if a page has a column
 * at x and this line has no cell in it, the sheet left it blank on this line
 * and the app will not guess what belongs there.
 */
export function columnsOf(lines: Line[], tolerance = 4): number[] {
  const starts = lines.flatMap((line) => line.cells.map((cell) => cell.x)).sort((a, b) => a - b);
  const columns: number[] = [];
  for (const start of starts) {
    const last = columns[columns.length - 1];
    if (last !== undefined && start - last <= tolerance) continue;
    columns.push(start);
  }
  return columns;
}

/**
 * How sure the parser is about one row, as a number between 0 and 1.
 *
 * It is arithmetic over what was actually read and never a constant: a row
 * whose label matched an alias, whose value parsed, whose unit is one the
 * analyte accepts and whose interval parsed scores 1. Each missing piece costs
 * a stated amount. The point of writing it as subtraction is that the number on
 * screen can be explained to the owner line by line, which is what the
 * conversion note under each flagged row does.
 */
export function confidenceOf(parts: {
  valueParsed: boolean;
  unitKnown: boolean;
  referenceParsed: boolean;
  optical: boolean;
}): number {
  let confidence = 1;
  if (!parts.valueParsed) confidence -= 0.5;
  if (!parts.unitKnown) confidence -= 0.3;
  if (!parts.referenceParsed) confidence -= 0.05;
  // Optical recognition returns 13.Q for 13.0 often enough that a recognised
  // row is never trusted, whatever the rest of the line looked like. It is
  // capped rather than reduced, so a clean-looking OCR row still lands under
  // the threshold and still arrives blocked.
  if (parts.optical) confidence = Math.min(confidence, 0.5);
  return Math.max(0, Number(confidence.toFixed(2)));
}

export type ExtractInput = {
  pages: PageItems[];
  catalogue: AnalyteRule[];
  /**
   * Every unit symbol the string catalogue holds a key for.
   *
   * It is an argument because this module stays dependency free, and it is
   * needed because a row whose analyte is NEW has no accepted-unit list of its
   * own: the only rule left is that the symbol has to be one this product can
   * render with a key. A sheet printing something exotic flags the row rather
   * than painting an uncatalogued word on a screen, which is C6's whole line.
   */
  knownUnits?: string[];
  /** True when these items came from optical recognition rather than a text layer. */
  optical?: boolean;
};

/**
 * The whole sheet, read into candidate rows that are not stored anywhere yet.
 *
 * Order matters and it is: refuse first, then read. A blood-pressure line is
 * removed from the line list before any row is built, so no later step can pick
 * one up, quote one, or count one. What comes back is a page number and a
 * reason key, which is everything the review screen needs to say a row was
 * refused and nothing it needs to say what the row said.
 */
export function extractPanel(input: ExtractInput): Panel {
  const optical = input.optical === true;
  const refusals: Refusal[] = [];
  const rows: ExtractedRow[] = [];
  let panelDate: string | null = null;
  let laboratory = '';

  for (const page of input.pages) {
    const lines = linesOf(page);
    const columns = columnsOf(lines);

    for (const line of lines) {
      if (isBloodPressureLine(line)) refusals.push({ page: page.page, reason: 'blood_pressure' });
    }

    // The header, read before the refused lines are dropped so a date printed
    // above a refused reading is still found, and read only from lines that
    // carry no result of their own.
    // The header. A date is taken from a line that both CARRIES one and names
    // itself as a sampling or issue date, because a reference interval reading
    // "10 - 40" and a footer reading "page 1 / 3" are also lines with numbers on
    // them. Only if no such line exists does the first date on the page stand in,
    // and a row with no date at all is flagged rather than dated by guesswork.
    let anyDate: string | null = null;
    for (const line of lines) {
      if (isBloodPressureLine(line)) continue;
      const found = findDate(line.text);
      if (found !== null) {
        if (anyDate === null) anyDate = found;
        if (panelDate === null && /(prelevement|preleve|date|edite|effectue|realise)/.test(normaliseLabel(line.text))) {
          panelDate = found;
        }
      }
      if (laboratory === '' && /laboratoire|laboratory/i.test(line.text)) {
        laboratory = line.text.trim();
      }
    }
    if (panelDate === null) panelDate = anyDate;

    for (const [index, line] of lines.entries()) {
      if (isBloodPressureLine(line)) continue;
      if (line.cells.length < 2) continue;

      const label = stripLeaders(line.cells[0].text);
      if (label === '' || parseFrenchNumber(label) !== null) continue;

      const rest = line.cells.slice(1);
      let valueAt = rest.findIndex(
        (cell) => parseFrenchNumber(cell.text) !== null || isCensored(cell.text),
      );
      // F62, and the row that used to disappear. A line whose value cell holds
      // "5,4Q" has no number and no limit on it, and it was skipped whole: no
      // row, no flag, no blocked save, and nothing on the screen for the owner
      // to correct. The fallback runs ONLY when the line has no clean number
      // anywhere, so a row that reads cleanly today is untouched.
      if (valueAt === -1) valueAt = rest.findIndex((cell) => looksLikeGarbledValue(cell.text));
      if (valueAt === -1) continue;

      const valueCell = rest[valueAt];
      const printedValue = valueCell.text.trim();
      const after = rest.slice(valueAt + 1);

      const unitCell = after[0] && looksLikeUnit(after[0].text) ? after[0] : null;
      const printedUnit = unitCell ? unitCell.text.trim() : '';
      const referenceCells = unitCell ? after.slice(1) : after;
      const referenceText = referenceCells.map((cell) => cell.text).join(' ').trim();
      const reference = parseReference(referenceText);

      const analyte = analyteOfLabel(label, input.catalogue);
      const valueParsed = parseFrenchNumber(printedValue) !== null;
      const censored = isCensored(printedValue);
      const knownUnits = input.knownUnits ?? [];
      const unitKnown =
        printedUnit !== '' &&
        (analyte === null
          ? knownUnits.includes(printedUnit)
          : analyte.printed.some((entry) => entry.unit === printedUnit));

      // An empty column and a page with no unit column at all are different
      // facts, and only the layout knows which one this is. Screen 05's GGT row
      // says the unit column is empty on this line, and it can say it because
      // this page has a column starting to the right of the value that this
      // line put nothing in.
      const unitColumnBlank =
        printedUnit === '' &&
        columns.some((column) => column > valueCell.endX && column < valueCell.endX + 160);

      const flags: RowFlag[] = [];
      if (analyte === null) flags.push('new_analyte');
      if (censored) flags.push('value_censored');
      else if (!valueParsed) flags.push('value_ambiguous');
      if (printedUnit === '') flags.push('unit_missing');
      else if (!unitKnown) flags.push('unit_unknown');
      if (!reference) flags.push('reference_missing');
      if (optical) flags.push('optical_recognition');

      // Confidence is about how cleanly the LINE was read and never about
      // whether the catalogue happens to hold the analyte. A label read
      // perfectly off a sheet that names something new is a perfect read of a
      // new thing: it carries `new_analyte`, which is a fact and not a doubt,
      // and screen 05 draws it as "Read cleanly, but new" with its save control
      // live. Penalising it here would have blocked the one row the wireframe
      // is explicit about not blocking.
      const confidence = confidenceOf({
        valueParsed: valueParsed && !censored,
        unitKnown,
        referenceParsed: reference !== null,
        optical,
      });
      if (confidence < CONFIDENCE_THRESHOLD) flags.push('low_confidence');

      rows.push({
        ordinal: rows.length + 1,
        page: page.page,
        analyte: analyte ? analyte.key : null,
        printedLabel: label,
        printedValue,
        printedUnit,
        reference,
        unitColumnBlank,
        sampleDate: panelDate,
        confidence,
        flags,
        excerpt: excerptAround(lines, index),
      });
    }
  }

  // A panel date found on page 3 belongs to the rows read off page 1 too.
  if (panelDate !== null) {
    for (const row of rows) if (row.sampleDate === null) row.sampleDate = panelDate;
  }
  for (const row of rows) {
    if (row.sampleDate === null && !row.flags.includes('date_missing')) {
      row.flags.push('date_missing');
      if (!row.flags.includes('low_confidence')) row.flags.push('low_confidence');
    }
  }

  return { rows, refusals, panelDate, laboratory, census: census(input.pages) };
}
