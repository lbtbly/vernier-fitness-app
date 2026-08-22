#!/usr/bin/env node
// The closed-world string check: every word the product renders has a key.
//
//   node scripts/rendered-strings.mjs            walk it, print the report
//   node scripts/rendered-strings.mjs --verbose  print every fragment it read
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
//      free-text columns only. A state column is deliberately NOT data here:
//      `integration_credential.state` reaching a screen is the defect this
//      check exists to catch, so its values are not in the vocabulary and a
//      chip printing one fails.
//   3. Shapes that are values rather than words: a number, a time, a UUID, a
//      prefixed id, a URL, a host, a zone name, and the month and weekday names
//      the app's own formatters produce in the app's own zone.
//
// Anything else is a defect, reported with the text, the surface and the state.
//
// WHAT IT CANNOT SEE, stated plainly rather than discovered later:
//
//   - A state it cannot reach. It walks what a signed-in owner and an
//     unauthenticated visitor can reach on this machine with the demonstration
//     seed loaded. A screen that needs a registered passkey, a connected
//     integration or an open import question is not walked, because none of the
//     three exists here. Every surface it does walk is named in walk() below,
//     so the gap is a list and not a guess.
//   - What the browser itself says. The quick-log error card renders the cause
//     it was given, and when a fetch never reached the machine that cause is
//     WebKit's own words. Those have no key and can have none. A fragment whose
//     only unaccounted text sits in the cause slot of one of the CAUSE_SLOTS
//     keys is reported as a platform cause rather than failed.
//   - Two catalogued strings written next to each other. Fragments are tiled
//     from catalogue anchors, so a sentence assembled entirely out of words that
//     are already copy somewhere else would tile. Every fragment it accepts is
//     made of shipped copy; it does not prove the arrangement was intended.
//   - /healthz, which answers a machine and is graded by C1 for saying as
//     little as possible.
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webkit } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');
const { strings } = await import(join(projectRoot, 'src', 'lib', 'strings.ts'));

const BASE = (process.env.APP_URL ?? 'https://lamberts-mac-mini.tailda76d6.ts.net').replace(/\/+$/, '');
const VERBOSE = process.argv.includes('--verbose');

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
      `psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c ${JSON.stringify(oneLine)}`,
    ],
    { cwd: projectRoot, encoding: 'utf8' },
  )
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

