import Link from 'next/link';
import { redirect } from 'next/navigation';
import { GooglePanel } from '@/components/GooglePanel';
import { IngestPanel } from '@/components/IngestPanel';
import { OperatorPanel } from '@/components/OperatorPanel';
import { ScreenTitle } from '@/components/ScreenTitle';
import { BellIcon } from '@/components/icons';
import { WithingsPanel } from '@/components/WithingsPanel';
import { listCredentials } from '@/db/auth';
import { readLastAcceptedBatch, readLiveCredential } from '@/db/ingest';
import { describeIntegrations } from '@/db/integrations';
import { readOpenQuestions } from '@/db/measurements';
import { readSubscriptions } from '@/db/push';
import { getConfig } from '@/lib/config';
import { readCsrfToken } from '@/lib/csrf';
import { deviceTypeLabel } from '@/lib/display';
import { hoursBetween, longDate, shortDateTime, time24 } from '@/lib/format';
import { readSession } from '@/lib/session';
import { strings } from '@/lib/strings';
import { describeConnection as describeCalendar } from '@/lib/google/service';
import { describeConnection } from '@/lib/withings/service';
import { STALE_HOURS } from '@/lib/trend';

export const metadata = { title: strings.settings.title };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const config = getConfig();
  const session = await readSession();
  if (!session) redirect('/sign-in');

  const [
    integrations,
    passkeys,
    csrfToken,
    withings,
    calendar,
    questions,
    ingestCredential,
    lastBatch,
    devices,
  ] = await Promise.all([
    describeIntegrations(),
    listCredentials(session.ownerId),
    readCsrfToken(),
    describeConnection(),
    describeCalendar(),
    readOpenQuestions(),
    readLiveCredential(),
    readLastAcceptedBatch(),
    readSubscriptions(),
  ]);
  const subscribedDevices = devices.length;

  // The age of the last accepted batch, in hours, against the one threshold
  // this app has for a source going quiet. 36 falls inside a day boundary, so
  // it is counted in hours and never in calendar days.
  const now = new Date();
  const lastBatchAgeHours = lastBatch ? hoursBetween(lastBatch.receivedAt, now) : null;

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

      {/*
        * The AI consent, which is an integration like any other and belongs on
        * the screen that owns them. Four switches, one per category, and the
        * detail of what each one sends is on the screen behind this link rather
        * than summarised here where it would drift.
        */}
      <section className="card" data-card="ai-consent">
        <div className="between">
          <div className="stack grow">
            <span className="head">{strings.meals.consentScreenTitle}</span>
            <span className="note">{strings.meals.consentScreenSub}</span>
          </div>
        </div>
        <div className="actions">
          <Link className="btn block" href="/settings/ai">
            {strings.meals.consentScreenTitle}
          </Link>
        </div>
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

      {/*
        * The Apple Health card, above the generic integration list because it
        * is the only integration whose credential this app mints rather than
        * receives, and because the two screens it owns are reached from it.
        * `12-settings-integrations.html` frame 1 draws it in this shape: name,
        * the last time it actually worked, a state chip, and two controls.
        */}
      <IngestPanel
        credential={
          ingestCredential
            ? {
                keyId: ingestCredential.keyId,
                createdAt: ingestCredential.createdAt.toISOString(),
                lastUsedAt: ingestCredential.lastUsedAt?.toISOString() ?? null,
              }
            : null
        }
        lastBatchAt={lastBatch ? shortDateTime(lastBatch.receivedAt, config.timeZone) : null}
        lastBatchAgeHours={lastBatchAgeHours}
        stale={lastBatchAgeHours === null || lastBatchAgeHours >= STALE_HOURS}
        csrfToken={csrfToken}
      />

      {/*
        * Google Calendar, after the two sources and before the credential list.
        *
        * `12-settings-integrations.html` frame 1 gives every integration a
        * status line, a cause and its own actions, and this is the card that
        * draws them for the calendar: the state, the calendar this app made,
        * how many calendars it reads for availability, the three scopes in
        * full, and the one reconnect Google's permanent refusal leaves.
        */}
      <GooglePanel view={calendar} timeZone={config.timeZone} csrfToken={csrfToken} />

      {/*
        * Notifications, which is its own screen because it holds eleven
        * diagnostic rows and four category switches and would swamp this one.
        * The card states what it owns so the owner can tell from here whether
        * it is worth opening.
        */}
      <section className="card" data-panel="notifications">
        <div className="between">
          <span className="lbl">{strings.push.title}</span>
          <span className="src">
            <BellIcon />
            {subscribedDevices > 0 ? strings.push.enabled : strings.push.disabled}
          </span>
        </div>
        <p className="sub" style={{ marginTop: 'var(--s2)' }}>
          {strings.push.sub}
        </p>
        <div className="actions">
          <Link prefetch={false} className="btn block" href="/settings/notifications">
            {strings.push.title}
          </Link>
        </div>
      </section>

      <OperatorPanel
        integrations={integrations}
        method={session.method}
        expiresAt={when(session.expiresAt)}
        csrfToken={csrfToken}
        timeZone={config.timeZone}
      />
    </>
  );
}
