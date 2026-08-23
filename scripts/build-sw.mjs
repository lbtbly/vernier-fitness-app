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
//
// AND --check READS THE WHOLE FILE, NOT ONLY THE BLOCK. Comparing the generated
// block against the catalogue proves the block is current and proves nothing at
// all about the rest of the file, and the verifier put a sentence in the rest of
// the file and read it off a worker-painted 503 with the caches evicted and the
// origin gone. scripts/strings.mjs names public/sw.js as outside its walk, and
// the rendered walk runs with service workers blocked, so this is the only check
// that can see that file: it is the last reader of the last copy on the screen.
//
// So every string in it is judged. Two ways through and no third: a fragment is
// either one of the machine tokens declared in MACHINE below, each of which is a
// path, an event name, a header name or a store name that no person reads, or it
// is markup with no text of its own, which is what the offline document is
// between its interpolations. Anything else fails, one word or twenty, and
// adding a word to MACHINE is a deliberate edit to this file rather than
// something a sentence can drift into.
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


// --------------------------------------------------------------------------
// Every string in the worker, and what it is allowed to be.

/**
 * The machine tokens this worker holds, each one declared.
 *
 * A path, an event name, a cache name, a header name, an IndexedDB store name,
 * a MIME type, an HTML entity. None of them is read by a person: they are what
 * the worker says to the browser. The list is exhaustive on purpose, so adding
 * a string to public/sw.js means adding it here and saying which of those it
 * is, and a sentence cannot arrive by accident.
 */
const MACHINE = new Set([
  // Cache and version.
  'v4',
  'vernier-shell-',
  // Paths this worker precaches, serves or refuses to touch.
  '/offline',
  '/manifest.webmanifest',
  '/icons/vernier-mark.svg',
  '/icons/apple-touch-icon-180.png',
  '/icons/icon-192.png',
  '/favicon.ico',
  '/healthz',
  '/sw.js',
  // Service worker events and the one message the app sends.
  'install',
  'activate',
  'message',
  'fetch',
  'push',
  'SKIP_WAITING',
  // Request and response shapes.
  'GET',
  'navigate',
  'basic',
  'Content-Type',
  'text/html; charset=utf-8',
  // The outbox: database, stores, keys and the headers a queued write carries.
  'vernier',
  'outbox',
  'meta',
  'csrf',
  'id',
  'readonly',
  'readwrite',
  'Idempotency-Key',
  'x-vernier-csrf',
  // The five characters the offline document escapes.
  '&amp;',
  '&lt;',
  '&gt;',
  '&quot;',
]);

/** Attributes inside markup that a screen reader says out loud. */
const SPOKEN = ['alt', 'title', 'aria-label', 'aria-description', 'aria-roledescription', 'placeholder'];

/**
 * Every string literal and every static chunk of every template, with the
 * comments thrown away first.
 *
 * Written by hand rather than with a parser because the alternative is a
 * dependency in the gate, and because the shape of this file is small and
 * fixed: strings, templates, regular expressions and two kinds of comment.
 */
function stringsIn(source) {
  const found = [];
  let index = 0;
  let regexAllowed = true;
  const push = (text, at) => found.push({ text, line: source.slice(0, at).split('\n').length });
  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];
    if (character === '/' && next === '/') {
      index = source.indexOf('\n', index);
      if (index === -1) break;
      continue;
    }
    if (character === '/' && next === '*') {
      const closes = source.indexOf('*/', index + 2);
      index = closes === -1 ? source.length : closes + 2;
      continue;
    }
    if (character === '/' && regexAllowed) {
      // A regular expression, which holds no copy and is skipped whole.
      let at = index + 1;
      let inClass = false;
      while (at < source.length) {
        if (source[at] === '\\') at += 2;
        else if (source[at] === '[') { inClass = true; at += 1; }
        else if (source[at] === ']') { inClass = false; at += 1; }
        else if (source[at] === '/' && !inClass) break;
        else if (source[at] === '\n') break;
        else at += 1;
      }
      index = at + 1;
      regexAllowed = false;
      continue;
    }
    if (character === "'" || character === '"') {
      const opensAt = index;
      let at = index + 1;
      let text = '';
      while (at < source.length && source[at] !== character) {
        if (source[at] === '\\') { text += source[at + 1]; at += 2; continue; }
        text += source[at];
        at += 1;
      }
      push(text, opensAt);
      index = at + 1;
      regexAllowed = false;
      continue;
    }
    if (character === '`') {
      // No opensAt here: a template is pushed chunk by chunk and every chunk
      // carries its own position, so the backtick's own index is never a line
      // this scan reports.
      let at = index + 1;
      let chunk = '';
      let chunkAt = at;
      while (at < source.length && source[at] !== '`') {
        if (source[at] === '\\') { chunk += source[at + 1]; at += 2; continue; }
        if (source[at] === '$' && source[at + 1] === '{') {
          push(chunk, chunkAt);
          chunk = '';
          // Step over the interpolation, counting braces, so a template inside
          // one does not end this scan early.
          let depth = 1;
          at += 2;
          while (at < source.length && depth > 0) {
            if (source[at] === '{') depth += 1;
            else if (source[at] === '}') depth -= 1;
            at += 1;
          }
          chunkAt = at;
          continue;
        }
        chunk += source[at];
        at += 1;
      }
      push(chunk, chunkAt);
      index = at + 1;
      regexAllowed = false;
      continue;
    }
    if (!/\s/.test(character)) {
      // Whether a `/` after this character opens a regular expression or divides.
      regexAllowed = /[({[,;=:!&|?+\-*%~^<>]/.test(character) || /[^\w$)\]]/.test(character);
      if (/[\w$)\]]/.test(character)) regexAllowed = false;
    }
    index += 1;
  }
  return found;
}

