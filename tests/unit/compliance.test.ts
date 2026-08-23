import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BANNED_PHRASES,
  BANNED_STEMS,
  argumentTuples,
  explanationFaults,
  missingStatements,
  normaliseForScan,
  renderTemplates,
  scanForBannedPhrases,
  templateKeys,
} from '@/lib/compliance';
import { formatNumber } from '@/lib/format';
import { BUILT_IN_ANALYTES, renderExplanation } from '@/lib/labs';
import { strings } from '@/lib/strings';

/**
 * R2, and the question this run has learned to ask of every green check: what
 * would it take for this to go red.
 *
 * The answer is written into the file. Four sentences that a reasonable
 * developer might write, each one a claim MDCG 2025-4 and the revised MDCG
 * 2019-11 Rule 11 would read as a stated diagnostic or therapeutic purpose, and
 * the test fails if any of them comes back clean. A checker nobody has watched
 * refuse anything is a checker nobody has tested, and this project has now found
 * seven checks that passed by not checking.
 */

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));

/** Sentences that MUST be caught. If any of these passes, the checker is broken. */
const MUST_BE_CAUGHT: Array<[string, string]> = [
  ['assessment of the reader', 'Your LDL cholesterol is high for a man of your age.'],
  ['a risk claim', 'This result puts you at risk of cardiovascular disease.'],
  ['a clinical instruction', 'You should see your doctor urgently about this number.'],
  ['a diagnostic claim', 'Vernier can help diagnose iron deficiency from your ferritin.'],
  ['a treatment claim', 'Ask about treatment options if this stays elevated.'],
  ['a normality verdict', 'That value is within the normal range for an adult.'],
  ['a monitoring instruction', 'Monitor your ferritin every three months from now on.'],
];

/** Sentences that must NOT be caught, or the rule is unusable in practice. */
const MUST_PASS: Array<[string, string]> = [
  ['an invitation to a professional', 'Take the question to the doctor who ordered the panel.'],
  [
    'a general range with no verdict',
    'General adult reference ranges published for GGT run from 12 to 64 U/L.',
  ],
  ['a statement about the product', 'Vernier stores the number and draws the trend.'],
  [
    'a negative that contains a banned word as a fragment',
    'The laboratory that issued the sheet can say what its own interval covers.',
  ],
];

describe('the banned-phrase rule', () => {
  it('catches every sentence it exists to catch, and prints what it walked', () => {
    console.log(
      `compliance: ${MUST_BE_CAUGHT.length} sentences that must be caught, ` +
        `${MUST_PASS.length} that must pass, against ${BANNED_PHRASES.length} phrases and ` +
        `${BANNED_STEMS.length} stems.`,
    );
    for (const [what, sentence] of MUST_BE_CAUGHT) {
      const matches = scanForBannedPhrases(sentence);
      expect(matches.length, `${what}: ${sentence}`).toBeGreaterThan(0);
    }
  });

  it('leaves alone the sentences the product actually needs to say', () => {
    for (const [what, sentence] of MUST_PASS) {
      expect(scanForBannedPhrases(sentence), `${what}: ${sentence}`).toEqual([]);
    }
  });

  it('matches whole words, so an apostrophe cannot smuggle a phrase past it', () => {
    // "if you haven't" contains the letters of "you have". Normalisation strips
    // the apostrophe, so without word boundaries this would fire, and a rule
    // that cries wolf is a rule somebody turns off.
    expect(normaliseForScan("If you haven't got the sheet")).toBe(' if you haven t got the sheet ');
    expect(scanForBannedPhrases("If you haven't got the sheet, ask the laboratory.")).toEqual([]);
    expect(scanForBannedPhrases('You have a result on this panel.').length).toBeGreaterThan(0);
    // The same boundary from the other side. "is low" is a banned phrase and
    // "is lossless" starts with the same four letters; the padded whole-word
    // match is what tells them apart. Note that "is low resolution" DOES match,
    // and correctly: the rule is deliberately blunt, and the way past it is to
    // reword the copy rather than to soften the rule.
    expect(scanForBannedPhrases('The scan is lossless and the columns are legible.')).toEqual([]);
    expect(scanForBannedPhrases('The reading is low.').length).toBeGreaterThan(0);
  });

  it('catches a family of words through its stem rather than one inflection', () => {
    for (const word of ['diagnose', 'diagnosis', 'diagnostic', 'diagnosed']) {
      expect(scanForBannedPhrases(`This can ${word} the problem.`).length, word).toBeGreaterThan(0);
    }
  });
});

