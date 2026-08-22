import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { client, q } from './probe.mjs';
const ROOT = '/Users/lambertbouley/Claude/lbtbly-fitness-app';
const line = console.log;

// A password I know, set by the documented procedure, so the seventh attempt
// can be the CORRECT one, which is what F13 actually asks for.
const good = 'Vf-' + randomBytes(18).toString('base64url') + '-9!';
execFileSync('bash', ['scripts/recovery.sh', 'unlock'], { cwd: ROOT, encoding: 'utf8' });
execFileSync('bash', ['scripts/recovery.sh', 'password'], { cwd: ROOT, encoding: 'utf8', input: good });

const rowsBefore = Number(q('select count(*) from auth_attempt'));
line(`auth_attempt rows before the seven attempts: ${rowsBefore}`);
const started = new Date().toISOString();

const c = client();
await c.get('/sign-in');
const statuses = [];
const t0 = Date.now();
for (let i = 1; i <= 6; i += 1) {
  const r = await c.post('/api/auth/password', { password: 'definitely-not-it-' + i });
  statuses.push(r.status);
  line(`attempt ${i} (wrong)   -> ${r.status}  ${r.body.detail ?? ''}`);
}
const seventh = await c.post('/api/auth/password', { password: good });
statuses.push(seventh.status);
line(`attempt 7 (CORRECT) -> ${seventh.status}  ${seventh.body.detail ?? ''}`);
line(`all seven inside ${((Date.now() - t0) / 1000).toFixed(1)} seconds`);
line(`statuses: ${statuses.join(', ')}`);
line(`a session was issued on the seventh: ${Boolean(c.cookie('vernier_session'))}`);

const rowsAfter = Number(q('select count(*) from auth_attempt'));
line(`auth_attempt rows after: ${rowsAfter}, appended: ${rowsAfter - rowsBefore}`);
line('the rows those seven attempts wrote:');
line(q(`select at::text || '  ' || method || '  ' || outcome || '  | ' || reason from auth_attempt where at > '${started}' order by at`));
