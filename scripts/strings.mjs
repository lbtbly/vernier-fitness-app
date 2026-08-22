#!/usr/bin/env node
// The string inventory, and the check that the inventory is the whole truth.
//
//   node scripts/strings.mjs              print the inventory, one line per key
//   node scripts/strings.mjs --check      print it, then fail if anything the
//                                         owner can read is written inline
//
// C6. Two claims, one script. The first is that every user-facing string has a
// key, which the inventory prints. The second is that nothing bypasses the
// catalogue, which no inventory can prove on its own.
//
// It reads src/lib/strings.ts directly, the way scripts/route-table.mjs reads
// src/lib/routes.ts, so the list printed here and the list the app renders are
// the same list and cannot drift.
//
// It is the fast half of C6 and no longer the whole of it. A source scanner
// answers "does this literal look like copy", and every version of that question
// has a rule a real string can walk past: this one has walked past a directory
// it did not scan and a two-word database value inside a directory it did. What
// rules now is scripts/rendered-strings.mjs, which reads the shipped screens
// instead of the source and asks the closed-world question, "is every fragment
// on this screen in the catalogue". This still runs first because it needs no
// stack and answers in a second, and because the inventory it prints is the
// other half of C6's evidence.
//
// It used to walk only .tsx under src/app and src/components, and that hole was
// the whole of a defect: sixty-odd refusal sentences lived in the .ts route
// handlers, one of them naming two JSON fields to a person on screen, and this
// script exited 0 over all of them. A checker that cannot see a construct
// cannot claim a complete inventory. So it now walks .ts as well as .tsx, and it
// reads a template literal as the text it is rather than skipping it.
//
// It walks the whole of src/ now, not a list of directories inside it. The list
// was four trees and the root of src/ was in none of them, which is where the
// middleware refusal shipped from and where a planted sentence sat at exit 0 a
// second time. It reads .css as well, because `content:` is a property that
// paints words on a screen and no text walk on the other side can see them.
// What is still outside is printed on every run, under "outside this walk".
import { readFile, readdir } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');

const { strings } = await import(join(projectRoot, 'src', 'lib', 'strings.ts'));

/** Every leaf of the catalogue, as a dotted key and the string it holds. */
function flatten(node, prefix = '') {
  const rows = [];
  for (const [name, value] of Object.entries(node)) {
    const key = prefix ? `${prefix}.${name}` : name;
    if (typeof value === 'string') {
      rows.push({ key, kind: 'text', value });
    } else if (typeof value === 'function') {
      // A string that takes data. Its template is the string, so the template
      // is what the inventory prints.
      const source = value
        .toString()
        .replace(/\s+/g, ' ')
        .trim();
      rows.push({ key, kind: 'template', value: source });
    } else if (value && typeof value === 'object') {
      rows.push(...flatten(value, key));
    }
  }
  return rows;
}

const inventory = flatten(strings).sort((left, right) => left.key.localeCompare(right.key));

for (const row of inventory) {
  process.stdout.write(`${row.key}\t${row.kind}\t${row.value}\n`);
}
process.stdout.write(`\n${inventory.length} keys in src/lib/strings.ts\n`);

if (!process.argv.includes('--check')) process.exit(0);

// --------------------------------------------------------------------------
// The other half: nothing written inline.
//
// Parsed, not grepped. A regular expression over source cannot tell a JSX text
// node from a type annotation, and a check that cries wolf on `: IconProps` is
// a check somebody turns off. TypeScript is already a dependency of this
// project, so the same parser the build uses reads the tree.
//
// Three rules, and each one is stated in full below where it is applied:
//
//   1. JSX. Text nodes, spoken attributes and bare literals used as children.
//   2. The refusal sink. Nothing but a catalogue reference may sit in the
//      `error` or `detail` position of refuse(), because those two arguments
//      are rendered verbatim on the value sheet and at the gate.
//   3. Shape. A prose sentence anywhere in these trees.
import ts from 'typescript';
import {
  CSS_CONTENT_DECLARATION,
  LOOKS_LIKE_COPY,
  NOT_COPY,
  SPOKEN_ATTRIBUTES,
  cssContentStrings,
} from './lib/vocabulary.mjs';

