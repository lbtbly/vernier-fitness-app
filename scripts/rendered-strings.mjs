#!/usr/bin/env node
// The closed-world string check: every word the product renders has a key.
//
//   node scripts/rendered-strings.mjs            walk it, print the report
//   node scripts/rendered-strings.mjs --verbose  print every fragment it read
//   node scripts/rendered-strings.mjs --database vernier_scratch --container vernier-scratch
//                                                walk another instance instead
//
// THE INSTANCE IS AN ARGUMENT. This script used to name the owner's container
// and the owner's database in two helpers, so the empty-database floor it
// asserts could not be re-proved by anybody: proving a floor means standing on
// a database with nothing in it, and the only database it could reach was the
// one with the owner's readings in it. `--database` and `--container` point the
// same walk at the scratch instance, which scripts/test-stack.sh already
// provides, with APP_URL naming its origin.
//
// C6's second clause is that no user-facing string is written inline. The
// source-side scanner in scripts/strings.mjs answers that by asking the code
// "does this literal look like copy", and every version of that question has a
// rule a real string can walk past: a directory it does not walk, a word count
// it does not meet, a syntax node it does not model. Three such rules shipped
// and the verifier beat all three. The fourth would have gone the same way:
// `'Sign in first.'` sat in src/middleware.ts, outside every scanned tree, and
// `'not connected'` sat inside a scanned tree and was two words long.
//
// So this check is inverted. It does not read source at all. It renders the
// shipped product, in every state it can reach, reads the text off the screen
// the way the owner does, and asserts that every fragment is accounted for by
// the catalogue. A string that reaches a person with no key fails here whatever
// file it came from and however few words it has, because what is being read is
// the screen and not the code.
//
// WHAT ACCOUNTS FOR A FRAGMENT. Three things and no fourth:
//
//   1. The catalogue. Every leaf of src/lib/strings.ts, plus, for the keys that
//      take data, the literal segments either side of each interpolation. So
//      `staleLabel('Withings', 3)` is accounted for as "Withings" from the
//      source labels, "3" as a number, and ", " and " days old" as segments of
//      the key itself.
//   2. Data the owner or a device authored, read back out of this database:
//      raw values, correction reasons, source references, the rows a source
//      record carries, an integration scope, a passkey's label. Read from the
//      free-text columns only, and only `where not seed`. A state column is
//      deliberately NOT data here: `integration_credential.state` reaching a
//      screen is the defect this check exists to catch, so its values are not
//      in the vocabulary and a chip printing one fails. Nor is a seeded row:
//      the demonstration seed is the product writing, and reading its words
//      back out of a column excused copy Vernier composed in src/db/demo.ts.
//   3. Shapes that are values rather than words: a number, a time, a UUID, a
//      prefixed id, a URL, a host, a zone name, and the month and weekday names
//      the app's own formatters produce in the app's own zone.
//   4. Text the browser itself wrote, established by IDENTITY and not by
//      agreement. The branch that caught the rejection hands the DOM node the
//      caught object itself, this check asks the page whether that object is one
//      the browser rejected a fetch with in this document, and it excuses the
//      fragment only if the fragment IS that object's message and the rejection
//      happened after the state was opened. A composed literal is not that
//      object. An Error the product built with the same message is not that
//      object. A genuine rejection from another screen is that object with the
//      wrong timestamp. And the same run still reads the shipped tree and fails
//      any literal equal to a message WebKit hands a rejected fetch, because a
//      product that writes the browser's words down is lying whether or not a
//      checker can be made to notice.
//
// Anything else is a defect, reported with the text, the surface and the state.
//
// WHAT IT READS THAT IT DID NOT. A text field's value, which is words drawn at
// the size of any other words and was invisible to both checkers. Inside a
// `<foreignObject>`, which is ordinary HTML that an svg draws where it sits and
// which the svg rule skipped wholesale. Inside the svg: `title`, `desc` and `text`,
// which are the words a chart says out loud and the words it draws on an axis.
// It used to exclude every svg wholesale. Also `aria-roledescription`,
// `aria-valuetext`, `aria-keyshortcuts`, the braille pair, and the `value` of a
// submit control, which is a label carried as an attribute. And what the
// stylesheet paints: `content` on every ::before and ::after, read with
// getComputedStyle, which is the only reader there is. A text walk cannot see a
// pseudo-element and `.chip::after{content:" Not synced yet"}` proved it, on
// every chip, with both checks green.
//
// AND IT EXEMPTS NO ELEMENT. `<code>`, `<kbd>`, `<samp>` and `<pre>` used to
// carry an extra shape that tiled any kebab, snake or dotted run, so
// `<code>sign-in</code>` from a helper passed. Where a fragment landed is not
// who wrote it. That exemption is gone from both checkers.
//
// WHAT IT CANNOT SEE, stated plainly rather than discovered later:
//
//   - A state it cannot reach. It walks what a signed-in owner and an
//     unauthenticated visitor can reach on this machine with the demonstration
//     seed loaded. A screen that needs a registered passkey, a connected
//     integration or an open import question is not walked, because none of the
//     three exists here. Every surface it does walk is named in walk() below
//     and printed on every run, so the gap is a list and not a guess, and the
//     three branches it cannot reach are counted out of the database and
//     printed beside that list under "not walked". A helper returning copy
//     inside the connected branch passes both checks today; it closes in the
//     slice that connects an integration, and until then it is stated.
//   - Two catalogued strings written next to each other. Fragments are tiled
//     from catalogue anchors, so a sentence assembled entirely out of words that
//     are already copy somewhere else would tile. Every fragment it accepts is
//     made of shipped copy; it does not prove the arrangement was intended. A4
//     puts that arrangement under the screen line that owns the screen.
//   - Text inside an element the shipped CSS hides with `display: none`. It is
//     read here and judged like anything else, which errs the safe way.
//   - /healthz, which answers a machine and is graded by C1 for saying as
//     little as possible.
import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webkit } from '@playwright/test';
import {
  CSS_STRING_SOURCE,
  GLUE,
  LABEL_ATTRIBUTE_ELEMENTS,
  NEVER_RENDERED,
  SPOKEN_ATTRIBUTES,
  SVG_EXCLUDED_SUBTREES,
  SVG_FOREIGN_HTML,
  SVG_TEXT_ELEMENTS,
  TOKENS,
  VALUE_AS_CONTENT,
  VALUE_AS_LABEL,
} from './lib/vocabulary.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');
const { strings } = await import(join(projectRoot, 'src', 'lib', 'strings.ts'));
// The one property name the product and this check agree on, imported from the
// product so it cannot drift.
const { PLATFORM_CAUSE } = await import(join(projectRoot, 'src', 'lib', 'platform-cause.ts'));

const BASE = (process.env.APP_URL ?? 'https://lamberts-mac-mini.tailda76d6.ts.net').replace(/\/+$/, '');
const VERBOSE = process.argv.includes('--verbose');

/** A named argument, or nothing. */
function argument(name) {
  const at = process.argv.indexOf(name);
  return at === -1 ? null : process.argv[at + 1];
}

/**
 * Which installation this walk is reading.
 *
 * The default is the owner's, which is what the gate runs. The scratch instance
 * is the other one, and naming it is how the population floor below can be
 * proved rather than asserted: bring up an empty scratch database, point this
 * at it, and watch the floor refuse to walk.
 */
const DATABASE = argument('--database');
const CONTAINER = argument('--container');
const DATABASE_ARG = DATABASE ? JSON.stringify(DATABASE) : '"$POSTGRES_DB"';

// --------------------------------------------------------------------------
// The host, which is where the database and the configuration are.

