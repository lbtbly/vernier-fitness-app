import { describe, expect, it } from 'vitest';
import { isDrivenBrowser } from '@/lib/launch-report';

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
