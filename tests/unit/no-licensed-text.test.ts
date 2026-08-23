import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { describe, expect, test } from 'vitest';
import { strings } from '@/lib/strings';

/**
 * The repository searches four rubric lines ask for, run as tests rather than
 * as a grep somebody remembers.
 *
 * F69: neither PAR-Q+ text nor a derivative of it appears anywhere.
 * F70: no five-zone dial, no live heart-rate tracking, no readiness score and
 *      no injury-risk number exists anywhere in the app.
 * F71: no acute-chronic workload ratio is computed or stored, checked in the
 *      code and in the schema.
 * F77: no licensed effort-scale anchor wording appears in the repository.
 * F68: no downloaded video file exists in the repository.
 *
 * TWO THINGS MAKE THESE REAL RATHER THAN DECORATIVE.
 *
 * FIRST, THE PROBES ARE WRITTEN AS REGULAR EXPRESSIONS WITH ONE CHARACTER IN A
 * CLASS. `/heart cond[i]tion/i` matches the phrase and this file does not
 * contain it, so the walk covers the whole repository INCLUDING THIS FILE with
 * no exclusion list at all. An exclusion is where a check goes to die: the one
 * file left out is always the one that would have matched.
 *
 * SECOND, THE EXCLUDED-TERM SEARCH READS CODE WITH THE COMMENTS TAKEN OUT.
 * Those terms are all over this build in prose, because half of what this slice
 * had to do was write down why they are absent. Prose saying a thing does not
 * exist is not the thing existing. So the comments come off, the code is
 * searched, and the comment matches are PRINTED as the population, so a reader
 * can see that the terms live only in explanations. The stripper is checked on
 * itself below, which is what stops "no matches" meaning "nothing was read".
 */

const ROOT = process.cwd();

/** Directories no claim about this product's own source is made over. */
const SKIP = new Set(['node_modules', '.git', '.next', 'test-results', 'playwright-report', 'coverage']);

const TEXT = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.css',
  '.json',
  '.md',
  '.sql',
  '.html',
  '.yaml',
  '.yml',
  '.sh',
  '.svg',
]);

type File = { path: string; text: string };

function walk(dir: string, found: File[] = []): File[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const path = join(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      walk(path, found);
      continue;
    }
    if (!TEXT.has(extname(entry))) continue;
    if (stats.size > 4_000_000) continue;
    found.push({ path: relative(ROOT, path), text: readFileSync(path, 'utf8') });
  }
  return found;
}

const FILES = walk(ROOT);

function matches(files: File[], probe: RegExp): string[] {
  return files
    .filter((file) => probe.test(file.text))
    .map((file) => `${file.path}: ${(file.text.match(probe) ?? [])[0]}`);
}

describe('the walk itself', () => {
  test('it covers a real population, and prints it', () => {
    const bytes = FILES.reduce((sum, file) => sum + file.text.length, 0);
    // A zero is evidence only beside the population it covered. Every claim
    // below is a claim about these files and this many bytes.
    expect(FILES.length).toBeGreaterThan(150);
    expect(bytes).toBeGreaterThan(500_000);
    expect(FILES.some((file) => file.path === 'src/lib/strings.ts')).toBe(true);
    expect(FILES.some((file) => file.path === 'src/lib/training-rules.ts')).toBe(true);
    expect(FILES.some((file) => file.path.startsWith('.forge/'))).toBe(true);
    expect(FILES.some((file) => file.path.startsWith('drizzle/'))).toBe(true);
    // This file is inside its own walk, which is what makes the probes below
    // safe to state: they match the phrase and not their own source.
    expect(FILES.some((file) => file.path === 'tests/unit/no-licensed-text.test.ts')).toBe(true);
  });

  test('a probe that should match does match, so a probe that does not means something', () => {
    // The control. If this ever stops finding the sentence it is aimed at, the
    // walk has stopped reading files and every zero below is worthless.
    expect(matches(FILES, /the Silbernagel [r]ule/i).length).toBeGreaterThan(0);
  });
});

describe('F69: no PAR-Q+ text and no derivative of it', () => {
  /**
   * The distinctive question wording of the PAR-Q+ 2025, written with one
   * character in a class so this file does not contain the phrases it looks
   * for. Its downloads page forbids incorporation into electronic surveys or
   * derivative materials without written consent, and a native screen is both.
   */
  const PROBES = [
    /has your doctor ever said that you have a heart cond[i]tion/i,
    /do you feel pain in your ch[e]st when you do physical activity/i,
    /do you lose balance because of dizz[i]ness/i,
    /do you have a bone or joint pro[b]lem/i,
    /is your doctor currently prescr[i]bing drugs/i,
    /in the past month, have you had chest p[a]in/i,
    /physical activity readiness quest[i]onnaire/i,
  ];

  test.each(PROBES.map((probe) => [probe.source, probe] as const))(
    'nothing in the repository matches %s',
    (_source, probe) => {
      expect(matches(FILES, probe)).toEqual([]);
    },
  );

  test('what ships instead is the published symptom list, which is in the catalogue', () => {
    const symptoms = Object.values(strings.readiness.symptoms);
    expect(symptoms).toHaveLength(9);
    for (const line of symptoms) expect(line.length).toBeGreaterThan(12);
  });
});

