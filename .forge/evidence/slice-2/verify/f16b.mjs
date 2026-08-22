import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { webkit } from '/Users/lambertbouley/Claude/lbtbly-fitness-app/node_modules/playwright/index.mjs';
import { client, q } from './probe.mjs';
const ROOT = '/Users/lambertbouley/Claude/lbtbly-fitness-app';
const OUT = '/private/tmp/claude-501/-Users-lambertbouley-Claude-lbtbly-fitness-app/b9d6a57d-5fec-4031-9628-8b7750465468/scratchpad/verify/shots';
const line = console.log;
const sh = (...a) => execFileSync('bash', ['scripts/recovery.sh', ...a], { cwd: ROOT, encoding: 'utf8' }).trim();
const masterKey = execFileSync('docker', ['compose', 'exec', '-T', 'app', 'printenv', 'MASTER_KEY'], { cwd: ROOT, encoding: 'utf8' }).trim();

const canary = 'CANARY' + randomBytes(16).toString('hex');
const link = sh('link', '5').split('\n').at(-1).trim();

const b = await webkit.launch();
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, serviceWorkers: 'block' });
const page = await ctx.newPage();
const bodies = [];
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('response', async (r) => { try { bodies.push(`${r.url()}\n${await r.text()}`); } catch {} });

await page.goto(link);
await page.waitForSelector('h1');
line(`the recovery link landed on ${page.url()}`);

// Seed a credential through the settings screen's own API, from inside the page,
// with the token the page holds.
const seed = await page.evaluate(async ([secret]) => {
  const meta = document.querySelector('meta[name="csrf"]')?.content;
  const r = await fetch('/api/settings/integrations', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-vernier-csrf': window.__vernierCsrf ?? meta ?? '' },
    body: JSON.stringify({ provider: 'withings', action: 'save', secret }),
  });
  return r.status;
}, [canary]);
line(`seeding from inside the page, using whatever token a script can find -> ${seed}`);
line(`document.cookie visible to a script: ${JSON.stringify(await page.evaluate(() => document.cookie))}`);

// Seed it properly, from the host, so the screen has something to render.
const cookies = await ctx.cookies();
const c = client();
for (const k of cookies) c.jar.set(k.name, k.value);
const saved = await c.post('/api/settings/integrations', { provider: 'withings', action: 'save', secret: canary, scope: 'user.metrics' });
line(`seeded from the host with the session this browser holds -> ${saved.status}`);

await page.goto('https://lamberts-mac-mini.tailda76d6.ts.net/settings', { waitUntil: 'networkidle' });
await page.screenshot({ path: `${OUT}/f15-settings-393.png`, fullPage: true });

const inPage = await page.evaluate(([secret, key]) => {
  const html = document.documentElement.outerHTML;
  const store = (s) => { try { return JSON.stringify(Object.entries(s)); } catch { return ''; } };
  const all = [html, document.cookie, store(localStorage), store(sessionStorage), JSON.stringify(performance.getEntriesByType('resource').map(e => e.name))].join('\n');
  return {
    credentialInPage: all.includes(secret),
    masterKeyInPage: all.includes(key),
    cookieVisible: document.cookie,
    localStorageKeys: Object.keys(localStorage),
  };
}, [canary, masterKey]);
line('');
line('=== F16, from a real WebKit browser holding a live owner session');
line(`the credential appears anywhere the page can read: ${inPage.credentialInPage}`);
line(`the master key appears anywhere the page can read : ${inPage.masterKeyInPage}`);
line(`document.cookie as a script sees it: ${JSON.stringify(inPage.cookieVisible)}`);
line(`localStorage keys: ${JSON.stringify(inPage.localStorageKeys)}`);
const corpus = bodies.join('\n');
line(`${bodies.length} response bodies captured; the credential appears in them: ${corpus.includes(canary)}; the master key: ${corpus.includes(masterKey)}`);
line(`console errors on this flow: ${consoleErrors.length} ${consoleErrors.join(' | ')}`);

// What the screen actually renders for Withings.
const card = await page.locator('text=Withings').first().locator('xpath=ancestor::*[contains(@class,"card")][1]').innerText().catch(() => '(no card)');
line('');
line('what the settings screen renders for Withings:');
for (const l of card.split('\n')) line('  ' + l);

await c.post('/api/settings/integrations', { provider: 'withings', action: 'disconnect' });
line('');
line(`integration_credential rows after the cleanup: ${q('select count(*) from integration_credential')}`);
await b.close();
