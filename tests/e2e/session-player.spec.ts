import { mkdirSync } from 'node:fs';
import { expect, test, type BrowserContext, type Page } from './fixtures';
import {
  ensureScratchOwner,
  projectRoot,
  scratchQuery,
  scratchSignInLink,
  testStackWithDemoMode,
  waitForScratch,
} from './host';

/**
 * The session player, screen 07. F74, F75, F76, F77 and the player half of C11.
 *
 * ON THE SCRATCH INSTANCE, IN CHROME. This file runs whole sessions and writes
 * every set of them, and it freezes the page's lifecycle to prove the clock,
 * which is a Chromium protocol. What that costs is written down here rather
 * than discovered: the behaviour below is proven in Chrome, and the wall-clock
 * arithmetic under it is proven engine-free in tests/unit/session-clock.test.ts.
 */

const CAPTURES = `${projectRoot}.forge/evidence/slice-8/captures`;

const VIEWPORTS = [
  { name: '393x852', width: 393, height: 852 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1280x800', width: 1280, height: 800 },
];

test.beforeAll(async () => {
  mkdirSync(CAPTURES, { recursive: true });
  console.log(testStackWithDemoMode('1', 'up'));
  await waitForScratch();
  await ensureScratchOwner();
});

async function signIn(page: Page) {
  await page.goto(scratchSignInLink());
  await page.waitForURL(/\/$/);
  await page.waitForLoadState('networkidle');
}

/**
 * An accepted session to run, through the shipped screens.
 *
 * It proposes a week if there is not one, accepts the first strength row and
 * returns its id. No test-only route and no row written by hand: what the
 * player opens is what the owner would have accepted.
 */
async function acceptedSessionId(page: Page): Promise<string> {
  await page.goto('/train');
  await page.waitForLoadState('networkidle');
  const propose = page.getByRole('button', { name: 'Propose next week' });
  if (await propose.isVisible().catch(() => false)) await propose.click();
  const rows = page.locator('[data-proposal]');
  await expect(rows.first()).toBeVisible();

  const ids = await rows.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-proposal')!));
  for (const id of ids) {
    const row = page.locator(`[data-proposal="${id}"]`);
    const kind = await row.locator('.head').first().innerText();
    if (!/strength/i.test(kind)) continue;
    if ((await row.getAttribute('data-state')) !== 'accepted') {
      await row.locator('[data-decision="accept"]').click();
      await expect(row).toHaveAttribute('data-state', 'accepted');
    }
    return id;
  }
  throw new Error(`no strength session in the proposed week: ${ids.join(', ')}`);
}

/** Take the origin away, and prove it is really gone before anything is claimed. */
async function goOffline(context: BrowserContext, page: Page): Promise<void> {
  await context.route('**/*', (route) => route.abort('connectionfailed'));
  try {
    await context.setOffline(true);
  } catch (error) {
    console.log(`setOffline is not implemented here: ${(error as Error).message}`);
  }
  const reachable = await page.evaluate(async () => {
    try {
      const response = await fetch('/healthz', { method: 'HEAD', cache: 'no-store' });
      return response.ok;
    } catch {
      return false;
    }
  });
  expect(reachable, 'the origin must really be unreachable before an offline run means anything').toBe(false);
}

test.describe('F74, the player runs offline and reads the clock', () => {
  test('a whole session runs with the origin unreachable, and every set is queued on the phone', async ({
    page,
    context,
  }) => {
    await signIn(page);
    const id = await acceptedSessionId(page);
    await page.goto(`/train/session/${id}`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-phase="ready"]')).toBeVisible();

    await goOffline(context, page);

    await page.locator('[data-action="start"]').click();
    await expect(page.locator('[data-phase="work"]')).toBeVisible();

    // Three sets, offline, with the screen moving on each time.
    for (let index = 0; index < 3; index += 1) {
      await page.locator('[data-action="set-done"]').click();
      const resting = await page.locator('[data-phase="rest"]').isVisible().catch(() => false);
      if (!resting) break;
      await page.getByRole('button', { name: 'Skip rest' }).click();
      await expect(page.locator('[data-phase="work"]')).toBeVisible();
    }

    // The writes are on the phone, in the outbox, keyed by their own UUIDs.
    const queued = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const request = indexedDB.open('vernier', 1);
          request.onsuccess = () => {
            const db = request.result;
            const store = db.transaction('outbox', 'readonly').objectStore('outbox');
            const all = store.getAll();
            all.onsuccess = () => resolve(all.result.length);
            all.onerror = () => resolve(-1);
          };
          request.onerror = () => resolve(-1);
        }),
    );
    console.log(`sets queued on the phone with no origin: ${queued}`);
    expect(queued).toBeGreaterThan(2);
    await page.screenshot({ path: `${CAPTURES}/f74-offline-run.png`, fullPage: true });
  });

  test('sixty seconds frozen costs nothing, because nothing was counting', async ({ page, context }) => {
    test.setTimeout(180_000);
    await signIn(page);
    const id = await acceptedSessionId(page);
    await page.goto(`/train/session/${id}`);
    await page.waitForLoadState('networkidle');

    await page.locator('[data-action="start"]').click();
    await page.locator('[data-action="set-done"]').click();
    await expect(page.locator('[data-phase="rest"]')).toBeVisible();

    const startedAt = Date.now();
    // textContent, not innerText: the timer is an SVG <text> node and
    // `innerText` is an HTMLElement property that an SVG element does not have.
    const before = (await page.locator('[data-timer]').textContent()) ?? '';
    const total = Number(((await page.locator('.restring .sub').textContent()) ?? '').replace(/\D/g, ''));
    console.log(`rest of ${total} s, showing ${before} at the moment it opened`);

    // Freeze the page. Timers stop being delivered, exactly as they do on a
    // phone whose screen has locked. A countdown built on ticks would come back
    // reading what it read a minute ago.
    const cdp = await context.newCDPSession(page);
    await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
    await new Promise((resolve) => setTimeout(resolve, 62_000));
    await cdp.send('Page.setWebLifecycleState', { state: 'active' });

    const elapsed = (Date.now() - startedAt) / 1000;
    const after = (await page.locator('[data-timer]').textContent()) ?? '';
    const [minutes, seconds] = after.split(':').map(Number);
    const remaining = minutes * 60 + seconds;
    const expected = Math.max(0, total - elapsed);
    console.log(
      `after ${elapsed.toFixed(1)} s frozen the timer reads ${after} (${remaining} s), and the clock says ${expected.toFixed(1)} s`,
    );
    // THIS IS THE ASSERTION THAT WOULD GO RED. A ticking timer would read about
    // 60 seconds more than this, because it would have missed a minute of ticks.
    expect(Math.abs(remaining - expected)).toBeLessThanOrEqual(2);
    await page.screenshot({ path: `${CAPTURES}/f74-after-60s-frozen.png`, fullPage: true });
  });

  test('nothing interrupts an open session: no dialog of any kind is raised', async ({ page }) => {
    await signIn(page);
    const id = await acceptedSessionId(page);

    const dialogs: string[] = [];
    page.on('dialog', (dialog) => {
      dialogs.push(`${dialog.type()}: ${dialog.message()}`);
      void dialog.dismiss();
    });

    await page.goto(`/train/session/${id}`);
    await page.locator('[data-action="start"]').click();

    // Drive the session to the end, recording every dialog on the way.
    for (let guard = 0; guard < 40; guard += 1) {
      if (await page.locator('[data-phase="done"]').isVisible().catch(() => false)) break;
      if (await page.locator('[data-phase="rest"]').isVisible().catch(() => false)) {
        await page.getByRole('button', { name: 'Skip rest' }).click();
        continue;
      }
      await page.locator('[data-action="set-done"]').click();
    }
    await expect(page.locator('[data-phase="done"]')).toBeVisible();

    console.log(`dialogs raised during the whole session: ${dialogs.length}`);
    expect(dialogs).toEqual([]);

    // And nothing modal, no permission ask, no rating prompt, no upsell.
    const modals = await page.locator('dialog[open], [role="alertdialog"]').count();
    expect(modals).toBe(0);
    const body = await page.locator('body').innerText();
    expect(body).not.toMatch(/rate (this )?app|upgrade|subscribe|allow notifications|enable notifications/i);
    await page.screenshot({ path: `${CAPTURES}/f74-no-interruptions.png`, fullPage: true });
  });
});

