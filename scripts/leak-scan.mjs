#!/usr/bin/env node
// Seeds a credential for every integration, exercises the app, and then looks
// for those values everywhere a value could leak: the rendered documents, every
// API response body the run recorded, the container logs and the git working
// tree.
//
//   node scripts/leak-scan.mjs [base-url]
//
// F16. Exit code 1 on any hit.
//
// Nothing here prints a credential. The seeded values are generated in this
// process, the master key is read out of the running container into a variable,
// and what reaches the terminal is a label, a SHA-256 prefix and a count. A
// scan that printed what it was looking for would be the leak.
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl = (process.argv[2] || process.env.APP_URL || 'https://lamberts-mac-mini.tailda76d6.ts.net').replace(/\/+$/, '');

const run = (command, args) =>
  execFileSync(command, args, { cwd: projectRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const fingerprint = (value) => createHash('sha256').update(value).digest('hex').slice(0, 12);

/* ------------------------------------------------------------ the needles */

const PROVIDERS = ['withings', 'apple_health', 'google_calendar', 'mail_relay'];
const seeded = new Map(PROVIDERS.map((provider) => [provider, `${provider}-secret-${randomBytes(18).toString('base64url')}`]));

const needles = [...seeded].map(([provider, value]) => ({ label: `${provider} credential`, value }));

try {
  const masterKey = run('docker', ['compose', 'exec', '-T', 'app', 'printenv', 'MASTER_KEY']).trim();
  if (masterKey) needles.push({ label: 'the master key', value: masterKey });
} catch {
  console.log('leak scan: the app container did not answer, so the master key is not in this scan');
}

for (const name of ['INGEST_TOKEN', 'WITHINGS_CLIENT_SECRET', 'ANTHROPIC_API_KEY']) {
  try {
    const value = run('docker', ['compose', 'exec', '-T', 'app', 'printenv', name]).trim();
    if (value) needles.push({ label: `the ${name.toLowerCase().replace(/_/g, ' ')}`, value });
  } catch {
    // Not passed into the app process yet. Least privilege: the slice that
    // needs it is the slice that gets it.
    console.log(`leak scan: ${name} is not in the app container's environment, so there is nothing of it to leak`);
  }
}

/* --------------------------------------------------------- the cookie jar */

const jar = new Map();
const cookieHeader = () => [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
const absorb = (response) => {
  for (const line of response.headers.getSetCookie()) {
    const pair = line.split(';')[0];
    const index = pair.indexOf('=');
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (value === '') jar.delete(name);
    else jar.set(name, value);
  }
};

const recorded = [];

async function visit(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    redirect: 'manual',
    headers: {
      cookie: cookieHeader(),
      ...(init.body ? { 'content-type': 'application/json', 'x-vernier-csrf': jar.get('vernier_csrf') ?? '' } : {}),
      ...(init.headers ?? {}),
    },
  });
  absorb(response);
  const text = await response.text();
  recorded.push({ path, status: response.status, text });
  return { status: response.status, text };
}

/* ------------------------------------------------------------- the run */

const link = run('bash', ['scripts/recovery.sh', 'link', '5']).trim().split('\n').at(-1);
await visit(link.slice(baseUrl.length));

for (const [provider, secret] of seeded) {
  const saved = await visit('/api/settings/integrations', {
    method: 'POST',
    body: JSON.stringify({ provider, secret, action: 'save' }),
  });
  if (saved.status !== 201) {
    console.error(`leak scan: could not seed ${provider}, the app answered ${saved.status}`);
    process.exit(1);
  }
  await visit('/api/settings/integrations', {
    method: 'POST',
    body: JSON.stringify({ provider, action: 'check' }),
  });
}

for (const path of ['/', '/health', '/train', '/eat', '/settings', '/sign-in', '/offline', '/healthz', '/api/diagnostics/device', '/api/settings/integrations']) {
  await visit(path);
}

console.log(`leak scan: ${recorded.length} responses recorded from ${baseUrl}`);

/* ------------------------------------------------------------ the corpora */

const SKIP = new Set(['.git', 'node_modules', '.next', 'test-results', 'playwright-report', '.DS_Store']);

/**
 * What git would carry: everything tracked, plus everything untracked that is
 * not ignored. The configuration file holding the master key is ignored and is
 * exactly where the key is supposed to live, so it is counted separately below
 * rather than reported as a leak.
 */
function committableFiles() {
  const listed = [
    run('git', ['ls-files', '-z']),
    run('git', ['ls-files', '-z', '--others', '--exclude-standard']),
  ].join('');
  return listed
    .split('\0')
    .filter(Boolean)
    .map((path) => join(projectRoot, path))
    .filter((path) => {
      try {
        return statSync(path).isFile() && statSync(path).size < 8 * 1024 * 1024;
      } catch {
        return false;
      }
    });
}

/** Every file on disk, ignored ones included, for the separate question below. */
function allFiles(dir = projectRoot, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const path = join(dir, entry.name);
    try {
      if (entry.isDirectory()) allFiles(path, found);
      else if (statSync(path).size < 8 * 1024 * 1024) found.push(path);
    } catch {
      // A file that vanished between the listing and the stat is not evidence.
    }
  }
  return found;
}

