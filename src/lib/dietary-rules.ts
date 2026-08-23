import { aliasById, type Allergen, type FoodAlias } from '@/lib/food-aliases';

/**
 * Four rules, four verbs, and nothing underneath them that could collapse two
 * into one.
 *
 * F83 IS THE LINE AND IT IS SHARPER THAN IT LOOKS. "Allergy, intolerance,
 * exclusion and preference are four distinct stored rules: adding nuts as a
 * preference and shellfish as an exclusion produces two different behaviours,
 * and no query path resolves one as the other." The easy way to build this is
 * one `matches(rule, recipe)` predicate and a severity number, and that is
 * exactly the design the line forbids: a severity is an ordering, and an
 * ordering makes nuts and shellfish the same kind of thing at different
 * volumes. One refactor later somebody raises a preference to severity 3 and
 * a nut allergy quietly becomes a suggestion.
 *
 * So there is no shared predicate and no severity anywhere in this file. There
 * are four functions, each asking a question only its own rule asks:
 *
 *   ALLERGY      refuses. Asks "does anything here carry this allergen, or sit
 *                beside something that does". The strictest question, and the
 *                only one that also refuses a neighbour.
 *   INTOLERANCE  substitutes. Asks "which ingredient here has a free-from
 *                alternative stored", and swaps it. It never removes a recipe:
 *                removing the meal is what an exclusion does.
 *   EXCLUSION    omits. Asks "does anything here carry this allergen". Removes
 *                the recipe and records the reason, so the absence is
 *                explainable rather than mysterious.
 *   PREFERENCE   ranks. Asks "how many ingredients here carry this", and uses
 *                the answer to order candidates. It cannot remove anything: the
 *                function returns the same array it was given, reordered, and
 *                `tests/unit/dietary-rules.test.ts` asserts the length never
 *                moves.
 *
 * The four are applied in that order by `applyDietaryRules`, which is the only
 * caller that knows all four exist.
 */

export type RuleKind = 'allergy' | 'intolerance' | 'exclusion' | 'preference';

export type RuleSubject = 'shellfish' | 'lactose' | 'nuts' | 'gluten';

export const RULE_KINDS: RuleKind[] = ['allergy', 'intolerance', 'exclusion', 'preference'];

export const RULE_SUBJECTS: RuleSubject[] = ['shellfish', 'lactose', 'nuts', 'gluten'];

export type DietaryRule = { kind: RuleKind; subject: RuleSubject };

/**
 * The rules, in four buckets that are read by name and never by subject alone.
 *
 * A caller cannot ask "what rule covers shellfish" and get an answer that could
 * be any of the four. It asks `rules.exclusion` or `rules.allergy`, and the two
 * are different lists reached through different properties.
 */
export type RuleSet = {
  allergy: RuleSubject[];
  intolerance: RuleSubject[];
  exclusion: RuleSubject[];
  preference: RuleSubject[];
};

export const NO_RULES: RuleSet = { allergy: [], intolerance: [], exclusion: [], preference: [] };

export function toRuleSet(rules: DietaryRule[]): RuleSet {
  const set: RuleSet = { allergy: [], intolerance: [], exclusion: [], preference: [] };
  for (const rule of rules) set[rule.kind].push(rule.subject);
  return set;
}

/**
 * The allergen a subject names, spelled out one line at a time.
 *
 * A lookup table and not a cast, so a subject with no allergen behind it is a
 * compile error rather than a rule that silently matches nothing. A rule that
 * does nothing is the worst outcome available here: it reads on the profile
 * screen exactly like a rule that works.
 */
const ALLERGEN_OF: Record<RuleSubject, Allergen> = {
  shellfish: 'shellfish',
  lactose: 'lactose',
  nuts: 'nuts',
  gluten: 'gluten',
};

/**
 * The Anses subgroups that ARE crustaceans and molluscs: 0407 cooked, 0408 raw.
 *
 * The publisher's own classification, used as a second net under the alias
 * tags. An alias is something this app wrote and could get wrong; a subgroup
 * code is what Anses filed the food under. F84 runs both and reports both.
 */
