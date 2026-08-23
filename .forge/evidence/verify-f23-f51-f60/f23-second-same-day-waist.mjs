import pw from '/Users/lambertbouley/Claude/lbtbly-fitness-app/node_modules/@playwright/test/index.js';
import { execFileSync } from 'node:child_process';
const { chromium } = pw;
const ROOT = '/Users/lambertbouley/Claude/lbtbly-fitness-app';
const S = 'http://127.0.0.1:3101';
const sq = (sql) => execFileSync('docker', ['compose','exec','-T','-e',`SQL=${sql}`,'db','sh','-c','psql -U "$POSTGRES_USER" -d vernier_scratch -At -c "$SQL"'], { cwd: ROOT, encoding: 'utf8' }).trim();
const link = execFileSync('bash', ['scripts/recovery.sh','link','10'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, RECOVERY_CONTAINER: 'vernier-scratch' } }).trim().split('\n').at(-1).trim();
if (!link.startsWith(S)) throw new Error('not the scratch origin');

const waistRows = () => sq("select coalesce(string_agg(raw_value || '/' || source, ', ' order by measured_at), '(none)') from measurement where metric='waist' and measured_at::date = current_date");
const waistCount = () => Number(sq("select count(*) from measurement where metric='waist' and measured_at::date = current_date"));

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, serviceWorkers: 'block' });
const page = await context.newPage();
await page.goto(link); await page.waitForURL(/\/$/);

async function openSheet() {
  await page.goto(`${S}/`);
  await page.getByRole('heading', { name: 'Today' }).waitFor();
  await page.getByRole('button', { name: 'Quick log', exact: true }).click();
  await page.getByRole('dialog', { name: 'Quick log' }).waitFor();
  await page.locator('.sheet [data-state="loading"]').waitFor({ state: 'detached' }).catch(() => {});
  await page.waitForTimeout(400);
}
const settle = async (n) => { const end = Date.now() + 20000; while (Date.now() < end) { if (waistCount() >= n) return true; await new Promise((r) => setTimeout(r, 400)); } return false; };

console.log('THE DAY ALREADY HOLDS:', waistRows(), '(count', waistCount() + ')');

// 1. A SECOND HAND-TYPED WAIST ON A DAY THAT ALREADY HOLDS ONE. The clause that regressed.
await openSheet();
const field = page.locator('#quick-log-waist');
const box = await field.boundingBox();
await field.click({ position: { x: box.width - 4, y: box.height / 2 } });
const onFile = await field.inputValue();
for (let i = 0; i < onFile.length; i += 1) { await field.press('Backspace'); await page.waitForTimeout(40); }
for (const k of ['9','1','.','4']) { await field.press(k); await page.waitForTimeout(40); }
console.log('the field was prefilled with', JSON.stringify(onFile), 'and now reads', JSON.stringify(await field.inputValue()));
const before1 = waistCount();
await page.getByRole('button', { name: 'Save', exact: true }).click();
console.log('after the second hand-typed waist, count reached', before1 + 1, '?', await settle(before1 + 1), '->', waistRows());
const top1 = sq("select raw_value || ' ' || unit || ' ' || source from measurement where metric='waist' order by measured_at desc limit 1");
console.log('the newest waist row is now:', top1);

// What the product SHOWS the owner, which is the half the regression faked.
await page.goto(`${S}/`); await page.waitForLoadState('networkidle'); await page.waitForTimeout(600);
await page.getByRole('button', { name: 'Quick log', exact: true }).click();
await page.getByRole('dialog', { name: 'Quick log' }).waitFor();
await page.locator('.sheet [data-state="loading"]').waitFor({ state: 'detached' }).catch(() => {});
await page.waitForTimeout(500);
console.log('the sheet reopened shows the waist as:', JSON.stringify(await page.locator('#quick-log-waist').inputValue()));

// 2. A THIRD READING, THIS TIME STEPPED, on a day that already holds two.
const before2 = waistCount();
await page.getByRole('button', { name: 'Up half a centimetre' }).click();
console.log('one stepper tap moves the field to', JSON.stringify(await page.locator('#quick-log-waist').inputValue()));
await page.getByRole('button', { name: 'Save', exact: true }).click();
console.log('after the stepped third reading, count reached', before2 + 1, '?', await settle(before2 + 1), '->', waistRows());

// 3. THE NARROW SIDE: the same number saved again must still be one row.
await openSheet();
const before3 = waistCount();
await page.getByRole('button', { name: 'Save', exact: true }).click();
await new Promise((r) => setTimeout(r, 6000));
console.log('saving the identical standing value again left the count at', waistCount(), '(was', before3 + ') ->', waistRows());

console.log('\nevery waist row today, in order:');
console.log(sq("select string_agg(raw_value || ' ' || unit || ' ' || source || ' @' || to_char(measured_at,'HH24:MI:SS'), E'\\n' order by measured_at) from measurement where metric='waist' and measured_at::date = current_date"));
await browser.close();
