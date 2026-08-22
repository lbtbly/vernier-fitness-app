import { webkit } from '/Users/lambertbouley/Claude/lbtbly-fitness-app/node_modules/playwright/index.mjs';
import { execFileSync } from 'node:child_process';
const root='/Users/lambertbouley/Claude/lbtbly-fitness-app';
const base='https://lamberts-mac-mini.tailda76d6.ts.net';
const q=(s)=>execFileSync('docker',['compose','exec','-T','db','sh','-c',`psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c ${JSON.stringify(s.replace(/\s+/g,' ').trim())}`],{cwd:root,encoding:'utf8'}).trim();
q('truncate measurement, source_record, import_question, idempotency_key, write_request');
execFileSync('docker',['compose','restart','app'],{cwd:root,encoding:'utf8'});
execFileSync('bash',['-c',`for i in $(seq 1 60); do curl -fsS ${base}/healthz >/dev/null 2>&1 && exit 0; sleep 1; done; exit 1`],{cwd:root,encoding:'utf8'});
const link=execFileSync('bash',['scripts/recovery.sh','link','20'],{cwd:root,encoding:'utf8'}).split('\n').filter(l=>l.startsWith('https://')).at(-1).trim();
const browser=await webkit.launch();
const ctx=await browser.newContext({viewport:{width:393,height:852}});
const page=await ctx.newPage();
await page.goto(link); await page.waitForLoadState('networkidle');

const plans = [
  ['waist',   async()=>{ await page.getByRole('button',{name:'Up half a centimetre'}).click(); return 1; }],
  ['energy',  async()=>{ await page.getByRole('button',{name:'Energy, 3 of 5'}).click(); return 1; }],
  ['fatigue', async()=>{ await page.getByRole('button',{name:'Fatigue, 2 of 5'}).click(); return 1; }],
  ['hunger',  async()=>{ await page.getByRole('button',{name:'Hunger, 4 of 5'}).click(); return 1; }],
  ['satiety', async()=>{ await page.getByRole('button',{name:'Satiety after eating, 5 of 5'}).click(); return 1; }],
  ['note',    async()=>{ const t=page.locator('.sheet textarea').first(); await t.click(); await t.type('Knee fine.'); return 1; }],
];
for (const [name, act] of plans) {
  await page.goto(base+'/'); await page.waitForLoadState('networkidle');
  let taps=0;
  await page.getByRole('button',{name:'Quick log'}).click(); taps+=1;
  await page.waitForSelector('.sheet'); await page.waitForTimeout(1200);
  taps += await act();
  await page.getByRole('button',{name:'Save',exact:true}).click(); taps+=1;
  await page.waitForTimeout(1600);
  console.log(`${name}: ${taps} taps from Today`);
}
await page.waitForTimeout(2500);
console.log('--- stored ---');
console.log(q("select metric || ' | ' || raw_value || ' | ' || unit || ' | ' || source || ' | ' || confidence from measurement where source='manual' order by metric"));
console.log('rows written by the quick log:', q("select count(*) from measurement where source='manual'"));
await browser.close();
