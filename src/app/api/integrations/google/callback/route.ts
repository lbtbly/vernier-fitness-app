import { NextResponse } from 'next/server';
import { getConfig } from '@/lib/config';
import { NO_STORE, refuse } from '@/lib/gate';
import { strings } from '@/lib/strings';
import { completeCallback, openRun } from '@/lib/google/service';

export const dynamic = 'force-dynamic';

/**
 * Where the Google consent page comes back to.
 *
 * WHY THIS CANNOT REQUIRE A SESSION. The session cookie is `SameSite=Strict`,
 * which is right and stays. A top-level navigation from `accounts.google.com` to
 * this origin is cross-site, so the browser sends no cookie with it, and a
 * protected route would answer the owner's own consent with a 401. So it sits on
 * the gate list beside the Withings callback and the sign-in endpoints: it
 * cannot require a session, and it refuses instead.
 *
 * WHAT IT REFUSES ON. The `state` this app minted, compared against its SHA-256
 * on the connection row, in constant time, once: the pair is spent whatever the
 * answer, so a value that does not match cannot be retried against the same
 * hash. Google names `state` as the CSRF control for this flow, and PKCE is
 * documented for installed apps rather than for a web client with a secret, so
 * this is the control the flow has and it is the one Google prescribes.
 *
 * WHY IT REDIRECTS. Google's own warning: "If your response endpoint renders an
 * HTML page, any resources on that page will be able to see the authorization
 * code in the URL... we recommend that the server first handle the request, then
 * redirect to another URL that doesn't include the response parameters." So the
 * code is handled here and the browser is sent to `/settings`, WITH NO CODE AND
 * NO STATE ON THE URL, whatever the outcome.
 *
 * THE REFRESH TOKEN IS PERSISTED BEFORE THIS RETURNS. `completeCallback` seals
 * and stores it inside the exchange, because Google issues one only on the first
 * authorization and losing it costs the owner a fresh consent.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code') ?? '';
  const state = url.searchParams.get('state') ?? '';
  const error = url.searchParams.get('error') ?? '';

  if (state === '') {
    return refuse(400, strings.api.calendar.stateMismatch, strings.api.calendar.stateMismatchDetail);
  }
  // `error=access_denied` is the owner saying no on the consent page. It is not
  // a failure of this app and it is not retried: back to Settings, unchanged.
  if (error !== '' && code === '') {
    const { appUrl } = getConfig();
    return NextResponse.redirect(`${appUrl}/settings`, { status: 303, headers: { ...NO_STORE } });
  }
  if (code === '') {
    return refuse(400, strings.api.calendar.noCode, strings.api.calendar.noCodeDetail);
  }

  try {
    const run = await openRun();
    const result = await completeCallback(run, code, state);
    if (result.kind === 'refused') {
      return refuse(
        403,
        strings.api.calendar.stateMismatch,
        strings.api.calendar.stateMismatchDetail,
      );
    }
  } catch (caught) {
    console.error(`[vernier] /api/integrations/google/callback failed: ${(caught as Error).message}`);
    return refuse(500, strings.api.calendar.failed, strings.api.calendar.failedDetail);
  }

  // Back to the screen that started it. Same-site navigation, so the session
  // cookie travels and Settings renders normally. No code, no state, no error on
  // the URL.
  const { appUrl } = getConfig();
  return NextResponse.redirect(`${appUrl}/settings`, { status: 303, headers: { ...NO_STORE } });
}
