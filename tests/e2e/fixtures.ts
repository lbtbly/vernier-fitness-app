import {
  test as base,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
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