function db(statement) {
  const oneLine = statement.replace(/\s+/g, ' ').trim();
  return execFileSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'db',
      'sh',
      '-c',
      `psql -U "$POSTGRES_USER" -d ${DATABASE_ARG} -At -c ${JSON.stringify(oneLine)}`,
    ],
    { cwd: projectRoot, encoding: 'utf8' },
  )
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

function appEnv(names) {
  const command = CONTAINER
    ? ['exec', CONTAINER, 'printenv', ...names]
    : ['compose', 'exec', '-T', 'app', 'printenv', ...names];
  const out = execFileSync('docker', command, {
    cwd: projectRoot,
    encoding: 'utf8',
  })
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  return Object.fromEntries(names.map((name, index) => [name, out[index] ?? '']));
}

/** One use, ten minutes, minted on this machine. The same door the owner uses. */
function mintSignInLink() {
  return execFileSync('bash', ['scripts/recovery.sh', 'link', '10'], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: CONTAINER ? { ...process.env, RECOVERY_CONTAINER: CONTAINER } : process.env,
  })
    .trim()
    .split('\n')
    .at(-1)
    .trim();
}

// --------------------------------------------------------------------------
// The catalogue, flattened into anchors.

const SENTINEL = '\u0001';

/** A key that takes data, called every way its branches can go. */
function renderProbes(fn) {
  const anything = new Proxy(
    {},
    {
      get: (_target, name) => (name === Symbol.toPrimitive ? () => SENTINEL : SENTINEL),
    },
  );
  const probes = [SENTINEL, 0, 1, 2, 5, anything];
  const rendered = [];
  for (const probe of probes) {
    try {
      const value = fn(...Array.from({ length: Math.max(fn.length, 1) }, () => probe));
      if (typeof value === 'string' && value !== '') rendered.push(value);
    } catch {
      // A key that cannot take this probe is covered by one of the others.
    }
  }
  return rendered;
}

const anchors = [];
const seenAnchors = new Set();

function addAnchor(text, from) {
  const trimmed = text.trim();
  if (trimmed === '') return;
  if (!/[A-Za-z0-9]/.test(trimmed)) return;
  const at = `${trimmed} <- ${from}`;
  if (seenAnchors.has(at)) return;
  seenAnchors.add(at);
  anchors.push({ text: trimmed, from });
  // A segment of an interpolated key often opens on the punctuation that
  // followed the value: ". Nothing outside that is a measurement." Tiling eats
  // that full stop as glue before it looks for an anchor, so the sentence goes
  // in under its first word as well as under its punctuation.
  const opensOnAWord = trimmed.replace(/^[^A-Za-z0-9]+/, '');
  if (opensOnAWord !== trimmed) addAnchor(opensOnAWord, from);
}

let catalogueKeys = 0;

function readCatalogue(node, prefix = '') {
  for (const [name, value] of Object.entries(node)) {
    const key = prefix ? `${prefix}.${name}` : name;
    if (typeof value === 'string') {
      catalogueKeys += 1;
      addAnchor(value, `catalogue ${key}`);
    } else if (typeof value === 'function') {
      catalogueKeys += 1;
      for (const rendered of renderProbes(value)) {
        // The whole rendering, and each literal segment either side of an
        // interpolation. The segments are what let a real value through the
        // middle of a sentence without letting a sentence through.
        addAnchor(rendered.split(SENTINEL).join(' '), `catalogue ${key}`);
        for (const segment of rendered.split(SENTINEL)) addAnchor(segment, `catalogue ${key}`);
      }
    } else if (value && typeof value === 'object') {
      readCatalogue(value, key);
    }
  }
}

readCatalogue(strings);

// --------------------------------------------------------------------------
// The two vocabularies that are data rather than copy.

const config = appEnv(['APP_URL', 'APP_NAME', 'WEBAUTHN_RP_ID', 'WEBAUTHN_RP_NAME', 'TZ']);
for (const [name, value] of Object.entries(config)) addAnchor(value, `configuration ${name}`);
addAnchor(new URL(config.APP_URL).host, 'configuration APP_URL host');

// The app's own formatters, in the app's own zone, so "21 Aug" and
// "Friday 21 August" read as the dates they are.
for (let month = 0; month < 12; month += 1) {
  const day = new Date(Date.UTC(2026, month, 15, 12));
  for (const style of ['short', 'long']) {
    addAnchor(
      new Intl.DateTimeFormat('en-GB', { month: style, timeZone: config.TZ }).format(day),
      'formatter month',
    );
  }
}
for (let day = 0; day < 7; day += 1) {
  const date = new Date(Date.UTC(2026, 7, 16 + day, 12));
  addAnchor(
    new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: config.TZ }).format(date),
    'formatter weekday',
  );
}

/**
 * Free text this database holds, and only free text, and only where the owner
 * or a device wrote it.
 *
 * A note the owner typed, the reason he gave for a correction, the reference a
 * batch carried, the rows a source record lists, the scope an integration was
 * granted, the name he gave a passkey. Not `state`, not `source`, not `kind`,
 * not `confidence`, not `method`, not `device_type`: those are columns whose
 * values are tokens, and a token reaching a screen is the defect this checks
 * for. Leaving them out of the vocabulary is what makes the check able to catch
 * one.
 *
 * AND NOT A SEEDED ROW. `where not seed` is the difference between reading a
 * column and reading owner data. The demonstration seed is the product writing:
 * `reference: 'page 2, row 7'` and `reference: 'quick-log'` were composed in
 * src/db/demo.ts, painted on /source/demo_src_ldl and /source/demo_src_waist,
 * and excused here because they came back out of a free-text column. C6 says
 * wherever in the shipped tree it was written, and src/db/demo.ts is in the
 * shipped tree. The seed's own words are catalogue keys now, and this vocabulary
 * is built only from rows no writer in this repository authored, which is what
 * `seed` is for: a generated column on the measurement, a set column on the
 * source record, and a composite foreign key that refuses to mix them.
 */
const DATA_QUERIES = [
  ['measurement.raw_value', 'select distinct raw_value from measurement where not seed'],
  [
    'measurement.correction_reason',
    "select distinct correction_reason from measurement where not seed and correction_reason is not null and correction_reason <> ''",
  ],
  ['source_record.reference', 'select distinct reference from source_record where not seed'],
  [
    'source_record.detail',
    "select distinct value->>'value' from source_record, jsonb_array_elements(detail) as value where not seed",
  ],
  ['integration_credential.scope', 'select distinct scope from integration_credential'],
  ['webauthn_credential.label', 'select distinct label from webauthn_credential'],
  /*
   * The two fields the iPhone shortcut authors, and they are here for the same
   * reason a typed note is: the owner wrote them, into a Text action on his own
   * phone, and this app has no say in either.
   *
   * `device` is what he calls the phone. `metric` is the slug he chose from the
   * guide's list, and the diagnostics screen prints it per metric so a slug
   * spelled differently from the guide shows as rows with no reading rather
   * than as silence.
   *
   * `ingest_batch.outcome` is deliberately NOT here. It is a token from a fixed
   * set, the screen renders it through the catalogue's own lookup, and a raw
   * token reaching a chip is exactly the defect this check exists to catch.
   * That is the same line `integration_credential.state` sits on.
   */
  ['ingest_batch.device', "select distinct device from ingest_batch where device <> ''"],
  ['health_sample.metric', 'select distinct metric from health_sample'],
  /*
   * The name of an analyte the OWNER added while reviewing a panel, and only
   * his. `built_in` is the provenance, set true by the seed in
   * drizzle/pending/07-blood.sql and by nothing else, exactly the way `seed`
   * works on `measurement`: the thirteen this repository ships carry catalogue
   * keys in `strings.metrics` and are read from there, so a built-in label
   * reaching a screen without its key still fails here.
   */
  ['lab_analyte.label', 'select distinct label from lab_analyte where not built_in'],
  /*
   * The name of the owner's own file, and the laboratory as his own sheet names
   * itself. Both are words off a document he holds, drawn on the labs archive
   * beside the panel they belong to, and neither is copy this product authored.
   */
  ['lab_document.file_name', "select distinct file_name from lab_document where file_name <> ''"],
  ['lab_document.laboratory', "select distinct laboratory from lab_document where laboratory <> ''"],
  /*
   * Every readable fragment the review holding carries: the label the sheet
   * printed, the value it printed, the unit it printed and the excerpt quoted
   * back under "As printed". All four are words off the owner's own document,
   * and all four are drawn on the review screen.
   *
   * The review is in `unreachableBranches` below, because this walk will not
   * upload a laboratory document onto the owner's storage volume to grade copy,
   * so nothing here is reachable today. It is written now anyway: the day a
   * slice makes that screen walkable, the vocabulary is already right, and the
   * alternative is a blanket exemption for the surface, which is the shape of
   * every hole this check exists to close.
   */
  [
    'lab_document.extraction',
    `select distinct value from lab_document,
       jsonb_array_elements(extraction) as row_json,
       lateral (
         select row_json->>'printedLabel' as value
         union all select row_json->>'printedValue'
         union all select row_json->>'printedUnit'
         union all select jsonb_array_elements_text(coalesce(row_json->'excerpt', '[]'::jsonb))
       ) as fragment
     where value is not null and value <> ''`,
  ],
];