describe('F77: no licensed effort-scale anchor wording', () => {
  /**
   * The Borg 6-20 and CR10 anchor sets. BorgPerception AB licenses them and
   * calls renamed versions forgeries on its own site, so neither the words nor
   * a paraphrase of the ladder ships.
   *
   * "Nothing at all" is deliberately NOT probed for. It is the CR10's zero
   * anchor and it is also ordinary English: this repository says it nine times
   * about queues, guards and comparisons, and a probe that flags those is a
   * probe nobody will trust the next time it fires.
   */
  const PROBES = [
    /very, very li[g]ht/i,
    /very, very ha[r]d/i,
    /fairly li[g]ht/i,
    /somewhat ha[r]d/i,
    /somewhat str[o]ng/i,
    /extremely str[o]ng/i,
    /absolute maxim[u]m/i,
    /maximal ex[e]rtion/i,
    /rating of perceived ex[e]rtion/i,
  ];

  test.each(PROBES.map((probe) => [probe.source, probe] as const))(
    'nothing in the repository matches %s',
    (_source, probe) => {
      expect(matches(FILES, probe)).toEqual([]);
    },
  );

  test('what ships instead is the public-domain scale, worded from the CDC page', () => {
    expect(strings.player.effortCardioNote).toMatch(/the effort of sitting/i);
    expect(strings.player.cdcSource).toMatch(/public domain/i);
    // The CDC's four conditions include a prominent non-endorsement line.
    expect(strings.player.cdcSource).toMatch(/does not endorse/i);
  });
});

// ---------------------------------------------------------------------------
// The excluded terms, in code rather than in prose.

/**
 * Comments off. A rough parser, and rough is enough: it tracks the three string
 * quotes so a `//` inside a URL is not read as a comment, and it is checked on
 * itself in the test below.
 */
function withoutComments(source: string): string {
  let out = '';
  let index = 0;
  let quote: string | null = null;
  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];
    if (quote) {
      if (character === '\\') {
        out += '  ';
        index += 2;
        continue;
      }
      if (character === quote) quote = null;
      out += character;
      index += 1;
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      out += character;
      index += 1;
      continue;
    }
    if (character === '/' && next === '/') {
      const end = source.indexOf('\n', index);
      index = end === -1 ? source.length : end;
      continue;
    }
    if (character === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2);
      index = end === -1 ? source.length : end + 2;
      continue;
    }
    out += character;
    index += 1;
  }
  return out;
}

const CODE = FILES.filter((file) => ['.ts', '.tsx'].includes(extname(file.path))).map((file) => ({
  path: file.path,
  text: withoutComments(file.text),
}));

describe('F70 and F71: the excluded terms exist in explanations and in no code', () => {
  /*
   * Named by their own source rather than by a label, for the same reason the
   * probes carry a character class: a field reading 'five-zone dial' beside a
   * regular expression looking for that phrase is a file that matches itself,
   * and the first run of this test found exactly that.
   */
  const PROBES = [
    /five[- ]z[o]ne/i,
    /readiness sc[o]re/i,
    /injury[- ]ris[k]|risk of inj[u]ry/i,
    /acute[- :]chr[o]nic|\bACW[R]\b/i,
    /live heart[- ]r[a]te|heart rate mon[i]tor/i,
    /workload ra[t]io/i,
  ];

  test('the comment stripper works, which is what makes the zeros below mean something', () => {
    const rules = CODE.find((file) => file.path === 'src/lib/training-rules.ts')!;
    // The code survives.
    expect(rules.text).toContain('export function proposeAdvancement');
    // The prose does not.
    expect(rules.text).not.toMatch(/Impellizzeri/);
    expect(rules.text.length).toBeLessThan(
      FILES.find((file) => file.path === 'src/lib/training-rules.ts')!.text.length,
    );
    // And a URL is not a comment.
    expect(withoutComments("const url = 'https://example.com/a';")).toContain('https://example.com/a');
  });

  test.each(PROBES.map((probe) => [probe.source, probe] as const))(
    'no code anywhere matches %s',
    (_source, probe) => {
      expect(matches(CODE, probe)).toEqual([]);
    },
  );

  test('and the prose that DOES hold them is printed, because that is the population', () => {
    const inProse = PROBES.flatMap((probe) => matches(FILES, probe));
    // Not zero: this build had to write down why each of these is absent, and a
    // run that found none of that would mean the walk read nothing.
    expect(inProse.length).toBeGreaterThan(4);
  });

  test('no string a person can read holds any of them', () => {
    const catalogue = JSON.stringify(strings);
    for (const probe of PROBES) {
      expect(probe.test(catalogue)).toBe(false);
    }
  });
});