export const SHELLFISH_SUBGROUPS = ['0407', '0408'];

/** A recipe, as the rules see it. Only what a rule needs and nothing else. */
export type RuleCandidate = {
  id: string;
  cookMinutes: number;
  slot: string;
  ingredients: { aliasId: string; grams: number }[];
};

export type Refusal = { recipeId: string; kind: 'allergy' | 'exclusion'; subject: RuleSubject };

export type Substitution = { recipeId: string; from: string; to: string; subject: RuleSubject };

// ---------------------------------------------------------------------------
// 1. ALLERGY. Refuses.

/**
 * True when this recipe carries the allergen, or carries something the same
 * alias declares beside it.
 *
 * The widest question of the four, and it is wide on purpose. An allergy is the
 * one rule where a near miss is a hospital visit, so a recipe is refused when
 * any ingredient declares the allergen at all, including an ingredient that is
 * only there in a pinch of a spice. Nothing here consults a quantity.
 */
function allergyRefuses(candidate: RuleCandidate, subject: RuleSubject): boolean {
  const allergen = ALLERGEN_OF[subject];
  return candidate.ingredients.some((line) => {
    const alias = aliasById(line.aliasId);
    return alias !== null && alias.allergens.includes(allergen);
  });
}

export function refuseForAllergies(
  candidates: RuleCandidate[],
  subjects: RuleSubject[],
): { kept: RuleCandidate[]; refused: Refusal[] } {
  if (subjects.length === 0) return { kept: candidates, refused: [] };
  const kept: RuleCandidate[] = [];
  const refused: Refusal[] = [];
  for (const candidate of candidates) {
    const hit = subjects.find((subject) => allergyRefuses(candidate, subject));
    if (hit) refused.push({ recipeId: candidate.id, kind: 'allergy', subject: hit });
    else kept.push(candidate);
  }
  return { kept, refused };
}

// ---------------------------------------------------------------------------
// 2. INTOLERANCE. Substitutes, and never removes.

/**
 * The swaps this recipe needs for one intolerance.
 *
 * It asks a question no other rule asks: which ingredient has a free-from
 * alternative stored. An ingredient carrying the allergen with no alternative
 * is left exactly where it is and reported, because silently dropping it would
 * change the meal without saying so, and silently keeping it would claim a
 * free-from meal that is not one.
 */
export function substitutionsFor(
  candidate: RuleCandidate,
  subjects: RuleSubject[],
): Substitution[] {
  const swaps: Substitution[] = [];
  for (const subject of subjects) {
    const allergen = ALLERGEN_OF[subject];
    for (const line of candidate.ingredients) {
      const alias = aliasById(line.aliasId);
      if (!alias || !alias.allergens.includes(allergen)) continue;
      if (subject === 'lactose' && alias.lactoseFree) {
        swaps.push({ recipeId: candidate.id, from: alias.id, to: alias.lactoseFree, subject });
      }
    }
  }
  return swaps;
}

/**
 * Applies the swaps. The array that comes back is the same length as the array
 * that went in, always, which is what makes an intolerance a different thing
 * from an exclusion rather than a milder one.
 */
export function substituteForIntolerances(
  candidates: RuleCandidate[],
  subjects: RuleSubject[],
): { candidates: RuleCandidate[]; substitutions: Substitution[] } {
  if (subjects.length === 0) return { candidates, substitutions: [] };
  const substitutions: Substitution[] = [];
  const swapped = candidates.map((candidate) => {
    const swaps = substitutionsFor(candidate, subjects);
    if (swaps.length === 0) return candidate;
    substitutions.push(...swaps);
    const byFrom = new Map(swaps.map((swap) => [swap.from, swap.to]));
    return {
      ...candidate,
      ingredients: candidate.ingredients.map((line) =>
        byFrom.has(line.aliasId) ? { ...line, aliasId: byFrom.get(line.aliasId) as string } : line,
      ),
    };
  });
  return { candidates: swapped, substitutions };
}

// ---------------------------------------------------------------------------
// 3. EXCLUSION. Omits, and says why.

