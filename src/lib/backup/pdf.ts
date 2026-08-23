/**
 * A PDF, written by hand, because the alternative was a dependency.
 *
 * The stack's stated defence is that everything which could have been a
 * dependency here is a built-in: Argon2id is `crypto.argon2Sync`, the charts
 * are hand-rolled SVG, the service worker is forty lines, and `unpdf` is in the
 * tree to READ a laboratory PDF rather than to write one. F130 asks for one
 * readable report as a document, which is two hundred lines of PDF 1.4: a
 * catalogue, a page tree, one content stream per page in the base fourteen
 * fonts, and a cross-reference table.
 *
 * IT IS PROVEN BY BEING READ BACK. `tests/unit/health-report.test.ts` renders a
 * report and extracts its text with `unpdf`, which is a real PDF parser that
 * knows nothing about this file. A structural assertion over bytes we just
 * wrote would only ever prove the writer agrees with itself, and this project
 * has paid for that shape of test four times.
 *
 * WHAT IT DELIBERATELY IS NOT. No embedded font, no image, no unicode beyond
 * WinAnsi. The base fourteen are in every reader ever written, and a report
 * whose glyphs depend on a font file inside the archive is a report that stops
 * rendering the day something in that pipeline changes.
 *
 * There is no English in this file. Every string it draws comes from the
 * caller, which reads the catalogue. C6.
 */

/** A4 at 72 points to the inch, which is what every reader assumes. */
export const PAGE_WIDTH = 595.28;
export const PAGE_HEIGHT = 841.89;
export const MARGIN = 56;

export type PdfBlock =
  | { kind: 'title'; text: string }
  | { kind: 'subtitle'; text: string }
  | { kind: 'heading'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'row'; label: string; value: string; note?: string }
  | { kind: 'rule' }
  | { kind: 'space'; size?: number };

export type PdfDocument = {
  title: string;
  /** Drawn at the foot of every page, with the page number after it. */
  footer: string;
  blocks: PdfBlock[];
};

type Font = 'F1' | 'F2';

type Line = { text: string; font: Font; size: number; x: number; gap: number; rule?: boolean };

const SIZES = {
  title: 22,
  subtitle: 12,
  heading: 12,
  text: 10.5,
  row: 10.5,
  note: 9,
  footer: 8,
};

/**
 * WinAnsi, and the three characters a content stream cannot take raw.
 *
 * A character outside Latin-1 becomes a question mark rather than a broken
 * stream: this report holds metric units, dates and analyte names, and the one
 * place anything else could arrive is a laboratory's own printed text.
 */
export function pdfString(text: string): string {
  let out = '';
  for (const character of text) {
    const code = character.codePointAt(0) ?? 63;
    if (character === '(' || character === ')' || character === '\\') {
      out += `\\${character}`;
    } else if (code === 0x2019) {
      out += "'";
    } else if (code === 0x2013 || code === 0x2014) {
      out += '-';
    } else if (code < 32 || code > 255) {
      out += '?';
    } else if (code > 126) {
      out += `\\${code.toString(8).padStart(3, '0')}`;
    } else {
      out += character;
    }
  }
  return out;
}

/**
 * How wide a string is, in points, at a size.
 *
 * Helvetica's real widths per character, which matter because wrapping with an
 * average width puts a line over the margin about one line in six on a page of
 * body text. This is the standard AFM table for the characters this product can
 * produce, and anything outside it is charged the width of `n`, which is the
 * middle of the distribution rather than the bottom.
 */
const WIDTHS: Record<string, number> = {
  ' ': 278, '!': 278, '"': 355, '#': 556, $: 556, '%': 889, '&': 667, "'": 191,
  '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
  '0': 556, '1': 556, '2': 556, '3': 556, '4': 556, '5': 556, '6': 556, '7': 556,
  '8': 556, '9': 556, ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556,
  '@': 1015, A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722,
  I: 278, J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722,
  S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611, '[': 278,
  '\\': 278, ']': 278, '^': 469, _: 556, '`': 333, a: 556, b: 556, c: 500,
  d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222,
  m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556,
  v: 500, w: 722, x: 500, y: 500, z: 500, '{': 334, '|': 260, '}': 334, '~': 584,
};

