import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Liveness, and nothing else.
 *
 * This is the unauthenticated visitor's entire surface, so every field here is
 * a field they get for free. No integration name, no record count, no date, no
 * version, no database name, no hostname. The process answered: that is the
 * whole message. F2 greps this body against the integration names.
 */
export function GET() {
  return NextResponse.json(
    { status: 'ok' },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex',
      },
    },
  );
}
