'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  ChevronIcon,
  CloseIcon,
  DocIcon,
  EditIcon,
  InfoIcon,
  OkIcon,
  ShieldIcon,
  WarnIcon,
} from '@/components/icons';
import { CSRF_HEADER } from '@/lib/cookie-names';
import { refusalSentence } from '@/lib/display';
import { analyteLabelOf, flagSentences, referenceLine, unitSymbol } from '@/lib/lab-display';
import { isBlocked } from '@/lib/lab-parse';
import { type ReviewDocument, type ReviewRow, canSave, reviewSections, tally } from '@/lib/lab-review';
import { daysBetween, formatNumber, shortDate, time24 } from '@/lib/format';
import { carryTheCaughtObject, messageOf } from '@/lib/platform-cause';
import { strings } from '@/lib/strings';

/**
 * Screen 05 frame 1: twenty-two rows, none of them stored, and one control per
 * row that stores exactly one.
 *
 * THERE IS NO CONTROL HERE THAT COMMITS MORE THAN ONE ROW. Not a Save All, not
 * an Accept All Clean, not a footer that applies what was marked. Every save is
 * one tap on one row's own control, it sends one request naming one ordinal,
 * and `/api/labs/row` refuses any body that would apply a second. The footer
 * counts and its one action opens the keep-or-delete question, which stores
 * nothing.
 *
 * The wireframe draws a footer reading "Save 18 rows". DOD F59, PLAN.md slice 7
 * and DESIGN.md section 5 all say the opposite in those words, so the three win
 * over the one and the disagreement is recorded in the commit message rather
 * than resolved silently.
 *
 * All five states from screen 00 live here and all five are real. Loading while
 * a row is in flight, empty when every row has been decided, error when a save
 * was refused, offline when the phone cannot reach the Mac mini, and stale when
 * a review has been sitting open for days.
 */

const ROW_ENDPOINT = '/api/labs/row';
const DOCUMENT_ENDPOINT = '/api/labs/document';

/** A review left open this long is stale. Long enough to be a weekend, short enough to matter. */
const STALE_AFTER_DAYS = 3;

type Failure =
  | { error: string; detail: string; authored: 'vernier' }
  | { error: string; caught: unknown; authored: 'platform' };

function labelOf(row: ReviewRow): string {
  return row.analyte ? analyteLabelOf(row.analyte, row.printedLabel) : row.printedLabel;
}

/**
 * What happened to a row and when, or null while nothing has.
 *
 * The time comes off the row's own `decidedAt` and there is no fallback to the
 * clock. A component that reads `Date.now()` while rendering prints a different
 * answer on every re-render, and the answer it prints here would be "saved at"
 * whatever time the owner happened to scroll, on a row he decided yesterday.
 */
function decidedLine(row: ReviewRow, timeZone: string): string | null {
  if (row.decidedAt === null) return null;
  const when = time24(new Date(row.decidedAt), timeZone);
  if (row.decision === 'rejected') return strings.labs.rejectedAt(when);
  if (row.decision !== 'saved') return null;
  return row.corrected ? strings.labs.correctedAt(when) : strings.labs.savedAt(when);
}

/**
 * The printed original, the factor and the stored value, on one line. F61.
 *
 * A row with no conversion still draws a line, saying it was stored as printed.
 * DESIGN.md's rule is that a converted value never appears alone, and the way to
 * be sure of that is for the printed original to be on screen beside every
 * value whether or not arithmetic happened to it.
 */
function ConversionNote({ row }: { row: ReviewRow }) {
  const printed = `${row.printedValue}${
    row.printedUnit === '' ? '' : ` ${unitSymbol(row.printedUnit)}`
  }`;
  if (!row.converted || row.converted.factor === null) {
    return (
      <div className="conv" data-conversion={row.ordinal}>
        {strings.labs.noConversion(printed)}
      </div>
    );
  }
  return (
    <div className="conv" data-conversion={row.ordinal}>
      {strings.labs.conversionLine(
        printed,
        String(row.converted.factor),
        `${formatNumber(row.converted.value, row.converted.unit)} ${unitSymbol(row.converted.unit)}`,
      )}
    </div>
  );
}

