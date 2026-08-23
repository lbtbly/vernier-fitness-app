#!/usr/bin/env node
// Drives headless Chrome over the DevTools protocol with no dependency, using
// Node's built-in WebSocket. It exists so the offline screen, the worker
// registration and the layout can be proven by output rather than asserted.
//
//   node scripts/pwa-check.mjs register   registration state and scope
//   node scripts/pwa-check.mjs layout     scroll width at 393, 768 and 1280
//   node scripts/pwa-check.mjs offline [warm]  reload with the origin
//                                         unreachable; cold by default, which
//                                         never opens /offline while online
//   node scripts/pwa-check.mjs shots DIR   one capture per route per viewport
//
// The offline run expects the app to be stopped from another shell first; it
// prints what it sees either way.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME
  ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.ORIGIN ?? 'http://127.0.0.1:3000';
const PORT = 9222;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function launch() {
  const profile = mkdtempSync(join(tmpdir(), 'vernier-chrome-'));
  const child = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { stdio: 'ignore' });

  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (response.ok) return { child, profile };
    } catch {
      // not up yet
    }
    await sleep(250);
  }
  throw new Error('Chrome never opened its debugging port.');
}

async function openTab() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const socket = new WebSocket(list.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  let nextId = 0;
  const pending = new Map();
  const events = [];
  socket.addEventListener('message', (message) => {
    const frame = JSON.parse(message.data);
    if (frame.id && pending.has(frame.id)) {
      const { resolve, reject } = pending.get(frame.id);
      pending.delete(frame.id);
      if (frame.error) reject(new Error(frame.error.message));
      else resolve(frame.result);
      return;
    }
    events.push(frame);
  });

  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = (nextId += 1);
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
  });

  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };

  const navigate = async (url) => {
    await send('Page.navigate', { url });
    await sleep(1500);
  };

  return { send, evaluate, navigate, events, close: () => socket.close() };
}

async function screenshot(tab, path, width, height) {
  await tab.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 2, mobile: true,
  });
  await sleep(400);
  const shot = await tab.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path, Buffer.from(shot.data, 'base64'));
}

const MEASURE = `(() => {
  const wide = [...document.querySelectorAll('*')]
    .filter((node) => node.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
    .slice(0, 8)
    .map((node) => node.tagName.toLowerCase()
      + (node.className && typeof node.className === 'string' ? '.' + node.className.trim().split(/\\s+/).join('.') : '')
      + ' right=' + Math.round(node.getBoundingClientRect().right)
      + ' width=' + Math.round(node.getBoundingClientRect().width));
  return {
    viewport: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    overflowing: wide,
  };
})()`;

const REGISTRATION = `(async () => {
  const registration = await navigator.serviceWorker.ready;
  return {
    scope: registration.scope,
    active: registration.active ? registration.active.state : null,
    scriptURL: registration.active ? registration.active.scriptURL : null,
    controller: navigator.serviceWorker.controller ? navigator.serviceWorker.controller.scriptURL : null,
    cached: (await caches.keys()),
    // BY NAME, NOT BY POSITION. This read the first cache Cache Storage
    // happened to return, which was the shell while there was only one. F66
    // added a second, named for the media manifest's own hash, holding 44
    // demonstrations, and an evidence line that prints whichever came back
    // first is an evidence line that means nothing. Both are reported, each
    // with its own count.
    shellEntries: await (async () => {
      const shell = (await caches.keys()).find((name) => name.startsWith('vernier-shell-'));
      if (!shell) return [];
      const entries = await (await caches.open(shell)).keys();
      return entries.map((request) => new URL(request.url).pathname).sort();
    })(),
    mediaEntries: await (async () => {
      const media = (await caches.keys()).filter((name) => name.startsWith('vernier-media-'));
      let held = 0;
      for (const name of media) held += (await (await caches.open(name)).keys()).length;
      return held;
    })(),
  };
})()`;

const READ_SCREEN = `(() => ({
  title: document.title,
  heading: document.querySelector('h1') ? document.querySelector('h1').textContent : null,
  text: document.body.innerText.replace(/\\s+/g, ' ').trim().slice(0, 700),
  buttons: [...document.querySelectorAll('button, a.btn')].map((node) => node.textContent.trim()),
}))()`;