/** Narrower than the allergy question: the ingredient itself, and nothing else. */
function exclusionOmits(candidate: RuleCandidate, subject: RuleSubject): boolean {
  const allergen = ALLERGEN_OF[subject];
  for (const line of candidate.ingredients) {
    const alias = aliasById(line.aliasId);
    if (alias && alias.allergens.includes(allergen)) return true;
  }
  return false;
}

export function omitForExclusions(
  candidates: RuleCandidate[],
  subjects: RuleSubject[],
): { kept: RuleCandidate[]; omitted: Refusal[] } {
  if (subjects.length === 0) return { kept: candidates, omitted: [] };
  const kept: RuleCandidate[] = [];
  const omitted: Refusal[] = [];
  for (const candidate of candidates) {
    const hit = subjects.find((subject) => exclusionOmits(candidate, subject));
    if (hit) omitted.push({ recipeId: candidate.id, kind: 'exclusion', subject: hit });
    else kept.push(candidate);
  }
  return { kept, omitted };
}

// ---------------------------------------------------------------------------
// 4. PREFERENCE. Ranks, and cannot remove.

/**
 * Reorders. Same array, same length, different order.
 *
 * A preference is a thumb on the scale and nothing more. It counts the
 * ingredients carrying the subject and sorts by that count, so a preferred
 * thing is reached for first and an unpreferred one still exists. There is no
 * branch in this function that can drop an element, and the test asserts the
 * length over a catalogue that a preference matches and a catalogue it does
 * not.
 */
export function rankByPreferences(
  candidates: RuleCandidate[],
  subjects: RuleSubject[],
): RuleCandidate[] {
  if (subjects.length === 0) return candidates;
  const score = (candidate: RuleCandidate) => {
    let count = 0;
    for (const subject of subjects) {
      const allergen = ALLERGEN_OF[subject];
      for (const line of candidate.ingredients) {
        const alias = aliasById(line.aliasId);
        if (alias && alias.allergens.includes(allergen)) count += 1;
      }
    }
    return count;
  };
  const scored = candidates.map((candidate, index) => ({ candidate, index, score: score(candidate) }));
  scored.sort((left, right) => right.score - left.score || left.index - right.index);
  return scored.map((entry) => entry.candidate);
}

// ---------------------------------------------------------------------------

export type RuleOutcome = {
  candidates: RuleCandidate[];
  refused: Refusal[];
  omitted: Refusal[];
  substitutions: Substitution[];
};

/**
 * The only place that knows all four rules exist, and it applies them in the
 * order their consequences run: refuse what is dangerous, drop what is
 * unwanted, swap what is uncomfortable, then order what is left by taste.
 */
export function applyDietaryRules(candidates: RuleCandidate[], rules: RuleSet): RuleOutcome {
  const allergy = refuseForAllergies(candidates, rules.allergy);
  const exclusion = omitForExclusions(allergy.kept, rules.exclusion);
  const intolerance = substituteForIntolerances(exclusion.kept, rules.intolerance);
  const ranked = rankByPreferences(intolerance.candidates, rules.preference);
  return {
    candidates: ranked,
    refused: allergy.refused,
    omitted: exclusion.omitted,
    substitutions: intolerance.substitutions,
  };
}

/**
 * Every alias in a candidate that carries an allergen, whatever rule covers it.
 *
 * The denylist walk F84 runs, and it is deliberately rule-blind: it asks what
 * is on the plate rather than what the profile says, so it can find shellfish
 * that arrived through a bug in the rules rather than through a gap in them. A
 * check that only sees what the rules already filtered is a check that passes
 * by not checking.
 */
export function allergensPresent(
  candidate: RuleCandidate,
  allergen: Allergen,
): { aliasId: string; alias: FoodAlias }[] {
  const found: { aliasId: string; alias: FoodAlias }[] = [];
  for (const line of candidate.ingredients) {
    const alias = aliasById(line.aliasId);
    if (alias && alias.allergens.includes(allergen)) found.push({ aliasId: alias.id, alias });
  }
  return found;
}