export function LabReview({
  review: initial,
  csrfToken,
  timeZone,
  now,
}: {
  review: ReviewDocument;
  csrfToken: string;
  timeZone: string;
  /** The server's clock, ISO, so the age of the review is not read off the phone. */
  now: string;
}) {
  const router = useRouter();
  const [review, setReview] = useState(initial);
  const [busy, setBusy] = useState<number | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const mark = () => setOffline(!navigator.onLine);
    mark();
    window.addEventListener('online', mark);
    window.addEventListener('offline', mark);
    return () => {
      window.removeEventListener('online', mark);
      window.removeEventListener('offline', mark);
    };
  }, []);

  async function decide(row: ReviewRow, action: 'save' | 'reject') {
    setBusy(row.ordinal);
    setFailure(null);
    try {
      const response = await fetch(ROW_ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [CSRF_HEADER]: csrfToken,
          'Idempotency-Key': crypto.randomUUID(),
        },
        // One document, one ordinal, one verb. No array, ever.
        body: JSON.stringify({ documentId: review.id, ordinal: row.ordinal, action }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        review?: ReviewDocument;
        error?: string;
        detail?: string;
      };
      if (!response.ok || !body.review) {
        setFailure({
          error: body.error ?? strings.api.labs.failed,
          detail: body.detail ?? strings.api.labs.failedDetail,
          authored: 'vernier',
        });
        return;
      }
      setReview(body.review);
      router.refresh();
    } catch (error) {
      setFailure({ error: strings.api.labs.failed, caught: error, authored: 'platform' });
    } finally {
      setBusy(null);
    }
  }

  async function abandon() {
    setBusy(0);
    setFailure(null);
    try {
      const response = await fetch(DOCUMENT_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [CSRF_HEADER]: csrfToken },
        body: JSON.stringify({ documentId: review.id, action: 'abandon' }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string; detail?: string };
        setFailure({
          error: body.error ?? strings.api.labs.failed,
          detail: body.detail ?? strings.api.labs.failedDetail,
          authored: 'vernier',
        });
        return;
      }
      router.push('/health/labs');
      router.refresh();
    } catch (error) {
      setFailure({ error: strings.api.labs.failed, caught: error, authored: 'platform' });
    } finally {
      setBusy(null);
    }
  }

  const counts = tally(review);
  const { needsEyes, readCleanly, decided } = reviewSections(review);
  const age = daysBetween(new Date(review.uploadedAt ?? now), new Date(now), timeZone);
  const stale = age >= STALE_AFTER_DAYS;
  /*
   * The pages the parser actually refused something on, read off the document
   * rather than derived from the census. The census is every page in the file,
   * so this line used to announce "Page 1, 2, 3 holds a blood-pressure reading"
   * on a three-page panel whose blood-pressure line was on page 2 alone.
   */
  const refusedPages = review.refusalPages;

  return (
    <>
      <div className="lab-head">
        <button
          type="button"
          className="btn icon"
          aria-label={strings.labs.cancelImport}
          onClick={() => void abandon()}
          disabled={busy !== null || counts.saved > 0}
        >
          <CloseIcon />
        </button>
        <div className="grow">
          <div className="title-line">{strings.labs.reviewTitle}</div>
          <div className="note num">
            {review.fileName === ''
              ? strings.labs.reviewManualFile
              : strings.labs.reviewFile(review.fileName, review.pageCount)}
          </div>
        </div>
        {stale ? (
          <span className="chip w" data-state="stale">
            <WarnIcon />
            {strings.provenance.staleLabel(strings.labs.title, age)}
          </span>
        ) : null}
      </div>

      {offline ? (
        <div className="banner" data-state="offline">
          <WarnIcon />
          <div>{strings.offline.cardTitle}</div>
        </div>
      ) : null}

      <div className="banner" data-banner="nothing-stored">
        <InfoIcon />
        <div>
          <b>{strings.labs.nothingStoredTitle}</b>{' '}
          {strings.labs.nothingStoredBody(counts.total)}{' '}
          {review.panelDate
            ? strings.labs.panelHeader(shortDate(new Date(review.panelDate), timeZone), review.laboratory)
            : strings.labs.panelHeaderNoDate}
        </div>
      </div>

      {/*
        * F60's refusal. It names blood pressure and the page it was on, and it
        * carries no value because the parser never returned one: there is no
        * field on the wire, in the row or in the database that a value could
        * have travelled in.
        */}
      {review.refusals > 0 ? (
        <div className="banner" data-banner="refused">
          <ShieldIcon />
          <div>
            <b>{strings.labs.refusedTitle(review.refusals)}</b> {refusalSentence(refusedPages)}
          </div>
        </div>
      ) : null}

      {failure ? (
        <div className="card error" data-state="error" role="alert">
          <div className="between">
            <span className="lbl">{strings.labs.title}</span>
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
          <p className="sub" style={{ marginTop: 'var(--s2)' }}>
            {strings.error.lead}
          </p>
          <div className="actions">
            <button type="button" className="btn grow" onClick={() => setFailure(null)}>
              {strings.error.action}
            </button>
          </div>
        </div>
      ) : null}

      <Section
        label={strings.labs.needsEyes(needsEyes.length)}
        rows={needsEyes}
        review={review}
        busy={busy}
        offline={offline}
        timeZone={timeZone}
        decide={decide}
      />
      <Section
        label={strings.labs.readCleanly(readCleanly.length)}
        rows={readCleanly}
        review={review}
        busy={busy}
        offline={offline}
        timeZone={timeZone}
        decide={decide}
      />
      <Section
        label={strings.labs.decidedLabel(decided.length)}
        rows={decided}
        review={review}
        busy={busy}
        offline={offline}
        timeZone={timeZone}
        decide={decide}
      />

      {counts.waiting === 0 ? (
        <div className="card empty" data-state="empty">
          <span className="lbl">{strings.labs.reviewTitle}</span>
          <div className="head">{strings.labs.finishTitle(counts.saved)}</div>
          <p className="sub">{strings.labs.retentionAskNote}</p>
          <div className="actions">
            <Link className="btn primary block" href={`/health/labs/${review.id}/finish`}>
              {strings.labs.finishReview}
            </Link>
          </div>
        </div>
      ) : null}

      {/*
        * The footer counts. It does not commit, and there is nothing here that
        * could: its one action opens the keep-or-delete question, which stores
        * no measurement at all.
        */}
      <div className="stickybar" data-footer="labs-review">
        <div className="between" style={{ marginBottom: 'var(--s2)' }}>
          <span className="sub num">
            {strings.labs.footerCounts(counts.saved, counts.waiting, counts.rejected)}
          </span>
        </div>
        <Link className="btn primary block" href={`/health/labs/${review.id}/finish`}>
          {strings.labs.finishReview}
        </Link>
        <p className="note centre" style={{ marginTop: 'var(--s2)' }}>
          {strings.labs.footerNote}
        </p>
      </div>
    </>
  );
}

