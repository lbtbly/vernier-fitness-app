import { NextResponse } from 'next/server';
import { recordDeviceLaunch } from '@/db/diagnostics';
import { csrfFailure } from '@/lib/csrf';
import { ok, refuse } from '@/lib/gate';
import { couldBeAHomeScreenLaunch, isDrivenBrowser } from '@/lib/launch-report';
import { readRequestOrigin } from '@/lib/request-origin';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';

/**
 * The companion write behind /api/diagnostics/device. The browser is the only
 * thing that can see whether it was launched in standalone display mode or
 * whether Wake Lock exists on the device, so the app reports it once per
 * launch and the server keeps it.
 *
 * Three booleans in, nothing out. Anything else in the body is ignored rather
 * than stored, and a body that is not three booleans is refused, so this
 * endpoint can never become a place to put data.
 *
 * It writes, so it carries the anti-forgery token like every other mutating
 * route. C2 reads this row back as proof the owner opened the app from his
 * Home Screen, and evidence anything on the tailnet can author with a curl is
 * not evidence. The report is raised from the root layout, which is a server
 * component and mints the token it hands to the client.
 *
 * AND A TOKEN WAS NOT ENOUGH, BECAUSE THE TEST SUITE HOLDS ONE. On 2026-08-22
 * standalone_seen and wake_lock_available both went true on the owner's live
 * install, at 16:13:55, from a headless browser on this Mac. Two rubric lines
 * then read as met by a signal the suite had set. So the report now says
 * whether the context driving it is automated, the server says the same thing
 * from the user agent, and either one stops the write: nothing stored, and a
 * body that names why and names where such a run belongs. A person holding a
 * phone is what this row is about, and a browser under WebDriver is not that.
 *
 * That answer is 200 rather than 4xx, deliberately. This is raised from the
 * root layout, so every page a driven browser opens raises one, and a refusal
 * status would put a failed request and a console error on every screen the
 * suite walks. C9 counts exactly those. The outcome goes in the body, which the
 * caller reads and the browser does not log.
 *
 * What survives it is written down in src/lib/launch-report.ts: a client that
 * is not a browser at all can still claim anything it likes, which is why the
 * write also records the address the report arrived from, so a row is
 * attributable instead of anonymous.
 */
export async function POST(request: Request) {
  const csrf = await csrfFailure(request);
  if (csrf) return csrf.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return refuse(400, strings.api.jsonBody, strings.api.launch.notAReportDetail);
  }

  const report = body as { standalone?: unknown; wakeLock?: unknown; webdriver?: unknown } | null;
  if (
    !report ||
    typeof report.standalone !== 'boolean' ||
    typeof report.wakeLock !== 'boolean' ||
    typeof report.webdriver !== 'boolean'
  ) {
    return refuse(400, strings.api.launch.notAReport, strings.api.launch.notAReportDetail);
  }

  const userAgent = request.headers.get('user-agent');
  if (isDrivenBrowser(report.webdriver, userAgent)) {
    // Nothing is stored, and the status is 200 rather than 403 on purpose: the
    // root layout raises this on every page, so a refusal status would put a
    // failed request and a console error on every screen the suite walks, and
    // C9 counts both. The outcome is in the body, where the caller reads it and
    // the browser does not log it.
    return ok({
      recorded: false,
      reason: strings.api.launch.automated,
      detail: strings.api.launch.automatedDetail,
    });
  }

  /*
   * AND THE THIRD WITNESS, WHICH IS THE ONE THAT FIRES FOR WEBKIT. Playwright's
   * WebKit is a genuine WebKit build sending a genuine Safari user agent, so
   * neither witness above catches it and one `addInitScript` line puts the
   * client's own answer back to false. There is no reliable server-side witness
   * for that engine and this route does not pretend to one.
   *
   * What it can do is refuse the claim rather than identify the claimant. C2
   * reads this row back as one sentence: the owner opened Vernier from the
   * iPhone Home Screen icon. A user agent naming a desktop has no Home Screen to
   * put an icon on, so a standalone launch reported from one is not that fact
   * whoever sent it. This suite drives on a Mac, so it fires for WebKit and for
   * Chromium alike. A report that claims no Home Screen is stored as usual,
   * because standalone false is an honest thing for a Mac to say.
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
  await recordDeviceLaunch({
    standalone: report.standalone,
    wakeLock: report.wakeLock,
    reportedFrom: viaTailscale ? peerAddress : null,
  });

  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