let dataValues = 0;
for (const [column, statement] of DATA_QUERIES) {
  for (const value of db(statement)) {
    dataValues += 1;
    addAnchor(value, `data ${column}`);
  }
}

// --------------------------------------------------------------------------
// Shapes that are values rather than words.
//
// TOKENS and GLUE live in scripts/lib/vocabulary.mjs now, with the spoken
// attributes and the svg element lists, because both checkers need the same
// answer to "what can a person read" and keeping two copies equal by hand is
// what put aria-roledescription in neither.
//
// One shape is gone rather than moved. `machine identifier` matched
// /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)+/, which is "sign-in", "check-in",
// "opt-out", "follow-up" and "day-to-day": ordinary English that happens to
// carry a hyphen, tiled as a value and never read as copy. C6 now says "however
// few words it is, including one hyphenated word", so a hyphenated word is copy
// and needs a key. What that shape legitimately covered is covered by name: a
// value this check sent is an echo anchor, and a value out of a column is a
// data anchor.
//
// It survived one more verification inside `<code>`, `<kbd>`, `<samp>` and
// `<pre>`, where the same pattern applied under the name MACHINE_TOKENS. That
// was position and not provenance: `<code>{helperNote()}</code>` returning
// 'sign-in' rendered at 45 px and both checks exited 0, which is the shape A4
// refused. `element.closest('code')` says where a fragment landed, never who
// wrote it. There is no element exemption now, in either checker. Notation a
// screen prints on purpose takes a key like anything else.

const byFirstCharacter = new Map();

function indexAnchors() {
  byFirstCharacter.clear();
  for (const anchor of anchors) {
    const first = anchor.text[0];
    if (!byFirstCharacter.has(first)) byFirstCharacter.set(first, []);
    byFirstCharacter.get(first).push(anchor);
  }
  for (const bucket of byFirstCharacter.values()) bucket.sort((a, b) => b.text.length - a.text.length);
}

indexAnchors();

/** One reading of whitespace, so a fragment compares the same everywhere. */
const normalise = (text) => text.replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ').trim();

const isWordCharacter = (character) => character !== undefined && /[A-Za-z0-9]/.test(character);

/** Longest anchor starting here, matched on whole words rather than inside one. */
function anchorAt(text, index) {
  const bucket = byFirstCharacter.get(text[index]);
  if (!bucket) return null;
  for (const anchor of bucket) {
    if (!text.startsWith(anchor.text, index)) continue;
    if (isWordCharacter(anchor.text[0]) && isWordCharacter(text[index - 1])) continue;
    const after = index + anchor.text.length;
    if (isWordCharacter(anchor.text.at(-1)) && isWordCharacter(text[after])) continue;
    return anchor;
  }
  return null;
}

function tokenAt(text, index) {
  const rest = text.slice(index);
  for (const [name, pattern] of TOKENS) {
    const match = pattern.exec(rest);
    if (!match || match[0] === '') continue;
    const after = index + match[0].length;
    if (isWordCharacter(match[0].at(-1)) && isWordCharacter(text[after])) continue;
    return { name, length: match[0].length };
  }
  return null;
}

/**
 * Cover the fragment with catalogue anchors, data values and value shapes. The
 * first character none of them can account for is where it fails, and the rest
 * of the line is what is reported, because that is the string somebody read.
 */
function tile(text) {
  const used = [];
  let index = 0;
  while (index < text.length) {
    const glue = GLUE.exec(text.slice(index));
    if (glue) {
      index += glue[0].length;
      continue;
    }
    const anchor = anchorAt(text, index);
    const token = tokenAt(text, index);
    const anchorLength = anchor ? anchor.text.length : 0;
    const tokenLength = token ? token.length : 0;
    if (anchorLength === 0 && tokenLength === 0) {
      return { ok: false, at: index, rest: text.slice(index), used };
    }
    if (anchorLength >= tokenLength) {
      used.push(anchor.from);
      index += anchorLength;
    } else {
      used.push(`shape ${token.name}`);
      index += tokenLength;
    }
  }
  return { ok: true, used };
}

// --------------------------------------------------------------------------
// The one exemption, and it is keyed to provenance.
//
// C6 puts text the product did not author outside the line, and requires the
// check that excuses such text to establish that by provenance and to fail
// every fragment whose provenance it cannot establish.
//
// FIVE ROUNDS OF THIS COMPARED TEXT, AND TEXT IS WHAT A PRODUCT CAN MAKE.
// First there was a slot: any fragment landing inside `quickLog.errorBody` was
// reported as a platform cause, so `HTTP 502 at 14:32.` composed inline walked
// straight through. That was position, not provenance. Then it was a marker
// plus a harvested word list, and `<span data-authored="platform">Load
// failed</span>` was excused in a 502 state where WebKit had said nothing.
// Then the marker named its request and the checker asked the browser whether
// that request was really rejected in that state, and that fell too, twice in
// one round: `['L','oad',' fai','led'].join('')` on the marked branch printed
// words Chrome does not say, and a background outbox retry refused during the
// undo window excused a span on a different card, because "this state" was a
// bucket of paths rather than a fact about the string.
//
// SO IT DOES NOT COMPARE TEXT AT ALL. The branch that catches the rejection
// hands the DOM node the caught OBJECT, under a property, which is what
// src/lib/platform-cause.ts exists for. Before any app code runs, this check
// wraps `window.fetch` so that every rejection the browser produces is recorded
// against the object it rejected with, in a WeakMap the page cannot add to: the
// only writer is the wrapper, and the only thing exposed is a question. Then a
// fragment marked platform is excused when, and only when, all three hold:
//
//   1. The node carries an object this browser rejected a fetch with, matched
//      by identity in that WeakMap. Not a message, not a shape: that object.
//   2. The fragment IS that object's message. The product may not print one
//      thing and carry another.
//   3. The rejection happened after this state was opened. A real Error kept in
//      React state and re-rendered on a later screen is refused where it did
//      not happen, which is the bucketing hole closed on the object rather than
//      on a path.
//
// A composed literal fails 1 because a string is not an object the browser
// threw. An Error the product built with WebKit's wording fails 1 for the same
// reason. A stale rejection fails 3. And nothing in the product can put an
// entry in that map, because the wrapper is installed before the first script
// and the page is handed no way to write to it.
//
// A fragment marked platform FAILS when any of the three is missing, and the
// failure names which one. So does an unaccounted fragment that carries no
// marker, wherever it sits. There is no fourth path.