function Section({
  label,
  rows,
  review,
  busy,
  offline,
  timeZone,
  decide,
}: {
  label: string;
  rows: ReviewRow[];
  review: ReviewDocument;
  busy: number | null;
  offline: boolean;
  timeZone: string;
  decide: (row: ReviewRow, action: 'save' | 'reject') => Promise<void>;
}) {
  if (rows.length === 0) return null;
  return (
    <>
      <div className="lbl" style={{ margin: 'var(--s4) 0 var(--s2)' }}>
        {label}
      </div>
      {rows.map((row) => (
        <Row
          key={row.ordinal}
          row={row}
          review={review}
          busy={busy}
          offline={offline}
          timeZone={timeZone}
          decide={decide}
        />
      ))}
    </>
  );
}

function Row({
  row,
  review,
  busy,
  offline,
  timeZone,
  decide,
}: {
  row: ReviewRow;
  review: ReviewDocument;
  busy: number | null;
  offline: boolean;
  timeZone: string;
  decide: (row: ReviewRow, action: 'save' | 'reject') => Promise<void>;
}) {
  const name = labelOf(row);
  const waiting = row.decision === 'waiting';
  const blocked = waiting && isBlocked(row.flags);
  const savable = canSave(row) && !offline;
  const state = row.decision === 'saved' ? 'done' : row.decision === 'rejected' ? 'rej' : blocked ? 'attn' : '';
  /*
   * The interval, as the sheet printed it wherever the sheet printed one.
   *
   * "< 5" and "0 to 5" are not the same claim, and a row whose unit column the
   * sheet left empty has no unit to take a decimal precision from either: the
   * first draft fell back to mmol/L and drew the GGT row's "12 - 64" as
   * "ref 12.00 to 64.00", which is this app inventing two decimal places the
   * laboratory did not print. The parsed bounds are still stored and still
   * editable; what is DRAWN is the sheet's own text.
   */
  const reference =
    row.reference?.text && row.reference.text.trim() !== ''
      ? row.reference.text.trim()
      : referenceLine(
          row.reference?.low ?? null,
          row.reference?.high ?? null,
          row.converted?.unit ?? row.printedUnit,
        );

  return (
    <div
      className={`lrow ${state}`.trim()}
      data-row={row.ordinal}
      data-decision={row.decision}
      data-blocked={blocked ? 'true' : 'false'}
      /*
       * The census a test walks. Every control on this row writes this ordinal
       * and no other, so a walk over `[data-writes]` can prove that no control
       * on this screen would apply a second row: there is no value here with a
       * comma in it and there is no shape of markup that could produce one.
       */
      data-writes={String(row.ordinal)}
    >
      <div className="between" style={{ alignItems: 'flex-start' }}>
        <div className="stack grow">
          <span className="name">{row.decision === 'rejected' ? <s>{name}</s> : name}</span>
          <span className="sub num">
            {row.printedValue}
            {row.printedUnit === '' ? null : ` ${unitSymbol(row.printedUnit)}`}
          </span>
          <span className="note num">
            {reference ?? strings.labs.referenceNone}
            {row.sampleDate ? ` · ${shortDate(new Date(`${row.sampleDate}T12:00:00Z`), timeZone)}` : null}
          </span>
        </div>
        <div className="stack" style={{ alignItems: 'flex-end' }}>
          {row.decision === 'saved' ? (
            <span className="chip g">{strings.labs.chipSaved}</span>
          ) : row.decision === 'rejected' ? (
            <span className="chip a">{strings.labs.chipRejected}</span>
          ) : blocked ? (
            <span className="chip w">{strings.labs.chipLowConfidence}</span>
          ) : row.flags.includes('new_analyte') ? (
            <span className="chip">{strings.labs.chipNewAnalyte}</span>
          ) : (
            <span className="chip g">{strings.labs.chipReady}</span>
          )}
          {/* C10 asks for confidence per row, so it is on every row and not only on the flagged ones. */}
          <span className="note num" data-confidence={row.ordinal}>
            {strings.labs.confidenceOf(Math.round(row.confidence * 100))}
          </span>
        </div>
      </div>

      {/*
        * F61's line, on every row and not only on the converted ones. DESIGN.md
        * says a converted value never appears alone; the way to be sure of that
        * is for the printed original to sit beside every value, with the factor
        * when there was one and a sentence saying so when there was not.
        */}
      <ConversionNote row={row} />

      {flagSentences(row.flags).map((sentence) => (
        <div className="conv" key={sentence}>
          {sentence}
        </div>
      ))}
      {row.unitColumnBlank ? <div className="conv">{strings.labs.unitColumnBlank}</div> : null}

      <div className="between" style={{ marginTop: 'var(--s2)' }}>
        <span className="note">
          {decidedLine(row, timeZone) ??
            (blocked
              ? strings.labs.decideFirst
              : row.flags.includes('new_analyte')
                ? strings.labs.readCleanlyButNew
                : strings.labs.seePage(row.page))}
        </span>
        {waiting ? (
          <div className="seg">
            <button
              type="button"
              className="ok"
              aria-label={strings.labs.acceptRow(name)}
              disabled={!savable || busy !== null}
              aria-busy={busy === row.ordinal}
              data-writes={String(row.ordinal)}
              onClick={() => void decide(row, 'save')}
            >
              {busy === row.ordinal ? <DocIcon /> : <OkIcon />}
            </button>
            <Link
              className="btn icon ed"
              href={`/health/labs/${review.id}/row/${row.ordinal}`}
              aria-label={strings.labs.editRow(name)}
              data-writes={String(row.ordinal)}
            >
              <EditIcon />
            </Link>
            <button
              type="button"
              className="no"
              aria-label={strings.labs.rejectRow(name)}
              disabled={busy !== null || offline}
              data-writes={String(row.ordinal)}
              onClick={() => void decide(row, 'reject')}
            >
              <CloseIcon />
            </button>
          </div>
        ) : row.measurementId ? (
          <Link className="btn quiet" href={`/value/${row.measurementId}`} data-writes="none">
            {strings.provenance.openSource}
            <ChevronIcon />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
