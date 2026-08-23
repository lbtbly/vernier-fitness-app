import { harderThan, movementOf } from '@/lib/catalogue';

/**
 * The rules that decide what this app proposes, and the ones it refuses to
 * implement. `.forge/research/training-rules.md` part 2 binds every line.
 *
 * WHAT IS NOT IN THIS FILE, AND WILL NOT BE:
 *
 * - The 10 percent weekly rule as injury prevention. Buist 2008 randomised 532
 *   novice runners, about 10.5 percent a week against about 24, and got injury
 *   rates of 20.8 and 20.3 percent, chi-square 0.016, P=.90. Every running
 *   progression RCT since is null. It does not ship.
 * - Any acute-chronic workload ratio, gauge or sweet spot. Impellizzeri 2021
 *   produced odds ratios of the same size from a RANDOM denominator and
 *   concluded, verbatim, "We suggest ACWR be dismissed as a framework and
 *   model." Nothing here computes one and no column stores one.
 * - Any readiness score or personalised injury-risk number. The best
 *   multidisciplinary model with genetic, biomechanical and nutritional inputs
 *   reaches AUC 0.784. A number under that, presented to one person about his
 *   own knee, is a guess wearing a decimal point.
 *
 * WHAT DOES SHIP is per-session rather than per-week, which is where the
 * evidence actually is: Frandsen 2025, n=5,205 over 588,071 sessions, found the
 * session against the longest run in 30 days carried a real hazard ratio while
 * the week-to-week and acute-chronic approaches did not. So the app states that
 * one comparison as a fact, with the percentage, and attaches no risk to it.
 */

/** One set, as it was actually performed. The unit is the movement's own. */
export type SetResult = {
  sessionId: string;
  at: Date;
  movementId: string;
  /** 0-based within the movement, so the last set is the highest index. */
  setIndex: number;
  target: number;
  achieved: number;
  loadKg: number | null;
  /** Reps in reserve, 1 to 10, or null when it was not asked for. */
  rir: number | null;
};

/**
 * The 2-for-2 trigger, and its grade is [C], convention.
 *
 * Haff and Triplett, Essentials of Strength Training and Conditioning, 4th ed,
 * chapter 17, page 459, verbatim: "If the athlete can perform two or more
 * repetitions over his or her assigned repetition goal for a given exercise in
 * the last set in two consecutive workouts, weight should be added." Its own
 * source is a coaching book and not a trial, which is why the app says out loud
 * that the SIZE of the step is convention. The trigger is defensible. The
 * magnitude is not measured, and pretending otherwise is the whole problem with
 * every progression algorithm that came before this one.
 */
export const OVER_TARGET_BY = 2;
export const CONSECUTIVE_SESSIONS = 2;

/** The last set of each session for one movement, oldest session first. */
export function lastSetsPerSession(history: SetResult[], movementId: string): SetResult[] {
  const byMovement = history.filter((set) => set.movementId === movementId);
  const bySession = new Map<string, SetResult>();
  for (const set of byMovement) {
    const held = bySession.get(set.sessionId);
    if (!held || set.setIndex > held.setIndex) bySession.set(set.sessionId, set);
  }
  return [...bySession.values()].sort((left, right) => left.at.getTime() - right.at.getTime());
}

export type Advancement = {
  movementId: string;
  /** What changes: the load in kilograms, the rep target, or the movement itself. */
  lever: 'load' | 'reps' | 'variation';
  fromLoadKg: number | null;
  toLoadKg: number | null;
  fromTarget: number;
  toTarget: number;
  /** The movement it becomes, when the lever is a harder variation. */
  toMovementId: string | null;
  /** The two sessions that triggered it, oldest first, for the card to name. */
  triggeredBy: Array<{ sessionId: string; at: Date; target: number; achieved: number }>;
};

/**
 * The increments, and every one of them is convention.
 *
 * NSCA's own table for the less trained is absolute rather than a percentage:
 * 1 to 2 kg upper body, 2 to 4 kg lower. ACSM 2009's alternative was 2 to 10
 * percent at its own evidence category B, sourced to a 1999 review, and the
 * 2026 position stand dropped progression as a requirement altogether. The
 * lower number of each pair is used, because a beginner who is about to be
 * asked for more reps as well should not be asked for both at the full step.
 */
