/**
 * The banned-phrase rule R2 turns on, and the one thing standing between an
 * explanation and a regulated claim.
 *
 * MDCG 2025-4 and the June 2025 revision of MDCG 2019-11 Rule 11 make the
 * STATED INTENDED PURPOSE the classification test. A product that stores a
 * laboratory number, charts it and explains what the analyte measures is not a
 * medical device. The same product with one sentence saying what THIS PERSON'S
 * number means, or what to do about it, has stated a diagnostic or therapeutic
 * purpose and has reclassified itself, and no disclaimer elsewhere in the
 * document undoes a sentence in the interface.
 *
 * So the boundary is checked rather than remembered. `scripts/compliance.mjs`
 * runs this over every explanation the shipped code can render, prints the
 * population it walked, and exits non-zero on one match.
 *
 * TWO LISTS, TWO MATCHERS. A phrase is a sequence of whole words, so `you have`
 * does not fire on "if you haven't". A stem matches the start of a word, so
 * `diagnos` catches diagnose, diagnosis and diagnostic and `prescrib` catches
 * prescribe and prescribed, which is what a single word list always misses.
 *
 * WHAT WOULD MAKE THIS GO RED: a template saying "your LDL is high", "you are
 * at risk of heart disease", "you should see your doctor urgently", or anything
 * with diagnose in it. tests/unit/compliance.test.ts feeds it exactly those and
 * fails if any of them comes back clean, because a checker nobody has watched
 * refuse anything is a checker nobody has tested.
 *
 * Dependency free and free of TypeScript that needs more than type stripping,
 * so a plain Node script can import it. Every entry is lower case with no
 * terminal punctuation, which is also what keeps `npm run strings` from reading
 * this file's own contents as copy: none of them is shaped like a sentence.
 */

/**
 * Sequences of whole words that assess this person or prescribe an action.
 *
 * Three families and they are listed together because a checker with three
 * lists is a checker with three places to forget something. Assessment of the
 * reader: `you have`, `your result is`, `is elevated`. Clinical instruction:
 * `you should`, `we recommend`, `stop taking`. Urgency, which is instruction
 * wearing a coat: `seek immediate`, `medical emergency`.
 */
export const BANNED_PHRASES: string[] = [
  'you have',
  'you may have',
  'you might have',
  'you are at risk',
  'puts you at',
  'at risk of',
  'your risk of',
  'your result is',
  'your result means',
  'your result shows',
  'your result suggests',
  'your result indicates',
  'your value is',
  'your level is',
  'your levels are',
  'your number is',
  'this means you',
  'that means you',
  'indicates that you',
  'suggests that you',
  'shows that you',
  'you are deficient',
  'you are low',
  'you are high',
  'your condition',
  'is normal',
  'is abnormal',
  'is elevated',
  'is raised',
  'is high',
  'is low',
  'is too high',
  'is too low',
  'out of range',
  'within the normal range',
  'you should',
  'you must',
  'you need to',
  'we recommend',
  'it is recommended',
  'start taking',
  'stop taking',
  'increase your',
  'reduce your',
  'lower your',
  'raise your',
  'cut down on',
  'see a doctor immediately',
  'seek immediate',
  'seek urgent',
  'medical emergency',
  'call your doctor now',
  'repeat the test',
  'get tested again',
  'monitor your',
  'keep an eye on your',
];

/**
 * Word beginnings. A stem is the honest way to cover a family of words without
 * writing out every inflection and missing one: `diagnos` is diagnose,
 * diagnosis, diagnostic and diagnosed, and all four are the same claim.
 */
export const BANNED_STEMS: string[] = [
  'diagnos',
  'prescrib',
  'treatment',
  'therapy',
  'medication',
  'dosage',
  'symptom',
  'disease',
  'disorder',
  'deficiency',
  'patholog',
  'urgent',
  'abnormal',
];

/** One match, with enough around it to see what fired. */
export type BannedMatch = {
  kind: 'phrase' | 'stem';
  term: string;
  /** The text either side, so a report reads as prose rather than as a hit count. */
  context: string;
};

/**
 * Text as this check compares text: lower case, unaccented, punctuation gone,
 * every run of whitespace one space, with a space at each end.
 *
 * The padding is what lets a whole-word phrase be matched with a plain
 * `includes` on ` phrase `: no regular expression is built out of user data, and
 * "if you haven't" cannot be read as "you have" because the words either side
 * carry their own boundaries.
 */
export function normaliseForScan(text: string): string {
  const stripped = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return ` ${stripped} `;
}

