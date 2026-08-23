/**
 * The two columns: the dedicated calendar as it stands, and as it would stand if
 * the ticked rows applied.
 *
 * ONE IMPLEMENTATION, TWO READERS. The confirm screen recomputes the after
 * column on every tick, in the browser, and the unit suite grades the same
 * function on the server. A second copy for the client would be two rules that
 * look alike and drift, which is the defect class this repository has already
 * paid for; so this module holds ISO strings rather than `Date` objects and has
 * no import at all, which is what lets both sides use it.
 *
 * F107 asks for the before and after as two columns, and a summary sentence
 * fails the test the diff exists to pass. This is the half a count cannot give:
 * what the calendar actually looks like, either side of the button.
 */

export type ColumnChange = 'same' | 'added' | 'removed' | 'movedTo';

export type ColumnEvent = {
  eventId: string;
  title: string;
  start: string;
  end: string;
  change: ColumnChange;
};

/** The shape both the screen and a test hand in. Serialisable, on purpose. */
export type ColumnRow = {
  id: string;
  verb: string;
  eventId: string;
  title: string;
  afterStart: string | null;
  afterEnd: string | null;
};

export function beforeColumn(events: ColumnEvent[]): ColumnEvent[] {
  return [...events]
    .map((event) => ({ ...event, change: 'same' as ColumnChange }))
    .sort((left, right) => Date.parse(left.start) - Date.parse(right.start));
}

/**
 * The after column, following the owner's ticks.
 *
 * It takes the SELECTED set rather than reading a flag off the row, because the
 * whole point of the column is that it moves as he changes his mind. A removal
 * he has not opted into is still in this column, and a removal he has opted into
 * is gone from it.
 */
export function afterColumn(
  events: ColumnEvent[],
  rows: ColumnRow[],
  selected: ReadonlySet<string>,
): ColumnEvent[] {
  const entries = new Map<string, ColumnEvent>();
  for (const event of events) {
    entries.set(event.eventId, { ...event, change: 'same' });
  }

  for (const row of rows) {
    if (!selected.has(row.id)) continue;
    if (row.verb === 'removed') {
      entries.delete(row.eventId);
      continue;
    }
    if (!row.afterStart || !row.afterEnd) continue;
    entries.set(row.eventId, {
      eventId: row.eventId,
      title: row.title,
      start: row.afterStart,
      end: row.afterEnd,
      change: row.verb === 'added' ? 'added' : 'movedTo',
    });
  }

  return [...entries.values()].sort((left, right) => Date.parse(left.start) - Date.parse(right.start));
}

/** How many changes will apply, which is the number the sticky footer states. */
export function selectedCount(rows: ColumnRow[], selected: ReadonlySet<string>): number {
  return rows.filter((row) => selected.has(row.id)).length;
}
