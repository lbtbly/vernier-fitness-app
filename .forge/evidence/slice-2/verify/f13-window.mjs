import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { client, q } from './probe.mjs';
const ROOT = '/Users/lambertbouley/Claude/lbtbly-fitness-app';
const line = console.log;
const good = 'Vf-' + randomBytes(18).toString('base64url') + '-9!';
execFileSync('bash', ['scripts/recovery.sh', 'unlock'], { cwd: ROOT, encoding: 'utf8' });
execFileSync('bash', ['scripts/recovery.sh', 'password'], { cwd: ROOT, encoding: 'utf8', input: good });
const c = client();
await c.get('/sign-in');
for (let i = 1; i <= 6; i += 1) await c.post('/api/auth/password', { password: 'wrong-' + i });
const locked = await c.post('/api/auth/password', { password: good });
line(`correct password while the window is open -> ${locked.status}`);
line('waiting for the 60 second window to pass, with no unlock command');
const t0 = Date.now();
let status = 0;
while (Date.now() - t0 < 90_000) {
  await new Promise((r) => setTimeout(r, 5000));
  const again = await c.post('/api/auth/password', { password: good });
  status = again.status;
  line(`  +${Math.round((Date.now() - t0) / 1000)}s: ${again.status} ${again.body.error ?? 'signed in'}`);
  if (again.status === 200) break;
}
line(`the window passed on its own and the correct password opened it: ${status === 200}`);
line(`session cookie now present: ${Boolean(c.cookie('vernier_session'))}`);
