import { webkit } from 'playwright';
import { execFileSync } from 'node:child_process';
const ROOT='/Users/lambertbouley/Claude/lbtbly-fitness-app';
const SHOTS=process.env.SHOTS_DIR; const SCRATCH='http://127.0.0.1:3101';
const sh=(f,a,e)=>execFileSync(f,a,{cwd:ROOT,encoding:'utf8',env:{...process.env,...e}}).trim();
const q=(s)=>sh('docker',['compose','exec','-T','db','sh','-c',`psql -U "$POSTGRES_USER" -d vernier_scratch -At -c ${JSON.stringify(s.replace(/\s+/g,' ').trim())}`]);
const link=()=>sh('bash',['scripts/recovery.sh','link','10'],{RECOVERY_CONTAINER:'vernier-scratch'}).split('\n').at(-1).trim();
async function wait(){for(let i=0;i<90;i++){try{const r=await fetch(`${SCRATCH}/healthz`);if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,500));}throw new Error('no scratch');}
async function owner(){if(Number(q('select count(*) from owner'))>0)return;const p=`S-${crypto.randomUUID()}-Q9!`;const f=await fetch(`${SCRATCH}/sign-in`,{redirect:'manual'});const c=f.headers.getSetCookie().map(l=>l.split(';')[0]).find(x=>x.startsWith('vernier_csrf='))??'';const m=await fetch(`${SCRATCH}/api/auth/bootstrap`,{method:'POST',redirect:'manual',headers:{'content-type':'application/json',cookie:c,'x-vernier-csrf':c.slice(13)},body:JSON.stringify({password:p,repeat:p})});if(m.status!==201)throw new Error('bootstrap '+m.status);}
async function jarOf(){for(let i=0;i<6;i++){try{const r=await fetch(link(),{redirect:'manual'});const j=new Map();for(const l of r.headers.getSetCookie()){const p=l.split(';')[0];const s=p.indexOf('=');j.set(p.slice(0,s),p.slice(s+1));}if(j.get('vernier_session'))return j;}catch{}await new Promise(r=>setTimeout(r,1000));}throw new Error('no session');}
const cookiesFor=(j)=>[...j].map(([name,value])=>({name,value,domain:'127.0.0.1',path:'/',secure:false,httpOnly:true,sameSite:'Strict'}));
const VIEWPORTS=[{name:'393x852',width:393,height:852},{name:'1280x900',width:1280,height:900}];
const b=await webkit.launch();
for (const v of VIEWPORTS){
  sh('bash',['scripts/test-stack.sh','reset'],{DEMO_MODE:'1'});
  await wait(); await owner(); const jar=await jarOf();
  const ctx=await b.newContext({baseURL:SCRATCH,viewport:{width:v.width,height:v.height},deviceScaleFactor:2,serviceWorkers:'block'});
  await ctx.route('**/api/diagnostics/launch',(r)=>r.fulfill({status:200,contentType:'application/json',body:'{"recorded":false}'}));
  await ctx.addCookies(cookiesFor(jar));
  const page=await ctx.newPage();
  await page.goto(`${SCRATCH}/`,{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'Quick log',exact:true}).click();
  await page.locator('.sheet [data-state="stale"]').first().waitFor({timeout:20000});
  await page.getByRole('button',{name:'Up half a centimetre',exact:true}).click();
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.locator('[data-just-logged]').first().waitFor({timeout:20000});
  // Wait until the entry really uploaded, so the next read finds a reading with no age on it.
  for(let i=0;i<40;i++){ if(q("select count(*) from measurement where metric='waist' and source='manual'")!=='0') break; await new Promise(r=>setTimeout(r,500)); }
  await page.reload({waitUntil:'networkidle'});
  await page.getByRole('button',{name:'Quick log',exact:true}).click();
  await page.locator('.sheet').first().waitFor();
  await page.getByRole('button',{name:'Energy, 4 of 5'}).waitFor({timeout:20000});
  await page.locator('.sheet [data-state="stale"]').first().waitFor({state:'detached',timeout:20000}).catch(()=>{});
  await page.locator('.sheet').first().evaluate(n=>Promise.all(n.getAnimations().map(a=>a.finished))).catch(()=>{});
  await page.waitForTimeout(600);
  const read=await page.evaluate(()=>{const s=document.querySelector('.sheet');const st=getComputedStyle(s);return{opacity:st.opacity,cards:[...s.querySelectorAll('[data-state]')].map(n=>n.getAttribute('data-state')),waist:document.querySelector('#quick-log-waist').value,box:Math.round(s.getBoundingClientRect().width)+'/'+Math.round(s.getBoundingClientRect().x)};});
  console.log(`webkit ${v.name} loaded: opacity ${read.opacity} sheet ${read.box} state cards [${read.cards.join(',')}] waist "${read.waist}"`);
  await page.screenshot({path:`${SHOTS}/c5-webkit-${v.name}-loaded.png`});
  await ctx.close();
}
await b.close();
