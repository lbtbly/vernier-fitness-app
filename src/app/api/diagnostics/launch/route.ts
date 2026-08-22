import { NextResponse } from 'next/server';
import { recordDeviceLaunch } from '@/db/diagnostics';
import { csrfFailure } from '@/lib/csrf';

export const dynamic = 'force-dynamic';

/**
 * The companion write behind /api/diagnostics/device. The browser is the only
 * thing that can see whether it was launched in standalone display mode or
 * whether Wake Lock exists on the device, so the app reports it once per
 * launch and the server keeps it.
 *
 * Two booleans in, nothing out. Anything else in the body is ignored rather
 * than stored, and a body that is not two booleans is refused, so this endpoint
 * can never become a place to put data.
 *
 * It writes, so it carries the anti-forgery token like every other mutating
 * route. C2 reads this row back as proof the owner opened the app from his
 * Home Screen, and evidence anything on the tailnet can author with a curl is
 * not evidence. The report is raised from the root layout, which is a server
 * component and mints the token it hands to the client.
 */
export async function POST(request: Request) {
  const csrf = await csrfFailure(request);
  if (csrf) return csrf.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const report = body as { standalone?: unknown; wakeLock?: unknown } | null;
  if (
    !report ||
    typeof report.standalone !== 'boolean' ||
    typeof report.wakeLock !== 'boolean'
  ) {
    return NextResponse.json(
      { error: 'Expected standalone and wakeLock as booleans.' },
      { status: 400 },
    );
  }

  await recordDeviceLaunch({ standalone: report.standalone, wakeLock: report.wakeLock });

  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
