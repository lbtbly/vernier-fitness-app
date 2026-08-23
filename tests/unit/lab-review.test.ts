import { describe, expect, it } from 'vitest';
import { extractPanel, refusedPages } from '@/lib/lab-parse';
import {
  type ReviewDocument,
  type ReviewRow,
  canSave,
  isSingleRowShape,
  previewConversion,
  reviewSections,
  rowsInWrite,
  tally,
} from '@/lib/lab-review';
import { BUILT_IN_ANALYTES } from '@/lib/labs';
import { panelPages } from './lab-fixture';

/**
 * The rule the whole review screen rests on: A WRITE CARRIES ONE ROW.
 *
 * This is the test the dispatch asked for by name, "write the test that proves
 * the control does not exist". It cannot prove a control is absent from a screen
 * that has not been built yet, so it proves something stronger and permanent:
 * that there is no request shape which would apply a second row, whatever a
 * screen sends.
 */

const UNITS = ['mmol/L', 'g/L', 'mg/L', 'µg/L', 'U/L', 'UI/L', '%'];

function reviewOf(): ReviewDocument {
  const read = extractPanel({
    pages: panelPages(),
    catalogue: BUILT_IN_ANALYTES,
    knownUnits: UNITS,
  });
  const rows: ReviewRow[] = read.rows.map((row) => ({
    ...row,
    converted: previewConversion(
      BUILT_IN_ANALYTES.find((analyte) => analyte.key === row.analyte) ?? null,
      row.printedValue,
      row.printedUnit,
    ),
    decision: 'waiting',
    measurementId: null,
    decidedAt: null,
    corrected: false,
    chosenUnit: '',
  }));
  return {
    id: 'lab_00000000-0000-4000-8000-000000000000',
    uploadedAt: new Date('2026-08-12T19:02:00Z').toISOString(),
    fileName: 'analyses-12-08-2026.pdf',
    byteSize: 1_887_436,
    pageCount: 2,
    laboratory: 'Laboratoire Cerballiance Paris 11',
    panelDate: '2026-08-12T12:00:00.000Z',
    mode: 'text',
    state: 'review',
    retention: null,
    fileRemoved: false,
    hasFile: true,
    refusals: read.refusals.length,
    refusalPages: refusedPages(read.refusals),
    census: read.census,
    rows,
  };
}

describe('one row per write, and no shape of request that carries two', () => {
  it('counts a single ordinal as one', () => {
    expect(rowsInWrite({ documentId: 'lab_x', ordinal: 3, action: 'save' })).toBe(1);
  });

  it('counts a batch as what it is, so the refusal can name the number', () => {
    // Every shape somebody would reach for to write a Save All control. Each one
    // comes back as more than one and /api/labs/row refuses it with the count in
    // the message. THIS IS THE TEST THAT GOES RED if a plural field is ever
    // ignored rather than counted, because an ignored field is a field whose
    // rows get written one at a time by a loop nobody reviewed.
    expect(rowsInWrite({ documentId: 'lab_x', rows: [1, 2, 3] })).toBe(3);
    expect(rowsInWrite({ documentId: 'lab_x', ordinals: [1, 2] })).toBe(2);
    expect(rowsInWrite({ documentId: 'lab_x', entries: [{}, {}, {}, {}] })).toBe(4);
    expect(rowsInWrite({ documentId: 'lab_x', values: [] })).toBe(0);
    expect(rowsInWrite({ documentId: 'lab_x', all: true })).toBe(2);
    expect(rowsInWrite({ documentId: 'lab_x', acceptAll: true })).toBe(2);
    // A plural field beside an ordinal ADDS to the count rather than being
    // ignored. An ignored field is a field somebody writes a loop for later.
    expect(rowsInWrite({ documentId: 'lab_x', ordinal: 1, rows: [2, 3] })).toBe(3);
    expect(rowsInWrite({ documentId: 'lab_x', ordinal: 1, rows: 'all' })).toBe(3);
  });

  it('refuses a batch of one, which is what a Save All degrades to under test', () => {
    // `rows: [3]` counts to one and is still a batch request. The count alone
    // would let it through, so the route asks the shape question too. THIS is
    // the assertion that goes red if somebody deletes `isSingleRowShape` because
    // the count looked sufficient.
    expect(rowsInWrite({ documentId: 'lab_x', rows: [3] })).toBe(1);
    expect(isSingleRowShape({ documentId: 'lab_x', rows: [3] })).toBe(false);
    expect(isSingleRowShape({ documentId: 'lab_x', ordinal: 3, action: 'save' })).toBe(true);
    expect(isSingleRowShape({ documentId: 'lab_x', ordinal: 3, acceptAll: false })).toBe(false);
    expect(isSingleRowShape({ documentId: 'lab_x' })).toBe(false);
    expect(isSingleRowShape(null)).toBe(false);
  });

  it('counts a body with no ordinal as none, so it is refused rather than guessed at', () => {
    expect(rowsInWrite({ documentId: 'lab_x' })).toBe(0);
    expect(rowsInWrite({ documentId: 'lab_x', ordinal: '3' })).toBe(0);
    expect(rowsInWrite({ documentId: 'lab_x', ordinal: 1.5 })).toBe(0);
    expect(rowsInWrite(null)).toBe(0);
    expect(rowsInWrite('save everything')).toBe(0);
  });

  it('accepts exactly one shape, across every shape tried', () => {
    // The census this route's whole promise rests on: every body a caller might
    // send, and the two questions the route asks of each. Printed, because a
    // rule nobody can read the population of is a rule nobody can check.
    const shapes: unknown[] = [
      { documentId: 'lab_x', ordinal: 1, action: 'save' },
      { documentId: 'lab_x', ordinal: 1, rows: [1, 2] },
      { documentId: 'lab_x', ordinal: 1, all: true },
      { documentId: 'lab_x', rows: [1] },
      { documentId: 'lab_x', rows: [1, 2, 3] },
      { documentId: 'lab_x' },
      {},
      null,
      'save everything',
    ];
    const accepted = shapes.filter((shape) => rowsInWrite(shape) === 1 && isSingleRowShape(shape));
    console.log(
      `lab-review: ${shapes.length} request shapes tried, counts ${shapes
        .map((shape) => rowsInWrite(shape))
        .join(', ')}, accepted ${accepted.length}`,
    );
    // One shape out of nine is accepted. It is the one with a single ordinal on
    // it and no plural field anywhere.
    expect(accepted).toHaveLength(1);
    expect(accepted[0]).toEqual({ documentId: 'lab_x', ordinal: 1, action: 'save' });
  });
});

