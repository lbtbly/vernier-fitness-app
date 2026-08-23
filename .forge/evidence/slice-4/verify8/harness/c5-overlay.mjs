/*
 * The five state captures, with screen 00's geometry drawn on top of them.
 *
 * Every number in an overlay label is read off an approved artifact:
 *   .forge/wireframes/00-patterns.html line 32   .card{padding:16px}
 *   .forge/wireframes/00-patterns.html line 159  an error card's action row at margin-top:12px
 *   .forge/wireframes/03-quick-log.html line 64  .sheetfoot{padding:12px 0 28px} and no margin on Save
 *   .forge/DESIGN.md section 2b                  44px is the floor no control goes under
 * The measured value is printed beside the drawn one, so a capture shows the
 * comparison rather than asserting it.
 */
import { chromium, webkit } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const ROOT='/Users/lambertbouley/Claude/lbtbly-fitness-app'; const SCRATCH='http://127.0.0.1:3101';
const SHOTS=process.env.SHOTS_DIR; mkdirSync(SHOTS,{recursive:true});
const sh=(f,a,e)=>execFileSync(f,a,{cwd:ROOT,encoding:'utf8',env:{...process.env,...e}}).trim();
const q=(s)=>sh('docker',['compose','exec','-T','db','sh','-c',`psql -U "$POSTGRES_USER" -d vernier_scratch -At -c ${JSON.stringify(s.replace(/\s+/g,' ').trim())}`]);
const link=()=>sh('bash',['scripts/recovery.sh','link','10'],{RECOVERY_CONTAINER:'vernier-scratch'}).split('\n').at(-1).trim();
async function wait(){for(let i=0;i<90;i++){try{const r=await fetch(`${SCRATCH}/healthz`);if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,500));}throw new Error('no scratch');}
async function owner(){if(Number(q('select count(*) from owner'))>0)return;const p=`S-${crypto.randomUUID()}-Q9!`;const f=await fetch(`${SCRATCH}/sign-in`,{redirect:'manual'});const c=f.headers.getSetCookie().map(l=>l.split(';')[0]).find(x=>x.startsWith('vernier_csrf='))??'';const m=await fetch(`${SCRATCH}/api/auth/bootstrap`,{method:'POST',redirect:'manual',headers:{'content-type':'application/json',cookie:c,'x-vernier-csrf':c.slice(13)},body:JSON.stringify({password:p,repeat:p})});if(m.status!==201)throw new Error('bootstrap '+m.status);}
async function jarOf(){for(let i=0;i<6;i++){try{const r=await fetch(link(),{redirect:'manual'});const j=new Map();for(const l of r.headers.getSetCookie()){const p=l.split(';')[0];const s=p.indexOf('=');j.set(p.slice(0,s),p.slice(s+1));}if(j.get('vernier_session'))return j;}catch{}await new Promise(r=>setTimeout(r,1000));}throw new Error('no session');}
const cookiesFor=(j)=>[...j].map(([name,value])=>({name,value,domain:'127.0.0.1',path:'/',secure:false,httpOnly:true,sameSite:'Strict'}));

