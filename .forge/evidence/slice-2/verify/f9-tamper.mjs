import { execFileSync } from 'node:child_process';
import { webkit } from '/Users/lambertbouley/Claude/lbtbly-fitness-app/node_modules/playwright/index.mjs';
import { authenticatorInitScript, makeAuthenticatorSeed } from '/Users/lambertbouley/Claude/lbtbly-fitness-app/tests/e2e/software-authenticator.ts';
const ROOT = '/Users/lambertbouley/Claude/lbtbly-fitness-app';
const line = console.log;
const sh = (...a) => execFileSync('bash', ['scripts/recovery.sh', ...a], { cwd: ROOT, encoding: 'utf8' }).trim();
const q = (s) => execFileSync('docker', ['compose', 'exec', '-T', 'db', 'sh', '-c',
  `psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c ${JSON.stringify(s.replace(/\s+/g, ' ').trim())}`],
  { cwd: ROOT, encoding: 'utf8' }).trim();

const before = q("select coalesce((select observed::text from device_observation where signal='passkey_registered'),'absent')");
const seed = await makeAuthenticatorSeed();
const link = sh('link', '10').split('\n').at(-1).trim();

const b = await webkit.launch();
const ctx = await b.newContext({ viewport: { width: 393, height: 852 } });
await ctx.addInitScript(authenticatorInitScript(seed));
const page = await ctx.newPage();
try {
  await page.goto(link);
  await page.waitForSelector('h1');
  await page.goto('https://lamberts-mac-mini.tailda76d6.ts.net/settings');
  await page.getByRole('button', { name: 'Add a passkey on this device' }).click();
  await page.waitForSelector('text=Device type: multiDevice', { timeout: 15000 });
  line(`registered. the row Postgres holds: ${q(`select 'counter=' || counter || ' device_type=' || device_type || ' backed_up=' || backed_up from webauthn_credential where id = '${seed.credentialId}'`)}`);

  // --- control: a clean assertion signs in
  await page.goto('https://lamberts-mac-mini.tailda76d6.ts.net/settings');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForSelector('h1:has-text("Sign in")');
  await page.getByRole('button', { name: 'Sign in with passkey' }).click();
  await page.waitForSelector('h1:has-text("Today")', { timeout: 15000 });
  line('control: a clean assertion is accepted and lands on Today');

  // --- tamper: flip one byte inside the ECDSA signature, everything else real
  await page.goto('https://lamberts-mac-mini.tailda76d6.ts.net/settings');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForSelector('h1:has-text("Sign in")');
  await page.evaluate(() => {
    const proto = Object.getPrototypeOf(navigator.credentials);
    const original = proto.get;
    const wrapped = async (options) => {
      const credential = await original(options);
      const bytes = new Uint8Array(credential.response.signature);
      bytes[bytes.length - 1] ^= 0xff;   // one byte, at the end of the DER blob
      credential.response.signature = bytes.buffer;
      return credential;
    };
    Object.defineProperty(proto, 'get', { value: wrapped, configurable: true, writable: true });
    Object.defineProperty(navigator.credentials, 'get', { value: wrapped, configurable: true, writable: true });
  });
  await page.getByRole('button', { name: 'Sign in with passkey' }).click();
  await page.waitForTimeout(2500);
  const stillAtGate = await page.locator('h1:has-text("Sign in")').count();
  const banner = await page.locator('.banner').first().innerText().catch(() => '(none)');
  line(`tampered signature: still at the gate = ${stillAtGate === 1}`);
  line(`what the server said: ${JSON.stringify(banner)}`);
  line(`audit row: ${q("select outcome || ' | ' || reason from auth_attempt where method='passkey' order by at desc limit 1")}`);

  // --- tamper 2: a replayed ceremony identifier
  const replay = await page.evaluate(async () => {
    const r1 = await fetch('/api/auth/passkey/authentication/options', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    const first = await r1.json();
    const r2 = await fetch('/api/auth/passkey/authentication/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ceremonyId: first.ceremonyId, response: { id: 'nonsense', rawId: 'nonsense', type: 'public-key', response: {} } }) });
    return { options: r1.status, verify: r2.status, body: await r2.text() };
  });
  line(`a made-up assertion against a real ceremony: options ${replay.options}, verify ${replay.verify} ${replay.body.slice(0, 140)}`);
} finally {
  try { line(sh('forget-passkey', seed.credentialId)); } catch { line('nothing to remove'); }
  if (before === 'absent') { q("delete from device_observation where signal='passkey_registered'"); line('diagnostics signal put back to absent, which is what it was'); }
  await b.close();
}
