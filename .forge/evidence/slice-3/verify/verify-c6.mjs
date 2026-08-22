import { webkit } from '/Users/lambertbouley/Claude/lbtbly-fitness-app/node_modules/playwright/index.mjs';
import { execFileSync } from 'node:child_process';
const root='/Users/lambertbouley/Claude/lbtbly-fitness-app';
const base='https://lamberts-mac-mini.tailda76d6.ts.net';
const SD='/private/tmp/claude-501/-Users-lambertbouley-Claude-lbtbly-fitness-app/b9d6a57d-5fec-4031-9628-8b7750465468/scratchpad';
const q=(s)=>execFileSync('docker',['compose','exec','-T','db','sh','-c',`psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c ${JSON.stringify(s.replace(/\s+/g,' ').trim())}`],{cwd:root,encoding:'utf8'}).trim();
const link=execFileSync('bash',['scripts/recovery.sh','link','20'],{cwd:root,encoding:'utf8'}).split('\n').filter(l=>l.startsWith('https://')).at(-1).trim();
const id=q("select id from measurement where metric='waist' and source='manual' order by raw_value limit 1");
console.log('correcting measurement', id);
const browser=await webkit.launch();
const ctx=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:2});
const page=await ctx.newPage();
await page.goto(link); await page.waitForLoadState('networkidle');

// --- 1. blank correction: the route's own inline string reaches the screen ---
await page.goto(`${base}/value/${id}`); await page.waitForLoadState('networkidle');
await page.locator('#correction-value').fill('');
await page.getByRole('button',{name:'Save the correction'}).click();
await page.waitForTimeout(1500);
console.log('BLANK CORRECTION, what the screen says:', JSON.stringify(await page.locator('.card.tight .alert').first().textContent().catch(()=>null)));
await page.screenshot({path:`${SD}/vfy-c6-blank-correction.png`, fullPage:true});

// --- 2. non-numeric correction: HTTP 500, empty body ---
await page.reload(); await page.waitForLoadState('networkidle');
await page.locator('#correction-value').fill('ninety-seven');
await page.getByRole('button',{name:'Save the correction'}).click();
await page.waitForTimeout(2500);
console.log('NON-NUMERIC CORRECTION, what the screen says:', JSON.stringify(await page.locator('.card.tight .alert').first().textContent().catch(()=>null)));
await page.screenshot({path:`${SD}/vfy-500-correction.png`, fullPage:true});

// --- 3. sweep every reachable surface for a 12-hour clock or a wrong date shape ---
const bad=[];
for (const path of ['/','/health','/train','/eat','/settings',`/value/${id}`]) {
  await page.goto(base+path); await page.waitForLoadState('networkidle');
  const text = await page.locator('body').innerText();
  for (const m of text.matchAll(/\b\d{1,2}:\d{2}\s*(AM|PM|am|pm)\b/g)) bad.push(`${path} 12-hour: ${m[0]}`);
  for (const m of text.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)) bad.push(`${path} ISO date on screen: ${m[0]}`);
  for (const m of text.matchAll(/\b(lbs|pounds|miles|oz|inches)\b/gi)) bad.push(`${path} imperial unit: ${m[0]}`);
}
console.log('date/time/unit violations found on the shipped surfaces:', bad.length, bad);
await browser.close();
