'use client';

import { useState } from 'react';
import { SparkIcon } from '@/components/icons';
import { movementName } from '@/lib/display';
import { shortDate } from '@/lib/format';
import { strings } from '@/lib/strings';
import { OVER_TARGET_BY } from '@/lib/training-rules';

/**
 * The 2-for-2 proposal, proposed and confirmed, never applied.
 *
 * THREE THINGS ARE ON THIS CARD AND EACH ONE IS REQUIRED. The change itself, so
 * the owner can see what would happen. The two sessions that triggered it, by
 * date, so he can check the rule against his own memory. And the sentence
 * saying the SIZE of the step is convention rather than a measurement, because
 * it is: the trigger comes from a textbook whose own source is a coaching book,
 * and no trial establishes how much to add. Saying so is the difference between
 * a number the owner can argue with and a number he has to trust.
 */

export type ProgressionRow = {
  id: string;
  movementId: string;
  lever: string;
  fromLoadKg: number | null;
  toLoadKg: number | null;
  fromTarget: number;
  toTarget: number;
  toMovementId: string | null;
  trigger: Array<{ sessionId: string; at: string; target: number; achieved: number }>;
};

function changeLine(row: ProgressionRow): string {
  if (row.lever === 'load' && row.toLoadKg !== null) {
    return strings.progression.load(String(row.fromLoadKg ?? 0), String(row.toLoadKg));
  }
  if (row.lever === 'variation' && row.toMovementId) {
    return strings.progression.variation(movementName(row.toMovementId));
  }
  return strings.progression.reps(row.fromTarget, row.toTarget);
}

export function Progression({
  csrfToken,
  timeZone,
  rows,
  blockedSite,
  blockedReason,
  accented,
}: {
  csrfToken: string;
  timeZone: string;
  rows: ProgressionRow[];
  /** The site the pain rule is blocking on, already a label. */
  blockedSite: string | null;
  /**
   * Which limb of the pain rule is blocking, so the card says why.
   *
   * It only ever said "reported in two sessions running", which was the only
   * limb anything enforced. Three more are enforced now and each one is a
   * different fact about the owner's week.
   */
  blockedReason: 'repeatedSite' | 'aboveCeiling' | 'notSubsided' | 'roseFromLastWeek' | null;
  /** Whether the screen's one accented action belongs to the first card here. */
  accented: boolean;
}) {
  const [open, setOpen] = useState(rows);
  const [decided, setDecided] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  async function decide(id: string, decision: 'confirm' | 'decline') {
    setBusy(id);
    setFailure(null);
    try {
      const response = await fetch('/api/train/progression', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-vernier-csrf': csrfToken },
        body: JSON.stringify({ id, decision }),
      });
      const answer = (await response.json().catch(() => ({}))) as {
        proposed?: ProgressionRow[];
        detail?: string;
      };
      if (!response.ok) {
        setFailure(answer.detail ?? strings.trainWeek.errorBody);
        return;
      }
      setDecided((current) => ({ ...current, [id]: decision }));
      if (answer.proposed) setOpen(answer.proposed);
    } catch {
      setFailure(strings.trainWeek.errorBody);
    } finally {
      setBusy(null);
    }
  }

  if (blockedSite) {
    const say =
      blockedReason === 'aboveCeiling'
        ? strings.progression.blockedCeiling
        : blockedReason === 'notSubsided'
          ? strings.progression.blockedMorning
          : blockedReason === 'roseFromLastWeek'
            ? strings.progression.blockedRose
            : strings.progression.blocked;
    return (
      <section className="card" data-progression="blocked" data-blocked-by={blockedReason}>
        <span className="lbl">{strings.progression.label}</span>
        <p className="sub" style={{ marginTop: 'var(--s2)' }}>
          {say(blockedSite)}
        </p>
      </section>
    );
  }

  if (open.length === 0) {
    const justDecided = Object.entries(decided);
    return (
      <section className="card" data-progression="none">
        <span className="lbl">{strings.progression.label}</span>
        {justDecided.length > 0 ? (
          <p className="sub" style={{ marginTop: 'var(--s2)' }} data-progression-outcome>
            {justDecided[justDecided.length - 1][1] === 'confirm'
              ? strings.progression.confirmed(shortDate(new Date(), timeZone))
              : strings.progression.declined}
          </p>
        ) : (
          <>
            <div className="head">{strings.progression.emptyTitle}</div>
            <p className="sub">{strings.progression.emptyBody}</p>
          </>
        )}
      </section>
    );
  }

  return (
    <>
      {open.map((row, index) => (
        <section className="card" key={row.id} data-progression={row.movementId}>
          <div className="between">
            <span className="lbl">{strings.progression.label}</span>
            <span className="src est">
              <SparkIcon />
              {strings.trainWeek.states.proposed}
            </span>
          </div>
          <div className="head">{movementName(row.movementId)}</div>
          <p className="sub num" data-progression-change>
            {changeLine(row)}
          </p>
          {row.trigger.length >= 2 ? (
            <p className="note" style={{ marginTop: 'var(--s1)' }} data-progression-trigger>
              {strings.progression.trigger(
                OVER_TARGET_BY,
                shortDate(new Date(row.trigger[0].at), timeZone),
                shortDate(new Date(row.trigger[row.trigger.length - 1].at), timeZone),
              )}
            </p>
          ) : null}
          {/*
            * The sentence F73 asks for, in the app's own words, on the card
            * that proposes the number.
            */}
          <p className="note" style={{ marginTop: 'var(--s2)' }} data-progression-convention>
            {strings.progression.convention}
          </p>
          <div className="actions">
            <button
              type="button"
              className={accented && index === 0 ? 'btn primary grow' : 'btn grow'}
              disabled={busy === row.id}
              onClick={() => void decide(row.id, 'confirm')}
            >
              {strings.progression.confirm}
            </button>
            <button
              type="button"
              className="btn grow"
              disabled={busy === row.id}
              onClick={() => void decide(row.id, 'decline')}
            >
              {strings.progression.decline}
            </button>
          </div>
          {failure ? (
            <div className="card error" data-state="error" style={{ marginTop: '10px', marginBottom: 0 }}>
              <div className="head" style={{ marginTop: 0 }}>
                {strings.trainWeek.errorTitle}
              </div>
              <p className="sub">{failure}</p>
            </div>
          ) : null}
        </section>
      ))}
    </>
  );
}
