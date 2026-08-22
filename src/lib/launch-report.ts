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
 * AND THE USER AGENT NEVER FIRES FOR WEBKIT, WHICH IS THE ENGINE THAT MATTERS.
 * Playwright's WebKit is a genuine WebKit build and it sends a genuine Safari
 * user agent with no automation token anywhere in it. No header it sends
 * distinguishes it from Safari on the owner's Mac, and everything else the
 * browser could tell us about itself is client script and is one `addInitScript`
 * line from saying whatever a run wants. So for WebKit the first witness was the
 * only witness, and it was the one a test could overwrite: proven by overriding
 * `navigator.webdriver` in a driven WebKit browser and having the server accept
 * the pair, Safari user agent and webdriver false, at 204.
 *
 * There is no reliable server-side witness for that engine and this file does
 * not pretend to one. Two things stand in its place.
 *
 * THE THIRD WITNESS IS ABOUT THE CLAIM RATHER THAN ABOUT AUTOMATION. C2 reads
 * this row back as one sentence: the owner opened Vernier from the iPhone Home
 * Screen icon and it came up with no browser chrome. A Home Screen icon is an
 * iOS thing. A launch reporting standalone display mode from a user agent that
 * names a desktop is not a Home Screen launch whoever sent it, so it is not
 * stored, and that fires for this suite's WebKit, which drives on a Mac and says
 * Macintosh. It narrows what may be claimed rather than detecting who is
 * claiming it, and it is still a header: a context that sets an iPhone user
 * agent walks past it. It also refuses a genuine Add to Dock launch on the
 * owner's own Mac, deliberately, because a row that cannot say which device it
 * came from is the ambiguity that left two false signals unresolvable.
 *
 * THE SECOND THING IS NOT IN THIS FILE. The suite cannot deliver a launch report
 * to the owner's install at all any more: every browsing context it opens
 * against the live origin fulfils that one request in the harness, so it never
 * leaves the machine, whatever engine is driving and whatever the page claims
 * about itself. tests/e2e/fixtures.ts holds it and tests/unit/suite-safety.test.ts
 * refuses a spec that opens a context around it.
 *
 * WHAT THIS DOES NOT DO, WRITTEN DOWN RATHER THAN IMPLIED. It does not make the
 * endpoint unforgeable. Anything that can reach the port and hold an
 * anti-forgery token can post two booleans and a false third, and no header a
 * client sends is proof of the client. What it does is close the accident: the
 * suite's own runs, driving a real browser through a real page, are refused by
 * the platform's own flag in Chromium, by the claim they are making in WebKit,
 * and by the harness in both. The row also records the address the report
 * arrived from, so a row that is written is attributable instead of anonymous,
 * and C2's own evidence clause still names the device screenshot that no
 * server-side check can stand in for.
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

/**
 * User agents that name a desktop platform, which is every platform with no
 * Home Screen to put an icon on. Read off the request rather than off the body,
 * and it is the only witness in this file that fires for a driven WebKit: that
 * engine sends a genuine Safari user agent, and on this machine it says
 * Macintosh.
 *
 * An iPad reports itself as a Macintosh in desktop mode and is refused with
 * them. C2 names the iPhone, the owner's devices are an iPhone and a Mac, and a
 * rule that admits an iPad by admitting every Mac admits this suite.
 */
const DESKTOP_AGENTS = /macintosh|windows nt|x11|cros|linux(?!.*android)/i;

/**
 * Could this launch have come from a Home Screen icon at all.
 *
 * A launch report claiming standalone display mode from a desktop is not the
 * fact C2 reads back, whoever sent it. It is a narrowing of the claim and never
 * a proof of the claimant: a user agent is a header.
 */
export function couldBeAHomeScreenLaunch(userAgent: string | null): boolean {
  if (userAgent === null || userAgent.trim() === '') return false;
  return !DESKTOP_AGENTS.test(userAgent);
}
