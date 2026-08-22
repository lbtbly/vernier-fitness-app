import { webkit } from '/Users/lambertbouley/Claude/lbtbly-fitness-app/node_modules/playwright/index.mjs';
const OUT = '/private/tmp/claude-501/-Users-lambertbouley-Claude-lbtbly-fitness-app/b9d6a57d-5fec-4031-9628-8b7750465468/scratchpad/verify/shots';
const BASE = 'https://lamberts-mac-mini.tailda76d6.ts.net';
const b = await webkit.launch();
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(`${BASE}/sign-in`, { waitUntil: 'networkidle' });

// Focus each interactive element the way a keyboard would: focus(), then ask
// the engine whether it matches :focus-visible and what outline it computes.
const report = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('button, input, a[href]')) {
    if (el.closest('.visually-hidden')) continue;
    el.focus();
    const s = getComputedStyle(el);
    out.push({
      el: `${el.tagName.toLowerCase()}.${el.className || 'plain'}`,
      focusVisible: el.matches(':focus-visible'),
      outline: `${s.outlineWidth} ${s.outlineStyle} ${s.outlineColor}`,
      offset: s.outlineOffset,
    });
  }
  return out;
});
console.log('WebKit, focus applied to each element in turn:');
for (const r of report) console.log(`  ${r.el.padEnd(28)} :focus-visible=${String(r.focusVisible).padEnd(5)} ${r.outline} offset ${r.offset}`);

// And a capture of the primary button focused, in WebKit.
await page.evaluate(() => document.querySelector('button.btn.primary')?.focus());
await page.screenshot({ path: `${OUT}/c4-webkit-focus-primary-393.png` });

await page.getByRole('button', { name: 'Use the backup password' }).click();
const pw = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('button, input')) {
    if (el.closest('.visually-hidden')) continue;
    el.focus();
    const s = getComputedStyle(el);
    out.push({ el: `${el.tagName.toLowerCase()}.${el.className || 'plain'}`, focusVisible: el.matches(':focus-visible'), outline: `${s.outlineWidth} ${s.outlineStyle} ${s.outlineColor}`, offset: s.outlineOffset });
  }
  return out;
});
console.log('WebKit, password mode:');
for (const r of pw) console.log(`  ${r.el.padEnd(28)} :focus-visible=${String(r.focusVisible).padEnd(5)} ${r.outline} offset ${r.offset}`);
await page.evaluate(() => document.querySelector('button.btn.primary')?.focus());
await page.screenshot({ path: `${OUT}/c4-webkit-focus-password-393.png` });
await b.close();
