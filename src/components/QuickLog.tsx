'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { SourceChip } from '@/components/SourceChip';
import { ChevronIcon, CloseIcon, MinusIcon, PlusIcon, UndoIcon, WarnIcon } from '@/components/icons';
import { metricLabel, valueLabel } from '@/lib/display';
import { daysBetween, longDate, shortDate, time24 } from '@/lib/format';
import type { LogSnapshot, MeasurementView } from '@/lib/measurement-view';
import {
  connectivityProved,
  depth,
  discard,
  enqueue,
  flushOutbox,
  pending,
  rememberCsrfToken,
  startFlushTriggers,
  subscribe,
} from '@/lib/outbox';
import { RATING_MAX, RATING_MIN } from '@/lib/provenance';
import { strings } from '@/lib/strings';

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

const SCALE = [1, 2, 3, 4, 5];
const WAIST_STEP = 0.5;

/** Days after which the waist reading on file is old enough to say so. */
const WAIST_STALE_DAYS = 3;

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
 * AND THE PLATFORM CLAIM NAMES ITS REQUEST. `data-authored="platform"` alone is
 * a claim about a string, and a claim about a string is answered by echoing a
 * string: `('L' + 'oad failed')` marked platform was excused in a 502 state
 * where the browser had said nothing at all, because the check only asked
 * whether the words matched something WebKit says somewhere. So the marker
 * carries the request whose rejection produced it, the checker asks the browser
 * whether that request really was rejected in that state, and a branch where
 * the machine answered has nothing to point at.
 */
type Cause =
  | { detail: string; authored: 'vernier' }
  | { detail: string; authored: 'platform'; rejected: string };

type Load =
  | { state: 'loading' }
  | { state: 'ready'; snapshot: LogSnapshot }
  | ({ state: 'error' } & Cause);

type LoggedValue = { id: string; metric: string; rawValue: string; unit: string };

/**
 * What just happened, and which reversal is honest for it.
 *
 * `queued` while the entry is still in the outbox: the write exists on this
 * phone and nowhere else, so Undo really does remove it and Edit really does
 * reopen the sheet holding what was typed. `applied` once it has uploaded: the
 * table refuses DELETE, so the only reversal left is a correction and the
 * button says so. `undone` and `tooLate` are what the two paths report.
 *
 * The screen never shows Undo for a write it cannot undo. Screen 03 frame 2
 * draws the pair and annotates them "undoable for as long as it sits in the
 * queue", and this is that clause rather than a button that lies after a
 * second and a half.
 */
type JustLogged = {
  entryId: string;
  values: LoggedValue[];
  state: 'queued' | 'applied' | 'undone' | 'tooLate';
};

