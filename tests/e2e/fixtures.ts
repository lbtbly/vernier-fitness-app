import {
  test as base,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  expect as baseExpect,
  type Locator,
  type Page,
} from '@playwright/test';
// The driver package rather than the test runner's re-export. The runner's
// `chromium` and `webkit` carry the current project's launch options, so a
// WebKit launched from inside a project whose channel is chrome is asked for a
// chrome channel and refuses. These two are the plain browser types.
import { chromium, webkit } from 'playwright';
import { scratchUrl } from './host';

/**
 * The suite's own `test`, and the one reason it exists: no browsing context this
 * suite opens can deliver a launch report to the owner's installation.
 *
 * WHAT HAPPENED. `device_observation` is the table C2 reads back as proof the
 * owner opened Vernier from his iPhone Home Screen icon. On 2026-08-22
 * standalone_seen and wake_lock_available both went true on his live install at
 * 16:13:55, written by a headless browser on this Mac, and two owner-blocked
 * rubric lines read as met by a row the suite had authored. The route was then
 * taught to refuse a driven browser on two witnesses, `navigator.webdriver` from
 * the client and the user agent from the server.
 *
 * WHY THAT WAS NOT ENOUGH. The user-agent witness never fires for WebKit.
 * Playwright's WebKit is a genuine WebKit build and sends a genuine Safari user
 * agent with no automation token in it, and WebKit is the engine the owner's
 * iPhone and Mac run and the engine this suite's main project drives. So for
 * that engine the whole refusal rested on one client-supplied boolean, and one
 * `addInitScript` line put it back to false: the verifier did exactly that and
 * the server accepted the pair at 204.
 *
 * SO THE REPORT DOES NOT LEAVE THIS MACHINE. Every context the suite opens
 * against anything but the scratch instance answers that one request itself,
 * with the body the server sends a driven browser, before it reaches the
 * network. It does not depend on the engine, on the user agent, on what the page
 * says about itself, or on a spec remembering anything: a spec gets this by
 * importing `test`, and tests/unit/suite-safety.test.ts fails any spec that
 * imports `test` from anywhere else or opens a context of its own.
 *
 * IT FULFILS RATHER THAN ABORTS. C9 counts a console error, a failed request and
 * a response of 400 or worse on every screen this suite walks, and an aborted
 * request is a failed one. The shipped client already understands this answer:
 * `recorded: false` means the row did not move and the next launch reports
 * again, so nothing retries and nothing is logged.
 *
 * The scratch instance is the exception, deliberately: that is where the launch
 * report is graded, against an installation whose device_observation row nobody
 * will ever read as evidence of anything.
 */

const LAUNCH_REPORT = '**/api/diagnostics/launch';

/** The body the route sends a browser it will not believe. */
const NOT_RECORDED = {
  recorded: false,
  reason: 'A driven browser cannot report a launch.',
  detail: 'This report was answered by the test harness and never left this machine.',
};

/** Which contexts may talk to that endpoint for real. Exactly one instance. */
function reportsForReal(target: string | undefined): boolean {
  return target !== undefined && target.replace(/\/+$/, '') === scratchUrl.replace(/\/+$/, '');
}

/**
 * How many launch reports this worker answered itself. Read by boundary.spec.ts,
 * which drives the whole accident at the live origin in WebKit and proves the
 * request never left the machine.
 */
let held = 0;

export function launchReportsHeld(): number {
  return held;
}

async function holdTheLaunchReport(context: BrowserContext, target: string | undefined): Promise<void> {
  if (reportsForReal(target)) return;
  await context.route(LAUNCH_REPORT, (route) => {
    held += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(NOT_RECORDED),
    });
  });
}

/**
 * A context a spec opens for itself, with the same hold on it.
 *
 * Two specs need their own: the gate walks the one-time owner creation on the
 * scratch instance at three viewports, and the passkey ceremony needs a virtual
 * authenticator attached to a context of its own. They go through here rather
 * than through `browser.newContext`, which suite-safety refuses in a spec.
 */
export async function newGuardedContext(
  browser: Browser,
  options?: BrowserContextOptions,
): Promise<BrowserContext> {
  const context = await browser.newContext(options);
  await holdTheLaunchReport(context, options?.baseURL);
  return context;
}

export const test = base.extend({
  context: async ({ context, baseURL }, use) => {
    await holdTheLaunchReport(context, baseURL ?? undefined);
    await use(context);
  },
});

export { expect } from '@playwright/test';
export type { BrowserContext, Locator, Page } from '@playwright/test';

