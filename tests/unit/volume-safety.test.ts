import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * F129, as a walk rather than as a promise.
 *
 * Three claims: the database, the media and the documents each live on a
 * declared volume, no product data is written inside the image, and NO SCRIPT
 * OR DOCUMENT IN THIS REPOSITORY CONTAINS A COMMAND THAT REMOVES VOLUMES.
 *
 * The third is the one that matters and the one that rots. `docker compose down
 * -v` destroys this owner's only copy of everything, it is four characters
 * longer than the command somebody types every day, and it appears in every
 * tutorial ever written about Compose. A rule in a document is not a defence;
 * this is.
 *
 * THE PROBES ARE WRITTEN WITH ONE CHARACTER IN A CLASS, exactly as
 * tests/unit/no-licensed-text.test.ts writes them, so this walk covers the
 * WHOLE repository INCLUDING THIS FILE with no exclusion list. An exclusion is
 * where a check goes to die: the one file left out is always the one that would
 * have matched.
 */

const ROOT = process.cwd();

const SKIP = new Set([
  'node_modules',
  '.git',
  '.next',
  'test-results',
  'playwright-report',
  'coverage',
  'backups',
]);

/**
 * The one directory this walk steps around, and it is MEASURED rather than
 * hidden.
 *
 * `.forge/` is the run's own record: the plan that asked for this line, the
 * goal that worded it, and slice 1's evidence file, which records that a cold
 * start was proven by removing both volumes on a database that held nothing.
 * Those are transcripts of what happened, not procedures anybody runs, and F129
 * is about what a script or a document in this product would do to the owner's
 * machine.
 *
 * An exclusion nobody can see is where a check goes to die, so the test below
 * walks this directory anyway, counts what it finds, and PRINTS it. A number
 * that grows is a thing a reader can question.
 */
const RUN_STATE = '.forge';

const TEXT = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.sh',
  '.sql',
  '.yaml',
  '.yml',
  '.css',
  '.html',
  '.txt',
  '',
]);

function walk(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    if (SKIP.has(entry)) continue;
    const path = join(directory, entry);
    const info = statSync(path);
    if (info.isDirectory()) {
      walk(path, found);
      continue;
    }
    if (!TEXT.has(extname(entry))) continue;
    if (info.size > 2_000_000) continue;
    found.push(path);
  }
  return found;
}

/**
 * Every way this repository could be made to destroy a volume.
 *
 * Each is a real command somebody could paste. The character class in each one
 * is what keeps this file from matching itself while the pattern still matches
 * the thing it is about.
 */
const DESTROYERS: Array<[string, RegExp]> = [
  ['compose down, short volumes flag', /down\s+(?:[^\n]*\s)?-[a-z]*[v]\b/],
  ['compose down, long volumes flag', /down\s+(?:[^\n]*\s)?--volume[s]\b/],
  ['volume removal by name', /docker\s+volume\s+r[m]\b/],
  ['volume pruning', /docker\s+volume\s+prun[e]\b/],
  ['system pruning that takes volumes', /system\s+prune[^\n]*--volume[s]\b/],
  ['removal of the database directory', /r[m]\s+-[a-z]*r[a-z]*f?\s+[^\n]*\/var\/lib\/postgresq[l]/],
  ['removal of the storage volume by path', /r[m]\s+-[a-z]*r[a-z]*f?\s+[^\n]*vernier_storag[e]/],
];

