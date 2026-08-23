/**
 * The screening gate, and it is the ACSM 2015 algorithm rather than PAR-Q+.
 *
 * WHY NOT PAR-Q+. The current version is PAR-Q+ 2025 and its own page 4 says
 * "You must use the entire questionnaire and NO changes are permitted", and its
 * downloads page says the questionnaire "must remain unaltered and may not be
 * incorporated into electronic surveys, research tools, or any derivative
 * materials without the express written consent of the PAR-Q+ Collaboration".
 * A native-screen re-implementation is a derivative in an electronic survey.
 * Its text appears nowhere in this repository, in a screen, a comment or a
 * test, and `tests/unit/no-licensed-text.test.ts` walks the tree and says so.
 *
 * WHAT SHIPS INSTEAD. Riebe, Franklin, Thompson, Garber, Whitfield, Magal,
 * Pescatello, MSSE 2015;47(11):2473-2479, reproduced verbatim with permission
 * in Whitfield 2017, PMCID PMC7059860, which is the free copy this build reads.
 * Three inputs and no risk-factor count: that paper removed risk-factor
 * profiling deliberately, verbatim, because it "may be overly conservative and
 * unnecessarily refer adults for medical clearance".
 *
 * The symptom list is published and is reproduced as published. The words are
 * catalogue keys like every other string; the KEYS are here, in the order the
 * paper prints them, because the order is part of the list.
 */

/** Input one: is he currently doing regular planned exercise. */
export type ActivityLevel = 'active' | 'inactive';

/** Input three: how hard he wants to work. */
export type DesiredIntensity = 'lightModerate' | 'vigorous';

/**
 * Input two, in the paper's own order, "at rest or during activity". Nine
 * items, each one a key into `strings.readiness.symptoms`.
 */
export const SYMPTOM_KEYS = [
  'chestDiscomfort',
  'shortnessOfBreath',
  'dizziness',
  'orthopnea',
  'ankleEdema',
  'palpitations',
  'claudication',
  'murmur',
  'unusualFatigue',
] as const;

export type SymptomKey = (typeof SYMPTOM_KEYS)[number];

export type ScreeningAnswer = {
  activity: ActivityLevel;
  /** Known cardiovascular, metabolic or renal disease. */
  knownDisease: boolean;
  /** Which of the nine were reported. An empty list is an answer, not an absence. */
  symptoms: SymptomKey[];
  desiredIntensity: DesiredIntensity;
};

/**
 * The three outcomes. There is no score anywhere in this file and there never
 * will be: the paper's output is a referral decision, and a number derived from
 * it would be this product inventing a measurement it does not have.
 */
export type ScreeningOutcome = 'proceed' | 'proceedGradually' | 'clearanceFirst';

export type Screening = {
  outcome: ScreeningOutcome;
  /** Which input decided it, so the screen can say why in one line. */
  because: 'symptomsOrDisease' | 'inactiveWantsVigorous' | 'clear';
};

export function screen(answer: ScreeningAnswer): Screening {
  if (answer.knownDisease || answer.symptoms.length > 0) {
    return { outcome: 'clearanceFirst', because: 'symptomsOrDisease' };
  }
  if (answer.activity === 'inactive' && answer.desiredIntensity === 'vigorous') {
    // Verbatim for exactly this person: an asymptomatic, disease-free, inactive
    // adult is "recommended to begin light to moderate intensity physical
    // exercise without clearance, and gradually progress".
    return { outcome: 'proceedGradually', because: 'inactiveWantsVigorous' };
  }
  return { outcome: 'proceed', because: 'clear' };
}

/**
 * The stop rule, which is the same list read at a different moment. Any listed
 * symptom at rest or during activity stops the session; this is not advice the
 * player gives once at the start and forgets.
 */
export function stopsTheSession(symptoms: SymptomKey[]): boolean {
  return symptoms.length > 0;
}

/**
 * The one urgent combination, [A] graded: pain plus swelling plus weakness plus
 * dark urine is exertional rhabdomyolysis until a doctor says otherwise. Tietze
 * and Borchers, Sports Health 2014;6(4):336-339, PMCID PMC4065559.
 *
 * It is four facts together and never a score, and the screen states the four
 * rather than computing anything from them.
 */
export const URGENT_SIGNS = ['pain', 'swelling', 'weakness', 'darkUrine'] as const;

/** How long a screening answer stands before the app asks again. */
export const SCREENING_VALID_DAYS = 365;

export function screeningIsCurrent(answeredAt: Date | null, now: Date): boolean {
  if (!answeredAt) return false;
  return now.getTime() - answeredAt.getTime() < SCREENING_VALID_DAYS * 86_400_000;
}
