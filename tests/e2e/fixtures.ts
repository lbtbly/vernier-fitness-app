import { test as base, type Browser, type BrowserContext, type BrowserContextOptions } from '@playwright/test';
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

async function holdTheLaunchReport(context: BrowserContext, target: string | undefined): Promise<void> {
  if (reportsForReal(target)) return;
  await context.route(LAUNCH_REPORT, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(NOT_RECORDED),
    }),
  );
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