function appEnv(names) {
  const out = execFileSync('docker', ['compose', 'exec', '-T', 'app', 'printenv', ...names], {
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
 * Free text this database holds, and only free text.
 *
 * A note the owner typed, the reason he gave for a correction, the reference a
 * batch carried, the rows a source record lists, the scope an integration was
 * granted, the name he gave a passkey. Not `state`, not `source`, not `kind`,
 * not `confidence`, not `method`, not `device_type`: those are columns whose
 * values are tokens, and a token reaching a screen is the defect this checks
 * for. Leaving them out of the vocabulary is what makes the check able to catch
 * one.
 */
const DATA_QUERIES = [
  ['measurement.raw_value', 'select distinct raw_value from measurement'],
  [
    'measurement.correction_reason',
    "select distinct correction_reason from measurement where correction_reason is not null and correction_reason <> ''",
  ],
  ['source_record.reference', 'select distinct reference from source_record'],
  [
    'source_record.detail',
    "select distinct value->>'value' from source_record, jsonb_array_elements(detail) as value",
  ],
  ['integration_credential.scope', 'select distinct scope from integration_credential'],
  ['webauthn_credential.label', 'select distinct label from webauthn_credential'],
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

const TOKENS = [
  ['uuid', /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i],
  ['id', /^(?:src_|q_|demo_)[A-Za-z0-9_.:-]+/],
  ['url', /^https?:\/\/[^\s]+/],
  ['zone', /^[A-Z][A-Za-z]+(?:\/[A-Za-z_]+)+/],
  ['dotted identifier', /^[a-z][a-z0-9]*(?:\.[a-z0-9]+)+/],
  ['machine identifier', /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)+/],
  ['host', /^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+/],
  ['number', /^[+-]?\d+(?:[.,:]\d+)*/],
];

/** Space and punctuation between two things that are accounted for. */
const GLUE = /^[\s,.;:!?·•|/\\()[\]{}"'“”‘’«»–—+*=%~@#&<>$£€-]+/;

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

/**
 * The one deliberate exemption, and it is one key wide.
 *
 * `quickLog.errorBody` renders the cause it was handed into a sentence of its
 * own. When the fetch reached the machine that cause is a catalogued refusal
 * and tiles like anything else. When the fetch never reached the machine it is
 * WebKit's own words, which have no key and can have none. A fragment whose
 * only unaccounted text sits in that slot is reported rather than failed.
 */
const CAUSE_SLOTS = [{ key: 'quickLog.errorBody', fn: strings.quickLog.errorBody }].map(
  ({ key, fn }) => ({ key, segments: fn(SENTINEL).split(SENTINEL).filter((part) => part.trim() !== '') }),
);

function inCauseSlot(text) {
  for (const slot of CAUSE_SLOTS) {
    let index = 0;
    let matched = true;
    for (const segment of slot.segments) {
      const found = text.indexOf(segment.trim(), index);
      if (found === -1) {
        matched = false;
        break;
      }
      index = found + segment.trim().length;
    }
    if (matched) return slot.key;
  }
  return null;
}

// --------------------------------------------------------------------------
// Reading a rendered surface.

/**
 * Every string a person can read or hear on the page: text nodes, the spoken
 * attributes, and the document title. Visually hidden text is included, because
 * a screen reader reads it and C8 puts it there on purpose.
 */
function readTheScreen() {
  const found = [];
  const describe = (element) => {
    if (!element) return 'body';
    const classes = element.getAttribute('class');
    return element.tagName.toLowerCase() + (classes ? '.' + classes.split(/\s+/).join('.') : '');
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const element = node.parentElement;
    if (!element) continue;
    if (element.closest('script, style, noscript, template, svg')) continue;
    if (!node.data || node.data.trim() === '') continue;
    found.push({ where: describe(element), text: node.data });
  }
  const spoken = ['aria-label', 'aria-description', 'aria-placeholder', 'placeholder', 'alt', 'title'];
  for (const element of document.querySelectorAll('[' + spoken.join('], [') + ']')) {
    for (const name of spoken) {
      const value = element.getAttribute(name);
      if (value && value.trim() !== '') found.push({ where: describe(element) + '@' + name, text: value });
    }
  }
  if (document.title) found.push({ where: 'title', text: document.title });
  const description = document.querySelector('meta[name="description"]');
  if (description) found.push({ where: 'meta description', text: description.getAttribute('content') || '' });
  return found;
}

const defects = [];
const platformCauses = [];
let fragmentsRead = 0;
const surfacesWalked = [];

function judge(surface, state, where, text) {
  const fragment = text.replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ').trim();
  if (fragment === '') return;
  fragmentsRead += 1;
  const result = tile(fragment);
  if (result.ok) {
    if (VERBOSE) process.stdout.write(`  ok   ${surface} / ${state}  ${JSON.stringify(fragment)}\n`);
    return;
  }
  const slot = inCauseSlot(fragment);
  if (slot) {
    platformCauses.push({ surface, state, where, text: fragment, slot });
    return;
  }
  defects.push({ surface, state, where, text: fragment, unaccounted: result.rest });
}

async function readSurface(page, surface, state) {
  const found = await page.evaluate(readTheScreen);
  surfacesWalked.push(`${surface} / ${state}`);
  for (const { where, text } of found) judge(surface, state, where, text);
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

const rowIds = db('select id from measurement order by measured_at desc');
const ratingIds = db("select id from measurement where unit = 'point' limit 1");
const sourceIds = db('select id from source_record order by recorded_at desc');

const browser = await webkit.launch();
const context = await browser.newContext({
  baseURL: BASE,
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 3,
  serviceWorkers: 'block',
});
const page = await context.newPage();

async function walk() {
  // The visitor at the gate, before any session exists on this context.
  await page.goto('/sign-in');
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

  await page.goto('/settings');
  await readSurface(page, '/settings', 'four integrations, no passkey');

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
  for (const [, , options] of refusals) echoOfTheRequest(options.data);
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
  `rendered strings: ${surfacesWalked.length} surface states walked, ${fragmentsRead} fragments read against ${catalogueKeys} catalogue keys, ${dataValues} stored data values and ${TOKENS.length} value shapes.\n`,
);

for (const cause of platformCauses) {
  process.stdout.write(
    `  platform cause  ${cause.surface} / ${cause.state}  ${JSON.stringify(cause.text)}  fills ${cause.slot}\n`,
  );
}

// The walk itself, named. What this check cannot see is whatever is not on
// this list, so the list is printed on every run rather than described once.
for (const walked of surfacesWalked) process.stdout.write(`  walked  ${walked}\n`);

if (defects.length === 0) {
  process.stdout.write('rendered strings: every fragment on every surface resolves to a key.\n');
  process.exit(0);
}

process.stderr.write(`\nrendered strings: ${defects.length} fragment(s) with no key, which C6 does not allow:\n`);
for (const defect of defects) {
  process.stderr.write(
    `  ${defect.surface}  [${defect.state}]  ${defect.where}\n    read: ${JSON.stringify(defect.text)}\n    unaccounted: ${JSON.stringify(defect.unaccounted)}\n`,
  );
}
process.exit(1);
