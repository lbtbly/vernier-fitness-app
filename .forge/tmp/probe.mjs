import { webkit } from '@playwright/test';
const BASE = process.env.APP_URL ?? 'https://lamberts-mac-mini.tailda76d6.ts.net';
const browser = await webkit.launch();
const ctx = await browser.newContext({ baseURL: BASE, serviceWorkers: 'block' });
const page = await ctx.newPage();
const failures = [];
page.on('requestfailed', (r) => failures.push([r.url(), r.failure()?.errorText]));
await page.goto('/sign-in');
for (const reason of ['aborted', 'connectionfailed', 'namenotresolved', 'timedout', 'connectionrefused', 'internetdisconnected', 'failed']) {
  await page.route('**/api/log', (route) => route.abort(reason));
  const message = await page.evaluate(async () => {
    try { await fetch('/api/log', { headers: { accept: 'application/json' } }); return null; }
    catch (e) { return String(e && e.message ? e.message : e); }
  });
  await page.unroute('**/api/log');
  console.log(reason, '| in-page:', JSON.stringify(message), '| failures:', JSON.stringify(failures.splice(0)));
}
await browser.close();
