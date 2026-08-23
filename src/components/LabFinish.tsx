'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DocIcon, TrashIcon, WarnIcon } from '@/components/icons';
import { CSRF_HEADER } from '@/lib/cookie-names';
import { analyteLabelOf } from '@/lib/lab-display';
import { type ReviewDocument, tally } from '@/lib/lab-review';
import { shortDate } from '@/lib/format';
import { carryTheCaughtObject, messageOf } from '@/lib/platform-cause';
import { strings } from '@/lib/strings';

/**
 * Screen 05 frame 3: what was stored, and the keep-or-delete question.
 *
 * F63 says the question is asked AT THE MOMENT OF VALIDATION, and DESIGN.md is
 * blunt about why: not in a settings screen six weeks later, with both
 * consequences spelled out before the tap. Both are on the screen, under the
 * control they belong to, in the owner's terms rather than in the system's.
 *
 * Delete means the file leaves the volume. The route runs `rm` and answers with
 * the directory listing before and after, and this screen states which one
 * happened rather than which one was asked for, because a screen that says
 * "deleted" over a file still on disk is the failure mode this whole product is
 * built against.
 *
 * The counts come from `tally` in src/lib/lab-review.ts, the same function the
 * footer of the review uses, so the two screens cannot disagree about how many
 * rows were saved.
 */

const DOCUMENT_ENDPOINT = '/api/labs/document';

type Failure =
  | { error: string; detail: string; authored: 'vernier' }
  | { error: string; caught: unknown; authored: 'platform' };

/** How many analyte names the summary sentence prints before it counts the rest. */
const NAMES_IN_SUMMARY = 3;