const LOAD_STEP_KG = { upper: 1, lower: 2 };
const REP_STEP = 2;
const HOLD_STEP_SECONDS = 5;

const LOWER_BODY = ['quadriceps', 'hamstrings', 'glutes', 'calves', 'hip-abductors'];

function loadStepFor(movementId: string): number {
  const movement = movementOf(movementId);
  const lower = movement?.muscles.some((muscle) => LOWER_BODY.includes(muscle)) ?? false;
  return lower ? LOAD_STEP_KG.lower : LOAD_STEP_KG.upper;
}

/**
 * Does this movement's history meet the trigger, and what does the app propose.
 *
 * Null is the common answer and it is the right one: the 2026 position stand
 * says in its own abstract that "progression is not necessary to achieve
 * beneficial outcomes", so a week with no advancement in it is a normal week
 * and never a failure.
 *
 * NOTHING HERE APPLIES ANYTHING. It returns a proposal. The write happens when
 * the owner confirms it on the screen that showed it to him, which is
 * DESIGN.md section 5's first decision and the reason there is no other path.
 */
export function proposeAdvancement(history: SetResult[], movementId: string): Advancement | null {
  const movement = movementOf(movementId);
  if (!movement) return null;
  const lastSets = lastSetsPerSession(history, movementId);
  if (lastSets.length < CONSECUTIVE_SESSIONS) return null;

  const recent = lastSets.slice(-CONSECUTIVE_SESSIONS);
  const cleared = recent.every((set) => set.achieved - set.target >= OVER_TARGET_BY);
  if (!cleared) return null;

  const triggeredBy = recent.map((set) => ({
    sessionId: set.sessionId,
    at: set.at,
    target: set.target,
    achieved: set.achieved,
  }));
  const latest = recent[recent.length - 1];
  const currentLoad = latest.loadKg;

  // Loaded and loadable: the weight goes up and the rep target stays where it
  // is, which is what the 2-for-2 rule actually says to do.
  if (movement.loadable && currentLoad !== null && currentLoad > 0) {
    return {
      movementId,
      lever: 'load',
      fromLoadKg: currentLoad,
      toLoadKg: currentLoad + loadStepFor(movementId),
      fromTarget: latest.target,
      toTarget: latest.target,
      toMovementId: null,
      triggeredBy,
    };
  }

  // Unloaded, and already at the top of its band: reps have run out as a lever,
  // so leverage takes over. Kotarsky 2018 put a harder push-up variation against
  // a bench press and both groups gained, p<0.001, with no difference in muscle
  // thickness. A fixed load is not a ceiling.
  const step = movement.unit === 'second' ? HOLD_STEP_SECONDS : REP_STEP;
  if (latest.target >= movement.high) {
    const harder = harderThan(movementId);
    if (harder) {
      return {
        movementId,
        lever: 'variation',
        fromLoadKg: currentLoad,
        toLoadKg: currentLoad,
        fromTarget: latest.target,
        toTarget: harder.low,
        toMovementId: harder.id,
        triggeredBy,
      };
    }
  }

  return {
    movementId,
    lever: 'reps',
    fromLoadKg: currentLoad,
    toLoadKg: currentLoad,
    fromTarget: latest.target,
    toTarget: Math.min(latest.target + step, movement.high),
    toMovementId: null,
    triggeredBy,
  };
}

/**
 * The one session-length comparison the evidence supports, stated as a fact.
 *
 * Frandsen 2025, Br J Sports Med 59(17):1203-1210, n=5,205 and 588,071
 * sessions: a session more than 10 percent longer than the longest in the past
 * 30 days carried HRR 1.64 (1.31-2.05), while spikes in the acute-chronic ratio
 * and the week-to-week ratio were not associated with an increased injury rate
 * at all. So the threshold is 110 percent of the 30-day longest, and what the
 * screen says is the percentage and nothing else.
 */
export const SESSION_LENGTH_WINDOW_DAYS = 30;
export const SESSION_LENGTH_CEILING = 1.1;

export type LengthFact = {
  minutes: number;
  longestMinutes: number;
  /** How much longer, as a whole percentage. 22 reads "22% longer". */
  percentLonger: number;
  flagged: boolean;
};

