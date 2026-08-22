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

line('=== F17 second half. a master key that does not match the stored ciphertext');
line(stack('reset'));
const c = client(SCRATCH);
await c.get('/sign-in');
const pw = 'Scratch-' + randomBytes(12).toString('base64url') + '-9!';
const made = await c.post('/api/auth/bootstrap', { password: pw, repeat: pw });
line(`owner created on the scratch instance -> ${made.status}`);
const canary = 'CANARY' + randomBytes(12).toString('hex');
const saved = await c.post('/api/settings/integrations', { provider: 'withings', action: 'save', secret: canary });
line(`credential saved under the right key -> ${saved.status}`);
const good = await c.post('/api/settings/integrations', { provider: 'withings', action: 'check' });
line(`check under the RIGHT key -> ${good.status} readable=${JSON.parse(good.text).readable}`);
line(`the row: ${sq("select 'fp=' || key_fingerprint || ' ct_len=' || length(secret_ciphertext) from integration_credential where provider='withings'")}`);

line('');
line(stack('rekey'));
const d = client(SCRATCH);
await d.get('/sign-in');
const pw2 = pw;
const signedIn = await d.post('/api/auth/password', { password: pw2 });
line(`sign-in under the wrong key -> ${signedIn.status}`);
const bad = await d.post('/api/settings/integrations', { provider: 'withings', action: 'check' });
line(`check under the WRONG key -> ${bad.status}`);
line(`what it said: ${bad.text.slice(0, 400)}`);
line(`the response returned an empty value instead of an error: ${bad.status === 200}`);
line(`the row is untouched: ${sq("select 'fp=' || key_fingerprint || ' ct_len=' || length(secret_ciphertext) from integration_credential where provider='withings'")}`);
line(`the plaintext appears in the refusal: ${bad.text.includes(canary)}`);