test.describe('F75, last week and the three alternatives', () => {
  test("last week's load renders inside the open set, with no navigation", async ({ page }) => {
    await signIn(page);
    const id = await acceptedSessionId(page);
    await page.goto(`/train/session/${id}`);
    const url = page.url();
    await page.locator('[data-action="start"]').click();

    const line = page.locator('[data-last-week]');
    await expect(line).toBeVisible();
    console.log(`last week: ${await line.innerText()}`);
    // The set card is open and nothing navigated to show it.
    expect(page.url()).toBe(url);
    await expect(page.locator('[data-set-card]')).toBeVisible();
    await page.screenshot({ path: `${CAPTURES}/f75-last-week.png`, fullPage: true });
  });

  test('easier, harder and a substitution are each one tap and none ends the session', async ({ page }) => {
    await signIn(page);
    const id = await acceptedSessionId(page);
    await page.goto(`/train/session/${id}`);
    await page.locator('[data-action="start"]').click();

    const name = page.locator('.move');
    const first = await name.innerText();

    await page.locator('[data-action="easier"]').click();
    const easier = await name.innerText();
    console.log(`easier: ${first} became ${easier}`);
    expect(easier).not.toBe(first);
    await expect(page.locator('[data-phase="work"]')).toBeVisible();
    await page.screenshot({ path: `${CAPTURES}/f75-easier.png`, fullPage: true });

    await page.locator('[data-action="harder"]').click();
    const harder = await name.innerText();
    console.log(`harder: ${easier} became ${harder}`);
    expect(harder).not.toBe(easier);
    await expect(page.locator('[data-phase="work"]')).toBeVisible();
    await page.screenshot({ path: `${CAPTURES}/f75-harder.png`, fullPage: true });

    await page.locator('[data-action="replace"]').click();
    const sheet = page.locator('[role="dialog"]');
    await expect(sheet).toBeVisible();
    const alternatives = await sheet.locator('[data-alternative]').count();
    console.log(`alternatives offered: ${alternatives}`);
    expect(alternatives).toBeGreaterThan(0);
    await page.screenshot({ path: `${CAPTURES}/f75-replace-sheet.png`, fullPage: true });

    await sheet.locator('[data-alternative]').first().getByRole('button', { name: 'Use this' }).click();
    await expect(page.locator('[data-phase="work"]')).toBeVisible();
    console.log(`replaced with: ${await name.innerText()}`);
    await page.screenshot({ path: `${CAPTURES}/f75-replaced.png`, fullPage: true });
  });
});

