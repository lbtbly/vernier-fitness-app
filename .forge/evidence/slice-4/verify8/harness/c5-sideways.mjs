import { chromium, webkit } from 'playwright';
import { execFileSync } from 'node:child_process';
const ROOT='/Users/lambertbouley/Claude/lbtbly-fitness-app'; const SCRATCH='http://127.0.0.1:3101';
const sh=(f,a,e)=>execFileSync(f,a,{cwd:ROOT,encoding:'utf8',env:{...process.env,...e}}).trim();
const q=(s)=>sh('docker',['compose','exec','-T','db','sh','-c',`psql -U "$POSTGRES_USER" -d vernier_scratch -At -c ${JSON.stringify(s.replace(/\s+/g,' ').trim())}`]);
const link=()=>sh('bash',['scripts/recovery.sh','link','10'],{RECOVERY_CONTAINER:'vernier-scratch'}).split('\n').at(-1).trim();
async function wait(){for(let i=0;i<90;i++){try{const r=await fetch(`${SCRATCH}/healthz`);if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,500));}throw new Error('no scratch');}
async function owner(){if(Number(q('select count(*) from owner'))>0)return;const p=`S-${crypto.randomUUID()}-Q9!`;const f=await fetch(`${SCRATCH}/sign-in`,{redirect:'manual'});const c=f.headers.getSetCookie().map(l=>l.split(';')[0]).find(x=>x.startsWith('vernier_csrf='))??'';const m=await fetch(`${SCRATCH}/api/auth/bootstrap`,{method:'POST',redirect:'manual',headers:{'content-type':'application/json',cookie:c,'x-vernier-csrf':c.slice(13)},body:JSON.stringify({password:p,repeat:p})});if(m.status!==201)throw new Error('bootstrap '+m.status);}
async function jarOf(){for(let i=0;i<6;i++){try{const r=await fetch(link(),{redirect:'manual'});const j=new Map();for(const l of r.headers.getSetCookie()){const p=l.split(';')[0];const s=p.indexOf('=');j.set(p.slice(0,s),p.slice(s+1));}if(j.get('vernier_session'))return j;}catch{}await new Promise(r=>setTimeout(r,1000));}throw new Error('no session');}
const cookiesFor=(j)=>[...j].map(([name,value])=>({name,value,domain:'127.0.0.1',path:'/',secure:false,httpOnly:true,sameSite:'Strict'}));
sh('bash',['scripts/test-stack.sh','reset'],{DEMO_MODE:'1'});
await wait(); await owner(); const jar=await jarOf();
for (const engine of ['chrome','webkit']) {
  const b = engine==='chrome' ? await chromium.launch({channel:'chrome'}) : await webkit.launch();
  for (const v of [[393,852],[768,1024],[1280,900]]) {
    const ctx=await b.newContext({baseURL:SCRATCH,viewport:{width:v[0],height:v[1]},serviceWorkers:'block'});
    await ctx.route('**/api/diagnostics/launch',(r)=>r.fulfill({status:200,contentType:'application/json',body:'{"recorded":false}'}));
    await ctx.addCookies(cookiesFor(jar));
    const page=await ctx.newPage();
    await page.goto(`${SCRATCH}/`,{waitUntil:'networkidle'});
    await page.getByRole('button',{name:'Quick log',exact:true}).click();
    await page.locator('.sheet').first().waitFor();
    await page.getByRole('button',{name:'Energy, 4 of 5'}).waitFor({timeout:20000});
    await page.waitForTimeout(600);
    const r=await page.evaluate(()=>{
      const d=document.documentElement;
      const sheet=document.querySelector('.sheet').getBoundingClientRect();
      const scrim=document.querySelector('.scrim').getBoundingClientRect();
      const over=[...document.querySelector('.sheet').querySelectorAll('*')].filter(n=>{const b=n.getBoundingClientRect();return b.width>0&&(b.left<-0.5||b.right>d.clientWidth+0.5);}).map(n=>n.className||n.tagName);
      return {scrollWidth:d.scrollWidth,clientWidth:d.clientWidth,bodyScroll:document.body.scrollWidth,
        sheet:[Math.round(sheet.left),Math.round(sheet.right)],scrim:[Math.round(scrim.left),Math.round(scrim.right)],overflowing:over};
    });
    console.log(`${engine} ${v[0]}x${v[1]} sheet open: scrollWidth ${r.scrollWidth} clientWidth ${r.clientWidth} body ${r.bodyScroll} sheet ${r.sheet} scrim ${r.scrim} elements past the edge: ${r.overflowing.length} ${r.overflowing.slice(0,3)}`);
    await ctx.close();
  }
  await b.close();
}
