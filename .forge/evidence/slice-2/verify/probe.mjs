// Verifier's own client. No project code imported.
const BASE = 'https://lamberts-mac-mini.tailda76d6.ts.net';

export function client(base = BASE) {
  const jar = new Map();
  let last = [];
  const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  const absorb = (r) => {
    last = r.headers.getSetCookie();
    for (const line of last) {
      const pair = line.split(';')[0];
      const i = pair.indexOf('=');
      const n = pair.slice(0, i).trim();
      const v = pair.slice(i + 1).trim();
      if (v === '') jar.delete(n); else jar.set(n, v);
    }
  };
  const shape = async (r) => {
    const text = await r.text();
    let body = {};
    try { body = JSON.parse(text); } catch {}
    return { status: r.status, headers: r.headers, setCookie: last, body, text };
  };
  return {
    jar,
    cookie: (n) => jar.get(n),
    async get(path, headers = {}) {
      const r = await fetch(`${base}${path}`, { redirect: 'manual', headers: { cookie: cookieHeader(), ...headers } });
      absorb(r); return shape(r);
    },
    async post(path, body, opts = {}) {
      const headers = { 'content-type': 'application/json', cookie: cookieHeader() };
      if (opts.csrf !== false) headers['x-vernier-csrf'] = opts.csrfValue ?? jar.get('vernier_csrf') ?? '';
      const r = await fetch(`${base}${path}`, { method: 'POST', redirect: 'manual', headers, body: JSON.stringify(body ?? {}) });
      absorb(r); return shape(r);
    },
  };
}

import { execFileSync } from 'node:child_process';
const ROOT = '/Users/lambertbouley/Claude/lbtbly-fitness-app';
export function q(sql) {
  const one = sql.replace(/\s+/g, ' ').trim();
  return execFileSync('docker', ['compose', 'exec', '-T', 'db', 'sh', '-c',
    `psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c ${JSON.stringify(one)}`],
    { cwd: ROOT, encoding: 'utf8' }).trim();
}
