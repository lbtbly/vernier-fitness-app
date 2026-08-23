import { type PdfBlock, type PdfDocument, renderPdf } from './pdf';
import { metricLabel, sourceLabel, unitName, valueLine } from '@/lib/display';
import { longDate, shortDate } from '@/lib/format';
import { strings } from '@/lib/strings';

/**
 * The one document this product produces for a human hand.
 *
 * PURE, AND THAT IS WHY IT IS SEPARATE FROM THE ROUTE. What goes into the
 * report is a decision about what the owner's record says; how it becomes a PDF
 * is arithmetic over glyph widths. Keeping them apart is what lets the whole
 * report be graded in the unit suite with no database, and lets the PDF be
 * graded by reading it back with a parser that has never heard of this file.
 *
 * ABSENCE IS DRAWN, NEVER SMOOTHED, here as everywhere else. A metric with no
 * reading says so; it does not carry the last one forward and it does not print
 * a zero. DESIGN.md section 5's second decision governs a document exactly as it
 * governs a chart.
 */

export type ReportValue = {
  metric: string;
  value: number | null;
  rawValue: string;
  rawUnit: string;
  unit: string;
  conversionFactor: number | null;
  source: string;
  measuredAt: string;
  referenceText: string | null;
  label?: string;
};

export type ReportInput = {
  preparedAt: Date;
  timeZone: string;
  /** Latest per metric: weight, waist, and whatever else stands today. */
  body: ReportValue[];
  /** The newest panel, one row per analyte, in the order the sheet printed them. */
  labs: ReportValue[];
};

function valueRow(entry: ReportValue, timeZone: string): PdfBlock {
  const label = entry.label ?? metricLabel(entry.metric);
  // `valueLine` rather than `valueLabel`, because a row in a document has one
  // column for the number and its unit together, which is the case that
  // function exists for.
  const value = valueLine({ value: entry.value, rawValue: entry.rawValue, unit: entry.unit });
  const notes: string[] = [
    strings.data.reportSource(sourceLabel(entry.source), shortDate(new Date(entry.measuredAt), timeZone)),
  ];
  if (entry.referenceText) notes.push(strings.data.reportReference(entry.referenceText));
  if (entry.conversionFactor !== null && entry.rawUnit !== entry.unit) {
    notes.push(
      strings.data.reportConverted(
        `${entry.rawValue} ${unitName(entry.rawUnit)}`,
        String(entry.conversionFactor),
        value,
      ),
    );
  }
  return { kind: 'row', label, value, note: notes.join('. ') };
}

export function buildHealthReport(input: ReportInput): PdfDocument {
  const blocks: PdfBlock[] = [
    { kind: 'title', text: strings.data.reportTitle },
    {
      kind: 'subtitle',
      text: strings.data.reportSubtitle(longDate(input.preparedAt, input.timeZone)),
    },
    { kind: 'rule' },
    { kind: 'heading', text: strings.data.reportBodyHeading },
  ];

  if (input.body.length === 0) {
    blocks.push({ kind: 'text', text: strings.data.reportBodyEmpty });
  } else {
    for (const entry of input.body) blocks.push(valueRow(entry, input.timeZone));
  }

  blocks.push({ kind: 'heading', text: strings.data.reportLabsHeading });
  if (input.labs.length === 0) {
    blocks.push({ kind: 'text', text: strings.data.reportLabsEmpty });
  } else {
    for (const entry of input.labs) blocks.push(valueRow(entry, input.timeZone));
  }

  blocks.push(
    { kind: 'heading', text: strings.data.reportAboutHeading },
    { kind: 'text', text: strings.data.reportAbout },
    { kind: 'space', size: 6 },
    { kind: 'text', text: strings.data.reportProvenance },
  );

  return {
    title: strings.data.reportTitle,
    footer: strings.data.reportFooter,
    blocks,
  };
}

export function renderHealthReport(input: ReportInput): Buffer {
  return renderPdf(buildHealthReport(input));
}
