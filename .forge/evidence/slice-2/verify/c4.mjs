import { webkit, chromium } from '/Users/lambertbouley/Claude/lbtbly-fitness-app/node_modules/playwright/index.mjs';
const OUT = '/private/tmp/claude-501/-Users-lambertbouley-Claude-lbtbly-fitness-app/b9d6a57d-5fec-4031-9628-8b7750465468/scratchpad/verify/shots';
const BASE = 'https://lamberts-mac-mini.tailda76d6.ts.net';
const SCRATCH = 'http://127.0.0.1:3101';
const VIEWPORTS = [[393, 852], [768, 1024], [1280, 900]];
const line = console.log;

const errors = [];
function watch(page, tag) {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${tag}: pageerror ${e.message}`));
}

const browser = await webkit.launch();

// ---- the three viewports, default state
for (const [w, h] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  watch(page, `webkit ${w}`);
  await page.goto(`${BASE}/sign-in`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${OUT}/c4-default-${w}.png`, fullPage: true });
  const scrollX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  line(`default ${w}x${h}: horizontal overflow ${scrollX}px`);
  // password second
  await page.getByRole('button', { name: 'Use the backup password' }).click();
  await page.screenshot({ path: `${OUT}/c4-password-${w}.png`, fullPage: true });
  await ctx.close();
}

// ---- the host-unreachable state at 393
{
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  watch(page, 'webkit unreachable');
  await page.goto(`${BASE}/sign-in`, { waitUntil: 'networkidle' });
  await page.route('**/api/**', (r) => r.abort('failed'));
  await page.getByRole('button', { name: 'Sign in with passkey' }).click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/c4-unreachable-393.png`, fullPage: true });
  const text = await page.locator('.banner').first().innerText().catch(() => 'no banner');
  line(`host unreachable banner: ${JSON.stringify(text)}`);
  const retry = await page.getByRole('button', { name: 'Try again' }).count();
  line(`a Try again button is offered: ${retry === 1}`);
  await ctx.close();
}

// ---- the one-time owner creation, on the scratch instance which has no owner
{
  for (const [w, h] of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    watch(page, `webkit create ${w}`);
    const r = await page.goto(`${SCRATCH}/sign-in`, { waitUntil: 'networkidle' });
    line(`scratch /sign-in ${w} -> ${r.status()}`);
    await page.screenshot({ path: `${OUT}/c4-create-${w}.png`, fullPage: true });
    if (w === 393) {
      await page.locator('input[name="new-password"]').fill('A-good-long-one-42!');
      await page.locator('input[name="repeat-password"]').fill('A-good-long-one-42!');
      await page.screenshot({ path: `${OUT}/c4-create-filled-393.png`, fullPage: true });
    }
    await ctx.close();
  }
}

// ---- keyboard traversal, WebKit, every state
async function traverse(ctxFactory, label, prep) {
  const ctx = await ctxFactory();
  const page = await ctx.newPage();
  watch(page, label);
  await page.goto(`${BASE}/sign-in`, { waitUntil: 'networkidle' });
  if (prep) await prep(page);
  const names = await page.evaluate(() =>
    [...document.querySelectorAll('a[href], button, input, select, [tabindex]')]
      .filter((e) => !e.closest('.visually-hidden'))
      .map((e) => `${e.tagName.toLowerCase()}.${e.className || 'plain'}`));
  const seen = [];
  for (let i = 0; i < names.length + 3; i += 1) {
    await page.keyboard.press('Tab');
    const f = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const s = getComputedStyle(el);
      return { el: `${el.tagName.toLowerCase()}.${el.className || 'plain'}`,
               outline: `${s.outlineWidth} ${s.outlineStyle} ${s.outlineColor}`, offset: s.outlineOffset,
               visible: s.outlineStyle !== 'none' && s.outlineWidth !== '0px' };
    });
    if (f && !seen.some((x) => x.el === f.el)) seen.push(f);
  }
  line(`${label}: ${seen.length} stops of ${names.length} interactive elements [${names.join(', ')}]`);
  for (const s of seen) line(`   ${s.el}  ${s.outline} offset ${s.offset}  visible=${s.visible}`);
  await page.screenshot({ path: `${OUT}/c4-traversal-${label.replace(/\W+/g, '-')}.png`, fullPage: true });
  await ctx.close();
}

const wkCtx = () => browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 });
await traverse(wkCtx, 'webkit passkey mode');
await traverse(wkCtx, 'webkit password mode', async (p) => { await p.getByRole('button', { name: 'Use the backup password' }).click(); });
await browser.close();

const chrome = await chromium.launch({ channel: 'chrome' });
const crCtx = () => chrome.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 });
await traverse(crCtx, 'chrome passkey mode');
await traverse(crCtx, 'chrome password mode', async (p) => { await p.getByRole('button', { name: 'Use the backup password' }).click(); });
await chrome.close();

line('');
line(`console errors across every capture: ${errors.length}`);
for (const e of errors) line('  ' + e);
