/**
 * The words the weekly review is not allowed to say, and the matcher that
 * finds them.
 *
 * THE PANEL'S FINDING, VERBATIM: two missed sessions because Thursday ran late
 * is Tuesday, not a failure state. A product like this reaches for exactly five
 * phrases when it wants to sound engaged, and each of them turns a record of a
 * week into a judgement of a person. So they are a list, the list is here, and
 * `tests/unit/review-copy.test.ts` walks every string the review can put on a
 * screen or in an email against it.
 *
 * The five the plan names are the first five below, and they are not
 * negotiable. The rest are the same move in different clothes and were added
 * from the wireframe's own caption, which says the review carries no score, no
 * streak and no message about consistency.
 *
 * WHAT IS DELIBERATELY NOT HERE. "missed" on its own is allowed, because
 * "Wednesday was missed, your calendar was full 18:00 to 22:30" is a fact with
 * a cause and it is what screen 11 draws. What is banned is "missed target",
 * which is the same word doing moral work. The difference between those two is
 * the whole of F121, so the list has to be able to express it, which is why it
 * matches phrases and not just words.
 *
 * WHAT WOULD MAKE THE TEST GO RED. Writing "you only logged 5 days" instead of
 * "5 of 7 days have a food log". Writing "3 of 4, behind last week". Colouring
 * a session that did not happen. The test carries a positive control that
 * proves the matcher itself still bites, because a denylist that has stopped
 * matching reads exactly like copy that is clean.
 */

export const GUILT_DENYLIST = [
  // The five PLAN.md names.
  'failed',
  'missed target',
  'only',
  'behind',
  'streak broken',
  // The same move, from the wireframe caption and from the panel's language.
  'score',
  'streak',
  'consistency',
  'should have',
  'fell short',
  'slacked',
  'lazy',
  'discipline',
  'willpower',
  'excuse',
  'cheat day',
  'bad week',
  'disappointing',
  'let yourself down',
  'guilt',
] as const;

export type GuiltMatch = { phrase: string; at: number; context: string };

/**
 * Every denylisted phrase in a string, with where it sat and what surrounded
 * it.
 *
 * Word boundaries on both ends, so "only" does not fire on "commonly" and
 * "score" does not fire on "scoreboard"... which it would want to, so
 * "scoreboard" is caught by "score" being a whole word inside it only when it
 * IS a whole word. The trade is deliberate: a matcher that fires on substrings
 * cries wolf on ordinary English, and a check somebody switches off is worth
 * nothing at all.
 */
export function guiltMatches(text: string): GuiltMatch[] {
  const found: GuiltMatch[] = [];
  for (const phrase of GUILT_DENYLIST) {
    const pattern = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    for (const hit of text.matchAll(pattern)) {
      found.push({
        phrase,
        at: hit.index,
        context: text.slice(Math.max(0, hit.index - 30), hit.index + phrase.length + 30),
      });
    }
  }
  return found;
}

/** True when a string carries nothing on the list. */
export function isGuiltFree(text: string): boolean {
  return guiltMatches(text).length === 0;
}

/**
 * A number presented as a score, which the review never does.
 *
 * Adherence is "3 of 4" and never "75%", because a percentage of a plan is a
 * mark out of a hundred whatever it is called. Fractions with their denominator
 * on the screen are the shape F118 asks for and this allows; a bare percentage
 * beside a session count is what it refuses.
 */
export function looksLikeAScore(text: string): boolean {
  return /\b\d{1,3}\s?%/.test(text) || /\b\d+\s*(?:\/|out of)\s*(?:10|100)\b/.test(text);
}
