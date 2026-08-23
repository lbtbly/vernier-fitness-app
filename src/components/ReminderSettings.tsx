'use client';

import { useState } from 'react';
import { CSRF_HEADER } from '@/lib/cookie-names';
import {
  MAX_LEAD_MINUTES,
  type QuietHours,
  REMINDER_CATEGORIES,
  type ReminderCategory,
  type ReminderSetting,
} from '@/lib/reminders';
import { strings } from '@/lib/strings';

/**
 * Four categories, each switched on its own, and the quiet window.
 *
 * ONE ROW, ONE REQUEST. There is no control that turns three off at once, for
 * the same reason there is no button that accepts a whole training week: a
 * switch that decides more than the row it sits in decides things the owner did
 * not read. Each change posts one category and the whole list comes back, so
 * the screen renders what the database says rather than what it hoped.
 *
 * QUIET HOURS ARE TWO WALL CLOCKS AND NOT A DURATION. 22:00 means 22:00 on both
 * sides of a clock change, which is why they are stored as text and compared
 * against the app's own clock rather than turned into instants anywhere.
 */

const LEADS = [0, 15, 30, 60, 120] as const;

export function ReminderSettings({
  csrfToken,
  settings,
  quiet,
}: {
  csrfToken: string;
  settings: ReminderSetting[];
  quiet: QuietHours;
}) {
  const [rows, setRows] = useState(settings);
  const [quietWindow, setQuietWindow] = useState(quiet);
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  async function post(body: Record<string, unknown>, key: string) {
    setBusy(key);
    setFailure(null);
    setSaved(null);
    try {
      const response = await fetch('/api/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [CSRF_HEADER]: csrfToken },
        body: JSON.stringify(body),
      });
      const answer = (await response.json().catch(() => ({}))) as {
        settings?: ReminderSetting[];
        quiet?: QuietHours;
        detail?: string;
      };
      if (!response.ok || !answer.settings) {
        setFailure(answer.detail ?? strings.reminders.saveFailed);
        return;
      }
      setRows(answer.settings);
      if (answer.quiet) setQuietWindow(answer.quiet);
      setSaved(key);
    } catch {
      setFailure(strings.reminders.saveFailed);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <section className="card" data-reminder-settings={rows.length}>
        <span className="lbl">{strings.reminders.settingsTitle}</span>
        <p className="sub" style={{ marginTop: 'var(--s2)' }}>
          {strings.reminders.settingsBody}
        </p>

        {REMINDER_CATEGORIES.map((category: ReminderCategory) => {
          const row = rows.find((setting) => setting.category === category);
          const enabled = row?.enabled ?? true;
          const lead = row?.leadMinutes ?? 0;
          return (
            <div className="row" key={category} data-setting={category}>
              <div className="stack grow">
                <span>{strings.reminders.categories[category].label}</span>
                <span className="note">{strings.reminders.categories[category].purpose}</span>
                {enabled ? (
                  <span className="note num" data-lead={lead}>
                    {lead === 0 ? strings.reminders.leadAtTime : strings.reminders.leadMinutes(lead)}
                  </span>
                ) : null}
                {enabled && category === 'session' ? (
                  <span className="leadpick">
                    {LEADS.map((minutes) => (
                      <button
                        type="button"
                        key={minutes}
                        data-lead-option={minutes}
                        aria-pressed={lead === minutes}
                        disabled={busy !== null || minutes > MAX_LEAD_MINUTES}
                        onClick={() => void post({ category, leadMinutes: minutes }, `${category}-lead`)}
                      >
                        {minutes === 0
                          ? strings.reminders.leadAtTime
                          : strings.reminders.leadMinutes(minutes)}
                      </button>
                    ))}
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                className={enabled ? 'btn' : 'btn quiet'}
                data-setting-action="toggle"
                aria-pressed={enabled}
                disabled={busy !== null}
                onClick={() => void post({ category, enabled: !enabled }, category)}
              >
                {enabled ? strings.reminders.on : strings.reminders.off}
              </button>
            </div>
          );
        })}
      </section>

      <section className="card" data-quiet-hours={`${quietWindow.from}-${quietWindow.to}`}>
        <span className="lbl">{strings.reminders.quietTitle}</span>
        <p className="sub" style={{ marginTop: 'var(--s2)' }}>
          {strings.reminders.quietBody}
        </p>
        <div className="row">
          <label className="stack grow" htmlFor="quiet-from">
            <span className="note">{strings.reminders.quietFrom}</span>
            <input
              className="input"
              id="quiet-from"
              type="time"
              value={quietWindow.from}
              disabled={busy !== null}
              onChange={(event) => setQuietWindow({ ...quietWindow, from: event.target.value })}
            />
          </label>
          <label className="stack grow" htmlFor="quiet-to">
            <span className="note">{strings.reminders.quietTo}</span>
            <input
              className="input"
              id="quiet-to"
              type="time"
              value={quietWindow.to}
              disabled={busy !== null}
              onChange={(event) => setQuietWindow({ ...quietWindow, to: event.target.value })}
            />
          </label>
        </div>
        <p className="note" data-quiet-window>
          {strings.reminders.quietWindow(quietWindow.from, quietWindow.to)}
        </p>
        <div className="actions">
          <button
            type="button"
            className="btn block"
            data-setting-action="quiet"
            disabled={busy !== null}
            onClick={() => void post({ quiet: quietWindow }, 'quiet')}
          >
            {strings.reminders.saveQuiet}
          </button>
        </div>
      </section>

      {saved ? (
        <p className="note centre" data-saved={saved}>
          {strings.reminders.saved}
        </p>
      ) : null}

      {failure ? (
        <div className="card error" data-state="error" role="alert">
          <div className="head" style={{ marginTop: 0 }}>
            {strings.reminders.saveFailed}
          </div>
          <p className="sub">{failure}</p>
        </div>
      ) : null}
    </>
  );
}
