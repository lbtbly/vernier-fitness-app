import { extractText, getDocumentProxy } from 'unpdf';
import { describe, expect, it } from 'vitest';
import { PAGE_HEIGHT, PAGE_WIDTH, pdfString, renderPdf, textWidth, wrap } from '@/lib/backup/pdf';
import { type ReportInput, buildHealthReport, renderHealthReport } from '@/lib/backup/report';
import { strings } from '@/lib/strings';

/**
 * The report, proven by being READ BACK with a parser that has never heard of
 * the writer.
 *
 * `unpdf` is already in this tree because slice 7 uses it to extract a
 * laboratory PDF, and here it is pointed at ours. That is the whole reason this
 * test is worth anything: a structural assertion over bytes we just wrote would
 * prove the writer agrees with itself, which is the shape of pass this project
 * has hit seven times. A cross-reference table with one wrong offset renders a
 * blank page in Preview and fails HERE, in the parser, before it ever reaches
 * the owner.
 *
 * WHAT WOULD MAKE THIS GO RED: any change to the object numbering, the stream
 * lengths or the xref offsets. Those were each broken on purpose once while
 * this was written, and each one turned this file red.
 */

const INPUT: ReportInput = {
  preparedAt: new Date('2026-08-23T09:14:00+02:00'),
  timeZone: 'Europe/Paris',
  body: [
    {
      metric: 'weight',
      value: 85.9,
      rawValue: '85.9',
      rawUnit: 'kg',
      unit: 'kg',
      conversionFactor: null,
      source: 'withings',
      measuredAt: '2026-08-23T06:54:00.000Z',
      referenceText: null,
    },
    {
      metric: 'waist',
      value: 101.5,
      rawValue: '101.5',
      rawUnit: 'cm',
      unit: 'cm',
      conversionFactor: null,
      source: 'manual',
      measuredAt: '2026-08-23T06:54:34.000Z',
      referenceText: null,
    },
  ],
  labs: [
    {
      metric: 'cholesterol_total',
      label: 'Total cholesterol',
      value: 3.72,
      rawValue: '1.44',
      rawUnit: 'g/L',
      unit: 'mmol/L',
      conversionFactor: 2.586,
      source: 'lab_pdf',
      measuredAt: '2026-07-14T08:00:00.000Z',
      referenceText: '< 5.2',
    },
  ],
};

describe('the health report', () => {
  it('reads back as text through a real PDF parser', async () => {
    const bytes = renderHealthReport(INPUT);
    const document = await getDocumentProxy(new Uint8Array(bytes));
    const { totalPages, text } = await extractText(document, { mergePages: true });
    console.log(`${bytes.length} bytes, ${totalPages} page(s)\n${text.slice(0, 600)}`);

    expect(totalPages).toBeGreaterThanOrEqual(1);
    expect(text).toContain(strings.data.reportTitle);
    expect(text).toContain('Sunday 23 August');
    expect(text).toContain('85.9');
    expect(text).toContain('101.5');
    expect(text).toContain('Total cholesterol');
    // The converted value never appears alone: the printed original and the
    // factor are on the line with it, which is DESIGN.md section 5's second
    // decision applied to a document.
    expect(text).toContain('1.44');
    expect(text).toContain('2.586');
    expect(text).toContain('< 5.2');
  });

  it('names the source of every value it prints', async () => {
    const document = await getDocumentProxy(new Uint8Array(renderHealthReport(INPUT)));
    const { text } = await extractText(document, { mergePages: true });
    expect(text).toContain('Withings');
    expect(text).toContain('Manual');
    expect(text).toContain('23 Aug');
  });

  it('says a section is empty rather than printing nothing or a zero', async () => {
    const empty = renderHealthReport({ ...INPUT, body: [], labs: [] });
    const document = await getDocumentProxy(new Uint8Array(empty));
    const { text } = await extractText(document, { mergePages: true });
    console.log(text.slice(0, 400));
    expect(text).toContain(strings.data.reportBodyEmpty);
    expect(text).toContain(strings.data.reportLabsEmpty);
    expect(text).not.toContain('0.0');
  });

  it('carries the boundary sentence, and makes no claim about what a number means', async () => {
    const document = await getDocumentProxy(new Uint8Array(renderHealthReport(INPUT)));
    const { text } = await extractText(document, { mergePages: true });
    expect(text).toContain('not a medical document');
    expect(text.toLowerCase()).not.toContain('you have');
    expect(text.toLowerCase()).not.toContain('you should');
  });

  it('paginates a long record and numbers every page', async () => {
    const many: ReportInput = {
      ...INPUT,
      labs: Array.from({ length: 60 }, (_, index) => ({
        ...INPUT.labs[0],
        label: `Analyte number ${index + 1}`,
      })),
    };
    const bytes = renderHealthReport(many);
    const document = await getDocumentProxy(new Uint8Array(bytes));
    const { totalPages, text } = await extractText(document, { mergePages: true });
    console.log(`${bytes.length} bytes over ${totalPages} pages`);
    expect(totalPages).toBeGreaterThan(1);
    expect(text).toContain(`1 of ${totalPages}`);
    expect(text).toContain(`${totalPages} of ${totalPages}`);
    expect(text).toContain('Analyte number 60');
  });

  it('is A4, which is the paper this owner prints on', async () => {
    const document = await getDocumentProxy(new Uint8Array(renderHealthReport(INPUT)));
    const page = await document.getPage(1);
    const [, , width, height] = page.view as number[];
    expect(Math.round(width)).toBe(Math.round(PAGE_WIDTH));
    expect(Math.round(height)).toBe(Math.round(PAGE_HEIGHT));
  });
});

