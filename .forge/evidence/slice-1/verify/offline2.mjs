import { launch, newTab, connectBrowser, sleep } from './cdp.mjs';
import { writeFileSync } from 'node:fs';
const ORIGIN = 'https://lamberts-mac-mini.tailda76d6.ts.net';
const OUT = '/private/tmp/claude-501/-Users-lambertbouley-Claude-lbtbly-fitness-app/b9d6a57d-5fec-4031-9628-8b7750465468/scratchpad/vshots';
const VISIT_OFFLINE_FIRST = process.argv[2] === 'warm';
const chrome = await launch();
const browser = await connectBrowser();
const tab = await newTab();
await tab.send('Page.enable'); await tab.send('Runtime.enable'); await tab.send('Network.enable');
await tab.send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 2, mobile: true });

const go = async (u) => { await tab.send('Page.navigate', { url: u }); await tab.waitFor('Page.loadEventFired', 20000); await sleep(1500); };
await go(ORIGIN + '/');
await tab.send('Runtime.evaluate', { expression: `navigator.serviceWorker.ready`, awaitPromise: true });
// The owner's realistic session: he taps the tabs.
for (const p of ['/health', '/train', '/eat', '/settings', '/']) await go(ORIGIN + p);
if (VISIT_OFFLINE_FIRST) await go(ORIGIN + '/offline');

const targets = await browser.send('Target.getTargets');
for (const t of targets.targetInfos.filter(t => t.type === 'service_worker' && t.url.startsWith(ORIGIN))) {
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
  await browser.send('Network.enable', {}, sessionId);
  await browser.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 }, sessionId);
}
await tab.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });

tab.events.length = 0;
await tab.send('Page.navigate', { url: ORIGIN + '/settings/backup' });
await tab.waitFor('Page.loadEventFired', 20000);
await sleep(6000);
const r = await tab.send('Runtime.evaluate', { expression: `JSON.stringify({title: document.title, h1: (document.querySelector('h1')||{}).textContent, text: document.body.innerText})`, returnByValue: true });
console.log(VISIT_OFFLINE_FIRST ? '--- WARM (offline page visited while online) ---' : '--- COLD (offline page never visited) ---');
console.log(r.result.value);
const failed = tab.events.filter(e => e.method === 'Network.loadingFailed');
const urls = new Map(tab.events.filter(e=>e.method==='Network.requestWillBeSent').map(e=>[e.params.requestId, e.params.request.url]));
console.log('failed requests:', failed.map(e => e.params.errorText + ' ' + (urls.get(e.params.requestId)||'?')));
const shot = await tab.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
writeFileSync(`${OUT}/offline-${VISIT_OFFLINE_FIRST ? 'warm' : 'cold'}.png`, Buffer.from(shot.data, 'base64'));
tab.close(); browser.close(); chrome.kill();