/** Anything a person could read, once the markup and the punctuation are gone. */
function wordsLeftIn(text) {
  const withoutStyle = text.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  const spoken = [];
  for (const tag of withoutStyle.matchAll(/<[^>]*>/g)) {
    for (const attribute of SPOKEN) {
      const value = new RegExp(`\\b${attribute}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag[0]);
      if (value && /[A-Za-z]/.test(value[1])) spoken.push(`${attribute}="${value[1]}"`);
    }
  }
  const withoutTags = withoutStyle.replace(/<[^>]*>/g, '');
  const remaining = withoutTags.replace(/&[a-z]+;/gi, '').replace(/[^A-Za-z]/g, '');
  if (remaining === '' && spoken.length === 0) return null;
  return [remaining === '' ? null : withoutTags.trim(), ...spoken].filter(Boolean).join(' + ');
}

/** Every string outside the generated block that is neither declared nor markup. */
function copyOutsideTheBlock(source, from, to) {
  const outside = source.slice(0, from) + '\n'.repeat(source.slice(from, to).split('\n').length - 1) + source.slice(to);
  const defects = [];
  for (const { text, line } of stringsIn(outside)) {
    if (text.trim() === '') continue;
    if (MACHINE.has(text)) continue;
    const words = wordsLeftIn(text);
    if (words === null) continue;
    defects.push({ line, text, words });
  }
  return defects;
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
  let failed = false;
  if (current !== wanted) {
    failed = true;
    process.stderr.write(
      'build-sw: public/sw.js does not carry what the catalogue says today, which C6 does not allow.\n',
    );
    process.stderr.write(`  in the worker:\n${current.replace(/^/gm, '    ')}\n`);
    process.stderr.write(`  in the catalogue:\n${wanted.replace(/^/gm, '    ')}\n`);
    process.stderr.write('  Run: npm run sw\n');
  }

  const copy = copyOutsideTheBlock(source, opensAt, closesAt + CLOSE.length);
  if (copy.length > 0) {
    failed = true;
    process.stderr.write(
      `\nbuild-sw: ${copy.length} string(s) outside the generated block that a person could read, which C6 does not allow:\n`,
    );
    for (const { line, text, words } of copy) {
      process.stderr.write(`  public/sw.js:${line}  ${JSON.stringify(text)}\n    reads as: ${words}\n`);
    }
    process.stderr.write(
      '  A worker cannot import the catalogue, so copy it says belongs in strings.offline and comes\n' +
        '  through the generated block. A machine token belongs in MACHINE in scripts/build-sw.mjs,\n' +
        '  named as what it is.\n',
    );
  }

  if (failed) process.exit(1);
  const scanned = stringsIn(source).filter(({ text }) => text.trim() !== '').length;
  process.stdout.write(
    `build-sw: public/sw.js carries the catalogue's offline copy, ${KEYS.length} key(s), and is current.\n` +
      `  ${scanned} string(s) read across the whole file; every one outside the block is a declared machine token or markup with no text of its own.\n`,
  );
  process.exit(0);
}

await writeFile(worker, source.slice(0, opensAt) + wanted + source.slice(closesAt + CLOSE.length), 'utf8');
process.stdout.write(
  `build-sw: wrote ${KEYS.length} catalogue key(s) into public/sw.js: ${KEYS.map(([name]) => `offline.${name}`).join(', ')}.\n`,
);
