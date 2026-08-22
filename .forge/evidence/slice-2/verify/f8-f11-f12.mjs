import { client, q } from './probe.mjs';

const line = (s) => console.log(s);

// ---------------------------------------------------------------- F8
line('=== F8. owner creation exactly once, against the LIVE install');
const before = q('select count(*) from owner');
line(`owner rows before: ${before}`);
const c = client();
const page = await c.get('/sign-in');
line(`GET /sign-in -> ${page.status}; anti-forgery cookie present: ${Boolean(c.cookie('vernier_csrf'))}`);
const second = await c.post('/api/auth/bootstrap', { password: 'A-different-one-42!', repeat: 'A-different-one-42!' });
line(`POST /api/auth/bootstrap (second creation) -> ${second.status} ${JSON.stringify(second.body)}`);
const after = q('select count(*) from owner');
line(`owner rows after: ${after}`);

// ---------------------------------------------------------------- F11 part 1
line('');
line('=== F11. the session cookie before sign-in');
const preSignIn = c.cookie('vernier_session');
line(`session cookie before sign-in: ${preSignIn ? 'present' : 'absent'}`);
for (const l of page.setCookie) line(`  Set-Cookie on /sign-in: ${l.replace(/=[^;]*/, '=<redacted>')}`);

// ---------------------------------------------------------------- F12
line('');
line('=== F12. anti-forgery on a state-changing request');
const rowsBefore = q('select count(*) from auth_attempt');
const noToken = await c.post('/api/auth/password', { password: 'anything-at-all-1!' }, { csrf: false });
line(`POST /api/auth/password with no ${'x-vernier-csrf'} header -> ${noToken.status} ${JSON.stringify(noToken.body)}`);
const rowsAfter = q('select count(*) from auth_attempt');
line(`auth_attempt rows before the rejected request: ${rowsBefore}, after: ${rowsAfter}`);
const badToken = await c.post('/api/auth/password', { password: 'anything-at-all-1!' }, { csrfValue: 'not-the-token' });
line(`POST /api/auth/password with a wrong token -> ${badToken.status} ${JSON.stringify(badToken.body)}`);
const rowsAfterBad = q('select count(*) from auth_attempt');
line(`auth_attempt rows after the wrong-token request: ${rowsAfterBad}`);
