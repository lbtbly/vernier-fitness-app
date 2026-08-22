import { describe, expect, it } from 'vitest';
import { couldBeAHomeScreenLaunch, isDrivenBrowser } from '@/lib/launch-report';

/**
 * The one decision behind C2's evidence: is the thing reporting this launch a
 * person holding a device, or something driving a browser.
 *
 * It got asked for the first time on 2026-08-22, after standalone_seen and
 * wake_lock_available both went true on the owner's live install at 16:13:55
 * from a headless browser on this Mac. Two owner-blocked rubric lines read as
 * met by a row the test suite had written.
 */
describe('who may report a launch', () => {
  it('turns away a browser that says it is being driven, whatever it is called', () => {
    // navigator.webdriver, reported by the shipped client. Every engine the
    // owner's devices run sets it under WebDriver and under the DevTools
    // protocol, and this suite drives all of them.
    expect(isDrivenBrowser(true, null)).toBe(true);
    expect(
      isDrivenBrowser(
        true,
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
      ),
    ).toBe(true);
  });

  it('turns away an automation runtime that names itself, whatever the body claims', () => {
    // The second witness, read off the request rather than off the report, so a
    // run that replaces the client's own answer is still refused.
    for (const agent of [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) HeadlessChrome/141.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/140.0.0.0',
      'node-fetch/1.0 (+https://github.com/puppeteer/puppeteer)',
      'Playwright/1.62.1',
      'selenium/4.9',
      'PhantomJS/2.1.1',
      'Vernier/1.0 Electron/38.0.0',
    ]) {
      expect(isDrivenBrowser(false, agent), `${agent} was believed`).toBe(true);
    }
  });

  it('lets the browsers the owner actually holds report', () => {
    // The iPhone from the Home Screen, the same iPhone in Safari, and the Mac.
    // None of them is refused, because refusing the owner's own launch would
    // leave C2 unprovable for the opposite reason.
    for (const agent of [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    ]) {
      expect(isDrivenBrowser(false, agent), `${agent} was refused`).toBe(false);
    }
    // And a request that carried no user agent at all is not evidence of
    // automation on its own. The report's own answer is what decides it.
    expect(isDrivenBrowser(false, null)).toBe(false);
  });
});

/**
 * The witness that fires for WebKit, which is the engine the owner's iPhone and
 * Mac run and the engine this suite's main project drives.
 *
 * Playwright's WebKit is a genuine WebKit build sending a genuine Safari user
 * agent, so neither witness above sees it, and `navigator.webdriver` is one
 * `addInitScript` line from reading false: the verifier proved it and the server
 * answered 204. There is no reliable server-side witness for that engine.
 *
 * So this one refuses the claim rather than identifying the claimant. A Home
 * Screen icon is an iOS thing, and a launch reporting standalone display mode
 * from a user agent that names a desktop is not the fact C2 reads this row back
 * for, whoever sent it.
 */
describe('what could have come from a Home Screen icon', () => {
  it('refuses a standalone claim from every desktop, this suite\'s WebKit included', () => {
    for (const agent of [
      // What Playwright's WebKit sends on this Mac. No automation token in it
      // anywhere, which is the whole problem, and it says Macintosh.
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    ]) {
      expect(couldBeAHomeScreenLaunch(agent), `${agent} was believed`).toBe(false);
    }
    // And a request that named nothing at all. A launch report is raised by the
    // shipped client in a browser, and every browser sends one.
    expect(couldBeAHomeScreenLaunch(null)).toBe(false);
    expect(couldBeAHomeScreenLaunch('')).toBe(false);
  });

  it('lets the phone the whole line is about report', () => {
    for (const agent of [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
      // The Home Screen launch itself, which drops the Safari token.
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
    ]) {
      expect(couldBeAHomeScreenLaunch(agent), `${agent} was refused`).toBe(true);
    }
  });
});
