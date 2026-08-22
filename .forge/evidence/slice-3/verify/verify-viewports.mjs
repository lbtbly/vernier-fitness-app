import { webkit } from '/Users/lambertbouley/Claude/lbtbly-fitness-app/node_modules/playwright/index.mjs';
import { execFileSync } from 'node:child_process';
const root='/Users/lambertbouley/Claude/lbtbly-fitness-app';
const base='https://lamberts-mac-mini.tailda76d6.ts.net';
const q=(s)=>execFileSync('docker',['compose','exec','-T','db','sh','-c',`psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c ${JSON.stringify(s.replace(/\s+/g,' ').trim())}`],{cwd:root,encoding:'utf8'}).trim();
const link=execFileSync('bash',['scripts/recovery.sh','link','20'],{cwd:root,encoding:'utf8'}).split('\n').filter(l=>l.startsWith('https://')).at(-1).trim();
const vid=q("select id from measurement where source='manual' order by id limit 1");
const sid=q("select id from source_record order by id limit 1");
const browser=await webkit.launch();
const ctx=await browser.newContext({viewport:{width:393,height:852}});
const page=await ctx.newPage();
const errs=[]; page.on('console',m=>{if(m.type()==='error')errs.push(page.url()+' :: '+m.text())}); page.on('pageerror',e=>errs.push(page.url()+' :: '+e.message));
await page.goto(link); await page.waitForLoadState('networkidle');
const paths=['/','/health','/train','/eat','/settings',`/value/${vid}`,`/source/${sid}`,'/offline'];
for (const w of [393,768,1280]) {
  await page.setViewportSize({width:w,height:900});
  for (const p of paths) {
    await page.goto(base+p); await page.waitForLoadState('networkidle');
    const r = await page.evaluate(()=>({sw:document.documentElement.scrollWidth, iw:window.innerWidth}));
    const flag = r.sw > r.iw+1 ? '  <-- HORIZONTAL SCROLL' : '';
    // placeholder copy sweep on the rendered text
    const t=(await page.locator('body').innerText());
    const bad=[...t.matchAll(/lorem|\bTBD\b|coming soon|example\.com|—/gi)].map(m=>m[0]);
    console.log(`${w} ${p}: scrollWidth=${r.sw} innerWidth=${r.iw}${flag}${bad.length? '  placeholder/em-dash: '+JSON.stringify(bad):''}`);
  }
}
console.log('CONSOLE ERRORS across all surfaces:', errs.length); errs.slice(0,10).forEach(e=>console.log('  ',e));
await browser.close();
