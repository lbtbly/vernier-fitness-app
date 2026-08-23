import { notFound } from 'next/navigation';
import { LabRowEditor } from '@/components/LabRowEditor';
import { readAnalyte, readDocument, toReviewDocument } from '@/db/labs';
import { getConfig } from '@/lib/config';
import { readCsrfToken } from '@/lib/csrf';
import { knownUnits } from '@/lib/lab-display';
import type { ReviewRow } from '@/lib/lab-review';
import { printedUnitsOf } from '@/lib/labs';
import { strings } from '@/lib/strings';

export const metadata = { title: strings.labs.reviewTitle };
export const dynamic = 'force-dynamic';

/**
 * Screen 05, frame 2. One row, its printed excerpt, and a save that carries one
 * ordinal.
 *
 * The unit picker offers the units THIS analyte accepts. For a row whose analyte
 * is new to the catalogue there is no such list, so it offers every unit the
 * string catalogue can render, which is the rule that keeps a unit on screen
 * from being a word with no key.
 */
export default async function LabRowPage({
  params,
}: {
  params: Promise<{ id: string; ordinal: string }>;
}) {
  const { id, ordinal } = await params;
  const document = await readDocument(id);
  if (!document || document.state !== 'review') notFound();

  const rows = document.extraction as ReviewRow[];
  const row = rows.find((entry) => entry.ordinal === Number(ordinal));
  if (!row) notFound();

  const analyte = row.analyte ? await readAnalyte(row.analyte) : null;
  const units = analyte ? printedUnitsOf(analyte) : knownUnits();
  const { timeZone } = getConfig();
  const csrfToken = await readCsrfToken();

  return (
    <div className="labs-scroll">
      <LabRowEditor
        review={toReviewDocument(document)}
        row={row}
        units={units}
        csrfToken={csrfToken}
        timeZone={timeZone}
      />
    </div>
  );
}
