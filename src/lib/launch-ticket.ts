import { createHmac, timingSafeEqual } from 'node:crypto';
import { readMasterKey } from '@/lib/master-key';

/**
 * The ticket a launch report has to carry, and the reason it exists.
 *
 * WHAT WAS OPEN. On 2026-08-22 the verifier set standalone_seen and
 * wake_lock_available true on an instance byte for byte identical to the
 * owner's, with four lines of curl: one unauthenticated GET of /sign-in to mint
 * an anti-forgery pair, then a POST of three booleans with an iPhone user
 * agent. No browser, no session, no automation. The endpoint answered 204 and
 * wrote both rows. That row is C2's evidence, and a signal anything on the
 * tailnet can author is not evidence that the owner opened Vernier from his
 * Home Screen.
 *
 * WHY THE WITNESSES COULD NOT CLOSE IT. `navigator.webdriver` is the client's
 * own answer and one line of injected script rewrites it. The user agent is a
 * header and an iPhone one is four words to type. The desktop refusal narrows
 * what may be claimed and it is still read off a header. Every one of them asks
 * WHO IS CALLING, and nothing this server can see answers that question: a
 * driven WebKit and Safari are the same bytes on the wire. The limit was stated
 * in the last fix and it is still true.
 *
 * SO THIS ONE ASKS A DIFFERENT QUESTION: WAS THIS PAGE SERVED. A ticket is
 * minted by the root layout, into the document, for the session that document
 * was rendered for, and it is a keyed hash of that session's id and the minute
 * it was issued. A caller cannot compute one: the key is MASTER_KEY, which
 * never leaves the container. A caller cannot guess one: it is 32 bytes of
 * SHA-256. A caller cannot lift one out of a public page, because the layout
 * mints a ticket only when the request already carries a live session cookie,
 * and /sign-in carries none. The pair the old attack minted with one
 * unauthenticated GET buys nothing here.
 *
 * WHAT IS LEFT, WRITTEN DOWN RATHER THAN IMPLIED. Anything holding the owner's
 * session cookie can load a page and read the ticket out of it. That is true,
 * it is deliberate, and it is the honest floor: the session cookie is HttpOnly,
 * Secure and SameSite=Strict, so holding one means holding the owner's device
 * or his machine, and a caller who is already the owner's browser is not the
 * hole this closes. What is closed is the caller who is nobody: no session, no
 * document, no device, reaching the port and writing the row anyway.
 *
 * The ticket is short lived and it is not single use. Single use would need a
 * table of spent tickets to say anything a fresh mint does not already say to
 * the same caller, and a caller who can mint a second ticket is a caller who
 * could replay the first.
 */

/** The version marker, so a ticket shape can change without a stale one passing. */
const VERSION = '1';

/**
 * Fifteen minutes. The shipped client posts from a mount effect, milliseconds
 * after the document it was minted into finished parsing, so the window is
 * generous by two orders of magnitude and still short enough that a ticket
 * scraped off a screen yesterday is worth nothing today.
 */
export const LAUNCH_TICKET_SECONDS = 15 * 60;

/** A clock is a clock. One minute of tolerance, and no more. */
const SKEW_SECONDS = 60;

/**
 * Keyed with the master key rather than a value of its own, so this closes
 * today and adds nothing to .forge/PREFLIGHT.md. A new environment variable is
 * a new human dependency, and a run does not acquire one mid-build.
 *
 * The session id is already the SHA-256 of the session token, so the value fed
 * in here is a hash and never the cookie itself.
 */
function sign(sessionId: string, issuedAt: number): string {
  return createHmac('sha256', readMasterKey())
    .update(`vernier.launch-report.${VERSION}.${sessionId}.${issuedAt}`)
    .digest('base64url');
}

/**
 * Mints the ticket the root layout hands to the launch report, for the session
 * the document is being rendered for.
 */
export function mintLaunchTicket(sessionId: string, now: number = Date.now()): string {
  const issuedAt = Math.floor(now / 1000);
  return `${VERSION}.${issuedAt}.${sign(sessionId, issuedAt)}`;
}

/**
 * Why a ticket was not believed, so the endpoint can say which it was in a log
 * and answer a person with one sentence.
 *
 * `stale` is a ticket this server did mint for this session, too long ago.
 * `forged` is everything else: the wrong shape, another session's ticket, a
 * value nobody minted.
 */
export type LaunchTicketVerdict = 'ok' | 'stale' | 'forged';

export function readLaunchTicket(
  ticket: string,
  sessionId: string,
  now: number = Date.now(),
): LaunchTicketVerdict {
  const parts = ticket.split('.');
  if (parts.length !== 3) return 'forged';
  const [version, issued, mac] = parts;
  if (version !== VERSION) return 'forged';
  if (!/^\d{1,12}$/.test(issued)) return 'forged';

  const issuedAt = Number(issued);
  const expected = sign(sessionId, issuedAt);
  const left = Buffer.from(mac, 'utf8');
  const right = Buffer.from(expected, 'utf8');
  // Length first: timingSafeEqual throws on a mismatch and an exception is
  // itself a signal. The same rule tokens.ts states for session values.
  if (left.length !== right.length) return 'forged';
  if (!timingSafeEqual(left, right)) return 'forged';

  const age = Math.floor(now / 1000) - issuedAt;
  if (age > LAUNCH_TICKET_SECONDS) return 'stale';
  if (age < -SKEW_SECONDS) return 'stale';
  return 'ok';
}
