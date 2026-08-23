'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CloseIcon, MinusIcon, MuteIcon, PlusIcon, SoundIcon, SwapIcon } from '@/components/icons';
import { alternativesFor, mediaFor, movementOf } from '@/lib/catalogue';
import { movementCue, movementName, targetLabel } from '@/lib/display';
import { shortDate } from '@/lib/format';
import { enqueue, flushOutbox, rememberCsrfToken } from '@/lib/outbox';
import {
  CUE_BEFORE_SECONDS,
  REST_STEP_SECONDS,
  type RunState,
  clockLabel,
  cueIsDue,
  elapsedMs,
  restFraction,
  restRemainingMs,
  restTotalSeconds,
} from '@/lib/session-clock';
import { strings } from '@/lib/strings';
import { CDC_MAX, CDC_MIN, PAIN_CEILING, PAIN_SCALE_MAX, RIR_MAX, RIR_MIN } from '@/lib/training-rules';

/**
 * The guided session, screen 07.
 *
 * FOUR THINGS ARE TRUE OF THIS COMPONENT AND EACH ONE IS A RUBRIC LINE.
 *
 * 1. EVERY TIME IS READ FROM THE WALL CLOCK. `session-clock.ts` holds two
 *    instants and subtracts; the interval below only forces a repaint. A phone
 *    that backgrounds the tab stops delivering ticks, and a timer built on them
 *    loses exactly as long as the call lasted while still looking right. Sixty
 *    seconds backgrounded costs nothing here because nothing was counting.
 *
 * 2. IT RUNS OFFLINE. Every write goes into the outbox with its own client
 *    UUID, which is also the Idempotency-Key and the row id, and the screen
 *    moves on without waiting. There is no online branch: the basement gym is
 *    not a mode, it is the same code taking longer.
 *
 * 3. SPEECH IS PRIMED INSIDE THE START TAP. `speak()` returns silently without
 *    a user gesture on iOS, so the first utterance goes out from the tap
 *    handler itself, before any await. Every spoken cue has a visible
 *    equivalent in the cue line, because vibration does not exist in any Safari
 *    and the ringer may be off, and muting silences the speech and leaves the
 *    text exactly where it was.
 *
 * 4. NOTHING INTERRUPTS AN OPEN SESSION. No dialog, no rating prompt, no
 *    permission prompt, no upsell, no in-app banner. There is no `alert`,
 *    `confirm`, `prompt`, `Notification.requestPermission` or `showModal` in
 *    this file, and `tests/e2e/session-player.spec.ts` drives a whole session
 *    with every dialog event recorded and asserts the recording is empty.
 */

export type PlayerLast = {
  sets: number;
  achieved: number;
  loadKg: number | null;
  rir: number | null;
  at: string;
};

export type PlayerMovement = {
  movementId: string;
  sets: number;
  target: number;
  loadKg: number | null;
  restSeconds: number;
  lastWeek: PlayerLast | null;
};

export type PlayerSession = {
  proposalId: string;
  kind: string;
  plannedFor: string;
  movements: PlayerMovement[];
  band: { label: string; low: number; high: number } | null;
};

type Phase = 'ready' | 'work' | 'rest' | 'done';

type PainSite = keyof typeof strings.player.painSites;

const PAIN_SITES = Object.keys(strings.player.painSites) as PainSite[];
const SITE_LABELS = strings.player.painSites as Record<string, string>;

/** How often the screen repaints. It reads the clock; it never counts. */
const REPAINT_MS = 250;

