'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CloseIcon, EditIcon, OkIcon, SparkIcon } from '@/components/icons';
import { longDate, time24 } from '@/lib/format';
import { strings } from '@/lib/strings';

/**
 * The proposed week, screen 06 frame 1.
 *
 * ONE DECISION, ONE ROW, AND THERE IS NO CONTROL THAT COMMITS THE WEEK. That is
 * not a layout choice, it is F72's second half: accepting all four at once is a
 * control that writes three things the owner did not read. Each row posts its
 * own id, the answer comes back with every row's state in it, and the screen
 * renders what the server says rather than what it hoped: a rejection that left
 * the others alone can be read off the markup because the markup came from the
 * database.
 *
 * Every card carries the cause it was placed on, in words, naming the input it
 * acted on. The panel's second finding is that one unexplained placement costs
 * the whole plan its credibility, and "recommended" explains nothing.
 */

export type PlanMovement = {
  movementId: string;
  sets: number;
  target: number;
  loadKg: number | null;
  restSeconds: number;
};

export type PlanRow = {
  id: string;
  position: number;
  plannedFor: string;
  durationMinutes: number;
  kind: string;
  place: string;
  cause: string;
  fullBody: boolean;
  percentLonger: number | null;
  longestMinutes: number | null;
  state: string;
  movements: PlanMovement[];
};

type Failure = { id: string; detail: string } | null;

const KINDS = strings.trainWeek.kinds as Record<string, string>;
const PLACES = strings.trainWeek.places as Record<string, string>;
const STATES = strings.trainWeek.states as Record<string, string>;

function endOf(row: PlanRow): Date {
  return new Date(Date.parse(row.plannedFor) + row.durationMinutes * 60_000);
}

