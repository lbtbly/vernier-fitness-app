import Link from 'next/link';
import { SourceChip } from '@/components/SourceChip';
import { ChevronIcon } from '@/components/icons';
import { readEntryOfSourceRecord } from '@/db/meals';
import { readMeasurementsOfSource, readSourceRecord, toView } from '@/db/measurements';
import { getConfig } from '@/lib/config';
import { metricLabel, sourceFieldLabel, sourceKindLabel, valueLabel } from '@/lib/display';
import { shortDateTime } from '@/lib/format';
import { SOURCES } from '@/lib/provenance';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';

/**
 * Tap 2, screen 00 frame 3. One screen, six sources.
 *
 * The device sync batch, the phone payload, the laboratory page, the photo and
 * the model reply, the derivation and the demonstration record all render
 * through this file and nothing else. That is the point of it: a source screen
 * per integration is how the fifth one quietly stops showing the row count, and
 * then nobody can tell whether an import dropped something.
 *
 * The lines come from the record's own `detail`, each one a key into the string
 * catalogue with its data beside it, so a new source adds rows and never adds a
 * screen.
 */
export default async function SourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { timeZone } = getConfig();
  const record = await readSourceRecord(id);

  if (!record) {
    return (
      <>
        <header className="title">
          <h1>{strings.provenance.sourceNotFound}</h1>
        </header>
        <div className="card empty">
          <p className="sub">{strings.provenance.sourceNotFoundBody}</p>
          <div className="actions">
            <Link className="btn primary block" href="/">
              {strings.notFound.action}
            </Link>
          </div>
        </div>
      </>
    );
  }

  const rows = await readMeasurementsOfSource(record.id);
  const detail = (record.detail as Array<{ key: string; value: string }>) ?? [];
  /*
   * The photograph, on the record that carried it. Tap 2 of the walk F97
   * measures lands here, and "reaches the photo and the model reply" means both
   * are on this screen: the image above, the reply in the detail rows below.
   *
   * It is read from the meal entry rather than from the record, because the
   * entry is what owns the file: a record with no entry behind it draws no
   * image and says nothing, which is the same absence rule as everywhere else.
   */
  const entry = record.kind === 'model_reply' ? await readEntryOfSourceRecord(record.id) : undefined;

  return (
    <>
      <header className="title">
        <span className="lbl">{strings.provenance.sourceScreenTitle}</span>
        <h1>{sourceKindLabel(record.kind)}</h1>
        <p className="sub">{shortDateTime(record.occurredAt, timeZone)}</p>
      </header>

      {entry?.photoId ? (
        <div className="photo" data-photo="stored">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt={strings.meals.entryPhoto} src={`/api/meals/photo/${entry.photoId}`} />
        </div>
      ) : null}

      <section className="card">
        <div className="between">
          <span className="lbl">{sourceKindLabel(record.kind)}</span>
          <SourceChip source={record.source} />
        </div>
        <div className="row">
          <span className="grow sub mut">{strings.provenance.sourceReference}</span>
          <span className="num">{record.reference}</span>
        </div>
        <div className="row">
          <span className="grow sub mut">{strings.provenance.sourceOccurredAt}</span>
          <span className="num">{shortDateTime(record.occurredAt, timeZone)}</span>
        </div>
        <div className="row">
          <span className="grow sub mut">{strings.provenance.sourceImportedAt}</span>
          <span className="num">{shortDateTime(record.recordedAt, timeZone)}</span>
        </div>
        <div className="row">
          <span className="grow sub mut">{strings.provenance.importVersion}</span>
          <span className="num">{record.importVersion}</span>
        </div>
        {detail.map((line) => (
          <div className="row" key={line.key}>
            <span className="grow sub mut">{sourceFieldLabel(line.key)}</span>
            <span className="num">{line.value}</span>
          </div>
        ))}
      </section>

      <section className="card">
        <span className="lbl">{strings.provenance.sourceRows}</span>
        {rows.length === 0 ? (
          <p className="sub" style={{ marginTop: 'var(--s2)' }}>
            {strings.provenance.sourceNoRows}
          </p>
        ) : (
          rows.map((row) => {
            const view = toView(row);
            const label = valueLabel(view);
            return (
              <Link className="row value-link" key={row.id} href={`/value/${row.id}`}>
                <span className="grow">{metricLabel(row.metric)}</span>
                <span className="num">
                  {label.number} {label.unit}
                </span>
                <ChevronIcon className="ch" />
              </Link>
            );
          })
        )}
      </section>

      <section className="card flat empty">
        <span className="lbl">{strings.provenance.allSourcesLabel}</span>
        <div className="actions">
          {SOURCES.map((source) => (
            <SourceChip key={source} source={source} />
          ))}
        </div>
        <p className="note" style={{ marginTop: 'var(--s3)' }}>
          {strings.provenance.allSourcesNote}
        </p>
      </section>
    </>
  );
}
