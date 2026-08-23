import { aliasById, aliasName, allAliases } from '@/lib/food-aliases';

/**
 * One artifact the owner already holds, read on this machine.
 *
 * WHAT IS NOT IN THIS FILE, AND WILL NOT BE. No hostname to sign in to, no
 * credential, no cookie jar, no crawl, no schedule, and no fetch of any kind.
 * `.forge/research/scout.md`, verified 2026-08-21: the provider publishes no
 * personal-use recipe API, its terms page refused an automated fetch, and every
 * working importer in the wild is an unofficial scraper against undocumented
 * internal endpoints. The lawful scope is the artifact in the owner's hand.
 *
 * FOUR ARTIFACTS, ONE PARSER UNDERNEATH. A pasted link gives a name and a
 * reference. A downloaded PDF, a photograph of the card and typed lines all
 * give text, and text goes through `parseIngredientLines` whichever of the
 * three it came from. One parser is why the four imports cannot drift apart,
 * and it is why the manual path is not a lesser one: it is the same path with
 * the reading step already done.
 *
 * A LINK IS NOT FETCHED, AND THAT IS THE DESIGN RATHER THAN A LIMITATION. The
 * owner pastes a link to a page he is looking at; Vernier reads the words in it
 * and keeps the link as the provenance of the recipe. Opening a socket to that
 * host from a server is automated access, which is the one thing the terms are
 * unambiguous about, and it would make `docs/product.md` untrue on the day it
 * was written.
 */

export type ArtifactKind = 'link' | 'document' | 'photo' | 'manual';

export const ARTIFACT_KINDS: ArtifactKind[] = ['link', 'document', 'photo', 'manual'];

export type ParsedLine = {
  /** The alias this line resolved to, or null when nothing matched. */
  aliasId: string | null;
  grams: number | null;
  /** The line as it was written, kept for the source record. Never rendered. */
  raw: string;
};

export type ParsedRecipe = {
  name: string;
  servings: number;
  lines: ParsedLine[];
  matched: number;
  unmatched: number;
};

/**
 * Weights for the two spoon measures a recipe card uses, in grams.
 *
 * USDA FNDDS 2021-2023, Portions and Weights, through
 * `.forge/research/nutrition-data.md` section 7: one tablespoon of oil or
 * butter is 14 g. A teaspoon is a third of a tablespoon, so 5 g to the nearest
 * gram. These are the only two non-metric units this parser understands, and
 * anything else is left unresolved rather than guessed at.
 */
const SPOON_GRAMS: Record<string, number> = { tbsp: 14, tablespoon: 14, tsp: 5, teaspoon: 5 };

/**
 * Lower case, one space between words, and the decimal separators kept.
 *
 * The dot and the comma stay because they are part of a number: stripping them
 * turned "1.5 kg" into "1 5 kg" and the kilogram rule then read the 5, which is
 * a recipe asking for five kilograms of potatoes. Found by the test that reads
 * a decimal quantity, which is why that test is there.
 */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9'.,\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function singular(word: string): string {
  if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith('oes') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

function words(text: string): string[] {
  return normalise(text)
    .split(' ')
    .map((word) => word.replace(/[.,]+$/, ''))
    .filter(Boolean)
    .map(singular);
}

/**
 * The alias a line of a recipe card is about.
 *
 * Matched on the words of the alias name and the words of its identifier, both
 * singularised, and the best match wins by how many of the alias's own words
 * the line contains. A line matching nothing stays unmatched and is counted:
 * silently dropping it would make a recipe's coverage look better than it is,
 * which is the number slice 9 built to stop exactly this.
 */
