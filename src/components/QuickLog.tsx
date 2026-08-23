'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useJustLogged } from '@/components/Queue';
import { SourceChip } from '@/components/SourceChip';
import { ChevronIcon, CloseIcon, MinusIcon, PlusIcon, UndoIcon, WarnIcon } from '@/components/icons';
import { valueLabel } from '@/lib/display';
import { daysBetween, longDate, shortDate, time24 } from '@/lib/format';
import { type JustLogged, setJustLogged } from '@/lib/just-logged';
import type { LogSnapshot, MeasurementView } from '@/lib/measurement-view';
import { carryTheCaughtObject, messageOf } from '@/lib/platform-cause';
import {
  connectivityProved,
  depth,
  discard,
  enqueue,
  flushOutbox,
  rememberCsrfToken,
  startFlushTriggers,
  stillQueued,
  subscribe,
} from '@/lib/outbox';
import { RATING_MAX, RATING_MIN } from '@/lib/provenance';
import { strings } from '@/lib/strings';
import { validateValue } from '@/lib/value-refusal';

/**
 * The quick log, screen 03. Raised from Today, one thumb, no keyboard unless
 * the note is wanted.
 *
 * Read the save path once and the whole design is there: it applies the values
 * locally, it puts one entry in the outbox keyed by a client UUID, and it kicks
 * the flusher. Always, in that order, with no test of whether the phone can
 * reach the Mac mini. **There is no online branch in this component.** A
 * basement gym with a captive wifi portal is not a different mode, it is the
 * same code taking slightly longer, and that is the only version of an offline
 * path that stays correct because it is the version that runs every time.
 *
 * The six card states from screen 00 are all reachable here and all real:
 * loading while the snapshot is in flight, empty when there has never been a
 * waist measurement, error when the read failed, stale when the last one is
 * days old, offline when the queue is not empty, loaded otherwise. Geometry
 * does not move between them.
 */

type Ratings = Record<'energy' | 'fatigue' | 'hunger' | 'satiety', number | null>;

const RATING_FIELDS = [
  { metric: 'energy', label: strings.quickLog.energy, low: strings.quickLog.energyLow, high: strings.quickLog.energyHigh },
  { metric: 'fatigue', label: strings.quickLog.fatigue, low: strings.quickLog.fatigueLow, high: strings.quickLog.fatigueHigh },
  { metric: 'hunger', label: strings.quickLog.hunger, low: strings.quickLog.hungerLow, high: strings.quickLog.hungerHigh },
  { metric: 'satiety', label: strings.quickLog.satiety, low: strings.quickLog.satietyLow, high: strings.quickLog.satietyHigh },
] as const;

/**
 * The one request this screen reads its snapshot from. Written once, because
 * the error card names it back to the checker that reads the screen, and a
 * marker naming a request the component does not call is a marker that means
 * nothing.
 */
const LOG_ENDPOINT = '/api/log';

/**
 * The one signal that raises this sheet from somewhere else on Today.
 *
 * Screen 02 puts a Measure control on the waist card, and the waist field lives
 * inside this sheet. A window event rather than a context or a lifted state:
 * the sheet is one client island on an otherwise server-rendered screen, and a
 * provider wrapped around Today would pull the whole page across the boundary
 * to carry one boolean.
 */
export const QUICK_LOG_OPEN = 'vernier:quick-log';

/**
 * A control anywhere on Today that raises the quick log. It carries no state of
 * its own and decides nothing: it says the owner asked, and the sheet answers.
 */
export function QuickLogTrigger({ label, className = 'btn' }: { label: string; className?: string }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => window.dispatchEvent(new Event(QUICK_LOG_OPEN))}
    >
      {label}
    </button>
  );
}

const SCALE = [1, 2, 3, 4, 5];
const WAIST_STEP = 0.5;

/** Days after which the waist reading on file is old enough to say so. */
const WAIST_STALE_DAYS = 3;

/**
 * The waist field's text, tidied without being rewritten.
 *
 * A comma is a decimal point, which this field has always accepted and which
 * the owner's phone offers on its numeric keypad. Nothing else is touched: the
 * text goes to the store as it was typed, because rounding a tape reading on
 * the way into a table that refuses DELETE throws away a digit no correction
 * can get back.
 */
function cleanWaist(typed: string): string {
  return typed.replace(',', '.').trim();
}

/**
 * The number in the waist field, or null while what is in it is not one yet.
 *
 * Null covers three different states and all three behave the same way here:
 * nothing typed, a half-typed number like `9.`, and a word. The stepper has
 * nothing to move in any of them, and Save says which it is, in words, from the
 * same rule the route applies.
 */
