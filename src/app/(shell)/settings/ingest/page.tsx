import Link from 'next/link';
import { redirect } from 'next/navigation';
import { InfoIcon, KeyIcon, WarnIcon } from '@/components/icons';
import {
  countSamples,
  readLiveAndSecret,
  readRecentBatches,
  readSampleCensus,
} from '@/db/ingest';
import { getConfig } from '@/lib/config';
import { hoursBetween, shortDateTime } from '@/lib/format';
import { canonicalString, twoPassDigest } from '@/lib/health-ingest';
import { readSession } from '@/lib/session';
import { strings } from '@/lib/strings';
import { STALE_HOURS } from '@/lib/trend';

export const metadata = { title: strings.ingest.title };
export const dynamic = 'force-dynamic';

/**
 * Ingest diagnostics, F54. The screen that turns a silent mismatch into a
 * number.
 *
 * The failure it exists for is invisible from both ends. The Shortcut cannot
 * read a status code, so a refused batch looks to the owner exactly like a
 * batch that was never sent; and a wrong signing secret looks exactly like a
 * wrong token. Both of those are one comparison away from being obvious, and
 * this is where the comparison lives: a FIXED canonical string, the digest this
 * machine computes for it with the live secret, and the four lines that compute
 * the same thing on the Mac with the secret pasted into the shortcut. Same
 * digest, same secret. Different digest, and there is the answer.
 *
 * NOTHING HERE PRINTS A SECRET. Not the token, not the signing secret, not a
 * masked prefix of either, not a length. The digest is a one-way function of
 * the secret over a string this page also prints, which is exactly what makes
 * it safe to render and useful to compare.
 *
 * The five states are all here. Empty: no credential, so no digest and a link
 * to the screen that makes one. Loading and error come from the shell's own
 * loading.tsx and error.tsx, which every screen under (shell) inherits. Offline
 * is the service worker's document. Stale: the last accepted batch is older
 * than the 36 hours F34 fixes, and the card says how long and what to do.
 */
