import { describe, expect, it } from 'vitest';
import { energyProvenance } from '@/lib/display';

/**
 * F79. A computed energy is distinguishable from a published one.
 *
 * The food screen rendered the chip "Computed energy" unconditionally, so
 * ciqual:1000, whose 274 kcal Anses published, wore the identical chip, the
 * identical colour and the identical background as ciqual:1010, whose energy
 * this app worked out from macronutrients. Only the paragraph inside the panel
 * differed, and on a published food it read "Every ingredient here carries an
 * energy value Anses published" on a screen with no ingredients on it.
 *
 * WHAT WOULD MAKE THIS GO RED: one chip for two sources, which is what shipped,
 * or the recipe's ingredient sentence coming back on a single food.
 */
describe('the energy marker marks the computed ones', () => {
  const computed = energyProvenance('computed_atwater');
  const published = energyProvenance('published');
  const absent = energyProvenance(null);

  it('gives each of the three sources its own words', () => {
    console.log(
      `computed: "${computed.chip}" (${computed.className}); ` +
        `published: "${published.chip}" (${published.className}); ` +
        `absent: "${absent.chip}" (${absent.className})`,
    );
    expect(new Set([computed.chip, published.chip, absent.chip]).size).toBe(3);
    expect(new Set([computed.body, published.body, absent.body]).size).toBe(3);
  });

  it('draws the computed one differently, without spending a semantic colour', () => {
    // DESIGN.md: origin is not a state, so it never takes a colour. The dashed
    // edge is the mark for a number this product produced rather than received.
    expect(computed.className).toBe('src est');
    expect(published.className).toBe('src');
    expect(computed.className).not.toBe(published.className);
  });

  it('names the regulation on the computed one and nothing about ingredients on a food', () => {
    expect(computed.body).toContain('1169/2011');
    expect(published.body).not.toContain('ingredient');
    expect(published.body).not.toContain('1169/2011');
    expect(absent.body).toContain('unknown');
  });

  it('carries the column value as its own flag, unchanged', () => {
    expect(computed.flag).toBe('computed_atwater');
    expect(published.flag).toBe('published');
    expect(absent.flag).toBe('none');
    // An unknown value reads as absence rather than as a published number.
    expect(energyProvenance('something_a_later_slice_invents').chip).toBe(absent.chip);
  });
});
