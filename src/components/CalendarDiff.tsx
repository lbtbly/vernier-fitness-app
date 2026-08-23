'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  type ConfirmColumns,
  type ConfirmRow,
  ConfirmDiff,
} from '@/components/ConfirmDiff';
import { CalendarIcon, InfoIcon, UndoIcon, WarnIcon } from '@/components/icons';
import type { GoogleView } from '@/db/google';
import { CSRF_HEADER } from '@/lib/cookie-names';
import { calendarCauseLine, calendarOutcomeLabel, calendarVerbLabel } from '@/lib/display';
import { longDateTime, shortDate, shortDateTime, time24 } from '@/lib/format';
import { afterColumn, beforeColumn } from '@/lib/google/columns';
import type { PlanView, WriteLogView } from '@/lib/google/service';
import { messageOf } from '@/lib/platform-cause';
import { strings } from '@/lib/strings';

/**
 * The calendar write, screen 00 frame 4, and the last thing that happens before
 * anything reaches Google.
 *
 * IT RENDERS `ConfirmDiff`, the same component the training week renders. The
 * rows are different and everything else is the same: counts first at metric
 * size in the order added, moved, removed, the dedicated calendar before and
 * after as two columns, rows grouped by verb each naming its cause in plain
 * words, per-row confirmation with additions and moves ticked and removals not,
 * and a sticky footer that states the count. That is C14, and it is a shared
 * import rather than a shared screenshot.
 *
 * ALL FIVE STATES, ON THIS SURFACE. Loading is skeletons at the final size while
 * a plan is being worked out. Empty is the dashed card when the calendar already
 * matches the plan. Error is the solid `--alert` card with what failed in words
 * and a line saying what still works. Offline is the same card saying the
 * browser never reached the Mac mini. Stale is the `--warn` chip carrying the
 * age of the availability the plan was built on, with the cause under it.
 *
 * THE AFTER COLUMN FOLLOWS THE TICKS. It is recomputed from
 * `src/lib/google/columns.ts`, the same function the unit suite grades, so what
 * the owner sees in the right-hand column is what the apply will produce.
 */

type Failure = { title: string; detail: string } | null;

