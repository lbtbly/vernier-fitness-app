import { launch, newTab, sleep } from './cdp.mjs';
import { writeFileSync } from 'node:fs';

const ORIGIN = process.env.ORIGIN ?? 'https://lamberts-mac-mini.tailda76d6.ts.net';
const OUT = '/private/tmp/claude-501/-Users-lambertbouley-Claude-lbtbly-fitness-app/b9d6a57d-5fec-4031-9628-8b7750465468/scratchpad/vshots';
const ROUTES = [['/', 'today'], ['/health', 'health'], ['/train', 'train'], ['/eat', 'eat'], ['/settings', 'settings'], ['/sign-in', 'sign-in'], ['/offline', 'offline'], ['/nope', 'notfound']];
const VIEWPORTS = [[393, 852, true], [768, 1024, false], [1280, 800, false]];

const PROBE = `(() => {
  const out = { scrollWidth: document.scrollingElement.scrollWidth, innerWidth: window.innerWidth,
    docHeight: document.scrollingElement.scrollHeight, overlaps: [], tokens: {}, targets: [], focus: null };
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05; };
  // overlap: compare siblings only, skip absolutely/fixed positioned chrome
  const nodes = [...document.querySelectorAll('body *')];
  const groups = new Map();
  for (const el of nodes) {
    if (!vis(el)) continue;
    const s = getComputedStyle(el);
    if (s.position === 'fixed' || s.position === 'absolute') continue;
    if (el.closest('svg')) continue;
    const p = el.parentElement; if (!p) continue;
    if (!groups.has(p)) groups.set(p, []);
    groups.get(p).push(el);
  }
  const desc = (el) => el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).join('.') : '');
  for (const [, sibs] of groups) {
    for (let i = 0; i < sibs.length; i++) for (let j = i + 1; j < sibs.length; j++) {
      const a = sibs[i].getBoundingClientRect(), b = sibs[j].getBoundingClientRect();
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 1 && oy > 1) out.overlaps.push({ a: desc(sibs[i]), b: desc(sibs[j]), ox: Math.round(ox), oy: Math.round(oy) });
    }
  }
  // clipped or overflowing text
  out.clipped = [...document.querySelectorAll('body *')].filter((el) => {
    if (!vis(el) || el.children.length) return false;
    return el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
  }).map((el) => desc(el) + ' :: ' + (el.textContent || '').slice(0, 40));
  const cs = getComputedStyle(document.documentElement);
  for (const k of ['--bg','--surface','--text','--accent','--focus','--touch','--t-display','--s4','--r-lg','--font'])
    out.tokens[k] = cs.getPropertyValue(k).trim();
  const h1 = document.querySelector('h1');
  if (h1) { const s = getComputedStyle(h1); out.h1 = { size: s.fontSize, lh: s.lineHeight, ls: s.letterSpacing, weight: s.fontWeight, color: s.color, family: s.fontFamily.slice(0, 30) }; }
  const bodyCS = getComputedStyle(document.body);
  out.body = { bg: bodyCS.backgroundColor, color: bodyCS.color, size: bodyCS.fontSize, lh: bodyCS.lineHeight };
  const bar = document.querySelector('.tabbar');
  if (bar) { const r = bar.getBoundingClientRect(); const s = getComputedStyle(bar);
    out.tabbar = { h: Math.round(r.height), top: Math.round(r.top), bg: s.backgroundColor, borderTop: s.borderTopWidth + ' ' + s.borderTopColor,
      items: [...bar.querySelectorAll('a')].map((a) => { const ar = a.getBoundingClientRect(); const as = getComputedStyle(a);
        return { label: a.textContent.trim(), w: Math.round(ar.width), h: Math.round(ar.height), color: as.color, current: a.getAttribute('aria-current') }; }) }; }
  out.targets = [...document.querySelectorAll('a,button,input,[tabindex]')].map((el) => { const r = el.getBoundingClientRect();
    return { el: desc(el), w: Math.round(r.width), h: Math.round(r.height) }; }).filter((t) => t.h > 0);
  return JSON.stringify(out);
})()`;

const chrome = await launch();
const tab = await newTab();
await tab.send('Page.enable'); await tab.send('Runtime.enable'); await tab.send('Log.enable'); await tab.send('Network.enable');
const report = {};
for (const [w, h, mobile] of VIEWPORTS) {
  for (const [path, name] of ROUTES) {
    tab.events.length = 0;
    await tab.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile });
    await tab.send('Page.navigate', { url: ORIGIN + path });
    await tab.waitFor('Page.loadEventFired', 20000);
    await sleep(700);
    const r = await tab.send('Runtime.evaluate', { expression: PROBE, returnByValue: true });
    const data = JSON.parse(r.result.value);
    const consoleErrors = tab.events.filter((e) => (e.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(e.params.type)) || e.method === 'Runtime.exceptionThrown' || (e.method === 'Log.entryAdded' && ['error'].includes(e.params.entry.level)))
      .map((e) => e.method + ': ' + JSON.stringify(e.params).slice(0, 300));
    const urls = new Map(tab.events.filter((e)=>e.method==='Network.requestWillBeSent').map((e)=>[e.params.requestId, e.params.request.url]));
    const failed = tab.events.filter((e) => e.method === 'Network.loadingFailed').map((e) => e.params.errorText + ' ' + e.params.type + ' ' + (urls.get(e.params.requestId)||'?'));
    report[`${w}-${name}`] = { ...data, consoleErrors, failed };
    const shot = await tab.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    writeFileSync(`${OUT}/${w}-${name}.png`, Buffer.from(shot.data, 'base64'));
  }
}
writeFileSync(OUT + '/report.json', JSON.stringify(report, null, 1));
console.log('routes captured:', Object.keys(report).length);
for (const [k, v] of Object.entries(report)) {
  const flags = [];
  if (v.scrollWidth > v.innerWidth) flags.push(`HSCROLL ${v.scrollWidth}>${v.innerWidth}`);
  if (v.overlaps.length) flags.push(`OVERLAP ${v.overlaps.length}`);
  if (v.clipped.length) flags.push(`CLIPPED ${v.clipped.length}`);
  if (v.consoleErrors.length) flags.push(`CONSOLE ${v.consoleErrors.length}`);
  if (v.failed.length) flags.push(`NETFAIL ${v.failed.join(',')}`);
  const small = (v.targets || []).filter((t) => t.h < 44);
  if (small.length) flags.push(`SMALLTARGET ${small.map((t) => t.el + ':' + t.h).join(' ')}`);
  console.log(k.padEnd(18), flags.length ? flags.join(' | ') : 'clean', '| h1=', JSON.stringify(v.h1));
}
tab.close(); chrome.kill();
