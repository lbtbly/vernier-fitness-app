import { getConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';

/**
 * Served as application/manifest+json, which C1 checks on the response headers.
 * start_url, scope and id stay relative so the manifest survives a change of
 * origin without a rebuild.
 */
export function GET() {
  const { appName } = getConfig();

  const manifest = {
    id: '/',
    name: appName,
    short_name: appName,
    description:
      'One person, one health record, on one machine. Trends over days, provenance on every value, nothing written without a confirmed diff.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0A0A0B',
    theme_color: '#0A0A0B',
    lang: 'en',
    dir: 'ltr',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/apple-touch-icon-180.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
      { src: '/icons/vernier-mark.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  };

  return new Response(JSON.stringify(manifest, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
}
