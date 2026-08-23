import { readAnalytes } from '@/db/labs';
import { readLatestPerMetric, readSourceRecordsFor, toView } from '@/db/measurements';
import { renderHealthReport } from '@/lib/backup/report';
import { getConfig } from '@/lib/config';
import { NO_STORE, refuse, sessionOrRefusal } from '@/lib/gate';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';

/**
 * The readable report, as a document.
 *
 * WHAT GOES IN IT IS WHAT STANDS TODAY, one value per metric and one per
 * analyte, each with the source it came from and, for a converted laboratory
 * value, the original the sheet printed and the factor. It is assembled here
 * and rendered by a pure function next door, so the decision about what the
 * record says and the arithmetic over glyph widths are graded separately.
 */
export async function GET() {
  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;

  const { timeZone } = getConfig();
  try {
    const [rows, analytes] = await Promise.all([readLatestPerMetric(timeZone), readAnalytes()]);
    const records = await readSourceRecordsFor(rows);
    const views = rows.map((row) => toView(row, records));
    const byKey = new Map(analytes.map((analyte) => [analyte.key, analyte]));

    const asValue = (view: (typeof views)[number]) => ({
      metric: view.metric,
      value: view.value,
      rawValue: view.rawValue,
      rawUnit: view.rawUnit,
      unit: view.unit,
      conversionFactor: view.conversionFactor,
      source: view.source,
      measuredAt: view.measuredAt,
      referenceText: view.referenceText,
      label: byKey.get(view.metric)?.label,
    });

    const at = new Date();
    const pdf = renderHealthReport({
      preparedAt: at,
      timeZone,
      body: views.filter((view) => !byKey.has(view.metric)).map(asValue),
      // In the order the laboratory's own sheet prints them, which is the order
      // the analyte catalogue holds.
      labs: analytes
        .map((analyte) => views.find((view) => view.metric === analyte.key))
        .filter((view) => view !== undefined)
        .map(asValue),
    });

    return new Response(new Uint8Array(pdf), {
      headers: {
        ...NO_STORE,
        'Content-Type': 'application/pdf',
        'Content-Length': String(pdf.length),
        'Content-Disposition': `attachment; filename="${strings.data.reportFileName(at.toISOString().slice(0, 10))}"`,
      },
    });
  } catch (error) {
    console.error(`[vernier] pdf export: ${(error as Error).message}`);
    return refuse(500, strings.api.data.exportFailed, strings.api.data.exportFailedDetail);
  }
}
