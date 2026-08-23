import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { atwaterEnergy } from '@/lib/nutrition';
import { parseFoodCsv, splitCsvLine, TABLE_VERSION } from '@/db/foods';
import { allAliases, aliasFoodId } from '@/lib/food-aliases';
import { RECIPE_CATALOGUE } from '@/lib/recipe-catalogue';

/**
 * The committed food seed, graded as a file.
 *
 * F78 fixes a floor of 2,298 rows carrying energy, protein, carbohydrate, fat
 * and fibre, and fixes that a missing nutrient is stored null. This walks the
 * file that is actually committed rather than a fixture, so a build that
 * regenerated it from a different release, or one that quietly coerced a blank
 * to zero, fails here before it reaches a screen.
 *
 * A ZERO IS EVIDENCE ONLY BESIDE THE POPULATION IT COVERED, so every count
 * below is printed and every one of them is asserted non-empty. A run over an
 * empty file would otherwise read exactly like a run that found nothing wrong.
 */

const SEED = join(process.cwd(), 'drizzle', 'seed', 'foods.csv');
const FOUR_HUNDRED_KB = 400 * 1024;

describe('the committed CIQUAL seed', () => {
  const text = readFileSync(SEED, 'utf8');
  const rows = parseFoodCsv(text);

  test('it is under 400 KB, which is what the research budgeted', () => {
    const bytes = statSync(SEED).size;
    console.log(`food seed: ${bytes} bytes, ${rows.length} rows`);
    expect(bytes).toBeLessThan(FOUR_HUNDRED_KB);
    expect(bytes).toBeGreaterThan(100_000);
  });

  test('at least 2,298 rows carry all five nutrients', () => {
    const allFive = rows.filter(
      (row) =>
        row.kcal100g !== null &&
        row.proteinG !== null &&
        row.carbG !== null &&
        row.fatG !== null &&
        row.fibreG !== null,
    );
    console.log(`food seed: ${allFive.length} of ${rows.length} rows carry all five nutrients`);
    expect(rows.length).toBeGreaterThan(0);
    expect(allFive.length).toBeGreaterThanOrEqual(2298);
  });

  test('a missing nutrient is null and is not stored as zero', () => {
    const nullFibre = rows.filter((row) => row.fibreG === null);
    const zeroFibre = rows.filter((row) => row.fibreG === 0);
    console.log(
      `food seed: ${nullFibre.length} rows carry no fibre value, ${zeroFibre.length} carry a measured or censored zero`,
    );
    // Both populations must exist, or the distinction this line turns on is
    // untested: a file with no nulls proves nothing about how nulls are stored.
    expect(nullFibre.length).toBeGreaterThan(0);
    expect(zeroFibre.length).toBeGreaterThan(0);
    for (const row of nullFibre) expect(row.fibreG).toBeNull();
  });

  test('every row carrying an energy value says where the energy came from', () => {
    const published = rows.filter((row) => row.energySource === 'published');
    const computed = rows.filter((row) => row.energySource === 'computed_atwater');
    const none = rows.filter((row) => row.energySource === null);
    console.log(
      `food seed: ${published.length} published, ${computed.length} computed by Atwater, ${none.length} with no energy`,
    );
    expect(published.length).toBeGreaterThan(0);
    expect(computed.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.kcal100g === null).toBe(row.energySource === null);
    }
  });

  test('every row names the publisher version the licence obliges', () => {
    for (const row of rows) expect(row.tableVersion).toBe(TABLE_VERSION);
  });

  test('a censored value is a zero that says it is a ceiling', () => {
    const censored = rows.filter((row) => (row.censoredFields ?? []).length > 0);
    console.log(`food seed: ${censored.length} rows carry at least one censored field`);
    expect(censored.length).toBeGreaterThan(0);
    for (const row of censored.slice(0, 50)) {
      for (const field of row.censoredFields ?? []) {
        const value = (row as unknown as Record<string, number | null>)[
          field.replace('_100g', '100g').replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
        ];
        expect(value === 0 || value === null).toBe(true);
      }
    }
  });

  test('no energy value exceeds what a food can physically carry', () => {
    for (const row of rows) {
      if (row.kcal100g === null) continue;
      expect(row.kcal100g).toBeLessThanOrEqual(900);
      expect(row.kcal100g).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('the CSV reader agrees with the writer', () => {
  test('a quoted field holding a comma survives the round trip', () => {
    expect(splitCsvLine('1,"Salmon, raw",04,0406')).toEqual(['1', 'Salmon, raw', '04', '0406']);
  });

  test('a doubled quote inside a quoted field is one quote', () => {
    expect(splitCsvLine('1,"a ""b"" c"')).toEqual(['1', 'a "b" c']);
  });

  test('an empty field reads as an empty string and becomes null, not zero', () => {
    const parsed = parseFoodCsv(
      'alim_code,name_fr,group_code,subgroup_code,kcal_100g,protein_g,carb_g,fat_g,fibre_g,energy_source,censored\n' +
        '1,Test,02,0201,,1.2,,3.4,,,\n',
    );
    expect(parsed[0].kcal100g).toBeNull();
    expect(parsed[0].carbG).toBeNull();
    expect(parsed[0].fibreG).toBeNull();
    expect(parsed[0].proteinG).toBe(1.2);
  });
});

describe('the EU 1169/2011 conversion factors', () => {
  test('the sum is protein 4, carbohydrate 4, polyols 2.4, fat 9, fibre 2, alcohol 7', () => {
    expect(
      atwaterEnergy({ protein: 10, carb: 0, fat: 0, fibre: 0, polyols: 0, alcohol: 0, organicAcids: 0 }),
    ).toBeCloseTo(40, 5);
    expect(
      atwaterEnergy({ protein: 0, carb: 10, fat: 0, fibre: 0, polyols: 0, alcohol: 0, organicAcids: 0 }),
    ).toBeCloseTo(40, 5);
    expect(
      atwaterEnergy({ protein: 0, carb: 10, fat: 0, fibre: 0, polyols: 10, alcohol: 0, organicAcids: 0 }),
    ).toBeCloseTo(24, 5);
    expect(
      atwaterEnergy({ protein: 0, carb: 0, fat: 10, fibre: 0, polyols: 0, alcohol: 0, organicAcids: 0 }),
    ).toBeCloseTo(90, 5);
    expect(
      atwaterEnergy({ protein: 0, carb: 0, fat: 0, fibre: 10, polyols: 0, alcohol: 0, organicAcids: 0 }),
    ).toBeCloseTo(20, 5);
    expect(
      atwaterEnergy({ protein: 0, carb: 0, fat: 0, fibre: 0, polyols: 0, alcohol: 10, organicAcids: 0 }),
    ).toBeCloseTo(70, 5);
  });

  test('a missing macronutrient makes the sum unknowable rather than smaller', () => {
    expect(
      atwaterEnergy({ protein: null, carb: 10, fat: 1, fibre: 0, polyols: 0, alcohol: 0, organicAcids: 0 }),
    ).toBeNull();
  });
});

describe('the alias layer resolves against the file that ships', () => {
  const rows = parseFoodCsv(readFileSync(SEED, 'utf8'));
  const byId = new Map(rows.map((row) => [row.id, row]));

  test('every alias names a food row that exists', () => {
    const aliases = allAliases();
    console.log(`alias layer: ${aliases.length} aliases against ${rows.length} food rows`);
    expect(aliases.length).toBeGreaterThan(0);
    for (const alias of aliases) {
      expect(byId.has(aliasFoodId(alias))).toBe(true);
    }
  });

  test('every recipe ingredient names an alias that exists', () => {
    const ids = new Set(allAliases().map((alias) => alias.id));
    let lines = 0;
    for (const recipe of RECIPE_CATALOGUE) {
      for (const line of recipe.ingredients) {
        lines += 1;
        expect(ids.has(line.aliasId)).toBe(true);
      }
    }
    console.log(`catalogue: ${RECIPE_CATALOGUE.length} recipes, ${lines} ingredient lines`);
    expect(lines).toBeGreaterThan(0);
  });

  test('the catalogue reaches at least one row whose energy Vernier computed', () => {
    const computed = allAliases().filter(
      (alias) => byId.get(aliasFoodId(alias))?.energySource === 'computed_atwater',
    );
    console.log(
      `alias layer: ${computed.length} alias(es) point at a computed-energy row: ${computed
        .map((alias) => alias.id)
        .join(', ')}`,
    );
    expect(computed.length).toBeGreaterThan(0);
  });

  test('the catalogue reaches at least one row with no published fibre', () => {
    const missing = allAliases().filter((alias) => byId.get(aliasFoodId(alias))?.fibreG === null);
    console.log(
      `alias layer: ${missing.length} alias(es) point at a row with no fibre: ${missing
        .map((alias) => alias.id)
        .join(', ')}`,
    );
    expect(missing.length).toBeGreaterThan(0);
  });
});
