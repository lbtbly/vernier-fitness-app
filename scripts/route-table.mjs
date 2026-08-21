#!/usr/bin/env node
// Walks every route this app serves and asks each one, with no session, what it
// answers. One line per route.
//
//   node scripts/route-table.mjs [base-url]
//
// The list is not hand written. It is read off src/app, the way Next reads it,
// so a route added tomorrow and forgotten is in this table on the next run. The
// classification comes from src/lib/routes.ts, the same module the middleware
// uses, so the list the gate enforces and the list this grades cannot drift.
//
// F14. Exit code 1 if any route answers something it should not.
import { readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');
const appDir = join(projectRoot, 'src', 'app');

const { classifyRoute, isApiRoute } = await import(
  join(projectRoot, 'src', 'lib', 'routes.ts')
);

const baseUrl = (process.argv[2] || process.env.APP_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');

/** Every page and route handler under src/app, as the URL path it serves. */
async function enumerateRoutes(dir = appDir, segments = []) {
  const found = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      // (shell) and friends are grouping only: they name no URL segment.
      const next = entry.name.startsWith('(') && entry.name.endsWith(')')
        ? segments
        : [...segments, entry.name];
      found.push(...(await enumerateRoutes(join(dir, entry.name), next)));
      continue;
    }
    if (entry.name === 'page.tsx' || entry.name === 'page.ts') {
      found.push({ path: '/' + segments.join('/'), kind: 'page', file: join(dir, entry.name) });
    }
    if (entry.name === 'route.ts' || entry.name === 'route.tsx') {
      found.push({ path: '/' + segments.join('/'), kind: 'route', file: join(dir, entry.name) });
    }
  }
  return found;
}

/** Which verbs a route handler exports, so a POST-only endpoint is not asked with GET. */
async function methodsOf(route) {
  if (route.kind === 'page') return ['GET'];
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(route.file, 'utf8');
  const verbs = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].filter((verb) =>
    new RegExp(`export\\s+(async\\s+)?function\\s+${verb}\\b`).test(source),
  );
  return verbs.length > 0 ? verbs : ['GET'];
}

const REFUSALS = new Set([400, 401, 403, 405, 409, 422, 429]);

function verdictFor(routeClass, status, location, setCookie) {
  const redirectedToSignIn = status >= 300 && status < 400 && (location || '').includes('/sign-in');
  const issuedSession = (setCookie || '').includes('vernier_session=') &&
    !(setCookie || '').includes('vernier_session=;');

  if (routeClass === 'public') {
    if (status === 401 || redirectedToSignIn) return ['FAIL', 'a public route asked for a session'];
    return ['open', 'answers without a session, as it must'];
  }

  if (routeClass === 'gate') {
    if (issuedSession) return ['FAIL', 'the gate handed out a session with no credential'];
    if (REFUSALS.has(status)) return ['refused', 'refuses an unauthenticated request'];
    return ['FAIL', `expected a refusal, got ${status}`];
  }

  if (status === 401) return ['refused', '401 with no session'];
  if (redirectedToSignIn) return ['refused', `redirected to sign-in (${status})`];
  return ['FAIL', `expected 401 or a redirect to sign-in, got ${status}`];
}

const routes = (await enumerateRoutes()).sort((a, b) => a.path.localeCompare(b.path));
let failures = 0;
let checked = 0;

console.log(`route table against ${baseUrl}, ${routes.length} routes on disk`);
console.log('');

for (const route of routes) {
  const routeClass = classifyRoute(route.path);
  for (const method of await methodsOf(route)) {
    let status = 0;
    let location = '';
    let setCookie = '';
    try {
      const response = await fetch(`${baseUrl}${route.path}`, {
        method,
        redirect: 'manual',
        headers: method === 'GET' ? {} : { 'Content-Type': 'application/json' },
        body: method === 'GET' ? undefined : '{}',
      });
      status = response.status;
      location = response.headers.get('location') || '';
      setCookie = response.headers.get('set-cookie') || '';
    } catch (error) {
      console.log(`${method.padEnd(4)} ${route.path.padEnd(44)} ${routeClass.padEnd(9)} ---  FAIL  ${error.message}`);
      failures += 1;
      continue;
    }

    const [verdict, why] = verdictFor(routeClass, status, location, setCookie);
    if (verdict === 'FAIL') failures += 1;
    checked += 1;
    console.log(
      `${method.padEnd(4)} ${route.path.padEnd(44)} ${routeClass.padEnd(9)} ${String(status).padEnd(4)} ${verdict.padEnd(8)} ${why}`,
    );
  }
}

// The static shell: bytes served straight out of public/, named here so the
// table covers everything the app answers and not only what src/app declares.
async function enumerateStatic(dir = join(projectRoot, 'public'), prefix = '') {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      found.push(...(await enumerateStatic(join(dir, entry.name), `${prefix}/${entry.name}`)));
    } else {
      found.push(`${prefix}/${entry.name}`);
    }
  }
  return found;
}

console.log('');
for (const path of (await enumerateStatic()).sort()) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: 'manual' });
  const open = response.status === 200;
  if (!open) failures += 1;
  checked += 1;
  console.log(
    `GET  ${path.padEnd(44)} ${'shell'.padEnd(9)} ${String(response.status).padEnd(4)} ${(open ? 'open' : 'FAIL').padEnd(8)} static shell`,
  );
}

console.log('');
console.log(
  `${checked} requests, ${failures} failing. Public routes answer, gate routes refuse, everything else needs a session.`,
);
if (!isApiRoute('/api/auth/password')) {
  console.log('route table: the classifier disagrees with itself, which should be impossible');
  process.exit(1);
}
process.exit(failures === 0 ? 0 : 1);
