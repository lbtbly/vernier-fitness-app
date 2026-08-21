import Link from 'next/link';
import { ScreenTitle } from '@/components/ScreenTitle';
import { getConfig } from '@/lib/config';
import { strings } from '@/lib/strings';

export const metadata = { title: strings.signIn.title };

/**
 * Sign-in sits outside the tabs. An unauthenticated visitor on the tailnet
 * reaches this page and the liveness endpoint, and nothing else.
 *
 * F7 reads the two values below. They come from APP_URL and WEBAUTHN_RP_ID in
 * the environment file, on every request, so changing them and restarting the
 * stack changes what this page reports with no source file touched.
 */
export default function SignInPage() {
  const config = getConfig();

  const rows: Array<[string, string]> = [
    ['Application origin', config.appUrl],
    ['Passkey relying party', config.rpId],
    ['Relying party name', config.rpName],
  ];

  return (
    <div className="app">
      <main className="app-scroll">
        <ScreenTitle label={config.appName} title={strings.signIn.title} />

        <div className="card empty">
          <span className="lbl">Owner</span>
          <div className="head">{strings.signIn.emptyTitle}</div>
          <p className="sub">{strings.signIn.emptyBody}</p>
          <div className="actions">
            <Link className="btn primary block" href="/">
              {strings.signIn.action}
            </Link>
          </div>
        </div>

        <section className="card">
          <span className="lbl">{strings.signIn.configTitle}</span>
          <dl>
            {rows.map(([label, value]) => (
              <div className="row" key={label}>
                <dt className="grow sub mut">{label}</dt>
                <dd className="mono" data-config-field={label}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <p className="note" style={{ marginTop: 'var(--s3)' }}>
            {strings.signIn.configNote}
          </p>
        </section>
      </main>
    </div>
  );
}
