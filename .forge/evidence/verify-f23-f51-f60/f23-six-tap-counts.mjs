import pw from '/Users/lambertbouley/Claude/lbtbly-fitness-app/node_modules/@playwright/test/index.js';
import { execFileSync } from 'node:child_process';
const { chromium } = pw;
const ROOT = '/Users/lambertbouley/Claude/lbtbly-fitness-app';
const W = '/private/tmp/claude-501/-Users-lambertbouley-Claude-lbtbly-fitness-app/38530ca4-7aaa-4639-b52a-4d9b5f218876/scratchpad';
const S = 'http://127.0.0.1:3101';
const sq = (sql) => execFileSync('docker', ['compose','exec','-T','-e',`SQL=${sql}`,'db','sh','-c','psql -U "$POSTGRES_USER" -d vernier_scratch -At -c "$SQL"'], { cwd: ROOT, encoding: 'utf8' }).trim();

if (Number(sq('select count(*) from owner')) === 0) {
  const first = await fetch(`${S}/sign-in`, { redirect: 'manual' });
  const csrf = first.headers.getSetCookie().map((l) => l.split(';')[0]).find((p) => p.startsWith('vernier_csrf=')) ?? '';
  const pwd = `Scratch-${crypto.randomUUID()}-Q9!`;
  const r = await fetch(`${S}/api/auth/bootstrap`, { method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/json', cookie: csrf, 'x-vernier-csrf': csrf.slice('vernier_csrf='.length) },
    body: JSON.stringify({ password: pwd, repeat: pwd }) });
  console.log('bootstrap:', r.status);
}
const link = execFileSync('bash', ['scripts/recovery.sh','link','10'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, RECOVERY_CONTAINER: 'vernier-scratch' } }).trim().split('\n').at(-1).trim();
if (!link.startsWith(S)) throw new Error('not the scratch origin: ' + link);

console.log('STATE BEFORE: manual rows today =', sq("select count(*) from measurement where source='manual' and measured_at::date = current_date"),
  '| the standing waist =', sq("select coalesce(raw_value || ' ' || unit || ' ' || source || ' ' || measured_at::date, '(none)') from measurement where metric='waist' order by measured_at desc limit 1"));

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, serviceWorkers: 'block' });
const page = await context.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(link);
await page.waitForURL(/\/$/);

const typeKeys = async (loc, keys) => { for (const k of keys) { await loc.press(k); await page.waitForTimeout(40); } };

async function openSheet() {
  await page.goto(`${S}/`);
  await page.getByRole('heading', { name: 'Today' }).waitFor();
  await page.getByRole('button', { name: 'Quick log', exact: true }).click();          // TAP 1
  await page.getByRole('dialog', { name: 'Quick log' }).waitFor();
  await page.locator('.sheet [data-state="loading"]').waitFor({ state: 'detached' }).catch(() => {});
  await page.waitForTimeout(300);
}

const countFor = (metric) => Number(sq(`select count(*) from measurement where metric='${metric}' and source='manual'`));

const results = [];
async function walk(name, metric, tapTarget) {
  const before = countFor(metric);
  let taps = 0;
  await openSheet(); taps += 1;
  taps += await tapTarget();                                                            // TAP 2
  await page.getByRole('button', { name: 'Save', exact: true }).click(); taps += 1;      // TAP 3
  const deadline = Date.now() + 25000;
  let after = before;
  while (Date.now() < deadline) { after = countFor(metric); if (after > before) break; await new Promise((r) => setTimeout(r, 400)); }
  const stored = sq(`select raw_value || ' ' || unit || ' ' || source || ' ' || confidence || ' ' || measured_at::date from measurement where metric='${metric}' and source='manual' order by measured_at desc limit 1`);
  results.push([name, taps, after > before, stored]);
  console.log(`${name}: ${taps} taps from Today -> rows ${before} to ${after}, stored "${stored}"`);
}

await walk('waist   (stepper)', 'waist', async () => {
  const up = page.getByRole('button', { name: 'Up half a centimetre' });
  if (!(await up.isEnabled())) throw new Error('the stepper is disabled with a waist on file');
  await up.click(); return 1;
});
await walk('energy  ', 'energy', async () => { await page.getByRole('button', { name: 'Energy, 4 of 5' }).click(); return 1; });
await walk('fatigue ', 'fatigue', async () => { await page.getByRole('button', { name: 'Fatigue, 2 of 5' }).click(); return 1; });
await walk('hunger  ', 'hunger', async () => { await page.getByRole('button', { name: 'Hunger, 3 of 5' }).click(); return 1; });
await walk('satiety ', 'satiety', async () => { await page.getByRole('button', { name: 'Satiety after eating, 4 of 5' }).click(); return 1; });
await walk('note    ', 'note', async () => {
  const note = page.getByLabel('Note');
  await note.click();
  await typeKeys(note, ['S','l','e','p','t',' ','b','a','d','l','y','.']);
  console.log(`   the note field holds "${await note.inputValue().catch(async () => await note.textContent())}" after typing key by key`);
  return 1;
});

console.log('\nTAP COUNTS: ' + results.map(([n, t]) => `${n.trim()}=${t}`).join(' '));
console.log('every one committed: ' + results.every(([, , ok]) => ok));
console.log('max taps: ' + Math.max(...results.map(([, t]) => t)));
console.log('console errors during the six walks: ' + (errors.length === 0 ? 'none' : JSON.stringify(errors)));
console.log('\nall manual rows written today:');
console.log(sq("select string_agg(metric || ' ' || raw_value || ' ' || unit, ' | ' order by metric) from measurement where source='manual' and measured_at::date = current_date"));
await browser.close();
