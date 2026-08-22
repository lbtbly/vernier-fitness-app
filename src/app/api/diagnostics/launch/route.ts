import { recordDeviceLaunch } from '@/db/diagnostics';
import { csrfFailure } from '@/lib/csrf';
import { ok, refuse, sessionOrRefusal } from '@/lib/gate';
import { couldBeAHomeScreenLaunch, isDrivenBrowser } from '@/lib/launch-report';
import { readLaunchTicket } from '@/lib/launch-ticket';
import { readRequestOrigin } from '@/lib/request-origin';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';

/**
 * The companion write behind /api/diagnostics/device. The browser is the only
 * thing that can see whether it was launched in standalone display mode or
 * whether Wake Lock exists on the device, so the app reports it once per
 * launch and the server keeps it.
 *
 * Three booleans and a ticket in, one honest answer out. Anything else in the
 * body is ignored rather than stored, and a body that is not that shape is
 * refused, so this endpoint can never become a place to put data.
 *
 * WHAT THIS ROW IS. C2 reads it back as one sentence: the owner opened Vernier
 * from the iPhone Home Screen icon and it came up with no browser chrome. It is
 * one of three lines the owner is personally blocked on, so a row anything on
 * the tailnet can author is not evidence, it is noise wearing the shape of
 * evidence.
 *
 * WHAT WAS OPEN UNTIL NOW. An anti-forgery token was not enough, because the
 * middleware mints one for any caller who asks: on 2026-08-22 the verifier set
 * both signals true with four lines of curl on an image byte for byte identical
 * to the owner's install. One unauthenticated GET of /sign-in for the token
 * pair, one POST of three booleans with an iPhone user agent, 204, two rows
 * written. No browser, no session, no device.
 *
 * THE TWO CHECKS THAT NOW STAND BETWEEN THAT CURL AND THE ROW.
 *
 * A session. The read side of these diagnostics is public by necessity, because
 * four lines of .forge/PREFLIGHT.md curl it from a shell with no session, and it
 * stays public. The write side had no such reason and never did: only the owner
 * launches the owner's app. The route is off PUBLIC_PATHS, so the middleware
 * turns a session-less caller away at the door, and this handler asks the
 * database whether that cookie names a live session rather than trusting the
 * door.
 *
 * A ticket. The root layout mints one into every document it renders for a live
 * session, keyed with MASTER_KEY over that session's id, and the report sends it
 * back. It cannot be computed off the machine and it cannot be lifted off
 * /sign-in, because a page rendered for no session carries none. See
 * src/lib/launch-ticket.ts for what that closes and what it does not.
 *
 * THE THREE WITNESSES BELOW ARE UNCHANGED AND ARE STILL NOT IDENTIFICATION. No
 * server-side witness tells a driven WebKit from Safari, and this route does not
 * pretend to one. They refuse the accident: navigator.webdriver, an automation
 * runtime naming itself in the user agent, and a Home Screen claim from a
 * platform with no Home Screen.
 *
 * AND THE ANSWER SAYS WHAT WAS STORED. This used to answer 204 with an empty
 * body, which is why an attack log could read "HTTP 204" beside two rows that
 * had just moved. Now a report that was believed is answered with the signals as
 * the rows read after the write, and a report that was not is answered with the
 * reason it was not. Both are 200, deliberately: the report is raised from the
 * root layout, so every page raises one, and a refusal status would put a failed
 * request and a console error on every screen the suite walks. C9 counts exactly
 * those.
 */
export async function POST(request: Request) {
  const csrf = await csrfFailure(request);
  if (csrf) return csrf.response;

  // The door has already turned away a caller with no session cookie at all.
  // This is the check that decides whether the cookie names a live session, and
  // it is also where the id the ticket is bound to comes from.
  const { session, refusal } = await sessionOrRefusal();
  if (!session) return refusal;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return refuse(400, strings.api.jsonBody, strings.api.launch.notAReportDetail);
  }

  const report = body as {
    standalone?: unknown;
    wakeLock?: unknown;
    webdriver?: unknown;
    ticket?: unknown;
  } | null;
  if (
    !report ||
    typeof report.standalone !== 'boolean' ||
    typeof report.wakeLock !== 'boolean' ||
    typeof report.webdriver !== 'boolean' ||
    typeof report.ticket !== 'string' ||
    report.ticket === ''
  ) {
    return refuse(400, strings.api.launch.notAReport, strings.api.launch.notAReportDetail);
  }

  /*
   * WAS THIS PAGE SERVED. The one question on this route that a header cannot
   * answer for the caller, because the answer is a keyed hash of the session
   * this document was rendered for and the key never leaves the container.
   *
   * Checked before the witnesses below, because it is the cheaper question and
   * the more decisive one: the witnesses ask what is driving a browser, and this
   * asks whether there was a browser holding a page of this app at all.
   */
  const ticket = readLaunchTicket(report.ticket, session.id);
  if (ticket !== 'ok') {
    return ok({
      recorded: false,
      reason: strings.api.launch.notThisApp,
      detail: strings.api.launch.notThisAppDetail,
    });
  }

  const userAgent = request.headers.get('user-agent');
  if (isDrivenBrowser(report.webdriver, userAgent)) {
    return ok({
      recorded: false,
      reason: strings.api.launch.automated,
      detail: strings.api.launch.automatedDetail,
    });
  }

  /*
   * The witness that fires for WebKit. A user agent naming a desktop has no Home
   * Screen to put an icon on, so a standalone launch reported from one is not
   * the fact C2 reads back whoever sent it. It narrows the claim rather than
   * identifying the claimant, and a report that claims no Home Screen is stored
   * as usual, because standalone false is an honest thing for a Mac to say.
   */
  if (report.standalone && !couldBeAHomeScreenLaunch(userAgent)) {
    return ok({
      recorded: false,
      reason: strings.api.launch.notAHomeScreen,
      detail: strings.api.launch.notAHomeScreenDetail,
    });
  }

  // Only a request that came through the Tailscale proxy carries a real peer
  // address. Next fills x-forwarded-for from the socket for everything else,
  // which on this machine is the container bridge gateway: not a visitor, not
  // evidence, and a value that would only mislead a reader of this row. The
  // same rule Today already applies before it records a request origin.
  const { peerAddress, viaTailscale } = readRequestOrigin(request.headers);
  const reportedFrom = viaTailscale ? peerAddress : null;
  const stored = await recordDeviceLaunch({
    standalone: report.standalone,
    wakeLock: report.wakeLock,
    reportedFrom,
  });

  // What the rows read now, straight back off the write, plus where the report
  // was attributed to. A caller is told what it changed rather than left to
  // infer it from an empty 204.
  return ok({ recorded: true, signals: stored, reportedFrom });
}
