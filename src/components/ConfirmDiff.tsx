'use client';

import { Fragment, type ReactNode } from 'react';
import { CloseIcon, OkIcon } from '@/components/icons';
import { strings } from '@/lib/strings';

/**
 * THE CONFIRM DIFF. One component, two uses: the training week and the calendar
 * write. `00-patterns.html` frame 4 is authoritative for it, and DESIGN.md
 * section 4 fixes the six parts:
 *
 *   1. Counts first, at `--t-metric`, in the order added, moved, removed.
 *   2. For a calendar write, the dedicated calendar before and after as two
 *      columns, additions in `--good` and removals struck through in `--text-3`.
 *   3. Rows grouped by verb. Each row: what, when, and the cause in plain words.
 *      A move shows the old time struck through, then the new one in bold.
 *   4. Per-row confirm. Additions and moves selected by default, removals
 *      unselected: you opt in to a delete, never out of it.
 *   5. A sticky footer stating what will happen. Nothing writes before it.
 *   6. After the write, the same list with outcomes, plus undo.
 *
 * WHY THE FOOTER IS A SLOT. The two surfaces genuinely differ there and the
 * difference is a rubric line rather than a preference: the calendar write ends
 * in one Apply button that states its count, and the training week must NOT have
 * one, because F72 says no control on that screen commits the whole week. Rows,
 * counts, groups, causes and per-row confirmation are the component; what the
 * bottom bar says is the surface's own.
 *
 * NOTHING HERE WRITES AND NOTHING HERE DECIDES. It renders what it is handed and
 * calls back with a row identifier. Every word it draws comes from the
 * catalogue or from a `cause` its caller froze at build time.
 */

export type ConfirmVerb = 'added' | 'moved' | 'removed';

export type ConfirmRow = {
  id: string;
  verb: ConfirmVerb;
  /** What is changing: the session, or the calendar itself. */
  title: string;
  /** When it lands, rendered by the caller in the app's zone. */
  when: string;
  /** For a move: where it was, struck through beside where it is going. */
  wasWhen?: string | null;
  /** Why, in plain words, frozen when the change was worked out. */
  cause: string;
  selected: boolean;
  busy?: boolean;
  /** True once the row has been decided and can no longer be ticked. */
  settled?: boolean;
  /** Markers a surface needs to keep on its own rows. */
  attrs?: Record<string, string>;
  /** Chips, facts or notes under the cause. */
  extra?: ReactNode;
  /** Replaces the accept and reject pair when a surface brings its own controls. */
  controls?: ReactNode;
  /** What the row ended as, after the write. */
  outcome?: string | null;
  /** An action on the row afterwards, which for the calendar write is undo. */
  after?: ReactNode;
};

export type ConfirmColumnEntry = {
  id: string;
  title: string;
  when: string;
  change: 'same' | 'added' | 'removed' | 'movedTo';
};

export type ConfirmColumns = {
  beforeLabel: string;
  afterLabel: string;
  before: ConfirmColumnEntry[];
  after: ConfirmColumnEntry[];
  emptyLabel: string;
};

export type ConfirmCounts = { added: number; moved: number; removed: number };

const GROUPS: Array<{ verb: ConfirmVerb; label: string }> = [
  { verb: 'added', label: strings.calendar.groupAdded },
  { verb: 'moved', label: strings.calendar.groupMoved },
  { verb: 'removed', label: strings.calendar.groupRemoved },
];