export function matchAlias(line: string): string | null {
  const lineWords = new Set(words(line));
  let best: { id: string; score: number } | null = null;
  for (const alias of allAliases()) {
    const target = new Set([...words(aliasName(alias)), ...words(alias.id.replace(/-/g, ' '))]);
    let hits = 0;
    for (const word of target) if (lineWords.has(word)) hits += 1;
    if (hits === 0) continue;
    const score = hits / target.size;
    if (!best || score > best.score) best = { id: alias.id, score };
  }
  /*
   * MORE than half the alias's own words have to be in the line, which for a
   * two-word alias means both of them. A single shared word is a coincidence as
   * often as it is a match: "oil" scored 0.5 against "olive oil" and put fat in
   * a recipe that had none.
   *
   * The cost is real and it is the right way round. A card line reading "150 g
   * chicken" does not resolve to chicken breast, so it is counted as unresolved
   * and the screen says one line was not counted. An unresolved line the owner
   * can see beats a resolved line that is wrong.
   */
  return best && best.score > 0.5 ? best.id : null;
}

/**
 * The grams a line asks for.
 *
 * Grams and kilograms are read as written. A bare count is multiplied by the
 * alias's own item weight, which is the number the shopping list already uses,
 * so "2 salmon fillets" is 260 g here and two fillets on the list. A spoon is
 * the FNDDS weight. Anything else returns null and the line is counted as
 * unresolved rather than given an invented weight.
 */
export function gramsOf(line: string, aliasId: string | null): number | null {
  const text = normalise(line);
  const kilo = text.match(/(\d+(?:[.,]\d+)?)\s*kg\b/);
  if (kilo) return Math.round(Number(kilo[1].replace(',', '.')) * 1000);
  const grams = text.match(/(\d+(?:[.,]\d+)?)\s*g\b/);
  if (grams) return Math.round(Number(grams[1].replace(',', '.')));
  const spoon = text.match(/(\d+(?:[.,]\d+)?)\s*(tbsp|tablespoon|tsp|teaspoon)/);
  if (spoon) return Math.round(Number(spoon[1].replace(',', '.')) * SPOON_GRAMS[spoon[2]]);
  const count = text.match(/^(\d+)\b/);
  if (count && aliasId) {
    const alias = aliasById(aliasId);
    if (alias?.itemGrams) return Number(count[1]) * alias.itemGrams;
  }
  return null;
}

export function parseIngredientLines(text: string): ParsedLine[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => {
      const aliasId = matchAlias(line);
      return { aliasId, grams: gramsOf(line, aliasId), raw: line };
    });
}

/**
 * The recipe name out of a pasted link.
 *
 * The last path segment of a recipe URL is a slug and a slug is words with
 * hyphens between them. Nothing is fetched to learn this: it is in the string
 * the owner pasted. A link with no usable segment gives an empty name and the
 * import screen asks him to type one, which is honest about what a URL alone
 * can tell you.
 */
export function nameFromLink(url: string): string {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return '';
  }
  const segment = path.split('/').filter(Boolean).at(-1) ?? '';
  const slug = segment.replace(/\.[a-z0-9]+$/i, '').replace(/-\w{6,}$/, '');
  const spaced = slug.replace(/[-_]+/g, ' ').trim();
  if (spaced === '') return '';
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function isHttpLink(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/** The four answers the second portion can have, and no fifth. */
export const SECOND_PORTION_ANSWERS = ['next_day', 'moved', 'frozen'] as const;

export type SecondPortionAnswer = (typeof SECOND_PORTION_ANSWERS)[number];

export function isSecondPortionAnswer(value: string): value is SecondPortionAnswer {
  return (SECOND_PORTION_ANSWERS as readonly string[]).includes(value);
}

/**
 * Where the two portions of one imported recipe land.
 *
 * The first is the day it is cooked. The second defaults to the same meal the
 * next day, which is what actually happens to a two-portion box recipe and is
 * why F90 makes it the default rather than a question with no answer. The
 * question is still asked, per recipe, and the answer moves the second portion
 * or takes it out of the week.
 *
 * `moved` goes two days on rather than one, which is the next free dinner in a
 * week where the following day already holds the second portion of the other
 * recipe. It is deterministic on purpose: a screen that asks the owner to pick
 * a day and then places it somewhere else is worse than one that says where it
 * will go.
 */
export function secondPortionOffsetDays(answer: SecondPortionAnswer): number | null {
  if (answer === 'next_day') return 1;
  if (answer === 'moved') return 2;
  return null;
}