describe('every explanation the shipped renderer can produce', () => {
  it('says nothing about the reader, for all thirteen analytes', () => {
    // The population, printed, because a zero is evidence only beside what it
    // covered. It walks the SHIPPED renderer with the SHIPPED templates, not a
    // paraphrase of either.
    const walked: string[] = [];
    for (const analyte of BUILT_IN_ANALYTES) {
      const label = (strings.metrics as Record<string, string>)[analyte.key];
      const explanation = renderExplanation(analyte, label, formatNumber, strings.labs.explanation);
      const rendered = [
        explanation.context,
        explanation.laboratory,
        explanation.stores,
        explanation.invitation,
        explanation.source,
      ].join(' ');
      walked.push(analyte.key);
      expect(scanForBannedPhrases(rendered), analyte.key).toEqual([]);
    }
    console.log(`compliance: explanations walked for ${walked.join(', ')}`);
    expect(walked).toHaveLength(13);
  });

  it('carries a range, a laboratory note, a stores note, an invitation and a source', () => {
    for (const analyte of BUILT_IN_ANALYTES) {
      const label = (strings.metrics as Record<string, string>)[analyte.key];
      const explanation = renderExplanation(analyte, label, formatNumber, strings.labs.explanation);
      const hasPublishedRange = analyte.referenceLow !== null || analyte.referenceHigh !== null;
      expect(explanationFaults(explanation, { hasPublishedRange }), analyte.key).toEqual([]);
    }
  });

  it('reports a fault when a part goes missing, which is how the positive half goes red', () => {
    const whole = {
      context: 'General adult reference ranges run from 12 to 64 U/L.',
      laboratory: 'Reference intervals differ between laboratories.',
      stores: 'Vernier stores the number and draws the trend.',
      invitation: 'Take the question to the doctor who ordered the panel.',
      source: 'MedlinePlus, https://medlineplus.gov/lab-tests/',
    };
    expect(explanationFaults(whole)).toEqual([]);
    expect(explanationFaults({ ...whole, source: 'MedlinePlus' })).toContain('source-carries-no-url');
    expect(explanationFaults({ ...whole, invitation: 'Have a think about it.' })).toContain(
      'invitation-names-no-professional',
    );
    expect(explanationFaults({ ...whole, context: 'It varies.' })).toContain(
      'context-states-no-range',
    );
    // An analyte with no published general range says so, and that is not a
    // fault: the sheet's own interval is the only one on the screen.
    expect(
      explanationFaults(
        { ...whole, context: 'No general adult reference range is published here.' },
        { hasPublishedRange: false },
      ),
    ).toEqual([]);
  });
});

describe('the intended-purpose statement', () => {
  it('makes all five claims R2 requires', () => {
    const product = readFileSync(`${projectRoot}docs/product.md`, 'utf8');
    expect(product.length).toBeGreaterThan(1000);
    expect(missingStatements(product)).toEqual([]);
  });

  it('goes red when a claim is dropped', () => {
    // The other half of "what would make this red": a document that says
    // everything except that it is not a medical device fails, and it fails
    // naming the claim it is missing.
    expect(missingStatements('Vernier performs no diagnosis. Intended purpose: MDCG 2025-4.')).toContain(
      'not-a-medical-device',
    );
    expect(missingStatements('')).toHaveLength(5);
  });
});

/**
 * The walk itself, and the hole a verifier found in it on 23 August 2026.
 *
 * `npm run compliance` rendered the five parts `renderExplanation` returns, for
 * the thirteen catalogued analytes. All thirteen publish both bounds, so
 * `explanation.between` rendered thirteen times and `below`, `above` and
 * `unstated` rendered never. `heading` is not one of the returned parts, so it
 * rendered never either. A banned sentence planted in `unstated` left the check
 * at exit 0, which is the twelfth instance of this run's one failure class and
 * the first one inside a checker. These tests grade the WALK rather than the
 * copy, because the copy was never the thing that failed.
 */
