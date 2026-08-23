/**
 * The numbers nutrition is allowed to use, in one file, each one carrying the
 * paper it came from.
 *
 * `.forge/research/nutrition-data.md` section 6.3 is the source and it binds.
 * Nothing here is a convention copied off a calculator page: the activity
 * multipliers are the FAO/WHO/UNU 2004 physical activity level bands, not the
 * 1.2 / 1.375 / 1.55 / 1.725 / 1.9 ladder every online calculator repeats,
 * because that ladder has no primary source and its bottom rung sits below the
 * FAO/WHO/UNU floor for any ambulatory adult.
 *
 * The three floors below are implemented and not promised. A target under the
 * estimated resting figure warns. A target under 1500 kcal for a man is refused
 * until the owner confirms it on a screen that names a professional. A planned
 * rate of loss above one percent of body weight a week is refused outright and
 * the nearest compliant rate is offered in its place.
 */

/** The conversion factors, kcal per gram, EU Regulation 1169/2011 Annex XIV. */
export const ATWATER = {
  protein: 4,
  carbohydrate: 4,
  polyols: 2.4,
  fat: 9,
  fibre: 2,
  alcohol: 7,
  organicAcid: 3,
} as const;

export const NUTRITION = {
  /**
   * Mifflin-St Jeor 1990, Am J Clin Nutr 51:241-247, PMID 2305711. The Academy
   * of Nutrition and Dietetics Evidence Analysis Library names it as the
   * equation to use when indirect calorimetry is not available.
   */
  bmrEquation: 'mifflin_st_jeor',
  /**
   * FAO/WHO/UNU 2004, Human energy requirements, expert consultation. Sedentary
   * or light 1.40 to 1.69, moderately active 1.70 to 1.99, vigorous 2.00 to
   * 2.40. The four values offered sit inside those bands.
   */
  palBand: { low: 1.4, high: 1.9 },
  pal: { sedentary: 1.4, light: 1.55, active: 1.7, veryActive: 1.9 },
  palDefault: 1.55,
  /** Static approximation. Hall 2011, Lancet 378:826-837, PMID 21872751. */
  kcalPerKgBodyFat: 7700,
  maxWeeklyLossKg: 1.0,
  maxWeeklyLossFractionOfBodyWeight: 0.01,
  /** NHLBI upper bound on a daily deficit. */
  maxDailyDeficitKcal: 1000,
  hardFloorKcalMale: 1500,
  hardFloorKcalFemale: 1200,
  /** Morton 2018, Br J Sports Med 52:376-384, PMID 28698222. */
  proteinGPerKg: { min: 1.6, target: 1.8, max: 2.2 },
  /** ANSES reference intake for an adult. */
  fibreGPerDay: 30,
  fatMinGPerKg: 0.8,
  fatMinFractionOfEnergy: 0.2,
  /** Rounding, from section 6.4. Outward, never inward. */
  roundKcalComputed: 10,
  roundKcalEstimated: 25,
  roundMacroEstimatedG: 5,
  /** Below this share of recipe mass resolved, the number renders as a range. */
  coverageRangeThresholdPct: 85,
  /** Lucassen 2021 band for an estimate with no reference object. */
  photoEstimateBand: { low: 0.75, high: 1.35 },
} as const;

/**
 * The energy a food carries, computed from its macronutrients.
 *
 * Used in two places and defined in one: `scripts/build-food-seed.mjs` fills in
 * the rows Anses publishes no energy for, and the unit test grades the factors
 * against the regulation. A second copy in the script is how the seed and the
 * app end up disagreeing about what a kilocalorie is.
 *
 * Returns null when a macronutrient is missing, because a sum with an unknown
 * term is unknown and not smaller. That is the same rule the recipe sum
 * applies, one level up.
 */
export function atwaterEnergy(parts: {
  protein: number | null;
  carb: number | null;
  fat: number | null;
  fibre: number | null;
  polyols: number | null;
  alcohol: number | null;
  organicAcids: number | null;
}): number | null {
  const { protein, carb, fat, fibre, polyols, alcohol, organicAcids } = parts;
  if (protein === null || carb === null || fat === null) return null;
  const availableCarb = Math.max(0, carb - (polyols ?? 0));
  return (
    ATWATER.protein * protein +
    ATWATER.carbohydrate * availableCarb +
    ATWATER.polyols * (polyols ?? 0) +
    ATWATER.fat * fat +
    ATWATER.fibre * (fibre ?? 0) +
    ATWATER.alcohol * (alcohol ?? 0) +
    ATWATER.organicAcid * (organicAcids ?? 0)
  );
}

export type Sex = 'male' | 'female';

export type PalLevel = 'sedentary' | 'light' | 'active' | 'veryActive';

export type BodyFacts = {
  sex: Sex;
  ageYears: number;
  heightCm: number;
  weightKg: number;
};

/**
 * Mifflin-St Jeor resting metabolic rate, unrounded.
 *
 *   men:   10 x weight_kg + 6.25 x height_cm - 5 x age + 5
 *   women: 10 x weight_kg + 6.25 x height_cm - 5 x age - 161
 *
 * For 38 years, male, 183 cm, 89.0 kg this is 890 + 1143.75 - 190 + 5, which is
 * 1848.75 and renders 1849. F80 checks that number to within 1 kcal.
 */
export function restingMetabolicRate(body: BodyFacts): number {
  const base = 10 * body.weightKg + 6.25 * body.heightCm - 5 * body.ageYears;
  return body.sex === 'male' ? base + 5 : base - 161;
}

/** The multiplier for a named level, which is always inside the published band. */
export function palOf(level: PalLevel): number {
  return NUTRITION.pal[level];
}