/** message -> how it was provoked. Filled by harvestPlatformWords, once, first. */
const platformVocabulary = new Map();

/**
 * Every way WebKit can refuse to reach the machine, and what it says about each.
 *
 * These are Playwright's abort reasons, which map onto the network errors the
 * browser raises on its own. Running all of them means the recorded vocabulary
 * is the platform's, complete for this engine and this version, and gathered in
 * the same run that reads it rather than pasted into a list here. It no longer
 * decides anything: what it is for is the shipped-tree scan below, which fails
 * the product for writing any of these words down.
 */
const TRANSPORT_FAILURES = [
  'aborted',
  'accessdenied',
  'addressunreachable',
  'blockedbyclient',
  'blockedbyresponse',
  'connectionaborted',
  'connectionclosed',
  'connectionfailed',
  'connectionrefused',
  'connectionreset',
  'failed',
  'internetdisconnected',
  'namenotresolved',
  'timedout',
];

async function harvestPlatformWords(page) {
  for (const reason of TRANSPORT_FAILURES) {
    await page.route('**/api/log', (route) => route.abort(reason));
    const message = await page.evaluate(async () => {
      try {
        await fetch('/api/log', { headers: { accept: 'application/json' } });
        return null;
      } catch (error) {
        return String(error && error.message ? error.message : error);
      }
    });
    await page.unroute('**/api/log');
    const normalised = normalise(message ?? '');
    if (normalised !== '' && !platformVocabulary.has(normalised)) {
      platformVocabulary.set(normalised, `WebKit, on a fetch aborted with ${reason}`);
    }
  }
}

/**
 * The register of what the browser rejected, installed before the app's first
 * script and readable only as a question.
 *
 * The name carries a nonce so that nothing in the page can find it by guessing,
 * and the object it exposes has no way to add an entry: `ask` answers about an
 * object, and the only writer is the wrapper around the browser's own fetch. A
 * plant in the product cannot register a rejection it did not receive.
 */
const REGISTER = `__vernier_rejections_${Math.random().toString(36).slice(2)}`;

const REGISTER_SCRIPT = `(() => {
  const native = window.fetch;
  const seen = new WeakMap();
  window.fetch = function (...args) {
    return native.apply(this, args).catch((error) => {
      if (error && typeof error === 'object') {
        const input = args[0];
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        let path = url;
        try { path = new URL(url, location.href).pathname; } catch (ignored) { path = String(url); }
        seen.set(error, { path, at: Date.now() });
      }
      throw error;
    });
  };
  Object.defineProperty(window, ${JSON.stringify(REGISTER)}, {
    value: Object.freeze({
      ask: (caught) => {
        if (!caught || typeof caught !== 'object' || !seen.has(caught)) return null;
        const record = seen.get(caught);
        return {
          path: record.path,
          at: record.at,
          message: caught instanceof Error ? caught.message : String(caught),
        };
      },
    }),
    enumerable: false,
    configurable: false,
    writable: false,
  });
})()`;

/**
 * When the state now being read was opened.
 *
 * Wall clock on this machine, read here and compared with the wall clock the
 * page stamped the rejection with. A rejection older than this belongs to a
 * screen that has already been read, and excusing a fragment with it is exactly
 * what let a background outbox retry stand in for a card it never touched.
 */
let stateOpenedAt = Date.now();

/**
 * Can this fragment's provenance be established as platform-authored. Returns
 * how, or the half that could not be established, which is what the report
 * prints.
 */
function platformProvenance(fragment, context) {
  if (context.authored !== 'platform') return { ok: false, why: null };
  const carried = context.carried;
  if (!carried) {
    return {
      ok: false,
      why:
        'marked platform, but the node carries no object this browser rejected a fetch with: either nothing was caught here, or what it is printing was made in the product',
    };
  }
  if (normalise(carried.message) !== fragment) {
    return {
      ok: false,
      why: `marked platform and carrying a real rejection of ${carried.path}, but the fragment is not that object's message, which reads ${JSON.stringify(carried.message)}`,
    };
  }
  if (carried.at < stateOpenedAt) {
    return {
      ok: false,
      why: `marked platform, and the object it carries is a real rejection of ${carried.path} from before this state was opened, so the browser wrote nothing here`,
    };
  }
  return {
    ok: true,
    provenance: `the message of the object WebKit rejected ${carried.path} with, identified in the page and rejected ${carried.at - stateOpenedAt} ms after this state opened`,
  };
}

// --------------------------------------------------------------------------
// And the product may not write the browser's words down.
//
// Two halves of provenance are enough to stop a marker on its own and enough to
// stop a string the browser never said. They are not enough to stop both at
// once: mark a node platform AND echo a string WebKit really did produce, and
// the fragment is excused. The verifier did exactly that. `<span
// data-authored="platform">Load failed</span>` was excused in three states, one
// of them a 502 where WebKit said nothing at all, and the product invented the
// browser's words while dropping the real cause off the card.
//
// The residual is the harvested vocabulary itself, and it is small and known:
// on this machine and this WebKit it is one string. So it is closed from the
// other side. A literal equal to a harvested platform string, anywhere in the
// shipped tree, fails. The catalogue is not exempt either: a key holding the
// browser's words would be the same lie with a key on it. Vernier never writes
// a sentence that impersonates the platform, and the only way a harvested
// message may reach a screen is by coming out of the browser in that run.
const SHIPPED_TREES = [join(projectRoot, 'src'), join(projectRoot, 'public')];
const SHIPPED_TEXT = new Set(['.ts', '.tsx', '.css', '.js', '.mjs', '.json', '.webmanifest']);
const impersonations = [];
let shippedFilesRead = 0;

async function shippedFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await shippedFiles(path)));
    else if (SHIPPED_TEXT.has(extname(entry.name))) found.push(path);
  }
  return found;
}

async function readTheShippedTree() {
  for (const tree of SHIPPED_TREES) {
    for (const file of await shippedFiles(tree)) {
      const source = await readFile(file, 'utf8');
      shippedFilesRead += 1;
      for (const [message, provenance] of platformVocabulary) {
        let at = source.indexOf(message);
        while (at !== -1) {
          impersonations.push({
            file: relative(projectRoot, file),
            line: source.slice(0, at).split('\n').length,
            text: message,
            provenance,
          });
          at = source.indexOf(message, at + message.length);
        }
      }
    }
  }
}

// --------------------------------------------------------------------------
// Reading a rendered surface.

/**
 * Every string a person can read or hear on the page.
 *
 * Text nodes, the spoken attributes, the two attributes that are drawn as
 * labels, and the document title. Visually hidden text is included, because a
 * screen reader reads it and C8 puts it there on purpose.
 *
 * IT READS INSIDE THE SVG NOW. It used to skip every svg wholesale with
 * `element.closest('script, style, noscript, template, svg')`, which made
 * `<svg><text>`, `<title>` and `<desc>` invisible: three of the places C6 now
 * names by hand, and the three strings VoiceOver actually speaks over a chart.
 * C8 requires a title and a desc inside every chart, so as shipped this check
 * was blind to every word inside every chart of slices 4, 7, 9 and 12. Now the
 * elements that hold words are read and the geometry is not: `path` stays out
 * because it holds coordinates, and `defs`, `clipPath`, `mask`, `pattern` and
 * `marker` stay out because nothing in them renders where it sits.
 *
 * Everything it reads is passed in from scripts/lib/vocabulary.mjs. This
 * function is serialised into the page, so it can close over nothing: the lists
 * arrive as an argument, which is also what keeps them equal to the ones the
 * source-side checker uses.
 */
