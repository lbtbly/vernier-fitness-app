'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CalendarIcon, InfoIcon, OkIcon, WarnIcon } from '@/components/icons';
import type { GoogleView } from '@/db/google';
import type { CalendarChoice } from '@/lib/google/client';
import { CSRF_HEADER } from '@/lib/cookie-names';
import { calendarCauseLine, calendarStateLabel } from '@/lib/display';
import { shortDateTime } from '@/lib/format';
import { messageOf } from '@/lib/platform-cause';
import { strings } from '@/lib/strings';

/**
 * Screen 12's Google Calendar card: what the connection is doing, which
 * calendars it reads, and the one action it offers when Google has refused the
 * grant.
 *
 * WHAT IT NEVER SHOWS. No token, no refresh token and no client secret, in any
 * state. It cannot: `GoogleView` has no field that could carry one. The scopes
 * are on it, and a scope is what the owner agreed to rather than something he
 * was issued, so it is printed on purpose: three lines, and anybody can read
 * that neither of the two write-everything scopes is among them.
 *
 * ONE RECONNECT AND NOTHING ELSE, after a permanent refusal. F109 asks for
 * exactly one action, no retry loop and the raw error visible, and that is what
 * the revoked branch below draws: the instant it happened, Google's own words,
 * and a single button.
 *
 * ALL FIVE STATES, ON ONE SURFACE. Loading is a skeleton at the final size while
 * a button works. Empty is the dashed card with one action. Error is the solid
 * `--alert` card with the failure in words and a line saying what still works.
 * Offline is the same card saying the browser never reached the Mac mini. Stale
 * is the `--warn` cause line under the chip.
 */

type Action = 'connect' | 'calendars' | 'choose' | 'disconnect';

type Notice =
  | { tone: 'plain'; lines: string[] }
  | { tone: 'error'; title: string; detail: string };

const CHIP: Record<string, string> = {
  connected: 'chip g',
  demo: 'chip d',
  connecting: 'chip w',
  revoked: 'chip a',
  disconnected: 'chip',
};