const corpora = [
  {
    name: 'every rendered document and API response body from this run',
    read: () => recorded.map((entry) => `${entry.path} ${entry.text}`).join('\n'),
  },
  {
    name: 'the app container log',
    read: () => run('docker', ['compose', 'logs', 'app', '--no-color', '--tail', '5000']),
  },
  {
    name: 'the database log',
    read: () => run('docker', ['compose', 'logs', 'db', '--no-color', '--tail', '2000']),
  },
  {
    name: 'the git working tree, tracked and untracked',
    read: () =>
      committableFiles()
        .map((path) => {
          try {
            return `${relative(projectRoot, path)} ${readFileSync(path, 'utf8')}`;
          } catch {
            return '';
          }
        })
        .join('\n'),
  },
];

let hits = 0;
for (const corpus of corpora) {
  const haystack = corpus.read();
  for (const needle of needles) {
    const count = haystack.split(needle.value).length - 1;
    if (count > 0) hits += count;
    console.log(
      `  ${corpus.name.padEnd(58)} ${needle.label.padEnd(28)} sha256 ${fingerprint(needle.value)}  ${count} hit(s)`,
    );
  }
}

/* ------------------------------- where the key is allowed to be, and only there */

const ignoredHolders = [];
for (const path of allFiles()) {
  let contents = '';
  try {
    contents = readFileSync(path, 'utf8');
  } catch {
    continue;
  }
  for (const needle of needles) {
    if (!contents.includes(needle.value)) continue;
    let ignoredByGit = false;
    try {
      run('git', ['check-ignore', '-q', relative(projectRoot, path)]);
      ignoredByGit = true;
    } catch {
      ignoredByGit = false;
    }
    ignoredHolders.push({ path: relative(projectRoot, path), needle: needle.label, ignoredByGit });
  }
}

console.log('');
for (const holder of ignoredHolders) {
  const verdict = holder.ignoredByGit
    ? 'git ignores, which is where it is supposed to live'
    : 'git would carry, which is a leak';
  console.log(`  ${holder.needle} is on disk in one file that ${verdict}`);
  if (!holder.ignoredByGit) {
    hits += 1;
    console.log(`    ${holder.path}`);
  }
}

/* -------------------------------------------------------------- clean up */

for (const provider of PROVIDERS) {
  await visit('/api/settings/integrations', {
    method: 'POST',
    body: JSON.stringify({ provider, action: 'disconnect' }),
  });
}
await visit('/api/auth/sign-out', { method: 'POST', body: '{}' });

console.log('');
console.log(
  `leak scan: ${needles.length} values, ${corpora.length} corpora, ${hits} hit(s). The seeded credentials were disconnected and the session ended.`,
);
process.exit(hits === 0 ? 0 : 1);