const OVERLAY = (state) => {
  const round=(v)=>Math.round(v*10)/10;
  document.querySelectorAll('[data-c5-overlay]').forEach((n)=>n.remove());
  const layer=document.createElement('div');
  layer.setAttribute('data-c5-overlay','1');
  Object.assign(layer.style,{position:'fixed',inset:'0',zIndex:'9999',pointerEvents:'none',font:'10px -apple-system, system-ui'});
  document.body.appendChild(layer);
  const mark=(box,colour,text,side)=>{
    const b=document.createElement('div');
    Object.assign(b.style,{position:'fixed',left:box.left+'px',top:box.top+'px',width:box.width+'px',height:box.height+'px',border:'1px solid '+colour,boxSizing:'border-box'});
    const l=document.createElement('span');
    l.textContent=text;
    Object.assign(l.style,{position:'fixed',left:Math.max(2,box.left+2)+'px',top:(side==='above'?Math.max(2,box.top-12):box.top+box.height+1)+'px',color:colour,background:'rgba(0,0,0,.75)',padding:'0 3px',whiteSpace:'nowrap'});
    layer.append(b,l);
  };
  const sheet=document.querySelector('.sheet');
  const foot=sheet.querySelector('.sheetfoot');
  const fs=getComputedStyle(foot);
  const save=foot.querySelector('.btn.primary');
  const lines=[];

  // Every card in the sheet, against 00-patterns line 32.
  for (const card of sheet.querySelectorAll('.card')) {
    const p=getComputedStyle(card).padding;
    mark(card.getBoundingClientRect(),'#4FD08A',`card padding ${p}  (00-patterns line 32 draws 16px)`,'above');
    lines.push(`card[${card.getAttribute('data-state')??'card'}] padding ${p}`);
  }
  // The action row, against 00-patterns line 159.
  for (const row of sheet.querySelectorAll('.actions')) {
    const prev=row.previousElementSibling;
    const gap=prev?round(row.getBoundingClientRect().top-prev.getBoundingClientRect().bottom):null;
    mark(row.getBoundingClientRect(),'#E9B44C',`.actions margin-top ${getComputedStyle(row).marginTop}, drawn ${gap} px  (00-patterns line 159 draws 12px)`,'above');
    lines.push(`.actions margin-top ${getComputedStyle(row).marginTop} drawn ${gap}px`);
    for (const b of row.querySelectorAll('.btn')) {
      mark(b.getBoundingClientRect(),'#F07A6A',`${b.textContent.trim()} ${round(b.getBoundingClientRect().height)} px, min-height ${getComputedStyle(b).minHeight}  (.sheet .btn 52px, floor 44px)`,'below');
      lines.push(`${b.textContent.trim()} ${round(b.getBoundingClientRect().height)}px min ${getComputedStyle(b).minHeight}`);
    }
  }
  // The foot divider and Save, against 03-quick-log line 64.
  const footTop=foot.getBoundingClientRect().top+parseFloat(fs.borderTopWidth);
  const below=round(save.getBoundingClientRect().top-footTop);
  const rule=document.createElement('div');
  Object.assign(rule.style,{position:'fixed',left:'0',width:'100%',top:footTop+'px',height:'0',borderTop:'1px dashed #5AA9FF'});
  layer.append(rule);
  mark(save.getBoundingClientRect(),'#5AA9FF',`Save ${below} px below the divider, margin-top ${getComputedStyle(save).marginTop}, ${round(save.getBoundingClientRect().height)} px min ${getComputedStyle(save).minHeight}  (03-quick-log line 64: foot padding 12px, no margin)`,'above');
  lines.push(`foot padding-top ${fs.paddingTop}; Save margin-top ${getComputedStyle(save).marginTop} at ${below}px below the divider`);

  // The shortest target on the sheet, against the 44 px floor.
  const SEL='button, input, textarea, select, a[href], [role="button"], [tabindex]:not([tabindex="-1"])';
  const targets=[...sheet.querySelectorAll(SEL)];
  const shortest=targets.reduce((a,b)=>a.getBoundingClientRect().height<=b.getBoundingClientRect().height?a:b);
  mark(shortest.getBoundingClientRect(),'#8FC4FF',`shortest of ${targets.length} targets: ${round(shortest.getBoundingClientRect().height)} px  (floor 44px)`,'below');
  lines.push(`${targets.length} targets, shortest ${round(shortest.getBoundingClientRect().height)}px`);

  const head=document.createElement('div');
  head.textContent=`C5 ${state} | ${lines.join(' | ')}`;
  Object.assign(head.style,{position:'fixed',left:'0',top:'0',right:'0',color:'#F5F5F7',background:'rgba(0,0,0,.85)',padding:'3px 4px',font:'10px -apple-system, system-ui',whiteSpace:'normal'});
  layer.append(head);
  return lines.join(' | ');
};

