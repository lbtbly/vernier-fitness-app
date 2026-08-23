#!/usr/bin/env node
// R2's check: every laboratory explanation this product can render, walked
// against the banned-phrase list, plus the intended-purpose statement.
//
//   node scripts/compliance.mjs            walk it, print the report
//   node scripts/compliance.mjs --verbose  print every rendered line
//
// WHY THIS EXISTS AT ALL. MDCG 2025-4 and the June 2025 revision of MDCG
// 2019-11 Rule 11 make the STATED INTENDED PURPOSE the classification test. A
// product that stores a laboratory number, charts it and explains what the
// analyte measures is not a medical device. The same product with one sentence
// saying what THIS PERSON'S number means, or what to do about it, has stated a
// diagnostic or therapeutic purpose and has reclassified itself, and a
// disclaimer elsewhere does not undo a sentence in the interface. The boundary
// is one sentence wide, so it is checked rather than remembered.
//
// IT GRADES THE SHIPPED RENDERER. `renderExplanation` in src/lib/labs.ts is the
// function the screens call, and this script calls that same function with the
// same catalogue subtree from src/lib/strings.ts. It does not re-implement the
// wording and it does not read the templates as text: it renders them, the way
// a person reads them, and scans the result. A checker that grades its own
// paraphrase of the code is instance number two of this run's failure class and
// it cost five verifications.
//
// AND IT WALKS EVERY TEMPLATE, WHICH IT DID NOT UNTIL 23 AUGUST 2026. The walk
// used to be "render the five parts renderExplanation returns, for the thirteen
// catalogued analytes". All thirteen carry a published range on both sides, so
// `explanation.between` rendered thirteen times and `below`, `above` and
// `unstated` rendered never; `explanation.heading` is not one of the returned
// parts, so it was never rendered either. A verifier planted
//
//     "Your result is abnormal and you should see a doctor."
//
// in `explanation.unstated`, which is the branch an analyte with no published
// range takes, and this script exited 0 over it. Twelfth instance of this run's
// one failure class, inside the checker, on the afternoon the checker joined
// the gate.
//
// So there are now two walks and they are both exhaustive by construction.
// Every analyte is rendered in all FOUR reference shapes, so all four context
// branches of the shipped renderer are taken and each one is asserted to have
// been taken. And every LEAF of the named catalogue subtrees is rendered,
// template functions included, over an argument matrix so both sides of a
// ternary render. `templateKeys` says what the population must be, the walk
// says what it was, and a difference is a failure rather than a smaller number
// nobody reads.
//
// A ZERO IS EVIDENCE ONLY BESIDE THE POPULATION IT COVERED. So the population is
// printed on every run, by name, key by key. The run FAILS if it is smaller
// than the floors stated below. A clean walk over an empty catalogue reads
// exactly like a clean walk over a full one, and this run has now found twelve
// checks that passed by not checking.
//
// AND IT IS WATCHED REFUSING. `MUST_BE_CAUGHT` feeds four sentences that must be
// caught and fails if any of them comes back clean, which is the question "what
// would it take for this to go red" written into the check itself. The same
// four are in tests/unit/compliance.test.ts, which runs in the unit suite, and
// that file also plants a banned sentence in `unstated` and in `heading` and
// fails if this walk does not find it.
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');

const { strings } = await import(join(projectRoot, 'src', 'lib', 'strings.ts'));
const { BUILT_IN_ANALYTES, renderExplanation } = await import(
  join(projectRoot, 'src', 'lib', 'labs.ts')
);
const {
  BANNED_PHRASES,
  BANNED_STEMS,
  explanationFaults,
  missingStatements,
  renderTemplates,
  scanForBannedPhrases,
  templateKeys,
} = await import(join(projectRoot, 'src', 'lib', 'compliance.ts'));
const { DATA_CATEGORIES, retentionToken } = await import(
  join(projectRoot, 'src', 'lib', 'backup', 'categories.ts')
);

const VERBOSE = process.argv.includes('--verbose');

/**
 * The thirteen F57 names. The floor this walk must clear, stated as a number
 * rather than left as whatever the catalogue happened to hold.
 */
const ANALYTE_FLOOR = 13;

/**
 * The floors on the template walk, for the same reason.
 *
 * Nine explanation templates: four context branches, the laboratory note, the
 * stores-not-reads note, the invitation, the source and the heading. And a
 * floor under the whole population, because a subtree that silently emptied
 * would otherwise report a clean walk over nothing.
 */
const EXPLANATION_FLOOR = 9;
const TEMPLATE_FLOOR = 150;

/**
 * The number formatter the product uses, imported rather than approximated, so
 * the sentence this check scans is the sentence the screen draws down to the
 * decimal places.
 */
const { formatNumber } = await import(join(projectRoot, 'src', 'lib', 'format.ts'));

