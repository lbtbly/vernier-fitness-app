'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { InfoIcon, ScaleIcon, SyncIcon, WarnIcon } from '@/components/icons';
import type { WithingsView } from '@/db/withings';
import { CSRF_HEADER } from '@/lib/cookie-names';
import { withingsCauseLine, withingsStateLabel } from '@/lib/display';
import { shortDateTime } from '@/lib/format';
import { messageOf } from '@/lib/platform-cause';
import { strings } from '@/lib/strings';

/**
 * Screen 12's Withings card: what the connection is doing, what it last did,
 * and the five things the owner can ask it for.
 *
 * WHAT IT NEVER SHOWS. No token, no client secret, no account identifier, in
 * any state. It cannot: `WithingsView` has no field that could carry one, the
 * Withings user id is inside the sealed bundle rather than in a column, and the
 * only credential-shaped thing on this screen is the scope, which is an OAuth
 * value the owner asked for rather than a secret he was issued.
 *
 * ALL FIVE STATES, ON ONE SURFACE. Loading is a skeleton at the final size
 * while a button is working. Empty is the dashed card with one action, because
 * a scale nobody has connected is an absence and not a failure. Error is the
 * solid `--alert` card with the failure in words, the cause named, one button
 * and a line saying what still works. Offline is the same card saying the
 * browser never reached the Mac mini. Stale is the `--warn` chip carrying the
 * state and the cause sentence under it.
 *
 * THE GEOMETRY IS THE SHIPPED ONE. `12-settings-integrations.html` draws each
 * integration as its own card and the screen this repository already ships
 * draws them as rows inside one card. Two precedents, and this follows the
 * shipped screen for the list and the sheet for this card, which is the one the
 * sheet gives a status line, a cause and two actions of its own.
 */

type Props = {
  view: WithingsView;
  timeZone: string;
  csrfToken: string;
  /** Open import questions right now, so the card can say one is waiting. */
  openQuestions: number;
};

type Action = 'connect' | 'import' | 'sync' | 'test' | 'disconnect';

type Notice =
  | { tone: 'plain'; lines: string[] }
  | { tone: 'error'; title: string; detail: string; stillWorks: boolean };

const CHIP: Record<string, string> = {
  connected: 'chip g',
  demo: 'chip d',
  expiring: 'chip w',
  revoked: 'chip a',
  connecting: 'chip w',
  disconnected: 'chip',
};

