import { execFileSync } from 'node:child_process';
import { webkit, chromium } from '/Users/lambertbouley/Claude/lbtbly-fitness-app/node_modules/playwright/index.mjs';
const ROOT = '/Users/lambertbouley/Claude/lbtbly-fitness-app';
const BASE = 'https://lamberts-mac-mini.tailda76d6.ts.net';
const line = console.log;
const sh = (...a) => execFileSync('bash', ['scripts/recovery.sh', ...a], { cwd: ROOT, encoding: 'utf8' }).trim();

for (const [name, engine] of [['webkit', webkit], ['chrome', chromium]]) {
  const b = await engine.launch(name === 'chrome' ? { channel: 'chrome' } : {});
  const ctx = await b.newContext({ viewport: { width: 393, height: 852 } });
  const page = await ctx.newPage();
  const errs = [], failed = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  page.on('requestfailed', (r) => failed.push(`${r.url().replace(BASE, '')} ${r.failure()?.errorText}`));

  // the gate alone
  await page.goto(`${BASE}/sign-in`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  line(`${name}: on /sign-in alone -> ${errs.length} console errors, ${failed.length} failed requests`);
  errs.length = 0; failed.length = 0;

  // signed in, tapping every tab the way the owner does
  await page.goto(sh('link', '10').split('\n').at(-1).trim());
  await page.waitForSelector('h1');
  await page.waitForTimeout(1500);
  for (const label of ['Health', 'Train', 'Eat', 'Settings', 'Today']) {
    await page.getByRole('link', { name: label }).click();
    await page.waitForTimeout(900);
  }
  line(`${name}: signing in and tapping all five tabs -> ${errs.length} console errors, ${failed.length} failed requests`);
  for (const e of [...new Set(errs)].slice(0, 6)) line(`    ${e}`);
  for (const f of [...new Set(failed)].slice(0, 6)) line(`    failed: ${f}`);
  await b.close();
}
