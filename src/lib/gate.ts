import { NextResponse } from 'next/server';
import type { SessionRow } from '@/db/auth';
import { readRequestOrigin } from '@/lib/request-origin';
import { readSessionAndTouch } from '@/lib/session';

/**
 * The small shared parts of every gate handler: where a request came from, how
 * a refusal is shaped, and the session check an API route runs before it does
 * anything.
 */

export const NO_STORE = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } as const;

/**
 * The address an attempt is recorded against. Evidence of origin and never a
 * credential: it appears in the audit row and decides nothing. A request that
 * did not come through the Tailscale proxy has no visitor address to record,
 * and says so.
 */
export function peerOf(request: Request): string {
  const { peerAddress, viaTailscale } = readRequestOrigin(request.headers);
  if (viaTailscale && peerAddress) return peerAddress;
  return 'loopback';
}

export function refuse(status: number, error: string, detail: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, detail, ...extra }, { status, headers: { ...NO_STORE } });
}

export function ok(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE } });
}

/**
 * Returns the session, or the 401 to send back. The middleware has already
 * turned away a caller with no cookie at all; this is the check that decides
 * whether the cookie names a live session.
 */
export async function sessionOrRefusal(): Promise<
  { session: SessionRow; refusal: null } | { session: null; refusal: NextResponse }
> {
  const session = await readSessionAndTouch();
  if (!session) {
    return {
      session: null,
      refusal: refuse(
        401,
        'Sign in first.',
        'This endpoint needs the owner session, and the cookie on this request names none.',
      ),
    };
  }
  return { session, refusal: null };
}
