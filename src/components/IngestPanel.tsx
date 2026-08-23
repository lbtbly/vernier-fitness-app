'use client';

import Link from 'next/link';
import { useState } from 'react';
import { InfoIcon, KeyIcon, WarnIcon, WaveIcon } from '@/components/icons';
import { CSRF_HEADER } from '@/lib/cookie-names';
import { strings } from '@/lib/strings';

/**
 * The Apple Health card on Settings: the state of the ingest credential, the
 * two controls that change it, and the one moment either half of it is legible.
 *
 * Shown once means shown once. The token and the secret exist in exactly one
 * HTTP response, the 201 that created them, and this component holds them in
 * React state until the owner says he has copied them. Nothing writes them to
 * storage, nothing puts them in a URL, and no later render can get them back:
 * the server keeps a hash of one and a sealed copy of the other, and neither is
 * returned by any read.
 *
 * The warning about that is drawn BEFORE the button rather than after it. Read
 * afterwards it is a trap; read first it is a warning.
 */

export type IngestCredentialView = {
  keyId: string;
  createdAt: string;
  lastUsedAt: string | null;
} | null;

type Props = {
  credential: IngestCredentialView;
  /** When the last accepted batch arrived, already formatted in the app's zone. */
  lastBatchAt: string | null;
  lastBatchAgeHours: number | null;
  stale: boolean;
  csrfToken: string;
};

type Minted = { keyId: string; token: string; secret: string };

export function IngestPanel(props: Props) {
  const [credential, setCredential] = useState<IngestCredentialView>(props.credential);
  const [minted, setMinted] = useState<Minted | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function send(action: 'create' | 'revoke') {
    setBusy(true);
    setFailure(null);
    try {
      const response = await fetch('/api/settings/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [CSRF_HEADER]: props.csrfToken },
        body: JSON.stringify({ action }),
      });
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (action === 'create') {
        if (response.status !== 201) {
          setFailure(String(data.detail ?? data.error ?? strings.settings.ingestFailed));
          return;
        }
        setMinted({
          keyId: String(data.keyId),
          token: String(data.token),
          secret: String(data.secret),
        });
        setCredential({
          keyId: String(data.keyId),
          createdAt: new Date().toISOString(),
          lastUsedAt: null,
        });
        return;
      }
      if (response.status !== 200) {
        setFailure(String(data.detail ?? data.error ?? strings.settings.ingestFailed));
        return;
      }
      setMinted(null);
      setCredential(null);
      setFailure(null);
    } catch {
      // The Mac mini did not answer at all, which on this app means the phone
      // is off the tailnet. The card says so in its own words rather than
      // printing whatever the browser threw.
      setFailure(strings.settings.ingestFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={credential ? 'card' : 'card empty'} data-card="ingest">
      <div className="between">
        <span className="lbl">{strings.settings.ingestTitle}</span>
        {credential ? (
          props.stale ? (
            <span className="src stale" data-stale="apple_health_shortcut">
              <WaveIcon />
              {/*
                * A credential that has never been used has no age, and an age
                * of zero would read as "0 days ago" about a batch that has not
                * happened. Absence says absence.
                */}
              {props.lastBatchAgeHours === null
                ? strings.signals.lastIngestNever
                : props.lastBatchAgeHours < 48
                  ? strings.signals.lastIngestAgeHours(props.lastBatchAgeHours)
                  : strings.signals.lastIngestAgeDays(Math.floor(props.lastBatchAgeHours / 24))}
            </span>
          ) : (
            <span className="chip g">{strings.ingest.stateLive}</span>
          )
        ) : (
          <span className="chip">{strings.settings.ingestNone}</span>
        )}
      </div>

      {credential ? (
        <>
          <div className="head">{strings.settings.ingestLive(credential.keyId)}</div>
          <div className="row">
            <span className="grow sub mut">{strings.signals.lastIngestLabel}</span>
            <span className={props.stale ? 'num note warn' : 'num note'} data-ingest-last>
              {props.lastBatchAt ?? strings.signals.lastIngestNever}
            </span>
          </div>
          <p className="note">{strings.settings.ingestCreatedOn(formatIso(credential.createdAt))}</p>
        </>
      ) : (
        <>
          <div className="head">{strings.settings.ingestNone}</div>
          <p className="sub">{strings.settings.ingestNoneBody}</p>
        </>
      )}

      {minted ? (
        <div className="card" data-shown-once style={{ marginTop: 'var(--s3)' }}>
          <div className="between">
            <span className="lbl">{strings.settings.ingestShownOnce}</span>
            <KeyIcon />
          </div>
          <p className="sub">{strings.settings.ingestShownOnceBody}</p>
          {/*
            * A description list, the way `/settings` already draws a labelled
            * value. `dt` and `dd` outside a `dl` are not a description list at
            * all: the accessibility tree gets two orphan elements and the
            * screen reader reads the value with no idea what it is the value
            * of, which for a credential a person is about to paste is the worst
            * place in this app to get it wrong.
            */}
          <dl>
            <div className="field">
              <dt className="note">{strings.settings.ingestKeyIdLabel}</dt>
              <dd className="mono">{minted.keyId}</dd>
            </div>
            <div className="field">
              <dt className="note">{strings.settings.ingestTokenLabel}</dt>
              <dd className="mono" data-minted="token">
                {minted.token}
              </dd>
            </div>
            <div className="field">
              <dt className="note">{strings.settings.ingestSecretLabel}</dt>
              <dd className="mono" data-minted="secret">
                {minted.secret}
              </dd>
            </div>
          </dl>
          <div className="actions">
            <button type="button" className="btn primary block" onClick={() => setMinted(null)}>
              {strings.settings.ingestDone}
            </button>
          </div>
        </div>
      ) : null}

      <p className="note" style={{ marginTop: 'var(--s3)' }}>
        {credential ? strings.settings.ingestCreateWarning : strings.settings.ingestScopeNote}
      </p>

      <div className="actions">
        <button
          type="button"
          className={credential ? 'btn block' : 'btn primary block'}
          onClick={() => send('create')}
          disabled={busy}
        >
          <KeyIcon />
          {credential ? strings.settings.ingestRotate : strings.settings.ingestCreate}
        </button>
        {credential ? (
          <button type="button" className="btn quiet block" onClick={() => send('revoke')} disabled={busy}>
            {strings.settings.ingestRevoke}
          </button>
        ) : null}
      </div>

      <div className="actions">
        <Link className="btn block" href="/settings/shortcut">
          <InfoIcon />
          {strings.settings.ingestOpenGuide}
        </Link>
        <Link className="btn block" href="/settings/ingest">
          <WaveIcon />
          {strings.settings.ingestOpenDiagnostics}
        </Link>
      </div>

      {failure ? (
        <div className="banner a" role="status" style={{ marginTop: 'var(--s3)' }}>
          <WarnIcon />
          <div>{failure}</div>
        </div>
      ) : null}
    </section>
  );
}

/**
 * The created date, rendered on the client from an ISO string the server sent.
 *
 * The app's zone rather than the browser's, because DESIGN.md fixes one zone
 * for every date this product draws and a phone carried to Lisbon must not
 * quietly redate a credential.
 */
function formatIso(iso: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Europe/Paris',
  }).format(date);
}