/**
 * The whole of src/, and it is one entry on purpose.
 *
 * It used to be four trees, `src/app`, `src/components`, `src/lib` and
 * `src/db`, and the root of src/ was in none of them: `src/middleware.ts` and
 * `src/instrumentation.ts` were outside the walk. That is not a hypothetical
 * gap. It is where slice 3's second C6 failure shipped from, a plain English
 * refusal written inline in the middleware and answered to a person, with this
 * check at exit 0 over it, and a sentence planted there at the fourth verify
 * left the check at exit 0 again. A named list of directories is a list that
 * goes stale the first time a file lands beside it rather than under it, so
 * there is no list: everything under src/ is walked, and a new directory is
 * covered the day it is created.
 */
const SCAN_ROOT = join(projectRoot, 'src');

/**
 * What is still outside this walk, printed on every run rather than discovered
 * at a verification. Two of these reach a person and both are named:
 *
 *   - public/sw.js. Hand-written, no import of the catalogue possible, and it
 *     answers `new Response('Offline', {status: 503})` when a navigation misses
 *     the cache. That body is copy with no key and it is C3's defect, not a new
 *     one. The service worker is registered with `serviceWorkers: 'block'` in
 *     the rendered walk, so neither check sees it today.
 *   - public/manifest.webmanifest is generated from src/app, and the rendered
 *     check reads the served manifest's name, short_name and description.
 *   - drizzle/*.sql, next.config.ts, drizzle.config.ts, playwright.config.ts
 *     and everything under scripts/ and tests/: tooling and schema, no reader.
 *   - docs/ and SETUP.html: prose written for the owner as documents, which is
 *     not the product speaking on a screen.
 */
const OUTSIDE_THE_WALK = [
  'public/sw.js, which cannot import the catalogue and answers its own 503 body',
  'public/icons and public/favicon.ico, which carry no words',
  'drizzle/*.sql, and the four config files at the root',
  'scripts/ and tests/, which speak to an operator and never to a screen',
  'docs/ and SETUP.html, documents rather than product surfaces',
];

/** The catalogue itself, which is where the strings are supposed to be. */
const CATALOGUE = join(projectRoot, 'src', 'lib', 'strings.ts');

/**
 * Attributes a person reads or hears, from the module both checkers import.
 *
 * This was a second local list once, six entries, equal to the other one by
 * hand and drifted from the truth in both places at the same time:
 * `aria-roledescription` was missing from both, which made it the single string
 * shape the union of the two checks could not see. There is one list now.
 */
const SPOKEN = new Set(SPOKEN_ATTRIBUTES);

/**
 * A string a person reads.
 *
 * The word count is gone. It said "three or more words" and that is exactly the
 * rule `'not connected'` walked through, two words returned by a database helper
 * and painted on a chip. C6 now says "however few words it is", so this asks
 * about shape and never about length: it opens with a capital or it closes on a
 * full stop, a question mark or an exclamation mark.
 *
 * What sits under that line is machine notation, and it is excluded by naming
 * what it looks like rather than by how short it is. A route key, a MIME type,
 * a header name, a SCREAMING constant, an identifier in camel or snake or kebab
 * case: none of them is prose, and each one is a shape. An audit reason stored
 * in a column stays out because it is deliberately lower case with no full
 * stop, a stylesheet or an SVG path opens on a brace or an angle bracket, and a
 * SQL statement opens on a lower-case verb. No sentence written for a reader
 * can fail this test, and one capitalised word now fails it the way a paragraph
 * does.
 */
