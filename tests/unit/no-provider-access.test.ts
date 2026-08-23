import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

/**
 * No stored credential, no crawler, no scheduled fetch. F91, and R3's evidence.
 *
 * THE ZERO IS PRINTED BESIDE THE POPULATION IT COVERED, every time. A search
 * that returns nothing over a file list that is empty reads exactly like a
 * search that returns nothing over the whole repository, and the first one
 * proves nothing at all. So every block below prints how many files it read and
 * fails if that number is implausibly small.
 *
 * WHAT WOULD MAKE THESE GO RED. A `fetch(` in the recipe-box parser or in the
 * route above it. A credential column, an environment variable or a settings
 * field naming either provider. A `node-cron` schedule mentioning either. A
 * takeaway URL that stopped being a search page. Each is one line away from
 * being written by somebody who has not read the terms, which is exactly why
 * this is a test and not a paragraph.
 */

const root = fileURLToPath(new URL('../../', import.meta.url));

const TREES = ['src', 'scripts', 'drizzle'];

const READABLE = ['.ts', '.tsx', '.mjs', '.js', '.sql', '.json', '.css'];

/** The provider hostnames, as they appear in a URL. */
const RECIPE_BOX_HOSTS = ['hellofresh.com', 'hellofresh.fr', 'hellofresh.de', 'hellofresh.co.uk'];
const TAKEAWAY_HOSTS = ['ubereats.com', 'uber.com'];

function walk(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'meta') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...walk(path));
    else if (READABLE.some((extension) => path.endsWith(extension))) found.push(path);
  }
  return found;
}

function repository(): Array<[string, string]> {
  const files: Array<[string, string]> = [];
  for (const tree of TREES) {
    for (const path of walk(join(root, tree))) {
      files.push([path.slice(root.length), readFileSync(path, 'utf8')]);
    }
  }
  return files;
}

/** A line with the comment markers taken off, so prose is not read as code. */
function codeLines(source: string): string[] {
  let inBlock = false;
  const lines: string[] = [];
  for (const raw of source.split('\n')) {
    const line = raw.trim();
    if (inBlock) {
      if (line.includes('*/')) inBlock = false;
      continue;
    }
    if (line.startsWith('/*')) {
      if (!line.includes('*/')) inBlock = true;
      continue;
    }
    if (line.startsWith('//') || line.startsWith('*') || line.startsWith('--')) continue;
    lines.push(raw);
  }
  return lines;
}

describe('the repository holds no access to either provider', () => {
  test('no recipe-box hostname appears in any executable line', () => {
    const files = repository();
    expect(files.length).toBeGreaterThan(150);

    const hits: string[] = [];
    for (const [path, source] of files) {
      for (const [index, line] of codeLines(source).entries()) {
        for (const host of RECIPE_BOX_HOSTS) {
          if (line.toLowerCase().includes(host)) hits.push(`${path}:${index + 1} ${host}`);
        }
      }
    }
    console.log(
      `recipe box: ${hits.length} hostname reference(s) in code across ${files.length} files walked`,
    );
    expect(hits).toEqual([]);
  });

  test('the takeaway hostname appears only as a search URL, and it does appear', () => {
    const files = repository();
    const hits: string[] = [];
    for (const [path, source] of files) {
      for (const [index, line] of codeLines(source).entries()) {
        for (const host of TAKEAWAY_HOSTS) {
          if (line.toLowerCase().includes(host)) hits.push(`${path}:${index + 1} ${line.trim()}`);
        }
      }
    }
    console.log(`takeaway: ${hits.length} reference(s) across ${files.length} files walked`);

    // It MUST appear, or this test would be passing over a build with no
    // takeaway link at all, which is the shape of a check that passes by not
    // checking. Every appearance is the search base or the constraint that
    // refuses anything else.
    expect(hits.length).toBeGreaterThan(0);
    for (const hit of hits) {
      expect(hit).toMatch(/ubereats\.com\/search/);
    }
  });

  test('no credential, setting or environment variable names either provider', () => {
    const files = repository();
    const credentialWords = ['credential', 'apikey', 'api_key', 'token', 'password', 'secret', 'cookie'];
    const hits: string[] = [];
    for (const [path, source] of files) {
      for (const [index, line] of codeLines(source).entries()) {
        const lower = line.toLowerCase();
        const namesProvider = [...RECIPE_BOX_HOSTS, ...TAKEAWAY_HOSTS, 'hellofresh', 'ubereats'].some(
          (word) => lower.includes(word),
        );
        if (!namesProvider) continue;
        if (credentialWords.some((word) => lower.includes(word))) {
          hits.push(`${path}:${index + 1} ${line.trim()}`);
        }
      }
    }
    console.log(`provider credentials: ${hits.length} across ${files.length} files walked`);
    expect(hits).toEqual([]);
  });

  test('no scheduled job names either provider, and the scheduler population is printed', () => {
    const files = repository();
    const scheduled = files.filter(
      ([, source]) => source.includes('node-cron') || source.includes('cron.schedule'),
    );
    console.log(
      `schedulers: ${scheduled.length} file(s) reference a scheduler, out of ${files.length} walked: ` +
        `${scheduled.map(([path]) => path).join(', ') || 'none'}`,
    );
    for (const [path, source] of scheduled) {
      for (const word of ['hellofresh', 'ubereats']) {
        expect(`${path}:${source.toLowerCase().includes(word)}`).toBe(`${path}:false`);
      }
    }
  });

  test('the recipe-box parser opens no socket, and neither does the route above it', () => {
    const parser = readFileSync(join(root, 'src/lib/recipe-box.ts'), 'utf8');
    const route = readFileSync(join(root, 'src/app/api/meals/box/route.ts'), 'utf8');

    for (const [name, source] of [
      ['src/lib/recipe-box.ts', parser],
      ['src/app/api/meals/box/route.ts', route],
    ] as const) {
      const lines = codeLines(source);
      expect(lines.length).toBeGreaterThan(20);
      for (const line of lines) {
        expect(`${name}: ${line.includes('fetch(')}`).toBe(`${name}: false`);
        expect(`${name}: ${line.includes('http.request')}`).toBe(`${name}: false`);
      }
    }
  });
});