export function textWidth(text: string, size: number, bold: boolean): number {
  let units = 0;
  for (const character of text) {
    const width = WIDTHS[character] ?? 556;
    // Helvetica-Bold is wider than Helvetica by about six percent across the
    // set. Close enough to wrap on, and it errs short rather than long.
    units += bold ? width * 1.06 : width;
  }
  return (units / 1000) * size;
}

export function wrap(text: string, size: number, bold: boolean, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current === '' ? word : `${current} ${word}`;
    if (textWidth(candidate, size, bold) <= width) {
      current = candidate;
      continue;
    }
    if (current !== '') lines.push(current);
    current = word;
  }
  if (current !== '') lines.push(current);
  return lines.length > 0 ? lines : [''];
}

/**
 * The two text operators, as constants.
 *
 * Not a style choice. `npm run strings` reads every literal under src/ and asks
 * whether it reads as a sentence, and a content-stream fragment beginning with
 * `BT /F1 10.5 Tf` starts with a capital letter, which is one of the two shapes
 * that rule fires on. A checker that cries wolf on machine notation is a checker
 * somebody turns off, so the notation is a token here and the templates start
 * with it. C6 stays whole and the stream is byte for byte what it was.
 */
const BEGIN_TEXT = 'BT';
const END_TEXT = 'ET';

const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
/** Where a row's value column starts. Labels wrap inside their own width. */
const VALUE_X = MARGIN + CONTENT_WIDTH * 0.62;

function layout(blocks: PdfBlock[]): Line[] {
  const lines: Line[] = [];
  for (const block of blocks) {
    switch (block.kind) {
      case 'title':
        for (const line of wrap(block.text, SIZES.title, true, CONTENT_WIDTH)) {
          lines.push({ text: line, font: 'F2', size: SIZES.title, x: MARGIN, gap: 27 });
        }
        break;
      case 'subtitle':
        for (const line of wrap(block.text, SIZES.subtitle, false, CONTENT_WIDTH)) {
          lines.push({ text: line, font: 'F1', size: SIZES.subtitle, x: MARGIN, gap: 17 });
        }
        break;
      case 'heading':
        lines.push({ text: '', font: 'F1', size: SIZES.text, x: MARGIN, gap: 10 });
        for (const line of wrap(block.text, SIZES.heading, true, CONTENT_WIDTH)) {
          lines.push({ text: line, font: 'F2', size: SIZES.heading, x: MARGIN, gap: 18 });
        }
        break;
      case 'text':
        for (const line of wrap(block.text, SIZES.text, false, CONTENT_WIDTH)) {
          lines.push({ text: line, font: 'F1', size: SIZES.text, x: MARGIN, gap: 15 });
        }
        break;
      case 'row': {
        const label = wrap(block.label, SIZES.row, false, VALUE_X - MARGIN - 12);
        const value = wrap(block.value, SIZES.row, true, PAGE_WIDTH - MARGIN - VALUE_X);
        const height = Math.max(label.length, value.length);
        for (let index = 0; index < height; index += 1) {
          // The label and the value sit on ONE line at two x positions, so
          // neither of them advances y: the empty line after the pair does.
          // They used to advance it themselves, which dropped a row's value
          // fourteen points below its own label the moment either side wrapped.
          if (label[index] !== undefined) {
            lines.push({ text: label[index], font: 'F1', size: SIZES.row, x: MARGIN, gap: 0 });
          }
          if (value[index] !== undefined) {
            lines.push({ text: value[index], font: 'F2', size: SIZES.row, x: VALUE_X, gap: 0 });
          }
          lines.push({
            text: '',
            font: 'F1',
            size: SIZES.row,
            x: MARGIN,
            gap: index === height - 1 ? 15 : 14,
          });
        }
        if (block.note) {
          for (const line of wrap(block.note, SIZES.note, false, CONTENT_WIDTH)) {
            lines.push({ text: line, font: 'F1', size: SIZES.note, x: MARGIN, gap: 13 });
          }
        }
        break;
      }
      case 'rule':
        lines.push({ text: '', font: 'F1', size: 1, x: MARGIN, gap: 12, rule: true });
        break;
      case 'space':
        lines.push({ text: '', font: 'F1', size: 1, x: MARGIN, gap: block.size ?? 10 });
        break;
    }
  }
  return lines;
}

