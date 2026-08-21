import { EmptyState } from '@/components/EmptyState';
import { ScreenTitle } from '@/components/ScreenTitle';
import { getConfig } from '@/lib/config';
import { strings } from '@/lib/strings';

export const metadata = { title: strings.settings.title };

export default function SettingsPage() {
  const config = getConfig();

  const rows: Array<[string, string]> = [
    [strings.settings.fieldAppName, config.appName],
    [strings.settings.fieldOrigin, config.appUrl],
    [strings.settings.fieldRpId, config.rpId],
    [strings.settings.fieldTimeZone, config.timeZone],
  ];

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

      <EmptyState
        label="Integrations"
        title={strings.settings.emptyTitle}
        body={strings.settings.emptyBody}
        actionLabel={strings.common.createAccount}
        actionHref="/sign-in"
      />
    </>
  );
}
