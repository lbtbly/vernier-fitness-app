import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { client, q } from './probe.mjs';

const ROOT = '/Users/lambertbouley/Claude/lbtbly-fitness-app';
const sh = (args, input) => execFileSync('bash', args, { cwd: ROOT, encoding: 'utf8', input, stdio: input === undefined ? undefined : ['pipe', 'pipe', 'pipe'] }).trim();
const line = console.log;

line('=== F18. the documented recovery procedure, run from the host shell');
line('passkeys on this installation: ' + q('select count(*) from webauthn_credential'));
line('--- scripts/recovery.sh unlock');
line(sh(['scripts/recovery.sh', 'unlock']));

// Never printed, never written to disk. Generated here and used in this process only.
const chosen = 'Vf-' + randomBytes(18).toString('base64url') + '-9!';
line('--- scripts/recovery.sh password  (piped, 12+ chars, never echoed)');
line(sh(['scripts/recovery.sh', 'password'], chosen));

line('');
line('=== F10. the parameters the row actually carries');
line(q(`select 'algorithm=' || password_algorithm || ' m=' || password_memory || ' t=' || password_passes ||
        ' p=' || password_parallelism || ' tag_bytes=' || octet_length(decode(password_tag,'base64')) ||
        ' nonce_bytes=' || octet_length(decode(password_nonce,'base64')) from owner`));

const c = client();
await c.get('/sign-in');
const sessionBefore = c.cookie('vernier_session');
line(`session cookie before sign-in: ${sessionBefore ? 'present' : 'absent'}`);

line('');
line('=== F10. a failed verification, over the live HTTPS origin');
const wrong = await c.post('/api/auth/password', { password: chosen.slice(0, -1) + '8' });
line(`wrong password -> ${wrong.status} ${JSON.stringify(wrong.body)}`);

line('');
line('=== F10 + F12 positive + F11. the same request with the token, correct password');
const right = await c.post('/api/auth/password', { password: chosen });
line(`correct password -> ${right.status} ${JSON.stringify(right.body)}`);
for (const l of right.setCookie) line(`  Set-Cookie: ${l.replace(/=[^;]*/, '=<redacted>')}`);
const sessionAfter = c.cookie('vernier_session');
line(`session cookie after sign-in: ${sessionAfter ? 'present' : 'absent'}`);
line(`the value differs from before sign-in: ${String(sessionBefore) !== String(sessionAfter)}`);
line(`the stored row holds a hash, not the cookie value: ${q(`select count(*) from session where id = '${sessionAfter}'`)} row(s) whose id is the raw cookie`);
line(`sessions whose id is the sha256 of it: ${q(`select count(*) from session where id = encode(sha256('${sessionAfter}'::bytea),'base64')`)}`);

line('');
line('=== F18. the resulting session actually opens the app');
const today = await c.get('/');
line(`GET / with that session -> ${today.status}`);
const me = await c.get('/api/settings/integrations');
line(`GET /api/settings/integrations with that session -> ${me.status}`);

line('');
line('=== F15. a third-party credential entered through settings');
const canary = 'VERIFIER-CANARY-' + randomBytes(12).toString('hex');
const saved = await c.post('/api/settings/integrations', { provider: 'withings', action: 'save', secret: canary, scope: 'user.metrics' });
line(`POST save -> ${saved.status}`);
line(`the response body mentions the credential: ${saved.text.includes(canary)}`);
line(`what the response says about withings: ${JSON.stringify(JSON.parse(saved.text).integrations.find(i => i.provider === 'withings'))}`);
const raw = q("select provider || ' | ' || state || ' | ' || scope || ' | ' || ciphertext || ' | ' || key_fingerprint from integration_credential where provider = 'withings'");
line(`raw row: ${raw}`);
line(`the raw row contains the plaintext: ${raw.includes(canary)}`);
const check = await c.post('/api/settings/integrations', { provider: 'withings', action: 'check' });
line(`POST check -> ${check.status} readable=${JSON.parse(check.text).readable}`);

line('');
line('=== F12. a state-changing request on a protected route with no token');
const cred = q("select count(*) from integration_credential");
const noTok = await c.post('/api/settings/integrations', { provider: 'mail_relay', action: 'save', secret: canary }, { csrf: false });
line(`POST /api/settings/integrations with no token -> ${noTok.status} ${JSON.stringify(noTok.body)}`);
line(`integration_credential rows before: ${cred}, after: ${q('select count(*) from integration_credential')}`);

line('');
line('CANARY=' + canary);