export function sessionLengthFact(
  minutes: number,
  previous: Array<{ minutes: number; at: Date }>,
  now: Date,
): LengthFact | null {
  const from = now.getTime() - SESSION_LENGTH_WINDOW_DAYS * 86_400_000;
  const inWindow = previous.filter((session) => session.at.getTime() >= from);
  if (inWindow.length === 0) return null;
  const longestMinutes = Math.max(...inWindow.map((session) => session.minutes));
  if (longestMinutes <= 0) return null;
  const ratio = minutes / longestMinutes;
  return {
    minutes,
    longestMinutes,
    percentLonger: Math.round((ratio - 1) * 100),
    flagged: ratio > SESSION_LENGTH_CEILING,
  };
}

/**
 * The pain rule, from Silbernagel 2007, Am J Sports Med 35(6):897-906, verbatim:
 * pain "was allowed to reach level 5 on the visual analog scale... during the
 * exercise training. The pain after the exercise program was allowed to reach 5
 * on the VAS but should have subsided by the following morning. Pain and
 * stiffness... were not allowed to increase from week to week."
 *
 * In that trial, n=38, continuing to load under this model was no worse than six
 * weeks of rest and both groups improved. So the rule is permission with a
 * ceiling, not a warning, and the app words it that way.
 */
export const PAIN_CEILING = 5;
export const PAIN_SCALE_MAX = 10;

export type PainReport = {
  at: Date;
  sessionId: string;
  /** The catalogue key of a site, or `none`. Never free text: sites are compared. */
  site: string;
  duringScore: number;
  subsidedByMorning: boolean | null;
};

export type PainProblem = 'aboveCeiling' | 'notSubsided' | 'roseFromLastWeek';

export function painProblems(current: PainReport, lastWeek: PainReport | null): PainProblem[] {
  const problems: PainProblem[] = [];
  if (current.site === 'none') return problems;
  if (current.duringScore > PAIN_CEILING) problems.push('aboveCeiling');
  if (current.subsidedByMorning === false) problems.push('notSubsided');
  if (lastWeek && lastWeek.site === current.site && current.duringScore > lastWeek.duringScore) {
    problems.push('roseFromLastWeek');
  }
  return problems;
}

/**
 * The report the week-to-week limb is read against: the same site, in the week
 * before the week the current report sits in.
 *
 * SEVEN TO FOURTEEN DAYS, AND BOUNDED AT BOTH ENDS. Silbernagel's rule is that
 * pain "was not allowed to increase from week to week", which is a comparison
 * with last week and not with the last time this site ever hurt. An unbounded
 * "most recent earlier report at this site" would compare a knee today against
 * a knee in March and call five months of recovery an increase.
 *
 * The most recent report inside that window, because at three to five sessions
 * a week there can be several. Taking the most recent is the literal reading of
 * week against week; taking the worst would make a bad Monday last week excuse
 * a worse Monday this week, and taking the best would flag half the weeks in a
 * normal training block.
 */
export function lastWeekAtSameSite(
  reports: PainReport[],
  current: PainReport,
): PainReport | null {
  if (current.site === 'none') return null;
  const from = current.at.getTime() - 14 * 86_400_000;
  const to = current.at.getTime() - 7 * 86_400_000;
  return (
    [...reports]
      .filter(
        (report) =>
          report.site === current.site &&
          report.at.getTime() >= from &&
          report.at.getTime() <= to,
      )
      .sort((left, right) => right.at.getTime() - left.at.getTime())[0] ?? null
  );
}

/** Why the app is backing off, and the site it is backing off on. */
export type PainVerdict = {
  site: string;
  reason: PainProblem | 'repeatedSite';
};

/**
 * THE WHOLE PAIN RULE, IN ONE ANSWER, AND IT IS THE ONLY THING THAT DECIDES.
 *
 * The player states four sentences to the owner as he logs a session: up to 5
 * of 10 during is allowed, it has to be gone by the next morning, it must be no
 * worse than last week, and the same site twice running cuts the volume. Three
 * of those four were stated and enforced nowhere. `painProblems` existed, was
 * correct, was tested, and was imported by exactly one file in this repository:
 * its own unit test. Everything that actually decides read `repeatedSite` and
 * nothing else, so a knee that went from 2 to 5 in a week, or one that was
 * still there in the morning, advanced the movement anyway.
 *
 * So the rule has one entry point now and both deciding paths call it: the week
 * proposer, which cuts volume, and the advancement sweep, which refuses to
 * propose. Backing off stays the only automatic action in this file. What
 * changed is that it reads the whole rule instead of a quarter of it.
 *
 * The order is precedence, bluntest first, because the owner gets one sentence
 * and it should be the one that explains the most. Two reports at the same site
 * outranks a single bad one.
 */
