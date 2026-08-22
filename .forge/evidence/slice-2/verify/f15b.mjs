import { execFileSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { client, q } from './probe.mjs';
const line = console.log;
const ROOT = '/Users/lambertbouley/Claude/lbtbly-fitness-app';

// Sign in again with a fresh password so this script is self contained.
const chosen = 'Vf-' + randomBytes(18).toString('base64url') + '-9!';
execFileSync('bash', ['scripts/recovery.sh', 'unlock'], { cwd: ROOT, encoding: 'utf8' });
execFileSync('bash', ['scripts/recovery.sh', 'password'], { cwd: ROOT, encoding: 'utf8', input: chosen });

const c = client();
await c.get('/sign-in');
const r = await c.post('/api/auth/password', { password: chosen });
line(`sign-in -> ${r.status}`);
const cookie = c.cookie('vernier_session');
const sha = createHash('sha256').update(cookie).digest('base64url');
line(`session rows whose id is the raw cookie value : ${q(`select count(*) from session where id = '${cookie}'`)}`);
line(`session rows whose id is sha256(cookie) base64url: ${q(`select count(*) from session where id = '${sha}'`)}`);

line('');
line('=== F15. the credential boundary');
const canary = 'VERIFIERCANARY' + randomBytes(12).toString('hex');
const saved = await c.post('/api/settings/integrations', { provider: 'withings', action: 'save', secret: canary, scope: 'user.metrics' });
line(`POST save -> ${saved.status}; the response body carries the credential: ${saved.text.includes(canary)}`);
line('what settings is told: ' + JSON.stringify(JSON.parse(saved.text).integrations.find(i => i.provider === 'withings')));
const raw = q("select provider || ' | ' || state || ' | ' || scope || ' | ct=' || coalesce(secret_ciphertext,'null') || ' | nonce=' || coalesce(secret_nonce,'null') || ' | tag=' || coalesce(secret_tag,'null') || ' | fp=' || coalesce(key_fingerprint,'null') from integration_credential where provider = 'withings'");
line('raw row selected directly from Postgres:');
line('  ' + raw);
line(`the raw row contains the plaintext: ${raw.includes(canary)}`);
const anyCol = q(`select count(*) from integration_credential where provider || state || scope || coalesce(secret_ciphertext,'') || coalesce(secret_nonce,'') || coalesce(secret_tag,'') || coalesce(key_fingerprint,'') || coalesce(last_error,'') like '%${canary}%'`);
line(`rows anywhere in the table holding the plaintext: ${anyCol}`);
const check = await c.post('/api/settings/integrations', { provider: 'withings', action: 'check' });
line(`POST check -> ${check.status} readable=${JSON.parse(check.text).readable}, body carries the credential: ${check.text.includes(canary)}`);
const get = await c.get('/api/settings/integrations');
line(`GET  integrations -> ${get.status}, body carries the credential: ${get.text.includes(canary)}`);

line('');
line('=== F12. no token on a protected mutating route');
const before = q('select count(*) from integration_credential');
const noTok = await c.post('/api/settings/integrations', { provider: 'mail_relay', action: 'save', secret: canary }, { csrf: false });
line(`POST with no token -> ${noTok.status} ${JSON.stringify(noTok.body)}`);
line(`integration_credential rows before ${before}, after ${q('select count(*) from integration_credential')}`);

line('');
line('=== the settings screen at 393, as HTML');
const html = await c.get('/settings');
line(`GET /settings -> ${html.status}, the document carries the credential: ${html.text.includes(canary)}`);
const m = html.text.match(/Withings[\s\S]{0,700}/);
line('what the document says around Withings:');
line('  ' + (m ? m[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 500) : 'not found'));

line('');
line('CANARY=' + canary);
line('SESSION_COOKIE_KEPT');
