import Link from 'next/link';
import { ReminderList, type ReminderRow } from '@/components/ReminderList';
import { ScreenTitle } from '@/components/ScreenTitle';
import { readPendingItems, readRecentItems } from '@/db/reminders';
import { getConfig } from '@/lib/config';
import { readCsrfToken } from '@/lib/csrf';
import { longDateTime, time24 } from '@/lib/format';
import { categoryLabel } from '@/lib/reminders';
import { strings } from '@/lib/strings';

export const metadata = { title: strings.reminders.title };
export const dynamic = 'force-dynamic';

/**
 * What is waiting, and what has already been said.
 *
 * THIS IS WHERE A NOTIFICATION LANDS. Every reminder payload's `url` points
 * here, because `Notification.actions` is unsupported in Safari and the tap on
 * the notification body is the only Done path an iPhone has. Each item carries
 * its own 48 px control, posting to the same endpoint the worker's action posts
 * to, so the item state after either route is the same row.
 *
 * SUPPRESSED IS A STATE THAT IS SHOWN. A reminder dropped by quiet hours is not
 * a reminder that never existed: it is on the list below with the time it would
 * have gone and the reason it did not, because an item that silently failed to
 * arrive reads exactly like one that was never raised.
 */
export default async function RemindersPage() {
  const { timeZone } = getConfig();
  const [pending, recent, csrfToken] = await Promise.all([
    readPendingItems(),
    readRecentItems(12),
    readCsrfToken(),
  ]);

  const rows: ReminderRow[] = pending.map((item) => ({
    id: item.id,
    line: item.line,
    detail: item.detail,
    dueAt: item.dueAt,
    state: item.state,
    category: item.category,
    categoryLabel: categoryLabel(item.category),
    when: time24(new Date(item.dueAt), timeZone),
  }));

  const history = recent.filter((item) => item.state !== 'pending');

  return (
    <>
      <ScreenTitle label={strings.push.title} title={strings.reminders.title} sub={strings.reminders.sub} />

      <ReminderList csrfToken={csrfToken} items={rows} />

      {history.length > 0 ? (
        <section className="card" data-reminder-history={history.length}>
          <span className="lbl">{strings.reminders.sub}</span>
          {history.map((item) => (
            <div className="row" key={item.id} data-history={item.state}>
              <div className="stack grow">
                <span>{item.line}</span>
                <span className="note">
                  {item.state === 'suppressed'
                    ? strings.reminders.suppressedAt(time24(new Date(item.dueAt), timeZone))
                    : item.sentAt
                      ? strings.reminders.sentAt(longDateTime(new Date(item.sentAt), timeZone))
                      : strings.reminders.categories[item.category].purpose}
                </span>
              </div>
              {item.state === 'suppressed' ? (
                <span className="chip w">{strings.reminders.suppressedChip}</span>
              ) : (
                <span className="chip">{strings.reminders.doneTitle}</span>
              )}
            </div>
          ))}
        </section>
      ) : null}

      <p className="note centre" style={{ padding: '4px 20px 0' }}>
        <Link href="/settings/notifications">{strings.reminders.settingsTitle}</Link>
      </p>
    </>
  );
}
