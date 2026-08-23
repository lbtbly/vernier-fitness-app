import {
  COLUMNS,
  type FixtureLine,
  GARBLED_PAGE,
  PANEL_PAGE_ONE,
  PANEL_PAGE_TWO,
} from './lab-fixture';

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

/**
 * F62's sheet, as a real PDF: three results with a garbled digit on one of
 * them, uploaded through the shipped file field by the end-to-end spec.
 */
export function garbledPanelPdf(): Uint8Array {
  return buildLabPdf([GARBLED_PAGE]);
}

/**
 * A page that carries INK and no text layer, which is what a photocopy is.
 *
 * `buildLabPdf(..., 1)` appends a page with an empty content stream. That is an
 * image-only page by F65's census, which counts non-whitespace characters, and
 * it is also a page with nothing on it: optical recognition reads a blank sheet
 * and returns no words, correctly, so it could never prove the other half of
 * F65, that every RECOGNISED row arrives flagged.
 *
 * So this draws the analyte lines with @napi-rs/canvas, embeds the pixels as an
 * image XObject, and gives the page no text at all. The census counts zero
 * characters on it, the router sends it to recognition, and recognition has
 * something to read. The package is already a dependency of the scanned-page
 * branch, so the fixture installs nothing.
 *
 * The renderer runs at 150 dpi equivalent and the app rasterises at scale 2,
 * which is the geometry the research note measured tesseract against.
 */
export async function imageOnlyPdf(lines: string[] = SCANNED_LINES): Promise<Uint8Array> {
  const { createCanvas } = await import('@napi-rs/canvas');
  const width = 1240;
  const height = 1754;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#000000';
  context.font = '32px Helvetica';
  lines.forEach((line, index) => {
    context.fillText(line, 90, 160 + index * 60);
  });

  // Raw grayscale, one byte a pixel, deflated. No JPEG, no second dependency,
  // and DeviceGray is what a laboratory photocopy is anyway.
  const pixels = context.getImageData(0, 0, width, height).data;
  const grey = Buffer.alloc(width * height);
  for (let at = 0; at < grey.length; at += 1) {
    const red = pixels[at * 4];
    const green = pixels[at * 4 + 1];
    const blue = pixels[at * 4 + 2];
    grey[at] = Math.round((red * 299 + green * 587 + blue * 114) / 1000);
  }
  const { deflateSync } = await import('node:zlib');
  const compressed = deflateSync(grey);

  const content = `q ${PAGE_WIDTH} 0 0 ${PAGE_HEIGHT} 0 0 cm /Im0 Do Q`;
  const objects: Array<{ head: string; stream?: Buffer }> = [
    { head: '<< /Type /Catalog /Pages 2 0 R >>' },
    { head: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>' },
    {
      head:
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        '/Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>',
    },
    { head: `<< /Length ${Buffer.byteLength(content, 'latin1')} >>`, stream: Buffer.from(content, 'latin1') },
    {
      head:
        `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} ` +
        `/ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${compressed.length} >>`,
      stream: compressed,
    },
  ];

  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n', 'latin1')];
  let at = parts[0].length;
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(at);
    const opens = Buffer.from(`${index + 1} 0 obj\n${object.head}\n`, 'latin1');
    parts.push(opens);
    at += opens.length;
    if (object.stream) {
      const before = Buffer.from('stream\n', 'latin1');
      const after = Buffer.from('\nendstream\n', 'latin1');
      parts.push(before, object.stream, after);
      at += before.length + object.stream.length + after.length;
    }
    const closes = Buffer.from('endobj\n', 'latin1');
    parts.push(closes);
    at += closes.length;
  });

  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) xref += `${String(offset).padStart(10, '0')} 00000 n \n`;
  parts.push(Buffer.from(xref, 'latin1'));
  parts.push(
    Buffer.from(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${at}\n%%EOF\n`, 'latin1'),
  );

  return new Uint8Array(Buffer.concat(parts));
}

/**
 * What the photocopied page says. Four analyte lines with wide gaps between the
 * columns, because the parser reads a layout and two cells a hair apart are one
 * cell to it.
 */
export const SCANNED_LINES = [
  'Laboratoire Cerballiance Paris 11',
  'Prelevement du 12/08/2026',
  'Glycemie a jeun          0,97      g/L      0,70 - 1,10',
  'Hemoglobine glyquee      5,4       %        4,0 - 5,6',
  'Ferritine                186       ug/L     30 - 400',
];