/** Every banned phrase and stem this text carries. Empty is the only passing answer. */
export function scanForBannedPhrases(text: string): BannedMatch[] {
  const haystack = normaliseForScan(text);
  const matches: BannedMatch[] = [];

  for (const phrase of BANNED_PHRASES) {
    const at = haystack.indexOf(` ${phrase} `);
    if (at === -1) continue;
    matches.push({ kind: 'phrase', term: phrase, context: haystack.slice(Math.max(0, at - 30), at + phrase.length + 32).trim() });
  }

  for (const stem of BANNED_STEMS) {
    const at = haystack.indexOf(` ${stem}`);
    if (at === -1) continue;
    matches.push({ kind: 'stem', term: stem, context: haystack.slice(Math.max(0, at - 30), at + stem.length + 32).trim() });
  }

  return matches;
}

/**
 * The three claims R2 requires `docs/product.md` to make, as fragments the
 * document has to carry. Written here rather than in the script so the
 * requirement and the check are one thing, and so a unit test can read them.
 *
 * Lower case and unpunctuated for the same reason the lists above are: this
 * file is inside the tree `npm run strings` walks, and a checker's own
 * vocabulary must not look like copy.
 */
export const REQUIRED_STATEMENTS: Array<{ id: string; fragment: string }> = [
  { id: 'not-a-medical-device', fragment: 'is not a medical device' },
  { id: 'performs-no-diagnosis', fragment: 'performs no diagnosis' },
  { id: 'intended-purpose', fragment: 'intended purpose' },
  { id: 'mdcg-2025-4', fragment: 'mdcg 2025 4' },
  { id: 'mdcg-2019-11', fragment: 'mdcg 2019 11' },
];

/** Which required statements a document is missing. Empty is the only passing answer. */
export function missingStatements(text: string): string[] {
  const haystack = normaliseForScan(text);
  return REQUIRED_STATEMENTS.filter((claim) => !haystack.includes(claim.fragment)).map(
    (claim) => claim.id,
  );
}

/**
 * What an explanation must positively carry, checked by structure rather than by
 * keyword.
 *
 * R2 asks for three things and a banned-phrase list can only prove the absence
 * of a fourth. So the renderer returns its parts separately and this asserts
 * each one arrived: reference-range context that names a number, a source that
 * carries a URL a person can open, and an invitation to a professional. A
 * template that quietly lost its citation would pass a banned-phrase check
 * forever.
 */
export type ExplanationParts = {
  context: string;
  laboratory: string;
  stores: string;
  invitation: string;
  source: string;
};

export const PROFESSIONAL_WORDS = ['doctor', 'laboratory', 'pharmacist', 'nurse'];

export function explanationFaults(
  parts: ExplanationParts,
  /**
   * Whether this analyte has a published general range at all.
   *
   * An analyte the owner added while reviewing a panel has none, and saying so
   * is the honest answer: the sheet's own interval is the only one on screen.
   * Requiring a number in that sentence would push the code towards printing
   * the laboratory's interval as if it were a published population range, which
   * is a claim nobody made.
   */
  options: { hasPublishedRange: boolean } = { hasPublishedRange: true },
): string[] {
  const faults: string[] = [];
  if (parts.context.trim() === '') faults.push('no-context');
  if (options.hasPublishedRange && !/\d/.test(parts.context)) faults.push('context-states-no-range');
  if (parts.laboratory.trim() === '') faults.push('no-laboratory-interval-note');
  if (parts.stores.trim() === '') faults.push('no-stores-not-reads-note');
  if (parts.invitation.trim() === '') faults.push('no-invitation');
  const invitation = normaliseForScan(parts.invitation);
  if (!PROFESSIONAL_WORDS.some((word) => invitation.includes(` ${word}`))) {
    faults.push('invitation-names-no-professional');
  }
  if (!/https?:\/\/\S+/.test(parts.source)) faults.push('source-carries-no-url');
  return faults;
}

/* -------------------------------------------------------------------------
 * THE WALK ITSELF, AND WHY IT LIVES HERE RATHER THAN IN THE SCRIPT.
 *
 * R2 says EVERY laboratory explanation template. The first walk rendered the
 * five parts `renderExplanation` returns, for the thirteen catalogued analytes,
 * and called that the population. All thirteen carry a published range on both
 * sides, so `between` rendered thirteen times and `below`, `above` and
 * `unstated` rendered never. `heading` is not one of the returned parts at all,
 * so it was never rendered either. A verifier planted a sentence assessing the
 * reader in `unstated`, which is the branch that renders when an analyte has no
 * published range and therefore the branch most likely to be written carelessly
 * later, and `npm run compliance` exited 0 over it.
 *
 * That is the twelfth instance of this run's one failure class, and it was
 * inside the checker. So the population is no longer whatever the catalogue
 * happened to render. `templateKeys` states what the population MUST be, every
 * leaf of the subtree; `renderTemplates` states what it WAS; and the script
 * fails when the two differ. A template added next year joins the walk on the
 * day it is written rather than on the day somebody remembers it.
 * ---------------------------------------------------------------------------
 */

