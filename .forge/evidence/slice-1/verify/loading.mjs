import { launch, newTab, sleep } from './cdp.mjs';
import { writeFileSync } from 'node:fs';
const ORIGIN = 'https://lamberts-mac-mini.tailda76d6.ts.net';
const OUT = '/private/tmp/claude-501/-Users-lambertbouley-Claude-lbtbly-fitness-app/b9d6a57d-5fec-4031-9628-8b7750465468/scratchpad/vshots';
const chrome = await launch();
const tab = await newTab();
await tab.send('Page.enable'); await tab.send('Runtime.enable'); await tab.send('Network.enable');
await tab.send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 2, mobile: true });
await tab.send('Network.setBypassServiceWorker', { bypass: true });
await tab.send('Page.navigate', { url: ORIGIN + '/' });
await tab.waitFor('Page.loadEventFired'); await sleep(1500);
// Slow the network so the server navigation shows its loading state.
await tab.send('Network.emulateNetworkConditions', { offline: false, latency: 3000, downloadThroughput: 20000, uploadThroughput: 20000 });
await tab.send('Runtime.evaluate', { expression: `[...document.querySelectorAll('.tabbar a')].find(a=>a.textContent.trim()==='Health').click()` });
await sleep(400);
const r = await tab.send('Runtime.evaluate', { expression: `(() => { const sk = [...document.querySelectorAll('.skel')]; const busy = document.querySelector('[aria-busy=true]');
  return JSON.stringify({ skeletons: sk.length, busy: !!busy, srText: busy ? busy.querySelector('.visually-hidden')?.textContent : null,
    sizes: sk.map(s => { const r = s.getBoundingClientRect(); const cs = getComputedStyle(s); return Math.round(r.width)+'x'+Math.round(r.height)+' '+cs.backgroundColor+' anim='+cs.animationName+' '+cs.animationDuration; }),
    hasSpinner: !!document.querySelector('[class*=spin]'), text: document.body.innerText.slice(0,120) }); })()`, returnByValue: true });
console.log('loading state:', r.result.value);
const shot = await tab.send('Page.captureScreenshot', { format: 'png' });
writeFileSync(OUT + '/loading-health.png', Buffer.from(shot.data, 'base64'));
tab.close(); chrome.kill();
