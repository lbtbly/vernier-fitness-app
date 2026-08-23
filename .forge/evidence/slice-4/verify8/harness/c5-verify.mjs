/*
 * The verifier's own C5 measurement. Written from DOD.md's line and the two
 * approved artifacts, not from the builder's spec.
 *
 * Both engines, three viewports, six sheet states, on the scratch instance.
 * Nothing here touches the owner's install.
 */
import { chromium, webkit } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const ROOT = '/Users/lambertbouley/Claude/lbtbly-fitness-app';
const SHOTS = process.env.SHOTS_DIR;
const SCRATCH = 'http://127.0.0.1:3101';
mkdirSync(SHOTS, { recursive: true });

const VIEWPORTS = [
  { name: '393x852', width: 393, height: 852 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1280x900', width: 1280, height: 900 },
];

function sh(file, args, env) {
  return execFileSync(file, args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...env } }).trim();
}
function scratchQuery(statement) {
  const one = statement.replace(/\s+/g, ' ').trim();
  return sh('docker', ['compose', 'exec', '-T', 'db', 'sh', '-c',
    `psql -U "$POSTGRES_USER" -d vernier_scratch -At -c ${JSON.stringify(one)}`]);
}
function scratchLink() {
  return sh('bash', ['scripts/recovery.sh', 'link', '10'], { RECOVERY_CONTAINER: 'vernier-scratch' })
    .split('\n').at(-1).trim();
}
async function waitForScratch() {
  for (let i = 0; i < 90; i += 1) {
    try { const r = await fetch(`${SCRATCH}/healthz`); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('scratch never answered');
}
async function ensureOwner() {
  if (Number(scratchQuery('select count(*) from owner')) > 0) return;
  const password = `Scratch-${crypto.randomUUID()}-Q9!`;
  const first = await fetch(`${SCRATCH}/sign-in`, { redirect: 'manual' });
  const csrf = first.headers.getSetCookie().map((l) => l.split(';')[0]).find((p) => p.startsWith('vernier_csrf=')) ?? '';
  const made = await fetch(`${SCRATCH}/api/auth/bootstrap`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/json', cookie: csrf, 'x-vernier-csrf': csrf.slice('vernier_csrf='.length) },
    body: JSON.stringify({ password, repeat: password }),
  });
  if (made.status !== 201) throw new Error(`bootstrap ${made.status}`);
}
async function sessionJar() {
  for (let i = 0; i < 6; i += 1) {
    try {
      const r = await fetch(scratchLink(), { redirect: 'manual' });
      const jar = new Map();
      for (const line of r.headers.getSetCookie()) {
        const pair = line.split(';')[0];
        const s = pair.indexOf('=');
        jar.set(pair.slice(0, s), pair.slice(s + 1));
      }
      if (jar.get('vernier_session')) return jar;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('no session minted');
}
const cookiesFor = (jar) => [...jar].map(([name, value]) => ({
  name, value, domain: '127.0.0.1', path: '/', secure: false, httpOnly: true, sameSite: 'Strict',
}));

/* ---- the read. Written against DOD C5, 03-quick-log.html and 00-patterns.html ---- */
const READ = () => {
  const round = (v) => Math.round(v * 10) / 10;
  const sheet = document.querySelector('.sheet');
  if (!sheet) return { missing: true };
  const box = sheet.getBoundingClientRect();
  const foot = sheet.querySelector('.sheetfoot');
  const footStyle = getComputedStyle(foot);
  const save = foot.querySelector('.btn.primary');
  const saveStyle = getComputedStyle(save);

  const ancestry = [];
  for (let hop = sheet.parentElement; hop; hop = hop.parentElement) {
    ancestry.push(hop.tagName.toLowerCase() + (hop.className ? '.' + String(hop.className).trim().split(/\s+/).join('.') : ''));
  }

  // Every interactive target inside the sheet, by a wider net than the spec's:
  // anything focusable or clickable that a thumb can land on.
  const SEL = 'button, input, textarea, select, a[href], [role="button"], [tabindex]:not([tabindex="-1"])';
  const nodes = [...sheet.querySelectorAll(SEL)];
  const targets = nodes.map((node) => {
    const s = getComputedStyle(node);
    const r = node.getBoundingClientRect();
    const labelled = node.id ? document.querySelector(`label[for="${node.id}"]`)?.textContent?.trim() : undefined;
    const named = node.getAttribute('aria-label') ?? labelled ?? node.textContent?.trim().slice(0, 28);
    return {
      label: named && named !== '' ? named : node.tagName.toLowerCase(),
      tag: node.tagName.toLowerCase(),
      classes: String(node.className || ''),
      height: round(r.height),
      width: round(r.width),
      minHeight: s.minHeight,
      cssHeight: s.height,
      fontSize: s.fontSize,
      display: s.display,
      visible: r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none',
    };
  });

  const actions = [...sheet.querySelectorAll('.actions')].map((node) => {
    const prev = node.previousElementSibling;
    return {
      where: node.closest('[data-state]')?.getAttribute('data-state') ?? 'sheet',
      marginTop: getComputedStyle(node).marginTop,
      gapAboveIt: prev ? round(node.getBoundingClientRect().top - prev.getBoundingClientRect().bottom) : null,
      buttons: [...node.querySelectorAll('.btn')].map((b) => ({
        label: (b.getAttribute('aria-label') ?? b.textContent ?? '').trim(),
        height: round(b.getBoundingClientRect().height),
        minHeight: getComputedStyle(b).minHeight,
      })),
    };
  });

  const scale5 = [...sheet.querySelectorAll('.scale5 button')].map((b) => ({
    h: round(b.getBoundingClientRect().height), css: getComputedStyle(b).height, min: getComputedStyle(b).minHeight,
  }));
  const stepper = [...sheet.querySelectorAll('.stepper button')].map((b) => ({
    h: round(b.getBoundingClientRect().height), w: round(b.getBoundingClientRect().width),
    css: getComputedStyle(b).height, min: getComputedStyle(b).minHeight,
  }));

  const sheetStyle = getComputedStyle(sheet);
  return {
    ancestry: ancestry.join(' < '),
    insideACard: Boolean(sheet.closest('.card')),
    opacity: sheetStyle.opacity,
    transform: sheetStyle.transform,
    animations: sheet.getAnimations().map((a) => `${a.animationName ?? 'anim'}:${a.playState}`),
    width: round(box.width),
    x: round(box.x),
    sheetPadding: sheetStyle.padding,
    maxWidth: sheetStyle.maxWidth,
    footPaddingTop: footStyle.paddingTop,
    footBorderTop: footStyle.borderTopWidth,
    saveMarginTop: saveStyle.marginTop,
    saveMinHeight: saveStyle.minHeight,
    saveHeight: round(save.getBoundingClientRect().height),
    saveFontSize: saveStyle.fontSize,
    saveBelowTheDivider: round(save.getBoundingClientRect().top - (foot.getBoundingClientRect().top + parseFloat(footStyle.borderTopWidth))),
    cardPadding: [...sheet.querySelectorAll('.card')].map((c) => ({
      state: c.getAttribute('data-state') ?? 'card', padding: getComputedStyle(c).padding,
    })),
    stateCards: [...sheet.querySelectorAll('[data-state]')].map((n) => n.getAttribute('data-state')),
    targets, actions, scale5, stepper,
    scrimAncestry: (() => {
      const scrim = document.querySelector('.scrim');
      if (!scrim) return 'none';
      const a = [];
      for (let hop = scrim.parentElement; hop; hop = hop.parentElement) {
        a.push(hop.tagName.toLowerCase() + (hop.className ? '.' + String(hop.className).trim().split(/\s+/).join('.') : ''));
      }
      return a.join(' < ');
    })(),
  };
};

async function settle600(page) {
  await page.locator('.sheet').first()
    .evaluate((n) => Promise.all(n.getAnimations().map((a) => a.finished))).catch(() => undefined);
  await page.waitForTimeout(600);
}

async function openSheet(page) {
  await page.getByRole('button', { name: 'Quick log', exact: true }).click();
  await page.locator('.sheet').first().waitFor({ state: 'visible', timeout: 20000 });
}
async function closeSheet(page) {
  await page.locator('.sheet [aria-label="Close the quick log"]').first().click();
  await page.locator('.sheet').first().waitFor({ state: 'detached', timeout: 20000 }).catch(() => undefined);
}

const results = [];

async function capture(page, engine, viewport, state, tag) {
  await settle600(page);
  const read = await page.evaluate(READ);
  const file = `${SHOTS}/c5-${engine}-${viewport.name}-${state}.png`;
  await page.screenshot({ path: file });
  read.engine = engine; read.viewport = viewport.name; read.state = state; read.file = file; read.tag = tag ?? '';
  results.push(read);
  console.log(`\n=== ${engine} ${viewport.name} ${state} ===`);
  console.log(`  opacity at capture ${read.opacity}  transform ${read.transform}  animations [${read.animations.join(',')}]`);
  console.log(`  ancestry: ${read.ancestry}   insideACard=${read.insideACard}   scrim: ${read.scrimAncestry}`);
  console.log(`  sheet ${read.width}/${read.x}  max-width ${read.maxWidth}  padding ${read.sheetPadding}`);
  console.log(`  state cards present: [${read.stateCards.join(', ')}]  card padding: ${read.cardPadding.map((c) => `${c.state}=${c.padding}`).join(', ') || 'none'}`);
  console.log(`  foot padding-top ${read.footPaddingTop} border ${read.footBorderTop}; Save margin-top ${read.saveMarginTop}, ${read.saveBelowTheDivider} px below the divider, ${read.saveHeight} px min ${read.saveMinHeight} font ${read.saveFontSize}`);
  console.log(`  actions: ${read.actions.map((a) => `${a.where} margin-top ${a.marginTop} drawn ${a.gapAboveIt} px [${a.buttons.map((b) => `${b.label} ${b.height}px min ${b.minHeight}`).join('; ')}]`).join(' | ') || 'none'}`);
  console.log(`  scale5: ${read.scale5.length} buttons ${[...new Set(read.scale5.map((s) => `${s.h}px/css ${s.css}/min ${s.min}`))].join(', ') || 'none'}`);
  console.log(`  stepper: ${read.stepper.length} buttons ${[...new Set(read.stepper.map((s) => `${s.w}x${s.h}`))].join(', ') || 'none'}`);
  console.log(`  --- targets walked: ${read.targets.length} ---`);
  let under = 0;
  for (const t of read.targets) {
    const flag = t.height < 44 ? '  UNDER 44' : '';
    if (t.height < 44) under += 1;
    console.log(`    ${String(t.height).padStart(6)} x ${String(t.width).padStart(6)}  min ${String(t.minHeight).padEnd(7)} ${t.tag.padEnd(8)} ${t.label}${flag}`);
  }
  console.log(`  targets under 44 px: ${under} of ${read.targets.length} walked`);
  return read;
}

async function run(engineName) {
  const browser = engineName === 'chrome'
    ? await chromium.launch({ channel: 'chrome' })
    : await webkit.launch();
  try {
    for (const viewport of VIEWPORTS) {
      // A fresh, seeded scratch instance for each viewport run, so stale is
      // really stale and empty is really empty.
      sh('bash', ['scripts/test-stack.sh', 'reset'], { DEMO_MODE: '1' });
      await waitForScratch();
      await ensureOwner();
      const jar = await sessionJar();

      const context = await browser.newContext({
        baseURL: SCRATCH,
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 2,
        serviceWorkers: 'block',
      });
      // No launch report leaves this machine, same hold the suite uses.
      await context.route('**/api/diagnostics/launch', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: '{"recorded":false}' }));
      await context.addCookies(cookiesFor(jar));
      const page = await context.newPage();
      const consoleErrors = [];
      page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

      await page.goto(`${SCRATCH}/`, { waitUntil: 'networkidle' });

      // 1. STALE: the seed's waist reading is days old.
      await openSheet(page);
      await page.locator('.sheet [data-state="stale"]').first().waitFor({ timeout: 20000 });
      await capture(page, engineName, viewport, 'stale');

      // 2. LOADED: log a fresh waist through the sheet that is open.
      await page.getByRole('button', { name: 'Up half a centimetre', exact: true }).click();
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await page.locator('[data-just-logged]').first().waitFor({ timeout: 20000 });
      await openSheet(page);
      await page.getByRole('button', { name: 'Energy, 4 of 5' }).waitFor({ timeout: 20000 });
      await capture(page, engineName, viewport, 'loaded');
      await closeSheet(page);

      // 3. LOADING: the snapshot held in flight.
      await page.route('**/api/log', async (route) => {
        await new Promise((r) => setTimeout(r, 4000));
        await route.continue().catch(() => undefined);
      });
      await openSheet(page);
      await page.locator('.sheet [data-state="loading"]').first().waitFor({ timeout: 20000 });
      await capture(page, engineName, viewport, 'loading');
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await page.locator('.sheet [data-state="loading"]').first().waitFor({ state: 'hidden', timeout: 25000 }).catch(() => undefined);
      await closeSheet(page);

      // 4. ERROR: the origin taken away while the sheet opens.
      await context.route('**/*', (route) => route.abort('connectionfailed'));
      await context.setOffline(true).catch(() => undefined);
      await openSheet(page);
      await page.locator('.sheet [data-state="error"]').first().waitFor({ timeout: 25000 });
      await capture(page, engineName, viewport, 'error');

      // 5. OFFLINE: a write commits with the origin still gone.
      await page.getByRole('button', { name: 'Hunger, 3 of 5' }).click();
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await openSheet(page);
      await page.locator('.sheet [data-state="offline"]').first().waitFor({ timeout: 25000 });
      await capture(page, engineName, viewport, 'offline');
      await context.unroute('**/*');
      await context.setOffline(false).catch(() => undefined);

      console.log(`  console errors in ${engineName} ${viewport.name}: ${consoleErrors.length} ${consoleErrors.slice(0, 3).join(' | ')}`);
      await context.close();

      // 6. EMPTY: no waist reading in the database at all, read by a browser
      // with nothing of its own left over: a fresh context, so the queue that
      // the offline state filled cannot flush a reading back in behind it.
      scratchQuery('truncate measurement, source_record, import_question, idempotency_key, write_request');
      const fresh = await browser.newContext({
        baseURL: SCRATCH,
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 2,
        serviceWorkers: 'block',
      });
      await fresh.route('**/api/diagnostics/launch', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: '{"recorded":false}' }));
      await fresh.addCookies(cookiesFor(jar));
      const emptyPage = await fresh.newPage();
      await emptyPage.goto(`${SCRATCH}/`, { waitUntil: 'networkidle' });
      await openSheet(emptyPage);
      await emptyPage.locator('.sheet [data-state="empty"]').first().waitFor({ timeout: 25000 });
      console.log(`  waist field value in empty: "${await emptyPage.locator('#quick-log-waist').inputValue()}" placeholder "${await emptyPage.locator('#quick-log-waist').getAttribute('placeholder')}"`);
      await capture(emptyPage, engineName, viewport, 'empty');
      await fresh.close();
    }
  } finally {
    await browser.close();
  }
}

const only = process.env.ONLY_ENGINE;
for (const engine of only ? [only] : ['chrome', 'webkit']) {
  await run(engine);
}
writeFileSync(`${SHOTS}/c5-measurements.json`, JSON.stringify(results, null, 1));
console.log(`\nWROTE ${results.length} state reads to ${SHOTS}/c5-measurements.json`);
