import { execFileSync } from 'node:child_process';
import { webkit } from '/Users/lambertbouley/Claude/lbtbly-fitness-app/node_modules/playwright/index.mjs';
const ROOT = '/Users/lambertbouley/Claude/lbtbly-fitness-app';
const OUT = '/private/tmp/claude-501/-Users-lambertbouley-Claude-lbtbly-fitness-app/b9d6a57d-5fec-4031-9628-8b7750465468/scratchpad/verify/shots';
const BASE = 'https://lamberts-mac-mini.tailda76d6.ts.net';
const line = console.log;
const sh = (...a) => execFileSync('bash', ['scripts/recovery.sh', ...a], { cwd: ROOT, encoding: 'utf8' }).trim();

const b = await webkit.launch();
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3 });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`${page.url()} :: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`${page.url()} :: pageerror ${e.message}`));

line('=== the unauthenticated visitor: the gate is all he gets');
await page.goto(`${BASE}/train`);
line(`asking for /train unauthenticated lands on ${page.url()}`);
line(`heading: ${await page.locator('h1').first().innerText()}`);

line('');
line('=== the owner, four modes, one account. Signing in through the documented recovery link.');
await page.goto(sh('link', '10').split('\n').at(-1).trim());
await page.waitForSelector('h1');
line(`landed on ${page.url()}, heading ${JSON.stringify(await page.locator('h1').first().innerText())}`);

for (const [path, who] of [['/', 'owner, daily'], ['/health', 'owner, daily'], ['/train', 'owner, daily'], ['/eat', 'owner, weekly planner'], ['/settings', 'owner, operator']]) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  const h1 = await page.locator('h1').first().innerText().catch(() => '(none)');
  const tabs = await page.locator('nav a, .tabbar a').count();
  line(`  ${who.padEnd(22)} ${path.padEnd(10)} -> ${page.url().replace(BASE, '')} h1=${JSON.stringify(h1)} tabs=${tabs}`);
  await page.screenshot({ path: `${OUT}/loop-${path.replace(/\W+/g, '') || 'today'}-393.png`, fullPage: true });
}

line('');
line('=== the owner, operator: signing out ends the session for good');
await page.goto(`${BASE}/settings`);
const before = (await ctx.cookies()).find((c) => c.name === 'vernier_session')?.value;
await page.getByRole('button', { name: 'Sign out' }).click();
await page.waitForSelector('h1:has-text("Sign in")');
line(`after sign-out the browser is at ${page.url()}`);
const r = await fetch(`${BASE}/api/settings/integrations`, { headers: { cookie: `vernier_session=${before}` } });
line(`replaying the ended session cookie against a protected API -> ${r.status}`);

line('');
line(`console errors across the whole loop: ${errors.length}`);
for (const e of errors) line('  ' + e);
await b.close();
