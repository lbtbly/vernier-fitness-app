import Link from 'next/link';
import { CorrectionForm } from '@/components/CorrectionForm';
import { SourceChip } from '@/components/SourceChip';
import { CloseIcon, DocIcon } from '@/components/icons';
import { readChain, readMeasurement, readOpenQuestions, readSourceRecord, toView } from '@/db/measurements';
import { getConfig } from '@/lib/config';
import { readCsrfToken } from '@/lib/csrf';
import { conversionLine, confidenceLabel, dedupLabel, metricLabel, sourceLabel, valueLabel } from '@/lib/display';
import { shortDateTime } from '@/lib/format';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';

/**
 * Tap 1 of the provenance walk, screen 00 frame 2.
 *
 * Everything F21 asks for and in the order the sheet draws it: stored value and
 * unit, measured and imported in Europe/Paris, source, confidence, the
 * deduplication decision in the words it was decided in, and the append-only
 * correction history with the original struck through.
 *
 * It is a real URL rather than a piece of component state on purpose. A value's
 * provenance is a place you can return to, link to and capture, and a sheet
 * that only exists inside a click handler is none of those.
 */
export default async function ValueSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { timeZone } = getConfig();
  const row = await readMeasurement(id);

  if (!row) {
    return (
      <>
        <header className="title">
          <h1>{strings.provenance.valueNotFound}</h1>
        </header>
        <div className="card empty">
          <p className="sub">{strings.provenance.valueNotFoundBody}</p>
          <div className="actions">
            <Link className="btn primary block" href="/">
              {strings.notFound.action}
            </Link>
          </div>
        </div>
      </>
    );
  }

  const [chain, record, questions, csrfToken] = await Promise.all([
    readChain(row.rootId),
    readSourceRecord(row.sourceRecordId),
    readOpenQuestions(),
    readCsrfToken(),
  ]);

  const records = record ? new Map([[record.id, record]]) : undefined;
  const views = chain.map((entry) => toView(entry, records));
  const current = views.at(-1)!;
  const original = views[0];
  const label = valueLabel(current);
  const conversion = conversionLine(current);
  const question = questions.find((entry) => chain.some((link) => link.id === entry.measurementId));

  return (
    <>
      <div className="between sheet-head">
        <div className="stack">
          <span className="lbl">{metricLabel(current.metric)}</span>
          <span className="metric">
            {label.number} <span className="sub">{label.unit}</span>
          </span>
        </div>
        <Link className="btn icon" href="/" aria-label={strings.common.close}>
          <CloseIcon />
        </Link>
      </div>

      {conversion ? (
        <p className="sub num" style={{ marginBottom: 'var(--s3)' }}>
          {conversion}
        </p>
      ) : null}

      <section className="card">
        <div className="row">
          <span className="grow sub mut">{strings.provenance.storedValue}</span>
          <span className="num">
            {label.number} {label.unit}
          </span>
        </div>
        <div className="row">
          <span className="grow sub mut">{strings.provenance.measuredAt}</span>
          <span className="num">{shortDateTime(new Date(current.measuredAt), timeZone)}</span>
        </div>
        <div className="row">
          <span className="grow sub mut">{strings.provenance.importedAt}</span>
          <span className="num">{shortDateTime(new Date(current.importedAt), timeZone)}</span>
        </div>
        <div className="row">
          <span className="grow sub mut">{strings.provenance.sourceLabel}</span>
          <SourceChip source={current.source} confidence={current.confidence} />
        </div>
        <div className="row">
          <span className="grow sub mut">{strings.provenance.confidenceLabel}</span>
          <span className="chip">{confidenceLabel(current.confidence)}</span>
        </div>
        <div className="row">
          <span className="grow sub mut">{strings.provenance.timeZoneLabel}</span>
          <span className="num">{current.timeZone}</span>
        </div>
        <div className="row">
          <span className="grow sub mut">{strings.provenance.importVersion}</span>
          <span className="num">{current.importVersion}</span>
        </div>
        <div className="row">
          <span className="grow sub mut">{strings.provenance.dedupLabel}</span>
          <span className="stack" style={{ alignItems: 'flex-end' }}>
            <span className="chip">{dedupLabel(current.dedupDecision)}</span>
          </span>
        </div>
        <p className="sub" style={{ marginTop: 'var(--s2)' }}>
          {current.dedupReason}
        </p>
        {current.sourceRecordSource ? (
          <p className="note" style={{ marginTop: 'var(--s2)' }}>
            {strings.provenance.standsInFor(sourceLabel(current.sourceRecordSource))}
          </p>
        ) : null}
      </section>

      {question ? (
        <section className="card" style={{ borderColor: 'var(--warn)' }}>
          <span className="lbl">{strings.question.title}</span>
          <p className="sub" style={{ margin: 'var(--s2) 0 var(--s3)' }}>
            {strings.question.body}
          </p>
          <div className="row">
            <span className="grow sub mut">{strings.question.stored}</span>
            <span className="num">
              {question.storedRawValue} {question.storedUnit}
            </span>
          </div>
          <div className="row">
            <span className="grow sub mut">{strings.question.incoming}</span>
            <span className="num">
              {question.incomingRawValue} {question.incomingUnit}
            </span>
          </div>
          <div className="row">
            <span className="grow sub mut">{strings.question.raisedAt}</span>
            <span className="num">{shortDateTime(question.raisedAt, timeZone)}</span>
          </div>
        </section>
      ) : null}

      <span className="lbl" style={{ margin: 'var(--s4) 0 var(--s2)' }}>
        {strings.provenance.correctionHistory}
      </span>

      {views.length === 1 ? (
        <div className="card tight">
          <p className="sub">{strings.provenance.noCorrection}</p>
        </div>
      ) : (
        views.slice(1).map((view, index) => {
          const previous = views[index];
          return (
            <div className="card tight" key={view.id}>
              <div className="between" style={{ alignItems: 'flex-start' }}>
                <div className="stack grow">
                  <span>
                    {metricLabel(view.metric)}, {shortDateTime(new Date(view.measuredAt), timeZone)}
                  </span>
                  <span className="sub num">
                    {strings.provenance.correctionRow(
                      `${valueLabel(previous).number} ${valueLabel(previous).unit}`,
                      `${valueLabel(view).number} ${valueLabel(view).unit}`,
                    )}
                  </span>
                  <span className="note">
                    {strings.provenance.correctionBy(
                      shortDateTime(new Date(view.importedAt), timeZone),
                      view.correctionReason ?? '',
                    )}
                  </span>
                </div>
                <span className="chip">{strings.provenance.appendOnly}</span>
              </div>
            </div>
          );
        })
      )}

      {views.length > 1 ? (
        <div className="card tight">
          <div className="between">
            <span className="sub mut">{strings.provenance.original}</span>
            <span className="num was">
              <s>
                {valueLabel(original).number} {valueLabel(original).unit}
              </s>
            </span>
          </div>
        </div>
      ) : null}

      <CorrectionForm
        measurementId={current.id}
        currentValue={current.rawValue}
        unit={valueLabel(current).unit}
        csrfToken={csrfToken}
      />

      {/*
        * Tap 2. Same destination for all six sources, so `demo` and `withings`
        * and `lab_pdf` never each invent their own screen.
        */}
      <Link className="btn primary block" href={`/source/${current.sourceRecordId}`}>
        <DocIcon />
        {strings.provenance.openSource}
      </Link>
      <p className="note centre" style={{ marginTop: 'var(--s2)' }}>
        {strings.provenance.openSourceHint}
      </p>
    </>
  );
}