describe('the PDF writer underneath it', () => {
  it('escapes the three characters a content stream cannot take raw', () => {
    expect(pdfString('a (parenthesis) and a \\ backslash')).toBe(
      'a \\(parenthesis\\) and a \\\\ backslash',
    );
  });

  it('turns a character outside WinAnsi into a question mark rather than breaking the stream', () => {
    expect(pdfString('a ✓ tick')).toBe('a ? tick');
    expect(pdfString('café')).toBe('caf\\351');
  });

  it('wraps on real glyph widths, so no line runs past the margin', () => {
    const width = 200;
    const lines = wrap(
      'The nightly archive holds a database dump, the media volume and a version manifest.',
      10.5,
      false,
      width,
    );
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(textWidth(line, 10.5, false)).toBeLessThanOrEqual(width);
  });

  it('draws every block kind without losing one', () => {
    const bytes = renderPdf({
      title: 'Every block',
      footer: 'Vernier',
      blocks: [
        { kind: 'title', text: 'A title' },
        { kind: 'subtitle', text: 'A subtitle' },
        { kind: 'rule' },
        { kind: 'heading', text: 'A heading' },
        { kind: 'text', text: 'A paragraph.' },
        { kind: 'row', label: 'A label', value: 'A value', note: 'A note' },
        { kind: 'space', size: 20 },
      ],
    });
    const text = bytes.toString('latin1');
    for (const drawn of ['A title', 'A subtitle', 'A heading', 'A paragraph.', 'A label', 'A value', 'A note']) {
      expect(text).toContain(`(${drawn}) Tj`);
    }
  });

  it('records an offset for every object it wrote', () => {
    const bytes = renderPdf({ title: 'x', footer: 'y', blocks: [{ kind: 'text', text: 'one line' }] });
    const text = bytes.toString('latin1');
    const size = Number(/\/Size (\d+)/.exec(text)![1]);
    const startxref = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(startxref, startxref + 4)).toBe('xref');
    // Line 0 is `xref`, line 1 is the subsection header, line 2 is object zero's
    // free entry. The objects this file wrote start at line 3.
    const rows = text.slice(startxref).split('\n').slice(3, size + 2);
    expect(rows).toHaveLength(size - 1);
    for (const [index, row] of rows.entries()) {
      const offset = Number(row.slice(0, 10));
      // Every offset points at the object that claims that number.
      expect(text.slice(offset, offset + 8)).toContain(`${index + 1} 0 obj`);
    }
  });

  it('builds the same document for the same input, twice', () => {
    const first = buildHealthReport(INPUT);
    const second = buildHealthReport(INPUT);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});