describe('a row that cannot be saved as it stands', () => {
  it('blocks the flagged rows and leaves the clean ones savable', () => {
    const review = reviewOf();
    const savable = review.rows.filter((row) => canSave(row)).map((row) => row.printedLabel);
    const blocked = review.rows.filter((row) => !canSave(row)).map((row) => row.printedLabel);
    console.log(`lab-review: savable ${savable.join(', ')}`);
    console.log(`lab-review: blocked ${blocked.join(', ')}`);
    // The population is not empty on either side, which is what makes the two
    // assertions mean anything.
    expect(savable.length).toBeGreaterThan(0);
    expect(blocked).toContain('G.G.T');
    expect(blocked).toContain('CRP');
    expect(savable).toContain('Cholesterol LDL calcule');
    // The new analyte is savable: it read cleanly, it is simply new.
    expect(savable).toContain('Apolipoproteine B');
  });

  it('refuses to save a row that has already been decided', () => {
    const review = reviewOf();
    const row = review.rows.find((entry) => canSave(entry))!;
    expect(canSave({ ...row, decision: 'saved' })).toBe(false);
    expect(canSave({ ...row, decision: 'rejected' })).toBe(false);
  });
});

describe('the counts both screens read', () => {
  it('adds up to the number of rows, plus the refusals which are not rows', () => {
    const review = reviewOf();
    const decided: ReviewDocument = {
      ...review,
      rows: review.rows.map((row, index) =>
        index < 3
          ? { ...row, decision: 'saved', measurementId: `m${index}`, corrected: index === 0 }
          : index === 3
            ? { ...row, decision: 'rejected' }
            : row,
      ),
    };
    const counted = tally(decided);
    console.log(`lab-review: tally ${JSON.stringify(counted)}`);
    expect(counted.saved).toBe(3);
    expect(counted.rejected).toBe(1);
    expect(counted.corrected).toBe(1);
    expect(counted.saved + counted.rejected + counted.waiting).toBe(counted.total);
    // A refusal is not a row and is never counted as one. F60 turns on this.
    expect(counted.refused).toBe(1);
    expect(counted.total).toBe(decided.rows.length);
  });

  it('puts what needs the owner first and what he has decided last', () => {
    const review = reviewOf();
    const sections = reviewSections(review);
    expect(sections.needsEyes.length + sections.readCleanly.length + sections.decided.length).toBe(
      review.rows.length,
    );
    expect(sections.decided).toHaveLength(0);
    expect(sections.needsEyes.map((row) => row.printedLabel)).toContain('G.G.T');
  });
});

describe('the conversion shown before anything is stored', () => {
  it('previews what the row would store, factor and all', () => {
    const review = reviewOf();
    const ldl = review.rows.find((row) => row.analyte === 'ldl_cholesterol')!;
    // F61's three numbers, on screen while the owner is still deciding. A
    // conversion he only sees afterwards is a conversion he was never asked
    // about.
    expect(ldl.printedValue).toBe('1,44');
    expect(ldl.printedUnit).toBe('g/L');
    expect(ldl.converted).toEqual({ value: 3.72384, unit: 'mmol/L', factor: 2.586 });
  });

  it('previews nothing for a row whose unit the sheet left empty', () => {
    const ggt = reviewOf().rows.find((row) => row.analyte === 'ggt')!;
    expect(ggt.converted).toBeNull();
  });
});