test.describe('F76, spoken cues', () => {
  test('the first utterance goes out inside the start tap, while the gesture is still live', async ({ page }) => {
    await signIn(page);
    const id = await acceptedSessionId(page);

    // Wrap speak before the page runs, and record whether the browser still
    // considered a user gesture active at the moment it was called. That is
    // what "primed inside the tap" means: iOS returns silently otherwise.
    await page.addInitScript(() => {
      const spoken: Array<{ text: string; activation: boolean }> = [];
      (window as unknown as { __spoken: typeof spoken }).__spoken = spoken;
      const original = window.speechSynthesis.speak.bind(window.speechSynthesis);
      window.speechSynthesis.speak = (utterance: SpeechSynthesisUtterance) => {
        spoken.push({
          text: utterance.text,
          activation: Boolean(navigator.userActivation?.isActive),
        });
        return original(utterance);
      };
    });

    await page.goto(`/train/session/${id}`);
    await page.locator('[data-action="start"]').click();

    const spoken = await page.evaluate(
      () => (window as unknown as { __spoken: Array<{ text: string; activation: boolean }> }).__spoken,
    );
    console.log(`utterances during the start tap: ${JSON.stringify(spoken)}`);
    expect(spoken.length).toBeGreaterThan(0);
    expect(spoken[0].text.length).toBeGreaterThan(2);
    expect(spoken[0].activation).toBe(true);
  });

  test('every spoken cue has a visible equivalent, and muting silences one and not the other', async ({ page }) => {
    await signIn(page);
    const id = await acceptedSessionId(page);
    await page.addInitScript(() => {
      const spoken: string[] = [];
      (window as unknown as { __spoken: string[] }).__spoken = spoken;
      const original = window.speechSynthesis.speak.bind(window.speechSynthesis);
      window.speechSynthesis.speak = (utterance: SpeechSynthesisUtterance) => {
        spoken.push(utterance.text);
        return original(utterance);
      };
    });

    await page.goto(`/train/session/${id}`);
    await page.locator('[data-action="start"]').click();

    const cue = page.locator('[data-cue-line]');
    const visible = await cue.innerText();
    const heard = await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);
    console.log(`spoken: ${heard.join(' | ')}\nvisible: ${visible}`);
    expect(visible).toContain(heard[0]);
    await page.screenshot({ path: `${CAPTURES}/f76-sound-on.png`, fullPage: true });

    // Mute, then move on. The words stay on the screen and nothing is spoken.
    await page.locator('[data-action="mute"]').click();
    await expect(page.locator('[data-action="mute"]')).toHaveAttribute('aria-pressed', 'true');
    const spokenBefore = (await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken)).length;

    await page.locator('[data-action="set-done"]').click();
    await page.getByRole('button', { name: 'Skip rest' }).click();
    await expect(page.locator('[data-phase="work"]')).toBeVisible();

    const spokenAfter = (await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken)).length;
    const stillVisible = await cue.innerText();
    console.log(`muted: ${spokenBefore} utterances before, ${spokenAfter} after; cue reads "${stillVisible}"`);
    expect(spokenAfter).toBe(spokenBefore);
    expect(stillVisible.length).toBeGreaterThan(3);
    await expect(page.locator('[data-muted-note]')).toBeVisible();
    await page.screenshot({ path: `${CAPTURES}/f76-muted.png`, fullPage: true });
  });
});

