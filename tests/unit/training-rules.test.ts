import { describe, expect, test } from 'vitest';
import {
  CDC_MAX,
  CDC_MIN,
  CDC_MODERATE,
  CDC_VIGOROUS,
  OVER_TARGET_BY,
  PAIN_CEILING,
  RIR_FAMILIARISATION_WEEKS,
  RIR_MAX,
  RIR_MIN,
  RIR_TARGET,
  SESSION_LENGTH_CEILING,
  SESSION_LENGTH_WINDOW_DAYS,
  type PainReport,
  type SetResult,
  advancementBlocked,
  deloadSets,
  lastSetsPerSession,
  painProblems,
  prescribesFromEffort,
  proposeAdvancement,
  repeatedSite,
  sessionLengthFact,
} from '@/lib/training-rules';

/**
 * The progression rules, graded as arithmetic over histories written by hand.
 *
 * TWO HISTORIES PER RULE, AND THAT IS THE POINT. F73 wants a proposal over a
 * history that meets the 2-for-2 trigger and no proposal over one that does
 * not; F77 wants the same pair for pain at the same site. A rule that only ever
 * says yes is not a rule, and a test that only feeds it the yes case cannot
 * tell the difference.
 */

const NOW = new Date('2026-08-23T19:00:00+02:00');

function daysBack(days: number): Date {
  return new Date(NOW.getTime() - days * 86_400_000);
}

/** Three sets of one movement in one session, with the last set's count last. */
function session(id: string, at: Date, movementId: string, target: number, achieved: number[]): SetResult[] {
  return achieved.map((count, index) => ({
    sessionId: id,
    at,
    movementId,
    setIndex: index,
    target,
    achieved: count,
    loadKg: null,
    rir: 8,
  }));
}

describe('the 2-for-2 trigger', () => {
  test('the rule is two or more over target, on the last set, in two consecutive sessions', () => {
    expect(OVER_TARGET_BY).toBe(2);
  });

  test('a history that meets it produces a proposal', () => {
    const history = [
      ...session('a', daysBack(10), 'push-up', 8, [8, 9, 10]),
      ...session('b', daysBack(3), 'push-up', 8, [9, 10, 11]),
    ];
    const advancement = proposeAdvancement(history, 'push-up');
    expect(advancement).not.toBeNull();
    expect(advancement!.lever).toBe('reps');
    expect(advancement!.fromTarget).toBe(8);
    expect(advancement!.toTarget).toBe(10);
    expect(advancement!.triggeredBy).toHaveLength(2);
    expect(advancement!.triggeredBy[0].sessionId).toBe('a');
    expect(advancement!.triggeredBy[1].sessionId).toBe('b');
  });

  test('a history one rep short in one session produces nothing', () => {
    const history = [
      // Last set 11 against a target of 10 is ONE over, not two.
      ...session('a', daysBack(10), 'bodyweight-squat', 10, [10, 10, 11]),
      ...session('b', daysBack(3), 'bodyweight-squat', 10, [10, 11, 12]),
    ];
    expect(proposeAdvancement(history, 'bodyweight-squat')).toBeNull();
  });

  test('it reads the LAST set and not the best one', () => {
    const history = [
      // A big first set and a target-matching last set is not the trigger.
      ...session('a', daysBack(10), 'push-up', 8, [12, 10, 8]),
      ...session('b', daysBack(3), 'push-up', 8, [12, 10, 8]),
    ];
    expect(proposeAdvancement(history, 'push-up')).toBeNull();
    expect(lastSetsPerSession(history, 'push-up').map((set) => set.achieved)).toEqual([8, 8]);
  });

  test('one session, however good, is not two', () => {
    const history = session('a', daysBack(3), 'push-up', 8, [12, 12, 12]);
    expect(proposeAdvancement(history, 'push-up')).toBeNull();
  });

  test('two good sessions with a bad one between them are not consecutive', () => {
    const history = [
      ...session('a', daysBack(20), 'push-up', 8, [10, 10, 11]),
      ...session('b', daysBack(10), 'push-up', 8, [8, 8, 8]),
      ...session('c', daysBack(3), 'push-up', 8, [10, 10, 11]),
    ];
    expect(proposeAdvancement(history, 'push-up')).toBeNull();
  });

  test('a loadable movement carrying load advances the load and holds the rep target', () => {
    const history = [
      ...session('a', daysBack(10), 'bodyweight-squat', 10, [10, 11, 12]),
      ...session('b', daysBack(3), 'bodyweight-squat', 10, [10, 11, 12]),
    ].map((set) => ({ ...set, loadKg: 8 }));
    const advancement = proposeAdvancement(history, 'bodyweight-squat');
    expect(advancement!.lever).toBe('load');
    expect(advancement!.fromLoadKg).toBe(8);
    // Lower body, so the NSCA table's 2 kg rather than the upper body's 1 kg.
    expect(advancement!.toLoadKg).toBe(10);
    expect(advancement!.toTarget).toBe(advancement!.fromTarget);
  });

  test('an unloaded movement at the top of its band moves up the ladder instead', () => {
    const history = [
      ...session('a', daysBack(10), 'push-up', 12, [12, 13, 14]),
      ...session('b', daysBack(3), 'push-up', 12, [12, 13, 14]),
    ];
    const advancement = proposeAdvancement(history, 'push-up');
    expect(advancement!.lever).toBe('variation');
    expect(advancement!.toMovementId).toBe('close-grip-push-up');
  });

  test('nothing here applies anything: the result is a proposal and carries its trigger', () => {
    const history = [
      ...session('a', daysBack(10), 'push-up', 8, [8, 9, 10]),
      ...session('b', daysBack(3), 'push-up', 8, [9, 10, 11]),
    ];
    const advancement = proposeAdvancement(history, 'push-up')!;
    // The two sessions are named so the card can print them and the owner can
    // check the rule against his own memory.
    expect(advancement.triggeredBy.map((entry) => entry.achieved)).toEqual([10, 11]);
    expect(advancement.triggeredBy.map((entry) => entry.target)).toEqual([8, 8]);
  });
});

