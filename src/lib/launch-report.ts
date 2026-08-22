/**
 * Whether the browsing context that raised a launch report was being driven.
 *
 * C2 turns on one fact: the owner opened Vernier from the iPhone Home Screen
 * icon and it came up with no browser chrome. The only witness is the browser,
 * so the browser reports it and the server keeps the answer. That made the
 * stored row worth exactly as much as the set of things that could write it,
 * and on 2026-08-22 a headless browser on this Mac wrote it: standalone_seen
 * and wake_lock_available both read true from 16:13:55, with no device
 * involved, and two owner-blocked lines looked met.
 *
 * TWO WITNESSES, EITHER ONE ENOUGH TO REFUSE.
 *
 * `navigator.webdriver` is the platform's own answer to "is something driving
 * this browser". Every engine the owner's devices run sets it under WebDriver
 * or CDP, and no engine sets it for a person tapping an icon. The shipped
 * client reads it and sends it, and the field is required: a caller that omits
 * it is not the shipped client and is refused as a malformed report.
 *
 * The user agent is the server's own reading, and it does not depend on the
 * body. Headless Chromium names itself, and so do the automation runtimes that
 * wrap it. It catches the case the first witness would miss if a run replaced
 * the client's own answer.
 *
 * WHAT THIS DOES NOT DO, WRITTEN DOWN RATHER THAN IMPLIED. It does not make the
 * endpoint unforgeable. Anything that can reach the port and hold an
 * anti-forgery token can post two booleans and a false third, and no header a
 * client sends is proof of the client. What it does is close the accident: the
 * suite's own runs, driving a real browser through a real page, are now refused
 * by the platform's own flag rather than believed. The row also records the
 * address the report arrived from, so a row that is written is attributable
 * instead of anonymous, and C2's own evidence clause still names the device
 * screenshot that no server-side check can stand in for.
 */

/**
 * Automation runtimes that name themselves in the user agent. Headless Chromium
 * is the one this suite runs; the rest are here because the check costs nothing
 * and a wrapper nobody thought of is exactly what wrote the row being fixed.
 */
const DRIVEN_AGENTS = /headless|puppeteer|playwright|selenium|webdriver|phantomjs|electron/i;

export function isDrivenBrowser(webdriver: boolean, userAgent: string | null): boolean {
  if (webdriver) return true;
  return userAgent !== null && DRIVEN_AGENTS.test(userAgent);
}
