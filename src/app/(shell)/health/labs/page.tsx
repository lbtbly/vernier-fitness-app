import Link from 'next/link';
import { ChevronIcon } from '@/components/icons';
import { LabUpload } from '@/components/LabUpload';
import { ScreenTitle } from '@/components/ScreenTitle';
import { readAnalytes, readDocuments } from '@/db/labs';
import { getConfig } from '@/lib/config';
import { readCsrfToken } from '@/lib/csrf';
import { shortDate, shortDateTime } from '@/lib/format';
import { IMAGE_ONLY_THRESHOLD } from '@/lib/lab-parse';
import type { ReviewRow } from '@/lib/lab-review';
import { strings } from '@/lib/strings';

export const metadata = { title: strings.labs.title };
export const dynamic = 'force-dynamic';

/**
 * Blood tests, the way in to screen 05.
 *
 * Two doors and they land in the same room: a PDF read on this machine, or a
 * panel typed in by hand. Both build a review that stores nothing, and the
 * archive below lists what has already been decided, with the file's fate on
 * every row because F63 makes that a decision the owner made rather than a
 * default the app applied.
 *
 * The per-page character census is on this screen rather than hidden in a log.
 * F65's evidence is "the detection count per page", and a number a person can
 * read off the product is worth more than a number in a container log that only
 * the operator ever sees.
 */
export default async function LabsPage() {
  const { timeZone } = getConfig();
  const [documents, analytes, csrfToken] = await Promise.all([
    readDocuments(),
    readAnalytes(),
    readCsrfToken(),
  ]);

  const open = documents.filter((document) => document.state === 'review');
  const closed = documents.filter((document) => document.state !== 'review');

  return (
    <div className="labs-scroll">
      <ScreenTitle label={strings.health.title} title={strings.labs.title} sub={strings.labs.sub} />

      <LabUpload csrfToken={csrfToken} />

      <section className="card" data-card="manual">
        <div className="between">
          <span className="lbl">{strings.labs.manualLabel}</span>
        </div>
        <p className="sub" style={{ marginTop: 'var(--s2)' }}>
          {strings.labs.manualNote}
        </p>
        <div className="actions">
          <Link className="btn block" href="/health/labs/new">
            {strings.labs.manualAction}
          </Link>
        </div>
      </section>

      {open.length > 0 ? (
        <>
          <div className="lbl" style={{ margin: 'var(--s5) 0 10px' }}>
            {strings.labs.inReviewLabel}
          </div>
          {open.map((document) => (
            <Link
              className="card tight row value-link"
              key={document.id}
              href={`/health/labs/${document.id}`}
              data-review={document.id}
            >
              <span className="grow stack">
                <span className="strong">
                  {document.fileName === '' ? strings.labs.reviewManualFile : document.fileName}
                </span>
                <span className="note num">
                  {strings.labs.inReviewCount(
                    (document.extraction as ReviewRow[]).length,
                    shortDateTime(document.uploadedAt, timeZone),
                  )}
                </span>
              </span>
              <ChevronIcon className="ch" />
            </Link>
          ))}
        </>
      ) : null}

      <div className="lbl" style={{ margin: 'var(--s5) 0 10px' }}>
        {strings.labs.archiveLabel}
      </div>

      {closed.length === 0 ? (
        <div className="card empty" data-state="empty">
          <span className="lbl">{strings.labs.archiveLabel}</span>
          <div className="head">{strings.labs.archiveEmptyTitle}</div>
          <p className="sub">{strings.labs.archiveEmptyBody}</p>
          <div className="actions">
            <Link className="btn primary block" href="/health/labs/new">
              {strings.labs.manualAction}
            </Link>
          </div>
        </div>
      ) : (
        closed.map((document) => {
          const rows = document.extraction as ReviewRow[];
          const saved = rows.filter((row) => row.decision === 'saved').length;
          return (
            <section className="card tight" key={document.id} data-panel={document.id}>
              <div className="between">
                <div className="stack grow">
                  <span className="strong">
                    {strings.labs.panelOn(
                      shortDate(document.panelDate ?? document.uploadedAt, timeZone),
                    )}
                  </span>
                  <span className="note num">{strings.labs.panelStored(saved)}</span>
                </div>
                <span className="chip">
                  {document.fileName === ''
                    ? strings.labs.fileNever
                    : document.fileRemoved
                      ? strings.labs.fileDeleted
                      : strings.labs.fileKept}
                </span>
              </div>
              <p className="note num" style={{ marginTop: 'var(--s2)' }}>
                {(document.census as Array<{ page: number; characters: number; imageOnly: boolean }>)
                  .map((page) =>
                    page.imageOnly
                      ? strings.labs.censusImageOnly(page.page, page.characters)
                      : strings.labs.censusRow(page.page, page.characters),
                  )
                  .join(' ')}
              </p>
            </section>
          );
        })
      )}

      <p className="note centre" style={{ padding: 'var(--s3) 16px 0' }}>
        {strings.labs.censusThreshold(IMAGE_ONLY_THRESHOLD)}
      </p>
      <p className="note centre" style={{ padding: 'var(--s2) 16px 0' }}>
        {strings.labs.analyteCount(analytes.length)}
      </p>
      <p className="note centre" style={{ padding: 'var(--s2) 16px 0' }}>
        {strings.health.noBloodPressure}
      </p>
    </div>
  );
}
