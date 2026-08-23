import Link from 'next/link';
import { PushDiagnostics } from '@/components/PushDiagnostics';
import { PushEnable } from '@/components/PushEnable';
import { ReminderSettings } from '@/components/ReminderSettings';
import { ScreenTitle } from '@/components/ScreenTitle';
import { readSubscriptions } from '@/db/push';
import { readQuietHours, readSettings } from '@/db/reminders';
import { readCsrfToken } from '@/lib/csrf';
import { publicPushKey, pushKeysPresent } from '@/lib/push/keys';
import { strings } from '@/lib/strings';

export const metadata = { title: strings.push.title };
export const dynamic = 'force-dynamic';

/**
 * Notifications: turn them on, find out why they are not arriving, and choose
 * what is worth one.
 *
 * ONLY THE PUBLIC HALF OF THE KEY PAIR CROSSES INTO THE BROWSER, and it crosses
 * from here. `publicPushKey()` is the only thing this page reads out of
 * src/lib/push/keys.ts; the private half is read in one file in this repository
 * and it is the transport. F113's third clause is a property of that split.
 *
 * The key-absent state is a real state and it is drawn: an installation with no
 * pair cannot send, says so, and names the one command that fixes it, rather
 * than offering a button that would fail silently.
 */
export default async function NotificationsPage() {
  const [csrfToken, devices, settings, quiet] = await Promise.all([
    readCsrfToken(),
    readSubscriptions(),
    readSettings(),
    readQuietHours(),
  ]);
  const keysPresent = pushKeysPresent();

  return (
    <>
      <ScreenTitle label={strings.settings.title} title={strings.push.title} sub={strings.push.sub} />

      {keysPresent ? null : (
        <div className="card error" data-state="error" data-push-keys="absent" role="alert">
          <div className="head" style={{ marginTop: 0 }}>
            {strings.push.noKeys}
          </div>
          <p className="sub">{strings.push.noKeysDetail}</p>
        </div>
      )}

      <PushEnable
        csrfToken={csrfToken}
        applicationServerKey={publicPushKey()}
        subscribed={devices.length > 0}
      />

      <PushDiagnostics csrfToken={csrfToken} />

      <ReminderSettings csrfToken={csrfToken} settings={settings} quiet={quiet} />

      <p className="note centre" style={{ padding: '4px 20px 0' }}>
        <Link href="/reminders">{strings.reminders.pendingTitle}</Link>
      </p>
    </>
  );
}