export function painVerdict(reports: PainReport[]): PainVerdict | null {
  const ordered = [...reports].sort((left, right) => left.at.getTime() - right.at.getTime());
  const repeated = repeatedSite(ordered);
  if (repeated) return { site: repeated, reason: 'repeatedSite' };

  const current = ordered[ordered.length - 1];
  if (!current || current.site === 'none') return null;

  const problems = painProblems(current, lastWeekAtSameSite(ordered.slice(0, -1), current));
  for (const reason of ['aboveCeiling', 'notSubsided', 'roseFromLastWeek'] as const) {
    if (problems.includes(reason)) return { site: current.site, reason };
  }
  return null;
}

/**
 * The same site twice running, which deloads and never advances. Grade [C],
 * and it is deliberately blunt: two reports at the knee is the app backing off
 * without being asked. It is one limb of the rule above and never the whole of
 * it; `painVerdict` is what anything outside this file asks.
 */
export function repeatedSite(reports: PainReport[]): string | null {
  const ordered = [...reports].sort((left, right) => left.at.getTime() - right.at.getTime());
  const withPain = ordered.filter((report) => report.site !== 'none');
  if (ordered.length < 2 || withPain.length < 2) return null;
  const last = ordered[ordered.length - 1];
  const before = ordered[ordered.length - 2];
  if (last.site === 'none' || before.site === 'none') return null;
  return last.site === before.site ? last.site : null;
}

/**
 * The deload, framed as fatigue and adherence management and never as a
 * performance intervention, because no RCT shows a scheduled deload improves
 * long-term outcomes and both controlled trials are null to negative. Coleman
 * 2024's full week off cost 3.6 kg of squat one-rep maximum and bought nothing.
 *
 * Cut sets by 30 to 50 percent, keep the frequency, keep the exercise selection.
 * A third is inside that band and never takes a movement below one set.
 */
export function deloadSets(sets: number): number {
  return Math.max(1, Math.round(sets * (2 / 3)));
}

/** Does this movement advance at all, given what pain has been reported. */
export function advancementBlocked(reports: PainReport[]): boolean {
  return painVerdict(reports) !== null;
}

/**
 * The two effort scales, and neither one is Borg's.
 *
 * `rir` is reps in reserve: one question, how many more could you have done,
 * answered 1 to 10. The concept is plain language; Zourdos 2016's table is
 * copyright NSCA and Wolters Kluwer and is paraphrased, never reproduced.
 *
 * `cdc` is the public-domain 0 to 10 relative intensity scale from the CDC's
 * "How to Measure Physical Activity Intensity", reviewed 4 December 2025, where
 * 0 is the effort of sitting and 10 is maximal effort, moderate is 5 to 6 and
 * vigorous is 7 to 8. It is reproducible with attribution and a non-endorsement
 * line, both of which the screen carries.
 *
 * The Borg scales are licence gated: BorgPerception AB is the exclusive
 * distributor, a licence and a fee are required, and their own FAQ calls
 * renamed anchor sets forgeries. No anchor word of theirs appears anywhere in
 * this repository.
 */
export const RIR_MIN = 1;
export const RIR_MAX = 10;
export const CDC_MIN = 0;
export const CDC_MAX = 10;
export const CDC_MODERATE = { low: 5, high: 6 };
export const CDC_VIGOROUS = { low: 7, high: 8 };

/**
 * The working-set target, RIR 1 to 3, is [A] graded and applies from week 5.
 * For the first four weeks the app logs the answer and prescribes nothing from
 * it: Halperin 2022 found people underpredict by about a rep, and Zourdos 2021
 * put the error at 3.65 +/- 2.46 reps when the answer is 7. A target built on
 * that in week one is a target built on noise.
 */
export const RIR_TARGET = { low: 1, high: 3 };
export const RIR_FAMILIARISATION_WEEKS = 4;

export function prescribesFromEffort(weekNumber: number): boolean {
  return weekNumber > RIR_FAMILIARISATION_WEEKS;
}