export function CalendarDiff({
  view,
  plan,
  writes,
  timeZone,
  csrfToken,
}: {
  view: GoogleView;
  plan: PlanView | null;
  writes: WriteLogView[];
  timeZone: string;
  csrfToken: string;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState<PlanView | null>(plan);
  const [log, setLog] = useState<WriteLogView[]>(writes);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set((plan?.rows ?? []).filter((row) => row.defaultSelected).map((row) => row.id)),
  );
  const [busy, setBusy] = useState<'plan' | 'apply' | string | null>(null);
  const [failure, setFailure] = useState<Failure>(null);

  const connected = view.state === 'connected' || view.state === 'demo';
  const open = current?.state === 'open';

  async function post(body: Record<string, unknown>, working: string) {
    setBusy(working);
    setFailure(null);
    try {
      const response = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'content-type': 'application/json', [CSRF_HEADER]: csrfToken },
        body: JSON.stringify(body),
      });
      const answer = (await response.json().catch(() => ({}))) as {
        plan?: PlanView | null;
        writes?: WriteLogView[];
        error?: string;
        detail?: string;
      };
      if (!response.ok) {
        setFailure({
          title: answer.error ?? strings.calendar.errorTitleDiff,
          detail: answer.detail ?? strings.calendar.errorBodyDiff,
        });
        if (answer.writes) setLog(answer.writes);
        return false;
      }
      if (answer.plan !== undefined) {
        setCurrent(answer.plan);
        setSelected(
          new Set((answer.plan?.rows ?? []).filter((row) => row.defaultSelected).map((row) => row.id)),
        );
      }
      if (answer.writes) setLog(answer.writes);
      router.refresh();
      return true;
    } catch (error) {
      // The request never reached the Mac mini. Nothing was written, and the
      // card says exactly that rather than leaving the screen looking applied.
      setFailure({
        title: strings.calendar.errorTitleDiff,
        detail: navigator.onLine ? messageOf(error) : strings.calendar.offline,
      });
      return false;
    } finally {
      setBusy(null);
    }
  }

  const rows = current?.rows ?? [];
  const counts = current?.counts ?? { added: 0, moved: 0, removed: 0 };
  const chosen = rows.filter((row) => selected.has(row.id)).length;

  const columns: ConfirmColumns | null = current
    ? {
        beforeLabel: strings.confirm.beforeLabel,
        afterLabel: strings.confirm.afterLabel,
        emptyLabel: strings.confirm.columnEmpty,
        before: beforeColumn(current.beforeEvents).map((entry) => ({
          id: entry.eventId,
          title: entry.title,
          when: shortDateTime(new Date(entry.start), timeZone),
          change: entry.change,
        })),
        after: afterColumn(
          current.beforeEvents,
          rows.map((row) => ({
            id: row.id,
            verb: row.verb,
            eventId: row.eventId,
            title: row.title,
            afterStart: row.afterStart,
            afterEnd: row.afterEnd,
          })),
          open ? selected : new Set(rows.filter((row) => row.state === 'applied').map((row) => row.id)),
        ).map((entry) => ({
          id: entry.eventId,
          title: entry.title,
          when: shortDateTime(new Date(entry.start), timeZone),
          change: entry.change,
        })),
      }
    : null;

  const confirmRows: ConfirmRow[] = useMemo(
    () =>
      rows.map((row) => {
        const undoable = log.find((entry) => entry.id === row.writeId && !entry.undoneByWriteId);
        return {
          id: row.id,
          verb: row.verb as ConfirmRow['verb'],
          title: row.title,
          when: whenLine(row.afterStart, row.afterEnd, row.beforeStart, row.beforeEnd, timeZone),
          wasWhen:
            row.verb === 'moved' && row.beforeStart
              ? strings.calendar.whenShort(
                  shortDate(new Date(row.beforeStart), timeZone),
                  time24(new Date(row.beforeStart), timeZone),
                )
              : null,
          cause: row.cause,
          selected: open ? selected.has(row.id) : row.state === 'applied',
          settled: !open,
          busy: busy === 'apply',
          outcome: open ? null : calendarOutcomeLabel(row.state),
          after: undoable ? (
            <button
              type="button"
              className="btn quiet"
              data-undo={undoable.id}
              disabled={busy !== null}
              onClick={() => void post({ action: 'undo', writeId: undoable.id }, undoable.id)}
            >
              <UndoIcon />
              {busy === undoable.id ? strings.calendar.undoing : strings.calendar.undo}
            </button>
          ) : null,
        };
      }),
    // `post` and `strings` are stable for the life of this screen; what changes
    // the rows is the plan, the ticks, the log and whatever is working.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, selected, open, busy, log, timeZone],
  );

  // ---- not connected. The plan still works; this screen says so plainly.
  if (!connected) {
    return (
      <>
        <section className="card empty" data-state="empty" data-calendar="not-connected">
          <span className="lbl">{strings.calendar.title}</span>
          <div className="head">{strings.calendar.notConnectedTitle}</div>
          <p className="sub">{strings.calendar.notConnectedBody}</p>
          <div className="actions">
            <Link className="btn primary block" href="/settings">
              {strings.calendar.openSettings}
            </Link>
          </div>
        </section>
        <WriteLog log={log} timeZone={timeZone} busy={busy} onUndo={(id) => void post({ action: 'undo', writeId: id }, id)} />
      </>
    );
  }

  return (
    <>
      {view.mode === 'demo' ? (
        <div className="banner" role="status" data-calendar="demo">
          <InfoIcon />
          <div className="stack">
            <span className="strong">{strings.calendar.demoChip}</span>
            <span className="note">{strings.calendar.demoNote}</span>
          </div>
        </div>
      ) : null}

      {/* STALE. The plan was built on stored availability because Google did not
          answer, and the age of it is on screen with the cause under it. */}
      {current?.availabilityStale ? (
        <section className="card" data-state="stale" data-calendar="stale">
          <div className="between">
            <span className="lbl">{strings.calendar.title}</span>
            <span className="src stale">{strings.calendar.staleChip}</span>
          </div>
          <div className="head">
            {strings.calendar.staleTitle(
              current.availabilityAt
                ? shortDateTime(new Date(current.availabilityAt), timeZone)
                : strings.calendar.neverRead,
            )}
          </div>
          <p className="sub">{strings.calendar.staleBody}</p>
          {view.cause ? (
            <p className="note warn" data-calendar-cause={view.cause}>
              {calendarCauseLine(view.cause)}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* THE SURFACED PER-CALENDAR ERROR. An unshared calendar answers with an
          empty busy list, which reads exactly like a free day. It is named here
          rather than read as free. */}
      {current && current.failures.length > 0 ? (
        <section className="card error" data-state="error" data-calendar="read-failure">
          <div className="between">
            <span className="lbl">{strings.calendar.title}</span>
            <span className="chip a">
              <WarnIcon />
              {strings.error.failedChip}
            </span>
          </div>
          <div className="head">
            {current.failures.length === 1
              ? strings.calendar.failureTitle
              : strings.calendar.failureTitleMany(current.failures.length)}
          </div>
          <ul className="difflist">
            {current.failures.map((entry) => (
              <li key={entry.calendarId} data-failed-calendar={entry.calendarId}>
                <span className="sub">{strings.calendar.failureRow(entry.calendarId, entry.reason)}</span>
              </li>
            ))}
          </ul>
          <p className="note">{strings.calendar.failureBody}</p>
        </section>
      ) : null}

      {/* LOADING. Skeletons at the final size, never a spinner and never a fake row. */}
      {busy === 'plan' ? (
        <section className="card" data-state="loading" aria-busy="true" aria-label={strings.calendar.checking}>
          <span className="lbl">{strings.calendar.checking}</span>
          <span className="skel" style={{ width: '60%', height: '34px', margin: '10px 0' }} />
          <span className="skel" style={{ width: '90%', height: '13px', marginBottom: '6px' }} />
          <span className="skel" style={{ width: '70%', height: '13px' }} />
        </section>
      ) : null}

      {/* ERROR. What failed, in words, and what still works. */}
      {failure ? (
        <section className="card error" data-state="error" role="alert">
          <div className="between">
            <span className="lbl">{strings.calendar.title}</span>
            <span className="chip a">{strings.error.failedChip}</span>
          </div>
          <div className="head">{failure.title}</div>
          <p className="sub">{failure.detail}</p>
          <p className="note">{strings.calendar.errorStillWorks}</p>
          <div className="actions">
            <button type="button" className="btn grow" onClick={() => setFailure(null)}>
              {strings.calendar.errorRetry}
            </button>
          </div>
        </section>
      ) : null}

      {/* EMPTY. The calendar already matches the plan. */}
      {current && rows.length === 0 && busy !== 'plan' ? (
        <section className="card empty" data-state="empty" data-calendar="nothing-to-do">
          <span className="lbl">{strings.calendar.title}</span>
          <div className="head">{strings.calendar.planEmptyTitle}</div>
          <p className="sub">{strings.calendar.planEmptyBody}</p>
          <p className="note">{strings.calendar.builtAt(longDateTime(new Date(current.builtAt), timeZone))}</p>
          <div className="actions">
            <button
              type="button"
              className="btn block"
              data-control="rebuild"
              disabled={busy !== null}
              onClick={() => void post({ action: 'plan' }, 'plan')}
            >
              {strings.calendar.rebuild}
            </button>
          </div>
        </section>
      ) : null}

      {/* No plan yet at all. One action, and it reads nothing until it is pressed. */}
      {!current && busy !== 'plan' ? (
        <section className="card empty" data-state="empty" data-calendar="no-plan">
          <span className="lbl">{strings.calendar.title}</span>
          <div className="head">{strings.calendar.diffTitle}</div>
          <p className="sub">{strings.calendar.diffSub}</p>
          <div className="actions">
            <button
              type="button"
              className="btn primary block"
              data-control="build-plan"
              disabled={busy !== null}
              onClick={() => void post({ action: 'plan' }, 'plan')}
            >
              <CalendarIcon />
              {strings.calendar.buildPlan}
            </button>
          </div>
        </section>
      ) : null}

      {/*
        * WHEN IT WAS WORKED OUT, and one control to work it out again.
        *
        * A plan is a photograph of two calendars at one instant. Availability
        * moves under it, so the screen says how old it is and offers to look
        * again rather than leaving the owner to guess whether what he is about
        * to apply is still true.
        */}
      {current && rows.length > 0 ? (
        <div className="between" data-calendar="built-at" style={{ margin: '0 0 var(--s2)' }}>
          <span className="note">{strings.calendar.builtAt(longDateTime(new Date(current.builtAt), timeZone))}</span>
          <button
            type="button"
            className="btn quiet"
            data-control="rebuild"
            style={{ minHeight: 'var(--touch)', padding: '0 var(--s2)' }}
            disabled={busy !== null}
            onClick={() => void post({ action: 'plan' }, 'plan')}
          >
            {strings.calendar.rebuild}
          </button>
        </div>
      ) : null}

      {current && rows.length > 0 ? (
        <ConfirmDiff
          label={strings.confirm.summaryLabel}
          counts={counts}
          rows={confirmRows}
          columns={columns}
          chip={open ? strings.confirm.selectedChip(chosen, rows.length) : null}
          rowCountLine={strings.confirm.rowCount(rows.length)}
          onToggle={
            open
              ? (id, next) =>
                  setSelected((previous) => {
                    const copy = new Set(previous);
                    if (next) copy.add(id);
                    else copy.delete(id);
                    return copy;
                  })
              : undefined
          }
          notes={
            <>
              {current.unplaceable.length > 0 ? (
                <section className="card" data-calendar="unplaceable" style={{ borderColor: 'var(--warn)' }}>
                  <span className="lbl">{strings.calendar.unplaceableTitle}</span>
                  {current.unplaceable.map((entry) => (
                    <p className="sub" key={entry.sessionId} data-unplaceable={entry.sessionId}>
                      {strings.calendar.unplaceableRow(
                        entry.title,
                        shortDate(new Date(entry.plannedFor), timeZone),
                        time24(new Date(entry.blockedFrom), timeZone),
                        time24(new Date(entry.blockedTo), timeZone),
                      )}
                    </p>
                  ))}
                </section>
              ) : null}

              {current.heldBack > 0 ? (
                <p className="note centre" data-held-back={current.heldBack}>
                  {strings.calendar.heldBackNote(current.heldBack)}
                </p>
              ) : null}

              <div className="card flat" style={{ borderStyle: 'dashed' }} data-calendar="written-where">
                <span className="lbl">{strings.calendar.writtenWhereLabel}</span>
                <p className="sub" style={{ marginTop: '6px' }}>
                  {strings.calendar.writtenWhere(view.appCalendarSummary ?? strings.calendar.calendarName)}
                </p>
              </div>
            </>
          }
          footer={
            open ? (
              <>
                <div className="between">
                  <span className="sub" data-selected-count>
                    {strings.calendar.footerSelected(chosen, rows.length - chosen)}
                  </span>
                  <button
                    type="button"
                    className="btn quiet"
                    style={{ minHeight: 'var(--touch)', padding: 0 }}
                    disabled={busy !== null}
                    onClick={() =>
                      setSelected((previous) =>
                        previous.size === rows.length ? new Set() : new Set(rows.map((row) => row.id)),
                      )
                    }
                  >
                    {chosen === rows.length ? strings.calendar.clearAll : strings.calendar.selectAll}
                  </button>
                </div>
                <button
                  type="button"
                  className="btn primary block"
                  data-control="apply"
                  disabled={busy !== null || chosen === 0}
                  onClick={() =>
                    void post(
                      { action: 'apply', planId: current.id, rowIds: [...selected] },
                      'apply',
                    )
                  }
                >
                  {busy === 'apply'
                    ? strings.calendar.applying
                    : chosen === 0
                      ? strings.calendar.applyNone
                      : strings.calendar.apply(chosen)}
                </button>
                <p className="note centre" style={{ marginTop: '8px' }}>
                  {strings.calendar.undoStays}
                </p>
              </>
            ) : (
              <>
                <div className="between">
                  <span className="sub" data-applied-note>
                    {strings.calendar.appliedNote(
                      rows.filter((row) => row.state === 'applied').length,
                      rows.filter((row) => row.state === 'skipped').length,
                    )}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn block"
                  data-control="rebuild"
                  disabled={busy !== null}
                  onClick={() => void post({ action: 'plan' }, 'plan')}
                >
                  {strings.calendar.rebuild}
                </button>
              </>
            )
          }
        />
      ) : null}

      <WriteLog
        log={log}
        timeZone={timeZone}
        busy={busy}
        onUndo={(id) => void post({ action: 'undo', writeId: id }, id)}
      />
    </>
  );
}

/** "Mon 24 Aug, 19:00 to 19:45", off whichever side of the change exists. */
function whenLine(
  afterStart: string | null,
  afterEnd: string | null,
  beforeStart: string | null,
  beforeEnd: string | null,
  timeZone: string,
): string {
  const start = afterStart ?? beforeStart;
  const end = afterEnd ?? beforeEnd;
  if (!start) return strings.confirm.columnEmpty;
  if (!end) {
    return strings.calendar.whenShort(
      shortDate(new Date(start), timeZone),
      time24(new Date(start), timeZone),
    );
  }
  return strings.calendar.when(
    shortDate(new Date(start), timeZone),
    time24(new Date(start), timeZone),
    time24(new Date(end), timeZone),
  );
}

/**
 * THE PERMANENT WRITE LOG, with undo on every line of it.
 *
 * Not the last write and not this evening's: every write this app has ever made,
 * newest first, each with the instant it happened and an undo beside it until it
 * is undone. F108 asks that a write from two sessions earlier undo successfully,
 * and this is the surface that offers it.
 */
function WriteLog({
  log,
  timeZone,
  busy,
  onUndo,
}: {
  log: WriteLogView[];
  timeZone: string;
  busy: string | null;
  onUndo: (id: string) => void;
}) {
  return (
    <section className="card" data-calendar="write-log">
      <span className="lbl">{strings.calendar.writeLogTitle}</span>
      {log.length === 0 ? (
        <div className="card empty" data-state="empty" style={{ marginTop: 'var(--s3)' }}>
          <div className="head">{strings.calendar.writeLogEmptyTitle}</div>
          <p className="sub">{strings.calendar.writeLogEmptyBody}</p>
        </div>
      ) : (
        log.map((entry) => (
          <div className="row" key={entry.id} data-write={entry.id} data-write-outcome={entry.outcome}>
            <div className="stack grow">
              <span className="head" style={{ margin: 0 }}>
                {strings.calendar.writeLogRow(calendarVerbLabel(entry.verb), entry.title)}
              </span>
              <span className="note num">{longDateTime(new Date(entry.at), timeZone)}</span>
              <span className="note">{calendarOutcomeLabel(entry.outcome)}</span>
            </div>
            {entry.verb === 'undo' || entry.outcome !== 'written' ? null : entry.undoneByWriteId ? (
              <span className="chip" data-write-undone>
                {strings.calendar.undone}
              </span>
            ) : (
              <button
                type="button"
                className="btn quiet"
                data-undo={entry.id}
                disabled={busy !== null}
                onClick={() => onUndo(entry.id)}
              >
                <UndoIcon />
                {busy === entry.id ? strings.calendar.undoing : strings.calendar.undo}
              </button>
            )}
          </div>
        ))
      )}
      <p className="note" style={{ marginTop: 'var(--s3)' }}>
        {strings.calendar.writeLogNote}
      </p>
    </section>
  );
}