async function main() {
  const mode = process.argv[2] ?? 'register';
  const { child, profile } = await launch();
  const tab = await openTab();

  try {
    await tab.send('Page.enable');
    await tab.send('Runtime.enable');

    if (mode === 'layout') {
      for (const [width, height] of [[393, 852], [768, 1024], [1280, 900]]) {
        await tab.send('Emulation.setDeviceMetricsOverride', {
          width, height, deviceScaleFactor: 1, mobile: width < 700,
        });
        for (const path of ['/', '/health', '/train', '/eat', '/settings', '/sign-in', '/offline']) {
          await tab.navigate(`${ORIGIN}${path}`);
          const measured = await tab.evaluate(MEASURE);
          const clean = measured.scrollWidth <= measured.viewport;
          console.log(
            `${width}px ${path.padEnd(12)} viewport=${measured.viewport} scrollWidth=${measured.scrollWidth} ${clean ? 'no horizontal scroll' : 'OVERFLOW ' + JSON.stringify(measured.overflowing)}`,
          );
        }
      }
    }

    if (mode === 'shots') {
      const dir = process.argv[3] ?? '.';
      for (const [width, height] of [[393, 852], [768, 1024], [1280, 900]]) {
        for (const path of ['/', '/health', '/train', '/eat', '/settings', '/sign-in', '/offline']) {
          await tab.send('Emulation.setDeviceMetricsOverride', {
            width, height, deviceScaleFactor: 2, mobile: width < 700,
          });
          await tab.navigate(`${ORIGIN}${path}`);
          const name = `${width}-${path === '/' ? 'today' : path.slice(1)}.png`;
          await screenshot(tab, join(dir, name), width, height);
          console.log(`${name}`);
        }
      }
    }

    if (mode === 'register') {
      await tab.send('Emulation.setDeviceMetricsOverride', {
        width: 393, height: 852, deviceScaleFactor: 2, mobile: true,
      });
      await tab.navigate(`${ORIGIN}/`);
      await sleep(2500);
      console.log(JSON.stringify(await tab.evaluate(REGISTRATION), null, 2));
    }

    if (mode === 'offline') {
      await tab.send('Emulation.setDeviceMetricsOverride', {
        width: 393, height: 852, deviceScaleFactor: 2, mobile: true,
      });
      // Cold is the default and the real path: /offline is never opened while
      // the network is up, so nothing about it can already be warm in this
      // profile. `offline warm` opens it first, which must change nothing.
      const warm = process.argv[3] === 'warm';
      await tab.navigate(`${ORIGIN}/`);
      await sleep(2500);
      const before = await tab.evaluate(REGISTRATION);
      console.log(`run: ${warm ? 'warm, /offline opened while online' : 'cold, /offline never opened'}`);
      console.log(`worker scope: ${before.scope}`);
      console.log(`worker script: ${before.scriptURL}, state ${before.active}`);
      console.log(`precached shell: ${before.shellEntries.join(' ')}`);
      console.log(`precached demonstrations: ${before.mediaEntries}, caches ${before.cached.join(' ')}`);

      // A route the owner really opened. Its document and the chunks it pulled
      // both went through the worker, so both are in the cache.
      await tab.navigate(`${ORIGIN}/train`);
      await sleep(1500);
      if (warm) {
        await tab.navigate(`${ORIGIN}/offline`);
        await sleep(1200);
      }

      // The worker runs in its own target, and network conditions are set per
      // target. Setting only the page offline leaves the worker's own fetch
      // reaching the origin, which is not the test anyone means.
      const offline = { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 };
      await tab.send('Network.enable');
      await tab.send('Network.emulateNetworkConditions', offline);

      const { targetInfos } = await tab.send('Target.getTargets');
      const workers = targetInfos.filter((info) => info.type === 'service_worker');
      for (const worker of workers) {
        const { sessionId } = await tab.send('Target.attachToTarget', {
          targetId: worker.targetId, flatten: true,
        });
        await tab.send('Network.enable', {}, sessionId);
        await tab.send('Network.emulateNetworkConditions', offline, sessionId);
      }
      console.log(`network: disabled on the page and on ${workers.length} worker target(s)`);

      await tab.navigate(`${ORIGIN}/train`);
      await sleep(1200);
      const cachedRoute = await tab.evaluate(READ_SCREEN);
      console.log(`offline, route opened while online /train -> ${JSON.stringify(cachedRoute.heading)}`);

      await tab.navigate(`${ORIGIN}/a-route-never-visited`);
      await sleep(1200);
      const fallback = await tab.evaluate(READ_SCREEN);
      console.log(`offline, unvisited route -> ${JSON.stringify(fallback.heading)}`);
      console.log(`offline copy: ${fallback.text}`);
      console.log(`offline action: ${JSON.stringify(fallback.buttons)}`);
      console.log(`offline scripts requested: ${JSON.stringify(await tab.evaluate(
        `[...document.querySelectorAll('script[src], link[rel=stylesheet]')].map((n) => n.src || n.href)`,
      ))}`);
      await screenshot(tab, process.env.SHOT ?? 'offline.png', 393, 852);
      console.log(`offline capture: ${process.env.SHOT ?? 'offline.png'}`);
    }
  } finally {
    tab.close();
    child.kill();
    await sleep(300);
    rmSync(profile, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
