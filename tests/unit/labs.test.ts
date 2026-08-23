import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_ANALYTES,
  BUILT_IN_ANALYTE_KEYS,
  analyteOfLabel,
  checkLabValue,
  convertPrinted,
  isCensored,
  keyForAddedAnalyte,
  normaliseLabel,
  parseFrenchNumber,
  printedUnitsOf,
} from '@/lib/labs';
import { strings } from '@/lib/strings';

/**
 * The analyte catalogue's rules and the unit arithmetic, which is the part of
 * this slice that can be wrong by a factor of five and still look plausible on a
 * screen.
 */

function analyte(key: string) {
  return BUILT_IN_ANALYTES.find((entry) => entry.key === key)!;
}

describe('the thirteen F57 names', () => {
  it('are thirteen, and each one is the analyte the line names', () => {
    console.log(`labs: catalogue holds ${BUILT_IN_ANALYTE_KEYS.join(', ')}`);
    expect(BUILT_IN_ANALYTE_KEYS).toEqual([
      'fasting_glucose',
      'hba1c',
      'total_cholesterol',
      'hdl_cholesterol',
      'ldl_cholesterol',
      'non_hdl_cholesterol',
      'triglycerides',
      'alt',
      'ast',
      'ggt',
      'creatinine',
      'crp',
      'ferritin',
    ]);
  });

  it('each has a catalogue key for its name, so no screen renders the database fallback', () => {
    // The seed in drizzle/pending/07-blood.sql carries an English label for a
    // psql reader, and `analyteLabel` never reads it for a built-in analyte
    // because `strings.metrics` holds the word. This is what makes that
    // fallback unreachable rather than merely unlikely, and it is the assertion
    // that goes red if a fourteenth built-in is ever added without its key.
    const labels = strings.metrics as Record<string, string>;
    for (const key of BUILT_IN_ANALYTE_KEYS) {
      expect(labels[key], key).toBeTruthy();
    }
  });

  it('each cites a public source and states a band that is a band', () => {
    for (const entry of BUILT_IN_ANALYTES) {
      expect(entry.sourceUrl, entry.key).toMatch(/^https:\/\//);
      expect(entry.low, entry.key).toBeLessThan(entry.high);
      expect(printedUnitsOf(entry).length, entry.key).toBeGreaterThan(0);
      // The stored unit is always among the printed ones, at factor 1. An
      // analyte whose own unit it could not accept would refuse a sheet that
      // printed the canonical unit, which is most French sheets after 2020.
      const own = entry.printed.find((printed) => printed.unit === entry.unit);
      expect(own, entry.key).toBeDefined();
      expect(own!.factor, entry.key).toBe(1);
      // Every unit symbol has a catalogue key, because it is drawn beside a
      // number on a screen. C6 covers a unit like anything else.
      for (const printed of entry.printed) {
        expect((strings.units as Record<string, string>)[printed.unit], printed.unit).toBeTruthy();
      }
    }
  });

  it('holds no analyte that means blood pressure', () => {
    // Two locks and this is the first. The second is a trigger in
    // drizzle/pending/07-blood.sql that refuses the insert.
    for (const entry of BUILT_IN_ANALYTES) {
      expect(entry.key).not.toMatch(/pressure|tension|systol|diastol/);
      for (const alias of entry.aliases) expect(alias).not.toMatch(/tension|pression|systol|diastol/);
    }
  });
});

describe('matching a printed label to an analyte', () => {
  it('strips accents, case and punctuation before it compares', () => {
    expect(normaliseLabel('Cholestérol total')).toBe('cholesterol total');
    expect(normaliseLabel('G.G.T. .........')).toBe('g g t');
    expect(normaliseLabel('GAMMA-GT')).toBe('gamma gt');
  });

  it('prefers the longest alias, so a prefix cannot steal a row', () => {
    // The failure this prevents: "hdl" is inside "non hdl cholesterol" and
    // "cholesterol" is a prefix of "cholesterol total". A shortest-first rule
    // files a total cholesterol under HDL and the trend is wrong for a year.
    expect(analyteOfLabel('Cholesterol total', BUILT_IN_ANALYTES)?.key).toBe('total_cholesterol');
    expect(analyteOfLabel('Cholesterol non HDL', BUILT_IN_ANALYTES)?.key).toBe('non_hdl_cholesterol');
    expect(analyteOfLabel('HDL cholesterol', BUILT_IN_ANALYTES)?.key).toBe('hdl_cholesterol');
    expect(analyteOfLabel('Apolipoproteine B', BUILT_IN_ANALYTES)).toBeNull();
  });

  it('matches on a whole first word, never on a fragment inside one', () => {
    // "alt" is a real alias and "alteration" starts with those three letters.
    // The alias has to be the whole of the start, up to a word boundary.
    expect(analyteOfLabel('ALT', BUILT_IN_ANALYTES)?.key).toBe('alt');
    expect(analyteOfLabel('Alteration morphologique', BUILT_IN_ANALYTES)).toBeNull();
  });
});

describe('numbers as a French sheet prints them', () => {
  it('reads a comma as the decimal point', () => {
    // The CIQUAL note in .forge/research/nutrition-data.md records the same fact
    // about every French data file this build touches. Reading 1,44 as 144 is a
    // hundredfold error that lands in a table refusing DELETE.
    expect(parseFrenchNumber('1,44')).toBe(1.44);
    expect(parseFrenchNumber('0,97')).toBe(0.97);
    expect(parseFrenchNumber('62')).toBe(62);
    expect(parseFrenchNumber('1 200')).toBe(1200);
    expect(parseFrenchNumber('')).toBeNull();
    expect(parseFrenchNumber('13.Q')).toBeNull();
    expect(parseFrenchNumber('128/82')).toBeNull();
  });

  it('knows a limit from a measurement', () => {
    expect(isCensored('< 3')).toBe(true);
    expect(isCensored('>1200')).toBe(true);
    expect(isCensored('traces')).toBe(true);
    expect(isCensored('inferieur a 1')).toBe(true);
    expect(isCensored('3')).toBe(false);
    expect(isCensored('1,44')).toBe(false);
  });
});

describe('conversion, which is the arithmetic F61 puts on screen', () => {
  it('converts g/L to mmol/L for the lipid panel and keeps the factor', () => {
    // The demonstration seed and the approved wireframe both draw this exact
    // line: 1.44 g/L x 2.586 = 3.72 mmol/L.
    expect(convertPrinted(analyte('ldl_cholesterol'), 1.44, 'g/L')).toEqual({
      value: 3.72384,
      unit: 'mmol/L',
      factor: 2.586,
    });
    expect(convertPrinted(analyte('fasting_glucose'), 0.97, 'g/L')?.value).toBeCloseTo(5.38447, 4);
  });

  it('records a same-quantity unit choice as a choice and not as arithmetic', () => {
    // U/L and IU/L are the same number. Drawing "62 U/L x 1 62 U/L" would dress
    // a naming choice up as a conversion, so the factor comes back null and
    // src/lib/display.ts reads that as "no conversion line".
    expect(convertPrinted(analyte('ggt'), 62, 'IU/L')).toEqual({
      value: 62,
      unit: 'U/L',
      factor: null,
    });
    // µkat/L is a real conversion and does get a factor.
    expect(convertPrinted(analyte('ggt'), 1.03, 'µkat/L')).toEqual({
      value: 61.8,
      unit: 'U/L',
      factor: 60,
    });
  });

  it('refuses a unit the analyte does not accept', () => {
    expect(convertPrinted(analyte('ggt'), 62, 'mmol/L')).toBeNull();
  });

  it('rounds to six figures so a stored value can be checked against the paper', () => {
    // 0.97 x 5.551 is 5.384470000000001 in binary floating point. A stored value
    // with a tail of noise on it is a number nobody can check by hand.
    const converted = convertPrinted(analyte('fasting_glucose'), 0.97, 'g/L')!;
    expect(String(converted.value)).toBe('5.38447');
  });
});

describe('the gate every stored laboratory value passes', () => {
  it('accepts a plausible value and returns what will be stored', () => {
    expect(checkLabValue(analyte('ldl_cholesterol'), '1,44', 'g/L')).toEqual({
      ok: true,
      value: 3.72384,
      unit: 'mmol/L',
      factor: 2.586,
    });
  });

  it('refuses a limit, a non-number, an unknown unit and a value off the band', () => {
    expect(checkLabValue(analyte('crp'), '< 3', 'mg/L')).toEqual({ ok: false, problem: 'censored' });
    expect(checkLabValue(analyte('ggt'), '13.Q', 'U/L')).toEqual({
      ok: false,
      problem: 'notANumber',
    });
    expect(checkLabValue(analyte('ggt'), '62', 'mmol/L')).toEqual({
      ok: false,
      problem: 'unknownUnit',
    });
    // A hundredfold unit mistake: 1.44 read as mmol/L when the analyte's band
    // tops out at 30 would pass, so the band is what catches 144.
    expect(checkLabValue(analyte('ldl_cholesterol'), '144', 'mmol/L')).toEqual({
      ok: false,
      problem: 'range',
    });
    expect(checkLabValue(analyte('ggt'), '', 'U/L')).toEqual({ ok: false, problem: 'blank' });
    expect(checkLabValue(null, '62', 'U/L')).toEqual({ ok: false, problem: 'unknownAnalyte' });
  });
});

describe('a fourteenth analyte, added by the owner', () => {
  it('gets a prefixed key that cannot collide with a body metric or one of the thirteen', () => {
    expect(keyForAddedAnalyte('Apolipoprotein B')).toBe('added_apolipoprotein_b');
    expect(keyForAddedAnalyte('Weight')).toBe('added_weight');
    expect(keyForAddedAnalyte('LDL cholesterol')).toBe('added_ldl_cholesterol');
    expect(keyForAddedAnalyte('   ')).toBe('');
    for (const key of BUILT_IN_ANALYTE_KEYS) {
      expect(keyForAddedAnalyte(key)).not.toBe(key);
    }
  });
});