const MACHINE_SHAPES = [
  /^[A-Z][A-Z0-9]*(?:[-_][A-Z0-9]+)*$/, // HTTP, POST, MASTER_KEY
  /^[a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)+$/, // camelCase
  /^[A-Z][a-z0-9]*(?:[A-Z][a-z0-9]*)+$/, // PascalCase, which is how a class names itself
  /^[A-Za-z][A-Za-z0-9]*(?:[-_.][A-Za-z0-9]+)+$/, // kebab, snake, dotted, Idempotency-Key
  /^[A-Za-z]+\/[A-Za-z0-9.+-]+$/, // application/json, Europe/Paris, mmol/L
  /^\W*$/, // punctuation only
];

/**
 * Every shape above is one run of characters with no space in it, which is the
 * whole of the claim: notation is a token and copy is language. A shape that
 * could swallow a phrase would be the `machine identifier` mistake again, so
 * this is asserted here rather than trusted, and the check refuses to start if
 * any shape ever accepts a sentence.
 */
for (const shape of MACHINE_SHAPES) {
  if (shape.test('Sign in first.') || shape.test('sign-in first')) {
    process.stderr.write('strings: a machine shape accepts a phrase, which is the hole it exists to avoid.\n');
    process.exit(2);
  }
}

function readsAsASentence(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith('<') || trimmed.startsWith(':') || trimmed.startsWith('{')) return false;
  const words = trimmed.split(/\s+/).filter((word) => /[A-Za-z]{2,}/.test(word));
  if (words.length === 0) return false;
  if (MACHINE_SHAPES.some((shape) => shape.test(trimmed))) return false;
  return /^[A-Z]/.test(trimmed) || /[.?!]$/.test(trimmed);
}

/** Every file under src/ this check knows how to read. */
const READABLE = new Set(['.ts', '.tsx', '.css']);

async function walk(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await walk(path)));
    else if (READABLE.has(extname(entry.name))) found.push(path);
  }
  return found;
}

/**
 * The text of a literal, including a template literal.
 *
 * A `TemplateExpression` used to return null here, which made
 * `` `Sent ${count} rows to the Mac mini.` `` invisible to every rule below. No
 * user copy is written that way today and that is exactly why it had to be
 * fixed now: an inventory is complete or it is a guess. The interpolations come
 * back as `${}` so what is printed is the shape of the sentence rather than a
 * variable name.
 */
function literalOf(node) {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    return (
      node.head.text + node.templateSpans.map((span) => `\${}${span.literal.text}`).join('')
    );
  }
  if (ts.isJsxExpression(node)) return literalOf(node.expression);
  if (ts.isParenthesizedExpression(node)) return literalOf(node.expression);
  return null;
}

/** Is this argument a reference into the catalogue rather than a written string. */
function fromCatalogue(node) {
  if (!node) return false;
  let cursor = node;
  if (ts.isCallExpression(cursor)) cursor = cursor.expression;
  while (ts.isPropertyAccessExpression(cursor) || ts.isElementAccessExpression(cursor)) {
    cursor = cursor.expression;
  }
  return ts.isIdentifier(cursor) && cursor.text === 'strings';
}

const violations = [];

const files = (await walk(SCAN_ROOT)).sort();
let stylesheetsWalked = 0;
let modulesWalked = 0;

