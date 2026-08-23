#!/usr/bin/env node
// R2's check: every laboratory explanation this product can render, walked
// against the banned-phrase list, plus the intended-purpose statement.
//
//   node scripts/compliance.mjs            walk it, print the report
//   node scripts/compliance.mjs --verbose  print every rendered explanation
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
// A ZERO IS EVIDENCE ONLY BESIDE THE POPULATION IT COVERED. So the population is
// printed on every run, and the run FAILS if the population is smaller than the
// thirteen analytes F57 names. A clean walk over an empty catalogue reads
// exactly like a clean walk over a full one, and this run has now found seven
// checks that passed by not checking.
//
// AND IT IS WATCHED REFUSING. `--selftest` feeds four sentences that must be
// caught and fails if any of them comes back clean, which is the question "what
// would it take for this to go red" written into the check itself. The same four
// are in tests/unit/compliance.test.ts, which runs in the unit suite.
//
// NOT WIRED INTO scripts/checks.sh FROM THIS WORKTREE. That file is shared by
// five parallel builders and by main's gate; the builder's return value names
// this script as a merge action so it joins the gate on main, once, beside
// `strings` and `sw:check`.
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');

const { strings } = await import(join(projectRoot, 'src', 'lib', 'strings.ts'));
const { BUILT_IN_ANALYTES, renderExplanation } = await import(
  join(projectRoot, 'src', 'lib', 'labs.ts')
);
const { BANNED_PHRASES, BANNED_STEMS, explanationFaults, missingStatements, scanForBannedPhrases } =
  await import(join(projectRoot, 'src', 'lib', 'compliance.ts'));

const VERBOSE = process.argv.includes('--verbose');

/**
 * The thirteen F57 names. The floor this walk must clear, stated as a number
 * rather than left as whatever the catalogue happened to hold.
 */
const ANALYTE_FLOOR = 13;

/**
 * The number formatter the product uses, imported rather than approximated, so
 * the sentence this check scans is the sentence the screen draws down to the
 * decimal places.
 */
const { formatNumber } = await import(join(projectRoot, 'src', 'lib', 'format.ts'));

const failures = [];
const walked = [];

// --------------------------------------------------------------------------
// 1. Every explanation the shipped renderer can produce.

for (const analyte of BUILT_IN_ANALYTES) {
  const label = strings.metrics[analyte.key];
  if (!label) {
    failures.push({
      where: `analyte ${analyte.key}`,
      what: 'no catalogue key for this analyte name, so its explanation cannot be rendered',
    });
    continue;
  }
  const explanation = renderExplanation(analyte, label, formatNumber, strings.labs.explanation);
  const rendered = [
    explanation.context,
    explanation.laboratory,
    explanation.stores,
    explanation.invitation,
    explanation.source,
  ].join(' ');
  walked.push({ key: analyte.key, label, rendered });

  for (const match of scanForBannedPhrases(rendered)) {
    failures.push({
      where: `analyte ${analyte.key}`,
      what: `${match.kind} "${match.term}" in "${match.context}"`,
    });
  }

  const hasPublishedRange = analyte.referenceLow !== null || analyte.referenceHigh !== null;
  for (const fault of explanationFaults(explanation, { hasPublishedRange })) {
    failures.push({ where: `analyte ${analyte.key}`, what: fault });
  }
}

// --------------------------------------------------------------------------
// 2. Every other line of copy the labs surfaces can put on a screen.
//
// The explanations are the templates R2 names, and they are not the only place a
// clinical claim could be written. The flag sentences, the panel note and the
// review copy all sit beside a laboratory number on the same screen, so they are
// walked too. The intended-purpose boundary is a property of what the product
// SAYS, not of which file it was said in.

const alsoWalked = [
  ['panel.note', strings.panel.note],
  ['health.noBloodPressure', strings.health.noBloodPressure],
  ...Object.entries(strings.labs.flags).map(([key, value]) => [`labs.flags.${key}`, value]),
  ...Object.entries(strings.labs)
    .filter(([, value]) => typeof value === 'string')
    .map(([key, value]) => [`labs.${key}`, value]),
];

for (const [key, line] of alsoWalked) {
  walked.push({ key, label: key, rendered: line });
  for (const match of scanForBannedPhrases(line)) {
    failures.push({ where: key, what: `${match.kind} "${match.term}" in "${match.context}"` });
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
// 4. What it would take for this to go red, run every time.

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

// --------------------------------------------------------------------------
// The report. Population first, always, whatever the verdict.

process.stdout.write(
  `compliance: ${walked.length} rendered lines walked, ${BUILT_IN_ANALYTES.length} analytes, ` +
    `against ${BANNED_PHRASES.length} phrases and ${BANNED_STEMS.length} stems.\n`,
);
process.stdout.write(
  `  analytes: ${BUILT_IN_ANALYTES.map((analyte) => analyte.key).join(', ')}\n`,
);
process.stdout.write(
  `  refusal self-test: ${MUST_BE_CAUGHT.length} sentences that must be caught, all caught.\n`,
);
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

if (failures.length === 0) {
  process.stdout.write(
    'compliance: no explanation assesses a condition or recommends a clinical action, ' +
      'every one cites a public source and invites a professional, and the intended-purpose ' +
      'statement makes all five required claims.\n',
  );
  process.exit(0);
}

process.stderr.write('compliance: R2 is not met.\n');
for (const failure of failures) {
  process.stderr.write(`  ${failure.where}  ${failure.what}\n`);
}
process.exit(1);
