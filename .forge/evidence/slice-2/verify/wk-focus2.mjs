import { webkit } from '/Users/lambertbouley/Claude/lbtbly-fitness-app/node_modules/playwright/index.mjs';
const OUT = '/private/tmp/claude-501/-Users-lambertbouley-Claude-lbtbly-fitness-app/b9d6a57d-5fec-4031-9628-8b7750465468/scratchpad/verify/shots';
const b = await webkit.launch();
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto('https://lamberts-mac-mini.tailda76d6.ts.net/sign-in', { waitUntil: 'networkidle' });
// Reach password mode with the keyboard alone: focus the quiet button and press Enter.
await page.evaluate(() => document.querySelectorAll('button.btn')[1].focus());
await page.keyboard.press('Enter');
await page.waitForSelector('input.input');
await page.keyboard.press('Tab'); // the last interaction is now a key
const r = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('button, input')) {
    if (el.closest('.visually-hidden')) continue;
    el.focus();
    const s = getComputedStyle(el);
    out.push(`${(el.tagName.toLowerCase()+'.'+(el.className||'plain')).padEnd(28)} :focus-visible=${String(el.matches(':focus-visible')).padEnd(5)} ${s.outlineWidth} ${s.outlineStyle} ${s.outlineColor} offset ${s.outlineOffset}`);
  }
  return out;
});
console.log('WebKit, password mode reached by keyboard:');
for (const x of r) console.log('  ' + x);
await page.evaluate(() => document.querySelector('button.btn.primary').focus());
await page.screenshot({ path: `${OUT}/c4-webkit-focus-password-keyboard-393.png` });
await b.close();
