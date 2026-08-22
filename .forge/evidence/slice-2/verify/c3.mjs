import { chromium } from '/Users/lambertbouley/Claude/lbtbly-fitness-app/node_modules/playwright/index.mjs';
import { rmSync } from 'node:fs';
const OUT = '/private/tmp/claude-501/-Users-lambertbouley-Claude-lbtbly-fitness-app/b9d6a57d-5fec-4031-9628-8b7750465468/scratchpad/verify/shots';
const PROFILE = '/private/tmp/claude-501/-Users-lambertbouley-Claude-lbtbly-fitness-app/b9d6a57d-5fec-4031-9628-8b7750465468/scratchpad/verify/profile-c3';
const BASE = 'https://lamberts-mac-mini.tailda76d6.ts.net';
const line = console.log;
rmSync(PROFILE, { recursive: true, force: true });

// --- the worker script's own headers, straight off the wire
const sw = await fetch(`${BASE}/sw.js`);
line(`GET /sw.js -> ${sw.status}`);
line(`  cache-control: ${sw.headers.get('cache-control')}`);
line(`  content-type : ${sw.headers.get('content-type')}`);
line(`  service-worker-allowed: ${sw.headers.get('service-worker-allowed') ?? '(none, and none is needed at root)'}`);

const ctx = await chromium.launchPersistentContext(PROFILE, { channel: 'chrome', viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 });
const page = ctx.pages()[0] ?? await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror ' + e.message));

// --- cold: the profile has never seen this origin
await page.goto(`${BASE}/sign-in`, { waitUntil: 'networkidle' });
const reg = await page.evaluate(async () => {
  const r = await navigator.serviceWorker.ready;
  return { scope: r.scope, state: r.active?.state, controlled: Boolean(navigator.serviceWorker.controller) };
});
line('');
line(`worker scope     : ${reg.scope}`);
line(`worker state     : ${reg.state}`);
line(`page is controlled: ${reg.controlled}`);

// Wait until this page is actually controlled, then take the network away.
await page.reload({ waitUntil: 'networkidle' });
line(`after one reload, controlled: ${await page.evaluate(() => Boolean(navigator.serviceWorker.controller))}`);
line(`cached entries the install event put there: ${JSON.stringify(await page.evaluate(async () => {
  const names = await caches.keys();
  const c = await caches.open(names[0]);
  return (await c.keys()).map((r) => new URL(r.url).pathname);
}))}`);

await ctx.setOffline(true);
// And on the worker's own target, because offline is per target in Chromium.
for (const worker of ctx.serviceWorkers()) {
  try {
    const session = await ctx.newCDPSession(worker);
    await session.send('Network.enable');
    await session.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    line('the worker target itself was put offline over CDP');
  } catch (e) { line('CDP on the worker target: ' + e.message); }
}

// Prove the worker really cannot reach the origin: /healthz is passed straight through.
const health = await page.evaluate(async () => {
  try { const r = await fetch('/healthz', { cache: 'no-store' }); return `answered ${r.status}`; }
  catch (e) { return `threw: ${e.message}`; }
});
line(`with the network taken away, a page fetch of /healthz ${health}`);

// --- COLD ROUTE: this profile has never navigated to /train
line('');
line('=== navigating to /train, a route this profile has never visited');
await page.goto(`${BASE}/train`, { waitUntil: 'domcontentloaded' }).catch((e) => line('navigation threw: ' + e.message));
await page.waitForTimeout(800);
const body = await page.evaluate(() => document.body.innerText);
line(`document title: ${await page.title()}`);
line('what the screen says:');
for (const l of body.split('\n').filter(Boolean).slice(0, 14)) line('  ' + l);
line(`mentions a chunk load failure: ${/chunk/i.test(body)}`);
line(`is a browser error page   : ${/ERR_|This site can.t be reached|not available/i.test(body)}`);
const actions = await page.evaluate(() => [...document.querySelectorAll('button, a[href]')].map((e) => e.tagName.toLowerCase() + ': ' + e.innerText.trim()).filter((s) => s.split(': ')[1]));
line(`actions on the screen: ${JSON.stringify(actions)}`);
await page.screenshot({ path: `${OUT}/c3-offline-cold-train.png`, fullPage: true });

// --- a second cold route, and the root
for (const path of ['/eat', '/']) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(400);
  const t = await page.evaluate(() => document.body.innerText.split('\n').filter(Boolean)[1] ?? document.body.innerText.slice(0, 60));
  line(`${path.padEnd(8)} offline renders: ${JSON.stringify(t)}  chunk error: ${/chunk/i.test(await page.evaluate(() => document.body.innerText))}`);
}
await page.screenshot({ path: `${OUT}/c3-offline-cold-root.png`, fullPage: true });

line('');
line(`console errors during the offline flow: ${errors.length}`);
for (const e of errors.slice(0, 8)) line('  ' + e);
await ctx.setOffline(false);
await ctx.close();