/**
 * The values every template function is called with.
 *
 * A template is a function and a function has branches: `count === 1` picks a
 * singular, `laboratory === ''` drops a clause. Rendering one call per template
 * walks one branch and leaves the other unread, which is the same hole one
 * catalogued analyte left in the explanation walk. So each function is called
 * over a matrix rather than once, and every branch a comparison against zero,
 * one, two, the empty string or a word can take is rendered.
 *
 * Lower case, no terminal punctuation, no capital: this file sits inside the
 * tree `npm run strings` walks and a checker's own sample data must not read as
 * copy.
 */
export const SAMPLE_ARGUMENTS: ReadonlyArray<number | string> = [0, 1, 2, '', 'ferritin'];

/** Above this arity the matrix is a diagonal rather than a product. */
const CARTESIAN_LIMIT = 4;

/**
 * Every argument tuple one template is rendered with.
 *
 * The full product up to four arguments, which is 625 calls for the widest
 * template this catalogue holds and costs a millisecond. Beyond that the
 * product would grow without buying another branch, so it becomes one tuple per
 * sample with the same value in every position.
 */
export function argumentTuples(arity: number): Array<Array<number | string>> {
  if (arity <= 0) return [[]];
  if (arity > CARTESIAN_LIMIT) {
    return SAMPLE_ARGUMENTS.map((sample) => Array.from({ length: arity }, () => sample));
  }
  let tuples: Array<Array<number | string>> = [[]];
  for (let position = 0; position < arity; position += 1) {
    const grown: Array<Array<number | string>> = [];
    for (const tuple of tuples) {
      for (const sample of SAMPLE_ARGUMENTS) grown.push([...tuple, sample]);
    }
    tuples = grown;
  }
  return tuples;
}

/**
 * Every leaf of a catalogue subtree, as a dotted key. A string and a template
 * function are both leaves; an object is walked through.
 *
 * This is the POPULATION, stated independently of what any walk managed to
 * render. The script compares the two and refuses to report a clean run over a
 * population smaller than this one.
 */
export function templateKeys(node: unknown, prefix = ''): string[] {
  if (node === null || typeof node !== 'object') return [];
  const keys: string[] = [];
  for (const [name, value] of Object.entries(node as Record<string, unknown>)) {
    const key = prefix === '' ? name : `${prefix}.${name}`;
    if (typeof value === 'string' || typeof value === 'function') keys.push(key);
    else if (value !== null && typeof value === 'object') keys.push(...templateKeys(value, key));
  }
  return keys;
}

/** One rendering of one template, ready to be scanned. */
export type WalkedTemplate = { key: string; rendered: string };

/**
 * Every leaf of a subtree, rendered.
 *
 * A string renders as itself. A template function renders once per argument
 * tuple, and a tuple that throws is skipped rather than reported: a template
 * expecting a number and handed a word is a call this walk invented, not a
 * defect in the product. A template that throws on EVERY tuple is a different
 * matter, and it comes back in `unrenderable` so the script can fail on it
 * instead of quietly walking a population one template short.
 */
export function renderTemplates(
  node: unknown,
  prefix = '',
): { walked: WalkedTemplate[]; unrenderable: string[] } {
  const walked: WalkedTemplate[] = [];
  const unrenderable: string[] = [];

  const visit = (value: unknown, key: string): void => {
    if (typeof value === 'string') {
      walked.push({ key, rendered: value });
      return;
    }
    if (typeof value === 'function') {
      const template = value as (...args: Array<number | string>) => unknown;
      let rendered = 0;
      for (const tuple of argumentTuples(template.length)) {
        let text: unknown;
        try {
          text = template(...tuple);
        } catch {
          continue;
        }
        if (typeof text !== 'string') continue;
        walked.push({ key, rendered: text });
        rendered += 1;
      }
      if (rendered === 0) unrenderable.push(key);
      return;
    }
    if (value !== null && typeof value === 'object') {
      for (const [name, child] of Object.entries(value as Record<string, unknown>)) {
        visit(child, key === '' ? name : `${key}.${name}`);
      }
    }
  };

  visit(node, prefix);
  return { walked, unrenderable };
}
