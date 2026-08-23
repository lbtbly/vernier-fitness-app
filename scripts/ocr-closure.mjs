#!/usr/bin/env node
// The two optional packages the scanned-page branch needs, and everything they
// need, resolved rather than listed.
//
//   node scripts/ocr-closure.mjs           print the closure, one package a line
//   node scripts/ocr-closure.mjs --copy D  print it, then copy it into D
//
// EVERY RUN CHECKS. There is no --check flag, because a flag is a thing a caller
// can forget and this project has already shipped a gate that named a script
// nobody had defined. A missing package or a native package with no binary for
// this architecture exits non-zero whatever else was asked for, so the Dockerfile
// stage that copies is the same stage that verifies.
//
// WHY THIS EXISTS. `next build` traces the imports it can see and the runner
// stage copies `.next/standalone`, which carries a pruned `node_modules` built
// from that trace. src/lib/lab-ocr.ts reaches `@napi-rs/canvas` and
// `tesseract.js` through an `import()` whose specifier is a variable, on purpose,
// so a document with a text layer loads no WASM and no native binary. A trace
// cannot follow a variable, so neither package entered the image: `docker exec
// vernier-app-1 ls /app/node_modules` found no tesseract and no @napi-rs, the
// route refused every scanned page by name, and F65's recognition half could not
// happen on the shipped product. The refusal was honest and it is not the same
// thing as the feature existing.
//
// A HAND-WRITTEN COPY LIST WOULD ROT. tesseract.js pulls nine packages of its
// own and one of them pulls three more, and @napi-rs/canvas resolves a different
// native binary per platform: the Mac has `@napi-rs/canvas-darwin-arm64` and the
// linux/arm64 image has `@napi-rs/canvas-linux-arm64-gnu`. A COPY line naming
// either one is wrong somewhere. So the closure is computed inside the stage it
// is copied from, off the `node_modules` that stage really installed.
//
// AND THE ROOTS ARE READ OFF THE FILE THAT IMPORTS THEM. Not written here. If
// somebody adds a third optional package to lab-ocr.ts and does not touch this
// script, the closure covers it on the next build; if they rename the file's
// module constants, this stops rather than copying a stale pair.
import { cp, mkdir, readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');

/**
 * The file whose runtime imports this closure exists to satisfy, and the shape
 * those imports are written in.
 *
 * `const canvasModule = '@napi-rs/canvas';` and its sibling. The specifier is
 * built as a value so the bundler leaves it alone, and that same property is
 * what makes it readable from here with no parser.
 */
const OWNER = join(projectRoot, 'src', 'lib', 'lab-ocr.ts');
const MODULE_CONSTANT = /const \w*[Mm]odule\s*=\s*'([^']+)'/g;

async function roots() {
  const source = await readFile(OWNER, 'utf8');
  const found = [...source.matchAll(MODULE_CONSTANT)].map((match) => match[1]);
  if (found.length < 2) {
    process.stderr.write(
      'ocr-closure: src/lib/lab-ocr.ts no longer names its optional modules as `const ...Module = ...`.\n' +
        '             This script copies what that file imports, so it stops rather than\n' +
        `             copying a pair it made up. Found: ${JSON.stringify(found)}\n`,
    );
    process.exit(2);
  }
  return [...new Set(found)];
}

/** Where a package really is, walking up from a directory the way Node does. */
async function directoryOf(name, from) {
  let at = from;
  for (;;) {
    const candidate = join(at, 'node_modules', name);
    try {
      const stats = await stat(join(candidate, 'package.json'));
      if (stats.isFile()) return candidate;
    } catch {
      // Not here. Keep walking up.
    }
    const parent = dirname(at);
    if (parent === at) return null;
    at = parent;
  }
}

/**
 * Every package the roots need, transitively.
 *
 * `dependencies` must all be present or the package is broken. An
 * `optionalDependencies` entry that is absent is normal: that is how a native
 * package ships eleven platform binaries and installs one. But a package whose
 * optional list is non-empty and whose every entry is missing has no binary at
 * all, and that is the state this closure exists to catch before an image ships
 * with it.
 */
async function closure(names) {
  const found = new Map();
  const missing = [];
  const platformless = [];
  const queue = [...names.map((name) => ({ name, from: projectRoot }))];

  while (queue.length > 0) {
    const { name, from } = queue.shift();
    if (found.has(name)) continue;
    const directory = await directoryOf(name, from);
    if (!directory) {
      missing.push(name);
      continue;
    }
    found.set(name, directory);
    const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
    for (const dependency of Object.keys(manifest.dependencies ?? {})) {
      queue.push({ name: dependency, from: directory });
    }
    const optional = Object.keys(manifest.optionalDependencies ?? {});
    let resolved = 0;
    for (const dependency of optional) {
      const at = await directoryOf(dependency, directory);
      if (!at) continue;
      resolved += 1;
      queue.push({ name: dependency, from: directory });
    }
    if (optional.length > 0 && resolved === 0) platformless.push(name);
  }

  return { found, missing, platformless };
}

/** Bytes under a directory, so the report says what the image is paying. */
async function bytesUnder(directory) {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) total += await bytesUnder(path);
    else if (entry.isFile()) total += (await stat(path)).size;
  }
  return total;
}

const names = await roots();
const { found, missing, platformless } = await closure(names);
const packages = [...found.keys()].sort();

let bytes = 0;
for (const directory of found.values()) bytes += await bytesUnder(directory);

process.stdout.write(
  `ocr-closure: ${packages.length} packages, ${(bytes / 1024 / 1024).toFixed(1)} MB, ` +
    `from ${names.join(' and ')} as src/lib/lab-ocr.ts names them.\n`,
);
for (const name of packages) process.stdout.write(`  ${name}\n`);

if (missing.length > 0) {
  process.stderr.write(
    `ocr-closure: ${missing.length} package(s) in the closure are not installed here: ${missing.join(', ')}\n` +
      '             The scanned-page branch would refuse by name at run time.\n',
  );
  process.exit(1);
}
if (platformless.length > 0) {
  process.stderr.write(
    `ocr-closure: ${platformless.join(', ')} resolved no platform binary at all.\n` +
      '             That is an install made for another architecture, and copying it\n' +
      '             would put a package in the image that cannot load.\n',
  );
  process.exit(1);
}

const copyAt = process.argv.indexOf('--copy');
if (copyAt !== -1) {
  const destination = process.argv[copyAt + 1];
  if (!destination) {
    process.stderr.write('ocr-closure: --copy needs a directory to copy into.\n');
    process.exit(2);
  }
  for (const [name, directory] of found) {
    const target = join(destination, name);
    await mkdir(dirname(target), { recursive: true });
    await cp(directory, target, { recursive: true, dereference: true });
  }
  process.stdout.write(`ocr-closure: copied ${found.size} packages into ${destination}\n`);
}

process.exit(0);
