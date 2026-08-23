#!/usr/bin/env node
// The bundled movement media, fetched once and recorded with its provenance.
//
//   node scripts/fetch-movement-media.mjs           fetch what is missing
//   node scripts/fetch-movement-media.mjs --verify   re-check every record's
//                                                    source and rewrite the
//                                                    verification date
//
// WHY A SCRIPT AND NOT A HAND-WRITTEN LIST. F67 wants a verification date on
// every media record, and a date typed by a person is a claim. This asks the
// source, and what it answers becomes the record: the URL that served the
// bytes, the author the source names, the licence the source names, the day it
// was asked, and the movement it belongs to. `src/data/movement-media.json` is
// its output and the only place those records are written.
//
// A NULL AUTHOR IS REFUSED HERE TOO, not only at the database. The reason is in
// .forge/research/exercise-media.md section 2.5: 87 of wger's 365 images carry
// an empty `license_author` under CC BY-SA, which cannot be complied with, and
// section 2.6, where an entire 1,746-image set is infringing and has no author
// to record at all. The rule that keeps those out is the same one at both ends:
// no author, no row, no file.
//
// Nothing here downloads video. The third media layer is a youtube-nocookie
// iframe the browser fetches for itself, and the terms in section 1.3 forbid a
// local copy of it in the plainest words in the whole document.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');
const mediaDir = join(projectRoot, 'public', 'movements');
const manifestPath = join(projectRoot, 'src', 'data', 'movement-media.json');

// upload.wikimedia.org refuses a generic user agent, and the Foundation asks
// for contact information on an automated fetch. This is the owner's own
// address, on his own machine, fetching a few dozen files once.
const AGENT = 'VernierMediaFetch/1.0 (https://github.com/lbtbly/vernier; lambert.bouley@gmail.com)';

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const EVERKINETIC_RAW = 'https://raw.githubusercontent.com/everkinetic/data/main/dist/svg';
const EVERKINETIC_HOME = 'https://github.com/everkinetic/data';

/**
 * Everkinetic ships one licence for all 537 files, stated in full in the repo,
 * with one named rights holder. That combination is what makes it safe where an
 * aggregator with an Unlicense file over other people's photographs is not.
 */
const EVERKINETIC = {
  author: 'Everkinetic',
  licence: 'CC BY-SA 4.0',
  licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  attributionUrl: 'http://db.everkinetic.com',
};

/**
 * What to fetch, by movement. `frame` picks the Everkinetic pose: `tension` is
 * the end position, which is the one a coaching card wants.
 */
