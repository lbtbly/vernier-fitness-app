import { describe, expect, it } from 'vitest';
import { SIGN_IN_MAX_FAILURES, SIGN_IN_WINDOW_SECONDS, lockoutState } from '@/lib/rate-limit';

const now = new Date('2026-08-22T06:57:00.000Z');
const secondsAgo = (seconds: number) => new Date(now.getTime() - seconds * 1000);

describe('the sign-in rate limiter', () => {
  it('lets the first five failures through and counts them down', () => {
    expect(lockoutState([], now).attemptsLeft).toBe(SIGN_IN_MAX_FAILURES);
    expect(lockoutState([secondsAgo(1)], now).attemptsLeft).toBe(4);
    const four = [1, 2, 3, 4].map(secondsAgo);
    expect(lockoutState(four, now)).toMatchObject({ locked: false, attemptsLeft: 1 });
  });

  it('locks on the fifth failure inside the window', () => {
    const five = [1, 2, 3, 4, 5].map(secondsAgo);
    const state = lockoutState(five, now);
    expect(state.locked).toBe(true);
    expect(state.attemptsLeft).toBe(0);
    expect(state.retryAfterSeconds).toBe(SIGN_IN_WINDOW_SECONDS - 5);
  });

  it('refuses a correct password while the window is open, which is the point', () => {
    const five = [1, 1, 1, 1, 1].map(secondsAgo);
    expect(lockoutState(five, now).locked).toBe(true);
  });

  it('opens again exactly when the oldest failure that still counts falls out', () => {
    const five = [61, 61, 61, 61, 61].map(secondsAgo);
    expect(lockoutState(five, now).locked).toBe(false);
    const mixed = [61, 30, 20, 10, 5].map(secondsAgo);
    expect(lockoutState(mixed, now).locked).toBe(false);
  });

  it('never returns a pause longer than the window', () => {
    const many = Array.from({ length: 20 }, () => secondsAgo(0));
    expect(lockoutState(many, now).retryAfterSeconds).toBeLessThanOrEqual(SIGN_IN_WINDOW_SECONDS);
  });
});