describe('the session-length fact, which is the only length comparison that ships', () => {
  test('the window is 30 days and the ceiling is 110 percent', () => {
    expect(SESSION_LENGTH_WINDOW_DAYS).toBe(30);
    expect(SESSION_LENGTH_CEILING).toBe(1.1);
  });

  test('a session 22 percent longer than the 30-day longest is flagged, with the percentage', () => {
    const fact = sessionLengthFact(
      55,
      [
        { minutes: 45, at: daysBack(5) },
        { minutes: 35, at: daysBack(12) },
      ],
      NOW,
    );
    expect(fact).not.toBeNull();
    expect(fact!.longestMinutes).toBe(45);
    expect(fact!.percentLonger).toBe(22);
    expect(fact!.flagged).toBe(true);
  });

  test('a session inside the ceiling is not flagged and still reports the number', () => {
    const fact = sessionLengthFact(48, [{ minutes: 45, at: daysBack(5) }], NOW)!;
    expect(fact.percentLonger).toBe(7);
    expect(fact.flagged).toBe(false);
  });

  test('a session older than the window does not count as the longest', () => {
    const fact = sessionLengthFact(
      50,
      [
        { minutes: 90, at: daysBack(45) },
        { minutes: 40, at: daysBack(4) },
      ],
      NOW,
    )!;
    expect(fact.longestMinutes).toBe(40);
    expect(fact.flagged).toBe(true);
  });

  test('with no history in the window there is no fact, rather than a fact about zero', () => {
    expect(sessionLengthFact(50, [], NOW)).toBeNull();
    expect(sessionLengthFact(50, [{ minutes: 40, at: daysBack(60) }], NOW)).toBeNull();
  });

  test('the fact carries a percentage and minutes and nothing else', () => {
    const fact = sessionLengthFact(55, [{ minutes: 45, at: daysBack(5) }], NOW)!;
    // No risk, no ratio, no score. The shape of the object is the claim.
    expect(Object.keys(fact).sort()).toEqual(
      ['flagged', 'longestMinutes', 'minutes', 'percentLonger'].sort(),
    );
  });
});

