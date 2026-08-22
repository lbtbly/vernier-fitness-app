import { webkit } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const url = 'http://127.0.0.1:3101';

// owner
const count = execFileSync('docker', ['compose','exec','-T','db','sh','-c',
  'psql -U "$POSTGRES_USER" -d vernier_scratch -At -c "select count(*) from owner"'],
  {cwd: process.cwd(), encoding:'utf8'}).trim();
if (count === '0') {
  const password = `Scratch-${randomUUID()}-Q9!`;
  const first = await fetch(`${url}/sign-in`, { redirect: 'manual' });
  const csrf = first.headers.getSetCookie().map(l=>l.split(';')[0]).find(p=>p.startsWith('vernier_csrf=')) ?? '';
  const created = await fetch(`${url}/api/auth/bootstrap`, {method:'POST', redirect:'manual',
    headers:{'content-type':'application/json', cookie: csrf, 'x-vernier-csrf': csrf.slice('vernier_csrf='.length)},
    body: JSON.stringify({password, repeat: password})});
  console.log('bootstrap', created.status);
}

const link = execFileSync('bash', ['scripts/recovery.sh','link','10'], {
  cwd: process.cwd(), encoding:'utf8',
  env: {...process.env, RECOVERY_CONTAINER: 'vernier-scratch'},
}).trim().split('\n').at(-1).trim();
console.log('link', link);

const browser = await webkit.launch();
const context = await browser.newContext({viewport:{width:393,height:852}});
const page = await context.newPage();
await page.goto(link);
await page.waitForLoadState('networkidle');
console.log('landed on', page.url());
console.log('cookies', (await context.cookies()).map(c=>c.name).join(','));
await browser.close();