export function SessionPlayer({
  csrfToken,
  timeZone,
  session,
}: {
  csrfToken: string;
  timeZone: string;
  session: PlayerSession;
}) {
  const [phase, setPhase] = useState<Phase>('ready');
  const [movements, setMovements] = useState(session.movements);
  const [run, setRun] = useState<RunState>({
    startedAt: 0,
    cursor: { movementIndex: 0, setIndex: 0 },
    restStartedAt: null,
    restSeconds: 60,
    restAddedSeconds: 0,
    finishedAt: null,
  });
  const [runId, setRunId] = useState('');
  const [achieved, setAchieved] = useState<number | null>(null);
  const [logged, setLogged] = useState<Array<{ movementId: string; achieved: number }>>([]);
  const [muted, setMuted] = useState(false);
  const [cue, setCue] = useState('');
  const [awake, setAwake] = useState<boolean | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [effort, setEffort] = useState<number | null>(null);
  const [painSite, setPainSite] = useState<PainSite>('none');
  const [painScore, setPainScore] = useState<number | null>(null);
  const [painMorning, setPainMorning] = useState<boolean | null>(null);
  const [note, setNote] = useState('');
  const [remember, setRemember] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  /**
   * The clock, read into state rather than during render.
   *
   * It is still the wall clock and it is still a subtraction: every repaint
   * takes a FRESH reading of `Date.now()` and nothing accumulates. A tab that
   * is backgrounded for a minute misses two hundred and forty repaints and the
   * first one after it reads the true time, which is what makes sixty seconds
   * away cost nothing. Reading it during render is what React refuses, and it
   * is right to: a render that is not idempotent is a render that can be
   * replayed and disagree with itself.
   */
  const [now, setNow] = useState(() => Date.now());

  const spokenFor = useRef<string | null>(null);
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null);
  const mutedRef = useRef(false);

  const current = movements[run.cursor.movementIndex];
  const catalogue = current ? movementOf(current.movementId) : null;
  const unit = catalogue?.unit ?? 'rep';
  const totalSets = movements.reduce((sum, entry) => sum + entry.sets, 0);

  useEffect(() => {
    void rememberCsrfToken(csrfToken);
  }, [csrfToken]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  /**
   * The repaint. It reads nothing and decides nothing: every figure on the
   * screen is computed from `Date.now()` at render, so a missed interval costs
   * a late repaint and never a wrong number.
   */
  useEffect(() => {
    if (phase === 'ready' || phase === 'done') return;
    const timer = window.setInterval(() => setNow(Date.now()), REPAINT_MS);
    // The first frame back from a locked screen, without waiting for the next
    // interval. iOS stops delivering timer callbacks to a hidden tab entirely,
    // so this is the difference between a correct number immediately and a
    // correct number a quarter of a second later.
    const wake = () => setNow(Date.now());
    document.addEventListener('visibilitychange', wake);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [phase]);

  /**
   * The spoken cue, and the visible one, which are the same words.
   *
   * `speak` is called only when the owner has not muted; `setCue` runs either
   * way. That is F76's second half: the mute control silences the speech and
   * leaves the visual cue exactly where it was.
   */
  const say = useCallback((text: string, key: string) => {
    setCue(text);
    if (spokenFor.current === key) return;
    spokenFor.current = key;
    if (mutedRef.current) return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-GB';
    window.speechSynthesis.speak(utterance);
  }, []);

  /** The ten-second warning, from the wall clock rather than from a callback. */
  useEffect(() => {
    if (phase !== 'rest') return;
    const timer = window.setInterval(() => {
      if (cueIsDue(run, Date.now())) {
        say(
          strings.player.cueRestEnding(CUE_BEFORE_SECONDS),
          `rest-${run.cursor.movementIndex}-${run.cursor.setIndex}`,
        );
      }
    }, REPAINT_MS);
    return () => window.clearInterval(timer);
  }, [phase, run, say]);

  useEffect(() => {
    return () => {
      void wakeLock.current?.release().catch(() => undefined);
    };
  }, []);

  /**
   * One write, into the outbox, and the screen does not wait for it.
   *
   * THE ENTRY'S ID AND THE RUN'S ID ARE TWO DIFFERENT THINGS. The entry id is
   * the client UUID that keys the queue record and travels as the
   * Idempotency-Key; the run id is the row every set of this session points at.
   * An earlier version of this function overwrote the second with the first,
   * which sent the start under one id and every set under another, and the sets
   * would have been refused by the foreign key on `set_log.run_id`. The body's
   * own `runId` wins here, and `start()` is the one caller that sets it.
   */
  async function send(body: Record<string, unknown>) {
    const entryId = crypto.randomUUID();
    await enqueue({
      id: entryId,
      url: '/api/train/session',
      body: { runId: runId || entryId, ...body },
    });
    void flushOutbox({ force: true });
    return entryId;
  }

  /**
   * The start tap, and the order inside it is load bearing.
   *
   * The utterance goes out FIRST, synchronously, inside the gesture. iOS treats
   * `speechSynthesis.speak` as needing a user activation and returns silently
   * without one, and an `await` before it ends the activation: a cue primed
   * after the first network call is a cue that never speaks for the rest of the
   * session. The Wake Lock request follows for the same reason.
   */
  function start() {
    const startedAt = Date.now();
    const id = crypto.randomUUID();

    const first = movements[0];
    if (first) {
      const spoken = strings.player.cueSetStart(
        movementName(first.movementId),
        targetLabel(movementOf(first.movementId)?.unit ?? 'rep', first.target),
      );
      setCue(spoken);
      spokenFor.current = 'set-0-0';
      if (!muted && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(spoken);
        utterance.lang = 'en-GB';
        window.speechSynthesis.speak(utterance);
      }
    }

    // Keep the screen on, or say plainly that this browser will not. No prompt
    // is raised either way: Wake Lock asks for no permission, and a session
    // that put a dialog in front of the first set would break F74's last line.
    const lock = (navigator as Navigator & {
      wakeLock?: { request: (kind: string) => Promise<{ release: () => Promise<void> }> };
    }).wakeLock;
    if (lock) {
      lock
        .request('screen')
        .then((sentinel) => {
          wakeLock.current = sentinel;
          setAwake(true);
        })
        .catch(() => setAwake(false));
    } else {
      setAwake(false);
    }

    setRunId(id);
    setNow(startedAt);
    setRun({
      startedAt,
      cursor: { movementIndex: 0, setIndex: 0 },
      restStartedAt: null,
      restSeconds: movements[0]?.restSeconds ?? 60,
      restAddedSeconds: 0,
      finishedAt: null,
    });
    setAchieved(movements[0]?.target ?? null);
    setPhase('work');
    void send({
      action: 'start',
      runId: id,
      proposalId: session.proposalId,
      at: new Date(startedAt).toISOString(),
      screenAwake: Boolean(lock),
    });
  }

  function setDone() {
    if (!current) return;
    const done = achieved ?? current.target;
    void send({
      action: 'set',
      movementId: current.movementId,
      setIndex: run.cursor.setIndex,
      target: current.target,
      achieved: done,
      loadKg: current.loadKg,
      at: new Date().toISOString(),
    });
    setLogged((entries) => [...entries, { movementId: current.movementId, achieved: done }]);

    const lastSetOfMovement = run.cursor.setIndex + 1 >= current.sets;
    const lastMovement = run.cursor.movementIndex + 1 >= movements.length;
    if (lastSetOfMovement && lastMovement) {
      const finishedAt = Date.now();
      setNow(finishedAt);
      setRun((state) => ({ ...state, finishedAt, restStartedAt: null }));
      setPhase('done');
      say(strings.player.cueSessionDone, 'done');
      return;
    }

    const restFrom = Date.now();
    setNow(restFrom);
    setRun((state) => ({
      ...state,
      restStartedAt: restFrom,
      restSeconds: current.restSeconds,
      restAddedSeconds: 0,
    }));
    spokenFor.current = null;
    setPhase('rest');
  }

  /** The next set, which the owner starts. Nothing here advances itself. */
  function startNext() {
    if (!current) return;
    const lastSetOfMovement = run.cursor.setIndex + 1 >= current.sets;
    const cursor = lastSetOfMovement
      ? { movementIndex: run.cursor.movementIndex + 1, setIndex: 0 }
      : { movementIndex: run.cursor.movementIndex, setIndex: run.cursor.setIndex + 1 };
    const next = movements[cursor.movementIndex];
    setNow(Date.now());
    setRun((state) => ({ ...state, cursor, restStartedAt: null, restAddedSeconds: 0 }));
    setAchieved(next?.target ?? null);
    setPhase('work');
    if (next) {
      say(
        strings.player.cueSetStart(
          movementName(next.movementId),
          targetLabel(movementOf(next.movementId)?.unit ?? 'rep', next.target),
        ),
        `set-${cursor.movementIndex}-${cursor.setIndex}`,
      );
    }
  }

  /**
   * An easier movement, a harder one, or a substitution, each one tap and none
   * of them ending the session. The load carries across and the remaining sets
   * carry across: what changes is the movement and its target.
   */
  function swap(toId: string) {
    const replacement = movementOf(toId);
    if (!replacement || !current) return;
    const from = current.movementId;
    /*
     * "Remember this swap", from screen 07 frame 3, and it means what it says:
     * every session still ahead of the owner that holds the movement he just
     * replaced takes the replacement, and every session behind him is left
     * exactly as it happened. It goes through the outbox like every other write
     * here, so making the decision mid-set in a basement gym costs nothing.
     */
    if (remember) {
      void enqueue({
        id: crypto.randomUUID(),
        url: '/api/train/week',
        body: { action: 'substitute', fromMovementId: from, toMovementId: toId },
      }).then(() => flushOutbox({ force: true }));
    }
    setMovements((entries) =>
      entries.map((entry, index) =>
        index === run.cursor.movementIndex
          ? {
              ...entry,
              movementId: toId,
              target: replacement.low,
              restSeconds: replacement.restSeconds,
              lastWeek: null,
            }
          : entry,
      ),
    );
    setAchieved(replacement.low);
    setReplacing(false);
  }

  async function finish() {
    setSaving(true);
    try {
      await send({
        action: 'finish',
        at: new Date(run.finishedAt ?? Date.now()).toISOString(),
        effortScale: session.movements.every(
          (entry) => movementOf(entry.movementId)?.effortScale === 'cdc',
        )
          ? 'cdc'
          : 'rir',
        effort,
        painSite,
        painScore: painSite === 'none' ? 0 : painScore,
        painSubsidedByMorning: painMorning,
        note,
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  const cardio = session.movements.every((entry) => movementOf(entry.movementId)?.effortScale === 'cdc');
  const scaleLow = cardio ? CDC_MIN : RIR_MIN;
  const scaleHigh = cardio ? CDC_MAX : RIR_MAX;
  const media = current ? mediaFor(current.movementId) : null;

  // ---------------------------------------------------------------------------
  // Before the session starts.
  if (phase === 'ready') {
    return (
      <div className="player" data-phase="ready">
        <div className="card">
          <span className="lbl">{strings.trainWeek.kinds[session.kind as 'strength']}</span>
          <div className="head">{strings.player.title}</div>
          <p className="sub">{strings.player.startNote}</p>
          <p className="note" style={{ marginTop: 'var(--s2)' }}>
            {strings.player.offlineNote}
          </p>
        </div>

        <ol className="card" style={{ listStyle: 'none' }} data-movements={movements.length}>
          {movements.map((entry) => (
            <li className="row" key={entry.movementId}>
              <span className="grow">{movementName(entry.movementId)}</span>
              <span className="note num">
                {strings.catalogue.target(
                  entry.sets,
                  targetLabel(movementOf(entry.movementId)?.unit ?? 'rep', entry.target),
                )}
              </span>
            </li>
          ))}
        </ol>

        <button type="button" className="btn primary block setdone" onClick={start} data-action="start">
          {strings.player.start}
        </button>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Finished: the one moment of motion in this product.
  if (phase === 'done') {
    return (
      <div className="player" data-phase="done">
        <div className="doneRing" data-motion="completion">
          <svg viewBox="0 0 160 160" role="img" aria-label={strings.player.finishedRing}>
            <circle className="track" cx="80" cy="80" r="68" fill="none" strokeWidth="12" />
            <circle
              className="run"
              cx="80"
              cy="80"
              r="68"
              fill="none"
              strokeWidth="12"
              strokeLinecap="round"
              transform="rotate(-90 80 80)"
            />
            <path
              className="tick"
              d="M62 80 74 92 99 66"
              fill="none"
              strokeWidth="8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div className="head" style={{ fontSize: '24px', marginTop: '14px' }}>
            {strings.player.finishedTitle}
          </div>
          <div className="sub num">
            {strings.player.finishedSummary(
              clockLabel(elapsedMs(run, now)),
              movements.length,
              logged.length,
            )}
          </div>
        </div>

        <div className="card tight">
          {movements.map((entry) => {
            const done = logged.filter((line) => line.movementId === entry.movementId);
            return (
              <div className="row" key={entry.movementId}>
                <span className="grow sub mut">{movementName(entry.movementId)}</span>
                <span className="num">
                  {strings.player.lastWeekLine(
                    done.length,
                    targetLabel(movementOf(entry.movementId)?.unit ?? 'rep', done[0]?.achieved ?? entry.target),
                    entry.loadKg ? `${entry.loadKg} ${strings.units.kg}` : strings.player.bodyweight,
                  )}
                </span>
              </div>
            );
          })}
        </div>

        {/*
          * Effort, asked once, after the work. Reps in reserve for resistance,
          * the public-domain 0 to 10 scale for cardio, and neither one is
          * Borg's: his anchors are licence gated and his own distributor calls
          * renamed versions forgeries.
          */}
        <span className="lbl" style={{ margin: '14px 0 8px' }}>
          {cardio ? strings.player.effortCardio : strings.player.effortResistance}
        </span>
        <div className="scale10" role="group" aria-label={cardio ? strings.player.effortCardio : strings.player.effortResistance}>
          {Array.from({ length: Math.ceil((scaleHigh - scaleLow + 1) / 2) }, (_, index) => scaleLow + index).map(
            (point) => (
              <button
                key={point}
                type="button"
                aria-pressed={effort === point}
                onClick={() => setEffort(point)}
              >
                {point}
              </button>
            ),
          )}
        </div>
        <div className="scale10" style={{ marginTop: '5px' }}>
          {Array.from(
            { length: Math.floor((scaleHigh - scaleLow + 1) / 2) },
            (_, index) => scaleLow + Math.ceil((scaleHigh - scaleLow + 1) / 2) + index,
          ).map((point) => (
            <button key={point} type="button" aria-pressed={effort === point} onClick={() => setEffort(point)}>
              {point}
            </button>
          ))}
        </div>
        <p className="note" style={{ margin: '8px 0 4px' }}>
          {cardio ? strings.player.effortCardioNote : strings.player.effortResistanceNote}
        </p>
        {cardio ? (
          <p className="note" data-attribution="cdc">
            {strings.player.cdcSource}
          </p>
        ) : null}

        {/* Pain, on the Silbernagel rule, with the rule stated where it is asked. */}
        <span className="lbl" style={{ margin: '18px 0 8px' }}>
          {strings.player.painLabel}
        </span>
        <div className="pick" role="group" aria-label={strings.player.painLabel}>
          {PAIN_SITES.map((site) => (
            <button
              key={site}
              type="button"
              data-pain-site={site}
              aria-pressed={painSite === site}
              onClick={() => setPainSite(site)}
            >
              {SITE_LABELS[site]}
            </button>
          ))}
        </div>
        <p className="note" style={{ marginTop: 'var(--s2)' }} data-pain-rule>
          {strings.player.painRule}
        </p>

        {painSite !== 'none' ? (
          <>
            <span className="lbl" style={{ margin: '14px 0 8px' }}>
              {strings.player.painScore}
            </span>
            <div className="scale10" role="group" aria-label={strings.player.painScore}>
              {[0, 1, 2, 3, 4, 5].map((point) => (
                <button
                  key={point}
                  type="button"
                  aria-pressed={painScore === point}
                  onClick={() => setPainScore(point)}
                >
                  {point}
                </button>
              ))}
            </div>
            <div className="scale10" style={{ marginTop: '5px' }}>
              {[6, 7, 8, 9, PAIN_SCALE_MAX].map((point) => (
                <button
                  key={point}
                  type="button"
                  aria-pressed={painScore === point}
                  onClick={() => setPainScore(point)}
                >
                  {point}
                </button>
              ))}
            </div>
            {painScore !== null && painScore > PAIN_CEILING ? (
              <p className="note warn" style={{ marginTop: 'var(--s2)' }} data-pain="above-ceiling">
                {strings.player.painAboveCeiling(PAIN_CEILING)}
              </p>
            ) : null}

            <span className="lbl" style={{ margin: '14px 0 8px' }}>
              {strings.player.painMorning}
            </span>
            <div className="pick" role="group" aria-label={strings.player.painMorning}>
              <button type="button" aria-pressed={painMorning === true} onClick={() => setPainMorning(true)}>
                {strings.readiness.diseaseYes}
              </button>
              <button type="button" aria-pressed={painMorning === false} onClick={() => setPainMorning(false)}>
                {strings.readiness.diseaseNo}
              </button>
              <button type="button" aria-pressed={painMorning === null} onClick={() => setPainMorning(null)}>
                {strings.player.painMorningLater}
              </button>
            </div>
            {painMorning === false ? (
              <p className="note warn" style={{ marginTop: 'var(--s2)' }} data-pain="not-subsided">
                {strings.player.painNotSubsided}
              </p>
            ) : null}
            <p className="note" style={{ marginTop: 'var(--s2)' }}>
              {strings.player.painNote}
            </p>
          </>
        ) : null}

        <span className="lbl" style={{ margin: '18px 0 8px' }}>
          {strings.player.note}
        </span>
        <textarea
          className="ta"
          aria-label={strings.player.note}
          placeholder={strings.player.notePlaceholder}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />

        {saved ? (
          <div className="card" data-state="saved" style={{ marginTop: 'var(--s3)' }}>
            <p className="sub">{strings.player.savedNote}</p>
            <div className="actions">
              <Link className="btn block" href="/train">
                {strings.trainWeek.back}
              </Link>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="btn primary block"
            style={{ marginTop: 'var(--s3)' }}
            disabled={saving}
            onClick={() => void finish()}
            data-action="save"
          >
            {saving ? strings.player.saving : strings.player.save}
          </button>
        )}
        <p className="note centre" style={{ marginTop: 'var(--s2)' }}>
          {strings.player.savedNote}
        </p>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Working, or resting. Same header, same block bar, same cue line.
  const alternatives = current ? alternativesFor(current.movementId) : null;
  const remaining = restRemainingMs(run, now);
  const total = restTotalSeconds(run);
  const nextIsNewMovement = current ? run.cursor.setIndex + 1 >= current.sets : false;
  const nextMovement = nextIsNewMovement ? movements[run.cursor.movementIndex + 1] : current;
  const nextSetIndex = nextIsNewMovement ? 1 : run.cursor.setIndex + 2;

  return (
    <div className="player" data-phase={phase}>
      <div className="hdr">
        <Link className="btn icon" href="/train" aria-label={strings.player.leave}>
          <CloseIcon />
        </Link>
        <div className="grow stack">
          <span className="strong">{strings.trainWeek.kinds[session.kind as 'strength']}</span>
          <span className="note num">
            {strings.player.block(run.cursor.movementIndex + 1, movements.length)}
            {' · '}
            {strings.player.elapsed(clockLabel(elapsedMs(run, now)))}
          </span>
        </div>
        <button
          type="button"
          className="btn icon"
          aria-label={muted ? strings.player.spokenOff : strings.player.spokenOn}
          aria-pressed={muted}
          data-action="mute"
          onClick={() => setMuted((current) => !current)}
        >
          {muted ? <MuteIcon /> : <SoundIcon />}
        </button>
      </div>

      <ol className="blocks" aria-label={strings.player.ringLabel(logged.length, totalSets)}>
        {movements.map((entry, index) => (
          <li
            key={entry.movementId}
            data-block={
              index < run.cursor.movementIndex ? 'done' : index === run.cursor.movementIndex ? 'now' : 'todo'
            }
          />
        ))}
      </ol>

      {/*
        * The cue line. It carries whatever was last spoken, whether or not it
        * was spoken: F76 asks that every spoken cue has a visible equivalent,
        * and this is it. Muting changes the icon and the speech and never this.
        */}
      <p className="note" aria-live="polite" data-cue-line style={{ minHeight: '18px' }}>
        {cue ? `${strings.player.cueLabel}: ${cue}` : ''}
      </p>
      {muted ? (
        <p className="note" data-muted-note>
          {strings.player.spokenMutedNote}
        </p>
      ) : null}

      {awake === false ? (
        <div className="banner" data-wake-lock="refused">
          <p className="grow">{strings.player.notAwake}</p>
        </div>
      ) : null}

      {phase === 'rest' ? (
        <div className="restring" data-rest>
          <span className="lbl" style={{ marginBottom: '10px' }}>
            {strings.player.rest}
          </span>
          <svg
            viewBox="0 0 220 220"
            role="img"
            aria-label={strings.player.restRingLabel(Math.ceil(remaining / 1000), total)}
          >
            <circle className="track" cx="110" cy="110" r="96" fill="none" strokeWidth="10" />
            <circle
              className="run"
              cx="110"
              cy="110"
              r="96"
              fill="none"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray="603"
              strokeDashoffset={String(Math.round(603 * restFraction(run, now)))}
              transform="rotate(-90 110 110)"
            />
            <text x="110" y="128" textAnchor="middle" data-timer>
              {clockLabel(remaining)}
            </text>
          </svg>
          <span className="sub num" style={{ marginTop: '14px' }}>
            {strings.player.restOf(total)}
          </span>

          {nextMovement ? (
            <div className="card" style={{ width: '100%', marginTop: '20px' }} data-next>
              <span className="lbl">{strings.player.next}</span>
              <div className="between">
                <span className="head">
                  {movementName(nextMovement.movementId)}
                  {', '}
                  {strings.player.set(nextSetIndex, nextMovement.sets)}
                </span>
                <span className="num strong">
                  {targetLabel(movementOf(nextMovement.movementId)?.unit ?? 'rep', nextMovement.target)}
                </span>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="fill">
          {media ? (
            <figure className="demo" data-media={current?.movementId}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={media.path}
                alt={strings.catalogue.mediaAlt(movementName(current!.movementId))}
                decoding="async"
              />
              <figcaption>{strings.catalogue.mediaFrom(media.author)}</figcaption>
            </figure>
          ) : null}

          <div className="move">{current ? movementName(current.movementId) : ''}</div>
          <p className="sub" style={{ margin: '4px 0 12px' }} data-cue>
            {current ? movementCue(current.movementId) : ''}
          </p>

          <div className="card tight" data-set-card>
            <div className="between" style={{ marginBottom: '10px' }}>
              <div className="stack">
                <span className="lbl">
                  {current ? strings.player.set(run.cursor.setIndex + 1, current.sets) : ''}
                </span>
                <div className="between" style={{ gap: 'var(--s2)' }}>
                  <button
                    type="button"
                    className="btn icon"
                    aria-label={strings.quickLog.waistDown}
                    onClick={() => setAchieved((value) => Math.max(0, (value ?? current?.target ?? 0) - 1))}
                  >
                    <MinusIcon />
                  </button>
                  <span className="setfig" data-achieved={achieved ?? current?.target ?? 0}>
                    {targetLabel(unit, achieved ?? current?.target ?? 0)}
                  </span>
                  <button
                    type="button"
                    className="btn icon"
                    aria-label={strings.quickLog.waistUp}
                    onClick={() => setAchieved((value) => (value ?? current?.target ?? 0) + 1)}
                  >
                    <PlusIcon />
                  </button>
                </div>
              </div>
              <div className="stack" style={{ alignItems: 'flex-end' }}>
                <span className="lbl">{strings.player.load}</span>
                <span className="setfig">
                  {current?.loadKg ? `${current.loadKg} ${strings.units.kg}` : strings.player.bodyweight}
                </span>
              </div>
            </div>

            <div className="chips" style={{ marginBottom: '10px' }}>
              {current
                ? Array.from({ length: current.sets }, (_, index) => (
                    <span
                      key={index}
                      className={index < run.cursor.setIndex ? 'chip g' : index === run.cursor.setIndex ? 'chip now' : 'chip'}
                    >
                      {index < run.cursor.setIndex
                        ? strings.player.setState.done(index + 1, targetLabel(unit, current.target))
                        : index === run.cursor.setIndex
                          ? strings.player.setState.now(index + 1)
                          : strings.player.setState.todo(index + 1)}
                    </span>
                  ))
                : null}
            </div>

            {/*
              * LAST WEEK, INSIDE THE OPEN SET. F75's first half, and it is read
              * with the session rather than fetched here: a phone in a basement
              * gym has no route home, so the number has to already be on the
              * device before the set opens.
              */}
            <div className="row" style={{ borderTop: '1px solid var(--line)', borderBottom: 0, paddingTop: '10px' }}>
              <span className="grow sub">{strings.player.lastWeek}</span>
              <span className="num" data-last-week={current?.lastWeek ? 'yes' : 'no'}>
                {current?.lastWeek
                  ? current.lastWeek.rir !== null
                    ? strings.player.lastWeekWithEffort(
                        current.lastWeek.sets,
                        targetLabel(unit, current.lastWeek.achieved),
                        current.lastWeek.loadKg
                          ? `${current.lastWeek.loadKg} ${strings.units.kg}`
                          : strings.player.bodyweight,
                        current.lastWeek.rir,
                      )
                    : strings.player.lastWeekLine(
                        current.lastWeek.sets,
                        targetLabel(unit, current.lastWeek.achieved),
                        current.lastWeek.loadKg
                          ? `${current.lastWeek.loadKg} ${strings.units.kg}`
                          : strings.player.bodyweight,
                      )
                  : strings.player.lastWeekNone}
              </span>
            </div>
            {current?.lastWeek ? (
              <p className="note num">{shortDate(new Date(current.lastWeek.at), timeZone)}</p>
            ) : null}
          </div>

          {/*
            * The only in-session intensity control, and it is a ceiling rather
            * than a selector. The band beside it is a pre-session target: this
            * app does not read heart rate, live or otherwise, and says so.
            */}
          {session.band ? (
            <div className="card tight" data-card="intensity">
              <div className="between">
                <div className="stack grow">
                  <span className="lbl">{strings.intensity.label}</span>
                  <span className="num strong">
                    {strings.intensity.range(session.band.label, session.band.low, session.band.high)}
                  </span>
                </div>
              </div>
              <p className="note" style={{ marginTop: '6px' }}>
                {strings.intensity.talkTest} {strings.intensity.noTracking}
              </p>
            </div>
          ) : null}

          <div className="spacer" />
        </div>
      )}

      {phase === 'rest' ? (
        <>
          <div className="grid3" style={{ marginBottom: '10px' }}>
            <button
              type="button"
              className="btn"
              onClick={() =>
                setRun((state) => ({ ...state, restAddedSeconds: state.restAddedSeconds + REST_STEP_SECONDS }))
              }
            >
              <PlusIcon />
              {strings.player.addRest(REST_STEP_SECONDS)}
            </button>
            {/*
              * Skip rest starts the next set rather than zeroing the clock. A
              * countdown driven to 0:00 and left there reads as a rest that
              * ended, which is a different thing from a rest the owner cut
              * short, and the set after it would open with no cue spoken.
              */}
            <button type="button" className="btn" style={{ flex: 2 }} onClick={startNext}>
              {strings.player.skipRest}
            </button>
          </div>
          <button type="button" className="btn primary block" onClick={startNext} data-action="start-set">
            {strings.player.startSet(nextSetIndex)}
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            className="btn primary block setdone"
            onClick={setDone}
            data-action="set-done"
          >
            {strings.player.setDone}
          </button>
          <div className="grid3" style={{ marginTop: '10px' }}>
            <button
              type="button"
              className="btn"
              disabled={!alternatives?.easier}
              data-action="easier"
              onClick={() => alternatives?.easier && swap(alternatives.easier.id)}
            >
              {strings.player.easier}
            </button>
            <button
              type="button"
              className="btn"
              disabled={!alternatives?.harder}
              data-action="harder"
              onClick={() => alternatives?.harder && swap(alternatives.harder.id)}
            >
              {strings.player.harder}
            </button>
            <button type="button" className="btn" data-action="replace" onClick={() => setReplacing(true)}>
              <SwapIcon />
              {strings.player.replace}
            </button>
          </div>
          <p className="note centre" style={{ marginTop: '10px' }}>
            {awake === true ? strings.player.awake : strings.player.startNote}
          </p>
        </>
      )}

      {replacing && alternatives ? (
        <>
          <button
            type="button"
            className="scrim"
            aria-label={strings.player.close}
            onClick={() => setReplacing(false)}
          />
          <div className="sheet" role="dialog" aria-modal="true" aria-label={strings.player.replaceTitle}>
            <div className="grabber" />
            <div className="between sheet-head">
              <span className="title-line">{strings.player.replaceTitle}</span>
              <button
                type="button"
                className="btn icon"
                aria-label={strings.player.close}
                onClick={() => setReplacing(false)}
              >
                <CloseIcon />
              </button>
            </div>
            <div className="sheetbody">
              <p className="sub" style={{ marginBottom: '14px' }}>
                {current?.loadKg
                  ? strings.player.replaceBody(`${current.loadKg} ${strings.units.kg}`)
                  : strings.player.replaceBodyBodyweight}
              </p>
              {[
                { movement: alternatives.easier, chip: strings.player.replaceEasier },
                { movement: alternatives.substitute, chip: strings.player.replaceSame },
                { movement: alternatives.harder, chip: strings.player.replaceHarder },
              ]
                .filter((option) => option.movement)
                .map((option) => (
                  <div className="card tight" key={option.movement!.id} data-alternative={option.movement!.id}>
                    <div className="between">
                      <span className="strong">{movementName(option.movement!.id)}</span>
                      <span className="chip">{option.chip}</span>
                    </div>
                    <p className="note" style={{ marginTop: '4px' }}>
                      {movementCue(option.movement!.id)}
                    </p>
                    <button
                      type="button"
                      className="btn block"
                      style={{ marginTop: '10px' }}
                      onClick={() => swap(option.movement!.id)}
                    >
                      {strings.player.use}
                    </button>
                  </div>
                ))}
              {/*
                * The one thing on this sheet that outlives tonight, and it is
                * off by default: a swap made because the backpack shifted is
                * not a decision about February.
                */}
              <div className="card tight" style={{ borderStyle: 'dashed', background: 'transparent' }}>
                <div className="between">
                  <div className="stack grow">
                    <span>{strings.player.remember}</span>
                    <span className="note">{strings.player.rememberNote}</span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    className={remember ? 'btn primary' : 'btn'}
                    aria-checked={remember}
                    aria-label={strings.player.remember}
                    data-action="remember-swap"
                    onClick={() => setRemember((current) => !current)}
                  >
                    {remember ? strings.readiness.diseaseYes : strings.readiness.diseaseNo}
                  </button>
                </div>
              </div>
              <p className="note centre">{strings.media.embedNote}</p>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
