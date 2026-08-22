#!/usr/bin/env node
// The catalogue, written into the service worker.
//
//   node scripts/build-sw.mjs            write the block into public/sw.js
//   node scripts/build-sw.mjs --check    fail if what is there is not what this
//                                        would write
//
// WHY THIS EXISTS. public/sw.js answered `new Response('Offline', {status:
// 503})` when a navigation missed every cache, and that is a user-facing string
// with no key: it duplicated `strings.offline.title` with no reference to it,
// which is the same shape this run already ruled a defect when 'Sign in first.'
// duplicated its catalogue key in the middleware. It is not hypothetical
// either. Cache Storage is evicted by the browser under storage pressure, not
// by anybody here, and with the entries evicted an offline navigation to /eat
// returned 503 text/plain reading "Offline", reproduced twice in Chrome with
// the worker installed and controlling.
//
// A worker cannot import the catalogue: it is not a module in the app's graph,
// it is a file the browser fetches on its own and runs in its own scope. So the
// catalogue comes to it, at build time, as a generated block this script owns
// and nothing else may edit. The check runs in the gate, so an edit to the
// catalogue that leaves the worker behind is a red check and not a surprise on
// a phone with no signal.
//
// What is written is the copy the offline screen already uses, so the last
// resort says what /offline says. The host in the sentence is read at run time
// from the worker's own origin, which is a value and not copy.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');
const worker = join(projectRoot, 'public', 'sw.js');
const catalogue = join(projectRoot, 'src', 'lib', 'strings.ts');

const { strings } = await import(catalogue);

const OPEN = '// --- generated from src/lib/strings.ts by scripts/build-sw.mjs. Do not edit by hand.';
const CLOSE = '// --- end generated ---';

/** Every string the worker itself puts on a screen, by its key. */
const KEYS = [
  ['title', strings.offline.title],
  ['cardTitle', strings.offline.cardTitle],
  ['causePrefix', strings.offline.causePrefix],
  ['causeSuffix', strings.offline.causeSuffix],
];

/**
 * A JavaScript string literal in this repository's own quoting: single, unless
 * the value carries a quote of its own and JSON's escaping is the honest answer.
 */
function literal(value) {
  if (!/['\\]/.test(value)) return `'${value}'`;
  return JSON.stringify(value);
}

function block() {
  const lines = KEYS.map(([name, value]) => `  ${name}: ${literal(value)},`);
  return [
    OPEN,
    '// Run `npm run sw` after changing strings.offline in the catalogue.',
    'const COPY = {',
    ...lines,
    '};',
    CLOSE,
  ].join('\n');
}

const source = await readFile(worker, 'utf8');
const opensAt = source.indexOf(OPEN);
const closesAt = source.indexOf(CLOSE);
if (opensAt === -1 || closesAt === -1 || closesAt < opensAt) {
  process.stderr.write(
    `build-sw: ${relative(projectRoot, worker)} has no generated block to write into.\n` +
      `  It must carry these two lines with the COPY object between them:\n    ${OPEN}\n    ${CLOSE}\n`,
  );
  process.exit(2);
}

const current = source.slice(opensAt, closesAt + CLOSE.length);
const wanted = block();

if (process.argv.includes('--check')) {
  if (current === wanted) {
    process.stdout.write(
      `build-sw: public/sw.js carries the catalogue's offline copy, ${KEYS.length} key(s), and is current.\n`,
    );
    process.exit(0);
  }
  process.stderr.write(
    'build-sw: public/sw.js does not carry what the catalogue says today, which C6 does not allow.\n',
  );
  process.stderr.write(`  in the worker:\n${current.replace(/^/gm, '    ')}\n`);
  process.stderr.write(`  in the catalogue:\n${wanted.replace(/^/gm, '    ')}\n`);
  process.stderr.write('  Run: npm run sw\n');
  process.exit(1);
}

await writeFile(worker, source.slice(0, opensAt) + wanted + source.slice(closesAt + CLOSE.length), 'utf8');
process.stdout.write(
  `build-sw: wrote ${KEYS.length} catalogue key(s) into public/sw.js: ${KEYS.map(([name]) => `offline.${name}`).join(', ')}.\n`,
);
