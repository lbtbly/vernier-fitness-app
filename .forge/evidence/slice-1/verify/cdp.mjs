// Independent CDP driver written by the verifier. No project code reused.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch() {
  const profile = mkdtempSync(join(tmpdir(), 'verify-chrome-'));
  const child = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', '--allow-insecure-localhost',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore' });
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) return child; } catch {}
    await sleep(250);
  }
  throw new Error('chrome did not open the debugging port');
}

export async function connectBrowser() {
  const v = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
  return wrap(v.webSocketDebuggerUrl);
}

export async function newTab() {
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  return wrap(t.webSocketDebuggerUrl);
}

async function wrap(url) {
  const socket = new WebSocket(url);
  await new Promise((res, rej) => { socket.addEventListener('open', res, { once: true }); socket.addEventListener('error', rej, { once: true }); });
  let id = 0; const pending = new Map(); const events = [];
  socket.addEventListener('message', (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    } else if (msg.method) events.push(msg);
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const mid = ++id; pending.set(mid, { resolve, reject });
    socket.send(JSON.stringify(sessionId ? { id: mid, method, params, sessionId } : { id: mid, method, params }));
    setTimeout(() => { if (pending.has(mid)) { pending.delete(mid); reject(new Error(`timeout ${method}`)); } }, 30000);
  });
  const waitFor = async (method, ms = 20000) => {
    const start = Date.now();
    while (Date.now() - start < ms) {
      const i = events.findIndex((e) => e.method === method);
      if (i >= 0) return events.splice(i, 1)[0];
      await sleep(50);
    }
    return null;
  };
  return { send, events, waitFor, close: () => socket.close() };
}
export { sleep };
