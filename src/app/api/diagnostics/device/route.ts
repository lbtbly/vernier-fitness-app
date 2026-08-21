import { NextResponse } from 'next/server';
import { readDeviceDiagnostics } from '@/db/diagnostics';

export const dynamic = 'force-dynamic';

/**
 * What the running system observed about the devices it has been opened from.
 *
 * Unauthenticated by necessity: four lines of `.forge/PREFLIGHT.md` curl this
 * with no session, from a shell, to turn the owner's "it worked on my phone"
 * into something a command can read back. So F2's rule applies here as
 * strictly as it does to /healthz. Booleans and timestamps, plus the tailnet
 * addresses that are themselves the evidence for F4 and R1. No user agent, no
 * identity header, no integration name, no record count, no version string.
 *
 * The peer addresses are the one thing here that names anything, and every
 * caller who can reach this endpoint is already on the tailnet, where
 * `tailscale status` lists the same addresses to any peer.
 *
 * When the gate lands in slice 2, this path joins /healthz and /sign-in on the
 * list of routes that answer without a session. It is a report, not a door: it
 * reads nothing a session would protect and writes nothing at all.
 */
export async function GET() {
  const diagnostics = await readDeviceDiagnostics();

  return NextResponse.json(diagnostics, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}
