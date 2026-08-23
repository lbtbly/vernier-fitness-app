import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * F65's recognition half, and the reason it could not happen on the shipped
 * product.
 *
 * `next build` traces the imports it can read and the runner stage copies
 * `.next/standalone`, which carries the pruned `node_modules` that trace built.
 * src/lib/lab-ocr.ts reaches `@napi-rs/canvas` and `tesseract.js` through an
 * `import()` whose specifier is a variable, deliberately, so a document with a
 * text layer loads no WASM and no native binary. A trace cannot follow a
 * variable. Neither package entered the image: `docker exec vernier-app-1 ls
 * /app/node_modules` found no tesseract and no @napi-rs, every scanned page was
 * refused by name, and `lab_document` in ocr mode stayed at zero. The refusal
 * was honest. Honest is not the same as installed.
 *
 * These are static assertions on purpose. Building the image takes minutes and
 * needs a Docker daemon; what actually broke was three lines of Dockerfile and a
 * pair of module specifiers, and all four are readable from here in
 * milliseconds. The image itself is proven on merge, by rebuilding and listing
 * /app/node_modules inside the container.
 */

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const dockerfile = readFileSync(`${projectRoot}Dockerfile`, 'utf8');
const labOcr = readFileSync(`${projectRoot}src/lib/lab-ocr.ts`, 'utf8');
const dockerignore = readFileSync(`${projectRoot}.dockerignore`, 'utf8');

describe('the optional recogniser reaches the image', () => {
  it('resolves a closure that really is installed, and prints it', () => {
    // WHAT WOULD MAKE THIS RED: either package uninstalled, or an install made
    // for another architecture, where @napi-rs/canvas resolves none of its
    // eleven platform binaries. Both are states the build would otherwise carry
    // into an image that cannot recognise anything.
    const report = execFileSync(process.execPath, ['scripts/ocr-closure.mjs'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });
    console.log(report.trim());
    const packages = report
      .split('\n')
      .filter((line) => line.startsWith('  '))
      .map((line) => line.trim());
    // The population, not a boolean. Fifteen packages on this machine, and the
    // three that matter are named rather than counted.
    expect(packages.length).toBeGreaterThanOrEqual(10);
    expect(packages).toContain('tesseract.js');
    expect(packages).toContain('tesseract.js-core');
    expect(packages).toContain('@napi-rs/canvas');
    // A native binary for the platform this ran on. The name differs per
    // platform, which is exactly why the closure is computed and not listed.
    expect(packages.some((name) => name.startsWith('@napi-rs/canvas-'))).toBe(true);
  });

  it('copies that closure into the runner stage', () => {
    // WHAT WOULD MAKE THIS RED: deleting the COPY line, which is the state the
    // image shipped in for the whole of slice 7 and slice 8. The stage has to
    // exist, it has to run the closure script, and the runner has to merge the
    // result into the node_modules the standalone output brought with it.
    expect(dockerfile).toMatch(/FROM \$\{NODE_IMAGE\} AS ocr/);
    expect(dockerfile).toMatch(/RUN node scripts\/ocr-closure\.mjs --copy \/opt\/ocr-modules/);
    expect(dockerfile).toMatch(/COPY --from=ocr [^\n]*\/opt\/ocr-modules \.\/node_modules/);
    // And the runner still copies the traced standalone, so the merge has
    // something to merge into rather than replacing it.
    expect(dockerfile).toContain('/app/.next/standalone ./');
  });

  it('leaves the ocr stage able to read the two files it needs', () => {
    // The stage copies the closure script and the file it reads its roots from.
    // A .dockerignore line excluding either directory would make the stage fail
    // at build time, which is loud, but naming it here says why they are not
    // ignored on purpose.
    expect(dockerfile).toContain('COPY scripts/ocr-closure.mjs ./scripts/ocr-closure.mjs');
    expect(dockerfile).toContain('COPY src/lib/lab-ocr.ts ./src/lib/lab-ocr.ts');
    const ignored = dockerignore
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#'));
    expect(ignored).not.toContain('scripts');
    expect(ignored).not.toContain('src');
  });

  it('keeps the runtime import in the shape the closure script reads', () => {
    // WHAT WOULD MAKE THIS RED: rewriting lab-ocr.ts to import the two packages
    // some other way. The closure would then be computed from a stale pair, and
    // the image would carry the wrong thing while every check stayed green.
    const specifiers = [...labOcr.matchAll(/const \w*[Mm]odule\s*=\s*'([^']+)'/g)].map(
      (match) => match[1],
    );
    console.log(`ocr-image: lab-ocr.ts names ${specifiers.join(', ')}`);
    expect(specifiers).toContain('@napi-rs/canvas');
    expect(specifiers).toContain('tesseract.js');
    // And it still reaches them through import() rather than a top-level import,
    // which is what keeps a text-layer document from loading any of it.
    expect(labOcr).not.toMatch(/^import .*'tesseract\.js'/m);
    expect(labOcr).not.toMatch(/^import .*'@napi-rs\/canvas'/m);
  });

  it('names where the language data comes from, and never downloads it', () => {
    // F65's other half. tesseract.js fetches language data from a CDN by
    // default; this product reads it off the storage volume and refuses when it
    // is absent. It would go red if caching or the default langPath came back,
    // which is how a health product starts reaching the internet while reading a
    // medical document.
    expect(labOcr).toContain("cacheMethod: 'none'");
    expect(labOcr).toContain('langPath: tessdataDirectory()');
    expect(labOcr).toContain('gzip: false');
    expect(labOcr).toContain("reason: 'language_data_absent'");
    const fetcher = readFileSync(`${projectRoot}scripts/fetch-tessdata.sh`, 'utf8');
    expect(fetcher).toContain('tessdata_fast');
    expect(fetcher).toContain('EXPECT_BYTES=1130365');
  });
});
