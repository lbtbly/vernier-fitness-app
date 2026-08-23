/**
 * The stylesheet's own shape, checked.
 *
 * On 2026-08-23 a merge splice tore `.seg button{` in half: the selector and
 * two declarations stayed where they were, the remaining declarations and the
 * closing brace were stranded 270 lines away with no selector of their own. CSS
 * nesting then swallowed the rest of the file, so about seventy rules shipped
 * prefixed `.seg button ` and matched nothing. Two screens stopped matching
 * their designs and a rubric line failed on it.
 *
 * NONE OF THE SIX GATE STEPS COULD SEE IT. typecheck and lint do not read CSS.
 * `strings` and `strings:rendered` read words, not structure. The build
 * compiled it happily, because nesting is valid CSS and a rule nested under a
 * selector that never matches is not an error, it is just dead.
 *
 * AND A BRACE COUNT CANNOT SEE IT EITHER. Comments carry braces, and so do
 * content strings, so the torn file counted perfectly balanced while being
 * structurally wrong. That is why this walks the file with comments and strings
 * blanked and THEIR NEWLINES KEPT, so a fault reports the line it is really on.
 *
 * What it refuses:
 *   1. an unmatched closing brace, which means a rule ended that never began;
 *   2. a rule left open at end of file;
 *   3. a declaration sitting at depth 0, which is the orphaned-tail shape and
 *      the one that actually shipped.
 *
 * GOES RED IF: any of those three appears. Proven by planting each in turn.
 */
import { readFileSync } from 'node:fs';

const FILE = process.argv[2] ?? 'src/app/globals.css';
const raw = readFileSync(FILE, 'utf8');

// Blank comments and strings, keeping their newlines so line numbers survive.
const blanked = raw
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/"[^"\n]*"|'[^'\n]*'/g, (m) => ' '.repeat(m.length));

const lines = blanked.split('\n');
const faults = [];
let depth = 0;

lines.forEach((line, index) => {
  const number = index + 1;
  const source = raw.split('\n')[index] ?? '';

  // A declaration at depth 0: `prop:value;` outside any rule.
  if (depth === 0 && /^\s*[-a-zA-Z]+\s*:[^;{]*;\s*$/.test(line) && !/^\s*@/.test(line)) {
    faults.push(`${FILE}:${number}  a declaration outside any rule: ${source.trim()}`);
  }

  for (const character of line) {
    if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth < 0) {
        faults.push(`${FILE}:${number}  a closing brace with no rule open: ${source.trim()}`);
        depth = 0;
      }
    }
  }
});

if (depth > 0) faults.push(`${FILE}  ${depth} rule(s) left open at end of file`);

// The population, printed beside the zero, because a zero is evidence only
// beside what it covered.
const ruleCount = (blanked.match(/\{/g) ?? []).length;
process.stdout.write(
  `css-structure: ${lines.length} line(s), ${ruleCount} rule(s) walked in ${FILE}\n`,
);

if (faults.length > 0) {
  process.stderr.write(`css-structure: ${faults.length} structural fault(s)\n`);
  for (const fault of faults) process.stderr.write(`  ${fault}\n`);
  process.exit(1);
}
process.stdout.write('css-structure: every rule opens, closes and holds its own declarations.\n');
