'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ChevronIcon, WarnIcon } from '@/components/icons';
import { CSRF_HEADER } from '@/lib/cookie-names';
import { analyteLabelOf, flagSentences, unitSymbol } from '@/lib/lab-display';
import { isBlocked } from '@/lib/lab-parse';
import type { ReviewDocument, ReviewRow } from '@/lib/lab-review';
import { carryTheCaughtObject, messageOf } from '@/lib/platform-cause';
import { strings } from '@/lib/strings';

/**
 * Screen 05 frame 2: one row, corrected, and saved on its own control.
 *
 * The printed original stays on screen the whole time the owner is typing, which
 * is the point of the frame. He is not deciding what the number should be; he is
 * deciding what the sheet SAYS, and the excerpt is the only thing that can
 * settle it. Every line in that excerpt went through the blood-pressure test
 * again on the way here, so a refused line cannot appear even as context.
 *
 * Nothing autosaves. Typing changes local state and reaches the Mac mini only
 * when Save this row is pressed, and that request carries ONE ordinal.
 */

const ROW_ENDPOINT = '/api/labs/row';

type Failure =
  | { error: string; detail: string; authored: 'vernier' }
  | { error: string; caught: unknown; authored: 'platform' };

export function LabRowEditor({
  review,
  row,
  units,
  csrfToken,
  timeZone,
}: {
  review: ReviewDocument;
  row: ReviewRow;
  /** The printed units this analyte accepts, or every catalogued unit for a new one. */
  units: string[];
  csrfToken: string;
  timeZone: string;
}) {
  const router = useRouter();
  const name = row.analyte ? analyteLabelOf(row.analyte, row.printedLabel) : row.printedLabel;
  const [printedValue, setPrintedValue] = useState(row.printedValue);
  const [printedUnit, setPrintedUnit] = useState(row.chosenUnit || row.printedUnit);
  const [referenceLow, setReferenceLow] = useState(
    row.reference?.low === null || row.reference?.low === undefined ? '' : String(row.reference.low),
  );
  const [referenceHigh, setReferenceHigh] = useState(
    row.reference?.high === null || row.reference?.high === undefined
      ? ''
      : String(row.reference.high),
  );
  const [sampleDate, setSampleDate] = useState(row.sampleDate ?? '');
  const [analyteLabel, setAnalyteLabel] = useState(row.analyte ? '' : row.printedLabel);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  async function send(action: 'save' | 'reject') {
    setBusy(true);
    setFailure(null);
    try {
      const response = await fetch(ROW_ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [CSRF_HEADER]: csrfToken,
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          documentId: review.id,
          ordinal: row.ordinal,
          action,
          edit:
            action === 'save'
              ? { printedValue, printedUnit, referenceLow, referenceHigh, sampleDate, analyteLabel }
              : undefined,
        }),
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
      router.push(`/health/labs/${review.id}`);
      router.refresh();
    } catch (error) {
      setFailure({ error: strings.api.labs.failed, caught: error, authored: 'platform' });
    } finally {
      setBusy(false);
    }
  }

  const sameNumber = units.length > 1 && row.analyte !== null;

  return (
    <>
      <div className="lab-head">
        <Link
          className="btn icon"
          href={`/health/labs/${review.id}`}
          aria-label={strings.labs.backToReview}
          style={{ transform: 'scaleX(-1)' }}
        >
          <ChevronIcon />
        </Link>
        <div className="grow">
          <div className="title-line">{name}</div>
          <div className="note num">{strings.labs.rowTitle(row.ordinal, review.rows.length)}</div>
        </div>
        {isBlocked(row.flags) ? <span className="chip w">{strings.labs.chipLowConfidence}</span> : null}
      </div>

      {row.excerpt.length > 0 ? (
        <section className="card" data-card="as-printed">
          <span className="lbl">{strings.labs.asPrinted(row.page)}</span>
          <div className="pdf" style={{ marginTop: 'var(--s2)' }} data-excerpt={row.ordinal}>
            {row.excerpt.join('\n')}
          </div>
          {row.unitColumnBlank ? (
            <p className="note" style={{ marginTop: 'var(--s2)' }}>
              {strings.labs.unitColumnBlank}
            </p>
          ) : null}
        </section>
      ) : null}

      {flagSentences(row.flags).length > 0 ? (
        <div className="banner w" data-banner="flags">
          <WarnIcon />
          <div>
            {flagSentences(row.flags).map((sentence) => (
              <p className="noticedetail" key={sentence}>
                {sentence}
              </p>
            ))}
          </div>
        </div>
      ) : null}

      <section className="card" data-card="edit-row">
        {row.analyte === null ? (
          <label className="formfield" htmlFor="lab-analyte">
            <span className="lbl">{strings.labs.analyteNameLabel}</span>
            <input
              id="lab-analyte"
              className="input"
              value={analyteLabel}
              onChange={(event) => setAnalyteLabel(event.target.value)}
            />
            <span className="note">{strings.labs.analyteNameNote}</span>
          </label>
        ) : null}

        <label className="formfield" htmlFor="lab-value">
          <span className="lbl">{strings.labs.resultLabel}</span>
          <input
            id="lab-value"
            className="input num"
            inputMode="decimal"
            value={printedValue}
            onChange={(event) => setPrintedValue(event.target.value)}
          />
        </label>

        <div className="field-block">
          <span className="lbl" id="lab-unit-label">
            {strings.labs.unitLabel}
          </span>
          <div className="pick" role="group" aria-labelledby="lab-unit-label">
            {units.map((unit) => (
              <button
                key={unit}
                type="button"
                aria-pressed={unit === printedUnit}
                onClick={() => setPrintedUnit(unit)}
              >
                {unitSymbol(unit)}
              </button>
            ))}
          </div>
          {sameNumber ? (
            <p className="note" style={{ marginTop: 'var(--s2)' }}>
              {strings.labs.sameNumber}
            </p>
          ) : null}
        </div>

        <div className="field-block">
          <span className="lbl">{strings.labs.referenceLabel}</span>
          <div style={{ display: 'flex', gap: 'var(--s2)' }}>
            <input
              className="input num"
              inputMode="decimal"
              aria-label={strings.labs.referenceLowLabel}
              value={referenceLow}
              onChange={(event) => setReferenceLow(event.target.value)}
            />
            <input
              className="input num"
              inputMode="decimal"
              aria-label={strings.labs.referenceHighLabel}
              value={referenceHigh}
              onChange={(event) => setReferenceHigh(event.target.value)}
            />
          </div>
        </div>

        <label className="formfield" htmlFor="lab-date">
          <span className="lbl">{strings.labs.sampleDateLabel}</span>
          <input
            id="lab-date"
            className="input num"
            type="date"
            value={sampleDate}
            onChange={(event) => setSampleDate(event.target.value)}
          />
          <span className="note">{strings.labs.sampleDateNote(timeZone)}</span>
        </label>

        {failure ? (
          <div className="card error" data-state="error" role="alert" style={{ marginBottom: 'var(--s3)' }}>
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
          </div>
        ) : null}

        <button
          type="button"
          className="btn primary block"
          style={{ marginBottom: 'var(--s2)' }}
          disabled={busy}
          data-writes={String(row.ordinal)}
          onClick={() => void send('save')}
        >
          {busy ? strings.labs.saving : strings.labs.saveThisRow}
        </button>
        <button
          type="button"
          className="btn block"
          disabled={busy}
          data-writes={String(row.ordinal)}
          onClick={() => void send('reject')}
        >
          {strings.labs.rejectThisRow}
        </button>
      </section>

      <section className="card empty" data-card="what-gets-stored">
        <span className="lbl">{strings.labs.storedTitle}</span>
        <p className="sub">{strings.labs.storedBody}</p>
        <p className="note" style={{ marginTop: 'var(--s2)' }}>
          {strings.labs.storedNote}
        </p>
      </section>
    </>
  );
}