test.describe('F77, effort and pain', () => {
  test('a resistance session asks reps in reserve and the pain rule is on the screen that asks', async ({ page }) => {
    await signIn(page);
    const id = await acceptedSessionId(page);
    await page.goto(`/train/session/${id}`);
    await page.locator('[data-action="start"]').click();
    for (let guard = 0; guard < 40; guard += 1) {
      if (await page.locator('[data-phase="done"]').isVisible().catch(() => false)) break;
      if (await page.locator('[data-phase="rest"]').isVisible().catch(() => false)) {
        await page.getByRole('button', { name: 'Skip rest' }).click();
        continue;
      }
      await page.locator('[data-action="set-done"]').click();
    }

    await expect(page.locator('[data-phase="done"]')).toBeVisible();
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/How many more reps could you have done/i);
    // The licensed anchor sets, written with one character in a class so this
    // file does not put the phrases it forbids into the repository. The same
    // trick, and the same reason, as tests/unit/no-licensed-text.test.ts.
    expect(body).not.toMatch(/very, very li[g]ht|somewhat ha[r]d|fairly li[g]ht|absolute maxim[u]m/i);
    await expect(page.locator('[data-pain-rule]')).toContainText('5 out of 10');

    // Above the ceiling, and the screen says what happens next.
    await page.locator('[data-pain-site="knee"]').click();
    await page.locator('.scale10').last().getByRole('button', { name: '7', exact: true }).click();
    await expect(page.locator('[data-pain="above-ceiling"]')).toBeVisible();
    console.log(await page.locator('[data-pain="above-ceiling"]').innerText());
    await page.screenshot({ path: `${CAPTURES}/f77-effort-and-pain.png`, fullPage: true });

    await page.locator('[data-action="save"]').click();
    await expect(page.locator('[data-state="saved"]')).toBeVisible();

    await expect
      .poll(() => scratchQuery('select count(*) from session_report'), { timeout: 20_000 })
      .not.toBe('0');
    const stored = scratchQuery('select effort_scale, pain_site, pain_score from session_report');
    console.log(`stored report:\n${stored}`);
    expect(stored).toContain('rir');
    expect(stored).toContain('knee');
  });
});