const failures = [];
const walked = [];
const walkedKeys = new Set();

function record(key, rendered, where) {
  walked.push({ key, rendered });
  walkedKeys.add(key);
  for (const match of scanForBannedPhrases(rendered)) {
    failures.push({ where: where ?? key, what: `${match.kind} "${match.term}" in "${match.context}"` });
  }
}

// --------------------------------------------------------------------------
// 1. Every explanation the shipped renderer can produce, in all four shapes.
//
// A reference shape is a fact about the analyte and not about the owner: a
// sheet may publish both bounds, one bound, or none. The renderer picks one of
// four templates from it, so every analyte is rendered four times and each
// rendering is asserted to have taken the branch that shape demands. That
// assertion is what makes this a walk over the renderer rather than a walk over
// whichever branch today's catalogue happens to reach.

const REFERENCE_SHAPES = [
  {
    id: 'both bounds published',
    template: 'between',
    hasPublishedRange: true,
    variant: (analyte) => ({
      ...analyte,
      referenceLow: analyte.referenceLow ?? 1,
      referenceHigh: analyte.referenceHigh ?? 2,
    }),
    expected: (analyte, label, copy) =>
      copy.between(
        label,
        formatNumber(analyte.referenceLow, analyte.unit),
        formatNumber(analyte.referenceHigh, analyte.unit),
        analyte.unit,
      ),
  },
  {
    id: 'an upper bound only',
    template: 'below',
    hasPublishedRange: true,
    variant: (analyte) => ({
      ...analyte,
      referenceLow: null,
      referenceHigh: analyte.referenceHigh ?? 2,
    }),
    expected: (analyte, label, copy) =>
      copy.below(label, formatNumber(analyte.referenceHigh, analyte.unit), analyte.unit),
  },
  {
    id: 'a lower bound only',
    template: 'above',
    hasPublishedRange: true,
    variant: (analyte) => ({
      ...analyte,
      referenceLow: analyte.referenceLow ?? 1,
      referenceHigh: null,
    }),
    expected: (analyte, label, copy) =>
      copy.above(label, formatNumber(analyte.referenceLow, analyte.unit), analyte.unit),
  },
  {
    // The branch the verifier planted in, and the one an analyte the owner adds
    // through the interface always takes: /api/labs/row writes a new analyte
    // with referenceLow and referenceHigh null, so this is not a hypothetical
    // shape. It was rendered zero times by the walk it replaced.
    id: 'no published range',
    template: 'unstated',
    hasPublishedRange: false,
    variant: (analyte) => ({ ...analyte, referenceLow: null, referenceHigh: null }),
    expected: (analyte, label, copy) => copy.unstated(label),
  },
];

const branchesTaken = new Map(REFERENCE_SHAPES.map((shape) => [shape.template, 0]));

for (const analyte of BUILT_IN_ANALYTES) {
  const label = strings.metrics[analyte.key];
  if (!label) {
    failures.push({
      where: `analyte ${analyte.key}`,
      what: 'no catalogue key for this analyte name, so its explanation cannot be rendered',
    });
    continue;
  }

  for (const shape of REFERENCE_SHAPES) {
    const variant = shape.variant(analyte);
    const explanation = renderExplanation(variant, label, formatNumber, strings.labs.explanation);
    const where = `analyte ${analyte.key}, ${shape.id}`;
    record(`labs.explanation.${shape.template}`, explanation.context, where);
    record('labs.explanation.laboratoryWins', explanation.laboratory, where);
    record('labs.explanation.storesNotReads', explanation.stores, where);
    record('labs.explanation.professional', explanation.invitation, where);
    record('labs.explanation.source', explanation.source, where);

    // Did the renderer really take this branch. Without this the four shapes
    // would render four times and prove one thing, which is the hole this walk
    // exists to close.
    const expected = shape.expected(variant, label, strings.labs.explanation);
    if (explanation.context === expected) {
      branchesTaken.set(shape.template, branchesTaken.get(shape.template) + 1);
    } else {
      failures.push({
        where,
        what:
          `renderExplanation did not render labs.explanation.${shape.template} for an analyte with ` +
          `${shape.id}, so that template is outside this walk`,
      });
    }

    for (const fault of explanationFaults(explanation, {
      hasPublishedRange: shape.hasPublishedRange,
    })) {
      failures.push({ where, what: fault });
    }
  }
}

// --------------------------------------------------------------------------
// 2. Every template leaf of every subtree that can put copy beside a laboratory
//    number.
//
// The explanations are the templates R2 names, and they are not the only place
// a clinical claim could be written. The flag sentences, the panel note, the
// review copy and the refusals the route answers with all sit beside a
// laboratory number on the same screen, so they are walked too. The
// intended-purpose boundary is a property of what the product SAYS, not of
// which file it was said in.

