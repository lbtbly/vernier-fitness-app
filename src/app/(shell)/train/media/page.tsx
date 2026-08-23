import Link from 'next/link';
import { MediaEditor } from '@/components/MediaEditor';
import { OfflineBanner } from '@/components/Queue';
import { ScreenTitle } from '@/components/ScreenTitle';
import { type MediaView, readAllowlist, readMedia } from '@/db/media';
import { MOVEMENTS } from '@/lib/catalogue';
import { readCsrfToken } from '@/lib/csrf';
import { movementName } from '@/lib/display';
import { getConfig } from '@/lib/config';
import { daysBetween, shortDate } from '@/lib/format';
import { strings } from '@/lib/strings';

export const metadata = { title: strings.media.title };
export const dynamic = 'force-dynamic';

/**
 * Where every demonstration came from, and the list a link may be added from.
 *
 * F67 IS READ OFF THIS SCREEN. Every record shows its source URL, its author or
 * source name, its verification date, its licence or embedding mode, and the
 * movement it belongs to. Five columns, one row each, no record without all
 * five, and the author column has no empty cell in it because the database
 * refuses one.
 *
 * F68 IS READ OFF THE SAME SCREEN. The allowlist is printed as rows, with the
 * reason each host is on it, because it IS rows: it is data in
 * `media_allowlist`, seeded from a JSON file the owner can edit, and not a
 * comparison compiled into a handler. A refusal can therefore name the list it
 * failed rather than saying no on the app's authority.
 */

const MEDIA_STALE_DAYS = 180;
const MODES = strings.media.modes as Record<string, string>;
const KINDS = strings.media.kinds as Record<string, string>;
const ALLOWLIST_REASONS = strings.media.allowlist as Record<string, string>;

/**
 * The allowlist row's reason, from the catalogue. The row stores a dotted key
 * and the leaf of it is the catalogue entry, so a host added later carries its
 * own sentence rather than borrowing one.
 */
function reasonFor(key: string): string {
  return ALLOWLIST_REASONS[key.slice(key.lastIndexOf('.') + 1)] ?? key;
}

function totalMegabytes(records: MediaView[]): string {
  const bytes = records.reduce((sum, record) => sum + record.bytes, 0);
  return (bytes / 1024 / 1024).toFixed(2);
}

