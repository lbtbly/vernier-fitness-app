'use client';

import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { useState } from 'react';
import { FaceIcon, InfoIcon, KeyIcon, LockIcon, OkIcon, WarnIcon } from '@/components/icons';
import { CSRF_HEADER } from '@/lib/cookie-names';
import { PASSWORD_MINIMUM_LENGTH } from '@/lib/password';
import { strings } from '@/lib/strings';

/**
 * The gate, drawn as .forge/wireframes/01-sign-in.html draws it: passkey first
 * and the only accented action, password underneath as plain text, and the
 * one-time owner creation on the same screen when no account exists yet.
 *
 * Every failure names its cause. A wrong passkey says how many attempts are
 * left, because a pause you cannot see the end of feels like a broken app. A
 * machine that is not answering says so instead of spinning, and it says it
 * from what the browser actually saw, not from a health check that would be
 * answering from the wrong side of the problem.
 */

type Props = {
  originHost: string;
  appUrl: string;
  rpId: string;
  rpName: string;
  ownerExists: boolean;
  csrfToken: string;
  next: string;
  databaseReachable: boolean;
};

type Mode = 'passkey' | 'password';
type Notice = { tone: 'alert' | 'warn' | 'plain'; title?: string; body: string } | null;

const HOST_UNREACHABLE = 'host-unreachable';