function readTheScreen(vocabulary) {
  const {
    spoken,
    valueAsLabel,
    valueAsContent,
    labelElements,
    svgText,
    svgExcluded,
    svgForeignHtml,
    neverRendered,
    cssString,
    register,
    causeProperty,
  } = vocabulary;
  const found = [];
  const describe = (element) => {
    if (!element) return 'body';
    const classes = element.getAttribute('class');
    return element.tagName.toLowerCase() + (classes ? '.' + classes.split(/\s+/).join('.') : '');
  };
  // Who wrote it, if the markup says. Nothing else about where it sits counts:
  // the element a fragment landed in is position, and position never excused
  // anything after the <code> exemption came out.
  //
  // And a platform claim is not read as a claim. The branch that caught the
  // rejection put the caught object on the node, and this asks the register
  // whether the browser is what rejected with it. What comes back is a fact
  // about an object, or null.
  const ask = window[register] ? window[register].ask : () => null;
  const contextOf = (element) => {
    const marked = element.closest('[data-authored]');
    if (!marked) return { authored: null, carried: null };
    return {
      authored: marked.getAttribute('data-authored'),
      carried: ask(marked[causeProperty]),
    };
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const element = node.parentElement;
    if (!element) continue;
    if (element.closest(neverRendered.join(', '))) continue;
    if (element.closest('svg')) {
      if (element.closest(svgExcluded.join(', '))) continue;
      // A foreignObject holds ordinary HTML and draws it where it sits, so
      // inside one the svg rule does not apply and the ordinary one does.
      if (!element.closest(svgForeignHtml) && !element.closest(svgText.join(', '))) continue;
    }
    if (!node.data || node.data.trim() === '') continue;
    found.push({ where: describe(element), text: node.data, ...contextOf(element) });
  }
  // What the stylesheet paints, which no text walk can reach.
  //
  // `content` on ::before and ::after puts words on a screen without putting a
  // node in the tree. innerText, textContent and a SHOW_TEXT TreeWalker all
  // miss it by construction, which is how `.chip::after{content:" Not synced
  // yet"}` painted "Not synced yet" on every chip on every screen with both
  // checks at exit 0. getComputedStyle is the only reader, so every element is
  // asked, for both pseudos. `none`, `normal` and the empty string carry no
  // words; counter() and attr() carry a value the page already holds. What is
  // judged is the string literals, and they are judged like any other fragment:
  // a stylesheet cannot mark provenance, so `authored` is null and nothing here
  // can be excused as the platform's words.
  const cssStrings = new RegExp(cssString, 'g');
  for (const element of document.querySelectorAll('*')) {
    if (element.closest(neverRendered.join(', '))) continue;
    for (const pseudo of ['::before', '::after']) {
      const painted = window.getComputedStyle(element, pseudo).content;
      if (!painted || painted === 'none' || painted === 'normal') continue;
      for (const match of painted.matchAll(cssStrings)) {
        const text = (match[1] === undefined ? match[2] : match[1]).replace(/\\(?=.)/g, '');
        if (text.trim() === '') continue;
        found.push({ where: describe(element) + pseudo, text, authored: null, carried: null });
      }
    }
  }
  for (const element of document.querySelectorAll('[' + spoken.join('], [') + ']')) {
    for (const name of spoken) {
      const value = element.getAttribute(name);
      if (value && value.trim() !== '') {
        found.push({ where: describe(element) + '@' + name, text: value, ...contextOf(element) });
      }
    }
  }
  // A <button> carries its label as children. These carry it as an attribute,
  // and the text walk above never sees it.
  for (const element of document.querySelectorAll(valueAsLabel.join(', '))) {
    const value = element.getAttribute('value');
    if (value && value.trim() !== '') {
      found.push({ where: describe(element) + '@value', text: value, ...contextOf(element) });
    }
  }
  // And what a field is holding, which is text drawn on the screen at the size
  // of any other text. The walk above cannot reach it: an input has no child
  // text node, and the live value is a property rather than the attribute.
  for (const element of document.querySelectorAll(valueAsContent.join(', '))) {
    const value = element.value;
    if (typeof value === 'string' && value.trim() !== '') {
      found.push({ where: describe(element) + '@value', text: value, ...contextOf(element) });
    }
  }
  for (const element of document.querySelectorAll(labelElements.join(', '))) {
    const value = element.getAttribute('label');
    if (value && value.trim() !== '') {
      found.push({ where: describe(element) + '@label', text: value, ...contextOf(element) });
    }
  }
  if (document.title) {
    found.push({ where: 'title', text: document.title, authored: null, carried: null });
  }
  const description = document.querySelector('meta[name="description"]');
  if (description) {
    found.push({
      where: 'meta description',
      text: description.getAttribute('content') || '',
      authored: null,
      carried: null,
    });
  }
  return found;
}

const defects = [];
const platformText = [];
let fragmentsRead = 0;
const surfacesWalked = [];

function judge(surface, state, where, text, context = {}) {
  const fragment = normalise(text);
  if (fragment === '') return;
  fragmentsRead += 1;
  const result = tile(fragment);
  if (result.ok) {
    if (VERBOSE) process.stdout.write(`  ok   ${surface} / ${state}  ${JSON.stringify(fragment)}\n`);
    return;
  }
  const excusal = platformProvenance(fragment, context);
  if (excusal.ok) {
    platformText.push({ surface, state, where, text: fragment, provenance: excusal.provenance });
    return;
  }
  defects.push({
    surface,
    state,
    where,
    text: fragment,
    unaccounted: result.rest,
    // A fragment the markup calls platform text, carrying nothing the browser
    // rejected with, is the shape every text comparison let through. It fails,
    // and it fails naming which of the three facts is missing.
    why: excusal.why ?? 'no catalogue key accounts for it',
  });
}

async function readSurface(page, surface, state) {
  const found = await page.evaluate(readTheScreen, {
    spoken: SPOKEN_ATTRIBUTES,
    valueAsLabel: VALUE_AS_LABEL,
    valueAsContent: VALUE_AS_CONTENT,
    labelElements: LABEL_ATTRIBUTE_ELEMENTS,
    svgText: SVG_TEXT_ELEMENTS,
    svgExcluded: SVG_EXCLUDED_SUBTREES,
    svgForeignHtml: SVG_FOREIGN_HTML,
    neverRendered: NEVER_RENDERED,
    cssString: CSS_STRING_SOURCE,
    register: REGISTER,
    causeProperty: PLATFORM_CAUSE,
  });
  surfacesWalked.push(`${surface} / ${state}`);
  for (const found_ of found) {
    judge(surface, state, found_.where, found_.text, {
      authored: found_.authored,
      carried: found_.carried ?? null,
    });
  }
  // The next state opens now. A rejection the browser produced before this line
  // belongs to a screen that has already been read, and no fragment on the next
  // one may be excused with it.
  stateOpenedAt = Date.now();
}

/** The strings an API answer puts on a screen. Machine fields are not read. */
const HUMAN_FIELDS = new Set(['error', 'detail', 'dedupReason', 'reason']);

