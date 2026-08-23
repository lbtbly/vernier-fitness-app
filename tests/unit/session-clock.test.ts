import { describe, expect, test } from 'vitest';
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

/**
 * The session clock, graded by moving the clock rather than by waiting.
 *
 * F74's line is that elapsed and remaining time are derived from wall-clock
 * timestamps, and that after sixty seconds backgrounded the remaining time is
 * correct. The test for that is not a sleep: it is calling the same function
 * with a `now` sixty seconds later and asserting the answer moved by sixty
 * seconds. A timer that counted ticks would not, because the ticks would not
 * have been delivered, and that is exactly the defect this design avoids.
 */

const START = Date.parse('2026-08-23T18:40:00+02:00');

function state(overrides: Partial<RunState> = {}): RunState {
  return {
    startedAt: START,
    cursor: { movementIndex: 0, setIndex: 0 },
    restStartedAt: null,
    restSeconds: 90,
    restAddedSeconds: 0,
    finishedAt: null,
    ...overrides,
  };
}

describe('elapsed time is a subtraction and never a count', () => {
  test('twelve minutes and thirty-eight seconds after the start it reads 12:38', () => {
    const now = START + 12 * 60_000 + 38_000;
    expect(clockLabel(elapsedMs(state(), now))).toBe('12:38');
  });

  test('a finished session stops at the instant it finished, not at now', () => {
    const finishedAt = START + 35 * 60_000 + 12_000;
    const muchLater = finishedAt + 3 * 3_600_000;
    expect(clockLabel(elapsedMs(state({ finishedAt }), muchLater))).toBe('35:12');
  });

  test('a clock read before the start is zero rather than a negative', () => {
    expect(elapsedMs(state(), START - 5000)).toBe(0);
  });
});

describe('sixty seconds backgrounded costs nothing', () => {
  const rest = state({ restStartedAt: START, restSeconds: 90 });

  test('the countdown at ten seconds in reads 1:20', () => {
    expect(clockLabel(restRemainingMs(rest, START + 10_000))).toBe('1:20');
  });

  test('and sixty seconds later it reads 0:20, whether or not a tick was delivered', () => {
    // The phone was locked for the whole minute and the interval never fired.
    // The number is a subtraction from the wall clock, so it is right anyway.
    expect(clockLabel(restRemainingMs(rest, START + 70_000))).toBe('0:20');
  });

  test('a rest that ran out while the screen was off is zero and not a negative', () => {
    expect(restRemainingMs(rest, START + 300_000)).toBe(0);
    expect(clockLabel(restRemainingMs(rest, START + 300_000))).toBe('0:00');
  });

  test('a whole session in the background still reads correctly on the way back', () => {
    const now = START + 47 * 60_000 + 5000;
    expect(clockLabel(elapsedMs(state(), now))).toBe('47:05');
  });
});

describe('the rest the owner asked for', () => {
  test('the plus control adds thirty seconds and the total says so', () => {
    const rest = state({ restStartedAt: START, restSeconds: 90, restAddedSeconds: REST_STEP_SECONDS });
    expect(restTotalSeconds(rest)).toBe(120);
    expect(clockLabel(restRemainingMs(rest, START))).toBe('2:00');
  });

  test('the ring fills from nothing to full over the rest, and stays inside 0 and 1', () => {
    const rest = state({ restStartedAt: START, restSeconds: 60 });
    expect(restFraction(rest, START)).toBeCloseTo(0, 5);
    expect(restFraction(rest, START + 30_000)).toBeCloseTo(0.5, 5);
    expect(restFraction(rest, START + 60_000)).toBeCloseTo(1, 5);
    expect(restFraction(rest, START + 120_000)).toBe(1);
  });

  test('with no rest open there is nothing remaining and nothing to draw', () => {
    expect(restRemainingMs(state(), START + 10_000)).toBe(0);
    expect(cueIsDue(state(), START + 10_000)).toBe(false);
  });
});

describe('the spoken cue is due on a threshold, not on a callback', () => {
  const rest = state({ restStartedAt: START, restSeconds: 90 });

  test('it is not due with more than ten seconds left', () => {
    expect(cueIsDue(rest, START + 60_000)).toBe(false);
  });

  test('it is due inside the last ten seconds', () => {
    expect(CUE_BEFORE_SECONDS).toBe(10);
    expect(cueIsDue(rest, START + 81_000)).toBe(true);
    expect(cueIsDue(rest, START + 89_000)).toBe(true);
  });

  test('it is still due after a missed tick, which is why it is a threshold', () => {
    // The tick at exactly ten seconds was never delivered. The next reading is
    // at four seconds left, and the cue is still owed.
    expect(cueIsDue(rest, START + 86_000)).toBe(true);
  });

  test('it is not due once the rest has run out', () => {
    expect(cueIsDue(rest, START + 90_000)).toBe(false);
    expect(cueIsDue(rest, START + 200_000)).toBe(false);
  });
});

describe('the clock label', () => {
  test('it is digits and colons, in the shapes a timer reads', () => {
    expect(clockLabel(0)).toBe('0:00');
    expect(clockLabel(45_000)).toBe('0:45');
    expect(clockLabel(75_000)).toBe('1:15');
    expect(clockLabel(3_600_000)).toBe('1:00:00');
    expect(clockLabel(3_671_000)).toBe('1:01:11');
  });

  test('seconds round down, so a 75 second rest reads 1:15 for a whole second', () => {
    expect(clockLabel(75_999)).toBe('1:15');
  });

  test('a negative is clamped rather than rendered', () => {
    expect(clockLabel(-4000)).toBe('0:00');
  });
});