export default async function IngestDiagnosticsPage() {
  const session = await readSession();
  if (!session) redirect('/sign-in');

  const config = getConfig();
  const now = new Date();
  const [{ credential, secret }, batches, census, samples] = await Promise.all([
    readLiveAndSecret(),
    readRecentBatches(8),
    readSampleCensus(),
    countSamples(),
  ]);

  if (!credential) {
    return (
      <>
        <header className="title">
          <span className="lbl">{strings.settings.title}</span>
          <h1>{strings.ingest.title}</h1>
          <p className="sub">{strings.ingest.sub}</p>
        </header>
        <div className="card empty" data-state="empty">
          <span className="lbl">{strings.settings.ingestTitle}</span>
          <div className="head">{strings.ingest.emptyTitle}</div>
          <p className="sub">{strings.ingest.emptyBody}</p>
          <div className="actions">
            <Link className="btn primary block" href="/settings">
              {strings.ingest.emptyAction}
            </Link>
          </div>
        </div>
      </>
    );
  }

  const canonical = canonicalString({
    keyId: strings.ingest.canonicalLines[1],
    timestamp: strings.ingest.canonicalLines[2],
    nonce: strings.ingest.canonicalLines[3],
    windowStart: strings.ingest.canonicalLines[4],
    windowEnd: strings.ingest.canonicalLines[5],
  });
  const digest = secret ? twoPassDigest(secret, canonical) : null;

  const accepted = batches.find((batch) => batch.outcome === 'accepted') ?? null;
  const ageHours = accepted ? hoursBetween(accepted.receivedAt, now) : null;
  const stale = ageHours !== null && ageHours >= STALE_HOURS;
  const rollups = census.reduce((total, row) => total + row.rows, 0);

  return (
    <>
      <header className="title">
        <span className="lbl">{strings.settings.title}</span>
        <h1>{strings.ingest.title}</h1>
        <p className="sub">{strings.ingest.sub}</p>
      </header>

      {/*
        * The state of the thing, first, because it is what the owner came to
        * find out. Warn past 36 hours, neutral otherwise, and never an alert:
        * a quiet phone is something that needs attention and not an operation
        * that failed.
        */}
      <section
        className="card"
        data-card="ingest-state"
        data-state={stale ? 'stale' : 'ok'}
        style={stale ? { borderColor: 'var(--warn)' } : undefined}
      >
        <div className="between">
          <span className="lbl">{strings.settings.ingestTitle}</span>
          <span className={stale ? 'chip w' : 'chip g'}>
            {stale ? strings.ingest.staleTitle : strings.ingest.stateLive}
          </span>
        </div>
        <p className="sub" style={{ marginTop: 'var(--s2)' }}>
          {stale && ageHours !== null ? strings.ingest.staleBody(ageHours) : strings.ingest.healthyBody}
        </p>
        <div className="row">
          <span className="grow sub mut">{strings.ingest.endpointLabel}</span>
          <span className="mono">{strings.ingest.endpointPath}</span>
        </div>
        <div className="row">
          <span className="grow sub mut">{strings.ingest.keyIdLabel}</span>
          <span className="mono">{credential.keyId}</span>
        </div>
        <div className="row">
          <span className="grow sub mut">{strings.ingest.createdLabel}</span>
          <span className="num">{shortDateTime(credential.createdAt, config.timeZone)}</span>
        </div>
        <div className="row">
          <span className="grow sub mut">{strings.ingest.lastUsedLabel}</span>
          <span className="num">
            {credential.lastUsedAt
              ? shortDateTime(credential.lastUsedAt, config.timeZone)
              : strings.ingest.neverUsed}
          </span>
        </div>
        <div className="row">
          <span className="grow sub mut">{strings.ingest.rowsLabel}</span>
          <span className="num">{samples}</span>
        </div>
        <p className="note" style={{ marginTop: 'var(--s2)' }}>
          {strings.ingest.tokenScopeBody}
        </p>
      </section>

      {/* ---------- the comparison this screen exists for ---------- */}
      <section className="card" data-card="canonical">
        <div className="between">
          <span className="lbl">{strings.ingest.canonicalLabel}</span>
          <KeyIcon />
        </div>
        <p className="sub" style={{ marginTop: 'var(--s2)' }}>
          {strings.ingest.canonicalNote}
        </p>
        {/*
          * One element per line rather than one block with newlines in it. Six
          * text nodes read back as six strings, which is what makes each of
          * them checkable against the catalogue on its own.
          */}
        <div className="mono" data-canonical style={{ marginTop: 'var(--s2)' }}>
          {strings.ingest.canonicalLines.map((line, index) => (
            <div key={`${line}-${index}`} data-canonical-line={index}>
              {line}
            </div>
          ))}
        </div>

        <div className="row" style={{ marginTop: 'var(--s3)' }}>
          <span className="grow sub mut">{strings.ingest.digestLabel}</span>
        </div>
        <div className="mono" data-digest>
          {digest ?? strings.ingest.digestMissing}
        </div>
        <p className="note" style={{ marginTop: 'var(--s2)' }}>
          {strings.ingest.digestNote}
        </p>

        <div className="row" style={{ marginTop: 'var(--s3)' }}>
          <span className="grow sub mut">{strings.ingest.commandLabel}</span>
        </div>
        <div className="mono" data-command>
          {strings.ingest.commandLines.map((line, index) => (
            <div key={`${line}-${index}`}>{line}</div>
          ))}
        </div>
      </section>

      {/* ---------- the path with no iPhone in it ---------- */}
      <section className="card" data-card="fixture">
        <span className="lbl">{strings.ingest.fixtureLabel}</span>
        <p className="sub" style={{ marginTop: 'var(--s2)' }}>
          {strings.ingest.fixtureNote}
        </p>
        <div className="mono">{strings.ingest.fixtureCommand}</div>
      </section>

      {/* ---------- every arrival, refused ones included ---------- */}
      <section className="card" data-card="arrivals">
        <div className="between">
          <span className="lbl">{strings.ingest.batchesLabel}</span>
          <InfoIcon />
        </div>
        {batches.length === 0 ? (
          <p className="sub" style={{ marginTop: 'var(--s2)' }} data-state="empty">
            {strings.ingest.batchesEmpty}
          </p>
        ) : (
          batches.map((batch) => (
            <div className="row" key={batch.id} data-outcome={batch.outcome}>
              <div className="stack grow">
                <span className="head">
                  {strings.api.ingest.outcomes[
                    batch.outcome as keyof typeof strings.api.ingest.outcomes
                  ] ?? batch.outcome}
                </span>
                <span className="note num">{shortDateTime(batch.receivedAt, config.timeZone)}</span>
                <span className="note">{strings.ingest.batchDevice(batch.device)}</span>
              </div>
              <span className="note num">
                {strings.ingest.batchRow(batch.rowsAccepted, batch.rowsDuplicate)}
              </span>
            </div>
          ))
        )}
        <p className="note" style={{ marginTop: 'var(--s2)' }}>
          {strings.ingest.batchesNote}
        </p>
      </section>

      {/* ---------- what is actually in the table, per metric ---------- */}
      <section className="card" data-card="census">
        <span className="lbl">{strings.ingest.censusLabel}</span>
        {census.length === 0 ? (
          <p className="sub" style={{ marginTop: 'var(--s2)' }} data-state="empty">
            {strings.ingest.batchesEmpty}
          </p>
        ) : (
          census.map((row) => (
            <div className="row" key={row.metric} data-census={row.metric}>
              <span className="grow mono">{row.metric}</span>
              <span className="num">{row.rows}</span>
              <span className="note num">
                {row.newest ? shortDateTime(row.newest, config.timeZone) : strings.ingest.neverUsed}
              </span>
            </div>
          ))
        )}
        {/*
          * The population beside the zero, always. A census that printed only
          * "0 unrecognised metrics" would read identically whether it walked
          * nine metrics or none, and this run has already paid for that shape
          * more than once.
          */}
        <p className="note" style={{ marginTop: 'var(--s2)' }} data-census-total={rollups}>
          {strings.ingest.censusTotal(rollups)}
        </p>
        <p className="note">{strings.ingest.censusNote}</p>
      </section>

      <div className="actions">
        <Link className="btn block" href="/settings/shortcut">
          <WarnIcon />
          {strings.ingest.guideLink}
        </Link>
        <Link className="btn quiet block" href="/settings">
          {strings.ingest.settingsLink}
        </Link>
      </div>
    </>
  );
}