const SUBTREES = [
  { prefix: 'labs', node: strings.labs },
  { prefix: 'api.labs', node: strings.api.labs },
  {
    prefix: '',
    node: {
      'panel.note': strings.panel.note,
      'health.noBloodPressure': strings.health.noBloodPressure,
    },
  },
];

let renderings = 0;
for (const subtree of SUBTREES) {
  const { walked: lines, unrenderable } = renderTemplates(subtree.node, subtree.prefix);
  renderings += lines.length;
  for (const line of lines) record(line.key, line.rendered);
  for (const key of unrenderable) {
    failures.push({
      where: key,
      what: 'this template threw on every sample argument, so no walk can read what it says',
    });
  }

  // The population, asserted rather than counted. Every leaf this subtree holds
  // has to appear in the walk, or the walk is smaller than the subtree and its
  // zero means nothing.
  for (const key of templateKeys(subtree.node, subtree.prefix)) {
    if (!walkedKeys.has(key)) {
      failures.push({ where: key, what: 'this template is in the catalogue and outside the walk' });
    }
  }
}

// --------------------------------------------------------------------------
// 3. The intended-purpose statement itself.

const productDoc = join(projectRoot, 'docs', 'product.md');
let product = '';
try {
  product = await readFile(productDoc, 'utf8');
} catch {
  failures.push({ where: 'docs/product.md', what: 'the intended-purpose statement is not there' });
}

if (product !== '') {
  for (const missing of missingStatements(product)) {
    failures.push({ where: 'docs/product.md', what: `does not state: ${missing}` });
  }
}

// --------------------------------------------------------------------------
// 4. R4 and F131: the retention table in docs/privacy.md against the code.
//
// F131's second clause is that the period stated per data category MATCHES THE
// VALUE THE CODE ENFORCES. A document and a constant agree on the day they are
// written and drift a slice later, and nobody notices, because nothing reads
// both. This reads both.
//
// The table's third column is a TOKEN, on purpose: the document has to be
// readable by a person and comparable by a script, and a sentence is only ever
// one of those. `until-deleted`, `8-hours`, `30-archives`.

const privacyDoc = join(projectRoot, 'docs', 'privacy.md');
let privacy = '';
try {
  privacy = await readFile(privacyDoc, 'utf8');
} catch {
  failures.push({ where: 'docs/privacy.md', what: 'R4 asks for a privacy notice and there is none' });
}

/** Every `| Name | id | token |` row of the retention table, as a map. */
function retentionRows(document) {
  const rows = new Map();
  for (const line of document.split('\n')) {
    const match = /^\|\s*[^|]+\|\s*`([a-z_]+)`\s*\|\s*`([a-z0-9-]+)`\s*\|/.exec(line.trim());
    if (match) rows.set(match[1], match[2]);
  }
  return rows;
}

const stated = retentionRows(privacy);
const enforced = new Map(DATA_CATEGORIES.map((category) => [category.id, retentionToken(category.retention)]));

if (privacy !== '') {
  for (const [id, token] of enforced) {
    if (!stated.has(id)) {
      failures.push({
        where: `docs/privacy.md ${id}`,
        what: `the code holds this category and the document does not state a retention for it`,
      });
      continue;
    }
    if (stated.get(id) !== token) {
      failures.push({
        where: `docs/privacy.md ${id}`,
        what: `the document says ${stated.get(id)} and the code enforces ${token}`,
      });
    }
  }
  for (const id of stated.keys()) {
    if (!enforced.has(id)) {
      failures.push({
        where: `docs/privacy.md ${id}`,
        what: 'the document states a retention for a category the code does not have',
      });
    }
  }
  for (const claim of [
    'household exemption',
    'Delete permanently',
    'Export everything',
    'append-only',
  ]) {
    if (!privacy.includes(claim)) {
      failures.push({ where: 'docs/privacy.md', what: `does not state: ${claim}` });
    }
  }
}

// --------------------------------------------------------------------------
// 5. What it would take for this to go red, run every time.

const MUST_BE_CAUGHT = [
  'Your LDL cholesterol is high for a man of your age.',
  'This result puts you at risk of cardiovascular disease.',
  'You should see your doctor urgently about this number.',
  'Vernier can help diagnose iron deficiency from your ferritin.',
];

for (const sentence of MUST_BE_CAUGHT) {
  if (scanForBannedPhrases(sentence).length === 0) {
    failures.push({
      where: 'the check itself',
      what: `this sentence passed and must not: ${JSON.stringify(sentence)}`,
    });
  }
}