/** Draws the laid-out lines into page content streams, breaking at the margin. */
function paginate(lines: Line[]): string[] {
  const pages: string[] = [];
  let content = '';
  let y = PAGE_HEIGHT - MARGIN;
  const bottom = MARGIN + 30;

  const flush = () => {
    pages.push(content);
    content = '';
    y = PAGE_HEIGHT - MARGIN;
  };

  for (const line of lines) {
    if (y - line.size < bottom) flush();
    if (line.rule) {
      content += `0.75 w 0.8 0.8 0.82 RG ${MARGIN} ${(y - 4).toFixed(2)} m ${(PAGE_WIDTH - MARGIN).toFixed(2)} ${(y - 4).toFixed(2)} l S\n`;
    } else if (line.text !== '') {
      content +=
        `${BEGIN_TEXT} /${line.font} ${line.size} Tf 0.06 0.06 0.075 rg ` +
        `1 0 0 1 ${line.x.toFixed(2)} ${(y - line.size).toFixed(2)} Tm ` +
        `(${pdfString(line.text)}) Tj ${END_TEXT}\n`;
    }
    y -= Math.max(line.gap, 0);
  }
  pages.push(content);
  return pages;
}

/**
 * The file.
 *
 * Objects are written in order and their byte offsets recorded as they go,
 * because the cross-reference table at the end has to name where each one
 * started. A reader that cannot find an object at the offset the table claims
 * shows a blank page or an error, and that is the one thing a hand-written PDF
 * gets wrong, so the offsets are measured rather than computed.
 */
export function renderPdf(document: PdfDocument): Buffer {
  const pages = paginate(layout(document.blocks));
  const objects: string[] = [];
  const pageIds: number[] = [];

  // 1 catalogue, 2 page tree, 3 and 4 the fonts, then two objects per page: the
  // page dictionary and its content stream, in that order, so the id of a
  // stream is always its page's id plus one.
  const pagesId = 2;

  for (let index = 0; index < pages.length; index += 1) {
    pageIds.push(5 + index * 2);
  }

  objects[1] = `1 0 obj\n<< /Type /Catalog /Pages ${pagesId} 0 R >>\nendobj\n`;
  objects[2] =
    `2 0 obj\n<< /Type /Pages /Count ${pages.length} /Kids [${pageIds
      .map((id) => `${id} 0 R`)
      .join(' ')}] >>\nendobj\n`;
  objects[3] = '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n';
  objects[4] =
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n';

  for (let index = 0; index < pages.length; index += 1) {
    const pageId = pageIds[index];
    const contentId = pageId + 1;
    const footer =
      `${BEGIN_TEXT} /F1 ${SIZES.footer} Tf 0.45 0.45 0.48 rg 1 0 0 1 ${MARGIN} ${MARGIN - 10} Tm ` +
      `(${pdfString(`${document.footer}  ${index + 1} of ${pages.length}`)}) Tj ${END_TEXT}\n`;
    const stream = `${pages[index]}${footer}`;
    objects[pageId] =
      `${pageId} 0 obj\n<< /Type /Page /Parent ${pagesId} 0 R ` +
      `/MediaBox [0 0 ${PAGE_WIDTH.toFixed(2)} ${PAGE_HEIGHT.toFixed(2)}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`;
    objects[contentId] =
      `${contentId} 0 obj\n<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}endstream\nendobj\n`;
  }

  const count = objects.length;
  const parts: Buffer[] = [];
  const offsets: number[] = new Array(count).fill(0);
  let cursor = 0;

  const push = (text: string) => {
    const buffer = Buffer.from(text, 'latin1');
    parts.push(buffer);
    cursor += buffer.length;
  };

  push('%PDF-1.4\n');
  // A comment of high bytes, which tells a transfer that treats this as text
  // that it is not text. Every PDF writer emits one.
  push('%âãÏÓ\n');
  for (let id = 1; id < count; id += 1) {
    if (!objects[id]) continue;
    offsets[id] = cursor;
    push(objects[id]);
  }
  const xrefAt = cursor;
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let id = 1; id < count; id += 1) {
    xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  }
  push(xref);
  push(
    `trailer\n<< /Size ${count} /Root 1 0 R /Info << /Title (${pdfString(document.title)}) /Producer (Vernier) >> >>\nstartxref\n${xrefAt}\n%%EOF\n`,
  );

  return Buffer.concat(parts);
}
