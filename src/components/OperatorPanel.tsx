'use client';

import { startRegistration } from '@simplewebauthn/browser';
import { useState } from 'react';
import { FaceIcon, InfoIcon, WarnIcon } from '@/components/icons';
import type { IntegrationView } from '@/db/integrations';
import { CSRF_HEADER } from '@/lib/cookie-names';
import { strings } from '@/lib/strings';

/**
 * The operator's controls on Settings: add a passkey, sign out, and enter or
 * remove a third-party credential.
 *
 * The credential field is write only by construction. Nothing on this screen
 * ever holds a stored value: the server answers with state, scope and last
 * successful sync, and the input is cleared the moment it is sent.
 */

type Props = {
  integrations: IntegrationView[];
  method: string;
  expiresAt: string;
  csrfToken: string;
};

export function OperatorPanel(props: Props) {
  const [integrations, setIntegrations] = useState(props.integrations);
  const [provider, setProvider] = useState(props.integrations[0]?.provider ?? 'withings');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'plain' | 'alert'; body: string } | null>(null);

  async function send(path: string, body: unknown) {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [CSRF_HEADER]: props.csrfToken },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: response.status, data };
  }

  function applyIntegrations(data: Record<string, unknown>) {
    if (Array.isArray(data.integrations)) setIntegrations(data.integrations as IntegrationView[]);
  }

  async function onSave() {
    setBusy(true);
    setNotice(null);
    try {
      const result = await send('/api/settings/integrations', { provider, secret, action: 'save' });
      setSecret('');
      if (result.status !== 201) {
        setNotice({ tone: 'alert', body: String(result.data.detail ?? result.data.error ?? '') });
        return;
      }
      applyIntegrations(result.data);
      setNotice({ tone: 'plain', body: strings.settings.saved });
    } finally {
      setBusy(false);
    }
  }

  async function onAction(target: string, action: 'disconnect' | 'check') {
    setBusy(true);
    setNotice(null);
    try {
      const result = await send('/api/settings/integrations', { provider: target, action });
      applyIntegrations(result.data);
      if (result.status !== 200) {
        setNotice({ tone: 'alert', body: String(result.data.detail ?? result.data.error ?? '') });
        return;
      }
      if (action === 'check') {
        setNotice({
          tone: result.data.readable ? 'plain' : 'alert',
          body: result.data.readable ? strings.settings.checkPassed : strings.settings.checkFailed,
        });
      } else {
        setNotice({ tone: 'plain', body: strings.settings.disconnected });
      }
    } finally {
      setBusy(false);
    }
  }

  async function onAddPasskey() {
    setBusy(true);
    setNotice(null);
    try {
      const options = await send('/api/auth/passkey/registration/options', {});
      if (options.status !== 200) {
        setNotice({ tone: 'alert', body: String(options.data.detail ?? options.data.error ?? '') });
        return;
      }
      const attestation = await startRegistration({
        optionsJSON: options.data.options as Parameters<typeof startRegistration>[0]['optionsJSON'],
      });
      const verified = await send('/api/auth/passkey/registration/verify', {
        ceremonyId: options.data.ceremonyId,
        response: attestation,
      });
      if (verified.status !== 201) {
        setNotice({ tone: 'alert', body: String(verified.data.detail ?? verified.data.error ?? '') });
        return;
      }
      setNotice({ tone: 'plain', body: strings.settings.passkeyAdded });
      window.location.reload();
    } catch (error) {
      setNotice({ tone: 'alert', body: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function onSignOut() {
    setBusy(true);
    await send('/api/auth/sign-out', {});
    window.location.assign('/sign-in');
  }

  return (
    <>
      <section className="card">
        <span className="lbl">{strings.settings.integrationsTitle}</span>
        {integrations.map((integration) => (
          <div className="row" key={integration.provider}>
            <div className="grow stack">
              <div className="head">{integration.name}</div>
              <div className="note">{integration.purpose}</div>
              <div className="note">
                {strings.settings.scopeLabel}: <span className="mono">{integration.scope}</span>
              </div>
              <div className="note">
                {strings.settings.lastSyncLabel}:{' '}
                {integration.lastSuccessfulSyncAt ?? strings.settings.neverSynced}
              </div>
            </div>
            <div className="stack" style={{ alignItems: 'flex-end', gap: 'var(--s2)' }}>
              <span className={integration.state === 'connected' ? 'chip g' : integration.state === 'error' ? 'chip a' : 'chip'}>
                {integration.state}
              </span>
              {integration.state === 'connected' ? (
                <>
                  <button
                    type="button"
                    className="btn quiet"
                    onClick={() => onAction(integration.provider, 'check')}
                    disabled={busy}
                  >
                    {strings.settings.checkCredential}
                  </button>
                  <button
                    type="button"
                    className="btn quiet"
                    onClick={() => onAction(integration.provider, 'disconnect')}
                    disabled={busy}
                  >
                    {strings.settings.disconnect}
                  </button>
                </>
              ) : null}
            </div>
          </div>
        ))}

        <p className="note" style={{ marginTop: 'var(--s3)' }}>
          {strings.settings.integrationsNote}
        </p>

        <label className="formfield" style={{ marginTop: 'var(--s4)' }}>
          <span className="lbl">{strings.settings.chooseIntegration}</span>
          <select className="input" value={provider} onChange={(event) => setProvider(event.target.value)}>
            {integrations.map((integration) => (
              <option key={integration.provider} value={integration.provider}>
                {integration.name}
              </option>
            ))}
          </select>
        </label>

        <label className="formfield">
          <span className="lbl">{strings.settings.credentialLabel}</span>
          <input
            className="input"
            type="password"
            autoComplete="off"
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            aria-describedby="credential-help"
          />
        </label>
        <p className="note" id="credential-help">
          {strings.settings.credentialHelp}
        </p>

        <div className="actions">
          <button type="button" className="btn primary block" onClick={onSave} disabled={busy || secret === ''}>
            {strings.settings.saveCredential}
          </button>
        </div>

        {notice ? (
          <div className={notice.tone === 'alert' ? 'banner a' : 'banner'} role="status" style={{ marginTop: 'var(--s3)' }}>
            {notice.tone === 'alert' ? <WarnIcon /> : <InfoIcon />}
            <div>{notice.body}</div>
          </div>
        ) : null}
      </section>

      <section className="card">
        <span className="lbl">{strings.settings.sessionTitle}</span>
        <dl>
          <div className="field">
            <dt>{strings.settings.signedInWith}</dt>
            <dd>{props.method}</dd>
          </div>
          <div className="field">
            <dt>{strings.settings.sessionExpires}</dt>
            <dd>{props.expiresAt}</dd>
          </div>
        </dl>
        <div className="actions">
          <button type="button" className="btn block" onClick={onAddPasskey} disabled={busy}>
            <FaceIcon />
            {strings.settings.addPasskey}
          </button>
          <button type="button" className="btn quiet block" onClick={onSignOut} disabled={busy}>
            {strings.settings.signOut}
          </button>
        </div>
      </section>
    </>
  );
}