/**
 * Total daily energy expenditure: the resting figure times the activity level.
 * At PAL 1.55 the worked example is 1848.75 x 1.55, which is 2865.56 and
 * renders 2866.
 */
export function totalDailyEnergy(body: BodyFacts, level: PalLevel): number {
  return restingMetabolicRate(body) * palOf(level);
}

/** True when a multiplier sits inside the FAO/WHO/UNU band this app will use. */
export function palIsPublished(pal: number): boolean {
  return pal >= NUTRITION.palBand.low && pal <= NUTRITION.palBand.high;
}

/**
 * The fastest weekly loss this app will plan, in kg: the stricter of one
 * kilogram a week and one percent of body weight a week. For 89.0 kg that is
 * 0.89 kg, which is the number F81 refuses above.
 */
export function maxWeeklyLossKg(weightKg: number): number {
  const fraction = weightKg * NUTRITION.maxWeeklyLossFractionOfBodyWeight;
  // Two decimals, because the number is offered back to the owner as the rate
  // he may have, and 0.8900000000000001 is not an offer.
  //
  // DOWN AND NEVER TO THE NEAREST. Rounding to the nearest would offer 0.56 to
  // a 55.5 kg body whose real ceiling is 0.555, and the check constraint in
  // 0009 computes the real ceiling: the screen would offer a rate the database
  // then refused, which is the worst shape a refusal can take. Rounding down is
  // always inside the guideline and is at most a hundredth of a kilogram
  // slower than it needs to be.
  return Math.floor(Math.min(NUTRITION.maxWeeklyLossKg, fraction) * 100) / 100;
}

/** The daily deficit a weekly rate implies, at the static 7700 kcal per kg. */
export function deficitForRate(rateKgPerWeek: number): number {
  return (rateKgPerWeek * NUTRITION.kcalPerKgBodyFat) / 7;
}

export type TargetInput = {
  body: BodyFacts;
  level: PalLevel;
  /** Planned loss, kg a week. Zero holds weight, negative gains it. */
  rateKgPerWeek: number;
  /** True when the owner has confirmed a target under the hard floor. */
  hardFloorConfirmed?: boolean;
};

export type TargetVerdict =
  /** The rate itself is refused. Nothing is computed, and a rate is offered back. */
  | { outcome: 'rate_refused'; requestedRate: number; offeredRate: number; weightKg: number }
  /** Under the hard floor and not confirmed. Blocked, and the floor is named. */
  | {
      outcome: 'blocked_below_floor';
      kcal: number;
      floor: number;
      rmr: number;
      tdee: number;
    }
  /** Allowed. `cautions` names every threshold the target sits under or over. */
  | {
      outcome: 'allowed';
      kcal: number;
      rmr: number;
      tdee: number;
      deficit: number;
      cautions: TargetCaution[];
    };

export type TargetCaution = 'below_resting' | 'below_hard_floor_confirmed' | 'deficit_above_cap';

/**
 * The whole of F81, in one function, so no screen can reach a target that
 * skipped a floor.
 *
 * Order matters and it is the order the guidance is written in. The rate is
 * refused first, because a rate above one percent of body weight a week is not
 * a target that needs a warning, it is a plan this app will not draw: there is
 * no confirmation that unlocks it, only a slower rate. Then the hard floor,
 * which blocks until the owner confirms on a screen that recommends a
 * professional. Then the soft floor, which allows and explains.
 */
export function planTarget(input: TargetInput): TargetVerdict {
  const { body, level, rateKgPerWeek } = input;
  const rmr = restingMetabolicRate(body);
  const tdee = restingMetabolicRate(body) * palOf(level);
  const ceiling = maxWeeklyLossKg(body.weightKg);

  if (rateKgPerWeek > ceiling) {
    return {
      outcome: 'rate_refused',
      requestedRate: rateKgPerWeek,
      offeredRate: ceiling,
      weightKg: body.weightKg,
    };
  }

  const deficit = deficitForRate(rateKgPerWeek);
  const kcal = Math.round(tdee - deficit);
  const floor =
    body.sex === 'male' ? NUTRITION.hardFloorKcalMale : NUTRITION.hardFloorKcalFemale;

  if (kcal < floor && !input.hardFloorConfirmed) {
    return { outcome: 'blocked_below_floor', kcal, floor, rmr, tdee };
  }

  const cautions: TargetCaution[] = [];
  if (kcal < Math.round(rmr)) cautions.push('below_resting');
  if (kcal < floor) cautions.push('below_hard_floor_confirmed');
  if (deficit > NUTRITION.maxDailyDeficitKcal) cautions.push('deficit_above_cap');

  return { outcome: 'allowed', kcal, rmr, tdee, deficit, cautions };
}

export type MacroTargets = {
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
  fibreG: number;
};

/**
 * The macronutrient floors, so a target is not only a calorie number.
 *
 * Protein anchors to body weight, fat to the higher of 0.8 g per kg and a fifth
 * of the energy, fibre to the ANSES adult reference, and carbohydrate takes
 * whatever remains. There is no carbohydrate floor because there is no
 * mainstream basis for one in a general fat-loss plan.
 */
export function macroTargets(kcal: number, weightKg: number): MacroTargets {
  const proteinG = Math.round(weightKg * NUTRITION.proteinGPerKg.target);
  const fatByWeight = weightKg * NUTRITION.fatMinGPerKg;
  const fatByEnergy = (kcal * NUTRITION.fatMinFractionOfEnergy) / ATWATER.fat;
  const fatG = Math.round(Math.max(fatByWeight, fatByEnergy));
  const remaining = kcal - proteinG * ATWATER.protein - fatG * ATWATER.fat;
  const carbG = Math.max(0, Math.round(remaining / ATWATER.carbohydrate));
  return { kcal, proteinG, carbG, fatG, fibreG: NUTRITION.fibreGPerDay };
}