/*
 * And the same self-test for the retention comparison, because a parser that
 * silently matched nothing would report every category as agreeing with a
 * document it never read. A table row that disagrees MUST be caught, and a
 * table with no rows at all must be caught too.
 */
{
  const wrong = retentionRows('| Sign-in sessions | `sign_in_session` | `99-hours` | x | y |');
  if (wrong.get('sign_in_session') !== '99-hours') {
    failures.push({
      where: 'the check itself',
      what: 'the retention table parser does not read a row it is handed',
    });
  }
  if (retentionRows('nothing here at all').size !== 0) {
    failures.push({ where: 'the check itself', what: 'the retention parser invents rows' });
  }
  if (stated.size === 0 && privacy !== '') {
    failures.push({
      where: 'docs/privacy.md',
      what: 'the retention table was read as empty, so nothing was compared',
    });
  }
}

// --------------------------------------------------------------------------
// The report. Population first, always, whatever the verdict.

const explanationKeys = templateKeys(strings.labs.explanation, 'labs.explanation');
const explanationWalked = explanationKeys.filter((key) => walkedKeys.has(key));
const keys = [...walkedKeys].sort();

/** The key list, wrapped, because a population nobody can read is a number. */
function wrap(items, width = 96) {
  const lines = [];
  let line = '';
  for (const item of items) {
    if (line !== '' && line.length + item.length + 2 > width) {
      lines.push(line);
      line = '';
    }
    line = line === '' ? item : `${line}, ${item}`;
  }
  if (line !== '') lines.push(line);
  return lines;
}

process.stdout.write(
  `compliance: ${keys.length} templates walked, ${walked.length} renderings scanned ` +
    `(${renderings} of them from the subtree walk), against ${BANNED_PHRASES.length} phrases ` +
    `and ${BANNED_STEMS.length} stems.\n`,
);
process.stdout.write(
  `  explanations: ${BUILT_IN_ANALYTES.length} analytes x ${REFERENCE_SHAPES.length} reference shapes ` +
    `= ${BUILT_IN_ANALYTES.length * REFERENCE_SHAPES.length} rendered through renderExplanation.\n`,
);
process.stdout.write(
  `  branches taken: ${[...branchesTaken].map(([name, count]) => `${name} ${count}`).join(', ')}\n`,
);
process.stdout.write(
  `  analytes: ${BUILT_IN_ANALYTES.map((analyte) => analyte.key).join(', ')}\n`,
);
process.stdout.write(
  `  labs.explanation: ${explanationWalked.length} of ${explanationKeys.length} templates walked: ` +
    `${explanationKeys.map((key) => key.split('.').pop()).join(', ')}\n`,
);
process.stdout.write('  the population, key by key:\n');
for (const line of wrap(keys)) process.stdout.write(`    ${line}\n`);
process.stdout.write(
  `  refusal self-test: ${MUST_BE_CAUGHT.length} sentences that must be caught, all caught.\n`,
);
process.stdout.write(
  `  retention: ${stated.size} categories stated in docs/privacy.md against ${enforced.size} in ` +
    `src/lib/backup/categories.ts:\n`,
);
for (const line of wrap([...enforced].map(([id, token]) => `${id}=${token}`))) {
  process.stdout.write(`    ${line}\n`);
}
if (VERBOSE) {
  for (const line of walked) process.stdout.write(`  ${line.key}\t${line.rendered}\n`);
}

if (BUILT_IN_ANALYTES.length < ANALYTE_FLOOR) {
  process.stderr.write(
    `compliance: ${BUILT_IN_ANALYTES.length} analytes in the catalogue and F57 names ${ANALYTE_FLOOR}.\n` +
      '            A clean walk over a short catalogue proves nothing about the ones missing.\n',
  );
  process.exit(2);
}

if (explanationWalked.length < EXPLANATION_FLOOR || explanationWalked.length < explanationKeys.length) {
  process.stderr.write(
    `compliance: ${explanationWalked.length} of ${explanationKeys.length} explanation templates walked, ` +
      `and R2 says every one.\n` +
      `            Missing: ${explanationKeys.filter((key) => !walkedKeys.has(key)).join(', ')}\n`,
  );
  process.exit(2);
}

if (keys.length < TEMPLATE_FLOOR) {
  process.stderr.write(
    `compliance: ${keys.length} templates walked and the floor is ${TEMPLATE_FLOOR}.\n` +
      '            A subtree that emptied would otherwise report a clean walk over nothing.\n',
  );
  process.exit(2);
}

if (failures.length === 0) {
  process.stdout.write(
    'compliance: no template assesses a condition or recommends a clinical action, ' +
      'every explanation cites a public source and invites a professional, the intended-purpose ' +
      'statement makes all five required claims, and every retention period in docs/privacy.md is ' +
      'the one the code enforces.\n',
  );
  process.exit(0);
}

process.stderr.write('compliance: R2 is not met.\n');
for (const failure of failures) {
  process.stderr.write(`  ${failure.where}  ${failure.what}\n`);
}
process.exit(1);