async function settle(page){
  await page.locator('.sheet').first().evaluate(n=>Promise.all(n.getAnimations().map(a=>a.finished))).catch(()=>{});
  await page.waitForTimeout(600);
}
async function shot(page,engine,state){
  await settle(page);
  const opacity=await page.locator('.sheet').first().evaluate(n=>getComputedStyle(n).opacity);
  const lines=await page.evaluate(OVERLAY,state);
  const file=`${SHOTS}/c5-overlay-${engine}-393x852-${state}.png`;
  await page.screenshot({path:file});
  console.log(`${engine} ${state}: opacity at capture ${opacity} | ${lines}`);
  await page.evaluate(()=>document.querySelectorAll('[data-c5-overlay]').forEach(n=>n.remove()));
}

for (const engine of ['chrome','webkit']) {
  sh('bash',['scripts/test-stack.sh','reset'],{DEMO_MODE:'1'});
  await wait(); await owner(); const jar=await jarOf();
  const b = engine==='chrome' ? await chromium.launch({channel:'chrome'}) : await webkit.launch();
  const ctx=await b.newContext({baseURL:SCRATCH,viewport:{width:393,height:852},deviceScaleFactor:2,serviceWorkers:'block'});
  await ctx.route('**/api/diagnostics/launch',(r)=>r.fulfill({status:200,contentType:'application/json',body:'{"recorded":false}'}));
  await ctx.addCookies(cookiesFor(jar));
  const page=await ctx.newPage();
  await page.goto(`${SCRATCH}/`,{waitUntil:'networkidle'});

  // stale
  await page.getByRole('button',{name:'Quick log',exact:true}).click();
  await page.locator('.sheet [data-state="stale"]').first().waitFor({timeout:20000});
  await shot(page,engine,'stale');
  await page.locator('.sheet [aria-label="Close the quick log"]').first().click();

  // loading
  await page.route('**/api/log',async(r)=>{await new Promise(x=>setTimeout(x,5000));await r.continue().catch(()=>{});});
  await page.getByRole('button',{name:'Quick log',exact:true}).click();
  await page.locator('.sheet [data-state="loading"]').first().waitFor({timeout:20000});
  await shot(page,engine,'loading');
  await page.unrouteAll({behavior:'ignoreErrors'});
  await page.locator('.sheet [data-state="loading"]').first().waitFor({state:'hidden',timeout:25000}).catch(()=>{});
  await page.locator('.sheet [aria-label="Close the quick log"]').first().click();

  // error
  await ctx.route('**/*',(r)=>r.abort('connectionfailed'));
  await ctx.setOffline(true).catch(()=>{});
  await page.getByRole('button',{name:'Quick log',exact:true}).click();
  await page.locator('.sheet [data-state="error"]').first().waitFor({timeout:25000});
  await shot(page,engine,'error');

  // offline
  await page.getByRole('button',{name:'Hunger, 3 of 5'}).click();
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.getByRole('button',{name:'Quick log',exact:true}).click();
  await page.locator('.sheet [data-state="offline"]').first().waitFor({timeout:25000});
  await shot(page,engine,'offline');
  await ctx.unroute('**/*'); await ctx.setOffline(false).catch(()=>{});
  await ctx.close();

  // empty, in a browser with nothing of its own left over
  q('truncate measurement, source_record, import_question, idempotency_key, write_request');
  const fresh=await b.newContext({baseURL:SCRATCH,viewport:{width:393,height:852},deviceScaleFactor:2,serviceWorkers:'block'});
  await fresh.route('**/api/diagnostics/launch',(r)=>r.fulfill({status:200,contentType:'application/json',body:'{"recorded":false}'}));
  await fresh.addCookies(cookiesFor(jar));
  const p2=await fresh.newPage();
  await p2.goto(`${SCRATCH}/`,{waitUntil:'networkidle'});
  await p2.getByRole('button',{name:'Quick log',exact:true}).click();
  await p2.locator('.sheet [data-state="empty"]').first().waitFor({timeout:25000});
  await shot(p2,engine,'empty');
  await fresh.close();
  await b.close();
}
