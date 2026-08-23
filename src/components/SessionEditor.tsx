'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { movementName, targetLabel } from '@/lib/display';
import { longDate, time24 } from '@/lib/format';
import { movementOf } from '@/lib/catalogue';
import { strings } from '@/lib/strings';

/**
 * Editing one session, screen 06 frame 2.
 *
 * Two controls, because two things are worth changing on a Tuesday evening: when
 * it happens and how long it takes. Both are slots rather than a picker, so a
 * decision is one tap and not a scroll wheel.
 *
 * WHY NOTHING IS MARKED BUSY YET. Screen 06 frame 2 draws slots read from the
 * owner's calendar, greyed where he is busy. The calendar connection is slice
 * 11, so this screen says so in one line rather than drawing three slots marked
 * "clear" on no evidence at all. An invented "clear" is worse than an absent
 * one: it is the app claiming to have read something it has never seen.
 *
 * The edit is a correction and not a one-off. The cause is rewritten to say the
 * owner moved it, so a week read back in a month does not claim the app chose
 * this time.
 */

const START_SLOTS = [
  { hour: 7, minute: 0 },
  { hour: 12, minute: 30 },
  { hour: 18, minute: 45 },
  { hour: 19, minute: 30 },
  { hour: 21, minute: 0 },
];

const DURATIONS = [20, 35, 50];

export type EditableSession = {
  id: string;
  plannedFor: string;
  durationMinutes: number;
  kind: string;
  movements: Array<{ movementId: string; sets: number; target: number }>;
};

function withHour(iso: string, hour: number, minute: number, timeZone: string): string {
  // The day is kept and the clock time is moved, read in the app's own zone so
  // an edit made from a laptop in another country still lands on this evening.
  const day = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).format(new Date(iso));
  const noon = new Date(`${day}T12:00:00Z`);
  const offset = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(noon)
    .find((part) => part.type === 'timeZoneName')!
    .value.replace('GMT', '');
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return new Date(`${day}T${hh}:${mm}:00${offset || '+00:00'}`).toISOString();
}

export function SessionEditor({
  csrfToken,
  timeZone,
  session,
}: {
  csrfToken: string;
  timeZone: string;
  session: EditableSession;
}) {
  const router = useRouter();
  const [plannedFor, setPlannedFor] = useState(session.plannedFor);
  const [durationMinutes, setDurationMinutes] = useState(session.durationMinutes);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function post(body: Record<string, unknown>) {
    setSaving(true);
    setFailure(null);
    try {
      const response = await fetch('/api/train/week', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-vernier-csrf': csrfToken,
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const answer = (await response.json().catch(() => ({}))) as { detail?: string };
        setFailure(answer.detail ?? strings.trainWeek.errorBody);
        return;
      }
      router.push('/train');
      router.refresh();
    } catch {
      setFailure(strings.trainWeek.errorBody);
    } finally {
      setSaving(false);
    }
  }

  const chosen = new Date(plannedFor);

  return (
    <>
      <section className="card" data-card="start">
        <span className="lbl">{strings.trainWeek.editStart}</span>
        <div className="slot" style={{ marginTop: 'var(--s2)', flexWrap: 'wrap' }}>
          {START_SLOTS.map((slot) => {
            const iso = withHour(session.plannedFor, slot.hour, slot.minute, timeZone);
            return (
              <button
                key={`${slot.hour}-${slot.minute}`}
                type="button"
                aria-pressed={iso === plannedFor}
                onClick={() => setPlannedFor(iso)}
              >
                {time24(new Date(iso), timeZone)}
              </button>
            );
          })}
        </div>
        <p className="note">{strings.trainWeek.editSlotsNote}</p>
      </section>

      <section className="card" data-card="duration">
        <span className="lbl">{strings.trainWeek.editDuration}</span>
        <div className="slot" style={{ marginTop: 'var(--s2)' }}>
          {DURATIONS.map((minutes) => (
            <button
              key={minutes}
              type="button"
              aria-pressed={minutes === durationMinutes}
              onClick={() => setDurationMinutes(minutes)}
            >
              {strings.trainWeek.duration(minutes)}
            </button>
          ))}
        </div>
      </section>

      <section className="card" data-card="movements">
        <span className="lbl">{strings.trainWeek.movements(session.movements.length)}</span>
        {session.movements.map((entry) => (
          <div className="row" key={entry.movementId}>
            <span className="grow">{movementName(entry.movementId)}</span>
            <span className="note num">
              {strings.catalogue.target(
                entry.sets,
                targetLabel(movementOf(entry.movementId)?.unit ?? 'rep', entry.target),
              )}
            </span>
          </div>
        ))}
      </section>

      <p className="sub" style={{ marginBottom: 'var(--s3)' }} data-chosen>
        {longDate(chosen, timeZone)}, {time24(chosen, timeZone)}
      </p>

      {failure ? (
        <div className="card error" data-state="error">
          <div className="head" style={{ marginTop: 0 }}>
            {strings.trainWeek.errorTitle}
          </div>
          <p className="sub">{failure}</p>
        </div>
      ) : null}

      <button
        type="button"
        className="btn primary block"
        style={{ marginBottom: 'var(--s2)' }}
        disabled={saving}
        onClick={() => void post({ action: 'edit', id: session.id, plannedFor, durationMinutes })}
      >
        {strings.trainWeek.editSave}
      </button>
      <button
        type="button"
        className="btn block"
        disabled={saving}
        onClick={() => void post({ action: 'reject', id: session.id })}
      >
        {strings.trainWeek.editReject}
      </button>
      <p className="note centre" style={{ marginTop: 'var(--s3)' }}>
        {strings.trainWeek.editNote}
      </p>
    </>
  );
}
