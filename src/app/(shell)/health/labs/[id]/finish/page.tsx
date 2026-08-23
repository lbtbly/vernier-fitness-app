import { notFound } from 'next/navigation';
import { LabFinish } from '@/components/LabFinish';
import { readDocument, toReviewDocument } from '@/db/labs';
import { getConfig } from '@/lib/config';
import { readCsrfToken } from '@/lib/csrf';
import { strings } from '@/lib/strings';

export const metadata = { title: strings.labs.title };
export const dynamic = 'force-dynamic';

/**
 * Screen 05, frame 3. What was stored, and the keep-or-delete question at the
 * moment of validation.
 *
 * A review that has already been validated still renders here, showing the
 * answer that was given, because "what happened to that file" is a question the
 * owner will ask again and the answer belongs where the question was asked.
 */
export default async function LabFinishPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const document = await readDocument(id);
  if (!document) notFound();
  const { timeZone } = getConfig();
  const csrfToken = await readCsrfToken();
  return (
    <div className="labs-scroll">
      <LabFinish review={toReviewDocument(document)} csrfToken={csrfToken} timeZone={timeZone} />
    </div>
  );
}