export function QuickLog({ csrfToken, timeZone }: { csrfToken: string; timeZone: string }) {
  const [open, setOpen] = useState(false);
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [queued, setQueued] = useState(0);
  const [waist, setWaist] = useState<number | null>(null);
  const [ratings, setRatings] = useState<Ratings>({ energy: null, fatigue: null, hunger: null, satiety: null });
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [justLogged, setJustLogged] = useState<JustLogged | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // The token the server rendered, kept where the flusher and the push-woken
  // worker can both reach it at send time.
  useEffect(() => {
    void rememberCsrfToken(csrfToken);
  }, [csrfToken]);

  useEffect(() => {
    const stop = startFlushTriggers();
    const refresh = () => {
      void depth().then(setQueued);
      // The just-logged card follows the queue rather than a timer. The moment
      // the entry leaves, Undo goes with it, because from then on the only
      // reversal is a correction.
      setJustLogged((current) => {
        if (!current || current.state !== 'queued') return current;
        void pending(current.entryId).then((still) => {
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
      setWaist(snapshot.lastWaist?.value ?? null);
      // Trigger 5: a request of the app's own just succeeded, so the queue has
      // a proven route home.
      connectivityProved();
    } catch (error) {
      // The fetch never reached the machine, so this string is the browser's,
      // not Vernier's. No key exists for it and none can be written: the wording
      // and the locale belong to WebKit. It is marked at the branch that knows,
      // and it names the request that was rejected, which is the fact a checker
      // can verify against the browser rather than take on trust.
      setLoad({
        state: 'error',
        detail: (error as Error).message,
        authored: 'platform',
        rejected: LOG_ENDPOINT,
      });
    }
  }, [timeZone]);

  useEffect(() => {
    if (open) void read();
  }, [open, read]);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  function filledValues() {
    const values: Array<{ id: string; metric: string; rawValue: string; unit: string }> = [];
    if (waist !== null) {
      values.push({ id: crypto.randomUUID(), metric: 'waist', rawValue: waist.toFixed(1), unit: 'cm' });
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
    setSaving(true);
    try {
      const entryId = crypto.randomUUID();
      setJustLogged({ entryId, values, state: 'queued' });
      await enqueue({
        id: entryId,
        url: '/api/log',
        body: {
          measuredAt: new Date().toISOString(),
          timeZone,
          values: values.map(({ id, metric, rawValue }) => ({ id, metric, rawValue })),
        },
      });
      setRatings({ energy: null, fatigue: null, hunger: null, satiety: null });
      setNote('');
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
    let nextWaist: number | null = null;
    let nextNote = '';
    for (const value of entry.values) {
      if (value.metric === 'waist') nextWaist = Number(value.rawValue);
      else if (value.metric === 'note') nextNote = value.rawValue;
      else if (value.metric in nextRatings) {
        nextRatings[value.metric as keyof Ratings] = Number(value.rawValue);
      }
    }
    setWaist(nextWaist);
    setRatings(nextRatings);
    setNote(nextNote);
    setJustLogged(null);
    setOpen(true);
  }

  const now = new Date();
  const lastWaist = load.state === 'ready' ? load.snapshot.lastWaist : null;
  const staleDays = lastWaist ? daysBetween(new Date(lastWaist.measuredAt), now, timeZone) : null;

  return (
    <>
      <button type="button" className="btn primary block" onClick={() => setOpen(true)}>
        <PlusIcon />
        {strings.quickLog.open}
      </button>

      {justLogged ? (
        <>
          <section
            className="card"
            style={{ marginTop: 'var(--s3)' }}
            aria-live="polite"
            data-just-logged={justLogged.state}
          >
            <span className="lbl">{strings.todayLog.justLogged}</span>
            {justLogged.values.map((entry) => (
              <div className="row" key={entry.id}>
                <div className="stack grow">
                  <span className="head">{metricLabel(entry.metric)}</span>
                  <span className="sub num">
                    {valueLabel({ value: null, rawValue: entry.rawValue, unit: entry.unit }).number}{' '}
                    {valueLabel({ value: null, rawValue: entry.rawValue, unit: entry.unit }).unit}
                  </span>
                </div>
                {/*
                  * The chip is the row's own truth and never a guess at the
                  * queue's. Queued while it is on this phone, Stored once the
                  * Mac mini has it, Removed when Undo took it back, because
                  * "Stored" on a write that was never stored is the kind of
                  * small lie that makes every other label unreadable.
                  */}
                <span className="chip">
                  {justLogged.state === 'queued'
                    ? strings.todayLog.queued
                    : justLogged.state === 'undone'
                      ? strings.todayLog.removed
                      : strings.todayLog.stored}
                </span>
              </div>
            ))}

            {/*
              * Screen 03 frame 2's pair, and which of them is drawn is the
              * whole point. Queued means the write is on this phone and
              * nowhere else, so Undo is a deletion and it is true. Applied
              * means the Mac mini has it, the table refuses DELETE, and the
              * only reversal left is a correction, so the button changes its
              * word rather than its behaviour.
              */}
            {justLogged.state === 'queued' ? (
              <>
                <div className="actions">
                  <button type="button" className="btn grow" onClick={() => void undo(justLogged)}>
                    <UndoIcon />
                    {strings.todayLog.undo}
                  </button>
                  <button type="button" className="btn grow" onClick={() => void edit(justLogged)}>
                    {strings.todayLog.edit}
                  </button>
                </div>
                <p className="note" style={{ marginTop: 'var(--s2)' }}>
                  {strings.todayLog.undoable}
                </p>
              </>
            ) : null}

            {justLogged.state === 'applied' || justLogged.state === 'tooLate' ? (
              <>
                <div className="actions">
                  <Link className="btn grow" href={`/value/${justLogged.values[0].id}`}>
                    {strings.todayLog.correct}
                    <ChevronIcon className="ch" />
                  </Link>
                </div>
                <p className="note" style={{ marginTop: 'var(--s2)' }}>
                  {justLogged.state === 'tooLate'
                    ? strings.todayLog.undoTooLate
                    : strings.todayLog.uploaded}
                </p>
              </>
            ) : null}

            {justLogged.state === 'undone' ? (
              <p className="note" style={{ marginTop: 'var(--s2)' }}>
                {strings.todayLog.undone}
              </p>
            ) : null}
          </section>

          {/*
            * "What happens next", the dashed card screen 03 frame 2 draws under
            * the pair. It only means anything while something is still waiting,
            * so it is drawn while something is still waiting.
            */}
          {justLogged.state === 'queued' ? (
            <section className="card empty" style={{ marginTop: 'var(--s3)' }}>
              <span className="lbl">{strings.todayLog.whatHappensNextLabel}</span>
              <p className="sub" style={{ marginTop: 'var(--s2)' }}>
                {strings.todayLog.whatHappensNext}
              </p>
            </section>
          ) : null}
        </>
      ) : null}

      {open ? (
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
                    <span
                      data-authored={load.authored}
                      data-platform-request={load.authored === 'platform' ? load.rejected : undefined}
                    >
                      {load.detail}
                    </span>{' '}
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
                    onClick={() => setWaist((value) => Number((((value ?? 0) || 0) - WAIST_STEP).toFixed(1)))}
                    disabled={waist === null}
                  >
                    <MinusIcon />
                  </button>
                  <div className="grow centre">
                    <div className={waist === null ? 'metric mut' : 'metric'}>
                      {waist === null ? '--' : waist.toFixed(1)}{' '}
                      <span className="sub">{strings.units.cm}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label={strings.quickLog.waistUp}
                    onClick={() =>
                      setWaist((value) =>
                        value === null
                          ? (lastWaist?.value ?? 0) + WAIST_STEP
                          : Number((value + WAIST_STEP).toFixed(1)),
                      )
                    }
                  >
                    <PlusIcon />
                  </button>
                </div>
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
        </>
      ) : null}
    </>
  );
}

/** Named for the tests, which count taps against the rating range this renders. */
export const RATING_RANGE = { min: RATING_MIN, max: RATING_MAX };

export type { MeasurementView };