describe('the template walk R2 rests on', () => {
  it('covers every leaf of the labs catalogue, and prints what it covered', () => {
    // WHAT WOULD MAKE THIS RED: a walk that skips template functions, or one
    // subtree, or an object nested inside another. Any of those leaves a
    // template in the catalogue and outside the population, which is how
    // `explanation.unstated` sat unread while the check reported zero.
    const population = templateKeys(strings.labs, 'labs');
    const { walked, unrenderable } = renderTemplates(strings.labs, 'labs');
    const covered = new Set(walked.map((line) => line.key));
    const missing = population.filter((name) => !covered.has(name));
    console.log(
      `compliance: ${population.length} labs templates, ${walked.length} renderings, ` +
        `${missing.length} uncovered, ${unrenderable.length} unrenderable`,
    );
    expect(population.length).toBeGreaterThanOrEqual(130);
    expect(missing).toEqual([]);
    expect(unrenderable).toEqual([]);
  });

  it('renders both sides of a template that branches on its argument', () => {
    // WHAT WOULD MAKE THIS RED: calling each template once. `panelStored(1)`
    // says "1 value stored" and `panelStored(2)` says "2 values stored", and a
    // walk that only ever passed one number reads one of those two and reports
    // a clean run over the other.
    const singular = strings.labs.panelStored(1);
    const plural = strings.labs.panelStored(2);
    expect(singular).not.toBe(plural);
    const { walked } = renderTemplates({ panelStored: strings.labs.panelStored });
    const rendered = walked.map((line) => line.rendered);
    expect(rendered).toContain(singular);
    expect(rendered).toContain(plural);
    expect(argumentTuples(2)).toHaveLength(25);
    expect(argumentTuples(0)).toEqual([[]]);
  });

  it('finds a banned sentence planted in the template a verifier planted in', () => {
    // WHAT WOULD MAKE THIS RED: the walk going back to rendering only the
    // branches today's catalogue happens to reach. The sentence below is the
    // one the verifier used, character for character.
    const planted = 'Your result is abnormal and you should see a doctor.';
    for (const name of ['unstated', 'heading', 'below', 'above', 'between']) {
      const subtree = { ...strings.labs.explanation, [name]: () => planted };
      const { walked } = renderTemplates(subtree, 'labs.explanation');
      const caught = walked
        .filter((line) => scanForBannedPhrases(line.rendered).length > 0)
        .map((line) => line.key);
      expect(caught, `planted in labs.explanation.${name}`).toContain(`labs.explanation.${name}`);
    }
    // And the unplanted catalogue is clean, so the loop above is not passing on
    // a walk that flags everything it reads.
    const { walked } = renderTemplates(strings.labs.explanation, 'labs.explanation');
    expect(walked.filter((line) => scanForBannedPhrases(line.rendered).length > 0)).toEqual([]);
    expect(templateKeys(strings.labs.explanation)).toHaveLength(9);
  });

  it('takes all four context branches of the shipped renderer', () => {
    // WHAT WOULD MAKE THIS RED: an analyte with no published range rendering
    // anything other than `unstated`. /api/labs/row writes exactly that analyte
    // every time the owner adds a fourteenth one, so the branch is on the
    // shipped path and not a hypothetical.
    const analyte = BUILT_IN_ANALYTES.find((entry) => entry.key === 'ferritin')!;
    const label = (strings.metrics as Record<string, string>)[analyte.key];
    const copy = strings.labs.explanation;
    const low = formatNumber(analyte.referenceLow!, analyte.unit);
    const high = formatNumber(analyte.referenceHigh!, analyte.unit);
    const shapes = [
      [{ ...analyte }, copy.between(label, low, high, analyte.unit)],
      [{ ...analyte, referenceLow: null }, copy.below(label, high, analyte.unit)],
      [{ ...analyte, referenceHigh: null }, copy.above(label, low, analyte.unit)],
      [{ ...analyte, referenceLow: null, referenceHigh: null }, copy.unstated(label)],
    ] as const;
    const taken: string[] = [];
    for (const [variant, expected] of shapes) {
      const explanation = renderExplanation(variant, label, formatNumber, copy);
      expect(explanation.context).toBe(expected);
      taken.push(explanation.context);
    }
    console.log(`compliance: four reference shapes rendered for ferritin: ${taken.join(' | ')}`);
    expect(new Set(taken).size).toBe(4);
  });
});
