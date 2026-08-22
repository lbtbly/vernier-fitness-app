// Writes one real waist reading into the OWNER'S live database, through the
// shipped quick log, the way the owner writes one. Then the suite runs on top
// of it. The row must still be there afterwards.
import { execFileSync } from 'node:child_process';
import { webkit } from '@playwright/test';

const BASE = 'https://lamberts-mac-mini.tailda76d6.ts.net';
const link = execFileSync('bash', ['scripts/recovery.sh', 'link', '10'], { encoding: 'utf8' })
  .trim()
  .split('\n')
  .at(-1)
  .trim();

const browser = await webkit.launch();
const context = await browser.newContext({ baseURL: BASE, viewport: { width: 393, height: 852 } });
const page = await context.newPage();
await page.goto(link);
await page.goto('/');
await page.getByRole('button', { name: 'Quick log', exact: true }).click();
await page.getByRole('button', { name: 'Up half a centimetre' }).click();
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.waitForTimeout(2500);
await browser.close();

const rows = execFileSync(
  'docker',
  [
    'compose',
    'exec',
    '-T',
    'db',
    'sh',
    '-c',
    `psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "select id || ' | ' || metric || ' | ' || raw_value || ' | source ' || source || ' | seed ' || seed || ' | ' || imported_at from measurement where not seed order by imported_at"`,
  ],
  { encoding: 'utf8' },
);
process.stdout.write(rows);
