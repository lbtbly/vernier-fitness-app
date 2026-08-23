import { chromium } from 'playwright';
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
const b=await chromium.launch({channel:'chrome'});
const ctx=await b.newContext({baseURL:SCRATCH,viewport:{width:393,height:852},serviceWorkers:'block'});
await ctx.route('**/api/diagnostics/launch',(r)=>r.fulfill({status:200,contentType:'application/json',body:'{"recorded":false}'}));
await ctx.addCookies(cookiesFor(jar));
const page=await ctx.newPage();
await page.goto(`${SCRATCH}/`,{waitUntil:'networkidle'});
await page.getByRole('button',{name:'Quick log',exact:true}).click();
await page.getByRole('button',{name:'Energy, 4 of 5'}).waitFor({timeout:20000});
await page.waitForTimeout(600);
const stops=[];
for (let i=0;i<40;i++){
  const s=await page.evaluate(()=>{const a=document.activeElement;return{tag:a.tagName.toLowerCase(),label:(a.getAttribute?.('aria-label')??a.textContent??'').trim().slice(0,28),inSheet:Boolean(a.closest?.('.sheet')),isScrim:a.classList?.contains('scrim')??false};});
  stops.push(s);
  await page.keyboard.press('Tab');
}
const escaped=stops.filter(s=>!s.inSheet);
console.log('tab stops walked: '+stops.length+', outside the sheet: '+escaped.length);
console.log(stops.map((s,i)=>`${i}: ${s.inSheet?'sheet ':'OUTSIDE'} ${s.tag} ${s.label}`).join('\n'));
console.log('escape key closes: ');
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
console.log('  sheet present after Escape: '+(await page.locator('.sheet').count()));
await b.close();
