import { launch, newTab, sleep } from './cdp.mjs';
import { writeFileSync } from 'node:fs';
const ORIGIN = 'https://lamberts-mac-mini.tailda76d6.ts.net';
const OUT = '/private/tmp/claude-501/-Users-lambertbouley-Claude-lbtbly-fitness-app/b9d6a57d-5fec-4031-9628-8b7750465468/scratchpad/vshots';
const chrome = await launch();
const tab = await newTab();
await tab.send('Page.enable'); await tab.send('Runtime.enable');
await tab.send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 2, mobile: false });
await tab.send('Page.navigate', { url: ORIGIN + '/' });
await tab.waitFor('Page.loadEventFired'); await sleep(1200);
const key = async () => {
  await tab.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9, key: 'Tab', code: 'Tab' });
  await tab.send('Input.dispatchKeyEvent', { type: 'char', text: '\t' });
  await tab.send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9, key: 'Tab', code: 'Tab' });
  await sleep(180);
};
for (let i = 0; i < 7; i++) {
  await key();
  const r = await tab.send('Runtime.evaluate', { expression: `(() => { const el = document.activeElement; if (!el || el === document.body) return JSON.stringify({el:'body'}); const s = getComputedStyle(el);
    return JSON.stringify({ el: el.tagName + (el.className ? '.' + el.className : ''), text: (el.textContent||'').trim().slice(0,26),
      outline: s.outlineWidth + ' ' + s.outlineStyle + ' ' + s.outlineColor, offset: s.outlineOffset, matches: el.matches(':focus-visible') }); })()`, returnByValue: true });
  console.log('tab stop', i + 1, r.result.value);
  if (i === 0) { const s = await tab.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(OUT + '/focus-keyboard.png', Buffer.from(s.data, 'base64')); }
}
tab.close(); chrome.kill();