for (const file of files) {
  if (file === CATALOGUE) continue;
  const source = await readFile(file, 'utf8');
  const name = relative(projectRoot, file);

  // A stylesheet, which is a place a sentence can be written. `content` is the
  // one CSS property that paints words, it reaches a person on every element
  // the rule matches, and no text walk on the rendered side can see it: this
  // check reads none of these files before today and `.chip::after{content:"
  // Not synced yet"}` painted on every chip with both checks at exit 0. Read
  // the declarations, and nothing else in the file.
  if (extname(file) === '.css') {
    stylesheetsWalked += 1;
    for (const declaration of source.matchAll(CSS_CONTENT_DECLARATION)) {
      for (const text of cssContentStrings(declaration[2])) {
        if (!LOOKS_LIKE_COPY.test(text)) continue;
        const line = source.slice(0, declaration.index).split('\n').length;
        violations.push({ file: name, line, kind: 'css content', text });
      }
    }
    continue;
  }

  modulesWalked += 1;
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const at = (node) => tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;

  const visit = (node) => {
    // 1. JSX.
    if (ts.isJsxText(node)) {
      const text = node.text.trim();
      if (LOOKS_LIKE_COPY.test(text) && !NOT_COPY.has(text)) {
        violations.push({ file: name, line: at(node), kind: 'jsx text', text });
      }
    } else if (ts.isJsxAttribute(node) && SPOKEN.has(node.name.getText(tree))) {
      const text = literalOf(node.initializer);
      if (text !== null && LOOKS_LIKE_COPY.test(text)) {
        violations.push({
          file: name,
          line: at(node),
          kind: `attribute ${node.name.getText(tree)}`,
          text,
        });
      }
    } else if (ts.isJsxExpression(node) && node.parent && ts.isJsxElement(node.parent)) {
      const text = literalOf(node.expression);
      if (text !== null && LOOKS_LIKE_COPY.test(text)) {
        violations.push({ file: name, line: at(node), kind: 'jsx child literal', text });
      }
    }

    // 2. The refusal sink. refuse(status, error, detail) puts both of its
    // sentences on a screen: the gate renders `error` under the passkey
    // button and the value sheet renders both into screen 00's error card.
    // A literal in either position is copy with no key, whatever it says, so
    // this rule does not consult the shape at all.
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'refuse'
    ) {
      for (const [index, argument] of node.arguments.entries()) {
        if (index === 0 || index > 2) continue;
        const text = literalOf(argument);
        if (text !== null && !fromCatalogue(argument)) {
          violations.push({
            file: name,
            line: at(argument),
            kind: index === 1 ? 'refuse() error' : 'refuse() detail',
            text,
          });
        }
      }
    }

    // 3. Shape, everywhere else. A sentence written for a reader, wherever
    // it was written.
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateExpression(node)
    ) {
      const text = literalOf(node);
      if (text !== null && readsAsASentence(text)) {
        violations.push({ file: name, line: at(node), kind: 'sentence', text });
      }
      // 4. A `content` declaration inside a stylesheet written as a string.
      // src/lib/offline-css.ts is a whole stylesheet in a template literal, and
      // a rule that only read .css files would have moved the hole here rather
      // than closed it.
      if (text !== null) {
        for (const declaration of text.matchAll(CSS_CONTENT_DECLARATION)) {
          for (const painted of cssContentStrings(declaration[2])) {
            if (!LOOKS_LIKE_COPY.test(painted)) continue;
            violations.push({ file: name, line: at(node), kind: 'css content', text: painted });
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  };
  visit(tree);
}

// One line per place, so a string caught by two rules is reported once.
const unique = [];
const seen = new Set();
for (const violation of violations) {
  const at = `${violation.file}:${violation.line}:${violation.text}`;
  if (seen.has(at)) continue;
  seen.add(at);
  unique.push(violation);
}

// What was walked, and what was not, on every run. A zero is evidence only
// beside the population it covered, so the population is printed either way.
process.stdout.write(
  `strings: ${files.length} files under src/, ${modulesWalked} module(s) parsed and ${stylesheetsWalked} stylesheet(s) read, against ${inventory.length} keys.\n`,
);
for (const outside of OUTSIDE_THE_WALK) process.stdout.write(`  outside this walk  ${outside}\n`);

if (unique.length === 0) {
  process.stdout.write('strings: no user-facing string is written inline.\n');
  process.exit(0);
}

process.stderr.write('strings: user-facing text written inline, which C6 does not allow:\n');
for (const violation of unique) {
  process.stderr.write(
    `  ${violation.file}:${violation.line}  ${violation.kind}  ${JSON.stringify(violation.text)}\n`,
  );
}
process.exit(1);
