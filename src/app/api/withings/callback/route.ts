import { NextResponse } from 'next/server';
import { getConfig } from '@/lib/config';
import { NO_STORE, refuse } from '@/lib/gate';
import { strings } from '@/lib/strings';
import { completeCallback, openRun } from '@/lib/withings/service';

export const dynamic = 'force-dynamic';

/**
 * Where the Withings consent page comes back to.
 *
 * WHY THIS CANNOT REQUIRE A SESSION. The session cookie is `SameSite=Strict`,
 * which is right and stays. A top-level navigation from `account.withings.com`
 * to this origin is cross-site, so the browser sends no cookie with it, and a
 * protected route would answer the owner's own consent with a 401 while the
 * authorization code expires 30 seconds later. So it sits on the gate list
 * beside the sign-in endpoints: it cannot require a session, and it refuses
 * instead.
 *
 * WHAT IT REFUSES ON. The `state` this app minted, compared against the SHA-256
 * of it stored on the connection row, in constant time, once: the pair is spent
 * whatever the answer, so a value that does not match cannot be retried against
 * the same hash. Withings documents no PKCE parameter of any kind, so this is
 * the cross-site protection the flow has, and it is the one the authorization
 * guide names. A caller who cannot produce the state gets a 403 and this route
 * writes nothing at all.
 *
 * WHAT IT IS WORTH TO AN ATTACKER. Nothing without the client secret, which
 * never leaves the Mac mini: an authorization code alone exchanges for no
 * token. And a caller on this tailnet who could reach this route could already
 * reach the sign-in screen.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code') ?? '';
  const state = url.searchParams.get('state') ?? '';

  if (state === '') {
    return refuse(400, strings.api.withings.stateMismatch, strings.api.withings.stateMismatchDetail);
  }
  if (code === '') {
    return refuse(400, strings.api.withings.noCode, strings.api.withings.noCodeDetail);
  }

  try {
    const run = await openRun();
    const result = await completeCallback(run, code, state);
    if (result.kind === 'refused') {
      return refuse(
        403,
        strings.api.withings.stateMismatch,
        strings.api.withings.stateMismatchDetail,
      );
    }
  } catch (error) {
    console.error(`[vernier] /api/withings/callback failed: ${(error as Error).message}`);
    return refuse(500, strings.api.withings.failed, strings.api.withings.failedDetail);
  }

  // Back to the screen that started it. The owner's browser holds the session
  // cookie on a same-site navigation, so Settings renders normally from here.
  const { appUrl } = getConfig();
  return NextResponse.redirect(`${appUrl}/settings`, { status: 303, headers: { ...NO_STORE } });
}
