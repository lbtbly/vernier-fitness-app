import { notFound } from 'next/navigation';
import { LabReview } from '@/components/LabReview';
import { readDocument, toReviewDocument } from '@/db/labs';
import { getConfig } from '@/lib/config';
import { readCsrfToken } from '@/lib/csrf';
import { strings } from '@/lib/strings';

export const metadata = { title: strings.labs.reviewTitle };
export const dynamic = 'force-dynamic';

/**
 * Screen 05, frame 1. The review is read on the server and decided in the
 * browser, and the only writes it can raise are one row at a time.
 *
 * A validated review is not a review any more, so it 404s here rather than
 * offering controls over rows that have already been decided and a file whose
 * fate has already been chosen. The archive on /health/labs is where a decided
 * panel is read.
 */
export default async function LabReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const document = await readDocument(id);
  if (!document || document.state !== 'review') notFound();
  const { timeZone } = getConfig();
  const csrfToken = await readCsrfToken();
  return (
    <div className="labs-scroll">
      <LabReview
        review={toReviewDocument(document)}
        csrfToken={csrfToken}
        timeZone={timeZone}
        now={new Date().toISOString()}
      />
    </div>
  );
}