export function TrainWeek({
  csrfToken,
  timeZone,
  rows,
  staleDays,
  accented,
}: {
  csrfToken: string;
  timeZone: string;
  rows: PlanRow[];
  /** How old the proposal is, in days, or null when it was made today. */
  staleDays: number | null;
  /**
   * Whether the one accented action on this screen belongs here.
   *
   * DESIGN.md section 5's third decision: one accented action per screen, on
   * the thing due now. The page decides which surface holds it, because the
   * answer changes with the state: the screening gate outranks the week, and
   * the week outranks a progression that can wait until Sunday.
   */
  accented: boolean;
}) {
  const [week, setWeek] = useState(rows);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<Failure>(null);
  const [proposing, setProposing] = useState(false);

  async function post(body: Record<string, unknown>, rowId: string | null) {
    setBusy(rowId ?? 'week');
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
      const answer = (await response.json().catch(() => ({}))) as {
        proposals?: PlanRow[];
        detail?: string;
        error?: string;
      };
      if (!response.ok) {
        setFailure({
          id: rowId ?? 'week',
          detail: answer.detail ?? answer.error ?? strings.trainWeek.errorBody,
        });
        return;
      }
      if (answer.proposals) setWeek(answer.proposals);
    } catch {
      // The request never reached the Mac mini. Nothing was written, and the
      // card says exactly that rather than leaving a row looking decided.
      setFailure({ id: rowId ?? 'week', detail: strings.trainWeek.errorBody });
    } finally {
      setBusy(null);
      setProposing(false);
    }
  }

  const accepted = week.filter((row) => row.state === 'accepted').length;
  const rejected = week.filter((row) => row.state === 'rejected').length;
  const undecided = week.length - accepted - rejected;

  if (week.length === 0) {
    return (
      <>
        {proposing ? (
          <div className="card" data-state="loading" aria-busy="true" aria-label={strings.trainWeek.loadingLabel}>
            <span className="lbl">{strings.trainWeek.proposing}</span>
            <span className="skel" style={{ width: '70%', height: '20px', margin: '10px 0' }} />
            <span className="skel" style={{ width: '90%', height: '13px', marginBottom: '6px' }} />
            <span className="skel" style={{ width: '55%', height: '13px' }} />
          </div>
        ) : (
          <div className="card empty" data-state="empty">
            <span className="lbl">{strings.trainWeek.nextWeek}</span>
            <div className="head">{strings.trainWeek.proposeTitle}</div>
            <p className="sub">{strings.trainWeek.proposeBody}</p>
            <div className="actions">
              <button
                type="button"
                className={accented ? 'btn primary block' : 'btn block'}
                onClick={() => {
                  setProposing(true);
                  void post({ action: 'propose' }, null);
                }}
              >
                {strings.trainWeek.propose}
              </button>
            </div>
          </div>
        )}
        {failure ? (
          <div className="card error" data-state="error">
            <div className="between">
              <span className="lbl">{strings.trainWeek.nextWeek}</span>
              <span className="chip a">{strings.error.title}</span>
            </div>
            <div className="head">{strings.trainWeek.errorTitle}</div>
            <p className="sub">{failure.detail}</p>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <>
      {staleDays !== null ? (
        <div className="card" data-state="stale">
          <div className="between">
            <span className="lbl">{strings.trainWeek.nextWeek}</span>
            <span className="src stale">{strings.trainWeek.staleTitle(staleDays)}</span>
          </div>
          <p className="sub">{strings.trainWeek.staleBody}</p>
        </div>
      ) : null}

      {week.map((row) => (
        <section className="card" key={row.id} data-proposal={row.id} data-state={row.state}>
          <div className="between" style={{ alignItems: 'flex-start' }}>
            <div className="stack grow">
              <span className="lbl">{longDate(new Date(row.plannedFor), timeZone)}</span>
              <span className="head" style={{ marginTop: '2px' }}>
                {KINDS[row.kind] ?? row.kind}, {strings.trainWeek.duration(row.durationMinutes)}
              </span>
              <span className="sub num">
                {strings.trainWeek.when(
                  time24(new Date(row.plannedFor), timeZone),
                  time24(endOf(row), timeZone),
                  PLACES[row.place] ?? row.place,
                )}
              </span>
            </div>
            {/*
              * Accept, edit, reject. Three controls on one row and no fourth
              * anywhere on this screen: there is no button that decides more
              * than the card it sits in.
              */}
            <div className="seg" role="group" aria-label={KINDS[row.kind] ?? row.kind}>
              <button
                type="button"
                data-decision="accept"
                aria-pressed={row.state === 'accepted'}
                aria-label={strings.trainWeek.accept}
                disabled={busy === row.id}
                onClick={() => void post({ action: 'accept', id: row.id }, row.id)}
              >
                <OkIcon />
              </button>
              <Link
                className="btn icon"
                data-decision="edit"
                href={`/train/session/${row.id}/edit`}
                aria-label={strings.trainWeek.edit}
                style={{ width: 'var(--touch)', height: 'var(--touch)', minHeight: 'var(--touch)' }}
              >
                <EditIcon />
              </Link>
              <button
                type="button"
                data-decision="reject"
                aria-pressed={row.state === 'rejected'}
                aria-label={strings.trainWeek.reject}
                disabled={busy === row.id}
                onClick={() => void post({ action: 'reject', id: row.id }, row.id)}
              >
                <CloseIcon />
              </button>
            </div>
          </div>

          <p className="reason" data-cause>
            {row.cause}
          </p>

          {row.fullBody ? (
            <div className="chips" style={{ marginTop: '10px' }}>
              <span className="chip">{strings.trainWeek.fullBody}</span>
              <span className="chip">{strings.trainWeek.movements(row.movements.length)}</span>
            </div>
          ) : null}

          {/*
            * The plain fact about the length, when there is one. A percentage
            * and the minutes it was measured against, and no risk number
            * anywhere near it: the 10 percent rule as injury prevention was
            * falsified in a 532-person randomised trial at P=.90, and no trial
            * has ever shown a progression rule that prevents injuries.
            */}
          {row.percentLonger !== null && row.longestMinutes !== null ? (
            <div className="stack" style={{ marginTop: '10px' }} data-length-fact={row.percentLonger}>
              <span className="sub">
                {strings.trainWeek.longerFact(row.percentLonger, row.longestMinutes)}
              </span>
              <span className="note">{strings.trainWeek.longerNote}</span>
            </div>
          ) : null}

          {row.state === 'rejected' ? (
            <p className="note" style={{ marginTop: '10px' }}>
              {strings.trainWeek.rejectedNote}
            </p>
          ) : null}

          <div className="between" style={{ marginTop: '10px' }}>
            <span className="chip">{STATES[row.state] ?? row.state}</span>
            {row.state === 'accepted' ? (
              <Link className="btn quiet" href={`/train/session/${row.id}`}>
                {strings.trainWeek.startSession}
              </Link>
            ) : null}
          </div>

          {failure && failure.id === row.id ? (
            <div className="card error" data-state="error" style={{ marginTop: '10px', marginBottom: 0 }}>
              <div className="head" style={{ marginTop: 0 }}>
                {strings.trainWeek.errorTitle}
              </div>
              <p className="sub">{failure.detail}</p>
            </div>
          ) : null}
        </section>
      ))}

      <div className="card flat" style={{ borderStyle: 'dashed' }}>
        <div className="between" style={{ marginBottom: '6px' }}>
          <span className="lbl">{strings.trainWeek.learnedLabel}</span>
          <span className="src est">
            <SparkIcon />
            {strings.trainWeek.nextWeek}
          </span>
        </div>
        <p className="sub">{strings.trainWeek.learnedNone}</p>
      </div>

      <p className="note centre" style={{ padding: '4px 20px 0' }}>
        {strings.trainWeek.missedNote}
      </p>

      <div className="stickyfoot">
        <div className="between" style={{ marginBottom: '10px' }}>
          <span className="sub" data-decided>
            {strings.trainWeek.decided(accepted, rejected)}
          </span>
          <button
            type="button"
            className="btn quiet"
            style={{ minHeight: 'var(--touch)', padding: 0 }}
            disabled={busy !== null}
            onClick={() => void post({ action: 'propose' }, null)}
          >
            {strings.trainWeek.askAgain}
          </button>
        </div>
        <Link className="btn block" href="/">
          {strings.trainWeek.seeToday}
        </Link>
        <p className="note centre" style={{ marginTop: '8px' }}>
          {undecided > 0 ? `${strings.trainWeek.undecided(undecided)} ` : ''}
          {strings.trainWeek.footerNote}
        </p>
      </div>
    </>
  );
}
