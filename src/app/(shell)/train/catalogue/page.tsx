import Link from 'next/link';
import { MovementMedia } from '@/components/MovementMedia';
import { OfflineBanner } from '@/components/Queue';
import { ScreenTitle } from '@/components/ScreenTitle';
import { ChevronIcon } from '@/components/icons';
import { type CatalogueRow, readCatalogueRows } from '@/db/catalogue';
import { alternativesFor } from '@/lib/catalogue';
import {
  equipmentLabel,
  movementCue,
  movementName,
  muscleLabel,
  targetLabel,
} from '@/lib/display';
import { daysBetween } from '@/lib/format';
import { strings } from '@/lib/strings';

export const metadata = { title: strings.catalogue.title };
export const dynamic = 'force-dynamic';

/**
 * The movement catalogue, and the screen F66 is measured on.
 *
 * Every card carries three things: the cue text, the bundled demonstration, and
 * the author of that demonstration. The third one is not politeness. Twenty-two
 * of these files are CC BY-SA, which requires the creator to be named wherever
 * the work is shown, and the rest are public domain, where naming the agency
 * costs nothing and is true. An attributions page nobody opens does not satisfy
 * the first and does not honour the second.
 *
 * IT RENDERS WITH THE NETWORK DISABLED. Every file is served from this Mac
 * mini, the worker caches same-origin responses on first fetch, and the whole
 * layer is 3.5 MB. That is the argument for bundling being the first media
 * layer rather than the third: an embed is three public-internet fetches from
 * the viewer's own browser, and a Mac mini with internet does not help an
 * iPhone without it.
 */

/** After this, a media record's verification is old enough to say so. */
const MEDIA_STALE_DAYS = 180;

function ladderNote(row: CatalogueRow): string[] {
  const alternatives = alternativesFor(row.id);
  const notes: string[] = [];
  if (alternatives.easier) notes.push(strings.catalogue.easier(movementName(alternatives.easier.id)));
  if (alternatives.harder) notes.push(strings.catalogue.harder(movementName(alternatives.harder.id)));
  return notes;
}

export default async function CataloguePage() {
  const now = new Date();
  let rows: CatalogueRow[] = [];
  let failed = false;
  try {
    rows = await readCatalogueRows();
  } catch (error) {
    console.error(`[vernier] catalogue read failed: ${(error as Error).message}`);
    failed = true;
  }

  const stale = rows
    .flatMap((row) => row.media)
    .map((record) => daysBetween(record.verifiedAt, now, 'UTC'))
    .reduce((oldest, days) => Math.max(oldest, days), 0);

  return (
    <div className="catalogue">
      <ScreenTitle
        label={strings.train.title}
        title={strings.catalogue.title}
        sub={strings.catalogue.sub}
      />

      <OfflineBanner />

      {failed ? (
        <div className="card error" data-state="error">
          <div className="between">
            <span className="lbl">{strings.catalogue.title}</span>
            <span className="chip a">{strings.error.title}</span>
          </div>
          <div className="head">{strings.catalogue.errorTitle}</div>
          <p className="sub">{strings.catalogue.errorBody}</p>
          <div className="actions">
            <Link className="btn block" href="/train/catalogue">
              {strings.common.retry}
            </Link>
          </div>
        </div>
      ) : null}

      {!failed && rows.length === 0 ? (
        <div className="card empty" data-state="empty">
          <span className="lbl">{strings.catalogue.title}</span>
          <div className="head">{strings.catalogue.emptyTitle}</div>
          <p className="sub">{strings.catalogue.emptyBody}</p>
          <div className="actions">
            <Link className="btn primary block" href="/train">
              {strings.trainWeek.back}
            </Link>
          </div>
        </div>
      ) : null}

      {rows.length > 0 ? (
        <>
          <div className="between" style={{ marginBottom: 'var(--s3)' }}>
            <span className="sub num" data-catalogue-count={rows.length}>
              {strings.catalogue.count(rows.length)}
            </span>
            {stale > MEDIA_STALE_DAYS ? (
              <span className="src stale" data-state="stale">
                {strings.media.staleTitle(stale)}
              </span>
            ) : null}
          </div>

          <p className="note" style={{ marginBottom: 'var(--s3)' }}>
            {strings.catalogue.offlineNote}
          </p>

          <div className="movements">
            {rows.map((row) => (
              <article className="card" key={row.id} data-movement={row.id}>
                <MovementMedia movementId={row.id} />
                <div className="between">
                  <span className="head">{movementName(row.id)}</span>
                  <span className="chip">{strings.catalogue.modalities[row.modality as 'resistance']}</span>
                </div>
                <p className="sub" style={{ marginTop: 'var(--s1)' }} data-cue>
                  {movementCue(row.id)}
                </p>
                <div className="row" style={{ marginTop: 'var(--s2)' }}>
                  <span className="grow note">{strings.catalogue.target(row.sets, targetLabel(row.unit, row.low))}</span>
                  {row.restSeconds > 0 ? (
                    <span className="note num">{strings.catalogue.rest(row.restSeconds)}</span>
                  ) : null}
                </div>
                <div className="row">
                  <span className="grow note">{strings.catalogue.muscles}</span>
                  <span className="note">{row.muscles.map(muscleLabel).join(', ')}</span>
                </div>
                <div className="row">
                  <span className="grow note">{strings.catalogue.equipment}</span>
                  <span className="note">
                    {row.equipment.length === 0
                      ? strings.catalogue.equipmentNone
                      : row.equipment.map(equipmentLabel).join(', ')}
                  </span>
                </div>
                {ladderNote(row).map((note) => (
                  <p className="note" key={note}>
                    {note}
                  </p>
                ))}
              </article>
            ))}
          </div>

          <section className="card" data-card="attributions">
            <Link className="row value-link" href="/train/media">
              <div className="stack grow">
                <span className="head">{strings.media.attributionsLabel}</span>
                <span className="note">{strings.media.sub}</span>
              </div>
              <ChevronIcon className="ch" />
            </Link>
          </section>
        </>
      ) : null}
    </div>
  );
}