export function SignInForm(props: Props) {
  const [mode, setMode] = useState<Mode>('passkey');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(
    props.databaseReachable
      ? null
      : { tone: 'warn', title: strings.signIn.unreachableTitle, body: strings.signIn.unreachableBody },
  );
  const [reachable, setReachable] = useState(props.databaseReachable);

  const creating = !props.ownerExists;

  async function send(path: string, body: unknown): Promise<{ status: number; data: Record<string, unknown> }> {
    let response: Response;
    try {
      response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [CSRF_HEADER]: props.csrfToken },
        body: JSON.stringify(body),
      });
    } catch {
      // A fetch that throws never reached the machine. That is the one failure
      // this screen must not describe as a rejection.
      throw new Error(HOST_UNREACHABLE);
    }
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: response.status, data };
  }

  function fail(error: unknown) {
    if (error instanceof Error && error.message === HOST_UNREACHABLE) {
      setReachable(false);
      setNotice({ tone: 'warn', title: strings.signIn.unreachableTitle, body: strings.signIn.unreachableBody });
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    setNotice({ tone: 'alert', body: message });
  }

  function refuse(data: Record<string, unknown>) {
    const title = typeof data.error === 'string' ? data.error : 'That did not work.';
    const body = typeof data.detail === 'string' ? data.detail : '';
    setNotice({ tone: 'alert', title, body });
  }

  async function retryReach() {
    setBusy(true);
    try {
      const response = await fetch('/healthz', { cache: 'no-store' });
      if (response.ok) {
        setReachable(true);
        setNotice({ tone: 'plain', body: strings.signIn.reachable });
      } else {
        setNotice({ tone: 'warn', title: strings.signIn.unreachableTitle, body: strings.signIn.stillUnreachable });
      }
    } catch {
      setNotice({ tone: 'warn', title: strings.signIn.unreachableTitle, body: strings.signIn.stillUnreachable });
    } finally {
      setBusy(false);
    }
  }

  async function enrolPasskey(): Promise<boolean> {
    const options = await send('/api/auth/passkey/registration/options', {});
    if (options.status !== 200) {
      refuse(options.data);
      return false;
    }
    const attestation = await startRegistration({
      optionsJSON: options.data.options as Parameters<typeof startRegistration>[0]['optionsJSON'],
    });
    const verified = await send('/api/auth/passkey/registration/verify', {
      ceremonyId: options.data.ceremonyId,
      response: attestation,
    });
    if (verified.status !== 201) {
      refuse(verified.data);
      return false;
    }
    return true;
  }

  async function onPasskeySignIn() {
    setBusy(true);
    setNotice(null);
    try {
      const options = await send('/api/auth/passkey/authentication/options', {});
      if (options.status !== 200) {
        refuse(options.data);
        return;
      }
      const assertion = await startAuthentication({
        optionsJSON: options.data.options as Parameters<typeof startAuthentication>[0]['optionsJSON'],
      });
      const verified = await send('/api/auth/passkey/authentication/verify', {
        ceremonyId: options.data.ceremonyId,
        response: assertion,
      });
      if (verified.status !== 200) {
        refuse(verified.data);
        return;
      }
      window.location.assign(props.next);
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }

  async function onPasswordSignIn() {
    setBusy(true);
    setNotice(null);
    try {
      const result = await send('/api/auth/password', { password });
      if (result.status !== 200) {
        refuse(result.data);
        return;
      }
      window.location.assign(props.next);
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }

  async function onCreate() {
    setBusy(true);
    setNotice(null);
    try {
      const created = await send('/api/auth/bootstrap', { password, repeat });
      if (created.status !== 201) {
        refuse(created.data);
        return;
      }
      let enrolled = false;
      try {
        enrolled = await enrolPasskey();
      } catch {
        // The account is created and the password works. A browser with no
        // authenticator is not a failed first run.
        enrolled = false;
      }
      setNotice({
        tone: 'plain',
        body: enrolled ? strings.signIn.passkeyRegistered : strings.signIn.passkeySkipped,
      });
      window.location.assign(props.next);
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }

  const lengthMet = password.length >= PASSWORD_MINIMUM_LENGTH;
  const varietyMet =
    [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(password)).length >= 3;
  const repeatMet = password.length > 0 && password === repeat;

  return (
    <div className="app gate">
      <main className="app-scroll">
        {creating ? (
          <div style={{ padding: '28px 0 10px' }}>
            <div className="mark">
              <KeyIcon />
            </div>
            <h1>{strings.signIn.createTitle}</h1>
            <p className="sub">{strings.signIn.createLead}</p>
            <p className="host" style={{ marginTop: 'var(--s3)' }}>
              {props.originHost}
            </p>
          </div>
        ) : (
          <div className="fill">
            <div className={notice?.tone === 'alert' ? 'mark alert' : 'mark'}>
              <LockIcon />
            </div>
            <h1>{strings.signIn.title}</h1>
            <p className="sub lead">{strings.signIn.lead}</p>
            <p className="host" style={{ marginBottom: 'var(--s7)' }}>
              {props.originHost}
            </p>

            {notice ? <Banner notice={notice} /> : null}

            {mode === 'password' ? (
              <>
                <label className="formfield">
                  <span className="lbl">{strings.signIn.passwordLabel}</span>
                  <input
                    className="input"
                    type="password"
                    name="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </label>
                <div className="stacked">
                  <button type="button" className="btn primary block" onClick={onPasswordSignIn} disabled={busy}>
                    {busy ? strings.signIn.working : strings.signIn.passwordSubmit}
                  </button>
                  <button type="button" className="btn quiet block" onClick={() => setMode('passkey')} disabled={busy}>
                    {strings.signIn.passkeyRetry}
                  </button>
                </div>
              </>
            ) : (
              <div className="stacked">
                <button type="button" className="btn primary block" onClick={onPasskeySignIn} disabled={busy}>
                  <FaceIcon />
                  {busy ? strings.signIn.working : strings.signIn.passkeyAction}
                </button>
                <button type="button" className="btn quiet block" onClick={() => setMode('password')} disabled={busy}>
                  {strings.signIn.passwordAction}
                </button>
              </div>
            )}

            {reachable ? null : (
              <div style={{ marginTop: 'var(--s5)' }}>
                <button type="button" className="btn block" onClick={retryReach} disabled={busy}>
                  {strings.signIn.unreachableAction}
                </button>
              </div>
            )}
          </div>
        )}

        {creating ? (
          <>
            <label className="formfield">
              <span className="lbl">{strings.signIn.passwordLabel}</span>
              <input
                className="input"
                type="password"
                name="new-password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-describedby="password-rules"
              />
            </label>
            <div id="password-rules" style={{ margin: '-4px 0 16px' }}>
              <Check met={lengthMet} label={strings.signIn.passwordRequirement(password.length)} />
              <Check met={varietyMet} label={strings.signIn.passwordVariety} />
              <Check met={null} label={strings.signIn.passwordReuse} />
              <Check met={null} label={strings.signIn.passwordHashNote} />
            </div>

            <label className="formfield">
              <span className="lbl">{strings.signIn.repeatLabel}</span>
              <input
                className="input"
                type="password"
                name="repeat-password"
                autoComplete="new-password"
                value={repeat}
                onChange={(event) => setRepeat(event.target.value)}
                aria-describedby="repeat-rule"
              />
            </label>
            <div id="repeat-rule" style={{ margin: '-4px 0 16px' }}>
              <Check met={repeatMet} label={repeatMet ? strings.signIn.repeatMatch : strings.signIn.repeatMismatch} />
            </div>

            {notice ? <Banner notice={notice} /> : null}

            <section className="card" style={{ marginTop: 'var(--s1)' }}>
              <div className="between" style={{ marginBottom: 'var(--s2)' }}>
                <span className="lbl">{strings.signIn.nextStepLabel}</span>
                <span className="chip">{strings.signIn.nextStepChip}</span>
              </div>
              <div className="hint">
                <FaceIcon className="accent" />
                <div className="sub">{strings.signIn.nextStepBody}</div>
              </div>
            </section>

            <button type="button" className="btn primary block" onClick={onCreate} disabled={busy}>
              {busy ? strings.signIn.createWorking : strings.signIn.createAction}
            </button>

            <div className="card flat empty" style={{ padding: '14px', marginTop: 'var(--s4)', marginBottom: 0 }}>
              <span className="lbl" style={{ marginBottom: '6px' }}>
                {strings.signIn.loseBothLabel}
              </span>
              <div className="note">{strings.signIn.loseBothBody}</div>
            </div>
          </>
        ) : (
          <>
            <div className="card flat empty" style={{ padding: '14px', marginBottom: 0 }}>
              <div className="hint">
                <InfoIcon />
                <div className="note">{strings.signIn.tailscaleNote}</div>
              </div>
            </div>
            <p className="note centre" style={{ marginTop: 'var(--s4)' }}>
              {strings.signIn.rpNoteLead} <span className="mono">{props.rpId}</span>,{' '}
              {strings.signIn.rpNoteTail}
            </p>
          </>
        )}

        <InstallationFacts appUrl={props.appUrl} rpId={props.rpId} rpName={props.rpName} />
      </main>
    </div>
  );
}

/**
 * The three configuration values, read from the environment on every request.
 * They are on the screen for a machine to read, not for the owner: the visible
 * copy above already names the host and the relying party in the words a person
 * needs, and screen 01 has no configuration table on it.
 */
function InstallationFacts({ appUrl, rpId, rpName }: { appUrl: string; rpId: string; rpName: string }) {
  const rows: Array<[string, string]> = [
    [strings.signIn.fieldOrigin, appUrl],
    [strings.signIn.fieldRpId, rpId],
    [strings.signIn.fieldRpName, rpName],
  ];
  return (
    <dl className="visually-hidden">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd data-config-field={label}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Banner({ notice }: { notice: NonNullable<Notice> }) {
  const tone = notice.tone === 'alert' ? 'banner a' : notice.tone === 'warn' ? 'banner w' : 'banner';
  return (
    <div className={tone} role={notice.tone === 'plain' ? 'status' : 'alert'}>
      {notice.tone === 'plain' ? <InfoIcon /> : <WarnIcon />}
      <div>
        {notice.title ? <b>{notice.title}</b> : null}
        {notice.title && notice.body ? <br /> : null}
        {notice.body}
      </div>
    </div>
  );
}

function Check({ met, label }: { met: boolean | null; label: string }) {
  return (
    <div className="check">
      {met === true ? <OkIcon className="good" /> : met === false ? <InfoIcon className="mut" /> : <InfoIcon className="mut" />}
      <span>{label}</span>
    </div>
  );
}
