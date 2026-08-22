import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { client } from './probe.mjs';
const ROOT = '/Users/lambertbouley/Claude/lbtbly-fitness-app';
const line = console.log;
const SCRATCH = 'http://127.0.0.1:3101';
const sq = (s) => execFileSync('docker', ['compose', 'exec', '-T', 'db', 'sh', '-c',
  `psql -U "$POSTGRES_USER" -d vernier_scratch -At -c ${JSON.stringify(s.replace(/\s+/g, ' ').trim())}`],
  { cwd: ROOT, encoding: 'utf8' }).trim();
const stack = (...a) => execFileSync('bash', ['scripts/test-stack.sh', ...a], { cwd: ROOT, encoding: 'utf8' }).trim();
const wait = async () => { for (let i = 0; i < 60; i += 1) { try { const r = await fetch(`${SCRATCH}/healthz`); if (r.ok) return; } catch {} await new Promise(r => setTimeout(r, 500)); } throw new Error('never answered'); };

line(stack('reset'));
await wait();
const c = client(SCRATCH);
await c.get('/sign-in');
const pw = 'Scratch-' + randomBytes(12).toString('base64url') + '-9!';
line(`owner created -> ${(await c.post('/api/auth/bootstrap', { password: pw, repeat: pw })).status}`);
const canary = 'CANARY' + randomBytes(12).toString('hex');
line(`credential saved under the right key -> ${(await c.post('/api/settings/integrations', { provider: 'withings', action: 'save', secret: canary })).status}`);
const good = await c.post('/api/settings/integrations', { provider: 'withings', action: 'check' });
line(`check under the RIGHT key -> ${good.status} readable=${JSON.parse(good.text).readable}`);
const rowBefore = sq("select 'fp=' || key_fingerprint || ' ct_len=' || length(secret_ciphertext) from integration_credential where provider='withings'");
line(`the row: ${rowBefore}`);

line('');
line(stack('rekey'));
await wait();
const d = client(SCRATCH);
await d.get('/sign-in');
line(`sign-in under the wrong key -> ${(await d.post('/api/auth/password', { password: pw })).status}`);
const bad = await d.post('/api/settings/integrations', { provider: 'withings', action: 'check' });
line(`check under the WRONG key -> ${bad.status}`);
line(`what it said: ${bad.text.slice(0, 420)}`);
line(`it returned 200 with an empty value instead of an error: ${bad.status === 200}`);
line(`the row is untouched: ${sq("select 'fp=' || key_fingerprint || ' ct_len=' || length(secret_ciphertext) from integration_credential where provider='withings'") === rowBefore}`);
line(`the plaintext appears in the refusal: ${bad.text.includes(canary)}`);
const listed = await d.get('/api/settings/integrations');
line(`GET integrations under the wrong key -> ${listed.status}; withings reads: ${JSON.stringify(JSON.parse(listed.text).integrations.find(i => i.provider === 'withings'))}`);
