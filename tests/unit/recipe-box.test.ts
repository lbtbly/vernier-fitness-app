import { describe, expect, test } from 'vitest';
import {
  ARTIFACT_KINDS,
  gramsOf,
  isHttpLink,
  isSecondPortionAnswer,
  matchAlias,
  nameFromLink,
  parseIngredientLines,
  secondPortionOffsetDays,
} from '@/lib/recipe-box';

/**
 * One artifact the owner already holds, parsed on this machine. F91.
 *
 * FOUR KINDS, ONE PARSER. A link gives a name; a PDF, a photograph and typed
 * lines all give text, and the same function reads all three. The tests below
 * drive that function with the shape of a real recipe card.
 *
 * WHAT WOULD MAKE THESE GO RED. A matcher that resolved on one shared word
 * turns "1 tbsp olive oil" into olives; the threshold is asserted directly. A
 * parser that defaulted an unreadable quantity to some number fails the
 * unresolved block, which asserts null. And a second-portion answer that
 * silently became "next day" fails the last block, which asserts three
 * different placements for three different answers.
 */

describe('an ingredient line resolves to a food or to nothing', () => {
  test('a plain gram line resolves both halves', () => {
    const [line] = parseIngredientLines('200 g potatoes');
    expect(line.aliasId).toBe('potatoes');
    expect(line.grams).toBe(200);
  });

  test('kilograms are read as kilograms', () => {
    expect(gramsOf('1.5 kg potatoes', 'potatoes')).toBe(1500);
  });

  test('a count uses the shop item weight the list already knows', () => {
    // Two salmon fillets, at the 130 g the alias carries for one fillet.
    expect(gramsOf('2 salmon fillets', 'salmon')).toBe(260);
  });

  test('a tablespoon is the FNDDS weight and not a guess', () => {
    // USDA FNDDS Portions and Weights: one tablespoon of oil is 14 g.
    expect(gramsOf('1 tbsp olive oil', 'olive-oil')).toBe(14);
    expect(gramsOf('2 tablespoons olive oil', 'olive-oil')).toBe(28);
  });

  test('a quantity this parser cannot read stays null rather than becoming a number', () => {
    expect(gramsOf('a handful of green beans', 'green-beans')).toBeNull();
  });

  test('a line naming nothing in the food table resolves to null and is still counted', () => {
    const lines = parseIngredientLines('200 g potatoes\n1 sachet of the spice mix\n120 g green beans');
    expect(lines).toHaveLength(3);
    expect(lines.map((line) => line.aliasId)).toEqual(['potatoes', null, 'green-beans']);
    // Counted, not dropped: three lines in, three lines out, one unresolved.
    expect(lines.filter((line) => line.aliasId === null)).toHaveLength(1);
  });

  test('one shared word is not a match', () => {
    // "oil" alone must not resolve to olive oil, which is the coincidence that
    // makes a naive matcher put fat in every recipe it reads.
    expect(matchAlias('oil')).toBeNull();
    expect(matchAlias('olive oil')).toBe('olive-oil');
  });

  test('a plural card line still matches the singular alias', () => {
    expect(matchAlias('3 tomatoes, chopped')).toBe('tomatoes');
    expect(matchAlias('250 g of green beans')).toBe('green-beans');
  });
});

describe('a pasted link is read as a string and never fetched', () => {
  test('the slug gives a candidate name', () => {
    expect(nameFromLink('https://www.hellofresh.fr/recipes/salmon-with-green-beans-6123abc4')).toBe(
      'Salmon with green beans',
    );
  });

  test('a link with nothing usable in it gives nothing rather than a guess', () => {
    expect(nameFromLink('https://example.com/')).toBe('');
    expect(nameFromLink('not a url')).toBe('');
  });

  test('only http and https are links at all', () => {
    expect(isHttpLink('https://example.com/x')).toBe(true);
    expect(isHttpLink('file:///etc/passwd')).toBe(false);
    expect(isHttpLink('javascript:alert(1)')).toBe(false);
  });
});

describe('the four artifacts and the three answers are closed sets', () => {
  test('four kinds, and a fifth is not one', () => {
    expect(ARTIFACT_KINDS).toEqual(['link', 'document', 'photo', 'manual']);
    expect(ARTIFACT_KINDS).toHaveLength(4);
  });

  test('three answers, and each one places the second portion differently', () => {
    expect(isSecondPortionAnswer('next_day')).toBe(true);
    expect(isSecondPortionAnswer('binned')).toBe(false);

    expect(secondPortionOffsetDays('next_day')).toBe(1);
    expect(secondPortionOffsetDays('moved')).toBe(2);
    // Frozen has no day at all, which is why the column is nullable and the
    // check constraint refuses a frozen row that carries an instant.
    expect(secondPortionOffsetDays('frozen')).toBeNull();

    const placements = new Set(
      (['next_day', 'moved', 'frozen'] as const).map((answer) => String(secondPortionOffsetDays(answer))),
    );
    expect(placements.size).toBe(3);
  });
});
