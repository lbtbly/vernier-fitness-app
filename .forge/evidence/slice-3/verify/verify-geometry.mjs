import { webkit } from '/Users/lambertbouley/Claude/lbtbly-fitness-app/node_modules/playwright/index.mjs';
import { execFileSync } from 'node:child_process';
const root = '/Users/lambertbouley/Claude/lbtbly-fitness-app';
const base = 'https://lamberts-mac-mini.tailda76d6.ts.net';
const link = execFileSync('bash', ['scripts/recovery.sh', 'link', '20'], { cwd: root, encoding: 'utf8' })
  .split('\n').filter(l => l.startsWith('https://')).at(-1).trim();

const browser = await webkit.launch();
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3 });
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(`${page.url()} :: ${m.text()}`); });
page.on('pageerror', e => errors.push(`${page.url()} :: pageerror ${e.message}`));
await page.goto(link);
await page.waitForLoadState('networkidle');

for (const path of ['/', '/health', '/train', '/eat', '/settings']) {
  await page.goto(base + path);
  await page.waitForLoadState('networkidle');
  const rows = await page.$$eval('.btn', els => els.map(el => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return { cls: el.className, label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0,40),
             minHeight: cs.minHeight, fontSize: cs.fontSize, h: Math.round(r.height), w: Math.round(r.width) };
  }));
  console.log(`--- ${path} : ${rows.length} .btn ---`);
  for (const r of rows) console.log(`  ${r.minHeight}\t${r.fontSize}\th=${r.h} w=${r.w}\t[${r.cls}]\t${r.label}`);
}

// quick log sheet
await page.goto(base + '/');
await page.waitForLoadState('networkidle');
await page.getByRole('button', { name: 'Quick log' }).click();
await page.waitForSelector('.sheet');
await page.waitForTimeout(1200);
const sheetRows = await page.$$eval('.sheet button, .sheet [role=button]', els => els.map(el => {
  const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
  return { cls: el.className, label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0,40),
           minHeight: cs.minHeight, fontSize: cs.fontSize, h: Math.round(r.height), w: Math.round(r.width) };
}));
console.log(`--- quick log sheet : ${sheetRows.length} controls ---`);
const under44 = [];
for (const r of sheetRows) { console.log(`  ${r.minHeight}\t${r.fontSize}\th=${r.h} w=${r.w}\t[${r.cls}]\t${r.label}`); if (r.h < 44) under44.push(r); }
console.log('controls under 44 px high:', JSON.stringify(under44));

console.log('CONSOLE ERRORS:', errors.length);
for (const e of errors) console.log('  ', e);
await browser.close();