export function GooglePanel({
  view,
  timeZone,
  csrfToken,
}: {
  view: GoogleView;
  timeZone: string;
  csrfToken: string;
}) {
  const router = useRouter();
  const [state, setState] = useState(view);
  const [busy, setBusy] = useState<Action | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [choices, setChoices] = useState<CalendarChoice[] | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set(view.watchedCalendarIds));

  const connected = state.state === 'connected' || state.state === 'demo';
  const cause = calendarCauseLine(state.cause);
  const when = (iso: string | null) => (iso ? shortDateTime(new Date(iso), timeZone) : null);

  async function run(action: Action, body: Record<string, unknown> = {}) {
    setBusy(action);
    setNotice(null);
    try {
      const response = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'content-type': 'application/json', [CSRF_HEADER]: csrfToken },
        body: JSON.stringify({ action, ...body }),
      });
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (data.calendar) setState(data.calendar as GoogleView);

      if (!response.ok) {
        setNotice({
          tone: 'error',
          title: String(data.error ?? strings.calendar.errorTitle),
          detail: String(data.detail ?? strings.calendar.errorStillWorks),
        });
        return;
      }

      // A live connection sends the owner to Google. Demonstration mode has
      // nowhere to send him: the handshake already completed on the server.
      const authorizeUrl = typeof data.authorizeUrl === 'string' ? data.authorizeUrl : null;
      if (authorizeUrl) {
        setNotice({ tone: 'plain', lines: [strings.calendar.connectOpen] });
        window.location.assign(authorizeUrl);
        return;
      }

      if (action === 'calendars' && Array.isArray(data.calendars)) {
        const list = data.calendars as CalendarChoice[];
        setChoices(list);
        // Nothing chosen yet means every calendar the account has, because
        // availability read from none of them would place every session on a
        // day the owner is not free and call it clear.
        if (ticked.size === 0) setTicked(new Set(list.map((entry) => entry.id)));
        return;
      }

      if (action === 'connect') setNotice({ tone: 'plain', lines: [strings.calendar.connected] });
      if (action === 'choose') {
        setChoices(null);
        setNotice({ tone: 'plain', lines: [strings.calendar.pickSaved] });
      }
      if (action === 'disconnect') {
        setChoices(null);
        setNotice({ tone: 'plain', lines: [strings.calendar.disconnectedNote] });
      }
      router.refresh();
    } catch (error) {
      setNotice({
        tone: 'error',
        title: strings.calendar.errorTitle,
        detail: navigator.onLine ? messageOf(error) : strings.calendar.offline,
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card" data-google={state.state} style={borderFor(state.state)}>
      <div className="between" style={{ alignItems: 'flex-start' }}>
        <div className="stack grow">
          <span className="head">{strings.calendar.title}</span>
          <span className="note">{strings.calendar.purpose}</span>
        </div>
        <span className={CHIP[state.state] ?? 'chip'} data-google-state={state.state}>
          <CalendarIcon />
          {calendarStateLabel(state.state)}
        </span>
      </div>

      {/* THE PERMANENT REFUSAL, and the one action it offers. */}
      {state.state === 'revoked' ? (
        <div className="card error" data-state="error" data-google="revoked" style={{ marginTop: 'var(--s3)' }}>
          <div className="between">
            <span className="lbl">{strings.calendar.reconnectTitle}</span>
            <span className="chip a">
              <WarnIcon />
              {strings.error.failedChip}
            </span>
          </div>
          <p className="sub">{strings.calendar.reconnectBody}</p>
          {state.disconnectedAt ? (
            <p className="note" data-google-disconnected-at>
              {strings.calendar.disconnectedAt(when(state.disconnectedAt)!)}
            </p>
          ) : null}
          {cause ? (
            <p className="sub warn" data-google-cause={state.cause}>
              {cause}
            </p>
          ) : null}
          {state.rawError ? (
            <>
              <span className="lbl" style={{ marginTop: 'var(--s2)' }}>
                {strings.calendar.rawErrorLabel}
              </span>
              <p className="mono" data-google-raw-error>
                {state.rawError}
              </p>
            </>
          ) : null}
        </div>
      ) : cause ? (
        <p className="sub warn" data-google-cause={state.cause} style={{ marginTop: 'var(--s2)' }}>
          {cause}
        </p>
      ) : null}

      {state.state === 'disconnected' && !cause ? (
        <div className="card empty" data-state="empty" style={{ marginTop: 'var(--s3)' }}>
          <div className="head">{strings.calendar.emptyTitle}</div>
          <p className="sub">{strings.calendar.emptyBody}</p>
        </div>
      ) : (
        <dl>
          <div className="field">
            <dt>{strings.calendar.appCalendarLabel}</dt>
            <dd>
              {busy ? (
                <span className="skel" style={{ width: '112px' }} />
              ) : (
                (state.appCalendarSummary ?? strings.calendar.appCalendarNone)
              )}
            </dd>
          </div>
          <div className="field">
            <dt>{strings.calendar.watchedLabel}</dt>
            <dd className="num" data-google-watched={state.watchedCalendarIds.length}>
              {state.watchedCalendarIds.length === 0
                ? strings.calendar.watchedNone
                : strings.calendar.pickCount(state.watchedCalendarIds.length, state.watchedCalendarIds.length)}
            </dd>
          </div>
          <div className="field">
            <dt>{strings.calendar.lastAvailability}</dt>
            <dd className="num">{when(state.lastAvailabilityAt) ?? strings.calendar.neverRead}</dd>
          </div>
        </dl>
      )}

      {/* THE THREE SCOPES, PRINTED. Anyone can read that neither write-everything
          scope is among them, which is the whole reason they are on screen. */}
      <span className="lbl" style={{ marginTop: 'var(--s3)' }}>
        {strings.calendar.scopesLabel}
      </span>
      <ul className="difflist" data-google-scopes={state.scopes.length}>
        {state.scopes.map((scope) => (
          <li key={scope} data-scope={scope}>
            <span className="mono">{scope}</span>
          </li>
        ))}
      </ul>
      <p className="note">{strings.calendar.scopesNote}</p>

      {/* The picker. Busy and free only, and it says so before it is used. */}
      {choices ? (
        <div className="card" data-google="picker" style={{ marginTop: 'var(--s3)' }}>
          <span className="lbl">{strings.calendar.pickTitle}</span>
          <p className="sub" style={{ marginTop: '6px' }}>
            {strings.calendar.pickBody}
          </p>
          {choices.length === 0 ? (
            <div className="card empty" data-state="empty" style={{ marginTop: 'var(--s3)' }}>
              <div className="head">{strings.calendar.pickEmptyTitle}</div>
              <p className="sub">{strings.calendar.pickEmptyBody}</p>
            </div>
          ) : (
            choices.map((choice) => (
              <div className="item" key={choice.id} data-calendar-choice={choice.id}>
                {/*
                  * The same checkbox the shopping list ships: a 44 px tap target
                  * wrapping a 28 px glyph, the state on the inner element and
                  * the label on the button, so nothing here invents a control.
                  */}
                <button
                  type="button"
                  className="boxtap"
                  aria-label={choice.summary}
                  onClick={() =>
                    setTicked((previous) => {
                      const copy = new Set(previous);
                      if (copy.has(choice.id)) copy.delete(choice.id);
                      else copy.add(choice.id);
                      return copy;
                    })
                  }
                >
                  <span className="box" role="checkbox" aria-checked={ticked.has(choice.id)} aria-hidden="true">
                    <OkIcon />
                  </span>
                </button>
                <div className="stack grow">
                  <span className="name">{choice.summary}</span>
                  {choice.primary ? <span className="note">{strings.calendar.pickPrimaryNote}</span> : null}
                </div>
              </div>
            ))
          )}
          <div className="actions">
            <button
              type="button"
              className="btn primary block"
              data-control="save-calendars"
              disabled={busy !== null}
              onClick={() => void run('choose', { calendarIds: [...ticked] })}
            >
              {busy === 'choose' ? strings.calendar.working : strings.calendar.pickSave}
            </button>
          </div>
        </div>
      ) : null}

      <div className="actions">
        {connected ? (
          <>
            <button
              type="button"
              className={state.watchedCalendarIds.length === 0 ? 'btn primary grow' : 'btn grow'}
              data-control="choose-calendars"
              disabled={busy !== null}
              onClick={() => void run('calendars')}
            >
              {busy === 'calendars' ? strings.calendar.working : strings.calendar.pickTitle}
            </button>
            <Link
              className={state.watchedCalendarIds.length === 0 ? 'btn grow' : 'btn primary grow'}
              href="/train/calendar"
            >
              {strings.calendar.openDiff}
            </Link>
            <button
              type="button"
              className="btn quiet grow"
              data-control="disconnect"
              disabled={busy !== null}
              onClick={() => void run('disconnect')}
            >
              {strings.calendar.disconnect}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn primary block"
            data-control="connect"
            disabled={busy !== null}
            onClick={() => void run('connect')}
          >
            <CalendarIcon />
            {busy === 'connect'
              ? strings.calendar.working
              : state.state === 'revoked'
                ? strings.calendar.reconnect
                : state.mode === 'demo'
                  ? strings.calendar.connectDemo
                  : strings.calendar.connect}
          </button>
        )}
      </div>

      {notice?.tone === 'error' ? (
        <div className="card error" data-state="error" style={{ marginTop: 'var(--s3)' }}>
          <div className="between">
            <span className="lbl">{strings.calendar.errorTitle}</span>
            <span className="chip a">{strings.error.failedChip}</span>
          </div>
          <div className="head">{notice.title}</div>
          <p className="sub">{notice.detail}</p>
          <p className="note">{strings.calendar.errorStillWorks}</p>
          <div className="actions">
            <button type="button" className="btn grow" onClick={() => setNotice(null)}>
              {strings.calendar.errorRetry}
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

      <p className="note" style={{ marginTop: 'var(--s3)' }}>
        {strings.calendar.neverShown}
      </p>
    </section>
  );
}

/** A card that needs the owner carries the warn edge. Colour is state, never decoration. */
function borderFor(state: string): { borderColor?: string } {
  if (state === 'connecting') return { borderColor: 'var(--warn)' };
  if (state === 'revoked') return { borderColor: 'var(--alert)' };
  return {};
}
