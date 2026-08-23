/**
 * Heart-rate guidance, and everything this product refuses to say about it.
 *
 * `.forge/research/training-rules.md` part 1 binds this file and where it and
 * an instinct disagree, it wins. Four rules come straight out of it:
 *
 * 1. TANAKA, NOT 220 MINUS AGE. 208 - 0.7a, J Am Coll Cardiol 2001;37(1):153-6,
 *    a meta-analysis of 351 studies and 18,712 subjects with a cross-validation
 *    of 514, which gives 181 at 38. Fox's 220 - age was never a regression: its
 *    own figure legend says "no single line will adequately represent the data".
 *    Martin 2025, n=230 at mean age 38.5, is the one validation centred on this
 *    owner's age and Tanaka has the best mean absolute error in it, 7.40.
 *
 * 2. RANGES, NEVER A POINT TARGET. That same paper, verbatim: the limits of
 *    agreement "were wide across all equations (+/-18-24 bpm)... could shift an
 *    individual across two heart rate training zones". A single number on a
 *    screen is a claim the arithmetic cannot support, so every band this file
 *    returns is a low and a high, and the screen prints the uncertainty beside
 *    them in the product's own words.
 *
 * 3. ONE ANCHOR PER SCREEN. Percent heart-rate reserve when a resting heart
 *    rate is stored, percent maximum when it is not, and never both: at a
 *    resting rate of 60 the two disagree by eight beats at the bottom of the
 *    moderate band, and a screen showing both is a screen the owner has to
 *    arbitrate between.
 *
 * 4. NO DIAL, NO SCORE, NO NUMBER ABOUT INJURY. A five-zone consumer dial as
 *    the primary interface does not ship: Iannetta 2020, n=100 with maximal
 *    lactate steady state verified, found the first threshold anywhere from 60
 *    to 90 percent of maximum, and every vendor fixes the same band at 60 to 70.
 *    This app does not read heart rate at all, live or otherwise. The only
 *    in-session intensity control is the talk test, which is section 1.9's
 *    sanctioned framing: a ceiling, not a selector.
 *
 * Pure and dependency free, so the unit suite grades the arithmetic itself.
 */

/** The owner's age, from the brief. One user, so this is configuration, not a form. */
export const OWNER_AGE = 38;

/**
 * Tanaka. Rounded to a whole beat because a heart rate is counted in beats and
 * 181.4 would be a precision the equation does not have.
 */
export function tanakaMaximum(age: number): number {
  return Math.round(208 - 0.7 * age);
}

/** The four ACSM bands, in the order they are read. Garber 2011, Table 5. */
export const BANDS = ['light', 'moderate', 'vigorous', 'nearMaximal'] as const;

export type Band = (typeof BANDS)[number];

/**
 * Garber 2011 Table 5, the two columns this app can use. %HRR and %VO2R share
 * one column in that table: the same number, identical across the 8th, 10th and
 * 11th editions of the guidelines.
 *
 * The near-maximal band has no published top, so its high is the maximum
 * itself. Nothing in this product ever prescribes it; it is here so the band a
 * reading falls in can be named honestly.
 */
const PERCENTAGES: Record<Band, { hrrLow: number; hrrHigh: number; maxLow: number; maxHigh: number }> = {
  light: { hrrLow: 0.3, hrrHigh: 0.39, maxLow: 0.57, maxHigh: 0.63 },
  moderate: { hrrLow: 0.4, hrrHigh: 0.59, maxLow: 0.64, maxHigh: 0.76 },
  vigorous: { hrrLow: 0.6, hrrHigh: 0.89, maxLow: 0.77, maxHigh: 0.95 },
  nearMaximal: { hrrLow: 0.9, hrrHigh: 1, maxLow: 0.96, maxHigh: 1 },
};

/** Which arithmetic produced the numbers. Exactly one of them is ever on screen. */
export type Anchor = 'reserve' | 'maximum';

export type BandRange = {
  band: Band;
  low: number;
  high: number;
  /** True for the top band, whose published range is open ended above its low. */
  openEnded: boolean;
};

export type Guidance = {
  anchor: Anchor;
  age: number;
  maximum: number;
  /** The resting heart rate the reserve was computed from, or null. */
  restingHeartRate: number | null;
  reserve: number | null;
  bands: BandRange[];
};

/**
 * The bands, computed once, from whichever anchor the stored data supports.
 *
 * Karvonen for the reserve: target = rest + intensity x (maximum - rest), Ann
 * Med Exp Biol Fenn 1957;35(3):307-315. Preferred whenever a resting heart rate
 * is known because %HRR tracks %VO2R on the line of identity (Swain and
 * Leutholtz 1997: intercept -0.1 +/- 0.6, slope 1.00 +/- 0.01), while %HRmax
 * does not.
 */
export function guidanceFor(restingHeartRate: number | null, age = OWNER_AGE): Guidance {
  const maximum = tanakaMaximum(age);
  const usable = restingHeartRate !== null && restingHeartRate > 0 && restingHeartRate < maximum;
  const reserve = usable ? maximum - restingHeartRate! : null;
  const bands = BANDS.map((band) => {
    const percentage = PERCENTAGES[band];
    const low = usable
      ? Math.round(restingHeartRate! + percentage.hrrLow * reserve!)
      : Math.round(percentage.maxLow * maximum);
    const high = usable
      ? Math.round(restingHeartRate! + percentage.hrrHigh * reserve!)
      : Math.round(percentage.maxHigh * maximum);
    return { band, low, high, openEnded: band === 'nearMaximal' };
  });
  return {
    anchor: usable ? 'reserve' : 'maximum',
    age,
    maximum,
    restingHeartRate: usable ? restingHeartRate : null,
    reserve,
    bands,
  };
}

export function bandOf(guidance: Guidance, band: Band): BandRange {
  return guidance.bands.find((range) => range.band === band)!;
}

/**
 * How wide the individual error is, in beats, at this age.
 *
 * Martin 2025 prints the limits of agreement as +/-18 to 24 bpm and the mean
 * absolute error at 7.40 for Tanaka. Both numbers are on the screen beside the
 * band, because a range drawn without them still reads as a measurement.
 */
export const ESTIMATE_ERROR = { meanAbsolute: 7.4, agreementLow: 18, agreementHigh: 24 };

/**
 * Past this many minutes of continuous work, heart rate drifts up the band with
 * no change in intensity: %HRR exceeds %VO2R by 6.7 points at 45 minutes
 * against 0.7 at 15 (PeerJ 2022, DOI 10.7717/peerj.13190). The app says so and
 * hands over to the talk test rather than telling the owner he sped up.
 */
export const DRIFT_AFTER_MINUTES = 30;

/**
 * The talk test, and it is a ceiling rather than a selector.
 *
 * ACSM declines to endorse it as a primary prescription method and ACSM/ESSA
 * 2025 says it may be used "conservatively... to try and limit cardiorespiratory
 * exercise to below the High-intensity training category". So it is drawn as one
 * line the owner checks himself against, and never as a control that sets a
 * target. The wording on screen is the NHS phrasing, reviewed 22 May 2024, and
 * it lives in the catalogue like every other string.
 */
export const TALK_TEST_BANDS = ['moderate', 'vigorous'] as const;