export function WithingsPanel(props: Props) {
  const router = useRouter();
  const [view, setView] = useState(props.view);
  const [busy, setBusy] = useState<Action | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const when = (iso: string | null) => (iso ? shortDateTime(new Date(iso), props.timeZone) : null);
  const cause = withingsCauseLine(view.cause);
  const connected = view.state === 'connected' || view.state === 'demo' || view.state === 'expiring';
  const neverImported = view.storedRows === 0;

  async function run(action: Action) {
    setBusy(action);
    setNotice(null);
    try {
      const response = await fetch('/api/withings', {
        method: 'POST',
        headers: { 'content-type': 'application/json', [CSRF_HEADER]: props.csrfToken },
        body: JSON.stringify({ action }),
      });
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (data.withings) setView(data.withings as WithingsView);

      if (!response.ok) {
        setNotice({
          tone: 'error',
          title: String(data.error ?? strings.withings.errorTitle),
          detail: String(data.detail ?? strings.withings.errorStillWorks),
          stillWorks: true,
        });
        return;
      }

      // A live connection sends the owner to Withings. Demonstration mode has
      // nowhere to send him: the handshake already completed on the server.
      const authorizeUrl = typeof data.authorizeUrl === 'string' ? data.authorizeUrl : null;
      if (authorizeUrl) {
        setNotice({ tone: 'plain', lines: [strings.withings.connectOpen] });
        window.location.assign(authorizeUrl);
        return;
      }

      setNotice(readNotice(action, data));
      router.refresh();
    } catch (error) {
      // The origin went away mid-request. Same card, same shape, and the words
      // are read off what the browser rejected with rather than invented.
      setNotice({
        tone: 'error',
        title: strings.withings.errorTitle,
        detail: navigator.onLine ? messageOf(error) : strings.withings.offline,
        stillWorks: true,
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card" data-withings={view.state} style={borderFor(view.state)}>
      <div className="between" style={{ alignItems: 'flex-start' }}>
        <div className="stack grow">
          <span className="head">{strings.withings.title}</span>
          <span className="note">{strings.withings.purpose}</span>
        </div>
        <span className={CHIP[view.state] ?? 'chip'} data-withings-state={view.state}>
          <ScaleIcon />
          {withingsStateLabel(view.state)}
        </span>
      </div>

      {cause ? (
        <p className="sub warn" data-withings-cause={view.cause} style={{ marginTop: 'var(--s2)' }}>
          {cause}
        </p>
      ) : null}

      {view.state === 'disconnected' && !cause ? (
        <div className="card empty" style={{ marginTop: 'var(--s3)' }}>
          <div className="head">{strings.withings.emptyTitle}</div>
          <p className="sub">{strings.withings.emptyBody}</p>
        </div>
      ) : (
        <dl>
          <div className="field">
            <dt>{strings.withings.lastSync}</dt>
            <dd className="num">
              {busy ? (
                <span className="skel" style={{ width: '112px' }} />
              ) : (
                (when(view.lastSuccessfulSyncAt) ?? strings.withings.neverSynced)
              )}
            </dd>
          </div>
          <div className="field">
            <dt>{strings.withings.readingsStored}</dt>
            <dd className="num">
              {busy ? <span className="skel" style={{ width: '48px' }} /> : view.storedRows}
            </dd>
          </div>
          <div className="field">
            <dt>{strings.withings.cursorLabel}</dt>
            <dd className="num">{when(view.cursorAt) ?? strings.withings.cursorNever}</dd>
          </div>
          <div className="field">
            <dt>{strings.withings.groupsDropped}</dt>
            <dd className="num">{view.groupsDropped}</dd>
          </div>
          <div className="field">
            <dt>{strings.settings.scopeLabel}</dt>
            <dd className="mono">{view.scope}</dd>
          </div>
        </dl>
      )}

      {props.openQuestions > 0 ? (
        <div className="banner w" role="status" style={{ marginTop: 'var(--s3)' }}>
          <WarnIcon />
          <div>{strings.question.openCount(props.openQuestions)}</div>
        </div>
      ) : null}

      <div className="actions">
        {connected ? (
          <>
            <button
              type="button"
              className={neverImported ? 'btn primary grow' : 'btn grow'}
              onClick={() => void run('import')}
              disabled={busy !== null}
            >
              <SyncIcon />
              {busy === 'import' ? strings.withings.working : strings.withings.importHistory}
            </button>
            <button
              type="button"
              className={neverImported ? 'btn grow' : 'btn primary grow'}
              onClick={() => void run('sync')}
              disabled={busy !== null}
            >
              {busy === 'sync' ? strings.withings.working : strings.withings.syncNow}
            </button>
            <button
              type="button"
              className="btn grow"
              onClick={() => void run('test')}
              disabled={busy !== null}
            >
              {busy === 'test' ? strings.withings.working : strings.withings.test}
            </button>
            <button
              type="button"
              className="btn quiet grow"
              onClick={() => void run('disconnect')}
              disabled={busy !== null}
            >
              {strings.withings.disconnect}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn primary block"
            onClick={() => void run('connect')}
            disabled={busy !== null}
          >
            <ScaleIcon />
            {busy === 'connect'
              ? strings.withings.working
              : view.state === 'revoked' || view.state === 'expiring'
                ? strings.withings.reconnect
                : view.mode === 'demo'
                  ? strings.withings.connectDemo
                  : strings.withings.connect}
          </button>
        )}
      </div>

      {notice?.tone === 'error' ? (
        <div className="card error" data-state="error" style={{ marginTop: 'var(--s3)' }}>
          <div className="between">
            <span className="lbl">{strings.withings.errorTitle}</span>
            <span className="chip a">{strings.api.correction.chip}</span>
          </div>
          <div className="head">{notice.title}</div>
          <p className="sub">{notice.detail}</p>
          <p className="note">{strings.withings.errorStillWorks}</p>
          <div className="actions">
            <button type="button" className="btn grow" onClick={() => setNotice(null)}>
              {strings.withings.errorRetry}
            </button>
          </div>
        </div>
      ) : null}

      {notice?.tone === 'plain' ? (
        <div className="banner" role="status" style={{ marginTop: 'var(--s3)' }}>
          <InfoIcon />
          <div className="stack">
            {notice.lines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </div>
        </div>
      ) : null}

      {view.lastBatchId ? (
        <Link className="btn block" href={`/source/${view.lastBatchId}`} style={{ marginTop: 'var(--s3)' }}>
          {strings.withings.openBatch}
        </Link>
      ) : null}

      <p className="note" style={{ marginTop: 'var(--s3)' }}>
        {strings.withings.bloodPressureNote}
      </p>
      <p className="note" style={{ marginTop: 'var(--s2)' }}>
        {strings.withings.neverShown}
      </p>
    </section>
  );
}

/** A card that needs the owner carries the warn edge. Colour is state, never decoration. */
function borderFor(state: string): { borderColor?: string } {
  if (state === 'expiring' || state === 'connecting') return { borderColor: 'var(--warn)' };
  if (state === 'revoked') return { borderColor: 'var(--alert)' };
  return {};
}

/** What one finished action says, assembled from catalogue lines and never from markup. */
function readNotice(action: Action, data: Record<string, unknown>): Notice {
  if (action === 'connect') return { tone: 'plain', lines: [strings.withings.connected] };
  if (action === 'disconnect') {
    return { tone: 'plain', lines: [strings.withings.disconnectedNote] };
  }
  if (action === 'test') {
    const test = (data.test ?? {}) as { ok?: boolean };
    return { tone: 'plain', lines: [test.ok ? strings.withings.testPassed : strings.withings.testWrote] };
  }

  const report = (data.report ?? {}) as {
    stored?: number;
    revised?: number;
    questions?: number;
    measuresSeen?: number;
    bloodPressureGroupsDropped?: number;
    cappedOut?: boolean;
  };
  const stored = report.stored ?? 0;
  const lines: string[] = [];
  if (action === 'import') {
    lines.push(strings.withings.imported(stored, report.measuresSeen ?? 0));
  } else if (stored === 0 && (report.revised ?? 0) === 0) {
    lines.push(strings.withings.nothingNew);
  } else {
    lines.push(strings.withings.synced(stored));
  }
  if ((report.revised ?? 0) > 0) lines.push(strings.withings.revisedNote(report.revised ?? 0));
  if ((report.questions ?? 0) > 0) lines.push(strings.withings.questionsNote(report.questions ?? 0));
  if ((report.bloodPressureGroupsDropped ?? 0) > 0) {
    lines.push(strings.withings.droppedNote(report.bloodPressureGroupsDropped ?? 0));
  }
  if (report.cappedOut) lines.push(strings.withings.causes.page_cap);
  return { tone: 'plain', lines };
}
