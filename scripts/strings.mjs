#!/usr/bin/env node
// The string inventory, and the check that the inventory is the whole truth.
//
//   node scripts/strings.mjs              print the inventory, one line per key
//   node scripts/strings.mjs --check      print it, then fail if a component
//                                         writes a user-facing string inline
//
// C6. Two claims, one script. The first is that every user-facing string has a
// key, which the inventory prints. The second is that no component writes one
// inline, which no inventory can prove on its own: a catalogue is only complete
// if nothing bypasses it, so this walks every .tsx under src/app and
// src/components and looks for text a person would read.
//
// It reads src/lib/strings.ts directly, the way scripts/route-table.mjs reads
// src/lib/routes.ts, so the list printed here and the list the app renders are
// the same list and cannot drift.
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
// Parsed, not grepped. A regular expression over .tsx cannot tell a JSX text
// node from a type annotation, and a check that cries wolf on `: IconProps` is
// a check somebody turns off. TypeScript is already a dependency of this
// project, so the same parser the build uses reads the tree and this looks at
// exactly three kinds of node: JSX text, a spoken attribute holding a literal,
// and a bare string literal used as a JSX child.
import ts from 'typescript';

const SCAN_DIRS = [join(projectRoot, 'src', 'app'), join(projectRoot, 'src', 'components')];

/** Attributes a person reads or hears. */
const SPOKEN_ATTRIBUTES = new Set(['aria-label', 'aria-description', 'aria-placeholder', 'placeholder', 'alt', 'title']);

/** Two letters in a row is copy. One letter, punctuation or a numeral is glue. */
const LOOKS_LIKE_COPY = /[A-Za-z]{2,}/;

/** Words that are markup, not language. */
const NOT_COPY = new Set(['px', 'em', 'rem']);

async function walk(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await walk(path)));
    else if (extname(entry.name) === '.tsx') found.push(path);
  }
  return found;
}

function literalOf(node) {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isJsxExpression(node)) return literalOf(node.expression);
  return null;
}

const violations = [];

for (const dir of SCAN_DIRS) {
  for (const file of await walk(dir)) {
    const source = await readFile(file, 'utf8');
    const name = relative(projectRoot, file);
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

    const visit = (node) => {
      if (ts.isJsxText(node)) {
        const text = node.text.trim();
        if (LOOKS_LIKE_COPY.test(text) && !NOT_COPY.has(text)) {
          violations.push({ file: name, kind: 'jsx text', text });
        }
      } else if (ts.isJsxAttribute(node) && SPOKEN_ATTRIBUTES.has(node.name.getText(tree))) {
        const text = literalOf(node.initializer);
        if (text !== null && LOOKS_LIKE_COPY.test(text)) {
          violations.push({ file: name, kind: `attribute ${node.name.getText(tree)}`, text });
        }
      } else if (ts.isJsxExpression(node) && node.parent && ts.isJsxElement(node.parent)) {
        const text = literalOf(node.expression);
        if (text !== null && LOOKS_LIKE_COPY.test(text)) {
          violations.push({ file: name, kind: 'jsx child literal', text });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
  }
}

if (violations.length === 0) {
  process.stdout.write(
    `strings: no user-facing string is written inline in a component. ${SCAN_DIRS.length} trees scanned, ${inventory.length} keys.\n`,
  );
  process.exit(0);
}

process.stderr.write('strings: user-facing text written inline, which C6 does not allow:\n');
for (const violation of violations) {
  process.stderr.write(`  ${violation.file}  ${violation.kind}  ${JSON.stringify(violation.text)}\n`);
}
process.exit(1);