describe('F71: the schema stores no ratio, score or risk number', () => {
  const SCHEMA = FILES.filter(
    (file) => file.path === 'src/db/schema.ts' || file.path.startsWith('drizzle/'),
  );

  test('the schema is read, and it is the whole of it', () => {
    expect(SCHEMA.length).toBeGreaterThan(5);
    expect(SCHEMA.some((file) => file.path === 'src/db/schema.ts')).toBe(true);
    expect(SCHEMA.some((file) => file.path === 'drizzle/pending/08-train.sql')).toBe(true);
  });

  test('no column or table name in it names a ratio, a score or a risk', () => {
    const identifiers = SCHEMA.flatMap((file) => {
      const stripped = extname(file.path) === '.ts' ? withoutComments(file.text) : file.text;
      return [
        ...[...stripped.matchAll(/'([a-z0-9_]+)'/g)].map((match) => match[1]),
        ...[...stripped.matchAll(/\bCREATE\s+TABLE\s+"?([a-z0-9_]+)"?/gi)].map((match) => match[1]),
        ...[...stripped.matchAll(/^\s+"([a-z0-9_]+)"/gim)].map((match) => match[1]),
      ];
    });
    // The population: every identifier the schema names.
    expect(identifiers.length).toBeGreaterThan(200);
    /*
     * Whole segments of a snake-case name, not substrings: "integration"
     * contains the letters of a ratio and is a credential table.
     *
     * `pain_score` is deliberately not on this list and is not a defect. It is
     * the 0 to 10 visual analogue reading Silbernagel 2007 used, reported by
     * the owner about his own knee, and the rule reads it back verbatim. What
     * F71 forbids is a number this app COMPUTES about him: a workload ratio, a
     * readiness figure, a risk. A reported measurement is the opposite of that,
     * and a probe that could not tell them apart would be a probe that made the
     * product worse to satisfy itself.
     */
    const offending = identifiers.filter((name) => {
      const parts = name.split(/[_\s]/);
      if (parts.some((part) => /^(rat[i]o|ris[k]|acw[r])$/i.test(part))) return true;
      return /(readiness|injury|workload|risk)_?sc[o]re|sc[o]re_?(risk|injury)/i.test(name);
    });
    expect(offending).toEqual([]);
  });
});

describe('F68: no downloaded video file exists in the repository', () => {
  const VIDEO = ['.mp4', '.webm', '.mov', '.m4v', '.mkv', '.avi', '.flv', '.ogv', '.mpg', '.mpeg', '.ts'];

  function everyFile(dir: string, found: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      if (SKIP.has(entry)) continue;
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) everyFile(path, found);
      else found.push(relative(ROOT, path));
    }
    return found;
  }

  const ALL = everyFile(ROOT);

  test('the scan walked every file in the repository, and here is how many', () => {
    expect(ALL.length).toBeGreaterThan(200);
    expect(ALL).toContain('public/movements/push-up.svg');
  });

  test('none of them is a video container', () => {
    // `.ts` is in the list above as MPEG transport stream and is also this
    // project's source extension, so it is excluded by directory rather than by
    // extension: a video would be in public/, and TypeScript is not.
    const media = ALL.filter((path) => path.startsWith('public/'));
    expect(media.length).toBeGreaterThan(40);
    const videos = media.filter((path) => VIDEO.includes(extname(path).toLowerCase()));
    expect(videos).toEqual([]);
  });

  test('and nothing outside public/ is one either, source extensions aside', () => {
    const containers = VIDEO.filter((extension) => extension !== '.ts');
    const videos = ALL.filter((path) => containers.includes(extname(path).toLowerCase()));
    expect(videos).toEqual([]);
  });

  test('the bundled media is stills and animations, which are not audiovisual content', () => {
    const bundled = ALL.filter((path) => path.startsWith('public/movements/'));
    expect(bundled.length).toBeGreaterThan(40);
    for (const path of bundled) {
      expect(['.svg', '.gif', '.png']).toContain(extname(path).toLowerCase());
    }
  });
});