describe('the pain rule, from Silbernagel 2007', () => {
  test('the ceiling is 5 out of 10 during the work', () => {
    expect(PAIN_CEILING).toBe(5);
  });

  const report = (site: string, score: number, subsided: boolean | null, days: number): PainReport => ({
    at: daysBack(days),
    sessionId: `s${days}`,
    site,
    duringScore: score,
    subsidedByMorning: subsided,
  });

  test('5 out of 10 that has gone by the morning is inside the rule', () => {
    expect(painProblems(report('knee', 5, true, 0), null)).toEqual([]);
  });

  test('6 out of 10 is above the ceiling', () => {
    expect(painProblems(report('knee', 6, true, 0), null)).toContain('aboveCeiling');
  });

  test('pain still there the next morning is a problem whatever the score was', () => {
    expect(painProblems(report('knee', 3, false, 0), null)).toContain('notSubsided');
  });

  test('the same site worse than last week is a problem', () => {
    const problems = painProblems(report('knee', 4, true, 0), report('knee', 2, true, 7));
    expect(problems).toContain('roseFromLastWeek');
  });

  test('a different site is not a week-to-week increase', () => {
    expect(painProblems(report('knee', 4, true, 0), report('shoulder', 2, true, 7))).toEqual([]);
  });

  test('no pain reported is no problem at all', () => {
    expect(painProblems(report('none', 0, null, 0), report('knee', 4, true, 7))).toEqual([]);
  });
});

describe('the same site twice running, which deloads and never advances', () => {
  test('two consecutive reports at the knee block advancement and name the site', () => {
    const history = [
      { at: daysBack(7), sessionId: 'a', site: 'knee', duringScore: 3, subsidedByMorning: true },
      { at: daysBack(3), sessionId: 'b', site: 'knee', duringScore: 4, subsidedByMorning: true },
    ];
    expect(repeatedSite(history)).toBe('knee');
    expect(advancementBlocked(history)).toBe(true);
  });

  test('two reports at different sites do not', () => {
    const history = [
      { at: daysBack(7), sessionId: 'a', site: 'knee', duringScore: 3, subsidedByMorning: true },
      { at: daysBack(3), sessionId: 'b', site: 'shoulder', duringScore: 3, subsidedByMorning: true },
    ];
    expect(repeatedSite(history)).toBeNull();
    expect(advancementBlocked(history)).toBe(false);
  });

  test('a clean session between two knee reports breaks the run', () => {
    const history = [
      { at: daysBack(9), sessionId: 'a', site: 'knee', duringScore: 3, subsidedByMorning: true },
      { at: daysBack(6), sessionId: 'b', site: 'none', duringScore: 0, subsidedByMorning: null },
      { at: daysBack(3), sessionId: 'c', site: 'knee', duringScore: 3, subsidedByMorning: true },
    ];
    expect(repeatedSite(history)).toBeNull();
  });

  test('a history with no pain in it blocks nothing', () => {
    const history = [
      { at: daysBack(7), sessionId: 'a', site: 'none', duringScore: 0, subsidedByMorning: null },
      { at: daysBack(3), sessionId: 'b', site: 'none', duringScore: 0, subsidedByMorning: null },
    ];
    expect(repeatedSite(history)).toBeNull();
    expect(advancementBlocked(history)).toBe(false);
  });

  test('the deload cuts sets inside the 30 to 50 percent band and never below one', () => {
    expect(deloadSets(3)).toBe(2);
    expect(deloadSets(2)).toBe(1);
    expect(deloadSets(1)).toBe(1);
    // A third off is inside the band the practice surveys report.
    expect(1 - deloadSets(3) / 3).toBeGreaterThan(0.3);
    expect(1 - deloadSets(3) / 3).toBeLessThan(0.5);
  });
});

describe('the two effort scales, and neither one is licensed', () => {
  test('reps in reserve runs 1 to 10 on one question', () => {
    expect(RIR_MIN).toBe(1);
    expect(RIR_MAX).toBe(10);
  });

  test('the working-set target is 1 to 3 reps in reserve', () => {
    expect(RIR_TARGET).toEqual({ low: 1, high: 3 });
  });

  test('nothing is prescribed from the answer for the first four weeks', () => {
    expect(RIR_FAMILIARISATION_WEEKS).toBe(4);
    expect(prescribesFromEffort(1)).toBe(false);
    expect(prescribesFromEffort(4)).toBe(false);
    expect(prescribesFromEffort(5)).toBe(true);
  });

  test('the cardio scale is the public-domain 0 to 10, with moderate at 5 to 6', () => {
    expect(CDC_MIN).toBe(0);
    expect(CDC_MAX).toBe(10);
    expect(CDC_MODERATE).toEqual({ low: 5, high: 6 });
    expect(CDC_VIGOROUS).toEqual({ low: 7, high: 8 });
  });
});