test.describe('C11, the player matches screen 07', () => {
  test('88 px set-done, 56 px transport, 64 px timer', async ({ page }) => {
    await signIn(page);
    const id = await acceptedSessionId(page);
    await page.goto(`/train/session/${id}`);
    await page.locator('[data-action="start"]').click();

    const setDone = await page.locator('[data-action="set-done"]').boundingBox();
    const easier = await page.locator('[data-action="easier"]').boundingBox();
    const harder = await page.locator('[data-action="harder"]').boundingBox();
    const replace = await page.locator('[data-action="replace"]').boundingBox();
    console.log(
      `set done ${setDone?.height} px, easier ${easier?.height}, harder ${harder?.height}, replace ${replace?.height}`,
    );
    expect(setDone!.height).toBeGreaterThanOrEqual(88);
    for (const control of [easier, harder, replace]) {
      expect(control!.height).toBeGreaterThanOrEqual(56);
    }

    await page.locator('[data-action="set-done"]').click();
    await expect(page.locator('[data-phase="rest"]')).toBeVisible();
    const timerSize = await page
      .locator('[data-timer]')
      .evaluate((node) => getComputedStyle(node).fontSize);
    console.log(`timer font size: ${timerSize}`);
    expect(timerSize).toBe('64px');
  });

  test('the completion ring closes over 900 ms and is the only motion beyond 200 ms', async ({ page }) => {
    await signIn(page);
    const id = await acceptedSessionId(page);
    await page.goto(`/train/session/${id}`);
    await page.locator('[data-action="start"]').click();
    for (let guard = 0; guard < 40; guard += 1) {
      if (await page.locator('[data-phase="done"]').isVisible().catch(() => false)) break;
      if (await page.locator('[data-phase="rest"]').isVisible().catch(() => false)) {
        await page.getByRole('button', { name: 'Skip rest' }).click();
        continue;
      }
      await page.locator('[data-action="set-done"]').click();
    }
    await expect(page.locator('[data-motion="completion"]')).toBeVisible();

    const ring = await page
      .locator('[data-motion="completion"] .run')
      .evaluate((node) => getComputedStyle(node).animationDuration);
    console.log(`completion ring: ${ring}`);
    expect(ring).toBe('0.9s');

    // Every other animated or transitioned element on this screen, printed, so
    // the claim is about the population and not about one node.
    const motion = await page.evaluate(() => {
      const found: Array<{ tag: string; classes: string; animation: string; transition: string }> = [];
      for (const node of Array.from(document.querySelectorAll('*'))) {
        const style = getComputedStyle(node);
        const animation = style.animationDuration;
        const transition = style.transitionDuration;
        if (animation === '0s' && (transition === '0s' || transition === '')) continue;
        found.push({
          tag: node.tagName.toLowerCase(),
          classes: node.className.toString().slice(0, 40),
          animation,
          transition,
        });
      }
      return found;
    });
    console.log(`animated elements on screen 07: ${JSON.stringify(motion, null, 1)}`);
    expect(motion.length).toBeGreaterThan(0);
    const seconds = (value: string) =>
      value
        .split(',')
        .map((part) => (part.trim().endsWith('ms') ? Number.parseFloat(part) / 1000 : Number.parseFloat(part)))
        .filter((number) => Number.isFinite(number));
    for (const element of motion) {
      for (const duration of [...seconds(element.animation), ...seconds(element.transition)]) {
        if (duration === 0) continue;
        const allowed = duration <= 0.2 || Math.abs(duration - 0.9) < 0.001 || Math.abs(duration - 1.4) < 0.001;
        expect(
          allowed,
          `${element.tag}.${element.classes} animates for ${duration}s, which is neither a 120 to 200 ms fade, the 900 ms ring, nor the skeleton pulse`,
        ).toBe(true);
      }
    }

    await page.screenshot({ path: `${CAPTURES}/c11-completion.png`, fullPage: true });
  });

  /**
   * THE WORST DEFECT THIS SLICE CLOSED, AS A TEST.
   *
   * At 393x852 the tab bar covered Set done: the control measured y771 to y859
   * in an 852 px viewport, the bar sat at y795 to y852, `elementFromPoint` at
   * the button's centre returned the bar's own glyph, and a real tap there
   * navigated to /train and ended the session. Screen 07 draws no tab bar on
   * any of its four frames.
   *
   * Three claims, at every viewport, and the last one is a real tap rather than
   * a locator click, because a locator click finds the element wherever it is
   * and would have passed on the shipped build.
   *
   * AND IT PRINTS THE POPULATION FIRST. "No tab bar over the button" also holds
   * on a build where the tab bar never renders at all, so the bar is counted on
   * the screen the player is reached from: five links there, none here.
   */
  test('nothing is drawn over Set done, and the tab bar is not on this screen', async ({ page }) => {
    await signIn(page);
    const id = await acceptedSessionId(page);

    await page.goto('/train');
    await page.waitForLoadState('networkidle');
    const barOnTrain = await page.locator('.tabbar a').count();
    console.log(`tab bar on /train: ${barOnTrain} links`);
    expect(barOnTrain).toBe(5);

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(`/train/session/${id}`);
      await page.locator('[data-action="start"]').click();
      await expect(page.locator('[data-phase="work"]')).toBeVisible();

      const barOnPlayer = await page.locator('.tabbar').count();
      console.log(`${viewport.name}: tab bar elements on the player: ${barOnPlayer}`);
      expect(barOnPlayer).toBe(0);

      const probe = await page.locator('[data-action="set-done"]').evaluate((node) => {
        const box = node.getBoundingClientRect();
        const x = Math.round(box.left + box.width / 2);
        const y = Math.round(box.top + box.height / 2);
        const hit = document.elementFromPoint(x, y);
        return {
          x,
          y,
          top: Math.round(box.top),
          bottom: Math.round(box.bottom),
          height: Math.round(box.height),
          viewport: window.innerHeight,
          hit: hit ? `${hit.tagName.toLowerCase()}.${hit.getAttribute('class') ?? ''}` : 'nothing',
          hitIsTheButton: hit !== null && (hit === node || node.contains(hit)),
        };
      });
      console.log(
        `${viewport.name}: set done y${probe.top} to y${probe.bottom} of ${probe.viewport}, ` +
          `${probe.height} px tall, point (${probe.x}, ${probe.y}) hits ${probe.hit}`,
      );
      expect(probe.height).toBeGreaterThanOrEqual(88);
      // Wholly inside the viewport, so it is reachable without scrolling.
      expect(probe.top).toBeGreaterThanOrEqual(0);
      expect(probe.bottom).toBeLessThanOrEqual(probe.viewport);
      expect(probe.hitIsTheButton).toBe(true);

      // The tap itself, at that point, with the mouse rather than the locator.
      await page.mouse.click(probe.x, probe.y);
      await expect(page.locator('[data-phase="rest"]')).toBeVisible();
      expect(page.url()).toContain(`/train/session/${id}`);
      console.log(`${viewport.name}: the tap landed on the set, still at ${page.url()}`);
    }
  });

  test('screen 07 at three viewports', async ({ page }) => {
    await signIn(page);
    const id = await acceptedSessionId(page);
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(`/train/session/${id}`);
      await page.locator('[data-action="start"]').click();
      await expect(page.locator('[data-phase="work"]')).toBeVisible();
      await page.screenshot({ path: `${CAPTURES}/c11-player-${viewport.name}.png`, fullPage: true });
    }
  });

  test('screen 06 at three viewports', async ({ page }) => {
    await signIn(page);
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/train');
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: `${CAPTURES}/c11-week-${viewport.name}.png`, fullPage: true });
    }
  });
});
