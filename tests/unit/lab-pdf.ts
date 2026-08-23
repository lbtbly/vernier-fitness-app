import { COLUMNS, type FixtureLine, PANEL_PAGE_ONE, PANEL_PAGE_TWO } from './lab-fixture';

/**
 * A real PDF, built here, with a real text layer laid out in columns.
 *
 * The parser's unit tests hand `extractPanel` items directly, which grades the
 * rules and says nothing about whether `unpdf` produces items in the shape those
 * rules expect. This closes that gap without a fixture binary in the repository
 * and without a PDF library: a PDF is a text format with an offset table, and
 * the twenty lines below emit one.
 *
 * WHY IT MATTERS THAT IT IS REAL. The whole slice rests on `unpdf` reporting x
 * and y per text item so an empty unit column can be told from a missing one. If
 * that reporting is not what the parser assumes, every unit test still passes
 * and the product reads nothing. A generated PDF run through the shipped library
 * is the cheapest way to find that out, and it costs no container and no
 * browser.
 *
 * The same bytes are used by the end-to-end spec, which uploads them through the
 * shipped screen.
 */

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const FONT_SIZE = 9;
const CHARACTER_WIDTH = 4.8;

/**
 * A string as a PDF literal: parentheses and backslashes escaped, anything
 * above ASCII written as an octal WinAnsi code. The font below declares
 * WinAnsiEncoding, so µ at 0xB5 and é at 0xE9 come back as themselves.
 */
function literal(text: string): string {
  let out = '';
  for (const character of text) {
    const code = character.codePointAt(0)!;
    if (character === '(' || character === ')' || character === '\\') out += `\\${character}`;
    else if (code < 128) out += character;
    else if (code === 0xb5 || character === 'µ') out += '\\265';
    else if (code < 256) out += `\\${code.toString(8).padStart(3, '0')}`;
    else out += '?';
  }
  return out;
}

type Placed = { text: string; x: number; y: number };

/** The same layout the item fixture uses, so the two describe one sheet. */
function placeLines(lines: FixtureLine[], top = 760): Placed[] {
  const placed: Placed[] = [];
  lines.forEach((line, index) => {
    const y = top - index * 16;
    if (line.plain !== undefined) {
      placed.push({ text: line.plain, x: COLUMNS.label, y });
      return;
    }
    if (line.label !== undefined) {
      placed.push({ text: line.label, x: COLUMNS.label, y });
      placed.push({
        text: ' .........',
        x: COLUMNS.label + line.label.length * CHARACTER_WIDTH,
        y,
      });
    }
    if (line.value !== undefined) placed.push({ text: line.value, x: COLUMNS.value, y });
    if (line.unit !== undefined) placed.push({ text: line.unit, x: COLUMNS.unit, y });
    if (line.reference !== undefined) placed.push({ text: line.reference, x: COLUMNS.reference, y });
  });
  return placed;
}

function contentStream(placed: Placed[]): string {
  return placed
    .map(
      (item) =>
        `BT /F1 ${FONT_SIZE} Tf 1 0 0 1 ${item.x} ${item.y} Tm (${literal(item.text)}) Tj ET`,
    )
    .join('\n');
}

/**
 * A PDF with one page per list of lines, and a page carrying no text at all for
 * every entry in `blankPages`.
 *
 * A page with an empty content stream is what a scanned page looks like to a
 * text extractor: the image is there, the text layer is not. That is F65's
 * input, and building it here means the image-only branch is exercised against
 * the real library rather than against a hand-made item list.
 */
export function buildLabPdf(pages: FixtureLine[][], blankPages = 0): Uint8Array {
  const streams = [...pages.map((lines) => contentStream(placeLines(lines)))];
  for (let index = 0; index < blankPages; index += 1) streams.push('');

  const objects: string[] = [];
  const pageCount = streams.length;
  // 1 catalogue, 2 pages, then per page: the page object and its content
  // stream, then the font last.
  const fontNumber = 3 + pageCount * 2;
  const pageNumbers = streams.map((_, index) => 3 + index * 2);

  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(
    `<< /Type /Pages /Kids [${pageNumbers.map((number) => `${number} 0 R`).join(' ')}] /Count ${pageCount} >>`,
  );
  streams.forEach((stream, index) => {
    const contentNumber = pageNumbers[index] + 1;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        `/Resources << /Font << /F1 ${fontNumber} 0 R >> >> /Contents ${contentNumber} 0 R >>`,
    );
    objects.push(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
  });
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');

  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, 'latin1'));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefAt = Buffer.byteLength(body, 'latin1');
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) xref += `${String(offset).padStart(10, '0')} 00000 n \n`;
  body += xref;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;

  return new Uint8Array(Buffer.from(body, 'latin1'));
}

/** The panel the wireframe draws: two pages with a text layer. */
export function panelPdf(): Uint8Array {
  return buildLabPdf([PANEL_PAGE_ONE, PANEL_PAGE_TWO]);
}

/** The same panel with a third page that carries no text layer at all. */
export function scannedPanelPdf(): Uint8Array {
  return buildLabPdf([PANEL_PAGE_ONE, PANEL_PAGE_TWO], 1);
}
