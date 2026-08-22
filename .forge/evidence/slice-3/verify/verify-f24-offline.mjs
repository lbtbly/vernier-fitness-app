import { chromium } from '/Users/lambertbouley/Claude/lbtbly-fitness-app/node_modules/playwright/index.mjs';
import { execFileSync } from 'node:child_process';
const root='/Users/lambertbouley/Claude/lbtbly-fitness-app';
const base='https://lamberts-mac-mini.tailda76d6.ts.net';
const SD='/private/tmp/claude-501/-Users-lambertbouley-Claude-lbtbly-fitness-app/b9d6a57d-5fec-4031-9628-8b7750465468/scratchpad';
const q=(s)=>execFileSync('docker',['compose','exec','-T','db','sh','-c',`psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c ${JSON.stringify(s.replace(/\s+/g,' ').trim())}`],{cwd:root,encoding:'utf8'}).trim();

q('truncate measurement, source_record, import_question, idempotency_key, write_request');
execFileSync('docker',['compose','restart','app'],{cwd:root,encoding:'utf8'});
execFileSync('bash',['-c',`for i in $(seq 1 60); do curl -fsS ${base}/healthz >/dev/null 2>&1 && exit 0; sleep 1; done; exit 1`],{cwd:root,encoding:'utf8'});
console.log('rows after re-seed:', q('select count(*) from measurement'));

const link=execFileSync('bash',['scripts/recovery.sh','link','20'],{cwd:root,encoding:'utf8'}).split('\n').filter(l=>l.startsWith('https://')).at(-1).trim();
const browser=await chromium.launch({ channel:'chrome' });
const ctx=await browser.newContext({viewport:{width:393,height:852}, serviceWorkers:'allow'});
const page=await ctx.newPage();
const errs=[]; page.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await page.goto(link); await page.waitForLoadState('networkidle');
await page.goto(base+'/'); await page.waitForLoadState('networkidle');
const controlled = await page.waitForFunction(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  return !!(reg && reg.active && navigator.serviceWorker.controller);
}, null, { timeout: 25000 }).then(()=>true).catch(()=>false);
console.log('SW active and controlling:', controlled);
let workers = ctx.serviceWorkers();
if (workers.length === 0) { await ctx.waitForEvent('serviceworker',{timeout:10000}).catch(()=>{}); workers = ctx.serviceWorkers(); }
console.log('service worker targets:', workers.map(w=>w.url()));

// open the sheet while online, so the sheet is loaded before the origin goes
await page.getByRole('button',{name:'Quick log'}).click();
await page.waitForSelector('.sheet');
await page.waitForTimeout(1500);

// ---- take EVERY target offline ----
await ctx.setOffline(true);
await ctx.route('**/*', r=>r.abort('connectionfailed'));
const pcdp = await ctx.newCDPSession(page);
await pcdp.send('Network.enable');
await pcdp.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1});

const pageProbe = await page.evaluate(async()=>{try{const r=await fetch('/healthz',{method:'HEAD',cache:'no-store'});return 'HTTP '+r.status;}catch(e){return 'FAILED: '+e.message;}});
console.log('PAGE target probe of /healthz:', pageProbe);
for (const w of workers) {
  const p = await w.evaluate(async()=>{try{const r=await fetch('/healthz',{method:'HEAD',cache:'no-store'});return 'HTTP '+r.status;}catch(e){return 'FAILED: '+e.message;}}).catch(e=>'EVAL FAILED: '+e.message);
  console.log('SERVICE_WORKER target probe of /healthz:', p);
  const p2 = await w.evaluate(async()=>{try{const r=await fetch('/api/log',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});return 'HTTP '+r.status;}catch(e){return 'FAILED: '+e.message;}}).catch(e=>'EVAL FAILED: '+e.message);
  console.log('SERVICE_WORKER target probe of POST /api/log:', p2);
}
// independent proof from outside the browser that the app itself is still up
console.log('host curl /healthz (the origin is up, only the browser is cut off):',
  execFileSync('bash',['-c',`curl -s -o /dev/null -w '%{http_code}' ${base}/healthz`],{encoding:'utf8'}));

// ---- the offline write ----
await page.getByRole('button',{name:'Energy, 2 of 5'}).click();
await page.getByRole('button',{name:'Save',exact:true}).click();
await page.waitForTimeout(1500);
const queued = await page.evaluate(async()=>{
  const db=await new Promise((res,rej)=>{const r=indexedDB.open('vernier',1);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
  const rows=await new Promise((res,rej)=>{const r=db.transaction('outbox','readonly').objectStore('outbox').getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
  db.close(); return rows;
});
console.log('outbox after the offline save:', JSON.stringify(queued.map(r=>({id:r.id,url:r.url,body:r.body,parked:r.parked}))));
console.log('rows in the database while offline (energy/manual):', q("select count(*) from measurement where metric='energy' and source='manual'"));

// what Today shows with the sheet closed
await page.screenshot({path:`${SD}/vfy-f24-offline-sheet.png`});
await page.locator('.sheet').getByRole('button',{name:'Close the quick log'}).click().catch(()=>{});
await page.waitForTimeout(600);
await page.screenshot({path:`${SD}/vfy-f24-offline-today.png`, fullPage:true});
console.log('--- Today text while offline with the sheet closed ---');
console.log(await page.locator('body').innerText());

// ---- back online ----
await ctx.unroute('**/*');
await pcdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
await ctx.setOffline(false);
for (let i=0;i<40;i++){
  const left = await page.evaluate(async()=>{
    const db=await new Promise((res,rej)=>{const r=indexedDB.open('vernier',1);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
    const rows=await new Promise((res,rej)=>{const r=db.transaction('outbox','readonly').objectStore('outbox').getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
    db.close(); return rows.length;
  });
  if (left===0) break;
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(1000);
}
const key = queued[0]?.id;
console.log('outbox drained. key:', key);
console.log('measurement rows for that key:', q(`select count(*) from measurement where id in (select id from measurement)`), '(all)');
console.log('energy manual rows:', q("select count(*) from measurement where metric='energy' and source='manual'"));
console.log('idempotency rows for the key:', q(`select count(*) from idempotency_key where key='${key}'`));
console.log('write_request rows for the key:', q(`select outcome, count(*) from write_request where key='${key}' group by outcome`));
console.log('console errors:', errs.length, errs.slice(0,5));
await browser.close();
