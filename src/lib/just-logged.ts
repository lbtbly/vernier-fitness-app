/**
 * What the owner just wrote, held where two places on Today can both read it.
 *
 * WHY IT IS NOT COMPONENT STATE. `.forge/AMENDMENTS.md` A6 puts a just-logged
 * entry in two places at once: the entry itself is rows in the day card, above
 * the weight trend, and screen 03 frame 2's "What happens next" card sits below
 * the weight card. One React component cannot render into both without wrapping
 * Today in a provider, and the quick log is one client island on an otherwise
 * server-rendered screen: a provider around it would pull the whole page across
 * the boundary to carry one object.
 *
 * So it is a module-level store with subscribers, which is the same shape
 * `src/lib/outbox.ts` already uses for the queue depth and for the same reason.
 * Nothing here is persisted: a reload clears it, and that is correct, because
 * "just logged" is a moment and not a state of the data. What survives a reload
 * is the queue, and the queue has its own store.
 */

export type LoggedValue = { id: string; metric: string; rawValue: string; unit: string };

/**
 * What just happened, and which reversal is honest for it.
 *
 * `queued` while the entry is still in the outbox: the write exists on this
 * phone and nowhere else, so Undo really does remove it and Edit really does
 * reopen the sheet holding what was typed. `applied` once it has uploaded: the
 * table refuses DELETE, so the only reversal left is a correction and the button
 * says so. `undone` and `tooLate` are what the two paths report.
 *
 * The screen never shows Undo for a write it cannot undo. Screen 03 frame 2
 * draws the pair and annotates them "undoable for as long as it sits in the
 * queue", and this is that clause rather than a button that lies after a second
 * and a half.
 */
export type JustLogged = {
  entryId: string;
  at: Date;
  values: LoggedValue[];
  state: 'queued' | 'applied' | 'undone' | 'tooLate';
};

let current: JustLogged | null = null;

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeJustLogged(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function readJustLogged(): JustLogged | null {
  return current;
}

/**
 * Set it, or change the one that is there.
 *
 * The updater form is what keeps a late answer from resurrecting a cleared
 * entry: `pending()` is asked whether the write is still in the queue and comes
 * back milliseconds later, by which time Undo may have taken it. The caller
 * decides against whatever is current at that moment rather than against what it
 * closed over.
 */
export function setJustLogged(next: JustLogged | null | ((previous: JustLogged | null) => JustLogged | null)): void {
  const value = typeof next === 'function' ? next(current) : next;
  if (value === current) return;
  current = value;
  for (const listener of listeners) listener();
}
