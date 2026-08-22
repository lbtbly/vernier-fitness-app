import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { webkit } from '/Users/lambertbouley/Claude/lbtbly-fitness-app/node_modules/playwright/index.mjs';
const ROOT = '/Users/lambertbouley/Claude/lbtbly-fitness-app';
const OUT = '/private/tmp/claude-501/-Users-lambertbouley-Claude-lbtbly-fitness-app/b9d6a57d-5fec-4031-9628-8b7750465468/scratchpad/verify/shots';
const line = console.log;
const sh = (...a) => execFileSync('bash', ['scripts/recovery.sh', ...a], { cwd: ROOT, encoding: 'utf8' }).trim();
const q = (s) => execFileSync('docker', ['compose', 'exec', '-T', 'db', 'sh', '-c',
  `psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c ${JSON.stringify(s.replace(/\s+/g, ' ').trim())}`],
  { cwd: ROOT, encoding: 'utf8' }).trim();

const canary = 'CANARY' + randomBytes(16).toString('hex');
const masterKey = execFileSync('docker', ['compose', 'exec', '-T', 'app', 'printenv', 'MASTER_KEY'], { cwd: ROOT, encoding: 'utf8' }).trim();
const link = sh('link', '5').split('\n').at(-1).trim();

const b = await webkit.launch();
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3 });
const page = await ctx.newPage();
const bodies = [];
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('response', async (r) => {
  try { bodies.push(`${r.url()} ${await r.text()}`); } catch {}
});

await page.goto(link);
await page.waitForSelector('h1');

// Seed a credential through the real settings screen path.
const status = await page.evaluate(async ([secret]) => {
  const token = document.cookie; // HttpOnly: this is deliberately empty
  const r = await fetch('/api/settings/integrations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider: 'withings', action: 'save', secret }) });
  return { status: r.status, cookieVisibleToScript: token };
}, [canary]);
line(`saving a credential from the page itself, with no anti-forgery header -> ${status.status} (F12 again, from a real browser)`);
line(`document.cookie as a script sees it: ${JSON.stringify(status.cookieVisibleToScript)}`);

// Now save it properly, through the screen's own code path.
await page.goto('https://lamberts-mac-mini.tailda76d6.ts.net/settings');
const saved = await page.evaluate(async ([secret]) => {
  const csrf = document.querySelector('[data-csrf]')?.getAttribute('data-csrf');
  return { csrfInDom: Boolean(csrf) };
}, [canary]);
line(`an anti-forgery token sitting in the DOM as an attribute: ${saved.csrfInDom}`);

// Seed through the API with a session, the way the screen will.
execFileSync('docker', ['compose', 'exec', '-T', 'app', 'node', '--input-type=module', '--eval', `
const pg = await import('pg');
const { sealSecret } = await import('/app/.next/standalone/does-not-exist.js').catch(() => ({}));
`], { cwd: ROOT, encoding: 'utf8' }).toString?.() ?? '';
await b.close();
