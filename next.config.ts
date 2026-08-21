import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The runner stage copies .next/standalone, so the server carries its own
  // pruned node_modules and never the Mac's darwin binaries.
  output: 'standalone',
  // pg opens sockets and reads its own package files. Leave it to Node.
  serverExternalPackages: ['pg'],
  poweredByHeader: false,
  async headers() {
    return [
      {
        // C3. The worker script must never be cached, or a shipped fix sits
        // behind a stale worker on the phone that needed it.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type', value: 'text/javascript; charset=utf-8' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default nextConfig;
