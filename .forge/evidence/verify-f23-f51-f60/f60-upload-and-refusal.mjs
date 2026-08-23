import pw from '/Users/lambertbouley/Claude/lbtbly-fitness-app/node_modules/@playwright/test/index.js';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const { chromium } = pw;
const ROOT = '/Users/lambertbouley/Claude/lbtbly-fitness-app';
const W = '/private/tmp/claude-501/-Users-lambertbouley-Claude-lbtbly-fitness-app/38530ca4-7aaa-4639-b52a-4d9b5f218876/scratchpad';
const S = 'http://127.0.0.1:3101';

const sq = (sql) => execFileSync('docker', ['compose','exec','-T','-e',`SQL=${sql}`,'db','sh','-c','psql -U "$POSTGRES_USER" -d vernier_scratch -At -c "$SQL"'], { cwd: ROOT, encoding: 'utf8' }).trim();

// owner, through the shipped bootstrap route
if (Number(sq('select count(*) from owner')) === 0) {
  const first = await fetch(`${S}/sign-in`, { redirect: 'manual' });
  const csrf = first.headers.getSetCookie().map((l) => l.split(';')[0]).find((p) => p.startsWith('vernier_csrf=')) ?? '';
  const pwd = `Scratch-${crypto.randomUUID()}-Q9!`;
  const made = await fetch(`${S}/api/auth/bootstrap`, { method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/json', cookie: csrf, 'x-vernier-csrf': csrf.slice('vernier_csrf='.length) },
    body: JSON.stringify({ password: pwd, repeat: pwd }) });
  console.log('bootstrap:', made.status);
}
const link = execFileSync('bash', ['scripts/recovery.sh', 'link', '10'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, RECOVERY_CONTAINER: 'vernier-scratch' } }).trim().split('\n').at(-1).trim();
if (!link.startsWith(S)) { throw new Error('the sign-in link is not the scratch origin: ' + link); }

console.log('POPULATION BEFORE:',
  'lab_document', sq('select count(*) from lab_document'),
  '| lab_analyte', sq('select count(*) from lab_analyte'),
  '| measurement', sq('select count(*) from measurement'));

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, serviceWorkers: 'block' });
const page = await context.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text()); });
await page.goto(link);
await page.waitForURL(/\/$/);
await page.goto(`${S}/health/labs`);
await page.waitForLoadState('networkidle');
await page.locator('#lab-file').setInputFiles({ name: 'analyses-12-08-2026.pdf', mimeType: 'application/pdf', buffer: readFileSync(W + '/panel.pdf') });
await page.waitForURL(/\/health\/labs\/lab_/, { timeout: 120000 });
await page.waitForLoadState('networkidle');
console.log('landed on:', page.url());

console.log('POPULATION AFTER THE UPLOAD:',
  'lab_document', sq('select count(*) from lab_document'),
  '| lab_analyte', sq('select count(*) from lab_analyte'));

console.log('lab_document columns:', sq("select string_agg(column_name, ', ' order by ordinal_position) from information_schema.columns where table_name='lab_document'"));

const banner = page.locator('[data-banner="refused"]');
await banner.waitFor({ state: 'visible', timeout: 30000 });
const words = (await banner.textContent()).replace(/\s+/g, ' ').trim();
console.log('F60 the refusal on the review screen reads:', JSON.stringify(words));
console.log('F60 names blood pressure:', /blood-?pressure/i.test(words));
console.log('F60 prints "128":', words.includes('128'), '| prints "82":', words.includes('82'), '| prints "mmHg":', /mmhg/i.test(words));

const markup = await page.content();
console.log('F60 whole rendered document contains "128/82":', markup.includes('128/82'), '| "mmHg":', /mmhg/i.test(markup), '| "Tension arterielle":', markup.includes('Tension arterielle'));

// settle every animation before the capture, then say the state is settled
await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))));
await page.waitForTimeout(400);
const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
console.log('animations still running at capture time:', running);
await page.screenshot({ path: W + '/f60-refusal-393x852.png', fullPage: true });
console.log('capture written:', W + '/f60-refusal-393x852.png');
await browser.close();
