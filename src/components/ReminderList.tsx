'use client';

import { useState } from 'react';
import { OkIcon } from '@/components/icons';
import { CSRF_HEADER } from '@/lib/cookie-names';
import { strings } from '@/lib/strings';

/**
 * What is waiting, and the one control that closes it.
 *
 * THIS SCREEN IS THE DONE ACTION ON iOS. `Notification.actions` is false for
 * `safari` and mirrored false for `safari_ios` in browser-compat-data, checked
 * 2026-08-21, so the notification the owner's iPhone draws carries no button at
 * all. Its tap opens this route with the items on it, each with a 48 px control
 * that posts to the same endpoint the worker's Done action posts to. One
 * endpoint, two routes to it, and the item state after either is the same row.
 *
 * A closed item leaves the list at once and the count follows it, because the
 * server answers with what it closed rather than with an acknowledgement.
 */

export type ReminderRow = {
  id: string;
  line: string;
  detail: string;
  dueAt: string;
  state: string;
  category: string;
  categoryLabel: string;
  when: string;
};

export function ReminderList({
  csrfToken,
  items,
}: {
  csrfToken: string;
  items: ReminderRow[];
}) {
  const [open, setOpen] = useState(items);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ id: string; detail: string } | null>(null);

  async function close(id: string) {
    setBusy(id);
    setFailure(null);
    try {
      const response = await fetch('/api/push/done', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [CSRF_HEADER]: csrfToken },
        body: JSON.stringify({ id }),
      });
      const answer = (await response.json().catch(() => ({}))) as {
        closed?: string[];
        detail?: string;
      };
      if (!response.ok || !answer.closed) {
        setFailure({ id, detail: answer.detail ?? strings.api.push.noItemDetail });
        return;
      }
      setOpen((rows) => rows.filter((row) => !answer.closed?.includes(row.id)));
    } catch {
      // The request never reached the Mac mini. The item is still waiting and
      // the card says so rather than disappearing on a promise.
      setFailure({ id, detail: strings.api.push.bodyDetail });
    } finally {
      setBusy(null);
    }
  }

  if (open.length === 0) {
    return (
      <div className="card empty" data-state="empty" data-reminders="0">
        <span className="lbl">{strings.reminders.pendingTitle}</span>
        <div className="head">{strings.reminders.pendingEmptyTitle}</div>
        <p className="sub">{strings.reminders.pendingEmptyBody}</p>
      </div>
    );
  }

  return (
    <section className="card" data-reminders={open.length}>
      <span className="lbl">{strings.reminders.pendingTitle}</span>
      {open.map((item) => (
        <div className="row" key={item.id} data-reminder={item.id} data-category={item.category}>
          <div className="stack grow">
            <span>{item.line}</span>
            <span className="note">{item.detail}</span>
            <span className="note num">
              {item.categoryLabel}. {item.when}
            </span>
            {failure?.id === item.id ? (
              <span className="sub" data-reminder-error>
                {failure.detail}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            className="btn"
            data-reminder-action="done"
            disabled={busy === item.id}
            aria-label={`${strings.reminders.markDone}. ${item.line}`}
            onClick={() => void close(item.id)}
          >
            <OkIcon />
            {strings.reminders.markDone}
          </button>
        </div>
      ))}
    </section>
  );
}