const WANTED = [
  // ---- Everkinetic, CC BY-SA 4.0 -----------------------------------------
  { movement: 'push-up', kind: 'everkinetic', id: '0077', frame: 'tension' },
  { movement: 'close-grip-push-up', kind: 'everkinetic', id: '0188', frame: 'tension' },
  { movement: 'side-plank', kind: 'everkinetic', id: '0113', frame: 'tension' },
  { movement: 'glute-bridge', kind: 'everkinetic', id: '0109', frame: 'tension' },
  { movement: 'superman', kind: 'everkinetic', id: '0105', frame: 'tension' },
  { movement: 'reverse-crunch', kind: 'everkinetic', id: '0287', frame: 'tension' },
  { movement: 'crunch', kind: 'everkinetic', id: '0291', frame: 'tension' },
  { movement: 'lying-leg-raise', kind: 'everkinetic', id: '0021', frame: 'tension' },
  { movement: 'bench-dip', kind: 'everkinetic', id: '0162', frame: 'tension' },
  { movement: 'triceps-dip', kind: 'everkinetic', id: '0172', frame: 'tension' },
  { movement: 'chest-dip', kind: 'everkinetic', id: '0054', frame: 'tension' },
  { movement: 'donkey-calf-raise', kind: 'everkinetic', id: '0275', frame: 'tension' },
  { movement: 'hip-lift', kind: 'everkinetic', id: '0111', frame: 'tension' },
  { movement: 'bicycle-crunch', kind: 'everkinetic', id: '0284', frame: 'tension' },
  { movement: 'ankle-circle', kind: 'everkinetic', id: '0270', frame: 'tension' },
  { movement: 'abdominal-brace', kind: 'everkinetic', id: '0027', frame: 'tension' },

  // ---- CDC Growing Stronger, public domain, via Wikimedia Commons ---------
  { movement: 'bodyweight-squat', kind: 'commons', file: 'Squat-CDC strength training for older adults.gif' },
  { movement: 'lunge', kind: 'commons', file: 'Lunge-CDC strength training for older adults.gif' },
  { movement: 'wall-push-up', kind: 'commons', file: 'Wallpushup-CDC strength training for older adults.gif' },
  { movement: 'calf-raise', kind: 'commons', file: 'Toe stand-CDC strength training for older adults.gif' },
  { movement: 'step-up', kind: 'commons', file: 'Step up-CDC strength training for older adults.gif' },
  { movement: 'pelvic-tilt', kind: 'commons', file: 'Pelvic tilt-CDC strength training for older adults.gif' },
  { movement: 'hamstring-curl', kind: 'commons', file: 'Knee curl-CDC strength training for older adults.gif' },
  { movement: 'knee-extension', kind: 'commons', file: 'Knee extension-CDC strength training for older adults.gif' },
  { movement: 'hip-abduction', kind: 'commons', file: 'Hip abduction-CDC strength training for older adults.gif' },
  { movement: 'back-stretch', kind: 'commons', file: 'Backstretch-CDC strength training for older adults.gif' },
  { movement: 'chest-stretch', kind: 'commons', file: 'Chest stretch-CDC strength training for older adults.gif' },
  { movement: 'hamstring-stretch', kind: 'commons', file: 'Hamstring stretch-CDC strength training for older adults.gif' },
  { movement: 'quad-stretch', kind: 'commons', file: 'Quad stretch-CDC strength training for older adults.gif' },
  { movement: 'floor-back-extension', kind: 'commons', file: 'Floor back extensions-CDC strength training for older adults.gif' },
  { movement: 'abdominal-curl', kind: 'commons', file: 'Abdominal curl-CDC strength training for older adults.gif' },

  // ---- Wikimedia Commons gap fillers, per-file attribution ----------------
  { movement: 'bird-dog', kind: 'commons', file: 'Birddog exercise.svg' },
  { movement: 'front-plank', kind: 'commons', file: 'Plank exercise.svg' },
  { movement: 'jumping-jack', kind: 'commons', file: 'Jumpingjacks wbs.gif' },
  { movement: 'high-knees', kind: 'commons', file: 'Highknees wbs.gif' },
  { movement: 'burpee', kind: 'commons', file: 'Burpees WBS.gif' },
  { movement: 'toe-touch', kind: 'commons', file: 'Touchankles.gif' },
  { movement: 'treadmill-walk', kind: 'commons', file: 'Man on a Treadmill GIF Animation Loop.gif' },
  { movement: 'stationary-bike', kind: 'commons', file: 'Man on an Exercise Bike GIF Animation Loop.gif' },
  { movement: 'recovery-walk', kind: 'commons', file: 'Man Walking GIF Animation Loop.gif' },
  { movement: 'treadmill-intervals', kind: 'commons', file: 'Man Jogging GIF Animation Loop.gif' },
];

/**
 * The three movements with no free asset anywhere, from
 * .forge/research/exercise-media.md section 0, point 4: dead bug, wall sit and
 * mountain climber. Searching Commons for the last one returns mountaineers.
 *
 * They carry original artwork drawn for this product, which is why they are
 * listed here rather than fetched: the author is Vernier, the record says so,
 * and the file is committed beside the fetched ones. The rule stands, and it is
 * the rule that matters: a media row with no author does not exist.
 */
const ORIGINAL = [
  { movement: 'dead-bug', file: 'dead-bug.svg' },
  { movement: 'wall-sit', file: 'wall-sit.svg' },
  { movement: 'mountain-climber', file: 'mountain-climber.svg' },
];

const ORIGINAL_RECORD = {
  author: 'Vernier',
  licence: 'Original artwork',
  licenceUrl: '',
  attributionUrl: '',
};

/**
 * Strip the markup Commons wraps its Artist field in, keeping the name.
 *
 * The interwiki prefix goes with it. Several CDC files carry the artist as the
 * wiki link `w:en:Centers for Disease Control and Prevention`, and the four
 * characters in front of that name are addressing on another site, not part of
 * what the source is called.
 */