export function LabFinish({
  review: initial,
  csrfToken,
  timeZone,
}: {
  review: ReviewDocument;
  csrfToken: string;
  timeZone: string;
}) {
  const router = useRouter();
  const [review, setReview] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [outcome, setOutcome] = useState<'kept' | 'deleted' | null>(
    (initial.retention as 'kept' | 'deleted' | null) ?? null,
  );

  const counts = tally(review);
  const saved = review.rows.filter((row) => row.decision === 'saved');
  const names = saved
    .slice(0, NAMES_IN_SUMMARY)
    .map((row) => (row.analyte ? analyteLabelOf(row.analyte, row.printedLabel) : row.printedLabel));
  const summaryNames =
    saved.length > NAMES_IN_SUMMARY
      ? [...names, strings.labs.andOthers(saved.length - NAMES_IN_SUMMARY)].join(', ')
      : names.join(', ');
  const when = review.panelDate
    ? shortDate(new Date(review.panelDate), timeZone)
    : shortDate(new Date(review.uploadedAt), timeZone);

  async function decide(retention: 'kept' | 'deleted') {
    setBusy(true);
    setFailure(null);
    try {
      const response = await fetch(DOCUMENT_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [CSRF_HEADER]: csrfToken },
        body: JSON.stringify({ documentId: review.id, retention }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        review?: ReviewDocument;
        fileRemoved?: boolean;
        error?: string;
        detail?: string;
      };
      if (!response.ok) {
        setFailure({
          error: body.error ?? strings.api.labs.failed,
          detail: body.detail ?? strings.api.labs.failedDetail,
          authored: 'vernier',
        });
        return;
      }
      if (body.review) setReview(body.review);
      // What HAPPENED, read off the answer, not what was asked for.
      setOutcome(retention === 'deleted' && body.fileRemoved !== true && review.hasFile ? 'kept' : retention);
      router.refresh();
    } catch (error) {
      setFailure({ error: strings.api.labs.failed, caught: error, authored: 'platform' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="title">
        <h1>{strings.labs.finishTitle(counts.saved)}</h1>
        <p className="sub">
          {counts.saved === 0
            ? strings.labs.finishBodyNone(when)
            : strings.labs.finishBody(when, summaryNames)}
        </p>
      </header>

      <section className="card" data-card="summary">
        <div className="row">
          <span className="grow sub mut">{strings.labs.summaryAccepted}</span>
          <span className="num">{counts.saved}</span>
        </div>
        <div className="row">
          <span className="grow sub mut">{strings.labs.summaryCorrected}</span>
          <span className="num">{counts.corrected}</span>
        </div>
        <div className="row">
          <span className="grow sub mut">{strings.labs.summaryRejected}</span>
          <span className="num">{counts.rejected}</span>
        </div>
        <div className="row">
          <span className="grow sub mut">{strings.labs.summaryWaiting}</span>
          <span className="num">{counts.waiting}</span>
        </div>
        {/*
          * F60's count, on the summary as well as on the review. It names blood
          * pressure and a number of rows and it carries no value, because the
          * parser never produced one to carry.
          */}
        {counts.refused > 0 ? (
          <div className="row" data-row="refused">
            <span className="grow sub mut">{strings.labs.summaryRefused}</span>
            <span className="num">
              {counts.refused}, {strings.labs.summaryRefusedValue}
            </span>
          </div>
        ) : null}
      </section>

      {failure ? (
        <div className="card error" data-state="error" role="alert">
          <div className="between">
            <span className="lbl">{strings.labs.fileLabel}</span>
            <span className="chip a">
              <WarnIcon />
              {strings.error.failedChip}
            </span>
          </div>
          <div className="head">{failure.error}</div>
          <p className="sub">
            {failure.authored === 'platform' ? (
              <span data-authored="platform" ref={carryTheCaughtObject(failure.caught)}>
                {messageOf(failure.caught)}
              </span>
            ) : (
              <span data-authored="vernier">{failure.detail}</span>
            )}
          </p>
          <div className="actions">
            <button type="button" className="btn grow" onClick={() => setFailure(null)}>
              {strings.error.action}
            </button>
          </div>
        </div>
      ) : null}

      <div className="lbl" style={{ margin: 'var(--s5) 0 10px' }}>
        {strings.labs.fileLabel}
      </div>

      <section className="card" data-card="retention">
        <div className="between" style={{ marginBottom: 'var(--s2)' }}>
          <div className="stack grow">
            <span className="strong">
              {review.fileName === '' ? strings.labs.reviewManualFile : review.fileName}
            </span>
            <span className="note num">
              {review.fileName === ''
                ? strings.labs.fileNever
                : strings.labs.fileSize(
                    (review.byteSize / (1024 * 1024)).toFixed(1),
                    review.pageCount,
                  )}
            </span>
          </div>
          <DocIcon className="ch" />
        </div>

        {review.fileName === '' ? (
          <p className="note">{strings.labs.fileNever}</p>
        ) : outcome === null ? (
          <>
            <div className="head">{strings.labs.retentionAsk}</div>
            <p className="note" style={{ marginBottom: 'var(--s3)' }}>
              {strings.labs.retentionAskNote}
            </p>
            <button
              type="button"
              className="btn primary block"
              style={{ marginBottom: 'var(--s2)' }}
              disabled={busy}
              onClick={() => void decide('kept')}
            >
              {strings.labs.keepIt}
            </button>
            <p className="note" style={{ marginBottom: 'var(--s4)' }}>
              {strings.labs.keepNote}
            </p>
            <button
              type="button"
              className="btn block"
              style={{ marginBottom: 'var(--s2)' }}
              disabled={busy}
              onClick={() => void decide('deleted')}
            >
              <TrashIcon />
              {strings.labs.deleteIt}
            </button>
            <p className="note">{strings.labs.deleteNote}</p>
          </>
        ) : (
          <p className="sub" data-retention={outcome}>
            {outcome === 'deleted' ? strings.labs.deleted : strings.labs.kept}
          </p>
        )}
      </section>

      <section className="card empty" data-card="what-left">
        <span className="lbl">{strings.labs.whatLeftLabel}</span>
        <p className="sub">{strings.labs.whatLeftBody}</p>
      </section>

      <div className="actions">
        <Link className="btn block" href="/health">
          {strings.labs.backToHealth}
        </Link>
      </div>
    </>
  );
}