export default async function MediaPage() {
  const { timeZone } = getConfig();
  const now = new Date();
  const csrfToken = await readCsrfToken();

  let records: MediaView[] = [];
  let hosts: Awaited<ReturnType<typeof readAllowlist>> = [];
  let failed = false;
  try {
    [records, hosts] = await Promise.all([readMedia(), readAllowlist()]);
  } catch (error) {
    console.error(`[vernier] media read failed: ${(error as Error).message}`);
    failed = true;
  }

  const bundled = records.filter((record) => record.embeddingMode === 'bundled');
  const embeds = records.filter((record) => record.embeddingMode !== 'bundled');

  return (
    <div className="media">
      <ScreenTitle label={strings.train.title} title={strings.media.title} sub={strings.media.sub} />

      <OfflineBanner />

      {failed ? (
        <div className="card error" data-state="error">
          <div className="between">
            <span className="lbl">{strings.media.title}</span>
            <span className="chip a">{strings.error.title}</span>
          </div>
          <div className="head">{strings.media.errorTitle}</div>
          <p className="sub">{strings.media.errorBody}</p>
          <div className="actions">
            <Link className="btn block" href="/train/media">
              {strings.common.retry}
            </Link>
          </div>
        </div>
      ) : null}

      {!failed && records.length === 0 ? (
        <div className="card empty" data-state="empty">
          <span className="lbl">{strings.media.title}</span>
          <div className="head">{strings.media.emptyTitle}</div>
          <p className="sub">{strings.media.emptyBody}</p>
          <div className="actions">
            <Link className="btn primary block" href="/train">
              {strings.trainWeek.back}
            </Link>
          </div>
        </div>
      ) : null}

      {bundled.length > 0 ? (
        <section className="card" data-card="bundled">
          <div className="between">
            <span className="lbl">{strings.media.bundledLabel}</span>
            <span className="chip" data-media-count={records.length}>
              {strings.media.count(records.length)}
            </span>
          </div>
          <p className="note" style={{ margin: '6px 0 var(--s3)' }}>
            {strings.media.bundledNote(bundled.length, totalMegabytes(bundled))}
          </p>

          {bundled.map((record) => {
            const age = daysBetween(record.verifiedAt, now, timeZone);
            return (
              <div className="mediarow" key={record.id} data-media-record={record.id}>
                <div className="between">
                  <span className="head">{movementName(record.movementId)}</span>
                  <span className="chip">{KINDS[record.kind] ?? record.kind}</span>
                </div>
                <span className="note" data-media-author>
                  {strings.media.author}: {record.author}
                </span>
                <span className="note" data-media-licence>
                  {strings.media.licence}: {record.licence}
                </span>
                <span className="note" data-media-mode>
                  {strings.media.mode}: {MODES[record.embeddingMode] ?? record.embeddingMode}
                </span>
                <span className={age > MEDIA_STALE_DAYS ? 'note warn' : 'note'} data-media-verified>
                  {strings.media.verified}: {shortDate(record.verifiedAt, timeZone)}
                </span>
                <a className="note mono" href={record.url} rel="noreferrer noopener" target="_blank">
                  {record.url}
                </a>
              </div>
            );
          })}
        </section>
      ) : null}

      {embeds.length > 0 ? (
        <section className="card" data-card="embeds">
          <span className="lbl">{MODES.youtube_nocookie}</span>
          {embeds.map((record) => (
            <div className="mediarow" key={record.id} data-media-record={record.id}>
              <div className="between">
                <span className="head">{movementName(record.movementId)}</span>
                <span className="chip">{KINDS[record.kind] ?? record.kind}</span>
              </div>
              <span className="note" data-media-author>
                {strings.media.author}: {record.author}
              </span>
              <span className="note" data-media-mode>
                {strings.media.mode}: {MODES[record.embeddingMode] ?? record.embeddingMode}
              </span>
              <span className="note" data-media-verified>
                {strings.media.verified}: {shortDate(record.verifiedAt, timeZone)}
              </span>
              <a className="note mono" href={record.url} rel="noreferrer noopener" target="_blank">
                {record.url}
              </a>
            </div>
          ))}
          <p className="note" style={{ marginTop: 'var(--s2)' }}>
            {strings.media.offlineNote}
          </p>
        </section>
      ) : null}

      <MediaEditor csrfToken={csrfToken} movements={MOVEMENTS.map((movement) => movement.id)} />

      <section className="card" data-card="allowlist">
        <span className="lbl">{strings.media.allowlistLabel}</span>
        {hosts.map((host) => (
          <div className="mediarow" key={host.host} data-allowed-host={host.host}>
            <span className="head mono">{host.host}</span>
            <span className="note">{reasonFor(host.reasonKey)}</span>
          </div>
        ))}
        <p className="note" style={{ marginTop: 'var(--s2)' }}>
          {strings.media.embedNote}
        </p>
      </section>

      <section className="card" data-card="attributions">
        <span className="lbl">{strings.media.attributionsLabel}</span>
        <p className="sub" style={{ marginTop: 'var(--s2)' }}>
          {strings.media.everkinetic}
        </p>
        <p className="sub" style={{ marginTop: 'var(--s2)' }}>
          {strings.media.cdc}
        </p>
        <p className="sub" style={{ marginTop: 'var(--s2)' }}>
          {strings.media.commons}
        </p>
        <p className="sub" style={{ marginTop: 'var(--s2)' }}>
          {strings.media.original}
        </p>
      </section>
    </div>
  );
}