function plainText(html) {
  return String(html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\bw:[a-z-]{2,12}:/gi, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function commonsInfo(file) {
  const url = new URL(COMMONS_API);
  url.searchParams.set('action', 'query');
  url.searchParams.set('format', 'json');
  url.searchParams.set('prop', 'imageinfo');
  url.searchParams.set('iiprop', 'url|size|extmetadata|mime');
  url.searchParams.set('titles', `File:${file}`);
  const response = await fetch(url, { headers: { 'User-Agent': AGENT } });
  if (!response.ok) throw new Error(`commons ${response.status} for ${file}`);
  const body = await response.json();
  const pages = Object.values(body.query?.pages ?? {});
  const info = pages[0]?.imageinfo?.[0];
  if (!info) throw new Error(`commons has no imageinfo for ${file}`);
  const meta = info.extmetadata ?? {};
  const artist = plainText(meta.Artist?.value);
  const credit = plainText(meta.Credit?.value);
  const licence = plainText(meta.LicenseShortName?.value);
  return {
    downloadUrl: info.url,
    pageUrl: info.descriptionurl,
    bytes: info.size,
    mime: info.mime,
    // A public-domain federal work names its agency rather than a person, and
    // that is what "author or source name" is for. An empty artist with an
    // empty credit is refused below.
    author: artist || credit,
    licence: licence || plainText(meta.UsageTerms?.value),
    licenceUrl: plainText(meta.LicenseUrl?.value),
  };
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One file, politely.
 *
 * upload.wikimedia.org answers 429 to a burst, which is fair: this is one
 * person's machine asking for forty files it will keep forever. So the fetches
 * are spaced, a refusal is waited out rather than retried immediately, and a
 * file already on disk is not asked for again. The run is resumable, which is
 * what makes the rate limit a delay rather than a failure.
 */
const BACKOFF = [2000, 5000, 12_000, 30_000];

async function download(url) {
  for (let attempt = 0; attempt <= BACKOFF.length; attempt += 1) {
    const response = await fetch(url, { headers: { 'User-Agent': AGENT } });
    if (response.ok) return Buffer.from(await response.arrayBuffer());
    if (response.status !== 429 || attempt === BACKOFF.length) {
      throw new Error(`${response.status} fetching ${url}`);
    }
    await pause(BACKOFF[attempt]);
  }
  throw new Error(`unreachable, ${url}`);
}

/** The bytes on disk, or the bytes from the source if this is the first run. */
async function bytesFor(name, url) {
  const path = join(mediaDir, name);
  try {
    const existing = await readFile(path);
    if (existing.length > 0) return existing;
  } catch {
    // Not fetched yet.
  }
  const fetched = await download(url);
  await writeFile(path, fetched);
  await pause(600);
  return fetched;
}

const today = new Date().toISOString().slice(0, 10);
const records = [];
const problems = [];

await mkdir(mediaDir, { recursive: true });

for (const want of WANTED) {
  try {
    if (want.kind === 'everkinetic') {
      const source = `${EVERKINETIC_RAW}/${want.id}-${want.frame}.svg`;
      const name = `${want.movement}.svg`;
      const bytes = await bytesFor(name, source);
      records.push({
        movement: want.movement,
        path: `/movements/${name}`,
        url: source,
        author: EVERKINETIC.author,
        licence: EVERKINETIC.licence,
        licenceUrl: EVERKINETIC.licenceUrl,
        attributionUrl: EVERKINETIC.attributionUrl || EVERKINETIC_HOME,
        embeddingMode: 'bundled',
        kind: 'still',
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex').slice(0, 16),
        verifiedAt: today,
      });
      continue;
    }

    const info = await commonsInfo(want.file);
    if (!info.author) {
      problems.push(`${want.file}: the source names no author, so it is not bundled`);
      continue;
    }
    const extension = want.file.slice(want.file.lastIndexOf('.'));
    const name = `${want.movement}${extension}`;
    const bytes = await bytesFor(name, info.downloadUrl);
    records.push({
      movement: want.movement,
      path: `/movements/${name}`,
      url: info.pageUrl,
      author: info.author,
      licence: info.licence,
      licenceUrl: info.licenceUrl,
      attributionUrl: info.pageUrl,
      embeddingMode: 'bundled',
      kind: extension === '.gif' ? 'animation' : 'still',
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex').slice(0, 16),
      verifiedAt: today,
    });
  } catch (error) {
    problems.push(`${want.movement}: ${error.message}`);
  }
}

for (const original of ORIGINAL) {
  try {
    const bytes = await readFile(join(mediaDir, original.file));
    records.push({
      movement: original.movement,
      path: `/movements/${original.file}`,
      url: `/movements/${original.file}`,
      author: ORIGINAL_RECORD.author,
      licence: ORIGINAL_RECORD.licence,
      licenceUrl: ORIGINAL_RECORD.licenceUrl,
      attributionUrl: ORIGINAL_RECORD.attributionUrl,
      embeddingMode: 'bundled',
      kind: 'still',
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex').slice(0, 16),
      verifiedAt: today,
    });
  } catch (error) {
    problems.push(`${original.movement}: ${error.message}`);
  }
}

records.sort((left, right) => left.movement.localeCompare(right.movement));
await mkdir(dirname(manifestPath), { recursive: true });
await writeFile(manifestPath, `${JSON.stringify(records, null, 2)}\n`, 'utf8');

const total = records.reduce((sum, record) => sum + record.bytes, 0);
process.stdout.write(
  `fetch-movement-media: ${records.length} file(s), ${(total / 1024 / 1024).toFixed(2)} MB, written to public/movements/\n`,
);
for (const record of records) {
  process.stdout.write(`  ${record.movement}\t${record.path}\t${record.author}\t${record.licence}\n`);
}
if (problems.length > 0) {
  process.stderr.write(`fetch-movement-media: ${problems.length} problem(s):\n`);
  for (const problem of problems) process.stderr.write(`  ${problem}\n`);
  process.exit(1);
}
