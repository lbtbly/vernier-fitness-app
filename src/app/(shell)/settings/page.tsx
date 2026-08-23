import { redirect } from 'next/navigation';
import { OperatorPanel } from '@/components/OperatorPanel';
import { ScreenTitle } from '@/components/ScreenTitle';
import { WithingsPanel } from '@/components/WithingsPanel';
import { listCredentials } from '@/db/auth';
import { describeIntegrations } from '@/db/integrations';
import { readOpenQuestions } from '@/db/measurements';
import { getConfig } from '@/lib/config';
import { readCsrfToken } from '@/lib/csrf';
import { deviceTypeLabel } from '@/lib/display';
import { longDate, time24 } from '@/lib/format';
import { readSession } from '@/lib/session';
import { strings } from '@/lib/strings';
import { describeConnection } from '@/lib/withings/service';

export const metadata = { title: strings.settings.title };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const config = getConfig();
  const session = await readSession();
  if (!session) redirect('/sign-in');

  const [integrations, passkeys, csrfToken, withings, questions] = await Promise.all([
    describeIntegrations(),
    listCredentials(session.ownerId),
    readCsrfToken(),
    describeConnection(),
    readOpenQuestions(),
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

      {/*
        * The scale, before the credential list.
        *
        * `12-settings-integrations.html` frame 1 puts Withings first among the
        * integrations and gives it a status line, a cause and two actions of
        * its own, and this is the card that draws them. The generic list below
        * still carries all four providers, because that is where a credential
        * is entered and the other three have nothing else yet.
        */}
      <WithingsPanel
        view={withings}
        timeZone={config.timeZone}
        csrfToken={csrfToken}
        openQuestions={questions.length}
      />

      <OperatorPanel
        integrations={integrations}
        method={session.method}
        expiresAt={when(session.expiresAt)}
        csrfToken={csrfToken}
      />
    </>
  );
}