function judgeJson(surface, state, value, path = '') {
  if (typeof value === 'string') {
    const field = path.split('.').at(-1);
    if (HUMAN_FIELDS.has(field)) judge(surface, state, path, value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => judgeJson(surface, state, entry, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [name, entry] of Object.entries(value)) {
      judgeJson(surface, state, entry, path ? `${path}.${name}` : name);
    }
  }
}

// --------------------------------------------------------------------------
// One line, explained. `--explain "some text"` tiles that text and says which
// key accounted for each piece, which is how a report line gets read back.

const explainAt = process.argv.indexOf('--explain');
if (explainAt !== -1) {
  const text = process.argv[explainAt + 1] ?? '';
  const result = tile(text.replace(/\s+/g, ' ').trim());
  process.stdout.write(`${JSON.stringify(text)}\n`);
  for (const from of result.used) process.stdout.write(`  accounted by ${from}\n`);
  if (!result.ok) process.stdout.write(`  UNACCOUNTED ${JSON.stringify(result.rest)}\n`);
  process.exit(result.ok ? 0 : 1);
}

// --------------------------------------------------------------------------
// The walk.

/**
 * The six sources the database CHECK permits. F22 sends every one of them to
 * the same destination shape, and C6's evidence clause requires this walk to
 * cover at least one stored value per source.
 */
const PERMITTED_SOURCES = [
  'apple_health_shortcut',
  'demo',
  'derived',
  'lab_pdf',
  'manual',
  'withings',
];

const rowIds = db('select id from measurement order by measured_at desc');
const ratingIds = db("select id from measurement where unit = 'point'");
const sourceIds = db('select id from source_record order by recorded_at desc');
const sourcesBehindAValue = db(
  `select distinct record.source from measurement value
   join source_record record on record.id = value.source_record_id`,
);
/**
 * The branches this walk cannot reach on this machine, counted rather than
 * described.
 *
 * The surfaces below are read out of the database, so the walk covers the
 * states this installation is actually in. Three states it is not in: no
 * integration is connected, no passkey is registered, no import question is
 * open. Copy that renders only inside one of those branches is invisible to
 * this check and to the source scanner both, and the verifier proved it: a
 * helper returning "page 4, row 11" inside OperatorPanel's `connected` branch
 * left both checks at exit 0, and it renders the moment a credential is saved
 * through the shipped form.
 *
 * That is not closed here. It closes in the slice that ships the integration,
 * where the branch exists to be walked. What slice 3 owes is the honest
 * statement, so the count is printed on every run, named as a class, beside the
 * list of what was walked. A zero here is the reason a green means less than it
 * looks, and it says so out loud.
 */
const unreachableBranches = [
  ['a screen behind a connected integration', "select count(*) from integration_credential where state = 'connected'"],
  ['a screen behind a registered passkey', 'select count(*) from webauthn_credential'],
  ['a screen behind an open import question', "select count(*) from import_question where state = 'open'"],
  /*
   * Slice 6 adds two, and both are named rather than discovered.
   *
   * The ingest diagnostics screen has two shapes: with no credential it draws
   * its empty state, which is what a fresh machine renders and what this walk
   * reads; with one it draws the canonical string, the digest and the arrivals
   * log. The second is walked by tests/e2e/ingest.spec.ts against the scratch
   * instance, where a credential is created through the shipped screen.
   *
   * The Shortcut guide is walked in full either way: it is prose and a metric
   * table, and the only live thing on it is one line naming this installation's
   * own endpoint.
   */
  ['the diagnostics screen with a live credential', 'select count(*) from ingest_credential where live'],
  ['the diagnostics screen with an arrival on it', 'select count(*) from ingest_batch'],
  // Slice 7. The review, the row editor and the keep-or-delete question all
  // need a laboratory document in review. This walk will not upload one: that
  // would write a file onto the owner's storage volume and a holding into his
  // database to grade copy. tests/e2e/labs-scratch.spec.ts walks all three on
  // the scratch instance, and the count below is what says whether this run
  // could have seen them.
  ['a laboratory review with a document in it', "select count(*) from lab_document where state = 'review'"],
];

const kindsBehindAValue = db(
  `select distinct record.kind from measurement value
   join source_record record on record.id = value.source_record_id`,
);

// --------------------------------------------------------------------------
// The population floor.
//
// This walk reads its list of surfaces out of the database: one `/value/[id]`
// per stored row, one `/source/[id]` per source record. On an empty database
// both loops walk nothing, the run prints a shorter list, and it exits 0 saying
// "every fragment on every surface resolves to a key." A green over almost
// nothing reads exactly like a green over everything, and that is not an edge
// case: compose.yaml falls back to demonstration mode 0 when the environment
// file carries no DEMO_MODE line, and for the whole of slice 3 the owner's file
// carried none, so a stack brought up from a clean shell had no rows in it at
// all. scripts/up.sh reconciles that setting now, and the floor stands anyway:
// a bring-up is a thing that can be got wrong and a floor is a thing that says
// so.
//
// So the floor is asserted before the browser is launched, and it is named in
// C6's own evidence clause rather than left as advice. A zero is evidence only
// beside the population it covered.
const missingSources = PERMITTED_SOURCES.filter((source) => !sourcesBehindAValue.includes(source));
const floor = [
  ['stored values walked', rowIds.length, 1],
  ['source records walked', sourceIds.length, 1],
  ['ratings on the one to five scale', ratingIds.length, 1],
  ['sources with a stored value behind them', sourcesBehindAValue.length, PERMITTED_SOURCES.length],
];

process.stdout.write('rendered strings: the population this walk covers\n');
for (const [what, counted, needed] of floor) {
  process.stdout.write(`  ${counted} ${what}, floor ${needed}\n`);
}
process.stdout.write(`  source kinds behind a value: ${kindsBehindAValue.sort().join(', ') || 'none'}\n`);

const short = floor.filter(([, counted, needed]) => counted < needed);
if (short.length > 0) {
  process.stderr.write(
    '\nrendered strings: the walk would cover too little to mean anything, so it did not run.\n',
  );
  for (const [what, counted, needed] of short) {
    process.stderr.write(`  ${what}: ${counted}, and this needs ${needed}\n`);
  }
  if (missingSources.length > 0) {
    process.stderr.write(`  no stored value stands in for: ${missingSources.join(', ')}\n`);
  }
  process.stderr.write(
    '  Bring the stack up with demonstration data: bash scripts/up.sh sets DEMO_MODE from the environment file.\n',
  );
  process.exit(1);
}

const browser = await webkit.launch();
const context = await browser.newContext({
  baseURL: BASE,
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 3,
  serviceWorkers: 'block',
});
// Before the app's first script, on every document: the wrapper that records
// what the browser rejected, against the object it rejected with.
await context.addInitScript(REGISTER_SCRIPT);
const page = await context.newPage();


async function walk() {
  // The visitor at the gate, before any session exists on this context.
  await page.goto('/sign-in');

  // Ask the browser what it says when it cannot reach the machine, before
  // reading a single surface: fourteen transport failures, fourteen messages,
  // all of them out of WebKit in this run. Nothing is excused by this list any
  // more. What it is for is the scan below.
  await harvestPlatformWords(page);

  // With the browser's words in hand, read the shipped tree for anyone writing
  // them down. A product that keeps a copy of the browser's wording is lying
  // about who is speaking whether or not a checker can be made to notice, so
  // this runs before a single surface is read.
  await readTheShippedTree();

  // Every state from here is judged against the clock, and the first one opens
  // after the harvest rather than before it.
  stateOpenedAt = Date.now();

  await readSurface(page, '/sign-in', 'passkey first');
  await page.getByRole('button', { name: strings.signIn.passwordAction, exact: true }).click();
  await readSurface(page, '/sign-in', 'backup password');

  await page.goto('/offline');
  await readSurface(page, '/offline', 'served from the shell');

  await page.goto('/settings');
  await page.waitForURL(/\/sign-in/);
  await readSurface(page, '/sign-in', 'bounced from a protected route');

  // The owner, through the door the operator runbook documents.
  await page.goto(mintSignInLink());
  await page.goto('/');
  await readSurface(page, '/', 'today, values on file');

  for (const path of ['/health', '/train', '/eat']) {
    await page.goto(path);
    await readSurface(page, path, 'empty');
  }

  // The laboratory surfaces, slice 7. The archive and the manual form are
  // reachable with nothing stored; the review, the row editor and the
  // keep-or-delete question need a document in review, which this installation
  // does not have and which this walk will not create, because an upload here
  // would write a file onto the owner's storage volume and a review holding into
  // his database. Those three are counted out of the database and printed under
  // "not walked" beside the rest, so the gap is a list and not a guess.
  for (const path of ['/health/labs', '/health/labs/new']) {
    await page.goto(path);
    await readSurface(page, path, 'no panel stored');
  }

  await page.goto('/settings');
  await readSurface(page, '/settings', 'four integrations, no passkey');

  // The two screens slice 6 added under Settings.
  //
  // The guide is the longest single surface in this product, about a hundred
  // and thirty strings of procedure, and it names Apple's own actions. If one
  // of those names were written inline in the component rather than keyed, no
  // source scanner would ever call `Get Details of Health Sample` a sentence:
  // it opens on a capital and it is four words of a proper noun. This walk is
  // what catches it, and a surface not walked is a surface not checked.
  //
  // Diagnostics is walked in whatever state this installation is in. With no
  // ingest credential it draws its empty state, which is the state a fresh
  // machine is in and the one nothing else here reads.
  await page.goto('/settings/shortcut');
  await readSurface(page, '/settings/shortcut', 'the shortcut guide');

  await page.goto('/settings/ingest');
  await readSurface(page, '/settings/ingest', 'ingest diagnostics');

  await page.goto('/no-such-address');
  await readSurface(page, '/no-such-address', 'not found');

  for (const id of rowIds) {
    await page.goto(`/value/${id}`);
    await readSurface(page, '/value/[id]', `stored value ${id}`);
  }
  await page.goto('/value/demo_nothing_here');
  await readSurface(page, '/value/[id]', 'no such value');

  for (const id of sourceIds) {
    await page.goto(`/source/${id}`);
    await readSurface(page, '/source/[id]', `source record ${id}`);
  }
  await page.goto('/source/demo_nothing_here');
  await readSurface(page, '/source/[id]', 'no such source');

  // A correction the range refuses. Nothing is written and the error card is
  // drawn from what the route answered, which is the point of walking it.
  if (ratingIds.length > 0) {
    await page.goto(`/value/${ratingIds[0]}`);
    await page.locator('#correction-value').fill('99');
    await page.getByRole('button', { name: strings.provenance.saveCorrection, exact: true }).click();
    await page.locator('.card.error[data-state="error"]').first().waitFor();
    await readSurface(page, '/value/[id]', 'correction refused by the range');
  }

  // The quick log, in the states screen 00 defines for it.
  await page.goto('/');
  const open = page.getByRole('button', { name: strings.quickLog.open, exact: true });

  await page.route('**/api/log', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await new Promise((wait) => setTimeout(wait, 2500));
    return route.fallback();
  });
  await open.click();
  await page.locator('[data-state="loading"]').first().waitFor();
  await readSurface(page, '/ quick log', 'loading');
  await page.locator('.sheet [aria-label="' + strings.quickLog.close + '"]').first().click();
  await page.unroute('**/api/log');

  await page.route('**/api/log', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const response = await route.fetch();
    const snapshot = await response.json();
    snapshot.lastWaist = null;
    return route.fulfill({ response, json: snapshot });
  });
  await open.click();
  await page.locator('[data-state="empty"]').first().waitFor();
  await readSurface(page, '/ quick log', 'no waist measurement yet');
  await page.locator('.sheet [aria-label="' + strings.quickLog.close + '"]').first().click();
  await page.unroute('**/api/log');

  await page.route('**/api/log', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const response = await route.fetch();
    const snapshot = await response.json();
    if (snapshot.lastWaist) {
      snapshot.lastWaist.measuredAt = new Date(Date.now() - 9 * 86_400_000).toISOString();
    }
    return route.fulfill({ response, json: snapshot });
  });
  await open.click();
  await page.locator('[data-state="stale"]').first().waitFor();
  await readSurface(page, '/ quick log', 'the waist reading is days old');
  await page.locator('.sheet [aria-label="' + strings.quickLog.close + '"]').first().click();
  await page.unroute('**/api/log');

  // The machine answered and the answer carried no words: a proxy 502, an HTML
  // error page, a body that is not JSON. The card falls back to its status
  // line, which is Vernier's own copy. That line was written inline in the
  // component for three verifications and no walked state ever reached it,
  // which is exactly why this state is walked now.
  await page.route('**/api/log', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({ status: 502, contentType: 'application/json', body: '{}' });
  });
  await open.click();
  await page.locator('.card.error[data-state="error"]').first().waitFor();
  await readSurface(page, '/ quick log', 'the answer carried no words');
  await page.locator('.sheet [aria-label="' + strings.quickLog.close + '"]').first().click();
  await page.unroute('**/api/log');

  // The fetch never reached the machine, so the cause is the browser's. This is
  // the one state the platform exemption exists for, and walking it is what
  // proves the exemption is exercised rather than merely written down.
  await page.route('**/api/log', (route) =>
    route.request().method() === 'GET' ? route.abort('connectionfailed') : route.fallback(),
  );
  await open.click();
  await page.locator('.card.error[data-state="error"]').first().waitFor();
  await readSurface(page, '/ quick log', 'the fetch never reached the machine');
  await page.locator('.sheet [aria-label="' + strings.quickLog.close + '"]').first().click();
  await page.unroute('**/api/log');

  // A write with nowhere to go. The entry stays on the phone, the banner counts
  // it, and Undo takes it back, which is the whole of screen 03 frame 2.
  await page.route('**/api/log', (route) =>
    route.request().method() === 'POST' ? route.abort('connectionfailed') : route.fallback(),
  );
  await open.click();
  await page.locator('.sheet').first().waitFor();
  await page.getByRole('button', { name: strings.quickLog.waistUp, exact: true }).click();
  await page.getByRole('button', { name: strings.quickLog.save, exact: true }).click();
  await page.locator('[data-just-logged="queued"]').waitFor();
  await readSurface(page, '/', 'a write queued on this phone');
  await page.getByRole('button', { name: strings.todayLog.undo, exact: true }).click();
  await page.locator('[data-just-logged="undone"]').waitFor();
  await readSurface(page, '/', 'the queued write undone');
  await page.unroute('**/api/log');

  // The session taken away under a screen that is already open. This is how the
  // verifier reached the error card, and it is the state that carried a refusal
  // with no key in it.
  await page.goto('/');
  await context.clearCookies();
  await open.click();
  await page.locator('.card.error[data-state="error"]').first().waitFor();
  await readSurface(page, '/ quick log', 'the session removed mid-screen');
}

