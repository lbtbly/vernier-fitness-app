/**
 * Every time this player shows is read from the wall clock. Nothing counts.
 *
 * WHY. A rest timer built on `setInterval` counts ticks, and a phone that
 * backgrounds the tab stops delivering them: iOS throttles timers in a hidden
 * tab and stops them outright when the screen locks. A call mid-set then costs
 * exactly as many seconds as the call lasted, and the owner comes back to a
 * countdown frozen where he left it, which is worse than useless because it
 * looks right.
 *
 * So the state is two instants, `startedAt` and `restStartedAt`, and every
 * figure on screen is a subtraction from `Date.now()`. The interval that drives
 * the repaint can miss a hundred ticks and the number is still correct on the
 * next one, which is what F74's sixty seconds backgrounded actually tests.
 *
 * Pure, so the unit suite grades it by moving the clock forward by hand.
 */

export type Cursor = {
  /** Which movement in the session, 0 first. */
  movementIndex: number;
  /** Which set of that movement, 0 first. */
  setIndex: number;
};

export type RunState = {
  /** The instant the owner tapped start. Every elapsed figure is read from it. */
  startedAt: number;
  cursor: Cursor;
  /** The instant the current rest began, or null while a set is open. */
  restStartedAt: number | null;
  /** The rest the current pause was opened for, in seconds. */
  restSeconds: number;
  /** Seconds the owner has added to this rest with the plus control. */
  restAddedSeconds: number;
  finishedAt: number | null;
};

export function elapsedMs(state: Pick<RunState, 'startedAt' | 'finishedAt'>, now: number): number {
  return Math.max(0, (state.finishedAt ?? now) - state.startedAt);
}

/**
 * How much rest is left, never below zero and never above what was asked for.
 *
 * A rest that has run out is not an error and does not fire anything on its
 * own: the countdown reaches zero, the screen says the set can start, and the
 * owner starts it. Nothing in this player advances itself.
 */
export function restRemainingMs(state: RunState, now: number): number {
  if (state.restStartedAt === null) return 0;
  const total = (state.restSeconds + state.restAddedSeconds) * 1000;
  return Math.max(0, state.restStartedAt + total - now);
}

export function restTotalSeconds(state: RunState): number {
  return state.restSeconds + state.restAddedSeconds;
}

/**
 * A duration as a clock reads it: "0:45", "12:38", "1:04:11".
 *
 * Digits and colons, which is a value and not copy: there is no word in it to
 * catalogue, in any language. Seconds round DOWN, so a timer started at 75
 * seconds reads 1:15 for a whole second rather than flicking to 1:14 the
 * instant it starts.
 */
export function clockLabel(ms: number): string {
  const whole = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const seconds = whole % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  return hours > 0
    ? `${hours}:${mm}:${String(seconds).padStart(2, '0')}`
    : `${mm}:${String(seconds).padStart(2, '0')}`;
}

/** How far round the rest ring the countdown has travelled, 0 to 1. */
export function restFraction(state: RunState, now: number): number {
  const total = restTotalSeconds(state) * 1000;
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - restRemainingMs(state, now) / total));
}

/** The seconds the plus control adds. Screen 07 frame 2 draws 30. */
export const REST_STEP_SECONDS = 30;

/**
 * When the spoken cue for the end of a rest is due: ten seconds out, once.
 *
 * It is a wall-clock threshold rather than a countdown callback for the same
 * reason everything else here is: a backgrounded tab that misses the tick at
 * exactly ten seconds must still speak when it comes back inside the window,
 * and must not speak twice.
 */
export const CUE_BEFORE_SECONDS = 10;

export function cueIsDue(state: RunState, now: number): boolean {
  if (state.restStartedAt === null) return false;
  const remaining = restRemainingMs(state, now);
  return remaining > 0 && remaining <= CUE_BEFORE_SECONDS * 1000;
}
