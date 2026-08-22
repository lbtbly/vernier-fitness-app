// Can WebKit hold a Secure session cookie from http://127.0.0.1:3101?
import { execFileSync } from 'node:child_process';
import { webkit } from '@playwright/test';

const SCRATCH = 'http://127.0.0.1:3101';
const jar = new Map();
const cookieHeader = () => [...jar].map(([n, v]) => `${n}=${v}`).join('; ');
const absorb = (r) => {
  for (const line of r.headers.getSetCookie()) {
    const pair = line.split(';')[0];
    const i = pair.indexOf('=');
    jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
  console.log('set-cookie:', r.headers.getSetCookie());
};
let r = await fetch(`${SCRATCH}/sign-in`, { headers: { cookie: cookieHeader() }, redirect: 'manual' });
absorb(r);
const password = 'Scratch-probe-quicklog-42!';
r = await fetch(`${SCRATCH}/api/auth/bootstrap`, {
  method: 'POST',
  redirect: 'manual',
  headers: { 'content-type': 'application/json', cookie: cookieHeader(), 'x-vernier-csrf': jar.get('vernier_csrf') ?? '' },
  body: JSON.stringify({ password, repeat: password }),
});
absorb(r);
console.log('bootstrap', r.status, await r.text());

const LINK = execFileSync('docker', ['exec', '-i', '-e', 'RECOVERY_MINUTES=10', 'vernier-scratch', 'node', '--input-type=module', '--eval', `
const crypto = await import("node:crypto");
const pg = await import("pg");
const token = crypto.randomBytes(32).toString("base64url");
const id = crypto.createHash("sha256").update(token).digest("base64url");
const client = new pg.default.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query("insert into recovery_grant (id, expires_at) values ($1, now() + make_interval(mins => 10))", [id]);
console.log(process.env.APP_URL.replace(/\\/+$/, "") + "/sign-in/recover?token=" + token);
await client.end();
`], { encoding: 'utf8' }).trim().split('\n').at(-1);
console.log('link', LINK);

const LINK2 = LINK.replace('127.0.0.1','localhost');
const browser = await webkit.launch();
const ctx = await browser.newContext({ baseURL: 'http://localhost:3101', viewport: { width: 393, height: 852 } });
const page = await ctx.newPage();
await page.goto(LINK2);
console.log('after link, url:', page.url());
await page.goto('/');
console.log('after /, url:', page.url());
console.log('cookies:', (await ctx.cookies()).map((c) => c.name));
console.log('h1:', await page.locator('h1').allInnerTexts());
await browser.close();