/**
 * The refusals, straight from the routes, because every one of them is drawn on
 * a screen: the gate paints `error` under the passkey button, the value sheet
 * paints `error` and `detail` into screen 00's error card, and the quick log
 * paints `detail` into its own. A refusal is copy that happens to travel as
 * JSON.
 */
async function walkTheApi() {
  const signedOut = await webkit.launch();
  const bare = await signedOut.newContext({ baseURL: BASE });
  const anonymous = await bare.newPage();

  const calls = [
    ['no session, an API read', 'GET', '/api/log', null, {}],
    ['no session, the integrations read', 'GET', '/api/settings/integrations', null, {}],
    ['no session, a write', 'POST', '/api/log', { values: [] }, {}],
  ];
  for (const [state, method, path, body, headers] of calls) {
    const response = await anonymous.request.fetch(`${BASE}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      data: body ?? undefined,
    });
    judgeJson(`${method} ${path}`, state, await response.json());
    surfacesWalked.push(`${method} ${path} / ${state}`);
  }
  await signedOut.close();

  // Back through the door for the refusals that need a session.
  await page.goto(mintSignInLink());
  await page.goto('/');
  const csrf = await page.evaluate(() => {
    const element = document.querySelector('[data-csrf]');
    return element ? element.getAttribute('data-csrf') : null;
  });
  const cookies = await context.cookies();
  const token = csrf ?? cookies.find((cookie) => cookie.name === 'vernier_csrf')?.value ?? '';

  const write = (body, extra = {}) => ({
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-vernier-csrf': token,
      'Idempotency-Key': crypto.randomUUID(),
      ...extra,
    },
    data: body,
  });

  const refusals = [
    ['no anti-forgery header', '/api/log', { ...write({ values: [] }), headers: { 'content-type': 'application/json', 'Idempotency-Key': crypto.randomUUID() } }],
    ['no idempotency key', '/api/log', { method: 'POST', headers: { 'content-type': 'application/json', 'x-vernier-csrf': token }, data: { values: [] } }],
    ['nothing to store', '/api/log', write({ values: [] })],
    [
      'a metric Vernier does not keep',
      '/api/log',
      write({ values: [{ id: crypto.randomUUID(), metric: 'mood', rawValue: '3' }] }),
    ],
    [
      'a rating outside one to five',
      '/api/log',
      write({ values: [{ id: crypto.randomUUID(), metric: 'energy', rawValue: '99' }] }),
    ],
    [
      'a waist outside the band',
      '/api/log',
      write({ values: [{ id: crypto.randomUUID(), metric: 'waist', rawValue: '4' }] }),
    ],
    [
      'a blank field',
      '/api/log',
      write({ values: [{ id: crypto.randomUUID(), metric: 'waist', rawValue: '' }] }),
    ],
    [
      'a value that is not a number',
      '/api/log',
      write({ values: [{ id: crypto.randomUUID(), metric: 'waist', rawValue: 'about ninety' }] }),
    ],
    ['a correction with no number', '/api/log', write({ action: 'correct', correctsId: 'demo_waist' })],
    [
      'a correction of a value that is not there',
      '/api/log',
      write({ action: 'correct', correctsId: 'no_such_value', rawValue: '99' }),
    ],
    [
      'an integration Vernier does not know',
      '/api/settings/integrations',
      write({ provider: 'strava', secret: 'x', action: 'save' }),
    ],
    [
      'an empty credential',
      '/api/settings/integrations',
      write({ provider: 'withings', secret: '', action: 'save' }),
    ],
    ['a launch report that is not one', '/api/diagnostics/launch', write({ nonsense: true })],
  ];

  /**
   * What this check sent, added to the vocabulary before its answers are read.
   *
   * A refusal quotes the value it refused: "Vernier stores no metric called
   * mood." The word `mood` is not copy and has no key, it is what this script
   * put in the request a moment earlier, and a closed-world check knows exactly
   * what it typed. Only the strings this file sends are added, and they are
   * tagged, so a value the product invented is still unaccounted for.
   */
  const echoOfTheRequest = (body) => {
    if (typeof body === 'string') return addAnchor(body, 'echo of what this check sent');
    if (Array.isArray(body)) return body.forEach(echoOfTheRequest);
    if (body && typeof body === 'object') return Object.values(body).forEach(echoOfTheRequest);
  };
  for (const [, , options] of refusals) {
    echoOfTheRequest(options.data);
    // And the header names, which a refusal quotes back: "This request carried
    // no x-vernier-csrf header." That name used to tile as a `machine
    // identifier`, a shape that also swallowed every hyphenated English word,
    // so the shape is gone and the name is accounted for the honest way: it is
    // a string this file sent a moment earlier and it is tagged as one. Names
    // only. A header VALUE is a token or a credential and neither belongs in a
    // vocabulary of things a person may read.
    for (const name of Object.keys(options.headers ?? {})) {
      addAnchor(name, 'echo of a header this check sent');
    }
  }
  indexAnchors();

  for (const [state, path, options] of refusals) {
    const response = await page.request.fetch(`${BASE}${path}`, options);
    judgeJson(`POST ${path}`, state, await response.json());
    surfacesWalked.push(`POST ${path} / ${state}`);
  }

  // The manifest, which a share sheet reads out loud.
  const manifest = await page.request.fetch(`${BASE}/manifest.webmanifest`);
  const parsed = await manifest.json();
  for (const field of ['name', 'short_name', 'description']) {
    if (typeof parsed[field] === 'string') judge('/manifest.webmanifest', 'installed', field, parsed[field]);
  }
  surfacesWalked.push('/manifest.webmanifest / installed');
}

try {
  await walk();
  await walkTheApi();
} finally {
  await browser.close();
}

// --------------------------------------------------------------------------
// The report.

process.stdout.write(
  `rendered strings: ${surfacesWalked.length} surface states walked, ${fragmentsRead} fragments read against ${catalogueKeys} catalogue keys, ${dataValues} stored data values the owner or a device wrote, ${TOKENS.length} value shapes and ${platformVocabulary.size} distinct message(s) harvested from WebKit.\n`,
);

process.stdout.write(
  `  ${shippedFilesRead} file(s) of the shipped tree read for the browser's own words: ${
    [...platformVocabulary.keys()].map((message) => JSON.stringify(message)).join(', ') || 'none harvested'
  }\n`,
);

for (const text of platformText) {
  process.stdout.write(
    `  platform text  ${text.surface} / ${text.state}  ${JSON.stringify(text.text)}  provenance: ${text.provenance}\n`,
  );
}

// The walk itself, named. What this check cannot see is whatever is not on
// this list, so the list is printed on every run rather than described once.
for (const walked of surfacesWalked) process.stdout.write(`  walked  ${walked}\n`);

// And the branches that were not walked because this installation is not in
// them. Counted from the database, printed whether the count is zero or not.
for (const [what, statement] of unreachableBranches) {
  const count = Number(db(statement)[0] ?? '0');
  process.stdout.write(
    `  not walked  ${what}: ${count} on this machine${
      count === 0 ? ', so a string that renders only there is invisible to both checks' : ''
    }\n`,
  );
}

if (impersonations.length > 0) {
  process.stderr.write(
    `\nrendered strings: ${impersonations.length} literal(s) in the shipped tree impersonate the platform, which C6 does not allow:\n`,
  );
  for (const forged of impersonations) {
    process.stderr.write(
      `  ${forged.file}:${forged.line}  ${JSON.stringify(forged.text)}\n    why: ${forged.provenance} said this, so the product may not write it down. Say what Vernier knows, in a catalogued sentence.\n`,
    );
  }
}

if (defects.length === 0 && impersonations.length === 0) {
  process.stdout.write('rendered strings: every fragment on every surface resolves to a key.\n');
  process.exit(0);
}

if (defects.length === 0) process.exit(1);

process.stderr.write(`\nrendered strings: ${defects.length} fragment(s) with no key, which C6 does not allow:\n`);
for (const defect of defects) {
  process.stderr.write(
    `  ${defect.surface}  [${defect.state}]  ${defect.where}\n    read: ${JSON.stringify(defect.text)}\n    unaccounted: ${JSON.stringify(defect.unaccounted)}\n    why: ${defect.why}\n`,
  );
}
process.exit(1);
