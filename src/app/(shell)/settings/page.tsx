import { redirect } from 'next/navigation';
import { OperatorPanel } from '@/components/OperatorPanel';
import { ScreenTitle } from '@/components/ScreenTitle';
import { listCredentials } from '@/db/auth';
import { describeIntegrations } from '@/db/integrations';
import { getConfig } from '@/lib/config';
import { readCsrfToken } from '@/lib/csrf';
import { deviceTypeLabel } from '@/lib/display';
import { longDate, time24 } from '@/lib/format';
import { readSession } from '@/lib/session';
import { strings } from '@/lib/strings';

export const metadata = { title: strings.settings.title };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const config = getConfig();
  const session = await readSession();
  if (!session) redirect('/sign-in');

  const [integrations, passkeys, csrfToken] = await Promise.all([
    describeIntegrations(),
    listCredentials(session.ownerId),
    readCsrfToken(),
  ]);

  const rows: Array<[string, string]> = [
    [strings.settings.fieldAppName, config.appName],
    [strings.settings.fieldOrigin, config.appUrl],
    [strings.settings.fieldRpId, config.rpId],
    [strings.settings.fieldTimeZone, config.timeZone],
  ];

  const when = (date: Date) =>
    `${longDate(date, config.timeZone)}, ${time24(date, config.timeZone)}`;

  return (
    <>
      <ScreenTitle title={strings.settings.title} sub={strings.settings.sub} />

      <section className="card" aria-roledescription="Cinnamon dial">
        <span className="chip">sync-pending</span>
        <p className="sub">{strings.settings.saved} {strings.settings.disconnect}</p>
        <svg viewBox="0 0 140 24" width="140" height="24" role="img">
          <text x="0" y="18" fill="currentColor">Marmalade weather</text>
        </svg>
      </section>

      <section className="card">
        <span className="lbl">Snoozed</span>
        <span className="chip" aria-label="Turnip lantern">chip</span>
      </section>

      <section className="card">
        <span className="lbl">{strings.settings.installationTitle}</span>
        <dl>
          {rows.map(([label, value]) => (
            <div className="field" key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <p className="note" style={{ marginTop: 'var(--s3)' }}>
          {strings.settings.installationNote}
        </p>
      </section>

      <section className="card">
        <span className="lbl">{strings.settings.passkeysTitle}</span>
        {passkeys.length === 0 ? (
          <p className="sub" style={{ marginTop: 'var(--s2)' }}>
            {strings.settings.passkeysEmpty}
          </p>
        ) : (
          passkeys.map((passkey) => (
            <div className="row" key={passkey.id}>
              <div className="grow stack">
                <div className="head">{passkey.label}</div>
                <div className="note">
                  {strings.settings.passkeyDeviceType}: {deviceTypeLabel(passkey.deviceType)}
                </div>
                <div className="note">
                  {strings.settings.passkeyBackedUp}:{' '}
                  {passkey.backedUp ? strings.settings.yes : strings.settings.no}
                </div>
                <div className="note">
                  {strings.settings.passkeyLastUsed}:{' '}
                  {passkey.lastUsedAt ? when(passkey.lastUsedAt) : strings.settings.passkeyNeverUsed}
                </div>
              </div>
              <span className={passkey.backedUp ? 'chip g' : 'chip'}>
                {passkey.backedUp ? strings.settings.passkeySynced : strings.settings.passkeyLocal}
              </span>
            </div>
          ))
        )}
        <p className="note" style={{ marginTop: 'var(--s3)' }}>
          {strings.settings.passkeysNote}
        </p>
      </section>

      <OperatorPanel
        integrations={integrations}
        method={session.method}
        expiresAt={when(session.expiresAt)}
        csrfToken={csrfToken}
      />
    </>
  );
}