function waistReading(typed: string): number | null {
  const raw = cleanWaist(typed);
  if (raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/**
 * Who wrote the cause the error card prints, and what happened to make them
 * write it.
 *
 * `vernier` is a catalogued string: a refusal the route sent, or the status
 * line this component builds from a key. `platform` is the browser's own words,
 * handed over by a fetch that never reached the machine, in a wording and a
 * locale this product does not control and cannot catalogue.
 *
 * It is carried in state and written into the markup because provenance is
 * knowable exactly here, at the branch that produced the string, and nowhere
 * downstream. A check that reads the screen cannot tell the two apart by
 * looking at the words, and one that guesses from position excuses whatever
 * lands in the slot, which is how an inline string shipped three times.
 *
 * AND THE PLATFORM BRANCH CARRIES THE OBJECT, NOT THE WORDS. Every version of
 * this that compared text was beaten by text: a marker plus a word list fell to
 * a branch that echoed the browser's own wording, and a marker plus a named
 * request fell to that same wording assembled from four pieces at run time,
 * which printed on the card words Chrome does not say. So the catch block keeps the caught object, the markup
 * carries that object to the node with `carryTheCaughtObject`, and the message
 * is read off it at render. The check then asks the page whether that object is
 * one the browser itself rejected a fetch with, by identity, and nothing the
 * product can compose satisfies that.
 */
type Cause =
  | { detail: string; authored: 'vernier' }
  | { caught: unknown; authored: 'platform' };

type Load =
  | { state: 'loading' }
  | { state: 'ready'; snapshot: LogSnapshot }
  | ({ state: 'error' } & Cause);

/**
 * The rows a just-logged entry draws, and where it draws them.
 *
 * `.forge/AMENDMENTS.md` A6 settles this, because two approved sheets drew the
 * same moment differently and a builder may not improvise taste. Screen 02
 * frame 3 is authoritative for placement: rows in the day card, not a card of
 * its own. Screen 03 frame 2 is authoritative for contents: the entry, its local
 * time, its `Queued` chip, and Undo and Edit for as long as it sits in the
 * queue.
 *
 * AND THE DAY CARD DOES NOT GROW WITH WHAT WAS LOGGED, WHICH IS THE AMENDED F27.
 *
 * A write changes a row, it does not append one. The entry takes the place of
 * the plan's meals and needs-logging rows, exactly as `02-today.html` frame 3
 * draws it, so the day card's maximum is a constant. The build this replaces
 * drew one row per value inside a card inside the day card: six values took the
 * day card from 223 px to 681 px and the weight trend to 1147 px against a
 * 715 px fold.
 *
 * ONE WRITE IS ONE ROW, WHICH IS A6'S OWN SENTENCE AND ALSO THE ARITHMETIC.
 * `02-today.html` frame 3 draws two rows because it draws two writes, a waist at
 * 18:32 and two feelings at 18:33, each with its own time and its own chip. Six
 * values typed into one sheet and saved once are one write at one moment, so
 * they are one row: the values on the head, the moment and the place on the sub,
 * the chip on the end.
 *
 * The head is clamped to two lines in the stylesheet, which is what makes the
 * row a constant: 80 px with everything filled in, less with less, never more,
 * whatever the owner types into the note. The trend does not move when he
 * writes a paragraph.
 */
function entryLine(entry: JustLogged, timeZone: string): { head: string; sub: string } {
  const values = new Map(entry.values.map((value) => [value.metric, value]));
  const parts: string[] = [];

  const waist = values.get('waist');
  if (waist) {
    const label = valueLabel({ value: null, rawValue: waist.rawValue, unit: waist.unit });
    parts.push(strings.todayLog.entryPart(strings.quickLog.waist, `${label.number} ${label.unit}`));
  }

  // The four feelings, the first named in full and the rest running on, exactly
  // as screen 03 frame 2 sets them: "Energy 4, fatigue 2, hunger 3, satiety 4".
  for (const [index, field] of RATING_FIELDS.filter((one) => values.has(one.metric)).entries()) {
    parts.push(
      strings.todayLog.entryPart(
        index === 0 && parts.length === 0
          ? strings.todayLog.feelingName[field.metric]
          : strings.todayLog.feelingRunOn[field.metric],
        values.get(field.metric)!.rawValue,
      ),
    );
  }

  // The note last, in the owner's own words rather than under a label, because
  // the label would cost a line and say nothing the words do not.
  const note = values.get('note');
  if (note) parts.push(note.rawValue);

  return {
    head: strings.todayLog.entryLine(parts),
    sub:
      entry.state === 'queued'
        ? strings.todayLog.entrySavedQueued(time24(entry.at, timeZone))
        : strings.todayLog.entrySaved(time24(entry.at, timeZone)),
  };
}

export function QuickLog({
  csrfToken,
  timeZone,
  children,
}: {
  csrfToken: string;
  timeZone: string;
  /**
   * The day card's own rows, server-rendered and handed in.
   *
   * They are passed rather than imported because a just-logged entry takes
   * their place, per screen 02 frame 3, and the state that decides lives on this
   * side of the client boundary. Nothing about Today crosses that boundary to
   * carry it: these arrive already rendered.
   */
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [queued, setQueued] = useState(0);
  /**
   * WHAT IS IN THE WAIST FIELD IS WHAT THE OWNER TYPED, CHARACTER FOR CHARACTER.
   *
   * It used to be a number and the field was controlled on `waist.toFixed(1)`,
   * so every keystroke went out through `Number()` and came back reformatted
   * with the caret pushed to the end of the new string: `9` re-rendered as
   * `9.0`, the next `9` landed in the tenths, and typing `99.0` gave `9.1` in
   * Chrome and in WebKit alike. The client band then refused it under 30 cm,
   * correctly, and both stepper hands are disabled while there is nothing to
   * step from, so on an install with no waist ever measured there was no way in
   * at all. Withings sends a weight and never a waist: this field is the only
   * door that metric has, forever.
   *
   * So the state is the text, nothing rewrites it between keystrokes, and the
   * number is derived where a number is wanted.
   */
  const [waist, setWaist] = useState('');
  const [ratings, setRatings] = useState<Ratings>({ energy: null, fatigue: null, hunger: null, satiety: null });
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const justLogged = useJustLogged();
  const [refused, setRefused] = useState<string[] | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  /** The number in the field, and the one thing that decides what it can do. */
  const waistTyped = waistReading(waist);

  /**
   * Has the owner put this number there himself, since the sheet was raised.
   *
   * The snapshot read fills the field with the last stored measurement when it
   * lands, and it landed on top of typing: with the read in flight, 91.4 typed
   * into the field became 98.5 the moment the answer arrived, in both engines,
   * with the loading skeleton drawn beside a live editable field so nothing on
   * screen warned. `03-quick-log.html` frame 2 captions itself "No spinner, no
   * retry loop, no lost typing", and the third of those is this flag: what the
   * owner put in the field outranks anything the network has to say about it.
   *
   * A ref rather than state because nothing renders from it, and it must be
   * readable by a promise that resolves after the keystroke it has to lose to.
   */
  const ownersOwn = useRef(false);

  /** Every path that puts a number in the field on the owner's behalf. */
  function takeWaist(next: string) {
    ownersOwn.current = true;
    setWaist(next);
  }

  /**
   * The stepper moves the number that is in the field, and there is no other
   * number it could move: it is a relative control, half a centimetre at a
   * time, and half a centimetre from nothing is nothing. Both hands are
   * disabled while the field holds no number, so this returning early is the
   * belt beside that brace rather than a second rule.
   */
  function stepWaist(by: number) {
    if (waistTyped === null) return;
    takeWaist((waistTyped + by).toFixed(1));
  }

  // The token the server rendered, kept where the flusher and the push-woken
  // worker can both reach it at send time.
  useEffect(() => {
    void rememberCsrfToken(csrfToken);
  }, [csrfToken]);

  useEffect(() => {
    const stop = startFlushTriggers();
    const refresh = () => {
      void depth().then(setQueued);
      // The just-logged rows follow the queue rather than a timer. The moment
      // the entry leaves, Undo goes with it, because from then on the only
      // reversal is a correction.
      //
      // `stillQueued` and not `pending`: a request in the air has not landed,
      // and the row used to read Stored for as long as the send took, which on
      // the wifi this queue exists for is up to ten seconds. Where the write IS
      // and whether it can be undone are two questions.
      setJustLogged((current) => {
        if (!current || current.state !== 'queued') return current;
        void stillQueued(current.entryId).then((still) => {
          if (!still) {
            setJustLogged((latest) =>
              latest && latest.entryId === current.entryId && latest.state === 'queued'
                ? { ...latest, state: 'applied' }
                : latest,
            );
          }
        });
        return current;
      });
    };
    const unsubscribe = subscribe(refresh);
    refresh();
    return () => {
      unsubscribe();
      stop();
    };
  }, []);

  const read = useCallback(async () => {
    setLoad({ state: 'loading' });
    setRefused(null);
    try {
      const response = await fetch(LOG_ENDPOINT, { headers: { accept: 'application/json' } });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { detail?: string; error?: string };
        // Every branch here is Vernier's copy. The first two are refusals the
        // route sent, each one a catalogue key on its way through JSON. The
        // third is the case where the answer carried no words at all, and it is
        // a key too now: it used to be `HTTP ${status} at ${time}.` written
        // straight into this line.
        setLoad({
          state: 'error',
          detail:
            body.detail ??
            body.error ??
            strings.quickLog.errorStatus(response.status, time24(new Date(), timeZone)),
          authored: 'vernier',
        });
        return;
      }
      const snapshot = (await response.json()) as LogSnapshot;
      setLoad({ state: 'ready', snapshot });
      // The last measurement is a starting point for the stepper, not a
      // correction of the owner. If he has typed since the sheet was raised,
      // the answer that arrives second loses, however much later it lands.
      const stored = snapshot.lastWaist?.value ?? null;
      if (!ownersOwn.current) setWaist(stored === null ? '' : stored.toFixed(1));
      // Trigger 5: a request of the app's own just succeeded, so the queue has
      // a proven route home.
      connectivityProved();
    } catch (error) {
      // The fetch never reached the machine, so the cause is the browser's, not
      // Vernier's. No key exists for it and none can be written: the wording and
      // the locale belong to WebKit. What goes into state is the object itself
      // rather than a copy of its message, so the branch that knows hands the
      // markup a thing a checker can identify instead of a claim it has to
      // believe.
      setLoad({ state: 'error', caught: error, authored: 'platform' });
    }
  }, [timeZone]);

  useEffect(() => {
    // The rule is right in general and wrong here. read() sets the loading
    // state on its first line, synchronously, and that is the point: the sheet
    // paints its skeleton the instant it is raised rather than a frame after
    // the fetch resolves. C5 holds a capture of that state. One extra render
    // per raise is what it costs.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) void read();
  }, [open, read]);

  // Raised from the waist card, which is screen 02's Measure control. A fresh
  // raise is the one moment the field holds nothing of the owner's, so this is
  // where the snapshot gets its right to fill it back.
  useEffect(() => {
    const raise = () => {
      ownersOwn.current = false;
      setOpen(true);
    };
    window.addEventListener(QUICK_LOG_OPEN, raise);
    return () => window.removeEventListener(QUICK_LOG_OPEN, raise);
  }, []);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  function filledValues() {
    const values: Array<{ id: string; metric: string; rawValue: string; unit: string }> = [];
    // The text, not a rounding of it, and anything non-blank goes through.
    // A field holding something that is not a number is a question the owner
    // gets an answer to: `validateValue` refuses it below, in words, rather
    // than the sheet quietly saving five values out of six.
    const typedWaist = cleanWaist(waist);
    if (typedWaist !== '') {
      values.push({ id: crypto.randomUUID(), metric: 'waist', rawValue: typedWaist, unit: 'cm' });
    }
    for (const field of RATING_FIELDS) {
      const value = ratings[field.metric];
      if (value !== null) {
        values.push({ id: crypto.randomUUID(), metric: field.metric, rawValue: String(value), unit: 'point' });
      }
    }
    if (note.trim() !== '') {
      values.push({ id: crypto.randomUUID(), metric: 'note', rawValue: note.trim(), unit: 'text' });
    }
    return values;
  }

  /**
   * Apply, enqueue, kick. No branch, no probe, no spinner that waits on a
   * network. The sheet closes because the write is committed on this phone the
   * moment the entry is in IndexedDB.
   */
  async function save() {
    const values = filledValues();
    if (values.length === 0) return;

    /*
     * The queue accepts nothing the server is certain to refuse.
     *
     * This path commits to the phone and uploads later, so an entry it accepts
     * is reported to the owner as safe the instant he taps Save. With the origin
     * unreachable the snapshot read fails, the waist stepper had no base, and
     * one tap on the plus control queued 0.5 cm: the just-logged card then read
     * "Waist 0.5 cm, Queued" beside "Still on this phone" for a value the band
     * in provenance.ts refuses at 30 cm. The data was safe and the message was
     * not. So the same rule the route applies is applied here, from the same
     * function, before anything is put in the queue or claimed to be saved.
     *
     * It refuses rather than blocks: no network is asked, no spinner runs, the
     * sheet stays open on what was typed, and every reason is on the screen.
     */
    const refusals = values.flatMap((value) => {
      const checked = validateValue(value);
      return checked.ok ? [] : [checked.detail];
    });
    if (refusals.length > 0) {
      setRefused(refusals);
      return;
    }
    setRefused(null);

    setSaving(true);
    try {
      const entryId = crypto.randomUUID();
      // One instant, used twice: the rows in the day card print the time the
      // owner typed it, and the queue sends that same time, not the time the
      // upload happened to land.
      const measuredAt = new Date();
      setJustLogged({ entryId, at: measuredAt, values, state: 'queued' });
      await enqueue({
        id: entryId,
        url: '/api/log',
        body: {
          measuredAt: measuredAt.toISOString(),
          timeZone,
          values: values.map(({ id, metric, rawValue }) => ({ id, metric, rawValue })),
        },
      });
      setRatings({ energy: null, fatigue: null, hunger: null, satiety: null });
      setNote('');
      // Written and gone. Whatever is in the field belongs to the entry that
      // just left, so the next raise takes its number from the snapshot again.
      ownersOwn.current = false;
      setOpen(false);
      // Step three of the three, and it is not a wait: the sheet has already
      // closed and the value is already committed on this phone. If the Mac
      // mini is there the queue drains now, and if it is not, one of the other
      // five triggers will do it later.
      void flushOutbox({ force: true });
    } finally {
      setSaving(false);
    }
  }

  /**
   * Undo, and it removes rather than corrects, because at this point there is
   * nothing on the Mac mini to correct. If the entry has already gone the card
   * says so instead of pretending: a reversal that quietly did nothing is worse
   * than a reversal that was refused.
   */
  async function undo(entry: JustLogged) {
    const dropped = await discard(entry.entryId);
    setJustLogged({ ...entry, state: dropped ? 'undone' : 'tooLate' });
  }

  /**
   * Edit, which is the same reversal followed by the sheet reopening on what
   * was typed. It only exists while the write is still queued, for the same
   * reason Undo does.
   */
  async function edit(entry: JustLogged) {
    const dropped = await discard(entry.entryId);
    if (!dropped) {
      setJustLogged({ ...entry, state: 'tooLate' });
      return;
    }
    const nextRatings: Ratings = { energy: null, fatigue: null, hunger: null, satiety: null };
    let nextWaist = '';
    let nextNote = '';
    for (const value of entry.values) {
      if (value.metric === 'waist') nextWaist = value.rawValue;
      else if (value.metric === 'note') nextNote = value.rawValue;
      else if (value.metric in nextRatings) {
        nextRatings[value.metric as keyof Ratings] = Number(value.rawValue);
      }
    }
    // Through `takeWaist`, because reopening the sheet starts a snapshot read
    // and what is being restored is the owner's own number: the read that lands
    // a moment later must not put the stored measurement back over it.
    takeWaist(nextWaist);
    setRatings(nextRatings);
    setNote(nextNote);
    setJustLogged(null);
    setOpen(true);
  }

  const now = new Date();
  const lastWaist = load.state === 'ready' ? load.snapshot.lastWaist : null;
  const staleDays = lastWaist ? daysBetween(new Date(lastWaist.measuredAt), now, timeZone) : null;
  /*
   * NOTHING TO COUNT UP OR DOWN FROM, AND SO NOTHING IS COUNTED.
   *
   * The stepper is a relative control: it moves the last measurement by half a
   * centimetre. With no last measurement it has nothing to move, and it used to
   * move zero, which is the defect three lines were open on. One tap queued a
   * waist of 0.5 cm and the screen reported it as saved, for a value
   * `src/lib/provenance.ts` refuses under 30 cm. On the owner's own first-ever
   * waist it was worse than wrong, it was unusable: sixty taps to the floor of
   * the stored band and a hundred and ninety-seven to 99.0, against F23's six.
   *
   * So the number is typed when there is none, exactly as `03-quick-log.html`
   * frame 3 draws it: the value reads `--`, muted, not a number and specifically
   * not zero, and the field takes the first one. The buttons step it from there.
   * Blank stays blank: an empty field is not sent and is never stored as zero.
   *
   * Both hands of the stepper are therefore disabled while the field is empty,
   * whatever the reason it is empty, because half a centimetre from nothing is
   * nothing in both directions.
   */
  const nothingToStepFrom = waistTyped === null;
  /** The read failed or is still in flight, which is a different sentence. */
  const noBaseToStepFrom = waistTyped === null && load.state !== 'ready';
  const written = justLogged ? entryLine(justLogged, timeZone) : null;

  return (
    <>
      {/*
        * The plan's own rows, or the entry that just replaced them. Screen 02
        * frame 3 draws the second: the day card carries the session and then
        * what was written, with no meals row and no needs-logging row, because
        * a write answers the question those two rows were asking.
        */}
      {justLogged && written ? (
        <div data-just-logged={justLogged.state} aria-live="polite">
          {/*
            * `.lines` rather than `.stack`, and the reason is the clamp. A flex
            * item's display is blockified, so `-webkit-box` on a child of
            * `.stack` comes out as `flow-root` and the two-line clamp on the
            * head silently becomes one. That was measurable: the whole entry
            * rendered on one line and the values after the first two were gone.
            */}
          <div className="row entry" data-entry="written">
            <div className="lines grow">
              <span className="head">{written.head}</span>
              <span className="sub num">{written.sub}</span>
            </div>
            {/*
              * The chip is the row's own truth and never a guess at the queue's.
              * Queued while it is on this phone, Stored once the Mac mini has
              * it, Removed when Undo took it back, because "Stored" on a write
              * that was never stored is the kind of small lie that makes every
              * other label unreadable.
              */}
            <span className="chip">
              {justLogged.state === 'queued'
                ? strings.todayLog.queued
                : justLogged.state === 'undone'
                  ? strings.todayLog.removed
                  : strings.todayLog.stored}
            </span>
          </div>

          {/*
            * Screen 03 frame 2's pair, and which of them is drawn is the
            * whole point. Queued means the write is on this phone and
            * nowhere else, so Undo is a deletion and it is true. Applied
            * means the Mac mini has it, the table refuses DELETE, and the
            * only reversal left is a correction, so the button changes its
            * word rather than its behaviour.
            */}
          {justLogged.state === 'queued' ? (
            <div className="actions">
              <button type="button" className="btn grow" onClick={() => void undo(justLogged)}>
                <UndoIcon />
                {strings.todayLog.undo}
              </button>
              <button type="button" className="btn grow" onClick={() => void edit(justLogged)}>
                {strings.todayLog.edit}
              </button>
            </div>
          ) : null}

          {justLogged.state === 'applied' || justLogged.state === 'tooLate' ? (
            <div className="actions">
              <Link prefetch={false} className="btn grow" href={`/value/${justLogged.values[0].id}`}>
                {strings.todayLog.correct}
                <ChevronIcon className="ch" />
              </Link>
            </div>
          ) : null}

          {/*
            * AND NO PARAGRAPH. Queued, Stored and Removed are each one word on
            * the row's own chip, and Undo, Edit and Correct it are the controls
            * that go with them: a sentence repeating any of that would be spent
            * out of F27's 715 px, which is a budget every line above the weight
            * trend draws on. A refused Undo answers by changing both at once,
            * from Queued and Undo to Stored and Correct it, which is the same
            * fact told in the place the owner is already looking.
            */}
        </div>
      ) : (
        children
      )}

      <button type="button" className="btn primary block" onClick={() => setOpen(true)}>
        <PlusIcon />
        {strings.quickLog.open}
      </button>

      {/*
        * THE SHEET IS RAISED FROM TODAY AND IT DOES NOT LIVE THERE.
        *
        * This component is mounted inside `section.card.day`, because the day
        * card's own rows are its children and a write replaces them. The sheet
        * used to be rendered in place, so its ancestry read
        * `div.sheet < section.card.day < div.today`, and every Today-scoped rule
        * in globals.css reached inside screen 03. Three of them did, measured
        * identically in Chrome and WebKit at 393, 768 and 1280:
        *
        *   .card.day .actions      put the error card's action row 8 px under
        *                           its sub, where 00-patterns.html draws 12
        *   .card.day .actions .btn took Try again back down to 44 px, losing the
        *                           52 px escalation `.sheet .btn` gives it
        *   .card.day .btn.primary  put Save 27 px below the foot divider, where
        *                           03-quick-log.html draws 12 and no margin
        *
        * That is defect 52's mechanism, un-fixed, resurfacing at three new
        * properties. Scoping those three rules would have closed those three
        * properties and left the door open: slices 5 to 9 are adding to Today
        * right now, and every rule they add to `.card.day` would reach in here
        * the same way. So the door is closed instead of the three holes.
        *
        * A portal and not a hoist, because the day card's rows have to stay
        * inside the card that draws them and this component owns both. The sheet
        * is `position:fixed` over the viewport in both places, so nothing about
        * its own geometry moves; what moves is what can reach it, which is now
        * only the rules that name it. C4 is ticked against the day card, and the
        * day card renders exactly what it rendered before.
        *
        * React keeps the tree, so state, context, events and focus all behave as
        * they did. `document` is only touched inside this branch, which needs a
        * click to open and therefore never runs on the server.
        */}
      {open
        ? createPortal(
            <>
              <button
                type="button"
                className="scrim"
                aria-label={strings.quickLog.close}
                onClick={() => setOpen(false)}
              />
              <div className="sheet" role="dialog" aria-modal="true" aria-label={strings.quickLog.title}>
                <div className="grabber" />
                <div className="between sheet-head">
                  <div className="stack">
                    <span className="title-line">{strings.quickLog.title}</span>
                    <span className="note num">
                      {load.state === 'ready' && load.snapshot.lastWaist === null
                        ? strings.quickLog.firstTime
                        : `${longDate(now, timeZone)}, ${time24(now, timeZone)}`}
                    </span>
                  </div>
                  <button
                    ref={closeRef}
                    type="button"
                    className="btn icon"
                    aria-label={strings.quickLog.close}
                    onClick={() => setOpen(false)}
                  >
                    <CloseIcon />
                  </button>
                </div>

                <div className="sheetbody">
                  {/*
                    * Offline is not a mode here, it is a count. The banner reports
                    * what is still in the queue and nothing about it changes what
                    * Save does.
                    */}
                  {queued > 0 ? (
                    <div className="banner" data-state="offline">
                      <WarnIcon />
                      <div className="grow">
                        <b>{strings.quickLog.offlineTitle}</b> {strings.quickLog.offlineBody(queued)}
                      </div>
                    </div>
                  ) : null}

                  {/*
                    * A write the queue would not take, and the reason the server
                    * would have given. Nothing was put on this phone and nothing
                    * was sent, which is what the card says: the alternative was
                    * telling the owner an entry was safe when the flush was
                    * certain to refuse it.
                    */}
                  {refused ? (
                    <div className="card error" data-state="refused">
                      <div className="head" style={{ marginTop: 0 }}>
                        {strings.quickLog.refusedTitle}
                      </div>
                      {refused.map((reason) => (
                        <p className="sub" key={reason}>
                          {reason}
                        </p>
                      ))}
                      <p className="sub">{strings.quickLog.refusedBody}</p>
                    </div>
                  ) : null}

                  {load.state === 'loading' ? (
                    <div className="card" data-state="loading" aria-busy="true" aria-label={strings.quickLog.loadingLabel}>
                      <div className="between">
                        <span className="lbl">{strings.quickLog.waist}</span>
                        <span className="skel" style={{ width: '74px', height: '22px', borderRadius: '6px' }} />
                      </div>
                      <span className="skel" style={{ width: '186px', height: '34px', margin: '8px 0' }} />
                      <span className="skel" style={{ width: '250px', height: '13px' }} />
                    </div>
                  ) : null}

                  {load.state === 'error' ? (
                    <div className="card error" data-state="error">
                      <div className="between">
                        <span className="lbl">{strings.quickLog.waist}</span>
                        <span className="chip a">{strings.error.title}</span>
                      </div>
                      <div className="head">{strings.quickLog.errorTitle}</div>
                      <p className="sub">
                        {load.authored === 'platform' ? (
                          <span data-authored="platform" ref={carryTheCaughtObject(load.caught)}>
                            {messageOf(load.caught)}
                          </span>
                        ) : (
                          <span data-authored="vernier">{load.detail}</span>
                        )}{' '}
                        {strings.quickLog.errorBody}
                      </p>
                      <div className="actions">
                        <button type="button" className="btn grow" onClick={() => void read()}>
                          {strings.common.retry}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {load.state === 'ready' && load.snapshot.lastWaist === null ? (
                    <div className="card empty" data-state="empty">
                      <div className="head" style={{ marginTop: 0 }}>
                        {strings.quickLog.waistEmptyTitle}
                      </div>
                      <p className="sub">{strings.quickLog.waistEmptyBody}</p>
                    </div>
                  ) : null}

                  {load.state === 'ready' && lastWaist && staleDays !== null && staleDays >= WAIST_STALE_DAYS ? (
                    <div className="card" data-state="stale">
                      <div className="between">
                        <span className="lbl">{strings.quickLog.waist}</span>
                        <SourceChip source={lastWaist.source} confidence={lastWaist.confidence} staleDays={staleDays} />
                      </div>
                      <div className="head">{strings.quickLog.staleTitle(staleDays)}</div>
                      <p className="sub">{strings.quickLog.staleBody}</p>
                    </div>
                  ) : null}

                  <div className="field-block">
                    <div className="between" style={{ marginBottom: 'var(--s2)' }}>
                      <span className="lbl">{strings.quickLog.waist}</span>
                      {lastWaist ? (
                        <span className="note num">
                          {strings.quickLog.waistLastPrefix} {valueLabel(lastWaist).number}{' '}
                          {valueLabel(lastWaist).unit}, {shortDate(new Date(lastWaist.measuredAt), timeZone)}
                        </span>
                      ) : null}
                    </div>
                    <div className="stepper">
                      <button
                        type="button"
                        aria-label={strings.quickLog.waistDown}
                        onClick={() => stepWaist(-WAIST_STEP)}
                        disabled={nothingToStepFrom}
                      >
                        <MinusIcon />
                      </button>
                      {/*
                        * The value, and it is a field. Screen 03 frame 3 draws it as
                        * the muted `--` on a first-ever waist, which is the state
                        * the stepper alone cannot answer: it is relative, and there
                        * is nothing to be relative to. So the first number is typed
                        * and every one after it is stepped, which is F23's six taps
                        * on both paths. The field carries no value attribute when it
                        * is empty, so `--` is a placeholder and not a number.
                        */}
                      <div className="grow centre">
                        <label className="visually-hidden" htmlFor="quick-log-waist">
                          {strings.quickLog.waistFieldLabel}
                        </label>
                        <input
                          id="quick-log-waist"
                          className={nothingToStepFrom ? 'metric mut waistfield' : 'metric waistfield'}
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder={strings.quickLog.waistBlank}
                          /*
                           * The text, straight back out, and nothing in between.
                           * Every version of this that reformatted the value on the
                           * way through moved the caret with it, and a field that
                           * moves the caret cannot be typed into: `99.0` arrived as
                           * `9.1`. Tidying and parsing happen at Save, where the
                           * owner has stopped typing.
                           */
                          value={waist}
                          onChange={(event) => takeWaist(event.target.value)}
                        />{' '}
                        <span className="sub">{strings.units.cm}</span>
                      </div>
                      <button
                        type="button"
                        aria-label={strings.quickLog.waistUp}
                        disabled={nothingToStepFrom}
                        onClick={() => stepWaist(WAIST_STEP)}
                      >
                        <PlusIcon />
                      </button>
                    </div>
                    {/*
                      * Two different sentences for two different absences, and the
                      * difference is whether the app knows. Frame 3's first-ever
                      * waist is a fact: there has never been one, so type it. A read
                      * that failed is an unknown: the last one may exist and this
                      * phone cannot see it, and that is worth saying out loud.
                      */}
                    {noBaseToStepFrom ? (
                      <p className="note warn" data-waist="no-base">
                        {strings.quickLog.waistNoBase}
                      </p>
                    ) : nothingToStepFrom ? (
                      <p className="note" data-waist="type-it">
                        {strings.quickLog.waistTypeIt}
                      </p>
                    ) : null}
                  </div>

                  {RATING_FIELDS.map((field) => (
                    <div className="field-block" key={field.metric}>
                      <span className="lbl">{field.label}</span>
                      <div className="scale5" role="group" aria-label={field.label}>
                        {SCALE.map((point) => (
                          <button
                            key={point}
                            type="button"
                            aria-pressed={ratings[field.metric] === point}
                            aria-label={strings.quickLog.ratingLabel(field.label, point, RATING_MAX)}
                            onClick={() =>
                              setRatings((current) => ({
                                ...current,
                                [field.metric]: current[field.metric] === point ? null : point,
                              }))
                            }
                          >
                            {point}
                          </button>
                        ))}
                      </div>
                      <div className="anchors">
                        <span>{field.low}</span>
                        <span>{field.high}</span>
                      </div>
                    </div>
                  ))}

                  <div className="field-block">
                    <label className="lbl" htmlFor="quick-log-note">
                      {strings.quickLog.note}
                    </label>
                    <textarea
                      id="quick-log-note"
                      className="ta"
                      placeholder={strings.quickLog.notePlaceholder}
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                    />
                  </div>
                </div>

                <div className="sheetfoot">
                  <button
                    type="button"
                    className="btn primary block"
                    onClick={() => void save()}
                    disabled={saving}
                  >
                    {saving ? strings.quickLog.saving : strings.quickLog.save}
                  </button>
                  <p className="note centre" style={{ marginTop: 'var(--s2)' }}>
                    {load.state === 'ready' && load.snapshot.lastWaist === null
                      ? strings.quickLog.blankNote
                      : strings.quickLog.savedNote}
                  </p>
                </div>
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}

/** Named for the tests, which count taps against the rating range this renders. */
export const RATING_RANGE = { min: RATING_MIN, max: RATING_MAX };

export type { MeasurementView };
