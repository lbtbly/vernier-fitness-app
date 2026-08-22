import { client, q } from './probe.mjs';
const line = console.log;

line('=== the unauthenticated visitor on the tailnet, attempting forbidden things');
const anon = client();

// A forged session cookie. The middleware only checks presence; the check that
// counts is meant to be the database lookup.
const forged = client();
forged.jar.set('vernier_session', 'a-value-i-invented-that-names-no-row');
for (const path of ['/', '/settings', '/health', '/train', '/eat']) {
  const r = await forged.get(path);
  line(`forged session cookie on ${path.padEnd(10)} -> ${r.status} ${r.headers.get('location') ?? ''}`);
}
for (const path of ['/api/settings/integrations', '/api/auth/sign-out']) {
  const r = await forged.get(path);
  line(`forged session cookie on ${path.padEnd(28)} -> ${r.status} ${JSON.stringify(r.body).slice(0, 90)}`);
}

line('');
line('=== paths the walker cannot enumerate');
for (const path of [
  '/settings/', '/SETTINGS', '/api/settings/integrations/', '/api/diagnostics/../settings/integrations',
  '/api/diagnostics/invented', '/api/diagnostics', '/_next/../settings', '/labs/2026-08-21', '/api/measurements',
]) {
  const r = await anon.get(path);
  line(`  ${path.padEnd(42)} -> ${r.status} ${r.headers.get('location') ?? ''}`);
}

line('');
line('=== the gate cannot be talked into a session');
const g = client();
await g.get('/sign-in');
for (const [path, body] of [
  ['/api/auth/passkey/authentication/options', {}],
  ['/api/auth/passkey/authentication/verify', { ceremonyId: 'made-up', response: { id: 'x' } }],
  ['/sign-in/recover', {}],
]) {
  const r = await g.post(path, body);
  line(`  POST ${path.padEnd(46)} -> ${r.status}, session issued: ${Boolean(g.cookie('vernier_session'))}`);
}
const badLink = await anon.get('/sign-in/recover?token=' + 'z'.repeat(43));
line(`  GET  /sign-in/recover with an invented token          -> ${badLink.status}, session issued: ${Boolean(anon.cookie('vernier_session'))}`);