/**
 * Click a control whose behaviour arrives with the JavaScript, and wait for the
 * behaviour first.
 *
 * WHAT THIS IS FOR. Every screen here is server-rendered, so the sign-in
 * button, the quick-log control and the tab bar are all in the first HTML
 * response: painted, visible, enabled, and inert. React attaches their handlers
 * afterwards. Playwright's actionability check reads visible, enabled and
 * stable and is satisfied by the inert copy, so a click that lands in that
 * window is delivered to the DOM, does nothing at all, and leaves no trace:
 * no request, no console error, no notice on the screen. The assertion that
 * follows then waits sixty seconds for a page that was never asked to change.
 *
 * That is the whole of passkey.spec.ts's flake, reproduced and read rather than
 * re-run: registration succeeds, sign-out succeeds, the click on "Sign in with
 * passkey" produces no POST to /api/auth/passkey/authentication/options, and
 * 1.5 seconds later the same button is live. It cost five consecutive failures,
 * three of them isolated, and it is not the passkey path: every ceremony that
 * was actually started in the reproduction run finished at 200 with the counter
 * held at 0.
 *
 * WHY THE FIBER KEY. React writes `__reactFiber$<random>` onto every host
 * element it owns, at hydration, in production builds as well as development.
 * It is the condition itself rather than a proxy for it. `networkidle`, which
 * is what the rest of this suite reaches for, is a proxy: it can be reached
 * before hydration and long after it, and it is the thing that made this look
 * like timing luck for five runs.
 *
 * IT FAILS RATHER THAN RETRIES. A control that never comes alive inside the
 * budget is a real defect on a screen whose only action is that button, and it
 * says so with the control's name in the message. Nothing here clicks twice.
 */
export async function waitUntilLive(control: Locator, timeout = 15_000): Promise<Locator> {
  await control.waitFor({ state: 'visible', timeout });
  await baseExpect
    .poll(
      () => control.evaluate((node) => Object.keys(node).some((key) => key.startsWith('__reactFiber$'))),
      {
        timeout,
        intervals: [50],
        message:
          'the control is painted and inert: React has not attached its handler, so nothing done to it reaches the app',
      },
    )
    .toBe(true);
  return control;
}

export async function clickWhenLive(control: Locator, timeout = 15_000): Promise<void> {
  await (await waitUntilLive(control, timeout)).click();
}

/**
 * The same window, through a field rather than a button, and it loses the
 * owner's typing rather than his tap.
 *
 * `fill` on a server-rendered React input sets the DOM value and fires an input
 * event nobody is listening to yet. Hydration then re-renders the field from
 * the state React was given, which is what the server put there, and the typing
 * is gone with no error and nothing on screen. F29's restore did exactly that:
 * it filled 76.0 into a field that reverted to 74.0, saved, got a 200 and its
 * "Saved" note, and left the owner's goal at the test's own number.
 */
export async function fillWhenLive(control: Locator, text: string, timeout = 15_000): Promise<void> {
  await (await waitUntilLive(control, timeout)).fill(text);
}

/**
 * The same walk in both engines, from inside one test.
 *
 * A layout defect that was measured in one engine and shipped in the other is
 * what F27 has now cost twice, so the spec that grades a fold runs both. They
 * run here rather than as two Playwright projects because the state being
 * measured is expensive to build and has to be the SAME state: the anchored
 * demonstration seed takes a container restart, and two projects would build it
 * twice and compare two databases.
 *
 * Chrome by channel rather than by bundled Chromium, which is what
 * playwright.config.ts drives everywhere else, and the browser types come from
 * the driver package so the surrounding project's channel is not inherited. The
 * context goes through
 * `newGuardedContext`, so a browser launched here is under the same hold on the
 * launch report as one the harness handed out.
 */
export const ENGINES = ['chrome', 'webkit'] as const;

export type Engine = (typeof ENGINES)[number];

export async function inEngine(
  engine: Engine,
  options: BrowserContextOptions,
  walk: (page: Page, context: BrowserContext) => Promise<void>,
): Promise<void> {
  // `channel` is stated on both, including as undefined on WebKit. The test
  // runner puts the surrounding project's launch options on these browser
  // types, and this file is matched by a project whose channel is chrome, so a
  // WebKit launched without saying otherwise is asked for a chrome channel and
  // refuses.
  const browser =
    engine === 'chrome'
      ? await chromium.launch({ channel: 'chrome' })
      : await webkit.launch({ channel: undefined });
  try {
    const context = await newGuardedContext(browser, options);
    const page = await context.newPage();
    await walk(page, context);
  } finally {
    await browser.close();
  }
}