export function ConfirmDiff({
  label,
  counts,
  rows,
  columns,
  chip,
  rowCountLine,
  onToggle,
  notes,
  footer,
}: {
  label: string;
  counts: ConfirmCounts;
  rows: ConfirmRow[];
  columns?: ConfirmColumns | null;
  /** "4 of 5 selected", or whatever the surface counts. */
  chip?: string | null;
  /** How long the list below is, stated as a number before it is scrolled. */
  rowCountLine?: string | null;
  /** Absent means the rows are a record rather than a question. */
  onToggle?: (id: string, next: boolean) => void;
  notes?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <>
      {/* 1. THE COUNTS, FIRST, AT METRIC SIZE, IN THE ORDER ADDED MOVED REMOVED. */}
      <section className="card tight" data-confirm="summary">
        <div className="between">
          <span className="lbl">{label}</span>
          {chip ? (
            <span className="chip" data-confirm-chip>
              {chip}
            </span>
          ) : null}
        </div>
        <div className="headlines" data-confirm-counts>
          <div className="stack">
            <span className="metric good" data-count="added">
              {counts.added}
            </span>
            <span className="note">{strings.calendar.added}</span>
          </div>
          <div className="stack">
            <span className="metric" data-count="moved">
              {counts.moved}
            </span>
            <span className="note">{strings.calendar.moved}</span>
          </div>
          <div className="stack">
            <span className="metric warn" data-count="removed">
              {counts.removed}
            </span>
            <span className="note">{strings.calendar.removed}</span>
          </div>
        </div>
        {rowCountLine ? (
          <p className="note" data-confirm-rowcount>
            {rowCountLine}
          </p>
        ) : null}
      </section>

      {/* 2. THE TWO COLUMNS. What the calendar holds, and what it would hold. */}
      {columns ? (
        <section className="card" data-confirm="columns">
          <div className="diffcols">
            <div className="diffcol" data-column="before">
              <span className="lbl">{columns.beforeLabel}</span>
              <ColumnList entries={columns.before} emptyLabel={columns.emptyLabel} />
            </div>
            <div className="diffcol" data-column="after">
              <span className="lbl">{columns.afterLabel}</span>
              <ColumnList entries={columns.after} emptyLabel={columns.emptyLabel} />
            </div>
          </div>
        </section>
      ) : null}

      {/* 3 and 4. Rows grouped by verb, each with its cause and its own confirm. */}
      {GROUPS.map((group) => {
        const inGroup = rows.filter((row) => row.verb === group.verb);
        if (inGroup.length === 0) return null;
        return (
          <Fragment key={group.verb}>
            <div className="lbl" data-confirm-group={group.verb} style={{ margin: '16px 0 8px' }}>
              {group.label}
            </div>
            {inGroup.map((row) => (
              <ConfirmRowCard key={row.id} row={row} onToggle={onToggle} />
            ))}
          </Fragment>
        );
      })}

      {notes}

      {/* 5. The sticky footer. Nothing writes before it. */}
      {footer ? (
        <div className="stickybar" data-confirm-footer>
          {footer}
        </div>
      ) : null}
    </>
  );
}

function ColumnList({
  entries,
  emptyLabel,
}: {
  entries: ConfirmColumnEntry[];
  emptyLabel: string;
}) {
  if (entries.length === 0) {
    return (
      <p className="note" data-column-empty>
        {emptyLabel}
      </p>
    );
  }
  return (
    <ul className="difflist">
      {entries.map((entry) => (
        <li key={`${entry.id}:${entry.when}`} data-column-change={entry.change}>
          <span className={entry.change === 'added' ? 'sub good' : 'sub'}>{entry.title}</span>
          <span className="note num">{entry.when}</span>
        </li>
      ))}
    </ul>
  );
}

function ConfirmRowCard({
  row,
  onToggle,
}: {
  row: ConfirmRow;
  onToggle?: (id: string, next: boolean) => void;
}) {
  const removal = row.verb === 'removed';
  return (
    <section
      className="card"
      data-confirm-row={row.id}
      data-verb={row.verb}
      data-selected={row.selected ? 'true' : 'false'}
      style={{ padding: '12px 14px', marginBottom: '8px', ...(removal ? { borderColor: 'var(--warn)' } : {}) }}
      {...row.attrs}
    >
      <div className="between" style={{ alignItems: 'flex-start' }}>
        <div className="stack grow">
          <span className="strong">{removal ? <s>{row.title}</s> : row.title}</span>
          <span className="sub num" data-confirm-when>
            {row.wasWhen ? (
              <>
                <s className="mut">{row.wasWhen}</s> <b>{row.when}</b>
              </>
            ) : (
              row.when
            )}
          </span>
        </div>
        {row.controls ?? (
          <div className="seg" role="group" aria-label={row.title}>
            <button
              type="button"
              className="ok"
              data-decision="accept"
              aria-pressed={row.selected}
              aria-label={removal ? strings.calendar.acceptRemovalLabel : strings.calendar.acceptLabel}
              disabled={row.busy || row.settled || !onToggle}
              onClick={() => onToggle?.(row.id, true)}
            >
              <OkIcon />
            </button>
            <button
              type="button"
              className="no"
              data-decision="reject"
              aria-pressed={!row.selected}
              aria-label={removal ? strings.calendar.keepLabel : strings.calendar.rejectLabel}
              disabled={row.busy || row.settled || !onToggle}
              onClick={() => onToggle?.(row.id, false)}
            >
              <CloseIcon />
            </button>
          </div>
        )}
      </div>

      <p className="reason" data-cause>
        {row.cause}
      </p>

      {row.extra}

      {removal && onToggle ? (
        <p className="note warn" style={{ marginTop: '8px' }} data-removal-note>
          {strings.calendar.removalNote}
        </p>
      ) : null}

      {row.outcome || row.after ? (
        <div className="between" style={{ marginTop: '10px' }}>
          {row.outcome ? (
            <span className="chip" data-confirm-outcome>
              {row.outcome}
            </span>
          ) : (
            <span />
          )}
          {row.after}
        </div>
      ) : null}
    </section>
  );
}
