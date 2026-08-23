/*
 * The mechanism, put back by hand in the live document, so the three properties
 * can be watched moving. Read only: nothing is saved, nothing is written.
 */
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

const READ = () => {
  const round=(v)=>Math.round(v*10)/10;
  const sheet=document.querySelector('.sheet');
  const foot=sheet.querySelector('.sheetfoot');
  const fs=getComputedStyle(foot);
  const save=foot.querySelector('.btn.primary');
  const anc=[]; for(let h=sheet.parentElement;h;h=h.parentElement) anc.push(h.tagName.toLowerCase()+(h.className?'.'+String(h.className).trim().split(/\s+/).join('.'):''));
  return {
    ancestry:anc.join(' < '),
    insideACard:Boolean(sheet.closest('.card')),
    footPaddingTop:fs.paddingTop,
    saveMarginTop:getComputedStyle(save).marginTop,
    saveBelow:round(save.getBoundingClientRect().top-(foot.getBoundingClientRect().top+parseFloat(fs.borderTopWidth))),
    actions:[...sheet.querySelectorAll('.actions')].map(n=>{
      const p=n.previousElementSibling;
      return {marginTop:getComputedStyle(n).marginTop,
        gap:p?round(n.getBoundingClientRect().top-p.getBoundingClientRect().bottom):null,
        buttons:[...n.querySelectorAll('.btn')].map(b=>({label:(b.textContent||'').trim(),h:round(b.getBoundingClientRect().height),min:getComputedStyle(b).minHeight}))};
    }),
  };
};

sh('bash',['scripts/test-stack.sh','reset'],{DEMO_MODE:'1'});
await wait(); await owner(); const jar=await jarOf();
const b=await chromium.launch({channel:'chrome'});
const ctx=await b.newContext({baseURL:SCRATCH,viewport:{width:393,height:852},serviceWorkers:'block'});
await ctx.route('**/api/diagnostics/launch',(r)=>r.fulfill({status:200,contentType:'application/json',body:'{"recorded":false}'}));
await ctx.addCookies(cookiesFor(jar));
const page=await ctx.newPage();
await page.goto(`${SCRATCH}/`,{waitUntil:'networkidle'});
// the error state, which is the only one that draws an action row
await ctx.route('**/api/log',(r)=>r.abort('connectionfailed'));
await page.getByRole('button',{name:'Quick log',exact:true}).click();
await page.locator('.sheet [data-state="error"]').first().waitFor({timeout:25000});
await page.waitForTimeout(600);
console.log('SHIPPED   ', JSON.stringify(await page.evaluate(READ)));
// Put the mechanism back: the sheet, mounted inside section.card.day again.
await page.evaluate(()=>{
  const card=document.querySelector('section.card.day');
  card.appendChild(document.querySelector('.scrim'));
  card.appendChild(document.querySelector('.sheet'));
});
await page.waitForTimeout(300);
console.log('REMOUNTED ', JSON.stringify(await page.evaluate(READ)));
await b.close();