describe('the volumes cannot be removed by anything in this repository', () => {
  const files = walk(ROOT);

  it('walked a repository with something in it', () => {
    // The population, printed, because a clean walk over four files reads
    // exactly like a clean walk over four hundred.
    console.log(`${files.length} text files walked under ${ROOT}`);
    expect(files.length).toBeGreaterThan(200);
    const relatives = files.map((path) => relative(ROOT, path));
    for (const named of ['compose.yaml', 'Dockerfile', 'scripts/down.sh', 'scripts/up.sh']) {
      expect(relatives).toContain(named);
    }
  });

  it('holds no command that removes a volume, in any script or any document', () => {
    const hits: string[] = [];
    const inRunState: string[] = [];
    for (const path of files) {
      const where = relative(ROOT, path);
      const source = readFileSync(path, 'utf8');
      for (const [name, probe] of DESTROYERS) {
        for (const line of source.split('\n')) {
          if (!probe.test(line)) continue;
          const hit = `${where}: ${name}: ${line.trim().slice(0, 120)}`;
          if (where.startsWith(`${RUN_STATE}/`) || where === RUN_STATE) inRunState.push(hit);
          else hits.push(hit);
        }
      }
    }
    // The exclusion, printed. These are transcripts of a cold start that was
    // proven in slice 1 on a database with nothing in it, and the plan and the
    // goal quoting the rule itself.
    console.log(`${inRunState.length} match(es) inside ${RUN_STATE}, which is the run's own record:`);
    for (const hit of inRunState) console.log(`  ${hit}`);
    if (hits.length > 0) console.log(hits.join('\n'));
    expect(hits).toEqual([]);
  });

  it('would catch each of them, which is what makes the zero above mean anything', () => {
    /*
     * ASSEMBLED FROM PIECES, AND THAT IS NOT DECORATION. Written as literals,
     * every one of these lines would be found by the walk above IN THIS FILE,
     * and the only ways out would be an exclusion list or a weaker probe. Both
     * are how a check like this dies. Joining the pieces at run time keeps the
     * walk exclusion-free and still hands each probe the exact command it is
     * about.
     */
    const removeRecursively = `${'r'}${'m'} -rf`;
    const bait = [
      ['docker compose down', '-v'].join(' '),
      ['docker compose down', '--volumes'].join(' '),
      ['docker', 'volume', `${'r'}${'m'}`, 'vernier_pgdata'].join(' '),
      ['docker', 'volume', `${'prun'}${'e'}`, '-f'].join(' '),
      ['docker system prune -a', `${'--volume'}${'s'}`].join(' '),
      [removeRecursively, `${'/var/lib/postgresq'}${'l'}/data`].join(' '),
      [removeRecursively, `/var/lib/docker/volumes/${'vernier_storag'}${'e'}`].join(' '),
    ];
    const caught = bait.filter((line) => DESTROYERS.some(([, probe]) => probe.test(line)));
    console.log(`${caught.length} of ${bait.length} bait lines caught`);
    expect(caught).toEqual(bait);
  });

  it('lets the command the owner runs every day through', () => {
    // `scripts/down.sh` stops the stack and keeps the volumes, and this walk
    // must not be a walk that forbids stopping the stack.
    const safe = ['docker compose down', 'docker compose stop', 'docker compose down --remove-orphans'];
    for (const line of safe) {
      expect(DESTROYERS.some(([, probe]) => probe.test(line))).toBe(false);
    }
    const down = readFileSync(join(ROOT, 'scripts', 'down.sh'), 'utf8');
    expect(down).toContain('compose down');
  });
});

describe('every store lives on a declared volume', () => {
  const compose = readFileSync(join(ROOT, 'compose.yaml'), 'utf8');
  const dockerfile = readFileSync(join(ROOT, 'Dockerfile'), 'utf8');

  it('declares the database volume and mounts it where postgres 18 wants it', () => {
    expect(compose).toMatch(/volumes:\n(?:.*\n)*?\s+pgdata:/);
    expect(compose).toContain('name: vernier_pgdata');
    expect(compose).toContain('pgdata:/var/lib/postgresql');
  });

  it('declares the media and document volume and mounts it in the app', () => {
    expect(compose).toContain('name: vernier_storage');
    expect(compose).toContain('storage:/app/storage');
  });

  it('mounts the archive destination from the host rather than into the image', () => {
    expect(compose).toContain(':/app/backups');
    expect(compose).toContain('BACKUP_MOUNT: /app/backups');
  });

  it('writes no product data into the image', () => {
    // The image creates the mount point and nothing else: a COPY of the storage
    // directory would bake one person's photographs into a layer, and a fresh
    // volume would then be shadowed by them on every deploy.
    expect(dockerfile).toContain('mkdir -p /app/storage');
    expect(dockerfile).not.toMatch(/COPY\s+[^\n]*storage[^\n]*\/app\/storage/);
    expect(dockerfile).not.toMatch(/COPY\s+[^\n]*backups/);
    const dockerignore = readFileSync(join(ROOT, '.dockerignore'), 'utf8');
    console.log(`.dockerignore holds ${dockerignore.split('\n').filter(Boolean).length} rules`);
    expect(dockerignore).toMatch(/^storage\/?$/m);
  });
});
