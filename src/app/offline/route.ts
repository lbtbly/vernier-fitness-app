import { getConfig } from '@/lib/config';
import { renderOfflineDocument } from '@/lib/offline-document';

export const dynamic = 'force-dynamic';

/**
 * /offline is a route handler, not a page, because what the worker precaches
 * has to be the finished document. Static markup: no hydration script, no
 * chunk, no stylesheet request. The host in the copy is still read from
 * configuration on every request, so F7 holds here too.
 *
 * no-cache, not no-store: the browser must revalidate, so a shipped change to
 * this screen reaches the phone the next time the worker installs.
 */
export function GET() {
  const { appName, originHost } = getConfig();

  return new Response(renderOfflineDocument({ appName, originHost }), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Robots-Tag': 'noindex',
    },
  });
}
